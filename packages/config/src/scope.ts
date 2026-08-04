/**
 * The machine-readable scope registry — config/scope/module_states.yaml.
 *
 * 21_SEQUENCING_DOCTRINE:52 names this file the authority, and 02_GOVERNANCE:97 says the stricter
 * restriction wins when prose and configuration disagree. This module is the only sanctioned
 * reader; nothing else parses that file.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import {
  type AutonomyLevel,
  effectiveMaximumAutonomy,
  isAutonomyLevel,
  moduleCeiling,
} from './autonomy.ts';
import { AGENT_REGISTRY_PATH, MODULE_STATES_PATH, repositoryRoot } from './paths.ts';

export const MODULE_STATES = [
  'ACTIVE_BUILD',
  'FOUNDATION_ONLY',
  'INTERFACE_AND_SIMULATION_ONLY',
  'PROMOTION_GATED',
  'CUSTOMER_GATED',
  'LEGAL_AND_MARKET_GATED',
  'PARTNER_AND_SAFETY_GATED',
  'LIQUIDITY_GATED',
  'DORMANT',
] as const;
export type ModuleState = (typeof MODULE_STATES)[number];

/** The eight flags 21_SEQUENCING_DOCTRINE and 16_CLAUDE_MASTER_BUILD_PROMPT require to be false. */
export const MANDATORY_FALSE_FLAGS = [
  'FACILITYOS_STANDALONE_ENABLED',
  'AUTONOMOUS_DISPATCH_A4_ENABLED',
  'BROKERAGE_EXECUTION_ENABLED',
  'FREIGHT_EXCHANGE_ENABLED',
  'AUTONOMOUS_VEHICLE_LIVE_MISSIONS_ENABLED',
  'RAIL_OPERATIONS_ENABLED',
  'OCEAN_OPERATIONS_ENABLED',
  'AIR_OPERATIONS_ENABLED',
] as const;

const moduleEntrySchema = z.object({
  state: z.enum(MODULE_STATES),
  horizon: z.number().int().optional(),
  earliest_horizon: z.number().int().optional(),
  autonomy_max: z.string().optional(),
});

const registrySchema = z.object({
  version: z.string(),
  horizon_authorized: z.number().int(),
  stop_after_horizon: z.number().int(),
  promotion_requires: z.array(z.string()).min(1),
  modules: z.record(moduleEntrySchema),
  mandatory_defaults: z.record(z.boolean()),
});

export type ScopeRegistry = z.infer<typeof registrySchema>;

export function loadScopeRegistry(root: string = repositoryRoot()): ScopeRegistry {
  const raw = parse(readFileSync(join(root, MODULE_STATES_PATH), 'utf8')) as unknown;
  const parsed = registrySchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${MODULE_STATES_PATH} is invalid: ${parsed.error.message}`);
  }
  return parsed.data;
}

export interface ResolvedModule {
  readonly id: string;
  readonly state: ModuleState;
  readonly horizon: number | undefined;
  readonly implementable: boolean;
  readonly autonomyCeiling: AutonomyLevel;
}

export function resolveModule(registry: ScopeRegistry, moduleId: string): ResolvedModule {
  const entry = registry.modules[moduleId];
  if (!entry) throw new Error(`unknown module "${moduleId}" in ${MODULE_STATES_PATH}`);

  const horizon = entry.horizon ?? entry.earliest_horizon;
  const declaredMax =
    entry.autonomy_max !== undefined && isAutonomyLevel(entry.autonomy_max)
      ? entry.autonomy_max
      : undefined;

  const ceiling = moduleCeiling({
    state: entry.state,
    horizon,
    declaredAutonomyMax: declaredMax,
    authorizedHorizon: registry.horizon_authorized,
  });

  return {
    id: moduleId,
    state: entry.state,
    horizon,
    // FOUNDATION_ONLY is implementable but never as a standalone product (module_states.yaml:18).
    implementable:
      (entry.state === 'ACTIVE_BUILD' || entry.state === 'FOUNDATION_ONLY') &&
      horizon !== undefined &&
      horizon <= registry.horizon_authorized,
    autonomyCeiling: ceiling,
  };
}

const agentEntrySchema = z.object({
  id: z.string(),
  module: z.string(),
  legal_authority_class: z.enum(['software_only', 'carrier_agent', 'brokerage']),
  operating_contexts: z.array(z.string()).min(1),
  maximum_autonomy: z.enum(['A0', 'A1', 'A2', 'A3', 'A4', 'A5']),
  allowed_tools: z.array(z.string()),
  prohibited_actions: z.array(z.string()),
});

const agentRegistrySchema = z.object({
  version: z.string(),
  agents: z.array(agentEntrySchema).min(1),
});

export type AgentEntry = z.infer<typeof agentEntrySchema>;

export function loadAgentRegistry(root: string = repositoryRoot()): readonly AgentEntry[] {
  const raw = parse(readFileSync(join(root, AGENT_REGISTRY_PATH), 'utf8')) as unknown;
  const parsed = agentRegistrySchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${AGENT_REGISTRY_PATH} is invalid: ${parsed.error.message}`);
  }
  return parsed.data.agents;
}

export interface ResolvedAgent {
  readonly id: string;
  readonly module: string;
  readonly declaredAutonomy: AutonomyLevel;
  readonly effectiveAutonomy: AutonomyLevel;
  readonly clamped: boolean;
}

/**
 * Resolve an agent's real ceiling. `clamped` is true when the registry declared more than the
 * agent may actually have — which is the normal case in Horizon 1 for the 13 A4 entries.
 */
export function resolveAgent(
  registry: ScopeRegistry,
  agent: AgentEntry,
  root: string = repositoryRoot(),
): ResolvedAgent {
  void root;
  const entry = registry.modules[agent.module];
  if (!entry) throw new Error(`agent "${agent.id}" names unknown module "${agent.module}"`);

  const horizon = entry.horizon ?? entry.earliest_horizon;
  const declaredMax =
    entry.autonomy_max !== undefined && isAutonomyLevel(entry.autonomy_max)
      ? entry.autonomy_max
      : undefined;

  const effective = effectiveMaximumAutonomy({
    declared: agent.maximum_autonomy,
    module: {
      state: entry.state,
      horizon,
      declaredAutonomyMax: declaredMax,
      authorizedHorizon: registry.horizon_authorized,
    },
  });

  return {
    id: agent.id,
    module: agent.module,
    declaredAutonomy: agent.maximum_autonomy,
    effectiveAutonomy: effective,
    clamped: effective !== agent.maximum_autonomy,
  };
}
