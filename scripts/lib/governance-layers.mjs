/**
 * The governance-layer registry, read once and shared — AWE-0.
 *
 * `governance-layers.json` is now read by two gates that ask different questions of it:
 *
 *   check-network-governance.mjs      does every declared layer still match its manifest?
 *   check-architecture-governance.mjs is every accepted architecture package BOUND to the
 *                                     repository's ADR, module-state and Horizon authority?
 *
 * Both need the same loader and the same manifest parsers. Two gates each carrying their own copy
 * of "how a layer is declared" is the duplicated-identity defect `check-egress-allowlist.mjs`
 * documents at its head: both lists individually valid, nothing forcing them to agree, and the
 * drift invisible until one of them is the only thing still looking. Only the POLICY differs.
 *
 * Two manifest formats exist in this repository and both are load-bearing:
 *
 *   sha256sums    `<64 hex><two spaces><path>` — v1.2, v1.3.0, v1.4.0, v1.8.1
 *   manifest-json `{"files":[{"path","sha256","bytes"}]}` — v1.5.0, FacilityOS, v1.6.0, v1.7.0,
 *                 v1.8.0
 *
 * The second format is why the five packages installed after v1.4.0 went unverified for so long:
 * the original validator parsed only the first and silently had nothing to say about the rest.
 * Format is DECLARED per layer rather than inferred from the filename, so a package that renames
 * its manifest cannot quietly change which parser reads it.
 *
 * No network access. Pure reads.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const LAYERS_FILE = join(REPO_ROOT, 'governance-layers.json');
export const PROVENANCE_FILE = join(REPO_ROOT, 'handoff-provenance.json');
export const HANDOFF_TREE = join(REPO_ROOT, 'docs', 'production-handoff');

/** The layers whose authority predates AWE-0. They are exempt from the architecture bindings. */
export const FOUNDING_LAYER_IDS = Object.freeze([
  'production-handoff',
  'security-privacy-resilience',
  'network-architecture',
]);

/**
 * The accepted architecture packages AWE-0 binds.
 *
 * Named explicitly rather than derived, for the same reason `check-network-governance.mjs` names
 * its three required layers: a validator that passes because somebody deleted a registry entry
 * would be worse than no validator.
 */
export const GOVERNED_ARCHITECTURE_LAYER_IDS = Object.freeze([
  'enterprise-agent-operations',
  'facilityos-enterprise-agent-operations',
  'brokerage-enterprise-agent-operations',
  'agentic-logistics-network-coherence',
  'agent-workforce-engineering-certification',
  'revenueos-commercial-capability-architecture',
]);

export const MANIFEST_FORMATS = Object.freeze(['sha256sums', 'manifest-json']);
export const LAYER_ROLES = Object.freeze(['base', 'controlling', 'additive-subordinate']);

/**
 * How an accepted package relates to accepted ADR authority.
 *
 * `unresolved` is deliberately NOT a member. An architecture claim with no accepted ADR behind it
 * is recorded in a separate `unresolvedAuthority` array that cannot name an ADR at all, so a gap
 * cannot be dressed up as a relation and become authoritative by being registered.
 */
export const ADR_RELATIONS = Object.freeze([
  'governed-by', // the ADR rules the matter; where they differ the ADR wins
  'constrained-by', // the ADR bounds the package without deciding its content
  'additive-beneath', // the package adds detail under the ADR and does not touch its decision
]);

export function sha256(absolutePath) {
  return createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
}

/** Every file under `dir`, repo-relative to it, POSIX-separated, sorted. */
export function walk(dir, base = dir, found = []) {
  for (const entry of readdirSync(dir).sort()) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, base, found);
    else found.push(relative(base, abs).split(sep).join('/'));
  }
  return found;
}

/**
 * Read and JSON-parse the registry.
 *
 * Returns `{ registry }` or `{ error }`. A missing or unparseable registry is fatal for every
 * caller, but each gate prints its own banner, so the decision to exit stays with the gate.
 */
export function loadRegistry() {
  if (!existsSync(LAYERS_FILE)) {
    return { error: 'governance-layers.json is missing. It declares the controlling layers.' };
  }
  try {
    return { registry: JSON.parse(readFileSync(LAYERS_FILE, 'utf8')) };
  } catch (error) {
    return { error: `governance-layers.json is not valid JSON: ${error.message}` };
  }
}

/**
 * Parse a `sha256sum` manifest into `path -> hex`.
 *
 * The format is `<hex><two spaces><path>`, and the path may itself contain spaces, so the split is
 * on the first separator only rather than on whitespace generally. A line that does not parse is a
 * failure rather than something to skip: a manifest this check cannot read is a manifest it cannot
 * enforce, and silently ignoring the line would be the quiet pass this gate exists to prevent.
 */
export function parseSha256Sums(absolutePath, layerId, fail) {
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
    entries.set(path, { sha256: match[1], bytes: null });
  }
  return entries;
}

/**
 * Parse a JSON manifest into `path -> {sha256, bytes}`.
 *
 * `bytes` is carried because all five JSON manifests in this repository ship it and all five are
 * accurate. A size that disagrees with a matching hash is not possible by accident, so checking it
 * costs nothing and turns a hand-edited manifest entry into a second, independent failure.
 *
 * Unreadable JSON fails closed here rather than returning an empty map: an empty map would verify
 * nothing and, without the anti-vacuity floor downstream, would read as a clean package.
 */
export function parseJsonManifest(absolutePath, layerId, fail) {
  const entries = new Map();
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    fail(`${layerId}: manifest is not valid JSON: ${error.message}`);
    return entries;
  }
  if (!Array.isArray(manifest.files)) {
    fail(`${layerId}: manifest has no "files" array`);
    return entries;
  }
  for (const [index, file] of manifest.files.entries()) {
    if (!file || typeof file.path !== 'string' || file.path.length === 0) {
      fail(`${layerId}: manifest entry ${index} has no "path"`);
      continue;
    }
    if (typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256)) {
      fail(`${layerId}: manifest entry ${file.path} has no valid "sha256"`);
      continue;
    }
    const path = file.path.replace(/^\.\//, '');
    if (entries.has(path)) fail(`${layerId}: manifest lists ${path} more than once`);
    entries.set(path, {
      sha256: file.sha256,
      bytes: typeof file.bytes === 'number' ? file.bytes : null,
    });
  }
  return entries;
}

/** The declared manifest format's parser, or `null` if the format is not one this build knows. */
export function manifestParser(format) {
  if (format === 'sha256sums') return parseSha256Sums;
  if (format === 'manifest-json') return parseJsonManifest;
  return null;
}

/**
 * Directories under `docs/production-handoff/` that hold at least one file.
 *
 * An empty directory is not a package. Git does not track empty directories, so one can only be a
 * local working-tree residue of a branch switch — the two accepted audits both record exactly such
 * a residue — and treating it as an undeclared package would fail CI for a condition CI can never
 * see. The moment a file lands in one it becomes a package and must be declared, which is the
 * fail-closed half of the same rule.
 */
export function handoffPackageDirectories() {
  if (!existsSync(HANDOFF_TREE)) return [];
  return readdirSync(HANDOFF_TREE)
    .sort()
    .filter((entry) => statSync(join(HANDOFF_TREE, entry)).isDirectory())
    .map((entry) => ({
      name: entry,
      root: `docs/production-handoff/${entry}`,
      fileCount: walk(join(HANDOFF_TREE, entry)).length,
    }));
}
