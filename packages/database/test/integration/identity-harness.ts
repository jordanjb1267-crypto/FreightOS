import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import type { LegalContext } from '../../../context/src/legal.ts';
import { withLegalContext } from '../../src/session.ts';

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
 *   3. everything below, from a context holding that node AND the legal entity it just created.
 *
 * That is the same sequence a real tenant provisioning flow has to follow, so a policy that would
 * reject real provisioning now rejects the fixture too.
 *
 * The tree is four levels deep — enterprise > legal_entity > region > terminal — which is the
 * minimum that makes hierarchy traversal, inheritance and the depth of a governing legal entity
 * observable rather than trivially true.
 */

export interface IdentityFixture {
  readonly tenantId: string;
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

/** Seed one tenant's full identity graph. The tenant row itself must already exist. */
export async function seedIdentity(app: Client, tenantId: string): Promise<IdentityFixture> {
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

  // Phase 3 — everything scoped to both a node and a legal entity.
  return withLegalContext(
    app,
    systemContextAt(tenantId, enterpriseNodeId, legalEntityId),
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

      const role = await client.query<{ id: string }>(
        `INSERT INTO roles
         (tenant_id, organization_node_id, legal_entity_id, key, name, created_by)
       VALUES ($1, $2, $3, 'fleet_administrator', 'Fleet Administrator', 'test:seed')
       RETURNING id`,
        [tenantId, legalEntityNodeId, legalEntityId],
      );
      const roleId = role.rows[0]!.id;

      await client.query(
        `INSERT INTO role_permissions (tenant_id, role_id, permission_id, created_by)
       SELECT $1, $2, id, 'test:seed' FROM permissions WHERE key = 'identity.user.read'`,
        [tenantId, roleId],
      );

      const user = await client.query<{ id: string }>(
        `INSERT INTO users
         (tenant_id, organization_node_id, legal_entity_id, authentication_provider,
          authentication_subject, display_name, status, created_by)
       VALUES ($1, $2, $3, 'oidc:example', $4, 'Test Operator', 'active', 'test:seed')
       RETURNING id`,
        [tenantId, terminalNodeId, legalEntityId, `subject-${tenantId}`],
      );
      const userId = user.rows[0]!.id;

      const membership = await client.query<{ id: string }>(
        `INSERT INTO memberships
         (tenant_id, organization_node_id, legal_entity_id, user_id, status, created_by)
       VALUES ($1, $2, $3, $4, 'active', 'test:seed')
       RETURNING id`,
        [tenantId, terminalNodeId, legalEntityId, userId],
      );
      const membershipId = membership.rows[0]!.id;

      const membershipRole = await client.query<{ id: string }>(
        `INSERT INTO membership_roles (tenant_id, membership_id, role_id, created_by)
       VALUES ($1, $2, $3, 'test:seed')
       RETURNING id`,
        [tenantId, membershipId, roleId],
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

      await client.query(
        `INSERT INTO service_account_permissions
         (tenant_id, service_account_id, permission_id, created_by)
       SELECT $1, $2, id, 'test:seed' FROM permissions WHERE key = 'identity.user.read'`,
        [tenantId, serviceAccountId],
      );

      return {
        tenantId,
        enterpriseNodeId,
        legalEntityNodeId,
        regionNodeId,
        terminalNodeId,
        legalEntityId,
        operatingAuthorityId,
        carrierAppointmentId: appointment.rows[0]!.id,
        roleId,
        userId,
        membershipId,
        membershipRoleId: membershipRole.rows[0]!.id,
        serviceAccountId,
        serviceAccountCredentialId: credential.rows[0]!.id,
      };
    },
  );
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
