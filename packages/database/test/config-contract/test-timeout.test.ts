import { describe, expect, it } from 'vitest';

/**
 * BEHAVIOURAL proof that the integration runtime's 60-second test budget is actually in force.
 *
 * There is already a resolved-config value saying `testTimeout: 60000`, and it has been there all
 * along. It was not true: under the workspace-file topology the integration project reported that
 * number while the runtime terminated ordinary tests at Vitest's 5000ms default, which is how a
 * handful of unrelated integration files came to die at "approximately five seconds" while waiting
 * on cluster-role provisioning. So the value is not evidence — only elapsed wall time is.
 *
 * NO PER-TEST TIMEOUT ARGUMENT. Passing one here would prove the override works and say nothing
 * about the project default, which is the entire subject. If this file is ever "fixed" by adding a
 * third argument to `it(...)`, the gate has been deleted rather than repaired.
 *
 * Lives in the `config-contract` project rather than in `integration` so that the full suite does
 * not pay six seconds on every invocation. That project is defined by spreading the SAME runtime
 * settings object the integration project uses, and `vitest-config.test.ts` asserts the two remain
 * identical — so this probe cannot drift into proving something about a configuration the real
 * suite does not run under.
 */
const SLEEP_MS = 6_000;

describe('integration runtime contract — test timeout', () => {
  it('lets an ordinary test with no per-test timeout run past the 5s default', async () => {
    const startedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, SLEEP_MS));
    const elapsedMs = Date.now() - startedAt;

    // Above Vitest's 5000ms default: had that budget applied, this test would already have been
    // terminated and this assertion would never be reached.
    expect(elapsedMs).toBeGreaterThan(5_000);

    // And still comfortably inside the configured 60s budget — a probe that ran to the ceiling
    // would pass under an unlimited budget too, which §11 explicitly rules out.
    expect(elapsedMs).toBeLessThan(60_000);
  });
});
