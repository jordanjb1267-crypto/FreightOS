import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_A, TestDatabase } from './harness.ts';
import {
  connectAsFixtureAdministrator,
  seedIdentity,
  type IdentityFixture,
} from './identity-harness.ts';

/**
 * SR-2 — finding F-A path 1, CLOSED. The five original exploit regressions.
 *
 * These five cases were written against `d455929`, where each of them SUCCEEDED and was recorded
 * with `it.fails`. They are now ordinary tests, and they pass. Nothing in their intent was
 * softened; what changed is the surface they have to attack, because migration 0026 removed the
 * one they were originally written against.
 *
 * ORIGINALLY: the attack was `p_actor => 'user:<a real administrator>'` over the shared
 * `freightos_admin` connection. That argument no longer exists on any of the sixteen functions, so
 * the exploit cannot be expressed — which is a stronger outcome than refusing it, and is why these
 * tests now attack the surfaces that remain: which PostgreSQL identity the caller authenticated as,
 * and what that identity is bound to.
 *
 * The five properties, unchanged:
 *
 *   1. a borrowed legitimate administrator cannot authorise a mutation;
 *   2. authority cannot spread under a borrowed identity;
 *   3. a fabricated identifier cannot become human provenance;
 *   4. mutable session state cannot substitute for authenticated operator identity;
 *   5. the original impersonation path is closed.
 *
 * The full adversarial matrix lives in `sr2-authenticated-principal-matrix.test.ts`; this file is
 * kept separate and deliberately narrow because it is the historical record of the defect, and a
 * reviewer comparing it against the original report should be able to do so line for line.
 */
const db = new TestDatabase('freightos_test_sr2_admin_actor');

/** A uuid that is no user anywhere, in any tenant. */
const FABRICATED = '00000000-0000-4000-8000-0000000000fa';
const PURPOSE = 'identity_administration';
const MOVE = 'SELECT * FROM admin.move_organization_node($1,$2,$3,$4,$5)';
const GRANT_PERM = 'SELECT * FROM admin.grant_role_permission($1,$2,$3,$4,$5)';

let shared: Client;
let operator: Client;
let su: Client;
let a: IdentityFixture;

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  // The shared credential the original exploit was run over. It still connects, still holds
  // EXECUTE on every one of the sixteen functions, and can no longer name a person.
  shared = db.connectAs('freightos_admin');
  await shared.connect();
  su = db.connectAs('postgres');
  await su.connect();
  a = await seedIdentity(db, TENANT_A);
  operator = await connectAsFixtureAdministrator(db, a);
}, 180_000);

afterAll(async () => {
  for (const c of [shared, operator, su]) await c?.end();
});

async function regionParent(): Promise<string | null> {
  const r = await su.query<{ parent_id: string | null }>(
    `SELECT parent_id FROM organization_nodes WHERE id = $1`,
    [a.regionNodeId],
  );
  return r.rows[0]?.parent_id ?? null;
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

async function call(
  client: Client,
  sql: string,
  params: readonly unknown[],
): Promise<{ outcome?: string; message?: string | null; raised?: string }> {
  try {
    const r = await client.query<{ outcome: string; message: string | null }>(sql, [...params]);
    return r.rows[0]!;
  } catch (e) {
    return { raised: (e as Error).message };
  }
}

describe('the identity a caller may name', () => {
  it('1. REQUIRED: a borrowed real administrator cannot authorise a mutation', async () => {
    // The original exploit, in its modern form. `p_actor => user:<administrator>` is gone, so the
    // strongest remaining version is: hold the shared credential, aim at the same node, and see
    // whether the administrator's authority can be reached at all.
    const correlationId = randomUUID();
    const before = await regionParent();
    const r = await call(shared, MOVE, [
      TENANT_A,
      a.regionNodeId,
      a.enterpriseNodeId,
      PURPOSE,
      correlationId,
    ]);
    expect(r.raised ?? r.outcome, 'the shared credential moved the node').not.toBe('succeeded');
    expect(await regionParent(), 'a refused call still moved the node').toBe(before);
    for (const row of await auditFor(correlationId)) {
      expect(row.actor_id, 'the ledger named the borrowed administrator').not.toBe(
        `user:${a.adminUserId}`,
      );
    }
  });

  it('2. REQUIRED: authority cannot spread under a borrowed identity', async () => {
    // The worst case: granting a permission to a role is how authority propagates, so a lie here
    // is inherited by every later authorization decision.
    //
    // The pair is chosen so no unrelated guard can mask the result — a role the administrator does
    // not hold, a permission it does not already have, a key that is in the catalog. All three
    // were observed refusing this call during the original reproduction, and none of them is the
    // boundary under test.
    const pair = await su.query<{ role_id: string; key: string }>(
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
    expect(pair.rowCount, 'no grantable pair exists — this case would prove nothing').toBe(1);
    const { role_id: roleId, key } = pair.rows[0]!;

    const correlationId = randomUUID();
    const r = await call(shared, GRANT_PERM, [TENANT_A, roleId, key, PURPOSE, correlationId]);
    expect(r.message ?? r.raised ?? '', 'refused for an incidental reason').not.toMatch(
      /not in the catalog|self-elevation|duplicate key/i,
    );
    expect(r.raised ?? r.outcome).not.toBe('succeeded');

    const landed = await su.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = $1 AND p.key = $2 AND rp.revoked_at IS NULL`,
      [roleId, key],
    );
    expect(Number(landed.rows[0]!.n), 'the authority grant landed anyway').toBe(0);
    for (const row of await auditFor(correlationId)) {
      expect(row.actor_id).not.toBe(`user:${a.adminUserId}`);
    }
  });

  it('3. REQUIRED: no fabricated identifier can become human provenance', async () => {
    // Originally: pass `user:<fabricated uuid>`, watch the call be denied, and find the ledger had
    // recorded `human` / `user:<fabricated uuid>` anyway. There is no longer an argument that
    // could carry it — asserted over every reachable function rather than by trying one value.
    const reachable = await su.query<{ f: string }>(
      `SELECT p.oid::regprocedure::text AS f
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'admin'
          AND has_function_privilege('freightos_admin', p.oid, 'EXECUTE')
          AND pg_get_function_arguments(p.oid) ~ '(p_actor|p_actor_type|p_issued_by)'`,
    );
    expect(reachable.rows.map((x) => x.f)).toEqual([]);

    // And no row anywhere names one, however the fixture and the cases above exercised the system.
    const fabricated = await su.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_events
        WHERE actor_type = 'human' AND actor_id IN ($1, 'user:operator', 'user:reviewer')`,
      [`user:${FABRICATED}`],
    );
    expect(Number(fabricated.rows[0]!.n), 'a fabricated human reached the ledger').toBe(0);
  });

  it('4. REQUIRED: mutable session state cannot substitute for authenticated identity', async () => {
    // The authenticated operator is administrator A. It forges the legacy actor GUC to name a
    // different real user of the same tenant, then performs an operation it is genuinely entitled
    // to. The operation must succeed AS A, and the ledger must say A.
    const correlationId = randomUUID();
    await operator.query('SELECT set_config($1, $2, false)', ['app.actor_id', `user:${a.userId}`]);
    try {
      const r = await call(operator, MOVE, [
        TENANT_A,
        a.regionNodeId,
        a.legalEntityNodeId,
        PURPOSE,
        correlationId,
      ]);
      expect(r.outcome, r.message ?? r.raised ?? '').toBe('succeeded');
      const rows = await auditFor(correlationId);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.actor_type).toBe('human');
        expect(row.actor_id, 'a session GUC chose the recorded human').toBe(
          `user:${a.adminUserId}`,
        );
      }
    } finally {
      await operator.query('SELECT set_config($1, NULL, false)', ['app.actor_id']);
    }
  });

  it('5. REQUIRED: the original impersonation path is closed at its root', async () => {
    // The root of the original finding: the shared administrative credential was, by itself,
    // enough to speak as any permissioned human. It is now a bound SERVICE — it resolves to a
    // service identity, and no path exists from that to `actor_type = 'human'`.
    const who = await shared.query<{ su: string }>('SELECT session_user AS su');
    expect(who.rows[0]!.su).toBe('freightos_admin');

    await su.query('SET ROLE freightos_operator_registry_owner');
    const binding = await su.query<{ kind: string; actor: string | null }>(
      `SELECT principal_kind AS kind, system_actor_id AS actor
         FROM authn.operator_binding WHERE role_name = 'freightos_admin' AND revoked_at IS NULL`,
    );
    await su.query('RESET ROLE');
    expect(binding.rows[0]!.kind, 'the shared credential is bound as a human').toBe('system');

    const humanRows = await su.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_events
        WHERE actor_type = 'human' AND actor_id = $1
          AND created_at > now() - interval '1 hour'
          AND correlation_id IN (SELECT correlation_id FROM audit_events WHERE actor_type = 'system')`,
      [`user:${a.adminUserId}`],
    );
    expect(
      Number(humanRows.rows[0]!.n),
      'a service-initiated operation produced human provenance',
    ).toBe(0);
  });
});

describe('positive controls — the boundary is reached, not merely unreachable', () => {
  it('the authenticated administrator can perform the same operation', async () => {
    const correlationId = randomUUID();
    const r = await call(operator, MOVE, [
      TENANT_A,
      a.regionNodeId,
      a.enterpriseNodeId,
      PURPOSE,
      correlationId,
    ]);
    expect(r.outcome, r.message ?? r.raised ?? '').toBe('succeeded');
    const rows = await auditFor(correlationId);
    expect(rows.length, 'the administrative path wrote no audit row at all').toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.actor_type).toBe('human');
      expect(row.actor_id).toBe(`user:${a.adminUserId}`);
    }
  });

  it('reaches the permission check rather than a missing grant', async () => {
    // The shared credential holds EXECUTE on every one of these functions and always did, so a
    // refusal above is a decision, not an absent privilege.
    const r = await su.query<{ f: string; ok: boolean }>(
      `SELECT p.oid::regprocedure::text AS f,
              has_function_privilege('freightos_admin', p.oid, 'EXECUTE') AS ok
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'admin'
          AND p.proname IN ('move_organization_node', 'grant_role_permission', 'set_tenant_status')`,
    );
    expect(r.rowCount).toBeGreaterThan(0);
    expect(r.rows.filter((x) => !x.ok).map((x) => x.f)).toEqual([]);
  });
});
