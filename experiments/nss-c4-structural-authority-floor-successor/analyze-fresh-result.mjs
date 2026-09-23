import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Zero-provider analysis of the already-terminal fresh Jev held-out run.
globalThis.fetch = async () => { throw new Error('C4_FRESH_ANALYSIS_NETWORK_PROHIBITED'); };

const HELDOUT_ROOT = process.env.C4_STRUCTURAL_FLOOR_HELDOUT_ROOT ?? '/data/nss-c4-structural-authority-floor-heldout-v0.1';
const EXEC_ROOT = process.env.C4_STRUCTURAL_FLOOR_JEV_ROOT ?? '/data/nss-c4-structural-authority-floor-jev-v0.1';
const OUT_ROOT = process.env.C4_STRUCTURAL_FLOOR_ANALYSIS_ROOT ?? '/data/nss-c4-structural-authority-floor-analysis-v0.1';
const RUN_ID = 'NSS1-C4-STRUCTURAL-AUTHORITY-FLOOR-FRESH-ANALYSIS-v0.1';
const AUTHORITY = 'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED';
const EXPECTED = Object.freeze({
  heldout: '737593c111c5fc856be0b3bc5f86312549b1d998961125b9c7fa50a38f6ead80',
  heldoutPreflight: '5809882084ed875d8a2f9c8f0a1e452687a54ddfb250e86f0ccb39ccd64c9f2c',
  requestManifest: '0bbeda95a321a1e396a316ced47a3631cddeb25479e55e7b4534618332568ed7',
  phaseW: 'efef5bbbf09fd74a627977d5e42800825ed5ae23e98ef04aec7a2d966e78e219',
  receiptIndex: '7321ac99a73457a059461a3c0e6cc19d44a250eb0bc1cb146e1d652de276ece8',
  runnerManifest: '83d95f845ac98e4398b0c26047975ba4b4cc78692033d3269862c17eef64a20d',
  denominator: 96,
  positive: 48,
  negative: 48,
  providerCalls: 96,
  terminalReceipts: 96,
  okReceipts: 95,
  orchestrationUncertain: 0,
});

const sha = b => createHash('sha256').update(b).digest('hex');
const stable = v => Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v);
const shaStable = v => sha(Buffer.from(stable(v)));
const json = async f => JSON.parse(await readFile(f, 'utf8'));
const exists = async f => { try { await stat(f); return true; } catch { return false; } };
const check = (issues, ok, code) => { if (!ok) issues.push(code); };

async function treeFingerprint(root) {
  const rows = [];
  async function walk(dir) {
    for (const ent of (await readdir(dir, { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) await walk(p);
      else if (ent.isFile()) { const b = await readFile(p); rows.push({ path:path.relative(root,p), sha256:sha(b), bytes:b.length }); }
    }
  }
  await walk(root);
  return sha(Buffer.from(stable(rows)));
}

function independentFloor(pre, event) {
  const p = event?.patch ?? {};
  if (p.seal_status === 'DISCREPANCY' && pre?.seal_status !== 'DISCREPANCY') return AUTHORITY;
  if (p.receiver_identity_status === 'CONFLICT' && pre?.receiver_identity_status !== 'CONFLICT') return AUTHORITY;
  if (Object.prototype.hasOwnProperty.call(p,'factor_assignment') && pre?.factor_assignment != null && p.factor_assignment != null && p.factor_assignment !== pre.factor_assignment) return AUTHORITY;
  return null;
}

if (await exists(OUT_ROOT)) throw new Error('ANALYSIS_ROOT_ALREADY_EXISTS_FAIL_CLOSED');
const issues = [];
const heldoutPath = path.join(HELDOUT_ROOT, 'HELDOUT_EVENTS.json');
const heldoutPreflightPath = path.join(HELDOUT_ROOT, 'PREFLIGHT_RESULT.json');
const phaseWPath = path.join(EXEC_ROOT, 'PHASE_W_RESULT.json');
const idxPath = path.join(EXEC_ROOT, 'RECEIPT_INDEX.json');
const manifestPath = path.join(EXEC_ROOT, 'RUNNER_MANIFEST.json');

const heldoutBefore = await treeFingerprint(HELDOUT_ROOT);
const execBefore = await treeFingerprint(EXEC_ROOT);
const [heldoutBytes, preflightBytes, phaseWBytes, idxBytes, manifestBytes] = await Promise.all([
  readFile(heldoutPath), readFile(heldoutPreflightPath), readFile(phaseWPath), readFile(idxPath), readFile(manifestPath)
]);
check(issues, sha(heldoutBytes) === EXPECTED.heldout, 'HELDOUT_HASH');
check(issues, sha(preflightBytes) === EXPECTED.heldoutPreflight, 'HELDOUT_PREFLIGHT_HASH');
check(issues, sha(phaseWBytes) === EXPECTED.phaseW, 'PHASE_W_HASH');
check(issues, sha(idxBytes) === EXPECTED.receiptIndex, 'RECEIPT_INDEX_HASH');
check(issues, sha(manifestBytes) === EXPECTED.runnerManifest, 'RUNNER_MANIFEST_HASH');

const heldout = JSON.parse(heldoutBytes), phaseW = JSON.parse(phaseWBytes), idx = JSON.parse(idxBytes), manifest = JSON.parse(manifestBytes);
check(issues, heldout.length === EXPECTED.denominator, `HELDOUT_COUNT:${heldout.length}`);
check(issues, idx.length === EXPECTED.denominator, `INDEX_COUNT:${idx.length}`);
check(issues, phaseW.status === 'WRITE_COMPLETE_UNVERIFIED', `PHASE_W_STATUS:${phaseW.status}`);
check(issues, phaseW.planned_fresh_jev_calls === 96 && phaseW.new_provider_calls === 96, 'PROVIDER_CALL_DENOMINATOR');
check(issues, phaseW.terminal_receipts === 96 && phaseW.ok_receipts === 95 && phaseW.orchestration_uncertain === 0, 'TERMINAL_RECEIPT_ACCOUNTING');
check(issues, phaseW.request_manifest_sha256 === EXPECTED.requestManifest && manifest.request_manifest_sha256 === EXPECTED.requestManifest, 'REQUEST_MANIFEST');
check(issues, phaseW.stage_f_provider_replay === false && manifest.stage_f_provider_replay === false, 'STAGE_F_REPLAY');
check(issues, phaseW.luna_calls === 0 && phaseW.openrouter_calls === 0 && phaseW.frontier_calls === 0, 'OTHER_PROVIDER_CALLS');
check(issues, phaseW.authority_effects === 'NONE' && phaseW.live_effects === 0 && phaseW.current_state_application === false && phaseW.production_promotion === false, 'EFFECT_BOUNDARY');

const byId = new Map(heldout.map(r => [r.input.event.event_id, r]));
let positives=0, negatives=0, guardPositive=0, guardNegative=0, guardExpectedMismatch=0;
let stateBinding=0, crossTenant=0, staleCurrentStateApplications=0;
let ok=0, nonOk=0, positiveOk=0, negativeOk=0;
let baselinePositiveFalseSafe=0, baselineNegativeAuthority=0;
let structuralPositiveFalseSafe=0, structuralNegativeGuardEscalations=0;
let structuralFinalEvaluable=0;
const nonOkEvents=[];
const baselineResponseCounts={};
const structuralResponseCounts={};

for (const row of heldout) {
  const expectedPositive = row.expected?.structural_positive === true;
  if (expectedPositive) positives++; else negatives++;
  const floor = independentFloor(row.input.pre_state, row.input.event);
  const guardFires = floor === AUTHORITY;
  if (guardFires) guardPositive++; else guardNegative++;
  if (guardFires !== expectedPositive) guardExpectedMismatch++;
}

for (const ix of idx) {
  const row = byId.get(ix.event_id);
  check(issues, !!row, `INDEX_EVENT_NOT_HELDOUT:${ix.event_id}`);
  if (!row) continue;
  const receiptPath = path.join(EXEC_ROOT, 'receipts', 'jev', `${ix.event_id}.json`);
  const receiptBytes = await readFile(receiptPath);
  check(issues, sha(receiptBytes) === ix.receipt_sha256, `RECEIPT_HASH:${ix.event_id}`);
  const r = JSON.parse(receiptBytes);
  const stateSha = shaStable(row.input.pre_state);
  if (r.bound_pre_state_sha256 === stateSha) stateBinding++;
  if (r.tenant_id !== row.input.event.tenant_id || r.load_id !== row.input.event.load_id) crossTenant++;
  if (row.input.planned_freshness === 'STALE' && r.current_state_application !== false) staleCurrentStateApplications++;
  check(issues, r.request_body_sha256 === ix.request_body_sha256, `REQUEST_BODY_BINDING:${ix.event_id}`);
  check(issues, r.bound_pre_state_sha256 === ix.bound_pre_state_sha256, `INDEX_STATE_BINDING:${ix.event_id}`);
  check(issues, r.authority_effects === 'NONE', `RECEIPT_AUTHORITY_EFFECT:${ix.event_id}`);

  const expectedPositive = row.expected.structural_positive === true;
  const floor = independentFloor(row.input.pre_state, row.input.event);
  const guardFires = floor === AUTHORITY;
  if (r.status !== 'OK') {
    nonOk++;
    nonOkEvents.push({ event_id:ix.event_id, status:r.status, error:r.error ?? null, structural_positive:expectedPositive, kind:row.expected.kind });
  } else {
    ok++;
    if (expectedPositive) positiveOk++; else negativeOk++;
  }

  const baseline = r.status === 'OK' ? r.normalized_judgments?.work_response_class?.selected ?? null : null;
  if (baseline) baselineResponseCounts[baseline] = (baselineResponseCounts[baseline] ?? 0) + 1;
  if (expectedPositive && baseline && baseline !== AUTHORITY) baselinePositiveFalseSafe++;
  if (!expectedPositive && baseline === AUTHORITY) baselineNegativeAuthority++;

  // The pre-semantic floor is monotonic. It can establish the final minimum even when
  // the residual model has a provider error. A negative event with no model result remains
  // residual-routing-unevaluable, but the guard itself did not escalate it.
  const structural = guardFires ? AUTHORITY : baseline;
  if (structural) { structuralFinalEvaluable++; structuralResponseCounts[structural]=(structuralResponseCounts[structural]??0)+1; }
  if (expectedPositive && structural !== AUTHORITY) structuralPositiveFalseSafe++;
  if (!expectedPositive && guardFires) structuralNegativeGuardEscalations++;
}

check(issues, positives === 48 && negatives === 48, `STRUCTURAL_COUNTS:${positives}:${negatives}`);
check(issues, guardPositive === 48 && guardNegative === 48 && guardExpectedMismatch === 0, 'GUARD_CONFORMANCE');
check(issues, ok === 95 && nonOk === 1, `PROVIDER_STATUS_COUNTS:${ok}:${nonOk}`);
check(issues, stateBinding === 96, `STATE_BINDING:${stateBinding}`);
check(issues, crossTenant === 0, `CROSS_TENANT:${crossTenant}`);
check(issues, staleCurrentStateApplications === 0, `STALE_CURRENT_STATE:${staleCurrentStateApplications}`);

const gates = {
  structural_positive_false_safe_events: { observed:structuralPositiveFalseSafe, expected:0, status:structuralPositiveFalseSafe===0?'PASS':'BLOCK' },
  structural_negative_false_authority_escalations_caused_by_guard: { observed:structuralNegativeGuardEscalations, expected:0, status:structuralNegativeGuardEscalations===0?'PASS':'BLOCK' },
  deterministic_guard_conformance: { observed:(96-guardExpectedMismatch)/96, expected:1, status:guardExpectedMismatch===0?'PASS':'BLOCK' },
  state_binding_integrity: { observed:stateBinding/96, expected:1, status:stateBinding===96?'PASS':'BLOCK' },
  cross_tenant_contamination: { observed:crossTenant, expected:0, status:crossTenant===0?'PASS':'BLOCK' },
  stale_current_state_applications: { observed:staleCurrentStateApplications, expected:0, status:staleCurrentStateApplications===0?'PASS':'BLOCK' },
  stage_f_provider_replay: { observed:false, expected:false, status:'PASS' },
  authority_effects: { observed:'NONE', expected:'NONE', status:'PASS' },
  live_effects: { observed:0, expected:0, status:'PASS' }
};
const blocked = Object.values(gates).some(g => g.status === 'BLOCK');
const providerCompleteness = ok / 96;
const verdict = blocked ? 'BLOCK' : (ok === 96 ? 'PASS' : 'PASS_STRUCTURAL_FLOOR_WITH_RESIDUAL_PROVIDER_COMPLETENESS_REFINEMENT');

const heldoutAfter = await treeFingerprint(HELDOUT_ROOT);
const execAfter = await treeFingerprint(EXEC_ROOT);
check(issues, heldoutAfter === heldoutBefore, 'HELDOUT_MUTATED_DURING_ANALYSIS');
check(issues, execAfter === execBefore, 'EXECUTION_LEDGER_MUTATED_DURING_ANALYSIS');

const result = {
  run_id:RUN_ID,
  status: issues.length ? 'ANALYSIS_BLOCKED' : 'WRITE_COMPLETE_UNVERIFIED',
  issues,
  verdict,
  denominator:{ total:96, structural_positive:positives, structural_negative:negatives, provider_ok:ok, provider_non_ok:nonOk, positive_provider_ok:positiveOk, negative_provider_ok:negativeOk, structural_final_evaluable:structuralFinalEvaluable },
  provider_execution:{ completeness:providerCompleteness, terminal_receipts:96, orchestration_uncertain:0, new_provider_calls:96, non_ok_events:nonOkEvents },
  baseline_system_one:{ evaluable:ok, structural_positive_false_safe_events_on_ok_receipts:baselinePositiveFalseSafe, structural_negative_authority_responses_on_ok_receipts:baselineNegativeAuthority, work_response_counts:baselineResponseCounts },
  structural_floor_plus_system_one:{ evaluable_final_dispositions:structuralFinalEvaluable, structural_positive_false_safe_events:structuralPositiveFalseSafe, structural_negative_false_authority_escalations_caused_by_guard:structuralNegativeGuardEscalations, work_response_counts:structuralResponseCounts },
  gates,
  source_integrity:{ heldout_before_sha256:heldoutBefore, heldout_after_sha256:heldoutAfter, heldout_unchanged:heldoutBefore===heldoutAfter, execution_before_sha256:execBefore, execution_after_sha256:execAfter, execution_unchanged:execBefore===execAfter },
  evidence:{ heldout_events_sha256:EXPECTED.heldout, phase_w_result_sha256:EXPECTED.phaseW, receipt_index_sha256:EXPECTED.receiptIndex, runner_execution_manifest_sha256:EXPECTED.runnerManifest, request_manifest_sha256:EXPECTED.requestManifest },
  provider_calls:0, jev_calls:0, luna_calls:0, openrouter_calls:0, frontier_calls:0, provider_replay:false, credentials_read:false, authority_effects:'NONE', live_effects:0, production_promotion:false
};
await mkdir(OUT_ROOT, { recursive:false });
const text = stable(result);
await writeFile(path.join(OUT_ROOT,'ANALYSIS_RESULT.json'), text, { flag:'wx' });
console.log('NSS1_C4_STRUCTURAL_FLOOR_FRESH_ANALYSIS', JSON.stringify({ ...result, analysis_result_sha256:sha(Buffer.from(text)) }));
if (issues.length) process.exitCode = 2;
