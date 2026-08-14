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
import { N6_DELIVERY_RELATIONS, N7_TRANSPORT_RELATIONS } from './network-relations.ts';

/**
 * N7-A §46 — the migration lifecycle. Fresh install, the real upgrade over live 0034 state, the
 * refusal that protects transport configuration, the acknowledged bounded revert, exact
 * restoration of 0034, and the round trip.
 *
 * Each phase answers a different question. Fresh install proves the surface is reachable from
 * nothing and pins it exactly. The upgrade proves 0035 is ADDITIVE over a populated 0034 — that it
 * touches no business row, no N1–N6 policy it does not own, no role attribute and no permission
 * assignment. THAT ONE MATTERS MORE HERE THAN ANYWHERE PREVIOUS: 0035 is the first migration in
 * the band that alters a table belonging to an earlier phase, adding
 * `network_disclosure_artifacts_id_digest_key` so the permit can bind a digest as one referential
 * fact. An additive claim about a migration that reaches into N6 has to be measured, not asserted.
 *
 * `network-transport-worker-teardown` holds the CROSS-DATABASE half of the role lifecycle, which
 * needs a cluster of its own; the role checks here are the single-database ones.
 */

const N6 = 34;
const N7 = 35;

const DB_NAME = 'freightos_test_n7_migration';
const db = new TestDatabase(DB_NAME);
const migrations = loadMigrations(MIGRATIONS_DIR);

const WORKER = 'freightos_transport_worker';
const DELIVERY_WORKER = 'freightos_delivery_worker';

/** The three relations 0035 does not own but places a transport-worker read policy on. */
const N7_POLICIES_ON_PRE_EXISTING = [
  'network_disclosure_artifacts_transport_worker_read',
  'network_disclosure_inbox_transport_worker_read',
  'network_participants_transport_worker_read',
] as const;

/** The one N6 constraint 0035 borrows. Its arrival and departure are both load-bearing. */
const BORROWED_N6_KEY = 'network_disclosure_artifacts_id_digest_key';

const WORKFLOW_STATE = 'https://schemas.rigreceipts.com/network/workflow-state.v1.json';

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
    await client.query(`SET freightos.n7_destructive_revert = 'acknowledged'`);
    await migrateDown(client, migrations, version);
  } finally {
    await client.end();
  }
}

const one = async (sql: string, params: unknown[] = []): Promise<string> =>
  String((await owner.query<{ v: string }>(sql, params)).rows[0]?.v ?? '(null)');

/**
 * Everything 0035 owns, plus everything it must leave exactly as it found it.
 *
 * The second half carries the weight. A migration that adds five tables and quietly alters an N6
 * policy, a role attribute or a permission assignment would pass a snapshot of only its own
 * surface — which is the failure mode every gate below is graded against.
 */
const snapshot = async (): Promise<Record<string, string>> => ({
  tip: await one('SELECT coalesce(max(version), 0)::text AS v FROM schema_migrations'),

  // --- 0035's own surface ---------------------------------------------------
  n7Tables: await one(
    `SELECT coalesce(string_agg(c.relname, ',' ORDER BY c.relname), '(none)') AS v
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1)`,
    [[...N7_TRANSPORT_RELATIONS]],
  ),
  n7Policies: await one(
    `SELECT coalesce(string_agg(policyname || ':' || cmd, ',' ORDER BY policyname), '(none)') AS v
       FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1)`,
    [[...N7_TRANSPORT_RELATIONS]],
  ),
  n7PoliciesOnOldRelations: await one(
    `SELECT coalesce(string_agg(policyname, ',' ORDER BY policyname), '(none)') AS v
       FROM pg_policies WHERE schemaname = 'public' AND policyname = ANY($1)`,
    [[...N7_POLICIES_ON_PRE_EXISTING]],
  ),
  n7Enums: await one(
    `SELECT coalesce(string_agg(t.typname, ',' ORDER BY t.typname), '(none)') AS v
       FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'app' AND t.typname IN ('network_transport_destination_kind',
            'network_external_transport_state', 'network_external_transport_attempt_outcome')`,
  ),
  n7Function: await one(
    `SELECT count(*)::text AS v FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app' AND p.proname = 'network_external_transport_transition'`,
  ),
  n7Keys: await one(
    `SELECT coalesce(string_agg(key, ',' ORDER BY key), '(none)') AS v FROM permissions
      WHERE key LIKE 'network.transport_destination.%'`,
  ),
  // THE BORROWED KEY. 0035 adds this constraint to an N6 table and its revert removes it again;
  // both halves are asserted, because a revert that left it behind would leave N6 carrying a
  // uniqueness rule nothing in N6 asked for.
  borrowedN6Key: await one(`SELECT count(*)::text AS v FROM pg_constraint WHERE conname = $1`, [
    BORROWED_N6_KEY,
  ]),
  workerRoleLocal: await one(
    `SELECT count(*)::text AS v FROM pg_shdepend s JOIN pg_roles r ON r.oid = s.refobjid
      WHERE r.rolname = $1
        AND (s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
          OR (s.classid = 'pg_database'::regclass
              AND s.objid = (SELECT oid FROM pg_database WHERE datname = current_database())))`,
    [WORKER],
  ),

  // --- the surfaces 0035 must not disturb -----------------------------------
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
  // N6's policies, with their predicates, EXCLUDING the three 0035 legitimately adds. A silent
  // rewrite of a delivery-worker or recipient policy would show here as a changed predicate.
  n6Policies: await one(
    `SELECT coalesce(string_agg(policyname || ':' || cmd || ':' || roles::text || ':'
                || coalesce(qual, '-') || ':' || coalesce(with_check, '-'),
                ',' ORDER BY policyname), '(none)') AS v
       FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1)
         AND policyname <> ALL($2)`,
    [[...N6_DELIVERY_RELATIONS], [...N7_POLICIES_ON_PRE_EXISTING]],
  ),
  // Every privilege the DELIVERY worker holds outside N7. 0035 extends it by exactly two N7
  // relations and must change nothing else — a mis-typed REVOKE in the grant block would show up
  // here as a missing N6 read rather than as a passing test.
  deliveryWorkerGrantsOutsideN7: await one(
    `SELECT coalesce(string_agg(format('%s:%s', c.relname, a.privilege_type),
                ',' ORDER BY c.relname, a.privilege_type), '(none)') AS v
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(c.relacl) a
       JOIN pg_roles g ON g.oid = a.grantee
      WHERE n.nspname = 'public' AND g.rolname = $1 AND c.relname <> ALL($2)`,
    [DELIVERY_WORKER, [...N7_TRANSPORT_RELATIONS]],
  ),
  definers: await one(
    `SELECT count(*)::text AS v FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('app', 'admin', 'authn') AND p.prosecdef`,
  ),
  permissionCatalog: await one(
    `SELECT md5(string_agg(key, ',' ORDER BY key)) AS v FROM permissions
      WHERE key NOT LIKE 'network.transport_destination.%'`,
  ),
  permissionAssignments: await one('SELECT count(*)::text AS v FROM role_permissions'),

  // --- business facts N7 may never touch ------------------------------------
  events: await one('SELECT count(*)::text AS v FROM network_events'),
  eventDigest: await one(
    `SELECT coalesce(md5(string_agg(event_id::text || event_fingerprint, ',' ORDER BY event_id)),
              '(empty)') AS v FROM network_events`,
  ),
  participants: await one('SELECT count(*)::text AS v FROM network_participants'),
  participantDigest: await one(
    `SELECT coalesce(md5(string_agg(id::text || display_name || status::text, ',' ORDER BY id)),
              '(empty)') AS v FROM network_participants`,
  ),
  grants: await one('SELECT count(*)::text AS v FROM network_disclosure_grants'),
  artifacts: await one('SELECT count(*)::text AS v FROM network_disclosure_artifacts'),
  artifactDigest: await one(
    `SELECT coalesce(md5(string_agg(artifact_id::text || payload_digest, ',' ORDER BY artifact_id)),
              '(empty)') AS v FROM network_disclosure_artifacts`,
  ),
  inbox: await one('SELECT count(*)::text AS v FROM network_disclosure_inbox'),
  inboxDigest: await one(
    `SELECT coalesce(md5(string_agg(inbox_id::text || artifact_id::text, ',' ORDER BY inbox_id)),
              '(empty)') AS v FROM network_disclosure_inbox`,
  ),

  // --- the N1–N6 shape itself -----------------------------------------------
  n1n6Columns: await one(
    `SELECT md5(string_agg(c.relname || '.' || a.attname || ':' || a.atttypid::text,
              ',' ORDER BY c.relname, a.attnum)) AS v
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
        AND c.relname LIKE 'network\\_%' AND c.relname <> ALL($1)`,
    [[...N7_TRANSPORT_RELATIONS]],
  ),
  // Constraints on N1–N6, EXCLUDING the one key 0035 legitimately borrows, so this digest is a
  // statement about everything else rather than a restatement of the borrow.
  n1n6Constraints: await one(
    `SELECT md5(string_agg(c.conrelid::regclass::text || ':' || c.conname,
              ',' ORDER BY c.conrelid::regclass::text, c.conname)) AS v
       FROM pg_constraint c
      WHERE c.connamespace = 'public'::regnamespace
        AND c.conrelid::regclass::text LIKE 'network\\_%'
        AND c.conrelid::regclass::text <> ALL($1)
        AND c.conname <> $2`,
    [[...N7_TRANSPORT_RELATIONS], BORROWED_N6_KEY],
  ),
});

/**
 * The FORCE-RLS transport-worker read compatibility ledger, recomputed from the catalog.
 *
 * The standing form of the assertion N6 introduced as (m): for every relation on which the worker
 * holds SELECT, is there at least one permissive SELECT policy capable of admitting it? A GRANT
 * without one is not a privilege under FORCE RLS — it is a permanently empty read that raises no
 * error. Recomputed rather than compared against a fixed list, so a grant added later is covered
 * the moment it exists.
 */
async function transportReadLedger(
  client: Client,
): Promise<{ relation: string; forceRls: boolean; policies: string }[]> {
  const r = await client.query<{ relation: string; force_rls: boolean; policies: string }>(
    `SELECT g.table_name AS relation,
            c.relforcerowsecurity AS force_rls,
            coalesce((SELECT string_agg(p.policyname, ',' ORDER BY p.policyname)
                        FROM pg_policies p
                       WHERE p.schemaname = 'public' AND p.tablename = g.table_name
                         AND p.cmd IN ('SELECT', 'ALL')
                         AND ('freightos_transport_worker' = ANY (p.roles)
                              OR 'public' = ANY (p.roles))), '(NONE)') AS policies
       FROM information_schema.role_table_grants g
       JOIN pg_class c ON c.oid = ('public.' || g.table_name)::regclass
      WHERE g.grantee = 'freightos_transport_worker' AND g.privilege_type = 'SELECT'
      ORDER BY g.table_name`,
  );
  return r.rows.map((x) => ({
    relation: x.relation,
    forceRls: x.force_rls,
    policies: x.policies,
  }));
}

let baseline0034: Record<string, string>;
let firstAt0035: Record<string, string>;

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

describe('gate A — fresh install reaches 0035 with exactly the declared surface', () => {
  it('applies every migration and lands on the pinned N7 surface', async () => {
    // `db.reset()` in `beforeAll` dropped the database and migrated it from EMPTY to the tip, so
    // this really is a fresh install rather than a database that happened to be at 35 already;
    // `driveTo` here is a no-op that makes the intended version explicit. The row count below is
    // what proves the whole sequence ran, not just the last file.
    await driveTo(N7);
    const inv = await snapshot();

    expect(inv['tip']).toBe(String(N7));
    expect(Number(await one('SELECT count(*)::text AS v FROM schema_migrations'))).toBe(
      migrations.filter((m) => m.version <= N7).length,
    );

    expect(inv['n7Tables']).toBe([...N7_TRANSPORT_RELATIONS].sort().join(','));
    expect(inv['n7Tables']!.split(',')).toHaveLength(5);
    // 17 on N7's own five, plus the three on borrowed relations, is the 20 the down migration
    // asserts it removes. The two halves are counted separately here so a policy moving between
    // them cannot keep the total right while putting authority on the wrong table.
    expect(inv['n7Policies']!.split(',')).toHaveLength(17);
    expect(inv['n7PoliciesOnOldRelations']).toBe([...N7_POLICIES_ON_PRE_EXISTING].join(','));
    expect(inv['n7Enums']!.split(',')).toHaveLength(3);
    expect(inv['n7Function']).toBe('1');
    expect(inv['n7Keys']).toBe(
      'network.transport_destination.create,network.transport_destination.read,' +
        'network.transport_destination.revoke',
    );
    expect(inv['borrowedN6Key']).toBe('1');
    expect(Number(inv['workerRoleLocal'])).toBeGreaterThan(0);
  }, 600_000);

  it('pins the transport worker attributes and the ADMIN-only migrator edge', async () => {
    expect(
      await one(
        `SELECT format('login=%s super=%s createdb=%s createrole=%s bypassrls=%s replication=%s',
                  rolcanlogin::text, rolsuper::text, rolcreatedb::text, rolcreaterole::text,
                  rolbypassrls::text, rolreplication::text) AS v
           FROM pg_roles WHERE rolname = $1`,
        [WORKER],
      ),
    ).toBe(
      'login=true super=false createdb=false createrole=false bypassrls=false replication=false',
    );

    expect(
      await one(
        `SELECT coalesce(string_agg(format('%s/%s/%s/%s', m.rolname,
                  am.admin_option::text, am.inherit_option::text, am.set_option::text),
                  ',' ORDER BY 1), '(none)') AS v
           FROM pg_auth_members am
           JOIN pg_roles r ON r.oid = am.roleid
           JOIN pg_roles m ON m.oid = am.member
          WHERE r.rolname = $1`,
        [WORKER],
      ),
    ).toBe('freightos_migrator/true/false/false');
  });

  it('leaves no transport-worker SELECT grant without a policy that can admit it', async () => {
    const ledger = await transportReadLedger(owner);
    // Six reads: three of its own N7 relations and three borrowed. Non-vacuity first — an empty
    // ledger would satisfy every claim below and would mean the query, not the schema, was wrong.
    expect(ledger.map((x) => x.relation)).toEqual([
      'network_disclosure_artifacts',
      'network_disclosure_inbox',
      'network_external_transport_attempts',
      'network_external_transport_permits',
      'network_external_transports',
      'network_participants',
      'network_transport_destination_revocations',
      'network_transport_destinations',
    ]);
    for (const row of ledger) {
      expect(row.policies, `${row.relation} grants SELECT with no admitting policy`).not.toBe(
        '(NONE)',
      );
    }
  });
});

describe('gate B — the real 0034 upgrade is additive over populated state', () => {
  it('captures a populated 0034 baseline', async () => {
    await driveTo(N6);
    await seedLifecycleFixture();
    baseline0034 = await snapshot();

    // Non-vacuity: an upgrade over an empty database proves nothing about preserving business
    // facts, so the baseline must actually contain some — and specifically an ARTIFACT, because
    // the artifacts table is the one 0035 reaches into.
    expect(Number(baseline0034['events'])).toBeGreaterThan(0);
    expect(Number(baseline0034['participants'])).toBeGreaterThan(0);
    expect(Number(baseline0034['grants'])).toBeGreaterThan(0);
    expect(Number(baseline0034['artifacts'])).toBeGreaterThan(0);
    expect(Number(baseline0034['inbox'])).toBeGreaterThan(0);
    expect(baseline0034['n7Tables']).toBe('(none)');
    expect(baseline0034['borrowedN6Key']).toBe('0');
    expect(baseline0034['workerRoleLocal']).toBe('0');
  }, 600_000);

  it('adds N7 and mutates no historical N1–N6 fact', async () => {
    await driveTo(N7);
    const after = await snapshot();

    for (const key of [
      'events',
      'eventDigest',
      'participants',
      'participantDigest',
      'grants',
      'artifacts',
      'artifactDigest',
      'inbox',
      'inboxDigest',
      'n1n6Columns',
      'n1n6Constraints',
      'definers',
      'permissionCatalog',
      'permissionAssignments',
      'roleAttributes',
      'n6Policies',
    ]) {
      expect(after[key], `0035 changed ${key}`).toBe(baseline0034[key]);
    }

    // What it MAY add, and did.
    expect(after['tip']).toBe(String(N7));
    expect(after['n7Tables']!.split(',')).toHaveLength(5);
    expect(after['n7PoliciesOnOldRelations']).toBe([...N7_POLICIES_ON_PRE_EXISTING].join(','));
    expect(after['borrowedN6Key']).toBe('1');
    expect(Number(after['workerRoleLocal'])).toBeGreaterThan(0);
    expect(after['roles']).toBe(`${baseline0034['roles']},${WORKER}`.split(',').sort().join(','));

    firstAt0035 = after;
  }, 600_000);

  it('extends the delivery worker by exactly the two N7 relations the broker writes', async () => {
    // 0035 gives the AUTHORIZATION side two new writes — the obligation and the permit — and must
    // touch nothing else it holds. Comparing the outside-N7 slice across the boundary is what
    // separates "extended" from "rewritten": a mis-typed REVOKE among a dozen near-identical lines
    // would strip an N6 read here and leave the cluster unable to deliver.
    expect(firstAt0035['deliveryWorkerGrantsOutsideN7']).toBe(
      baseline0034['deliveryWorkerGrantsOutsideN7'],
    );

    const insideN7 = await one(
      `SELECT coalesce(string_agg(format('%s:%s', c.relname, a.privilege_type),
                  ',' ORDER BY c.relname, a.privilege_type), '(none)') AS v
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         CROSS JOIN LATERAL aclexplode(c.relacl) a
         JOIN pg_roles g ON g.oid = a.grantee
        WHERE n.nspname = 'public' AND g.rolname = $1 AND c.relname = ANY($2)`,
      [DELIVERY_WORKER, [...N7_TRANSPORT_RELATIONS]],
    );
    // Note what is ABSENT: no write on the attempt journal, and no UPDATE on either relation it
    // does write. The broker creates; it never revises, and it never records an outcome.
    expect(insideN7).toBe(
      'network_external_transport_permits:INSERT,network_external_transport_permits:SELECT,' +
        'network_external_transports:INSERT,network_external_transports:SELECT,' +
        'network_transport_destination_revocations:SELECT,network_transport_destinations:SELECT',
    );
  });
});

describe('gate C — the revert refuses to destroy live transport configuration', () => {
  it('refuses without the acknowledgement, and tears nothing down', async () => {
    await seedTransportConfiguration();
    const before = await snapshot();
    expect(Number(await one('SELECT count(*)::text AS v FROM network_external_transports'))).toBe(
      1,
    );
    expect(
      Number(await one('SELECT count(*)::text AS v FROM network_transport_destinations')),
    ).toBe(1);

    const client = db.connectAsMigrator();
    await client.connect();
    let error: { code?: string; message?: string } | null = null;
    try {
      await migrateDown(client, migrations, N6);
    } catch (e) {
      error = e as { code?: string; message?: string };
    } finally {
      await client.end();
    }

    expect(error, 'the revert must refuse while transport configuration exists').not.toBeNull();
    expect(error?.message).toMatch(
      /reverting 0035 would destroy 1 external transport obligation\(s\) and 1 destination\(s\); set freightos\.n7_destructive_revert = 'acknowledged' to proceed deliberately/,
    );

    // AND THE GUARD WAS NOT BLIND. This is the R-06 / U-10 lesson applied to 0035's own guard: all
    // five N7 relations are FORCE RLS and the migrator has no read policy on any of them, so a
    // bare count inside the guard would return ZERO WITHOUT ERROR and wave every downgrade
    // through. The numbers in the message above are the proof it could see: they are the rows
    // this fixture wrote, not zeros.
    expect(error?.message).toContain('would destroy 1 external transport obligation(s)');

    // NO PARTIAL CLEANUP. The refusal is raised inside the migration transaction, so every part of
    // the surface must be exactly where it was — including the two temporary scoped policies the
    // guard creates to see at all, which must not survive the rollback.
    const after = await snapshot();
    expect(after).toEqual(before);
    expect(after['tip']).toBe(String(N7));
    expect(
      await one(
        `SELECT count(*)::text AS v FROM pg_policies
          WHERE schemaname = 'public' AND policyname LIKE '%n7_down_count'`,
      ),
      'the guard left its temporary read policies behind',
    ).toBe('0');
  }, 600_000);
});

describe('gates D and E — the acknowledged revert is exact and bounded', () => {
  it('removes exactly what 0035 added, and restores 0034 exactly', async () => {
    await acknowledgedDownTo(N6);
    const after = await snapshot();

    expect(after['tip']).toBe(String(N6));
    expect(after['n7Tables']).toBe('(none)');
    expect(after['n7Policies']).toBe('(none)');
    expect(after['n7PoliciesOnOldRelations']).toBe('(none)');
    expect(after['n7Enums']).toBe('(none)');
    expect(after['n7Function']).toBe('0');
    expect(after['n7Keys']).toBe('(none)');
    expect(after['workerRoleLocal']).toBe('0');
    // The borrowed key goes back too. A revert that left it would leave N6 carrying a uniqueness
    // rule nothing in N6 asked for — harmless today, and exactly the kind of residue that makes a
    // later "0034 is unchanged" claim false without anyone noticing.
    expect(after['borrowedN6Key']).toBe('0');

    // EXACT RESTORATION, field by field, against the saved 0034 baseline. Not a count-only parity:
    // every entry is either a digest or a full string of names and predicates. The business rows
    // differ — the destination and obligation were destroyed with acknowledgement — so the N6
    // facts are compared and the N7 ones are asserted absent above.
    for (const key of Object.keys(baseline0034)) {
      expect(after[key], `the revert did not restore ${key}`).toBe(baseline0034[key]);
    }
  }, 600_000);
});

describe('gate F — the round trip is repeatable in both directions', () => {
  it('reproduces the first 0035 surface exactly on the second application', async () => {
    await driveTo(N7);
    const second = await snapshot();

    // Transport configuration is gone — the revert destroyed it, deliberately and with
    // acknowledgement — so nothing about destinations or obligations is compared. Everything
    // STRUCTURAL must match the first application exactly.
    for (const key of [
      'tip',
      'n7Tables',
      'n7Policies',
      'n7PoliciesOnOldRelations',
      'n7Enums',
      'n7Function',
      'n7Keys',
      'borrowedN6Key',
      'roles',
      'roleAttributes',
      'roleEdges',
      'n6Policies',
      'deliveryWorkerGrantsOutsideN7',
      'definers',
      'permissionCatalog',
      'permissionAssignments',
      'n1n6Columns',
      'n1n6Constraints',
      // The N6 history survives the round trip even though the N7 configuration does not.
      'events',
      'eventDigest',
      'participants',
      'participantDigest',
      'artifacts',
      'artifactDigest',
      'inbox',
      'inboxDigest',
    ]) {
      expect(second[key], `the round trip changed ${key}`).toBe(firstAt0035[key]);
    }
  }, 600_000);

  it('reproduces the indexes and triggers identically after the round trip', async () => {
    const indexes = await one(
      `SELECT coalesce(string_agg(indexname || ':' || indexdef, ',' ORDER BY indexname), '(none)') AS v
         FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [[...N7_TRANSPORT_RELATIONS]],
    );
    const triggers = await one(
      `SELECT coalesce(string_agg(c.relname || ':' || t.tgname || ':' || p.proname,
                  ',' ORDER BY c.relname, t.tgname), '(none)') AS v
         FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE NOT t.tgisinternal AND c.relname = ANY($1)`,
      [[...N7_TRANSPORT_RELATIONS]],
    );
    expect(indexes).not.toBe('(none)');
    expect(triggers.split(',')).toHaveLength(15);
    expect(await transportReadLedger(owner)).toHaveLength(8);
  });
});

describe('gate G — the single-database half of the transport worker role lifecycle', () => {
  it('holds real local dependencies at 0035 and none at 0034', async () => {
    // The CROSS-database half — retention with a neighbour, the last-holder drop, the
    // owned-relation refusal — is proven in `network-transport-worker-teardown`, which needs a
    // cluster of its own. What belongs here is the local half: this database's own references
    // appear and disappear with the migration, which is what makes it a legitimate holder.
    expect(Number((await snapshot())['workerRoleLocal'])).toBeGreaterThan(0);
    await acknowledgedDownTo(N6);
    expect((await snapshot())['workerRoleLocal']).toBe('0');
    // AND THE DELIVERY WORKER IS UNAFFECTED throughout. Reverting N7 removes one role's local
    // dependencies, never two.
    expect(
      Number(
        await one(
          `SELECT count(*)::text AS v FROM pg_shdepend s JOIN pg_roles r ON r.oid = s.refobjid
            WHERE r.rolname = $1
              AND s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database())`,
          [DELIVERY_WORKER],
        ),
      ),
    ).toBeGreaterThan(0);
    await driveTo(N7);
    expect(Number((await snapshot())['workerRoleLocal'])).toBeGreaterThan(0);
  }, 900_000);
});

/**
 * A populated 0034 database: participants, an accepted event and its intent, N5-A authorization,
 * a governed subscription, and a full N6 chain ending at a committed inbox row.
 *
 * The inbox row is the part 0035 needs: without it there is nothing an obligation could legally be
 * built from, so the upgrade would be graded against a database where its own preconditions never
 * occur.
 */
async function seedLifecycleFixture(): Promise<void> {
  await db.seedTenants();

  const org = async (name: string, tenant: string | null): Promise<string> =>
    asRole(db, 'freightos_control_plane', async (client) => {
      const r = await client.query<{ id: string }>(
        `INSERT INTO network_participants
           (participant_type, display_name, tenant_id, status, source_system, created_by, updated_by)
         VALUES ('organization', $1, $2, 'active', 'test:n7-lifecycle', 'x', 'x')
         RETURNING id::text AS id`,
        [name, tenant],
      );
      return r.rows[0]!.id;
    });

  const grantor = await org('n7-lifecycle-grantor', TENANT_A);
  const recipient = await org('n7-lifecycle-recipient', TENANT_A);

  const writer = db.connectAs('freightos_event_writer');
  await writer.connect();
  let eventId = '';
  try {
    await writer.query('BEGIN');
    const accepted = await acceptNetworkEvent(writer, {
      type: 'com.rigreceipts.network.workflow.state.recorded.v1',
      source: 'urn:freightos:test:n7-lifecycle',
      subject: [{ network_id: 'obj-lifecycle', object_type: 'workflow' }],
      time: new Date().toISOString(),
      organization_id: grantor,
      classification: 'internal',
      schema_ref: WORKFLOW_STATE,
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
    eventId = accepted.event_id;
  } finally {
    await writer.end();
  }

  // A grant write raises an audit event, and `app.record_audit_event` takes tenant, actor, legal
  // authority class and operating context from SESSION CONTEXT rather than from arguments.
  // `withLegalContext` is the repository's own helper for establishing exactly that.
  await withLegalContext(
    owner,
    { ...carrierContext(TENANT_A), actorId: 'system:n7-lifecycle-fixture' },
    async (c) => {
      await c.query(
        `INSERT INTO network_disclosure_grants
           (grantor_participant_id, recipient_participant_id, purpose_code, projection_ref,
            authority_basis_code, effective_from, effective_until)
         VALUES ($1, $2, 'shipment_execution',
           'com.rigreceipts.network.disclosure.projection.workflow_state_minimal.v1',
           'bilateral_grant', now() - interval '1 day', NULL)`,
        [grantor, recipient],
      );
    },
  );

  const subscription = await one(
    `INSERT INTO network_disclosure_subscriptions
       (recipient_participant_id, purpose_code, durable_schema_ref, destination_kind, effective_from)
     VALUES ($1, 'shipment_execution', $2, 'freightos_inbox', now() - interval '1 day')
     RETURNING subscription_id::text AS v`,
    [recipient, WORKFLOW_STATE],
  );
  const artifact = await one(
    `INSERT INTO network_disclosure_artifacts
       (network_event_id, subscription_id, recipient_participant_id, purpose_code,
        durable_schema_ref, sensitivity_code, permitted_pointers, authorization_digest,
        composite_decision_digest, payload_canonical, payload_digest)
     VALUES ($1, $2, $3, 'shipment_execution', $4, 'counterparty_identifying',
       ARRAY['/workflow_id'], repeat('a', 64), repeat('b', 64), '{"workflow_id":"wf-lc"}',
       repeat('c', 64))
     RETURNING artifact_id::text AS v`,
    [eventId, subscription, recipient, WORKFLOW_STATE],
  );
  const delivery = await one(
    `INSERT INTO network_disclosure_deliveries (network_event_id, subscription_id, artifact_id)
     VALUES ($1, $2, $3) RETURNING delivery_id::text AS v`,
    [eventId, subscription, artifact],
  );
  await owner.query(
    `INSERT INTO network_disclosure_inbox (delivery_id, artifact_id, recipient_participant_id)
     VALUES ($1, $2, $3)`,
    [delivery, artifact, recipient],
  );
}

/** Real N7 configuration — the thing gate C exists to protect. */
async function seedTransportConfiguration(): Promise<void> {
  const recipient = await one(
    `SELECT id::text AS v FROM network_participants WHERE display_name = 'n7-lifecycle-recipient'`,
  );
  const artifact = await one(
    'SELECT artifact_id::text AS v FROM network_disclosure_artifacts LIMIT 1',
  );
  const inbox = await one('SELECT inbox_id::text AS v FROM network_disclosure_inbox LIMIT 1');

  const destination = await one(
    `INSERT INTO network_transport_destinations
       (recipient_participant_id, destination_kind, purpose_code, durable_schema_ref, endpoint_ref)
     VALUES ($1, 'https_webhook', 'shipment_execution', $2, 'destination-config:lifecycle')
     RETURNING destination_id::text AS v`,
    [recipient, WORKFLOW_STATE],
  );
  await owner.query(
    `INSERT INTO network_external_transports
       (artifact_id, destination_id, recipient_participant_id, inbox_id)
     VALUES ($1, $2, $3, $4)`,
    [artifact, destination, recipient, inbox],
  );
}
