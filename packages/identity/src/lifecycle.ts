/**
 * Identity status, effective dating, and revocation.
 *
 * One vocabulary and one set of predicates for users, roles, memberships, operating authorities,
 * carrier appointments, service accounts, credentials and policy bindings. Mirrors
 * `app.identity_status` and the effective-window and revocation constraints every Phase 1 table
 * carries.
 *
 * Every predicate takes an explicit `asOf`. P-20: an implicit `now()` makes an effective-dated
 * read irreproducible, and an authorization decision that cannot be replayed cannot be audited.
 */

export const IDENTITY_STATUSES = ['pending', 'active', 'suspended', 'revoked', 'archived'] as const;
export type IdentityStatus = (typeof IDENTITY_STATUSES)[number];

/** The subset an identity or authority record may hold. Nodes use `archived` instead of `revoked`. */
export const IDENTITY_RECORD_STATUSES: readonly IdentityStatus[] = Object.freeze([
  'pending',
  'active',
  'suspended',
  'revoked',
]);

/** The subset an organization node may hold. */
export const ORGANIZATION_NODE_STATUSES: readonly IdentityStatus[] = Object.freeze([
  'active',
  'suspended',
  'archived',
]);

export interface EffectiveDated {
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
}

export interface Revocable {
  readonly revokedAt: Date | null;
}

export interface IdentityRecord extends EffectiveDated, Revocable {
  readonly status: IdentityStatus;
}

/** Half-open: `[effectiveFrom, effectiveTo)`, so two adjacent windows never both apply. */
export function isEffectiveAt(record: EffectiveDated, asOf: Date): boolean {
  if (record.effectiveFrom.getTime() > asOf.getTime()) return false;
  if (record.effectiveTo === null) return true;
  return record.effectiveTo.getTime() > asOf.getTime();
}

export function isRevokedAt(record: Revocable, asOf: Date): boolean {
  return record.revokedAt !== null && record.revokedAt.getTime() <= asOf.getTime();
}

/**
 * Authorizing requires all three: an `active` status, an open effective window, and no revocation.
 * `pending`, `suspended`, `archived` and `revoked` all authorize nothing — the absence of a
 * positive grant is a refusal, not a gap.
 */
export function authorizesAt(record: IdentityRecord, asOf: Date): boolean {
  return record.status === 'active' && isEffectiveAt(record, asOf) && !isRevokedAt(record, asOf);
}

/**
 * Whether a proposed transition narrows access rather than widening it.
 *
 * Mirrors `app.is_narrowing_identity_change`. Migration 0010 uses it to let an actor revoke or
 * suspend its own membership while refusing any change that grants itself more.
 */
export function isNarrowingChange(
  before: Pick<IdentityRecord, 'status' | 'revokedAt'>,
  after: Pick<IdentityRecord, 'status' | 'revokedAt'>,
): boolean {
  const newlyRevoked = after.revokedAt !== null && before.revokedAt === null;
  const newlyRestricted =
    (after.status === 'suspended' || after.status === 'revoked') &&
    before.status !== 'suspended' &&
    before.status !== 'revoked';
  return newlyRevoked || newlyRestricted;
}
