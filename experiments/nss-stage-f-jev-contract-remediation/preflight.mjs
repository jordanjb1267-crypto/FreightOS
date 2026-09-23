import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTypeSafeBody, toTypeSafeQuestionsRemediated, PROVIDER_CONTRACT, stable, shaStable } from './provider-contract.mjs';

globalThis.fetch = async () => { throw new Error('JEV_CONTRACT_REMEDIATION_PREFLIGHT_NETWORK_PROHIBITED'); };

const ROOT = process.env.STAGE_F_EVIDENCE_ROOT;
const OUT = process.env.REMEDIATION_PREFLIGHT_OUT;
if (!ROOT || !OUT) throw new Error('ROOT_AND_OUT_REQUIRED');

const EXPECTED = Object.freeze({
  question_set: '0e8c01c8d98e2fbbeb9f7b034ef638dcf11df0f9f2189834322830bb0b758bcb',
  provider_matrix: '8135ad29cf2c13d0c433de6a4825d0395889d0c25ef6556e873048728bba9ff8',
  semantic_attempts: 'bd878169d903942d7e0d1cc45f6ac7941303896399486ccd7d02edfb691145f9',
  state_snapshots: '89ec348ea6ef1087fe905f230c6ffc069f76e1599221edde20800cc940dccff7',
  verified_archive: 'b43f7bb6f2a158300c63ff0df9519de21a18e1005860490f4f97ac907ba52af8',
  predecessor_adapter_sha256: '8b2ac6eba4c0b6fa3d7c5065d02251506e26764122aba6fbffdbbb7856f5e8d0'
});

const shaBuf = b => createHash('sha256').update(b).digest('hex');
const raw = async name => readFile(path.join(ROOT, name));
const json = async name => JSON.parse(await readFile(path.join(ROOT, name), 'utf8'));
const sourcePath = fileURLToPath(new URL('./provider-contract.mjs', import.meta.url));

const issues = [];
const roots = {};
for (const [name, expected] of [
  ['question_set.json', EXPECTED.question_set],
  ['provider_matrix.json', EXPECTED.provider_matrix],
  ['semantic_attempts.json', EXPECTED.semantic_attempts],
  ['state_snapshots.json', EXPECTED.state_snapshots]
]) {
  const got = shaBuf(await raw(name));
  roots[name] = got;
  if (got !== expected) issues.push(`ROOT_HASH:${name}:${got}`);
}

const [qset, matrix, attempts, snapshots, responsibility] = await Promise.all([
  json('question_set.json'), json('provider_matrix.json'), json('semantic_attempts.json'), json('state_snapshots.json'), json('responsibility.json')
]);
roots['responsibility.json'] = shaBuf(await raw('responsibility.json'));

const remediatedQuestions = toTypeSafeQuestionsRemediated(qset);
const qids = Object.keys(qset).sort();
let noulCount = 0, choiceCount = 0, scoreCount = 0;
for (const id of qids) {
  const original = qset[id];
  const q = remediatedQuestions[id];
  if (!q || q.type !== original.type) { issues.push(`TYPE_DRIFT:${id}`); continue; }
  if (q.type === 'noul') {
    noulCount++;
    if (typeof q.instructions === 'undefined') issues.push(`NOUL_INSTRUCTIONS_MISSING:${id}`);
    if (q.criteria != null) {
      if (typeof q.criteria !== 'object' || Array.isArray(q.criteria)) issues.push(`NOUL_CRITERIA_NOT_OBJECT:${id}`);
      if (q.criteria.true !== original.condition) issues.push(`NOUL_TRUE_CRITERION_DRIFT:${id}`);
      for (const k of Object.keys(q.criteria)) if (!['true','false'].includes(k)) issues.push(`NOUL_CRITERIA_EXTRA_KEY:${id}:${k}`);
    } else if (original.condition != null) issues.push(`NOUL_CONDITION_DROPPED:${id}`);
  } else if (q.type === 'choice') {
    choiceCount++;
    if (!q.criteria || typeof q.criteria !== 'object' || Array.isArray(q.criteria)) issues.push(`CHOICE_CRITERIA_NOT_OBJECT:${id}`);
    const expectedKeys = [...original.options].sort();
    const gotKeys = Object.keys(q.criteria ?? {}).sort();
    if (stable(expectedKeys) !== stable(gotKeys)) issues.push(`CHOICE_OPTIONS_DRIFT:${id}`);
  } else if (q.type === 'score') {
    scoreCount++;
    if (!Array.isArray(q.criteria) || q.criteria.length < 1) issues.push(`SCORE_CRITERIA_NOT_ARRAY:${id}`);
  }
}

const byAttempt = new Map(attempts.map(x => [x.event.event_id, x]));
const bySnapshot = new Map(snapshots.map(x => [x.event_id, x]));
const jevRows = matrix.filter(x => x.candidate_provider === 'JEV').sort((a,b) => a.event_id.localeCompare(b.event_id));
if (matrix.length !== 240) issues.push(`MATRIX_COUNT:${matrix.length}`);
if (jevRows.length !== 160) issues.push(`JEV_ROW_COUNT:${jevRows.length}`);

const requestManifest = [];
for (const row of jevRows) {
  const attempt = byAttempt.get(row.event_id);
  const snap = bySnapshot.get(row.event_id);
  if (!attempt || !snap) { issues.push(`JOIN_MISSING:${row.event_id}`); continue; }
  if (attempt.state_sha256 !== snap.pre_state_sha256) issues.push(`STATE_BINDING:${row.event_id}`);
  if (attempt.question_set_sha256 !== EXPECTED.question_set) issues.push(`QSET_BINDING:${row.event_id}`);
  const providerState = {
    authoritative_pre_state: snap.pre_state,
    observed_event: attempt.event,
    frozen_binding: {
      event_id: row.event_id,
      state_sha256: attempt.state_sha256,
      state_version: attempt.state_version,
      freshness: attempt.planned_freshness
    },
    responsibility
  };
  const body = makeTypeSafeBody({ providerState, questionSet: qset });
  if (!body.state || body.model !== 'jev-latest' || !body.questions) issues.push(`BODY_TOP_LEVEL:${row.event_id}`);
  requestManifest.push({
    event_id: row.event_id,
    body_sha256: shaStable(body),
    state_sha256: attempt.state_sha256,
    question_set_sha256: EXPECTED.question_set,
    model: body.model,
    question_schema_sha256: shaStable(body.questions)
  });
}

const uniqueQuestionSchemas = new Set(requestManifest.map(x => x.question_schema_sha256));
if (uniqueQuestionSchemas.size !== 1) issues.push(`QUESTION_SCHEMA_VARIANTS:${uniqueQuestionSchemas.size}`);
const adapterSha = shaBuf(await readFile(sourcePath));
const manifest = {
  candidate: 'NSS1-STAGE-F-JEV-CONTRACT-REMEDIATION-v0.1',
  predecessor_run: 'NSS1-STAGE-F-PROVIDER-SHADOW-v0.2',
  verified_stage_f_archive_sha256: EXPECTED.verified_archive,
  predecessor_adapter_sha256: EXPECTED.predecessor_adapter_sha256,
  successor_adapter_sha256: adapterSha,
  evidence_roots: roots,
  provider: PROVIDER_CONTRACT,
  counts: { matrix: matrix.length, jev_requests: requestManifest.length, noul_questions: noulCount, choice_questions: choiceCount, score_questions: scoreCount },
  question_schema_sha256: requestManifest[0]?.question_schema_sha256 ?? null,
  request_manifest_sha256: shaStable(requestManifest),
  provider_calls: 0,
  provider_attempts: 0,
  provider_receipts: 0,
  credentials_read: false,
  authority_effects: 'NONE',
  stage_f_original_ledger_replay: false,
  issues
};
const result = { ...manifest, status: issues.length ? 'BLOCK' : 'PASS' };
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'REQUEST_MANIFEST.json'), JSON.stringify(requestManifest, null, 2) + '\n', { flag: 'wx' });
await writeFile(path.join(OUT, 'PREFLIGHT_RESULT.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log('NSS1_STAGE_F_JEV_CONTRACT_REMEDIATION_PREFLIGHT', JSON.stringify(result));
if (issues.length) process.exitCode = 2;
