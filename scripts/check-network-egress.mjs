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

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const findings = [];
const report = (surface, file, line, detail) => findings.push({ surface, file, line, detail });

/** Repo-relative POSIX path, so output is identical on any checkout. */
const rel = (abs) => relative(REPO_ROOT, abs).split(sep).join('/');

function walk(dir, filter, found = []) {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir).sort()) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      // Test trees are excluded: they legitimately NAME these primitives in order to assert their
      // absence, and a gate that cannot tell a prohibition from its own statement is a gate that
      // has to be worked around.
      if (entry === 'test' || entry === '__tests__' || entry === 'node_modules') continue;
      walk(abs, filter, found);
    } else if (filter(entry)) found.push(abs);
  }
  return found;
}

/** Line number of an offset, 1-based, for output that points at something. */
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/**
 * Blank out comments and string/template literals, preserving offsets and newlines so reported
 * line numbers stay true. Replacing rather than deleting is what keeps `lineOf` honest.
 */
function stripTs(source) {
  let out = '';
  let i = 0;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (source[i] === "'" || source[i] === '"' || source[i] === '`') {
      const quote = source[i];
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === '\\') j += 2;
        else if (source[j] === quote) break;
        else j += 1;
      }
      const stop = Math.min(j + 1, source.length);
      out += quote + blank(source.slice(i + 1, stop - 1)) + (source[stop - 1] ?? '');
      i = stop;
    } else {
      out += source[i];
      i += 1;
    }
  }
  return out;
}

// The same, for SQL: line comments, block comments and single-quoted literals. Dollar-quoted
// bodies are NOT stripped — they are the executable text this gate exists to read.
function stripSql(source) {
  let out = '';
  let i = 0;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '--') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (source[i] === "'") {
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === "'" && source[j + 1] === "'") j += 2;
        else if (source[j] === "'") break;
        else j += 1;
      }
      const stop = Math.min(j + 1, source.length);
      out += "'" + blank(source.slice(i + 1, stop - 1)) + "'";
      i = stop;
    } else {
      out += source[i];
      i += 1;
    }
  }
  return out;
}

// ── Denylists ───────────────────────────────────────────────────────────────────────────────────

const NETWORK_MODULES = new Set([
  'http',
  'https',
  'net',
  'tls',
  'dgram',
  'node:http',
  'node:https',
  'node:net',
  'node:tls',
  'node:dgram',
  'undici',
  'node-fetch',
  'axios',
  'got',
  'superagent',
  'request',
  'ws',
]);

const BROKER_MODULES = new Set([
  'kafkajs',
  'kafka-node',
  'nats',
  'amqplib',
  'amqp-connection-manager',
  'mqtt',
  'redis',
  'ioredis',
  'bullmq',
  'bull',
  'pg-boss',
  'graphile-worker',
  'nsqjs',
  'pulsar-client',
  'aws-sdk',
  '@aws-sdk/client-sqs',
  '@aws-sdk/client-sns',
  '@aws-sdk/client-eventbridge',
  '@temporalio/client',
  '@temporalio/worker',
  '@temporalio/workflow',
  '@google-cloud/pubsub',
  '@azure/service-bus',
]);

const isDenied = (spec) =>
  NETWORK_MODULES.has(spec)
    ? 'network-capable module'
    : BROKER_MODULES.has(spec) || spec.startsWith('@temporalio/')
      ? 'broker/queue client'
      : null;

/**
 * Import, re-export, require and dynamic import — the only positions a specifier can run from.
 *
 * The clause between the keyword and `from` is `[^'";]*?` rather than `[\s\S]*?` so a match cannot
 * span statements. With the permissive form, an `export const …` early in a file paired with an
 * unrelated `from '…'` hundreds of lines later, reporting a real finding against a line that had
 * nothing to do with it — an import clause contains neither a quote nor a semicolon, so bounding on
 * those keeps every match inside one statement.
 */
const SPECIFIER_PATTERNS = [
  /\bimport\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bexport\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

const TS_CALL_PATTERNS = [
  [/\bfetch\s*\(/g, 'outbound HTTP: fetch()'],
  [/\bnew\s+WebSocket\s*\(/g, 'outbound socket: new WebSocket()'],
  [/\bnew\s+XMLHttpRequest\s*\(/g, 'outbound HTTP: new XMLHttpRequest()'],
  [/\bnavigator\s*\.\s*sendBeacon\s*\(/g, 'outbound HTTP: navigator.sendBeacon()'],
];

const SQL_PATTERNS = [
  [/\bdblink\w*\s*\(/gi, 'external database connection: dblink'],
  [/\bpostgres_fdw\b/gi, 'foreign data wrapper: postgres_fdw'],
  [/\bCREATE\s+SERVER\b/gi, 'foreign server definition'],
  [/\bCREATE\s+USER\s+MAPPING\b/gi, 'foreign server credential mapping'],
  [/\bCREATE\s+FOREIGN\s+TABLE\b/gi, 'foreign table'],
  [/\bCOPY\b[\s\S]{0,200}?\b(FROM|TO)\s+PROGRAM\b/gi, 'process execution: COPY … PROGRAM'],
  [/\bpg_read_file\s*\(/gi, 'filesystem read: pg_read_file()'],
  [/\bpg_read_binary_file\s*\(/gi, 'filesystem read: pg_read_binary_file()'],
  [/\bpg_ls_dir\s*\(/gi, 'filesystem read: pg_ls_dir()'],
  [/\bhttp_(get|post|put|patch|delete|head)\s*\(/gi, 'HTTP extension call'],
  [
    /\bCREATE\s+EXTENSION\s+(IF\s+NOT\s+EXISTS\s+)?"?(dblink|postgres_fdw|http|plsh|plpython\w*|plperlu)\b/gi,
    'external-capability extension',
  ],
];

/** Database-local signalling. Counted and reported; NOT external egress and NOT a failure. */
const SIGNALLING_PATTERNS = [
  [/\bpg_notify\s*\(/gi, 'pg_notify()'],
  [/\bNOTIFY\s+\w/gi, 'NOTIFY'],
  [/\bLISTEN\s+\w/gi, 'LISTEN'],
];

// ── Surface 1: runtime TypeScript ───────────────────────────────────────────────────────────────

const PACKAGES_DIR = join(REPO_ROOT, 'packages');
const tsFiles = existsSync(PACKAGES_DIR)
  ? readdirSync(PACKAGES_DIR)
      .sort()
      .flatMap((pkg) =>
        walk(join(PACKAGES_DIR, pkg, 'src'), (f) => /\.(ts|mts|cts|js|mjs)$/.test(f)),
      )
      .filter((f) => !/\.test\.[cm]?[tj]s$/.test(f))
  : [];

for (const file of tsFiles) {
  const raw = readFileSync(file, 'utf8');

  // Specifiers are read from the RAW text, because an import specifier is itself a string literal;
  // matching the import FORM rather than the bare string is what keeps a URL in prose from
  // registering.
  for (const pattern of SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    for (const m of raw.matchAll(pattern)) {
      const why = isDenied(m[1]);
      if (why) report('typescript', rel(file), lineOf(raw, m.index), `${why}: '${m[1]}'`);
    }
  }

  const code = stripTs(raw);
  for (const [pattern, label] of TS_CALL_PATTERNS) {
    pattern.lastIndex = 0;
    for (const m of code.matchAll(pattern))
      report('typescript', rel(file), lineOf(code, m.index), label);
  }
}

// ── Surface 2: executable SQL ───────────────────────────────────────────────────────────────────

const MIGRATIONS_DIR = join(REPO_ROOT, 'packages', 'database', 'migrations');
const sqlFiles = walk(MIGRATIONS_DIR, (f) => f.endsWith('.sql'));
let signalling = 0;

for (const file of sqlFiles) {
  const raw = readFileSync(file, 'utf8');
  const code = stripSql(raw);
  for (const [pattern, label] of SQL_PATTERNS) {
    pattern.lastIndex = 0;
    for (const m of code.matchAll(pattern)) report('sql', rel(file), lineOf(code, m.index), label);
  }
  for (const [pattern] of SIGNALLING_PATTERNS) {
    pattern.lastIndex = 0;
    signalling += [...code.matchAll(pattern)].length;
  }
}

// ── Surface 3: declared dependencies ────────────────────────────────────────────────────────────

const manifests = [
  join(REPO_ROOT, 'package.json'),
  ...(existsSync(PACKAGES_DIR)
    ? readdirSync(PACKAGES_DIR)
        .sort()
        .map((p) => join(PACKAGES_DIR, p, 'package.json'))
        .filter(existsSync)
    : []),
];

for (const file of manifests) {
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      const why = isDenied(name);
      if (why) report('dependency', rel(file), 0, `${why} declared in ${field}: '${name}'`);
    }
  }
}

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

console.log('NETWORK_EGRESS=PASS');
console.log(`  source files scanned: ${tsFiles.length}`);
console.log(`  migrations scanned: ${sqlFiles.length}`);
console.log(`  package manifests scanned: ${manifests.length}`);
console.log(`  database-local signalling occurrences (not egress): ${signalling}`);
process.exit(0);
