#!/usr/bin/env node
// CI gate: the network band must contain no external egress capability.
//
// WHAT THIS IS. A targeted ARCHITECTURAL guard, not exhaustive language-level network detection.
// It answers one question: does the runtime surface of this repository contain a primitive capable
// of publishing to, or fetching from, something outside this PostgreSQL database? It is deliberately
// narrow and its limits are stated below rather than implied.
//
// WHY IT EXISTS. N3 records canonical network truth and N4 records that transport is owed for it.
// Neither may publish. The disclosure machinery that would say WHO may receive an event —
// permitted recipients, consent grants, field-level projection, a governed `classification`
// vocabulary — does not exist yet (v1.4.0 `08_DATA_SOVEREIGNTY…`, ADR-N0013 open decision 2), so an
// egress primitive appearing anywhere in the network band would be an information-release path
// built before the policy that governs it. The security checklist states the rule this enforces:
// the repository has no external surface, and "the first one is an architectural event, not a
// detail."
//
// THE THREAT MODEL, precisely.
//
//   IN SCOPE — capability acquisition and invocation, in executable positions:
//     1. TypeScript/JavaScript outbound network primitives: `fetch(`, `new WebSocket(`,
//        `new XMLHttpRequest(`, `navigator.sendBeacon(`.
//     2. TypeScript/JavaScript imports of network-capable core modules and HTTP clients, matched in
//        IMPORT POSITION only — `node:http`, `node:https`, `node:net`, `node:tls`, `node:dgram`,
//        `undici`, `node-fetch`, `axios`, `got`, `superagent`, `request`, `ws`.
//     3. Broker / queue / job-runner client imports: kafkajs, nats, amqplib, mqtt, redis, ioredis,
//        bullmq, bull, pg-boss, graphile-worker, @temporalio/*, AWS SQS/SNS clients, pulsar, nsq.
//     4. The same broker/queue clients appearing as declared DEPENDENCIES in any package manifest.
//     5. PostgreSQL external-I/O primitives in migration SQL: dblink, postgres_fdw and its
//        CREATE SERVER / USER MAPPING / FOREIGN TABLE surface, `COPY … FROM|TO PROGRAM`,
//        `pg_read_file`/`pg_read_binary_file`/`pg_ls_dir`, HTTP-extension calls, and
//        `CREATE EXTENSION` of any of those.
//
//   REPORTED BUT NOT A FAILURE — database-local signalling:
//     `pg_notify`, `NOTIFY`, `LISTEN`. These cross no process boundary this database does not
//     already own and are not external publication. They are counted and printed so the
//     distinction is explicit rather than assumed; the purity of the N4 coupling function is
//     asserted separately, by test.
//
//   OUT OF SCOPE, stated so the guard is not mistaken for more than it is:
//     obfuscated or dynamically-constructed capability acquisition (`globalThis['fet' + 'ch']`),
//     transitive capability reached through a dependency's own code, anything a superuser could do
//     interactively, and anything outside the scanned surfaces below. This gate raises the cost of
//     adding egress and makes it reviewable; it is not a sandbox.
//
// WHAT IT SCANS. Executable surfaces only:
//     packages/<pkg>/src/**/*.ts          runtime TypeScript (test trees excluded)
//     packages/database/migrations/*.sql  executable SQL
//     package.json, packages/*/package.json   declared dependencies
//
// HOW IT AVOIDS FALSE POSITIVES. Comments and string literals are removed before call-shape
// matching, and module specifiers are read only from import/require/dynamic-import positions. A
// documentation URL, a durable schema `$id` such as https://schemas.rigreceipts.com/…, a RAISE
// message, a test description or a prose comment therefore cannot trip this gate — only a
// primitive in a position where it would actually run.
//
// No network access. Deterministic output. Exit 0 = clean, 1 = fail.

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

// N7B-G1. The scan root is resolved ONCE, defaults to the real repository, and fails closed on a
// bad override — see `resolveScanRoot`. Negative-control tests point it at a disposable copied
// tree so the real migration files are never mutated to prove the gate can say FAIL.
const SCAN_ROOT = resolveScanRoot();

// THE INVENTORY AND THE SCANNERS LIVE IN ONE PLACE — `scripts/lib/network-primitives.mjs`.
//
// N7 adds a second gate (`check-egress-allowlist.mjs`) that asks a different question of the same
// primitives: not "does any exist" but "does any exist OUTSIDE the governed manifest". Two gates
// each carrying their own copy of the primitive inventory is exactly the duplicated-identity defect
// R-07…R-11 were about — both lists individually valid, nothing forcing agreement, drift invisible
// until one of them is the only thing looking. So the inventory is shared and only the POLICY below
// is this file's own.
//
// This file's policy is unchanged and deliberately absolute: ZERO egress capability anywhere in the
// scanned surface. It does not consult the allowlist, and it must not learn to.

const findings = [];

const tsFiles = collectTsFiles(SCAN_ROOT);
for (const file of tsFiles) findings.push(...scanTsFile(file, SCAN_ROOT));

const sqlFiles = collectSqlFiles(SCAN_ROOT);
let signalling = 0;
for (const file of sqlFiles) {
  const r = scanSqlFile(file, SCAN_ROOT);
  findings.push(...r.findings);
  signalling += r.signalling;
}

const manifests = collectManifests(SCAN_ROOT);
for (const file of manifests) findings.push(...scanManifest(file, SCAN_ROOT));

// ── Verdict ─────────────────────────────────────────────────────────────────────────────────────

// A run that scanned nothing must not report success — the failure mode this repository has already
// met once, in a governance check that walked an empty tree and printed PASS.
if (tsFiles.length === 0 || sqlFiles.length === 0 || manifests.length === 0) {
  console.error('NETWORK_EGRESS=FAIL');
  console.error(
    `- the scan covered nothing: ${tsFiles.length} source file(s), ${sqlFiles.length} migration(s), ` +
      `${manifests.length} manifest(s)`,
  );
  process.exit(1);
}

if (findings.length > 0) {
  console.error('NETWORK_EGRESS=FAIL');
  console.error(
    `- ${findings.length} external egress primitive(s) found in the network band's runtime surface`,
  );
  for (const f of findings) {
    console.error(`  ${f.surface} ${f.file}${f.line ? `:${f.line}` : ''} — ${f.detail}`);
  }
  console.error(
    '\nN3 records network truth and N4 records that transport is owed for it. Neither publishes.\n' +
      'The disclosure policy that would govern who may receive an event does not exist yet, so an\n' +
      'egress path here would release information before the rule that permits it. If external\n' +
      'publication is intended, it belongs in the band that also brings the disclosure boundary —\n' +
      'not in a change that makes this gate pass.',
  );
  process.exit(1);
}

// An overridden root is named in the output so a fixture scan can never be mistaken for a
// repository scan in a log. The default prints nothing new — CI output is byte-identical.
if (SCAN_ROOT !== REPO_ROOT) console.log(`  scan root override: ${SCAN_ROOT}`);
console.log('NETWORK_EGRESS=PASS');
console.log(`  source files scanned: ${tsFiles.length}`);
console.log(`  migrations scanned: ${sqlFiles.length}`);
console.log(`  package manifests scanned: ${manifests.length}`);
console.log(`  database-local signalling occurrences (not egress): ${signalling}`);
process.exit(0);
