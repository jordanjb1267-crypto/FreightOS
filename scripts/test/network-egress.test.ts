import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createEgressFixture, type EgressFixture } from './egress-fixture.ts';

/**
 * N4 — the egress gate has to be able to recognise egress.
 *
 * `scripts/check-network-egress.mjs` reports PASS on a clean tree, and a clean-tree PASS proves
 * only that the tree is clean. It says nothing about whether the detector could recognise a real
 * prohibited surface, and a scanner that matches nothing at all reports exactly the same thing.
 * This file is the anti-vacuity control: it introduces a genuine egress primitive on each surface
 * the gate claims to cover, requires a failure naming that primitive, and restores.
 *
 * NOTHING HERE PERFORMS NETWORK I/O. Every mutation is static source text that is scanned and then
 * removed; no probe file is ever imported, compiled or executed, and the detector reads bytes.
 *
 * EVERY MUTATION TARGETS AN ISOLATED COPIED TREE — N7B-G1. These controls used to plant their
 * primitives in the REAL repository files and restore them afterwards, and restoring was never the
 * problem: the WINDOW was. A migration file is executable input, and a concurrent process loading
 * the real migration directory during the window observed — and would have executed — the planted
 * `COPY … TO PROGRAM`. Now each test copies the scan surface into a disposable temp tree
 * (`createEgressFixture`), mutates only the copy, and points the SAME detector at it through
 * `FREIGHTOS_EGRESS_SCAN_ROOT`. The real tree is byte-identical for the entire run, which the
 * guard in `afterEach` measures rather than assumes.
 *
 * THE SECOND HALF MATTERS AS MUCH AS THE FIRST. A gate that greps for `http` would pass every
 * mutation below and also reject the durable schema identities the network protocol is built on.
 * The false-positive control asserts that documentation URLs, `https://schemas.rigreceipts.com/…`
 * `$id`s, prose comments and a denied module name appearing OUTSIDE import position all remain
 * legal — that is the difference between a detector and a string search.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DETECTOR = join(ROOT, 'scripts', 'check-network-egress.mjs');

/** Repo-relative paths of everything the controls historically mutated for real. */
const REAL_MIGRATION = 'packages/database/migrations/0030_network_transport_intent.up.sql';
const REAL_DB_MANIFEST = 'packages/database/package.json';
/** A generated probe that exists only inside a fixture, never in the repository. */
const PROBE = 'packages/database/src/egress-probe.generated.ts';

const sha256 = (abs: string): string =>
  createHash('sha256').update(readFileSync(abs)).digest('hex');

/** The real files' bytes, pinned at load. The afterEach guard holds every test to them. */
const REAL_SHAS = new Map(
  [REAL_MIGRATION, REAL_DB_MANIFEST].map((p) => [p, sha256(join(ROOT, p))]),
);

interface Run {
  ok: boolean;
  output: string;
}

/** The REAL gate, as a subprocess — `root` only chooses where the same scanner starts walking. */
function runDetector(root?: string): Run {
  const env =
    root === undefined ? process.env : { ...process.env, FREIGHTOS_EGRESS_SCAN_ROOT: root };
  try {
    return { ok: true, output: execFileSync('node', [DETECTOR], { encoding: 'utf8', env }) };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

let fixture: EgressFixture;

beforeEach(() => {
  fixture = createEgressFixture();
});

afterEach(() => {
  // Teardown is unconditional — a failing assertion must not leak a fixture tree (§11).
  fixture.dispose();
  // THE G1 GUARD, run after every single test: the real files these controls used to mutate are
  // byte-identical to what they were before any test ran. If any control regressed into writing
  // the repository again, this fails the very test that did it, by name.
  for (const [p, sha] of REAL_SHAS) {
    expect(sha256(join(ROOT, p)), `${p} was mutated in the real repository`).toBe(sha);
  }
});

const mutateFixture = (repoRelative: string, content: string): void =>
  writeFileSync(fixture.path(repoRelative), content);
const appendFixture = (repoRelative: string, text: string): void =>
  appendFileSync(fixture.path(repoRelative), text);

describe('the network egress gate', () => {
  it('passes on the unmodified repository and reports a non-trivial scan', () => {
    // NO override: this is the production/CI invocation, scanning the real repository.
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
    // And the default run never names an override, because there is none.
    expect(run.output).not.toContain('scan root override');
  });

  it('scans the fixture with the same coverage it scans the repository — the copy is complete', () => {
    // If the fixture copied less than the real scan surface, every negative control below would be
    // exercising a smaller gate than CI runs. Same counts, same PASS, plus the override named.
    const real = runDetector();
    const copied = runDetector(fixture.root);
    expect(copied.ok).toBe(true);
    expect(copied.output).toContain(`scan root override: ${fixture.root}`);
    for (const counter of [
      /source files scanned: \d+/,
      /migrations scanned: \d+/,
      /package manifests scanned: \d+/,
    ]) {
      expect(counter.exec(copied.output)![0]).toBe(counter.exec(real.output)![0]);
    }
  });

  it('fails on an outbound HTTP call in runtime source', () => {
    mutateFixture(
      PROBE,
      'export async function publishAccepted(url: string, body: string): Promise<void> {\n' +
        '  await fetch(url, { method: "POST", body });\n' +
        '}\n',
    );

    const run = runDetector(fixture.root);
    expect(run.ok, 'an outbound fetch() did not fail the egress gate').toBe(false);
    expect(run.output).toContain('NETWORK_EGRESS=FAIL');
    expect(run.output).toContain('outbound HTTP: fetch()');
    expect(run.output).toContain('egress-probe.generated.ts');
  });

  it('fails on an import of a network-capable core module', () => {
    mutateFixture(PROBE, "import { request } from 'node:https';\nexport const send = request;\n");

    const run = runDetector(fixture.root);
    expect(run.ok, "importing 'node:https' did not fail the egress gate").toBe(false);
    expect(run.output).toContain("network-capable module: 'node:https'");
  });

  it('fails on a broker client import', () => {
    mutateFixture(PROBE, "import { Kafka } from 'kafkajs';\nexport const client = Kafka;\n");

    const run = runDetector(fixture.root);
    expect(run.ok, 'a broker client import did not fail the egress gate').toBe(false);
    expect(run.output).toContain("broker/queue client: 'kafkajs'");
  });

  it('fails on a broker client declared as a dependency', () => {
    const manifest = JSON.parse(readFileSync(fixture.path(REAL_DB_MANIFEST), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    manifest.dependencies['@aws-sdk/client-sns'] = '^3.0.0';
    mutateFixture(REAL_DB_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

    const run = runDetector(fixture.root);
    expect(run.ok, 'a declared broker dependency did not fail the egress gate').toBe(false);
    expect(run.output).toContain(
      "broker/queue client declared in dependencies: '@aws-sdk/client-sns'",
    );
  });

  it('fails on an external database connection in migration SQL', () => {
    appendFixture(
      REAL_MIGRATION,
      "\nDO $$ BEGIN PERFORM dblink_connect('publisher', 'dbname=downstream'); END $$;\n",
    );

    const run = runDetector(fixture.root);
    expect(run.ok, 'a dblink call did not fail the egress gate').toBe(false);
    expect(run.output).toContain('external database connection: dblink');
    expect(run.output).toContain('0030_network_transport_intent.up.sql');
  });

  it('fails on process execution from SQL', () => {
    // THE control the G1 isolation exists for. This exact statement, planted in the exact real
    // file this test used to plant it in, is what a concurrent migration run once executed.
    appendFixture(
      REAL_MIGRATION,
      "\nCOPY network_transport_intents TO PROGRAM 'send-to-broker';\n",
    );

    const run = runDetector(fixture.root);
    expect(run.ok, 'COPY … TO PROGRAM did not fail the egress gate').toBe(false);
    expect(run.output).toContain('process execution: COPY');
    // And the REAL file does not contain it, at the precise moment the fixture copy does.
    expect(readFileSync(join(ROOT, REAL_MIGRATION), 'utf8')).not.toContain(
      "TO PROGRAM 'send-to-broker'",
    );
  });

  it('fails on an HTTP extension being installed', () => {
    appendFixture(REAL_MIGRATION, '\nCREATE EXTENSION IF NOT EXISTS http;\n');

    const run = runDetector(fixture.root);
    expect(run.ok, 'installing an HTTP extension did not fail the egress gate').toBe(false);
    expect(run.output).toContain('external-capability extension');
  });

  it('leaves durable schema URLs, prose and non-import mentions alone — the false-positive control', () => {
    // EVERYTHING IN THIS PROBE IS LEGAL and a naive `grep -E 'http|kafka|fetch'` would reject all of
    // it. The network protocol is built on `https://schemas.rigreceipts.com/…` identities, the
    // migrations and ADRs discuss the primitives they forbid by name, and tests assert their
    // absence — a gate that cannot tell a prohibition from its own statement would have to be
    // worked around, and a gate that is worked around is not a gate.
    mutateFixture(
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

    const run = runDetector(fixture.root);
    expect(run.output, 'the gate rejected legal documentation or data').toContain(
      'NETWORK_EGRESS=PASS',
    );
    expect(run.ok).toBe(true);
  });

  it('counts pg_notify as database-local signalling, not as egress', () => {
    // THE DISTINCTION THIS GATE MUST NOT BLUR. `pg_notify` crosses no boundary this database does
    // not already own, so it is reported and counted rather than rejected. The purity of the N4
    // coupling function is a separate assertion, in the integration suite, where it belongs.
    const clean = runDetector(fixture.root);
    expect(clean.output).toMatch(/database-local signalling occurrences \(not egress\): 0/);

    appendFixture(REAL_MIGRATION, "\nDO $$ BEGIN PERFORM pg_notify('transport', 'x'); END $$;\n");

    const run = runDetector(fixture.root);
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
