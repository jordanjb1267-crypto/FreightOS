import { describe, expect, it } from 'vitest';
import {
  IDENTITY_RECORD_STATUSES,
  IDENTITY_STATUSES,
  ORGANIZATION_NODE_STATUSES,
  authorizesAt,
  isEffectiveAt,
  isNarrowingChange,
  isRevokedAt,
  type IdentityRecord,
  type IdentityStatus,
} from '../../src/lifecycle.ts';

const T0 = new Date('2026-01-01T00:00:00Z');
const T1 = new Date('2026-06-01T00:00:00Z');
const T2 = new Date('2026-12-01T00:00:00Z');

function record(overrides: Partial<IdentityRecord> = {}): IdentityRecord {
  return {
    status: 'active',
    effectiveFrom: T0,
    effectiveTo: null,
    revokedAt: null,
    ...overrides,
  };
}

describe('the status vocabulary', () => {
  it('carries the five values app.identity_status declares', () => {
    expect(IDENTITY_STATUSES).toEqual(['pending', 'active', 'suspended', 'revoked', 'archived']);
  });

  it('gives identity records four statuses and organization nodes three', () => {
    expect(IDENTITY_RECORD_STATUSES).toEqual(['pending', 'active', 'suspended', 'revoked']);
    expect(ORGANIZATION_NODE_STATUSES).toEqual(['active', 'suspended', 'archived']);
  });

  it('keeps the two subsets distinct — a node is archived, an identity is revoked', () => {
    expect(ORGANIZATION_NODE_STATUSES).not.toContain('revoked');
    expect(IDENTITY_RECORD_STATUSES).not.toContain('archived');
  });
});

describe('effective dating', () => {
  it('is not effective before the window opens', () => {
    expect(isEffectiveAt(record({ effectiveFrom: T1 }), T0)).toBe(false);
  });

  it('is effective at the instant the window opens — the lower bound is inclusive', () => {
    expect(isEffectiveAt(record({ effectiveFrom: T1 }), T1)).toBe(true);
  });

  it('is effective inside an open-ended window', () => {
    expect(isEffectiveAt(record(), T2)).toBe(true);
  });

  it('is not effective at the instant the window closes — the upper bound is exclusive', () => {
    expect(isEffectiveAt(record({ effectiveTo: T1 }), T1)).toBe(false);
  });

  it('is effective just inside a closed window', () => {
    expect(isEffectiveAt(record({ effectiveTo: T2 }), T1)).toBe(true);
  });

  it('makes two adjacent windows non-overlapping', () => {
    const first = record({ effectiveFrom: T0, effectiveTo: T1 });
    const second = record({ effectiveFrom: T1, effectiveTo: T2 });
    expect(isEffectiveAt(first, T1)).toBe(false);
    expect(isEffectiveAt(second, T1)).toBe(true);
  });
});

describe('revocation', () => {
  it('is not revoked when revokedAt is null', () => {
    expect(isRevokedAt(record(), T2)).toBe(false);
  });

  it('is revoked from the instant of revocation onward', () => {
    const revoked = record({ status: 'revoked', revokedAt: T1 });
    expect(isRevokedAt(revoked, T0)).toBe(false);
    expect(isRevokedAt(revoked, T1)).toBe(true);
    expect(isRevokedAt(revoked, T2)).toBe(true);
  });
});

describe('authorizesAt — all three conditions', () => {
  it('authorizes an active, in-window, unrevoked record', () => {
    expect(authorizesAt(record(), T1)).toBe(true);
  });

  it('refuses every status except active', () => {
    for (const status of IDENTITY_STATUSES) {
      expect(authorizesAt(record({ status }), T1), status).toBe(status === 'active');
    }
  });

  it('refuses an active record outside its window', () => {
    expect(authorizesAt(record({ effectiveFrom: T2 }), T1)).toBe(false);
    expect(authorizesAt(record({ effectiveTo: T0 }), T1)).toBe(false);
  });

  it('refuses a revoked record even where status still reads active', () => {
    // The three conditions are independent on purpose: a row whose status was not updated
    // alongside its revocation must not keep authorizing on the strength of the stale status.
    expect(authorizesAt(record({ status: 'active', revokedAt: T0 }), T1)).toBe(false);
  });

  it('refuses a pending record — absence of a positive grant is a refusal, not a gap', () => {
    expect(authorizesAt(record({ status: 'pending' }), T1)).toBe(false);
  });
});

describe('isNarrowingChange', () => {
  const active = { status: 'active' as IdentityStatus, revokedAt: null };

  it('counts a revocation as narrowing', () => {
    expect(isNarrowingChange(active, { status: 'revoked', revokedAt: T1 })).toBe(true);
  });

  it('counts a suspension as narrowing', () => {
    expect(isNarrowingChange(active, { status: 'suspended', revokedAt: null })).toBe(true);
  });

  it('does not count a no-op as narrowing', () => {
    expect(isNarrowingChange(active, active)).toBe(false);
  });

  it('does not count reactivation as narrowing', () => {
    expect(
      isNarrowingChange(
        { status: 'suspended', revokedAt: null },
        { status: 'active', revokedAt: null },
      ),
    ).toBe(false);
  });

  it('does not count un-revoking as narrowing', () => {
    expect(
      isNarrowingChange(
        { status: 'revoked', revokedAt: T1 },
        { status: 'active', revokedAt: null },
      ),
    ).toBe(false);
  });

  it('does not count suspended to revoked as a further narrowing it can claim credit for', () => {
    // Already restricted, so the status arm does not fire; the revocation arm does.
    expect(
      isNarrowingChange(
        { status: 'suspended', revokedAt: null },
        { status: 'revoked', revokedAt: T1 },
      ),
    ).toBe(true);
    expect(
      isNarrowingChange(
        { status: 'suspended', revokedAt: T0 },
        { status: 'revoked', revokedAt: T0 },
      ),
    ).toBe(false);
  });

  it('counts a pending record moving to suspended as narrowing', () => {
    expect(
      isNarrowingChange(
        { status: 'pending', revokedAt: null },
        { status: 'suspended', revokedAt: null },
      ),
    ).toBe(true);
  });
});
