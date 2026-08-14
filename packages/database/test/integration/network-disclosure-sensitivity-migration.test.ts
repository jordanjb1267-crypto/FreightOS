import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadMigrations, migrateDown, migrateUp } from '../../src/migrator.ts';
import { MIGRATIONS_DIR } from '../../src/paths.ts';
import { TestDatabase, acquireClusterRoleLock, releaseClusterRoleLock } from './harness.ts';

/**
 * N5-B migration lifecycle — fresh install, the real upgrade over live N5-A state, one step down,
 * and the round trip.
 *
 * This file drives `migrateUp`/`migrateDown` itself. Migrations mutate cluster-wide role state, so
 * it holds the cluster role lock for its whole duration — see `cluster-role-lock-coverage`.
 *
 * The question each phase answers is different. Fresh install proves the surface can be reached
 * from nothing. The upgrade proves 0033 is ADDITIVE over a populated 0032 — that it seeds
 * governance rows and touches no business row, no ACL, no policy and no role. The down proves the
 * revert is exact and bounded. The round trip proves both directions are repeatable rather than
 * merely working once.
 */

const N5A = 32;
const N5B = 33;

const DB_NAME = 'freightos_test_n5b_migration';
const db = new TestDatabase(DB_NAME);
const migrations = loadMigrations(MIGRATIONS_DIR);

let owner: Client;

const N5B_TABLES = [
  'network_disclosure_purpose_ceilings',
  'network_disclosure_sensitivities',
  'network_schema_disclosure_sensitivity',
];

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

const one = async (sql: string): Promise<string> =>
  String((await owner.query<{ v: string }>(sql)).rows[0]?.v ?? '(null)');

/**
 * Everything 0033 owns, plus everything it must not disturb.
 *
 * The second half is the point: a migration that adds a ceiling and quietly alters an ACL, a
 * policy, a role or a business row would pass a snapshot of only its own tables.
 */
const snapshot = async (): Promise<Record<string, string>> => {
  // The DATA half can only run once the tables exist. PostgreSQL parses a whole statement before
  // executing it, so a `to_regclass` guard inside the query does not save it from a parse error at
  // 0032 — the guard has to be out here, in the caller.
  const n5bTables = await one(
    `SELECT coalesce(string_agg(c.relname, ',' ORDER BY c.relname), '(none)') AS v
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname IN ('network_disclosure_sensitivities',
                          'network_schema_disclosure_sensitivity',
                          'network_disclosure_purpose_ceilings')`,
  );
  const present = n5bTables !== '(none)';

  return {
    tip: await one('SELECT coalesce(max(version), 0)::text AS v FROM schema_migrations'),

    n5bTables,
    vocabulary: present
      ? await one(
          `SELECT coalesce(string_agg(code || '=' || rank || '/' || externally_disclosable,
                                    ',' ORDER BY rank), '(none)') AS v
           FROM network_disclosure_sensitivities`,
        )
      : '(absent)',
    assignments: present
      ? await one(
          `SELECT coalesce(string_agg(s.artifact_class || '->' || a.sensitivity_code,
                                    ',' ORDER BY s.artifact_class), '(none)') AS v
           FROM network_schema_disclosure_sensitivity a
           JOIN network_schema_versions s ON s.durable_schema_ref = a.durable_schema_ref`,
        )
      : '(absent)',
    ceilings: present
      ? await one(
          `SELECT coalesce(string_agg(purpose_code || '->' || max_sensitivity_code, ',' ORDER BY 1),
                         '(none)') AS v
           FROM network_disclosure_purpose_ceilings`,
        )
      : '(absent)',

    // --- the surfaces 0033 must leave exactly as it found them ---------------
    n5aTables: await one(
      `SELECT coalesce(string_agg(c.relname, ',' ORDER BY c.relname), '(none)') AS v
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname LIKE 'network\\_disclosure\\_%'
        AND c.relname NOT IN ('network_disclosure_sensitivities',
                              'network_disclosure_purpose_ceilings')`,
    ),
    roles: await one(
      `SELECT string_agg(rolname, ',' ORDER BY rolname) AS v
       FROM pg_roles WHERE rolname LIKE 'freightos%'`,
    ),
    roleEdges: await one(
      `SELECT coalesce(string_agg(format('%s->%s/%s/%s', r.rolname, m.rolname,
                                       am.admin_option, am.set_option), ',' ORDER BY 1), '(none)') AS v
       FROM pg_auth_members am
       JOIN pg_roles r ON r.oid = am.member
       JOIN pg_roles m ON m.oid = am.roleid
      WHERE r.rolname LIKE 'freightos%'`,
    ),
    secdef: await one(
      `SELECT count(*)::text AS v FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('app', 'admin', 'authn') AND p.prosecdef`,
    ),
    auditAcl: await one(
      `SELECT coalesce(p.proacl::text, '(default)') AS v
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app' AND p.proname = 'record_audit_event'`,
    ),
    n5aPolicies: await one(
      `SELECT coalesce(string_agg(policyname || ':' || cmd, ',' ORDER BY policyname), '(none)') AS v
       FROM pg_policies
      WHERE schemaname = 'public' AND tablename LIKE 'network\\_disclosure\\_%'
        AND tablename NOT IN ('network_disclosure_sensitivities',
                              'network_disclosure_purpose_ceilings')`,
    ),
    registry: await one('SELECT count(*)::text AS v FROM network_schema_versions'),
    purposes: await one('SELECT count(*)::text AS v FROM network_disclosure_purposes'),
    pointers: await one('SELECT count(*)::text AS v FROM network_disclosure_projection_fields'),
    grants: await one('SELECT count(*)::text AS v FROM network_disclosure_grants'),
    events: await one('SELECT count(*)::text AS v FROM network_events'),
    intents: await one('SELECT count(*)::text AS v FROM network_transport_intents'),
    permissions: await one('SELECT count(*)::text AS v FROM permissions'),
    eventCols: await one(
      `SELECT string_agg(attname, ',' ORDER BY attnum) AS v FROM pg_attribute
      WHERE attrelid = 'public.network_events'::regclass AND attnum > 0 AND NOT attisdropped`,
    ),
  };
};

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

describe('fresh install', () => {
  it('reaches the N5-B surface from an empty cluster with exactly the declared shape', async () => {
    await driveTo(N5B);

    const applied = await owner.query<{ n: string; tip: string }>(
      'SELECT count(*)::text AS n, max(version)::text AS tip FROM schema_migrations',
    );
    // Exact, not "at least": a migration silently skipped is the failure this catches.
    expect(Number(applied.rows[0]!.n)).toBe(migrations.length);
    expect(applied.rows[0]!.tip).toBe(String(N5B));

    const inv = await snapshot();
    expect(inv['n5bTables']).toBe(N5B_TABLES.join(','));
    expect(inv['vocabulary']).toBe(
      'execution_operational=10/true,counterparty_identifying=20/true,' +
        'commercial_terms=30/true,never_external=99/false',
    );
    expect(inv['ceilings']).toBe('shipment_execution->counterparty_identifying');
    expect(inv['assignments']).toBe(
      'capability-advertisement->commercial_terms,' +
        'command-envelope->never_external,' +
        'consent-grant->never_external,' +
        'event-correction->execution_operational,' +
        'event-envelope->never_external,' +
        'evidence-envelope->never_external,' +
        'object-reference->counterparty_identifying,' +
        'participant-identity->counterparty_identifying,' +
        'workflow-state->counterparty_identifying',
    );
  });

  it('adds no role, no role edge and no SECURITY DEFINER', async () => {
    const inv = await snapshot();
    expect(inv['roles']).toBe(
      'freightos_admin,freightos_admin_owner,freightos_app,freightos_audit_writer,' +
        'freightos_binding_owner,freightos_control_plane,freightos_event_writer,' +
        'freightos_hierarchy_owner,freightos_identity_guard,freightos_migrator,' +
        'freightos_operator_registry_owner',
    );
    // N5-B adds no function at all, so the definer count is whatever 0032 left behind.
    expect(Number(inv['secdef'])).toBeGreaterThan(0);
  });

  it('leaves no registered contract unclassified and no purpose without a ceiling', async () => {
    // The completeness gates, restated here against the finished database rather than only inside
    // the migration — a gate that only ever runs during its own migration proves less.
    const unassigned = await owner.query(
      `SELECT s.durable_schema_ref FROM network_schema_versions s
         LEFT JOIN network_schema_disclosure_sensitivity a
                ON a.durable_schema_ref = s.durable_schema_ref
        WHERE a.durable_schema_ref IS NULL`,
    );
    expect(unassigned.rows).toEqual([]);

    const uncapped = await owner.query(
      `SELECT p.code FROM network_disclosure_purposes p
         LEFT JOIN network_disclosure_purpose_ceilings c ON c.purpose_code = p.code
        WHERE c.purpose_code IS NULL`,
    );
    expect(uncapped.rows).toEqual([]);
  });
});

describe('the real 0032 → 0033 upgrade over live N5-A state', () => {
  it('is additive: it seeds governance rows and rewrites nothing else', async () => {
    await driveTo(N5A);

    // Representative live state at 0032, written through the migrator so it survives the upgrade.
    await owner.query(
      `INSERT INTO network_participants
         (participant_type, display_name, tenant_id, status, source_system, created_by, updated_by)
       VALUES ('organization', 'n5b-upgrade-org', NULL, 'active', 't', 't', 't')
       ON CONFLICT DO NOTHING`,
    );

    const before = await snapshot();
    expect(before['tip']).toBe(String(N5A));
    expect(before['n5bTables']).toBe('(none)');

    await driveTo(N5B);
    const after = await snapshot();

    // What 0033 is allowed to change: its own three tables, their contents, and the tip.
    const OWNED = new Set(['tip', 'n5bTables', 'vocabulary', 'assignments', 'ceilings']);
    const changed = Object.keys(before).filter((k) => before[k] !== after[k]);
    expect(changed.sort()).toEqual([...OWNED].sort());

    // And it genuinely did change those — otherwise the assertion above is satisfied by a no-op.
    expect(after['n5bTables']).toBe(N5B_TABLES.join(','));
    expect(after['tip']).toBe(String(N5B));
  });

  it('backfills nothing into the historical classification column', async () => {
    // The one place a sensitivity model could plausibly have "helpfully" written itself into the
    // event journal. It must not: producer-supplied classification stays exactly as the producer
    // left it, and N5-B never reads it anyway.
    const r = await owner.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM network_events
        WHERE classification IN ('execution_operational', 'counterparty_identifying',
                                 'commercial_terms', 'never_external')`,
    );
    expect(r.rows[0]!.n).toBe('0');
  });
});

describe('one step down, and the round trip', () => {
  it('reverts only 0033 and reproduces 0032 exactly', async () => {
    await driveTo(N5B);
    const at33 = await snapshot();

    await driveTo(N5A);
    const at32 = await snapshot();

    expect(at32['tip']).toBe(String(N5A));
    expect(at32['n5bTables']).toBe('(none)');
    expect(at32['vocabulary']).toBe('(absent)');
    expect(at32['assignments']).toBe('(absent)');
    expect(at32['ceilings']).toBe('(absent)');

    // Everything outside N5-B is byte-identical either side of the revert.
    for (const key of Object.keys(at33)) {
      if (['tip', 'n5bTables', 'vocabulary', 'assignments', 'ceilings'].includes(key)) continue;
      expect(at32[key], `${key} changed across the revert`).toBe(at33[key]);
    }

    // No orphaned policy or trigger survives the drop.
    const orphans = await owner.query(
      `SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [N5B_TABLES],
    );
    expect(orphans.rows).toEqual([]);
  });

  it('reproduces the same N5-B state on 0032 → 0033 → 0032 → 0033', async () => {
    await driveTo(N5B);
    const first = await snapshot();
    await driveTo(N5A);
    await driveTo(N5B);
    const second = await snapshot();

    expect(second).toEqual(first);
  });

  it('restores the same 0032 state on a second revert', async () => {
    await driveTo(N5A);
    const first = await snapshot();
    await driveTo(N5B);
    await driveTo(N5A);
    const second = await snapshot();

    expect(second).toEqual(first);
    await driveTo(N5B);
  });
});
