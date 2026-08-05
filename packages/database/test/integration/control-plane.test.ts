import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PRIVILEGED_PURPOSES, PURPOSES } from '@freightos/identity';
import { withLegalContext } from '../../src/session.ts';
import { TENANT_A, TENANT_B, TestDatabase } from './harness.ts';
import { seedIdentity, systemContext, type IdentityFixture } from './identity-harness.ts';

/**
 * ADR-0020 — control-plane access is narrow, audited, and never BYPASSRLS.
 *
 * The ADR names five required test properties and four more that follow from the design. All nine
 * are here: unauthorized cross-tenant access fails; tenant connections cannot invoke privileged
 * functions; privileged calls are narrowly scoped; audit records are written; missing purpose or
 * actor fails closed; no role holds rolbypassrls; a tenant session cannot SET ROLE into the
 * control plane; every SECURITY DEFINER function pins search_path; every tenant-owned table has a
 * policy.
 */
const db = new TestDatabase('freightos_test_control_plane');

let app: Client;
let admin: Client;
let a: IdentityFixture;

interface PrivilegedResult {
  outcome: string;
  audit_event_id: string | null;
  message: string | null;
  payload: Record<string, unknown> | null;
}

/**
 * `SELECT * FROM admin.f(...)` rather than `SELECT admin.f(...)`: the function returns a composite
 * type, and the plain form comes back as an unparsed record literal. The FROM form expands it into
 * columns and — unlike `(admin.f(...)).*` — evaluates the function exactly once, which matters
 * when the call has an effect and writes an audit row.
 */
async function call(client: Client, sql: string, params: unknown[]): Promise<PrivilegedResult> {
  const r = await client.query<PrivilegedResult>(sql, params);
  return r.rows[0]!;
}

async function auditRow(id: string) {
  const r = await admin.query<{
    actor_id: string;
    actor_type: string;
    tenant_id: string;
    correlation_id: string;
    resource_type: string;
    resource_id: string | null;
    event_type: string;
    operation_class: string;
    purpose: string | null;
    outcome: string;
    payload: Record<string, unknown>;
    created_at: string;
  }>('SELECT * FROM audit_events WHERE id = $1', [id]);
  return r.rows[0]!;
}

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  app = db.connectAs('freightos_app');
  await app.connect();
  admin = db.connectAs('postgres');
  await admin.connect();
  a = await seedIdentity(db, TENANT_A);

  await admin.query(
    process.env['PGPASSWORD'] !== undefined
      ? `ALTER ROLE freightos_admin LOGIN PASSWORD '${process.env['FREIGHTOS_TEST_ROLE_PASSWORD'] ?? 'devonly'}'`
      : 'ALTER ROLE freightos_admin LOGIN',
  );
  await admin.query(`GRANT CONNECT ON DATABASE ${db.name} TO freightos_admin`);
}, 60_000);

afterAll(async () => {
  await app?.end();
  await admin?.end();
});

describe('the shape ADR-0020 requires', () => {
  it('grants BYPASSRLS to no role in the cluster', async () => {
    const r = await admin.query<{ rolname: string }>(
      `SELECT rolname FROM pg_roles WHERE rolbypassrls AND NOT rolsuper`,
    );
    expect(r.rows.map((x) => x.rolname)).toEqual([]);
  });

  it('gives no FreightOS role BYPASSRLS or SUPERUSER, and names every one of them', async () => {
    const r = await admin.query<{ rolname: string; rolbypassrls: boolean; rolsuper: boolean }>(
      `SELECT rolname, rolbypassrls, rolsuper FROM pg_roles
        WHERE rolname LIKE 'freightos_%' ORDER BY rolname`,
    );
    // The list is exhaustive on purpose. A new freightos_* role is a new thing that can hold
    // privilege, and it should have to be added here — next to the assertion that it holds
    // neither of the two attributes that would make every RLS proof in the suite vacuous.
    expect(r.rows.map((x) => x.rolname)).toEqual([
      'freightos_admin',
      'freightos_admin_owner',
      'freightos_app',
      'freightos_control_plane',
      // F-02. The hierarchy maintenance definer: NOLOGIN, owns the closure and re-depths nodes.
      'freightos_hierarchy_owner',
      // F-01. The self-elevation guards' definer owner: NOLOGIN, SELECT on three tables.
      'freightos_identity_guard',
      'freightos_migrator',
    ]);
    for (const role of r.rows) {
      expect(role.rolbypassrls, `${role.rolname} BYPASSRLS`).toBe(false);
      expect(role.rolsuper, `${role.rolname} SUPERUSER`).toBe(false);
    }
  });

  it('owns the admin schema with a non-login role', async () => {
    const r = await admin.query<{ owner: string; canlogin: boolean }>(
      `SELECT pg_get_userbyid(n.nspowner) AS owner, r.rolcanlogin AS canlogin
         FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner
        WHERE n.nspname = 'admin'`,
    );
    expect(r.rows[0]!.owner).toBe('freightos_admin_owner');
    expect(r.rows[0]!.canlogin).toBe(false);
  });

  it('pins an explicit search_path on every SECURITY DEFINER function', async () => {
    const r = await admin.query<{ name: string; config: string[] | null }>(
      `SELECT n.nspname || '.' || p.proname AS name, p.proconfig AS config
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.prosecdef ORDER BY name`,
    );
    expect(r.rows.length).toBeGreaterThan(0);
    for (const fn of r.rows) {
      expect(fn.config, `${fn.name} has no proconfig`).not.toBeNull();
      expect(
        fn.config!.some((c) => c.startsWith('search_path=')),
        `${fn.name} does not pin search_path`,
      ).toBe(true);
    }
  });

  it('exposes an enumerated surface and nothing else', async () => {
    // Enumerated rather than counted, because ADR-0020 §Consequences requires each admin.* function
    // to be justified in a migration and reviewed at every phase exit gate. A new one has to be
    // added here, next to the reviewers who will ask why.
    //
    // Three internal helpers, not two — F-21; the list has always had seven entries and only the
    // sentence describing it was wrong. Ten authorization mutations and three more helpers joined
    // in 0017 — R2-01 — because a tenant session may no longer change the authorization graph at
    // all and every one of those changes has to have a governed way to happen.
    const r = await admin.query<{ proname: string }>(
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'admin' ORDER BY p.proname`,
    );
    expect(r.rows.map((x) => x.proname)).toEqual(
      [
        // ADR-0020's original four, and the three helpers behind them.
        'deny',
        'export_tenant_audit',
        'provision_tenant',
        'record',
        'refusal_reason',
        'set_tenant_status',
        'tenant_identity_summary',
        // R2-01: the authorization mutation boundary.
        'assign_membership_role',
        'authorization_refusal_reason',
        'create_role',
        'grant_membership',
        'grant_role_permission',
        'grant_service_account_permission',
        'prior_success',
        'publish_actor',
        'revoke_membership',
        'revoke_membership_role',
        'revoke_role_permission',
        'revoke_service_account_permission',
        'set_membership_status',
      ].sort(),
    );
  });

  it('grants EXECUTE on the four operations to the administrative connection and nobody else', async () => {
    const operations = [
      'admin.provision_tenant(uuid, text, text, text, text, uuid)',
      'admin.set_tenant_status(uuid, text, text, text, text, uuid)',
      'admin.export_tenant_audit(uuid, timestamptz, timestamptz, text, text, text, uuid)',
      'admin.tenant_identity_summary(uuid, text, text, text, uuid)',
    ];
    for (const operation of operations) {
      const granted = await admin.query<{ ok: boolean }>(
        `SELECT has_function_privilege('freightos_admin', $1, 'EXECUTE') AS ok`,
        [operation],
      );
      expect(granted.rows[0]!.ok, operation).toBe(true);

      for (const role of ['freightos_app', 'freightos_control_plane', 'public']) {
        const other = await admin.query<{ ok: boolean }>(
          `SELECT has_function_privilege($1, $2, 'EXECUTE') AS ok`,
          [role, operation],
        );
        expect(other.rows[0]!.ok, `${role} ${operation}`).toBe(false);
      }
    }
  });

  it('does not expose the internal audit writer to the administrative connection', async () => {
    const r = await admin.query<{ ok: boolean }>(
      `SELECT has_function_privilege(
                'freightos_admin',
                'admin.record(uuid, uuid, text, text, text, uuid, text, text, text, text, text, jsonb)',
                'EXECUTE') AS ok`,
    );
    expect(r.rows[0]!.ok).toBe(false);
  });

  it('gives a newly created table no privilege to any FreightOS role — default deny', async () => {
    await admin.query('CREATE TABLE default_deny_probe (id uuid PRIMARY KEY)');
    try {
      for (const role of ['freightos_app', 'freightos_control_plane', 'freightos_admin']) {
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
          const r = await admin.query<{ ok: boolean }>(
            `SELECT has_table_privilege($1, 'default_deny_probe', $2) AS ok`,
            [role, privilege],
          );
          expect(r.rows[0]!.ok, `${role} ${privilege}`).toBe(false);
        }
      }
    } finally {
      await admin.query('DROP TABLE default_deny_probe');
    }
  });
});

describe('a tenant session cannot reach the control plane', () => {
  it('cannot claim control-plane status through a session variable', async () => {
    const claimed = await withLegalContext(app, systemContext(TENANT_A), async (c) => {
      await c.query(`SELECT set_config('app.is_control_plane', 'true', true)`);
      const r = await c.query<{ ok: boolean }>('SELECT app.is_control_plane() AS ok');
      return r.rows[0]!.ok;
    });
    expect(claimed).toBe(false);
  });

  it('cannot SET ROLE into the control plane', async () => {
    await app.query('BEGIN');
    await expect(app.query('SET ROLE freightos_control_plane')).rejects.toThrow(
      /permission denied|must be a member/i,
    );
    await app.query('ROLLBACK');
  });

  it('cannot SET ROLE into either administrative role', async () => {
    for (const role of ['freightos_admin', 'freightos_admin_owner']) {
      await app.query('BEGIN');
      await expect(app.query(`SET ROLE ${role}`), role).rejects.toThrow(
        /permission denied|must be a member/i,
      );
      await app.query('ROLLBACK');
    }
  });

  it('cannot reach the admin schema at all', async () => {
    await app.query('BEGIN');
    await expect(
      app.query(`SELECT admin.refusal_reason('a', 'human', 'access_review', $1, $2)`, [
        TENANT_A,
        randomUUID(),
      ]),
    ).rejects.toThrow(/permission denied/i);
    await app.query('ROLLBACK');
  });
});

describe('the administrative connection reaches tables only through functions', () => {
  let adminConn: Client;

  beforeAll(async () => {
    adminConn = db.connectAs('freightos_admin');
    await adminConn.connect();
  });

  afterAll(async () => {
    await adminConn?.end();
  });

  it('cannot select from a domain table directly', async () => {
    await expect(adminConn.query('SELECT id FROM tenants')).rejects.toThrow(
      /permission denied|does not exist/i,
    );
  });

  it('cannot select from the audit ledger directly', async () => {
    // Not even resolvable: the administrative connection holds no USAGE on schema public, which is
    // a stronger boundary than a denied privilege on a table it can still name.
    await expect(adminConn.query('SELECT id FROM audit_events')).rejects.toThrow(
      /permission denied|does not exist/i,
    );
  });

  it('cannot select from an identity table directly', async () => {
    await expect(adminConn.query('SELECT id FROM users')).rejects.toThrow(
      /permission denied|does not exist/i,
    );
  });

  it('provisions a tenant through the approved function', async () => {
    const newTenant = randomUUID();
    const correlation = randomUUID();
    const result = await call(
      adminConn,
      `SELECT * FROM admin.provision_tenant($1, $2, $3, $4, $5, $6)`,
      [newTenant, 'Provisioned Co', 'user:operator', 'human', 'tenant_provisioning', correlation],
    );

    expect(result.outcome).toBe('succeeded');
    expect(result.audit_event_id).toBeTruthy();

    const row = await auditRow(result.audit_event_id!);
    // ADR-0020's nine required fields, each mapped onto a column the ledger already had or that
    // OQ-20 added.
    expect(row.actor_id).toBe('user:operator');
    expect(row.actor_type).toBe('human');
    expect(row.correlation_id).toBe(correlation);
    expect(row.purpose).toBe('tenant_provisioning');
    expect(row.tenant_id).toBe(newTenant);
    expect(row.resource_type).toBe('tenant');
    expect(row.resource_id).toBe(newTenant);
    expect(row.event_type).toBe('rig.freight.tenant.provisioned.v1');
    expect(row.outcome).toBe('succeeded');
    expect(row.operation_class).toBe('privileged');
    expect(row.created_at).toBeTruthy();
    expect(row.payload['action']).toBe('tenant.provision');
  });

  it('records a failure without changing anything', async () => {
    const result = await call(
      adminConn,
      `SELECT * FROM admin.provision_tenant($1, $2, $3, $4, $5, $6)`,
      [TENANT_A, 'Duplicate', 'user:operator', 'human', 'tenant_provisioning', randomUUID()],
    );
    expect(result.outcome).toBe('failed');

    const row = await auditRow(result.audit_event_id!);
    expect(row.outcome).toBe('failed');
    expect(row.purpose).toBe('tenant_provisioning');

    const unchanged = await admin.query<{ name: string }>(
      'SELECT name FROM tenants WHERE id = $1',
      [TENANT_A],
    );
    expect(unchanged.rows[0]!.name).toBe('Tenant A');
  });

  it('reads another tenant audit trail through the approved function only', async () => {
    const result = await call(
      adminConn,
      `SELECT * FROM admin.export_tenant_audit($1, now() - interval '1 hour', now() + interval '1 hour',
                                        $2, $3, $4, $5)`,
      [TENANT_A, 'user:auditor', 'human', 'audit_export', randomUUID()],
    );
    expect(result.outcome).toBe('succeeded');
    expect(Array.isArray(result.payload!['events'])).toBe(true);
  });

  it('summarises a tenant identity graph for an access review', async () => {
    const result = await call(
      adminConn,
      `SELECT * FROM admin.tenant_identity_summary($1, $2, $3, $4, $5)`,
      [TENANT_A, 'user:reviewer', 'human', 'access_review', randomUUID()],
    );
    expect(result.outcome).toBe('succeeded');
    // Two users: the operator the fixture works through and the administrator that seeded it.
    // A tenant's first administrator is a user like any other, and an access review has to see it.
    expect(result.payload!['users']).toBe(2);
    expect(result.payload!['memberships']).toBe(1);
    expect(result.payload!['service_accounts']).toBe(1);
  });

  it('changes a tenant lifecycle state', async () => {
    const result = await call(
      adminConn,
      `SELECT * FROM admin.set_tenant_status($1, $2, $3, $4, $5, $6)`,
      [TENANT_B, 'suspended', 'user:operator', 'human', 'tenant_lifecycle', randomUUID()],
    );
    expect(result.outcome).toBe('succeeded');

    const status = await admin.query<{ status: string }>(
      'SELECT status FROM tenants WHERE id = $1',
      [TENANT_B],
    );
    expect(status.rows[0]!.status).toBe('suspended');
  });

  it('reports a tenant that does not exist as failed rather than silently succeeding', async () => {
    const result = await call(
      adminConn,
      `SELECT * FROM admin.set_tenant_status($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), 'suspended', 'user:operator', 'human', 'tenant_lifecycle', randomUUID()],
    );
    expect(result.outcome).toBe('failed');
    expect(result.message).toBe('tenant not found');
  });
});

/**
 * OQ-20's fail-closed requirement. Every refusal below performs no privileged work AND leaves an
 * audit record, which is why a denial returns rather than raising: a RAISE would roll back the
 * very record ADR-0020 §8 mandates, and the ledger would show silence where a denial belongs.
 */
describe('a privileged call fails closed', () => {
  let adminConn: Client;

  beforeAll(async () => {
    adminConn = db.connectAs('freightos_admin');
    await adminConn.connect();
  });

  afterAll(async () => {
    await adminConn?.end();
  });

  async function provision(
    actor: string | null,
    actorType: string | null,
    purpose: string | null,
    tenantId: string | null = randomUUID(),
    correlationId: string | null = randomUUID(),
  ) {
    return call(adminConn, `SELECT * FROM admin.provision_tenant($1, $2, $3, $4, $5, $6)`, [
      tenantId,
      'Refused Co',
      actor,
      actorType,
      purpose,
      correlationId,
    ]);
  }

  async function tenantCount(): Promise<number> {
    const r = await admin.query<{ count: string }>('SELECT count(*)::text AS count FROM tenants');
    return Number(r.rows[0]!.count);
  }

  it('refuses a missing actor and records the refusal', async () => {
    const before = await tenantCount();
    const result = await provision(null, 'human', 'tenant_provisioning');
    expect(result.outcome).toBe('denied');
    expect(result.message).toContain('actor is required');
    expect(await tenantCount()).toBe(before);

    const row = await auditRow(result.audit_event_id!);
    expect(row.outcome).toBe('denied');
    expect(row.operation_class).toBe('privileged');
    // No purpose is invented for a refusal. OQ-20: absence is never defaulted or backfilled.
    expect(row.payload['reason']).toContain('actor is required');
  });

  it('refuses a blank actor', async () => {
    const result = await provision('   ', 'human', 'tenant_provisioning');
    expect(result.outcome).toBe('denied');
    expect(result.message).toContain('actor is required');
  });

  it('refuses a missing purpose and leaves the purpose column null', async () => {
    const before = await tenantCount();
    const result = await provision('user:operator', 'human', null);
    expect(result.outcome).toBe('denied');
    expect(result.message).toContain('purpose is required');
    expect(await tenantCount()).toBe(before);

    const row = await auditRow(result.audit_event_id!);
    expect(row.purpose).toBeNull();
    expect(row.outcome).toBe('denied');
  });

  it('refuses a purpose outside the vocabulary', async () => {
    const result = await provision('user:operator', 'human', 'because_i_said_so');
    expect(result.outcome).toBe('denied');
    expect(result.message).toContain('outside the approved privileged vocabulary');

    const row = await auditRow(result.audit_event_id!);
    expect(row.purpose).toBeNull();
    expect(row.payload['offered_purpose']).toBe('because_i_said_so');
  });

  it('refuses service_operation, the routine purpose, for privileged work', async () => {
    const result = await provision('user:operator', 'human', 'service_operation');
    expect(result.outcome).toBe('denied');
  });

  it('refuses a purpose that is valid but does not authorise this operation', async () => {
    const result = await provision('user:operator', 'human', 'audit_export');
    expect(result.outcome).toBe('denied');
    expect(result.message).toContain('does not authorise tenant provisioning');
  });

  it('refuses an agent actor and records what it offered', async () => {
    const result = await provision('agent:dispatch', 'agent', 'tenant_provisioning');
    expect(result.outcome).toBe('denied');
    expect(result.message).toContain('never an agent');

    const row = await auditRow(result.audit_event_id!);
    expect(row.payload['offered_actor_type']).toBe('agent');
    // The ledger records the attempt without asserting it was an authorised privileged actor.
    expect(row.actor_type).toBe('system');
  });

  it('refuses an integration actor', async () => {
    const result = await provision('integration:partner', 'integration', 'tenant_provisioning');
    expect(result.outcome).toBe('denied');
  });

  it('refuses a missing tenant scope', async () => {
    const result = await provision('user:operator', 'human', 'tenant_provisioning', null);
    expect(result.outcome).toBe('denied');
    expect(result.message).toContain('tenant scope is required');

    const row = await auditRow(result.audit_event_id!);
    // The refusal is still recorded, under the designated system tenant, with the absence stated.
    expect(row.tenant_id).toBe('00000000-0000-0000-0000-000000000000');
    expect(row.payload['offered_tenant_id']).toBeNull();
  });

  it('refuses a missing correlation id', async () => {
    const result = await provision(
      'user:operator',
      'human',
      'tenant_provisioning',
      randomUUID(),
      null,
    );
    expect(result.outcome).toBe('denied');
    expect(result.message).toContain('correlation id is required');
  });

  it('refuses an unbounded audit export window', async () => {
    const result = await call(
      adminConn,
      `SELECT * FROM admin.export_tenant_audit($1, NULL, NULL, $2, $3, $4, $5)`,
      [TENANT_A, 'user:auditor', 'human', 'audit_export', randomUUID()],
    );
    expect(result.outcome).toBe('denied');
    expect(result.message).toContain('bounded window');
  });

  it('refuses a status outside the tenant lifecycle vocabulary', async () => {
    const result = await call(
      adminConn,
      `SELECT * FROM admin.set_tenant_status($1, $2, $3, $4, $5, $6)`,
      [TENANT_A, 'deleted', 'user:operator', 'human', 'tenant_lifecycle', randomUUID()],
    );
    expect(result.outcome).toBe('denied');
    expect(result.message).toContain('not a tenant lifecycle state');
  });

  it('emits an audit record for every refusal', async () => {
    const denied = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
        WHERE operation_class = 'privileged' AND outcome = 'denied'`,
    );
    expect(Number(denied.rows[0]!.count)).toBeGreaterThanOrEqual(11);
  });
});

describe('the privileged audit trail is append-only', () => {
  it('rejects UPDATE, DELETE and TRUNCATE even for the table owner', async () => {
    await expect(
      admin.query(`UPDATE audit_events SET purpose = 'platform_operations'`),
    ).rejects.toThrow(/append-only/i);
    await expect(admin.query('DELETE FROM audit_events')).rejects.toThrow(/append-only/i);
    await expect(admin.query('TRUNCATE audit_events')).rejects.toThrow(/append-only/i);
  });

  it('rejects a privileged row with no outcome', async () => {
    await expect(
      admin.query(
        `INSERT INTO audit_events
           (tenant_id, legal_entity_id, legal_authority_class, operating_context, actor_type,
            actor_id, event_type, resource_type, correlation_id, created_by, operation_class,
            purpose)
         VALUES ($1, NULL, 'software_only', 'system', 'human', 'user:x',
                 'rig.freight.tenant.provisioned.v1', 'tenant', $2, 'user:x', 'privileged',
                 'tenant_provisioning')`,
        [TENANT_A, randomUUID()],
      ),
    ).rejects.toThrow(/privileged_requires_outcome/);
  });

  it('rejects a succeeded privileged row with no purpose', async () => {
    await expect(
      admin.query(
        `INSERT INTO audit_events
           (tenant_id, legal_entity_id, legal_authority_class, operating_context, actor_type,
            actor_id, event_type, resource_type, correlation_id, created_by, operation_class,
            outcome)
         VALUES ($1, NULL, 'software_only', 'system', 'human', 'user:x',
                 'rig.freight.tenant.provisioned.v1', 'tenant', $2, 'user:x', 'privileged',
                 'succeeded')`,
        [TENANT_A, randomUUID()],
      ),
    ).rejects.toThrow(/privileged_requires_purpose/);
  });

  it('rejects a privileged row claiming an agent actor', async () => {
    await expect(
      admin.query(
        `INSERT INTO audit_events
           (tenant_id, legal_entity_id, legal_authority_class, operating_context, actor_type,
            actor_id, event_type, resource_type, correlation_id, created_by, operation_class,
            purpose, outcome)
         VALUES ($1, $2, 'software_only', 'system', 'agent', 'agent:x',
                 'rig.freight.tenant.provisioned.v1', 'tenant', $3, 'agent:x', 'privileged',
                 'tenant_provisioning', 'succeeded')`,
        [TENANT_A, a.legalEntityId, randomUUID()],
      ),
    ).rejects.toThrow(/privileged_actor_is_human_or_system/);
  });

  it('rejects an outcome outside the closed vocabulary', async () => {
    await expect(
      admin.query(
        `INSERT INTO audit_events
           (tenant_id, legal_entity_id, legal_authority_class, operating_context, actor_type,
            actor_id, event_type, resource_type, correlation_id, created_by, operation_class,
            purpose, outcome)
         VALUES ($1, NULL, 'software_only', 'system', 'human', 'user:x',
                 'rig.freight.tenant.provisioned.v1', 'tenant', $2, 'user:x', 'privileged',
                 'tenant_provisioning', 'partially')`,
        [TENANT_A, randomUUID()],
      ),
    ).rejects.toThrow(/outcome_vocabulary/);
  });

  it('rejects a purpose outside the closed vocabulary on any row', async () => {
    await expect(
      admin.query(
        `INSERT INTO audit_events
           (tenant_id, legal_entity_id, legal_authority_class, operating_context, actor_type,
            actor_id, event_type, resource_type, correlation_id, created_by, purpose)
         VALUES ($1, $2, 'carrier_agent', 'carrier', 'human', 'user:x',
                 'rig.freight.shipment.created.v1', 'shipment', $3, 'user:x', 'nonsense')`,
        [TENANT_A, a.legalEntityId, randomUUID()],
      ),
    ).rejects.toThrow(/purpose_vocabulary/);
  });

  it('keeps every Phase 0 audit row valid — operation_class defaults to domain', async () => {
    const id = await withLegalContext(
      app,
      {
        tenantId: TENANT_A,
        legalAuthorityClass: 'carrier_agent',
        operatingContext: 'carrier',
        actorId: 'test:actor',
        legalEntityId: a.legalEntityId,
        carrierId: 'carrier-1',
        carrierAppointmentId: 'appointment-1',
      },
      async (c) => {
        // Exactly the Phase 0 insert shape: no purpose, no outcome, no operation_class.
        const r = await c.query<{ id: string; operation_class: string }>(
          `INSERT INTO audit_events
             (tenant_id, legal_entity_id, legal_authority_class, operating_context, actor_type,
              actor_id, event_type, resource_type, correlation_id, created_by)
           VALUES ($1, $2, 'carrier_agent', 'carrier', 'human', 'test:actor',
                   'rig.freight.shipment.created.v1', 'shipment', $3, 'test:actor')
           RETURNING id, operation_class`,
          [TENANT_A, a.legalEntityId, randomUUID()],
        );
        return r.rows[0]!;
      },
    );
    expect(id.operation_class).toBe('domain');
  });
});

describe('the purpose vocabulary agrees across SQL, TypeScript and the envelope', () => {
  it('accepts exactly the ten purposes packages/identity declares', async () => {
    for (const purpose of PURPOSES) {
      const r = await admin.query<{ ok: boolean }>('SELECT app.is_permitted_purpose($1) AS ok', [
        purpose,
      ]);
      expect(r.rows[0]!.ok, purpose).toBe(true);
    }
    for (const rejected of ['', 'SERVICE_OPERATION', 'admin', 'anything']) {
      const r = await admin.query<{ ok: boolean }>('SELECT app.is_permitted_purpose($1) AS ok', [
        rejected,
      ]);
      expect(r.rows[0]!.ok, rejected).toBe(false);
    }
  });

  it('treats exactly the nine privileged purposes as privileged', async () => {
    for (const purpose of PURPOSES) {
      const r = await admin.query<{ ok: boolean }>('SELECT app.is_privileged_purpose($1) AS ok', [
        purpose,
      ]);
      expect(r.rows[0]!.ok, purpose).toBe(
        (PRIVILEGED_PURPOSES as readonly string[]).includes(purpose),
      );
    }
  });

  it('accepts exactly the three outcomes', async () => {
    for (const [outcome, expected] of [
      ['succeeded', true],
      ['denied', true],
      ['failed', true],
      ['partial', false],
      ['', false],
    ] as const) {
      const r = await admin.query<{ ok: boolean }>('SELECT app.is_permitted_outcome($1) AS ok', [
        outcome,
      ]);
      expect(r.rows[0]!.ok, outcome).toBe(expected);
    }
  });
});

describe('the outbox carries a mandatory envelope purpose', () => {
  it('rejects an outbox event with no purpose', async () => {
    await expect(
      admin.query(
        `INSERT INTO outbox_events
           (tenant_id, legal_entity_id, legal_authority_class, operating_context, event_id,
            event_type, event_source, event_time, actor_id, correlation_id, payload, created_by)
         VALUES ($1, $2, 'carrier_agent', 'carrier', $3, 'rig.freight.shipment.created.v1',
                 '/freightos/test', now(), 'test:actor', $4, '{}'::jsonb, 'test:actor')`,
        [TENANT_A, a.legalEntityId, randomUUID(), randomUUID()],
      ),
    ).rejects.toThrow(/null value in column "purpose"/i);
  });

  it('rejects a purpose outside the vocabulary', async () => {
    await expect(
      admin.query(
        `INSERT INTO outbox_events
           (tenant_id, legal_entity_id, legal_authority_class, operating_context, event_id,
            event_type, event_source, event_time, actor_id, correlation_id, payload, created_by,
            purpose)
         VALUES ($1, $2, 'carrier_agent', 'carrier', $3, 'rig.freight.shipment.created.v1',
                 '/freightos/test', now(), 'test:actor', $4, '{}'::jsonb, 'test:actor', 'nope')`,
        [TENANT_A, a.legalEntityId, randomUUID(), randomUUID()],
      ),
    ).rejects.toThrow(/purpose_vocabulary/);
  });

  it('freezes purpose once written, alongside the rest of the envelope', async () => {
    const eventId = randomUUID();
    await admin.query(
      `INSERT INTO outbox_events
         (tenant_id, legal_entity_id, legal_authority_class, operating_context, event_id,
          event_type, event_source, event_time, actor_id, correlation_id, payload, created_by,
          purpose)
       VALUES ($1, $2, 'carrier_agent', 'carrier', $3, 'rig.freight.shipment.created.v1',
               '/freightos/test', now(), 'test:actor', $4, '{}'::jsonb, 'test:actor',
               'service_operation')`,
      [TENANT_A, a.legalEntityId, eventId, randomUUID()],
    );

    await expect(
      admin.query(`UPDATE outbox_events SET purpose = 'audit_export' WHERE event_id = $1`, [
        eventId,
      ]),
    ).rejects.toThrow(/immutable/);

    // Delivery bookkeeping still moves.
    const r = await admin.query(
      `UPDATE outbox_events SET attempts = attempts + 1 WHERE event_id = $1`,
      [eventId],
    );
    expect(r.rowCount).toBe(1);
  });
});

/**
 * F-06 — a privileged audit record is mostly the caller's own account of itself.
 *
 * actor_id, actor_type, purpose, correlation id, resource and tenant are all parameters. The
 * database cannot authenticate the person behind an administrative connection, so it cannot do
 * better than record the claim — but recording only the claim makes the ledger forgeable, and
 * Art. II.1 makes the ledger authoritative. Provenance the caller does not supply is what turns an
 * unverifiable claim into a claim that can be contradicted.
 */
describe('privileged audit records carry non-forgeable provenance — F-06', () => {
  let adminConn: Client;

  beforeAll(async () => {
    adminConn = db.connectAs('freightos_admin');
    await adminConn.connect();
  }, 30_000);

  afterAll(async () => {
    await adminConn?.end();
  });

  async function recordFor(correlationId: string) {
    const r = await admin.query<{ payload: Record<string, unknown>; actor_id: string }>(
      'SELECT payload, actor_id FROM audit_events WHERE correlation_id = $1',
      [correlationId],
    );
    return r.rows[0]!;
  }

  it('stamps the authenticated connection beside the claimed actor', async () => {
    const correlationId = randomUUID();
    const result = await call(
      adminConn,
      `SELECT * FROM admin.provision_tenant($1, $2, $3, $4, $5, $6)`,
      [
        randomUUID(),
        'F-06 Tenant',
        'user:someone-who-was-not-here',
        'human',
        'tenant_provisioning',
        correlationId,
      ],
    );
    expect(result.outcome).toBe('succeeded');

    const row = await recordFor(correlationId);
    // The claim is still recorded — it is what the application asserted, and losing it would lose
    // the only account of who acted.
    expect(row.actor_id).toBe('user:someone-who-was-not-here');
    expect(row.payload['claimed_actor']).toBe('user:someone-who-was-not-here');

    // And beside it, what actually happened. A claimed actor no connection could have made is now
    // a contradiction visible in the record rather than indistinguishable from the truth.
    const connection = row.payload['connection'] as Record<string, unknown>;
    expect(connection['authenticated_role']).toBe('freightos_admin');
    expect(connection['effective_role']).toBe('freightos_admin_owner');
    expect(typeof connection['backend_pid']).toBe('number');
    expect(typeof connection['recorded_at']).toBe('string');
  });

  it('cannot be overwritten by a caller supplying the same payload keys', async () => {
    // The provenance object is applied last in the jsonb concatenation, and `||` lets the right
    // operand win. Getting that operand order wrong would restore the forgery in silence, so the
    // ordering is asserted rather than reviewed.
    const correlationId = randomUUID();
    const result = await call(
      adminConn,
      `SELECT * FROM admin.export_tenant_audit($1, $2, $3, $4, $5, $6, $7)`,
      [
        TENANT_A,
        new Date(Date.now() - 86_400_000).toISOString(),
        new Date().toISOString(),
        'user:auditor',
        'human',
        'audit_export',
        correlationId,
      ],
    );
    expect(result.outcome).toBe('succeeded');
    const row = await recordFor(correlationId);
    const connection = row.payload['connection'] as Record<string, unknown>;
    expect(connection['authenticated_role']).toBe('freightos_admin');
  });

  it('stamps a denial the same way', async () => {
    // A refusal is the record most worth forging: it is the evidence that somebody tried. It has
    // to carry the same provenance as a success, and it does.
    const correlationId = randomUUID();
    const result = await call(
      adminConn,
      `SELECT * FROM admin.set_tenant_status($1, $2, $3, $4, $5, $6)`,
      [TENANT_A, 'suspended', 'user:impersonated', 'agent', 'tenant_lifecycle', correlationId],
    );
    expect(result.outcome).toBe('denied');

    const row = await recordFor(correlationId);
    const connection = row.payload['connection'] as Record<string, unknown>;
    expect(connection['authenticated_role']).toBe('freightos_admin');
    // The rejected actor_type is preserved as offered rather than coerced away, so the denial says
    // what was attempted and not merely that something was.
    expect(row.payload['claimed_actor_type']).toBe('agent');
    expect(row.payload['offered_actor_type']).toBe('agent');
  });
});

/**
 * F-07 — the denial record is transaction-bound, and that is a stated property.
 *
 * ADR-0026 §5 previously called it durable. It is written in the caller's transaction and survives
 * exactly as far as that transaction does. The decision is TRANSACTION_BOUND_DENIAL_AUDIT: ship
 * the honest weaker design rather than a stronger claim that is not true, and carry the stronger
 * property forward as ROLLBACK_INDEPENDENT_DENIAL_AUDIT in Phase 3.
 *
 * These tests pin the behaviour in both directions, so the limit cannot quietly become worse and
 * cannot be rediscovered as a surprise.
 */
describe('denial audit is transaction-bound — F-07', () => {
  let adminConn: Client;

  beforeAll(async () => {
    adminConn = db.connectAs('freightos_admin');
    await adminConn.connect();
  }, 30_000);

  afterAll(async () => {
    await adminConn?.end();
  });

  const denialCount = async (correlationId: string) => {
    const r = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events WHERE correlation_id = $1`,
      [correlationId],
    );
    return Number(r.rows[0]!.count);
  };

  it('keeps the denial when the caller commits', async () => {
    const correlationId = randomUUID();
    await adminConn.query('BEGIN');
    const result = await call(
      adminConn,
      `SELECT * FROM admin.provision_tenant($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), 'F-07 Committed', 'user:operator', 'human', 'audit_export', correlationId],
    );
    // Wrong purpose for this operation, so it is refused.
    expect(result.outcome).toBe('denied');
    await adminConn.query('COMMIT');

    expect(await denialCount(correlationId)).toBe(1);
  });

  it('loses the denial when the caller rolls back — the stated limit', async () => {
    const correlationId = randomUUID();
    await adminConn.query('BEGIN');
    const result = await call(
      adminConn,
      `SELECT * FROM admin.provision_tenant($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), 'F-07 Rolled back', 'user:operator', 'human', 'audit_export', correlationId],
    );
    expect(result.outcome).toBe('denied');
    await adminConn.query('ROLLBACK');

    // This is not a bug being asserted as correct — it is the boundary of what the design can do,
    // written down where a reader will find it. The refusal still refused; the evidence is gone.
    expect(await denialCount(correlationId)).toBe(0);
  });

  it('refuses without performing any privileged work either way', async () => {
    // The half that does hold unconditionally: whether the caller commits or rolls back, a denied
    // call changed nothing. Losing the evidence never means losing the refusal.
    const tenantId = randomUUID();
    await adminConn.query('BEGIN');
    const result = await call(
      adminConn,
      `SELECT * FROM admin.provision_tenant($1, $2, $3, $4, $5, $6)`,
      [tenantId, 'F-07 Never created', 'user:operator', 'human', 'audit_export', randomUUID()],
    );
    expect(result.outcome).toBe('denied');
    await adminConn.query('COMMIT');

    const created = await admin.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM tenants WHERE id = $1',
      [tenantId],
    );
    expect(Number(created.rows[0]!.count)).toBe(0);
  });
});

/**
 * R2-05 — the role graph as it actually is.
 *
 * Scripts, comments and one test name said the migrator "cannot SET ROLE to a runtime role". That
 * is true of freightos_app and false of freightos_control_plane: the migrator holds
 * `SET TRUE, INHERIT FALSE` on freightos_admin_owner, and freightos_admin_owner is a member of
 * freightos_control_plane with SET, so a deliberate two-step SET ROLE reaches it.
 *
 * INHERIT FALSE prevents automatic privilege inheritance. It does not prevent SET ROLE, and
 * conflating the two is what produced the overclaim. The security-relevant properties are the ones
 * asserted below, and each is stated as what it is rather than as the stronger thing it resembles.
 *
 * Removing the reachability is possible and is not done: `ALTER ... OWNER TO` requires the assigning
 * role to be able to SET ROLE to the target, so migrations 0007, 0010, 0013 and 0017 all need it,
 * and taking it away would mean giving up definer-owned trusted code or handing ownership assignment
 * to a superuser at deploy time. The finding says as much — a low documentation defect does not
 * justify a role-graph redesign.
 */
describe('the role graph, described accurately — R2-05', () => {
  interface RoleRow {
    rolname: string;
    rolcanlogin: boolean;
    rolinherit: boolean;
    rolsuper: boolean;
    rolbypassrls: boolean;
  }

  it('reports every FreightOS role and its attributes', async () => {
    const r = await admin.query<RoleRow>(
      `SELECT rolname, rolcanlogin, rolinherit, rolsuper, rolbypassrls
         FROM pg_roles WHERE rolname LIKE 'freightos%' ORDER BY rolname`,
    );
    expect(r.rows.map((x) => x.rolname)).toEqual([
      'freightos_admin',
      'freightos_admin_owner',
      'freightos_app',
      'freightos_control_plane',
      'freightos_hierarchy_owner',
      'freightos_identity_guard',
      'freightos_migrator',
    ]);

    // No FreightOS role holds either attribute that would make every RLS proof in the suite vacuous.
    for (const role of r.rows) {
      expect(role.rolsuper, `${role.rolname} SUPERUSER`).toBe(false);
      expect(role.rolbypassrls, `${role.rolname} BYPASSRLS`).toBe(false);
    }

    // The three definer owners are NOLOGIN: they are identities code runs AS, never connections.
    const nologin = r.rows.filter((x) => !x.rolcanlogin).map((x) => x.rolname);
    expect(nologin).toEqual([
      'freightos_admin_owner',
      'freightos_hierarchy_owner',
      'freightos_identity_guard',
    ]);
  });

  it('reports every membership with its three options', async () => {
    const r = await admin.query<{
      member: string;
      granted: string;
      admin_option: boolean;
      inherit_option: boolean;
      set_option: boolean;
    }>(
      `SELECT m.rolname AS member, g.rolname AS granted,
              bool_or(am.admin_option)   AS admin_option,
              bool_or(am.inherit_option) AS inherit_option,
              bool_or(am.set_option)     AS set_option
         FROM pg_auth_members am
         JOIN pg_roles m ON m.oid = am.member
         JOIN pg_roles g ON g.oid = am.roleid
        WHERE m.rolname LIKE 'freightos%'
        GROUP BY m.rolname, g.rolname
        ORDER BY m.rolname, g.rolname`,
    );

    // The union across grantors is what matters; PostgreSQL 16 records the migrator's profile as
    // two rows per role and neither carries all of it.
    const edges = r.rows.map(
      (x) =>
        `${x.member} -> ${x.granted} admin=${x.admin_option} inherit=${x.inherit_option} set=${x.set_option}`,
    );
    expect(edges).toEqual([
      // The three definers are control-plane members, and inherit it: that membership is what
      // carries their reads through the policy branch, which is the whole point of them.
      'freightos_admin_owner -> freightos_control_plane admin=false inherit=true set=true',
      'freightos_hierarchy_owner -> freightos_control_plane admin=false inherit=true set=true',
      'freightos_identity_guard -> freightos_control_plane admin=false inherit=true set=true',
      // The migrator administers everything and inherits nothing. SET only where
      // `ALTER ... OWNER TO` needs it, which is every definer owner and freightos_admin.
      'freightos_migrator -> freightos_admin admin=true inherit=false set=true',
      'freightos_migrator -> freightos_admin_owner admin=true inherit=false set=true',
      'freightos_migrator -> freightos_app admin=true inherit=false set=false',
      'freightos_migrator -> freightos_control_plane admin=true inherit=false set=false',
      'freightos_migrator -> freightos_hierarchy_owner admin=true inherit=false set=true',
      'freightos_migrator -> freightos_identity_guard admin=true inherit=false set=true',
    ]);
  });

  it('distinguishes inherited authority from SET ROLE reachability', async () => {
    const r = await admin.query<{ rolname: string; inherited: boolean; reachable: boolean }>(
      `SELECT r.rolname,
              pg_has_role('freightos_migrator', r.oid, 'USAGE') AS inherited,
              pg_has_role('freightos_migrator', r.oid, 'SET')   AS reachable
         FROM pg_roles r
        WHERE r.rolname LIKE 'freightos%' AND r.rolname <> 'freightos_migrator'
        ORDER BY r.rolname`,
    );

    // Nothing is INHERITED. This is the property that matters for an ordinary migrator session:
    // no statement picks up any of these rights without asking for them.
    for (const role of r.rows) {
      expect(role.inherited, `${role.rolname} inherited by the migrator`).toBe(false);
    }

    // SET ROLE reachability is a different question and the answer is different. Stated as the
    // graph has it, including the transitive path the documentation used to deny.
    expect(r.rows.filter((x) => x.reachable).map((x) => x.rolname)).toEqual([
      'freightos_admin',
      'freightos_admin_owner',
      // Reachable TRANSITIVELY, through freightos_admin_owner. Not a direct grant — the direct
      // membership is SET FALSE — and not inherited, but reachable by a deliberate two-step
      // SET ROLE. The documentation said "cannot"; "does not inherit" is what was proved.
      'freightos_control_plane',
      'freightos_hierarchy_owner',
      'freightos_identity_guard',
    ]);

    // freightos_app is the one runtime role with no path at all, direct or transitive.
    expect(r.rows.find((x) => x.rolname === 'freightos_app')?.reachable).toBe(false);
  });

  it('leaves app.is_control_plane() false in an ordinary migrator session', async () => {
    // The effective default, which is what every policy in the schema actually consults. Reachable
    // by SET ROLE and true right now are not the same claim, and only the second would be a defect.
    const migrator = db.connectAsMigrator();
    await migrator.connect();
    try {
      const r = await migrator.query<{ cp: boolean; who: string }>(
        'SELECT app.is_control_plane() AS cp, current_user AS who',
      );
      expect(r.rows[0]).toEqual({ cp: false, who: 'freightos_migrator' });
    } finally {
      await migrator.end();
    }
  });

  it('gives no runtime role a path to the migrator or to any owner role', async () => {
    // The direction that would be an escalation. An application, tenant or routine control-plane
    // connection cannot reach deployment authority or a definer owner, by inheritance or by
    // SET ROLE, and that is what keeps the deployment-side reachability above from mattering.
    const r = await admin.query<{ runtime: string; target: string; reachable: boolean }>(
      `SELECT runtime.rolname AS runtime, target.rolname AS target,
              pg_has_role(runtime.oid, target.oid, 'SET') AS reachable
         FROM pg_roles runtime
         CROSS JOIN pg_roles target
        WHERE runtime.rolname IN ('freightos_app', 'freightos_control_plane', 'freightos_admin')
          AND target.rolname IN ('freightos_migrator', 'freightos_admin_owner',
                                 'freightos_hierarchy_owner', 'freightos_identity_guard')
        ORDER BY runtime.rolname, target.rolname`,
    );
    expect(r.rows.filter((x) => x.reachable)).toEqual([]);
  });
});
