/**
 * Legal authority class and operating context — ADR-0015.
 *
 * Constitution Art. I.1: "Execute only within explicit tenant, legal-entity, and authority
 * context." Art. I.2: "Missing or inconsistent legal context fails closed."
 *
 * "Inconsistent" is now a decidable predicate rather than a sentiment, because the legal class
 * constrains which operating contexts are permitted. Everything in this module is total: there is
 * no path that returns a valid context from invalid input.
 */

export const LEGAL_AUTHORITY_CLASSES = ['software_only', 'carrier_agent', 'brokerage'] as const;
export type LegalAuthorityClass = (typeof LEGAL_AUTHORITY_CLASSES)[number];

export const OPERATING_CONTEXTS = [
  'system',
  'carrier',
  'shipper_owned',
  'facility_operator',
  'autonomous_mobility',
  'brokerage',
] as const;
export type OperatingContext = (typeof OPERATING_CONTEXTS)[number];

/**
 * ADR-0015 rule 6. `carrier_agent` + `brokerage` is absent by construction — that pairing is what
 * would breach the two-plane separation ADR-0003 requires.
 */
export const PERMITTED_CONTEXTS: Readonly<
  Record<LegalAuthorityClass, readonly OperatingContext[]>
> = Object.freeze({
  software_only: ['system', 'shipper_owned', 'facility_operator', 'autonomous_mobility'],
  carrier_agent: ['carrier'],
  brokerage: ['brokerage'],
});

/** The designated tenant for system-scope records. */
export const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000000';

export interface LegalContext {
  readonly tenantId: string;
  readonly legalAuthorityClass: LegalAuthorityClass;
  readonly operatingContext: OperatingContext;
  readonly actorId: string;
  /** Omitted only under system scope with an authorized actor — ADR-0015 rule 4. */
  readonly legalEntityId?: string;
  /** Required when the class is `carrier_agent`: acting for one appointed carrier. */
  readonly carrierId?: string;
  /** Evidence of the written appointment backing `carrierId`. */
  readonly carrierAppointmentId?: string;
}

export class LegalContextError extends Error {
  readonly reasons: readonly string[];
  constructor(reasons: readonly string[]) {
    super(`legal context rejected: ${reasons.join('; ')}`);
    this.name = 'LegalContextError';
    this.reasons = reasons;
  }
}

export interface ValidationOptions {
  /**
   * Whether brokerage execution is permitted. Horizon 1 requires false, and the value comes from
   * the mandatory-false flag set, not from a caller's preference.
   */
  readonly brokerageEnabled: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns the reasons a context is unacceptable. Empty means acceptable.
 * Collects every reason rather than short-circuiting, so a caller can log all of them.
 */
export function validateLegalContext(
  context: LegalContext,
  options: ValidationOptions,
): readonly string[] {
  const reasons: string[] = [];

  if (!UUID_RE.test(context.tenantId)) {
    reasons.push('tenantId must be a uuid');
  }
  if (!context.actorId || context.actorId.trim() === '') {
    reasons.push('actorId is required on every context');
  }

  if (!LEGAL_AUTHORITY_CLASSES.includes(context.legalAuthorityClass)) {
    reasons.push(`unknown legalAuthorityClass "${context.legalAuthorityClass}"`);
    return reasons;
  }
  if (!OPERATING_CONTEXTS.includes(context.operatingContext)) {
    reasons.push(`unknown operatingContext "${context.operatingContext}"`);
    return reasons;
  }

  // Rule 5: operating context never widens legal authority.
  const permitted = PERMITTED_CONTEXTS[context.legalAuthorityClass];
  if (!permitted.includes(context.operatingContext)) {
    reasons.push(
      `operatingContext "${context.operatingContext}" is not permitted for ` +
        `legalAuthorityClass "${context.legalAuthorityClass}" (permitted: ${permitted.join(', ')})`,
    );
  }

  // Rule 4: legal entity may be omitted only under system scope.
  if (context.operatingContext === 'system') {
    if (!context.actorId) reasons.push('system scope requires an authorized actor');
  } else if (!context.legalEntityId) {
    reasons.push(
      `legalEntityId is required when operatingContext is "${context.operatingContext}"`,
    );
  }

  // Rule 2: carrier_agent requires a specific carrier and a written appointment.
  if (context.legalAuthorityClass === 'carrier_agent') {
    if (!context.carrierId) {
      reasons.push('carrier_agent requires carrierId — it acts only for the appointed carrier');
    }
    if (!context.carrierAppointmentId) {
      reasons.push('carrier_agent requires carrierAppointmentId evidencing a written appointment');
    }
  } else if (context.carrierId ?? context.carrierAppointmentId) {
    reasons.push('carrierId/carrierAppointmentId are only meaningful for carrier_agent');
  }

  // Rule 3: brokerage is fail-closed until its legal gate is signed.
  if (context.legalAuthorityClass === 'brokerage' && !options.brokerageEnabled) {
    reasons.push(
      'brokerage authority is disabled — checklists/BROKERAGE_LEGAL_GATE.md must be signed ' +
        'and BROKERAGE_EXECUTION_ENABLED is a mandatory-false default in Horizon 1',
    );
  }

  return reasons;
}

export function isValidLegalContext(context: LegalContext, options: ValidationOptions): boolean {
  return validateLegalContext(context, options).length === 0;
}

/** Throwing variant. Use at every boundary that begins a consequential command. */
export function assertLegalContext(context: LegalContext, options: ValidationOptions): void {
  const reasons = validateLegalContext(context, options);
  if (reasons.length > 0) throw new LegalContextError(reasons);
}

/** Migration helper for the handoff's single-dimension `authority_mode` (ADR-0015). */
export function fromAuthorityMode(mode: string): {
  legalAuthorityClass: LegalAuthorityClass;
  operatingContext: OperatingContext;
} {
  switch (mode) {
    case 'carrier_agent':
      return { legalAuthorityClass: 'carrier_agent', operatingContext: 'carrier' };
    case 'brokerage':
      return { legalAuthorityClass: 'brokerage', operatingContext: 'brokerage' };
    case 'shipper_owned':
      return { legalAuthorityClass: 'software_only', operatingContext: 'shipper_owned' };
    case 'facility_operator':
      return { legalAuthorityClass: 'software_only', operatingContext: 'facility_operator' };
    case 'autonomous_mobility':
      return { legalAuthorityClass: 'software_only', operatingContext: 'autonomous_mobility' };
    default:
      throw new Error(`unknown authority_mode "${mode}"`);
  }
}
