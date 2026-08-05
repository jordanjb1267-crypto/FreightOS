import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repositoryRoot } from '../../src/paths.ts';

/**
 * F-17 — the lockfile has to describe the workspace it locks.
 *
 * `pnpm install --frozen-lockfile` is what CI runs, and it compares each workspace package's
 * manifest against that package's `importers` entry. A package with dependencies and no entry is a
 * package whose dependency changes CI cannot see: the install succeeds, the lockfile stays stale,
 * and the resolved tree in CI stops matching the one a developer gets.
 *
 * `packages/identity` was in that position — it had a dependency and no importer — until it was
 * declared as part of F-11.
 *
 * A package with no dependencies at all has no entry either, and correctly so: pnpm omits them, so
 * demanding one would mean writing something `pnpm install` removes again on the next run. The
 * rule is therefore stated as it actually holds, and byte stability is asserted alongside it so
 * "the lockfile is complete" and "the lockfile is what pnpm would write" are both evidenced rather
 * than one standing in for the other.
 */
const root = repositoryRoot();
const lockfile = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8');

/** Top-level keys under `importers:` — one per workspace package pnpm is tracking. */
function lockfileImporters(): Set<string> {
  const lines = lockfile.split('\n');
  const start = lines.findIndex((line) => line === 'importers:');
  const names = new Set<string>();
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (line.length > 0 && !line.startsWith(' ')) break;
    const match = /^ {2}(\S.*):$/.exec(line);
    if (match) names.add(match[1]!);
  }
  return names;
}

function workspacePackages() {
  const packagesDir = join(root, 'packages');
  return readdirSync(packagesDir)
    .filter((entry) => statSync(join(packagesDir, entry)).isDirectory())
    .map((entry) => ({
      path: `packages/${entry}`,
      manifest: JSON.parse(readFileSync(join(packagesDir, entry, 'package.json'), 'utf8')),
    }));
}

describe('the lockfile describes the workspace — F-17', () => {
  it('carries an importer for every package that has dependencies', () => {
    const importers = lockfileImporters();
    const missing = workspacePackages()
      .filter(
        ({ manifest }) =>
          Object.keys(manifest.dependencies ?? {}).length > 0 ||
          Object.keys(manifest.devDependencies ?? {}).length > 0 ||
          Object.keys(manifest.peerDependencies ?? {}).length > 0,
      )
      .filter(({ path }) => !importers.has(path))
      .map(({ path }) => path);

    // Named rather than counted: a failure should say which package to install for.
    expect(missing).toEqual([]);
  });

  it('names no importer for a package that is not in the workspace', () => {
    const onDisk = new Set(workspacePackages().map((p) => p.path));
    const stale = [...lockfileImporters()].filter((name) => name !== '.' && !onDisk.has(name));
    expect(stale).toEqual([]);
  });

  it('is byte-identical to what pnpm would write', () => {
    // The half that catches drift the importer check cannot: a resolution that changed, a
    // specifier edited by hand, a merge that left the file plausible but not reproducible.
    // --lockfile-only touches no node_modules, so this is safe to run inside a test.
    const before = createHash('sha256').update(lockfile).digest('hex');
    execFileSync('pnpm', ['install', '--lockfile-only', '--silent'], { cwd: root, stdio: 'ignore' });
    const after = createHash('sha256')
      .update(readFileSync(join(root, 'pnpm-lock.yaml')))
      .digest('hex');
    expect(after).toBe(before);
  }, 120_000);
});
