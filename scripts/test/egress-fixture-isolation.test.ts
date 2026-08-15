import { execFileSync, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { createEgressFixture } from './egress-fixture.ts';

/**
 * N7B-G1 — the isolation itself, proven rather than assumed.
 *
 * The egress negative controls used to plant primitives — `COPY … TO PROGRAM` above all — in REAL
 * repository files and restore them afterwards. Restoration always worked; the WINDOW was the
 * defect: a migration file is executable input, and a concurrent process that loaded the real
 * migration directory during the window observed, and would have executed, the planted statement.
 * That race produced a real false failure during N7-A verification.
 *
 * The remediation is physical, not advisory: mutations happen in a disposable copied tree under
 * the OS temp directory, outside the repository, and the gates accept an explicit scan root so the
 * SAME scanner walks the copy. This file proves the properties that make that a fix rather than a
 * relocation — the real tree is byte-identical while the copy is mutated, a failing control cannot
 * dirty the repository, concurrent fixtures cannot see each other, and the default root is still
 * the real repository. A mutex would have satisfied none of these: serialization narrows a window,
 * isolation removes it.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DETECTOR = join(ROOT, 'scripts', 'check-network-egress.mjs');
const MIGRATION_REL = 'packages/database/migrations/0030_network_transport_intent.up.sql';
const REAL_MIGRATION = join(ROOT, MIGRATION_REL);
const PLANT = "\nCOPY network_transport_intents TO PROGRAM 'send-to-broker';\n";

const sha256 = (abs: string): string =>
  createHash('sha256').update(readFileSync(abs)).digest('hex');

const execFileAsync = promisify(execFile);

interface Run {
  ok: boolean;
  output: string;
}

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

describe('G1 — egress negative controls are physically isolated from the repository', () => {
  it('G1-A — the mutation lands in the copied tree only, and the gate fails on the copy', () => {
    const before = sha256(REAL_MIGRATION);
    const fixture = createEgressFixture();
    try {
      appendFileSync(fixture.path(MIGRATION_REL), PLANT);

      // The COPY is mutated…
      expect(readFileSync(fixture.path(MIGRATION_REL), 'utf8')).toContain('TO PROGRAM');
      // …the REAL file is not…
      expect(sha256(REAL_MIGRATION), 'the real migration was mutated').toBe(before);
      // …and the SAME gate, pointed at the copy, fails naming the copied file root-relatively.
      const run = runDetector(fixture.root);
      expect(run.ok).toBe(false);
      expect(run.output).toContain('process execution: COPY');
      expect(run.output).toContain(MIGRATION_REL);
    } finally {
      fixture.dispose();
    }
    expect(existsSync(join(ROOT, 'packages/database/migrations')), 'sanity').toBe(true);
  });

  it('G1-A anti-vacuity — the real-file oracle actually detects a real-file mutation', () => {
    // "The real SHA never changed" is this file's load-bearing claim, and a SHA comparison that
    // compared a value to itself would hold vacuously. So the oracle is turned on the real file
    // once, deliberately: append and require the SAME comparison to notice.
    //
    // The appended byte is an SQL COMMENT, not an egress primitive. The oracle is byte-equality —
    // any byte falsifies it — and planting an executable `COPY … TO PROGRAM` in the real tree,
    // however briefly, is the precise hazard this file exists to close. An anti-vacuity control
    // must not recreate the hazard it guards, so this one proves the detector with an inert byte
    // and restores under try/finally with the restoration itself SHA-verified.
    const before = sha256(REAL_MIGRATION);
    const original = readFileSync(REAL_MIGRATION);
    try {
      appendFileSync(REAL_MIGRATION, '\n-- g1 anti-vacuity probe (inert comment)\n');
      expect(sha256(REAL_MIGRATION), 'the oracle failed to notice a real mutation').not.toBe(
        before,
      );
    } finally {
      writeFileSync(REAL_MIGRATION, original);
    }
    expect(sha256(REAL_MIGRATION), 'the anti-vacuity control failed to restore').toBe(before);
  });

  it('G1-B — the real migration SHA is identical before, during, and after the copied mutation', () => {
    const beforeSha = sha256(REAL_MIGRATION);
    const fixture = createEgressFixture();
    try {
      const copySha = sha256(fixture.path(MIGRATION_REL));
      expect(copySha, 'the copy must start byte-identical').toBe(beforeSha);

      appendFileSync(fixture.path(MIGRATION_REL), PLANT);

      // DURING: a second, independent process reads the real migration directory — the exact
      // concurrent-reader shape that once executed the planted statement — and finds original
      // bytes and a loadable inventory.
      const duringSha = execFileSync(
        'node',
        [
          '-e',
          `const {createHash}=require('crypto');const {readFileSync,readdirSync}=require('fs');` +
            `const dir='${join(ROOT, 'packages/database/migrations')}';` +
            `const n=readdirSync(dir).filter(f=>f.endsWith('.sql')).length;` +
            `const h=createHash('sha256').update(readFileSync('${REAL_MIGRATION}')).digest('hex');` +
            `console.log(h+' '+n);`,
        ],
        { encoding: 'utf8' },
      )
        .trim()
        .split(' ');
      expect(duringSha[0], 'a concurrent reader observed the mutation in the REAL tree').toBe(
        beforeSha,
      );
      expect(
        Number(duringSha[1]),
        'the real migration inventory broke during the window',
      ).toBeGreaterThanOrEqual(70);
      // And the fixture copy genuinely differs — the isolation is not two views of one file.
      expect(sha256(fixture.path(MIGRATION_REL))).not.toBe(beforeSha);
    } finally {
      fixture.dispose();
    }
    expect(sha256(REAL_MIGRATION), 'after').toBe(beforeSha);
  });

  it('G1-C — a control that throws after mutating cannot dirty the real tree', () => {
    const before = sha256(REAL_MIGRATION);
    const fixture = createEgressFixture();
    let disposed = false;
    try {
      appendFileSync(fixture.path(MIGRATION_REL), PLANT);
      throw new Error('simulated mid-control failure');
    } catch (error) {
      expect((error as Error).message).toBe('simulated mid-control failure');
    } finally {
      // The teardown the real suites run from afterEach — which vitest executes on failure too.
      fixture.dispose();
      disposed = true;
    }
    expect(disposed).toBe(true);
    expect(existsSync(fixture.root), 'the temp tree survived teardown').toBe(false);
    // THE PROPERTY THAT DOES NOT DEPEND ON CLEANUP AT ALL: even if dispose had never run — a
    // SIGKILL, not a throw — the mutation was in the temp tree, so the repository needs nothing
    // from the failure path to stay clean.
    expect(sha256(REAL_MIGRATION)).toBe(before);
  });

  it('G1-D — two concurrent fixtures cannot observe each other, and neither touches the repo', async () => {
    const before = sha256(REAL_MIGRATION);
    const a = createEgressFixture();
    const b = createEgressFixture();
    try {
      // mkdtemp guarantees distinct roots — no global temp filename to collide on.
      expect(a.root).not.toBe(b.root);

      appendFileSync(a.path(MIGRATION_REL), "\n-- fixture-A marker\nCOPY a TO PROGRAM 'a';\n");
      appendFileSync(b.path(MIGRATION_REL), "\n-- fixture-B marker\nCOPY b TO PROGRAM 'b';\n");

      const [ra, rb] = await Promise.all([
        execFileAsync('node', [DETECTOR], {
          env: { ...process.env, FREIGHTOS_EGRESS_SCAN_ROOT: a.root },
        }).then(
          () => ({ ok: true, output: '' }),
          (e: { stdout?: string; stderr?: string }) => ({
            ok: false,
            output: `${e.stdout ?? ''}${e.stderr ?? ''}`,
          }),
        ),
        execFileAsync('node', [DETECTOR], {
          env: { ...process.env, FREIGHTOS_EGRESS_SCAN_ROOT: b.root },
        }).then(
          () => ({ ok: true, output: '' }),
          (e: { stdout?: string; stderr?: string }) => ({
            ok: false,
            output: `${e.stdout ?? ''}${e.stderr ?? ''}`,
          }),
        ),
      ]);

      // Each concurrent gate run fails on ITS OWN tree's mutation…
      expect(ra.ok).toBe(false);
      expect(rb.ok).toBe(false);
      // …and each fixture file carries exactly its own marker.
      const contentA = readFileSync(a.path(MIGRATION_REL), 'utf8');
      const contentB = readFileSync(b.path(MIGRATION_REL), 'utf8');
      expect(contentA).toContain('fixture-A marker');
      expect(contentA).not.toContain('fixture-B marker');
      expect(contentB).toContain('fixture-B marker');
      expect(contentB).not.toContain('fixture-A marker');
      expect(sha256(REAL_MIGRATION)).toBe(before);
    } finally {
      a.dispose();
      b.dispose();
    }
  });

  it('G1-E — the default root is the real repository, and CI never overrides it', () => {
    // A fixture with an EXTRA migration exists while the detector runs with NO override. If the
    // default resolution could ever land on a fixture, the count would move; it must not.
    const fixture = createEgressFixture();
    try {
      writeFileSync(
        fixture.path('packages/database/migrations/9999_fixture_only.up.sql'),
        'SELECT 1;\n',
      );
      const run = runDetector();
      expect(run.ok).toBe(true);
      expect(run.output).not.toContain('scan root override');
      const migrations = Number(/migrations scanned: (\d+)/.exec(run.output)![1]);
      const realCount = execFileSync(
        'bash',
        ['-c', `ls ${join(ROOT, 'packages/database/migrations')}/*.sql | wc -l`],
        { encoding: 'utf8' },
      ).trim();
      expect(migrations, 'the default run scanned something other than the real repository').toBe(
        Number(realCount),
      );
    } finally {
      fixture.dispose();
    }

    // And a bad override FAILS rather than falling back to anything.
    const bogus = runDetector(join(ROOT, 'does-not-exist'));
    expect(bogus.ok).toBe(false);
    expect(bogus.output).toContain('does not exist or is not a directory');
  });

  it('G1-F — the copied-root scan is the same detector, not a fork', () => {
    // Behaviourally: the identical planted primitive yields the identical finding line — same
    // root-relative path, same label, same format — whichever root carries it. The fixture side is
    // executed; the real side's expected line is the KNOWN output format, pinned as a literal so a
    // fixture-only formatter would diverge visibly.
    const fixture = createEgressFixture();
    try {
      appendFileSync(fixture.path(MIGRATION_REL), PLANT);
      const run = runDetector(fixture.root);
      expect(run.ok).toBe(false);
      const findingLine = run.output.split('\n').find((l) => l.includes('process execution: COPY'));
      expect(findingLine).toBeDefined();
      // Root-relative path, `sql` surface, line number, label — the real-tree format exactly.
      expect(findingLine).toMatch(
        /^ {2}sql packages\/database\/migrations\/0030_network_transport_intent\.up\.sql:\d+ — process execution: COPY … PROGRAM$/,
      );
    } finally {
      fixture.dispose();
    }

    // Structurally: the gates hold no fixture-conditional branch — one resolved root, threaded
    // through the same collectors and scanners, and no test-only alternate anywhere.
    for (const gate of [DETECTOR, join(ROOT, 'scripts', 'check-egress-allowlist.mjs')]) {
      const source = readFileSync(gate, 'utf8');
      expect(
        source.match(/resolveScanRoot\(\)/g),
        `${gate} must resolve the root exactly once`,
      ).toHaveLength(1);
      expect(source).not.toMatch(/scanFake|testOnly|skipReal|NODE_ENV\s*===?\s*['"]test['"]/);
    }
    const shared = readFileSync(join(ROOT, 'scripts', 'lib', 'network-primitives.mjs'), 'utf8');
    expect(shared).not.toMatch(/scanFake|testOnly|skipReal/);
  });
});
