process.env.STAGE_F_EVIDENCE_EXTRACT_DIR=process.env.STAGE_F_EVIDENCE_EXTRACT_DIR??'/tmp/stage-f-verified';
await import('./host-evidence-loader.mjs');
process.env.STAGE_F_EVIDENCE_ROOT=`${process.env.STAGE_F_EVIDENCE_EXTRACT_DIR}/stage-f-evidence`;
await import('./phase-w-program.mjs');
