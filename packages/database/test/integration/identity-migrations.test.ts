import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appliedMigrations,
  loadMigrations,
  migrateDown,
  migrateUp,
  verifyChecksums,
} from '../../src/migrator.ts';
import { MIGRATIONS_DIR } from '../../src/paths.ts';
import { TENANT_A, TestDatabase } from './harness.ts';
import { PR2_TABLES, seedIdentity } from './identity-harness.ts';

/**
 * ACCEPTANCE_THRESHOLDS §4 — every migration pull request must prove: apply from empty, apply from
 * the accepted prior baseline, a down migration or documented recovery path, reapply, checksum
 * integrity, edited-after-apply detection, and no unauthorized reference-DDL execution.
 *
 * "Apply from the accepted prior baseline" is the Phase 1 addition, and it is the case a
 * from-empty test cannot cover: a migration must apply cleanly on top of the schema as it exists
 * at the previous merged PR, not only on nothing.
 */
const db = new TestDatabase('freightos_test_identity_migrations');

/** The Phase 0 accepted baseline: migrations 0001 to 0004. */
const PHASE_0_BASELINE = 4;

/**
 * The migration authority — F-04.
 *
 * The lifecycle here was previously driven by `postgres`. A superuser bypasses row-level security
 * unconditionally, so "the migrations apply" meant only that they parse; two of them could not in
 * fact run under `freightos_migrator`, which is the role every runbook and every connection URI
 * names. Every apply, revert and reapply below now runs as the migrator, so the evidence is about
 * the deployment that will actually happen.
 */
let migrator: Client;

/**
 * A superuser, used only where a fixture has to be written past FORCE row-level security — the
 * pre-upgrade `tenants` and `audit_events` rows below. It drives no migration.
 */
let admin: Client;

beforeAll(async () => {
  await db.reset();
  migrator = db.connectAsMigrator();
  await migrator.connect();
  admin = db.connectAs('postgres');
  await admin.connect();
}, 60_000);

afterAll(async () => {
  await migrator?.end();
  await admin?.end();
});

describe('migration authority', () => {
  // F-04. If this profile ever drifts, every lifecycle assertion in this file silently becomes a
  // superuser proof again, which is the exact failure being remediated. The same four attributes
  // are asserted by scripts/bootstrap-migration-authority.sql §4, which is the production path.
  it('runs migrations as a role holding neither SUPERUSER nor BYPASSRLS', async () => {
    const r = await migrator.query<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcreaterole: boolean;
      rolcanlogin: boolean;
    }>(
      `SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcanlogin
         FROM pg_roles WHERE rolname = current_user`,
    );
    const role = r.rows[0]!;
    expect(role.rolname).toBe('freightos_migrator');
    expect(role.rolsuper).toBe(false);
    expect(role.rolbypassrls).toBe(false);
    // The two it does need: it connects, and it provisions the runtime roles in 0001 and 0013.
    expect(role.rolcanlogin).toBe(true);
    expect(role.rolcreaterole).toBe(true);
  });

  it('is not reachable from any runtime role', async () => {
    // Deployment authority must not be one SET ROLE away from an application connection. Checked
    // in the direction that matters: no runtime role is a member of the migrator.
    const r = await migrator.query<{ rolname: string }>(
      `SELECT m.rolname FROM pg_auth_members am
         JOIN pg_roles m ON m.oid = am.member
         JOIN pg_roles g ON g.oid = am.roleid
        WHERE g.rolname = 'freightos_migrator'`,
    );
    expect(r.rows.map((x) => x.rolname)).toEqual([]);
  });

  it('does not satisfy app.is_control_plane()', async () => {
    // The escalation this catches is transitive and silent. freightos_admin_owner is a member of
    // freightos_control_plane, so any grant of the definer owner to the migrator that inherits —
    // the default form of `GRANT ... WITH SET TRUE` — makes the deployment connection pass the
    // control-plane branch of every policy in the schema, with no error anywhere. 0013 takes that
    // grant deliberately, and must take it WITH INHERIT FALSE.
    const r = await migrator.query<{ cp: boolean; usage: boolean; set_role: boolean }>(
      `SELECT app.is_control_plane() AS cp,
              pg_has_role(current_user, 'freightos_admin_owner', 'USAGE') AS usage,
              pg_has_role(current_user, 'freightos_admin_owner', 'SET') AS set_role`,
    );
    expect(r.rows[0]!.cp).toBe(false);
    expect(r.rows[0]!.usage).toBe(false);
    // SET is the part 0013 legitimately needs: `ALTER ... OWNER TO` requires it. Reaching the
    // definer's rights therefore takes an explicit SET ROLE that no migration issues.
    expect(r.rows[0]!.set_role).toBe(true);
  });

  it('is bound by FORCE row-level security on the tables it owns', async () => {
    // This is the property a superuser connection cannot have, and its absence is what let the
    // 0008 seed and the 0016 revert look correct while being broken. FORCE binds the owner, the
    // migrator matches no policy, so it writes nothing and sees nothing.
    await expect(
      migrator.query(
        `INSERT INTO tenants (id, tenant_id, name, created_by)
         VALUES ($1, $1, 'written by the migrator', 'test:f04')`,
        [randomUUID()],
      ),
    ).rejects.toThrow(/row-level security/i);

    const r = await migrator.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM tenants',
    );
    expect(r.rows[0]!.count).toBe('0');
  });
});

describe('the migration set', () => {
  it('numbers contiguously from 0001 with no gap', () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    expect(migrations.map((m) => m.version)).toEqual(
      Array.from({ length: migrations.length }, (_, i) => i + 1),
    );
  });

  it('ships a down file for every migration', () => {
    for (const migration of loadMigrations(MIGRATIONS_DIR)) {
      expect(migration.downSql.length, `${migration.version}_${migration.name}`).toBeGreaterThan(0);
    }
  });

  it('records a checksum per migration', () => {
    for (const migration of loadMigrations(MIGRATIONS_DIR)) {
      expect(migration.checksum, migration.name).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('marks exactly the enum-value migration as non-transactional', () => {
    // ADR-0017 §4. ALTER TYPE ... ADD VALUE is the one construct that needs it, and 0014 is the one
    // migration that uses it. Anything else carrying the marker would be losing transactional
    // safety for no reason.
    const nonTransactional = loadMigrations(MIGRATIONS_DIR)
      .filter((m) => !m.transactional)
      .map((m) => `${m.version}_${m.name}`);
    expect(nonTransactional).toEqual(['14_kill_switch_scope_values']);
  });

  it('splits adding an enum value from using it', () => {
    // A multi-statement simple query is an implicit transaction, so a migration that both added a
    // value and referenced it would fail with 55P04 regardless of the marker. The split is what
    // actually makes it safe.
    const migrations = loadMigrations(MIGRATIONS_DIR);
    const adding = migrations.find((m) => m.name === 'kill_switch_scope_values')!;
    expect(adding.upSql).toContain('ADD VALUE');
    expect(adding.upSql).not.toMatch(/scope\s*=\s*'legal_entity'/);
    expect(adding.upSql).not.toMatch(/scope\s*=\s*'operating_context'/);

    const using = migrations.find((m) => m.name === 'kill_switch_scope_expansion')!;
    expect(using.version).toBeGreaterThan(adding.version);
    expect(using.upSql).toContain("'operating_context'");
  });

  it('keeps handoff reference DDL out of the runnable set — ADR-0017', () => {
    const names = loadMigrations(MIGRATIONS_DIR).map((m) => `${m.version}_${m.name}`);
    for (const referenceName of [
      'identity_authority',
      'multimodal_core',
      'agents_policy_audit',
      'billing',
      'facility_autonomous_mobility',
    ]) {
      expect(
        names.some((n) => n.includes(referenceName)),
        referenceName,
      ).toBe(false);
    }
  });

  it('creates no table belonging to a later PR', () => {
    const forbidden = [
      // PR 3 onward.
      'parties',
      'locations',
      'contacts',
      'carrier_profiles',
      'drivers',
      'powered_units',
      'nonpowered_equipment',
      'shipments',
      'consignments',
      'transport_journeys',
      'transport_legs',
      'stops',
      'facilities',
      'appointments',
      'custody_events',
      'detention_clocks',
      'load_opportunities',
      'cost_profiles',
      'profitability_results',
      // Billing, permanently out of Horizon 1.
      'billing_accounts',
      'meter_events',
      'invoices',
      'entitlements',
      // Deferred modules.
      'autonomous_vehicles',
      'autonomous_missions',
      'odd_profiles',
    ];
    for (const migration of loadMigrations(MIGRATIONS_DIR)) {
      for (const table of forbidden) {
        expect(
          new RegExp(`CREATE TABLE\\s+(IF NOT EXISTS\\s+)?${table}\\b`, 'i').test(migration.upSql),
          `${migration.name} creates ${table}`,
        ).toBe(false);
      }
    }
  });

  it('grants BYPASSRLS or SUPERUSER nowhere in any migration, up or down', () => {
    // ADR-0020 prohibits both outright. Comments are stripped first: several migrations discuss
    // why BYPASSRLS is not used, and a check that cannot tell an explanation from a grant would
    // push authors toward saying less rather than granting less.
    //
    // Both directions are scanned. A down migration that handed a role SUPERUSER on the way back
    // is exactly as fatal as an up migration doing it, and a rollback is the moment a deployment
    // is least likely to be watched.
    //
    // The keyword is matched as a whole word, which is the same argument one step further.
    // NOSUPERUSER and NOBYPASSRLS are the attributes this test wants to see, and
    // `pg_roles.rolbypassrls` is the column a migration reads to ASSERT the attribute is absent —
    // 0013 does precisely that, and a substring match forbids writing the assertion at all.
    // Every form that actually confers an attribute writes the keyword standalone —
    // `CREATE ROLE x BYPASSRLS`, `ALTER ROLE x WITH SUPERUSER`, the same text inside EXECUTE'd
    // dynamic SQL — so nothing that grants escapes.
    const confers = /\b(?:BYPASSRLS|SUPERUSER)\b/i;
    for (const migration of loadMigrations(MIGRATIONS_DIR)) {
      for (const direction of ['upSql', 'downSql'] as const) {
        const code = migration[direction].replace(/--[^\n]*/g, '');
        expect(confers.test(code), `${migration.name} ${direction}`).toBe(false);
      }
    }
  });
});

describe('apply from empty', () => {
  it('applied every migration in order', async () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    const applied = await appliedMigrations(migrator);
    expect(applied.map((m) => m.version)).toEqual(migrations.map((m) => m.version));
  });

  it('created all fifteen PR 2 tables', async () => {
    const r = await migrator.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)
        ORDER BY tablename`,
      [[...PR2_TABLES]],
    );
    expect(r.rows.map((x) => x.tablename).sort()).toEqual([...PR2_TABLES].sort());
  });

  it('is idempotent — a second up applies nothing', async () => {
    const result = await migrateUp(migrator, loadMigrations(MIGRATIONS_DIR));
    expect(result.applied).toEqual([]);
  });

  it('detects a migration edited after it was applied', async () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    const tampered = migrations.map((m, i) =>
      i === migrations.length - 1 ? { ...m, checksum: 'f'.repeat(64) } : m,
    );
    const problems = await verifyChecksums(migrator, tampered);
    expect(problems.join(' ')).toMatch(/was edited after being applied/);
    await expect(migrateUp(migrator, tampered)).rejects.toThrow(/checksum verification failed/);
  });
});

describe('apply from the accepted Phase 0 baseline', () => {
  const baseline = new TestDatabase('freightos_test_identity_from_baseline');
  /** Drives the upgrade — F-04. The migration authority, not a superuser. */
  let client: Client;
  /** Writes the pre-upgrade fixture rows, which FORCE row-level security puts out of the
   * migrator's reach. It runs no migration. */
  let fixtures: Client;

  beforeAll(async () => {
    await baseline.reset();
    client = baseline.connectAsMigrator();
    await client.connect();
    fixtures = baseline.connectAs('postgres');
    await fixtures.connect();
    const migrations = loadMigrations(MIGRATIONS_DIR);
    await migrateDown(client, migrations, PHASE_0_BASELINE);
  }, 60_000);

  afterAll(async () => {
    await client?.end();
    await fixtures?.end();
  });

  it('stands at the Phase 0 baseline with none of the PR 2 tables', async () => {
    const applied = await appliedMigrations(client);
    expect(applied.map((m) => m.version)).toEqual([1, 2, 3, 4]);

    const r = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE tablename = ANY($1)`,
      [[...PR2_TABLES]],
    );
    expect(r.rows).toEqual([]);
  });

  it('carries Phase 0 data across the upgrade unchanged', async () => {
    await fixtures.query(
      `INSERT INTO tenants (id, tenant_id, name, created_by) VALUES ($1, $1, 'Pre-upgrade', 'op')`,
      [TENANT_A],
    );
    const auditId = await fixtures.query<{ id: string }>(
      `INSERT INTO audit_events
         (tenant_id, legal_entity_id, legal_authority_class, operating_context, actor_type,
          actor_id, event_type, resource_type, correlation_id, created_by)
       VALUES ($1, $2, 'carrier_agent', 'carrier', 'human', 'op',
               'rig.freight.shipment.created.v1', 'shipment', $3, 'op')
       RETURNING id`,
      [TENANT_A, randomUUID(), randomUUID()],
    );

    const result = await migrateUp(client, loadMigrations(MIGRATIONS_DIR));
    expect(result.applied).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

    const tenant = await fixtures.query<{
      name: string;
      record_version: string;
      updated_by: string;
    }>('SELECT name, record_version, updated_by FROM tenants WHERE id = $1', [TENANT_A]);
    expect(tenant.rows[0]!.name).toBe('Pre-upgrade');
    // ADR-0021: `version` became `record_version` and `updated_by` was backfilled from created_by
    // rather than from a placeholder that names nobody. record_version is unchanged at 1 — the
    // backfill runs with triggers disabled, so a schema change is not recorded as an edit.
    expect(Number(tenant.rows[0]!.record_version)).toBe(1);
    expect(tenant.rows[0]!.updated_by).toBe('op');

    const audit = await fixtures.query<{
      operation_class: string;
      purpose: string | null;
      outcome: string | null;
    }>('SELECT operation_class, purpose, outcome FROM audit_events WHERE id = $1', [
      auditId.rows[0]!.id,
    ]);
    // OQ-20 compatibility: the pre-existing row is still readable and still valid.
    expect(audit.rows[0]!.operation_class).toBe('domain');
    expect(audit.rows[0]!.purpose).toBeNull();
    expect(audit.rows[0]!.outcome).toBeNull();
  });

  it('is functional after the upgrade', async () => {
    await baseline.grantTestRoleLogin();
    const app = baseline.connectAs('freightos_app');
    await app.connect();
    try {
      const fixture = await seedIdentity(app, TENANT_A);
      expect(fixture.terminalNodeId).toBeTruthy();
    } finally {
      await app.end();
    }
  });
});

describe('revert and reapply', () => {
  const cycle = new TestDatabase('freightos_test_identity_cycle');
  let client: Client;

  beforeAll(async () => {
    await cycle.reset();
    client = cycle.connectAsMigrator();
    await client.connect();
  }, 60_000);

  afterAll(async () => {
    await client?.end();
  });

  it('reverts all the way down, leaving no table and no schema behind', async () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    const result = await migrateDown(client, migrations, 0);
    expect(result.reverted).toEqual([...migrations.map((m) => m.version)].reverse());

    const tables = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
    );
    expect(tables.rows[0]!.count).toBe('0');

    const schemas = await client.query<{ nspname: string }>(
      `SELECT nspname FROM pg_namespace WHERE nspname IN ('app', 'admin')`,
    );
    expect(schemas.rows).toEqual([]);

    const types = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_type t
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname IN ('app', 'admin')`,
    );
    expect(types.rows[0]!.count).toBe('0');
  });

  it('re-applies cleanly from empty and is functional again', async () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    const result = await migrateUp(client, migrations);
    expect(result.applied).toEqual(migrations.map((m) => m.version));

    await cycle.grantTestRoleLogin();
    await cycle.seedTenants();

    const app = cycle.connectAs('freightos_app');
    await app.connect();
    try {
      const fixture = await seedIdentity(app, TENANT_A);
      expect(fixture.legalEntityId).toBeTruthy();
    } finally {
      await app.end();
    }
  });

  it('reverts partially to the Phase 0 baseline and back up', async () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    await migrateDown(client, migrations, PHASE_0_BASELINE);
    expect((await appliedMigrations(client)).map((m) => m.version)).toEqual([1, 2, 3, 4]);

    const gone = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_tables WHERE tablename = 'organization_nodes'`,
    );
    expect(gone.rows[0]!.count).toBe('0');

    await migrateUp(client, migrations);
    expect((await appliedMigrations(client)).length).toBe(migrations.length);
  });

  it('restores the Phase 0 kill-switch surface exactly when the OQ-19 pair is reverted', async () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    await migrateDown(client, migrations, 13);

    const columns = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'kill_switches' ORDER BY column_name`,
    );
    expect(columns.rows.map((c) => c.column_name)).not.toContain('released_by_type');

    const scopes = await client.query<{ label: string }>(
      `SELECT unnest(enum_range(NULL::app.kill_switch_scope))::text AS label`,
    );
    expect(scopes.rows).toHaveLength(7);

    const functionArgs = await client.query<{ arity: number; args: string }>(
      `SELECT array_length(p.proargtypes, 1) AS arity,
              pg_get_function_identity_arguments(p.oid) AS args
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'app' AND p.proname = 'resolve_kill_switch_mode'`,
    );
    // Exactly one function, back to the Phase 0 six parameters — no overload left behind.
    expect(functionArgs.rows).toHaveLength(1);
    expect(functionArgs.rows[0]!.arity).toBe(6);
    expect(functionArgs.rows[0]!.args).not.toContain('p_legal_entity_id');
    expect(functionArgs.rows[0]!.args).not.toContain('p_operating_context');

    const policies = await client.query<{ polname: string }>(
      `SELECT p.polname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
        WHERE c.relname = 'kill_switches' ORDER BY p.polname`,
    );
    expect(policies.rows.map((x) => x.polname)).toEqual([
      'kill_switches_read',
      'kill_switches_release',
      'kill_switches_write',
    ]);

    await migrateUp(client, migrations);
  });
});
