import { describe, expect, it } from 'vitest';
import {
  CREDENTIAL_TYPES,
  CredentialReferenceError,
  SERVICE_ACCOUNT_ACTOR_TYPES,
  assertCredentialReference,
  isServiceAccountActorType,
  isValidCredentialReference,
  validateCredentialReference,
  type CredentialReferenceInput,
  type CredentialType,
} from '../../src/service-account.ts';

function reference(overrides: Partial<CredentialReferenceInput> = {}): CredentialReferenceInput {
  return {
    credentialType: 'external_secret_reference',
    credentialReference: 'secretsmanager://freightos/prod/sa-billing-sync',
    credentialHash: null,
    fingerprint: null,
    ...overrides,
  };
}

describe('credential types', () => {
  it('names the three the schema permits', () => {
    expect(CREDENTIAL_TYPES).toEqual([
      'provider_subject',
      'hash_reference',
      'external_secret_reference',
    ]);
  });

  it('refuses an unknown type', () => {
    const reasons = validateCredentialReference(
      reference({ credentialType: 'plaintext' as CredentialType }),
    );
    expect(reasons.join(' ')).toContain('unknown credentialType');
  });
});

describe('a locator, never the thing located', () => {
  it('accepts an external secret store reference', () => {
    expect(validateCredentialReference(reference())).toEqual([]);
    expect(isValidCredentialReference(reference())).toBe(true);
  });

  it('accepts a provider subject expressed as a URI', () => {
    expect(
      isValidCredentialReference(
        reference({
          credentialType: 'provider_subject',
          credentialReference: 'oidc://idp.example/subject/abc-123',
        }),
      ),
    ).toBe(true);
  });

  it('refuses a bare string that is not a URI', () => {
    const reasons = validateCredentialReference(reference({ credentialReference: 'not-a-uri' }));
    expect(reasons.join(' ')).toContain('must locate the credential and never carry it');
  });

  /**
   * F-10. "Must be a URI" accepted any scheme at all, so it admitted the values it exists to
   * refuse. A denylist of markers only catches the shapes somebody thought to name; an allowlist
   * of schemes catches everything else by default.
   */
  it('refuses a URI whose scheme can carry the secret inline', () => {
    for (const inline of [
      'data:;base64,c2VjcmV0',
      'basic:dXNlcjpwYXNzd29yZA==',
      'http://example.test/token/abc',
      'jdbc:postgresql://db/freightos',
      'file:///etc/freightos/credential',
    ]) {
      expect(isValidCredentialReference(reference({ credentialReference: inline })), inline).toBe(
        false,
      );
    }
  });

  it('refuses userinfo even under an allowed scheme', () => {
    // `scheme://user:secret@host` passes any scheme allowlist by construction, which is why it
    // needs a rule of its own.
    for (const smuggled of [
      'vault://operator:hunter2@vault.internal/freightos',
      'secretsmanager://token@aws/freightos',
    ]) {
      expect(
        isValidCredentialReference(reference({ credentialReference: smuggled })),
        smuggled,
      ).toBe(false);
    }
  });

  it('keeps each credential type to the schemes that make sense for it', () => {
    // A secret-store locator is not an identity, and an identity is not a secret-store locator.
    // One combined list would let either stand in for the other.
    expect(
      isValidCredentialReference(
        reference({ credentialType: 'provider_subject', credentialReference: 'vault://x/y' }),
      ),
    ).toBe(false);
    expect(
      isValidCredentialReference(
        reference({
          credentialType: 'external_secret_reference',
          credentialReference: 'oidc://idp.example/subject/abc',
        }),
      ),
    ).toBe(false);
  });

  it('refuses a reference containing whitespace', () => {
    expect(
      isValidCredentialReference(reference({ credentialReference: 'vault://path with space' })),
    ).toBe(false);
  });

  it('refuses an empty reference', () => {
    expect(isValidCredentialReference(reference({ credentialReference: '' }))).toBe(false);
  });
});

/**
 * The fixtures below carry the marker each rule looks for and stop there — `sk_live_x`, not a
 * full-length key. Deliberately: a realistic-looking value in a test file is indistinguishable from
 * a leaked one to a secret scanner, and the assertion does not need the extra characters to prove
 * anything. Constitution: no credential material in source, prompts, logs, or fixtures.
 */
describe('recognisable secret material is refused', () => {
  const shapes = [
    'authorization:Bearer x',
    'pem:-----BEGIN RSA PRIVATE KEY-----',
    'stripe:sk_live_x',
    'stripe:pk_live_x',
    'github:ghp_x',
    'slack:xoxb-x',
  ];

  for (const shape of shapes) {
    it(`refuses ${shape.split(':')[0]}`, () => {
      const reasons = validateCredentialReference(reference({ credentialReference: shape }));
      expect(reasons.join(' ')).toContain('looks like secret material');
    });
  }

  it('refuses a marker regardless of case', () => {
    expect(isValidCredentialReference(reference({ credentialReference: 'auth:BEARER x' }))).toBe(
      false,
    );
  });

  it('does not refuse an innocuous reference that merely mentions a vault path', () => {
    expect(
      isValidCredentialReference(
        reference({ credentialReference: 'vault://secret/data/freightos/service-accounts/sync' }),
      ),
    ).toBe(true);
  });
});

describe('hashes', () => {
  it('accepts an algorithm-prefixed sha256 digest', () => {
    expect(
      isValidCredentialReference(
        reference({
          credentialType: 'hash_reference',
          credentialReference: 'hash://freightos/sa-1',
          credentialHash: `sha256:${'a'.repeat(64)}`,
        }),
      ),
    ).toBe(true);
  });

  it('requires a hash for the hash_reference type', () => {
    const reasons = validateCredentialReference(
      reference({ credentialType: 'hash_reference', credentialHash: null }),
    );
    expect(reasons.join(' ')).toContain('requires credentialHash');
  });

  it('refuses a hash on a type that has nothing to digest', () => {
    const reasons = validateCredentialReference(
      reference({ credentialType: 'provider_subject', credentialHash: `sha256:${'a'.repeat(64)}` }),
    );
    expect(reasons.join(' ')).toContain('nothing to digest');
  });

  it('refuses a hash with no algorithm prefix', () => {
    const reasons = validateCredentialReference(
      reference({ credentialType: 'hash_reference', credentialHash: 'a'.repeat(64) }),
    );
    expect(reasons.join(' ')).toContain('algorithm-prefixed');
  });

  it('refuses a hash that is too short to be a digest', () => {
    expect(
      isValidCredentialReference(
        reference({ credentialType: 'hash_reference', credentialHash: 'sha256:abc123' }),
      ),
    ).toBe(false);
  });

  it('refuses uppercase hex, so one canonical form is stored', () => {
    expect(
      isValidCredentialReference(
        reference({ credentialType: 'hash_reference', credentialHash: `SHA256:${'A'.repeat(64)}` }),
      ),
    ).toBe(false);
  });

  it('refuses a raw secret pasted into the hash column', () => {
    expect(
      isValidCredentialReference(
        reference({
          credentialType: 'hash_reference',
          credentialHash: 'not-a-digest',
        }),
      ),
    ).toBe(false);
  });
});

describe('fingerprints', () => {
  it('accepts lowercase hex within bounds', () => {
    expect(isValidCredentialReference(reference({ fingerprint: 'a1b2c3d4' }))).toBe(true);
    expect(isValidCredentialReference(reference({ fingerprint: 'f'.repeat(64) }))).toBe(true);
  });

  it('accepts an absent fingerprint', () => {
    expect(isValidCredentialReference(reference({ fingerprint: null }))).toBe(true);
  });

  it('refuses one that is too short, too long, or not hex', () => {
    for (const bad of ['abc', 'f'.repeat(65), 'not-hex!']) {
      expect(isValidCredentialReference(reference({ fingerprint: bad })), bad).toBe(false);
    }
  });
});

describe('collected reasons', () => {
  it('reports every problem at once rather than one per round trip', () => {
    const reasons = validateCredentialReference({
      credentialType: 'nope' as CredentialType,
      credentialReference: 'Bearer plaintext-token',
      credentialHash: 'not-a-digest',
      fingerprint: 'zz',
    });
    expect(reasons.length).toBeGreaterThanOrEqual(4);
  });

  it('throws CredentialReferenceError carrying them all', () => {
    try {
      assertCredentialReference(reference({ credentialReference: 'plain-secret' }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CredentialReferenceError);
      expect((error as CredentialReferenceError).reasons.length).toBeGreaterThan(0);
    }
  });

  it('is silent for an acceptable reference', () => {
    expect(() => assertCredentialReference(reference())).not.toThrow();
  });
});

describe('service accounts are non-human actors', () => {
  it('permits only system and integration actor types', () => {
    expect(SERVICE_ACCOUNT_ACTOR_TYPES).toEqual(['system', 'integration']);
    expect(isServiceAccountActorType('system')).toBe(true);
    expect(isServiceAccountActorType('integration')).toBe(true);
  });

  it('refuses human and agent', () => {
    expect(isServiceAccountActorType('human')).toBe(false);
    expect(isServiceAccountActorType('agent')).toBe(false);
    expect(isServiceAccountActorType(null)).toBe(false);
  });
});
