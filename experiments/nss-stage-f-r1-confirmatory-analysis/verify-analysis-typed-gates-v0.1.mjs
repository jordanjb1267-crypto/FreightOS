import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Successor verifier repair for the predecessor Phase-V string-vs-numeric comparison defect.
// The predecessor verifier remains unchanged and is rerun into a fresh output root.
globalThis.fetch = async () => { throw new Error('STAGE_F_R1_TYPED_GATE_REPAIR_NETWORK_PROHIBITED'); };

const ROOT = process.env.STAGE_F_R1_TYPED_GATE_REPAIR_OUT ?? '/data/nss1-stage-f-r1-confirmatory-analysis-phase-v-typed-gate-repair-v0.1';
const PREDECESSOR_OUT = path.join(ROOT, 'predecessor-phase-v');
const RUN_ID = 'NSS1-STAGE-F-R1-ANALYSIS-PHASE-V-TYPED-GATE-REPAIR-v0.1';
const EXPECTED_PHASE_A = 'f9cf601755cf456c4c814a0ea7f7eb4435f66231cce32e94471e645d6505f70f';
const EXPECTED_ONLY_ISSUE = 'GATE_VALUE:authority_effects:NONE:NONE';

const sha = b => createHash('sha256').update(b).digest('hex');
const exists = async f => { try { await stat(f); return true; } catch { return false; } };

if (await exists(ROOT)) {
  throw new Error('TYPED_GATE_REPAIR_OUTPUT_ALREADY_EXISTS_FAIL_CLOSED');
}
await mkdir(ROOT, { recursive: false });

process.env.STAGE_F_R1_ANALYSIS_PHASE_V_OUT = PREDECESSOR_OUT;
process.exitCode = 0;
await import('./verify-analysis.mjs');

const predecessorPath = path.join(PREDECESSOR_OUT, 'PHASE_V_RESULT.json');
if (!(await exists(predecessorPath))) throw new Error('PREDECESSOR_PHASE_V_RESULT_MISSING');
const predecessorBytes = await readFile(predecessorPath);
const predecessor = JSON.parse(predecessorBytes);

const issues = [];
const check = (ok, code) => { if (!ok) issues.push(code); };

check(predecessor.run_id === 'NSS1-STAGE-F-R1-GOLD-CONFIRMATORY-ANALYSIS-PHASE-V-v0.1', 'PREDECESSOR_RUN_ID');
check(predecessor.phase_a_result_sha256 === EXPECTED_PHASE_A, 'PHASE_A_IDENTITY');
check(predecessor.architecture_verdict === 'BLOCK', 'ARCHITECTURE_VERDICT_CHANGED');
check(Array.isArray(predecessor.issues) && predecessor.issues.length === 1 && predecessor.issues[0] === EXPECTED_ONLY_ISSUE, `PREDECESSOR_ISSUE_SET:${JSON.stringify(predecessor.issues)}`);
check(predecessor.gates?.authority_effects?.status === 'PASS', 'AUTHORITY_GATE_STATUS');
check(typeof predecessor.gates?.authority_effects?.observed === 'string', 'AUTHORITY_GATE_TYPE');
check(predecessor.gates?.authority_effects?.observed === 'NONE', 'AUTHORITY_GATE_VALUE');
check(predecessor.authority_effects === 'NONE', 'RESULT_AUTHORITY_EFFECTS');
check(predecessor.provider_calls === 0 && predecessor.jev_calls === 0 && predecessor.luna_calls === 0 && predecessor.openrouter_calls === 0 && predecessor.frontier_calls === 0, 'PROVIDER_CALL_COUNT');
check(predecessor.credentials_read === false, 'CREDENTIAL_READ');
check(predecessor.provider_replay === false, 'PROVIDER_REPLAY');
check(predecessor.source_integrity?.predecessor_unchanged === true, 'PREDECESSOR_LEDGER_MUTATION');
check(predecessor.source_integrity?.r1_unchanged === true, 'R1_LEDGER_MUTATION');
check(predecessor.gates?.c4_false_safe_events?.observed === 23, 'C4_FALSE_SAFE_COUNT_CHANGED');
check(predecessor.gates?.c4_false_safe_events?.status === 'BLOCK', 'C4_GATE_CHANGED');
check(predecessor.gates?.need_recall_delta_vs_control_pp?.status === 'INCONCLUSIVE', 'NEED_GATE_CHANGED');
check(predecessor.need_decision_rule?.pre_registered_threshold_present === false, 'NEED_THRESHOLD_CHANGED');

// Typed repair rule: numeric values retain tolerant comparison in predecessor verifier;
// nonnumeric values are admissible only when type and exact value match. The sole
// predecessor mismatch is string "NONE" vs string "NONE", so it is reconciled here.
const typedAuthorityMatch =
  typeof predecessor.gates.authority_effects.observed === 'string' &&
  predecessor.gates.authority_effects.observed === 'NONE' &&
  predecessor.authority_effects === 'NONE';
check(typedAuthorityMatch, 'TYPED_AUTHORITY_COMPARISON_FAILED');

const verified = issues.length === 0;
const result = {
  run_id: RUN_ID,
  status: verified ? 'PHASE_V_VERIFIED_AFTER_TYPED_GATE_COMPARATOR_REPAIR' : 'PHASE_V_TYPED_GATE_REPAIR_BLOCK',
  issues,
  repair_scope: 'NONNUMERIC_GATE_VALUE_EXACT_TYPE_AND_VALUE_EQUALITY_ONLY',
  predecessor_phase_v_result_sha256: sha(predecessorBytes),
  phase_a_result_sha256: EXPECTED_PHASE_A,
  architecture_verdict: predecessor.architecture_verdict,
  c4_false_safe_events: predecessor.gates.c4_false_safe_events.observed,
  c4_gate_status: predecessor.gates.c4_false_safe_events.status,
  need_recall_gate_status: predecessor.gates.need_recall_delta_vs_control_pp.status,
  need_pre_registered_threshold_present: predecessor.need_decision_rule.pre_registered_threshold_present,
  authority_effects_gate: predecessor.gates.authority_effects,
  source_integrity: predecessor.source_integrity,
  provider_calls: 0,
  jev_calls: 0,
  luna_calls: 0,
  openrouter_calls: 0,
  frontier_calls: 0,
  credentials_read: false,
  provider_replay: false,
  authority_effects: 'NONE',
  production_promotion: false
};

const out = path.join(ROOT, 'TYPED_GATE_REPAIR_RESULT.json');
await writeFile(out, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
const resultSha = sha(await readFile(out));
console.log('NSS1_STAGE_F_R1_PHASE_V_TYPED_GATE_REPAIR', JSON.stringify({ ...result, result_sha256: resultSha }));
if (!verified) process.exitCode = 2;
else process.exitCode = 0;
