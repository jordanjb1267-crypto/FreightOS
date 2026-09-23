// Durable-volume Railway entry for the Stage-F R1 Phase-V typed-gate repair.
// Network is used only to materialize the exact frozen Stage-F gold archive.

process.env.STAGE_F_EVIDENCE_EXTRACT_DIR = process.env.STAGE_F_EVIDENCE_EXTRACT_DIR ?? '/tmp/stage-f-verified-typed-gate-repair';
await import('../nss-stage-f-runner/host-evidence-loader.mjs');
process.env.STAGE_F_GOLD_ROOT = `${process.env.STAGE_F_EVIDENCE_EXTRACT_DIR}/stage-f-evidence`;
process.env.STAGE_F_SOURCE_LEDGER_ROOT = process.env.STAGE_F_SOURCE_LEDGER_ROOT ?? '/data/nss1-stage-f-provider-v0.2';
process.env.STAGE_F_R1_LEDGER_ROOT = process.env.STAGE_F_R1_LEDGER_ROOT ?? '/data/nss1-stage-f-jev-remediation-r1-v0.1';
process.env.STAGE_F_R1_ANALYSIS_OUT = process.env.STAGE_F_R1_ANALYSIS_OUT ?? '/data/nss1-stage-f-r1-confirmatory-analysis-v0.1';
process.env.STAGE_F_R1_TYPED_GATE_REPAIR_OUT = process.env.STAGE_F_R1_TYPED_GATE_REPAIR_OUT ?? '/data/nss1-stage-f-r1-confirmatory-analysis-phase-v-typed-gate-repair-v0.1';

globalThis.fetch = async () => { throw new Error('STAGE_F_R1_TYPED_GATE_REPAIR_NETWORK_PROHIBITED'); };
await import('./verify-analysis-typed-gates-v0.1.mjs');
