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
// Five ways this fails, all of them real:
//   1. governance-layers.json missing or malformed -> the layer set itself is unverifiable.
//   2. A declared layer root or manifest is absent -> a controlling package vanished.
//   3. A manifest-listed file is missing          -> the package is incomplete.
//   4. A manifest-listed file changed             -> a binding document was edited in place.
//   5. A file exists that the manifest omits      -> unlisted content is being carried as if bound.
//
// AWE-0 WIDENED THE SET, NOT THE RULES. Six accepted architecture packages installed after v1.4.0
// were in exactly the position v1.3.0 and v1.4.0 were in before N0 — 607 files, cited as binding,
// verified by nothing. Five of them ship `MANIFEST.json` rather than `MANIFEST.sha256`, and that
// format difference is the whole reason they slipped through: this check parsed one format and had
// nothing to say about the other. Both parsers now live in scripts/lib/governance-layers.mjs and
// the format is declared per layer, so a package that renames its manifest cannot quietly change
// which parser reads it — or whether one reads it at all.
//
// The base v1.2 layer is deliberately NOT re-verified here: CI already runs `sha256sum -c
// SHA256SUMS.txt` against it and scripts/check-handoff-provenance.mjs covers its generated copies.
// This checks the layers nothing else does, and cross-checks that the base layer declared here
// still agrees with handoff-provenance.json so the two descriptions cannot drift apart.
//
// It checks INTEGRITY only. Whether a registered architecture package is bound to accepted ADR,
// module-state and Horizon authority is a different question, asked by its sibling
// scripts/check-architecture-governance.mjs. Neither substitutes for the other.
//
// No network access. Deterministic output. Exit 0 = clean, 1 = fail.

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  FOUNDING_LAYER_IDS,
  GOVERNED_ARCHITECTURE_LAYER_IDS,
  PROVENANCE_FILE,
  REPO_ROOT,
  loadRegistry,
  manifestParser,
  sha256,
  walk,
} from './lib/governance-layers.mjs';
import { readFileSync } from 'node:fs';

const failures = [];
const fail = (message) => failures.push(message);

function checkLayer(layer) {
  const { id, root, integrityFile, integrityFormat } = layer;
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
  // The manifest never lists itself; everything else on disk must be accounted for.
  const onDisk = new Set(walk(rootAbs).filter((p) => p !== integrityFile));

  for (const [path, expected] of listed) {
    const abs = join(rootAbs, path);
    if (!existsSync(abs)) {
      fail(`${id}: manifest lists a file that is missing: ${path}`);
      continue;
    }
    const actual = sha256(abs);
    if (actual !== expected.sha256) {
      fail(
        `${id}: content changed: ${path}\n    expected ${expected.sha256}\n    actual   ${actual}`,
      );
    }
    // A size that disagrees with a matching hash cannot happen by accident. Checking it costs one
    // stat and turns a hand-edited manifest entry into a second, independent failure.
    if (expected.bytes !== null) {
      const actualBytes = statSync(abs).size;
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

// Anti-vacuity: every controlling layer must be declared. A validator that passes because somebody
// deleted a layer entry would be worse than no validator. The three founding layers were required
// from N0; the six accepted architecture packages joined them at AWE-0 and are required on the
// same terms — dropping one would return it to the unverified state AWE-0 exists to end.
const REQUIRED_LAYERS = [...FOUNDING_LAYER_IDS, ...GOVERNED_ARCHITECTURE_LAYER_IDS];
const declared = new Set((layers.layers ?? []).map((l) => l.id));
for (const required of REQUIRED_LAYERS) {
  if (!declared.has(required)) fail(`governance-layers.json omits the required layer: ${required}`);
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
for (const layer of layers.layers ?? []) {
  // The base layer is verified by CI's own sha256sum step and by the provenance checker.
  if (layer.id === 'production-handoff') continue;
  verified += checkLayer(layer);
}

// A run that verified nothing must not report success.
if (verified === 0) fail('no manifest entries were verified — the check did nothing');

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
console.log(`  layers declared: ${layers.layers.length}`);
console.log(`  manifest-verified artifacts: ${verified}`);
process.exit(0);
