import { describe, expect, it } from 'vitest';

import { holdExclusively } from './exclusive-sentinel.ts';

/**
 * The other half of the serialization gate — see `file-serialization-a.test.ts` for why the pair
 * exists. Whichever of the two is scheduled second is the one that fails under parallel file
 * execution, so both carry the same assertion rather than one asserting and one merely sleeping.
 */
const HOLD_MS = 400;

describe('integration file serialization — fixture B', () => {
  it('holds the exclusive sentinel without fixture A overlapping it', async () => {
    const hold = await holdExclusively('file-serialization-b', HOLD_MS);

    expect(hold.owner).toBe('file-serialization-b');
    expect(hold.heldMs).toBeGreaterThanOrEqual(HOLD_MS);
  });
});
