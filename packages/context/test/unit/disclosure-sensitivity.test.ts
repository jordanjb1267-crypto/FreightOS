import { describe, expect, it } from 'vitest';
import {
  type DisclosureGrant,
  type DisclosureInput,
  type DisclosureParticipant,
  type DisclosureProjection,
} from '../../src/disclosure.ts';
import {
  evaluateDisclosureWithCeiling,
  evaluateSensitivityCeiling,
  permittedPointers,
  type SensitivityMetadata,
} from '../../src/disclosure-sensitivity.ts';

/**
 * N5-B disclosure sensitivity ceiling.
 *
 * Every test here is a predicate that must hold BEFORE N5-A is consulted at all. The suite's most
 * important property is the same one N5-A's has: an evaluator that denied everything would pass
 * almost every negative case below, so the positive control is what makes them mean anything.
 *
 * The second most important is the pairing. Each denial is stated against a baseline that is
 * otherwise a valid ALLOW, so a failure names the one axis that changed rather than "something".
 */

const WORKFLOW_STATE = 'https://schemas.rigreceipts.com/network/workflow-state.v1.json';
const CAPABILITY = 'https://schemas.rigreceipts.com/network/capability-advertisement.v1.json';
const CONSENT_GRANT = 'https://schemas.rigreceipts.com/network/consent-grant.v1.json';
const EVENT_CORRECTION = 'https://schemas.rigreceipts.com/network/event-correction.v1.json';
const UNREGISTERED_V2 = 'https://schemas.rigreceipts.com/network/workflow-state.v2.json';

const PROJECTION = 'com.rigreceipts.network.disclosure.projection.workflow_state_minimal.v1';
const PURPOSE = 'shipment_execution';

const ORG_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const ORG_B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const RECIPIENT = 'cccccccc-0000-4000-8000-00000000000c';

const active = (id: string): DisclosureParticipant => ({
  participantId: id,
  participantType: 'organization',
  status: 'active',
});

const projection: DisclosureProjection = {
  projectionRef: PROJECTION,
  durableSchemaRef: WORKFLOW_STATE,
  pointers: ['/workflow_id', '/state'],
};

const grant: DisclosureGrant = {
  grantId: 'grant-1',
  grantorParticipantId: ORG_A,
  recipientParticipantId: RECIPIENT,
  purposeCode: PURPOSE,
  projectionRef: PROJECTION,
  authorityBasisCode: 'bilateral_grant',
  effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
  effectiveUntil: null,
  revokedAt: null,
};

const AT = new Date('2026-06-01T00:00:00.000Z');

/** The exact vocabulary and assignments migration 0033 seeds, restated rather than imported. */
const METADATA: SensitivityMetadata = {
  sensitivities: [
    { code: 'execution_operational', rank: 10, externallyDisclosable: true },
    { code: 'counterparty_identifying', rank: 20, externallyDisclosable: true },
    { code: 'commercial_terms', rank: 30, externallyDisclosable: true },
    { code: 'never_external', rank: 99, externallyDisclosable: false },
  ],
  assignments: [
    { durableSchemaRef: WORKFLOW_STATE, sensitivityCode: 'counterparty_identifying' },
    { durableSchemaRef: EVENT_CORRECTION, sensitivityCode: 'execution_operational' },
    { durableSchemaRef: CAPABILITY, sensitivityCode: 'commercial_terms' },
    { durableSchemaRef: CONSENT_GRANT, sensitivityCode: 'never_external' },
  ],
  purposeCeilings: [{ purposeCode: PURPOSE, maxSensitivityCode: 'counterparty_identifying' }],
};

function input(overrides: Partial<DisclosureInput> = {}): DisclosureInput {
  return {
    event: { eventId: 'evt-1', organizationId: ORG_A, schemaRef: WORKFLOW_STATE, data: {} },
    recipientParticipantId: RECIPIENT,
    requestedPurpose: PURPOSE,
    decidedAt: AT,
    grants: [grant],
    projections: [projection],
    participants: [active(ORG_A), active(ORG_B), active(RECIPIENT)],
    ...overrides,
  };
}

/** A grant whose projection covers whatever schema is under test — maximal N5-A authority. */
function grantFor(schemaRef: string, id = 'grant-max'): Partial<DisclosureInput> {
  const ref = `com.rigreceipts.network.disclosure.projection.max_${id.replace(/-/g, '_')}.v1`;
  return {
    event: { eventId: 'evt-max', organizationId: ORG_A, schemaRef, data: {} },
    grants: [{ ...grant, grantId: id, projectionRef: ref }],
    projections: [{ projectionRef: ref, durableSchemaRef: schemaRef, pointers: ['/a', '/b'] }],
  };
}

describe('the positive control — N5-B must not simply deny everything', () => {
  it('ALLOWS workflow-state at counterparty_identifying under the shipment_execution ceiling', () => {
    // Without this, every denial below would pass against an evaluator that denies unconditionally.
    const decision = evaluateDisclosureWithCeiling(input(), METADATA);
    expect(decision.decision).toBe('ALLOW');
    if (decision.decision !== 'ALLOW') return;

    expect(decision.sensitivity.sensitivityCode).toBe('counterparty_identifying');
    expect(decision.sensitivity.sensitivityRank).toBe(20);
    expect(decision.sensitivity.purposeCeilingCode).toBe('counterparty_identifying');
    expect(decision.authorization.permittedPointers).toEqual(['/state', '/workflow_id']);
    expect(permittedPointers(decision)).toEqual(['/state', '/workflow_id']);
    expect(decision.compositeDecisionDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ALLOWS a contract strictly below the ceiling, so the test is not rank-equality only', () => {
    // execution_operational is rank 10 against a ceiling of 20 — the <= is a real comparison.
    const decision = evaluateDisclosureWithCeiling(
      input(grantFor(EVENT_CORRECTION, 'grant-ec')),
      METADATA,
    );
    expect(decision.decision).toBe('ALLOW');
    if (decision.decision !== 'ALLOW') return;
    expect(decision.sensitivity.sensitivityRank).toBe(10);
  });

  it('leaves the N5-A decision and its digest untouched inside an ALLOW', () => {
    // N5-A remains independently replayable: composition must not reinterpret its sub-decision.
    const decision = evaluateDisclosureWithCeiling(input(), METADATA);
    if (decision.decision !== 'ALLOW') return;
    expect(decision.authorization.decisionDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(decision.authorization.grantIds).toEqual(['grant-1']);
    expect(decision.compositeDecisionDigest).not.toBe(decision.authorization.decisionDigest);
  });
});

describe('the hard ceiling — a grant may narrow, never widen', () => {
  it('DENIES commercial_terms under a counterparty_identifying purpose ceiling', () => {
    // THE CEILING. N5-A is made maximally valid for this schema and still contributes nothing.
    const decision = evaluateDisclosureWithCeiling(
      input(grantFor(CAPABILITY, 'grant-cap')),
      METADATA,
    );
    expect(decision.decision).toBe('DENY');
    if (decision.decision !== 'DENY') return;

    expect(decision.reason).toBe('sensitivity_above_purpose_ceiling');
    expect(decision.stage).toBe('sensitivity');
    expect(permittedPointers(decision)).toEqual([]);
  });

  it('DENIES never_external however maximal the authorization is', () => {
    // The absolute class. No grant, purpose, basis or relationship variation reaches it.
    const decision = evaluateDisclosureWithCeiling(
      input(grantFor(CONSENT_GRANT, 'grant-cg')),
      METADATA,
    );
    expect(decision).toMatchObject({ decision: 'DENY', reason: 'schema_never_external' });
    expect(permittedPointers(decision)).toEqual([]);
  });

  it('DENIES never_external even when its rank would otherwise sit below the ceiling', () => {
    // Proves the evaluator honours `externallyDisclosable` and not merely the reserved rank 99.
    // A level mis-ranked low but flagged non-disclosable must still be absolute.
    const mislabelled: SensitivityMetadata = {
      ...METADATA,
      sensitivities: [
        ...METADATA.sensitivities.filter((s) => s.code !== 'never_external'),
        { code: 'never_external', rank: 1, externallyDisclosable: false },
      ],
    };
    const decision = evaluateDisclosureWithCeiling(
      input(grantFor(CONSENT_GRANT, 'grant-cg2')),
      mislabelled,
    );
    expect(decision).toMatchObject({ decision: 'DENY', reason: 'schema_never_external' });
  });

  it('DENIES an above-ceiling contract no matter how many grants union over it', () => {
    // Multi-grant escape. The union is never constructed, so there is nothing for grants to add to.
    const many = Array.from({ length: 5 }, (_, i) => ({
      ...grant,
      grantId: `grant-${i}`,
      projectionRef: `com.rigreceipts.network.disclosure.projection.max_${i}.v1`,
    }));
    const decision = evaluateDisclosureWithCeiling(
      input({
        event: { eventId: 'evt-many', organizationId: ORG_A, schemaRef: CAPABILITY, data: {} },
        grants: many,
        projections: many.map((g, i) => ({
          projectionRef: g.projectionRef,
          durableSchemaRef: CAPABILITY,
          pointers: [`/f${i}`, `/g${i}`],
        })),
      }),
      METADATA,
    );
    expect(decision).toMatchObject({
      decision: 'DENY',
      reason: 'sensitivity_above_purpose_ceiling',
    });
    expect(permittedPointers(decision)).toEqual([]);
  });
});

describe('evaluation order — the authorization pass is not reached on a ceiling refusal', () => {
  it('reports authorization as not consulted rather than fabricating a decision', () => {
    // The union must never be computed for content the ceiling forbids, so there is nothing
    // honest to put here. `null` says "not consulted" instead of inventing an empty allow.
    const decision = evaluateDisclosureWithCeiling(
      input(grantFor(CONSENT_GRANT, 'grant-order')),
      METADATA,
    );
    if (decision.decision !== 'DENY') return;
    expect(decision.stage).toBe('sensitivity');
    expect(decision.authorization).toBeNull();
  });

  it('does reach authorization when the ceiling permits, and reports its refusal', () => {
    // Anti-vacuity for the assertion above: `authorization` is not always null.
    const decision = evaluateDisclosureWithCeiling(input({ grants: [] }), METADATA);
    if (decision.decision !== 'DENY') return;
    expect(decision.stage).toBe('authorization');
    expect(decision.reason).toBe('no_applicable_grant');
    expect(decision.authorization).not.toBeNull();
    expect(decision.sensitivity.permits).toBe(true);
  });
});

describe('fail-closed metadata', () => {
  it('DENIES when the metadata store could not be read', () => {
    // Never fall back to N5-A alone and never assume the lowest level — that turns an outage
    // into a disclosure.
    const decision = evaluateDisclosureWithCeiling(input(), null);
    expect(decision).toMatchObject({
      decision: 'DENY',
      reason: 'sensitivity_metadata_unavailable',
      authorization: null,
    });
  });

  it('DENIES a contract with no assignment rather than defaulting it to the lowest level', () => {
    const decision = evaluateDisclosureWithCeiling(
      input(grantFor(UNREGISTERED_V2, 'grant-v2')),
      METADATA,
    );
    expect(decision).toMatchObject({ decision: 'DENY', reason: 'sensitivity_unassigned' });
  });

  it('DENIES an assignment naming a code the vocabulary does not contain', () => {
    const broken: SensitivityMetadata = {
      ...METADATA,
      assignments: [{ durableSchemaRef: WORKFLOW_STATE, sensitivityCode: 'invented_level' }],
    };
    const decision = evaluateDisclosureWithCeiling(input(), broken);
    expect(decision).toMatchObject({ decision: 'DENY', reason: 'sensitivity_unknown' });
  });

  it('DENIES a purpose with no ceiling row', () => {
    // A purpose without a ceiling discloses nothing. This is why no global maximum exists: with
    // one, a new purpose would silently inherit it instead of arriving denied.
    const decision = evaluateDisclosureWithCeiling(input(), {
      ...METADATA,
      purposeCeilings: [],
    });
    expect(decision).toMatchObject({ decision: 'DENY', reason: 'purpose_ceiling_unassigned' });
  });

  it('DENIES a ceiling naming a code the vocabulary does not contain', () => {
    const decision = evaluateDisclosureWithCeiling(input(), {
      ...METADATA,
      purposeCeilings: [{ purposeCode: PURPOSE, maxSensitivityCode: 'invented_level' }],
    });
    expect(decision).toMatchObject({ decision: 'DENY', reason: 'purpose_ceiling_unknown' });
  });

  it('DENIES an entirely empty metadata set', () => {
    const decision = evaluateDisclosureWithCeiling(input(), {
      sensitivities: [],
      assignments: [],
      purposeCeilings: [],
    });
    expect(decision).toMatchObject({ decision: 'DENY', reason: 'sensitivity_unassigned' });
  });
});

describe('version isolation — a new contract version inherits nothing', () => {
  it('DENIES v2 while v1 of the same contract is assigned and disclosable', () => {
    // The failure this prevents: v2 adds a sensitive field and rides in on v1's lower ceiling.
    // Assignment identity is the exact ref, so there is no predecessor to inherit through.
    const v1 = evaluateSensitivityCeiling(WORKFLOW_STATE, PURPOSE, METADATA);
    const v2 = evaluateSensitivityCeiling(UNREGISTERED_V2, PURPOSE, METADATA);
    expect(v1.permits).toBe(true);
    expect(v2.permits).toBe(false);
    if (v2.permits) return;
    expect(v2.reason).toBe('sensitivity_unassigned');
  });

  it('does not match a contract by shared base name or prefix', () => {
    // A prefix-matching implementation would resolve `workflow-state.v2` from `workflow-state.v1`.
    for (const ref of [
      'https://schemas.rigreceipts.com/network/workflow-state.v10.json',
      'https://schemas.rigreceipts.com/network/workflow-state.v1.json.evil',
      'workflow-state.v1.json',
    ]) {
      const outcome = evaluateSensitivityCeiling(ref, PURPOSE, METADATA);
      expect(outcome.permits, ref).toBe(false);
    }
  });
});

describe('authority neutrality — nothing outside governed metadata moves the ceiling', () => {
  const ceilingOf = (i: DisclosureInput) =>
    evaluateSensitivityCeiling(i.event.schemaRef, i.requestedPurpose, METADATA);

  it('is unchanged by participant type, tenancy, status or recipient identity', () => {
    // N1 attributes are descriptive. They may change N5-A eligibility; they may never change
    // whether the CONTENT is allowed to cross a boundary.
    const baseline = ceilingOf(input());
    for (const override of [
      { participants: [] },
      { participants: [active(ORG_A)] },
      { recipientParticipantId: ORG_B },
      { recipientParticipantId: 'unknown-participant' },
    ] satisfies Partial<DisclosureInput>[]) {
      expect(ceilingOf(input(override))).toEqual(baseline);
    }
  });

  it('is unchanged by the number, validity or expiry of grants', () => {
    // A grant may narrow. It may not widen — including by there being more of them.
    const baseline = ceilingOf(input());
    expect(ceilingOf(input({ grants: [] }))).toEqual(baseline);
    expect(ceilingOf(input({ grants: [grant, grant, grant] }))).toEqual(baseline);
    expect(
      ceilingOf(input({ grants: [{ ...grant, revokedAt: new Date('2026-02-01T00:00:00.000Z') }] })),
    ).toEqual(baseline);
  });

  it('is unchanged by any producer-supplied classification in the payload', () => {
    // NOT hypothetical: evidence-envelope.v1 and event-envelope.v1 both carry a producer-controlled
    // `classification` property. A producer may write anything there; the ceiling must not move.
    const baseline = ceilingOf(input());
    for (const data of [
      { classification: 'public' },
      { classification: 'execution_operational' },
      { classification: null },
      { sensitivity: 'execution_operational', visibility: 'public', shareable: true },
      { data: { classification: 'public' } },
    ]) {
      const decision = evaluateDisclosureWithCeiling(
        input({
          event: { eventId: 'evt-c', organizationId: ORG_A, schemaRef: CONSENT_GRANT, data },
        }),
        METADATA,
      );
      expect(decision, JSON.stringify(data)).toMatchObject({
        decision: 'DENY',
        reason: 'schema_never_external',
      });
      expect(
        ceilingOf(
          input({
            event: { eventId: 'e', organizationId: ORG_A, schemaRef: WORKFLOW_STATE, data },
          }),
        ),
      ).toEqual(baseline);
    }
  });

  it('is unchanged by the decision time', () => {
    // Sensitivity is a property of the contract, not of when it was asked about. N5-A owns the
    // temporal rules; N5-B has none.
    const baseline = ceilingOf(input());
    expect(ceilingOf(input({ decidedAt: new Date('2020-01-01T00:00:00.000Z') }))).toEqual(baseline);
    expect(ceilingOf(input({ decidedAt: new Date('2099-01-01T00:00:00.000Z') }))).toEqual(baseline);
  });
});

describe('the composite digest', () => {
  it('is stable across metadata array order', () => {
    // The caller loads these from a database, so row order is not a property of the decision.
    const forward = evaluateDisclosureWithCeiling(input(), METADATA);
    const reversed = evaluateDisclosureWithCeiling(input(), {
      sensitivities: [...METADATA.sensitivities].reverse(),
      assignments: [...METADATA.assignments].reverse(),
      purposeCeilings: [...METADATA.purposeCeilings].reverse(),
    });
    expect(forward.compositeDecisionDigest).toBe(reversed.compositeDecisionDigest);
  });

  it('changes when the assigned sensitivity changes', () => {
    const before = evaluateDisclosureWithCeiling(input(), METADATA);
    const after = evaluateDisclosureWithCeiling(input(), {
      ...METADATA,
      assignments: METADATA.assignments.map((a) =>
        a.durableSchemaRef === WORKFLOW_STATE
          ? { ...a, sensitivityCode: 'execution_operational' }
          : a,
      ),
    });
    expect(after.decision).toBe('ALLOW');
    expect(after.compositeDecisionDigest).not.toBe(before.compositeDecisionDigest);
  });

  it('changes when the purpose ceiling changes, even while the decision stays ALLOW', () => {
    // The ceiling that permitted a disclosure is part of the proof, not just the outcome.
    const before = evaluateDisclosureWithCeiling(input(), METADATA);
    const after = evaluateDisclosureWithCeiling(input(), {
      ...METADATA,
      purposeCeilings: [{ purposeCode: PURPOSE, maxSensitivityCode: 'commercial_terms' }],
    });
    expect(before.decision).toBe('ALLOW');
    expect(after.decision).toBe('ALLOW');
    expect(after.compositeDecisionDigest).not.toBe(before.compositeDecisionDigest);
  });

  it('changes when the N5-A decision changes', () => {
    const before = evaluateDisclosureWithCeiling(input(), METADATA);
    const after = evaluateDisclosureWithCeiling(
      input({ grants: [{ ...grant, grantId: 'grant-2' }] }),
      METADATA,
    );
    expect(after.compositeDecisionDigest).not.toBe(before.compositeDecisionDigest);
  });

  it('distinguishes ALLOW from DENY and one denial reason from another', () => {
    const digests = new Set(
      [
        evaluateDisclosureWithCeiling(input(), METADATA),
        evaluateDisclosureWithCeiling(input(), null),
        evaluateDisclosureWithCeiling(input({ grants: [] }), METADATA),
        evaluateDisclosureWithCeiling(input(grantFor(CONSENT_GRANT, 'g1')), METADATA),
        evaluateDisclosureWithCeiling(input(grantFor(CAPABILITY, 'g2')), METADATA),
      ].map((d) => d.compositeDecisionDigest),
    );
    expect(digests.size).toBe(5);
  });

  it('is deterministic for identical inputs', () => {
    expect(evaluateDisclosureWithCeiling(input(), METADATA).compositeDecisionDigest).toBe(
      evaluateDisclosureWithCeiling(input(), METADATA).compositeDecisionDigest,
    );
  });
});
