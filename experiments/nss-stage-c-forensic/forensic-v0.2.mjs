import { readFile } from 'node:fs/promises';

// Surgical successor to forensic.mjs. This wrapper patches only the two verifier
// defects authorized by NSS1_STAGE_C_FORENSIC_V0_1_FAIL_CLOSED_VERIFIER_DEFECT_RESULT_V0_1.
// The imported verifier retains its hard provider/network prohibition.
let src = await readFile(new URL('./forensic.mjs', import.meta.url), 'utf8');

function patchOnce(needle, replacement, code) {
  const first = src.indexOf(needle);
  if (first < 0) throw new Error(`FORENSIC_V0_2_PATCH_TARGET_MISSING:${code}`);
  if (src.indexOf(needle, first + needle.length) >= 0) throw new Error(`FORENSIC_V0_2_PATCH_TARGET_AMBIGUOUS:${code}`);
  src = src.replace(needle, replacement);
}

patchOnce(
  "const FORENSIC_ROOT = '/data/nss1-stage-c-forensic-v0.1';",
  "const FORENSIC_ROOT = '/data/nss1-stage-c-forensic-v0.2';",
  'FORENSIC_ROOT'
);

patchOnce(
  "function eqArray(a, b) { return JSON.stringify(a) === JSON.stringify(b); }",
  "function eqArray(a, b) { return JSON.stringify([...(a??[])].sort()) === JSON.stringify([...(b??[])].sort()); }",
  'QUESTION_ID_SET_EQUIVALENCE'
);

patchOnce(
  "  check(approx(stored.candidate?.metrics?.luna_suppression, candidateMetrics.luna_suppression), 'CANDIDATE_SUPPRESSION_MISMATCH');\n  check(stored.candidate?.metrics?.safety_floor_applications === candidateMetrics.safety_floor_applications, 'CANDIDATE_FLOOR_APPLICATIONS_MISMATCH');",
  "  check(approx(stored.result?.candidate?.luna_suppression, candidateMetrics.luna_suppression), 'RESULT_CANDIDATE_SUPPRESSION_MISMATCH');\n  check(stored.result?.candidate?.safety_floor_applications === candidateMetrics.safety_floor_applications, 'RESULT_CANDIDATE_FLOOR_APPLICATIONS_MISMATCH');",
  'RESULT_ARTIFACT_SHAPE'
);

src = src.replaceAll('NSS1-STAGE-C-FORENSIC-v0.1', 'NSS1-STAGE-C-FORENSIC-v0.2');

// Execute as an isolated data module so the v0.1 source remains immutable.
await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
