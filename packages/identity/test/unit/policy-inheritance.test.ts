import { describe, expect, it } from 'vitest';
import {
  POLICY_BINDING_DIRECTIONS,
  PROTECTED_CONTROL_CATEGORIES,
  isPermittedBinding,
  resolveEffectivePolicy,
  weakeningRejection,
  type PolicyBinding,
} from '../../src/policy-inheritance.ts';

const T0 = new Date('2026-01-01T00:00:00Z');
const NOW = new Date('2026-06-01T00:00:00Z');

/** enterprise > legal_entity > region > terminal, nearest first from the terminal's point of view. */
const ANCESTRY = ['term', 'reg', 'le', 'ent'];
const STRICT_ANCESTRY = ['reg', 'le', 'ent'];

function binding(overrides: Partial<PolicyBinding> = {}): PolicyBinding {
  return {
    organizationNodeId: 'ent',
    policyKey: 'base_policy',
    controlKey: 'approval_threshold',
    controlValue: 'low',
    restrictiveness: 1,
    direction: 'inherited',
    protectedCategory: null,
    status: 'active',
    effectiveFrom: T0,
    effectiveTo: null,
    revokedAt: null,
    ...overrides,
  };
}

describe('the policy vocabulary', () => {
  it('names the six categories 04_...:20 protects', () => {
    expect(PROTECTED_CONTROL_CATEGORIES).toEqual([
      'legal',
      'safety',
      'enterprise_minimum',
      'security',
      'residency',
      'approval',
    ]);
  });

  it('records whether a value was inherited or set locally — 04_...:22', () => {
    expect(POLICY_BINDING_DIRECTIONS).toEqual(['inherited', 'local_override']);
  });
});

describe('inheritance across four levels', () => {
  it('inherits a root binding all the way down and names the root as the source', () => {
    const resolved = resolveEffectivePolicy([binding()], ANCESTRY, NOW);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.controlValue).toBe('low');
    expect(resolved[0]!.sourceNodeId).toBe('ent');
    expect(resolved[0]!.sourceDepth).toBe(3);
  });

  it('lets a child tighten an inherited control', () => {
    const resolved = resolveEffectivePolicy(
      [
        binding({ organizationNodeId: 'ent', controlValue: 'low', restrictiveness: 1 }),
        binding({
          organizationNodeId: 'reg',
          controlValue: 'high',
          restrictiveness: 5,
          direction: 'local_override',
        }),
      ],
      ANCESTRY,
      NOW,
    );
    expect(resolved[0]!.controlValue).toBe('high');
    expect(resolved[0]!.sourceNodeId).toBe('reg');
    expect(resolved[0]!.direction).toBe('local_override');
  });

  it('ignores a looser child binding — most restrictive wins regardless of distance', () => {
    const resolved = resolveEffectivePolicy(
      [
        binding({ organizationNodeId: 'ent', controlValue: 'high', restrictiveness: 5 }),
        binding({
          organizationNodeId: 'term',
          controlValue: 'low',
          restrictiveness: 1,
          direction: 'local_override',
        }),
      ],
      ANCESTRY,
      NOW,
    );
    expect(resolved[0]!.controlValue).toBe('high');
    expect(resolved[0]!.sourceNodeId).toBe('ent');
  });

  it('breaks a tie in favour of the nearest node', () => {
    const resolved = resolveEffectivePolicy(
      [
        binding({ organizationNodeId: 'ent', controlValue: 'root', restrictiveness: 3 }),
        binding({
          organizationNodeId: 'term',
          controlValue: 'local',
          restrictiveness: 3,
          direction: 'local_override',
        }),
      ],
      ANCESTRY,
      NOW,
    );
    expect(resolved[0]!.sourceNodeId).toBe('term');
    expect(resolved[0]!.sourceDepth).toBe(0);
    expect(resolved[0]!.controlValue).toBe('local');
  });

  it('resolves a binding at each of the four levels independently', () => {
    const resolved = resolveEffectivePolicy(
      [
        binding({ organizationNodeId: 'ent', controlKey: 'a', restrictiveness: 1 }),
        binding({ organizationNodeId: 'le', controlKey: 'b', restrictiveness: 2 }),
        binding({ organizationNodeId: 'reg', controlKey: 'c', restrictiveness: 3 }),
        binding({ organizationNodeId: 'term', controlKey: 'd', restrictiveness: 4 }),
      ],
      ANCESTRY,
      NOW,
    );
    expect(resolved.map((r) => r.controlKey)).toEqual(['a', 'b', 'c', 'd']);
    expect(resolved.map((r) => r.sourceDepth)).toEqual([3, 2, 1, 0]);
  });

  it('ignores a binding on a node outside the ancestry — a sibling cannot reach across', () => {
    const resolved = resolveEffectivePolicy(
      [binding({ organizationNodeId: 'other-branch', restrictiveness: 9 })],
      ANCESTRY,
      NOW,
    );
    expect(resolved).toEqual([]);
  });

  it('keeps different policy packs separate', () => {
    const resolved = resolveEffectivePolicy(
      [
        binding({ policyKey: 'base_policy', controlValue: 'a', restrictiveness: 1 }),
        binding({ policyKey: 'residency_policy', controlValue: 'b', restrictiveness: 5 }),
      ],
      ANCESTRY,
      NOW,
    );
    expect(resolved).toHaveLength(2);
    expect(resolved.map((r) => r.policyKey)).toEqual(['base_policy', 'residency_policy']);
  });
});

describe('a binding that does not authorize contributes nothing', () => {
  it('ignores a revoked binding', () => {
    const resolved = resolveEffectivePolicy(
      [
        binding({
          organizationNodeId: 'ent',
          restrictiveness: 9,
          revokedAt: T0,
          status: 'revoked',
        }),
        binding({ organizationNodeId: 'reg', controlValue: 'live', restrictiveness: 1 }),
      ],
      ANCESTRY,
      NOW,
    );
    expect(resolved[0]!.controlValue).toBe('live');
  });

  it('ignores a suspended or pending binding', () => {
    for (const status of ['suspended', 'pending'] as const) {
      const resolved = resolveEffectivePolicy(
        [binding({ status, restrictiveness: 9 })],
        ANCESTRY,
        NOW,
      );
      expect(resolved, status).toEqual([]);
    }
  });

  it('ignores a binding outside its effective window', () => {
    expect(resolveEffectivePolicy([binding({ effectiveTo: T0 })], ANCESTRY, NOW)).toEqual([]);
    expect(
      resolveEffectivePolicy([binding({ effectiveFrom: new Date('2027-01-01') })], ANCESTRY, NOW),
    ).toEqual([]);
  });

  it('answers as of the instant asked', () => {
    const expiring = binding({ effectiveTo: NOW, controlValue: 'expiring' });
    expect(resolveEffectivePolicy([expiring], ANCESTRY, T0)[0]?.controlValue).toBe('expiring');
    expect(resolveEffectivePolicy([expiring], ANCESTRY, NOW)).toEqual([]);
  });
});

describe('protected controls — a child may tighten but never weaken', () => {
  const inheritedStrict = binding({
    organizationNodeId: 'le',
    controlKey: 'data_residency',
    controlValue: 'eu_only',
    restrictiveness: 9,
    protectedCategory: 'residency',
  });

  it('rejects a child binding that lowers a protected control', () => {
    const proposed = binding({
      organizationNodeId: 'term',
      controlKey: 'data_residency',
      controlValue: 'anywhere',
      restrictiveness: 1,
      protectedCategory: 'residency',
      direction: 'local_override',
    });

    const rejection = weakeningRejection(proposed, [inheritedStrict], STRICT_ANCESTRY, NOW);
    expect(rejection).not.toBeNull();
    expect(rejection!.protectedCategory).toBe('residency');
    expect(rejection!.inheritedFromNodeId).toBe('le');
    expect(rejection!.inheritedRestrictiveness).toBe(9);
    expect(rejection!.proposedRestrictiveness).toBe(1);
    expect(isPermittedBinding(proposed, [inheritedStrict], STRICT_ANCESTRY, NOW)).toBe(false);
  });

  it('permits a child binding that tightens a protected control', () => {
    const proposed = binding({
      organizationNodeId: 'term',
      controlKey: 'data_residency',
      restrictiveness: 10,
      protectedCategory: 'residency',
    });
    expect(isPermittedBinding(proposed, [inheritedStrict], STRICT_ANCESTRY, NOW)).toBe(true);
  });

  it('permits an equal restrictiveness — matching is not weakening', () => {
    const proposed = binding({
      organizationNodeId: 'term',
      controlKey: 'data_residency',
      restrictiveness: 9,
      protectedCategory: 'residency',
    });
    expect(isPermittedBinding(proposed, [inheritedStrict], STRICT_ANCESTRY, NOW)).toBe(true);
  });

  it('permits weakening an unprotected control', () => {
    const looseInherited = binding({
      organizationNodeId: 'le',
      controlKey: 'notification_verbosity',
      restrictiveness: 9,
      protectedCategory: null,
    });
    const proposed = binding({
      organizationNodeId: 'term',
      controlKey: 'notification_verbosity',
      restrictiveness: 1,
      protectedCategory: null,
    });
    expect(isPermittedBinding(proposed, [looseInherited], STRICT_ANCESTRY, NOW)).toBe(true);
  });

  it('does not treat the nodeitself as its own ancestor', () => {
    const own = binding({
      organizationNodeId: 'term',
      controlKey: 'data_residency',
      restrictiveness: 9,
      protectedCategory: 'residency',
    });
    const replacement = binding({
      organizationNodeId: 'term',
      controlKey: 'data_residency',
      restrictiveness: 2,
      protectedCategory: 'residency',
    });
    // 'term' is absent from STRICT_ANCESTRY, so its own prior binding does not block a replacement.
    expect(isPermittedBinding(replacement, [own], STRICT_ANCESTRY, NOW)).toBe(true);
  });

  it('ignores a revoked ancestor binding when judging a weakening', () => {
    const revoked = { ...inheritedStrict, revokedAt: T0, status: 'revoked' as const };
    const proposed = binding({
      organizationNodeId: 'term',
      controlKey: 'data_residency',
      restrictiveness: 1,
      protectedCategory: 'residency',
    });
    expect(isPermittedBinding(proposed, [revoked], STRICT_ANCESTRY, NOW)).toBe(true);
  });

  it('names the strictest ancestor when several apply', () => {
    const proposed = binding({
      organizationNodeId: 'term',
      controlKey: 'data_residency',
      restrictiveness: 1,
      protectedCategory: 'residency',
    });
    const rejection = weakeningRejection(
      proposed,
      [
        binding({
          organizationNodeId: 'ent',
          controlKey: 'data_residency',
          restrictiveness: 4,
          protectedCategory: 'residency',
        }),
        inheritedStrict,
      ],
      STRICT_ANCESTRY,
      NOW,
    );
    expect(rejection!.inheritedFromNodeId).toBe('le');
    expect(rejection!.inheritedRestrictiveness).toBe(9);
  });

  it('applies to all six protected categories', () => {
    for (const category of PROTECTED_CONTROL_CATEGORIES) {
      const strict = binding({
        organizationNodeId: 'le',
        controlKey: `c_${category}`,
        restrictiveness: 9,
        protectedCategory: category,
      });
      const proposed = binding({
        organizationNodeId: 'term',
        controlKey: `c_${category}`,
        restrictiveness: 1,
        protectedCategory: category,
      });
      expect(isPermittedBinding(proposed, [strict], STRICT_ANCESTRY, NOW), category).toBe(false);
    }
  });
});
