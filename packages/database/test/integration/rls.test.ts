import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyLegalContext, currentContext } from '../../src/session.ts';
import { TENANT_A, TENANT_B, TestDatabase, carrierContext } from './harness.ts';
import type { IdentityFixture } from './identity-harness.ts';
import { seedVerifiedFixture } from './sr2-harness.ts';
import { fixtureOperator, withAuthenticatedTestPrincipal } from './verified-test-auth.ts';

/**
 * 14_TEST_AND_ACCEPTANCE_STRATEGY requires tenant-isolation and RLS tests, and lists the negative
 * cases explicitly. Closes audit finding G1: the handoff enables RLS on some tables and defines
 * zero policies, so nothing was actually isolated.
 *
 * MIGRATED TO THE VERIFIED SESSION — SR-2.
 *
 * Every case that needs authority now obtains it the way production does: authenticate at the
 * test-only boundary, mint against the runtime connection's own backend, install, work. What used
 * to be `withLegalContext(app, carrierContext(TENANT_A), ...)` was a caller writing its own tenant
 * id into a session variable and the database believing it. After 0019 the database does not, and
 * the assertions below are unchanged because they were always about isolation rather than about how
 * the session said who it was.
 *
 * The three cases that do NOT use it are the ones whose subject is the absence of authority — no
 * context at all, a rejected legal pairing, an unsigned brokerage gate — plus the catalog checks.
 * Giving those a verified session would remove what they test.
 */
const db = new TestDatabase('freightos_test_rls');

describe('row-level security', () => {
  let app: Client;
  let fixtureA: IdentityFixture;
  let fixtureB: IdentityFixture;

  beforeAll(async () => {
    await db.reset();
    await db.seedTenants();
    // Provisioning, not authentication: a binding needs a principal that already exists, and the
    // first user of a tenant is the row that would justify one. See sr2-harness.ts.
    fixtureA = await seedVerifiedFixture(db, TENANT_A);
    fixtureB = await seedVerifiedFixture(db, TENANT_B);
    app = db.connectAs('freightos_app');
    await app.connect();
  }, 180_000);

  afterAll(async () => {
    await app?.end();
  });

  it('shows a tenant only its own row', async () => {
    const rows = await withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), async (c) => {
      const r = await c.query<{ id: string }>('SELECT id FROM tenants');
      return r.rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(TENANT_A);
  });

  it('hides other tenants even when asked for them by primary key', async () => {
    const rows = await withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), async (c) => {
      const r = await c.query('SELECT id FROM tenants WHERE id = $1', [TENANT_B]);
      return r.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('fails closed when no context is set at all', async () => {
    // No SET LOCAL: app.current_tenant_id() is NULL, so `id = NULL` is NULL and matches nothing.
    await app.query('BEGIN');
    const result = await app.query('SELECT id FROM tenants');
    await app.query('ROLLBACK');
    expect(result.rows).toHaveLength(0);
  });

  it('rejects writing a row belonging to another tenant', async () => {
    await expect(
      withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), async (c) => {
        await c.query(
          'INSERT INTO tenants (id, tenant_id, name, created_by) VALUES ($1, $1, $2, $3)',
          ['44444444-4444-4444-8444-444444444444', 'Smuggled', 'test'],
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('rejects updating another tenant', async () => {
    const updated = await withAuthenticatedTestPrincipal(
      db,
      fixtureOperator(fixtureA),
      async (c) => {
        const r = await c.query('UPDATE tenants SET name = $1 WHERE id = $2', [
          'hijacked',
          TENANT_B,
        ]);
        return r.rowCount;
      },
    );
    expect(updated).toBe(0);

    // Tenant B's own principal confirms the row is untouched — a separately authenticated session,
    // which is the ONLY way to change tenant. There is no context switch a caller can perform.
    const check = await withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureB), async (c) => {
      const r = await c.query<{ name: string }>('SELECT name FROM tenants WHERE id = $1', [
        TENANT_B,
      ]);
      return r.rows[0]!.name;
    });
    expect(check).toBe('Tenant B');
  });

  it('denies the application role any DELETE on tenants', async () => {
    await expect(
      withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), async (c) => {
        await c.query('DELETE FROM tenants WHERE id = $1', [TENANT_A]);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('does not leak context across transactions', async () => {
    await withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), async (c) => {
      const ctx = await currentContext(c);
      expect(ctx.tenantId).toBe(TENANT_A);
    });

    // SET LOCAL is transaction-scoped, so the next transaction starts with nothing.
    await app.query('BEGIN');
    const after = await currentContext(app);
    await app.query('ROLLBACK');
    expect(after.tenantId).toBeNull();
  });

  it('rolls context back with a failed transaction', async () => {
    await expect(
      withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), async (c) => {
        await c.query('SELECT 1');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    await app.query('BEGIN');
    const after = await currentContext(app);
    await app.query('ROLLBACK');
    expect(after.tenantId).toBeNull();
  });

  it('refuses to apply an inconsistent legal context', async () => {
    await app.query('BEGIN');
    await expect(
      applyLegalContext(app, {
        ...carrierContext(TENANT_A),
        operatingContext: 'facility_operator', // carrier_agent may only operate as `carrier`
      }),
    ).rejects.toThrow(/not permitted/);
    await app.query('ROLLBACK');
  });

  it('refuses brokerage authority while its gate is unsigned', async () => {
    await app.query('BEGIN');
    await expect(
      applyLegalContext(app, {
        tenantId: TENANT_A,
        legalAuthorityClass: 'brokerage',
        operatingContext: 'brokerage',
        actorId: 'test:actor',
        legalEntityId: '33333333-3333-4333-8333-333333333333',
      }),
    ).rejects.toThrow(/BROKERAGE_LEGAL_GATE/);
    await app.query('ROLLBACK');
  });

  it('rejects an impermissible legal pairing at the database level too', async () => {
    // Belt and braces: even if application validation were bypassed, the CHECK constraint holds.
    const result = await app.query<{ ok: boolean }>(
      `SELECT app.is_permitted_legal_pairing('carrier_agent', 'brokerage') AS ok`,
    );
    expect(result.rows[0]!.ok).toBe(false);
  });

  it('does not let a tenant session claim control-plane authority', async () => {
    const isControlPlane = await withAuthenticatedTestPrincipal(
      db,
      fixtureOperator(fixtureA),
      async (c) => {
        // Try to fake it via a session variable — the policy checks role membership, not settings.
        await c.query(`SELECT set_config('app.is_control_plane', 'true', true)`);
        const ctx = await currentContext(c);
        return ctx.isControlPlane;
      },
    );
    expect(isControlPlane).toBe(false);
  });

  it('lets the control plane see every tenant', async () => {
    const control = db.connectAs('freightos_control_plane');
    await control.connect();
    try {
      const r = await control.query<{ id: string }>(
        'SELECT id FROM tenants WHERE NOT is_platform ORDER BY name',
      );
      expect(r.rows.map((x) => x.id)).toEqual([TENANT_A, TENANT_B]);
    } finally {
      await control.end();
    }
  });

  it('forces RLS on the table owner as well', async () => {
    // P-04 and ACCEPTANCE_THRESHOLDS §1: extended to every Phase 1 table as each PR adds them, so
    // a new table without FORCE fails here rather than at a phase exit gate.
    const tables = [
      'tenants',
      'audit_events',
      'outbox_events',
      'kill_switches',
      'organization_nodes',
      'organization_node_closure',
      'legal_entities',
      'operating_authorities',
      'carrier_appointments',
      'users',
      'memberships',
      'membership_roles',
      'roles',
      'permissions',
      'role_permissions',
      'service_accounts',
      'service_account_credentials',
      'service_account_permissions',
      'policy_bindings',
    ];
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      const r = await admin.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT relname, relrowsecurity, relforcerowsecurity
         FROM pg_class WHERE relname = ANY($1) ORDER BY relname`,
        [tables],
      );
      expect(r.rows).toHaveLength(tables.length);
      for (const row of r.rows) {
        expect(row.relrowsecurity, `${row.relname} ENABLE`).toBe(true);
        expect(row.relforcerowsecurity, `${row.relname} FORCE`).toBe(true);
      }
    } finally {
      await admin.end();
    }
  });

  it('leaves no tenant-owned table without a policy', async () => {
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      const r = await admin.query<{ tablename: string }>(
        `SELECT c.relname AS tablename
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind = 'r'
           AND c.relrowsecurity
           AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)`,
      );
      expect(r.rows.map((x) => x.tablename)).toEqual([]);
    } finally {
      await admin.end();
    }
  });
});
