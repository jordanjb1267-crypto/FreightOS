import { defineWorkspace } from 'vitest/config';

/**
 * Two projects, deliberately separated.
 *
 * `unit` must run with no external dependency so it stays fast and always available.
 * `integration` requires a live PostgreSQL 16 and is the only place RLS, append-only audit,
 * kill-switch precedence, and migration recovery can actually be proven. The handoff rejects
 * "tests passed" without evidence, and unit tests alone cannot evidence tenant isolation.
 */
export default defineWorkspace([
  {
    test: {
      name: 'unit',
      // scripts/ is repository tooling rather than a workspace package, and its tests live beside
      // it: the layering validator refuses a cross-package relative import, and a test for a script
      // parked inside a package would be exactly that — R2-03.
      include: ['packages/*/test/unit/**/*.test.ts', 'scripts/test/**/*.test.ts'],
      environment: 'node',
      // THE REPOSITORY TREE IS A SHARED MUTABLE RESOURCE HERE, exactly as one database is for the
      // integration project.
      //
      // `scripts/test/network-governance.test.ts` proves the governance validator actually detects
      // tampering, and the only way to prove that is to tamper: it edits and DELETES
      // manifest-protected artifacts, then restores them in `afterEach`. Meanwhile
      // `network-schemas.test.ts`, `n3-durable-refs.test.ts` and
      // `network-schema-packaging.test.ts` read those same files to compile and hash-pin the
      // governed contracts. Run in parallel workers, a reader can land inside the mutation window
      // and fail with ENOENT on a protected artifact — which reads as governance tampering rather
      // than as the scheduling accident it is.
      //
      // Serialising costs about five seconds across the whole unit suite. A gate that fails
      // intermittently, in a way that mimics the exact incident it exists to detect, costs more.
      fileParallelism: false,
    },
  },
  {
    test: {
      name: 'integration',
      include: ['packages/*/test/integration/**/*.test.ts'],
      environment: 'node',
      // Migrations and RLS role setup share one database; parallel files would race.
      fileParallelism: false,
      testTimeout: 60_000,
      hookTimeout: 60_000,
    },
  },
]);
