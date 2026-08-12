import { defineConfig } from 'vitest/config';

/**
 * ONE Vitest configuration for the repository.
 *
 * This replaces `vitest.workspace.ts`. The workspace file is deprecated in Vitest 3.2 and removed
 * in the next major, but the reason for moving is not the deprecation notice — it is that the
 * workspace topology made a project option silently ineffective, and there is no way to tell an
 * effective option from an ignored one by reading the file. `fileParallelism: false` sat in the
 * integration project and read as an instruction; the runtime ran integration files concurrently
 * anyway, and `createVitest` reported `fileParallelism: false, maxWorkers: 1` while doing it. A
 * configuration that reads correctly and does nothing is worse than an absent one, because it
 * stops anyone looking further.
 *
 * So the rule this file follows is: an option is placed where it is EFFECTIVE, and where an
 * intended option is known not to be effective at that level, the mechanism that actually works is
 * used instead and the reason is written down. Every property below is proven by a runtime probe,
 * not by reading it back out of the resolved config — see `packages/database/test/config-contract/`
 * and `scripts/test/vitest-config-contract.test.ts`.
 */

/**
 * The runtime the integration suite needs, in one object, spread into every project that must
 * behave like the integration suite.
 *
 * It is a shared constant rather than duplicated literals because the budget probes have to run
 * under the SAME configuration the real suite runs under — otherwise they prove something about a
 * configuration nobody uses. Sharing the object makes that structural rather than a promise, and
 * `vitest-config-contract.test.ts` asserts the two projects still resolve identically.
 */
const integrationRuntime = {
  environment: 'node',

  /**
   * THE SERIALIZATION MECHANISM, and the one line that actually does it.
   *
   * Integration files share one PostgreSQL cluster. Databases are per file, but ROLES and
   * `pg_auth_members` are cluster-global, so every file that provisions a role races every other
   * file that does — which is why `ROLE_SETUP_LOCK` exists, and why waits on it reached 18.68s
   * with roughly eight Vitest processes live at once.
   *
   * `fileParallelism` is a ROOT-level option. Set inside a project it is accepted, reported back
   * by `createVitest`, and ignored — that is precisely the defect this file exists to remove, so
   * it is deliberately NOT written here in the hope that it works. `poolOptions.forks.singleFork`
   * is project-local and effective: it puts every file of the project in one fork, executed one
   * after another. This is the same mechanism the unit project has used since the governance-test
   * race, chosen there for the same reason and measured the same way.
   *
   * Choosing it project-locally rather than setting root `fileParallelism: false` keeps the choice
   * scoped: the root option would serialize every project at once, including any future project
   * that has no shared-resource problem.
   */
  pool: 'forks',
  poolOptions: { forks: { singleFork: true } },

  /**
   * Sixty seconds, and NOT because integration tests are slow — uncontended they are not.
   *
   * It is a queueing budget. A test that waits on `ROLE_SETUP_LOCK` is behaving correctly while it
   * waits, and the wait is bounded by what the other holders are doing rather than by anything the
   * waiting test controls. Vitest's 5000ms default is a reasonable number for a unit test and the
   * wrong number for a cluster-global primitive.
   *
   * Not `0`/unlimited, deliberately: the suite must still be able to fail on a genuine hang.
   */
  testTimeout: 60_000,

  /**
   * The same budget for hooks, and arguably the more important of the two — `beforeAll` is where
   * databases are created, migrations are driven to tip and roles are provisioned under the lock.
   * Vitest's hook default is 10000ms, which is the shape of failure that reads as a flaky database
   * rather than as a configuration defect.
   */
  hookTimeout: 60_000,
} as const;

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          // scripts/ is repository tooling rather than a workspace package, and its tests live
          // beside it: the layering validator refuses a cross-package relative import, and a test
          // for a script parked inside a package would be exactly that — R2-03.
          include: ['packages/*/test/unit/**/*.test.ts', 'scripts/test/**/*.test.ts'],
          environment: 'node',
          // THE REPOSITORY TREE IS A SHARED MUTABLE RESOURCE HERE, exactly as one cluster is for
          // the integration project.
          //
          // `scripts/test/network-governance.test.ts` proves the governance validator actually
          // detects tampering, and the only way to prove that is to tamper: it edits and DELETES
          // manifest-protected artifacts, then restores them in `afterEach`. Meanwhile
          // `network-schemas.test.ts`, `n3-durable-refs.test.ts` and
          // `network-schema-packaging.test.ts` read those same files to compile and hash-pin the
          // governed contracts. Run in parallel workers, a reader can land inside the mutation
          // window and fail with ENOENT on a protected artifact — which reads as governance
          // tampering rather than as the scheduling accident it is.
          //
          // `poolOptions.singleFork` is what puts every file in one process; the give-away when it
          // was introduced was `prepare`, 2.09s of worker startup becoming 84ms. It is also
          // FASTER, 4.1s → 3.6s, because one process replaces a dozen worker startups, so the
          // usual serialisation trade-off does not apply and there is nothing to weigh.
          //
          // `threads.singleThread` is carried over unchanged from the workspace file. It is inert
          // while the pool is `forks`, and this task is not the place to remove it: doing so would
          // be an unrelated change to a project whose behaviour must be preserved exactly.
          poolOptions: { forks: { singleFork: true }, threads: { singleThread: true } },
        },
      },
      {
        test: {
          ...integrationRuntime,
          name: 'integration',
          include: ['packages/*/test/integration/**/*.test.ts'],
        },
      },
      {
        /**
         * The configuration-contract project: probes that prove the integration runtime is real.
         *
         * Separate from `integration` only so the full suite does not pay their deliberate sleeps
         * on every invocation — 6s to outlast the 5000ms test default, 12s to outlast the 10000ms
         * hook default. They are not a different configuration: the spread above is the same
         * object the integration project uses, and the structural gate fails if the two ever
         * resolve differently.
         */
        test: {
          ...integrationRuntime,
          name: 'config-contract',
          include: ['packages/*/test/config-contract/**/*.test.ts'],
        },
      },
    ],
  },
});
