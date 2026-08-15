#!/usr/bin/env node
// CI gate: external network capability may exist ONLY at governed, enumerated locations.
//
// WHAT THIS IS, AND HOW IT DIFFERS FROM ITS SIBLING.
//
//   check-network-egress.mjs   asks:  does any egress primitive exist ANYWHERE?        (zero)
//   check-egress-allowlist.mjs asks:  does any exist OUTSIDE the governed manifest?    (bounded)
//
// Both read the SAME primitive inventory and the SAME scanners from
// `scripts/lib/network-primitives.mjs`. Two gates each carrying their own copy of "what counts as
// egress" would be the duplicated-identity defect this repository spent R-07…R-11 on: both lists
// individually valid, nothing forcing them to agree, and the drift invisible until the day one of
// them is the only thing still looking. Only the POLICY differs, and that difference is the point.
//
// WHY IT EXISTS NOW, WITH AN EMPTY ALLOWLIST. N7-A implements the transport control plane and no
// network primitive at all, so today this gate and its sibling prove the same thing. It ships early
// on purpose: a gate introduced alongside the first socket has its behaviour defined by that socket,
// and its first run is the change it was supposed to review. Landing it while the answer is still
// zero means the negative controls below are exercised against a known-good baseline.
//
// WHAT IT DOES NOT CLAIM. Where an approved module may CONNECT is a different question, governed by
// the SSRF control set (N7_THREAT_MODEL.md §5). This gate bounds only where a socket may EXIST.
// Neither substitutes for the other, and the limits inherited from the sibling gate — obfuscated or
// dynamically-constructed capability acquisition, capability reached transitively through a
// dependency's own code, anything a superuser could do interactively — apply here unchanged. This
// raises the cost of adding egress and makes it reviewable. It is not a sandbox.
//
// No network access. Deterministic output. Exit 0 = clean, 1 = fail.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  REPO_ROOT,
  collectManifests,
  collectSqlFiles,
  collectTsFiles,
  resolveScanRoot,
  scanManifest,
  scanSqlFile,
  scanTsFile,
} from './lib/network-primitives.mjs';

// N7B-G1. One resolved root, shared semantics with the zero-capability gate: default is the real
// repository, override fails closed, and EVERYTHING this gate reads — the governed manifest, the
// entries it resolves, the trees it scans — comes from the same root. A gate that scanned a
// fixture tree against the real manifest would be grading one thing by another's configuration.
const SCAN_ROOT = resolveScanRoot();

const MANIFEST_PATH = join(SCAN_ROOT, 'config', 'network', 'egress-allowlist.json');

const fail = (lines) => {
  console.error('NETWORK_EGRESS_ALLOWLIST=FAIL');
  for (const l of lines) console.error(l);
  process.exit(1);
};

// ── The manifest itself is the first thing audited ───────────────────────────────────────────────
//
// A gate that trusts its own configuration file is a gate with a hole shaped like that file.

if (!existsSync(MANIFEST_PATH)) {
  fail([
    '- config/network/egress-allowlist.json is missing.',
    '  The manifest is the record of which modules may hold external network capability.',
    '  Its absence is not "no egress approved" — it is "nobody is checking".',
  ]);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
} catch (error) {
  fail([`- config/network/egress-allowlist.json is not valid JSON: ${error.message}`]);
}

const modules = manifest.modules;
if (!Array.isArray(modules)) {
  fail(['- manifest.modules must be an array of exact repo-relative file paths.']);
}
if (typeof manifest.expectedCount !== 'number') {
  fail([
    '- manifest.expectedCount must be a number.',
    '  It exists so that widening the allowlist is TWO lines in a diff rather than one.',
  ]);
}

const problems = [];

// Exact paths only. A glob or a directory prefix would let a second adapter arrive unreviewed
// under an approval granted for the first.
for (const entry of modules) {
  if (typeof entry !== 'string' || entry.length === 0) {
    problems.push(`- manifest entry is not a non-empty string: ${JSON.stringify(entry)}`);
    continue;
  }
  if (entry.includes('*') || entry.includes('?') || entry.endsWith('/')) {
    problems.push(
      `- manifest entry '${entry}' is a pattern or a directory. Entries must be EXACT file paths, ` +
        'one line per file that may open a socket.',
    );
  }
  if (entry.startsWith('/') || entry.includes('..')) {
    problems.push(`- manifest entry '${entry}' must be a repo-relative path without '..'.`);
  }
}

const seen = new Set();
for (const entry of modules) {
  if (seen.has(entry)) problems.push(`- duplicate manifest entry: '${entry}'`);
  seen.add(entry);
}

if (modules.length !== manifest.expectedCount) {
  problems.push(
    `- manifest.modules has ${modules.length} entr(ies) but expectedCount is ` +
      `${manifest.expectedCount}. Update both in the same change, deliberately.`,
  );
}

for (const entry of modules) {
  if (typeof entry === 'string' && !existsSync(join(SCAN_ROOT, entry))) {
    problems.push(`- manifest entry '${entry}' does not resolve to a file that exists.`);
  }
}

if (problems.length > 0) fail(problems);

// ── Scan, then partition by the manifest ─────────────────────────────────────────────────────────

const allowed = new Set(modules);

const tsFiles = collectTsFiles(SCAN_ROOT);
const sqlFiles = collectSqlFiles(SCAN_ROOT);
const manifests = collectManifests(SCAN_ROOT);

// A run that scanned nothing must not report success — the failure mode this repository has already
// met once, in a governance check that walked an empty tree and printed PASS.
if (tsFiles.length === 0 || sqlFiles.length === 0 || manifests.length === 0) {
  fail([
    `- the scan covered nothing: ${tsFiles.length} source file(s), ${sqlFiles.length} migration(s), ` +
      `${manifests.length} manifest(s)`,
  ]);
}

const violations = [];
/** Which allowlisted files actually contain a primitive — used to catch stale entries. */
const exercised = new Set();

for (const file of tsFiles) {
  const found = scanTsFile(file, SCAN_ROOT);
  if (found.length === 0) continue;
  const relPath = found[0].file;
  if (allowed.has(relPath)) exercised.add(relPath);
  else violations.push(...found);
}

// SQL and dependency manifests are NEVER allowlistable.
//
// The database itself does not talk to the network — N7's egress lives in an application process,
// and no migration may change that. A dependency is a capability granted repository-wide, not to
// one file, so it cannot be bounded by a per-file allowlist.
for (const file of sqlFiles) violations.push(...scanSqlFile(file, SCAN_ROOT).findings);
for (const file of manifests) violations.push(...scanManifest(file, SCAN_ROOT));

const stale = modules.filter((m) => !exercised.has(m));

if (violations.length > 0 || stale.length > 0) {
  const lines = [];
  for (const v of violations) {
    lines.push(
      `- EGRESS_VIOLATION  ${v.file}${v.line ? `:${v.line}` : ''}  ${v.detail}`,
      v.surface === 'typescript'
        ? '    Not in config/network/egress-allowlist.json. External network access is permitted ' +
            'only\n    from an approved adapter boundary. If this is intended it needs an owner ' +
            'ruling and a\n    manifest entry — not a local exemption.'
        : `    ${v.surface} surface is never allowlistable. See the gate header.`,
    );
  }
  for (const s of stale) {
    lines.push(
      `- EGRESS_ALLOWLIST_STALE  ${s}`,
      '    Allowlisted but contains no egress primitive. Remove the entry: a standing permission\n' +
        '    nobody is using will be inherited by whatever moves into that path.',
    );
  }
  fail(lines);
}

if (SCAN_ROOT !== REPO_ROOT) console.log(`  scan root override: ${SCAN_ROOT}`);
console.log('NETWORK_EGRESS_ALLOWLIST=PASS');
console.log(`  approved egress modules: ${modules.length}`);
console.log(`  source files scanned: ${tsFiles.length}`);
console.log(`  migrations scanned: ${sqlFiles.length} (never allowlistable)`);
console.log(`  package manifests scanned: ${manifests.length} (never allowlistable)`);
console.log(`  egress primitives outside the allowlist: 0`);
process.exit(0);
