import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assertInsideFixture,
  createGovernanceFixture,
  SOURCE_ROOT,
  type GovernanceFixture,
} from './helpers/governance-fixture';

/**
 * N4 — the egress gate has to be able to recognise egress.
 *
 * `scripts/check-network-egress.mjs` reports PASS on a clean tree, and a clean-tree PASS proves
 * only that the tree is clean. It says nothing about whether the detector could recognise a real
 * prohibited surface, and a scanner that matches nothing at all reports exactly the same thing.
 * This file is the anti-vacuity control: it introduces a genuine egress primitive on each surface
 * the gate claims to cover, requires a failure naming that primitive, and destroys the copy.
 *
 * NOTHING HERE PERFORMS NETWORK I/O. Every mutation is static source text that is scanned and then
 * removed; no probe file is ever imported, compiled or executed, and the detector reads bytes.
 *
 * THE SECOND HALF MATTERS AS MUCH AS THE FIRST. A gate that greps for `http` would pass every
 * mutation below and also reject the durable schema identities the network protocol is built on.
 * The false-positive control asserts that documentation URLs, `https://schemas.rigreceipts.com/…`
 * `$id`s, prose comments and a denied module name appearing OUTSIDE import position all remain
 * legal — that is the difference between a detector and a string search.
 *
 * Every mutation runs in a per-test disposable repository copy. The source worktree is never the
 * mutation target.
 */

let fixture: GovernanceFixture;
let ROOT = SOURCE_ROOT;
const DETECTOR = join(SOURCE_ROOT, 'scripts', 'check-network-egress.mjs');
let SRC = join(ROOT, 'packages', 'database', 'src');
let MIGRATION = join(
  ROOT,
  'packages',
  'database',
  'migrations',
  '0030_network_transport_intent.up.sql',
);
let DB_MANIFEST = join(ROOT, 'packages', 'database', 'package.json');
/** A file that does not exist until a test creates it, and never survives one. */
let PROBE = join(SRC, 'egress-probe.generated.ts');

function refreshPaths(root: string): void {
  ROOT = root;
  SRC = join(ROOT, 'packages', 'database', 'src');
  MIGRATION = join(
    ROOT,
    'packages',
    'database',
    'migrations',
    '0030_network_transport_intent.up.sql',
  );
  DB_MANIFEST = join(ROOT, 'packages', 'database', 'package.json');
  PROBE = join(SRC, 'egress-probe.generated.ts');
}

interface Run {
  ok: boolean;
  output: string;
}

function runDetector(): Run {
  try {
    return {
      ok: true,
      output: execFileSync('node', [DETECTOR], {
        cwd: SOURCE_ROOT,
        encoding: 'utf8',
        env: { ...process.env, GOVERNANCE_REPO_ROOT: ROOT },
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

const restore: { path: string; content: Buffer | null }[] = [];

function mutate(path: string, next: string | null): void {
  assertInsideFixture(ROOT, path);
  restore.push({ path, content: existsSync(path) ? readFileSync(path) : null });
  if (next === null) rmSync(path, { force: true });
  else writeFileSync(path, next);
}

const append = (path: string, text: string): void =>
  mutate(path, `${readFileSync(path, 'utf8')}${text}`);

beforeEach(() => {
  fixture = createGovernanceFixture('freightos-network-egress-');
  refreshPaths(fixture.root);
});

afterEach(() => {
  while (restore.length > 0) {
    const entry = restore.pop()!;
    if (entry.content === null) rmSync(entry.path, { force: true });
    else writeFileSync(entry.path, entry.content);
  }
  fixture.cleanup();
  refreshPaths(SOURCE_ROOT);
});

describe('the network egress gate', () => {
  it('passes on the unmodified repository and reports a non-trivial scan', () => {
    const run = runDetector();
    expect(run.output).toContain('NETWORK_EGRESS=PASS');
    expect(run.ok).toBe(true);

    // ANTI-VACUITY ON COVERAGE. A detector that walked an empty tree would also print PASS. The
    // floors sit well below the real totals so that adding a package or a migration does not fail
    // this, while a scan that silently stopped walking does.
    const sources = /source files scanned: (\d+)/.exec(run.output);
    const migrations = /migrations scanned: (\d+)/.exec(run.output);
    const manifests = /package manifests scanned: (\d+)/.exec(run.output);
    expect(sources, 'the detector printed no source count').not.toBeNull();
    expect(Number(sources![1])).toBeGreaterThanOrEqual(20);
    expect(Number(migrations![1])).toBeGreaterThanOrEqual(50);
    expect(Number(manifests![1])).toBeGreaterThanOrEqual(5);
  });

  it('fails on an outbound HTTP call in runtime source', () => {
    mutate(
      PROBE,
      'export async function publishAccepted(url: string, body: string): Promise<void> {\n' +
        '  await fetch(url, { method: "POST", body });\n' +
        '}\n',
    );

    const run = runDetector();
    expect(run.ok, 'an outbound fetch() did not fail the egress gate').toBe(false);
    expect(run.output).toContain('NETWORK_EGRESS=FAIL');
    expect(run.output).toContain('outbound HTTP: fetch()');
    expect(run.output).toContain('egress-probe.generated.ts');
  });

  it('fails on an import of a network-capable core module', () => {
    mutate(PROBE, "import { request } from 'node:https';\nexport const send = request;\n");

    const run = runDetector();
    expect(run.ok, "importing 'node:https' did not fail the egress gate").toBe(false);
    expect(run.output).toContain("network-capable module: 'node:https'");
  });

  it('fails on a broker client import', () => {
    mutate(PROBE, "import { Kafka } from 'kafkajs';\nexport const client = Kafka;\n");

    const run = runDetector();
    expect(run.ok, 'a broker client import did not fail the egress gate').toBe(false);
    expect(run.output).toContain("broker/queue client: 'kafkajs'");
  });

  it('fails on a broker client declared as a dependency', () => {
    const manifest = JSON.parse(readFileSync(DB_MANIFEST, 'utf8')) as {
      dependencies: Record<string, string>;
    };
    manifest.dependencies['@aws-sdk/client-sns'] = '^3.0.0';
    mutate(DB_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

    const run = runDetector();
    expect(run.ok, 'a declared broker dependency did not fail the egress gate').toBe(false);
    expect(run.output).toContain(
      "broker/queue client declared in dependencies: '@aws-sdk/client-sns'",
    );
  });

  it('fails on an external database connection in migration SQL', () => {
    append(
      MIGRATION,
      "\nDO $$ BEGIN PERFORM dblink_connect('publisher', 'dbname=downstream'); END $$;\n",
    );

    const run = runDetector();
    expect(run.ok, 'a dblink call did not fail the egress gate').toBe(false);
    expect(run.output).toContain('external database connection: dblink');
    expect(run.output).toContain('0030_network_transport_intent.up.sql');
  });

  it('fails on process execution from SQL', () => {
    append(MIGRATION, "\nCOPY network_transport_intents TO PROGRAM 'send-to-broker';\n");

    const run = runDetector();
    expect(run.ok, 'COPY … TO PROGRAM did not fail the egress gate').toBe(false);
    expect(run.output).toContain('process execution: COPY');
  });

  it('fails on an HTTP extension being installed', () => {
    append(MIGRATION, '\nCREATE EXTENSION IF NOT EXISTS http;\n');

    const run = runDetector();
    expect(run.ok, 'installing an HTTP extension did not fail the egress gate').toBe(false);
    expect(run.output).toContain('external-capability extension');
  });

  it('leaves durable schema URLs, prose and non-import mentions alone — the false-positive control', () => {
    // EVERYTHING IN THIS PROBE IS LEGAL and a naive `grep -E 'http|kafka|fetch'` would reject all of
    // it. The network protocol is built on `https://schemas.rigreceipts.com/…` identities, the
    // migrations and ADRs discuss the primitives they forbid by name, and tests assert their
    // absence — a gate that cannot tell a prohibition from its own statement would have to be
    // worked around, and a gate that is worked around is not a gate.
    mutate(
      PROBE,
      [
        '// A comment naming fetch(), kafkajs, dblink and node:https, none of which run.',
        '/* Block comment: COPY … TO PROGRAM, pg_read_file(), postgres_fdw. */',
        "export const ENVELOPE = 'https://schemas.rigreceipts.com/network/event-envelope.v1.json';",
        "export const CORRECTION = 'https://schemas.rigreceipts.com/network/event-correction.v1.json';",
        "export const DOC_URL = 'https://example.com/docs/publishing-and-brokers';",
        '// A denied specifier OUTSIDE import position is inert data, not a capability:',
        "export const NOT_AN_IMPORT = 'node:https';",
        "export const ALSO_NOT = ['kafkajs', 'amqplib', 'ioredis'] as const;",
        'export const DESCRIBES = "the publisher will fetch nothing";',
        '',
      ].join('\n'),
    );

    const run = runDetector();
    expect(run.output, 'the gate rejected legal documentation or data').toContain(
      'NETWORK_EGRESS=PASS',
    );
    expect(run.ok).toBe(true);
  });

  it('counts pg_notify as database-local signalling, not as egress', () => {
    // THE DISTINCTION THIS GATE MUST NOT BLUR. `pg_notify` crosses no boundary this database does
    // not already own, so it is reported and counted rather than rejected. The purity of the N4
    // coupling function is a separate assertion, in the integration suite, where it belongs.
    const clean = runDetector();
    expect(clean.output).toMatch(/database-local signalling occurrences \(not egress\): 0/);

    append(MIGRATION, "\nDO $$ BEGIN PERFORM pg_notify('transport', 'x'); END $$;\n");

    const run = runDetector();
    expect(run.ok, 'pg_notify was treated as external egress').toBe(true);
    expect(run.output).toContain('NETWORK_EGRESS=PASS');
    expect(run.output).toMatch(/database-local signalling occurrences \(not egress\): [1-9]/);
  });

  it('refuses to report success if it scanned nothing', () => {
    // The failure mode a governance check in this repository has already met once: a validator that
    // walked an empty tree and printed PASS. Asserted against the detector's own guard rather than
    // by trusting the counts printed above.
    const source = readFileSync(DETECTOR, 'utf8');
    expect(source).toContain('the scan covered nothing');
    expect(source).toMatch(/tsFiles\.length === 0 \|\| sqlFiles\.length === 0/);
  });
});
