import type { Client } from 'pg';
import { seedIdentityWith, type IdentityFixture } from './identity-harness.ts';
import type { TestDatabase } from './harness.ts';

/**
 * Fixture and drivers for the SR-2 verified-actor-binding gate.
 *
 * WHY PROVISIONING RUNS AS THE MIGRATOR AND NOT AS `freightos_app`.
 *
 * Migration 0019 makes `freightos_app` fail closed without an installed binding, and a binding can
 * only be minted for a principal that already exists with an active membership. The first user of a
 * tenant therefore cannot be created by a verified runtime session — the row that would justify the
 * binding is the row being created. That circularity is real and is recorded as an open item in the
 * SR-2 design note; it is not something this fixture may paper over by loosening the database.
 *
 * So the identity graph is seeded over a `freightos_migrator` connection, which is the deployment
 * authority the runbooks already name, and which migration 0019 §4 keeps in the authoritative policy
 * role lists. That connection is still fully RLS-subject: every one of these tables carries FORCE
 * ROW LEVEL SECURITY, so the seed is refused by exactly the policies a real provisioning path would
 * meet. What it is NOT is a runtime path, and nothing in the gate treats it as one — every security
 * assertion below runs as `freightos_app` holding a binding it obtained through the real door.
 *
 * The authorization graph still goes through `freightos_admin` and the `admin.*` boundary, exactly
 * as identity-harness.ts does, because R2-01 admits no other route.
 */

/** Which principal a binding is being minted for. */
export interface MintRequest {
  readonly principalType: 'human' | 'service';
  readonly principalId: string;
  readonly tenantId: string;
  readonly organizationNodeId: string;
  readonly legalEntityId: string | null;
  readonly legalAuthorityClass?: string;
  readonly operatingContext?: string;
  readonly targetBackendPid: number;
  readonly issuedBy?: string;
  readonly installableSeconds?: number;
}

/** The backend pid of a connection — server-observed, never client-asserted. */
export async function backendPid(client: Client): Promise<number> {
  const r = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
  return r.rows[0]!.pid;
}

/**
 * Mint a binding over the control-plane connection.
 *
 * This is the trusted issuance boundary standing in for an authentication adapter. It asserts an
 * authentication result; it does not perform one. Everything it can still refuse — an inactive
 * principal, a tenant or node no membership justifies — it refuses here rather than at use.
 */
export async function mintBinding(admin: Client, request: MintRequest): Promise<string> {
  const r = await admin.query<{ issue_session_binding: string }>(
    'SELECT admin.issue_session_binding($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
    [
      request.principalType,
      request.principalId,
      request.tenantId,
      request.organizationNodeId,
      request.legalEntityId,
      request.legalAuthorityClass ?? 'carrier_agent',
      request.operatingContext ?? 'carrier',
      request.targetBackendPid,
      request.issuedBy ?? 'test:issuer',
      request.installableSeconds ?? 60,
    ],
  );
  return r.rows[0]!.issue_session_binding;
}

/**
 * Install a binding on the connection it was minted for.
 *
 * Deliberately a bare call rather than a helper that also opens a transaction: several gate cases
 * turn on which transaction is open, at what isolation level, and how it was opened, and every one
 * of those has to be driven statement by statement as its own protocol execution.
 */
export async function installBinding(app: Client, binding: string): Promise<void> {
  await app.query('SELECT app.begin_verified_session($1)', [binding]);
}

/** The six authoritative accessors, read in one statement. */
export interface ResolvedContext {
  tenantId: string | null;
  actorId: string | null;
  organizationNodeId: string | null;
  legalEntityId: string | null;
  userId: string | null;
  humanPrincipal: string | null;
}

export async function resolvedContext(client: Client): Promise<ResolvedContext> {
  const r = await client.query<{
    tenant_id: string | null;
    actor_id: string | null;
    organization_node_id: string | null;
    legal_entity_id: string | null;
    user_id: string | null;
    human_principal: string | null;
  }>(
    `SELECT app.current_tenant_id()::text            AS tenant_id,
            app.current_actor_id()                   AS actor_id,
            app.current_organization_node_id()::text AS organization_node_id,
            app.current_legal_entity_id()::text      AS legal_entity_id,
            app.current_user_id()::text              AS user_id,
            app.current_human_principal()::text      AS human_principal`,
  );
  const row = r.rows[0]!;
  return {
    tenantId: row.tenant_id,
    actorId: row.actor_id,
    organizationNodeId: row.organization_node_id,
    legalEntityId: row.legal_entity_id,
    userId: row.user_id,
    humanPrincipal: row.human_principal,
  };
}

/**
 * Write the legacy caller-controlled GUCs, with no validation whatsoever.
 *
 * `applyLegalContext` in src/session.ts refuses malformed shapes before it writes anything, which is
 * the wrong instrument for a forgery test: the point is to put an attacker's value into the session
 * the way an unvalidated caller could and prove the database does not believe it. So this writes
 * `set_config` directly, parameterised, and asserts nothing.
 */
export async function forgeLegacyClaims(
  client: Client,
  claims: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [key, value] of Object.entries(claims)) {
    await client.query('SELECT set_config($1, $2, true)', [key, value]);
  }
}

/**
 * Run `work` as `role`, over the connection that administers it.
 *
 * Every NOLOGIN role in this system is reachable only this way. The migrator holds SET on each of
 * them WITHOUT INHERIT, which is the whole point: it can deliberately become one for a statement and
 * never picks their rights up by accident. `SET LOCAL ROLE` needs a transaction, so one is opened
 * here and always ended.
 */
export async function asRole<T>(
  db: TestDatabase,
  role: string,
  work: (client: Client) => Promise<T>,
): Promise<T> {
  const client = db.connectAsMigrator();
  await client.connect();
  try {
    await client.query('BEGIN');
    try {
      await client.query(`SET LOCAL ROLE ${role}`);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

/** One stored binding row, read through the ownership door rather than through a runtime grant. */
export interface StoredBinding {
  principal_type: string;
  user_id: string | null;
  service_account_id: string | null;
  tenant_id: string;
  organization_node_id: string;
  legal_entity_id: string | null;
  target_backend_pid: number;
  issued_by: string;
  installed_xact_id: string | null;
  installed_backend_pid: number | null;
  installed_at: string | null;
}

/**
 * Read a binding row for inspection.
 *
 * `freightos_admin` cannot do this — it has no USAGE on schema app at all — and `freightos_app` must
 * not be able to. The only role that may see these rows is the table's owner, so that is who reads
 * them here. Test inspection uses the same door the security model defines; it does not open a new
 * one.
 */
export async function readBinding(db: TestDatabase, id: string): Promise<StoredBinding | null> {
  return asRole(db, 'freightos_binding_owner', async (client) => {
    const r = await client.query<StoredBinding>(
      `SELECT principal_type, user_id::text, service_account_id::text, tenant_id::text,
              organization_node_id::text, legal_entity_id::text, target_backend_pid, issued_by,
              installed_xact_id::text, installed_backend_pid, installed_at::text
         FROM app.session_binding WHERE id = $1`,
      [id],
    );
    return r.rows[0] ?? null;
  });
}

/**
 * Move a binding's installation deadline into the past.
 *
 * Expiry is tested by moving the deadline rather than by sleeping: a sleep makes the case
 * timing-dependent in CI, and the control under test is the `installable_until` column, not the
 * clock.
 */
export async function expireBinding(db: TestDatabase, id: string): Promise<void> {
  await asRole(db, 'freightos_binding_owner', async (client) => {
    // issued_at moves with it: `session_binding_installable_window` requires the deadline to be
    // after issuance, so pushing only the deadline into the past is rejected by the table itself.
    const r = await client.query(
      `UPDATE app.session_binding
          SET issued_at = now() - interval '1 hour',
              installable_until = now() - interval '1 second'
        WHERE id = $1`,
      [id],
    );
    if (r.rowCount !== 1) throw new Error(`expireBinding matched ${r.rowCount} rows, expected 1`);
  });
}

/** The legacy context an identity change is made under. */
export interface ChangeContext {
  readonly tenantId: string;
  /** A real, active user. The 0018 §3 guards refuse a change to authority that names nobody. */
  readonly actorUserId: string;
  readonly organizationNodeId: string;
  readonly legalEntityId: string;
}

/**
 * Commit a change to identity state from a second connection, as the control plane.
 *
 * `role` is the writer, and which one is correct depends on the table, because the grants are not
 * uniform: `freightos_admin_owner` — the role the `admin.*` boundary runs as, and a member of
 * `freightos_control_plane` — holds UPDATE on `memberships` but only SELECT on `users`, while the
 * migrator holds UPDATE on both and satisfies `users_update` through its tenant context rather than
 * through `is_control_plane()`. Passing the wrong one produces `permission denied for table ...`,
 * which is a loud failure rather than a silent no-op, and that is the property that matters.
 *
 * Whichever it is, `session_user` remains the migrator, so the accessors take their legacy GUC
 * branch and the context below is what they read — correct here, because this is a provisioning and
 * control-plane path, not a runtime one.
 *
 * The context names a real active user because 0018 §3 requires it: a change to who holds authority
 * must name the person making it, and an unnamed caller is refused with Art. I.5.
 *
 * The row count is checked. An UPDATE that RLS silently narrows to zero rows raises nothing, and a
 * revocation test whose revocation never happened would pass by observing no change — which is
 * exactly what an earlier version of this helper did.
 */
export async function commitIdentityChange(
  db: TestDatabase,
  role: string,
  context: ChangeContext,
  sql: string,
  params: readonly unknown[],
  expectedRows = 1,
): Promise<void> {
  await asRole(db, role, async (client) => {
    for (const [key, value] of [
      ['app.tenant_id', context.tenantId],
      ['app.actor_id', `user:${context.actorUserId}`],
      ['app.organization_node_id', context.organizationNodeId],
      ['app.legal_entity_id', context.legalEntityId],
      ['app.legal_authority_class', 'software_only'],
      ['app.operating_context', 'system'],
    ] as const) {
      await client.query('SELECT set_config($1, $2, true)', [key, value]);
    }
    const r = await client.query(sql, [...params]);
    if (r.rowCount !== expectedRows) {
      throw new Error(`identity change matched ${r.rowCount} rows, expected ${expectedRows}`);
    }
  });
}

/** Seed one tenant's identity graph over the provisioning connection. */
export async function seedVerifiedFixture(
  db: TestDatabase,
  tenantId: string,
): Promise<IdentityFixture> {
  const provisioner = db.connectAsMigrator();
  await provisioner.connect();
  const admin = db.connectAs('freightos_admin');
  await admin.connect();
  try {
    return await seedIdentityWith(provisioner, admin, tenantId);
  } finally {
    await provisioner.end();
    await admin.end();
  }
}
