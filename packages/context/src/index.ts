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
