import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_A, TENANT_B, TestDatabase } from './harness.ts';
import {
  connectAsFixtureAdministrator,
  connectAsProvisioner,
  seedIdentity,
  type IdentityFixture,
} from './identity-harness.ts';

/**
 * SR-2 / SEC-01 — the A–M adversarial matrix for the authenticated administrative principal.
 *
 * This file is the canonical home for the properties whose old input surface migration 0026
 * removed. Before 0026 those properties were tested by feeding bad values to `p_actor`; that
 * argument no longer exists, so the property has to be proved against the surfaces that DO exist:
 * which PostgreSQL identity the caller authenticated as, and what that identity is bound to.
 *
 * The trust chain every case here is aimed at:
 *
 *   PostgreSQL authentication -> session_user -> authn.operator_binding -> active FreightOS user
 *   -> scope and permission -> operation guard -> mutation -> audit provenance
 *
 * Identity is selected by CONNECTION, never by argument. Where a case needs a non-human caller it
 * authenticates as one, rather than passing a string that claims to be one.
 */
const db = new TestDatabase('freightos_test_sr2_matrix');

/** A uuid that is no user anywhere, in any tenant. */
const FABRICATED = '00000000-0000-4000-8000-0000000000fa';

let su: Client;
/** Administrator A — permissioned, and the identity every positive control runs as. */
let opA: Client;
let opARole: string;
/** A real user of the same tenant who holds no administrative permission. */
let opB: Client;
let opBRole: string;
/** Authenticated, carries the administrative capability, bound to nobody. */
let unbound: Client;
let unboundRole: string;
/** The approved provisioning service. */
let provisioner: Client;
/** The shared capability credential, which is a service and must never be a person. */
let shared: Client;
let a: IdentityFixture;

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  su = db.connectAs('postgres');
  await su.connect();
  a = await seedIdentity(db, TENANT_A);

  opA = await connectAsFixtureAdministrator(db, a);
  opARole = db.operatorRoleName('admin');

  opBRole = await db.provisionOperator('plain', TENANT_A, a.userId);
  opB = db.connectAsOperator(opBRole);
  await opB.connect();

  unboundRole = await db.provisionUnboundLogin('unbound');
  unbound = db.connectAsOperator(unboundRole);
  await unbound.connect();

  provisioner = await connectAsProvisioner(db);
  shared = db.connectAs('freightos_admin');
  await shared.connect();
}, 240_000);

afterAll(async () => {
  for (const c of [opA, opB, unbound, provisioner, shared, su]) await c?.end();
});

interface Outcome {
  outcome: string;
  message: string | null;
  audit_event_id: string | null;
}

/** Call an administrative function, returning either its outcome row or the error it raised. */
async function call(
  client: Client,
  sql: string,
  params: readonly unknown[],
): Promise<Outcome | { raised: string; sqlstate: string }> {
  try {
    const r = await client.query<Outcome>(sql, [...params]);
    return r.rows[0]!;
  } catch (e) {
    const err = e as Error & { code?: string };
    return { raised: err.message, sqlstate: err.code ?? '' };
  }
}

function raised(r: Awaited<ReturnType<typeof call>>): { raised: string; sqlstate: string } {
  if (!('raised' in r)) throw new Error(`expected a refusal, got outcome=${r.outcome}`);
  return r;
}

function outcome(r: Awaited<ReturnType<typeof call>>): Outcome {
  if ('raised' in r) throw new Error(`expected an outcome row, got error: ${r.raised}`);
  return r;
}

async function auditFor(
  correlationId: string,
): Promise<{ actor_id: string; actor_type: string }[]> {
  const r = await su.query<{ actor_id: string; actor_type: string }>(
    `SELECT actor_id, actor_type FROM audit_events WHERE correlation_id = $1 ORDER BY created_at`,
    [correlationId],
  );
  return r.rows;
}

/** Every audit row that names a human, anywhere, since the fixture was built. */
async function humanRowsNaming(actorId: string): Promise<number> {
  const r = await su.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM audit_events WHERE actor_type = 'human' AND actor_id = $1`,
    [actorId],
  );
  return Number(r.rows[0]!.n);
}

async function regionParent(): Promise<string | null> {
  const r = await su.query<{ parent_id: string | null }>(
    'SELECT parent_id FROM organization_nodes WHERE id = $1',
    [a.regionNodeId],
  );
  return r.rows[0]?.parent_id ?? null;
}

const MOVE = 'SELECT * FROM admin.move_organization_node($1,$2,$3,$4,$5)';
const GRANT_PERM = 'SELECT * FROM admin.grant_role_permission($1,$2,$3,$4,$5)';
const PURPOSE = 'identity_administration';

/**
 * A (role, permission) pair the borrowed-authority case can use without any unrelated guard firing
 * first: a role the named administrator does not hold (or self-elevation refuses), carrying a
 * permission it does not already have (or the one-active-per-pair index refuses), named by a key
 * that is in the catalog (or the catalog check refuses). All three were observed masking this test
 * during the original reproduction.
 */
async function grantablePair(): Promise<{ roleId: string; key: string }> {
  const r = await su.query<{ role_id: string; key: string }>(
    `SELECT r.id AS role_id, p.key
       FROM roles r CROSS JOIN permissions p
      WHERE r.tenant_id = $1
        AND NOT EXISTS (SELECT 1 FROM membership_roles mr
                          JOIN memberships m ON m.id = mr.membership_id
                         WHERE mr.role_id = r.id AND m.user_id = $2 AND mr.revoked_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM role_permissions rp
                         WHERE rp.role_id = r.id AND rp.permission_id = p.id
                           AND rp.revoked_at IS NULL)
      LIMIT 1`,
    [TENANT_A, a.adminUserId],
  );
  expect(r.rowCount, 'no grantable pair exists — case B would prove nothing').toBe(1);
  return { roleId: r.rows[0]!.role_id, key: r.rows[0]!.key };
}

describe('A — a caller not authenticated as administrator A cannot act as A', () => {
  it('refuses the shared capability connection, and names no human in the ledger', async () => {
    const correlationId = randomUUID();
    const before = await regionParent();
    const r = outcome(
      await call(shared, MOVE, [
        TENANT_A,
        a.regionNodeId,
        a.enterpriseNodeId,
        PURPOSE,
        correlationId,
      ]),
    );
    // The shared credential is a BOUND SERVICE, so it passes the identity gate and is refused by
    // the authorization layer instead — `system:session-binding-issuer` is deliberately absent from
    // admin.platform_actor. Both are correct refusals; asserting the wrong one would hide a
    // regression in whichever layer actually stopped it.
    expect(r.outcome).toBe('denied');
    expect(r.message, 'refused at the wrong layer').toMatch(
      /not an approved provisioning identity|is not a user of tenant/i,
    );
    expect(await regionParent(), 'the node moved anyway').toBe(before);
    // A refused call from a BOUND service still writes a denial row — that is the ledger's
    // contract and it predates 0026. What must never happen is that row naming a person.
    const rows = await auditFor(correlationId);
    for (const row of rows) {
      expect(row.actor_type, 'a refused service call was recorded as a human').toBe('system');
    }
  });

  it('refuses an authenticated operator who is bound to nobody', async () => {
    const correlationId = randomUUID();
    const before = await regionParent();
    const r = raised(
      await call(unbound, MOVE, [
        TENANT_A,
        a.regionNodeId,
        a.enterpriseNodeId,
        PURPOSE,
        correlationId,
      ]),
    );
    expect(r.sqlstate).toBe('28000');
    expect(r.raised).toMatch(/bound to no FreightOS principal/);
    expect(await regionParent()).toBe(before);
    expect(await auditFor(correlationId)).toEqual([]);
  });

  it('leaves the administrator unnamed by any of it — there is no argument that could name them', () => {
    // Stated as a structural fact rather than an attempt: `p_actor` is not in the signature, so
    // there is no value a caller could supply that selects a human. Case F attacks what remains.
    expect(MOVE.match(/\$/g)).toHaveLength(5);
  });
});

describe('B — authority cannot spread under a borrowed identity', () => {
  it('refuses grant_role_permission from the shared connection, at the identity boundary', async () => {
    const { roleId, key } = await grantablePair();
    const correlationId = randomUUID();
    const r = outcome(await call(shared, GRANT_PERM, [TENANT_A, roleId, key, PURPOSE, correlationId]));
    expect(r.outcome).toBe('denied');
    // Not the catalog check, not self-elevation, not the uniqueness index — each of those was
    // observed masking this exact case, so each is excluded explicitly.
    expect(r.message ?? '', 'refused for an incidental reason').not.toMatch(
      /not in the catalog|self-elevation|duplicate key/i,
    );
    const landed = await su.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = $1 AND p.key = $2 AND rp.revoked_at IS NULL`,
      [roleId, key],
    );
    expect(Number(landed.rows[0]!.n), 'the authority grant landed').toBe(0);
    for (const row of await auditFor(correlationId)) {
      expect(row.actor_type, 'a refused grant named a human').not.toBe('human');
    }
  });

  it('refuses it from an unbound operator at the identity layer', async () => {
    const { roleId, key } = await grantablePair();
    const r = raised(
      await call(unbound, GRANT_PERM, [TENANT_A, roleId, key, PURPOSE, randomUUID()]),
    );
    expect(r.sqlstate).toBe('28000');
    expect(r.raised).toMatch(/bound to no FreightOS principal/);
  });
});

describe('C — caller-controlled data cannot create human provenance', () => {
  it('has no argument through which a fabricated user could be named', async () => {
    // The general invariant, checked at the catalog rather than by trying one value: no function
    // freightos_admin can reach still accepts a human identity from its caller.
    const r = await su.query<{ f: string }>(
      `SELECT p.oid::regprocedure::text AS f
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'admin'
          AND has_function_privilege('freightos_admin', p.oid, 'EXECUTE')
          AND pg_get_function_arguments(p.oid) ~ '(p_actor|p_actor_type|p_issued_by)'`,
    );
    expect(r.rows.map((x) => x.f)).toEqual([]);
  });

  it('never records the fabricated uuid as a human, on any path', async () => {
    for (const client of [shared, unbound, opA]) {
      await call(client, MOVE, [
        TENANT_A,
        a.regionNodeId,
        a.enterpriseNodeId,
        PURPOSE,
        randomUUID(),
      ]);
    }
    expect(await humanRowsNaming(`user:${FABRICATED}`)).toBe(0);
    expect(await humanRowsNaming('user:operator')).toBe(0);
    expect(await humanRowsNaming('user:reviewer')).toBe(0);
  });

  it('records tenant provisioning as the SERVICE, not as user:operator — the new finding', async () => {
    // Historical behaviour: tenant provisioning passed a caller-supplied `user:operator` and the
    // ledger recorded actor_type=human for a person who exists nowhere. That path is outside the
    // original sixteen-function inventory and is why the repository sweep is part of the contract.
    const correlationId = randomUUID();
    const newTenant = randomUUID();
    const r = outcome(
      await call(provisioner, 'SELECT * FROM admin.provision_tenant($1,$2,$3,$4)', [
        newTenant,
        'Matrix Provisioned Co',
        'tenant_provisioning',
        correlationId,
      ]),
    );
    expect(r.outcome).toBe('succeeded');
    const rows = await auditFor(correlationId);
    expect(rows.length, 'provisioning wrote no audit row').toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.actor_type, 'tenant provisioning recorded a human').toBe('system');
      expect(row.actor_id).toBe('system:tenant-provisioning');
    }
  });

  it('never lets the provisioning service act as a person, even where it may act', async () => {
    // `system:tenant-provisioning` IS on admin.platform_actor, so it may administer identity —
    // that predates 0026 and is how a tenant gets its first administrator. The property under test
    // is not whether it may act, but WHOSE name the ledger carries when it does.
    const { roleId, key } = await grantablePair();
    const correlationId = randomUUID();
    const r = outcome(
      await call(provisioner, GRANT_PERM, [TENANT_A, roleId, key, PURPOSE, correlationId]),
    );
    expect(r.outcome, r.message ?? '').toBe('succeeded');
    const rows = await auditFor(correlationId);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.actor_type, 'a service act was recorded as a human').toBe('system');
      expect(row.actor_id).toBe('system:tenant-provisioning');
    }
  });
});

describe('D — the authenticated administrator can act', () => {
  it('moves a node it genuinely has permission and scope for', async () => {
    const correlationId = randomUUID();
    const r = outcome(
      await call(opA, MOVE, [
        TENANT_A,
        a.regionNodeId,
        a.legalEntityNodeId,
        PURPOSE,
        correlationId,
      ]),
    );
    expect(r.outcome, r.message ?? '').toBe('succeeded');
    expect(await regionParent()).toBe(a.legalEntityNodeId);
  });
});

describe('E — provenance is derived from the authenticated session, not from an argument', () => {
  it('records administrator A, resolved through session_user', async () => {
    const correlationId = randomUUID();
    const r = outcome(
      await call(opA, MOVE, [TENANT_A, a.regionNodeId, a.enterpriseNodeId, PURPOSE, correlationId]),
    );
    expect(r.outcome, r.message ?? '').toBe('succeeded');
    const rows = await auditFor(correlationId);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.actor_type).toBe('human');
      expect(row.actor_id).toBe(`user:${a.adminUserId}`);
    }

    // And the chain is the one claimed: this connection's session_user is the operator login, and
    // the registry maps exactly that login to exactly this user.
    const who = await opA.query<{ su: string }>('SELECT session_user AS su');
    expect(who.rows[0]!.su).toBe(opARole);
    await su.query('SET ROLE freightos_operator_registry_owner');
    const bound = await su.query<{ user_id: string }>(
      `SELECT user_id::text FROM authn.operator_binding
        WHERE role_name = $1 AND revoked_at IS NULL`,
      [opARole],
    );
    await su.query('RESET ROLE');
    expect(bound.rows[0]!.user_id).toBe(a.adminUserId);
  });
});

describe('F — authenticated A cannot become B', () => {
  it('ignores a forged actor GUC', async () => {
    const correlationId = randomUUID();
    await opA.query('SELECT set_config($1, $2, false)', ['app.actor_id', `user:${a.userId}`]);
    try {
      const r = outcome(
        await call(opA, MOVE, [
          TENANT_A,
          a.regionNodeId,
          a.legalEntityNodeId,
          PURPOSE,
          correlationId,
        ]),
      );
      expect(r.outcome, r.message ?? '').toBe('succeeded');
      for (const row of await auditFor(correlationId)) {
        expect(row.actor_id, 'a session GUC chose the recorded human').toBe(
          `user:${a.adminUserId}`,
        );
      }
    } finally {
      await opA.query('SELECT set_config($1, NULL, false)', ['app.actor_id']);
    }
  });

  it('cannot even reach the legacy accessor surface from an administrative login', async () => {
    // An operator holds USAGE on no schema but the one its capability needs. The `app` accessors —
    // the surface the forged GUC would have to travel through — are not nameable from here at all,
    // which is why the case above sees the GUC change nothing. Asserted rather than assumed,
    // because "unreachable" is a claim that rots quietly when a grant is added later.
    const r = await call(opA, 'SELECT app.current_actor_id()', []);
    expect(raised(r).raised).toMatch(/permission denied for schema app/);
    const usage = await su.query<{ ok: boolean }>(
      'SELECT has_schema_privilege($1, $2, $3) AS ok',
      [opARole, 'app', 'USAGE'],
    );
    expect(usage.rows[0]!.ok).toBe(false);
  });

  it('cannot SET ROLE into another operator', async () => {
    const r = await call(opA, `SET ROLE ${opBRole}`, []);
    expect(raised(r).raised).toMatch(/permission denied|must be a member/i);
  });

  it('cannot SET ROLE into the definer owner', async () => {
    const r = await call(opA, 'SET ROLE freightos_admin_owner', []);
    expect(raised(r).raised).toMatch(/permission denied|must be a member/i);
  });

  it('cannot SET ROLE into the shared capability role', async () => {
    // Membership was granted WITH SET FALSE precisely so inheriting the capability does not also
    // confer the ability to BECOME it — which would change session_user's meaning downstream.
    const r = await call(opA, 'SET ROLE freightos_admin', []);
    expect(raised(r).raised).toMatch(/permission denied|must be a member/i);
  });

  it('is not helped by purpose or correlation id, which carry no identity', async () => {
    const correlationId = randomUUID();
    const r = outcome(
      await call(opA, MOVE, [TENANT_A, a.regionNodeId, a.enterpriseNodeId, PURPOSE, correlationId]),
    );
    expect(r.outcome, r.message ?? '').toBe('succeeded');
    for (const row of await auditFor(correlationId)) {
      expect(row.actor_id).toBe(`user:${a.adminUserId}`);
    }
  });
});

describe('G — an unmapped or non-human principal cannot become a human administrator', () => {
  it('refuses an authenticated login with the capability and no binding', async () => {
    const r = raised(
      await call(unbound, MOVE, [
        TENANT_A,
        a.regionNodeId,
        a.enterpriseNodeId,
        PURPOSE,
        randomUUID(),
      ]),
    );
    expect(r.sqlstate).toBe('28000');
    expect(r.raised).toMatch(/bound to no FreightOS principal/);
  });

  it('emits no human provenance for any unmapped attempt', async () => {
    const correlationId = randomUUID();
    await call(unbound, MOVE, [
      TENANT_A,
      a.regionNodeId,
      a.enterpriseNodeId,
      PURPOSE,
      correlationId,
    ]);
    expect(await auditFor(correlationId)).toEqual([]);
  });

  it('refuses the shared capability connection for human work', async () => {
    const correlationId = randomUUID();
    const r = outcome(
      await call(shared, MOVE, [
        TENANT_A,
        a.regionNodeId,
        a.enterpriseNodeId,
        PURPOSE,
        correlationId,
      ]),
    );
    expect(r.outcome).toBe('denied');
    // And whatever it wrote, it did not write a person.
    for (const row of await auditFor(correlationId)) {
      expect(row.actor_type, 'the shared service produced human provenance').not.toBe('human');
    }
  });

  it('POSITIVE CONTROL: the identical call succeeds over the bound operator', async () => {
    const r = outcome(
      await call(opA, MOVE, [TENANT_A, a.regionNodeId, a.legalEntityNodeId, PURPOSE, randomUUID()]),
    );
    expect(r.outcome, r.message ?? '').toBe('succeeded');
  });
});

describe('H — a mapped user who becomes inactive loses authority', () => {
  it('refuses once the FreightOS user is deactivated, and mutates nothing', async () => {
    const before = await regionParent();
    await su.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [a.adminUserId]);
    try {
      const correlationId = randomUUID();
      const r = raised(
        await call(opA, MOVE, [
          TENANT_A,
          a.regionNodeId,
          a.enterpriseNodeId,
          PURPOSE,
          correlationId,
        ]),
      );
      expect(r.sqlstate).toBe('28000');
      expect(r.raised).toMatch(/bound to no FreightOS principal/);
      expect(await regionParent(), 'a deactivated administrator moved a node').toBe(before);
      expect(await auditFor(correlationId)).toEqual([]);
    } finally {
      await su.query(`UPDATE users SET status = 'active' WHERE id = $1`, [a.adminUserId]);
    }
  });

  it('POSITIVE CONTROL: reactivating restores authority on the same connection', async () => {
    const r = outcome(
      await call(opA, MOVE, [TENANT_A, a.regionNodeId, a.legalEntityNodeId, PURPOSE, randomUUID()]),
    );
    expect(r.outcome, r.message ?? '').toBe('succeeded');
  });
});

describe('I — revoking the binding removes authority, including on an open connection', () => {
  it('succeeds before revocation and fails after, on the SAME session', async () => {
    const role = await db.provisionOperator('revocable', TENANT_A, a.adminUserId);
    const client = db.connectAsOperator(role);
    await client.connect();
    try {
      const ok = outcome(
        await call(client, MOVE, [
          TENANT_A,
          a.regionNodeId,
          a.enterpriseNodeId,
          PURPOSE,
          randomUUID(),
        ]),
      );
      expect(ok.outcome, ok.message ?? '').toBe('succeeded');

      expect(await db.revokeOperator(role)).toBe(1);

      // The connection is deliberately NOT reopened. Revocation that only takes effect on the next
      // login would leave a revoked operator working for as long as their pool held the socket.
      const before = await regionParent();
      const after = raised(
        await call(client, MOVE, [
          TENANT_A,
          a.regionNodeId,
          a.legalEntityNodeId,
          PURPOSE,
          randomUUID(),
        ]),
      );
      expect(after.sqlstate).toBe('28000');
      expect(after.raised).toMatch(/bound to no FreightOS principal/);
      expect(await regionParent(), 'a revoked operator still moved a node').toBe(before);
    } finally {
      await client.end();
    }
  });
});

describe('J — a recreated role of the same name inherits nothing', () => {
  it('fails closed after drop and recreate, until explicitly rebound', async () => {
    const role = await db.provisionOperator('replaceable', TENANT_A, a.adminUserId);
    const first = db.connectAsOperator(role);
    await first.connect();
    const oidBefore = (
      await first.query<{ oid: string }>('SELECT oid::text FROM pg_roles WHERE rolname = $1', [
        role,
      ])
    ).rows[0]!.oid;
    const ok = outcome(
      await call(first, MOVE, [
        TENANT_A,
        a.regionNodeId,
        a.enterpriseNodeId,
        PURPOSE,
        randomUUID(),
      ]),
    );
    expect(ok.outcome, ok.message ?? '').toBe('succeeded');
    await first.end();

    await db.dropLogin(role);
    const recreated = await db.provisionUnboundLogin('replaceable');
    expect(recreated).toBe(role);

    const oidAfter = (
      await su.query<{ oid: string }>('SELECT oid::text FROM pg_roles WHERE rolname = $1', [role])
    ).rows[0]!.oid;
    expect(oidAfter, 'the recreated role reused its OID — the test proves nothing').not.toBe(
      oidBefore,
    );

    const second = db.connectAsOperator(role);
    await second.connect();
    try {
      const before = await regionParent();
      const r = raised(
        await call(second, MOVE, [
          TENANT_A,
          a.regionNodeId,
          a.legalEntityNodeId,
          PURPOSE,
          randomUUID(),
        ]),
      );
      expect(r.sqlstate).toBe('28000');
      expect(r.raised, 'the recreated role inherited the old human binding').toMatch(
        /bound to no FreightOS principal/,
      );
      expect(await regionParent()).toBe(before);
    } finally {
      await second.end();
    }
  });
});

describe('K — SECURITY DEFINER semantics: session_user anchors, current_user does not', () => {
  it('shows the operator outside and the definer owner inside, resolving to the operator', async () => {
    const outside = await opA.query<{ su: string; cu: string }>(
      'SELECT session_user AS su, current_user AS cu',
    );
    expect(outside.rows[0]!.su).toBe(opARole);
    expect(outside.rows[0]!.cu).toBe(opARole);

    // A definer owned by the same role as the administrative boundary, reporting what it sees.
    await su.query('SET ROLE freightos_admin_owner');
    await su.query(`CREATE OR REPLACE FUNCTION admin.zz_identity_probe(
         OUT inside_session name, OUT inside_current name, OUT resolved text)
       RETURNS record LANGUAGE plpgsql SECURITY DEFINER
       SET search_path = pg_catalog, public, pg_temp AS $fn$
       BEGIN
         inside_session := session_user;
         inside_current := current_user;
         SELECT p.actor_id INTO resolved FROM authn.authenticated_principal() p;
       END $fn$`);
    await su.query('RESET ROLE');
    await su.query('GRANT EXECUTE ON FUNCTION admin.zz_identity_probe() TO freightos_admin');
    try {
      const r = await opA.query<{
        inside_session: string;
        inside_current: string;
        resolved: string;
      }>('SELECT * FROM admin.zz_identity_probe()');
      const row = r.rows[0]!;
      expect(row.inside_session, 'session_user changed inside the definer').toBe(opARole);
      expect(row.inside_current, 'current_user was not the definer owner').toBe(
        'freightos_admin_owner',
      );
      expect(row.resolved, 'resolution did not follow session_user').toBe(`user:${a.adminUserId}`);
    } finally {
      await su.query('DROP FUNCTION IF EXISTS admin.zz_identity_probe()');
    }
  });
});

describe('L — the lower-level guards remain reachable behind the identity boundary', () => {
  it('permission: a bound operator without the permission is refused for THAT reason', async () => {
    const correlationId = randomUUID();
    const r = outcome(
      await call(opB, MOVE, [TENANT_A, a.regionNodeId, a.enterpriseNodeId, PURPOSE, correlationId]),
    );
    expect(r.outcome).toBe('denied');
    // Not "bound to no principal" — opB IS bound, to a real active user. The refusal has to come
    // from the permission check, which is the guard this case exists to keep reachable.
    expect(r.message, 'refused upstream at the identity layer instead').toMatch(/does not hold/i);
  });

  it('cross-tenant: a permissioned operator of one tenant cannot act on another', async () => {
    const r = outcome(
      await call(opA, MOVE, [TENANT_B, a.regionNodeId, a.enterpriseNodeId, PURPOSE, randomUUID()]),
    );
    expect(r.outcome).toBe('denied');
    expect(r.message).toMatch(/is not a user of tenant/i);
  });

  it('self-elevation: the guard still fires for a role the operator holds', async () => {
    const key = (
      await su.query<{ key: string }>(
        `SELECT p.key FROM permissions p
          WHERE NOT EXISTS (SELECT 1 FROM role_permissions rp
                             WHERE rp.role_id = $1 AND rp.permission_id = p.id
                               AND rp.revoked_at IS NULL)
          LIMIT 1`,
        [a.adminRoleId],
      )
    ).rows[0]!.key;
    const r = outcome(
      await call(opA, GRANT_PERM, [TENANT_A, a.adminRoleId, key, PURPOSE, randomUUID()]),
    );
    expect(r.outcome).not.toBe('succeeded');
    expect(r.message, 'the self-elevation guard is no longer reachable').toMatch(/self-elevation/i);
  });

  it('one-active-per-pair: granting an existing permission again is refused by the index', async () => {
    const existing = await su.query<{ role_id: string; key: string }>(
      `SELECT rp.role_id, p.key FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
        JOIN roles r ON r.id = rp.role_id
       WHERE rp.revoked_at IS NULL AND r.tenant_id = $1
         AND NOT EXISTS (SELECT 1 FROM membership_roles mr JOIN memberships m ON m.id = mr.membership_id
                          WHERE mr.role_id = rp.role_id AND m.user_id = $2 AND mr.revoked_at IS NULL)
       LIMIT 1`,
      [TENANT_A, a.adminUserId],
    );
    expect(existing.rowCount, 'no already-granted pair to re-grant').toBe(1);
    const r = outcome(
      await call(opA, GRANT_PERM, [
        TENANT_A,
        existing.rows[0]!.role_id,
        existing.rows[0]!.key,
        PURPOSE,
        randomUUID(),
      ]),
    );
    expect(r.outcome).not.toBe('succeeded');
    expect(r.message, 'the uniqueness guard is no longer reachable').toMatch(
      /duplicate key|already/i,
    );
  });

  it('purpose vocabulary: an unapproved purpose is still refused, and purpose still travels', async () => {
    const r = outcome(
      await call(opA, MOVE, [
        TENANT_A,
        a.regionNodeId,
        a.enterpriseNodeId,
        'because_i_said_so',
        randomUUID(),
      ]),
    );
    expect(r.outcome).toBe('denied');
    expect(r.message, 'purpose was lost in the signature migration').toMatch(
      /vocabulary|does not authorise/i,
    );
  });

  it('hierarchy: a node cannot be detached to the root', async () => {
    const r = outcome(
      await call(opA, MOVE, [TENANT_A, a.regionNodeId, null, PURPOSE, randomUUID()]),
    );
    expect(r.outcome).toBe('denied');
    expect(r.message).toMatch(/not detached to the root/i);
  });
});
