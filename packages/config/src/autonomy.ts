/**
 * Autonomy ceilings — ADR-0018.
 *
 * The single rule this module exists to enforce: an agent's effective ceiling is the MINIMUM of
 * its declared ceiling, its module's ceiling, and the horizon ceiling. There is no code path here
 * that returns a level above any of its inputs, and no configuration value that raises one.
 *
 * Owner ruling 6: "every carrier agent must have an effective maximum autonomy of A3 or lower.
 * No registry value, fallback, configuration merge, or model output may elevate it to A4."
 */

export const AUTONOMY_LEVELS = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

/** Ordered ladder: A0 < A1 < A2 < A3 < A4 < A5 (09_AUTONOMY_POLICY_AND_AUTHORITY). */
export function autonomyRank(level: AutonomyLevel): number {
  return AUTONOMY_LEVELS.indexOf(level);
}

export function isAutonomyLevel(value: unknown): value is AutonomyLevel {
  return typeof value === 'string' && (AUTONOMY_LEVELS as readonly string[]).includes(value);
}

/** Least-permissive wins. Empty input is A0, never "unbounded". */
export function minAutonomy(...levels: readonly AutonomyLevel[]): AutonomyLevel {
  let lowest: AutonomyLevel = 'A5';
  if (levels.length === 0) return 'A0';
  for (const level of levels) {
    if (autonomyRank(level) < autonomyRank(lowest)) lowest = level;
  }
  return lowest;
}

/**
 * The horizon backstop. This holds even if a module entry is edited to claim something higher,
 * which is the point: 21_SEQUENCING_DOCTRINE authorises "A0-A2 and selected A3 workflows" and
 * 13_IMPLEMENTATION_ROADMAP says "selected A3 only".
 */
export function horizonCeiling(authorizedHorizon: number): AutonomyLevel {
  return authorizedHorizon <= 1 ? 'A3' : 'A5';
}

/**
 * Module states that permit any implementation at all. Everything else yields A0 — an agent whose
 * module is not being built cannot act, only observe.
 */
const IMPLEMENTABLE_STATES = new Set(['ACTIVE_BUILD', 'FOUNDATION_ONLY']);

export interface ModuleCeilingInput {
  readonly state: string;
  /** `horizon` for active modules; `earliest_horizon` for deferred ones. */
  readonly horizon: number | undefined;
  readonly declaredAutonomyMax: AutonomyLevel | undefined;
  readonly authorizedHorizon: number;
}

export function moduleCeiling(input: ModuleCeilingInput): AutonomyLevel {
  if (!IMPLEMENTABLE_STATES.has(input.state)) return 'A0';
  if (input.horizon === undefined || input.horizon > input.authorizedHorizon) return 'A0';
  return input.declaredAutonomyMax ?? horizonCeiling(input.authorizedHorizon);
}

export interface EffectiveAutonomyInput {
  readonly declared: AutonomyLevel;
  readonly module: ModuleCeilingInput;
}

/**
 * The only function any consumer may use to decide what an agent is allowed to do.
 * Never read `maximum_autonomy` from the registry directly.
 */
export function effectiveMaximumAutonomy(input: EffectiveAutonomyInput): AutonomyLevel {
  return minAutonomy(
    input.declared,
    moduleCeiling(input.module),
    horizonCeiling(input.module.authorizedHorizon),
  );
}
