import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SchemaValidationError, assertValid, listSchemas, validate } from '../../src/index.ts';

const TENANT = '11111111-1111-4111-8111-111111111111';

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    specversion: '1.0',
    id: randomUUID(),
    type: 'rig.freight.shipment.created.v1',
    source: '/freightos/test',
    time: new Date(0).toISOString(),
    tenantid: TENANT,
    legalentityid: 'le-1',
    legalauthorityclass: 'carrier_agent',
    operatingcontext: 'carrier',
    actorid: 'user:jordan',
    correlationid: randomUUID(),
    // OQ-20 / ADR-0019 requirement 6: purpose is a required context attribute on every envelope.
    purpose: 'service_operation',
    data: {},
    ...overrides,
  };
}

describe('schema loading', () => {
  it('compiles every declared schema', () => {
    for (const name of listSchemas()) {
      expect(() => validate(name, {}), name).not.toThrow();
    }
  });
});

describe('event envelope — ADR-0015', () => {
  it('accepts a well-formed carrier event', () => {
    expect(validate('eventEnvelope', envelope())).toEqual({ valid: true, errors: [] });
  });

  it('accepts a facility-operator custody event — the case the handoff made unemittable', () => {
    const result = validate(
      'eventEnvelope',
      envelope({
        type: 'rig.freight.custody.transferred.v1',
        legalauthorityclass: 'software_only',
        operatingcontext: 'facility_operator',
      }),
    );
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
  });

  it('accepts an autonomous-mobility event', () => {
    const result = validate(
      'eventEnvelope',
      envelope({
        legalauthorityclass: 'software_only',
        operatingcontext: 'autonomous_mobility',
      }),
    );
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
  });

  it('lets a system-scope event omit legalentityid', () => {
    const { legalentityid: _omitted, ...rest } = envelope({
      legalauthorityclass: 'software_only',
      operatingcontext: 'system',
      actorid: 'system:kill-switch',
    });
    const result = validate('eventEnvelope', rest);
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
  });

  it('requires legalentityid for every non-system event', () => {
    const { legalentityid: _omitted, ...rest } = envelope();
    expect(validate('eventEnvelope', rest).valid).toBe(false);
  });

  it('rejects carrier_agent operating as brokerage', () => {
    expect(
      validate('eventEnvelope', envelope({ legalauthorityclass: 'carrier_agent', operatingcontext: 'brokerage' }))
        .valid,
    ).toBe(false);
  });

  it('rejects brokerage operating as carrier', () => {
    expect(
      validate('eventEnvelope', envelope({ legalauthorityclass: 'brokerage', operatingcontext: 'carrier' }))
        .valid,
    ).toBe(false);
  });

  it('requires an actor on every event', () => {
    const { actorid: _omitted, ...rest } = envelope();
    expect(validate('eventEnvelope', rest).valid).toBe(false);
  });

  it('rejects an unversioned event type', () => {
    expect(validate('eventEnvelope', envelope({ type: 'shipment.created' })).valid).toBe(false);
  });

  it('rejects unknown attributes', () => {
    expect(validate('eventEnvelope', envelope({ smuggled: true })).valid).toBe(false);
  });
});

/**
 * OQ-20. ADR-0019 requirement 6 makes `purpose` part of every envelope, and the handoff schema set
 * `additionalProperties: false` with no such attribute — so an envelope carrying one was invalid
 * and an envelope omitting one was valid. Both halves are asserted here.
 */
describe('event envelope purpose — OQ-20', () => {
  it('accepts an envelope carrying a purpose from the closed vocabulary', () => {
    expect(validate('eventEnvelope', envelope({ purpose: 'identity_administration' }))).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('rejects an envelope with no purpose at all', () => {
    const { purpose: _omitted, ...rest } = envelope();
    const result = validate('eventEnvelope', rest);
    expect(result.valid).toBe(false);
    expect(JSON.stringify(result.errors)).toContain('purpose');
  });

  it('rejects a purpose outside the approved vocabulary', () => {
    expect(validate('eventEnvelope', envelope({ purpose: 'because_i_said_so' })).valid).toBe(false);
  });

  it('rejects a purpose of the wrong type', () => {
    expect(validate('eventEnvelope', envelope({ purpose: 42 })).valid).toBe(false);
    expect(validate('eventEnvelope', envelope({ purpose: null })).valid).toBe(false);
  });

  it('accepts every value in the vocabulary and nothing else', () => {
    const vocabulary = [
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
    ];
    for (const purpose of vocabulary) {
      expect(validate('eventEnvelope', envelope({ purpose })).valid, purpose).toBe(true);
    }
    for (const rejected of ['', 'SERVICE_OPERATION', 'service operation', 'admin']) {
      expect(validate('eventEnvelope', envelope({ purpose: rejected })).valid, rejected).toBe(
        false,
      );
    }
  });
});

describe('assertValid', () => {
  it('throws SchemaValidationError carrying every failure', () => {
    try {
      assertValid('eventEnvelope', { specversion: '1.0' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaValidationError);
      expect((error as SchemaValidationError).failures.length).toBeGreaterThan(0);
    }
  });

  it('is silent for a valid value', () => {
    expect(() => assertValid('eventEnvelope', envelope())).not.toThrow();
  });
});
