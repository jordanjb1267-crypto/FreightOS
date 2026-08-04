/**
 * Kill switches — 09_AUTONOMY_POLICY_AND_AUTHORITY:35-39.
 *
 * The handoff names seven scopes and seven modes in five lines and stops. It never says what a
 * mode does to in-flight work, who may flip one, or what wins when two scopes disagree. This
 * module supplies those semantics; the table and its constraints live in migration 0004.
 *
 * Constitution Art. V.1: "Humans retain kill-switch and override authority."
 * Art. V.2: "Policy or audit failure blocks autonomous execution."
 */

/** Ordered broadest to narrowest, exactly as 09_ lists them. */
export const KILL_SWITCH_SCOPES = [
  'system',
  'legal_plane',
  'tenant',
  'workflow',
  'agent',
  'tool',
  'integration',
] as const;
export type KillSwitchScope = (typeof KILL_SWITCH_SCOPES)[number];

/**
 * Ordered MOST to LEAST permissive. That ordering is the whole mechanism: resolution takes the
 * most restrictive mode across every applicable scope, so a broad `suspended` can never be
 * loosened by a narrow `enabled`.
 */
export const KILL_SWITCH_MODES = [
  'enabled',
  'approval_only',
  'autonomous_disabled',
  'communications_disabled',
  'financial_disabled',
  'read_only',
  'suspended',
] as const;
export type KillSwitchMode = (typeof KILL_SWITCH_MODES)[number];

export function modeRestrictiveness(mode: KillSwitchMode): number {
  return KILL_SWITCH_MODES.indexOf(mode);
}

/** What each mode actually forbids. Consulted by the policy layer before any consequential act. */
export interface ModeCapabilities {
  readonly reads: boolean;
  readonly mutations: boolean;
  /** Autonomous execution without a fresh human approval. */
  readonly autonomousExecution: boolean;
  /** Outbound communication to a counterparty. */
  readonly communications: boolean;
  /** Money movement, invoice submission, settlement. */
  readonly financial: boolean;
  /** Whether an explicit human approval can still authorise a mutation. */
  readonly humanApproval: boolean;
}

const CAPABILITIES: Readonly<Record<KillSwitchMode, ModeCapabilities>> = Object.freeze({
  enabled: {
    reads: true,
    mutations: true,
    autonomousExecution: true,
    communications: true,
    financial: true,
    humanApproval: true,
  },
  approval_only: {
    reads: true,
    mutations: true,
    autonomousExecution: false,
    communications: true,
    financial: true,
    humanApproval: true,
  },
  autonomous_disabled: {
    reads: true,
    mutations: true,
    autonomousExecution: false,
    communications: true,
    financial: true,
    humanApproval: true,
  },
  communications_disabled: {
    reads: true,
    mutations: true,
    autonomousExecution: false,
    communications: false,
    financial: true,
    humanApproval: true,
  },
  financial_disabled: {
    reads: true,
    mutations: true,
    autonomousExecution: false,
    communications: false,
    financial: false,
    humanApproval: true,
  },
  read_only: {
    reads: true,
    mutations: false,
    autonomousExecution: false,
    communications: false,
    financial: false,
    humanApproval: false,
  },
  suspended: {
    reads: false,
    mutations: false,
    autonomousExecution: false,
    communications: false,
    financial: false,
    humanApproval: false,
  },
});

export function capabilitiesFor(mode: KillSwitchMode): ModeCapabilities {
  return CAPABILITIES[mode];
}

export interface KillSwitchRecord {
  readonly scope: KillSwitchScope;
  /** null for `system` scope; otherwise the tenant, workflow, agent, tool, or integration id. */
  readonly scopeRef: string | null;
  readonly mode: KillSwitchMode;
}

export interface ResolutionRequest {
  readonly tenantId?: string;
  readonly legalPlane?: string;
  readonly workflowId?: string;
  readonly agentId?: string;
  readonly toolId?: string;
  readonly integrationId?: string;
}

function matches(record: KillSwitchRecord, request: ResolutionRequest): boolean {
  switch (record.scope) {
    case 'system':
      return true;
    case 'legal_plane':
      return record.scopeRef === request.legalPlane;
    case 'tenant':
      return record.scopeRef === request.tenantId;
    case 'workflow':
      return record.scopeRef === request.workflowId;
    case 'agent':
      return record.scopeRef === request.agentId;
    case 'tool':
      return record.scopeRef === request.toolId;
    case 'integration':
      return record.scopeRef === request.integrationId;
  }
}

export interface Resolution {
  readonly mode: KillSwitchMode;
  readonly capabilities: ModeCapabilities;
  /** Which scopes contributed, most restrictive first. Empty when nothing applied. */
  readonly appliedBy: readonly KillSwitchRecord[];
}

/**
 * PRECEDENCE: the most restrictive mode across all applicable scopes wins, regardless of how
 * narrow the scope that set it is. A narrower switch can only ever tighten.
 *
 * This direction is deliberate. The alternative — narrowest scope wins — would let a per-tool
 * `enabled` override a system-wide `suspended`, which would make the system switch useless in
 * exactly the incident it exists for.
 */
export function resolveKillSwitch(
  records: readonly KillSwitchRecord[],
  request: ResolutionRequest,
): Resolution {
  const applicable = records.filter((r) => matches(r, request));

  let mode: KillSwitchMode = 'enabled';
  for (const record of applicable) {
    if (modeRestrictiveness(record.mode) > modeRestrictiveness(mode)) mode = record.mode;
  }

  const appliedBy = [...applicable].sort(
    (a, b) => modeRestrictiveness(b.mode) - modeRestrictiveness(a.mode),
  );

  return { mode, capabilities: capabilitiesFor(mode), appliedBy };
}
