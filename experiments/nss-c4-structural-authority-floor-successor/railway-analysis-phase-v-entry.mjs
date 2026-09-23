globalThis.fetch = async () => { throw new Error('C4_FRESH_ANALYSIS_PHASE_V_NETWORK_PROHIBITED'); };
await import('./analyze-fresh-result.mjs');
await import('./verify-fresh-result.mjs');
