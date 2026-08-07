/**
 * `packages/identity` — ADR-0024 layer L4.
 *
 * Owns organization nodes, legal entities, operating authorities, carrier appointments, users,
 * memberships, roles, permissions, service accounts and policy bindings
 * (docs/governance/DOMAIN_GLOSSARY.md §5).
 *
 * Depends on L0–L2 only. It holds no database migrations — ADR-0024 rule 5 keeps those in
 * `packages/database/migrations/` — and every module here mirrors an enforcement that already
 * exists in SQL. The mirror is for callers that want a refusal before a round trip; the database
 * remains the authority, and a test asserts the two agree wherever they overlap.
 */

export {
  MAX_ORGANIZATION_DEPTH,
  ORGANIZATION_NODE_TYPES,
  PERMITTED_NODE_PARENTS,
  ancestorsOf,
  depthOf,
  isPermittedNodeParent,
  isValidHierarchy,
  validateHierarchy,
  type HierarchyViolation,
  type OrganizationNodeShape,
  type OrganizationNodeType,
} from './organization.ts';

export {
  IDENTITY_RECORD_STATUSES,
  IDENTITY_STATUSES,
  ORGANIZATION_NODE_STATUSES,
  authorizesAt,
  isEffectiveAt,
  isNarrowingChange,
  isRevokedAt,
  type EffectiveDated,
  type IdentityRecord,
  type IdentityStatus,
  type Revocable,
} from './lifecycle.ts';

export {
  PHASE_1_PERMISSIONS,
  hasPermission,
  isPhase1Permission,
  resolveEffectivePermissions,
  type PermissionGrant,
  type Phase1Permission,
} from './permissions.ts';

export {
  POLICY_BINDING_DIRECTIONS,
  PROTECTED_CONTROL_CATEGORIES,
  isPermittedBinding,
  resolveEffectivePolicy,
  weakeningRejection,
  type EffectiveControl,
  type PolicyBinding,
  type PolicyBindingDirection,
  type ProtectedControlCategory,
  type WeakeningRejection,
} from './policy-inheritance.ts';

export {
  OUTCOMES,
  PRIVILEGED_PURPOSES,
  PURPOSES,
  PURPOSE_ORIGINS,
  PurposeError,
  TRUSTED_PURPOSE_ORIGINS,
  assertPrivilegedCall,
  isOutcome,
  isPrivilegedPurpose,
  isPurpose,
  privilegedRefusalReason,
  requireOutcome,
  requirePurpose,
  type Outcome,
  type PrivilegedCallContext,
  type Purpose,
  type PurposeOrigin,
} from './purpose.ts';

export {
  CREDENTIAL_TYPES,
  CredentialReferenceError,
  SERVICE_ACCOUNT_ACTOR_TYPES,
  assertCredentialReference,
  isServiceAccountActorType,
  isValidCredentialReference,
  validateCredentialReference,
  type CredentialReferenceInput,
  type CredentialType,
  type ServiceAccountActorType,
} from './service-account.ts';
