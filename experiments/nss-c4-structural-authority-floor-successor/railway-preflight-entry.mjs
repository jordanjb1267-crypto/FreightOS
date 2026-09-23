globalThis.fetch = async () => { throw new Error('C4_STRUCTURAL_FLOOR_PREFLIGHT_NETWORK_PROHIBITED'); };

await import('./generate-heldout.mjs');
await import('./preflight.mjs');
