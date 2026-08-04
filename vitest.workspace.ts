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
      include: ['packages/*/test/unit/**/*.test.ts'],
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
