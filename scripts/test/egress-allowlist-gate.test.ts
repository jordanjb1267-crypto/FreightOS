import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

/**
 * The bounded-egress gate, exercised against its own failure modes.
 *
 * A gate that has never been observed to fail is a gate nobody has tested. `NETWORK_EGRESS` has
 * printed PASS for every commit in this repository's history, which is exactly why its negative
 * controls matter more than its positive one: the only evidence that it can say FAIL is a run in
 * which it does.
 *
 * Every control below mutates a REAL file on disk, runs the REAL gate as a subprocess, and restores
 * byte-exactly in `afterAll` — checked by SHA, not assumed. Running the gate as a subprocess rather
 * than importing it is deliberate: `process.exit()` is part of the contract CI depends on, and a
 * test that stubbed it would be testing something else.
 *
 * NO NETWORK ACCESS. The planted primitives are never executed — they are text in a file that a
 * static scanner reads.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const GATE = join(ROOT, 'scripts/check-egress-allowlist.mjs');
const LEGACY = join(ROOT, 'scripts/check-network-egress.mjs');
const MANIFEST = join(ROOT, 'config/network/egress-allowlist.json');
/** A real package source tree, so the scanner's own file discovery is what finds the plant. */
const PLANT_DIR = join(ROOT, 'packages/context/src');
const PLANT = join(PLANT_DIR, 'zz-egress-gate-probe.ts');
const MANIFEST_BACKUP = `${MANIFEST}.probe-backup`;

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function run(script: string): Run {
  try {
    const stdout = execFileSync('node', [script], { cwd: ROOT, encoding: 'utf8' });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

const manifestSha = (): string =>
  execFileSync('sha256sum', [MANIFEST], { encoding: 'utf8' }).split(' ')[0]!;

const BASELINE_SHA = manifestSha();

function restore(): void {
  rmSync(PLANT, { force: true });
  try {
    copyFileSync(MANIFEST_BACKUP, MANIFEST);
    rmSync(MANIFEST_BACKUP, { force: true });
  } catch {
    /* backup only exists while a manifest control is running */
  }
}

afterAll(() => {
  restore();
  expect(manifestSha(), 'the manifest must be restored byte-exactly').toBe(BASELINE_SHA);
});

describe('the bounded-egress gate passes on a clean tree', () => {
  it('reports zero approved modules and zero violations', () => {
    const r = run(GATE);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('NETWORK_EGRESS_ALLOWLIST=PASS');
    expect(r.stdout).toContain('approved egress modules: 0');
    expect(r.stdout).toContain('egress primitives outside the allowlist: 0');
  });

  it('scanned something — a gate over an empty tree proves nothing', () => {
    // The failure mode this repository has already met once, in a governance check that walked an
    // empty tree and printed PASS.
    const r = run(GATE);
    const files = /source files scanned: (\d+)/.exec(r.stdout);
    expect(Number(files?.[1])).toBeGreaterThan(10);
  });

  it('still satisfies the legacy zero-egress validator — both hold during N7-A', () => {
    const r = run(LEGACY);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('NETWORK_EGRESS=PASS');
  });
});

describe('negative controls — the gate names what is wrong', () => {
  it('fails on an egress primitive in an unapproved module, naming the file', () => {
    mkdirSync(PLANT_DIR, { recursive: true });
    writeFileSync(PLANT, 'export const probe = async (): Promise<unknown> => fetch("x");\n');
    try {
      const r = run(GATE);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('NETWORK_EGRESS_ALLOWLIST=FAIL');
      expect(r.stderr).toContain('EGRESS_VIOLATION');
      // NAMED. A gate whose failure does not say which file gets worked around.
      expect(r.stderr).toContain('packages/context/src/zz-egress-gate-probe.ts');
      expect(r.stderr).toContain('fetch()');
    } finally {
      rmSync(PLANT, { force: true });
    }
    expect(run(GATE).code, 'restored').toBe(0);
  });

  it('fails on a network-capable IMPORT, not only on a bare call', () => {
    // §37: the gate must not be limited to literal `fetch(`. An import is the other half of
    // capability acquisition and is matched in import position only.
    mkdirSync(PLANT_DIR, { recursive: true });
    writeFileSync(PLANT, "import { request } from 'node:https';\nexport const p = request;\n");
    try {
      const r = run(GATE);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('network-capable module');
      expect(r.stderr).toContain('node:https');
    } finally {
      rmSync(PLANT, { force: true });
    }
  });

  it('fails on a stale manifest entry that contains no primitive', () => {
    copyFileSync(MANIFEST, MANIFEST_BACKUP);
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<string, unknown>;
    // A real file, deliberately one with no egress in it.
    m['modules'] = ['packages/context/src/disclosure-delivery.ts'];
    m['expectedCount'] = 1;
    writeFileSync(MANIFEST, `${JSON.stringify(m, null, 2)}\n`);
    try {
      const r = run(GATE);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('EGRESS_ALLOWLIST_STALE');
      expect(r.stderr).toContain('packages/context/src/disclosure-delivery.ts');
    } finally {
      restore();
    }
    expect(run(GATE).code, 'restored').toBe(0);
  });

  it('fails on a manifest entry that does not resolve', () => {
    copyFileSync(MANIFEST, MANIFEST_BACKUP);
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<string, unknown>;
    m['modules'] = ['packages/context/src/does-not-exist.ts'];
    m['expectedCount'] = 1;
    writeFileSync(MANIFEST, `${JSON.stringify(m, null, 2)}\n`);
    try {
      const r = run(GATE);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('does not resolve to a file that exists');
    } finally {
      restore();
    }
  });

  it('fails when the allowlist is widened without updating expectedCount', () => {
    // THE CONTROL THAT MAKES WIDENING VISIBLE. One line added to `modules` is not enough; the
    // count must move too, so a silent broadening cannot happen in a single inconspicuous line.
    copyFileSync(MANIFEST, MANIFEST_BACKUP);
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<string, unknown>;
    m['modules'] = ['packages/context/src/disclosure-delivery.ts'];
    // expectedCount deliberately left at 0
    writeFileSync(MANIFEST, `${JSON.stringify(m, null, 2)}\n`);
    try {
      const r = run(GATE);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('expectedCount');
    } finally {
      restore();
    }
  });

  it('rejects a glob or directory entry — exact paths only', () => {
    copyFileSync(MANIFEST, MANIFEST_BACKUP);
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<string, unknown>;
    m['modules'] = ['packages/context/src/adapters/**'];
    m['expectedCount'] = 1;
    writeFileSync(MANIFEST, `${JSON.stringify(m, null, 2)}\n`);
    try {
      const r = run(GATE);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('EXACT file paths');
    } finally {
      restore();
    }
  });

  it('rejects duplicate entries', () => {
    copyFileSync(MANIFEST, MANIFEST_BACKUP);
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<string, unknown>;
    const dup = 'packages/context/src/disclosure-delivery.ts';
    m['modules'] = [dup, dup];
    m['expectedCount'] = 2;
    writeFileSync(MANIFEST, `${JSON.stringify(m, null, 2)}\n`);
    try {
      const r = run(GATE);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('duplicate manifest entry');
    } finally {
      restore();
    }
  });

  it('fails when the manifest is missing entirely', () => {
    // "No manifest" is not "no egress approved" — it is "nobody is checking".
    copyFileSync(MANIFEST, MANIFEST_BACKUP);
    rmSync(MANIFEST);
    try {
      const r = run(GATE);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('is missing');
    } finally {
      restore();
    }
    expect(run(GATE).code, 'restored').toBe(0);
  });
});

describe('the manifest currently approves nothing — N7-A', () => {
  it('is empty, and says so in both fields', () => {
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
      modules: string[];
      expectedCount: number;
    };
    expect(m.modules).toEqual([]);
    expect(m.expectedCount).toBe(0);
  });

  it('is wired into pnpm verify and into CI under a name that states the property', () => {
    const pkg = readFileSync(join(ROOT, 'package.json'), 'utf8');
    expect(pkg).toContain('validate:egress-allowlist');
    expect(pkg, 'must run inside the aggregate validate too').toContain(
      'pnpm validate:egress && pnpm validate:egress-allowlist',
    );

    // NETWORK_EGRESS_CI_OBSERVABILITY closes on this: a named step, not a line inside an
    // aggregate step where no reader can see it.
    const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    expect(ci).toContain('External egress — zero capability');
    expect(ci).toContain('External egress — bounded allowlist');
    expect(ci).toContain('pnpm validate:egress-allowlist');
  });

  it('shares ONE primitive inventory with the legacy validator', () => {
    // The duplicated-identity rule applied to the gates themselves. Two copies of "what counts as
    // egress" would drift, and the drift would be invisible until one of them was the only thing
    // still looking.
    const shared = readFileSync(join(ROOT, 'scripts/lib/network-primitives.mjs'), 'utf8');

    // EVERY exported constant the shared module defines, DERIVED from the module rather than
    // listed here. Naming two of them by hand left the other six unguarded: mutation E-04
    // redefined `SPECIFIER_PATTERNS` locally and walked straight through, because the check only
    // ever looked for `NETWORK_MODULES` and `TS_CALL_PATTERNS`. A gate that enumerates its
    // suspects protects exactly its suspects.
    const exported = [...shared.matchAll(/export const ([A-Z][A-Z0-9_]*)\s*=/g)].map((m) => m[1]!);
    expect(exported, 'the shared module exports no inventory constants').toContain(
      'NETWORK_MODULES',
    );
    expect(exported.length, 'the derived export list is implausibly short').toBeGreaterThanOrEqual(
      4,
    );

    for (const gate of [GATE, LEGACY]) {
      const source = readFileSync(gate, 'utf8');
      expect(source, `${gate} must import the shared inventory`).toContain(
        'network-primitives.mjs',
      );
      // Neither gate may redefine ANY of them locally. Two copies of "what counts as egress" drift,
      // and the drift is invisible until one of them is the only thing still looking.
      for (const name of exported) {
        expect(source, `${gate} redefines ${name} locally instead of importing it`).not.toMatch(
          new RegExp(`(const|let|var)\\s+${name}\\s*=`),
        );
      }
    }
  });
});
