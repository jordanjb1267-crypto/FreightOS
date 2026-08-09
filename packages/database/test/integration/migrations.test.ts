import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appliedMigrations,
  loadMigrations,
  migrateDown,
  migrateUp,
  oneStepDownTarget,
  verifyChecksums,
} from '../../src/migrator.ts';
import { MIGRATIONS_DIR } from '../../src/paths.ts';
import {
  acquireClusterRoleLock,
  releaseClusterRoleLock,
  TENANT_A,
  TestDatabase,
} from './harness.ts';

// CLUSTER-GLOBAL EXCLUSION. This file drives migrateUp/migrateDown itself, and migrations mutate
// PostgreSQL ROLES, which are cluster-wide rather than per-database — so the per-file database
// gives this file no isolation at all for the state it changes. Measured against pg_stat_activity,
// two migrator backends were ACTIVE in different databases in 27 of 131 samples during a full run,
// always at a file boundary. The lock is held for the whole file because a role revoked between
// two `it` blocks is the same race as one revoked inside one.
beforeAll(async () => {
  await acquireClusterRoleLock();
}, 300_000);

afterAll(async () => {
  await releaseClusterRoleLock();
});

/**
 * 00_MASTER_HANDOFF:269 — "a phase is not production ready until ... migrations recover".
 * Constitution Art. VIII.2 requires rollback on every release.
 *
 * The handoff reference DDL has no down migrations at all (audit finding G10), so this apply →
 * revert → re-apply cycle is the evidence that ADR-0017 actually delivered rollback.
 */
const db = new TestDatabase('freightos_test_migrations');

/**
 * The migration authority — F-04. Every apply, revert and reapply below runs as
 * `freightos_migrator`, never as a superuser, because a superuser bypasses row-level security and
 * would prove the lifecycle works for a reason production does not have.
 */
let migrator: Client;

/**
 * A superuser, kept for exactly one job: writing kill-switch fixtures. `kill_switches` carries
 * FORCE row-level security and no write policy, so the migrator that owns it cannot insert either
 * — which is the intended production shape. Nothing in the lifecycle assertions uses this client.
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

describe('migration loading', () => {
  it('finds every migration with a matching down file', () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    expect(migrations.length).toBeGreaterThanOrEqual(4);
    for (const m of migrations) {
      expect(m.downSql.length, `${m.version}_${m.name} down`).toBeGreaterThan(0);
    }
  });

  it('numbers migrations contiguously from 0001', () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    expect(migrations.map((m) => m.version)).toEqual(
      Array.from({ length: migrations.length }, (_, i) => i + 1),
    );
  });

  it('records a checksum per migration', () => {
    for (const m of loadMigrations(MIGRATIONS_DIR)) {
      expect(m.checksum).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe('apply, revert, re-apply', () => {
  it('records every migration as applied', async () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    const applied = await appliedMigrations(migrator);
    expect(applied.map((a) => a.version)).toEqual(migrations.map((m) => m.version));
  });

  it('is idempotent — a second up applies nothing', async () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    const result = await migrateUp(migrator, migrations);
    expect(result.applied).toEqual([]);
  });

  it('detects an applied migration that was edited afterwards', async () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    const tampered = migrations.map((m, i) => (i === 0 ? { ...m, checksum: 'f'.repeat(64) } : m));
    const problems = await verifyChecksums(migrator, tampered);
    expect(problems.join(' ')).toMatch(/was edited after being applied/);

    // And migrateUp refuses to proceed on that basis.
    await expect(migrateUp(migrator, tampered)).rejects.toThrow(/checksum verification failed/);
  });

  it('reverts all the way down, leaving no tables behind', async () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    const result = await migrateDown(migrator, migrations, 0);
    expect(result.reverted).toEqual([...migrations.map((m) => m.version)].reverse());

    const tables = await migrator.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_tables
       WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
    );
    expect(tables.rows[0]!.count).toBe('0');

    const appSchema = await migrator.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_namespace WHERE nspname = 'app'`,
    );
    expect(appSchema.rows[0]!.count).toBe('0');
  });

  it('re-applies cleanly from empty and is functional again', async () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    const result = await migrateUp(migrator, migrations);
    expect(result.applied).toEqual(migrations.map((m) => m.version));

    // Prove the recovered schema actually works, not merely that DDL ran.
    // Reverting 0001 dropped the grants, so the roles need re-granting — via the harness, so
    // the password-auth path CI uses is exercised too.
    await db.grantTestRoleLogin();

    const control = db.connectAs('freightos_control_plane');
    await control.connect();
    try {
      await control.query(
        'INSERT INTO tenants (id, tenant_id, name, created_by) VALUES ($1, $1, $2, $3)',
        [TENANT_A, 'Recovered', 'test:recovery'],
      );
      const r = await control.query<{ name: string }>('SELECT name FROM tenants WHERE id = $1', [
        TENANT_A,
      ]);
      expect(r.rows[0]!.name).toBe('Recovered');
    } finally {
      await control.end();
    }
  });

  it('reverts partially to a chosen version', async () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    await migrateDown(migrator, migrations, 2);
    const applied = await appliedMigrations(migrator);
    expect(applied.map((a) => a.version)).toEqual([1, 2]);

    // kill_switches came in 0004, so it must be gone.
    const exists = await migrator.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_tables WHERE tablename = 'kill_switches'`,
    );
    expect(exists.rows[0]!.count).toBe('0');

    await migrateUp(migrator, migrations);
    expect((await appliedMigrations(migrator)).length).toBe(migrations.length);
  });

  it('steps down one migration at a time, repeatedly', async () => {
    // `pnpm db:down` is the runbook's way of unwinding a deployment one migration at a time, and
    // it computed its target from the number of files on disk rather than from what was applied.
    // The first call worked; every call after it recomputed the same target and reported "nothing
    // to revert", so a rollback that needed more than one step quietly stopped after one.
    const migrations = loadMigrations(MIGRATIONS_DIR);
    const top = migrations.length;

    for (const expected of [top, top - 1, top - 2]) {
      const result = await migrateDown(migrator, migrations, await oneStepDownTarget(migrator));
      expect(result.reverted, `step down from ${expected}`).toEqual([expected]);
    }
    expect((await appliedMigrations(migrator)).map((a) => a.version)).toEqual(
      Array.from({ length: top - 3 }, (_, i) => i + 1),
    );

    // And it bottoms out at zero rather than going negative or looping.
    await migrateDown(migrator, migrations, 0);
    expect(await oneStepDownTarget(migrator)).toBe(0);
    expect(
      (await migrateDown(migrator, migrations, await oneStepDownTarget(migrator))).reverted,
    ).toEqual([]);

    await migrateUp(migrator, migrations);
    await db.grantTestRoleLogin();
  });
});

describe('reference DDL is never executed', () => {
  it('keeps handoff SQL out of the migration set', () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    const names = migrations.map((m) => `${m.version}_${m.name}`);
    // The handoff's five reference files must not appear as runnable migrations (ADR-0017).
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

  it('does not create the deferred autonomous-vehicle tables', async () => {
    // db/0005 bundles PARTNER_AND_SAFETY_GATED AV tables with Horizon 1 facility tables.
    // Applying it wholesale would materialise deferred-module schema — audit finding G12.
    const deferred = [
      'autonomous_vehicle_providers',
      'autonomous_vehicles',
      'odd_profiles',
      'autonomous_missions',
      'remote_assistance_cases',
      'vehicle_health_summaries',
    ];
    const r = await migrator.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE tablename = ANY($1)`,
      [deferred],
    );
    expect(r.rows.map((x) => x.tablename)).toEqual([]);
  });

  it('creates no domain tables in Phase 0', async () => {
    const domain = [
      'shipments',
      'consignments',
      'transport_journeys',
      'transport_legs',
      'facilities',
    ];
    const r = await migrator.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE tablename = ANY($1)`,
      [domain],
    );
    expect(r.rows.map((x) => x.tablename)).toEqual([]);
  });
});

describe('kill switches in the database', () => {
  async function engage(
    scope: string,
    scopeRef: string | null,
    tenantId: string | null,
    mode: string,
  ) {
    await admin.query(
      `INSERT INTO kill_switches (scope, scope_ref, tenant_id, mode, reason, engaged_by_type, engaged_by, created_by)
       VALUES ($1,$2,$3,$4,'integration test','human','test:operator','test:operator')`,
      [scope, scopeRef, tenantId, mode],
    );
  }

  it('defaults to enabled when nothing is engaged', async () => {
    const r = await admin.query<{ mode: string }>(
      `SELECT app.resolve_kill_switch_mode($1) AS mode`,
      [TENANT_A],
    );
    expect(r.rows[0]!.mode).toBe('enabled');
  });

  it('lets a system switch override a narrower enabled switch', async () => {
    await engage('tenant', TENANT_A, TENANT_A, 'enabled');
    await engage('system', null, null, 'suspended');

    const r = await admin.query<{ mode: string }>(
      `SELECT app.resolve_kill_switch_mode($1) AS mode`,
      [TENANT_A],
    );
    expect(r.rows[0]!.mode).toBe('suspended');
  });

  it('permits only one active switch per subject', async () => {
    await expect(engage('system', null, null, 'read_only')).rejects.toThrow(
      /kill_switches_one_active_per_subject/,
    );
  });

  it('rejects a system switch that names a subject', async () => {
    await expect(engage('system', 'something', null, 'read_only')).rejects.toThrow(
      /kill_switches_scope_ref_shape/,
    );
  });

  it('requires a tenant for tenant-narrower scopes', async () => {
    await expect(engage('agent', 'dispatch-agent', null, 'read_only')).rejects.toThrow(
      /kill_switches_tenant_shape/,
    );
  });

  it('refuses an agent as the engaging authority — Constitution Art. V.1', async () => {
    await expect(
      admin.query(
        `INSERT INTO kill_switches (scope, scope_ref, tenant_id, mode, reason, engaged_by_type, engaged_by, created_by)
         VALUES ('agent', $1, $2, 'suspended', 'self-engaged', 'agent', 'dispatch-agent', 'dispatch-agent')`,
        [randomUUID(), TENANT_A],
      ),
    ).rejects.toThrow(/kill_switches_engaged_by_type_check/);
  });

  it('records releases instead of deleting them', async () => {
    await expect(admin.query('DELETE FROM kill_switches')).rejects.toThrow(/append-only/i);

    // released_by_type joins the release columns from OQ-19 onward (migration 0015): Art. V.1
    // reserves kill-switch authority to humans, and Phase 0 constrained engagement only. The
    // assertions below are unchanged in behaviour.
    await admin.query(
      `UPDATE kill_switches
          SET released_at = now(), released_by = 'test:operator', released_by_type = 'human'
       WHERE scope = 'system' AND released_at IS NULL`,
    );
    const r = await admin.query<{ mode: string }>(
      `SELECT app.resolve_kill_switch_mode($1) AS mode`,
      [TENANT_A],
    );
    // The system suspension is released; the tenant `enabled` switch remains.
    expect(r.rows[0]!.mode).toBe('enabled');

    const history = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM kill_switches WHERE released_at IS NOT NULL`,
    );
    expect(Number(history.rows[0]!.count)).toBeGreaterThan(0);
  });
});
