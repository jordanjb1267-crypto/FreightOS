import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PRIVILEGED_PURPOSES, PURPOSES } from '@freightos/identity';
import { withLegalContext } from '../../src/session.ts';
import { TENANT_A, TENANT_B, TestDatabase } from './harness.ts';
import {
  connectAsProvisioner,
  seedIdentity,
  systemContext,
  type IdentityFixture,
} from './identity-harness.ts';

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

  // Through the harness rather than by hand. `ALTER ROLE` mutates pg_authid, which is
  // CLUSTER-WIDE, so issuing it directly here ran a role mutation outside the cluster role lock —
  // the same unserialised class of write as the one that produced the migrator/owner race, and the
  // exact thing `grantTestRoleLogin` documents itself as existing to prevent. It is also the
  // password-safe path: a hand-rolled `ALTER ROLE ... LOGIN` drops the credential under the
  // password auth CI uses and fails only there.
  await db.grantTestRoleLogin();
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
      // 0018 §1. The audit write definer: NOLOGIN, and deliberately NOT a control-plane member —
      // it inserts its own tenant's rows through the existing isolation policy and has no use for
      // an RLS bypass.
      'freightos_audit_writer',
      // SR-2 / 0020 §1. The session-binding definer owner: NOLOGIN, owns app.session_binding and
      // the five authoritative accessors, and deliberately NOT a control-plane member — the
      // bootstrap policies must be satisfied by its own role-disjoint path rather than by the
      // control-plane disjunct of the policies that survive.
      'freightos_binding_owner',
      'freightos_control_plane',
      // N6 / 0034 §2. The delivery runtime, added here deliberately as this list demands. It is a
      // LOGIN identity that can hold privilege, and it is NOT a control-plane member — it executes
      // an already-authorized disclosure and holds no authority to create one. This list gaining a
      // row must never be read as this role gaining reach; the membership graph below is what
      // proves it did not.
      'freightos_delivery_worker',
      // N3 / 0029 §1. The network event journal writer: the one role here that LOGS IN and owns
      // nothing. PostgreSQL cannot evaluate JSON Schema, so payload conformance can only be
      // established in the acceptance component — and the journal is permanently immutable, which
      // makes a schema-invalid row uncorrectable rather than fixable. So `freightos_app` holds no
      // INSERT on it and this credential does, with NOBYPASSRLS and no membership anywhere.
      'freightos_event_writer',
      // F-02. The hierarchy maintenance definer: NOLOGIN, owns the closure and re-depths nodes.
      'freightos_hierarchy_owner',
      // F-01. The self-elevation guards' definer owner: NOLOGIN, SELECT on three tables.
      'freightos_identity_guard',
      'freightos_migrator',
      // SEC-01 / 0026 §1. The operator-binding registry owner: NOLOGIN, owns schema authn and the
      // table that maps an authenticated login to a FreightOS principal. Deliberately NOT
      // freightos_admin_owner and deliberately NOT a control-plane member — the registry decides
      // who the administrative definers believe they are talking to, so owning it with the same
      // role that owns those definers would put the answer inside the authority it constrains.
      'freightos_operator_registry_owner',
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
        // 0018: authority provenance hardening. `claim_operation` is the idempotency claim the
        // boundary writes in the same transaction as the work — the ledger no longer decides
        // whether an operation already happened. `move_organization_node` is the governed way to
        // reparent, added because 0018 §6 took UPDATE (parent_id) away from freightos_app:
        // moving a node rewrites the closure and therefore changes who has authority over what.
        'claim_operation',
        'move_organization_node',
        // SR-2 / 0020 §7: the trusted mint boundary. It records that something already holding
        // control-plane credentials asserted an authentication result, and independently verifies
        // that an active membership (human) or the account's own scope (service) justifies the
        // requested tenant and node. It authenticates nobody.
        'issue_session_binding',
      ].sort(),
    );
  });

  it('grants EXECUTE on the four operations to the administrative connection and nobody else', async () => {
    // SEC-01 / 0026 §6. Two arguments shorter than they were: `p_actor text, p_actor_type text`
    // are gone from every signature. Naming the signatures literally is what makes that visible —
    // if a pre-0026 overload were ever restored, these lookups would resolve to it and the test
    // would keep passing while the vulnerable function sat beside the safe one.
    const operations = [
      'admin.provision_tenant(uuid, text, text, uuid)',
      'admin.set_tenant_status(uuid, text, text, uuid)',
      'admin.export_tenant_audit(uuid, timestamptz, timestamptz, text, uuid)',
      'admin.tenant_identity_summary(uuid, text, uuid)',
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

/**
 * SEC-01 / 0026. Two connections, and the difference between them is the finding.
 *
 * `adminConn` is the shared `freightos_admin` credential. It still holds EXECUTE on all sixteen
 * entry points and still cannot read a single table directly — that half of ADR-0020 is unchanged,
 * and the first three cases below are the same tests they always were.
 *
 * `operatorConn` is a per-operator PostgreSQL login bound to a real FreightOS principal, and it is
 * what performs the work. Before 0026 the shared credential could do all of this while naming any
 * human it liked; now the identity is resolved from `session_user` and the shared credential
 * resolves to a SERVICE, which is why `admin.provision_tenant` over it produces
 * `actor_type = 'system'` rather than whatever the caller asked for.
 */
describe('the administrative connection reaches tables only through functions', () => {
  let adminConn: Client;
  let operatorConn: Client;

  beforeAll(async () => {
    adminConn = db.connectAs('freightos_admin');
    await adminConn.connect();
    operatorConn = await connectAsProvisioner(db);
  }, 60_000);

  afterAll(async () => {
    await adminConn?.end();
    await operatorConn?.end();
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
      operatorConn,
      `SELECT * FROM admin.provision_tenant($1, $2, $3, $4)`,
      [newTenant, 'Provisioned Co', 'tenant_provisioning', correlation],
    );

    expect(result.outcome).toBe('succeeded');
    expect(result.audit_event_id).toBeTruthy();

    const row = await auditRow(result.audit_event_id!);
    // ADR-0020's nine required fields, each mapped onto a column the ledger already had or that
    // OQ-20 added. SEC-01: actor_id and actor_type are no longer among the arguments — they are
    // resolved from the authenticated login, so what is asserted here is that the ledger names the
    // principal this connection is BOUND to and not one it asked for.
    expect(row.actor_id).toBe('system:tenant-provisioning');
    expect(row.actor_type).toBe('system');
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
      operatorConn,
      `SELECT * FROM admin.provision_tenant($1, $2, $3, $4)`,
      [TENANT_A, 'Duplicate', 'tenant_provisioning', randomUUID()],
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
      operatorConn,
      `SELECT * FROM admin.export_tenant_audit($1, now() - interval '1 hour', now() + interval '1 hour',
                                        $2, $3)`,
      [TENANT_A, 'audit_export', randomUUID()],
    );
    expect(result.outcome).toBe('succeeded');
    expect(Array.isArray(result.payload!['events'])).toBe(true);
  });

  it('summarises a tenant identity graph for an access review', async () => {
    const result = await call(
      operatorConn,
      `SELECT * FROM admin.tenant_identity_summary($1, $2, $3)`,
      [TENANT_A, 'access_review', randomUUID()],
    );
    expect(result.outcome).toBe('succeeded');
    // Two users: the operator the fixture works through and the administrator that seeded it.
    // A tenant's first administrator is a user like any other, and an access review has to see it.
    expect(result.payload!['users']).toBe(2);
    // Two memberships, one per user. The administrator holds its own now — 0018 §3 resolves an
    // administrator's authority through the same membership → role → permission chain as anybody
    // else, so an administrator without a membership would simply be unauthorized. An access
    // review that could not see the administrator's own grant would be describing the wrong tenant.
    expect(result.payload!['memberships']).toBe(2);
    expect(result.payload!['service_accounts']).toBe(1);
  });

  it('changes a tenant lifecycle state', async () => {
    const result = await call(
      operatorConn,
      `SELECT * FROM admin.set_tenant_status($1, $2, $3, $4)`,
      [TENANT_B, 'suspended', 'tenant_lifecycle', randomUUID()],
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
      operatorConn,
      `SELECT * FROM admin.set_tenant_status($1, $2, $3, $4)`,
      [randomUUID(), 'suspended', 'tenant_lifecycle', randomUUID()],
    );
    expect(result.outcome).toBe('failed');
    expect(result.message).toBe('tenant not found');
  });

  it('refuses the same work over the shared credential with no principal behind it', async () => {
    // The positive control for this whole block, and the finding restated: `adminConn` is the
    // credential the original exploit ran over. It reaches the function — asserted above — and it
    // is a bound SERVICE, so it CAN provision. What it can no longer do is claim to be a person.
    const correlationId = randomUUID();
    const result = await call(adminConn, `SELECT * FROM admin.provision_tenant($1, $2, $3, $4)`, [
      randomUUID(),
      'Shared Credential Co',
      'tenant_provisioning',
      correlationId,
    ]);
    const row = await admin.query<{ actor_id: string; actor_type: string }>(
      'SELECT actor_id, actor_type FROM audit_events WHERE correlation_id = $1',
      [correlationId],
    );
    expect(result.outcome, result.message ?? '').toBe('succeeded');
    expect(row.rows[0]!.actor_type, 'the shared credential produced human provenance').toBe(
      'system',
    );
    expect(row.rows[0]!.actor_id).toBe('system:session-binding-issuer');
  });
});

/**
 * OQ-20's fail-closed requirement. Every refusal below performs no privileged work AND leaves an
 * audit record, which is why a denial returns rather than raising: a RAISE would roll back the
 * very record ADR-0020 §8 mandates, and the ledger would show silence where a denial belongs.
 */
describe('a privileged call fails closed', () => {
  let operatorConn: Client;

  beforeAll(async () => {
    operatorConn = await connectAsProvisioner(db);
  }, 60_000);

  afterAll(async () => {
    await operatorConn?.end();
  });

  async function provision(
    purpose: string | null,
    tenantId: string | null = randomUUID(),
    correlationId: string | null = randomUUID(),
  ) {
    return call(operatorConn, `SELECT * FROM admin.provision_tenant($1, $2, $3, $4)`, [
      tenantId,
      'Refused Co',
      purpose,
      correlationId,
    ]);
  }

  async function tenantCount(): Promise<number> {
    const r = await admin.query<{ count: string }>('SELECT count(*)::text AS count FROM tenants');
    return Number(r.rows[0]!.count);
  }

  it('refuses a missing purpose and leaves the purpose column null', async () => {
    const before = await tenantCount();
    const result = await provision(null);
    expect(result.outcome).toBe('denied');
    expect(result.message).toContain('purpose is required');
    expect(await tenantCount()).toBe(before);

    const row = await auditRow(result.audit_event_id!);
    expect(row.purpose).toBeNull();
    expect(row.outcome).toBe('denied');
    expect(row.operation_class).toBe('privileged');
    // No purpose is invented for a refusal. OQ-20: absence is never defaulted or backfilled.
    expect(row.payload['reason']).toContain('purpose is required');
  });

  it('refuses a purpose outside the vocabulary', async () => {
    const result = await provision('because_i_said_so');
    expect(result.outcome).toBe('denied');
    expect(result.message).toContain('outside the approved privileged vocabulary');

    const row = await auditRow(result.audit_event_id!);
    expect(row.purpose).toBeNull();
    expect(row.payload['offered_purpose']).toBe('because_i_said_so');
  });

  it('refuses service_operation, the routine purpose, for privileged work', async () => {
    const result = await provision('service_operation');
    expect(result.outcome).toBe('denied');
  });

  it('refuses a purpose that is valid but does not authorise this operation', async () => {
    const result = await provision('audit_export');
    expect(result.outcome).toBe('denied');
    expect(result.message).toContain('does not authorise tenant provisioning');
  });

  it('refuses a missing tenant scope', async () => {
    const result = await provision('tenant_provisioning', null);
    expect(result.outcome).toBe('denied');
    expect(result.message).toContain('tenant scope is required');

    const row = await auditRow(result.audit_event_id!);
    // The refusal is still recorded, under the designated system tenant, with the absence stated.
    expect(row.tenant_id).toBe('00000000-0000-0000-0000-000000000000');
    expect(row.payload['offered_tenant_id']).toBeNull();
  });

  it('refuses a missing correlation id', async () => {
    const result = await provision('tenant_provisioning', randomUUID(), null);
    expect(result.outcome).toBe('denied');
    expect(result.message).toContain('correlation id is required');
  });

  it('refuses an unbounded audit export window', async () => {
    const result = await call(
      operatorConn,
      `SELECT * FROM admin.export_tenant_audit($1, NULL, NULL, $2, $3)`,
      [TENANT_A, 'audit_export', randomUUID()],
    );
    expect(result.outcome).toBe('denied');
    expect(result.message).toContain('bounded window');
  });

  it('refuses a status outside the tenant lifecycle vocabulary', async () => {
    const result = await call(
      operatorConn,
      `SELECT * FROM admin.set_tenant_status($1, $2, $3, $4)`,
      [TENANT_A, 'deleted', 'tenant_lifecycle', randomUUID()],
    );
    expect(result.outcome).toBe('denied');
    expect(result.message).toContain('not a tenant lifecycle state');
  });

  it('emits an audit record for every refusal', async () => {
    const denied = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
        WHERE operation_class = 'privileged' AND outcome = 'denied'`,
    );
    expect(Number(denied.rows[0]!.count)).toBeGreaterThanOrEqual(8);
  });
});

/**
 * SEC-01 / 0026 — where the four actor refusals went.
 *
 * This block used to hold four more cases: a missing actor, a blank actor, an agent actor and an
 * integration actor, each passed as `p_actor` / `p_actor_type` and each refused with an audit row.
 * Those arguments no longer exist, so the four attacks cannot be expressed against the boundary at
 * all — a stronger outcome than refusing them, and the reason they are not simply deleted here.
 *
 * Each property is re-asserted at the layer where it still has meaning:
 *
 *   missing / blank actor  → an UNBOUND authenticated login cannot act. The refusal moved upstream
 *                            and became a raise rather than a denial, because there is no longer a
 *                            principal to attribute a denial record to. Case G of
 *                            `sr2-authenticated-principal-matrix.test.ts` owns the full version;
 *                            the case below is the control-plane-shaped restatement.
 *   agent / integration    → the resolver returns `human` or `system` and nothing else, so no
 *                            administrative call can carry either type. Asserted structurally.
 *
 * And the guard itself has not been deleted from the database — `admin.refusal_reason` still holds
 * all four checks, and the internal calling convention still depends on them. It is unreachable by
 * `freightos_admin` (asserted in the ADR-0020 block above), so it is exercised directly here. That
 * matters: if a future definer passes an unresolved value, the guard is the thing that catches it.
 */
describe('the four actor refusals, at the layer they now live', () => {
  let unbound: Client;

  beforeAll(async () => {
    const role = await db.provisionUnboundLogin('cp_unbound');
    unbound = db.connectAsOperator(role);
    await unbound.connect();
  }, 60_000);

  afterAll(async () => {
    await unbound?.end();
  });

  it('an authenticated login bound to no principal cannot act, and leaves no human behind', async () => {
    const correlationId = randomUUID();
    const before = await admin.query<{ n: string }>('SELECT count(*)::text AS n FROM tenants');
    await expect(
      unbound.query(`SELECT * FROM admin.provision_tenant($1, $2, $3, $4)`, [
        randomUUID(),
        'Unbound Co',
        'tenant_provisioning',
        correlationId,
      ]),
    ).rejects.toThrow(/bound to no FreightOS principal/i);

    const after = await admin.query<{ n: string }>('SELECT count(*)::text AS n FROM tenants');
    expect(after.rows[0]!.n, 'an unbound connection provisioned a tenant').toBe(before.rows[0]!.n);

    // A raise rolls its own statement back, so there is deliberately no audit row — and, more to
    // the point, no row naming anybody. The pre-0026 defect was that a refused call still wrote
    // `actor_type = 'human'` with a name the caller chose.
    const rows = await admin.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM audit_events WHERE correlation_id = $1',
      [correlationId],
    );
    expect(Number(rows.rows[0]!.n)).toBe(0);
  });

  it('no administrative entry point can produce an agent or integration actor', async () => {
    // Structural rather than attempted: there is no argument to attempt it with. Asserted over
    // every function the shared credential can reach rather than over a chosen one.
    const r = await admin.query<{ f: string }>(
      `SELECT p.oid::regprocedure::text AS f
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'admin'
          AND has_function_privilege('freightos_admin', p.oid, 'EXECUTE')
          AND pg_get_function_arguments(p.oid) ~ '(p_actor|p_actor_type|p_issued_by)'`,
    );
    expect(r.rows.map((x) => x.f)).toEqual([]);

    const everWritten = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_events
        WHERE operation_class = 'privileged' AND actor_type NOT IN ('human', 'system')`,
    );
    expect(Number(everWritten.rows[0]!.n)).toBe(0);
  });

  it('keeps the four guards in admin.refusal_reason, which the internal convention still needs', async () => {
    // Called as the superuser because `freightos_admin` cannot reach it — that unreachability is
    // itself asserted above, and it is why this is the only way to exercise the guard directly.
    const cases: [string | null, string | null, RegExp][] = [
      [null, 'human', /actor is required/],
      ['   ', 'human', /actor is required/],
      ['agent:dispatch', 'agent', /never an agent/],
      ['integration:partner', 'integration', /never an agent or a tenant integration/],
    ];
    for (const [actor, actorType, expected] of cases) {
      const r = await admin.query<{ reason: string | null }>(
        `SELECT admin.refusal_reason($1, $2, 'tenant_provisioning', $3, $4) AS reason`,
        [actor, actorType, TENANT_A, randomUUID()],
      );
      expect(r.rows[0]!.reason ?? '', `${actor} / ${actorType}`).toMatch(expected);
    }

    // And the control: a resolved principal of either legitimate type passes the same guard, so
    // the four above are refusals and not a function that refuses everything.
    for (const [actor, actorType] of [
      ['user:someone', 'human'],
      ['system:tenant-provisioning', 'system'],
    ]) {
      const r = await admin.query<{ reason: string | null }>(
        `SELECT admin.refusal_reason($1, $2, 'tenant_provisioning', $3, $4) AS reason`,
        [actor, actorType, TENANT_A, randomUUID()],
      );
      expect(r.rows[0]!.reason, `${actor} / ${actorType}`).toBeNull();
    }
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
    // On the table owner, like every other constraint test in this block. The subject is the
    // COLUMN DEFAULT 0006 added — a property of the table, not of who may write to it — and 0018
    // §1 revoked INSERT on audit_events from both runtime roles precisely so that no session can
    // compose its own provenance. Running this as freightos_app would now be asserting the
    // opposite of the remediated invariant, so it moves to the owner rather than the grant
    // coming back. Where a runtime write goes instead is app.record_audit_event, proved in
    // ledger.test.ts and in authority-remediation.test.ts §1.
    //
    // Exactly the Phase 0 insert shape: no purpose, no outcome, no operation_class.
    const r = await admin.query<{ id: string; operation_class: string }>(
      `INSERT INTO audit_events
         (tenant_id, legal_entity_id, legal_authority_class, operating_context, actor_type,
          actor_id, event_type, resource_type, correlation_id, created_by)
       VALUES ($1, $2, 'carrier_agent', 'carrier', 'human', 'test:actor',
               'rig.freight.shipment.created.v1', 'shipment', $3, 'test:actor')
       RETURNING id, operation_class`,
      [TENANT_A, a.legalEntityId, randomUUID()],
    );
    expect(r.rows[0]!.operation_class).toBe('domain');
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
 * F-06, REMAPPED BY SEC-01 / 0026 — provenance is no longer a claim that can be contradicted,
 * because there is no longer a claim.
 *
 * WHAT F-06 ORIGINALLY SAID. `actor_id` and `actor_type` were parameters. The database could not
 * authenticate the person behind an administrative connection, so it could not do better than
 * record the claim — and recording only the claim made an authoritative ledger (Art. II.1)
 * forgeable. The mitigation was to stamp `payload.connection` with `session_user`, `current_user`
 * and the backend pid, so a claimed actor no connection could have made became a CONTRADICTION
 * VISIBLE IN THE RECORD rather than something indistinguishable from the truth.
 *
 * WHAT IT SAYS NOW. `payload.connection` is unchanged and still stamped. What changed is the other
 * half: `actor_id` is resolved from `session_user` through `authn.operator_binding`, so the two are
 * derived from the same authenticated principal and CANNOT disagree. F-06's mitigation detected a
 * forgery; 0026 removed the ability to commit one. The detection is kept because it is free, it is
 * defence in depth, and it is what would surface a future regression that reintroduced a
 * caller-supplied identity by another name.
 *
 * A NAMING DEFECT, RECORDED RATHER THAN TIDIED AWAY. `admin.record` still writes the payload keys
 * `claimed_actor` and `claimed_actor_type`. Under Design A they carry the RESOLVED principal, so
 * the word "claimed" is now wrong — they are no more a claim than `actor_id` is. The keys are left
 * alone deliberately: renaming them would be a schema change to the audit payload made for
 * readability in the middle of a security migration, and the ledger is append-only, so old rows
 * would keep the old key and new rows would not. It is flagged here and asserted below with its
 * real meaning, not quietly normalised into a changed expectation.
 */
describe('privileged audit records carry non-forgeable provenance — F-06', () => {
  let adminConn: Client;
  let operatorConn: Client;
  let operatorRole: string;

  beforeAll(async () => {
    adminConn = db.connectAs('freightos_admin');
    await adminConn.connect();
    operatorRole = await db.provisionSystemLogin('f06', 'system:tenant-provisioning');
    operatorConn = db.connectAsOperator(operatorRole);
    await operatorConn.connect();
  }, 60_000);

  afterAll(async () => {
    await adminConn?.end();
    await operatorConn?.end();
  });

  async function recordFor(correlationId: string) {
    const r = await admin.query<{
      payload: Record<string, unknown>;
      actor_id: string;
      actor_type: string;
    }>('SELECT payload, actor_id, actor_type FROM audit_events WHERE correlation_id = $1', [
      correlationId,
    ]);
    return r.rows[0]!;
  }

  it('stamps the authenticated connection, and it agrees with the recorded actor', async () => {
    const correlationId = randomUUID();
    const result = await call(
      operatorConn,
      `SELECT * FROM admin.provision_tenant($1, $2, $3, $4)`,
      [randomUUID(), 'F-06 Tenant', 'tenant_provisioning', correlationId],
    );
    expect(result.outcome, result.message ?? '').toBe('succeeded');

    const row = await recordFor(correlationId);
    // Both halves of the record, and the fact that they are now the same fact. `claimed_actor` is
    // the vestigial key named above; it holds the resolved principal, not a caller's assertion.
    expect(row.actor_id).toBe('system:tenant-provisioning');
    expect(row.payload['claimed_actor']).toBe(row.actor_id);
    expect(row.payload['claimed_actor_type']).toBe(row.actor_type);

    const connection = row.payload['connection'] as Record<string, unknown>;
    // The authenticated role is this operator's OWN login — the thing that did not exist before
    // 0026 and is the entire trust anchor. Not `freightos_admin`, which is what it used to be for
    // every administrative call regardless of who was behind it.
    expect(connection['authenticated_role']).toBe(operatorRole);
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
      operatorConn,
      `SELECT * FROM admin.export_tenant_audit($1, $2, $3, $4, $5)`,
      [
        TENANT_A,
        new Date(Date.now() - 86_400_000).toISOString(),
        new Date().toISOString(),
        'audit_export',
        correlationId,
      ],
    );
    expect(result.outcome, result.message ?? '').toBe('succeeded');
    const row = await recordFor(correlationId);
    const connection = row.payload['connection'] as Record<string, unknown>;
    expect(connection['authenticated_role']).toBe(operatorRole);
  });

  it('stamps a denial the same way', async () => {
    // A refusal is the record most worth forging: it is the evidence that somebody tried. It has
    // to carry the same provenance as a success, and it does. The denial reason is now a purpose
    // refusal rather than a rejected actor type, because a rejected actor type is no longer
    // reachable from here — see "the four actor refusals, at the layer they now live".
    const correlationId = randomUUID();
    const result = await call(
      operatorConn,
      `SELECT * FROM admin.set_tenant_status($1, $2, $3, $4)`,
      [TENANT_A, 'suspended', 'audit_export', correlationId],
    );
    expect(result.outcome).toBe('denied');

    const row = await recordFor(correlationId);
    const connection = row.payload['connection'] as Record<string, unknown>;
    expect(connection['authenticated_role']).toBe(operatorRole);
    expect(row.payload['offered_purpose']).toBe('audit_export');
  });

  it('records the shared credential as itself, not as whoever is using it', async () => {
    // The F-06 property that mattered most, in its post-0026 form. The shared administrative
    // credential is exactly the connection whose provenance used to be unfalsifiable-but-unverified.
    // It is now bound as a SERVICE, so the connection stamp and the recorded actor agree — and
    // agree on something that is not a person.
    const correlationId = randomUUID();
    await call(adminConn, `SELECT * FROM admin.provision_tenant($1, $2, $3, $4)`, [
      randomUUID(),
      'F-06 Shared',
      'tenant_provisioning',
      correlationId,
    ]);
    const row = await recordFor(correlationId);
    const connection = row.payload['connection'] as Record<string, unknown>;
    expect(connection['authenticated_role']).toBe('freightos_admin');
    expect(row.actor_type).toBe('system');
    expect(row.actor_id).toBe('system:session-binding-issuer');
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
    // An authenticated operator, because the denial under test is a purpose refusal and a purpose
    // refusal is only reached once a principal has resolved. Over an unbound connection the call
    // raises instead, which is a different property and is covered where it belongs.
    adminConn = await connectAsProvisioner(db);
  }, 60_000);

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
    const result = await call(adminConn, `SELECT * FROM admin.provision_tenant($1, $2, $3, $4)`, [
      randomUUID(),
      'F-07 Committed',
      'audit_export',
      correlationId,
    ]);
    // Wrong purpose for this operation, so it is refused.
    expect(result.outcome).toBe('denied');
    await adminConn.query('COMMIT');

    expect(await denialCount(correlationId)).toBe(1);
  });

  it('loses the denial when the caller rolls back — the stated limit', async () => {
    const correlationId = randomUUID();
    await adminConn.query('BEGIN');
    const result = await call(adminConn, `SELECT * FROM admin.provision_tenant($1, $2, $3, $4)`, [
      randomUUID(),
      'F-07 Rolled back',
      'audit_export',
      correlationId,
    ]);
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
    const result = await call(adminConn, `SELECT * FROM admin.provision_tenant($1, $2, $3, $4)`, [
      tenantId,
      'F-07 Never created',
      'audit_export',
      randomUUID(),
    ]);
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
      'freightos_audit_writer',
      // SR-2 / 0020 §1.
      'freightos_binding_owner',
      'freightos_control_plane',
      // N6 / 0034 §2. LOGIN service credential; no elevated attribute.
      'freightos_delivery_worker',
      // N3 / 0029 §1. The network event journal writer.
      'freightos_event_writer',
      'freightos_hierarchy_owner',
      'freightos_identity_guard',
      'freightos_migrator',
      // SEC-01 / 0026 §1.
      'freightos_operator_registry_owner',
    ]);

    // No FreightOS role holds either attribute that would make every RLS proof in the suite vacuous.
    for (const role of r.rows) {
      expect(role.rolsuper, `${role.rolname} SUPERUSER`).toBe(false);
      expect(role.rolbypassrls, `${role.rolname} BYPASSRLS`).toBe(false);
    }

    // The six definer owners are NOLOGIN: they are identities code runs AS, never connections.
    // 0026's registry owner is the sixth, and NOLOGIN matters more for it than for any of the
    // others — a login role that owned the operator binding could authenticate and then rewrite
    // the mapping that decides who it is.
    const nologin = r.rows.filter((x) => !x.rolcanlogin).map((x) => x.rolname);
    expect(nologin).toEqual([
      'freightos_admin_owner',
      'freightos_audit_writer',
      // SR-2 / 0020 §1.
      'freightos_binding_owner',
      'freightos_hierarchy_owner',
      'freightos_identity_guard',
      // SEC-01 / 0026 §1.
      'freightos_operator_registry_owner',
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
      // 0018 §1's audit writer, on the same terms as the other definer owners: administered by
      // the migrator, never inherited, SET only so `ALTER FUNCTION ... OWNER TO` can reach it.
      'freightos_migrator -> freightos_audit_writer admin=true inherit=false set=true',
      // SR-2 / 0020 §1. SET so ownership of app.session_binding and the accessors can be
      // transferred; INHERIT false so no ordinary migrator statement picks its rights up.
      'freightos_migrator -> freightos_binding_owner admin=true inherit=false set=true',
      'freightos_migrator -> freightos_control_plane admin=true inherit=false set=false',
      // N6 / 0034 §2. The same terms as N3's event writer: ADMIN only because PostgreSQL grants a
      // role's creator admin over it, which is what lets the revert drop it. SET FALSE — the worker
      // owns nothing, so no `ALTER ... OWNER TO` needs to reach it. INHERIT FALSE is load-bearing:
      // an inheriting migrator would silently hold the ability to write every recipient's inbox.
      'freightos_migrator -> freightos_delivery_worker admin=true inherit=false set=false',
      // N3 / 0029 §1. SET FALSE, unlike every definer owner above — the writer owns nothing, so
      // no `ALTER ... OWNER TO` ever needs to reach it and the migrator never needs to become it.
      // ADMIN is present only because PostgreSQL grants the creator of a role admin over it, and
      // it is what lets the revert drop the role. INHERIT FALSE is the load-bearing one: an
      // inheriting migrator would silently hold INSERT on a permanently immutable journal.
      'freightos_migrator -> freightos_event_writer admin=true inherit=false set=false',
      'freightos_migrator -> freightos_hierarchy_owner admin=true inherit=false set=true',
      'freightos_migrator -> freightos_identity_guard admin=true inherit=false set=true',
      // SEC-01 / 0026 §1. Same shape as every other definer owner: administered so the migrator
      // can provision operators, SET so it can create and own schema authn, INHERIT FALSE so no
      // ordinary migrator statement picks up the ability to read or write the binding table.
      'freightos_migrator -> freightos_operator_registry_owner admin=true inherit=false set=true',
    ]);

    // And what the list does NOT contain, said out loud: the audit writer is not a control-plane
    // member. The other three definer owners are, because they read across tenants to decide.
    // This one only appends a row it was handed, so control-plane membership would be authority
    // it has no use for — and the whole point of 0018 §1 is that nothing composes its own
    // provenance with more reach than the write needs.
    expect(edges).not.toContain(
      'freightos_audit_writer -> freightos_control_plane admin=false inherit=true set=true',
    );
    expect(edges.filter((e) => e.startsWith('freightos_audit_writer ->'))).toEqual([]);
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
      // 0018 §1. The migrator has to reach it to create and own app.record_audit_event; it is
      // NOLOGIN, so this is the only way in, and nothing else in the graph has a path to it.
      'freightos_audit_writer',
      // SR-2 / 0020 §1. Same reason: the migrator has to become it to transfer ownership of
      // app.session_binding and the five accessors. The membership is SET TRUE, INHERIT FALSE, so
      // an ordinary migrator statement picks up none of its rights.
      'freightos_binding_owner',
      // Reachable TRANSITIVELY, through freightos_admin_owner. Not a direct grant — the direct
      // membership is SET FALSE — and not inherited, but reachable by a deliberate two-step
      // SET ROLE. The documentation said "cannot"; "does not inherit" is what was proved.
      'freightos_control_plane',
      'freightos_hierarchy_owner',
      'freightos_identity_guard',
      // SEC-01 / 0026 §1. The migrator has to become it to create schema authn and the binding
      // table, and to provision operators. Reachable and NOT inherited — the assertion above
      // covers that for every role in this list, and for this one it is the property that keeps a
      // deployment session from silently holding write access to the identity registry.
      'freightos_operator_registry_owner',
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
