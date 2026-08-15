// The network-primitive inventory and the scanners that find it — ONE definition, two gates.
//
// WHY THIS MODULE EXISTS. N7 introduces a second egress gate: `check-network-egress.mjs` proves the
// repository contains NO egress capability, and `check-egress-allowlist.mjs` proves that any
// capability which later exists appears ONLY at governed, enumerated locations. Two gates that each
// carried their own copy of "what counts as an egress primitive" would be the duplicated-identity
// defect this repository spent R-07…R-11 on: both lists individually valid, nothing forcing them to
// agree, and the drift invisible until the day one of them is the only thing looking.
//
// So the inventory and the scanners live here, once, and both gates import them. What each gate
// keeps for itself is its POLICY — zero-anywhere versus allowed-only-here — because that is the part
// which legitimately differs.
//
// Every behavioural detail below is lifted unchanged from the original validator: comment and
// string-literal blanking that preserves offsets so reported line numbers stay true, import-position
// matching so a documentation URL cannot trip the gate, and the deliberate exclusion of test trees,
// which legitimately NAME these primitives in order to assert their absence.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Resolve the root the gates scan — N7B-G1.
 *
 * The default is, and must remain, the real repository: production and CI call the gates with no
 * override and get exactly the behaviour they always had. The override exists for ONE reason: the
 * negative-control tests used to prove the gates can say FAIL by planting primitives in REAL
 * repository files and restoring them afterwards, and that pattern is unsafe under concurrent
 * execution — another process loading the real migration directory during the window observes the
 * planted `COPY … TO PROGRAM`. With an explicit root, a test copies the scan surface into a
 * disposable temporary tree and mutates only the copy; the real tree stays byte-identical for the
 * entire run.
 *
 * The override FAILS CLOSED. A root that does not exist, is not a directory, or does not contain
 * the structure the scanners walk is refused loudly — a mistyped path must not degrade into a scan
 * of nothing, because a scan of nothing is the "walked an empty tree and printed PASS" failure this
 * repository has already met once. (The gates' own scanned-nothing guard would also catch it; this
 * refuses earlier and names the actual mistake.)
 */
export function resolveScanRoot(override = process.env.FREIGHTOS_EGRESS_SCAN_ROOT) {
  if (override === undefined || override === '') return REPO_ROOT;
  if (!existsSync(override) || !statSync(override).isDirectory()) {
    throw new Error(
      `FREIGHTOS_EGRESS_SCAN_ROOT='${override}' does not exist or is not a directory. ` +
        'Refusing to scan: a missing root must fail, not pass over nothing.',
    );
  }
  const migrations = join(override, 'packages', 'database', 'migrations');
  if (!existsSync(migrations) || !statSync(migrations).isDirectory()) {
    throw new Error(
      `FREIGHTOS_EGRESS_SCAN_ROOT='${override}' has no packages/database/migrations directory. ` +
        'The scan root must mirror the repository layout the gates walk.',
    );
  }
  return override;
}

/** Root-relative POSIX path, so output is identical on any checkout — and identical between a real
 * scan and a fixture scan of the same content, which is what lets one assertion serve both. */
export const rel = (abs, root = REPO_ROOT) => relative(root, abs).split(sep).join('/');

/** Line number of an offset, 1-based, for output that points at something. */
export const lineOf = (text, index) => text.slice(0, index).split('\n').length;

export function walk(dir, filter, found = []) {
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

/**
 * Blank out comments and string/template literals, preserving offsets and newlines so reported
 * line numbers stay true. Replacing rather than deleting is what keeps `lineOf` honest.
 */
export function stripTs(source) {
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
export function stripSql(source) {
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

// Every Node core module is listed in BOTH forms because `isDenied` is an exact `Set.has` — there
// is no specifier normalization, deliberately, since normalizing is where a scanner acquires the
// bug of deciding two different strings are the same thing. The cost is that a new core module
// must be added twice, and V-01 is what that cost looks like when it is paid only once.
export const NETWORK_MODULES = new Set([
  'http',
  'https',
  // V-01. `http2` was absent while `http` and `https` were present, so a runtime module could
  // `import { connect } from 'node:http2'` and open a full HTTP/2 client with both egress gates
  // reporting PASS — no dependency required, since it is core. The omission is instructive: the
  // inventory had been built by listing the modules one thinks of as "the HTTP client", and http2
  // is the same capability under a name that did not come to mind. Found by asking what the list
  // enumerates rather than how long it is.
  'http2',
  'net',
  'tls',
  'dgram',
  'node:http',
  'node:https',
  'node:http2',
  'node:net',
  'node:tls',
  'node:dgram',
  // NAME RESOLUTION. Added when the N7-A coverage review asked what the inventory actually
  // enumerates rather than how many entries it has. `dns` opens no connection, which is exactly why
  // it was missing and exactly why it belongs: DNS rebinding is the central concern of
  // N7_THREAT_MODEL §5, and a module that can resolve a name is a module doing the first half of an
  // egress. It is also the shape a "we only look things up" exemption would take.
  'dns',
  'dns/promises',
  'node:dns',
  'node:dns/promises',
  'undici',
  'node-fetch',
  'axios',
  'got',
  'superagent',
  'request',
  'ws',
  // PROCESS ESCAPE. `child_process` reaches `curl`, `wget`, `nc` and `psql`, so a scanner that
  // enumerates HTTP clients while ignoring it enumerates the polite ways to leave. The threat model
  // treats the boundary as "can a byte leave this process", not "which library carried it".
  //
  // Free to deny today: no runtime module under `packages/*/src` imports it. Test trees are already
  // outside the scanned surface, which is where the cluster-teardown proofs legitimately spawn
  // `pg_ctl`.
  'child_process',
  'node:child_process',
]);

export const BROKER_MODULES = new Set([
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

export const isDenied = (spec) =>
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
export const SPECIFIER_PATTERNS = [
  /\bimport\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bexport\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

export const TS_CALL_PATTERNS = [
  [/\bfetch\s*\(/g, 'outbound HTTP: fetch()'],
  [/\bnew\s+WebSocket\s*\(/g, 'outbound socket: new WebSocket()'],
  [/\bnew\s+XMLHttpRequest\s*\(/g, 'outbound HTTP: new XMLHttpRequest()'],
  [/\bnavigator\s*\.\s*sendBeacon\s*\(/g, 'outbound HTTP: navigator.sendBeacon()'],
];

export const SQL_PATTERNS = [
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
export const SIGNALLING_PATTERNS = [
  [/\bpg_notify\s*\(/gi, 'pg_notify()'],
  [/\bNOTIFY\s+\w/gi, 'NOTIFY'],
  [/\bLISTEN\s+\w/gi, 'LISTEN'],
];

// ── Surfaces — collected identically for both gates ─────────────────────────────────────────────

export const PACKAGES_DIR = join(REPO_ROOT, 'packages');

// The collectors and scanners take the root as a PARAMETER, defaulting to the real repository, so
// a fixture scan runs through byte-for-byte the same code as a production scan — the only variation
// anywhere is which directory the walk starts from. A test-only collector or a fixture-aware branch
// here would be a second scanner wearing the first one's name, and the gate that CI runs would no
// longer be the gate the negative controls prove.

/** Runtime TypeScript/JavaScript. Test trees and `*.test.*` files excluded, as they always were. */
export function collectTsFiles(root = REPO_ROOT) {
  const packagesDir = join(root, 'packages');
  if (!existsSync(packagesDir)) return [];
  return readdirSync(packagesDir)
    .sort()
    .flatMap((pkg) => walk(join(packagesDir, pkg, 'src'), (f) => /\.(ts|mts|cts|js|mjs)$/.test(f)))
    .filter((f) => !/\.test\.[cm]?[tj]s$/.test(f));
}

export function collectSqlFiles(root = REPO_ROOT) {
  return walk(join(root, 'packages', 'database', 'migrations'), (f) => f.endsWith('.sql'));
}

export function collectManifests(root = REPO_ROOT) {
  const packagesDir = join(root, 'packages');
  return [
    join(root, 'package.json'),
    ...(existsSync(packagesDir)
      ? readdirSync(packagesDir)
          .sort()
          .map((p) => join(packagesDir, p, 'package.json'))
          .filter(existsSync)
      : []),
  ];
}

// ── Scanners — return findings; the CALLER decides what a finding means ─────────────────────────

/** @returns {{surface: string, file: string, line: number, detail: string}[]} */
export function scanTsFile(file, root = REPO_ROOT) {
  const out = [];
  const raw = readFileSync(file, 'utf8');

  // Specifiers are read from the RAW text, because an import specifier is itself a string literal;
  // matching the import FORM rather than the bare string is what keeps a URL in prose from
  // registering.
  for (const pattern of SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    for (const m of raw.matchAll(pattern)) {
      const why = isDenied(m[1]);
      if (why)
        out.push({
          surface: 'typescript',
          file: rel(file, root),
          line: lineOf(raw, m.index),
          detail: `${why}: '${m[1]}'`,
        });
    }
  }

  const code = stripTs(raw);
  for (const [pattern, label] of TS_CALL_PATTERNS) {
    pattern.lastIndex = 0;
    for (const m of code.matchAll(pattern))
      out.push({
        surface: 'typescript',
        file: rel(file, root),
        line: lineOf(code, m.index),
        detail: label,
      });
  }
  return out;
}

/** @returns {{findings: object[], signalling: number}} */
export function scanSqlFile(file, root = REPO_ROOT) {
  const findings = [];
  let signalling = 0;
  const code = stripSql(readFileSync(file, 'utf8'));
  for (const [pattern, label] of SQL_PATTERNS) {
    pattern.lastIndex = 0;
    for (const m of code.matchAll(pattern))
      findings.push({
        surface: 'sql',
        file: rel(file, root),
        line: lineOf(code, m.index),
        detail: label,
      });
  }
  for (const [pattern] of SIGNALLING_PATTERNS) {
    pattern.lastIndex = 0;
    signalling += [...code.matchAll(pattern)].length;
  }
  return { findings, signalling };
}

export function scanManifest(file, root = REPO_ROOT) {
  const out = [];
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      const why = isDenied(name);
      if (why)
        out.push({
          surface: 'dependency',
          file: rel(file, root),
          line: 0,
          detail: `${why} declared in ${field}: '${name}'`,
        });
    }
  }
  return out;
}
