/**
 * The operating-context capability matrix — ADR-0019.
 *
 * ADR-0015 split the overloaded `authority_mode` into two dimensions and enumerated the permitted
 * pairings. It did not say what the three non-carrier contexts under `software_only` may actually
 * do, and a residual class with no ceiling is a permission wildcard. ADR-0019 closes that, and
 * this module is the executable form of its matrix.
 *
 * ADR-0019 §RLS consequences requires the matrix to be enforced in three places that must agree:
 * here, in the RLS predicates, and in the event envelope. This is the application half. The
 * database half is `app.is_permitted_legal_pairing` plus the per-table policies; the envelope half
 * is `schemas/event-envelope.schema.json`.
 *
 * Two properties hold by construction and are tested:
 *
 *   1. Operating context never widens permission (ADR-0015 rule 5). Every entry is read from the
 *      pair, and no context is granted anything its legal class does not already permit.
 *   2. Absence fails closed. An unknown pair, an impermissible pair, and `brokerage` all resolve
 *      to a fully denied set rather than to an empty one that a caller might read as "no
 *      restriction".
 */

import { type LegalAuthorityClass, type OperatingContext, PERMITTED_CONTEXTS } from './legal.ts';

/** Rows of the ADR-0019 matrix, in the order the ADR lists them. */
export const RESOURCE_GROUPS = [
  'identity_and_organization',
  'parties_and_locations',
  'carrier_and_fleet',
  'cost_profiles_and_profitability',
  'freight_core',
  'facility_primitives',
  'custody_events',
  'load_opportunities',
  'assignments_and_dispatch',
  'autonomous_mobility',
  'kill_switches',
  'audit',
] as const;
export type ResourceGroup = (typeof RESOURCE_GROUPS)[number];

export interface Capability {
  readonly read: boolean;
  readonly write: boolean;
  /** Refused before any predicate is evaluated — the ADR's `DENIED`. */
  readonly denied: boolean;
  /** Structurally unwritable in Phase 1 — the ADR's `suspended`. */
  readonly suspended: boolean;
  /**
   * The ADR's parenthetical, carried verbatim. "(own)", "(in-scope shipments)" and the like are
   * not decorative: each names an additional data predicate the RLS policy must apply on top of
   * tenant isolation, and dropping them here would make this module look more permissive than the
   * database actually is.
   */
  readonly qualifier: string | null;
}

const NONE: Capability = Object.freeze({
  read: false,
  write: false,
  denied: false,
  suspended: false,
  qualifier: null,
});
const DENIED: Capability = Object.freeze({
  read: false,
  write: false,
  denied: true,
  suspended: false,
  qualifier: null,
});

function cap(read: boolean, write: boolean, qualifier: string | null = null): Capability {
  return Object.freeze({ read, write, denied: false, suspended: false, qualifier });
}

function suspended(): Capability {
  return Object.freeze({
    read: false,
    write: false,
    denied: false,
    suspended: true,
    qualifier: 'ADR-0019: standing fail-closed suspension',
  });
}

export type CapabilitySet = Readonly<Record<ResourceGroup, Capability>>;

/** Every group denied. The result for `brokerage` and for any impermissible pairing. */
const ALL_DENIED: CapabilitySet = Object.freeze(
  Object.fromEntries(RESOURCE_GROUPS.map((g) => [g, DENIED])) as Record<ResourceGroup, Capability>,
);

/** `software_only` / `system` — the tenant-administration surface. */
const SOFTWARE_ONLY_SYSTEM: CapabilitySet = Object.freeze({
  identity_and_organization: cap(true, true),
  parties_and_locations: cap(true, false),
  carrier_and_fleet: cap(true, false),
  cost_profiles_and_profitability: NONE,
  freight_core: cap(true, false),
  facility_primitives: cap(true, false),
  custody_events: cap(true, false),
  load_opportunities: cap(true, false),
  assignments_and_dispatch: cap(true, false),
  autonomous_mobility: cap(true, false),
  kill_switches: cap(true, true),
  audit: cap(true, false, 'control plane'),
});

const SOFTWARE_ONLY_SHIPPER_OWNED: CapabilitySet = Object.freeze({
  identity_and_organization: cap(true, false, 'own'),
  parties_and_locations: cap(true, true, 'own'),
  carrier_and_fleet: NONE,
  cost_profiles_and_profitability: NONE,
  freight_core: cap(true, true, 'planning records only — no award, broker, dispatch or execute'),
  facility_primitives: cap(true, true, 'readiness and appointment requests only'),
  custody_events: cap(false, true, 'release side'),
  load_opportunities: NONE,
  assignments_and_dispatch: NONE,
  autonomous_mobility: NONE,
  kill_switches: cap(true, false),
  audit: cap(true, false, 'own'),
});

const SOFTWARE_ONLY_FACILITY_OPERATOR: CapabilitySet = Object.freeze({
  identity_and_organization: cap(true, false, 'own'),
  parties_and_locations: cap(true, true, 'facilities operated'),
  carrier_and_fleet: NONE,
  cost_profiles_and_profitability: NONE,
  freight_core: cap(true, false, 'in-scope shipments'),
  facility_primitives: cap(true, true),
  custody_events: cap(false, true, 'facility side'),
  load_opportunities: NONE,
  assignments_and_dispatch: NONE,
  autonomous_mobility: NONE,
  kill_switches: cap(true, false),
  audit: cap(true, false, 'own'),
});

const SOFTWARE_ONLY_AUTONOMOUS_MOBILITY: CapabilitySet = Object.freeze({
  identity_and_organization: NONE,
  parties_and_locations: NONE,
  carrier_and_fleet: NONE,
  cost_profiles_and_profitability: NONE,
  freight_core: NONE,
  facility_primitives: NONE,
  custody_events: NONE,
  load_opportunities: NONE,
  assignments_and_dispatch: NONE,
  autonomous_mobility: suspended(),
  kill_switches: cap(true, false),
  audit: cap(true, false, 'own'),
});

const CARRIER_AGENT_CARRIER: CapabilitySet = Object.freeze({
  identity_and_organization: cap(true, false),
  parties_and_locations: cap(true, true),
  carrier_and_fleet: cap(true, true),
  cost_profiles_and_profitability: cap(true, true),
  freight_core: cap(true, true),
  facility_primitives: cap(true, true, 'visit side'),
  custody_events: cap(false, true, 'carrier side'),
  load_opportunities: cap(true, true),
  assignments_and_dispatch: cap(true, true),
  autonomous_mobility: NONE,
  kill_switches: cap(true, true, 'tenant scope only'),
  audit: cap(true, false, 'own'),
});

const MATRIX: Readonly<Partial<Record<string, CapabilitySet>>> = Object.freeze({
  'software_only:system': SOFTWARE_ONLY_SYSTEM,
  'software_only:shipper_owned': SOFTWARE_ONLY_SHIPPER_OWNED,
  'software_only:facility_operator': SOFTWARE_ONLY_FACILITY_OPERATOR,
  'software_only:autonomous_mobility': SOFTWARE_ONLY_AUTONOMOUS_MOBILITY,
  'carrier_agent:carrier': CARRIER_AGENT_CARRIER,
  // brokerage:brokerage is absent on purpose. It falls through to ALL_DENIED below, which is the
  // fourth of the four independent refusals R-05 records — after validateLegalContext,
  // app.is_permitted_legal_pairing, and the BROKERAGE_EXECUTION_ENABLED mandatory-false flag.
});

/**
 * The permitted resource/action set for a legal class and operating context.
 *
 * Returns a fully denied set — never an empty or permissive one — for `brokerage`, for any pairing
 * ADR-0015 rule 6 forbids, and for any value outside the two enums.
 */
export function contextCapabilities(
  legalAuthorityClass: LegalAuthorityClass,
  operatingContext: OperatingContext,
): CapabilitySet {
  const permitted = PERMITTED_CONTEXTS[legalAuthorityClass];
  if (!permitted?.includes(operatingContext)) return ALL_DENIED;
  return MATRIX[`${legalAuthorityClass}:${operatingContext}`] ?? ALL_DENIED;
}

export function capabilityFor(
  legalAuthorityClass: LegalAuthorityClass,
  operatingContext: OperatingContext,
  group: ResourceGroup,
): Capability {
  return contextCapabilities(legalAuthorityClass, operatingContext)[group];
}

export type ResourceAction = 'read' | 'write';

export function isPermittedAction(
  legalAuthorityClass: LegalAuthorityClass,
  operatingContext: OperatingContext,
  group: ResourceGroup,
  action: ResourceAction,
): boolean {
  const capability = capabilityFor(legalAuthorityClass, operatingContext, group);
  if (capability.denied || capability.suspended) return false;
  return action === 'read' ? capability.read : capability.write;
}

export class CapabilityError extends Error {
  readonly legalAuthorityClass: LegalAuthorityClass;
  readonly operatingContext: OperatingContext;
  readonly group: ResourceGroup;
  readonly action: ResourceAction;

  constructor(
    legalAuthorityClass: LegalAuthorityClass,
    operatingContext: OperatingContext,
    group: ResourceGroup,
    action: ResourceAction,
  ) {
    super(
      `capability refused: ${legalAuthorityClass}/${operatingContext} may not ${action} ${group}`,
    );
    this.name = 'CapabilityError';
    this.legalAuthorityClass = legalAuthorityClass;
    this.operatingContext = operatingContext;
    this.group = group;
    this.action = action;
  }
}

/** Throwing variant. Call before any command handler runs — plan §9.3 item 1. */
export function assertCapability(
  legalAuthorityClass: LegalAuthorityClass,
  operatingContext: OperatingContext,
  group: ResourceGroup,
  action: ResourceAction,
): void {
  if (!isPermittedAction(legalAuthorityClass, operatingContext, group, action)) {
    throw new CapabilityError(legalAuthorityClass, operatingContext, group, action);
  }
}
