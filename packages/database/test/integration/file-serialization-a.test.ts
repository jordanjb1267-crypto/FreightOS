import { describe, expect, it } from 'vitest';

import { holdExclusively } from './exclusive-sentinel.ts';

/**
 * Half of the anti-vacuity gate for integration file serialization. Its partner is
 * `file-serialization-b.test.ts`; neither proves anything alone, and that is the design — a single
 * file cannot overlap with itself.
 *
 * This pair exists because "no two integration files run at once" was previously believed on the
 * strength of a resolved-config value (`fileParallelism: false`, `maxWorkers: 1`) that the runtime
 * did not honour. Roughly eight worker processes ran anyway, several integration databases were
 * live at once, and unrelated files died on ROLE_SETUP_LOCK contention. A configuration value that
 * reads correctly and does nothing is worse than an absent one, so the invariant is asserted
 * against observed behaviour instead.
 *
 * The hold is deliberately short. It runs on every full integration invocation, so it must cost
 * little; the long-running budget probes live in the separate `config-contract` project precisely
 * so they do not.
 */
const HOLD_MS = 400;

describe('integration file serialization — fixture A', () => {
  it('holds the exclusive sentinel without fixture B overlapping it', async () => {
    const hold = await holdExclusively('file-serialization-a', HOLD_MS);

    expect(hold.owner).toBe('file-serialization-a');
    expect(hold.heldMs).toBeGreaterThanOrEqual(HOLD_MS);
  });
});
