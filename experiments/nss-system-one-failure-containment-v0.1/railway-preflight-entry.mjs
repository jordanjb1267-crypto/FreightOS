globalThis.fetch = async () => { throw new Error('S1FC_PREFLIGHT_ENTRY_NETWORK_PROHIBITED'); };
await import('./generate-fixture.mjs');
await import('./preflight.mjs');
