import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createEgressFixture, type EgressFixture } from './egress-fixture.ts';

/**
 * The bounded-egress gate, exercised against its own failure modes.
 *
 * A gate that has never been observed to fail is a gate nobody has tested. `NETWORK_EGRESS` has
 * printed PASS for every commit in this repository's history, which is exactly why its negative
 * controls matter more than its positive one: the only evidence that it can say FAIL is a run in
 * which it does.
 *
 * Every control below mutates an ISOLATED COPY of the scan surface — N7B-G1 — runs the REAL gate
 * as a subprocess pointed at that copy through `FREIGHTOS_EGRESS_SCAN_ROOT`, and destroys the
 * copy. The real repository, including the governed manifest these controls used to edit in place,
 * stays byte-identical for the entire run; the `afterEach` guard measures that rather than
 * assuming it. Running the gate as a subprocess rather than importing it is deliberate:
 * `process.exit()` is part of the contract CI depends on, and a test that stubbed it would be
 * testing something else.
 *
 * NO NETWORK ACCESS. The planted primitives are never executed — they are text in a file that a
 * static scanner reads.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const GATE = join(ROOT, 'scripts/check-egress-allowlist.mjs');
const LEGACY = join(ROOT, 'scripts/check-network-egress.mjs');
/** Repo-relative path of the governed manifest, inside whichever root a run scans. */
const MANIFEST_REL = 'config/network/egress-allowlist.json';
/** Repo-relative path of the plant probe — inside a real package src tree so the scanner's own
 *  file discovery is what finds it, but only ever CREATED inside a fixture copy of that tree. */
const PLANT_REL = 'packages/context/src/zz-egress-gate-probe.ts';

const sha256 = (abs: string): string =>
  createHash('sha256').update(readFileSync(abs)).digest('hex');

/** The real manifest's bytes, pinned at load. Every test is held to them in `afterEach`. */
const REAL_MANIFEST_SHA = sha256(join(ROOT, MANIFEST_REL));

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** The REAL gate, as a subprocess — `root` only chooses where the same scanner starts walking. */
function run(script: string, root?: string): Run {
  const env =
    root === undefined ? process.env : { ...process.env, FREIGHTOS_EGRESS_SCAN_ROOT: root };
  try {
    const stdout = execFileSync('node', [script], { cwd: ROOT, encoding: 'utf8', env });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

let fixture: EgressFixture;

beforeEach(() => {
  fixture = createEgressFixture();
});

afterEach(() => {
  // Unconditional teardown — a failing assertion must not leak a fixture tree.
  fixture.dispose();
  // THE G1 GUARD: the real manifest is byte-identical and no plant probe exists in the real tree,
  // measured after every test so a control that regressed into writing the repository fails the
  // test that did it, by name.
  expect(sha256(join(ROOT, MANIFEST_REL)), 'the REAL manifest was mutated').toBe(REAL_MANIFEST_SHA);
  expect(existsSync(join(ROOT, PLANT_REL)), 'a probe was planted in the REAL tree').toBe(false);
});

/** Rewrite the FIXTURE's manifest copy. The real one is never written. */
function mutateManifest(edit: (m: Record<string, unknown>) => void): void {
  const path = fixture.path(MANIFEST_REL);
  const m = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  edit(m);
  writeFileSync(path, `${JSON.stringify(m, null, 2)}\n`);
}

const plant = (content: string): void => writeFileSync(fixture.path(PLANT_REL), content);

describe('the bounded-egress gate passes on a clean tree', () => {
  it('reports zero approved modules and zero violations', () => {
    // NO override: the production/CI invocation, scanning the real repository.
    const r = run(GATE);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('NETWORK_EGRESS_ALLOWLIST=PASS');
    expect(r.stdout).toContain('approved egress modules: 0');
    expect(r.stdout).toContain('egress primitives outside the allowlist: 0');
    expect(r.stdout).not.toContain('scan root override');
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

  it('passes on an unmutated fixture copy with identical coverage — the copy is faithful', () => {
    // If the fixture copied less than the real surface, every control below would be exercising a
    // smaller gate than CI runs.
    const real = run(GATE);
    const copied = run(GATE, fixture.root);
    expect(copied.code).toBe(0);
    expect(copied.stdout).toContain(`scan root override: ${fixture.root}`);
    expect(/source files scanned: (\d+)/.exec(copied.stdout)![1]).toBe(
      /source files scanned: (\d+)/.exec(real.stdout)![1],
    );
  });
});

describe('negative controls — the gate names what is wrong', () => {
  it('fails on an egress primitive in an unapproved module, naming the file', () => {
    plant('export const probe = async (): Promise<unknown> => fetch("x");\n');
    const r = run(GATE, fixture.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('NETWORK_EGRESS_ALLOWLIST=FAIL');
    expect(r.stderr).toContain('EGRESS_VIOLATION');
    // NAMED. A gate whose failure does not say which file gets worked around. The path is
    // root-relative, so the finding reads identically to one in the real tree.
    expect(r.stderr).toContain('packages/context/src/zz-egress-gate-probe.ts');
    expect(r.stderr).toContain('fetch()');
    // The REAL gate run, in the same breath, still passes — the plant is invisible to it.
    expect(run(GATE).code, 'the real tree must be unaffected by a fixture plant').toBe(0);
  });

  it('fails on a network-capable IMPORT, not only on a bare call', () => {
    // §37: the gate must not be limited to literal `fetch(`. An import is the other half of
    // capability acquisition and is matched in import position only.
    plant("import { request } from 'node:https';\nexport const p = request;\n");
    const r = run(GATE, fixture.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('network-capable module');
    expect(r.stderr).toContain('node:https');
  });

  // V-01 — the Node core HTTP/2 client, in both specifier forms.
  //
  // `http2` was absent from the inventory while `http` and `https` were present, so a runtime
  // module could `import { connect } from 'node:http2'` and open a full HTTP/2 client with BOTH
  // gates reporting PASS. No dependency was needed: it is core, and available in every Node this
  // repository runs on.
  //
  // The omission is worth stating because it is the shape the next one will take. The inventory was
  // built by listing the modules one thinks of as "the HTTP client"; `http2` is the same capability
  // under a name that did not come to mind. It was found by asking what the list ENUMERATES rather
  // than how long it is — and these two controls exist so the answer stays checked rather than
  // remembered.
  //
  // Both forms are asserted because `isDenied` is an exact `Set.has` with no specifier
  // normalization: `node:http2` and `http2` are two distinct strings, and a fix that added only one
  // of them would leave the bypass open under the other.
  for (const [label, specifier] of [
    ['V01-A', 'node:http2'],
    ['V01-B', 'http2'],
  ] as const) {
    it(`${label} — fails on the Node core HTTP/2 client imported as '${specifier}'`, () => {
      plant(`import { connect } from '${specifier}';\nexport const p = connect;\n`);
      const r = run(GATE, fixture.root);
      expect(r.code, `'${specifier}' did not fail the bounded-allowlist gate`).toBe(1);
      expect(r.stderr).toContain('NETWORK_EGRESS_ALLOWLIST=FAIL');
      expect(r.stderr).toContain('EGRESS_VIOLATION');
      // NAMED, in both dimensions: which file, and which primitive.
      expect(r.stderr).toContain('packages/context/src/zz-egress-gate-probe.ts');
      expect(r.stderr).toContain('network-capable module');
      expect(r.stderr).toContain(specifier);
      expect(run(GATE).code, 'the real tree must be unaffected').toBe(0);
    });
  }

  it('V01 — the legacy zero-capability gate catches http2 too, in both forms', () => {
    // The two gates share one inventory, so this ought to follow — but "ought to follow" is what
    // the shared-inventory contract asserts structurally, and this asserts it behaviourally. If
    // they ever diverged, the gate that kept the older list would keep reporting PASS.
    for (const specifier of ['node:http2', 'http2'] as const) {
      plant(`import { connect } from '${specifier}';\nexport const p = connect;\n`);
      const r = run(LEGACY, fixture.root);
      expect(r.code, `'${specifier}' did not fail the zero-capability gate`).toBe(1);
      expect(r.stderr).toContain('NETWORK_EGRESS=FAIL');
      expect(r.stderr).toContain(specifier);
      rmSync(fixture.path(PLANT_REL), { force: true });
    }
    expect(run(LEGACY).code, 'the real tree must be unaffected').toBe(0);
  });

  it('fails on a stale manifest entry that contains no primitive', () => {
    mutateManifest((m) => {
      // A real file, deliberately one with no egress in it.
      m['modules'] = ['packages/context/src/disclosure-delivery.ts'];
      m['expectedCount'] = 1;
    });
    const r = run(GATE, fixture.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('EGRESS_ALLOWLIST_STALE');
    expect(r.stderr).toContain('packages/context/src/disclosure-delivery.ts');
    // The REAL manifest still reads as it always did.
    expect(run(GATE).code, 'the real manifest must be unaffected').toBe(0);
  });

  it('fails on a manifest entry that does not resolve', () => {
    mutateManifest((m) => {
      m['modules'] = ['packages/context/src/does-not-exist.ts'];
      m['expectedCount'] = 1;
    });
    const r = run(GATE, fixture.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('does not resolve to a file that exists');
  });

  it('fails when the allowlist is widened without updating expectedCount', () => {
    // THE CONTROL THAT MAKES WIDENING VISIBLE. One line added to `modules` is not enough; the
    // count must move too, so a silent broadening cannot happen in a single inconspicuous line.
    mutateManifest((m) => {
      m['modules'] = ['packages/context/src/disclosure-delivery.ts'];
      // expectedCount deliberately left at 0
    });
    const r = run(GATE, fixture.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('expectedCount');
  });

  it('rejects a glob or directory entry — exact paths only', () => {
    mutateManifest((m) => {
      m['modules'] = ['packages/context/src/adapters/**'];
      m['expectedCount'] = 1;
    });
    const r = run(GATE, fixture.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('EXACT file paths');
  });

  it('rejects duplicate entries', () => {
    mutateManifest((m) => {
      const dup = 'packages/context/src/disclosure-delivery.ts';
      m['modules'] = [dup, dup];
      m['expectedCount'] = 2;
    });
    const r = run(GATE, fixture.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('duplicate manifest entry');
  });

  it('fails when the manifest is missing entirely', () => {
    // "No manifest" is not "no egress approved" — it is "nobody is checking". Deleting the
    // FIXTURE's copy proves it without the real manifest ever ceasing to exist.
    rmSync(fixture.path(MANIFEST_REL));
    const r = run(GATE, fixture.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('is missing');
    expect(run(GATE).code, 'the real manifest must still be present').toBe(0);
  });
});

describe('the manifest currently approves nothing — N7-A', () => {
  it('is empty, and says so in both fields', () => {
    const m = JSON.parse(readFileSync(join(ROOT, MANIFEST_REL), 'utf8')) as {
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
    // And CI never points a named gate at a fixture: the override variable appears nowhere in the
    // workflow, so the steps scan the repository they run in — N7B-G1's §19 condition.
    expect(ci, 'a CI step sets the scan-root override').not.toContain('FREIGHTOS_EGRESS_SCAN_ROOT');
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
