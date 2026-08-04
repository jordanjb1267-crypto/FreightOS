/**
 * Service-account credential references.
 *
 * `02_…:58` and DATA_CLASSIFICATION class `SECRET` both prohibit storing credential material.
 * Migration 0011 enforces that with CHECK constraints on the shape of every stored value; this
 * module is the application mirror, so a caller is refused before the round trip and gets a reason
 * rather than a constraint name.
 *
 * The rule these encode: FreightOS stores a locator or a digest, never the thing located.
 */

export const CREDENTIAL_TYPES = [
  /** An identifier the provider issued. Not secret, and not usable to authenticate by itself. */
  'provider_subject',
  /** A one-way digest, so a leak of the row does not leak the credential. */
  'hash_reference',
  /** A pointer into an external secret store. The secret never enters this database. */
  'external_secret_reference',
] as const;
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

/** A URI. A bare secret pasted into the field cannot satisfy this. */
const REFERENCE_RE = /^[a-z][a-z0-9+.-]*:\S+$/;

/**
 * Recognisable secret shapes, refused wherever they appear.
 *
 * Deliberately a short list of high-confidence markers rather than an entropy heuristic: a
 * heuristic that guesses wrong in either direction is worse than a narrow rule that is always
 * right about what it does catch. The structural constraints above are what make the field safe;
 * this is the second line.
 */
const SECRET_MARKER_RE = /(bearer |-----begin |sk_live|pk_live|ghp_|xox[abps]-)/i;

/** Algorithm-prefixed lowercase hex, e.g. `sha256:<64 hex>`. */
const HASH_RE = /^[a-z0-9-]+:[0-9a-f]{32,128}$/;

const FINGERPRINT_RE = /^[0-9a-f]{8,64}$/;

export interface CredentialReferenceInput {
  readonly credentialType: CredentialType;
  readonly credentialReference: string;
  readonly credentialHash?: string | null;
  readonly fingerprint?: string | null;
}

/**
 * Every reason a credential reference is unacceptable. Empty means acceptable.
 * Collects rather than short-circuits, so an operator sees the whole list at once.
 */
export function validateCredentialReference(input: CredentialReferenceInput): readonly string[] {
  const reasons: string[] = [];

  if (!(CREDENTIAL_TYPES as readonly string[]).includes(input.credentialType)) {
    reasons.push(`unknown credentialType "${input.credentialType}"`);
  }

  if (!REFERENCE_RE.test(input.credentialReference)) {
    reasons.push(
      'credentialReference must be a URI locating the credential, never the credential itself',
    );
  }
  if (SECRET_MARKER_RE.test(input.credentialReference)) {
    reasons.push('credentialReference looks like secret material and must not be stored');
  }

  const hash = input.credentialHash ?? null;
  if (input.credentialType === 'hash_reference') {
    if (hash === null) {
      reasons.push('credentialType "hash_reference" requires credentialHash');
    } else if (!HASH_RE.test(hash)) {
      reasons.push('credentialHash must be an algorithm-prefixed lowercase hex digest');
    }
  } else if (hash !== null) {
    reasons.push(
      `credentialType "${input.credentialType}" must not carry a credentialHash — there is ` +
        'nothing to digest',
    );
  }

  const fingerprint = input.fingerprint ?? null;
  if (fingerprint !== null && !FINGERPRINT_RE.test(fingerprint)) {
    reasons.push('fingerprint must be 8 to 64 lowercase hex characters');
  }

  return reasons;
}

export function isValidCredentialReference(input: CredentialReferenceInput): boolean {
  return validateCredentialReference(input).length === 0;
}

export class CredentialReferenceError extends Error {
  readonly reasons: readonly string[];
  constructor(reasons: readonly string[]) {
    super(`credential reference rejected: ${reasons.join('; ')}`);
    this.name = 'CredentialReferenceError';
    this.reasons = reasons;
  }
}

export function assertCredentialReference(input: CredentialReferenceInput): void {
  const reasons = validateCredentialReference(input);
  if (reasons.length > 0) throw new CredentialReferenceError(reasons);
}

/** Service accounts are non-human actors, and the audit ledger must say so. */
export const SERVICE_ACCOUNT_ACTOR_TYPES = ['system', 'integration'] as const;
export type ServiceAccountActorType = (typeof SERVICE_ACCOUNT_ACTOR_TYPES)[number];

export function isServiceAccountActorType(value: unknown): value is ServiceAccountActorType {
  return (
    typeof value === 'string' && (SERVICE_ACCOUNT_ACTOR_TYPES as readonly string[]).includes(value)
  );
}
