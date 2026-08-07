/**
 * The Phase 1 permission vocabulary and effective-permission resolution.
 *
 * OQ-16 records that no canonical action registry exists: `config/agents/registry.yaml` uses ~27
 * action strings absent from `config/policy/base_policy.yaml`, and two collide under different
 * names. Resolving that is a Phase 2 policy-engine deliverable.
 *
 * PR 2 therefore defines ONLY the Phase 1 subset — the actions PR 2's own tables support. A
 * permission naming a resource that does not exist would be a placeholder implying a capability
 * nobody has built. The list below is mirrored by the seed in migration 0008, and a test asserts
 * the two match exactly.
 */

import { authorizesAt, type IdentityRecord } from './lifecycle.ts';

export const PHASE_1_PERMISSIONS = [
  'identity.organization_node.read',
  'identity.organization_node.write',
  'identity.legal_entity.read',
  'identity.legal_entity.write',
  'identity.operating_authority.read',
  'identity.operating_authority.write',
  'identity.carrier_appointment.read',
  'identity.carrier_appointment.write',
  'identity.user.read',
  'identity.user.write',
  'identity.membership.read',
  'identity.membership.write',
  'identity.role.read',
  'identity.role.write',
  'identity.service_account.read',
  'identity.service_account.write',
  'identity.policy_binding.read',
  'identity.policy_binding.write',
  'governance.kill_switch.read',
  'governance.kill_switch.engage',
  'governance.kill_switch.release',
  'governance.audit.read',
] as const;
export type Phase1Permission = (typeof PHASE_1_PERMISSIONS)[number];

export function isPhase1Permission(value: unknown): value is Phase1Permission {
  return typeof value === 'string' && (PHASE_1_PERMISSIONS as readonly string[]).includes(value);
}

/**
 * A link in the chain from a user to a permission.
 *
 * Modelled as a flat list of links rather than a nested graph because the invariant being tested
 * is "every link must authorize at the same instant", and a flat list makes each link's
 * contribution — and each link's revocation — individually visible.
 */
export interface PermissionGrant {
  readonly permissionKey: string;
  /** user, membership, membership-role, role, role-permission: all five must authorize. */
  readonly chain: readonly IdentityRecord[];
}

/**
 * The permissions a subject actually holds at `asOf`.
 *
 * Mirrors `app.user_has_permission` and `app.service_account_has_permission`. A grant survives only
 * when every link in its chain authorizes: revoking the user, the membership, the role assignment,
 * the role, or the individual permission grant each independently ends it. That is what "revoked
 * memberships, roles, permissions and service accounts cease authorizing access" means when it is
 * written down rather than assumed.
 */
export function resolveEffectivePermissions(
  grants: readonly PermissionGrant[],
  asOf: Date,
): ReadonlySet<string> {
  const held = new Set<string>();
  for (const grant of grants) {
    if (grant.chain.length === 0) continue;
    if (grant.chain.every((link) => authorizesAt(link, asOf))) held.add(grant.permissionKey);
  }
  return held;
}

export function hasPermission(
  grants: readonly PermissionGrant[],
  permissionKey: string,
  asOf: Date,
): boolean {
  return resolveEffectivePermissions(grants, asOf).has(permissionKey);
}
