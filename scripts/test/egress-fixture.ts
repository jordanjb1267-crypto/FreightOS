import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * N7B-G1 — the isolated scan tree the egress negative controls mutate INSTEAD of the repository.
 *
 * The hazard this replaces: the controls used to plant primitives — `COPY … TO PROGRAM` above all —
 * in REAL repository files and restore them afterwards. Restoration was reliable; the WINDOW was
 * the defect. A migration file is executable input, and any concurrent process that loaded the
 * migration directory during the window observed, and would have executed, the planted statement.
 * That is not a theoretical race: it produced a real false failure during N7-A verification.
 *
 * So: the real tree is immutable during tests. Each control copies the scan surface here, mutates
 * the COPY, points the gate at it via `FREIGHTOS_EGRESS_SCAN_ROOT`, and destroys it. The copy
 * lives under the OS temp directory — OUTSIDE the repository — so no walker, migrator, compiler or
 * git operation inside the repo can ever encounter it, and `mkdtemp` gives every fixture a unique
 * root so concurrent controls cannot collide.
 *
 * WHAT IS COPIED is exactly the surface the gates scan, nothing more:
 *
 *     package.json                              (root manifest)
 *     packages/<pkg>/package.json               (per-package manifests)
 *     packages/<pkg>/src/**                     (runtime TypeScript)
 *     packages/database/migrations/*.sql        (executable SQL)
 *     config/network/egress-allowlist.json      (the governed manifest the allowlist gate audits)
 *
 * Paths inside the copy mirror the repository layout because `resolveScanRoot` demands it and the
 * scanners' findings are named root-relative — a finding in a fixture reads identically to the
 * same finding in the real tree, which is what lets one assertion serve both.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export interface EgressFixture {
  /** Absolute root of the copied tree — the value handed to FREIGHTOS_EGRESS_SCAN_ROOT. */
  readonly root: string;
  /** Absolute path of a repo-relative file inside the COPY. */
  readonly path: (repoRelative: string) => string;
  /** Destroy the copied tree. Safe to call more than once; called from afterEach so a failing
   *  assertion cannot leak a tree. */
  readonly dispose: () => void;
}

export function createEgressFixture(): EgressFixture {
  const root = mkdtempSync(join(tmpdir(), 'freightos-egress-fixture-'));

  cpSync(join(ROOT, 'package.json'), join(root, 'package.json'));
  mkdirSync(join(root, 'config', 'network'), { recursive: true });
  cpSync(
    join(ROOT, 'config', 'network', 'egress-allowlist.json'),
    join(root, 'config', 'network', 'egress-allowlist.json'),
  );

  const packagesDir = join(ROOT, 'packages');
  for (const pkg of readdirSync(packagesDir).sort()) {
    const src = join(packagesDir, pkg, 'src');
    const manifest = join(packagesDir, pkg, 'package.json');
    mkdirSync(join(root, 'packages', pkg), { recursive: true });
    if (existsSync(manifest)) cpSync(manifest, join(root, 'packages', pkg, 'package.json'));
    if (existsSync(src)) cpSync(src, join(root, 'packages', pkg, 'src'), { recursive: true });
  }
  cpSync(
    join(packagesDir, 'database', 'migrations'),
    join(root, 'packages', 'database', 'migrations'),
    {
      recursive: true,
    },
  );

  return {
    root,
    path: (repoRelative: string) => join(root, repoRelative),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}
