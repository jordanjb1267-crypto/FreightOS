import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import type { LegalContext } from '@freightos/context';
import { withLegalContext } from '../../src/session.ts';
import type { TestDatabase } from './harness.ts';

/**
 * Fixture for the PR 2 identity and organization tables.
 *
 * Seeds through `freightos_app` under `software_only` / `system` rather than through the control
 * plane, because ADR-0020 §7 gives the control plane no grant on any identity table. Tenant
 * administration under system scope is the authorized path (ADR-0019's matrix, identity row), so
 * the fixture exercises the same route real provisioning would.
 *
 * It seeds in three phases, and the phases are the point — F-05.
 *
 * System scope no longer widens anything. It used to short-circuit both scope predicates, so this
 * fixture could write every row from one context that named neither a node nor a legal entity, and
 * it therefore proved nothing about the hierarchy it was seeding. Now it earns each write:
 *
 *   1. the organization tree, under tenant scope, which is all `organization_nodes` policies ask;
 *   2. the legal entity, from a context holding the enterprise node — the closure makes every node
 *      in the tree a descendant of it;
 *   3. an administrator user, still under the bootstrap actor, because `users` carries no
 *      self-elevation guard and somebody has to exist first;
 *   4. everything below, acting AS that administrator — and the five authorization-graph tables
 *      through the governed admin boundary rather than directly, because R2-01 removed the
 *      application role's write privilege on all of them.
 *
 * That is the same sequence a real tenant provisioning flow has to follow, so a policy that would
 * reject real provisioning now rejects the fixture too.
 *
 * Phase 4 acts as a named person because the self-elevation guards require one — F-01. Writes to
 * memberships, membership_roles and role_permissions are changes to who may do what, and a session
 * that declines to say which user is making them is refused. The bootstrap actor `test:admin` used
 * to sail through all three guards for exactly that reason, which meant the fixture never
 * exercised them at all.
 *
 * The tree is four levels deep — enterprise > legal_entity > region > terminal — which is the
 * minimum that makes hierarchy traversal, inheritance and the depth of a governing legal entity
 * observable rather than trivially true.
 */

export interface IdentityFixture {
  readonly tenantId: string;
  /** The user the fixture acts AS for every guarded write — see seedIdentity. */
  readonly adminUserId: string;
  readonly enterpriseNodeId: string;
  readonly legalEntityNodeId: string;
  readonly regionNodeId: string;
  readonly terminalNodeId: string;
  readonly legalEntityId: string;
  readonly operatingAuthorityId: string;
  readonly carrierAppointmentId: string;
  readonly roleId: string;
  readonly userId: string;
  readonly membershipId: string;
  readonly membershipRoleId: string;
  readonly serviceAccountId: string;
  readonly serviceAccountCredentialId: string;
}

/**
 * `software_only` / `system` — tenant administration, naming no node and no legal entity.
 *
 * After F-05 this context carries no scope of its own. It is exactly what a caller may claim about
 * the character of its operation, and nothing more, so it reaches only what tenant isolation alone
 * allows: the organization tree. Anything scoped below the tenant needs `systemContextAt`.
 * legalEntityId is omitted by ADR-0015 rule 4.
 */
export function systemContext(tenantId: string, actorId = 'test:admin'): LegalContext {
  return {
    tenantId,
    legalAuthorityClass: 'software_only',
    operatingContext: 'system',
    actorId,
  };
}

/**
 * Tenant administration that names the node it administers, and optionally the legal entity.
 *
 * This is the authorized shape after F-05: the matrix says software_only/system may administer
 * identity and organization, and the closure says where. Holding the enterprise node is what makes
 * that reach the whole tenant — an authority the hierarchy grants rather than one the session
 * asserts.
 */
export function systemContextAt(
  tenantId: string,
  organizationNodeId: string,
  legalEntityId?: string,
  actorId = 'test:admin',
): LegalContext {
  return {
    tenantId,
    legalAuthorityClass: 'software_only',
    operatingContext: 'system',
    actorId,
    organizationNodeId,
    ...(legalEntityId === undefined ? {} : { legalEntityId }),
  };
}

/** `carrier_agent` / `carrier`, scoped to a legal entity and an organization node. */
export function carrierContextAt(
  tenantId: string,
  legalEntityId: string,
  organizationNodeId: string,
  actorId = 'test:actor',
): LegalContext {
  return {
    tenantId,
    legalAuthorityClass: 'carrier_agent',
    operatingContext: 'carrier',
    actorId,
    legalEntityId,
    organizationNodeId,
    carrierId: 'carrier-1',
    carrierAppointmentId: 'appointment-1',
  };
}

/** `software_only` / `facility_operator`, for the contexts ADR-0019 gives no identity write to. */
export function facilityContextAt(
  tenantId: string,
  legalEntityId: string,
  organizationNodeId: string,
  actorId = 'test:facility',
): LegalContext {
  return {
    tenantId,
    legalAuthorityClass: 'software_only',
    operatingContext: 'facility_operator',
    actorId,
    legalEntityId,
    organizationNodeId,
  };
}

async function insertNode(
  client: Client,
  tenantId: string,
  parentId: string | null,
  nodeType: string,
  name: string,
): Promise<string> {
  // organization_node_id is a self-reference, the same device tenants.tenant_id uses, so the id is
  // generated client-side and supplied twice — exactly as 0002_tenants does for a tenant row. The
  // CHECK is enforced on INSERT, so there is no window in which the two disagree.
  const id = randomUUID();
  await client.query(
    `INSERT INTO organization_nodes
       (id, tenant_id, organization_node_id, parent_id, node_type, name, created_by)
     VALUES ($1, $2, $1, $3, $4, $5, 'test:seed')`,
    [id, tenantId, parentId, nodeType, name],
  );
  return id;
}

/**
 * A privileged call over the administrative connection, unwrapped to its outcome.
 *
 * Every authorization-graph mutation goes through one of these — R2-01. A denial is returned rather
 * than raised (ADR-0026 §5), so a fixture that ignored the outcome would build a broken graph and
 * fail somewhere unrelated; this raises instead, with the reason the boundary gave.
 */
async function privileged(
  admin: Client,
  sql: string,
  params: readonly unknown[],
): Promise<Record<string, unknown>> {
  const r = await admin.query<{
    outcome: string;
    message: string | null;
    payload: Record<string, unknown>;
  }>(sql, [...params]);
  const result = r.rows[0]!;
  if (result.outcome !== 'succeeded') {
    throw new Error(`privileged call ${result.outcome}: ${result.message ?? 'no reason given'}`);
  }
  return result.payload;
}

/** Seed one tenant's full identity graph. The tenant row itself must already exist. */
export async function seedIdentity(db: TestDatabase, tenantId: string): Promise<IdentityFixture> {
  const app = db.connectAs('freightos_app');
  await app.connect();
  const admin = db.connectAs('freightos_admin');
  await admin.connect();
  try {
    return await seedIdentityWith(app, admin, tenantId);
  } finally {
    await app.end();
    await admin.end();
  }
}

async function seedIdentityWith(
  app: Client,
  admin: Client,
  tenantId: string,
): Promise<IdentityFixture> {
  // Phase 1 — the organization tree. `organization_nodes` is scoped by tenant alone, which is what
  // makes a tenant's first node creatable at all: there is no node to be inside of yet.
  const tree = await withLegalContext(app, systemContext(tenantId), async (c) => {
    const client = c as Client;
    const enterpriseNodeId = await insertNode(client, tenantId, null, 'enterprise', 'Enterprise');
    const legalEntityNodeId = await insertNode(
      client,
      tenantId,
      enterpriseNodeId,
      'legal_entity',
      'Operating Co',
    );
    const regionNodeId = await insertNode(client, tenantId, legalEntityNodeId, 'region', 'West');
    const terminalNodeId = await insertNode(client, tenantId, regionNodeId, 'terminal', 'Yard 1');
    return { enterpriseNodeId, legalEntityNodeId, regionNodeId, terminalNodeId };
  });
  const { enterpriseNodeId, legalEntityNodeId, regionNodeId, terminalNodeId } = tree;

  // Phase 2 — the legal entity, from the enterprise node. `legal_entities_insert` asks for node
  // scope and not for legal-entity scope, which is what lets a tenant create its first one.
  const legalEntityId = randomUUID();
  await withLegalContext(app, systemContextAt(tenantId, enterpriseNodeId), async (c) => {
    await (c as Client).query(
      `INSERT INTO legal_entities
         (id, tenant_id, organization_node_id, legal_entity_id, legal_name, jurisdiction,
          created_by)
       VALUES ($1, $2, $3, $1, 'Operating Co LLC', 'US-TX', 'test:seed')`,
      [legalEntityId, tenantId, legalEntityNodeId],
    );
  });

  // Phase 3 — the administrator. `users` has no self-elevation guard, which is what makes the
  // first person creatable: a guard requiring a named user would have nobody to name.
  const adminUserId = await withLegalContext(
    app,
    systemContextAt(tenantId, enterpriseNodeId, legalEntityId),
    async (c) => {
      const r = await (c as Client).query<{ id: string }>(
        `INSERT INTO users
           (tenant_id, organization_node_id, legal_entity_id, authentication_provider,
            authentication_subject, display_name, status, created_by)
         VALUES ($1, $2, $3, 'oidc:example', $4, 'Tenant Administrator', 'active', 'test:seed')
         RETURNING id`,
        // At the legal-entity node, not the enterprise root: `users` requires a node the stated
        // legal entity governs, and the root sits above that boundary.
        [tenantId, legalEntityNodeId, legalEntityId, `admin-${tenantId}`],
      );
      return r.rows[0]!.id;
    },
  );

  // Phase 4a — the rows that are NOT authority: operating authorities, the carrier appointment,
  // the operator user, and the service account with its credential. These stay direct, because
  // R2-01 removed the application role's write only where a write can change effective authority.
  const direct = await withLegalContext(
    app,
    systemContextAt(tenantId, enterpriseNodeId, legalEntityId, `user:${adminUserId}`),
    async (c) => {
      const client = c as Client;

      const authority = await client.query<{ id: string }>(
        `INSERT INTO operating_authorities
           (tenant_id, organization_node_id, legal_entity_id, legal_authority_class,
            operating_context, authority_type, authority_number, status, created_by)
         VALUES ($1, $2, $3, 'carrier_agent', 'carrier', 'motor_carrier', 'MC-000000', 'active',
                 'test:seed')
         RETURNING id`,
        [tenantId, legalEntityNodeId, legalEntityId],
      );
      const operatingAuthorityId = authority.rows[0]!.id;

      const appointment = await client.query<{ id: string }>(
        `INSERT INTO carrier_appointments
           (tenant_id, organization_node_id, legal_entity_id, operating_authority_id,
            carrier_reference, appointment_document_reference, status, created_by)
         VALUES ($1, $2, $3, $4, 'carrier-1', 'documents://appointments/carrier-1', 'active',
                 'test:seed')
         RETURNING id`,
        [tenantId, legalEntityNodeId, legalEntityId, operatingAuthorityId],
      );

      const user = await client.query<{ id: string }>(
        `INSERT INTO users
           (tenant_id, organization_node_id, legal_entity_id, authentication_provider,
            authentication_subject, display_name, status, created_by)
         VALUES ($1, $2, $3, 'oidc:example', $4, 'Test Operator', 'active', 'test:seed')
         RETURNING id`,
        [tenantId, terminalNodeId, legalEntityId, `subject-${tenantId}`],
      );

      const serviceAccount = await client.query<{ id: string }>(
        `INSERT INTO service_accounts
           (tenant_id, organization_node_id, legal_entity_id, key, name, actor_type, status,
            created_by)
         VALUES ($1, $2, $3, 'billing_sync', 'Billing Sync', 'integration', 'active', 'test:seed')
         RETURNING id`,
        [tenantId, regionNodeId, legalEntityId],
      );
      const serviceAccountId = serviceAccount.rows[0]!.id;

      const credential = await client.query<{ id: string }>(
        `INSERT INTO service_account_credentials
           (tenant_id, service_account_id, credential_type, credential_reference, status, created_by)
         VALUES ($1, $2, 'external_secret_reference', $3, 'active', 'test:seed')
         RETURNING id`,
        [tenantId, serviceAccountId, `secretsmanager://freightos/${tenantId}/billing-sync`],
      );

      return {
        operatingAuthorityId,
        carrierAppointmentId: appointment.rows[0]!.id,
        userId: user.rows[0]!.id,
        serviceAccountId,
        serviceAccountCredentialId: credential.rows[0]!.id,
      };
    },
  );

  // Phase 4b — the authorization graph, through the governed boundary — R2-01, and now 0018 §3.
  //
  // Five tables the application role can no longer write at all: roles, role_permissions,
  // memberships, membership_roles, service_account_permissions. A fixture that could still reach
  // these tables directly would be testing a database nobody deploys.
  //
  // The bootstrap chain runs as the approved PLATFORM actor, not as the administrator — 0018 §3.
  // Naming a real active user is no longer authority; the actor must independently hold the
  // permission the operation requires. The first administrator of a tenant cannot: the role that
  // would carry it does not exist yet, and the membership that would attach it is what is being
  // created. That circularity is precisely what `system:tenant-provisioning` is the approved
  // answer to, and it is a closed allowlist rather than any well-formed system: string.
  //
  // Once the administrator holds identity.role.write, later operations name the human. The seed
  // proves both halves: `bootstrap` gets the tenant off the ground, and the tests in
  // authority-remediation.test.ts §7 prove the human path works afterwards.
  const bootstrap = 'system:tenant-provisioning';
  const asPlatform = ['system', 'identity_administration'] as const;
  const asAdmin = ['human', 'identity_administration'] as const;

  const role = await privileged(
    admin,
    'SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [
      tenantId,
      legalEntityNodeId,
      legalEntityId,
      'fleet_administrator',
      'Fleet Administrator',
      bootstrap,
      ...asPlatform,
      randomUUID(),
    ],
  );
  const roleId = role['role_id'] as string;

  // The administrator role carries what an administrator actually needs. Before 0018 §3 the
  // boundary asked only whether the actor was a real active user, so a role with one read
  // permission was indistinguishable from one with none — the fixture never noticed. It does now:
  // every later operation that names the human requires the matching write permission.
  for (const permission of [
    'identity.user.read',
    'identity.role.write',
    'identity.membership.write',
    'identity.service_account.write',
  ]) {
    await privileged(
      admin,
      'SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5, $6, $7)',
      [tenantId, roleId, permission, bootstrap, ...asPlatform, randomUUID()],
    );
  }

  // The administrator's own membership and role. Without it the administrator holds no permission
  // at all, which before 0018 §3 made no difference — the boundary asked only whether the actor
  // was a real active user — and now makes every human-authorised operation fail. Provisioning it
  // is the platform actor's job, and it is the last thing the platform actor does: everything
  // after this point can name the human.
  const adminMembership = await privileged(
    admin,
    'SELECT * FROM admin.grant_membership($1, $2, $3, $4, $5, $6, $7, $8)',
    [
      tenantId,
      adminUserId,
      // The legal-entity node, not the enterprise above it: a membership must name a node the
      // legal entity actually governs, and the closure makes everything below it in scope.
      legalEntityNodeId,
      legalEntityId,
      bootstrap,
      ...asPlatform,
      randomUUID(),
    ],
  );
  await privileged(
    admin,
    'SELECT * FROM admin.assign_membership_role($1, $2, $3, $4, $5, $6, $7)',
    [
      tenantId,
      adminMembership['membership_id'] as string,
      roleId,
      bootstrap,
      ...asPlatform,
      randomUUID(),
    ],
  );

  const membership = await privileged(
    admin,
    'SELECT * FROM admin.grant_membership($1, $2, $3, $4, $5, $6, $7, $8)',
    [tenantId, direct.userId, terminalNodeId, legalEntityId, bootstrap, ...asPlatform, randomUUID()],
  );
  const membershipId = membership['membership_id'] as string;

  const membershipRole = await privileged(
    admin,
    'SELECT * FROM admin.assign_membership_role($1, $2, $3, $4, $5, $6, $7)',
    [tenantId, membershipId, roleId, bootstrap, ...asPlatform, randomUUID()],
  );

  await privileged(
    admin,
    'SELECT * FROM admin.grant_service_account_permission($1, $2, $3, $4, $5, $6, $7)',
    [
      tenantId,
      direct.serviceAccountId,
      'identity.user.read',
      bootstrap,
      ...asPlatform,
      randomUUID(),
    ],
  );

  return {
    tenantId,
    adminUserId,
    enterpriseNodeId,
    legalEntityNodeId,
    regionNodeId,
    terminalNodeId,
    legalEntityId,
    operatingAuthorityId: direct.operatingAuthorityId,
    carrierAppointmentId: direct.carrierAppointmentId,
    roleId,
    userId: direct.userId,
    membershipId,
    membershipRoleId: membershipRole['membership_role_id'] as string,
    serviceAccountId: direct.serviceAccountId,
    serviceAccountCredentialId: direct.serviceAccountCredentialId,
  };
}

/** The twelve tenant-owned tables PR 2 adds, plus the three relationship tables. */
export const PR2_TABLES = [
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
] as const;

/** Every PR 2 table except the global permission catalog, which is deliberately not tenant-owned. */
export const PR2_TENANT_OWNED_TABLES = PR2_TABLES.filter((t) => t !== 'permissions');
