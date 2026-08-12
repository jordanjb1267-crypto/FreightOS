import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import vitestConfig from '../../vitest.config.ts';

/**
 * The structural half of the integration-runtime contract. Its behavioural half lives in
 * `packages/database/test/config-contract/`, and NEITHER is sufficient alone — that division is the
 * whole lesson of the defect this gate exists to prevent.
 *
 * Under the previous workspace topology the integration project declared `fileParallelism: false`
 * and `testTimeout: 60_000`, `createVitest` reported both back verbatim, and the runtime executed
 * integration files concurrently anyway. A structural assertion alone would have passed throughout.
 * So the properties pinned here are deliberately the ones a behavioural probe CANNOT see — that
 * there is one configuration source, that the projects are distinct and non-overlapping, that the
 * probes run under the same object the real suite runs under — and everything about whether a
 * budget is actually enforced is left to the probes, which measure elapsed wall time.
 *
 * NOT a full-file textual snapshot. A snapshot fails on every comment edit, gets regenerated
 * without being read, and pins nothing anybody chose.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The intended integration budgets, restated here so a change has to be made in two places. */
const EXPECTED_TEST_TIMEOUT_MS = 60_000;
const EXPECTED_HOOK_TIMEOUT_MS = 60_000;

interface ProjectShape {
  name: string;
  include: string[];
  environment?: string;
  pool?: string;
  poolOptions?: { forks?: { singleFork?: boolean } };
  testTimeout?: number;
  hookTimeout?: number;
}

function projects(): ProjectShape[] {
  const entries = (vitestConfig as { test?: { projects?: unknown[] } }).test?.projects;
  expect(Array.isArray(entries), 'vitest.config.ts must define test.projects').toBe(true);
  return (entries as { test: ProjectShape }[]).map((entry) => {
    expect(entry.test, 'every project entry must be an inline { test: ... } object').toBeTruthy();
    return entry.test;
  });
}

function project(name: string): ProjectShape {
  const matches = projects().filter((p) => p.name === name);
  expect(matches.length, `expected exactly one project named "${name}"`).toBe(1);
  return matches[0]!;
}

/**
 * Glob → RegExp for the pattern shapes this repository actually uses (`**\/` and `*`).
 *
 * Hand-rolled rather than pulled from a matcher library because this gate must fail when the
 * include patterns change, and a dependency that silently widens its matching would be one more
 * thing between the assertion and the truth. The self-test below is what keeps it honest.
 */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*\*\//g, '(?:.*/)?').replace(/\*/g, '[^/]*')}$`);
}

const matches = (patterns: string[], path: string): boolean =>
  patterns.some((p) => globToRegExp(p).test(path));

/** Every `*.test.ts` in the repository, excluding dependencies and build output. */
function allTestFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.test.ts')) found.push(relative(ROOT, full));
    }
  };
  for (const top of ['packages', 'scripts']) walk(join(ROOT, top));
  return found.sort();
}

describe('vitest configuration topology', () => {
  it('has exactly one configuration source, and it is the root config', () => {
    expect(existsSync(join(ROOT, 'vitest.config.ts')), 'vitest.config.ts is missing').toBe(true);

    // THE POINT OF THE MIGRATION. `vitest.workspace.ts` is deprecated in 3.2 and removed next
    // major, but the reason it must be absent is that two configuration sources means nobody can
    // tell which one is in force — and the last time this repository had an ambiguous
    // configuration, an option that read as an instruction was silently ignored for months.
    expect(
      existsSync(join(ROOT, 'vitest.workspace.ts')),
      'vitest.workspace.ts is back — there must be exactly one source of truth for test config',
    ).toBe(false);
  });

  it('defines exactly the three expected projects, each once', () => {
    expect(
      projects()
        .map((p) => p.name)
        .sort(),
    ).toEqual(['config-contract', 'integration', 'unit']);
  });

  it('pins the integration budgets that the behavioural probes measure', () => {
    const integration = project('integration');
    expect(integration.testTimeout).toBe(EXPECTED_TEST_TIMEOUT_MS);
    expect(integration.hookTimeout).toBe(EXPECTED_HOOK_TIMEOUT_MS);

    // Not unlimited, deliberately — the suite must stay able to fail on a genuine hang.
    expect(integration.testTimeout).toBeGreaterThan(0);
    expect(integration.hookTimeout).toBeGreaterThan(0);
  });

  it('serialises integration files with the mechanism that is actually effective', () => {
    const integration = project('integration');

    // `poolOptions.forks.singleFork` is project-local and effective. `fileParallelism` is a
    // ROOT-level option: inside a project it is accepted, reported back, and ignored, which is
    // exactly how the previous topology managed to look correct while running files concurrently.
    expect(integration.pool).toBe('forks');
    expect(integration.poolOptions?.forks?.singleFork).toBe(true);

    expect(
      Object.hasOwn(integration as object, 'fileParallelism'),
      'fileParallelism is root-only; inside a project it does nothing and reads as though it does',
    ).toBe(false);
  });

  it('runs the budget probes under the same runtime as the real integration suite', () => {
    // Otherwise the probes prove a configuration nobody uses. The two projects are built by
    // spreading one shared object, and this is what stops that from being quietly undone.
    const integration = project('integration');
    const contract = project('config-contract');

    for (const key of ['environment', 'pool', 'testTimeout', 'hookTimeout'] as const) {
      expect(contract[key], `config-contract.${key} must match integration`).toEqual(
        integration[key],
      );
    }
    expect(contract.poolOptions).toEqual(integration.poolOptions);

    // They must still select different files, or the separation is pointless.
    expect(contract.include).not.toEqual(integration.include);
  });

  it('matches globs the way the assertions below assume — detector self-test', () => {
    // Anti-vacuity. Every inventory assertion in this file rests on `globToRegExp`; a matcher that
    // returned false for everything would make them all pass over empty sets.
    expect(
      matches(['packages/*/test/unit/**/*.test.ts'], 'packages/identity/test/unit/a.test.ts'),
    ).toBe(true);
    expect(
      matches(['packages/*/test/unit/**/*.test.ts'], 'packages/identity/test/unit/deep/a.test.ts'),
    ).toBe(true);
    expect(
      matches(
        ['packages/*/test/unit/**/*.test.ts'],
        'packages/identity/test/integration/a.test.ts',
      ),
    ).toBe(false);
    // `*` must not cross a path separator, or unit and integration would appear to overlap.
    expect(matches(['packages/*/test/unit/**/*.test.ts'], 'packages/a/b/test/unit/a.test.ts')).toBe(
      false,
    );
    expect(matches(['scripts/test/**/*.test.ts'], 'scripts/test/x.test.ts')).toBe(true);
  });

  it('assigns every test file to exactly one project — nothing runs twice, nothing disappears', () => {
    const all = allTestFiles();
    expect(all.length, 'no test files discovered at all').toBeGreaterThan(50);

    const assignments = all.map((file) => ({
      file,
      projects: projects()
        .filter((p) => matches(p.include, file))
        .map((p) => p.name),
    }));

    expect(
      assignments.filter((a) => a.projects.length > 1).map((a) => `${a.file} -> ${a.projects}`),
      'file selected by more than one project — it would execute twice',
    ).toEqual([]);

    expect(
      assignments.filter((a) => a.projects.length === 0).map((a) => a.file),
      'file selected by no project — it would silently never run',
    ).toEqual([]);
  });

  it('keeps each suite in its own project', () => {
    const owner = (file: string): string | undefined =>
      projects().find((p) => matches(p.include, file))?.name;

    // Directional spot checks: the classification a reader expects, asserted rather than assumed.
    expect(owner('packages/database/test/integration/rls.test.ts')).toBe('integration');
    expect(owner('packages/identity/test/unit/index.test.ts')).toBe('unit');
    expect(owner('scripts/test/vitest-config-contract.test.ts')).toBe('unit');
    expect(owner('packages/database/test/config-contract/test-timeout.test.ts')).toBe(
      'config-contract',
    );
  });

  it('keeps the serialization fixtures inside the real integration project', () => {
    // They prove the REAL suite serialises. Moved into `config-contract` they would prove only
    // that the probe project serialises, which is not the property anybody depends on.
    const integration = project('integration');
    for (const fixture of [
      'packages/database/test/integration/file-serialization-a.test.ts',
      'packages/database/test/integration/file-serialization-b.test.ts',
    ]) {
      expect(existsSync(join(ROOT, fixture)), `${fixture} is missing`).toBe(true);
      expect(matches(integration.include, fixture), `${fixture} left the integration project`).toBe(
        true,
      );
    }
  });

  it('keeps the budget probes free of per-test and per-hook timeout overrides', () => {
    // A probe with its own timeout argument proves the override works and says nothing about the
    // project default — which is the entire subject. This is the "fix" most likely to be applied
    // by someone shortening a slow run, so it is asserted rather than left to a comment.
    for (const probe of ['test-timeout', 'hook-timeout']) {
      const source = readFileSync(
        join(ROOT, 'packages/database/test/config-contract', `${probe}.test.ts`),
        'utf8',
      );
      expect(
        /\b(?:it|test)\s*\([^)]*,\s*[^)]*,\s*\d[\d_]*\s*\)/.test(source),
        `${probe}.test.ts passes an explicit timeout — it can no longer prove the project default`,
      ).toBe(false);
    }
  });
});
