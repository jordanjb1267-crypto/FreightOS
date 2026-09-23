// Independent Stage-F R1 confirmatory-analysis Phase-V Railway entry.
// Network is permitted only to materialize the exact frozen Stage-F artifact;
// verifier itself hard-disables fetch before reading source ledgers.
process.env.STAGE_F_EVIDENCE_EXTRACT_DIR = process.env.STAGE_F_EVIDENCE_EXTRACT_DIR ?? '/tmp/stage-f-verified';
await import('../nss-stage-f-runner/host-evidence-loader.mjs');
process.env.STAGE_F_GOLD_ROOT = `${process.env.STAGE_F_EVIDENCE_EXTRACT_DIR}/stage-f-evidence`;
globalThis.fetch = async () => { throw new Error('STAGE_F_R1_ANALYSIS_PHASE_V_NETWORK_PROHIBITED'); };
await import('./verify-analysis.mjs');
