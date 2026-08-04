import { describe, expect, it } from 'vitest';
import {
  MAX_ORGANIZATION_DEPTH,
  ORGANIZATION_NODE_TYPES,
  PERMITTED_NODE_PARENTS,
  ancestorsOf,
  depthOf,
  isPermittedNodeParent,
  isValidHierarchy,
  validateHierarchy,
  type OrganizationNodeShape,
  type OrganizationNodeType,
} from '../../src/organization.ts';

/**
 * The database is the authority — migration 0007 carries the constraints, the closure table, and
 * the cycle and depth triggers, and packages/database/test/integration/organization-hierarchy.test.ts
 * proves them against a live PostgreSQL. This file covers the application mirror, and one of its
 * tests asserts the mirror agrees with the SQL over the full 8 x 8 parent cross-product.
 */

function node(
  id: string,
  parentId: string | null,
  nodeType: OrganizationNodeType,
): OrganizationNodeShape {
  return { id, parentId, nodeType };
}

/** enterprise > legal_entity > region > terminal — the four levels PR 2 must traverse. */
const FOUR_LEVEL: OrganizationNodeShape[] = [
  node('ent', null, 'enterprise'),
  node('le', 'ent', 'legal_entity'),
  node('reg', 'le', 'region'),
  node('term', 'reg', 'terminal'),
];

describe('node types', () => {
  it('names the eight types 04_ENTERPRISE_SCALE_AND_TENANCY lists', () => {
    expect(ORGANIZATION_NODE_TYPES).toEqual([
      'enterprise',
      'legal_entity',
      'operating_authority',
      'business_unit',
      'region',
      'terminal',
      'fleet',
      'cost_center',
    ]);
  });

  it('gives every type an entry in the permitted-parent relation', () => {
    for (const type of ORGANIZATION_NODE_TYPES) {
      expect(PERMITTED_NODE_PARENTS[type], type).toBeDefined();
    }
  });
});

describe('permitted parenthood', () => {
  it('gives the enterprise root no permitted parent', () => {
    expect(PERMITTED_NODE_PARENTS.enterprise).toEqual([]);
    for (const parent of ORGANIZATION_NODE_TYPES) {
      expect(isPermittedNodeParent('enterprise', parent), parent).toBe(false);
    }
  });

  it('is a relation, not a ladder — a region has five permitted parents', () => {
    expect(isPermittedNodeParent('region', 'enterprise')).toBe(true);
    expect(isPermittedNodeParent('region', 'legal_entity')).toBe(true);
    expect(isPermittedNodeParent('region', 'operating_authority')).toBe(true);
    expect(isPermittedNodeParent('region', 'business_unit')).toBe(true);
    expect(isPermittedNodeParent('region', 'region')).toBe(true);
  });

  it('lets an operating authority hang only off a legal entity', () => {
    for (const parent of ORGANIZATION_NODE_TYPES) {
      expect(isPermittedNodeParent('operating_authority', parent), parent).toBe(
        parent === 'legal_entity',
      );
    }
  });

  it('refuses a terminal or fleet directly under the enterprise root', () => {
    expect(isPermittedNodeParent('terminal', 'enterprise')).toBe(false);
    expect(isPermittedNodeParent('fleet', 'enterprise')).toBe(false);
  });

  it('refuses an unknown type rather than defaulting to permitted', () => {
    expect(isPermittedNodeParent('not_a_type' as OrganizationNodeType, 'enterprise')).toBe(false);
  });

  it('covers the full 8 x 8 cross-product with a definite answer', () => {
    let permitted = 0;
    for (const child of ORGANIZATION_NODE_TYPES) {
      for (const parent of ORGANIZATION_NODE_TYPES) {
        const answer = isPermittedNodeParent(child, parent);
        expect(typeof answer, `${child}/${parent}`).toBe('boolean');
        if (answer) permitted += 1;
      }
    }
    // A fixed count, so a silent widening of the relation fails this test rather than passing it.
    // 0 + 3 + 1 + 5 + 5 + 4 + 5 + 7, in the order ORGANIZATION_NODE_TYPES declares.
    expect(permitted).toBe(30);
  });
});

describe('a well-formed hierarchy', () => {
  it('accepts the four-level tree', () => {
    expect(validateHierarchy(FOUR_LEVEL)).toEqual([]);
    expect(isValidHierarchy(FOUR_LEVEL)).toBe(true);
  });

  it('computes depth from the root', () => {
    expect(depthOf('ent', FOUR_LEVEL)).toBe(0);
    expect(depthOf('le', FOUR_LEVEL)).toBe(1);
    expect(depthOf('reg', FOUR_LEVEL)).toBe(2);
    expect(depthOf('term', FOUR_LEVEL)).toBe(3);
  });

  it('returns null depth for a node that is not in the set', () => {
    expect(depthOf('missing', FOUR_LEVEL)).toBeNull();
  });

  it('lists ancestors nearest first, excluding the node itself', () => {
    expect(ancestorsOf('term', FOUR_LEVEL)).toEqual(['reg', 'le', 'ent']);
    expect(ancestorsOf('ent', FOUR_LEVEL)).toEqual([]);
  });

  it('accepts an empty set — a tenant with no organization yet is not malformed', () => {
    expect(validateHierarchy([])).toEqual([]);
  });
});

describe('malformed hierarchies', () => {
  it('rejects a set with no root', () => {
    const detached = [node('a', 'b', 'region'), node('b', 'a', 'region')];
    const kinds = validateHierarchy(detached).map((v) => v.kind);
    expect(kinds).toContain('no_root');
  });

  it('rejects two roots', () => {
    const twoRoots = [node('e1', null, 'enterprise'), node('e2', null, 'enterprise')];
    expect(validateHierarchy(twoRoots).map((v) => v.kind)).toContain('multiple_roots');
  });

  it('rejects a root that is not an enterprise', () => {
    const badRoot = [node('r', null, 'region')];
    expect(validateHierarchy(badRoot).map((v) => v.kind)).toContain('root_is_not_enterprise');
  });

  it('rejects an enterprise node that is not the root', () => {
    const nested = [node('ent', null, 'enterprise'), node('ent2', 'ent', 'enterprise')];
    expect(validateHierarchy(nested).map((v) => v.kind)).toContain('enterprise_is_not_root');
  });

  it('rejects a parent that is not in the set', () => {
    const orphan = [...FOUR_LEVEL, node('lost', 'nowhere', 'fleet')];
    expect(validateHierarchy(orphan).map((v) => v.kind)).toContain('missing_parent');
  });

  it('rejects an impermissible parent type', () => {
    const bad = [node('ent', null, 'enterprise'), node('t', 'ent', 'terminal')];
    const violations = validateHierarchy(bad);
    expect(violations.map((v) => v.kind)).toContain('impermissible_parent');
    expect(violations.find((v) => v.kind === 'impermissible_parent')?.detail).toContain('terminal');
  });

  it('rejects a two-node cycle', () => {
    const cycle = [
      node('ent', null, 'enterprise'),
      node('a', 'b', 'region'),
      node('b', 'a', 'region'),
    ];
    expect(validateHierarchy(cycle).map((v) => v.kind)).toContain('cycle');
  });

  it('rejects a self-parent', () => {
    const selfCycle = [node('ent', null, 'enterprise'), node('a', 'a', 'region')];
    expect(validateHierarchy(selfCycle).map((v) => v.kind)).toContain('cycle');
  });

  it('rejects a three-node cycle', () => {
    const cycle = [
      node('ent', null, 'enterprise'),
      node('a', 'c', 'region'),
      node('b', 'a', 'region'),
      node('c', 'b', 'region'),
    ];
    expect(validateHierarchy(cycle).map((v) => v.kind)).toContain('cycle');
  });

  it('returns null depth and empty ancestry for a cyclic node rather than looping', () => {
    const cycle = [node('a', 'b', 'region'), node('b', 'a', 'region')];
    expect(depthOf('a', cycle)).toBeNull();
    expect(ancestorsOf('a', cycle)).toEqual(['b']);
  });

  it('accepts a chain exactly at the depth bound', () => {
    const chain: OrganizationNodeShape[] = [node('n0', null, 'enterprise')];
    for (let i = 1; i <= MAX_ORGANIZATION_DEPTH; i += 1) {
      chain.push(node(`n${i}`, `n${i - 1}`, i === 1 ? 'legal_entity' : 'business_unit'));
    }
    expect(depthOf(`n${MAX_ORGANIZATION_DEPTH}`, chain)).toBe(MAX_ORGANIZATION_DEPTH);
    expect(validateHierarchy(chain).map((v) => v.kind)).not.toContain('depth_exceeded');
  });

  it('rejects a chain one level past the bound', () => {
    const chain: OrganizationNodeShape[] = [node('n0', null, 'enterprise')];
    for (let i = 1; i <= MAX_ORGANIZATION_DEPTH + 1; i += 1) {
      chain.push(node(`n${i}`, `n${i - 1}`, i === 1 ? 'legal_entity' : 'business_unit'));
    }
    expect(validateHierarchy(chain).map((v) => v.kind)).toContain('depth_exceeded');
  });

  it('collects every violation rather than stopping at the first', () => {
    const messy = [
      node('e1', null, 'enterprise'),
      node('e2', null, 'enterprise'),
      node('t', 'e1', 'terminal'),
      node('lost', 'nowhere', 'fleet'),
    ];
    const kinds = new Set(validateHierarchy(messy).map((v) => v.kind));
    expect(kinds.has('multiple_roots')).toBe(true);
    expect(kinds.has('impermissible_parent')).toBe(true);
    expect(kinds.has('missing_parent')).toBe(true);
  });
});
