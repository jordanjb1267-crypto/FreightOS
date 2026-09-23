import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Independent Phase V verifier. This file intentionally imports no provider,
// runner, transport, or credential-bearing module and performs no network I/O.
globalThis.fetch = async () => { throw new Error('PHASE_V_NETWORK_PROHIBITED'); };

const RUN_ID = 'NSS1-STAGE-F-R1-PHASE-V-v0.1';
const R1_RUN_ID = 'NSS1-STAGE-F-JEV-REMEDIATION-R1-v0.1';
const SOURCE_ROOT = process.env.STAGE_F_SOURCE_LEDGER_ROOT ?? '/data/nss1-stage-f-provider-v0.2';
const R1_ROOT = process.env.STAGE_F_R1_LEDGER_ROOT ?? '/data/nss1-stage-f-jev-remediation-r1-v0.1';
const OUT_ROOT = process.env.STAGE_F_R1_PHASE_V_OUT ?? '/data/nss1-stage-f-r1-phase-v-v0.1';

const EXPECTED = Object.freeze({
  predecessor_receipt_index_sha256: '2e50185fa5d4ee5c3f137ccfbb4283d5a8964e6e3d53288a29043ee8f9d207e7',
  r1_receipt_index_sha256: 'b47252de25cc86dc6bf94f4c52ac7f44f21faabb1db13a41801400b35944b900',
  runner_execution_manifest_sha256: 'a25b395fb70a571bea8711d1354a6032772a553468da8d005100aed4f3b386b8',
  question_set_sha256: '0e8c01c8d98e2fbbeb9f7b034ef638dcf11df0f9f2189834322830bb0b758bcb',
  requested_model: 'jev-latest',
  effective_model: 'jev-1.13.0',
  predecessor_total: 400,
  predecessor_luna: 240,
  predecessor_jev: 160,
  r1_total: 160,
  r1_p2: 80,
  r1_p3: 80
});

const sha = b => createHash('sha256').update(b).digest('hex');
const json = async f => JSON.parse(await readFile(f, 'utf8'));
const rawHash = async f => sha(await readFile(f));
async function listJson(dir) {
  try { return (await readdir(dir)).filter(x => x.endsWith('.json')).sort(); }
  catch { return []; }
}
async function listTxt(dir) {
  try { return (await readdir(dir)).filter(x => x.endsWith('.txt')).sort(); }
  catch { return []; }
}
function issue(issues, condition, code) { if (!condition) issues.push(code); }
function bump(obj, key) { obj[key] = (obj[key] ?? 0) + 1; }

const issues = [];
const self = fileURLToPath(import.meta.url);
const verifierSha256 = await rawHash(self);

// A. Re-verify the immutable predecessor ledger from its own receipt index.
let predecessorIndex = [];
try {
  const predecessorIndexPath = path.join(SOURCE_ROOT, 'RECEIPT_INDEX.json');
  issue(issues, (await rawHash(predecessorIndexPath)) === EXPECTED.predecessor_receipt_index_sha256,
    'PREDECESSOR_RECEIPT_INDEX_HASH_MISMATCH');
  predecessorIndex = await json(predecessorIndexPath);
  issue(issues, predecessorIndex.length === EXPECTED.predecessor_total,
    `PREDECESSOR_INDEX_COUNT:${predecessorIndex.length}`);

  const predecessorProviderCounts = {};
  for (const row of predecessorIndex) {
    bump(predecessorProviderCounts, row.provider);
    const receiptPath = path.join(SOURCE_ROOT, 'receipts', row.provider, `${row.event_id}.json`);
    const receiptHash = await rawHash(receiptPath);
    issue(issues, receiptHash === row.receipt_sha256, `PREDECESSOR_RECEIPT_HASH:${row.event_id}`);
    const receipt = await json(receiptPath);
    issue(issues, receipt.event_id === row.event_id, `PREDECESSOR_EVENT_BINDING:${row.event_id}`);
    issue(issues, receipt.provider === row.provider, `PREDECESSOR_PROVIDER_BINDING:${row.event_id}`);
    issue(issues, receipt.status === row.status, `PREDECESSOR_STATUS_BINDING:${row.event_id}`);
    if (receipt.raw_response_sha256) {
      const rawPath = path.join(SOURCE_ROOT, 'raw', row.provider, `${row.event_id}.txt`);
      issue(issues, (await rawHash(rawPath)) === receipt.raw_response_sha256,
        `PREDECESSOR_RAW_HASH:${row.event_id}`);
    }
  }
  issue(issues, predecessorProviderCounts.luna === EXPECTED.predecessor_luna,
    `PREDECESSOR_LUNA_COUNT:${predecessorProviderCounts.luna ?? 0}`);
  issue(issues, predecessorProviderCounts.jev === EXPECTED.predecessor_jev,
    `PREDECESSOR_JEV_COUNT:${predecessorProviderCounts.jev ?? 0}`);
} catch (e) {
  issues.push(`PREDECESSOR_LEDGER_READ:${e?.message ?? e}`);
}

// B. Independently verify the R1 write without importing or invoking its writer.
let r1Index = [];
const laneCounts = {};
const statusCounts = {};
const effectiveModelCounts = {};
let rawVerified = 0;
let attemptVerified = 0;
try {
  const r1IndexPath = path.join(R1_ROOT, 'RECEIPT_INDEX.json');
  issue(issues, (await rawHash(r1IndexPath)) === EXPECTED.r1_receipt_index_sha256,
    'R1_RECEIPT_INDEX_HASH_MISMATCH');
  r1Index = await json(r1IndexPath);
  issue(issues, r1Index.length === EXPECTED.r1_total, `R1_INDEX_COUNT:${r1Index.length}`);
  issue(issues, new Set(r1Index.map(x => x.event_id)).size === EXPECTED.r1_total, 'R1_EVENT_ID_DUPLICATE');
  issue(issues, r1Index.every((x, i, a) => i === 0 || a[i - 1].event_id.localeCompare(x.event_id) < 0),
    'R1_INDEX_NOT_STRICTLY_SORTED');

  for (const row of r1Index) {
    const receiptPath = path.join(R1_ROOT, 'receipts', 'jev', `${row.event_id}.json`);
    const attemptPath = path.join(R1_ROOT, 'attempts', 'jev', `${row.event_id}.json`);
    const rawPath = path.join(R1_ROOT, 'raw', 'jev', `${row.event_id}.txt`);
    const receiptHash = await rawHash(receiptPath);
    issue(issues, receiptHash === row.receipt_sha256, `R1_RECEIPT_HASH:${row.event_id}`);

    const receipt = await json(receiptPath);
    const attempt = await json(attemptPath);
    issue(issues, receipt.run_id === R1_RUN_ID, `R1_RUN_ID:${row.event_id}`);
    issue(issues, receipt.event_id === row.event_id, `R1_EVENT_BINDING:${row.event_id}`);
    issue(issues, receipt.provider === 'jev' && row.provider === 'jev', `R1_PROVIDER:${row.event_id}`);
    issue(issues, receipt.status === 'OK' && row.status === 'OK', `R1_STATUS:${row.event_id}:${receipt.status}`);
    issue(issues, receipt.requested_model === EXPECTED.requested_model, `R1_REQUESTED_MODEL:${row.event_id}`);
    issue(issues, receipt.effective_model === EXPECTED.effective_model, `R1_EFFECTIVE_MODEL:${row.event_id}`);
    issue(issues, receipt.question_set_sha256 === EXPECTED.question_set_sha256, `R1_QSET_BINDING:${row.event_id}`);
    issue(issues, receipt.current_state_application === false, `R1_CURRENT_STATE_APPLICATION:${row.event_id}`);
    issue(issues, receipt.error === null, `R1_ERROR_NON_NULL:${row.event_id}`);
    issue(issues, receipt.normalized_judgments && typeof receipt.normalized_judgments === 'object',
      `R1_NORMALIZED_JUDGMENTS:${row.event_id}`);
    issue(issues, typeof receipt.bound_state_sha256 === 'string' && /^[a-f0-9]{64}$/.test(receipt.bound_state_sha256),
      `R1_STATE_HASH:${row.event_id}`);

    const rawHashGot = await rawHash(rawPath);
    issue(issues, rawHashGot === receipt.raw_response_sha256, `R1_RAW_RECEIPT_HASH:${row.event_id}`);
    issue(issues, rawHashGot === row.raw_response_sha256, `R1_RAW_INDEX_HASH:${row.event_id}`);
    const raw = await json(rawPath);
    issue(issues, raw.model === EXPECTED.effective_model, `R1_RAW_EFFECTIVE_MODEL:${row.event_id}`);
    issue(issues, raw.answers && typeof raw.answers === 'object', `R1_RAW_ANSWERS:${row.event_id}`);
    rawVerified++;

    issue(issues, attempt.run_id === R1_RUN_ID, `R1_ATTEMPT_RUN_ID:${row.event_id}`);
    issue(issues, attempt.event_id === row.event_id, `R1_ATTEMPT_EVENT:${row.event_id}`);
    issue(issues, attempt.provider === 'jev', `R1_ATTEMPT_PROVIDER:${row.event_id}`);
    issue(issues, attempt.status === 'STARTED', `R1_ATTEMPT_STATUS:${row.event_id}`);
    issue(issues, attempt.bound_state_sha256 === receipt.bound_state_sha256, `R1_ATTEMPT_STATE_BINDING:${row.event_id}`);
    issue(issues, attempt.question_set_sha256 === receipt.question_set_sha256, `R1_ATTEMPT_QSET_BINDING:${row.event_id}`);
    issue(issues, attempt.requested_model === receipt.requested_model, `R1_ATTEMPT_MODEL_BINDING:${row.event_id}`);
    attemptVerified++;

    bump(statusCounts, receipt.status);
    bump(effectiveModelCounts, receipt.effective_model);
    const lane = row.event_id.includes('P2') ? 'P2' : row.event_id.includes('P3') ? 'P3' : 'UNKNOWN';
    bump(laneCounts, lane);
  }

  const receiptFiles = await listJson(path.join(R1_ROOT, 'receipts', 'jev'));
  const attemptFiles = await listJson(path.join(R1_ROOT, 'attempts', 'jev'));
  const rawFiles = await listTxt(path.join(R1_ROOT, 'raw', 'jev'));
  issue(issues, receiptFiles.length === EXPECTED.r1_total, `R1_RECEIPT_FILE_COUNT:${receiptFiles.length}`);
  issue(issues, attemptFiles.length === EXPECTED.r1_total, `R1_ATTEMPT_FILE_COUNT:${attemptFiles.length}`);
  issue(issues, rawFiles.length === EXPECTED.r1_total, `R1_RAW_FILE_COUNT:${rawFiles.length}`);

  const phaseW = await json(path.join(R1_ROOT, 'PHASE_W_RESULT.json'));
  issue(issues, phaseW.run_id === R1_RUN_ID, `R1_PHASE_W_RUN_ID:${phaseW.run_id}`);
  issue(issues, phaseW.status === 'WRITE_COMPLETE_UNVERIFIED', `R1_PHASE_W_STATUS:${phaseW.status}`);
  issue(issues, phaseW.runner_execution_manifest_sha256 === EXPECTED.runner_execution_manifest_sha256,
    'R1_RUNNER_MANIFEST_HASH_MISMATCH');
  issue(issues, phaseW.receipt_index_sha256 === EXPECTED.r1_receipt_index_sha256,
    'R1_PHASE_W_RECEIPT_INDEX_HASH_MISMATCH');
  issue(issues, phaseW.terminal_receipts === 160 && phaseW.ok_receipts === 160 && phaseW.non_ok_receipts === 0,
    `R1_PHASE_W_COUNTS:${phaseW.terminal_receipts}:${phaseW.ok_receipts}:${phaseW.non_ok_receipts}`);
  issue(issues, phaseW.orchestration_uncertain === 0, `R1_PHASE_W_UNCERTAIN:${phaseW.orchestration_uncertain}`);
  issue(issues, phaseW.new_provider_calls_planned === 160, `R1_PHASE_W_PLANNED_CALLS:${phaseW.new_provider_calls_planned}`);
  issue(issues, phaseW.reused_luna_control_receipts === 240, 'R1_REUSED_LUNA_CONTROL_MISMATCH');
  issue(issues, phaseW.reused_luna_candidate_fallback_receipts === 80, 'R1_REUSED_LUNA_FALLBACK_MISMATCH');
  issue(issues, phaseW.openrouter_calls === 0 && phaseW.frontier_calls === 0 && phaseW.live_effects === 0,
    'R1_PROHIBITED_EFFECT_ACCOUNTING');
  issue(issues, phaseW.authority_effects === 'NONE', `R1_AUTHORITY_EFFECTS:${phaseW.authority_effects}`);
} catch (e) {
  issues.push(`R1_LEDGER_READ:${e?.message ?? e}`);
}

// C. R1 lane/accounting checks from frozen event ids and receipts.
issue(issues, statusCounts.OK === EXPECTED.r1_total, `R1_OK_COUNT:${statusCounts.OK ?? 0}`);
issue(issues, Object.keys(statusCounts).length === 1, `R1_STATUS_DOMAIN:${JSON.stringify(statusCounts)}`);
issue(issues, effectiveModelCounts[EXPECTED.effective_model] === EXPECTED.r1_total,
  `R1_EFFECTIVE_MODEL_COUNT:${effectiveModelCounts[EXPECTED.effective_model] ?? 0}`);
issue(issues, Object.keys(effectiveModelCounts).length === 1,
  `R1_EFFECTIVE_MODEL_DOMAIN:${JSON.stringify(effectiveModelCounts)}`);
issue(issues, laneCounts.P2 === EXPECTED.r1_p2, `R1_P2_COUNT:${laneCounts.P2 ?? 0}`);
issue(issues, laneCounts.P3 === EXPECTED.r1_p3, `R1_P3_COUNT:${laneCounts.P3 ?? 0}`);
issue(issues, (laneCounts.UNKNOWN ?? 0) === 0, `R1_UNKNOWN_LANE:${laneCounts.UNKNOWN ?? 0}`);

const result = {
  run_id: RUN_ID,
  status: issues.length === 0 ? 'PHASE_V_VERIFIED' : 'PHASE_V_VERIFICATION_FAIL',
  verification_mode: 'INDEPENDENT_ZERO_CALL_READ_ONLY_SOURCE_LEDGERS',
  predecessor: {
    root: SOURCE_ROOT,
    receipt_index_sha256: EXPECTED.predecessor_receipt_index_sha256,
    receipt_count: predecessorIndex.length
  },
  r1: {
    root: R1_ROOT,
    receipt_index_sha256: EXPECTED.r1_receipt_index_sha256,
    runner_execution_manifest_sha256: EXPECTED.runner_execution_manifest_sha256,
    receipt_count: r1Index.length,
    raw_verified: rawVerified,
    attempts_verified: attemptVerified,
    status_counts: statusCounts,
    effective_model_counts: effectiveModelCounts,
    lane_counts: laneCounts
  },
  provider_calls: 0,
  provider_replay: false,
  luna_calls: 0,
  jev_calls: 0,
  openrouter_calls: 0,
  frontier_calls: 0,
  credentials_read: false,
  source_ledger_mutation: false,
  r1_ledger_mutation: false,
  authority_effects: 'NONE',
  production_promotion: false,
  verifier_sha256: verifierSha256,
  issues
};

await mkdir(OUT_ROOT, { recursive: true });
const resultPath = path.join(OUT_ROOT, 'PHASE_V_RESULT.json');
await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
const resultSha256 = await rawHash(resultPath);
console.log('NSS1_STAGE_F_R1_PHASE_V', JSON.stringify({ ...result, result_sha256: resultSha256 }));
if (issues.length) process.exitCode = 2;
