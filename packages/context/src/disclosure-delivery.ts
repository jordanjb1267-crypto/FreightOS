/**
 * N6 — authorized disclosure delivery.
 *
 *   TRANSPORT OWED != DISCLOSURE AUTHORIZED != DELIVERY ATTEMPTED != DELIVERY SUCCEEDED
 *
 * N4 records that transport is owed for an accepted event. This module decides, for each governed
 * expression of INTEREST, whether that debt may be satisfied by a disclosure — and if so, freezes
 * exactly what may leave. It is the only place those two questions meet, and it answers them in
 * that order.
 *
 * WHAT THIS MODULE DOES NOT ACCEPT, AND WHY IT MATTERS MORE THAN WHAT IT DOES.
 *
 * There is no `recipientParticipantId` parameter, no `purposeCode` parameter, no pointer or field
 * parameter, no `projectionRef` parameter and no destination parameter anywhere in the public
 * surface. A worker cannot pass any of them, because a worker that could choose a recipient or a
 * purpose would BE the authorization rather than execute it. Recipient and purpose come from the
 * governed subscription; the field set comes from N5-A; the content ceiling comes from N5-B. The
 * caller supplies the event and the governed inputs, and nothing else.
 *
 * ORDER. N5-B first, then N5-A, exactly as `evaluateDisclosureWithCeiling` composes them — so a
 * refused ceiling never constructs an N5-A permitted-pointer union, and a field set that must not
 * leave never exists in memory to be logged, returned or folded into a digest.
 *
 * A SUBSCRIPTION NARROWS. It never widens. There is no field list on a subscription and this module
 * would have nowhere to read one from if there were: the pointers it projects are the ones N5-A
 * returned, and nothing else is reachable from here.
 */
import { canonicalJson, canonicalSha256, projectPayload } from '@freightos/schemas';

import type {
  DisclosureEvent,
  DisclosureGrant,
  DisclosureParticipant,
  DisclosureProjection,
} from './disclosure.ts';
import {
  evaluateDisclosureWithCeiling,
  permittedPointers,
  type DisclosureCeilingDecision,
  type SensitivityMetadata,
} from './disclosure-sensitivity.ts';

// ---------------------------------------------------------------------------
// Input.
// ---------------------------------------------------------------------------

/** The v1 destination vocabulary. One value, and it is a table in this database. */
export type DeliveryDestinationKind = 'freightos_inbox';

/**
 * A governed expression of interest.
 *
 * Deliberately absent: any field, pointer, projection or authority column. A subscription that
 * named fields would be a second security-critical field enumeration beside
 * `network_disclosure_projection_fields`, free to disagree with it, with nothing forcing agreement.
 * N5-A chooses the projection; interest chooses only whether to ask.
 */
export interface DeliverySubscription {
  readonly subscriptionId: string;
  readonly recipientParticipantId: string;
  readonly purposeCode: string;
  readonly durableSchemaRef: string;
  readonly destinationKind: DeliveryDestinationKind;
  readonly effectiveFrom: Date;
  readonly effectiveUntil: Date | null;
  /** `null` when interest has never been withdrawn. */
  readonly revokedAt: Date | null;
}

/**
 * Everything routing may consider, and nothing it may not.
 *
 * `event` carries the N3 fact. The remaining collections are governed data read from the database
 * — grants, projections, participants and subscriptions — so this function is pure and every
 * decision it makes is reproducible from its arguments.
 */
export interface DeliveryRoutingInput {
  readonly event: DisclosureEvent;
  readonly subscriptions: readonly DeliverySubscription[];
  readonly grants: readonly DisclosureGrant[];
  readonly projections: readonly DisclosureProjection[];
  readonly participants: readonly DisclosureParticipant[];
  readonly decidedAt: Date;
}

// ---------------------------------------------------------------------------
// Output.
// ---------------------------------------------------------------------------

/**
 * The frozen disclosure artifact: exactly what may leave, and the decision that permitted it.
 *
 * `payloadCanonical` is the bytes. Not a structure to be re-serialized later — the string itself,
 * because `payloadDigest` is SHA-256 over exactly these bytes and a later re-serialization is a
 * different thing that would produce a matching digest only by coincidence of implementation.
 */
export interface DisclosureArtifact {
  readonly subscriptionId: string;
  readonly networkEventId: string;
  readonly recipientParticipantId: string;
  readonly purposeCode: string;
  readonly durableSchemaRef: string;
  readonly sensitivityCode: string;
  /** The FROZEN authorized set. Retries compare against this rather than recomputing one. */
  readonly permittedPointers: readonly string[];
  readonly authorizationDigest: string;
  readonly compositeDecisionDigest: string;
  readonly payloadCanonical: string;
  readonly payloadDigest: string;
}

/** Why a matched subscription produced no artifact. Internal; never shown to a recipient. */
export interface DisclosureRoutingDenial {
  readonly subscriptionId: string;
  readonly stage: 'sensitivity' | 'authorization';
  readonly reason: string;
  readonly compositeDecisionDigest: string;
}

export interface RoutingResolution {
  readonly networkEventId: string;
  readonly matchedSubscriptionCount: number;
  readonly authorized: readonly DisclosureArtifact[];
  readonly denied: readonly DisclosureRoutingDenial[];
  readonly resolvedAt: Date;
}

// ---------------------------------------------------------------------------
// Interest.
// ---------------------------------------------------------------------------

/**
 * Does this subscription express interest in this event, at this instant?
 *
 * Contract identity is EXACT. `workflow-state.v2.json` is a different `durable_schema_ref` from
 * `workflow-state.v1.json`, so a v2 event matches no v1 subscription — a new schema version
 * inherits no routing eligibility, structurally, for the same reason it inherits no sensitivity
 * assignment in N5-B: there is nothing to inherit through.
 */
function subscriptionMatches(
  subscription: DeliverySubscription,
  event: DisclosureEvent,
  at: Date,
): boolean {
  if (subscription.durableSchemaRef !== event.schemaRef) return false;
  if (subscription.revokedAt !== null && subscription.revokedAt.getTime() <= at.getTime()) {
    return false;
  }
  if (subscription.effectiveFrom.getTime() > at.getTime()) return false;
  if (
    subscription.effectiveUntil !== null &&
    subscription.effectiveUntil.getTime() <= at.getTime()
  ) {
    return false;
  }
  return true;
}

/**
 * Deterministic order, independent of database row order.
 *
 * Enumeration must produce the same obligations in the same order for the same inputs, or the
 * routing resolution's counts become a function of the planner.
 */
function orderedMatches(input: DeliveryRoutingInput): readonly DeliverySubscription[] {
  return input.subscriptions
    .filter((s) => subscriptionMatches(s, input.event, input.decidedAt))
    .slice()
    .sort((a, b) =>
      a.subscriptionId < b.subscriptionId ? -1 : a.subscriptionId > b.subscriptionId ? 1 : 0,
    );
}

// ---------------------------------------------------------------------------
// Routing.
// ---------------------------------------------------------------------------

/**
 * Resolve one accepted event against governed interest, exactly once.
 *
 * ONE ARTIFACT PER MATCHED SUBSCRIPTION, never one per subscription × grant. Multiple applicable
 * grants are N5-A's provenance for a single union of fields — that is what its multi-grant union
 * means — not multiple instructions to deliver. Fanning out per grant would deliver the same event
 * to the same recipient once for every grant that happened to authorize part of it.
 */
export function resolveRouting(
  input: DeliveryRoutingInput,
  metadata: SensitivityMetadata | null,
): RoutingResolution {
  const matched = orderedMatches(input);
  const authorized: DisclosureArtifact[] = [];
  const denied: DisclosureRoutingDenial[] = [];

  for (const subscription of matched) {
    const decision = evaluateDisclosureWithCeiling(
      {
        event: input.event,
        // Recipient and purpose are READ FROM THE GOVERNED SUBSCRIPTION. This is the only place
        // they enter the evaluation, and no caller can reach it.
        recipientParticipantId: subscription.recipientParticipantId,
        requestedPurpose: subscription.purposeCode,
        decidedAt: input.decidedAt,
        grants: input.grants,
        projections: input.projections,
        participants: input.participants,
      },
      metadata,
    );

    if (decision.decision === 'DENY') {
      denied.push({
        subscriptionId: subscription.subscriptionId,
        stage: decision.stage,
        reason: decision.reason,
        compositeDecisionDigest: decision.compositeDecisionDigest,
      });
      continue;
    }

    authorized.push(materialize(subscription, input.event, decision));
  }

  return {
    networkEventId: input.event.eventId,
    matchedSubscriptionCount: matched.length,
    authorized,
    denied,
    resolvedAt: input.decidedAt,
  };
}

/**
 * Freeze the authorized bytes.
 *
 * The pointers projected are `permittedPointers(decision)` and nothing else — there is no raw
 * event fallback, no debug field, no include-extra flag and no path by which an unauthorized
 * pointer could be reached, because the only pointer list in scope is the one N5-A returned.
 *
 * `projectPayload` and `canonicalJson` are the repository's existing implementations, deliberately:
 * N6 introducing its own pointer semantics or its own serializer would create a second definition
 * of "the authorized fields" and a second definition of "the bytes", each free to drift from the
 * one N5-A's projections were authored against.
 */
function materialize(
  subscription: DeliverySubscription,
  event: DisclosureEvent,
  decision: Extract<DisclosureCeilingDecision, { decision: 'ALLOW' }>,
): DisclosureArtifact {
  const pointers = permittedPointers(decision);
  const projected = projectPayload(event.data, pointers);
  const payloadCanonical = canonicalJson(projected);

  return {
    subscriptionId: subscription.subscriptionId,
    networkEventId: event.eventId,
    recipientParticipantId: subscription.recipientParticipantId,
    purposeCode: subscription.purposeCode,
    durableSchemaRef: event.schemaRef,
    sensitivityCode: decision.sensitivity.sensitivityCode,
    permittedPointers: pointers,
    authorizationDigest: decision.authorization.decisionDigest,
    compositeDecisionDigest: decision.compositeDecisionDigest,
    payloadCanonical,
    // Over the CANONICAL FORM, so the digest binds the bytes that were authorized rather than a
    // re-rendering of an equivalent structure.
    payloadDigest: canonicalSha256(projected),
  };
}

// ---------------------------------------------------------------------------
// Attempt-time re-authorization.
// ---------------------------------------------------------------------------

export type ReauthorizationRefusalReason =
  | 'sensitivity_or_authorization_denied'
  | 'artifact_not_within_current_authorization'
  | 'subscription_no_longer_effective';

export interface ReauthorizationPermit {
  readonly authorized: true;
  readonly compositeDecisionDigest: string;
}

export interface ReauthorizationRefusal {
  readonly authorized: false;
  readonly reason: ReauthorizationRefusalReason;
  /** Absent only when interest lapsed and no N5 evaluation was performed. */
  readonly compositeDecisionDigest: string | null;
  readonly detail: string | null;
}

export type ReauthorizationOutcome = ReauthorizationPermit | ReauthorizationRefusal;

/**
 * Decide whether an already-minted artifact may be transmitted NOW.
 *
 * Queueing is not disclosure; sending is. A delivery record that exists proves only that
 * authorization held once, and the interval between then and now is exactly where a revocation
 * lands. So every attempt re-runs the full N5-B → N5-A evaluation against current governed state,
 * and the result is compared to the frozen artifact rather than substituted for it.
 *
 * THE SUBSET RULE. The artifact may proceed only if every pointer it froze is still authorized:
 *
 *   artifact.permittedPointers ⊆ current.permittedPointers
 *
 * A current authorization that is BROADER changes nothing — the artifact is what leaves, so a
 * retry can never widen a disclosure. A current authorization that is NARROWER refuses: the
 * artifact is not silently replaced with a reduced payload, because a delivery whose content
 * changed between attempts is not the same delivery, and quietly substituting one would make the
 * payload digest and the delivery identity disagree about what was sent.
 */
export function reauthorizeDelivery(
  artifact: DisclosureArtifact,
  input: DeliveryRoutingInput,
  metadata: SensitivityMetadata | null,
): ReauthorizationOutcome {
  const subscription = input.subscriptions.find(
    (s) => s.subscriptionId === artifact.subscriptionId,
  );

  // Interest withdrawn, lapsed, or the subscription is simply gone. No N5 evaluation is performed:
  // there is no governed source for a recipient or a purpose to evaluate against, and inventing
  // one from the artifact would be the worker choosing them after all.
  if (
    subscription === undefined ||
    !subscriptionMatches(subscription, input.event, input.decidedAt)
  ) {
    return {
      authorized: false,
      reason: 'subscription_no_longer_effective',
      compositeDecisionDigest: null,
      detail: subscription === undefined ? 'subscription absent' : 'subscription not effective',
    };
  }

  const decision = evaluateDisclosureWithCeiling(
    {
      event: input.event,
      recipientParticipantId: subscription.recipientParticipantId,
      requestedPurpose: subscription.purposeCode,
      decidedAt: input.decidedAt,
      grants: input.grants,
      projections: input.projections,
      participants: input.participants,
    },
    metadata,
  );

  if (decision.decision === 'DENY') {
    return {
      authorized: false,
      reason: 'sensitivity_or_authorization_denied',
      compositeDecisionDigest: decision.compositeDecisionDigest,
      detail: `${decision.stage}:${decision.reason}`,
    };
  }

  const current = new Set(permittedPointers(decision));
  const withdrawn = artifact.permittedPointers.filter((p) => !current.has(p));
  if (withdrawn.length > 0) {
    return {
      authorized: false,
      reason: 'artifact_not_within_current_authorization',
      compositeDecisionDigest: decision.compositeDecisionDigest,
      detail: `no longer authorized: ${withdrawn.join(',')}`,
    };
  }

  return { authorized: true, compositeDecisionDigest: decision.compositeDecisionDigest };
}

/**
 * The backoff schedule, as ruled.
 *
 * Six attempts, twenty-four hours, thirty seconds doubling to a thirty-minute cap, full jitter.
 * `random` is injected so the schedule is testable; it is not a source of authority and nothing
 * about it is security-relevant.
 */
export const DELIVERY_MAX_ATTEMPTS = 6;
export const DELIVERY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DELIVERY_BACKOFF_BASE_MS = 30_000;
const DELIVERY_BACKOFF_CAP_MS = 30 * 60 * 1000;

export function nextAttemptDelayMs(attemptNumber: number, random: () => number): number {
  const uncapped = DELIVERY_BACKOFF_BASE_MS * 2 ** Math.max(0, attemptNumber - 1);
  return Math.floor(random() * Math.min(uncapped, DELIVERY_BACKOFF_CAP_MS));
}

/** Has this obligation run out of budget? Attempts OR age, whichever comes first. */
export function retryBudgetExhausted(attemptCount: number, createdAt: Date, now: Date): boolean {
  return (
    attemptCount >= DELIVERY_MAX_ATTEMPTS ||
    now.getTime() - createdAt.getTime() >= DELIVERY_MAX_AGE_MS
  );
}
