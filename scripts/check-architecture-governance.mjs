#!/usr/bin/env node
// CI gate: every accepted architecture package must be BOUND to the authority that governs it.
//
// WHAT THIS IS, AND HOW IT DIFFERS FROM ITS SIBLING.
//
//   check-network-governance.mjs      asks: does each declared layer still match its manifest?
//   check-architecture-governance.mjs asks: is each accepted architecture package bound to accepted
//                                           ADR, module-state and Horizon authority?
//
// Both read the SAME registry through scripts/lib/governance-layers.mjs. Only the POLICY differs,
// and that difference is the point: a package can be byte-perfect and still be unbound, which is
// precisely the state all six were in before AWE-0.
//
// THE DEFECT THIS CLOSES. docs/agentic-architecture-review/01_PACKAGE_INVENTORY_AND_PRECEDENCE.md
// §3.1-§3.2 records it and this repository reproduces it exactly: across the six accepted
// architecture packages there are ZERO references to any of the 27 accepted ADRs, ZERO references
// from any accepted ADR back to a package, ZERO mentions of any module id from
// config/scope/module_states.yaml (one incidental occurrence in a v1.7 generated file), and ZERO
// mentions of a Horizon outside v1.8.1. Substantive, internally coherent architecture, connected
// to the repository's controlling authority by nothing at all.
//
// THE BINDING CANNOT LIVE INSIDE THE PACKAGES. Owner ruling 2 (docs/security-resilience/README.md
// §A.4a) freezes an installed versioned package after installation and directs that later handoff
// pointers live in a registry maintained OUTSIDE the checksummed packages. Adding a citation to a
// package document would also break that package's own manifest. So the relation is declared in
// governance-layers.json — which is the registry owner ruling 2 called for — and enforced here.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS GATE PROVES, AND WHAT IT DOES NOT.
//
// An independent adversarial review of the first candidate broke it seven ways, and every break
// had the same shape: a rule whose expectations lived entirely inside the document it validated, or
// a rule that checked a string where it needed to check a structure. The tiers below are stated
// explicitly because the previous version implied a stronger claim than it delivered.
//
//   PROVEN, structurally:
//     · the relation is syntactically valid and its kind is in the vocabulary
//     · the authority target EXISTS, is SOURCE-QUALIFIED, and is ACCEPTED
//     · module ids resolve in config/scope/module_states.yaml; Horizon agrees with module state
//     · the registry has not drifted from the binding a reviewer last signed off (digest)
//     · the required gates actually RUN in CI — parsed workflow, not a substring
//
//   NOT PROVEN, and labelled as such:
//     · the SEMANTIC TRUTH of an `evidence` string. It is human-reviewed rationale. No validator
//       can decide whether "ADR-0018 governs this package's autonomy ladder" is a correct reading
//       of ADR-0018; that is an architecture-review obligation. What the digest gives is that the
//       rationale cannot CHANGE without a reviewer re-accepting it.
//     · that a package's moduleScope is the RIGHT scope. The immutable packages carry no
//       machine-readable module metadata to check it against — the scope is a reviewed governance
//       act, pinned by the digest, not a derived fact.
//     · tamper resistance of the packages themselves. See the F-07 note in
//       check-network-governance.mjs: manifests are package-local and a coordinated edit passes.
//
// Fail-closed throughout: an unreadable registry, an unknown relation, an authority that is not
// Accepted, a module the scope registry does not know, a Horizon above what is authorized, a
// digest mismatch, or a scan that covered nothing are all failures rather than silence.
//
// No network access. Deterministic output. Exit 0 = clean, 1 = fail.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';

import {
  ANCHORED_CI_REQUIRED_GATES,
  ANCHORED_LAYER_ROLES,
  AUTHORITY_RELATIONS,
  AUTHORITY_MODEL_CONTRACT,
  AUTHORITY_SOURCES,
  CCEP_CONTROL_SURFACE,
  EXEMPTION_ANCHORS,
  KNOWN_UNRESOLVED_AUTHORITY_BY_ROOT,
  LAYER_ROLES,
  MANIFEST_FORMATS,
  PROVENANCE_FILE,
  REPO_ROOT,
  REQUIRED_SUBORDINATION,
  RESOLVED_AUTHORITY,
  REVIEWED_BINDING_DIGESTS,
  WORKFLOW_FILE,
  bindingDigest,
  buildAuthorityIndex,
  handoffPackageDirectories,
  invokes,
  isAccepted,
  isGovernedArchitectureLayer,
  loadRegistry,
  sha256,
  workflowRunCommands,
} from './lib/governance-layers.mjs';
import { SOURCE_FILE_PATTERN, walk as walkSource } from './lib/network-primitives.mjs';

const errors = [];
const notes = [];
const fail = (message) => errors.push(message);

const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');

function report() {
  if (errors.length > 0) {
    console.error('ARCHITECTURE_GOVERNANCE=FAIL');
    for (const e of errors) console.error(`- ${e}`);
    console.error(
      '\nRegistration binds a package to authority; it never confers any. If a package genuinely\n' +
        'needs authority it does not have, that is an ADR or a module-state promotion, not an edit\n' +
        'to this registry.',
    );
    process.exit(1);
  }
  console.log('ARCHITECTURE_GOVERNANCE=PASS');
  console.log('PACKAGE_IDENTITY=PASS');
  console.log('BINDING_OBLIGATION=PASS');
  console.log('AUTHORITY_TRACEABILITY=PASS');
  console.log('REVIEWED_BINDING=PASS');
  console.log('UNRESOLVED_AUTHORITY_PRESERVED=PASS');
  console.log('MODULE_STATE_BINDING=PASS');
  console.log('HORIZON_BINDING=PASS');
  console.log('AUTHORITY_MODEL=PASS');
  console.log('CI_ENFORCEMENT=PASS');
  console.log('DOCS_ARE_NOT_RUNTIME_AUTHORITY=PASS');
  for (const n of notes) console.log(`  ${n}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 0. The registry itself, before anything trusts it.
// ---------------------------------------------------------------------------
const loaded = loadRegistry();
if (loaded.error) {
  console.error('ARCHITECTURE_GOVERNANCE=FAIL');
  console.error(`- ${loaded.error}`);
  process.exit(1);
}
const registry = loaded.registry;
const layers = Array.isArray(registry.layers) ? registry.layers : [];

function sameStringArray(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function edgeKey(edge) {
  return `${edge?.higher ?? ''}>${edge?.lower ?? ''}`;
}

function hasCycle(edges) {
  const graph = new Map();
  for (const edge of edges) {
    if (!graph.has(edge.higher)) graph.set(edge.higher, []);
    graph.get(edge.higher).push(edge.lower);
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (node) => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of graph.get(node) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  return [...graph.keys()].some(visit);
}

function validateAuthorityModel(model) {
  if (!model || typeof model !== 'object') {
    fail('architectureGovernance.authorityModel is missing');
    return;
  }
  if (!model.classes || typeof model.classes !== 'object') {
    fail('architectureGovernance.authorityModel.classes is missing');
  } else {
    const classKeys = Object.keys(model.classes).sort();
    const expectedKeys = [...AUTHORITY_MODEL_CONTRACT.classes].sort();
    if (!sameStringArray(classKeys, expectedKeys)) {
      fail(
        `architectureGovernance.authorityModel.classes must declare exactly ` +
          `${expectedKeys.join(', ')}`,
      );
    }
    for (const key of AUTHORITY_MODEL_CONTRACT.classes) {
      if (typeof model.classes[key] !== 'string' || model.classes[key].trim().length === 0) {
        fail(`architectureGovernance.authorityModel.classes.${key} is missing or empty`);
      }
    }
  }

  if (!sameStringArray(model.resolution, AUTHORITY_MODEL_CONTRACT.resolution)) {
    fail(
      'architectureGovernance.authorityModel.resolution no longer matches the anchored ' +
        'precedence doctrine. AUTHORITY_MODEL=PASS is only emitted for the reviewed doctrine.',
    );
  }

  const precedence = model.precedence;
  if (!precedence || typeof precedence !== 'object') {
    fail('architectureGovernance.authorityModel.precedence is missing');
    return;
  }

  const edges = Array.isArray(precedence.edges) ? precedence.edges : null;
  if (!edges) {
    fail('architectureGovernance.authorityModel.precedence.edges must be an array');
  } else {
    const expected = new Set(AUTHORITY_MODEL_CONTRACT.precedenceEdges.map(edgeKey));
    const actual = new Set();
    for (const edge of edges) {
      if (
        !edge ||
        typeof edge !== 'object' ||
        !AUTHORITY_MODEL_CONTRACT.classes.includes(edge.higher) ||
        !AUTHORITY_MODEL_CONTRACT.classes.includes(edge.lower)
      ) {
        fail(
          `architectureGovernance.authorityModel.precedence has invalid edge ${JSON.stringify(edge)}`,
        );
        continue;
      }
      if (edge.higher === edge.lower) {
        fail(
          `architectureGovernance.authorityModel.precedence contains a self-edge ${edge.higher}`,
        );
      }
      actual.add(edgeKey(edge));
    }
    if (hasCycle(edges.filter((e) => e && typeof e === 'object'))) {
      fail('architectureGovernance.authorityModel.precedence contains a cycle');
    }
    for (const required of expected) {
      if (!actual.has(required)) {
        fail(
          `architectureGovernance.authorityModel.precedence is missing required edge ${required}`,
        );
      }
    }
    for (const observed of actual) {
      if (!expected.has(observed)) {
        fail(
          `architectureGovernance.authorityModel.precedence declares unsupported edge ${observed}`,
        );
      }
    }
  }

  const incomparable = Array.isArray(precedence.incomparable) ? precedence.incomparable : [];
  const expectedIncomparable = JSON.stringify(AUTHORITY_MODEL_CONTRACT.incomparable);
  if (JSON.stringify(incomparable) !== expectedIncomparable) {
    fail(
      'architectureGovernance.authorityModel.precedence.incomparable must preserve the reviewed ' +
        'additive-subordinate incomparability rule',
    );
  }
  if (
    !sameStringArray(
      precedence.strictestWinsSubjects,
      AUTHORITY_MODEL_CONTRACT.strictestWinsSubjects,
    )
  ) {
    fail(
      'architectureGovernance.authorityModel.precedence.strictestWinsSubjects must preserve the ' +
        'reviewed strictest-wins subject set',
    );
  }
  if (precedence.conflictDisposition !== AUTHORITY_MODEL_CONTRACT.conflictDisposition) {
    fail(
      'architectureGovernance.authorityModel.precedence.conflictDisposition must be ' +
        JSON.stringify(AUTHORITY_MODEL_CONTRACT.conflictDisposition),
    );
  }
  if (precedence.classAnchor !== AUTHORITY_MODEL_CONTRACT.classAnchor) {
    fail(
      'architectureGovernance.authorityModel.precedence.classAnchor must be ' +
        JSON.stringify(AUTHORITY_MODEL_CONTRACT.classAnchor),
    );
  }
}

if (layers.length === 0) {
  fail('governance-layers.json declares no layers');
  report();
}

const governance = registry.architectureGovernance;
if (!governance || typeof governance !== 'object') {
  fail(
    'governance-layers.json has no `architectureGovernance` block. It carries the authorization ' +
      'ladder, the authority model and the CI wiring, and without it this gate has no policy to ' +
      'enforce.',
  );
  report();
}
for (const field of [
  'authorizationLadder',
  'runtimeAuthorityRule',
  'implementationAuthorityRule',
  'evidenceRule',
  'unresolvedAuthorityRule',
]) {
  const value = governance[field];
  const present = Array.isArray(value)
    ? value.length > 0
    : typeof value === 'string' && value.length > 0;
  if (!present) fail(`architectureGovernance.${field} is missing or empty`);
}
if (registry.subordination !== REQUIRED_SUBORDINATION) {
  fail(
    'governance-layers.json subordination no longer matches the anchored reviewed doctrine. ' +
      'AUTHORITY_MODEL=PASS cannot be emitted for an inverted or weakened subordination rule.',
  );
}
validateAuthorityModel(governance.authorityModel);

// ---------------------------------------------------------------------------
// 0b. The mandate — this registry is not self-authorised.
//
// Owner ruling 2 both froze installed packages and directed that later handoff pointers live in a
// registry outside them. The clause is quoted here and checked VERBATIM against the record, so the
// citation cannot drift from the text it cites and cannot be softened by rewording it here.
// ---------------------------------------------------------------------------
const mandate = governance.mandate;
if (!mandate || typeof mandate !== 'object') {
  fail('architectureGovernance.mandate is missing — the registry cites no authority for existing');
} else if (typeof mandate.record !== 'string' || !existsSync(join(REPO_ROOT, mandate.record))) {
  fail(`architectureGovernance.mandate.record does not exist: ${mandate.record}`);
} else {
  const recordText = read(mandate.record);
  for (const clauseField of ['clause', 'immutabilityClause']) {
    const clause = mandate[clauseField];
    if (typeof clause !== 'string' || clause.trim().length === 0) {
      fail(`architectureGovernance.mandate.${clauseField} is empty`);
    } else if (!recordText.includes(clause)) {
      fail(
        `architectureGovernance.mandate.${clauseField} is not present verbatim in ` +
          `${mandate.record}. A citation that no longer matches its source is not a citation.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 1. Package identity — unique, resolvable, and matching what is on disk.
// ---------------------------------------------------------------------------
const byId = new Map();
const roots = new Map();

for (const layer of layers) {
  const { id, version, root, role, integrityFile, integrityFormat } = layer;

  if (typeof id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
    fail(`layer id ${JSON.stringify(id)} is not a lower-kebab-case identifier`);
    continue;
  }
  if (byId.has(id)) {
    fail(`duplicate package identity: ${id} is declared more than once`);
    continue;
  }
  byId.set(id, layer);

  if (typeof version !== 'string' || !/^v\d+\.\d+(\.\d+)?$/.test(version)) {
    fail(`${id}: version ${JSON.stringify(version)} is not a vMAJOR.MINOR[.PATCH] string`);
  }
  if (typeof root !== 'string' || !root.startsWith('docs/production-handoff/')) {
    fail(`${id}: root ${JSON.stringify(root)} must be a path under docs/production-handoff/`);
    continue;
  }
  if (roots.has(root)) {
    fail(`duplicate package path: ${root} is claimed by both ${roots.get(root)} and ${id}`);
  }
  roots.set(root, id);

  const rootAbs = join(REPO_ROOT, root);
  if (!existsSync(rootAbs) || !statSync(rootAbs).isDirectory()) {
    fail(`${id}: declared root does not exist as a directory: ${root}`);
    continue;
  }

  // The directory name must carry the declared version AS A WHOLE SEGMENT. `.includes()` was not
  // enough: a root named `v1.7.01-something` satisfied version `v1.7.0`, so a package could be
  // renumbered without the check noticing. The version must be delimited by a boundary on both
  // sides, which still admits every real root — `v1.2`, `v1.8.1-revenueos-…`, and the mid-name
  // `facilityos-v1.0.0-enterprise-agent-operations`.
  if (typeof version === 'string') {
    const basename = root.split('/').pop();
    const boundary = new RegExp(`(^|[^0-9A-Za-z.])${version.replace(/\./g, '\\.')}([^0-9.]|$)`);
    if (!boundary.test(basename)) {
      fail(
        `${id}: declared version ${version} does not appear as a whole segment in the root ` +
          `directory name ${basename}`,
      );
    }
  }

  if (!LAYER_ROLES.includes(role)) {
    fail(`${id}: role ${JSON.stringify(role)} is not one of ${LAYER_ROLES.join(', ')}`);
  }

  // ANCHORED ROLE. The first candidate computed its anti-inversion rule from the same mutable
  // `role` field it was validating, so v1.3.0 could demote itself out of the set that constrained
  // everything else and the gate passed. Roles for the three founding roots are properties of the
  // repository, held in scripts/lib/governance-layers.mjs and keyed by PATH, not by a field this
  // file can edit. Everything else is additive-subordinate by construction.
  const anchoredRole = ANCHORED_LAYER_ROLES[root] ?? 'additive-subordinate';
  if (role !== anchoredRole) {
    fail(
      `${id}: declares role "${role}" but ${root} is anchored as "${anchoredRole}" in ` +
        `scripts/lib/governance-layers.mjs. A layer cannot demote or promote its own authority by ` +
        `editing the registry.`,
    );
  }

  if (!MANIFEST_FORMATS.includes(integrityFormat)) {
    fail(
      `${id}: integrityFormat ${JSON.stringify(integrityFormat)} is not one of ` +
        `${MANIFEST_FORMATS.join(', ')}. An undeclared format is a package nothing verifies.`,
    );
  }
  if (typeof integrityFile !== 'string' || !existsSync(join(rootAbs, integrityFile))) {
    fail(`${id}: declared integrityFile is missing: ${root}/${integrityFile}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Registration coverage — no accepted package may sit outside the registry.
// ---------------------------------------------------------------------------
let emptyDirectories = 0;
for (const directory of handoffPackageDirectories()) {
  if (directory.fileCount === 0) {
    // Not a package. Git cannot track an empty directory, so this can only be a local working-tree
    // residue; both accepted audits record exactly such a residue. Nothing here is read.
    emptyDirectories += 1;
    continue;
  }
  if (!roots.has(directory.root)) {
    fail(
      `unregistered governance package: ${directory.root} holds ${directory.fileCount} files and ` +
        `is declared in no layer. Content under docs/production-handoff/ is read as binding; ` +
        `content nothing verifies must not be.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 3. THE BINDING OBLIGATION, derived rather than enumerated.
//
// The first candidate pinned the obligation to a frozen list of six ids and a count of six. A
// seventh package could then be registered with no binding and both gates passed, while registering
// it CORRECTLY failed on the frozen count. Membership is now a property of the layer:
//
//   role === 'additive-subordinate'  AND  root under docs/production-handoff/  AND  no VERIFIED
//   exemption  ->  must carry `architecture`.
//
// A package that arrives after AWE-0 acquires the obligation by existing, and no edit to any script
// avoids it. The one exemption is DECLARED on the layer and PROVED here against repository facts —
// never accepted on the registry's word.
// ---------------------------------------------------------------------------
const provenance = existsSync(PROVENANCE_FILE)
  ? JSON.parse(readFileSync(PROVENANCE_FILE, 'utf8'))
  : {};

/** Accepted decision records that cite a layer's root path — the v1.4.0 anchor, measured not assumed. */
function citesExactPackageRoot(text, root) {
  const escaped = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^0-9A-Za-z._/-])${escaped}(/|[^0-9A-Za-z._/-]|$)`).test(text);
}

function acceptedDecisionsCiting(root) {
  const dir = join(REPO_ROOT, 'docs', 'decisions');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{4}-.*\.md$/.test(f))
    .filter((f) => {
      const text = readFileSync(join(dir, f), 'utf8');
      const status = /^[-*]?\s*\*\*Status:\*\*\s*(.+)$/m.exec(text);
      return isAccepted(status?.[1]?.trim()) && citesExactPackageRoot(text, root);
    });
}

function verifyExemption(layer) {
  const { id, root } = layer;
  const exemption = layer.architectureExemption;
  if (!exemption || typeof exemption !== 'object') {
    fail(`${id}: architectureExemption must be an object with an anchor and a note`);
    return false;
  }
  if (typeof exemption.note !== 'string' || exemption.note.trim().length === 0) {
    fail(`${id}: architectureExemption declares no note`);
  }
  if (!EXEMPTION_ANCHORS.includes(exemption.anchor)) {
    fail(
      `${id}: architectureExemption.anchor ${JSON.stringify(exemption.anchor)} is not one of ` +
        `${EXEMPTION_ANCHORS.join(', ')}. An exemption is earned against a repository fact, not ` +
        `declared.`,
    );
    return false;
  }

  if (exemption.anchor === 'base-provenance') {
    if (provenance.handoffSource !== root) {
      fail(
        `${id}: claims the base-provenance exemption, but handoff-provenance.json names ` +
          `${JSON.stringify(provenance.handoffSource)} as handoffSource, not ${root}.`,
      );
      return false;
    }
    return true;
  }
  if (exemption.anchor === 'controlling-security') {
    if (ANCHORED_LAYER_ROLES[root] !== 'controlling') {
      fail(
        `${id}: claims the controlling-security exemption, but ${root} is not anchored as the ` +
          `controlling layer in scripts/lib/governance-layers.mjs.`,
      );
      return false;
    }
    return true;
  }
  // accepted-network-decision
  const citing = acceptedDecisionsCiting(root);
  if (citing.length === 0) {
    fail(
      `${id}: claims the accepted-network-decision exemption, but no Accepted record under ` +
        `docs/decisions/ cites ${root}. That exemption is measured, not declared.`,
    );
    return false;
  }
  notes.push(`${id}: exemption anchored by ${citing.length} accepted decision record(s)`);
  return true;
}

const governed = [];
const exempted = [];

for (const layer of layers) {
  if (!roots.has(layer.root) || roots.get(layer.root) !== layer.id) continue;
  const hasBinding = layer.architecture !== undefined && layer.architecture !== null;
  const claimsExemption =
    layer.architectureExemption !== undefined && layer.architectureExemption !== null;

  if (hasBinding && claimsExemption) {
    fail(
      `${layer.id}: declares both an \`architecture\` binding and an \`architectureExemption\`. ` +
        `It is one or the other.`,
    );
    continue;
  }

  if (isGovernedArchitectureLayer(layer)) {
    if (!hasBinding) {
      fail(
        `${layer.id}: is an additive-subordinate package under docs/production-handoff/ and ` +
          `carries no \`architecture\` block and no verified exemption. Every governed ` +
          `architecture package must be bound to the authority that governs it.`,
      );
      continue;
    }
    governed.push(layer);
    continue;
  }

  // Not in the class. It must NOT carry a binding — otherwise the base or controlling layers could
  // be reclassified as architecture packages and measured by the weaker, design-only ladder.
  if (hasBinding) {
    fail(
      `${layer.id}: is not a governed architecture package (role "${layer.role}"${
        claimsExemption ? ', exempt' : ''
      }) and must not carry an \`architecture\` block. Its authority is not established by this ` +
        `registry.`,
    );
    continue;
  }
  if (!claimsExemption) {
    fail(`${layer.id}: carries neither an \`architecture\` block nor an \`architectureExemption\``);
    continue;
  }
  if (verifyExemption(layer)) exempted.push(layer);
}

for (const root of Object.keys(KNOWN_UNRESOLVED_AUTHORITY_BY_ROOT)) {
  if (!roots.has(root)) {
    fail(
      `scripts/lib/governance-layers.mjs records known unresolved authority for ${root}, but ` +
        `that package root is not declared in governance-layers.json. Known-open authority cannot ` +
        `be erased by moving or removing the registry record.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 4. Authority index — two sources, source-qualified, collisions declared.
// ---------------------------------------------------------------------------
const {
  index: authorityIndex,
  counts: authorityCounts,
  errors: indexErrors,
} = buildAuthorityIndex();
for (const e of indexErrors) fail(e);
if (authorityIndex.size === 0) {
  fail('the decision index is empty — no authority was resolvable');
  report();
}
for (const [source, spec] of Object.entries(AUTHORITY_SOURCES)) {
  if ((authorityCounts[source] ?? 0) === 0) {
    fail(
      `${spec.dir}/ contributed no decision records — that authority source was not read. The ` +
        `first AWE-0 candidate reported "ADR relations verified: 26" while one of its two declared ` +
        `authority sources contributed exactly zero records and nothing said so.`,
    );
  }
}

// Declared counts, in the `expectedCount` idiom of check-egress-allowlist.mjs: a new collision
// between the two numbering spaces becomes a reviewed two-line diff rather than a silent widening.
const sourceExpectations = governance.authoritySources;
if (!sourceExpectations || typeof sourceExpectations !== 'object') {
  fail('architectureGovernance.authoritySources is missing');
} else {
  for (const [source, spec] of Object.entries(AUTHORITY_SOURCES)) {
    const expected = sourceExpectations[source]?.expectedRecords;
    if (!Number.isInteger(expected)) {
      fail(`architectureGovernance.authoritySources.${source}.expectedRecords must be an integer`);
    } else if (expected !== authorityCounts[source]) {
      fail(
        `${spec.dir}/ holds ${authorityCounts[source]} citable records, expected ${expected}. ` +
          `Update both in the same change, deliberately.`,
      );
    }
  }
  const adrNumbers = new Set(
    [...authorityIndex.values()].filter((r) => r.source === 'adr').map((r) => r.id.slice(4)),
  );
  const colliding = [...authorityIndex.values()].filter(
    (r) => r.source === 'network-decision' && adrNumbers.has(r.id.slice(5)),
  ).length;
  if (!Number.isInteger(sourceExpectations.expectedCollidingNumbers)) {
    fail('architectureGovernance.authoritySources.expectedCollidingNumbers must be an integer');
  } else if (sourceExpectations.expectedCollidingNumbers !== colliding) {
    fail(
      `${colliding} four-digit numbers exist in both authority sources, expected ` +
        `${sourceExpectations.expectedCollidingNumbers}. A bare id is ambiguous across exactly ` +
        `these; update both in the same change, deliberately.`,
    );
  }
  notes.push(`ambiguous four-digit numbers across authority sources: ${colliding}`);
}

// ---------------------------------------------------------------------------
// 5. Module and Horizon authority — read, never restated.
// ---------------------------------------------------------------------------
const scope = parse(read('config/scope/module_states.yaml'));
const authorizedHorizon = scope.horizon_authorized;
if (!Number.isInteger(authorizedHorizon)) {
  fail('config/scope/module_states.yaml declares no integer horizon_authorized');
  report();
}
const declaredHorizons = Object.values(scope.modules ?? {})
  .map((m) => m?.horizon ?? m?.earliest_horizon)
  .filter(Number.isInteger);
const highestDeclaredHorizon = declaredHorizons.length > 0 ? Math.max(...declaredHorizons) : 0;

/**
 * Implementable means the module's STATE permits production code today, computed from the scope
 * registry's own `states` table rather than restated here. `implementation_allowed: false` is the
 * explicit gate; `production_code_allowed: false` is how INTERFACE_AND_SIMULATION_ONLY says the
 * same thing. Either one closes the door.
 */
function stateIsImplementable(stateName) {
  const s = scope.states?.[stateName];
  if (!s) return false;
  if (s.implementation_allowed === false) return false;
  return s.production_code_allowed === true;
}

const moduleHorizon = (entry) => entry?.horizon ?? entry?.earliest_horizon ?? null;

const ARCHITECTURE_FIELDS = Object.freeze(
  new Set([
    'governanceStatus',
    'implementationAuthority',
    'moduleScope',
    'maxHorizon',
    'adrRelations',
    'unresolvedAuthority',
  ]),
);
const ADR_RELATION_FIELDS = Object.freeze(
  new Set(['authority', 'authoritySource', 'relation', 'evidence']),
);
const UNRESOLVED_AUTHORITY_FIELDS = Object.freeze(new Set(['id', 'topic', 'note']));

// ---------------------------------------------------------------------------
// 6. The bindings themselves.
// ---------------------------------------------------------------------------
let relationCount = 0;
let unresolvedCount = 0;
let scopedModuleCount = 0;
const relationKinds = Object.create(null);
const modulesToPackages = new Map();

for (const layer of governed) {
  const id = layer.id;
  const a = layer.architecture;

  for (const key of Object.keys(a ?? {})) {
    if (!ARCHITECTURE_FIELDS.has(key)) {
      fail(
        `${id}: architecture field ${JSON.stringify(key)} is not in the allowed schema. ` +
          `Architecture registration is descriptive; new authority-like metadata requires an ` +
          `explicit validator contract.`,
      );
    }
  }

  if (a.governanceStatus !== 'accepted') {
    fail(
      `${id}: governanceStatus must be "accepted" for a package merged into main; found ` +
        `${JSON.stringify(a.governanceStatus)}.`,
    );
  }

  // F-13. There is no self-declared implementation rung. The ladder says a declaration in this file
  // can never reach "IMPLEMENTATION IS AUTHORIZED", so the field is a restatement of that, not a
  // choice — any other value, including "implementation", "implemented", "certified" or "live", is
  // a package trying to promote itself by documentation.
  if (a.implementationAuthority !== 'none') {
    fail(
      `${id}: implementationAuthority must be "none"; found ` +
        `${JSON.stringify(a.implementationAuthority)}. Architecture registration cannot authorize, ` +
        `implement or certify anything. Implementation authority is read from ` +
        `config/scope/module_states.yaml and signed gates, never declared here.`,
    );
  }

  // --- Authority traceability ---
  const relations = Array.isArray(a.adrRelations) ? a.adrRelations : null;
  const unresolved = Array.isArray(a.unresolvedAuthority) ? a.unresolvedAuthority : null;
  if (relations === null) fail(`${id}: architecture.adrRelations must be an array`);
  if (unresolved === null) fail(`${id}: architecture.unresolvedAuthority must be an array`);
  if (relations === null || unresolved === null) continue;

  if (relations.length === 0 && unresolved.length === 0) {
    fail(
      `${id}: declares neither an authority relation nor an unresolved item. A package with no ` +
        `accepted authority behind it must say so; silence reads as governed and is not.`,
    );
  }

  const seenRelations = new Set();
  for (const relation of relations) {
    if (!relation || typeof relation !== 'object') {
      fail(`${id}: malformed adrRelations entry: ${JSON.stringify(relation)}`);
      continue;
    }
    for (const key of Object.keys(relation)) {
      if (!ADR_RELATION_FIELDS.has(key)) {
        fail(`${id}: adrRelations entry field ${JSON.stringify(key)} is not in the allowed schema`);
      }
    }
    const { authority, authoritySource, relation: kind, evidence } = relation;

    // SOURCE-QUALIFIED, always. adr/ and docs/decisions/ reuse all eighteen numbers 0001-0018, so a
    // bare number is ambiguous between an Accepted repository ADR and a frequently Proposed network
    // decision — `ADR-0018` is the autonomy ceiling in one namespace and the N7 external transport
    // boundary in the other. The declared source and the id form must agree with each other AND
    // with where the id actually resolves.
    const spec = AUTHORITY_SOURCES[authoritySource];
    if (!spec) {
      fail(
        `${id}: adrRelations entry declares authoritySource ` +
          `${JSON.stringify(authoritySource)}; must be one of ${Object.keys(AUTHORITY_SOURCES).join(', ')}. ` +
          `An unqualified authority reference is ambiguous across the two numbering spaces and is ` +
          `refused rather than guessed.`,
      );
      continue;
    }
    if (typeof authority !== 'string' || !spec.idPattern.test(authority)) {
      fail(
        `${id}: authority ${JSON.stringify(authority)} is not a valid id for source ` +
          `"${authoritySource}". Use ADR-NNNN for adr/ and ADR-NNNNN (N-qualified) for ` +
          `docs/decisions/.`,
      );
      continue;
    }
    if (!AUTHORITY_RELATIONS.includes(kind)) {
      fail(
        `${id} -> ${authority}: relation ${JSON.stringify(kind)} is not one of ` +
          `${AUTHORITY_RELATIONS.join(', ')}. An unrecognised relation is an unenforceable one.`,
      );
      continue;
    }
    // Human-reviewed rationale. Its presence is checked; its truth is not, and the registry's
    // evidenceRule says so rather than implying otherwise.
    if (typeof evidence !== 'string' || evidence.trim().length === 0) {
      fail(
        `${id} -> ${authority}: relation declares no evidence. An unevidenced relation is a claim.`,
      );
    }
    const key = `${authority}:${kind}`;
    if (seenRelations.has(key)) {
      fail(`${id}: declares ${authority} as ${kind} more than once`);
      continue;
    }
    seenRelations.add(key);

    const record = authorityIndex.get(authority);
    if (!record) {
      fail(
        `${id} -> ${authority}: no such record in ${spec.dir}/. A package cannot be governed by an ` +
          `authority that does not exist.`,
      );
      continue;
    }
    if (record.source !== authoritySource) {
      fail(
        `${id} -> ${authority}: declared source "${authoritySource}" but the id resolves in ` +
          `${record.file} (${record.source}).`,
      );
      continue;
    }
    if (record.status === null) {
      fail(`${id} -> ${authority}: ${record.file} declares no parseable status`);
      continue;
    }
    if (!record.accepted) {
      fail(
        `${id} -> ${authority}: ${record.file} is "${record.status}", not Accepted. Only accepted ` +
          `authority may govern, constrain or be built beneath.`,
      );
      continue;
    }
    relationKinds[kind] = (relationKinds[kind] ?? 0) + 1;
    relationCount += 1;
  }

  const seenUnresolved = new Set();
  for (const item of unresolved) {
    if (!item || typeof item !== 'object') {
      fail(`${id}: malformed unresolvedAuthority entry: ${JSON.stringify(item)}`);
      continue;
    }
    for (const key of Object.keys(item)) {
      if (!UNRESOLVED_AUTHORITY_FIELDS.has(key)) {
        fail(
          `${id}: unresolvedAuthority entry "${item.id ?? '<unknown>'}" field ` +
            `${JSON.stringify(key)} is not in the allowed schema`,
        );
      }
    }
    if (typeof item.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.id)) {
      fail(
        `${id}: unresolvedAuthority entry has no lower-kebab-case "id": ${JSON.stringify(item.id)}`,
      );
      continue;
    }
    if (seenUnresolved.has(item.id)) {
      fail(`${id}: unresolvedAuthority lists ${item.id} more than once`);
      continue;
    }
    seenUnresolved.add(item.id);
    if (typeof item.topic !== 'string' || item.topic.trim().length === 0) {
      fail(`${id}: unresolvedAuthority entry "${item.id}" has no "topic"`);
    }
    if (typeof item.note !== 'string' || item.note.trim().length === 0) {
      fail(`${id}: unresolvedAuthority entry "${item.id}" has no "note"`);
    }
    // An unresolved item may not name an authority. That is the back door through which a gap
    // becomes authority by being registered, and it is closed here rather than by convention.
    for (const forbidden of ['adr', 'authority', 'authoritySource', 'relation']) {
      if (forbidden in item) {
        fail(
          `${id}: unresolvedAuthority entry "${item.id}" carries an "${forbidden}" field. ` +
            `Unresolved means no accepted authority exists; if one does, declare it in adrRelations.`,
        );
      }
    }
    unresolvedCount += 1;
  }

  // THE INVENTORY. `unresolvedAuthority` is the mechanism that keeps an unbacked architecture claim
  // visible, and a mechanism whose whole job is preserving a record cannot protect itself from
  // inside the record. Deleting all twelve entries left the first candidate's gates green.
  const known = KNOWN_UNRESOLVED_AUTHORITY_BY_ROOT[layer.root] ?? [];
  for (const knownId of known) {
    if (seenUnresolved.has(knownId)) continue;
    const resolution = RESOLVED_AUTHORITY[`${layer.root}:${knownId}`];
    if (!resolution) {
      fail(
        `${id} (${layer.root}): unresolvedAuthority no longer records "${knownId}", which ` +
          `scripts/lib/governance-layers.mjs knows to be open. An item may only disappear by being ` +
          `moved into RESOLVED_AUTHORITY with the accepted authority that closed it.`,
      );
      continue;
    }
    const closingAuthority = authorityIndex.get(resolution.resolvedBy);
    if (!closingAuthority) {
      fail(
        `${id}: "${knownId}" is recorded resolved by ${resolution.resolvedBy}, which does not exist`,
      );
    } else if (!closingAuthority.accepted) {
      fail(
        `${id}: "${knownId}" is recorded resolved by ${resolution.resolvedBy}, which is ` +
          `"${closingAuthority.status}", not Accepted.`,
      );
    }
  }

  // --- Module-state binding ---
  const moduleScope = Array.isArray(a.moduleScope) ? a.moduleScope : null;
  if (moduleScope === null || moduleScope.length === 0) {
    fail(`${id}: architecture.moduleScope must be a non-empty array of module ids`);
    continue;
  }

  const seenModules = new Set();
  let scopeMaxHorizon = 0;
  let gatedModules = 0;

  for (const moduleId of moduleScope) {
    // A duplicate is an error AND is skipped, so it cannot inflate the completeness counter that
    // proves this gate did something. Counting it twice would let a package pad the number.
    if (seenModules.has(moduleId)) {
      fail(`${id}: moduleScope lists ${moduleId} more than once`);
      continue;
    }
    seenModules.add(moduleId);

    const entry = scope.modules?.[moduleId];
    if (!entry) {
      fail(
        `${id}: moduleScope names ${moduleId}, which config/scope/module_states.yaml does not ` +
          `declare. Architecture scope must resolve against the module registry.`,
      );
      continue;
    }
    scopedModuleCount += 1;
    if (!modulesToPackages.has(moduleId)) modulesToPackages.set(moduleId, []);
    modulesToPackages.get(moduleId).push(id);

    const horizon = moduleHorizon(entry);
    if (!Number.isInteger(horizon)) {
      fail(`${id}: module ${moduleId} declares no horizon or earliest_horizon`);
      continue;
    }
    scopeMaxHorizon = Math.max(scopeMaxHorizon, horizon);
    if (!stateIsImplementable(entry.state) || horizon > authorizedHorizon) gatedModules += 1;
  }

  // --- Horizon binding ---
  if (!Number.isInteger(a.maxHorizon) || a.maxHorizon < 1) {
    fail(`${id}: architecture.maxHorizon must be an integer >= 1`);
    continue;
  }
  if (a.maxHorizon < scopeMaxHorizon) {
    fail(
      `${id}: declares maxHorizon=${a.maxHorizon} but its moduleScope reaches horizon ` +
        `${scopeMaxHorizon}. A package cannot under-declare the Horizon it designs for.`,
    );
  }
  // The other direction, which `maxHorizon: 99` walked straight through: a Horizon nothing in the
  // module registry reaches is not a conservative over-declaration, it is a number with no referent.
  if (a.maxHorizon > highestDeclaredHorizon) {
    fail(
      `${id}: declares maxHorizon=${a.maxHorizon}, above the highest horizon any module in ` +
        `config/scope/module_states.yaml reaches (${highestDeclaredHorizon}). A Horizon with no ` +
        `module behind it binds nothing.`,
    );
  }

  notes.push(
    `${id}: ${seenModules.size} modules in scope, ${gatedModules} gated or above ` +
      `horizon_authorized=${authorizedHorizon}; observed implementation authority: none`,
  );
}

// Relation-kind tally. Silently downgrading a governed-by to a weaker relation erases a real
// binding while leaving every other rule satisfied, so the split is declared and compared.
const expectedKinds = governance.expectedRelationCounts;
if (!expectedKinds || typeof expectedKinds !== 'object') {
  fail('architectureGovernance.expectedRelationCounts is missing');
} else {
  for (const kind of AUTHORITY_RELATIONS) {
    const expected = expectedKinds[kind];
    const actual = relationKinds[kind] ?? 0;
    if (!Number.isInteger(expected)) {
      fail(`architectureGovernance.expectedRelationCounts.${kind} must be an integer`);
    } else if (expected !== actual) {
      fail(
        `relation kind "${kind}" appears ${actual} times, expected ${expected}. Update both in ` +
          `the same change, deliberately.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 7. THE REVIEWED BINDING — the honest half of "content is not validated".
//
// No validator can decide whether an evidence string is a correct reading of an ADR, or whether a
// moduleScope is the right scope. The independent review proved the consequence: removing
// digital_brokerage from the brokerage package, repointing ADR-0018 to ADR-0001 with fabricated
// evidence, and replacing rationale with lorem ipsum all passed.
//
// What CAN be deterministic is that the binding a human reviewed is the binding still in the file.
// The digest covers the whole `architecture` block, so any edit to scope, relation, kind, evidence
// or Horizon invalidates it until a reviewer re-accepts it in scripts/lib/governance-layers.mjs.
// That is the same shape as handoff-provenance.json's `overrides`, which pin an authorised
// divergence by {adr, reason, sha256} rather than trying to prove the divergence correct.
// ---------------------------------------------------------------------------
for (const layer of governed) {
  const expected = REVIEWED_BINDING_DIGESTS[layer.id];
  const actual = bindingDigest(layer.architecture);
  if (!expected) {
    fail(
      `${layer.id}: no reviewed binding digest in scripts/lib/governance-layers.mjs. A binding ` +
        `nobody has accepted is not a reviewed binding. Add ${JSON.stringify(actual)} once the ` +
        `content has been reviewed.`,
    );
    continue;
  }
  if (expected !== actual) {
    fail(
      `${layer.id}: the architecture binding has changed since it was reviewed.\n` +
        `    reviewed ${expected}\n    actual   ${actual}\n` +
        `    Evidence, module scope, relation strength and Horizon are human-reviewed content. ` +
        `Re-review the block and update REVIEWED_BINDING_DIGESTS in the same change.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 8. Documentation is not runtime authorization.
//
// The rule that would be worthless as a promise. If a runtime module reads this registry,
// registering a document becomes a way to make a runtime check pass.
//
// WHAT THIS SCAN PROVES. Every JS/TS file under packages/ — every extension the repository can
// execute, every directory, not merely `src/` — contains no literal reference to the registry. The
// first candidate walked only `packages/*/src`, skipped any directory named `dist`, and matched
// `/\.(m?ts|m?js|tsx)$/`, so `packages/<pkg>/lib`, `src/dist/`, `.cjs` and `.cts` all walked past
// it — and `packages/<pkg>/lib` is not even gitignored, so it commits through an ordinary PR.
//
// WHAT IT DOES NOT PROVE. This is not general JavaScript dataflow analysis. It detects literal
// references, simple string concatenation and the reviewed component-join forms that produced
// `governance-layers.json` during rereview. More obfuscated construction remains outside the
// deterministic claim, so the MATERIAL control is still the ladder: the registry confers no
// authority, so a caller that read it would gain nothing. This raises the cost of introducing such
// a reader and makes it reviewable. It is not a sandbox.
// ---------------------------------------------------------------------------
function referencesGovernanceRegistry(source) {
  const collapsed = source.replace(/['"`+\s,]/g, '');
  if (/governance-layers(?:\.json)?/.test(source)) return true;
  if (/governance-layers(?:\.json)?/.test(collapsed)) return true;
  if (
    /['"`]governance['"`]\s*,\s*['"`]layers\.json['"`][\s\S]{0,240}\.join\(\s*['"`]-['"`]\s*\)/.test(
      source,
    )
  ) {
    return true;
  }
  if (/join\([^)]*['"`]governance['"`][^)]*['"`]-layers\.json['"`][^)]*\)/.test(source)) {
    return true;
  }
  return false;
}

const packagesDir = join(REPO_ROOT, 'packages');
let runtimeFilesScanned = 0;
if (existsSync(packagesDir)) {
  for (const pkg of readdirSync(packagesDir).sort()) {
    if (!statSync(join(packagesDir, pkg)).isDirectory()) continue;
    // The WHOLE package tree, not just src/. `walkSource` is the repository's existing collector and
    // already excludes node_modules; SOURCE_FILE_PATTERN is its single definition of an executable
    // extension, exported so this gate does not carry a fourth divergent copy.
    for (const file of walkSource(join(packagesDir, pkg), (f) => SOURCE_FILE_PATTERN.test(f))) {
      runtimeFilesScanned += 1;
      const source = readFileSync(file, 'utf8');
      if (referencesGovernanceRegistry(source)) {
        fail(
          `${relative(REPO_ROOT, file).split(sep).join('/')} references governance-layers.json. ` +
            `Runtime code must not read the architecture registry: registering a documentation ` +
            `package would then make a runtime gate pass.`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 9. Governed architecture must stay inside CI — structurally, not by substring.
//
// The first candidate asserted only that ci.yml CONTAINED the gate filenames. `run: true # node
// scripts/check-architecture-governance.mjs` satisfied that while the gate never ran, and so did a
// comment, an `echo`, the step's own `name:`, `if: false` and `continue-on-error: true`. The
// workflow is now parsed and its run scripts tokenized; `yaml` is already a direct dependency and
// scripts/validate-scope.mjs already parses YAML the same way.
// ---------------------------------------------------------------------------
const ciWiring = governance.ciWiring;
if (!ciWiring || typeof ciWiring !== 'object' || !Array.isArray(ciWiring.requiredGates)) {
  fail('architectureGovernance.ciWiring.requiredGates must be an array of validator paths');
} else if (!existsSync(WORKFLOW_FILE)) {
  fail(`${ciWiring.workflow ?? '.github/workflows/ci.yml'} is missing — nothing runs these gates`);
} else {
  if (!sameStringArray(ciWiring.requiredGates, ANCHORED_CI_REQUIRED_GATES)) {
    fail(
      `architectureGovernance.ciWiring.requiredGates must exactly match the anchored required ` +
        `gate set in scripts/lib/governance-layers.mjs: ${ANCHORED_CI_REQUIRED_GATES.join(', ')}`,
    );
  }
  if (ciWiring.expectedRequiredGates !== ANCHORED_CI_REQUIRED_GATES.length) {
    fail(
      `architectureGovernance.ciWiring.expectedRequiredGates must be ` +
        `${ANCHORED_CI_REQUIRED_GATES.length}, the anchored required-gate count`,
    );
  }
  if (ciWiring.requiredGates.length !== ciWiring.expectedRequiredGates) {
    fail(
      `architectureGovernance.ciWiring lists ${ciWiring.requiredGates.length} required gates but ` +
        `declares expectedRequiredGates=${ciWiring.expectedRequiredGates}.`,
    );
  }
  const { commands, steps, jobs, problems } = workflowRunCommands(
    readFileSync(WORKFLOW_FILE, 'utf8'),
  );
  for (const problem of problems) fail(`${ciWiring.workflow}: ${problem}`);
  if (steps === 0)
    fail(`${ciWiring.workflow}: no blocking run steps were found — the walk did nothing`);

  for (const gate of ANCHORED_CI_REQUIRED_GATES) {
    const invocation = commands.find((c) => invokes(c.argv, gate));
    if (!invocation) {
      fail(
        `${ciWiring.workflow} does not actually RUN ${gate}. It must appear as a command in a ` +
          `step's \`run:\` script — not in a comment, not inside an \`echo\`, not behind \`true\`, ` +
          `and not in a step that is conditional or non-blocking.`,
      );
    }
  }
  notes.push(`ci jobs walked: ${jobs}, blocking run steps: ${steps}, commands: ${commands.length}`);
}

// ---------------------------------------------------------------------------
// 9b. CCEP repository-control self-protection.
//
// CCEP validates its own policy and wiring, but that alone is circular. The repository's existing
// architecture governance anchor already protects required CI gates by a source-code constant and
// parsed workflow execution. CCEP is added to that gate inventory as repository governance, not as
// a production-handoff architecture layer, and its core control files are digest-pinned here.
// This is not infinite tamper resistance: changes to this anchor itself terminate at ordinary
// repository review, Git object identity and owner/reviewer trust.
// ---------------------------------------------------------------------------
for (const control of CCEP_CONTROL_SURFACE) {
  const path = join(REPO_ROOT, control.path);
  if (!existsSync(path)) {
    fail(`CCEP control surface is missing: ${control.path}`);
    continue;
  }
  const actual = sha256(path);
  if (actual !== control.sha256) {
    fail(
      `CCEP control surface changed: ${control.path}\n` +
        `    expected ${control.sha256}\n` +
        `    actual   ${actual}`,
    );
  }
}
notes.push(`ccep control files digest-pinned: ${CCEP_CONTROL_SURFACE.length}`);

// ---------------------------------------------------------------------------
// Report. Anti-vacuity: a run that examined nothing must not print PASS.
// ---------------------------------------------------------------------------
if (governed.length === 0)
  fail('no governed architecture packages were checked — the gate did nothing');
if (exempted.length === 0) fail('no layer exemptions were verified — the anchor check did nothing');
if (relationCount === 0)
  fail('no authority relations were verified — the traceability check did nothing');
if (scopedModuleCount === 0) fail('no module bindings were verified — the scope check did nothing');
if (runtimeFilesScanned === 0) {
  fail(
    'no runtime source files were scanned — the documentation/runtime separation check did nothing',
  );
}

const shared = [...modulesToPackages.entries()].filter(([, pkgs]) => pkgs.length > 1);

notes.push(`layers declared: ${layers.length}`);
notes.push(`governed architecture packages: ${governed.length} (derived, not enumerated)`);
notes.push(`layers exempt with a verified anchor: ${exempted.length}`);
notes.push(
  `authority records indexed: adr/ ${authorityCounts.adr}, docs/decisions/ ${authorityCounts['network-decision']}` +
    ` (+${authorityCounts.unkeyedDecisionRecords} non-ADR decision records, not citable)`,
);
notes.push(
  `authority relations verified: ${relationCount} ` +
    `(${AUTHORITY_RELATIONS.map((k) => `${k} ${relationKinds[k] ?? 0}`).join(', ')})`,
);
notes.push(
  `unresolved authority items recorded: ${unresolvedCount} (known open: ${Object.values(
    KNOWN_UNRESOLVED_AUTHORITY_BY_ROOT,
  ).reduce((n, v) => n + v.length, 0)}, resolved: ${Object.keys(RESOLVED_AUTHORITY).length})`,
);
notes.push(`module bindings verified: ${scopedModuleCount}`);
notes.push(
  `modules claimed by more than one package (incomparable, strictest-wins): ${shared.length}`,
);
notes.push(
  `horizon_authorized: ${authorizedHorizon}, highest module horizon: ${highestDeclaredHorizon}`,
);
notes.push(`runtime source files scanned: ${runtimeFilesScanned}`);
notes.push(`empty handoff directories skipped (not packages): ${emptyDirectories}`);

report();
