import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_A, TestDatabase } from './harness.ts';
import { seedIdentity, type IdentityFixture } from './identity-harness.ts';

/**
 * SEC-01 / 0026 — permanent regressions for the two defects found while building the boundary.
 *
 * Both were found by the adversarial matrix rather than by the migration, both failed CLOSED, and
 * both were therefore invisible: a control that refuses everybody looks exactly like a control that
 * works until somebody tries the case it was built for. Each gets a test that names it, and a
 * positive control proving that test can fail.
 *
 * ── DEFECT 1: ERROR 42702, ambiguous column reference ──────────────────────────────────────────
 *
 * `authn.authenticated_principal()` declares OUT parameters named `tenant_id` and `user_id`. Its
 * human branch re-reads `public.users` to confirm the mapped principal is still active, and the
 * first version wrote that lookup unqualified:
 *
 *     SELECT status, ... FROM public.users WHERE tenant_id = b.tenant_id AND id = b.user_id
 *
 * PostgreSQL resolves `tenant_id` there to the OUT PARAMETER, not the column, and raises 42702. So
 * every HUMAN resolution raised, and no human could act at all. It was invisible because the
 * SERVICE branch returns before reaching that statement — and every bootstrap path, every fixture
 * seed and every provisioning call in the suite goes through the service branch.
 *
 * The fix column-qualifies through an alias. The regression below is a human resolution that must
 * succeed and must return both of the colliding OUT parameters populated.
 *
 * ── DEFECT 2: FORCE ROW LEVEL SECURITY on public.users ─────────────────────────────────────────
 *
 * `authn.provision_operator` checks that the user it is about to bind is real and active. It runs
 * as `freightos_operator_registry_owner`, which held `GRANT SELECT ON public.users` — and that is
 * not enough. `public.users` has FORCE RLS, so a role with no POLICY sees zero rows no matter what
 * privilege it holds. Provisioning therefore treated every active user as absent and refused every
 * human binding.
 *
 * `GRANT SELECT` reading as access is the whole trap: the grant is real, the read returns nothing,
 * and the failure is a refusal rather than an error. The fix is 0026 §2b, a role-disjoint SELECT
 * policy naming only the registry owner.
 */
const db = new TestDatabase('freightos_test_sr2_resolution_regressions');

let su: Client;
let a: IdentityFixture;

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  su = db.connectAs('postgres');
  await su.connect();
  a = await seedIdentity(db, TENANT_A);
}, 180_000);

afterAll(async () => {
  await su?.end();
});

/**
 * The binding row a login role resolves through, read from the registry itself.
 *
 * Not `authn.authenticated_principal()` directly: that function resolves from `session_user`, so
 * calling it over any connection answers a question about THAT connection. The registry row is the
 * durable record the resolver reads, and `actor_id`/`actor_type` are derived here exactly as the
 * resolver derives them — which is the point, since `tenant_id` and `user_id` are the two OUT
 * parameter names that collided.
 */
async function bindingFor(role: string): Promise<{
  actor_id: string | null;
  actor_type: string | null;
  tenant_id: string | null;
  user_id: string | null;
}> {
  const r = await su.query<{
    actor_id: string | null;
    actor_type: string | null;
    tenant_id: string | null;
    user_id: string | null;
  }>(
    `SELECT CASE WHEN principal_kind = 'human' THEN 'user:' || user_id::text
                 ELSE system_actor_id END          AS actor_id,
            CASE WHEN principal_kind = 'human' THEN 'human' ELSE 'system' END AS actor_type,
            tenant_id::text AS tenant_id, user_id::text AS user_id
       FROM authn.operator_binding
      WHERE role_name = $1 AND revoked_at IS NULL`,
    [role],
  );
  return r.rows[0] ?? { actor_id: null, actor_type: null, tenant_id: null, user_id: null };
}

describe('defect 1 — 42702, and why every human failed closed in silence', () => {
  it('resolves a HUMAN principal, populating both colliding OUT parameters', async () => {
    const role = await db.provisionOperator('reg42702', TENANT_A, a.adminUserId);
    const client = db.connectAsOperator(role);
    await client.connect();
    try {
      // Exercised through an entry point rather than by calling the resolver directly, because
      // that is the only way an operator can reach it — and because the defect only ever showed up
      // on this path. A `denied` or a `succeeded` both prove resolution happened; a 42702 does not.
      const r = await client.query<{ outcome: string; message: string | null }>(
        `SELECT * FROM admin.tenant_identity_summary($1, $2, $3)`,
        [TENANT_A, 'access_review', randomUUID()],
      );
      expect(r.rows[0]!.message ?? '', 'the resolver raised instead of resolving').not.toMatch(
        /ambiguous|42702/i,
      );
      expect(r.rows[0]!.outcome, r.rows[0]!.message ?? '').toBe('succeeded');
    } finally {
      await client.end();
    }

    // And the two OUT parameters that collided are both populated on the binding this resolved
    // against. With the defect, the statement that reads them never completed.
    const binding = await bindingFor(role);
    expect(binding.actor_type).toBe('human');
    expect(binding.tenant_id, 'tenant_id — one of the two colliding OUT parameter names').toBe(
      TENANT_A,
    );
    expect(binding.user_id, 'user_id — the other').toBe(a.adminUserId);
  });

  it('and the service branch alone would NOT have caught it — the control', async () => {
    // The reason the defect survived. A service principal returns before the human lookup runs, so
    // this passes with the bug present and passes without it. Asserted here so that a future
    // reviewer trimming the test above "because the service case already covers it" can see that
    // it does not.
    const role = await db.provisionSystemLogin('svc42702', 'system:tenant-provisioning');
    const client = db.connectAsOperator(role);
    await client.connect();
    try {
      const r = await client.query<{ outcome: string; message: string | null }>(
        `SELECT * FROM admin.provision_tenant($1, $2, $3, $4)`,
        [randomUUID(), 'Service branch', 'tenant_provisioning', randomUUID()],
      );
      expect(r.rows[0]!.outcome, r.rows[0]!.message ?? '').toBe('succeeded');
    } finally {
      await client.end();
    }

    const binding = await bindingFor(role);
    expect(binding.actor_type).toBe('system');
    // The service branch never populates these two — which is exactly why it never reached the
    // statement that raised.
    expect(binding.tenant_id).toBeNull();
    expect(binding.user_id).toBeNull();
  });

  it('the human branch reads the CURRENT user row, not a cached one', async () => {
    // The lookup that raised is the one that re-checks the mapped user is still active. If it were
    // ever dropped rather than fixed, a human resolution would still succeed — so the test above
    // would pass — while an inactive user kept its authority. This is what makes that statement
    // load-bearing rather than incidental.
    const userId = randomUUID();
    await su.query(
      `INSERT INTO users (id, tenant_id, organization_node_id, legal_entity_id,
                          authentication_provider, authentication_subject, display_name,
                          status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, 'oidc:example', $5, 'Suspendable', 'active', 'test', 'test')`,
      [userId, TENANT_A, a.regionNodeId, a.legalEntityId, `suspendable-${userId}`],
    );
    const role = await db.provisionOperator('suspendable', TENANT_A, userId);
    const client = db.connectAsOperator(role);
    await client.connect();
    try {
      // Active: resolves, and is refused on PERMISSION — which can only be reached after
      // resolution.
      const before = await client.query<{ outcome: string; message: string | null }>(
        `SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7)`,
        [
          TENANT_A,
          a.legalEntityNodeId,
          a.legalEntityId,
          `susp_${randomUUID().slice(0, 8)}`,
          'Suspendable probe',
          'identity_administration',
          randomUUID(),
        ],
      );
      expect(before.rows[0]!.outcome).toBe('denied');
      expect(before.rows[0]!.message ?? '').toMatch(/does not hold/);

      await su.query(`UPDATE users SET status = 'suspended', updated_by = 'test' WHERE id = $1`, [
        userId,
      ]);

      // Suspended: the SAME open connection no longer resolves at all. The binding is untouched;
      // the user is not active, and the re-check is what notices.
      await expect(
        client.query(`SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7)`, [
          TENANT_A,
          a.legalEntityNodeId,
          a.legalEntityId,
          `susp_${randomUUID().slice(0, 8)}`,
          'Suspendable probe',
          'identity_administration',
          randomUUID(),
        ]),
      ).rejects.toThrow(/bound to no FreightOS principal/i);
    } finally {
      await client.end();
    }
  });
});

describe('defect 2 — GRANT SELECT is not read access under FORCE RLS', () => {
  it('the registry owner can actually read public.users', async () => {
    // The privilege and the policy are two different things and the defect was believing the first
    // implied the second. Both are asserted, and then the read itself — because on a FORCE-RLS
    // table only the read proves anything.
    const priv = await su.query<{ ok: boolean }>(
      `SELECT has_table_privilege('freightos_operator_registry_owner', 'public.users', 'SELECT') AS ok`,
    );
    expect(priv.rows[0]!.ok, 'the grant is missing, so this is a different defect').toBe(true);

    const forced = await su.query<{ relforcerowsecurity: boolean }>(
      `SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.users'::regclass`,
    );
    expect(forced.rows[0]!.relforcerowsecurity, 'FORCE RLS is off, so this test proves nothing').toBe(
      true,
    );

    const policy = await su.query<{ policyname: string; cmd: string; roles: string }>(
      `SELECT policyname, cmd, roles::text AS roles FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'users'
          AND policyname = 'users_operator_registry_read'`,
    );
    expect(policy.rowCount, '0026 §2b read door is gone').toBe(1);
    expect(policy.rows[0]!.cmd).toBe('SELECT');
    // Role-disjoint: it names the registry owner and nobody else, so it widens nothing for any
    // role that could otherwise reach the table.
    expect(policy.rows[0]!.roles).toBe('{freightos_operator_registry_owner}');

    await su.query('SET ROLE freightos_operator_registry_owner');
    try {
      const seen = await su.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM public.users WHERE tenant_id = $1',
        [TENANT_A],
      );
      expect(Number(seen.rows[0]!.n), 'the registry owner reads zero rows').toBeGreaterThan(0);
    } finally {
      await su.query('RESET ROLE');
    }
  });

  it('provisioning a HUMAN binding works, which is what the missing read broke', async () => {
    // The symptom, not the mechanism: with the policy absent, an active user looked absent and
    // every human binding was refused. Provisioning one is therefore the end-to-end regression.
    const role = await db.provisionOperator('forcerls', TENANT_A, a.userId);
    const binding = await bindingFor(role);
    expect(binding.actor_type).toBe('human');
    expect(binding.actor_id).toBe(`user:${a.userId}`);
  });

  it('and refusing the read really does break it — the control', async () => {
    // Proves the two tests above are sensitive to §2b rather than passing for some other reason.
    // The policy is dropped and restored inside one transaction on the superuser connection, so
    // nothing outside this test ever sees the database without it.
    await su.query('BEGIN');
    try {
      await su.query('DROP POLICY users_operator_registry_read ON public.users');

      await su.query('SET LOCAL ROLE freightos_operator_registry_owner');
      const seen = await su.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM public.users WHERE tenant_id = $1',
        [TENANT_A],
      );
      await su.query('RESET ROLE');
      // The grant is still there. The read still returns nothing. That is the whole defect in two
      // lines, and it is why `has_table_privilege` was never going to catch it.
      const stillGranted = await su.query<{ ok: boolean }>(
        `SELECT has_table_privilege('freightos_operator_registry_owner', 'public.users', 'SELECT') AS ok`,
      );
      expect(stillGranted.rows[0]!.ok).toBe(true);
      expect(Number(seen.rows[0]!.n), 'dropping the policy did not blind the registry owner').toBe(
        0,
      );
    } finally {
      await su.query('ROLLBACK');
    }

    // And the door is back, so the rest of the suite is unaffected.
    const after = await su.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'users'
          AND policyname = 'users_operator_registry_read'`,
    );
    expect(Number(after.rows[0]!.n)).toBe(1);
  });
});
