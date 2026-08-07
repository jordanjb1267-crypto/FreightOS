/**
 * Purpose and outcome — OQ-20, ADR-0020.
 *
 * ADR-0020 makes purpose and outcome mandatory on every privileged operation, and OQ-20 records
 * that neither existed anywhere. Migration 0006 created the columns and mirrors this vocabulary as
 * `app.is_permitted_purpose`, `app.is_privileged_purpose` and `app.is_permitted_outcome`; a test
 * asserts the two agree.
 *
 * THE TRUST BOUNDARY, which is the point of this module.
 *
 * OQ-20: "purpose must be supplied by the trusted command or control-plane context, never by
 * arbitrary model output. It is set at the command boundary from a closed vocabulary. A model may
 * not author, widen, or select it outside that vocabulary."
 *
 * A closed vocabulary alone does not achieve that — a model can emit a string from a closed set as
 * easily as any other. What achieves it is the ORIGIN check below: a purpose carries where it came
 * from, and a purpose whose origin is `model_output` can never establish privileged authority no
 * matter which word it contains.
 */

export const PURPOSES = [
  /** The ordinary tenant-scoped domain command. Deliberately not a privileged purpose. */
  'service_operation',
  'tenant_provisioning',
  'tenant_lifecycle',
  'identity_administration',
  'access_review',
  'audit_export',
  'incident_response',
  'security_investigation',
  'regulatory_request',
  'platform_operations',
] as const;
export type Purpose = (typeof PURPOSES)[number];

/**
 * The subset a cross-tenant control-plane operation may declare: everything except
 * `service_operation`. A privileged call may not hide behind the routine purpose, because an audit
 * ledger in which privileged and ordinary work carry the same purpose cannot be reviewed.
 */
export const PRIVILEGED_PURPOSES: readonly Purpose[] = Object.freeze(
  PURPOSES.filter((p) => p !== 'service_operation'),
);

export const OUTCOMES = ['succeeded', 'denied', 'failed'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export function isPurpose(value: unknown): value is Purpose {
  return typeof value === 'string' && (PURPOSES as readonly string[]).includes(value);
}

export function isPrivilegedPurpose(value: unknown): value is Purpose {
  return isPurpose(value) && (PRIVILEGED_PURPOSES as readonly string[]).includes(value);
}

export function isOutcome(value: unknown): value is Outcome {
  return typeof value === 'string' && (OUTCOMES as readonly string[]).includes(value);
}

/**
 * Where a purpose came from.
 *
 * `command` and `control_plane` are trusted: both are code paths a human or the platform reached
 * deliberately. `model_output` is not, and is rejected for privileged use however well-formed the
 * value is. There is no fourth origin, and adding one is a decision, not a convenience.
 */
export const PURPOSE_ORIGINS = ['command', 'control_plane', 'model_output'] as const;
export type PurposeOrigin = (typeof PURPOSE_ORIGINS)[number];

export const TRUSTED_PURPOSE_ORIGINS: readonly PurposeOrigin[] = Object.freeze([
  'command',
  'control_plane',
]);

export class PurposeError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`purpose rejected: ${reason}`);
    this.name = 'PurposeError';
    this.reason = reason;
  }
}

export interface PrivilegedCallContext {
  readonly actor: string | null | undefined;
  readonly actorType: string | null | undefined;
  readonly purpose: string | null | undefined;
  readonly purposeOrigin: PurposeOrigin;
  readonly tenantId: string | null | undefined;
  readonly correlationId: string | null | undefined;
}

/**
 * The reason a privileged call must be refused, or null when it may proceed.
 *
 * Mirrors `admin.refusal_reason` in migration 0013, in the same order, so a caller sees the same
 * refusal here as it would from the database. The one condition this adds is the origin check:
 * the database cannot see where a purpose came from, only what it is, so the trust boundary has to
 * be enforced on this side of the call.
 */
export function privilegedRefusalReason(context: PrivilegedCallContext): string | null {
  if (context.actor === null || context.actor === undefined || context.actor.trim() === '') {
    return 'actor is required: a privileged operation with no actor cannot be attributed';
  }
  if (context.actorType !== 'human' && context.actorType !== 'system') {
    return (
      `actor_type "${String(context.actorType)}" may not perform a privileged operation: ` +
      'control-plane administration is human or platform, never an agent or a tenant integration'
    );
  }
  if (context.purpose === null || context.purpose === undefined || context.purpose.trim() === '') {
    return 'purpose is required: OQ-20 forbids defaulting, inferring, or backfilling it';
  }
  if (!TRUSTED_PURPOSE_ORIGINS.includes(context.purposeOrigin)) {
    return (
      `purpose origin "${context.purposeOrigin}" is not trusted: model output cannot ` +
      'independently establish privileged purpose'
    );
  }
  if (!isPrivilegedPurpose(context.purpose)) {
    return `purpose "${context.purpose}" is outside the approved privileged vocabulary`;
  }
  if (
    context.tenantId === null ||
    context.tenantId === undefined ||
    context.tenantId.trim() === ''
  ) {
    return 'tenant scope is required on every privileged operation';
  }
  if (
    context.correlationId === null ||
    context.correlationId === undefined ||
    context.correlationId.trim() === ''
  ) {
    return 'correlation id is required so the operation is traceable';
  }
  return null;
}

export function assertPrivilegedCall(context: PrivilegedCallContext): void {
  const reason = privilegedRefusalReason(context);
  if (reason !== null) throw new PurposeError(reason);
}

/**
 * Narrow an untrusted string to a Purpose for an ordinary domain event.
 *
 * Used at the command boundary where an event envelope is built. A value outside the vocabulary
 * throws rather than degrading to a default, because the envelope schema requires the attribute
 * and a defaulted purpose is a fabricated one.
 */
export function requirePurpose(value: unknown): Purpose {
  if (!isPurpose(value)) {
    throw new PurposeError(`"${String(value)}" is outside the approved vocabulary`);
  }
  return value;
}

export function requireOutcome(value: unknown): Outcome {
  if (!isOutcome(value)) {
    throw new PurposeError(`outcome "${String(value)}" is outside the approved vocabulary`);
  }
  return value;
}
