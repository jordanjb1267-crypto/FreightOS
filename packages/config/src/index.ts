export {
  AUTONOMY_LEVELS,
  autonomyRank,
  effectiveMaximumAutonomy,
  horizonCeiling,
  isAutonomyLevel,
  minAutonomy,
  moduleCeiling,
  type AutonomyLevel,
  type EffectiveAutonomyInput,
  type ModuleCeilingInput,
} from './autonomy.ts';

export {
  MANDATORY_FALSE_FLAGS,
  MODULE_STATES,
  loadAgentRegistry,
  loadScopeRegistry,
  resolveAgent,
  resolveModule,
  type AgentEntry,
  type ModuleState,
  type ResolvedAgent,
  type ResolvedModule,
  type ScopeRegistry,
} from './scope.ts';

export { envSchema, loadEnv, parseEnv, type Env, type EnvResult } from './env.ts';

export {
  AGENT_REGISTRY_PATH,
  BASE_POLICY_PATH,
  MODULE_STATES_PATH,
  PRODUCTS_PATH,
  repositoryRoot,
} from './paths.ts';
