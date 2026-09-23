import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Independent Phase V verifier. No provider/runner imports and no network I/O.
globalThis.fetch = async () => { throw new Error('PHASE_V_NETWORK_PROHIBITED'); };

const RUN_ID = 'NSS1-STAGE-F-R1-PHASE-V-v0.3';
const R1_RUN_ID = 'NSS1-STAGE-F-JEV-REMEDIATION-R1-v0.1';
const SOURCE_ROOT = process.env.STAGE_F_SOURCE_LEDGER_ROOT ?? '/data/nss1-stage-f-provider-v0.2';
const R1_ROOT = process.env.STAGE_F_R1_LEDGER_ROOT ?? '/data/nss1-stage-f-jev-remediation-r1-v0.1';
const OUT_ROOT = process.env.STAGE_F_R1_PHASE_V_OUT ?? '/data/nss1-stage-f-r1-phase-v-v0.3';
const EXPECTED = Object.freeze({
  predecessorIndex: '2e50185fa5d4ee5c3f137ccfbb4283d5a8964e6e3d53288a29043ee8f9d207e7',
  r1Index: 'b47252de25cc86dc6bf94f4c52ac7f44f21faabb1db13a41801400b35944b900',
  runnerManifest: 'a25b395fb70a571bea8711d1354a6032772a553468da8d005100aed4f3b386b8',
  qset: '0e8c01c8d98e2fbbeb9f7b034ef638dcf11df0f9f2189834322830bb0b758bcb',
  providerMatrix: '8135ad29cf2c13d0c433de6a4825d0395889d0c25ef6556e873048728bba9ff8',
  requestedModel: 'jev-latest',
  effectiveModel: 'jev-1.13.0'
});
const sha = b => createHash('sha256').update(b).digest('hex');
const rawHash = async f => sha(await readFile(f));
const json = async f => JSON.parse(await readFile(f, 'utf8'));
const listJson = async d => { try { return (await readdir(d)).filter(x => x.endsWith('.json')).sort(); } catch { return []; } };
const listTxt = async d => { try { return (await readdir(d)).filter(x => x.endsWith('.txt')).sort(); } catch { return []; } };
const issues = [];
const check = (v, code) => { if (!v) issues.push(code); };
const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
const sameSortedStrings = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const verifierSha256 = await rawHash(fileURLToPath(import.meta.url));
let predecessorIndex = [], r1Index = [], predecessorJevEventIds = [];
const statusCounts = {}, modelCounts = {}, predecessorJevStatusCounts = {};
let rawVerified = 0, attemptsVerified = 0;
let exactPredecessorJevEventSetMatch = false;

try {
  const fp = path.join(SOURCE_ROOT, 'RECEIPT_INDEX.json');
  check((await rawHash(fp)) === EXPECTED.predecessorIndex, 'PREDECESSOR_INDEX_HASH_MISMATCH');
  predecessorIndex = await json(fp);
  check(predecessorIndex.length === 400, `PREDECESSOR_COUNT:${predecessorIndex.length}`);
  const pc = {};
  for (const row of predecessorIndex) {
    bump(pc, row.provider);
    if (row.provider === 'jev') {
      predecessorJevEventIds.push(row.event_id);
      bump(predecessorJevStatusCounts, row.status);
    }
    const rp = path.join(SOURCE_ROOT, 'receipts', row.provider, `${row.event_id}.json`);
    check((await rawHash(rp)) === row.receipt_sha256, `PREDECESSOR_RECEIPT_HASH:${row.event_id}`);
  }
  predecessorJevEventIds.sort();
  check(pc.luna === 240, `PREDECESSOR_LUNA:${pc.luna ?? 0}`);
  check(pc.jev === 160, `PREDECESSOR_JEV:${pc.jev ?? 0}`);
  check(predecessorJevEventIds.length === 160 && new Set(predecessorJevEventIds).size === 160, 'PREDECESSOR_JEV_EVENT_SET_CARDINALITY');
  check(predecessorJevStatusCounts.PROVIDER_ERROR === 160 && Object.keys(predecessorJevStatusCounts).length === 1,
    `PREDECESSOR_JEV_STATUS_DOMAIN:${JSON.stringify(predecessorJevStatusCounts)}`);
} catch (e) { issues.push(`PREDECESSOR_READ:${e?.message ?? e}`); }

try {
  const idxPath = path.join(R1_ROOT, 'RECEIPT_INDEX.json');
  check((await rawHash(idxPath)) === EXPECTED.r1Index, 'R1_INDEX_HASH_MISMATCH');
  r1Index = await json(idxPath);
  check(r1Index.length === 160, `R1_INDEX_COUNT:${r1Index.length}`);
  check(new Set(r1Index.map(x => x.event_id)).size === 160, 'R1_DUPLICATE_EVENT_ID');
  check(r1Index.every((x, i, a) => i === 0 || a[i - 1].event_id.localeCompare(x.event_id) < 0), 'R1_INDEX_ORDER');

  const actualR1EventIds = r1Index.map(row => row.event_id).sort();
  exactPredecessorJevEventSetMatch = sameSortedStrings(predecessorJevEventIds, actualR1EventIds);
  check(exactPredecessorJevEventSetMatch, 'R1_EVENT_SET_NOT_EXACT_PREDECESSOR_JEV_SET');

  for (const row of r1Index) {
    const receiptPath = path.join(R1_ROOT, 'receipts', 'jev', `${row.event_id}.json`);
    const attemptPath = path.join(R1_ROOT, 'attempts', 'jev', `${row.event_id}.json`);
    const rawPath = path.join(R1_ROOT, 'raw', 'jev', `${row.event_id}.txt`);
    check((await rawHash(receiptPath)) === row.receipt_sha256, `R1_RECEIPT_HASH:${row.event_id}`);
    const r = await json(receiptPath), a = await json(attemptPath);
    check(r.run_id === R1_RUN_ID, `R1_RUN_ID:${row.event_id}`);
    check(r.event_id === row.event_id, `R1_EVENT_BINDING:${row.event_id}`);
    check(r.provider === 'jev' && row.provider === 'jev', `R1_PROVIDER:${row.event_id}`);
    check(r.status === 'OK' && row.status === 'OK', `R1_STATUS:${row.event_id}`);
    check(r.requested_model === EXPECTED.requestedModel, `R1_REQUESTED_MODEL:${row.event_id}`);
    check(r.effective_model === EXPECTED.effectiveModel, `R1_EFFECTIVE_MODEL:${row.event_id}`);
    check(r.question_set_sha256 === EXPECTED.qset, `R1_QSET:${row.event_id}`);
    check(r.current_state_application === false, `R1_CURRENT_STATE_APPLICATION:${row.event_id}`);
    check(r.error === null, `R1_ERROR:${row.event_id}`);
    check(r.normalized_judgments && typeof r.normalized_judgments === 'object', `R1_NORMALIZATION:${row.event_id}`);
    const rh = await rawHash(rawPath);
    check(rh === r.raw_response_sha256 && rh === row.raw_response_sha256, `R1_RAW_HASH:${row.event_id}`);
    const raw = await json(rawPath);
    check(raw.model === EXPECTED.effectiveModel, `R1_RAW_MODEL:${row.event_id}`);
    check(raw.answers && typeof raw.answers === 'object', `R1_RAW_ANSWERS:${row.event_id}`);
    rawVerified++;
    check(a.run_id === R1_RUN_ID && a.event_id === row.event_id && a.provider === 'jev' && a.status === 'STARTED', `R1_ATTEMPT:${row.event_id}`);
    check(a.bound_state_sha256 === r.bound_state_sha256, `R1_ATTEMPT_STATE:${row.event_id}`);
    check(a.question_set_sha256 === r.question_set_sha256, `R1_ATTEMPT_QSET:${row.event_id}`);
    check(a.requested_model === r.requested_model, `R1_ATTEMPT_MODEL:${row.event_id}`);
    attemptsVerified++;
    bump(statusCounts, r.status);
    bump(modelCounts, r.effective_model);
  }

  check((await listJson(path.join(R1_ROOT, 'receipts', 'jev'))).length === 160, 'R1_RECEIPT_FILE_COUNT');
  check((await listJson(path.join(R1_ROOT, 'attempts', 'jev'))).length === 160, 'R1_ATTEMPT_FILE_COUNT');
  check((await listTxt(path.join(R1_ROOT, 'raw', 'jev'))).length === 160, 'R1_RAW_FILE_COUNT');
  const w = await json(path.join(R1_ROOT, 'PHASE_W_RESULT.json'));
  check(w.run_id === R1_RUN_ID, `PHASE_W_RUN_ID:${w.run_id}`);
  check(w.status === 'WRITE_COMPLETE_UNVERIFIED', `PHASE_W_STATUS:${w.status}`);
  check(w.runner_execution_manifest_sha256 === EXPECTED.runnerManifest, 'PHASE_W_RUNNER_MANIFEST');
  check(w.receipt_index_sha256 === EXPECTED.r1Index, 'PHASE_W_INDEX_HASH');
  check(w.terminal_receipts === 160 && w.ok_receipts === 160 && w.non_ok_receipts === 0 && w.orchestration_uncertain === 0, 'PHASE_W_COUNTS');
  check(w.new_provider_calls_planned === 160 && w.reused_luna_control_receipts === 240 && w.reused_luna_candidate_fallback_receipts === 80, 'PHASE_W_DENOMINATOR');
  check(w.openrouter_calls === 0 && w.frontier_calls === 0 && w.live_effects === 0 && w.authority_effects === 'NONE', 'PHASE_W_PROHIBITED_EFFECTS');
} catch (e) { issues.push(`R1_READ:${e?.message ?? e}`); }

check(statusCounts.OK === 160 && Object.keys(statusCounts).length === 1, `R1_STATUS_DOMAIN:${JSON.stringify(statusCounts)}`);
check(modelCounts[EXPECTED.effectiveModel] === 160 && Object.keys(modelCounts).length === 1, `R1_MODEL_DOMAIN:${JSON.stringify(modelCounts)}`);

const result = {
  run_id: RUN_ID,
  status: issues.length ? 'PHASE_V_VERIFICATION_FAIL' : 'PHASE_V_VERIFIED',
  verification_mode: 'INDEPENDENT_ZERO_CALL_READ_ONLY_SOURCE_LEDGERS',
  predecessor_receipt_index_sha256: EXPECTED.predecessorIndex,
  predecessor_receipts_verified: predecessorIndex.length,
  predecessor_jev_events: predecessorJevEventIds.length,
  predecessor_jev_status_counts: predecessorJevStatusCounts,
  r1_exact_predecessor_jev_event_set_match: exactPredecessorJevEventSetMatch,
  r1_receipt_index_sha256: EXPECTED.r1Index,
  r1_runner_execution_manifest_sha256: EXPECTED.runnerManifest,
  frozen_provider_matrix_contract_sha256: EXPECTED.providerMatrix,
  r1_receipts_verified: r1Index.length,
  r1_raw_verified: rawVerified,
  r1_attempts_verified: attemptsVerified,
  status_counts: statusCounts,
  effective_model_counts: modelCounts,
  provider_calls: 0,
  provider_replay: false,
  jev_calls: 0,
  luna_calls: 0,
  openrouter_calls: 0,
  frontier_calls: 0,
  credentials_read: false,
  source_ledger_mutation: false,
  r1_ledger_mutation: false,
  authority_effects: 'NONE',
  production_promotion: false,
  predecessor_phase_v_results: [
    { version: 'v0.1', sha256: 'b781c4e2b879f1fa4875e650eb925cfbc9bd4fde66b1b7f687493cac19d61262', disposition: 'VERIFIER_EVENT_ID_LANE_PARSER_DEFECT_ONLY_PRESERVED_UNMODIFIED' },
    { version: 'v0.2', sha256: 'f477fc5d357502e31782a7cdaafa940568f2519044c1f5627a90ac9f36c34cb0', disposition: 'VERIFIER_EPHEMERAL_PROVIDER_MATRIX_PATH_ASSUMPTION_DEFECT_ONLY_PRESERVED_UNMODIFIED' }
  ],
  verifier_sha256: verifierSha256,
  issues
};
await mkdir(OUT_ROOT, { recursive: true });
const resultPath = path.join(OUT_ROOT, 'PHASE_V_RESULT.json');
await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
const resultSha256 = await rawHash(resultPath);
console.log('NSS1_STAGE_F_R1_PHASE_V', JSON.stringify({ ...result, result_sha256: resultSha256 }));
if (issues.length) process.exitCode = 2;
