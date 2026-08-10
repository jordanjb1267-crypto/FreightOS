/**
 * One harness lifecycle against whatever cluster the environment points at — a fixture, not a test.
 *
 * `harness.ts` reads FREIGHTOS_PGSOCK/FREIGHTOS_PGPORT once at module load, so a test cannot
 * retarget it after importing. Running it in a child process with those variables set is what lets
 * `fresh-install-authority.test.ts` exercise the REAL `TestDatabase.reset()` against its private
 * ephemeral cluster instead of the shared one — and reusing the harness is the point: a
 * reimplementation of the lifecycle here would prove something other than the lifecycle.
 *
 * Deliberately `.mts` rather than `.test.ts`: the integration project globs `**\/*.test.ts`, so this
 * is never collected as a test in its own right.
 */
import { TestDatabase } from '../harness.ts';

const name = process.argv[2] ?? 'freightos_first_run';
await new TestDatabase(name).reset();
process.exit(0);
