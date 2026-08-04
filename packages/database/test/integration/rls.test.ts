import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyLegalContext, currentContext, withLegalContext } from '../../src/session.ts';
import { TENANT_A, TENANT_B, TestDatabase, carrierContext } from './harness.ts';

/**
 * 14_TEST_AND_ACCEPTANCE_STRATEGY requires tenant-isolation and RLS tests, and lists the negative
 * cases explicitly. Closes audit finding G1: the handoff enables RLS on some tables and defines
 * zero policies, so nothing was actually isolated.
 */
const db = new TestDatabase('freightos_test_rls');

describe('row-level security', () => {
  let app: Client;

  beforeAll(async () => {
    await db.reset();
    await db.seedTenants();
    app = db.connectAs('freightos_app');
    await app.connect();
  }, 60_000);

  afterAll(async () => {
    await app?.end();
  });

  it('shows a tenant only its own row', async () => {
    const rows = await withLegalContext(app, carrierContext(TENANT_A), async (c) => {
      const r = await c.query<{ id: string }>('SELECT id FROM tenants');
      return r.rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(TENANT_A);
  });

  it('hides other tenants even when asked for them by primary key', async () => {
    const rows = await withLegalContext(app, carrierContext(TENANT_A), async (c) => {
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
      withLegalContext(app, carrierContext(TENANT_A), async (c) => {
        await c.query(
          'INSERT INTO tenants (id, tenant_id, name, created_by) VALUES ($1, $1, $2, $3)',
          ['44444444-4444-4444-8444-444444444444', 'Smuggled', 'test'],
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('rejects updating another tenant', async () => {
    const updated = await withLegalContext(app, carrierContext(TENANT_A), async (c) => {
      const r = await c.query('UPDATE tenants SET name = $1 WHERE id = $2', ['hijacked', TENANT_B]);
      return r.rowCount;
    });
    expect(updated).toBe(0);

    const check = await withLegalContext(app, carrierContext(TENANT_B), async (c) => {
      const r = await c.query<{ name: string }>('SELECT name FROM tenants WHERE id = $1', [
        TENANT_B,
      ]);
      return r.rows[0]!.name;
    });
    expect(check).toBe('Tenant B');
  });

  it('denies the application role any DELETE on tenants', async () => {
    await expect(
      withLegalContext(app, carrierContext(TENANT_A), async (c) => {
        await c.query('DELETE FROM tenants WHERE id = $1', [TENANT_A]);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('does not leak context across transactions', async () => {
    await withLegalContext(app, carrierContext(TENANT_A), async (c) => {
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
      withLegalContext(app, carrierContext(TENANT_A), async (c) => {
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
    const isControlPlane = await withLegalContext(app, carrierContext(TENANT_A), async (c) => {
      // Try to fake it via a session variable — the policy checks role membership, not settings.
      await c.query(`SELECT set_config('app.is_control_plane', 'true', true)`);
      const ctx = await currentContext(c);
      return ctx.isControlPlane;
    });
    expect(isControlPlane).toBe(false);
  });

  it('lets the control plane see every tenant', async () => {
    const control = db.connectAs('freightos_control_plane');
    await control.connect();
    try {
      const r = await control.query<{ id: string }>('SELECT id FROM tenants ORDER BY name');
      expect(r.rows.map((x) => x.id)).toEqual([TENANT_A, TENANT_B]);
    } finally {
      await control.end();
    }
  });

  it('forces RLS on the table owner as well', async () => {
    const tables = ['tenants', 'audit_events', 'outbox_events', 'kill_switches'];
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
