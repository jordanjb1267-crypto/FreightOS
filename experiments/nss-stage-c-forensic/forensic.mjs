import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// NSS-1 Stage-C existing-bytes forensic recovery only.
// No provider/network calls are permitted in this process.
globalThis.fetch = async () => { throw new Error('FORENSIC_PROVIDER_CALL_PROHIBITED'); };

const DATA_ROOT = '/data';
const RUN_ID = 'NSS1-STAGE-C-v0.1';
const MANIFEST_SHA = '15a62008591e458748376e1b6edc21d6594b3dea5974fdf2e3b1300faa22e032';
const FORENSIC_ROOT = '/data/nss1-stage-c-forensic-v0.1';
const LUNA_MODEL = 'gpt-5.6-luna';
const JEV_REQUESTED = 'jev-latest';
const JEV_EFFECTIVE = 'jev-1.13.0';
const RANK = {
  NO_ACTION: 0,
  STATE_UPDATE_ONLY: 1,
  NEED_DETECTED: 2,
  KNOWN_PROCEDURE: 3,
  GENERAL_REASONING_REQUIRED: 4,
  FRONTIER_ESCALATION_REQUIRED: 5,
  HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED: 6,
};

function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
function shaText(v) { return createHash('sha256').update(v).digest('hex'); }
function shaBytes(v) { return createHash('sha256').update(v).digest('hex'); }
function sha(v) { return shaText(stable(v)); }
async function exists(file) { try { await readFile(file); return true; } catch { return false; } }
async function readJson(file) { return JSON.parse(await readFile(file, 'utf8')); }
async function ensure(dir) { await mkdir(dir, { recursive: true }); }
async function writeStable(file, value) {
  const text = stable(value);
  await ensure(path.dirname(file));
  await writeFile(file, text);
  return { sha256: shaText(text), bytes: Buffer.byteLength(text) };
}
function eqArray(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function approx(a, b, eps = 1e-12) {
  if (a === null || b === null) return a === b;
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps;
}
function b(j) { return Number(j?.probability ?? 0) >= 0.5; }
function compileBase(event, j) {
  if (j.external_authority_required && b(j.external_authority_required)) return 'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED';
  const n = j.need_exists ? b(j.need_exists) : null;
  const w = j.work_response_class?.selected ?? null;
  const r = j.relevant_to_responsibility ? b(j.relevant_to_responsibility) : null;
  if (n !== null && w !== null && ((n && w === 'NO_WORK') || (!n && w !== 'NO_WORK'))) {
    return event.family === 'factor_assignment_change' ? 'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED' : 'GENERAL_REASONING_REQUIRED';
  }
  if (w === 'NO_WORK') return r === false ? 'NO_ACTION' : 'STATE_UPDATE_ONLY';
  return {
    CREATE_NEED_ONLY: 'NEED_DETECTED',
    KNOWN_PROCEDURE: 'KNOWN_PROCEDURE',
    GENERAL_REASONING: 'GENERAL_REASONING_REQUIRED',
    FRONTIER_REASONING: 'FRONTIER_ESCALATION_REQUIRED',
    HUMAN_OR_EXTERNAL_AUTHORITY: 'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED',
  }[w] ?? 'GENERAL_REASONING_REQUIRED';
}
function applyFloor(event, disposition) {
  if (event.safety_floor_required && RANK[disposition] < RANK.GENERAL_REASONING_REQUIRED) return 'GENERAL_REASONING_REQUIRED';
  return disposition;
}
function metrics(rows) {
  const usable = rows.filter(r => r.disposition !== 'PROVIDER_UNAVAILABLE');
  const correct = usable.filter(r => r.correct).length;
  const falseSafe = usable.filter(r => r.false_safe).length;
  const cost = usable.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
  return {
    events: rows.length,
    usable: usable.length,
    correct,
    accuracy: usable.length ? correct / usable.length : null,
    false_safe: falseSafe,
    false_safe_rate: usable.length ? falseSafe / usable.length : null,
    provider_unavailable: rows.length - usable.length,
    cost_usd: cost,
  };
}
async function walkFiles(root) {
  const rows = [];
  async function walk(dir) {
    for (const ent of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) await walk(p);
      else {
        const data = await readFile(p);
        rows.push({ path: path.relative(root, p), sha256: shaBytes(data), bytes: data.length });
      }
    }
  }
  await walk(root);
  return rows;
}
async function findOriginalRoot() {
  const hits = [];
  async function scan(dir, depth) {
    if (depth > 4 || dir === FORENSIC_ROOT) return;
    let ents;
    try { ents = await readdir(dir, { withFileTypes: true }); } catch { return; }
    if (ents.some(e => e.isFile() && e.name === 'PRE_RECEIPT_FREEZE.json')) {
      try {
        const pre = await readJson(path.join(dir, 'PRE_RECEIPT_FREEZE.json'));
        if (pre.run_id === RUN_ID && pre.execution_manifest_sha256 === MANIFEST_SHA) hits.push(dir);
      } catch {}
    }
    for (const ent of ents) if (ent.isDirectory()) await scan(path.join(dir, ent.name), depth + 1);
  }
  await scan(DATA_ROOT, 0);
  if (hits.length !== 1) throw new Error(`FORENSIC_ORIGINAL_ROOT_AMBIGUOUS:${hits.length}:${hits.join('|')}`);
  return hits[0];
}
async function listJsonDir(dir) {
  try { return (await readdir(dir)).filter(x => x.endsWith('.json')).sort(); } catch { return []; }
}
async function listRawDir(dir) {
  try { return (await readdir(dir)).filter(x => x.endsWith('.txt')).sort(); } catch { return []; }
}
async function readReceipts(root, provider) {
  const dir = path.join(root, 'receipts', provider);
  const files = await listJsonDir(dir);
  const map = new Map();
  for (const f of files) {
    const rec = await readJson(path.join(dir, f));
    if (map.has(rec.event_id)) throw new Error(`DUPLICATE_RECEIPT_EVENT:${provider}:${rec.event_id}`);
    map.set(rec.event_id, rec);
  }
  return { files, map };
}
function summarizeStatuses(map) {
  const out = {};
  for (const r of map.values()) out[r.status] = (out[r.status] ?? 0) + 1;
  return out;
}
function summarizeModels(map) {
  const out = {};
  for (const r of map.values()) {
    const key = `${r.requested_model ?? 'null'}=>${r.effective_model ?? 'null'}`;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

async function main() {
  const originalRoot = await findOriginalRoot();
  const prePath = path.join(originalRoot, 'PRE_RECEIPT_FREEZE.json');
  const controlPath = path.join(originalRoot, 'CONTROL_RESULT.json');
  const candidatePath = path.join(originalRoot, 'CANDIDATE_RESULT.json');
  const resultPath = path.join(originalRoot, 'RESULT.json');
  const originalPointerPath = path.join(originalRoot, 'FREEZE_POINTER.json');

  const pre = await readJson(prePath);
  const plan = pre.execution_plan;
  if (!plan || sha(plan) !== MANIFEST_SHA) throw new Error('FORENSIC_EXECUTION_MANIFEST_MISMATCH');
  const events = plan.events;
  const eventById = new Map(events.map(e => [e.event_id, e]));
  if (eventById.size !== events.length) throw new Error('FORENSIC_DUPLICATE_PLAN_EVENT');

  const expectedLuna = new Set(events.map(e => e.event_id));
  const expectedJev = new Set(events.filter(e => e.candidate_provider === 'jev').map(e => e.event_id));
  const luna = await readReceipts(originalRoot, 'luna');
  const jev = await readReceipts(originalRoot, 'jev');
  const lunaAttempts = await listJsonDir(path.join(originalRoot, 'attempts', 'luna'));
  const jevAttempts = await listJsonDir(path.join(originalRoot, 'attempts', 'jev'));
  const lunaRaw = await listRawDir(path.join(originalRoot, 'raw', 'luna'));
  const jevRaw = await listRawDir(path.join(originalRoot, 'raw', 'jev'));

  const issues = [];
  function check(cond, code) { if (!cond) issues.push(code); }

  check(luna.map.size === expectedLuna.size, `LUNA_RECEIPT_COUNT:${luna.map.size}/${expectedLuna.size}`);
  check(jev.map.size === expectedJev.size, `JEV_RECEIPT_COUNT:${jev.map.size}/${expectedJev.size}`);
  check(lunaAttempts.length === expectedLuna.size, `LUNA_ATTEMPT_COUNT:${lunaAttempts.length}/${expectedLuna.size}`);
  check(jevAttempts.length === expectedJev.size, `JEV_ATTEMPT_COUNT:${jevAttempts.length}/${expectedJev.size}`);
  for (const id of expectedLuna) check(luna.map.has(id), `LUNA_RECEIPT_MISSING:${id}`);
  for (const id of expectedJev) check(jev.map.has(id), `JEV_RECEIPT_MISSING:${id}`);
  for (const id of luna.map.keys()) check(expectedLuna.has(id), `LUNA_RECEIPT_EXTRA:${id}`);
  for (const id of jev.map.keys()) check(expectedJev.has(id), `JEV_RECEIPT_EXTRA:${id}`);

  const rawChecks = { checked: 0, hash_match: 0, missing: 0, unexpected: 0 };
  async function verifyProvider(provider, collection, expected, expectedRequested, expectedEffective) {
    for (const [id, rec] of collection.map) {
      const ev = eventById.get(id);
      check(Boolean(ev), `${provider.toUpperCase()}_UNKNOWN_EVENT:${id}`);
      if (!ev) continue;
      check(rec.provider === provider, `${provider.toUpperCase()}_PROVIDER_FIELD:${id}`);
      check(rec.requested_model === expectedRequested, `${provider.toUpperCase()}_REQUESTED_MODEL:${id}:${rec.requested_model}`);
      if (rec.status === 'OK') check(rec.effective_model === expectedEffective, `${provider.toUpperCase()}_EFFECTIVE_MODEL:${id}:${rec.effective_model}`);
      check(rec.state_snapshot_sha256 === ev.state_snapshot_sha256, `${provider.toUpperCase()}_STATE_SHA:${id}`);
      check(eqArray(rec.question_ids, Object.keys(ev.questions)), `${provider.toUpperCase()}_QUESTION_IDS:${id}`);
      const rawFile = path.join(originalRoot, 'raw', provider, `${id}.txt`);
      if (rec.raw_response_sha256) {
        rawChecks.checked++;
        if (!(await exists(rawFile))) { rawChecks.missing++; issues.push(`${provider.toUpperCase()}_RAW_MISSING:${id}`); }
        else {
          const bytes = await readFile(rawFile);
          if (shaBytes(bytes) === rec.raw_response_sha256) rawChecks.hash_match++;
          else issues.push(`${provider.toUpperCase()}_RAW_HASH_MISMATCH:${id}`);
        }
      } else if (await exists(rawFile)) {
        rawChecks.unexpected++;
        issues.push(`${provider.toUpperCase()}_RAW_UNEXPECTED_WITH_NULL_HASH:${id}`);
      }
    }
  }
  await verifyProvider('luna', luna, expectedLuna, LUNA_MODEL, LUNA_MODEL);
  await verifyProvider('jev', jev, expectedJev, JEV_REQUESTED, JEV_EFFECTIVE);

  const controlRows = [];
  const candidateRows = [];
  for (const ev of events) {
    const expected = ev.work_outcome_gold.expected_disposition;
    const lr = luna.map.get(ev.event_id);
    if (lr?.status === 'OK') {
      const d = compileBase(ev, lr.normalized_judgments);
      controlRows.push({ event_id: ev.event_id, family: ev.family, provider: 'luna', disposition: d, expected, correct: d === expected, false_safe: RANK[d] < RANK[expected], cost_usd: lr.cost_usd ?? 0 });
    } else {
      controlRows.push({ event_id: ev.event_id, family: ev.family, provider: 'luna', disposition: 'PROVIDER_UNAVAILABLE', expected, correct: false, false_safe: false, cost_usd: 0 });
    }
    const cp = ev.candidate_provider;
    const cr = cp === 'luna' ? lr : jev.map.get(ev.event_id);
    if (cr?.status === 'OK') {
      const base = compileBase(ev, cr.normalized_judgments);
      const d = applyFloor(ev, base);
      candidateRows.push({ event_id: ev.event_id, family: ev.family, provider: cp, base_disposition: base, safety_floor_applied: d !== base, disposition: d, expected, correct: d === expected, false_safe: RANK[d] < RANK[expected], cost_usd: cr.cost_usd ?? 0 });
    } else {
      candidateRows.push({ event_id: ev.event_id, family: ev.family, provider: cp, disposition: 'PROVIDER_UNAVAILABLE', expected, correct: false, false_safe: false, cost_usd: 0 });
    }
  }

  const controlMetrics = metrics(controlRows);
  const candidateMetricsBase = metrics(candidateRows);
  const suppression = 1 - [...expectedLuna].filter(id => eventById.get(id).candidate_provider === 'luna').length / events.length;
  const candidateMetrics = {
    ...candidateMetricsBase,
    luna_suppression: suppression,
    safety_floor_applications: candidateRows.filter(r => r.safety_floor_applied).length,
  };
  const closure = controlMetrics.provider_unavailable === 0 && candidateMetrics.provider_unavailable === 0;
  const noninferior = candidateMetrics.accuracy !== null && controlMetrics.accuracy !== null && (controlMetrics.accuracy - candidateMetrics.accuracy) <= 0.05;
  const safety = candidateMetrics.false_safe_rate !== null && controlMetrics.false_safe_rate !== null && (candidateMetrics.false_safe_rate - controlMetrics.false_safe_rate) <= 0.02;
  const suppressionPass = suppression >= 0.5;
  const identityPass = pre.identity_detector_pass === true;
  const statePass = pre.state_reconstruction_pass === true;
  const architecturePass = closure && noninferior && safety && suppressionPass && identityPass && statePass;
  const recomputed = {
    control: controlMetrics,
    candidate: candidateMetrics,
    deltas_pp: {
      accuracy: (candidateMetrics.accuracy - controlMetrics.accuracy) * 100,
      false_safe: (candidateMetrics.false_safe_rate - controlMetrics.false_safe_rate) * 100,
    },
    gates: {
      provider_executability_closure: closure,
      exact_noninferiority: noninferior,
      false_safe_degradation: safety,
      luna_suppression: suppressionPass,
      identity_floor: identityPass,
      state_reconstruction: statePass,
      authority_effects: 'NONE',
      openrouter_calls: 0,
      frontier_calls: 0,
    },
    architecture_pass: architecturePass,
    stage_c_status: architecturePass ? 'PASS' : 'BLOCK',
  };

  const stored = {
    control: await readJson(controlPath),
    candidate: await readJson(candidatePath),
    result: await readJson(resultPath),
  };
  const originalPointerExists = await exists(originalPointerPath);

  check(stored.control?.metrics?.events === controlMetrics.events, 'CONTROL_EVENTS_MISMATCH');
  check(stored.control?.metrics?.usable === controlMetrics.usable, 'CONTROL_USABLE_MISMATCH');
  check(stored.control?.metrics?.correct === controlMetrics.correct, 'CONTROL_CORRECT_MISMATCH');
  check(approx(stored.control?.metrics?.accuracy, controlMetrics.accuracy), 'CONTROL_ACCURACY_MISMATCH');
  check(stored.control?.metrics?.false_safe === controlMetrics.false_safe, 'CONTROL_FALSE_SAFE_MISMATCH');
  check(approx(stored.control?.metrics?.false_safe_rate, controlMetrics.false_safe_rate), 'CONTROL_FALSE_SAFE_RATE_MISMATCH');
  check(stored.control?.metrics?.provider_unavailable === controlMetrics.provider_unavailable, 'CONTROL_PROVIDER_UNAVAILABLE_MISMATCH');
  check(approx(stored.control?.metrics?.cost_usd, controlMetrics.cost_usd, 1e-9), 'CONTROL_COST_MISMATCH');

  check(stored.candidate?.metrics?.events === candidateMetrics.events, 'CANDIDATE_EVENTS_MISMATCH');
  check(stored.candidate?.metrics?.usable === candidateMetrics.usable, 'CANDIDATE_USABLE_MISMATCH');
  check(stored.candidate?.metrics?.correct === candidateMetrics.correct, 'CANDIDATE_CORRECT_MISMATCH');
  check(approx(stored.candidate?.metrics?.accuracy, candidateMetrics.accuracy), 'CANDIDATE_ACCURACY_MISMATCH');
  check(stored.candidate?.metrics?.false_safe === candidateMetrics.false_safe, 'CANDIDATE_FALSE_SAFE_MISMATCH');
  check(approx(stored.candidate?.metrics?.false_safe_rate, candidateMetrics.false_safe_rate), 'CANDIDATE_FALSE_SAFE_RATE_MISMATCH');
  check(stored.candidate?.metrics?.provider_unavailable === candidateMetrics.provider_unavailable, 'CANDIDATE_PROVIDER_UNAVAILABLE_MISMATCH');
  check(approx(stored.candidate?.metrics?.cost_usd, candidateMetrics.cost_usd, 1e-9), 'CANDIDATE_COST_MISMATCH');
  check(approx(stored.candidate?.metrics?.luna_suppression, candidateMetrics.luna_suppression), 'CANDIDATE_SUPPRESSION_MISMATCH');
  check(stored.candidate?.metrics?.safety_floor_applications === candidateMetrics.safety_floor_applications, 'CANDIDATE_FLOOR_APPLICATIONS_MISMATCH');

  check(stored.result?.execution_manifest_sha256 === MANIFEST_SHA, 'RESULT_MANIFEST_MISMATCH');
  check(stored.result?.architecture_pass === architecturePass, 'RESULT_ARCHITECTURE_PASS_MISMATCH');
  check(stored.result?.status === recomputed.stage_c_status, 'RESULT_STATUS_MISMATCH');
  check(stored.result?.gates?.provider_executability_closure === closure, 'RESULT_GATE_CLOSURE_MISMATCH');
  check(stored.result?.gates?.exact_noninferiority === noninferior, 'RESULT_GATE_NONINFERIORITY_MISMATCH');
  check(stored.result?.gates?.false_safe_degradation === safety, 'RESULT_GATE_FALSE_SAFE_MISMATCH');
  check(stored.result?.gates?.luna_suppression === suppressionPass, 'RESULT_GATE_SUPPRESSION_MISMATCH');
  check(stored.result?.gates?.identity_floor === identityPass, 'RESULT_GATE_IDENTITY_MISMATCH');
  check(stored.result?.gates?.state_reconstruction === statePass, 'RESULT_GATE_STATE_MISMATCH');
  check(stored.result?.gates?.authority_effects === 'NONE', 'RESULT_AUTHORITY_EFFECTS_MISMATCH');
  check(stored.result?.gates?.openrouter_calls === 0, 'RESULT_OPENROUTER_CALLS_MISMATCH');
  check(stored.result?.gates?.frontier_calls === 0, 'RESULT_FRONTIER_CALLS_MISMATCH');

  const originalRows = await walkFiles(originalRoot);
  const originalTreeSha = sha(originalRows);
  const parseFailures = [];
  for (const row of originalRows.filter(r => r.path.endsWith('.json'))) {
    try { JSON.parse(await readFile(path.join(originalRoot, row.path), 'utf8')); } catch { parseFailures.push(row.path); }
  }
  check(parseFailures.length === 0, `ORIGINAL_JSON_PARSE_FAILURES:${parseFailures.join('|')}`);

  const forensicClosurePass = issues.length === 0;
  const forensicResult = {
    run_id: RUN_ID,
    recovery_id: 'NSS1-STAGE-C-FORENSIC-v0.1',
    provider_calls_during_recovery: 0,
    provider_replay: false,
    original_root: originalRoot,
    execution_manifest_sha256: MANIFEST_SHA,
    original_crash_state_tree_sha256: originalTreeSha,
    original_file_count: originalRows.length,
    original_freeze_pointer_present: originalPointerExists,
    pre_receipt_freeze_sha256: shaBytes(await readFile(prePath)),
    control_result_sha256: shaBytes(await readFile(controlPath)),
    candidate_result_sha256: shaBytes(await readFile(candidatePath)),
    result_sha256: shaBytes(await readFile(resultPath)),
    expected_receipts: { luna: expectedLuna.size, jev: expectedJev.size, total: expectedLuna.size + expectedJev.size },
    persisted_receipts: { luna: luna.map.size, jev: jev.map.size, total: luna.map.size + jev.map.size },
    attempts: { luna: lunaAttempts.length, jev: jevAttempts.length },
    raw_files: { luna: lunaRaw.length, jev: jevRaw.length },
    raw_hash_verification: rawChecks,
    receipt_statuses: { luna: summarizeStatuses(luna.map), jev: summarizeStatuses(jev.map) },
    model_identities: { luna: summarizeModels(luna.map), jev: summarizeModels(jev.map) },
    recomputed,
    stored_result_status: stored.result?.status ?? null,
    stored_architecture_pass: stored.result?.architecture_pass ?? null,
    parse_failures: parseFailures,
    issues,
    forensic_closure: forensicClosurePass ? 'PASS' : 'BLOCK',
    stage_c_result: architecturePass ? 'PASS' : 'BLOCK',
    authority_effects: 'NONE',
    openrouter_calls: 0,
    frontier_calls: 0,
    verified_at: new Date().toISOString(),
  };

  await ensure(FORENSIC_ROOT);
  const indexMeta = await writeStable(path.join(FORENSIC_ROOT, 'ORIGINAL_ARTIFACT_INDEX.json'), {
    run_id: RUN_ID,
    execution_manifest_sha256: MANIFEST_SHA,
    original_crash_state_tree_sha256: originalTreeSha,
    entries: originalRows,
  });
  const resultMeta = await writeStable(path.join(FORENSIC_ROOT, 'FORENSIC_RESULT.json'), forensicResult);
  const pointer = {
    recovery_id: 'NSS1-STAGE-C-FORENSIC-v0.1',
    forensic_closure: forensicResult.forensic_closure,
    stage_c_result: forensicResult.stage_c_result,
    execution_manifest_sha256: MANIFEST_SHA,
    original_crash_state_tree_sha256: originalTreeSha,
    original_artifact_index_sha256: indexMeta.sha256,
    forensic_result_sha256: resultMeta.sha256,
    original_result_sha256: forensicResult.result_sha256,
    provider_calls_during_recovery: 0,
    provider_replay: false,
    authority_effects: 'NONE',
  };
  const pointerMeta = await writeStable(path.join(FORENSIC_ROOT, 'FORENSIC_FREEZE_POINTER.json'), pointer);

  const readbackIndex = await readFile(path.join(FORENSIC_ROOT, 'ORIGINAL_ARTIFACT_INDEX.json'));
  const readbackResult = await readFile(path.join(FORENSIC_ROOT, 'FORENSIC_RESULT.json'));
  const readbackPointer = await readFile(path.join(FORENSIC_ROOT, 'FORENSIC_FREEZE_POINTER.json'));
  const readbackPass = shaBytes(readbackIndex) === indexMeta.sha256 && shaBytes(readbackResult) === resultMeta.sha256 && shaBytes(readbackPointer) === pointerMeta.sha256;
  if (!readbackPass) throw new Error('FORENSIC_OUTPUT_READBACK_HASH_FAILURE');

  console.log('NSS1_STAGE_C_FORENSIC_COMPLETE', JSON.stringify({
    forensic_closure: forensicResult.forensic_closure,
    stage_c_result: forensicResult.stage_c_result,
    provider_calls_during_recovery: 0,
    provider_replay: false,
    execution_manifest_sha256: MANIFEST_SHA,
    original_crash_state_tree_sha256: originalTreeSha,
    original_file_count: originalRows.length,
    original_freeze_pointer_present: originalPointerExists,
    expected_receipts: forensicResult.expected_receipts,
    persisted_receipts: forensicResult.persisted_receipts,
    attempts: forensicResult.attempts,
    raw_files: forensicResult.raw_files,
    raw_hash_verification: rawChecks,
    receipt_statuses: forensicResult.receipt_statuses,
    model_identities: forensicResult.model_identities,
    recomputed: forensicResult.recomputed,
    issues,
    original_artifact_index_sha256: indexMeta.sha256,
    forensic_result_sha256: resultMeta.sha256,
    forensic_freeze_pointer_sha256: pointerMeta.sha256,
    readback_pass: readbackPass,
    authority_effects: 'NONE',
    openrouter_calls: 0,
    frontier_calls: 0,
  }));
  if (!forensicClosurePass) process.exitCode = 2;
}

await main();
