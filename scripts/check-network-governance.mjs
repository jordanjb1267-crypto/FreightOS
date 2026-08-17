#!/usr/bin/env node
// CI gate: the layered governance packages must match their manifests exactly.
//
// The v1.4.0 network architecture package shipped with a MANIFEST.sha256 covering 63 artifacts and
// nothing verified it. The v1.3.0 security package was in the same position with 42. Both could be
// edited — a schema loosened, a prohibited-shortcut clause deleted, an acceptance gate softened —
// and no check in this repository would notice, while every downstream implementation PR would go
// on citing them as binding. `sha256sum -c` alone is not enough either: it verifies the files a
// manifest LISTS and says nothing about a file added beside them, so an unlisted extra artifact
// could be introduced and read as authoritative.
//
// Seven ways this fails, all of them real:
//   1. governance-layers.json missing or malformed -> the layer set itself is unverifiable.
//   2. A declared layer root or manifest is absent -> a controlling package vanished.
//   3. A manifest-listed file is missing          -> the package is incomplete.
//   4. A manifest-listed file changed             -> a binding document was edited in place.
//   5. A file exists that the manifest omits      -> unlisted content is being carried as if bound.
//   6. A manifest entry reaches outside its root  -> one package satisfying another's integrity.
//   7. A package verifies fewer artifacts than declared -> a layer hollowed out.
//
// AWE-0 WIDENED THE SET, NOT THE RULES. Six accepted architecture packages installed after v1.4.0
// were in exactly the position v1.3.0 and v1.4.0 were in before N0 — 567 files, cited as binding,
// verified by nothing. Five of them ship `MANIFEST.json` rather than `MANIFEST.sha256`, and that
// format difference is the whole reason they slipped through: this check parsed one format and had
// nothing to say about the other. Both parsers now live in scripts/lib/governance-layers.mjs and
// the format is declared per layer, so a package that renames its manifest cannot quietly change
// which parser reads it — or whether one reads it at all.
//
// WHAT THE INDEPENDENT REVIEW ADDED (rules 6 and 7, and the coverage rule below).
//
//   Rule 6 — a manifest entry is a path chosen by the package being verified, so it is untrusted
//   input to the gate verifying it. `contracts/../../v1.4.0-network-architecture/MANIFEST.sha256`
//   resolved outside its own package, hashed correctly, PASSED, and pushed the verified-artifact
//   count UP. Containment now lives in resolveManifestEntry().
//
//   Rule 7 — completeness was measured by one global sum, so emptying a single package's manifest
//   and deleting its files left the total high enough to look healthy and the gate printed PASS.
//   Each layer now declares how many artifacts it is expected to carry.
//
//   Coverage — the layer set was pinned to a frozen list of ids, so a seventh package could sit on
//   disk, unverified, with both gates green. The obligation now derives from position: anything
//   under docs/production-handoff/ holding files must be a declared, verified layer.
//
// WHAT THIS DOES NOT PROVE. Every manifest here is package-LOCAL: it is carried inside the package
// it describes. That makes an UNCOORDINATED edit loud — changing an artifact without changing the
// manifest fails, and so does changing the manifest without changing the artifact. It is NOT tamper
// resistance against a COORDINATED edit that updates both, because nothing outside the package
// pins the manifest itself. Only the base v1.2 layer has such an external anchor today
// (handoff-provenance.json plus CI's own `sha256sum -c`). That gap is recorded as F-07 in
// docs/governance/AWE_0_ARCHITECTURE_GOVERNANCE_WIRING.md and is deliberately left open: a real
// trust root is a separate architecture decision, and inventing a weak one here would be worse
// than naming the limit.
//
// It checks INTEGRITY only. Whether a registered architecture package is bound to accepted ADR,
// module-state and Horizon authority is a different question, asked by its sibling
// scripts/check-architecture-governance.mjs. Neither substitutes for the other.
//
// No network access. Deterministic output. Exit 0 = clean, 1 = fail.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  ANCHORED_LAYER_ROLES,
  PROVENANCE_FILE,
  REPO_ROOT,
  handoffPackageDirectories,
  loadRegistry,
  manifestParser,
  resolveManifestEntry,
  sha256,
  walk,
} from './lib/governance-layers.mjs';

const failures = [];
const fail = (message) => failures.push(message);

function checkLayer(layer) {
  const { id, root, integrityFile, integrityFormat, expectedArtifacts } = layer;
  const rootAbs = join(REPO_ROOT, root);
  if (!existsSync(rootAbs)) {
    fail(`${id}: declared root is missing: ${root}`);
    return 0;
  }
  const manifestAbs = join(rootAbs, integrityFile);
  if (!existsSync(manifestAbs)) {
    fail(`${id}: declared integrity file is missing: ${root}/${integrityFile}`);
    return 0;
  }

  const parse = manifestParser(integrityFormat);
  if (!parse) {
    // Fail closed. An unknown format is not "skip this layer" — it is a layer nothing verifies,
    // which is the exact condition this gate exists to end.
    fail(
      `${id}: unknown integrityFormat ${JSON.stringify(integrityFormat)}. ` +
        `Declare "sha256sums" or "manifest-json".`,
    );
    return 0;
  }

  const listed = parse(manifestAbs, id, fail);

  // PER-LAYER COMPLETENESS. The count is declared in the registry rather than computed from the
  // manifest, so widening or narrowing a package is TWO lines in a diff rather than one — the
  // device config/network/egress-allowlist.json already uses for `expectedCount`. A global total
  // cannot do this job: it stays comfortably high while an individual package is emptied.
  if (!Number.isInteger(expectedArtifacts) || expectedArtifacts < 1) {
    fail(
      `${id}: expectedArtifacts must be a positive integer. Without it, a hollowed manifest is ` +
        `indistinguishable from a small package.`,
    );
  } else if (listed.size !== expectedArtifacts) {
    fail(
      `${id}: manifest lists ${listed.size} artifacts, expected ${expectedArtifacts}. ` +
        `If the package legitimately changed, update expectedArtifacts in the same reviewed change.`,
    );
  }

  // The manifest never lists itself; everything else on disk must be accounted for. walk() reports
  // symlinks as entries rather than following them, so a link planted inside a package surfaces
  // here as unlisted content instead of silently enrolling another tree.
  const onDisk = new Set(walk(rootAbs).filter((p) => p !== integrityFile));

  for (const [path, expected] of listed) {
    const resolved = resolveManifestEntry(rootAbs, path);
    if (resolved.error) {
      fail(`${id}: ${resolved.error}`);
      continue;
    }
    const actual = sha256(resolved.abs);
    if (actual !== expected.sha256) {
      fail(
        `${id}: content changed: ${path}\n    expected ${expected.sha256}\n    actual   ${actual}`,
      );
    }
    // A size that disagrees with a matching hash cannot happen by accident. Checking it costs one
    // stat and turns a hand-edited manifest entry into a second, independent failure.
    if (expected.bytes !== null) {
      const actualBytes = statSync(resolved.abs).size;
      if (actualBytes !== expected.bytes) {
        fail(
          `${id}: size changed: ${path}\n    expected ${expected.bytes} bytes\n` +
            `    actual   ${actualBytes} bytes`,
        );
      }
    }
    onDisk.delete(path);
  }

  for (const extra of [...onDisk].sort()) {
    fail(`${id}: file present but absent from the manifest: ${extra}`);
  }
  return listed.size;
}

const loaded = loadRegistry();
if (loaded.error) {
  console.error('NETWORK_GOVERNANCE=FAIL');
  console.error(`- ${loaded.error}`);
  process.exit(1);
}
const layers = loaded.registry;

if (!Array.isArray(layers.layers) || layers.layers.length === 0) {
  fail('governance-layers.json declares no layers');
}
if (typeof layers.subordination !== 'string' || layers.subordination.length === 0) {
  fail('governance-layers.json declares no subordination rule');
}

const declaredByRoot = new Map((layers.layers ?? []).map((l) => [l.root, l]));

// Anti-vacuity, structurally. The founding layers are anchored to their roots in
// scripts/lib/governance-layers.mjs and cannot be dropped from the registry to make this pass.
for (const root of Object.keys(ANCHORED_LAYER_ROLES)) {
  if (!declaredByRoot.has(root)) {
    fail(`governance-layers.json omits an anchored governance layer: ${root}`);
  }
}

// COVERAGE. Anything under docs/production-handoff/ holding files is content this repository reads
// as binding; content nothing verifies must not be. An empty directory is not a package — Git
// cannot track one, so it can only be a local working-tree residue, and nothing inside is read.
let emptyDirectories = 0;
for (const directory of handoffPackageDirectories()) {
  if (directory.fileCount === 0) {
    emptyDirectories += 1;
    continue;
  }
  if (!declaredByRoot.has(directory.root)) {
    fail(
      `unverified governance package: ${directory.root} holds ${directory.fileCount} files and is ` +
        `declared in no layer, so no manifest covers it.`,
    );
  }
}

// The base layer's description here must still agree with the file that actually governs it.
const base = (layers.layers ?? []).find((l) => l.id === 'production-handoff');
if (base && existsSync(PROVENANCE_FILE)) {
  const provenance = JSON.parse(readFileSync(PROVENANCE_FILE, 'utf8'));
  if (provenance.handoffVersion !== base.version) {
    fail(
      `base layer version disagrees with handoff-provenance.json: ` +
        `governance-layers.json=${base.version} handoff-provenance.json=${provenance.handoffVersion}`,
    );
  }
  if (provenance.handoffSource !== base.root) {
    fail(
      `base layer root disagrees with handoff-provenance.json: ` +
        `governance-layers.json=${base.root} handoff-provenance.json=${provenance.handoffSource}`,
    );
  }
}

let verified = 0;
let layersVerified = 0;
for (const layer of layers.layers ?? []) {
  // The base layer is verified by CI's own sha256sum step and by the provenance checker.
  if (layer.id === 'production-handoff') continue;
  verified += checkLayer(layer);
  layersVerified += 1;
}

// A run that verified nothing must not report success. This remains as a COARSE signal only; the
// per-layer expectedArtifacts check above is what actually detects a hollowed package.
if (verified === 0) fail('no manifest entries were verified — the check did nothing');
if (layersVerified === 0) fail('no layers were verified — the check did nothing');

if (failures.length > 0) {
  console.error('NETWORK_GOVERNANCE=FAIL');
  for (const message of failures) console.error(`- ${message}`);
  console.error(
    '\nIf a change to a governance package is intended, it belongs in a reviewed handoff-version\n' +
      'change. Do not regenerate the manifest to make this pass.',
  );
  process.exit(1);
}

console.log('NETWORK_GOVERNANCE=PASS');
console.log('PACKAGE_COVERAGE=PASS');
console.log('MANIFEST_CONTAINMENT=PASS');
console.log('PER_LAYER_COMPLETENESS=PASS');
console.log(`  layers declared: ${layers.layers.length}`);
console.log(`  layers manifest-verified: ${layersVerified}`);
console.log(`  manifest-verified artifacts: ${verified}`);
console.log(`  empty handoff directories skipped (not packages): ${emptyDirectories}`);
process.exit(0);
