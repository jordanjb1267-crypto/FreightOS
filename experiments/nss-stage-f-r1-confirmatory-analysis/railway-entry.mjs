// Stage-F R1 confirmatory analysis Railway entry.
// Evidence transport is allowed; provider/model network execution is not.
process.env.STAGE_F_EVIDENCE_EXTRACT_DIR = process.env.STAGE_F_EVIDENCE_EXTRACT_DIR ?? '/tmp/stage-f-verified';
await import('../nss-stage-f-runner/host-evidence-loader.mjs');
process.env.STAGE_F_GOLD_ROOT = `${process.env.STAGE_F_EVIDENCE_EXTRACT_DIR}/stage-f-evidence`;
// After content-addressed evidence materialization, hard-disable all further fetch.
globalThis.fetch = async () => { throw new Error('STAGE_F_R1_CONFIRMATORY_PROVIDER_NETWORK_PROHIBITED'); };
await import('./analyze.mjs');
