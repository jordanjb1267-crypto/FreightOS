/**
 * Organization hierarchy invariants — Specification 1, ADR-0021, risk P-18.
 *
 * The authoritative enforcement is in the database: migration 0007 carries the CHECK constraints,
 * the closure table, and the cycle and depth triggers. This module is the application mirror, and
 * it exists so a caller can reject a malformed tree before a round trip rather than after one.
 * A test asserts the permitted-parent relation here agrees with `app.is_permitted_node_parent`
 * over the full 8 x 8 cross-product, because two copies of a rule that can disagree are worse
 * than one copy in the wrong place.
 */

/** The eight node types at `04_ENTERPRISE_SCALE_AND_TENANCY:5-14`. */
export const ORGANIZATION_NODE_TYPES = [
  'enterprise',
  'legal_entity',
  'operating_authority',
  'business_unit',
  'region',
  'terminal',
  'fleet',
  'cost_center',
] as const;
export type OrganizationNodeType = (typeof ORGANIZATION_NODE_TYPES)[number];

/**
 * Bounded so that inheritance resolution cannot become unbounded — P-18. Sixteen is deep enough
 * for an enterprise, a legal entity, an operating authority, and a dozen levels of internal
 * structure beneath them.
 */
export const MAX_ORGANIZATION_DEPTH = 16;

/**
 * Permitted parenthood, as a relation rather than a ladder.
 *
 * `04_…:16` says drivers, equipment, users, policies, contracts and reports "can be scoped to any
 * valid node", and `00_…:116-124` presents the canonical nesting as illustrative. A region may
 * therefore sit under an enterprise, a legal entity, an operating authority, a business unit, or
 * another region. `enterprise` maps to the empty set because it is the root and has no parent.
 */
export const PERMITTED_NODE_PARENTS: Readonly<
  Record<OrganizationNodeType, readonly OrganizationNodeType[]>
> = Object.freeze({
  enterprise: [],
  legal_entity: ['enterprise', 'business_unit', 'region'],
  operating_authority: ['legal_entity'],
  business_unit: ['enterprise', 'legal_entity', 'operating_authority', 'business_unit', 'region'],
  region: ['enterprise', 'legal_entity', 'operating_authority', 'business_unit', 'region'],
  terminal: ['legal_entity', 'operating_authority', 'business_unit', 'region'],
  fleet: ['legal_entity', 'operating_authority', 'business_unit', 'region', 'terminal'],
  cost_center: [
    'enterprise',
    'legal_entity',
    'operating_authority',
    'business_unit',
    'region',
    'terminal',
    'fleet',
  ],
});

export function isPermittedNodeParent(
  child: OrganizationNodeType,
  parent: OrganizationNodeType,
): boolean {
  return PERMITTED_NODE_PARENTS[child]?.includes(parent) ?? false;
}

export interface OrganizationNodeShape {
  readonly id: string;
  readonly parentId: string | null;
  readonly nodeType: OrganizationNodeType;
}

export type HierarchyViolation =
  | { readonly kind: 'no_root'; readonly detail: string }
  | { readonly kind: 'multiple_roots'; readonly detail: string }
  | { readonly kind: 'root_is_not_enterprise'; readonly detail: string }
  | { readonly kind: 'enterprise_is_not_root'; readonly detail: string }
  | { readonly kind: 'missing_parent'; readonly detail: string }
  | { readonly kind: 'cycle'; readonly detail: string }
  | { readonly kind: 'impermissible_parent'; readonly detail: string }
  | { readonly kind: 'depth_exceeded'; readonly detail: string };

/**
 * Every way a proposed tree is malformed. Empty means well formed.
 *
 * Collects rather than short-circuits: an operator fixing a hierarchy wants the whole list, and
 * reporting one violation at a time turns a single correction into several round trips.
 */
export function validateHierarchy(
  nodes: readonly OrganizationNodeShape[],
): readonly HierarchyViolation[] {
  const violations: HierarchyViolation[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const roots = nodes.filter((n) => n.parentId === null);
  if (roots.length === 0 && nodes.length > 0) {
    violations.push({ kind: 'no_root', detail: 'no node has a null parent' });
  }
  if (roots.length > 1) {
    violations.push({
      kind: 'multiple_roots',
      detail: `${roots.length} nodes have a null parent: ${roots.map((r) => r.id).join(', ')}`,
    });
  }
  for (const root of roots) {
    if (root.nodeType !== 'enterprise') {
      violations.push({
        kind: 'root_is_not_enterprise',
        detail: `root ${root.id} is a ${root.nodeType} node`,
      });
    }
  }

  for (const node of nodes) {
    if (node.nodeType === 'enterprise' && node.parentId !== null) {
      violations.push({
        kind: 'enterprise_is_not_root',
        detail: `enterprise node ${node.id} has parent ${node.parentId}`,
      });
      continue;
    }
    if (node.parentId === null) continue;

    const parent = byId.get(node.parentId);
    if (!parent) {
      violations.push({
        kind: 'missing_parent',
        detail: `node ${node.id} names parent ${node.parentId}, which is not in the set`,
      });
      continue;
    }
    if (!isPermittedNodeParent(node.nodeType, parent.nodeType)) {
      violations.push({
        kind: 'impermissible_parent',
        detail: `a ${node.nodeType} node may not be a child of a ${parent.nodeType} node`,
      });
    }
  }

  for (const node of nodes) {
    const walked = walkToRoot(node, byId);
    if (walked.kind === 'cycle') {
      violations.push({ kind: 'cycle', detail: `node ${node.id} is its own ancestor` });
    } else if (walked.kind === 'depth' && walked.depth > MAX_ORGANIZATION_DEPTH) {
      violations.push({
        kind: 'depth_exceeded',
        detail: `node ${node.id} sits at depth ${walked.depth}; the bound is ${MAX_ORGANIZATION_DEPTH}`,
      });
    }
  }

  return violations;
}

type Walk =
  | { readonly kind: 'depth'; readonly depth: number }
  | { readonly kind: 'cycle' }
  | { readonly kind: 'detached' };

function walkToRoot(
  start: OrganizationNodeShape,
  byId: ReadonlyMap<string, OrganizationNodeShape>,
): Walk {
  const seen = new Set<string>([start.id]);
  let current = start;
  let depth = 0;

  for (;;) {
    if (current.parentId === null) return { kind: 'depth', depth };
    if (seen.has(current.parentId)) return { kind: 'cycle' };

    const parent = byId.get(current.parentId);
    if (!parent) return { kind: 'detached' };

    seen.add(parent.id);
    current = parent;
    depth += 1;

    // The seen-set already catches every cycle; this is the guard against a set so large that a
    // legitimate walk is indistinguishable from a runaway one.
    if (depth > MAX_ORGANIZATION_DEPTH * 4) return { kind: 'depth', depth };
  }
}

export function isValidHierarchy(nodes: readonly OrganizationNodeShape[]): boolean {
  return validateHierarchy(nodes).length === 0;
}

/**
 * Depth of a node measured from the root, or null when the chain is broken or cyclic.
 * Mirrors `organization_nodes.depth`, which migration 0007 maintains by trigger.
 */
export function depthOf(nodeId: string, nodes: readonly OrganizationNodeShape[]): number | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const node = byId.get(nodeId);
  if (!node) return null;
  const walked = walkToRoot(node, byId);
  return walked.kind === 'depth' ? walked.depth : null;
}

/** Ancestors of a node, nearest first, excluding the node itself. */
export function ancestorsOf(
  nodeId: string,
  nodes: readonly OrganizationNodeShape[],
): readonly string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ancestors: string[] = [];
  const seen = new Set<string>([nodeId]);

  let current = byId.get(nodeId);
  while (current?.parentId !== null && current?.parentId !== undefined) {
    if (seen.has(current.parentId)) break;
    seen.add(current.parentId);
    ancestors.push(current.parentId);
    current = byId.get(current.parentId);
  }

  return ancestors;
}
