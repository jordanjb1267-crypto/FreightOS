// Durable-volume Railway entry for Stage-F R1 C4 false-safe forensic attribution.
// Network is permitted only to materialize the exact frozen Stage-F gold archive.

process.env.STAGE_F_EVIDENCE_EXTRACT_DIR = process.env.STAGE_F_EVIDENCE_EXTRACT_DIR ?? '/tmp/stage-f-verified-c4-forensic';
await import('../nss-stage-f-runner/host-evidence-loader.mjs');
process.env.STAGE_F_GOLD_ROOT = `${process.env.STAGE_F_EVIDENCE_EXTRACT_DIR}/stage-f-evidence`;
process.env.STAGE_F_SOURCE_LEDGER_ROOT = process.env.STAGE_F_SOURCE_LEDGER_ROOT ?? '/data/nss1-stage-f-provider-v0.2';
process.env.STAGE_F_R1_LEDGER_ROOT = process.env.STAGE_F_R1_LEDGER_ROOT ?? '/data/nss1-stage-f-jev-remediation-r1-v0.1';
process.env.STAGE_F_R1_TYPED_GATE_REPAIR_OUT = process.env.STAGE_F_R1_TYPED_GATE_REPAIR_OUT ?? '/data/nss1-stage-f-r1-confirmatory-analysis-phase-v-typed-gate-repair-v0.1';
process.env.STAGE_F_R1_C4_FORENSIC_OUT = process.env.STAGE_F_R1_C4_FORENSIC_OUT ?? '/data/nss1-stage-f-r1-c4-false-safe-forensic-v0.1';
process.env.STAGE_F_R1_C4_FORENSIC_VERIFY_OUT = process.env.STAGE_F_R1_C4_FORENSIC_VERIFY_OUT ?? '/data/nss1-stage-f-r1-c4-false-safe-forensic-phase-v-v0.1';

globalThis.fetch = async () => { throw new Error('STAGE_F_R1_C4_FORENSIC_NETWORK_PROHIBITED'); };
await import('./analyze.mjs');
if (process.exitCode && process.exitCode !== 0) throw new Error('C4_FORENSIC_PHASE_A_BLOCK');
await import('./verify.mjs');
