import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repositoryRoot } from '../../../config/src/paths.ts';
import {
  OUTCOMES,
  PRIVILEGED_PURPOSES,
  PURPOSES,
  PURPOSE_ORIGINS,
  PurposeError,
  TRUSTED_PURPOSE_ORIGINS,
  assertPrivilegedCall,
  isOutcome,
  isPrivilegedPurpose,
  isPurpose,
  privilegedRefusalReason,
  requireOutcome,
  requirePurpose,
  type PrivilegedCallContext,
  type PurposeOrigin,
} from '../../src/purpose.ts';

const TENANT = '11111111-1111-4111-8111-111111111111';

function call(overrides: Partial<PrivilegedCallContext> = {}): PrivilegedCallContext {
  return {
    actor: 'user:operator',
    actorType: 'human',
    purpose: 'access_review',
    purposeOrigin: 'control_plane',
    tenantId: TENANT,
    correlationId: '99999999-9999-4999-8999-999999999999',
    ...overrides,
  };
}

describe('the closed vocabularies', () => {
  it('matches app.is_permitted_purpose in migration 0006', () => {
    const sql = readFileSync(
      join(repositoryRoot(), 'packages/database/migrations/0006_audit_purpose_and_outcome.up.sql'),
      'utf8',
    );
    const body = sql.slice(
      sql.indexOf('CREATE FUNCTION app.is_permitted_purpose'),
      sql.indexOf('COMMENT ON FUNCTION app.is_permitted_purpose'),
    );
    const seeded = [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
    expect(seeded).toEqual([...PURPOSES]);
  });

  it('matches app.is_permitted_outcome in migration 0006', () => {
    const sql = readFileSync(
      join(repositoryRoot(), 'packages/database/migrations/0006_audit_purpose_and_outcome.up.sql'),
      'utf8',
    );
    const body = sql.slice(
      sql.indexOf('CREATE FUNCTION app.is_permitted_outcome'),
      sql.indexOf('COMMENT ON FUNCTION app.is_permitted_outcome'),
    );
    const seeded = [...body.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!);
    expect(seeded).toEqual([...OUTCOMES]);
  });

  it('matches the enum in schemas/event-envelope.schema.json', () => {
    const schema = JSON.parse(
      readFileSync(join(repositoryRoot(), 'schemas/event-envelope.schema.json'), 'utf8'),
    ) as { properties: { purpose: { enum: string[] } }; required: string[] };
    expect(schema.properties.purpose.enum).toEqual([...PURPOSES]);
    expect(schema.required).toContain('purpose');
  });

  it('excludes service_operation from the privileged subset', () => {
    expect(PRIVILEGED_PURPOSES).not.toContain('service_operation');
    expect(PRIVILEGED_PURPOSES).toHaveLength(PURPOSES.length - 1);
  });

  it('narrows unknown values', () => {
    expect(isPurpose('audit_export')).toBe(true);
    expect(isPurpose('whatever')).toBe(false);
    expect(isPurpose(null)).toBe(false);
    expect(isPrivilegedPurpose('service_operation')).toBe(false);
    expect(isPrivilegedPurpose('audit_export')).toBe(true);
    expect(isOutcome('denied')).toBe(true);
    expect(isOutcome('DENIED')).toBe(false);
    expect(isOutcome(undefined)).toBe(false);
  });

  it('trusts command and control_plane origins, and nothing else', () => {
    expect(PURPOSE_ORIGINS).toEqual(['command', 'control_plane', 'model_output']);
    expect(TRUSTED_PURPOSE_ORIGINS).toEqual(['command', 'control_plane']);
    expect(TRUSTED_PURPOSE_ORIGINS).not.toContain('model_output');
  });
});

describe('a privileged call that may proceed', () => {
  it('is accepted with actor, trusted origin, privileged purpose, tenant and correlation id', () => {
    expect(privilegedRefusalReason(call())).toBeNull();
    expect(() => assertPrivilegedCall(call())).not.toThrow();
  });

  it('accepts every privileged purpose', () => {
    for (const purpose of PRIVILEGED_PURPOSES) {
      expect(privilegedRefusalReason(call({ purpose })), purpose).toBeNull();
    }
  });

  it('accepts both human and system actors', () => {
    for (const actorType of ['human', 'system']) {
      expect(privilegedRefusalReason(call({ actorType })), actorType).toBeNull();
    }
  });

  it('accepts both trusted origins', () => {
    for (const purposeOrigin of TRUSTED_PURPOSE_ORIGINS) {
      expect(privilegedRefusalReason(call({ purposeOrigin })), purposeOrigin).toBeNull();
    }
  });
});

describe('missing actor fails closed', () => {
  it('refuses a null actor', () => {
    expect(privilegedRefusalReason(call({ actor: null }))).toContain('actor is required');
  });

  it('refuses an undefined actor', () => {
    expect(privilegedRefusalReason(call({ actor: undefined }))).toContain('actor is required');
  });

  it('refuses a blank actor rather than treating whitespace as an identity', () => {
    expect(privilegedRefusalReason(call({ actor: '   ' }))).toContain('actor is required');
  });

  it('throws PurposeError from the asserting variant', () => {
    expect(() => assertPrivilegedCall(call({ actor: null }))).toThrow(PurposeError);
  });
});

describe('missing or invalid purpose fails closed', () => {
  it('refuses a null purpose', () => {
    expect(privilegedRefusalReason(call({ purpose: null }))).toContain('purpose is required');
  });

  it('refuses a blank purpose', () => {
    expect(privilegedRefusalReason(call({ purpose: '  ' }))).toContain('purpose is required');
  });

  it('refuses a purpose outside the vocabulary', () => {
    expect(privilegedRefusalReason(call({ purpose: 'because_i_want_to' }))).toContain(
      'outside the approved privileged vocabulary',
    );
  });

  it('refuses service_operation, the routine purpose, for privileged work', () => {
    expect(privilegedRefusalReason(call({ purpose: 'service_operation' }))).toContain(
      'outside the approved privileged vocabulary',
    );
  });

  it('never defaults, infers, or backfills a missing purpose', () => {
    // OQ-20 states this in as many words. The proof is that the refusal path returns a reason and
    // no purpose is produced anywhere on it.
    const reason = privilegedRefusalReason(call({ purpose: undefined }));
    expect(reason).toContain('OQ-20 forbids defaulting, inferring, or backfilling it');
  });
});

describe('the trust boundary — model output cannot establish privileged purpose', () => {
  it('refuses a well-formed privileged purpose that came from model output', () => {
    const reason = privilegedRefusalReason(
      call({ purpose: 'audit_export', purposeOrigin: 'model_output' }),
    );
    expect(reason).toContain('model output cannot');
    expect(reason).toContain('not trusted');
  });

  it('refuses model output for every privileged purpose in the vocabulary', () => {
    for (const purpose of PRIVILEGED_PURPOSES) {
      expect(
        privilegedRefusalReason(call({ purpose, purposeOrigin: 'model_output' })),
        purpose,
      ).not.toBeNull();
    }
  });

  it('refuses an origin outside the three declared ones', () => {
    expect(privilegedRefusalReason(call({ purposeOrigin: 'inferred' as PurposeOrigin }))).toContain(
      'is not trusted',
    );
  });

  it('refuses an agent actor whatever the purpose and origin', () => {
    const reason = privilegedRefusalReason(
      call({ actorType: 'agent', purpose: 'incident_response', purposeOrigin: 'command' }),
    );
    expect(reason).toContain('may not perform a privileged operation');
    expect(reason).toContain('never an agent');
  });

  it('refuses an integration actor — a tenant integration is not a control-plane operator', () => {
    expect(privilegedRefusalReason(call({ actorType: 'integration' }))).toContain(
      'may not perform a privileged operation',
    );
  });

  it('refuses a null or missing actor type', () => {
    expect(privilegedRefusalReason(call({ actorType: null }))).toContain('may not perform');
    expect(privilegedRefusalReason(call({ actorType: undefined }))).toContain('may not perform');
  });
});

describe('missing scope fails closed', () => {
  it('refuses a missing tenant scope', () => {
    expect(privilegedRefusalReason(call({ tenantId: null }))).toContain('tenant scope is required');
    expect(privilegedRefusalReason(call({ tenantId: ' ' }))).toContain('tenant scope is required');
  });

  it('refuses a missing correlation id', () => {
    expect(privilegedRefusalReason(call({ correlationId: undefined }))).toContain(
      'correlation id is required',
    );
  });
});

describe('refusal ordering mirrors admin.refusal_reason', () => {
  it('reports the actor before the purpose when both are absent', () => {
    expect(privilegedRefusalReason(call({ actor: null, purpose: null }))).toContain(
      'actor is required',
    );
  });

  it('reports the actor type before the purpose origin', () => {
    expect(
      privilegedRefusalReason(call({ actorType: 'agent', purposeOrigin: 'model_output' })),
    ).toContain('may not perform a privileged operation');
  });

  it('reports the purpose before the tenant scope', () => {
    expect(privilegedRefusalReason(call({ purpose: null, tenantId: null }))).toContain(
      'purpose is required',
    );
  });
});

describe('requirePurpose and requireOutcome', () => {
  it('narrows a valid value', () => {
    expect(requirePurpose('service_operation')).toBe('service_operation');
    expect(requireOutcome('succeeded')).toBe('succeeded');
  });

  it('throws rather than degrading to a default', () => {
    expect(() => requirePurpose('nonsense')).toThrow(PurposeError);
    expect(() => requirePurpose(undefined)).toThrow(PurposeError);
    expect(() => requireOutcome('partial')).toThrow(PurposeError);
  });

  it('carries the reason on the error', () => {
    try {
      requirePurpose('nonsense');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PurposeError);
      expect((error as PurposeError).reason).toContain('outside the approved vocabulary');
    }
  });
});
