import { describe, expect, it } from 'vitest';

import type {
  DisclosureGrant,
  DisclosureParticipant,
  DisclosureProjection,
} from '../../src/disclosure.ts';
import type { SensitivityMetadata } from '../../src/disclosure-sensitivity.ts';
import {
  DELIVERY_MAX_ATTEMPTS,
  nextAttemptDelayMs,
  reauthorizeDelivery,
  resolveRouting,
  retryBudgetExhausted,
  type DeliveryRoutingInput,
  type DeliverySubscription,
} from '../../src/disclosure-delivery.ts';

/**
 * N6 routing and re-authorization.
 *
 * The organising principle is the one N5-A and N5-B share: an implementation that routed nothing
 * would pass almost every negative case below, so the POSITIVE CONTROL is what makes the denials
 * mean anything. Each denial is stated against a baseline that is otherwise a valid delivery, so a
 * failure names the one axis that changed.
 */

const WORKFLOW_STATE = 'https://schemas.rigreceipts.com/network/workflow-state.v1.json';
const WORKFLOW_STATE_V2 = 'https://schemas.rigreceipts.com/network/workflow-state.v2.json';
const CONSENT_GRANT = 'https://schemas.rigreceipts.com/network/consent-grant.v1.json';
const CAPABILITY = 'https://schemas.rigreceipts.com/network/capability-advertisement.v1.json';

const PROJECTION = 'com.rigreceipts.network.disclosure.projection.workflow_state_minimal.v1';
const PURPOSE = 'shipment_execution';

const ORG_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const RECIPIENT = 'cccccccc-0000-4000-8000-00000000000c';
const RECIPIENT_2 = 'dddddddd-0000-4000-8000-00000000000d';

const AT = new Date('2026-06-01T00:00:00.000Z');

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

const subscription: DeliverySubscription = {
  subscriptionId: 'sub-1111',
  recipientParticipantId: RECIPIENT,
  purposeCode: PURPOSE,
  durableSchemaRef: WORKFLOW_STATE,
  destinationKind: 'freightos_inbox',
  effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
  effectiveUntil: null,
  revokedAt: null,
};

/** The exact vocabulary 0033 seeds, restated so the unit layer needs no database. */
const METADATA: SensitivityMetadata = {
  sensitivities: [
    { code: 'execution_operational', rank: 10, externallyDisclosable: true },
    { code: 'counterparty_identifying', rank: 20, externallyDisclosable: true },
    { code: 'commercial_terms', rank: 30, externallyDisclosable: true },
    { code: 'never_external', rank: 99, externallyDisclosable: false },
  ],
  assignments: [
    { durableSchemaRef: WORKFLOW_STATE, sensitivityCode: 'counterparty_identifying' },
    { durableSchemaRef: CAPABILITY, sensitivityCode: 'commercial_terms' },
    { durableSchemaRef: CONSENT_GRANT, sensitivityCode: 'never_external' },
  ],
  purposeCeilings: [{ purposeCode: PURPOSE, maxSensitivityCode: 'counterparty_identifying' }],
};

const EVENT_DATA = {
  workflow_id: 'wf-1',
  state: 'in_transit',
  updated_at: '2026-05-01T00:00:00.000Z',
  participants: ['a', 'b'],
  secret_rate: 4200,
};

function input(overrides: Partial<DeliveryRoutingInput> = {}): DeliveryRoutingInput {
  return {
    event: {
      eventId: 'evt-1',
      organizationId: ORG_A,
      schemaRef: WORKFLOW_STATE,
      data: EVENT_DATA,
    },
    subscriptions: [subscription],
    grants: [grant],
    projections: [projection],
    participants: [active(ORG_A), active(RECIPIENT), active(RECIPIENT_2)],
    decidedAt: AT,
    ...overrides,
  };
}

describe('routing turns transport debt into an authorized disclosure, or into nothing', () => {
  it('produces exactly one artifact for a matched subscription — the positive control', () => {
    const r = resolveRouting(input(), METADATA);
    expect(r.matchedSubscriptionCount).toBe(1);
    expect(r.denied).toHaveLength(0);
    expect(r.authorized).toHaveLength(1);

    const artifact = r.authorized[0]!;
    expect(artifact.subscriptionId).toBe('sub-1111');
    expect(artifact.recipientParticipantId).toBe(RECIPIENT);
    expect(artifact.purposeCode).toBe(PURPOSE);
    expect(artifact.durableSchemaRef).toBe(WORKFLOW_STATE);
    expect(artifact.sensitivityCode).toBe('counterparty_identifying');
    expect([...artifact.permittedPointers].sort()).toEqual(['/state', '/workflow_id']);
    expect(artifact.payloadDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(artifact.authorizationDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(artifact.compositeDecisionDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('emits ONLY the authorized fields — the unauthorized ones are absent, not nulled', () => {
    const artifact = resolveRouting(input(), METADATA).authorized[0]!;
    const payload = JSON.parse(artifact.payloadCanonical) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['state', 'workflow_id']);
    // `secret_rate` and `participants` are in the event and are not in the projection.
    expect(artifact.payloadCanonical).not.toContain('secret_rate');
    expect(artifact.payloadCanonical).not.toContain('4200');
  });

  it('records a resolution with zero deliveries when nothing is subscribed', () => {
    const r = resolveRouting(input({ subscriptions: [] }), METADATA);
    expect(r.matchedSubscriptionCount).toBe(0);
    expect(r.authorized).toHaveLength(0);
    expect(r.denied).toHaveLength(0);
  });

  it('denies rather than routes when interest exists but N5-A does not authorize', () => {
    const r = resolveRouting(input({ grants: [] }), METADATA);
    expect(r.matchedSubscriptionCount).toBe(1);
    expect(r.authorized).toHaveLength(0);
    expect(r.denied).toHaveLength(1);
    expect(r.denied[0]).toMatchObject({ stage: 'authorization', reason: 'no_applicable_grant' });
  });

  it('makes one delivery from many grants — grants are provenance, not routing instructions', () => {
    // Two grants, both applicable, over projections that together cover more than one pointer.
    const second = 'com.rigreceipts.network.disclosure.projection.probe_second.v1';
    const r = resolveRouting(
      input({
        grants: [grant, { ...grant, grantId: 'grant-2', projectionRef: second }],
        projections: [
          projection,
          { projectionRef: second, durableSchemaRef: WORKFLOW_STATE, pointers: ['/updated_at'] },
        ],
      }),
      METADATA,
    );
    expect(r.authorized).toHaveLength(1);
    // The union widened the FIELDS, which is N5-A's multi-grant union working, but it did not
    // produce a second delivery.
    expect([...r.authorized[0]!.permittedPointers].sort()).toEqual([
      '/state',
      '/updated_at',
      '/workflow_id',
    ]);
  });

  it('produces one artifact per recipient when two organizations each subscribe', () => {
    const r = resolveRouting(
      input({
        subscriptions: [
          subscription,
          { ...subscription, subscriptionId: 'sub-2222', recipientParticipantId: RECIPIENT_2 },
        ],
        grants: [grant, { ...grant, grantId: 'g2', recipientParticipantId: RECIPIENT_2 }],
      }),
      METADATA,
    );
    expect(r.matchedSubscriptionCount).toBe(2);
    expect(r.authorized.map((a) => a.recipientParticipantId).sort()).toEqual(
      [RECIPIENT, RECIPIENT_2].sort(),
    );
  });

  it('enumerates deterministically, independent of input order', () => {
    const two = [
      subscription,
      { ...subscription, subscriptionId: 'sub-0000', recipientParticipantId: RECIPIENT_2 },
    ];
    const a = resolveRouting(input({ subscriptions: two }), METADATA);
    const b = resolveRouting(input({ subscriptions: [...two].reverse() }), METADATA);
    expect(a.authorized.map((x) => x.subscriptionId)).toEqual(
      b.authorized.map((x) => x.subscriptionId),
    );
    expect(a.denied.map((x) => x.subscriptionId)).toEqual(b.denied.map((x) => x.subscriptionId));
  });
});

describe('a subscription narrows and can never widen', () => {
  it('cannot authorize a contract the ceiling forbids', () => {
    const r = resolveRouting(
      input({
        event: { eventId: 'e', organizationId: ORG_A, schemaRef: CONSENT_GRANT, data: EVENT_DATA },
        subscriptions: [{ ...subscription, durableSchemaRef: CONSENT_GRANT }],
        grants: [{ ...grant, projectionRef: 'p-cg' }],
        projections: [{ projectionRef: 'p-cg', durableSchemaRef: CONSENT_GRANT, pointers: ['/a'] }],
      }),
      METADATA,
    );
    expect(r.authorized).toHaveLength(0);
    expect(r.denied[0]).toMatchObject({ stage: 'sensitivity', reason: 'schema_never_external' });
  });

  it('cannot authorize a contract above the purpose ceiling', () => {
    const r = resolveRouting(
      input({
        event: { eventId: 'e', organizationId: ORG_A, schemaRef: CAPABILITY, data: EVENT_DATA },
        subscriptions: [{ ...subscription, durableSchemaRef: CAPABILITY }],
        grants: [{ ...grant, projectionRef: 'p-cap' }],
        projections: [{ projectionRef: 'p-cap', durableSchemaRef: CAPABILITY, pointers: ['/a'] }],
      }),
      METADATA,
    );
    expect(r.authorized).toHaveLength(0);
    expect(r.denied[0]).toMatchObject({
      stage: 'sensitivity',
      reason: 'sensitivity_above_purpose_ceiling',
    });
  });

  it('has no field, pointer or projection input to widen with', () => {
    // Structural: the subscription type carries no such key. A future addition would fail here
    // before it could fail in a behavioural test written against honest fixtures.
    expect(Object.keys(subscription).sort()).toEqual([
      'destinationKind',
      'durableSchemaRef',
      'effectiveFrom',
      'effectiveUntil',
      'purposeCode',
      'recipientParticipantId',
      'revokedAt',
      'subscriptionId',
    ]);
  });
});

describe('interest is scoped in time and to an exact contract version', () => {
  it('does not match an event whose schema is a different version', () => {
    const r = resolveRouting(
      input({
        event: {
          eventId: 'e',
          organizationId: ORG_A,
          schemaRef: WORKFLOW_STATE_V2,
          data: EVENT_DATA,
        },
      }),
      METADATA,
    );
    expect(r.matchedSubscriptionCount).toBe(0);
  });

  it('does not match before effective_from or after effective_until', () => {
    expect(
      resolveRouting(
        input({ subscriptions: [{ ...subscription, effectiveFrom: new Date('2027-01-01') }] }),
        METADATA,
      ).matchedSubscriptionCount,
    ).toBe(0);
    expect(
      resolveRouting(
        input({ subscriptions: [{ ...subscription, effectiveUntil: new Date('2026-02-01') }] }),
        METADATA,
      ).matchedSubscriptionCount,
    ).toBe(0);
  });

  it('does not match once interest has been revoked', () => {
    const r = resolveRouting(
      input({ subscriptions: [{ ...subscription, revokedAt: new Date('2026-05-01') }] }),
      METADATA,
    );
    expect(r.matchedSubscriptionCount).toBe(0);
  });
});

describe('re-authorization decides every attempt afresh', () => {
  const artifact = () => resolveRouting(input(), METADATA).authorized[0]!;

  it('permits when authority is unchanged — the positive control', () => {
    const outcome = reauthorizeDelivery(artifact(), input(), METADATA);
    expect(outcome.authorized).toBe(true);
  });

  it('takes the subscription from the ARTIFACT, never from a caller argument — U-04 / U-05', () => {
    // WHICH ROW IS THE SOURCE OF TRUTH, pinned rather than inferred.
    //
    // The signature is (artifact, input, metadata). The recipient and purpose that go into the N5
    // evaluation are read off the subscription the ARTIFACT names — `input.subscriptions` is a
    // lookup table, not an authority. So a caller cannot steer re-authorization at a different
    // recipient by passing one: the only way to change the answer is to change the artifact, and
    // migration 0034 now binds the artifact to the delivery by composite key, so the delivery row
    // and the artifact cannot name different subscriptions in the first place.
    //
    // The refusal below is what proves the direction of the read. If the evaluator took the
    // subscription from the input list rather than from the artifact, an artifact naming an
    // unlisted subscription would still evaluate — and it does not.
    const orphan = { ...artifact(), subscriptionId: 'subscription-that-is-not-listed' };
    const outcome = reauthorizeDelivery(orphan, input(), METADATA);
    expect(outcome).toMatchObject({
      authorized: false,
      reason: 'subscription_no_longer_effective',
      compositeDecisionDigest: null,
    });

    // And no N5 evaluation was performed at all: there is no governed recipient or purpose to
    // evaluate against, and inventing one from the artifact would be the worker choosing them.
    expect((outcome as { detail: string | null }).detail).toBe('subscription absent');
  });

  it('refuses once the grant is revoked', () => {
    const outcome = reauthorizeDelivery(
      artifact(),
      input({ grants: [{ ...grant, revokedAt: new Date('2026-05-15') }] }),
      METADATA,
    );
    expect(outcome).toMatchObject({
      authorized: false,
      reason: 'sensitivity_or_authorization_denied',
    });
  });

  it('refuses once the grant has expired', () => {
    const outcome = reauthorizeDelivery(
      artifact(),
      input({ grants: [{ ...grant, effectiveUntil: new Date('2026-05-15') }] }),
      METADATA,
    );
    expect(outcome.authorized).toBe(false);
  });

  it('refuses once the recipient is no longer active', () => {
    const outcome = reauthorizeDelivery(
      artifact(),
      input({
        participants: [
          active(ORG_A),
          { participantId: RECIPIENT, participantType: 'organization', status: 'suspended' },
        ],
      }),
      METADATA,
    );
    expect(outcome.authorized).toBe(false);
  });

  it('refuses once interest is withdrawn, without evaluating N5 at all', () => {
    const outcome = reauthorizeDelivery(
      artifact(),
      input({ subscriptions: [{ ...subscription, revokedAt: new Date('2026-05-02') }] }),
      METADATA,
    );
    expect(outcome).toMatchObject({
      authorized: false,
      reason: 'subscription_no_longer_effective',
      // No decision was computed, so there is no digest to report and none is invented.
      compositeDecisionDigest: null,
    });
  });

  it('refuses when the contract has become never_external since the artifact was minted', () => {
    const outcome = reauthorizeDelivery(artifact(), input(), {
      ...METADATA,
      assignments: [{ durableSchemaRef: WORKFLOW_STATE, sensitivityCode: 'never_external' }],
    });
    expect(outcome).toMatchObject({
      authorized: false,
      reason: 'sensitivity_or_authorization_denied',
    });
    expect((outcome as { detail: string }).detail).toContain('schema_never_external');
  });

  it('refuses when sensitivity metadata cannot be read', () => {
    expect(reauthorizeDelivery(artifact(), input(), null).authorized).toBe(false);
  });
});

describe('a retry can never widen, and is never silently narrowed', () => {
  const artifact = () => resolveRouting(input(), METADATA).authorized[0]!;

  it('permits unchanged when current authority is BROADER — and the artifact does not grow', () => {
    const wider = 'com.rigreceipts.network.disclosure.projection.wider.v1';
    const outcome = reauthorizeDelivery(
      artifact(),
      input({
        grants: [grant, { ...grant, grantId: 'g-wide', projectionRef: wider }],
        projections: [
          projection,
          { projectionRef: wider, durableSchemaRef: WORKFLOW_STATE, pointers: ['/updated_at'] },
        ],
      }),
      METADATA,
    );
    expect(outcome.authorized).toBe(true);
    // The artifact is what leaves. A broader current decision changes the digest it is bound to,
    // never the bytes.
    expect([...artifact().permittedPointers].sort()).toEqual(['/state', '/workflow_id']);
  });

  it('refuses when current authority is NARROWER, instead of sending a reduced payload', () => {
    const narrower = 'com.rigreceipts.network.disclosure.projection.narrow.v1';
    const outcome = reauthorizeDelivery(
      artifact(),
      input({
        grants: [{ ...grant, projectionRef: narrower }],
        projections: [
          { projectionRef: narrower, durableSchemaRef: WORKFLOW_STATE, pointers: ['/workflow_id'] },
        ],
      }),
      METADATA,
    );
    expect(outcome).toMatchObject({
      authorized: false,
      reason: 'artifact_not_within_current_authorization',
    });
    expect((outcome as { detail: string }).detail).toContain('/state');
  });
});

describe('retry budget', () => {
  it('exhausts on attempts', () => {
    expect(retryBudgetExhausted(DELIVERY_MAX_ATTEMPTS - 1, AT, AT)).toBe(false);
    expect(retryBudgetExhausted(DELIVERY_MAX_ATTEMPTS, AT, AT)).toBe(true);
  });

  it('exhausts on age even when attempts remain', () => {
    const old = new Date(AT.getTime() - 25 * 60 * 60 * 1000);
    expect(retryBudgetExhausted(1, old, AT)).toBe(true);
  });

  it('backs off exponentially under a cap, with full jitter', () => {
    expect(nextAttemptDelayMs(1, () => 1)).toBe(30_000);
    expect(nextAttemptDelayMs(2, () => 1)).toBe(60_000);
    // Capped: 2^9 * 30s far exceeds thirty minutes.
    expect(nextAttemptDelayMs(10, () => 1)).toBe(30 * 60 * 1000);
    // Full jitter means the delay is somewhere in [0, ceiling).
    expect(nextAttemptDelayMs(3, () => 0)).toBe(0);
  });
});
