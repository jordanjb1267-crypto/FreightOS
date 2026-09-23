import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { callJev, PROVIDERS } from '../nss-stage-f-runner/provider-adapters.mjs';

const ROOT = process.env.G1_EVIDENCE_ROOT;
const OUT = process.env.G1_EXECUTION_DIR ?? './g1-execution';
const API_KEY = process.env.TYPESAFE_API_KEY;
const RUN_MODE = process.env.RUN_MODE ?? 'preflight';
const TIMEOUT_MS = 120000;
const MAX_CALLS = 32;

const stable = v => Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v);
const shaText = s => createHash('sha256').update(s).digest('hex');
const json = async f => JSON.parse(await readFile(f, 'utf8'));
const exists = async f => { try { await readFile(f); return true; } catch { return false; } };
async function atomic(file, value) { await mkdir(path.dirname(file), { recursive: true }); const tmp = `${file}.tmp-${process.pid}-${Date.now()}`; await writeFile(tmp, stable(value)); await rename(tmp, file); }

if (!ROOT) throw new Error('G1_EVIDENCE_ROOT_REQUIRED');
if (RUN_MODE !== 'execute') throw new Error('G1_EXECUTE_REQUIRES_RUN_MODE_EXECUTE');
if (!API_KEY) throw new Error('TYPESAFE_API_KEY_MISSING');

const manifest = await json(path.join(ROOT, 'execution_manifest.json'));
const fixtures = await json(path.join(ROOT, 'fixtures.json'));
const qset = await json(path.join(ROOT, 'question_set.json'));
if (manifest.run_id !== 'NSS1-G1-JEV-BOUNDARY-REQUALIFICATION-v0.1') throw new Error('G1_MANIFEST_ID_MISMATCH');
if (fixtures.length !== 32 || manifest.max_jev_calls !== 32 || manifest.luna_calls !== 0 || manifest.openrouter_calls !== 0 || manifest.frontier_calls !== 0) throw new Error('G1_DENOMINATOR_MISMATCH');
if (PROVIDERS.jev.requested_model !== manifest.provider.requested_model || PROVIDERS.jev.effective_required !== manifest.provider.required_effective_model) throw new Error('G1_PROVIDER_IDENTITY_MISMATCH');

function normalizeDist(v) {
  const entries = Object.entries(v ?? {}).map(([k, x]) => [k, Number(x)]);
  const sum = entries.reduce((s, [, x]) => s + x, 0);
  if (!Number.isFinite(sum) || sum <= 0) throw new Error('INVALID_DISTRIBUTION');
  return Object.fromEntries(entries.map(([k, x]) => [k, x / sum]));
}
function normalizeAnswers(raw) {
  const answers = raw?.answers;
  if (!answers || typeof answers !== 'object') throw new Error('ANSWERS_OBJECT_MISSING');
  const out = {};
  for (const [id, q] of Object.entries(qset)) {
    const a = answers[id];
    if (a === undefined) throw new Error(`MISSING_ANSWER:${id}`);
    if (q.type === 'noul') {
      const p = Number(a?.noul ?? a?.probability ?? a);
      if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error(`INVALID_NOUL:${id}`);
      out[id] = { type: 'noul', probability: p };
      continue;
    }
    const labels = q.type === 'choice' ? q.options : ['0','1','2','3','4'];
    const probs = normalizeDist(a?.probabilities ?? a);
    for (const label of labels) if (!(label in probs)) throw new Error(`MISSING_LABEL:${id}:${label}`);
    const selected = labels.reduce((best, label) => (probs[label] ?? 0) > (probs[best] ?? 0) ? label : best, labels[0]);
    out[id] = q.type === 'choice'
      ? { type: 'choice', selected, probabilities: probs }
      : { type: 'score', score: labels.reduce((s, label) => s + Number(label) * (probs[label] ?? 0), 0), probabilities: probs };
  }
  return out;
}

async function executeFixture(fixture) {
  const attemptFile = path.join(OUT, 'attempts', `${fixture.fixture_id}.json`);
  const receiptFile = path.join(OUT, 'receipts', `${fixture.fixture_id}.json`);
  const rawFile = path.join(OUT, 'raw', `${fixture.fixture_id}.txt`);
  if (await exists(receiptFile)) return json(receiptFile);
  if (await exists(attemptFile)) {
    const prior = await json(attemptFile);
    const receipt = {
      run_id: manifest.run_id, fixture_id: fixture.fixture_id, attempt_id: fixture.attempt_id, family: fixture.family, phase: fixture.phase,
      status: 'ORCHESTRATION_UNCERTAIN', terminal_class: 'ORCHESTRATION_UNCERTAIN', terminal_reason: 'STARTED_WITHOUT_TERMINAL_RECEIPT_REPLAY_PROHIBITED',
      provider: manifest.provider.provider, requested_model: manifest.provider.requested_model, effective_model: null,
      bound_state_sha256: fixture.state_sha256, request_body_sha256: fixture.request_body_sha256, started_at: prior.started_at, finished_at: new Date().toISOString(),
      http_status: null, transport_status: 'UNKNOWN', authentication_status: 'UNKNOWN', provider_boundary_status: 'UNKNOWN', model_resolution_status: 'UNKNOWN',
      raw_response_capture_status: 'MISSING', raw_response_sha256: null, parse_status: 'NOT_ATTEMPTED', schema_status: 'NOT_ATTEMPTED', contract_status: 'NOT_ATTEMPTED', semantic_result: null,
      latency_ms: null, usage: {}, authority_effects: 'NONE'
    };
    await atomic(receiptFile, receipt);
    return receipt;
  }

  const started_at = new Date().toISOString();
  await atomic(attemptFile, {
    run_id: manifest.run_id, fixture_id: fixture.fixture_id, attempt_id: fixture.attempt_id, family: fixture.family, phase: fixture.phase,
    status: 'STARTED', started_at, provider: manifest.provider.provider, requested_model: manifest.provider.requested_model,
    bound_state_sha256: fixture.state_sha256, request_body_sha256: fixture.request_body_sha256
  });

  const t0 = Date.now();
  let httpStatus = null, rawText = '', raw = null, effective = null, semantic = null, usage = {};
  let transport = 'FAILED', auth = 'NOT_EVALUATED', boundary = 'NOT_REACHED', model = 'NOT_EVALUATED', rawCapture = 'MISSING', parse = 'NOT_ATTEMPTED', schema = 'NOT_ATTEMPTED', contract = 'NOT_ATTEMPTED';
  let terminalClass = 'TRANSPORT_FAILURE', terminalReason = null;
  try {
    const res = await callJev({ apiKey: API_KEY, providerState: fixture.provider_state, questionSet: qset, timeoutMs: TIMEOUT_MS });
    transport = 'REACHED'; boundary = 'HTTP_RESPONSE'; httpStatus = res.status;
    rawText = await res.text();
    await mkdir(path.dirname(rawFile), { recursive: true }); await writeFile(rawFile, rawText); rawCapture = 'CAPTURED';
    auth = (res.status === 401 || res.status === 403) ? 'FAILED' : 'PASSED_OR_NOT_CHALLENGED';
    if (auth === 'FAILED') { terminalClass = 'AUTHENTICATION_FAILURE'; terminalReason = `HTTP_${res.status}`; }
    else if (!res.ok) { terminalClass = 'PROVIDER_BOUNDARY_FAILURE'; terminalReason = `HTTP_${res.status}`; }
    try { raw = JSON.parse(rawText); parse = 'PARSED'; } catch { parse = 'FAILED'; if (res.ok) { terminalClass = 'PARSE_FAILURE'; terminalReason = 'NON_JSON_PROVIDER_RESPONSE'; } }
    if (raw) {
      effective = raw.model ?? null; usage = raw.usage ?? {};
      model = effective === manifest.provider.required_effective_model ? 'MATCH' : 'MISMATCH';
      if (res.ok && model !== 'MATCH') { terminalClass = 'MODEL_RESOLUTION_FAILURE'; terminalReason = `EFFECTIVE_MODEL:${effective}`; }
      const answers = raw.answers;
      schema = answers && typeof answers === 'object' && Object.keys(qset).every(k => k in answers) ? 'PRESENT' : 'FAILED';
      if (res.ok && model === 'MATCH' && schema === 'FAILED') { terminalClass = 'SCHEMA_FAILURE'; terminalReason = 'REQUIRED_ANSWERS_MISSING'; }
      if (res.ok && model === 'MATCH' && schema === 'PRESENT') {
        try { semantic = normalizeAnswers(raw); contract = 'NORMALIZED'; terminalClass = 'OK'; terminalReason = null; }
        catch (e) { contract = 'FAILED'; terminalClass = 'CONTRACT_FAILURE'; terminalReason = String(e?.message ?? e); }
      }
    }
  } catch (e) {
    terminalReason = String(e?.message ?? e);
  }

  const receipt = {
    run_id: manifest.run_id, fixture_id: fixture.fixture_id, attempt_id: fixture.attempt_id, family: fixture.family, phase: fixture.phase,
    status: terminalClass === 'OK' ? 'OK' : 'NON_OK', terminal_class: terminalClass, terminal_reason: terminalReason,
    provider: manifest.provider.provider, requested_model: manifest.provider.requested_model, effective_model: effective,
    bound_state_sha256: fixture.state_sha256, request_body_sha256: fixture.request_body_sha256,
    started_at, finished_at: new Date().toISOString(), http_status: httpStatus,
    transport_status: transport, authentication_status: auth, provider_boundary_status: boundary, model_resolution_status: model,
    raw_response_capture_status: rawCapture, raw_response_sha256: rawText ? shaText(rawText) : null,
    parse_status: parse, schema_status: schema, contract_status: contract, semantic_result: semantic,
    latency_ms: Date.now() - t0, usage, authority_effects: 'NONE'
  };
  await atomic(receiptFile, receipt);
  return receipt;
}

const byPhase = phase => fixtures.filter(x => x.phase === phase).sort((a,b) => a.fixture_id.localeCompare(b.fixture_id));
const infra = new Set(['TRANSPORT_FAILURE','AUTHENTICATION_FAILURE','PROVIDER_BOUNDARY_FAILURE','MODEL_RESOLUTION_FAILURE']);
const allReceipts = [];
for (const fixture of byPhase('CANARY')) allReceipts.push(await executeFixture(fixture));
const uncertain = allReceipts.filter(r => r.terminal_class === 'ORCHESTRATION_UNCERTAIN').length;
const infraCounts = {};
for (const r of allReceipts) if (infra.has(r.terminal_class)) infraCounts[r.terminal_class] = (infraCounts[r.terminal_class] ?? 0) + 1;
const repeatedInfra = Object.entries(infraCounts).filter(([,n]) => n >= 2);
const canaryPass = allReceipts.length === 8 && uncertain === 0 && repeatedInfra.length === 0;
if (canaryPass) for (const fixture of byPhase('EXPANSION')) allReceipts.push(await executeFixture(fixture));

const terminalized = allReceipts.length;
const reachability = allReceipts.filter(r => r.transport_status === 'REACHED' && r.provider_boundary_status === 'HTTP_RESPONSE').length;
const modelResolved = allReceipts.filter(r => r.model_resolution_status === 'MATCH').length;
const rawCaptured = allReceipts.filter(r => r.raw_response_capture_status === 'CAPTURED').length;
const orchestrationUncertain = allReceipts.filter(r => r.terminal_class === 'ORCHESTRATION_UNCERTAIN').length;
const classCounts = {};
for (const r of allReceipts) classCounts[r.terminal_class] = (classCounts[r.terminal_class] ?? 0) + 1;
const boundaryPass = terminalized === 32 && orchestrationUncertain === 0 && reachability === 32 && modelResolved === 32 && rawCaptured === 32;
const result = {
  run_id: manifest.run_id, status: canaryPass ? (boundaryPass ? 'BOUNDARY_PASS' : 'BOUNDARY_NOT_PASS') : 'CANARY_BLOCK',
  canary_pass: canaryPass, canary_infrastructure_counts: infraCounts, canary_repeated_infrastructure_failures: repeatedInfra,
  attempted: terminalized, max_calls: MAX_CALLS, terminalized, orchestration_uncertain: orchestrationUncertain,
  provider_reachability: reachability, required_model_resolution: modelResolved, raw_response_capture: rawCaptured,
  terminal_class_counts: classCounts, boundary_pass: boundaryPass,
  luna_calls: 0, openrouter_calls: 0, frontier_calls: 0, authority_effects: 'NONE', production_promotion: false
};
await atomic(path.join(OUT, 'G1_RESULT.json'), result);
console.log('NSS1_G1_EXECUTION_COMPLETE', JSON.stringify(result));
