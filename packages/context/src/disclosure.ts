/**
 * N5-A — the disclosure-authorization evaluator.
 *
 * Answers exactly one question, deterministically:
 *
 *     MAY RECIPIENT R RECEIVE FIELDS F FROM EVENT E FOR PURPOSE P AT TIME T,
 *     UNDER WHICH ACTIVE GRANT?
 *
 * A PURE FUNCTION. Every input is passed in — including `decidedAt`, which is never read from the
 * wall clock inside the decision. Two consequences, both deliberate: the same inputs always produce
 * the same decision and the same digest, so a decision can be replayed and audited; and the
 * function is testable without a database, which is what lets the ~30 predicate cases below run as
 * unit tests rather than as integration fixtures.
 *
 * NO DATABASE ACCESS, NO POLICY ENGINE. The caller loads state and hands it over. There is no OPA,
 * Cedar or Rego dependency: FreightOS has one rule shape and zero external disclosure today, and an
 * engine would add a second policy language, a second audit surface, and a component the N4 egress
 * gate would have to classify — to express one rule.
 *
 * WHAT THIS DELIBERATELY NEVER READS, because each has been mistaken for authority before:
 *
 *   - `network_events.classification`  — N3 froze it as an ungoverned string that nothing may
 *                                        branch on. A historical value of `public` confers nothing,
 *                                        and the way that is guaranteed is that the field is not in
 *                                        the input type at all.
 *   - `network_transport_intents`      — N4 transport debt says movement is owed, not that
 *                                        disclosure is authorized.
 *   - participant relationships        — `operated_by` and `subsidiary_of` are descriptive. A
 *                                        parent does not receive a subsidiary's events by being a
 *                                        parent.
 *   - aliases and assurance level      — a verified DOT/SCAC/LEI proves identity linkage, not
 *                                        permission to receive data.
 *   - `tenant_id`                      — storage metadata. It is not recipient eligibility, and
 *                                        NULL is not public.
 *
 * None of them appears in `DisclosureInput`. That is the enforcement: a predicate cannot consult a
 * field the evaluator was never given.
 */

import { canonicalSha256, type CanonicalJsonValue } from '@freightos/schemas';

// ---------------------------------------------------------------------------
// Input.
// ---------------------------------------------------------------------------

/** The participant states N5-A recognises. Mirrors `app.network_participant_status`. */
export type ParticipantStatus = 'pending' | 'active' | 'suspended' | 'revoked';

/**
 * A participant, reduced to what a disclosure decision may consider.
 *
 * `tenantId` is absent from this type ON PURPOSE. Recipient eligibility must never depend on
 * tenancy — an external organization with no FreightOS tenant is a first-class recipient — and the
 * surest way to guarantee a predicate cannot use it is not to carry it.
 */
export interface DisclosureParticipant {
  readonly participantId: string;
  readonly participantType: 'organization' | string;
  readonly status: ParticipantStatus;
}

/**
 * The canonical event, reduced to the three fields authorization may consider.
 *
 * `classification`, `eventClass`, `subject`, `source`, `correlationId` and the rest are absent —
 * see the header. `organizationId` is here because it is the ASSERTING organization and the
 * grantor→event binding depends on it.
 */
export interface DisclosureEvent {
  readonly eventId: string;
  readonly organizationId: string;
  readonly schemaRef: string;
  readonly data: unknown;
}

export interface DisclosureProjection {
  readonly projectionRef: string;
  readonly durableSchemaRef: string;
  readonly pointers: readonly string[];
}

export interface DisclosureGrant {
  readonly grantId: string;
  readonly grantorParticipantId: string;
  readonly recipientParticipantId: string;
  readonly purposeCode: string;
  readonly projectionRef: string;
  readonly authorityBasisCode: string;
  /** Inclusive. */
  readonly effectiveFrom: Date;
  /** Exclusive. `null` means indefinite until revoked. */
  readonly effectiveUntil: Date | null;
  /** `null` when the grant has never been revoked. */
  readonly revokedAt: Date | null;
}

export interface DisclosureInput {
  readonly event: DisclosureEvent;
  readonly recipientParticipantId: string;
  readonly requestedPurpose: string;
  readonly decidedAt: Date;
  /** Candidate grants. The evaluator filters; the caller need not pre-filter correctly. */
  readonly grants: readonly DisclosureGrant[];
  readonly projections: readonly DisclosureProjection[];
  /** Every participant referenced by a candidate grant, plus the recipient. */
  readonly participants: readonly DisclosureParticipant[];
}

// ---------------------------------------------------------------------------
// Output.
// ---------------------------------------------------------------------------

/**
 * Internal denial reasons.
 *
 * A closed TypeScript union, NOT a database enum and NOT an external API surface. Several of these
 * would leak the existence of a grant to a caller who is not entitled to know — `grantorEventMismatch`
 * reveals that a grant exists for a different grantor, `grantRevoked` that one existed at all — so
 * the evaluator distinguishes them internally and N6 decides which, if any, are ever surfaced.
 */
export type DisclosureDenialReason =
  | 'no_applicable_grant'
  | 'grantor_event_mismatch'
  | 'grantor_not_active'
  | 'recipient_not_active'
  | 'purpose_not_permitted'
  | 'schema_not_covered'
  | 'grant_not_yet_effective'
  | 'grant_expired'
  | 'grant_revoked'
  | 'no_permitted_fields';

/** Which grant authorized a given pointer, and on what basis. */
export interface FieldAuthorization {
  readonly jsonPointer: string;
  readonly grantId: string;
  readonly projectionRef: string;
  readonly authorityBasisCode: string;
}

export interface DisclosureAllow {
  readonly decision: 'ALLOW';
  readonly eventId: string;
  readonly grantorParticipantId: string;
  readonly recipientParticipantId: string;
  readonly purposeCode: string;
  readonly grantIds: readonly string[];
  readonly projectionRefs: readonly string[];
  readonly permittedPointers: readonly string[];
  readonly fieldAuthorizations: readonly FieldAuthorization[];
  readonly authorityBasisCodes: readonly string[];
  readonly decidedAt: Date;
  readonly decisionDigest: string;
}

export interface DisclosureDeny {
  readonly decision: 'DENY';
  readonly reason: DisclosureDenialReason;
  readonly decidedAt: Date;
}

export type DisclosureDecision = DisclosureAllow | DisclosureDeny;

// ---------------------------------------------------------------------------
// Evaluation.
// ---------------------------------------------------------------------------

const deny = (reason: DisclosureDenialReason, decidedAt: Date): DisclosureDeny => ({
  decision: 'DENY',
  reason,
  decidedAt,
});

function isActiveOrganization(p: DisclosureParticipant | undefined): boolean {
  return p !== undefined && p.participantType === 'organization' && p.status === 'active';
}

/**
 * Evaluate a disclosure.
 *
 * DEFAULT DENY IS STRUCTURAL, not a final `else`. There is exactly one `return` that produces an
 * ALLOW, and reaching it requires every predicate below to have held for at least one grant. No
 * fallback exists on same-tenant, same-organization, known participant, existing transport intent,
 * relationship, alias, assurance level or classification — there is no code path that consults any
 * of them.
 */
export function evaluateDisclosure(input: DisclosureInput): DisclosureDecision {
  const { event, recipientParticipantId, requestedPurpose, decidedAt } = input;

  const byId = new Map(input.participants.map((p) => [p.participantId, p]));
  const projections = new Map(input.projections.map((p) => [p.projectionRef, p]));

  // The recipient must be an ACTIVE ORGANIZATION. Checked once, before any grant is considered,
  // because an inactive recipient cannot receive anything regardless of what was granted.
  // Deliberately NOT a tenancy check: a NULL-tenant external organization is eligible.
  if (!isActiveOrganization(byId.get(recipientParticipantId))) {
    return deny('recipient_not_active', decidedAt);
  }

  // Tracks the most specific reason seen, so a denial can say something more useful than
  // "no_applicable_grant" when exactly one candidate failed on one predicate.
  let observed: DisclosureDenialReason | undefined;
  const note = (reason: DisclosureDenialReason): void => {
    if (observed === undefined) observed = reason;
  };

  const applicable: { grant: DisclosureGrant; projection: DisclosureProjection }[] = [];

  for (const grant of input.grants) {
    // ---- THE CRITICAL CROSS-ORGANIZATION PREDICATE -------------------------
    // The grantor must be the organization that ASSERTED this event. Without it, a grant naming a
    // schema would authorize any organization's event under that schema, and a shared contract
    // would silently bridge two organizations. Evaluated FIRST, so a foreign grant contributes
    // nothing — not even a reduced field set, which would itself leak that the grant exists.
    if (grant.grantorParticipantId !== event.organizationId) {
      note('grantor_event_mismatch');
      continue;
    }

    if (grant.recipientParticipantId !== recipientParticipantId) {
      note('no_applicable_grant');
      continue;
    }

    if (!isActiveOrganization(byId.get(grant.grantorParticipantId))) {
      note('grantor_not_active');
      continue;
    }

    // Exact purpose. No inference from event type, class, subject, source or schema; no prefix
    // matching; no hierarchy; no fallback.
    if (grant.purposeCode !== requestedPurpose) {
      note('purpose_not_permitted');
      continue;
    }

    // Temporal. effective_from INCLUSIVE, effective_until EXCLUSIVE, revocation effective AT
    // revoked_at inclusive. Stated as explicit comparisons because a half-open interval left
    // implicit is how off-by-one authorization bugs happen.
    if (!(grant.effectiveFrom.getTime() <= decidedAt.getTime())) {
      note('grant_not_yet_effective');
      continue;
    }
    if (grant.effectiveUntil !== null && !(decidedAt.getTime() < grant.effectiveUntil.getTime())) {
      note('grant_expired');
      continue;
    }
    if (grant.revokedAt !== null && grant.revokedAt.getTime() <= decidedAt.getTime()) {
      note('grant_revoked');
      continue;
    }

    const projection = projections.get(grant.projectionRef);
    if (projection === undefined) {
      note('schema_not_covered');
      continue;
    }

    // Exact schema equality. A projection is bound to ONE durable contract; a new payload version
    // has no projection until one is authored, which is what makes a newly added sensitive field
    // fail closed instead of riding in on an old grant.
    if (projection.durableSchemaRef !== event.schemaRef) {
      note('schema_not_covered');
      continue;
    }

    applicable.push({ grant, projection });
  }

  if (applicable.length === 0) {
    return deny(observed ?? 'no_applicable_grant', decidedAt);
  }

  // ---- COMPOSITION -------------------------------------------------------
  // UNION, not intersection. Under intersection a second, narrower grant would REDUCE what a
  // recipient may receive, so granting more permission would take permission away — incoherent, and
  // a trap for whoever administers grants.
  //
  // Only grants that independently satisfied EVERY predicate are here, so each field is authorized
  // by at least one wholly valid grant. A partially valid grant contributed nothing at all.
  const authorizations: FieldAuthorization[] = [];
  for (const { grant, projection } of applicable) {
    for (const jsonPointer of projection.pointers) {
      authorizations.push({
        jsonPointer,
        grantId: grant.grantId,
        projectionRef: projection.projectionRef,
        authorityBasisCode: grant.authorityBasisCode,
      });
    }
  }

  // When two grants independently authorize the same pointer, BOTH authorizers are preserved.
  // Discarding one would make the evidence trail depend on iteration order.
  const permittedPointers = [...new Set(authorizations.map((a) => a.jsonPointer))].sort();

  if (permittedPointers.length === 0) {
    // An ALLOW with no fields is not a disclosure; emitting one would be a meaningless payload.
    return deny('no_permitted_fields', decidedAt);
  }

  const grantIds = [...new Set(applicable.map((a) => a.grant.grantId))].sort();
  const projectionRefs = [...new Set(applicable.map((a) => a.projection.projectionRef))].sort();
  const authorityBasisCodes = [
    ...new Set(applicable.map((a) => a.grant.authorityBasisCode)),
  ].sort();
  const fieldAuthorizations = [...authorizations].sort(
    (a, b) =>
      a.jsonPointer.localeCompare(b.jsonPointer) ||
      a.grantId.localeCompare(b.grantId) ||
      a.projectionRef.localeCompare(b.projectionRef),
  );

  // ---- DIGEST ------------------------------------------------------------
  // EVERY array is sorted BEFORE canonicalisation. `canonicalJson` sorts object keys but PRESERVES
  // array order by design — arrays are values, and N3 needs `[a,b]` and `[b,a]` to fingerprint
  // differently — so array determinism is this function's responsibility, not the canonicaliser's.
  // Without the explicit sorts the digest would depend on database row order.
  const digestInput: CanonicalJsonValue = {
    event_id: event.eventId,
    grantor_participant_id: event.organizationId,
    recipient_participant_id: recipientParticipantId,
    purpose_code: requestedPurpose,
    grant_ids: grantIds,
    projection_refs: projectionRefs,
    permitted_pointers: permittedPointers,
    field_authorizations: fieldAuthorizations.map((a) => ({
      json_pointer: a.jsonPointer,
      grant_id: a.grantId,
      projection_ref: a.projectionRef,
      authority_basis_code: a.authorityBasisCode,
    })),
    authority_basis_codes: authorityBasisCodes,
    decided_at: decidedAt.toISOString(),
  };

  return {
    decision: 'ALLOW',
    eventId: event.eventId,
    grantorParticipantId: event.organizationId,
    recipientParticipantId,
    purposeCode: requestedPurpose,
    grantIds,
    projectionRefs,
    permittedPointers,
    fieldAuthorizations,
    authorityBasisCodes,
    decidedAt,
    decisionDigest: canonicalSha256(digestInput),
  };
}
