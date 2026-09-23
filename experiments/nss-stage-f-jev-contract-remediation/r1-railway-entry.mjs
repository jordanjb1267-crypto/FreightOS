import path from 'node:path';

const extractRoot = process.env.STAGE_F_EVIDENCE_EXTRACT_DIR ?? '/tmp/stage-f-verified';
process.env.STAGE_F_EVIDENCE_EXTRACT_DIR = extractRoot;

await import('../nss-stage-f-runner/host-evidence-loader.mjs');

process.env.STAGE_F_EVIDENCE_ROOT = path.join(extractRoot, 'stage-f-evidence');
await import('./r1-runner.mjs');
