import { describe, expect, it } from 'vitest';
import {
  evaluateDisclosure,
  type DisclosureGrant,
  type DisclosureInput,
  type DisclosureParticipant,
  type DisclosureProjection,
} from '../../src/disclosure.ts';

/**
 * N5-A disclosure evaluator.
 *
 * Every test here is a predicate the evaluator must enforce before a single field may leave. The
 * suite's most important property is the one Gate U protects: an evaluator that denied everything
 * would pass almost all of the negative cases, so the positive control is what makes them mean
 * anything.
 */

const SCHEMA = 'https://schemas.rigreceipts.com/network/workflow-state.v1.json';
const OTHER_SCHEMA = 'https://schemas.rigreceipts.com/network/consent-grant.v1.json';
const PROJECTION = 'com.rigreceipts.network.disclosure.projection.workflow_state_minimal.v1';

const ORG_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const ORG_B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const RECIPIENT = 'rrrrrrrr-0000-4000-8000-00000000000r'.replace('r'.repeat(1), 'r');

const active = (id: string): DisclosureParticipant => ({
  participantId: id,
  participantType: 'organization',
  status: 'active',
});

const projection: DisclosureProjection = {
  projectionRef: PROJECTION,
  durableSchemaRef: SCHEMA,
  pointers: ['/workflow_id', '/state'],
};

const grant: DisclosureGrant = {
  grantId: 'grant-1',
  grantorParticipantId: ORG_A,
  recipientParticipantId: RECIPIENT,
  purposeCode: 'shipment_execution',
  projectionRef: PROJECTION,
  authorityBasisCode: 'bilateral_grant',
  effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
  effectiveUntil: null,
  revokedAt: null,
};

const AT = new Date('2026-06-01T00:00:00.000Z');

function input(overrides: Partial<DisclosureInput> = {}): DisclosureInput {
  return {
    event: { eventId: 'evt-1', organizationId: ORG_A, schemaRef: SCHEMA, data: {} },
    recipientParticipantId: RECIPIENT,
    requestedPurpose: 'shipment_execution',
    decidedAt: AT,
    grants: [grant],
    projections: [projection],
    participants: [active(ORG_A), active(ORG_B), active(RECIPIENT)],
    ...overrides,
  };
}

describe('Gate U — the positive control', () => {
  it('ALLOWS when every predicate holds', () => {
    // Without this, every denial below would pass against an evaluator that simply denies.
    const decision = evaluateDisclosure(input());
    expect(decision.decision).toBe('ALLOW');
    if (decision.decision !== 'ALLOW') return;
    expect(decision.permittedPointers).toEqual(['/state', '/workflow_id']);
    expect(decision.grantIds).toEqual(['grant-1']);
    expect(decision.authorityBasisCodes).toEqual(['bilateral_grant']);
    expect(decision.grantorParticipantId).toBe(ORG_A);
    expect(decision.decisionDigest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('the critical cross-organization predicate', () => {
  it('DENIES when organization A holds the grant and organization B asserted the event', () => {
    // THE ISOLATION RULE. Without it a grant naming a schema would authorize any organization's
    // event under that schema, and a shared contract would bridge two organizations silently.
    const decision = evaluateDisclosure(
      input({ event: { eventId: 'evt-2', organizationId: ORG_B, schemaRef: SCHEMA, data: {} } }),
    );
    expect(decision.decision).toBe('DENY');
    if (decision.decision !== 'DENY') return;
    expect(decision.reason).toBe('grantor_event_mismatch');
  });

  it('contributes ZERO fields from the foreign grant, not a reduced set', () => {
    // A reduced field set would still leak that A's grant exists.
    const decision = evaluateDisclosure(
      input({ event: { eventId: 'evt-2', organizationId: ORG_B, schemaRef: SCHEMA, data: {} } }),
    );
    expect(decision).not.toHaveProperty('permittedPointers');
  });

  it('is unaffected by the two organizations sharing a schema', () => {
    // Schema coincidence must never bridge organizations — the grant and the event name the same
    // contract here, and it still denies.
    const decision = evaluateDisclosure(
      input({ event: { eventId: 'evt-3', organizationId: ORG_B, schemaRef: SCHEMA, data: {} } }),
    );
    expect(decision.decision).toBe('DENY');
  });
});

describe('default deny', () => {
  it('DENIES with no grant at all', () => {
    const decision = evaluateDisclosure(input({ grants: [] }));
    expect(decision).toMatchObject({ decision: 'DENY', reason: 'no_applicable_grant' });
  });

  it('DENIES a grant naming a different recipient', () => {
    const decision = evaluateDisclosure(
      input({ grants: [{ ...grant, recipientParticipantId: ORG_B }] }),
    );
    expect(decision.decision).toBe('DENY');
  });

  it('DENIES when the projection referenced by the grant is not loaded', () => {
    const decision = evaluateDisclosure(input({ projections: [] }));
    expect(decision).toMatchObject({ decision: 'DENY', reason: 'schema_not_covered' });
  });
});

describe('participant state', () => {
  it.each(['pending', 'suspended', 'revoked'] as const)(
    'DENIES an inactive recipient (%s)',
    (status) => {
      const decision = evaluateDisclosure(
        input({
          participants: [
            active(ORG_A),
            { participantId: RECIPIENT, participantType: 'organization', status },
          ],
        }),
      );
      expect(decision).toMatchObject({ decision: 'DENY', reason: 'recipient_not_active' });
    },
  );

  it.each(['pending', 'suspended', 'revoked'] as const)(
    'DENIES an inactive grantor (%s)',
    (status) => {
      const decision = evaluateDisclosure(
        input({
          participants: [
            { participantId: ORG_A, participantType: 'organization', status },
            active(RECIPIENT),
          ],
        }),
      );
      expect(decision).toMatchObject({ decision: 'DENY', reason: 'grantor_not_active' });
    },
  );

  it('DENIES a recipient that is not an organization', () => {
    // N1 has seven participant types. Recipients are organization-only in N5-A, and broadening is
    // a governed decision rather than a consequence of the enum existing.
    const decision = evaluateDisclosure(
      input({
        participants: [
          active(ORG_A),
          { participantId: RECIPIENT, participantType: 'person', status: 'active' },
        ],
      }),
    );
    expect(decision).toMatchObject({ decision: 'DENY', reason: 'recipient_not_active' });
  });

  it('ALLOWS a recipient carrying no tenant — tenancy is not eligibility', () => {
    // The type carries no tenant at all, which is the enforcement: an external NULL-tenant
    // organization is a first-class recipient, and NULL tenant is not public.
    expect(evaluateDisclosure(input()).decision).toBe('ALLOW');
  });
});

describe('purpose', () => {
  it('requires exact equality', () => {
    const decision = evaluateDisclosure(input({ requestedPurpose: 'analytics' }));
    expect(decision).toMatchObject({ decision: 'DENY', reason: 'purpose_not_permitted' });
  });

  it('does not prefix-match', () => {
    const decision = evaluateDisclosure(input({ requestedPurpose: 'shipment' }));
    expect(decision.decision).toBe('DENY');
  });
});

describe('schema binding', () => {
  it('requires the projection to name the event contract exactly', () => {
    const decision = evaluateDisclosure(
      input({ event: { eventId: 'e', organizationId: ORG_A, schemaRef: OTHER_SCHEMA, data: {} } }),
    );
    expect(decision).toMatchObject({ decision: 'DENY', reason: 'schema_not_covered' });
  });

  it('has no compatible-version fallback — a v2 contract is simply not covered', () => {
    const decision = evaluateDisclosure(
      input({
        event: {
          eventId: 'e',
          organizationId: ORG_A,
          schemaRef: 'https://schemas.rigreceipts.com/network/workflow-state.v2.json',
          data: {},
        },
      }),
    );
    expect(decision).toMatchObject({ decision: 'DENY', reason: 'schema_not_covered' });
  });
});

describe('temporal boundaries', () => {
  it('effective_from is INCLUSIVE', () => {
    expect(evaluateDisclosure(input({ decidedAt: grant.effectiveFrom })).decision).toBe('ALLOW');
  });

  it('denies one millisecond before effective_from', () => {
    const decision = evaluateDisclosure({
      ...input(),
      decidedAt: new Date(grant.effectiveFrom.getTime() - 1),
    });
    expect(decision).toMatchObject({ decision: 'DENY', reason: 'grant_not_yet_effective' });
  });

  it('effective_until is EXCLUSIVE — the boundary instant is already expired', () => {
    const decision = evaluateDisclosure(input({ grants: [{ ...grant, effectiveUntil: AT }] }));
    expect(decision).toMatchObject({ decision: 'DENY', reason: 'grant_expired' });
  });

  it('allows one millisecond before effective_until', () => {
    const decision = evaluateDisclosure(
      input({ grants: [{ ...grant, effectiveUntil: new Date(AT.getTime() + 1) }] }),
    );
    expect(decision.decision).toBe('ALLOW');
  });

  it('revocation is effective AT revoked_at, inclusive', () => {
    const decision = evaluateDisclosure(input({ grants: [{ ...grant, revokedAt: AT }] }));
    expect(decision).toMatchObject({ decision: 'DENY', reason: 'grant_revoked' });
  });

  it('a revocation in the future does not yet apply', () => {
    const decision = evaluateDisclosure(
      input({ grants: [{ ...grant, revokedAt: new Date(AT.getTime() + 1) }] }),
    );
    expect(decision.decision).toBe('ALLOW');
  });

  it('treats a NULL effective_until as indefinite', () => {
    const decision = evaluateDisclosure({
      ...input(),
      decidedAt: new Date('2099-01-01T00:00:00.000Z'),
    });
    expect(decision.decision).toBe('ALLOW');
  });
});

describe('multiple grants', () => {
  const second: DisclosureGrant = { ...grant, grantId: 'grant-2', projectionRef: 'p2' };
  const secondProjection: DisclosureProjection = {
    projectionRef: 'p2',
    durableSchemaRef: SCHEMA,
    pointers: ['/updated_at', '/state'],
  };

  it('UNIONS the fields of independently valid grants', () => {
    // Not intersection: under intersection a second, narrower grant would REDUCE what a recipient
    // may receive, so granting more permission would take permission away.
    const decision = evaluateDisclosure(
      input({ grants: [grant, second], projections: [projection, secondProjection] }),
    );
    expect(decision.decision).toBe('ALLOW');
    if (decision.decision !== 'ALLOW') return;
    expect(decision.permittedPointers).toEqual(['/state', '/updated_at', '/workflow_id']);
  });

  it('contributes NOTHING from a grant that fails any predicate', () => {
    const expired = { ...second, effectiveUntil: new Date('2026-02-01T00:00:00.000Z') };
    const decision = evaluateDisclosure(
      input({ grants: [grant, expired], projections: [projection, secondProjection] }),
    );
    expect(decision.decision).toBe('ALLOW');
    if (decision.decision !== 'ALLOW') return;
    // `/updated_at` came only from the expired grant, so it must not appear.
    expect(decision.permittedPointers).toEqual(['/state', '/workflow_id']);
    expect(decision.grantIds).toEqual(['grant-1']);
  });

  it('preserves BOTH authorizers when two grants authorize the same pointer', () => {
    const decision = evaluateDisclosure(
      input({ grants: [grant, second], projections: [projection, secondProjection] }),
    );
    if (decision.decision !== 'ALLOW') throw new Error('expected ALLOW');
    const forState = decision.fieldAuthorizations.filter((a) => a.jsonPointer === '/state');
    expect(forState.map((a) => a.grantId).sort()).toEqual(['grant-1', 'grant-2']);
  });

  it('attributes every permitted pointer to a grant, a projection and a basis', () => {
    const decision = evaluateDisclosure(input());
    if (decision.decision !== 'ALLOW') throw new Error('expected ALLOW');
    for (const pointer of decision.permittedPointers) {
      const attribution = decision.fieldAuthorizations.find((a) => a.jsonPointer === pointer);
      expect(attribution).toBeDefined();
      expect(attribution!.grantId).toBe('grant-1');
      expect(attribution!.projectionRef).toBe(PROJECTION);
      expect(attribution!.authorityBasisCode).toBe('bilateral_grant');
    }
  });

  it('DENIES when the applicable grants authorize no fields at all', () => {
    const empty: DisclosureProjection = { ...projection, pointers: [] };
    const decision = evaluateDisclosure(input({ projections: [empty] }));
    expect(decision).toMatchObject({ decision: 'DENY', reason: 'no_permitted_fields' });
  });
});

describe('decision digest', () => {
  const second: DisclosureGrant = { ...grant, grantId: 'grant-2', projectionRef: 'p2' };
  const secondProjection: DisclosureProjection = {
    projectionRef: 'p2',
    durableSchemaRef: SCHEMA,
    pointers: ['/updated_at'],
  };

  it('does not depend on input order', () => {
    // The database returns rows in whatever order it likes. A digest that moved with row order
    // would be useless as delivery evidence.
    const a = evaluateDisclosure(
      input({ grants: [grant, second], projections: [projection, secondProjection] }),
    );
    const b = evaluateDisclosure(
      input({ grants: [second, grant], projections: [secondProjection, projection] }),
    );
    if (a.decision !== 'ALLOW' || b.decision !== 'ALLOW') throw new Error('expected ALLOW');
    expect(a.decisionDigest).toBe(b.decisionDigest);
  });

  it('changes when the permitted field set changes', () => {
    const a = evaluateDisclosure(input());
    const b = evaluateDisclosure(
      input({ projections: [{ ...projection, pointers: ['/workflow_id'] }] }),
    );
    if (a.decision !== 'ALLOW' || b.decision !== 'ALLOW') throw new Error('expected ALLOW');
    expect(a.decisionDigest).not.toBe(b.decisionDigest);
  });

  it('changes when the decision time changes', () => {
    const a = evaluateDisclosure(input());
    const b = evaluateDisclosure(input({ decidedAt: new Date(AT.getTime() + 1000) }));
    if (a.decision !== 'ALLOW' || b.decision !== 'ALLOW') throw new Error('expected ALLOW');
    expect(a.decisionDigest).not.toBe(b.decisionDigest);
  });

  it('is stable for identical inputs', () => {
    const a = evaluateDisclosure(input());
    const b = evaluateDisclosure(input());
    if (a.decision !== 'ALLOW' || b.decision !== 'ALLOW') throw new Error('expected ALLOW');
    expect(a.decisionDigest).toBe(b.decisionDigest);
  });
});

describe('structural inertness — what the evaluator cannot consult', () => {
  it('has no way to read a classification, a transport intent, a relationship or an alias', () => {
    // THE ENFORCEMENT IS THE TYPE. A predicate cannot branch on a field the evaluator was never
    // given, so this asserts the input surface rather than a behaviour — a behavioural test would
    // only prove the current code path ignores them, not that a future one must.
    const source = evaluateDisclosure.toString();
    for (const forbidden of [
      'classification',
      'transport',
      'relationship',
      'alias',
      'assurance',
      'tenant',
    ]) {
      expect(source.toLowerCase(), `evaluator references ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('reads no wall clock — the same inputs always decide the same way', () => {
    expect(evaluateDisclosure.toString()).not.toContain('Date.now');
    expect(evaluateDisclosure.toString()).not.toMatch(/new Date\(\)/);
  });
});
