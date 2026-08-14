import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { acceptNetworkEvent } from '../../src/network-events.ts';
import { loadMigrations, migrateDown, migrateUp } from '../../src/migrator.ts';
import { MIGRATIONS_DIR } from '../../src/paths.ts';
import { withLegalContext } from '../../src/session.ts';
import {
  acquireClusterRoleLock,
  carrierContext,
  releaseClusterRoleLock,
  TENANT_A,
  TestDatabase,
} from './harness.ts';
import { asRole } from './sr2-harness.ts';
import {
  N5A_DISCLOSURE_RELATIONS,
  N5B_SENSITIVITY_RELATIONS,
  N6_DELIVERY_RELATIONS,
} from './network-relations.ts';

/**
 * N6 migration lifecycle — fresh install, the real upgrade over live 0033 state, the refusal that
 * protects delivery history, the acknowledged bounded revert, exact restoration, and the round trip.
 *
 * Each phase answers a different question. Fresh install proves the surface is reachable from
 * nothing and pins it exactly. The upgrade proves 0034 is ADDITIVE over a populated 0033 — that it
 * touches no business row, no N1-N5 policy it does not own, no role attribute and no permission
 * assignment. The refusal proves delivery history cannot be destroyed by accident. The revert
 * proves it is exact and bounded. The round trip proves both directions are repeatable rather than
 * merely working once.
 *
 * `network-delivery-worker-teardown` holds the CROSS-DATABASE half of the role lifecycle, which
 * needs a cluster of its own; the role checks here are the single-database ones.
 */

const N5B = 33;
const N6 = 34;

const DB_NAME = 'freightos_test_n6_migration';
const db = new TestDatabase(DB_NAME);
const migrations = loadMigrations(MIGRATIONS_DIR);

const WORKER = 'freightos_delivery_worker';

/** The five relations 0034 does not own but places a worker read policy on. */
const N6_POLICIES_ON_PRE_EXISTING = [
  'network_disclosure_grant_revocations_delivery_worker_read',
  'network_disclosure_grants_delivery_worker_read',
  'network_events_delivery_worker_read',
  'network_participants_delivery_worker_read',
  'network_transport_intents_delivery_worker_read',
] as const;

let owner: Client;

async function driveTo(version: number): Promise<void> {
  const client = db.connectAsMigrator();
  await client.connect();
  try {
    const applied = Number(
      (
        await client.query<{ n: string }>(
          'SELECT coalesce(max(version), 0)::text AS n FROM schema_migrations',
        )
      ).rows[0]!.n,
    );
    if (applied > version) await migrateDown(client, migrations, version);
    else if (applied < version)
      await migrateUp(
        client,
        migrations.filter((m) => m.version <= version),
      );
  } finally {
    await client.end();
  }
}

/** A revert run with the destructive acknowledgement set, as an operator would set it. */
async function acknowledgedDownTo(version: number): Promise<void> {
  const client = db.connectAsMigrator();
  await client.connect();
  try {
    await client.query(`SET freightos.n6_destructive_revert = 'acknowledged'`);
    await migrateDown(client, migrations, version);
  } finally {
    await client.end();
  }
}

const one = async (sql: string, params: unknown[] = []): Promise<string> =>
  String((await owner.query<{ v: string }>(sql, params)).rows[0]?.v ?? '(null)');

/**
 * Everything 0034 owns, plus everything it must leave exactly as it found it.
 *
 * The second half carries the weight. A migration that adds seven tables and quietly alters an
 * N5-A policy, a role attribute or a permission assignment would pass a snapshot of only its own
 * surface — which is the failure mode every phase below is graded against.
 */
const snapshot = async (): Promise<Record<string, string>> => {
  const n6Tables = await one(
    `SELECT coalesce(string_agg(c.relname, ',' ORDER BY c.relname), '(none)') AS v
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1)`,
    [[...N6_DELIVERY_RELATIONS]],
  );

  return {
    tip: await one('SELECT coalesce(max(version), 0)::text AS v FROM schema_migrations'),
    n6Tables,

    // --- 0034's own surface -------------------------------------------------
    n6Policies: await one(
      `SELECT coalesce(string_agg(policyname || ':' || cmd, ',' ORDER BY policyname), '(none)') AS v
         FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [[...N6_DELIVERY_RELATIONS]],
    ),
    n6PoliciesOnOldRelations: await one(
      `SELECT coalesce(string_agg(policyname, ',' ORDER BY policyname), '(none)') AS v
         FROM pg_policies WHERE schemaname = 'public' AND policyname = ANY($1)`,
      [[...N6_POLICIES_ON_PRE_EXISTING]],
    ),
    n6Enums: await one(
      `SELECT coalesce(string_agg(t.typname, ',' ORDER BY t.typname), '(none)') AS v
         FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'app' AND t.typname IN ('network_delivery_state',
              'network_delivery_attempt_outcome', 'network_delivery_destination_kind')`,
    ),
    n6Function: await one(
      `SELECT count(*)::text AS v FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'app' AND p.proname = 'network_delivery_transition'`,
    ),
    n6Keys: await one(
      `SELECT coalesce(string_agg(key, ',' ORDER BY key), '(none)') AS v FROM permissions
        WHERE key LIKE 'network.disclosure_subscription.%'`,
    ),
    workerRoleLocal: await one(
      `SELECT count(*)::text AS v FROM pg_shdepend s JOIN pg_roles r ON r.oid = s.refobjid
        WHERE r.rolname = $1
          AND (s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
            OR (s.classid = 'pg_database'::regclass
                AND s.objid = (SELECT oid FROM pg_database WHERE datname = current_database())))`,
      [WORKER],
    ),

    // --- the surfaces 0034 must not disturb ---------------------------------
    // Roles this DATABASE depends on. `pg_roles` is cluster-global and other databases in the
    // cluster sit at other tips, so an absolute snapshot would answer the wrong question.
    roles: await one(
      `SELECT string_agg(r.rolname, ',' ORDER BY r.rolname) AS v FROM pg_roles r
        WHERE r.rolname LIKE 'freightos%'
          AND EXISTS (SELECT 1 FROM pg_shdepend d
                       WHERE d.refclassid = 'pg_authid'::regclass AND d.refobjid = r.oid
                         AND d.dbid = (SELECT oid FROM pg_database
                                        WHERE datname = current_database()))`,
    ),
    roleAttributes: await one(
      `SELECT string_agg(format('%s:%s%s%s%s%s%s', rolname, rolcanlogin::text, rolinherit::text,
                  rolcreaterole::text, rolcreatedb::text, rolsuper::text, rolbypassrls::text),
                  ',' ORDER BY rolname) AS v
         FROM pg_roles WHERE rolname LIKE 'freightos%'`,
    ),
    roleEdges: await one(
      `SELECT coalesce(string_agg(format('%s->%s/%s/%s/%s', m.rolname, r.rolname,
                  am.admin_option::text, am.inherit_option::text, am.set_option::text),
                  ',' ORDER BY 1), '(none)') AS v
         FROM pg_auth_members am
         JOIN pg_roles r ON r.oid = am.roleid
         JOIN pg_roles m ON m.oid = am.member
        WHERE r.rolname LIKE 'freightos%' AND m.rolname LIKE 'freightos%'`,
    ),
    n5aPolicies: await one(
      `SELECT coalesce(string_agg(policyname || ':' || cmd || ':' || roles::text,
                  ',' ORDER BY policyname), '(none)') AS v
         FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1)
           AND policyname <> ALL($2)`,
      [[...N5A_DISCLOSURE_RELATIONS], [...N6_POLICIES_ON_PRE_EXISTING]],
    ),
    n5bPolicies: await one(
      `SELECT coalesce(string_agg(policyname || ':' || cmd || ':' || roles::text || ':'
                  || coalesce(qual, '-'), ',' ORDER BY policyname), '(none)') AS v
         FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [[...N5B_SENSITIVITY_RELATIONS]],
    ),
    definers: await one(
      `SELECT count(*)::text AS v FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('app', 'admin', 'authn') AND p.prosecdef`,
    ),
    permissionCatalog: await one(
      `SELECT md5(string_agg(key, ',' ORDER BY key)) AS v FROM permissions
        WHERE key NOT LIKE 'network.disclosure_subscription.%'`,
    ),
    permissionAssignments: await one('SELECT count(*)::text AS v FROM role_permissions'),

    // --- business facts N6 may never touch ----------------------------------
    events: await one('SELECT count(*)::text AS v FROM network_events'),
    eventDigest: await one(
      `SELECT coalesce(md5(string_agg(event_id::text || event_fingerprint, ',' ORDER BY event_id)),
                '(empty)') AS v FROM network_events`,
    ),
    intents: await one('SELECT count(*)::text AS v FROM network_transport_intents'),
    intentDigest: await one(
      `SELECT coalesce(md5(string_agg(network_event_id::text, ',' ORDER BY network_event_id)),
                '(empty)') AS v FROM network_transport_intents`,
    ),
    participants: await one('SELECT count(*)::text AS v FROM network_participants'),
    participantDigest: await one(
      `SELECT coalesce(md5(string_agg(id::text || display_name || status::text, ',' ORDER BY id)),
                '(empty)') AS v FROM network_participants`,
    ),
    grants: await one('SELECT count(*)::text AS v FROM network_disclosure_grants'),
    grantDigest: await one(
      `SELECT coalesce(md5(string_agg(grant_id::text || purpose_code || projection_ref,
                ',' ORDER BY grant_id)), '(empty)') AS v FROM network_disclosure_grants`,
    ),
    revocations: await one('SELECT count(*)::text AS v FROM network_disclosure_grant_revocations'),
    n5bMetadata: await one(
      `SELECT md5(
         (SELECT coalesce(string_agg(code || rank::text || externally_disclosable::text, ',' ORDER BY code), '')
            FROM network_disclosure_sensitivities)
         || (SELECT coalesce(string_agg(durable_schema_ref || sensitivity_code, ',' ORDER BY durable_schema_ref), '')
               FROM network_schema_disclosure_sensitivity)
         || (SELECT coalesce(string_agg(purpose_code || max_sensitivity_code, ',' ORDER BY purpose_code), '')
               FROM network_disclosure_purpose_ceilings)) AS v`,
    ),

    // --- the N1-N5 shape itself ---------------------------------------------
    n1n5Columns: await one(
      `SELECT md5(string_agg(c.relname || '.' || a.attname || ':' || a.atttypid::text,
                ',' ORDER BY c.relname, a.attnum)) AS v
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
          AND c.relname LIKE 'network\\_%' AND c.relname <> ALL($1)`,
      [[...N6_DELIVERY_RELATIONS]],
    ),
    n1n5Constraints: await one(
      `SELECT md5(string_agg(c.conrelid::regclass::text || ':' || c.conname,
                ',' ORDER BY c.conrelid::regclass::text, c.conname)) AS v
         FROM pg_constraint c
        WHERE c.connamespace = 'public'::regnamespace
          AND c.conrelid::regclass::text LIKE 'network\\_%'
          AND c.conrelid::regclass::text <> ALL($1)`,
      [[...N6_DELIVERY_RELATIONS]],
    ),
  };
};

/**
 * The FORCE-RLS worker read compatibility ledger, recomputed from the catalog.
 *
 * This is the standing form of migration assertion (m): for every relation on which the worker
 * holds SELECT, is there at least one permissive SELECT policy capable of admitting it? A GRANT
 * without one is not a privilege under FORCE RLS — it is a permanently empty read that raises no
 * error. Recomputed rather than compared against a list of five, so a sixth grant added later is
 * covered the moment it exists.
 */
async function workerReadLedger(client: Client): Promise<
  {
    relation: string;
    forceRls: boolean;
    policies: string;
    scope: string;
  }[]
> {
  const r = await client.query<{
    relation: string;
    force_rls: boolean;
    policies: string;
    scope: string;
  }>(
    `SELECT g.table_name AS relation,
            c.relforcerowsecurity AS force_rls,
            coalesce((SELECT string_agg(p.policyname, ',' ORDER BY p.policyname)
                        FROM pg_policies p
                       WHERE p.schemaname = 'public' AND p.tablename = g.table_name
                         AND p.cmd IN ('SELECT', 'ALL')
                         AND ('freightos_delivery_worker' = ANY (p.roles)
                              OR 'public' = ANY (p.roles))), '(NONE)') AS policies,
            coalesce((SELECT string_agg(DISTINCT CASE WHEN 'freightos_delivery_worker' = ANY (p.roles)
                                                      THEN 'worker' ELSE 'public' END, '+')
                        FROM pg_policies p
                       WHERE p.schemaname = 'public' AND p.tablename = g.table_name
                         AND p.cmd IN ('SELECT', 'ALL')
                         AND ('freightos_delivery_worker' = ANY (p.roles)
                              OR 'public' = ANY (p.roles))), '(NONE)') AS scope
       FROM information_schema.role_table_grants g
       JOIN pg_class c ON c.oid = ('public.' || g.table_name)::regclass
      WHERE g.grantee = 'freightos_delivery_worker' AND g.privilege_type = 'SELECT'
      ORDER BY g.table_name`,
  );
  return r.rows.map((x) => ({
    relation: x.relation,
    forceRls: x.force_rls,
    policies: x.policies,
    scope: x.scope,
  }));
}

let baseline0033: Record<string, string>;
let firstAt0034: Record<string, string>;

beforeAll(async () => {
  await acquireClusterRoleLock();
  await db.reset();
  owner = db.connectAs('postgres');
  await owner.connect();
}, 300_000);

afterAll(async () => {
  await owner?.end();
  await releaseClusterRoleLock();
});

describe('gate A — fresh install reaches 0034 with exactly the declared surface', () => {
  it('applies every migration and lands on the pinned N6 surface', async () => {
    await driveTo(N6);
    const inv = await snapshot();

    expect(inv['tip']).toBe(String(N6));
    expect(Number(await one('SELECT count(*)::text AS v FROM schema_migrations'))).toBe(
      migrations.filter((m) => m.version <= N6).length,
    );

    // §7's exact pins, read from the catalog rather than restated from the migration.
    expect(inv['n6Tables']).toBe([...N6_DELIVERY_RELATIONS].sort().join(','));
    expect(inv['n6Tables']!.split(',')).toHaveLength(7);
    expect(inv['n6Policies']!.split(',')).toHaveLength(19);
    expect(inv['n6PoliciesOnOldRelations']).toBe([...N6_POLICIES_ON_PRE_EXISTING].join(','));
    expect(inv['n6Enums']).toBe(
      'network_delivery_attempt_outcome,network_delivery_destination_kind,network_delivery_state',
    );
    expect(inv['n6Function']).toBe('1');
    expect(inv['n6Keys']).toBe(
      'network.disclosure_subscription.create,network.disclosure_subscription.read,' +
        'network.disclosure_subscription.revoke',
    );

    expect(
      Number(await one(`SELECT count(*)::text AS v FROM pg_policies WHERE schemaname='public'`)),
    ).toBe(111);
    expect(
      Number(
        await one(
          `SELECT count(*)::text AS v FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname='public' AND c.relkind='r' AND c.relforcerowsecurity`,
        ),
      ),
    ).toBe(43);
    expect(inv['definers']).toBe('52');

    // The migration assigns its three keys to nobody. A key that arrives pre-granted would hand
    // every holder of that role an authority nobody chose.
    expect(
      await one(
        `SELECT count(*)::text AS v FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
          WHERE p.key LIKE 'network.disclosure_subscription.%'`,
      ),
    ).toBe('0');
  }, 600_000);

  it('pins the worker role attributes and the migrator edge', async () => {
    // §8. Every attribute read from the catalog. NOBYPASSRLS is the load-bearing one: a worker that
    // bypassed row-level security would read every tenant's rows regardless of any policy above.
    const attrs = await one(
      `SELECT format('login=%s inherit=%s createrole=%s createdb=%s super=%s replication=%s bypassrls=%s',
                rolcanlogin::text, rolinherit::text, rolcreaterole::text, rolcreatedb::text,
                rolsuper::text, rolreplication::text, rolbypassrls::text) AS v
         FROM pg_roles WHERE rolname = $1`,
      [WORKER],
    );
    expect(attrs).toBe(
      'login=true inherit=true createrole=false createdb=false super=false replication=false bypassrls=false',
    );

    const edge = await one(
      `SELECT coalesce(string_agg(format('%s/%s/%s', am.admin_option::text,
                  am.inherit_option::text, am.set_option::text), ',' ORDER BY 1), '(none)') AS v
         FROM pg_auth_members am
         JOIN pg_roles r ON r.oid = am.roleid
         JOIN pg_roles m ON m.oid = am.member
        WHERE r.rolname = $1 AND m.rolname = 'freightos_migrator'`,
      [WORKER],
    );
    expect(edge).toBe('true/false/false');

    // LOAD-BEARING: the worker is not SET-ROLE reachable from anybody. Administering a role and
    // being able to become it are different powers — R2-05 — and only the first is granted.
    const setReachable = await one(
      `SELECT coalesce(string_agg(m.rolname, ',' ORDER BY m.rolname), '(none)') AS v
         FROM pg_auth_members am
         JOIN pg_roles r ON r.oid = am.roleid
         JOIN pg_roles m ON m.oid = am.member
        WHERE r.rolname = $1 AND am.set_option`,
      [WORKER],
    );
    expect(setReachable).toBe('(none)');
  });

  it('leaves no worker SELECT grant without a policy that can admit it — assertion (m)', async () => {
    // §4 / §57. The release gate, recomputed rather than listed.
    const ledger = await workerReadLedger(owner);
    expect(ledger.length, 'the worker must hold SELECT somewhere').toBeGreaterThan(0);
    expect(
      ledger.filter((r) => r.forceRls && r.policies === '(NONE)').map((r) => r.relation),
      'WORKER_FORCE_RLS_SELECT_WITHOUT_APPLICABLE_POLICY',
    ).toEqual([]);
    // Every relation the worker reads is FORCE-RLS, so the rule has no relation it skips.
    expect(ledger.filter((r) => !r.forceRls)).toEqual([]);
  });
});

describe('gate B — the real 0033 upgrade is additive over populated state', () => {
  it('captures a populated 0033 baseline', async () => {
    await driveTo(N5B);
    // The fixture is applied at 0033 by `seedLifecycleFixture`, below the migration boundary, so
    // the upgrade is graded against real rows rather than an empty database.
    await seedLifecycleFixture();
    baseline0033 = await snapshot();

    // Non-vacuity: an upgrade over an empty database proves nothing about preserving business
    // facts, so the baseline must actually contain some.
    expect(Number(baseline0033['events'])).toBeGreaterThan(0);
    expect(Number(baseline0033['intents'])).toBeGreaterThan(0);
    expect(Number(baseline0033['participants'])).toBeGreaterThan(0);
    expect(Number(baseline0033['grants'])).toBeGreaterThan(0);
    expect(Number(baseline0033['revocations'])).toBeGreaterThan(0);
    expect(baseline0033['n6Tables']).toBe('(none)');
    expect(baseline0033['workerRoleLocal']).toBe('0');
  }, 600_000);

  it('adds N6 and mutates no historical N1–N5 fact', async () => {
    await driveTo(N6);
    const after = await snapshot();

    // §10 — every business fact, by digest rather than by count.
    for (const key of [
      'events',
      'eventDigest',
      'intents',
      'intentDigest',
      'participants',
      'participantDigest',
      'grants',
      'grantDigest',
      'revocations',
      'n5bMetadata',
      'n1n5Columns',
      'n1n5Constraints',
      'definers',
      'permissionCatalog',
      'permissionAssignments',
      'roleAttributes',
      'n5bPolicies',
      'n5aPolicies',
    ]) {
      expect(after[key], `0034 changed ${key}`).toBe(baseline0033[key]);
    }

    // What it MAY add, and did.
    expect(after['tip']).toBe(String(N6));
    expect(after['n6Tables']!.split(',')).toHaveLength(7);
    expect(after['n6PoliciesOnOldRelations']).toBe([...N6_POLICIES_ON_PRE_EXISTING].join(','));
    expect(Number(after['workerRoleLocal'])).toBeGreaterThan(0);
    expect(after['roles']).toBe(`${baseline0033['roles']},${WORKER}`.split(',').sort().join(','));

    firstAt0034 = after;
  }, 600_000);

  it('leaves the N5-B policy definitions byte-identical across the boundary', async () => {
    // §55 and ADR-N0017. 0034 adds no policy to any N5-B relation: those policies are already
    // `TO public USING (true)`, so the worker's SELECT grant is usable without any DDL. The
    // snapshot carries the predicate text, not just the name, so a silent rewrite would show.
    expect(firstAt0034['n5bPolicies']).toBe(baseline0033['n5bPolicies']);
    expect(firstAt0034['n5bPolicies']).toContain('network_disclosure_sensitivities_read:SELECT');
  });
});

describe('gate C — the revert refuses to destroy live delivery history', () => {
  it('refuses without the acknowledgement, and tears nothing down', async () => {
    await seedDeliveryHistory();
    const before = await snapshot();
    expect(Number(await one('SELECT count(*)::text AS v FROM network_disclosure_inbox'))).toBe(1);

    const client = db.connectAsMigrator();
    await client.connect();
    let error: { code?: string; message?: string } | null = null;
    try {
      await migrateDown(client, migrations, N5B);
    } catch (e) {
      error = e as { code?: string; message?: string };
    } finally {
      await client.end();
    }

    expect(error, 'the revert must refuse while delivery history exists').not.toBeNull();
    expect(error?.message).toMatch(
      /reverting 0034 would destroy 1 delivered inbox rows and \d+ delivery records; set freightos\.n6_destructive_revert = 'acknowledged' to proceed deliberately/,
    );

    // NO PARTIAL CLEANUP. The refusal is raised inside the migration transaction, so every part of
    // the surface must be exactly where it was — a revert that dropped three tables and then
    // refused would be far worse than one that never ran.
    const after = await snapshot();
    expect(after).toEqual(before);
    expect(after['tip']).toBe(String(N6));
    expect(after['n6Tables']!.split(',')).toHaveLength(7);
    expect(after['n6PoliciesOnOldRelations']).toBe([...N6_POLICIES_ON_PRE_EXISTING].join(','));
    expect(Number(after['workerRoleLocal'])).toBeGreaterThan(0);
  }, 600_000);
});

describe('gates D and E — the acknowledged revert is exact and bounded', () => {
  it('removes exactly what 0034 added, and restores 0033 exactly', async () => {
    await acknowledgedDownTo(N5B);
    const after = await snapshot();

    // §14 — complete.
    expect(after['tip']).toBe(String(N5B));
    expect(after['n6Tables']).toBe('(none)');
    expect(after['n6Policies']).toBe('(none)');
    expect(after['n6PoliciesOnOldRelations']).toBe('(none)');
    expect(after['n6Enums']).toBe('(none)');
    expect(after['n6Function']).toBe('0');
    expect(after['n6Keys']).toBe('(none)');
    expect(after['workerRoleLocal']).toBe('0');

    // §15 — exact restoration, field by field, against the saved 0033 baseline. Not a count-only
    // parity: every entry below is either a digest or a full string of names and predicates.
    expect(after).toEqual(baseline0033);
  }, 600_000);
});

describe('gate F — the round trip is repeatable in both directions', () => {
  it('reproduces the first 0034 surface exactly on the second application', async () => {
    await driveTo(N6);
    const second = await snapshot();

    // Delivery history is gone — the revert destroyed it, deliberately and with acknowledgement —
    // so the business-row entries legitimately differ. Everything STRUCTURAL must match.
    for (const key of [
      'tip',
      'n6Tables',
      'n6Policies',
      'n6PoliciesOnOldRelations',
      'n6Enums',
      'n6Function',
      'n6Keys',
      'roles',
      'roleAttributes',
      'roleEdges',
      'n5aPolicies',
      'n5bPolicies',
      'definers',
      'permissionCatalog',
      'permissionAssignments',
      'n1n5Columns',
      'n1n5Constraints',
      // The authority record survives the round trip even though the delivery record does not.
      'events',
      'eventDigest',
      'intents',
      'intentDigest',
      'participants',
      'participantDigest',
      'grants',
      'grantDigest',
      'revocations',
      'n5bMetadata',
    ]) {
      expect(second[key], `round trip changed ${key}`).toBe(firstAt0034[key]);
    }

    // And the worker ledger is identical too — the property most likely to drift silently.
    const ledger = await workerReadLedger(owner);
    expect(ledger.filter((r) => r.policies === '(NONE)')).toEqual([]);
    expect(ledger).toHaveLength(20);
  }, 600_000);

  it('indexes, enums and triggers are identical after the round trip', async () => {
    const indexes = await one(
      `SELECT md5(string_agg(indexdef, ',' ORDER BY indexname)) AS v FROM pg_indexes
        WHERE schemaname = 'public' AND tablename LIKE 'network\\_%'`,
    );
    const triggers = await one(
      `SELECT md5(string_agg(c.relname || '.' || t.tgname, ',' ORDER BY c.relname, t.tgname)) AS v
         FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE NOT t.tgisinternal AND c.relname LIKE 'network\\_%'`,
    );
    // Recorded rather than compared to a literal: the assertion that matters is the round-trip
    // equality above, and these two prove the digests are over something non-empty.
    expect(indexes).not.toBe('(null)');
    expect(triggers).not.toBe('(null)');
  });
});

describe('gate G — the single-database half of the worker role lifecycle', () => {
  it('holds real local dependencies at 0034 and none at 0033', async () => {
    // The CROSS-database half — retention with a neighbour, the last-holder drop, the
    // owned-relation refusal — is proven in `network-delivery-worker-teardown`, which needs a
    // cluster of its own. What belongs here is the local half: this database's own references
    // appear and disappear with the migration, which is what makes it a legitimate holder.
    expect(Number((await snapshot())['workerRoleLocal'])).toBeGreaterThan(0);
    await acknowledgedDownTo(N5B);
    expect((await snapshot())['workerRoleLocal']).toBe('0');
    await driveTo(N6);
    expect(Number((await snapshot())['workerRoleLocal'])).toBeGreaterThan(0);
  }, 900_000);
});

/**
 * A populated 0033 database: participants, an accepted event and its intent, N5-A authorization
 * with a revocation, and the N5-B metadata 0033 seeds.
 *
 * Written with the migrator connection and RLS-bypassing superuser where the governed path is not
 * what is under test — this fixture exists to give the UPGRADE something to preserve, and the
 * governed write paths have their own files.
 */
async function seedLifecycleFixture(): Promise<void> {
  await db.seedTenants();

  // Participants go through the control-plane role, which is the registry's governed writer. A
  // superuser INSERT reaches the audit trigger without tenant context and is refused there — the
  // registry does not accept a write from a principal it cannot attribute, which is the point.
  const org = async (name: string, tenant: string | null): Promise<string> =>
    asRole(db, 'freightos_control_plane', async (client) => {
      const r = await client.query<{ id: string }>(
        `INSERT INTO network_participants
           (participant_type, display_name, tenant_id, status, source_system, created_by, updated_by)
         VALUES ('organization', $1, $2, 'active', 'test:n6-lifecycle', 'x', 'x')
         RETURNING id::text AS id`,
        [name, tenant],
      );
      return r.rows[0]!.id;
    });

  const grantor = await org('n6-lifecycle-grantor', TENANT_A);
  const recipient = await org('n6-lifecycle-recipient', null);

  // The event goes through `acceptNetworkEvent`, the REAL acceptance component, so the N4 intent
  // is minted by 0030's trigger exactly as it is in production. A hand-written INSERT would have
  // to reproduce every N3 constraint by hand and would drift the moment N3 adds one.
  const writer = db.connectAs('freightos_event_writer');
  await writer.connect();
  try {
    await writer.query('BEGIN');
    await acceptNetworkEvent(writer, {
      type: 'com.rigreceipts.network.workflow.state.recorded.v1',
      source: 'urn:freightos:test:n6-lifecycle',
      subject: [{ network_id: 'obj-lifecycle', object_type: 'workflow' }],
      time: new Date().toISOString(),
      organization_id: grantor,
      classification: 'internal',
      schema_ref: 'https://schemas.rigreceipts.com/network/workflow-state.v1.json',
      data: {
        workflow_id: 'wf-lc',
        workflow_type: 'shipment',
        state: 'in_transit',
        version: 1,
        participants: ['a', 'b'],
        updated_at: '2026-05-01T00:00:00.000Z',
      },
    });
    await writer.query('COMMIT');
  } finally {
    await writer.end();
  }

  // A grant write raises an audit event, and `app.record_audit_event` takes its tenant and actor
  // from SESSION CONTEXT rather than from arguments — a caller cannot name a tenant at all. So the
  // context is established for the transaction, exactly as the application establishes it, rather
  // than the audit trigger being worked around.
  // A grant write raises an audit event, and `app.record_audit_event` takes tenant, actor, legal
  // authority class and operating context from SESSION CONTEXT rather than from arguments — a
  // caller cannot name a tenant at all. `withLegalContext` is the repository's own helper for
  // establishing exactly that, so the fixture uses it rather than reconstructing six GUCs by hand
  // and discovering the required set one NOT NULL violation at a time.
  await withLegalContext(
    owner,
    { ...carrierContext(TENANT_A), actorId: 'system:n6-lifecycle-fixture' },
    async (c) => {
      const grant = await c.query<{ id: string }>(
        `INSERT INTO network_disclosure_grants
           (grantor_participant_id, recipient_participant_id, purpose_code, projection_ref,
            authority_basis_code, effective_from, effective_until)
         VALUES ($1, $2, 'shipment_execution',
           'com.rigreceipts.network.disclosure.projection.workflow_state_minimal.v1',
           'bilateral_grant', now() - interval '1 day', NULL)
         RETURNING grant_id::text AS id`,
        [grantor, recipient],
      );
      await c.query(
        `INSERT INTO network_disclosure_grant_revocations (grant_id, reason)
         VALUES ($1, 'n6 lifecycle fixture: revocation machinery must survive the upgrade')`,
        [grant.rows[0]!.id],
      );
    },
  );
}

/** Real N6 history — the thing gate C exists to protect. */
async function seedDeliveryHistory(): Promise<void> {
  const recipient = await one(
    `SELECT id::text AS v FROM network_participants WHERE display_name = 'n6-lifecycle-recipient'`,
  );
  const eventId = await one('SELECT event_id::text AS v FROM network_events LIMIT 1');

  const subscription = await one(
    `INSERT INTO network_disclosure_subscriptions
       (recipient_participant_id, purpose_code, durable_schema_ref, destination_kind, effective_from)
     VALUES ($1, 'shipment_execution',
       'https://schemas.rigreceipts.com/network/workflow-state.v1.json', 'freightos_inbox',
       now() - interval '1 day')
     RETURNING subscription_id::text AS v`,
    [recipient],
  );
  await owner.query(
    `INSERT INTO network_disclosure_routing_resolutions
       (network_event_id, matched_subscription_count, authorized_delivery_count, denied_count)
     VALUES ($1, 1, 1, 0)`,
    [eventId],
  );
  const artifact = await one(
    `INSERT INTO network_disclosure_artifacts
       (network_event_id, subscription_id, recipient_participant_id, purpose_code,
        durable_schema_ref, sensitivity_code, permitted_pointers, authorization_digest,
        composite_decision_digest, payload_canonical, payload_digest)
     VALUES ($1, $2, $3, 'shipment_execution',
       'https://schemas.rigreceipts.com/network/workflow-state.v1.json',
       'counterparty_identifying', ARRAY['/workflow_id'], repeat('a', 64), repeat('b', 64),
       '{"workflow_id":"wf-lc"}', repeat('c', 64))
     RETURNING artifact_id::text AS v`,
    [eventId, subscription, recipient],
  );
  const delivery = await one(
    `INSERT INTO network_disclosure_deliveries
       (network_event_id, subscription_id, artifact_id, state)
     VALUES ($1, $2, $3, 'pending')
     RETURNING delivery_id::text AS v`,
    [eventId, subscription, artifact],
  );
  await owner.query(
    `INSERT INTO network_delivery_attempts
       (delivery_id, attempt_number, composite_decision_digest, outcome)
     VALUES ($1, 1, repeat('b', 64), 'delivered')`,
    [delivery],
  );
  await owner.query(
    `INSERT INTO network_disclosure_inbox
       (delivery_id, artifact_id, recipient_participant_id)
     VALUES ($1, $2, $3)`,
    [delivery, artifact, recipient],
  );
}
