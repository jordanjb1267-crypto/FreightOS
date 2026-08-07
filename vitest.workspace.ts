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
