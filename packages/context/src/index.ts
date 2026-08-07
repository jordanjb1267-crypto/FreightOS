export {
  LEGAL_AUTHORITY_CLASSES,
  OPERATING_CONTEXTS,
  PERMITTED_CONTEXTS,
  SYSTEM_TENANT_ID,
  LegalContextError,
  assertLegalContext,
  fromAuthorityMode,
  isValidLegalContext,
  validateLegalContext,
  type LegalAuthorityClass,
  type LegalContext,
  type OperatingContext,
  type ValidationOptions,
} from './legal.ts';

export {
  RESOURCE_GROUPS,
  CapabilityError,
  assertCapability,
  capabilityFor,
  contextCapabilities,
  isPermittedAction,
  type Capability,
  type CapabilitySet,
  type ResourceAction,
  type ResourceGroup,
} from './capabilities.ts';

export {
  CROSS_TENANT_KILL_SWITCH_SCOPES,
  KILL_SWITCH_MODES,
  KILL_SWITCH_SCOPES,
  capabilitiesFor,
  modeRestrictiveness,
  resolveKillSwitch,
  type KillSwitchMode,
  type KillSwitchRecord,
  type KillSwitchScope,
  type ModeCapabilities,
  type Resolution,
  type ResolutionRequest,
} from './kill-switch.ts';

/**
 * SR-2 verified principals — TYPES AND READERS ONLY.
 *
 * The constructors live in `@freightos/context/authentication-boundary` and are deliberately absent
 * here, so that importing `@freightos/context` gives a module the ability to RECEIVE a verified
 * principal and no ability to invent one. `packages/context/test/unit/production-exports.test.ts`
 * asserts that separation from the package manifest rather than from this comment.
 */
export {
  describePrincipal,
  expectedActorId,
  isHumanPrincipal,
  isServicePrincipal,
  principalId,
  type PrincipalType,
  type VerifiedHumanPrincipal,
  type VerifiedPrincipal,
  type VerifiedServicePrincipal,
} from './principal.ts';
