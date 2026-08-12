import { beforeAll, describe, expect, it } from 'vitest';

/**
 * BEHAVIOURAL proof that the integration runtime's 60-second HOOK budget is in force.
 *
 * Separate from the test-timeout probe because they are separate budgets with separate defaults —
 * 5000ms for tests, 10000ms for hooks — and the integration suite depends far more heavily on the
 * hook one: `beforeAll` is where databases are created, migrations are driven to tip and cluster
 * roles are provisioned under ROLE_SETUP_LOCK. A hook budget silently sitting at 10 seconds is the
 * shape of failure that looks like a flaky database rather than a configuration defect.
 *
 * The sleep exceeds the 10000ms default hook timeout and stays far below 60000ms, so it
 * discriminates between the two in both directions. NO PER-HOOK TIMEOUT ARGUMENT, for the same
 * reason the test probe takes none.
 *
 * `0` / unlimited is explicitly not the target: the suite must stay able to detect a genuine hang.
 */
const HOOK_SLEEP_MS = 12_000;

let hookElapsedMs = 0;

describe('integration runtime contract — hook timeout', () => {
  beforeAll(async () => {
    const startedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, HOOK_SLEEP_MS));
    hookElapsedMs = Date.now() - startedAt;
  });

  it('lets a beforeAll with no per-hook timeout run past the 10s default', () => {
    // Reaching this test at all is most of the proof: a hook that overran its budget fails the
    // suite before any test in the block executes.
    expect(hookElapsedMs).toBeGreaterThan(10_000);
    expect(hookElapsedMs).toBeLessThan(60_000);
  });
});
