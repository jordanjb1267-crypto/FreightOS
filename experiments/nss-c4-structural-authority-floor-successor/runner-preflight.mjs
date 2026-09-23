import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTypeSafeBody, shaStable, toTypeSafeQuestionsRemediated } from '../nss-stage-f-jev-contract-remediation/provider-contract.mjs';
import { R1_PROVIDER } from '../nss-stage-f-jev-contract-remediation/r1-provider-adapter.mjs';

const HELDOUT_ROOT = process.env.C4_STRUCTURAL_FLOOR_HELDOUT_ROOT ?? '/data/nss-c4-structural-authority-floor-heldout-v0.1';
const EXEC_ROOT = process.env.C4_STRUCTURAL_FLOOR_JEV_ROOT ?? '/data/nss-c4-structural-authority-floor-jev-v0.1';
const RUN_ID = 'NSS1-C4-STRUCTURAL-AUTHORITY-FLOOR-JEV-RUNNER-PREFLIGHT-v0.1';
const EXPECTED = Object.freeze({
  heldout: '737593c111c5fc856be0b3bc5f86312549b1d998961125b9c7fa50a38f6ead80',
  floor: '310d1718f2380312c7be99365c7bad2624370abcc6039d9ca92ead65643dd40e',
  heldout_preflight: '5809882084ed875d8a2f9c8f0a1e452687a54ddfb250e86f0ccb39ccd64c9f2c',
  question_set: '0e8c01c8d98e2fbbeb9f7b034ef638dcf11df0f9f2189834322830bb0b758bcb',
  denominator: 96,
  effective_model: 'jev-1.13.0',
  requested_model: 'jev-latest',
});

const sha = b => createHash('sha256').update(b).digest('hex');
const exists = async f => { try { await stat(f); return true; } catch { return false; } };
const json = async f => JSON.parse(await readFile(f, 'utf8'));
const issues = [];
const check = (ok, code) => { if (!ok) issues.push(code); };

const DIR = path.dirname(fileURLToPath(import.meta.url));
const questionPath = path.join(DIR, 'question_set.json');
const responsibilityPath = path.join(DIR, 'responsibility.json');
const floorPath = path.join(DIR, 'authority-floor.mjs');
const runnerPath = path.join(DIR, 'runner.mjs');
const adapterPath = path.resolve(DIR, '../nss-stage-f-jev-contract-remediation/r1-provider-adapter.mjs');
const contractPath = path.resolve(DIR, '../nss-stage-f-jev-contract-remediation/provider-contract.mjs');

const eventsPath = path.join(HELDOUT_ROOT, 'HELDOUT_EVENTS.json');
const manifestPath = path.join(HELDOUT_ROOT, 'HELDOUT_MANIFEST.json');
const heldoutPreflightPath = path.join(HELDOUT_ROOT, 'PREFLIGHT_RESULT.json');
const outPath = path.join(HELDOUT_ROOT, 'RUNNER_PREFLIGHT_RESULT.json');

check(await exists(eventsPath), 'HELDOUT_EVENTS_MISSING');
check(await exists(manifestPath), 'HELDOUT_MANIFEST_MISSING');
check(await exists(heldoutPreflightPath), 'HELDOUT_PREFLIGHT_MISSING');
check(!(await exists(outPath)), 'RUNNER_PREFLIGHT_ALREADY_EXISTS');
check(!(await exists(EXEC_ROOT)), 'EXECUTION_ROOT_NOT_FRESH');

const [eventsBytes, manifestBytes, heldoutPreflightBytes, questionBytes, responsibilityBytes, floorBytes, runnerBytes, adapterBytes, contractBytes] = await Promise.all([
  readFile(eventsPath), readFile(manifestPath), readFile(heldoutPreflightPath), readFile(questionPath), readFile(responsibilityPath), readFile(floorPath), readFile(runnerPath), readFile(adapterPath), readFile(contractPath),
]);

check(sha(eventsBytes) === EXPECTED.heldout, `HELDOUT_HASH:${sha(eventsBytes)}`);
check(sha(heldoutPreflightBytes) === EXPECTED.heldout_preflight, `HELDOUT_PREFLIGHT_HASH:${sha(heldoutPreflightBytes)}`);
check(sha(questionBytes) === EXPECTED.question_set, `QUESTION_SET_HASH:${sha(questionBytes)}`);
check(sha(floorBytes) === EXPECTED.floor, `FLOOR_SOURCE_HASH:${sha(floorBytes)}`);

const rows = JSON.parse(eventsBytes);
const manifest = JSON.parse(manifestBytes);
const heldoutPreflight = JSON.parse(heldoutPreflightBytes);
const questionSet = JSON.parse(questionBytes);
const responsibility = JSON.parse(responsibilityBytes);

check(manifest.heldout_events_sha256 === EXPECTED.heldout, 'MANIFEST_HELDOUT_BINDING');
check(manifest.authority_floor_source_sha256 === EXPECTED.floor, 'MANIFEST_FLOOR_BINDING');
check(heldoutPreflight.status === 'PASS' && heldoutPreflight.issues?.length === 0, 'HELDOUT_PREFLIGHT_STATUS');
check(rows.length === EXPECTED.denominator, `DENOMINATOR:${rows.length}`);
check(R1_PROVIDER.requested_model === EXPECTED.requested_model, `REQUESTED_MODEL:${R1_PROVIDER.requested_model}`);
check(R1_PROVIDER.effective_required === EXPECTED.effective_model, `EFFECTIVE_MODEL:${R1_PROVIDER.effective_required}`);

const questionSchema = toTypeSafeQuestionsRemediated(questionSet);
const questionSchemaSha256 = shaStable(questionSchema);
const requestRows = [];
for (const row of [...rows].sort((a,b) => a.input.event.event_id.localeCompare(b.input.event.event_id))) {
  const { pre_state, event, planned_freshness } = row.input;
  const preStateSha256 = shaStable(pre_state);
  const providerState = {
    authoritative_pre_state: pre_state,
    observed_event: event,
    frozen_binding: {
      event_id: event.event_id,
      pre_state_sha256: preStateSha256,
      planned_freshness,
      heldout_events_sha256: EXPECTED.heldout,
    },
    responsibility,
  };
  const body = makeTypeSafeBody({ providerState, questionSet });
  requestRows.push({
    event_id: event.event_id,
    tenant_id: event.tenant_id,
    load_id: event.load_id,
    pre_state_sha256: preStateSha256,
    request_body_sha256: shaStable(body),
    question_set_sha256: EXPECTED.question_set,
    question_schema_sha256: questionSchemaSha256,
    requested_model: body.model,
  });
}

check(new Set(requestRows.map(x => x.event_id)).size === EXPECTED.denominator, 'REQUEST_EVENT_ID_DUPLICATE');
check(new Set(requestRows.map(x => x.request_body_sha256)).size === EXPECTED.denominator, 'REQUEST_BODY_DUPLICATE');
check(requestRows.every(x => !x.event_id.startsWith('SFE-')), 'STAGE_F_EVENT_REPLAY_SURFACE');

const requestManifestSha256 = shaStable(requestRows);
const result = {
  run_id: RUN_ID,
  status: issues.length ? 'BLOCK' : 'PASS',
  issues,
  heldout_events_sha256: EXPECTED.heldout,
  heldout_preflight_result_sha256: EXPECTED.heldout_preflight,
  authority_floor_source_sha256: EXPECTED.floor,
  question_set_sha256: EXPECTED.question_set,
  question_schema_sha256: questionSchemaSha256,
  responsibility_sha256: sha(responsibilityBytes),
  request_manifest_sha256: requestManifestSha256,
  request_count: requestRows.length,
  requested_model: R1_PROVIDER.requested_model,
  effective_model_required: R1_PROVIDER.effective_required,
  runner_source_sha256: sha(runnerBytes),
  provider_adapter_source_sha256: sha(adapterBytes),
  provider_contract_source_sha256: sha(contractBytes),
  execution_root: EXEC_ROOT,
  execution_root_fresh: !(await exists(EXEC_ROOT)),
  max_concurrency: 6,
  timeout_ms: 120000,
  provider_calls: 0,
  credentials_read: false,
  stage_f_provider_replay: false,
  luna_calls: 0,
  openrouter_calls: 0,
  frontier_calls: 0,
  authority_effects: 'NONE',
  live_effects: 0,
};

await writeFile(outPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log('NSS1_C4_STRUCTURAL_FLOOR_JEV_RUNNER_PREFLIGHT', JSON.stringify({ ...result, result_sha256: sha(await readFile(outPath)) }));
if (issues.length) process.exitCode = 2;
