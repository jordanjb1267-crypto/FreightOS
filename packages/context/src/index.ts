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
