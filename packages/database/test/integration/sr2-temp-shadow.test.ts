import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { authenticateTestPrincipal } from './verified-test-auth.ts';
import { controlPlaneIssuer } from '../../src/verified-session.ts';
import { backendPid, commitIdentityChange, installBinding } from './sr2-harness.ts';
import { TENANT_A, TestDatabase } from './harness.ts';
import { seedIdentity, type IdentityFixture } from './identity-harness.ts';

/**
 * SR-2 — F-01 and F-02. Relation shadowing through `pg_temp`.
 *
 * THE DEFECT THESE REPRODUCE. Every authorization function in this schema referenced its tables by
 * unqualified name. PostgreSQL searches the session's temporary schema FIRST for relations whenever
 * `pg_temp` is not explicitly listed in `search_path` — and that is true even inside a
 * SECURITY DEFINER function with a pinned path, because pinning `pg_catalog, public` does not
 * exclude the implicit `pg_temp`. `freightos_app` held `TEMPORARY` on the database through
 * PostgreSQL's default PUBLIC grant, so a runtime session could create a table that shadowed the
 * one the resolver reads.
 *
 * Measured before migration 0023, on a session holding a genuine verified binding:
 *
 *   F-01  shadow `users` and `memberships`, then let the control plane revoke the real membership
 *         and commit. app.current_tenant_id() still returned the tenant on the NEXT statement of
 *         the same open transaction, where it must return NULL. Fail-open: a committed revocation
 *         was not observed.
 *
 *   F-02  shadow `organization_node_closure`. app.verified_scope_node_ids() went from 1 node to 4,
 *         and a principal bound at the TERMINAL node read a user row on the legal-entity node
 *         above it. Node scope became caller-determined.
 *
 * Neither is a logging or provenance mismatch. Both are authorization decisions taken from data the
 * caller wrote, which is exactly what SR-2 exists to make impossible.
 *
 * THESE TESTS DO NOT ASSERT THE FIX'S MECHANISM. They assert the property: a caller cannot move the
 * authorization boundary. They passed nothing before 0022 and must keep passing if the remediation
 * is ever replaced by a different one.
 */
const db = new TestDatabase('freightos_test_sr2_temp_shadow');

let a: IdentityFixture;

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  a = await seedIdentity(db, TENANT_A);
}, 120_000);

afterAll(async () => undefined);

/** Alice — the operator, bound at the TERMINAL node, the narrowest scope the fixture has. */
const alice = () => ({
  kind: 'human' as const,
  principalId: a.userId,
  tenantId: TENANT_A,
  organizationNodeId: a.terminalNodeId,
  legalEntityId: a.legalEntityId,
});

interface Session {
  readonly app: Client;
  readonly admin: Client;
  install(): Promise<void>;
  close(): Promise<void>;
}

async function session(): Promise<Session> {
  const app = db.connectAs('freightos_app');
  await app.connect();
  const admin = db.connectAs('freightos_admin');
  await admin.connect();
  const issuer = controlPlaneIssuer(admin);
  return {
    app,
    admin,
    install: async () => {
      const binding = await issuer.issue(authenticateTestPrincipal(alice()), await backendPid(app));
      await app.query('BEGIN');
      await app.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await installBinding(app, binding);
    },
    close: async () => {
      await app.query('ROLLBACK').catch(() => undefined);
      await app.end();
      await admin.end();
    },
  };
}

/** Attempt the shadow. Returns the error if the database refused it — which is the fix working. */
async function shadow(app: Client, ddl: string, dml: string, params: unknown[]): Promise<string> {
  try {
    await app.query(ddl);
    await app.query(dml, params);
    await app.query('GRANT SELECT ON ALL TABLES IN SCHEMA pg_temp TO PUBLIC');
    return 'created';
  } catch (e) {
    return (e as Error).message;
  }
}

describe('F-01/F-02 — a caller cannot shadow the relations authorization reads', () => {
  it('denies the runtime role the ability to create a shadowing relation at all', async () => {
    // The class-closing control. `freightos_app` holds CREATE on no schema, so `pg_temp` was its
    // only route to introducing a relation the resolver might read.
    const app = db.connectAs('freightos_app');
    await app.connect();
    try {
      const priv = await app.query<{ temp: boolean }>(
        `SELECT has_database_privilege(current_user, current_database(), 'TEMPORARY') AS temp`,
      );
      expect(priv.rows[0]!.temp, 'the runtime role can still create temporary relations').toBe(
        false,
      );

      const refused = await app.query('CREATE TEMP TABLE shadow_probe (x integer)').then(
        () => null,
        (e: Error) => e.message,
      );
      expect(refused, 'a temporary relation was created by the runtime role').not.toBeNull();
      expect(refused).toMatch(/permission denied/i);

      // And it holds CREATE nowhere else either, so there is no second route.
      const schemas = await app.query<{ nspname: string; can: boolean }>(
        `SELECT n.nspname, has_schema_privilege(current_user, n.nspname, 'CREATE') AS can
           FROM pg_namespace n
          WHERE n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema'`,
      );
      expect(
        schemas.rows.filter((r) => r.can).map((r) => r.nspname),
        'the runtime role can create relations in a schema',
      ).toEqual([]);
    } finally {
      await app.end();
    }
  });

  it('F-01: a committed revocation is still observed by the next statement', async () => {
    const s = await session();
    try {
      // The attack, attempted before any verified statement so the resolver's plan would be built
      // with the shadow already visible.
      const usersShadow = await shadow(
        s.app,
        `CREATE TEMP TABLE users
           (id uuid, tenant_id uuid, organization_node_id uuid, legal_entity_id uuid,
            status text, revoked_at timestamptz, effective_from timestamptz,
            effective_to timestamptz)`,
        `INSERT INTO pg_temp.users VALUES ($1,$2,$3,$4,'active',NULL,now() - interval '1 day',NULL)`,
        [a.userId, TENANT_A, a.terminalNodeId, a.legalEntityId],
      );
      const membershipsShadow = await shadow(
        s.app,
        `CREATE TEMP TABLE memberships
           (id uuid, tenant_id uuid, user_id uuid, organization_node_id uuid, legal_entity_id uuid,
            status text, revoked_at timestamptz, effective_from timestamptz,
            effective_to timestamptz)`,
        `INSERT INTO pg_temp.memberships
           VALUES (gen_random_uuid(),$1,$2,$3,$4,'active',NULL,now() - interval '1 day',NULL)`,
        [TENANT_A, a.userId, a.terminalNodeId, a.legalEntityId],
      );
      expect(usersShadow, 'the users shadow was created').toMatch(/permission denied/i);
      expect(membershipsShadow, 'the memberships shadow was created').toMatch(/permission denied/i);

      await s.install();
      const before = await s.app.query<{ t: string | null }>(
        'SELECT app.current_tenant_id()::text AS t',
      );
      expect(before.rows[0]!.t, 'the positive control never held authority').toBe(TENANT_A);

      // The control plane revokes Alice's REAL membership and commits, on another connection.
      await commitIdentityChange(
        db,
        'freightos_admin_owner',
        {
          tenantId: TENANT_A,
          actorUserId: a.adminUserId,
          organizationNodeId: a.enterpriseNodeId,
          legalEntityId: a.legalEntityId,
        },
        `UPDATE memberships SET status='revoked', revoked_at=now(), revoked_by='f01'
          WHERE tenant_id=$1 AND user_id=$2 AND status='active'`,
        [TENANT_A, a.userId],
        1,
      );

      // Next statement, same open transaction. The revocation must be observed.
      const after = await s.app.query<{ t: string | null }>(
        'SELECT app.current_tenant_id()::text AS t',
      );
      expect(after.rows[0]!.t, 'F-01: authority survived a committed revocation').toBeNull();
      const rows = await s.app.query('SELECT id FROM users');
      expect(rows.rowCount, 'F-01: rows remained visible after a committed revocation').toBe(0);
    } finally {
      await s.close();
      // Tolerant: if the case failed before revoking, there is nothing to restore, and the restore
      // must not become the reported error.
      await commitIdentityChange(
        db,
        'freightos_admin_owner',
        {
          tenantId: TENANT_A,
          actorUserId: a.adminUserId,
          organizationNodeId: a.enterpriseNodeId,
          legalEntityId: a.legalEntityId,
        },
        `UPDATE memberships SET status='active', revoked_at=NULL, revoked_by=NULL
          WHERE tenant_id=$1 AND user_id=$2 AND status='revoked'`,
        [TENANT_A, a.userId],
        1,
      ).catch(() => undefined);
    }
  });

  it('holds even with TEMPORARY granted back — the layers are independent, not one control', async () => {
    // The two cases above pass because the database refuses the DDL, which means they exercise §1
    // of migration 0023 and nothing else. A three-layer claim that only ever tests the outermost
    // layer is a one-layer fix with two paragraphs of comment, so this case removes §1 for the
    // duration and asserts the attack still fails on §2 and §3 alone.
    //
    // Scoped to this file's own database, and returned in the finally.
    const owner = db.connectAsMigrator();
    await owner.connect();
    await owner.query(`GRANT TEMPORARY ON DATABASE ${db.name} TO PUBLIC`);

    const s = await session();
    try {
      const closureShadow = await shadow(
        s.app,
        `CREATE TEMP TABLE organization_node_closure
           (tenant_id uuid, ancestor_id uuid, descendant_id uuid, depth integer)`,
        `INSERT INTO pg_temp.organization_node_closure
           VALUES ($1,$2,$3,1),($1,$2,$4,1),($1,$2,$5,1),($1,$2,$6,1)`,
        [
          TENANT_A,
          a.terminalNodeId,
          a.enterpriseNodeId,
          a.legalEntityNodeId,
          a.regionNodeId,
          a.terminalNodeId,
        ],
      );
      // This time the shadow really is created — that is the point of the case.
      expect(closureShadow, 'the shadow could not be created, so this proves nothing').toBe(
        'created',
      );

      await s.install();

      // §3 schema-qualifies the closure read and §2 demotes pg_temp, so the resolver reads the real
      // table regardless. Scope is still exactly Alice's one terminal node.
      const scope = await s.app.query('SELECT n FROM app.verified_scope_node_ids() AS n');
      expect(scope.rowCount, 'the shadow widened node scope with TEMPORARY restored').toBe(1);
      const above = await s.app.query('SELECT id FROM users WHERE id = $1', [a.adminUserId]);
      expect(above.rowCount, 'the shadow reached a node above the membership').toBe(0);
      const own = await s.app.query('SELECT id FROM users WHERE id = $1', [a.userId]);
      expect(own.rowCount, 'Alice lost her own row').toBe(1);

      // And with the caller's OWN search_path put to the worst arrangement it can name. This is the
      // case that isolates §3 by itself: app.verified_scope_node_ids() is invoker-rights and
      // deliberately carries NO SET clause — a proconfig would block SQL inlining and undo the plan
      // shapes P-01 depends on — so §2 does not protect it and only schema-qualification does.
      await s.app.query('SET LOCAL search_path = pg_temp, public, pg_catalog');
      const worst = await s.app.query('SELECT n FROM app.verified_scope_node_ids() AS n');
      expect(worst.rowCount, 'a caller moved its scope by naming pg_temp first').toBe(1);
      const worstAbove = await s.app.query('SELECT id FROM users WHERE id = $1', [a.adminUserId]);
      expect(worstAbove.rowCount, 'a caller reached above its node by naming pg_temp first').toBe(
        0,
      );
      const tenant = await s.app.query<{ t: string | null }>(
        'SELECT app.current_tenant_id()::text AS t',
      );
      expect(tenant.rows[0]!.t, 'the caller path changed the resolved tenant').toBe(TENANT_A);
    } finally {
      await s.close();
      await owner
        .query(`REVOKE TEMPORARY ON DATABASE ${db.name} FROM PUBLIC`)
        .catch(() => undefined);
      await owner.end();
    }
  });

  it('F-02: organization-node scope stays where the membership put it', async () => {
    const s = await session();
    try {
      const closureShadow = await shadow(
        s.app,
        `CREATE TEMP TABLE organization_node_closure
           (tenant_id uuid, ancestor_id uuid, descendant_id uuid, depth integer)`,
        `INSERT INTO pg_temp.organization_node_closure
           VALUES ($1,$2,$3,1),($1,$2,$4,1),($1,$2,$5,1),($1,$2,$6,1)`,
        [
          TENANT_A,
          a.terminalNodeId,
          a.enterpriseNodeId,
          a.legalEntityNodeId,
          a.regionNodeId,
          a.terminalNodeId,
        ],
      );
      expect(closureShadow, 'the closure shadow was created').toMatch(/permission denied/i);

      await s.install();

      // The positive control: Alice's legitimate scope still works and is exactly one node.
      const scope = await s.app.query('SELECT n FROM app.verified_scope_node_ids() AS n');
      expect(scope.rowCount, 'Alice lost her own legitimate node scope').toBe(1);

      // And she sees herself, not the administrator on the legal-entity node above her.
      const own = await s.app.query('SELECT id FROM users WHERE id = $1', [a.userId]);
      expect(own.rowCount, 'Alice cannot see her own row').toBe(1);
      const above = await s.app.query('SELECT id FROM users WHERE id = $1', [a.adminUserId]);
      expect(above.rowCount, 'F-02: node scope widened to a node above the membership').toBe(0);
    } finally {
      await s.close();
    }
  });
});
