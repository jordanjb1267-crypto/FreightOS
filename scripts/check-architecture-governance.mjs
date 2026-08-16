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
// config/scope/module_states.yaml (one incidental exception in a v1.7 combined file), and ZERO
// mentions of a Horizon outside v1.8.1. Substantive, internally coherent architecture, connected
// to the repository's controlling authority by nothing at all.
//
// THE BINDING CANNOT LIVE INSIDE THE PACKAGES. ADR-0014 and SR ruling 2 make an installed package
// immutable; both accepted audits verified all six byte-exact. Adding an ADR citation to a package
// document would break its own manifest. So the relation is declared in governance-layers.json —
// the hand-maintained registry that already exists for exactly this kind of reviewed governance
// act — and enforced here.
//
// WHAT REGISTRATION DOES NOT DO. It does not authorize implementation. The ladder in
// governance-layers.json `architectureGovernance.authorizationLadder` has five rungs and this file
// can only certify the second. §"runtime authority" below asserts that structurally: no file under
// packages/*/src/ may read the registry, so a documentation package cannot make a runtime gate
// pass by being registered.
//
// Fail-closed throughout: an unreadable registry, an unknown relation, an ADR that is not Accepted,
// a module the scope registry does not know, a Horizon above what is authorized, or a scan that
// covered nothing are all failures rather than silence.
//
// No network access. Deterministic output. Exit 0 = clean, 1 = fail.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';

import {
  ADR_RELATIONS,
  FOUNDING_LAYER_IDS,
  GOVERNED_ARCHITECTURE_LAYER_IDS,
  LAYER_ROLES,
  MANIFEST_FORMATS,
  REPO_ROOT,
  handoffPackageDirectories,
  loadRegistry,
} from './lib/governance-layers.mjs';

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
  console.log('ADR_TRACEABILITY=PASS');
  console.log('MODULE_STATE_BINDING=PASS');
  console.log('HORIZON_BINDING=PASS');
  console.log('PRECEDENCE=PASS');
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

if (layers.length === 0) {
  fail('governance-layers.json declares no layers');
  report();
}

const governance = registry.architectureGovernance;
if (!governance || typeof governance !== 'object') {
  fail(
    'governance-layers.json has no `architectureGovernance` block. It carries the authorization ' +
      'ladder, the precedence rule and the expected package count, and without it this gate has ' +
      'no policy to enforce.',
  );
  report();
}
for (const field of ['authorizationLadder', 'precedenceRule', 'runtimeAuthorityRule']) {
  const value = governance[field];
  const present = Array.isArray(value)
    ? value.length > 0
    : typeof value === 'string' && value.length > 0;
  if (!present) fail(`architectureGovernance.${field} is missing or empty`);
}
if (typeof governance.expectedGovernedPackages !== 'number') {
  fail(
    'architectureGovernance.expectedGovernedPackages must be a number. It exists so that dropping ' +
      'a governed package from this registry is TWO lines in a diff rather than one.',
  );
  report();
}

// ---------------------------------------------------------------------------
// 1. Package identity — unique, resolvable, and matching what is on disk.
// ---------------------------------------------------------------------------
const byId = new Map();
const roots = new Map();
const precedences = new Map();

for (const layer of layers) {
  const { id, version, root, role, precedence, integrityFile, integrityFormat } = layer;

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

  // The directory name must carry the declared version. This is what catches a layer entry left
  // pointing at v1.7.0 after its root was moved to a v1.7.1 directory — a path/version drift that
  // every hash in the manifest would happily agree with.
  if (typeof version === 'string' && !root.split('/').pop().includes(version)) {
    fail(`${id}: declared version ${version} does not appear in the root directory name ${root}`);
  }

  if (!LAYER_ROLES.includes(role)) {
    fail(`${id}: role ${JSON.stringify(role)} is not one of ${LAYER_ROLES.join(', ')}`);
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

  if (!Number.isInteger(precedence) || precedence < 1) {
    fail(`${id}: precedence must be a positive integer`);
    continue;
  }
  if (precedences.has(precedence)) {
    fail(
      `ambiguous precedence: ${precedences.get(precedence)} and ${id} both declare precedence ` +
        `${precedence}. Two layers at the same rank cannot be ordered, so nothing can answer ` +
        `which one applies.`,
    );
  }
  precedences.set(precedence, id);
}

// A dense 1..N ordering. A gap means a layer was removed without renumbering, and a reader cannot
// tell that from a layer that was never there.
const ranks = [...precedences.keys()].sort((a, b) => a - b);
for (const [index, rank] of ranks.entries()) {
  if (rank !== index + 1) {
    fail(
      `precedence values must be dense 1..${ranks.length}; found ${ranks.join(', ')}. ` +
        `A gap hides whether a layer was removed or never declared.`,
    );
    break;
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
// 3. Which layers carry architecture bindings, and which may not.
// ---------------------------------------------------------------------------
const governed = layers.filter((l) => l.architecture !== undefined && l.architecture !== null);
const governedIds = new Set(governed.map((l) => l.id));

for (const id of GOVERNED_ARCHITECTURE_LAYER_IDS) {
  if (!governedIds.has(id)) {
    fail(
      `${id} carries no \`architecture\` block. It is one of the accepted architecture packages ` +
        `AWE-0 binds; removing its block would return it to the unbound state AWE-0 closed.`,
    );
  }
}
// The founding layers must NOT acquire one. Their authority predates AWE-0 and comes from the base
// sha256sum gate, the controlling security role and the accepted docs/decisions/ N-series. Letting
// one be reclassified as an architecture package is how the stricter rules get dodged.
for (const id of FOUNDING_LAYER_IDS) {
  if (governedIds.has(id)) {
    fail(
      `${id} must not carry an \`architecture\` block. Its authority predates AWE-0 and is not ` +
        `established by this registry.`,
    );
  }
}
if (governed.length !== governance.expectedGovernedPackages) {
  fail(
    `architectureGovernance.expectedGovernedPackages is ${governance.expectedGovernedPackages} ` +
      `but ${governed.length} layers carry an \`architecture\` block.`,
  );
}

// ---------------------------------------------------------------------------
// 4. Precedence — a subordinate layer may never outrank a controlling one.
// ---------------------------------------------------------------------------
const strongest = layers
  .filter((l) => l.role === 'base' || l.role === 'controlling')
  .map((l) => l.precedence)
  .filter(Number.isInteger);
const weakestControlling = strongest.length > 0 ? Math.max(...strongest) : 0;

for (const layer of layers) {
  if (layer.role !== 'additive-subordinate') continue;
  if (Number.isInteger(layer.precedence) && layer.precedence <= weakestControlling) {
    fail(
      `${layer.id} is additive-subordinate at precedence ${layer.precedence}, at or above the ` +
        `controlling layers (precedence <= ${weakestControlling}). No layer below may be weakened ` +
        `to simplify a layer above.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 5. Accepted ADR authority — the index this repository actually has.
// ---------------------------------------------------------------------------
/**
 * Two header shapes exist in adr/ and both are load-bearing:
 *
 *   **Status:** Accepted (owner ruling, Phase 0)      — 0001-0010, 0014-0027
 *   ## Status\n\nAccepted.                            — 0011, 0012, 0013
 *
 * Reading only the first would silently treat three accepted ADRs as unaccepted, and reading
 * neither would let any string through. Anything that matches no shape is reported as unknown
 * rather than assumed Accepted.
 */
function adrStatus(text) {
  const inline = /^\*\*Status:\*\*\s*(.+)$/m.exec(text);
  if (inline) return inline[1].trim();
  const sectioned = /^##\s+Status\s*\n+([^\n]+)/m.exec(text);
  if (sectioned) return sectioned[1].trim();
  return null;
}

const adrIndex = new Map();
const adrDir = join(REPO_ROOT, 'adr');
if (!existsSync(adrDir)) {
  fail('adr/ is missing — there is no accepted decision record to trace packages to');
  report();
}
for (const file of readdirSync(adrDir).sort()) {
  const match = /^(\d{4})-.*\.md$/.exec(file);
  if (!match) continue;
  const status = adrStatus(readFileSync(join(adrDir, file), 'utf8'));
  adrIndex.set(`ADR-${match[1]}`, { file: `adr/${file}`, status });
}
if (adrIndex.size === 0) {
  fail('adr/ contains no NNNN-*.md decision records — the ADR index is empty');
  report();
}

// ---------------------------------------------------------------------------
// 6. Module and Horizon authority — read, never restated.
// ---------------------------------------------------------------------------
const scope = parse(read('config/scope/module_states.yaml'));
const authorizedHorizon = scope.horizon_authorized;
if (!Number.isInteger(authorizedHorizon)) {
  fail('config/scope/module_states.yaml declares no integer horizon_authorized');
  report();
}

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

function moduleHorizon(entry) {
  return entry?.horizon ?? entry?.earliest_horizon ?? null;
}

// ---------------------------------------------------------------------------
// 7. The bindings themselves.
// ---------------------------------------------------------------------------
let relationCount = 0;
let unresolvedCount = 0;
let scopedModuleCount = 0;

for (const layer of governed) {
  const id = layer.id;
  const a = layer.architecture;

  if (a.governanceStatus !== 'accepted') {
    fail(
      `${id}: governanceStatus must be "accepted" for a package merged into main; found ` +
        `${JSON.stringify(a.governanceStatus)}.`,
    );
  }
  if (a.authorizes !== 'design-only' && a.authorizes !== 'implementation') {
    fail(
      `${id}: authorizes must be "design-only" or "implementation"; found ${JSON.stringify(a.authorizes)}`,
    );
    continue;
  }

  // --- ADR traceability ---
  const relations = Array.isArray(a.adrRelations) ? a.adrRelations : null;
  const unresolved = Array.isArray(a.unresolvedAuthority) ? a.unresolvedAuthority : null;
  if (relations === null) fail(`${id}: architecture.adrRelations must be an array`);
  if (unresolved === null) fail(`${id}: architecture.unresolvedAuthority must be an array`);
  if (relations === null || unresolved === null) continue;

  if (relations.length === 0 && unresolved.length === 0) {
    fail(
      `${id}: declares neither an ADR relation nor an unresolved item. A package with no accepted ` +
        `authority behind it must say so; silence reads as governed and is not.`,
    );
  }

  const seenRelations = new Set();
  for (const relation of relations) {
    if (!relation || typeof relation !== 'object') {
      fail(`${id}: malformed adrRelations entry: ${JSON.stringify(relation)}`);
      continue;
    }
    const { adr, relation: kind, evidence } = relation;
    if (typeof adr !== 'string' || !/^ADR-\d{4}$/.test(adr)) {
      fail(
        `${id}: adrRelations entry has no valid "adr" (expected ADR-NNNN): ${JSON.stringify(adr)}`,
      );
      continue;
    }
    if (!ADR_RELATIONS.includes(kind)) {
      fail(
        `${id} -> ${adr}: relation ${JSON.stringify(kind)} is not one of ${ADR_RELATIONS.join(', ')}. ` +
          `An unrecognised relation is an unenforceable one.`,
      );
      continue;
    }
    if (typeof evidence !== 'string' || evidence.trim().length === 0) {
      fail(`${id} -> ${adr}: relation declares no evidence. An unevidenced relation is a claim.`);
    }
    const key = `${adr}:${kind}`;
    if (seenRelations.has(key)) {
      fail(`${id}: declares ${adr} as ${kind} more than once`);
    }
    seenRelations.add(key);

    const record = adrIndex.get(adr);
    if (!record) {
      fail(
        `${id} -> ${adr}: no such decision record in adr/. A package cannot be governed by an ADR ` +
          `that does not exist.`,
      );
      continue;
    }
    if (record.status === null) {
      fail(`${id} -> ${adr}: ${record.file} declares no parseable status`);
      continue;
    }
    if (!/^accepted\b/i.test(record.status)) {
      fail(
        `${id} -> ${adr}: ${record.file} is "${record.status}", not Accepted. Only accepted ` +
          `authority may govern or constrain a package.`,
      );
    }
    relationCount += 1;
  }

  for (const item of unresolved) {
    if (!item || typeof item !== 'object') {
      fail(`${id}: malformed unresolvedAuthority entry: ${JSON.stringify(item)}`);
      continue;
    }
    if (typeof item.topic !== 'string' || item.topic.trim().length === 0) {
      fail(`${id}: unresolvedAuthority entry has no "topic"`);
    }
    if (typeof item.note !== 'string' || item.note.trim().length === 0) {
      fail(`${id}: unresolvedAuthority entry "${item.topic}" has no "note"`);
    }
    // An unresolved item may not name an ADR field. That is the back door through which a gap
    // becomes authority by being registered, and it is closed here rather than by convention.
    if ('adr' in item) {
      fail(
        `${id}: unresolvedAuthority entry "${item.topic}" carries an "adr" field. Unresolved means ` +
          `no accepted authority exists; if one does, declare it in adrRelations.`,
      );
    }
    unresolvedCount += 1;
  }

  // --- Module-state binding ---
  const moduleScope = Array.isArray(a.moduleScope) ? a.moduleScope : null;
  if (moduleScope === null || moduleScope.length === 0) {
    fail(`${id}: architecture.moduleScope must be a non-empty array of module ids`);
    continue;
  }

  const seenModules = new Set();
  let scopeMaxHorizon = 0;
  let contradicts = false;

  for (const moduleId of moduleScope) {
    if (seenModules.has(moduleId)) fail(`${id}: moduleScope lists ${moduleId} more than once`);
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

    const horizon = moduleHorizon(entry);
    if (!Number.isInteger(horizon)) {
      fail(`${id}: module ${moduleId} declares no horizon or earliest_horizon`);
      continue;
    }
    scopeMaxHorizon = Math.max(scopeMaxHorizon, horizon);

    const implementable = stateIsImplementable(entry.state);
    if (a.authorizes === 'implementation' && !implementable) {
      contradicts = true;
      fail(
        `${id}: declares authorizes="implementation" while its scope includes ${moduleId}, which ` +
          `is ${entry.state} and forbids implementation. Architecture may design ahead of a gated ` +
          `module; it may not imply permission for one. Declare design-only or promote the module ` +
          `through config/scope/module_states.yaml.`,
      );
    }
    if (a.authorizes === 'implementation' && horizon > authorizedHorizon) {
      contradicts = true;
      fail(
        `${id}: declares authorizes="implementation" while its scope includes ${moduleId} at ` +
          `horizon ${horizon}, above horizon_authorized=${authorizedHorizon}.`,
      );
    }
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
  if (a.maxHorizon > authorizedHorizon && a.authorizes !== 'design-only') {
    contradicts = true;
    fail(
      `${id}: reaches Horizon ${a.maxHorizon} above horizon_authorized=${authorizedHorizon} and ` +
        `is not declared design-only. Later-horizon architecture may exist as design; it is not ` +
        `current implementation authority.`,
    );
  }
  if (contradicts) continue;
}

// ---------------------------------------------------------------------------
// 8. Documentation is not runtime authorization.
//
// The one rule that would be worthless as a promise. If a runtime module ever reads this registry,
// registering a document becomes a way to make a runtime check pass — the exact confusion the
// authorization ladder exists to prevent.
// ---------------------------------------------------------------------------
function sourceFiles(dir) {
  if (!existsSync(dir)) return [];
  const found = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      found.push(...sourceFiles(abs));
    } else if (/\.(m?ts|m?js|tsx)$/.test(entry)) {
      found.push(abs);
    }
  }
  return found;
}

let runtimeFilesScanned = 0;
const packagesDir = join(REPO_ROOT, 'packages');
if (existsSync(packagesDir)) {
  for (const pkg of readdirSync(packagesDir)) {
    if (!statSync(join(packagesDir, pkg)).isDirectory()) continue;
    for (const file of sourceFiles(join(packagesDir, pkg, 'src'))) {
      runtimeFilesScanned += 1;
      const source = readFileSync(file, 'utf8');
      if (/governance-layers/.test(source)) {
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
// 9. Governed architecture must stay inside CI.
// ---------------------------------------------------------------------------
const WORKFLOW = '.github/workflows/ci.yml';
if (!existsSync(join(REPO_ROOT, WORKFLOW))) {
  fail(`${WORKFLOW} is missing — nothing runs these gates`);
} else {
  const workflow = read(WORKFLOW);
  for (const gate of ['check-network-governance.mjs', 'check-architecture-governance.mjs']) {
    if (!workflow.includes(gate)) {
      fail(
        `${WORKFLOW} does not run ${gate}. A governed package outside CI verification is an ` +
          `undeclared package with extra steps.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Report. Anti-vacuity: a run that examined nothing must not print PASS.
// ---------------------------------------------------------------------------
if (governed.length === 0)
  fail('no governed architecture packages were checked — the gate did nothing');
if (relationCount === 0)
  fail('no ADR relations were verified — the traceability check did nothing');
if (scopedModuleCount === 0) fail('no module bindings were verified — the scope check did nothing');
if (runtimeFilesScanned === 0) {
  fail(
    'no runtime source files were scanned — the documentation/runtime separation check did nothing',
  );
}

notes.push(`layers declared: ${layers.length}`);
notes.push(`governed architecture packages: ${governed.length}`);
notes.push(`ADR relations verified: ${relationCount}`);
notes.push(`unresolved authority items recorded: ${unresolvedCount}`);
notes.push(`module bindings verified: ${scopedModuleCount}`);
notes.push(`horizon_authorized: ${authorizedHorizon}`);
notes.push(`runtime source files scanned: ${runtimeFilesScanned}`);
notes.push(`empty handoff directories skipped (not packages): ${emptyDirectories}`);

report();
