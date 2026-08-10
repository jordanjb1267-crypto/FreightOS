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
// The base v1.2 layer is deliberately NOT re-verified here: CI already runs `sha256sum -c
// SHA256SUMS.txt` against it and scripts/check-handoff-provenance.mjs covers its generated copies.
// This checks the layers nothing else does, and cross-checks that the base layer declared here
// still agrees with handoff-provenance.json so the two descriptions cannot drift apart.
//
// No network access. Deterministic output. Exit 0 = clean, 1 = fail.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const LAYERS_FILE = join(REPO_ROOT, 'governance-layers.json');
const PROVENANCE_FILE = join(REPO_ROOT, 'handoff-provenance.json');

const failures = [];
const fail = (message) => failures.push(message);

function sha256(absolutePath) {
  return createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
}

/** Every file under `dir`, repo-relative, POSIX-separated, sorted. */
function walk(dir, base = dir, found = []) {
  for (const entry of readdirSync(dir).sort()) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, base, found);
    else found.push(relative(base, abs).split(sep).join('/'));
  }
  return found;
}

/**
 * Parse a `sha256sum` manifest.
 *
 * The format is `<hex><two spaces><path>`, and the path may itself contain spaces, so the split is
 * on the first separator only rather than on whitespace generally. A line that does not parse is a
 * failure rather than something to skip: a manifest this check cannot read is a manifest it cannot
 * enforce, and silently ignoring the line would be the quiet pass this gate exists to prevent.
 */
function parseManifest(absolutePath, layerId) {
  const entries = new Map();
  const lines = readFileSync(absolutePath, 'utf8').split('\n');
  for (const [index, raw] of lines.entries()) {
    const line = raw.trimEnd();
    if (line.length === 0) continue;
    const match = /^([0-9a-f]{64}) [ *](.+)$/.exec(line);
    if (!match) {
      fail(`${layerId}: unparseable manifest line ${index + 1}: ${JSON.stringify(line)}`);
      continue;
    }
    const path = match[2].replace(/^\.\//, '');
    if (entries.has(path)) fail(`${layerId}: manifest lists ${path} more than once`);
    entries.set(path, match[1]);
  }
  return entries;
}

function checkLayer(layer) {
  const { id, root, integrityFile } = layer;
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

  const listed = parseManifest(manifestAbs, id);
  // The manifest never lists itself; everything else on disk must be accounted for.
  const onDisk = new Set(walk(rootAbs).filter((p) => p !== integrityFile));

  for (const [path, expected] of listed) {
    const abs = join(rootAbs, path);
    if (!existsSync(abs)) {
      fail(`${id}: manifest lists a file that is missing: ${path}`);
      continue;
    }
    const actual = sha256(abs);
    if (actual !== expected) {
      fail(`${id}: content changed: ${path}\n    expected ${expected}\n    actual   ${actual}`);
    }
    onDisk.delete(path);
  }

  for (const extra of [...onDisk].sort()) {
    fail(`${id}: file present but absent from the manifest: ${extra}`);
  }
  return listed.size;
}

if (!existsSync(LAYERS_FILE)) {
  console.error('NETWORK_GOVERNANCE=FAIL');
  console.error('- governance-layers.json is missing. It declares the controlling layers.');
  process.exit(1);
}

let layers;
try {
  layers = JSON.parse(readFileSync(LAYERS_FILE, 'utf8'));
} catch (error) {
  console.error('NETWORK_GOVERNANCE=FAIL');
  console.error(`- governance-layers.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

if (!Array.isArray(layers.layers) || layers.layers.length === 0) {
  fail('governance-layers.json declares no layers');
}
if (typeof layers.subordination !== 'string' || layers.subordination.length === 0) {
  fail('governance-layers.json declares no subordination rule');
}

// Anti-vacuity: the three controlling layers must all be declared. A validator that passes because
// somebody deleted a layer entry would be worse than no validator.
const REQUIRED_LAYERS = [
  'production-handoff',
  'security-privacy-resilience',
  'network-architecture',
];
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
