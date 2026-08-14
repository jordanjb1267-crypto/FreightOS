/**
 * N5-B — the disclosure sensitivity ceiling.
 *
 * Answers a question N5-A structurally cannot:
 *
 *     EVEN IF A GRANT AUTHORIZES THIS RECIPIENT FOR THIS PURPOSE,
 *     IS THIS KIND OF CONTENT ALLOWED TO CROSS AN ORGANIZATION BOUNDARY AT ALL?
 *
 * The two are independent conditions and both must hold:
 *
 *     N5B_PERMITS  AND  N5A_ALLOWS  ⟹  disclosure eligible
 *     anything else                 ⟹  DENY
 *
 * WHY A SECOND CONDITION EXISTS. An N5-A grant is written by the grantor. With N5-A alone the
 * grantor is the only thing between a sensitive contract and the network, and "the party who
 * benefits decides" is not a control. N5-B is governed metadata authored by migration, and the
 * controlling invariant is one-directional:
 *
 *     AN N5-A GRANT MAY NARROW WHAT CAN LEAVE.
 *     IT MUST NEVER WIDEN WHAT N5-B ALLOWS TO LEAVE.
 *
 * THIS MODULE DOES NOT TOUCH N5-A. `disclosure.ts` is imported and called, never edited: its types,
 * its predicates, its denial reasons and its decision digest are byte-identical to what they were
 * before N5-B existed, so an N5-A decision remains independently replayable and every digest
 * computed before this module shipped still verifies. Composition happens here, in a new module,
 * for exactly that reason.
 *
 * WHAT N5-B NEVER READS, and why the list matters more here than anywhere else. Sensitivity is
 * resolved from ONE path — `durable_schema_ref` → governed assignment → governed vocabulary — and
 * from nothing else:
 *
 *   - `network_events.classification`   — an ungoverned producer-supplied string. N3 froze it as
 *                                         authority-inert.
 *   - a payload `classification` field  — NOT hypothetical: `evidence-envelope.v1` and
 *                                         `event-envelope.v1` both carry a producer-controlled
 *                                         property with that exact name. Resolving sensitivity by
 *                                         field name would hand the ceiling to the event producer.
 *   - any caller-supplied sensitivity   — there is no override parameter, at any layer.
 *   - participant attributes            — type, tenancy, relationships, aliases, assurance level.
 *   - transport intent                  — N4 debt says movement is owed, not that content is
 *                                         disclosable.
 *   - administrative role               — database capability is not disclosure authority.
 *
 * None of them appears in `SensitivityMetadata` or in any argument below. As in N5-A, that is the
 * enforcement: a predicate cannot consult a field the evaluator was never given.
 *
 * FAIL-CLOSED IS STRUCTURAL. Missing assignment, unknown code, missing purpose ceiling, unreadable
 * metadata and the absolute class all deny, and there is exactly one code path that returns a
 * permit. There is no fallback to N5-A alone, no assumption of the lowest level, and no
 * emit-then-audit path.
 */

import { canonicalSha256, type CanonicalJsonValue } from '@freightos/schemas';

import {
  evaluateDisclosure,
  type DisclosureAllow,
  type DisclosureDecision,
  type DisclosureDenialReason,
  type DisclosureInput,
} from './disclosure.ts';

// ---------------------------------------------------------------------------
// Governed metadata.
// ---------------------------------------------------------------------------

/**
 * One level of the ordered vocabulary. Mirrors `network_disclosure_sensitivities`.
 *
 * `rank` and `externallyDisclosable` are BOTH carried and BOTH required, rather than deriving one
 * from the other. A level could be given a low rank and still be non-disclosable, and the migration
 * reserves rank 99 for the absolute class without that reservation being the mechanism — so an
 * evaluator that tested only `rank !== 99` would be relying on a numbering convention instead of on
 * the governed flag.
 */
export interface DisclosureSensitivity {
  readonly code: string;
  readonly rank: number;
  readonly externallyDisclosable: boolean;
}

/** One immutable assignment. Mirrors `network_schema_disclosure_sensitivity`. */
export interface SchemaSensitivityAssignment {
  readonly durableSchemaRef: string;
  readonly sensitivityCode: string;
}

/** One immutable purpose ceiling. Mirrors `network_disclosure_purpose_ceilings`. */
export interface PurposeCeiling {
  readonly purposeCode: string;
  readonly maxSensitivityCode: string;
}

/**
 * The governed metadata set, loaded by the caller exactly as N5-A's grants and projections are.
 *
 * Passed as `null` when it could not be read. That is a distinct, explicit state rather than an
 * empty set: an empty set and an unreadable store both deny, but they deny for different reasons
 * and conflating them would hide a broken metadata store behind a routine "unassigned".
 */
export interface SensitivityMetadata {
  readonly sensitivities: readonly DisclosureSensitivity[];
  readonly assignments: readonly SchemaSensitivityAssignment[];
  readonly purposeCeilings: readonly PurposeCeiling[];
}

// ---------------------------------------------------------------------------
// Output.
// ---------------------------------------------------------------------------

/**
 * Internal N5-B denial reasons.
 *
 * A closed TypeScript union, NOT a database enum and NOT an external surface — the same choice
 * N5-A made, for the same reason. Several of these describe governance state a recipient is not
 * entitled to learn: `schema_never_external` reveals a classification, and
 * `sensitivity_above_purpose_ceiling` reveals both a classification and a policy. N6 decides later
 * what, if anything, may leave.
 *
 * There is deliberately no `sensitivity_above_global_ceiling`: no independent global maximum
 * exists, because a global maximum is what lets a later purpose silently inherit one.
 */
export type SensitivityDenialReason =
  | 'sensitivity_unassigned'
  | 'sensitivity_unknown'
  | 'sensitivity_metadata_unavailable'
  | 'purpose_ceiling_unassigned'
  | 'purpose_ceiling_unknown'
  | 'schema_never_external'
  | 'sensitivity_above_purpose_ceiling';

/** The ceiling permitted the content. Carries what permitted it, for the digest and for forensics. */
export interface SensitivityPermit {
  readonly permits: true;
  readonly durableSchemaRef: string;
  readonly purposeCode: string;
  readonly sensitivityCode: string;
  readonly sensitivityRank: number;
  readonly purposeCeilingCode: string;
  readonly purposeCeilingRank: number;
}

/**
 * The ceiling refused.
 *
 * Every field is nullable because a refusal can happen before the value exists — an unassigned
 * contract has no sensitivity code to report, and an unreadable store has neither. Reporting a
 * placeholder would be inventing metadata at exactly the moment metadata is known to be missing.
 */
export interface SensitivityRefusal {
  readonly permits: false;
  readonly reason: SensitivityDenialReason;
  readonly durableSchemaRef: string;
  readonly purposeCode: string;
  readonly sensitivityCode: string | null;
  readonly sensitivityRank: number | null;
  readonly purposeCeilingCode: string | null;
  readonly purposeCeilingRank: number | null;
}

export type SensitivityDecision = SensitivityPermit | SensitivityRefusal;

export interface DisclosureCeilingAllow {
  readonly decision: 'ALLOW';
  readonly sensitivity: SensitivityPermit;
  /** The unmodified N5-A decision. Its own digest is unchanged and still verifies on its own. */
  readonly authorization: DisclosureAllow;
  readonly decidedAt: Date;
  readonly compositeDecisionDigest: string;
}

export interface DisclosureCeilingDeny {
  readonly decision: 'DENY';
  /** Which condition refused. `sensitivity` means N5-A was never consulted. */
  readonly stage: 'sensitivity' | 'authorization';
  readonly reason: SensitivityDenialReason | DisclosureDenialReason;
  readonly sensitivity: SensitivityDecision;
  /**
   * `null` when N5-B refused, and that is the honest shape rather than a gap.
   *
   * N5-B runs first precisely so that a refused disclosure never computes an N5-A permitted-pointer
   * union. Filling this field would require running the authorization pass anyway, which is the
   * thing the ordering exists to avoid — so the type says "not consulted" and means it.
   */
  readonly authorization: DisclosureDecision | null;
  readonly decidedAt: Date;
  readonly compositeDecisionDigest: string;
}

export type DisclosureCeilingDecision = DisclosureCeilingAllow | DisclosureCeilingDeny;

// ---------------------------------------------------------------------------
// Sensitivity evaluation.
// ---------------------------------------------------------------------------

/**
 * Resolve the ceiling for one contract and one purpose.
 *
 * Pure, and independent of every N5-A input: it takes a `durableSchemaRef` and a `purposeCode` and
 * nothing else, which is what makes it runnable BEFORE any grant is examined. That independence is
 * the property the ordering in `evaluateDisclosureWithCeiling` relies on.
 */
export function evaluateSensitivityCeiling(
  durableSchemaRef: string,
  purposeCode: string,
  metadata: SensitivityMetadata | null,
): SensitivityDecision {
  const refuse = (
    reason: SensitivityDenialReason,
    parts: Partial<Omit<SensitivityRefusal, 'permits' | 'reason'>> = {},
  ): SensitivityRefusal => ({
    permits: false,
    reason,
    durableSchemaRef,
    purposeCode,
    sensitivityCode: null,
    sensitivityRank: null,
    purposeCeilingCode: null,
    purposeCeilingRank: null,
    ...parts,
  });

  // The metadata store could not be read. DENY — never fall back to N5-A alone, and never assume
  // the lowest level, which is the failure mode that turns an outage into a disclosure.
  if (metadata === null) return refuse('sensitivity_metadata_unavailable');

  const levels = new Map(metadata.sensitivities.map((s) => [s.code, s]));

  // No assignment for this EXACT contract version. This is also how a new schema version is denied:
  // there is no lookup of a previous version, a predecessor or a shared base name, so a v2 that
  // added a sensitive field cannot inherit v1's ceiling — there is nothing to inherit through.
  const assignment = metadata.assignments.find((a) => a.durableSchemaRef === durableSchemaRef);
  if (assignment === undefined) return refuse('sensitivity_unassigned');

  const assigned = levels.get(assignment.sensitivityCode);
  if (assigned === undefined) return refuse('sensitivity_unknown');

  // The absolute class, checked before the ceiling comparison so that it cannot be reached by any
  // arithmetic. No grant, purpose, basis, relationship, tenancy or administrative role changes it.
  if (!assigned.externallyDisclosable) {
    return refuse('schema_never_external', {
      sensitivityCode: assigned.code,
      sensitivityRank: assigned.rank,
    });
  }

  // A purpose with no ceiling discloses nothing. A global maximum would have let this purpose
  // silently inherit one, which is why no global maximum exists.
  const ceiling = metadata.purposeCeilings.find((c) => c.purposeCode === purposeCode);
  if (ceiling === undefined) {
    return refuse('purpose_ceiling_unassigned', {
      sensitivityCode: assigned.code,
      sensitivityRank: assigned.rank,
    });
  }

  const ceilingLevel = levels.get(ceiling.maxSensitivityCode);
  if (ceilingLevel === undefined) {
    return refuse('purpose_ceiling_unknown', {
      sensitivityCode: assigned.code,
      sensitivityRank: assigned.rank,
      purposeCeilingCode: ceiling.maxSensitivityCode,
    });
  }

  if (assigned.rank > ceilingLevel.rank) {
    return refuse('sensitivity_above_purpose_ceiling', {
      sensitivityCode: assigned.code,
      sensitivityRank: assigned.rank,
      purposeCeilingCode: ceilingLevel.code,
      purposeCeilingRank: ceilingLevel.rank,
    });
  }

  return {
    permits: true,
    durableSchemaRef,
    purposeCode,
    sensitivityCode: assigned.code,
    sensitivityRank: assigned.rank,
    purposeCeilingCode: ceilingLevel.code,
    purposeCeilingRank: ceilingLevel.rank,
  };
}

// ---------------------------------------------------------------------------
// Composite evaluation.
// ---------------------------------------------------------------------------

/**
 * Bind the two decisions into one digest without touching either.
 *
 * The N5-A digest goes in whole, as an opaque value, so the composite proves WHICH grants
 * authorized the fields (that question is answered by replaying N5-A) and WHICH ceiling permitted
 * them (answered by the remaining inputs) as two independently verifiable halves. `null` when N5-A
 * was never consulted — a distinct fingerprint from any real digest, so a refusal before
 * authorization can never collide with a refusal after it.
 */
function compositeDigest(
  sensitivity: SensitivityDecision,
  authorization: DisclosureDecision | null,
  decidedAt: Date,
): string {
  const input: CanonicalJsonValue = {
    n5a_decision: authorization === null ? null : authorization.decision,
    n5a_decision_digest:
      authorization !== null && authorization.decision === 'ALLOW'
        ? authorization.decisionDigest
        : null,
    n5a_denial_reason:
      authorization !== null && authorization.decision === 'DENY' ? authorization.reason : null,
    n5b_permits: sensitivity.permits,
    n5b_denial_reason: sensitivity.permits ? null : sensitivity.reason,
    durable_schema_ref: sensitivity.durableSchemaRef,
    purpose_code: sensitivity.purposeCode,
    sensitivity_code: sensitivity.sensitivityCode,
    sensitivity_rank: sensitivity.sensitivityRank,
    purpose_ceiling_code: sensitivity.purposeCeilingCode,
    purpose_ceiling_rank: sensitivity.purposeCeilingRank,
    decided_at: decidedAt.toISOString(),
  };
  return canonicalSha256(input);
}

/**
 * The combined N5-B → N5-A decision. This is the only entry point N6 may ever call.
 *
 * ORDER IS LOAD-BEARING, not an optimisation. N5-B is evaluated FIRST and returns immediately on
 * refusal, so a disclosure the ceiling forbids never computes an N5-A permitted-pointer union at
 * all. Running authorization first would build that union and then discard it, and a field set that
 * exists in memory is a field set a later bug can log, return or fold into a digest. The union is
 * not narrowed after the fact — it is never constructed.
 *
 * The final ALLOW still requires BOTH conditions in one place, so a refactor that reorders the
 * calls cannot quietly drop the first gate: there is exactly one `return` producing an ALLOW and it
 * is guarded by `sensitivity.permits` and `authorization.decision === 'ALLOW'` together.
 */
export function evaluateDisclosureWithCeiling(
  input: DisclosureInput,
  metadata: SensitivityMetadata | null,
): DisclosureCeilingDecision {
  const { decidedAt } = input;

  const sensitivity = evaluateSensitivityCeiling(
    input.event.schemaRef,
    input.requestedPurpose,
    metadata,
  );

  if (!sensitivity.permits) {
    return {
      decision: 'DENY',
      stage: 'sensitivity',
      reason: sensitivity.reason,
      sensitivity,
      authorization: null,
      decidedAt,
      compositeDecisionDigest: compositeDigest(sensitivity, null, decidedAt),
    };
  }

  const authorization = evaluateDisclosure(input);

  // BOTH, together, in one condition. Neither half is sufficient and neither is assumed from the
  // other having held earlier in this function.
  if (sensitivity.permits && authorization.decision === 'ALLOW') {
    return {
      decision: 'ALLOW',
      sensitivity,
      authorization,
      decidedAt,
      compositeDecisionDigest: compositeDigest(sensitivity, authorization, decidedAt),
    };
  }

  return {
    decision: 'DENY',
    stage: 'authorization',
    reason: authorization.decision === 'DENY' ? authorization.reason : 'no_applicable_grant',
    sensitivity,
    authorization,
    decidedAt,
    compositeDecisionDigest: compositeDigest(sensitivity, authorization, decidedAt),
  };
}

/**
 * The fields a disclosure may actually carry.
 *
 * A single accessor rather than leaving callers to reach into the nested decision, because reaching
 * in is how a caller ends up reading `authorization.permittedPointers` from a DENY. An empty array
 * for every refusal, including a refusal after authorization succeeded: above the ceiling, zero
 * fields leave, not a reduced set.
 */
export function permittedPointers(decision: DisclosureCeilingDecision): readonly string[] {
  return decision.decision === 'ALLOW' ? decision.authorization.permittedPointers : [];
}
