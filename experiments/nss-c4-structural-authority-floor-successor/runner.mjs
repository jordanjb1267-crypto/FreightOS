import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTypeSafeBody, shaStable } from '../nss-stage-f-jev-contract-remediation/provider-contract.mjs';
import { callJevR1, R1_PROVIDER } from '../nss-stage-f-jev-contract-remediation/r1-provider-adapter.mjs';

const HELDOUT_ROOT = process.env.C4_STRUCTURAL_FLOOR_HELDOUT_ROOT ?? '/data/nss-c4-structural-authority-floor-heldout-v0.1';
const EXEC_ROOT = process.env.C4_STRUCTURAL_FLOOR_JEV_ROOT ?? '/data/nss-c4-structural-authority-floor-jev-v0.1';
const AUTH_PATH = process.env.C4_STRUCTURAL_FLOOR_EXECUTION_AUTHORIZATION_PATH;
const RUN_MODE = process.env.RUN_MODE ?? 'preflight';
const RUN_ID = 'NSS1-C4-STRUCTURAL-AUTHORITY-FLOOR-FRESH-JEV-v0.1';
const MAX_CONCURRENCY = 6;
const TIMEOUT_MS = 120000;
const EXPECTED = Object.freeze({
  heldout: '737593c111c5fc856be0b3bc5f86312549b1d998961125b9c7fa50a38f6ead80',
  floor: '310d1718f2380312c7be99365c7bad2624370abcc6039d9ca92ead65643dd40e',
  heldout_preflight: '5809882084ed875d8a2f9c8f0a1e452687a54ddfb250e86f0ccb39ccd64c9f2c',
  question_set: '0e8c01c8d98e2fbbeb9f7b034ef638dcf11df0f9f2189834322830bb0b758bcb',
  denominator: 96,
});

const sha = b => createHash('sha256').update(b).digest('hex');
const stable = v => Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v);
const shaStableLocal = v => sha(Buffer.from(stable(v)));
const exists = async f => { try { await stat(f); return true; } catch { return false; } };
const json = async f => JSON.parse(await readFile(f, 'utf8'));
async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const text = stable(value);
  await writeFile(tmp, text);
  await rename(tmp, file);
  return { sha256: sha(Buffer.from(text)), bytes: Buffer.byteLength(text) };
}

function labelsFor(q) { return q.type === 'choice' ? q.options : ['0','1','2','3','4']; }
function normalizeDist(o) {
  const entries = Object.entries(o ?? {}).map(([k,v]) => [k, Number(v)]);
  const sum = entries.reduce((s,[,v]) => s + v, 0);
  if (!Number.isFinite(sum) || sum <= 0) throw new Error('INVALID_DISTRIBUTION');
  return Object.fromEntries(entries.map(([k,v]) => [k, v / sum]));
}
function normalize(questionSet, answers) {
  const out = {};
  for (const [id,q] of Object.entries(questionSet)) {
    const a = answers?.[id];
    if (a === undefined) throw new Error(`MISSING_ANSWER:${id}`);
    if (q.type === 'noul') {
      const p = Number(a?.noul ?? a?.probability ?? a);
      if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error(`INVALID_NOUL:${id}`);
      out[id] = { type:'noul', probability:p, origin:'NATIVE_MODEL_PROBABILITY' };
      continue;
    }
    const labels = labelsFor(q);
    const probs = normalizeDist(a?.probabilities ?? a);
    for (const label of labels) if (!(label in probs)) throw new Error(`MISSING_LABEL:${id}:${label}`);
    const selected = labels.reduce((best,label) => (probs[label] ?? 0) > (probs[best] ?? 0) ? label : best, labels[0]);
    if (q.type === 'choice') out[id] = { type:'choice', selected, probabilities:probs, confidence:probs[selected], origin:'NATIVE_MODEL_PROBABILITY' };
    else out[id] = { type:'score', score:labels.reduce((s,label) => s + Number(label) * (probs[label] ?? 0), 0), probabilities:probs, confidence:Math.max(...Object.values(probs)), origin:'NATIVE_MODEL_PROBABILITY' };
  }
  return out;
}

if (RUN_MODE !== 'execute') throw new Error(`RUN_MODE_NOT_EXECUTE:${RUN_MODE}`);
if (!AUTH_PATH) throw new Error('C4_STRUCTURAL_FLOOR_EXECUTION_AUTHORIZATION_PATH_REQUIRED');
if (await exists(EXEC_ROOT)) throw new Error('EXECUTION_ROOT_ALREADY_EXISTS_FAIL_CLOSED');
const apiKey = process.env.TYPESAFE_API_KEY;
if (!apiKey) throw new Error('TYPESAFE_API_KEY_MISSING');

const DIR = path.dirname(fileURLToPath(import.meta.url));
const questionPath = path.join(DIR, 'question_set.json');
const responsibilityPath = path.join(DIR, 'responsibility.json');
const floorPath = path.join(DIR, 'authority-floor.mjs');
const adapterPath = path.resolve(DIR, '../nss-stage-f-jev-contract-remediation/r1-provider-adapter.mjs');
const contractPath = path.resolve(DIR, '../nss-stage-f-jev-contract-remediation/provider-contract.mjs');
const runnerPreflightPath = path.join(HELDOUT_ROOT, 'RUNNER_PREFLIGHT_RESULT.json');
const heldoutPath = path.join(HELDOUT_ROOT, 'HELDOUT_EVENTS.json');

const [heldoutBytes, questionBytes, responsibilityBytes, floorBytes, adapterBytes, contractBytes, selfBytes, runnerPreflightBytes] = await Promise.all([
  readFile(heldoutPath), readFile(questionPath), readFile(responsibilityPath), readFile(floorPath), readFile(adapterPath), readFile(contractPath), readFile(fileURLToPath(import.meta.url)), readFile(runnerPreflightPath),
]);
const auth = await json(AUTH_PATH);
const runnerPreflight = JSON.parse(runnerPreflightBytes);
const questionSet = JSON.parse(questionBytes);
const responsibility = JSON.parse(responsibilityBytes);
const rows = JSON.parse(heldoutBytes);

const issues = [];
const check = (ok, code) => { if (!ok) issues.push(code); };
check(sha(heldoutBytes) === EXPECTED.heldout, 'HELDOUT_HASH');
check(sha(questionBytes) === EXPECTED.question_set, 'QUESTION_SET_HASH');
check(sha(floorBytes) === EXPECTED.floor, 'FLOOR_SOURCE_HASH');
check(rows.length === EXPECTED.denominator, `DENOMINATOR:${rows.length}`);
check(runnerPreflight.status === 'PASS' && runnerPreflight.issues?.length === 0, 'RUNNER_PREFLIGHT_STATUS');
check(auth.status === 'AUTHORIZED', 'EXECUTION_AUTHORIZATION_STATUS');
check(auth.heldout_events_sha256 === EXPECTED.heldout, 'AUTH_HELDOUT_HASH');
check(auth.authority_floor_source_sha256 === EXPECTED.floor, 'AUTH_FLOOR_HASH');
check(auth.question_set_sha256 === EXPECTED.question_set, 'AUTH_QSET_HASH');
check(auth.request_manifest_sha256 === runnerPreflight.request_manifest_sha256, 'AUTH_REQUEST_MANIFEST');
check(auth.question_schema_sha256 === runnerPreflight.question_schema_sha256, 'AUTH_QUESTION_SCHEMA');
check(auth.responsibility_sha256 === sha(responsibilityBytes), 'AUTH_RESPONSIBILITY_HASH');
check(auth.runner_source_sha256 === sha(selfBytes), 'AUTH_RUNNER_HASH');
check(auth.provider_adapter_source_sha256 === sha(adapterBytes), 'AUTH_ADAPTER_HASH');
check(auth.provider_contract_source_sha256 === sha(contractBytes), 'AUTH_CONTRACT_HASH');
check(auth.max_fresh_jev_calls === EXPECTED.denominator, 'AUTH_CALL_DENOMINATOR');
check(R1_PROVIDER.requested_model === auth.requested_model, 'AUTH_REQUESTED_MODEL');
check(R1_PROVIDER.effective_required === auth.effective_model_required, 'AUTH_EFFECTIVE_MODEL');
if (issues.length) throw new Error(`EXECUTION_AUTHORIZATION_BLOCK:${issues.join('|')}`);

const sortedRows = [...rows].sort((a,b) => a.input.event.event_id.localeCompare(b.input.event.event_id));
const requestRows = sortedRows.map(row => {
  const { pre_state, event, planned_freshness } = row.input;
  const preStateSha256 = shaStable(pre_state);
  const providerState = {
    authoritative_pre_state: pre_state,
    observed_event: event,
    frozen_binding: { event_id:event.event_id, pre_state_sha256:preStateSha256, planned_freshness, heldout_events_sha256:EXPECTED.heldout },
    responsibility,
  };
  const body = makeTypeSafeBody({ providerState, questionSet });
  return { row, preStateSha256, providerState, requestBodySha256:shaStable(body) };
});
const recomputedManifestSha256 = shaStable(requestRows.map(x => ({
  event_id:x.row.input.event.event_id,
  tenant_id:x.row.input.event.tenant_id,
  load_id:x.row.input.event.load_id,
  pre_state_sha256:x.preStateSha256,
  request_body_sha256:x.requestBodySha256,
  question_set_sha256:EXPECTED.question_set,
  question_schema_sha256:runnerPreflight.question_schema_sha256,
  requested_model:R1_PROVIDER.requested_model,
})));
if (recomputedManifestSha256 !== auth.request_manifest_sha256) throw new Error(`REQUEST_MANIFEST_RECOMPUTE_MISMATCH:${recomputedManifestSha256}`);

await mkdir(EXEC_ROOT, { recursive:false });
const manifest = {
  run_id: RUN_ID,
  heldout_events_sha256: EXPECTED.heldout,
  authority_floor_source_sha256: EXPECTED.floor,
  question_set_sha256: EXPECTED.question_set,
  request_manifest_sha256: auth.request_manifest_sha256,
  question_schema_sha256: auth.question_schema_sha256,
  responsibility_sha256: auth.responsibility_sha256,
  runner_source_sha256: auth.runner_source_sha256,
  provider_adapter_source_sha256: auth.provider_adapter_source_sha256,
  provider_contract_source_sha256: auth.provider_contract_source_sha256,
  requested_model: R1_PROVIDER.requested_model,
  effective_model_required: R1_PROVIDER.effective_required,
  planned_fresh_jev_calls: EXPECTED.denominator,
  max_concurrency: MAX_CONCURRENCY,
  timeout_ms: TIMEOUT_MS,
  stage_f_provider_replay: false,
  luna_calls: 0,
  openrouter_calls: 0,
  frontier_calls: 0,
  authority_effects: 'NONE',
  live_effects: 0,
  current_state_application: false,
};
const manifestWrite = await atomicJson(path.join(EXEC_ROOT, 'RUNNER_MANIFEST.json'), manifest);

let providerCalls = 0;
async function executeOne(task) {
  const { row, preStateSha256, providerState, requestBodySha256 } = task;
  const { event, planned_freshness } = row.input;
  const eventId = event.event_id;
  const attemptPath = path.join(EXEC_ROOT, 'attempts', 'jev', `${eventId}.json`);
  const receiptPath = path.join(EXEC_ROOT, 'receipts', 'jev', `${eventId}.json`);
  const rawPath = path.join(EXEC_ROOT, 'raw', 'jev', `${eventId}.txt`);

  if (await exists(receiptPath)) return json(receiptPath);
  if (await exists(attemptPath)) {
    const prior = await json(attemptPath);
    const uncertain = {
      run_id:RUN_ID,event_id:eventId,tenant_id:event.tenant_id,load_id:event.load_id,provider:'jev',status:'ORCHESTRATION_UNCERTAIN',
      requested_model:R1_PROVIDER.requested_model,effective_model:null,started_at:prior.started_at,finished_at:new Date().toISOString(),
      bound_pre_state_sha256:preStateSha256,request_body_sha256:requestBodySha256,question_set_sha256:EXPECTED.question_set,
      raw_response_sha256:null,normalized_judgments:null,usage:{},latency_ms:null,error:'STARTED_WITHOUT_TERMINAL_RECEIPT_RETRY_PROHIBITED',
      frozen_freshness:planned_freshness,current_state_application:false,authority_effects:'NONE'
    };
    await atomicJson(receiptPath, uncertain);
    return uncertain;
  }

  const startedAt = new Date().toISOString();
  await atomicJson(attemptPath, {
    run_id:RUN_ID,event_id:eventId,tenant_id:event.tenant_id,load_id:event.load_id,provider:'jev',status:'STARTED',started_at:startedAt,
    bound_pre_state_sha256:preStateSha256,request_body_sha256:requestBodySha256,question_set_sha256:EXPECTED.question_set,
    requested_model:R1_PROVIDER.requested_model,frozen_freshness:planned_freshness,current_state_application:false
  });

  providerCalls++;
  const t0 = Date.now();
  let rawText = null, rawResponseSha256 = null, effectiveModel = null, normalizedJudgments = null, usage = {}, error = null, status = 'TRANSPORT_FAILURE';
  try {
    const response = await callJevR1({ apiKey, providerState, questionSet, timeoutMs:TIMEOUT_MS });
    rawText = await response.text();
    await mkdir(path.dirname(rawPath), { recursive:true });
    await writeFile(rawPath, rawText, { flag:'wx' });
    rawResponseSha256 = sha(Buffer.from(rawText));
    let raw;
    try { raw = JSON.parse(rawText); } catch { throw new Error('NON_JSON_PROVIDER_RESPONSE'); }
    effectiveModel = raw.model ?? null;
    usage = raw.usage ?? {};
    if (!response.ok) { status = 'PROVIDER_ERROR'; throw new Error(`JEV_${response.status}`); }
    if (effectiveModel !== R1_PROVIDER.effective_required) { status = 'MODEL_IDENTITY_FAILURE'; throw new Error(`MODEL_IDENTITY:${effectiveModel}`); }
    try { normalizedJudgments = normalize(questionSet, raw.answers ?? {}); }
    catch (e) { status = 'NORMALIZATION_FAILURE'; throw e; }
    status = 'OK';
  } catch (e) {
    error = String(e?.message ?? e);
  }
  const receipt = {
    run_id:RUN_ID,event_id:eventId,tenant_id:event.tenant_id,load_id:event.load_id,provider:'jev',status,
    requested_model:R1_PROVIDER.requested_model,effective_model:effectiveModel,started_at:startedAt,finished_at:new Date().toISOString(),latency_ms:Date.now()-t0,
    bound_pre_state_sha256:preStateSha256,request_body_sha256:requestBodySha256,question_set_sha256:EXPECTED.question_set,
    raw_response_sha256:rawResponseSha256,normalized_judgments:normalizedJudgments,usage,error,
    frozen_freshness:planned_freshness,current_state_application:false,authority_effects:'NONE'
  };
  await atomicJson(receiptPath, receipt);
  return receipt;
}

let cursor = 0;
async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= requestRows.length) return;
    await executeOne(requestRows[index]);
  }
}
await Promise.all(Array.from({ length:MAX_CONCURRENCY }, () => worker()));

const receiptDir = path.join(EXEC_ROOT, 'receipts', 'jev');
const receiptFiles = (await readdir(receiptDir)).filter(x => x.endsWith('.json')).sort();
const receiptIndex = [];
const statusCounts = {};
for (const filename of receiptFiles) {
  const receiptPath = path.join(receiptDir, filename);
  const bytes = await readFile(receiptPath);
  const receipt = JSON.parse(bytes);
  statusCounts[receipt.status] = (statusCounts[receipt.status] ?? 0) + 1;
  receiptIndex.push({
    event_id:receipt.event_id,provider:'jev',status:receipt.status,receipt_sha256:sha(bytes),raw_response_sha256:receipt.raw_response_sha256 ?? null,
    request_body_sha256:receipt.request_body_sha256,bound_pre_state_sha256:receipt.bound_pre_state_sha256
  });
}
receiptIndex.sort((a,b) => a.event_id.localeCompare(b.event_id));
const indexWrite = await atomicJson(path.join(EXEC_ROOT, 'RECEIPT_INDEX.json'), receiptIndex);
const terminalReceipts = receiptIndex.length;
const okReceipts = statusCounts.OK ?? 0;
const orchestrationUncertain = statusCounts.ORCHESTRATION_UNCERTAIN ?? 0;
const phaseW = {
  run_id:RUN_ID,status:'WRITE_COMPLETE_UNVERIFIED',runner_execution_manifest_sha256:manifestWrite.sha256,receipt_index_sha256:indexWrite.sha256,
  planned_fresh_jev_calls:EXPECTED.denominator,new_provider_calls:providerCalls,terminal_receipts:terminalReceipts,ok_receipts:okReceipts,
  non_ok_receipts:terminalReceipts-okReceipts,orchestration_uncertain:orchestrationUncertain,status_counts:statusCounts,
  heldout_events_sha256:EXPECTED.heldout,request_manifest_sha256:auth.request_manifest_sha256,stage_f_provider_replay:false,
  luna_calls:0,openrouter_calls:0,frontier_calls:0,authority_effects:'NONE',live_effects:0,current_state_application:false,production_promotion:false
};
const phaseWWrite = await atomicJson(path.join(EXEC_ROOT, 'PHASE_W_RESULT.json'), phaseW);
console.log('NSS1_C4_STRUCTURAL_FLOOR_FRESH_JEV_PHASE_W', JSON.stringify({ ...phaseW, phase_w_result_sha256:phaseWWrite.sha256 }));
