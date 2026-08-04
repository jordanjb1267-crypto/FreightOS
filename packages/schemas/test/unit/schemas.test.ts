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
