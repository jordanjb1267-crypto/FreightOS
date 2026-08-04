import { describe, expect, it } from 'vitest';
import {
  LEGAL_AUTHORITY_CLASSES,
  LegalContextError,
  OPERATING_CONTEXTS,
  PERMITTED_CONTEXTS,
  SYSTEM_TENANT_ID,
  assertLegalContext,
  fromAuthorityMode,
  validateLegalContext,
  type LegalContext,
} from '../../src/legal.ts';

const HORIZON_1 = { brokerageEnabled: false } as const;
const TENANT = '11111111-1111-4111-8111-111111111111';

/**
 * `omit` rather than `{ field: undefined }` — under exactOptionalPropertyTypes an explicit
 * `undefined` is not the same as an absent key, and absence is what these tests mean.
 */
function carrierContext(
  overrides: Partial<LegalContext> = {},
  omit: readonly (keyof LegalContext)[] = [],
): LegalContext {
  const base: LegalContext = {
    tenantId: TENANT,
    legalAuthorityClass: 'carrier_agent',
    operatingContext: 'carrier',
    actorId: 'user:jordan',
    legalEntityId: 'le-1',
    carrierId: 'carrier-1',
    carrierAppointmentId: 'appt-1',
    ...overrides,
  };
  const result = { ...base } as Record<string, unknown>;
  for (const key of omit) delete result[key];
  return result as unknown as LegalContext;
}

describe('legal context — ADR-0015', () => {
  it('accepts a complete carrier_agent context', () => {
    expect(validateLegalContext(carrierContext(), HORIZON_1)).toEqual([]);
  });

  it('rejects carrier_agent without a specific carrier', () => {
    const reasons = validateLegalContext(carrierContext({}, ['carrierId']), HORIZON_1);
    expect(reasons.join(' ')).toContain('carrierId');
  });

  it('rejects carrier_agent without written-appointment evidence', () => {
    const reasons = validateLegalContext(carrierContext({}, ['carrierAppointmentId']), HORIZON_1);
    expect(reasons.join(' ')).toContain('written appointment');
  });

  it('rejects brokerage while its legal gate is unsigned', () => {
    const reasons = validateLegalContext(
      {
        tenantId: TENANT,
        legalAuthorityClass: 'brokerage',
        operatingContext: 'brokerage',
        actorId: 'user:jordan',
        legalEntityId: 'le-1',
      },
      HORIZON_1,
    );
    expect(reasons.join(' ')).toContain('BROKERAGE_LEGAL_GATE');
  });

  it('rejects every class/context pairing outside the permitted table', () => {
    for (const cls of LEGAL_AUTHORITY_CLASSES) {
      for (const ctx of OPERATING_CONTEXTS) {
        if (PERMITTED_CONTEXTS[cls].includes(ctx)) continue;
        const reasons = validateLegalContext(
          {
            tenantId: TENANT,
            legalAuthorityClass: cls,
            operatingContext: ctx,
            actorId: 'a',
            legalEntityId: 'le-1',
            ...(cls === 'carrier_agent' ? { carrierId: 'c', carrierAppointmentId: 'ap' } : {}),
          },
          { brokerageEnabled: true },
        );
        expect(reasons.join(' '), `${cls}/${ctx}`).toContain('not permitted');
      }
    }
  });

  it('makes carrier_agent + brokerage unrepresentable', () => {
    expect(PERMITTED_CONTEXTS.carrier_agent).not.toContain('brokerage');
    expect(PERMITTED_CONTEXTS.brokerage).not.toContain('carrier');
  });

  it('allows a system-scope context to omit legalEntityId when an actor is present', () => {
    expect(
      validateLegalContext(
        {
          tenantId: SYSTEM_TENANT_ID,
          legalAuthorityClass: 'software_only',
          operatingContext: 'system',
          actorId: 'system:kill-switch-operator',
        },
        HORIZON_1,
      ),
    ).toEqual([]);
  });

  it('requires legalEntityId for every non-system context', () => {
    for (const ctx of ['shipper_owned', 'facility_operator', 'autonomous_mobility'] as const) {
      const reasons = validateLegalContext(
        {
          tenantId: TENANT,
          legalAuthorityClass: 'software_only',
          operatingContext: ctx,
          actorId: 'a',
        },
        HORIZON_1,
      );
      expect(reasons.join(' '), ctx).toContain('legalEntityId is required');
    }
  });

  it('requires an actor on every context', () => {
    const reasons = validateLegalContext(carrierContext({ actorId: '' }), HORIZON_1);
    expect(reasons.join(' ')).toContain('actorId is required');
  });

  it('fails closed on a malformed tenant id', () => {
    const reasons = validateLegalContext(carrierContext({ tenantId: 'not-a-uuid' }), HORIZON_1);
    expect(reasons.join(' ')).toContain('tenantId must be a uuid');
  });

  it('throws LegalContextError carrying every reason', () => {
    try {
      assertLegalContext(carrierContext({}, ['carrierId', 'carrierAppointmentId']), HORIZON_1);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(LegalContextError);
      expect((error as LegalContextError).reasons.length).toBe(2);
    }
  });
});

describe('authority_mode migration', () => {
  it('maps all five handoff values without loss', () => {
    expect(fromAuthorityMode('carrier_agent')).toEqual({
      legalAuthorityClass: 'carrier_agent',
      operatingContext: 'carrier',
    });
    expect(fromAuthorityMode('brokerage')).toEqual({
      legalAuthorityClass: 'brokerage',
      operatingContext: 'brokerage',
    });
    for (const mode of ['shipper_owned', 'facility_operator', 'autonomous_mobility'] as const) {
      const result = fromAuthorityMode(mode);
      expect(result.legalAuthorityClass).toBe('software_only');
      expect(result.operatingContext).toBe(mode);
    }
  });

  it('rejects an unknown mode rather than guessing', () => {
    expect(() => fromAuthorityMode('made_up')).toThrow();
  });
});
