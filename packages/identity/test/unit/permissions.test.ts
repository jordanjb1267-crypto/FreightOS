import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repositoryRoot } from '../../../config/src/paths.ts';
import {
  PHASE_1_PERMISSIONS,
  hasPermission,
  isPhase1Permission,
  resolveEffectivePermissions,
  type PermissionGrant,
} from '../../src/permissions.ts';
import type { IdentityRecord } from '../../src/lifecycle.ts';

const T0 = new Date('2026-01-01T00:00:00Z');
const NOW = new Date('2026-06-01T00:00:00Z');
const LATER = new Date('2026-12-01T00:00:00Z');

function live(overrides: Partial<IdentityRecord> = {}): IdentityRecord {
  return { status: 'active', effectiveFrom: T0, effectiveTo: null, revokedAt: null, ...overrides };
}

/** user, membership, membership-role, role, role-permission — all five must authorize. */
function chainOf(...links: IdentityRecord[]): PermissionGrant {
  return { permissionKey: 'identity.user.read', chain: links };
}

const FULL_CHAIN = chainOf(live(), live(), live(), live(), live());

describe('the Phase 1 permission vocabulary', () => {
  it('matches migration 0008 exactly', () => {
    // OQ-16: no canonical action registry exists, and PR 2 defines only the Phase 1 subset. Two
    // copies of that subset would drift, so the seed and this list are asserted equal rather than
    // maintained in parallel by hand.
    const sql = readFileSync(
      join(repositoryRoot(), 'packages/database/migrations/0008_roles_and_permissions.up.sql'),
      'utf8',
    );
    const seeded = [...sql.matchAll(/'((?:identity|governance)\.[a-z_]+\.[a-z_]+)'/g)]
      .map((m) => m[1]!)
      .filter((key, index, all) => all.indexOf(key) === index)
      .sort();

    expect(seeded).toEqual([...PHASE_1_PERMISSIONS].sort());
  });

  it('names 22 permissions', () => {
    expect(PHASE_1_PERMISSIONS).toHaveLength(22);
  });

  it('covers read and write for every PR 2 identity resource', () => {
    const resources = [
      'organization_node',
      'legal_entity',
      'operating_authority',
      'carrier_appointment',
      'user',
      'membership',
      'role',
      'service_account',
      'policy_binding',
    ];
    for (const resource of resources) {
      expect(PHASE_1_PERMISSIONS, resource).toContain(`identity.${resource}.read`);
      expect(PHASE_1_PERMISSIONS, resource).toContain(`identity.${resource}.write`);
    }
  });

  it('names no permission for a resource PR 2 does not create', () => {
    // A permission naming a table nobody has built is a placeholder implying a capability that
    // does not exist — 21_SEQUENCING_DOCTRINE forbids exactly that.
    for (const absent of ['shipment', 'facility', 'driver', 'powered_unit', 'invoice', 'meter']) {
      expect(
        PHASE_1_PERMISSIONS.some((p) => p.includes(absent)),
        absent,
      ).toBe(false);
    }
  });

  it('narrows an unknown string', () => {
    expect(isPhase1Permission('identity.user.read')).toBe(true);
    expect(isPhase1Permission('identity.user.delete')).toBe(false);
    expect(isPhase1Permission(42)).toBe(false);
    expect(isPhase1Permission(null)).toBe(false);
  });
});

describe('effective permission resolution', () => {
  it('holds a permission when every link authorizes', () => {
    expect(resolveEffectivePermissions([FULL_CHAIN], NOW).has('identity.user.read')).toBe(true);
    expect(hasPermission([FULL_CHAIN], 'identity.user.read', NOW)).toBe(true);
  });

  it('holds nothing when there are no grants', () => {
    expect(resolveEffectivePermissions([], NOW).size).toBe(0);
  });

  it('ignores a grant with an empty chain rather than treating it as unconditional', () => {
    expect(resolveEffectivePermissions([chainOf()], NOW).size).toBe(0);
  });

  it('loses the permission when any single link is revoked', () => {
    for (let i = 0; i < 5; i += 1) {
      const links = [live(), live(), live(), live(), live()];
      links[i] = live({ status: 'revoked', revokedAt: T0 });
      expect(hasPermission([chainOf(...links)], 'identity.user.read', NOW), `link ${i}`).toBe(
        false,
      );
    }
  });

  it('loses the permission when any single link is suspended', () => {
    for (let i = 0; i < 5; i += 1) {
      const links = [live(), live(), live(), live(), live()];
      links[i] = live({ status: 'suspended' });
      expect(hasPermission([chainOf(...links)], 'identity.user.read', NOW), `link ${i}`).toBe(
        false,
      );
    }
  });

  it('loses the permission when any single link is outside its effective window', () => {
    for (let i = 0; i < 5; i += 1) {
      const links = [live(), live(), live(), live(), live()];
      links[i] = live({ effectiveTo: T0 });
      expect(hasPermission([chainOf(...links)], 'identity.user.read', NOW), `link ${i}`).toBe(
        false,
      );
    }
  });

  it('answers as of the instant asked, not as of now', () => {
    const grant = chainOf(live(), live(), live(), live(), live({ effectiveTo: NOW }));
    expect(hasPermission([grant], 'identity.user.read', T0)).toBe(true);
    expect(hasPermission([grant], 'identity.user.read', NOW)).toBe(false);
    expect(hasPermission([grant], 'identity.user.read', LATER)).toBe(false);
  });

  it('resolves several permissions independently', () => {
    const grants: PermissionGrant[] = [
      { permissionKey: 'identity.user.read', chain: [live(), live()] },
      { permissionKey: 'identity.user.write', chain: [live(), live({ revokedAt: T0 })] },
      { permissionKey: 'identity.role.read', chain: [live()] },
    ];
    const held = resolveEffectivePermissions(grants, NOW);
    expect([...held].sort()).toEqual(['identity.role.read', 'identity.user.read']);
  });

  it('does not grant a permission the subject was never given', () => {
    expect(hasPermission([FULL_CHAIN], 'identity.role.write', NOW)).toBe(false);
  });

  it('deduplicates a permission granted through two chains', () => {
    const held = resolveEffectivePermissions([FULL_CHAIN, FULL_CHAIN], NOW);
    expect(held.size).toBe(1);
  });

  it('keeps a permission held through a live chain when a parallel chain is revoked', () => {
    const dead: PermissionGrant = {
      permissionKey: 'identity.user.read',
      chain: [live({ revokedAt: T0 })],
    };
    expect(hasPermission([dead, FULL_CHAIN], 'identity.user.read', NOW)).toBe(true);
  });
});
