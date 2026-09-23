import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

globalThis.fetch = async () => { throw new Error('S1FC_GENERATOR_NETWORK_PROHIBITED'); };

const ROOT = process.env.S1FC_FIXTURE_ROOT ?? '/data/nss-system-one-failure-containment-fixture-v0.1';
const RUN_ID = 'NSS1-SYSTEM-ONE-FAILURE-CONTAINMENT-FIXTURE-v0.1';
const STATUSES = ['OK','PROVIDER_ERROR','TIMEOUT','SCHEMA_INVALID','MODEL_VERSION_MISMATCH','ORCHESTRATION_UNCERTAIN'];
const AUTHORITY = 'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED';
const stable = v => Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v);
const sha = b => createHash('sha256').update(b).digest('hex');
const exists = async f => { try { await stat(f); return true; } catch { return false; } };

if (await exists(ROOT)) throw new Error('S1FC_FIXTURE_ROOT_ALREADY_EXISTS_FAIL_CLOSED');

function baseState(i) {
  return {
    tenant_id: `tenant-s1fc-${String((i % 8) + 1).padStart(2,'0')}`,
    load_id: `load-s1fc-${String(i + 1).padStart(3,'0')}`,
    seal_status: 'MATCHED',
    receiver_identity_status: 'VERIFIED',
    factor_assignment: `factor-${String((i % 4) + 1).padStart(2,'0')}`,
    temperature_f: 36,
    location_status: 'IN_TRANSIT',
    pod_status: 'PENDING',
    gate_status: 'NOT_ARRIVED'
  };
}

function positivePatch(kind, pre) {
  if (kind === 'seal_transition_to_discrepancy') return { seal_status:'DISCREPANCY' };
  if (kind === 'receiver_transition_to_conflict') return { receiver_identity_status:'CONFLICT' };
  if (kind === 'factor_reassignment') return { factor_assignment: pre.factor_assignment === 'factor-99' ? 'factor-98' : 'factor-99' };
  throw new Error(`UNKNOWN_POSITIVE_KIND:${kind}`);
}

function negativePatch(kind, pre) {
  if (kind === 'seal_noncritical_control') return { seal_status:'MATCHED' };
  if (kind === 'receiver_noncritical_control') return { receiver_identity_status:'VERIFIED' };
  if (kind === 'factor_unchanged_control') return { factor_assignment:pre.factor_assignment };
  if (kind === 'temperature_context') return { temperature_f:37 };
  if (kind === 'location_update') return { location_status:'AT_GATE' };
  if (kind === 'pod_status_update') return { pod_status:'RECEIVED' };
  throw new Error(`UNKNOWN_NEGATIVE_KIND:${kind}`);
}

const positiveKinds = ['seal_transition_to_discrepancy','receiver_transition_to_conflict','factor_reassignment'];
const negativeKinds = ['seal_noncritical_control','receiver_noncritical_control','factor_unchanged_control','temperature_context','location_update','pod_status_update'];
const okPositiveSelections = ['NO_ACTION','STATE_UPDATE_ONLY',AUTHORITY,'GENERAL_REASONING_REQUIRED'];
const okNegativeSelections = ['NO_ACTION','STATE_UPDATE_ONLY',AUTHORITY,'GENERAL_REASONING_REQUIRED'];
const rows = [];

for (let cls = 0; cls < 2; cls++) {
  const positive = cls === 0;
  for (let s = 0; s < STATUSES.length; s++) {
    for (let j = 0; j < 8; j++) {
      const ordinal = cls * 48 + s * 8 + j;
      const pre = baseState(ordinal);
      const kind = positive ? positiveKinds[(s * 8 + j) % positiveKinds.length] : negativeKinds[(s * 8 + j) % negativeKinds.length];
      const status = STATUSES[s];
      const id = `${positive ? 'S1FC-P' : 'S1FC-N'}-${String(s * 8 + j + 1).padStart(3,'0')}`;
      const event = {
        event_id:id,
        tenant_id:pre.tenant_id,
        load_id:pre.load_id,
        observed_at:`2026-09-23T${String(10 + (ordinal % 10)).padStart(2,'0')}:${String((ordinal * 7) % 60).padStart(2,'0')}:00Z`,
        patch:positive ? positivePatch(kind,pre) : negativePatch(kind,pre)
      };
      const semantic = status === 'OK' ? {
        status,
        requested_model:'synthetic-system-one',
        effective_model:'synthetic-system-one-v0.1',
        selected_work_response:(positive ? okPositiveSelections[j % okPositiveSelections.length] : okNegativeSelections[j % okNegativeSelections.length])
      } : {
        status,
        requested_model:'synthetic-system-one',
        effective_model: status === 'MODEL_VERSION_MISMATCH' ? 'unexpected-model-v9' : null,
        selected_work_response:null,
        error_code: status === 'PROVIDER_ERROR' ? 'SIMULATED_529' : status === 'TIMEOUT' ? 'SIMULATED_TIMEOUT' : status === 'SCHEMA_INVALID' ? 'SIMULATED_SCHEMA_INVALID' : status === 'MODEL_VERSION_MISMATCH' ? 'SIMULATED_MODEL_VERSION_MISMATCH' : status === 'ORCHESTRATION_UNCERTAIN' ? 'SIMULATED_STARTED_WITHOUT_TERMINAL_PROVIDER_ASSERTION' : null
      };
      rows.push({
        case_id:id,
        pre_state:pre,
        event,
        planned_freshness: ordinal % 2 === 0 ? 'FRESH' : 'STALE',
        simulated_semantic_execution:semantic,
        expected:{ structural_positive:positive, kind, simulated_status:status }
      });
    }
  }
}

if (rows.length !== 96) throw new Error(`FIXTURE_DENOMINATOR:${rows.length}`);
const fixtureText = stable(rows);
const fixtureSha = sha(Buffer.from(fixtureText));
const manifest = {
  run_id:RUN_ID,
  status:'FIXTURE_FROZEN_UNVERIFIED',
  denominator:96,
  structural_positive:48,
  structural_negative:48,
  statuses:STATUSES,
  expected_each_class_each_status:8,
  fixture_sha256:fixtureSha,
  network_calls:0,
  credential_reads:0,
  provider_replay:false,
  authority_effects:'NONE',
  live_effects:0
};
await mkdir(ROOT,{recursive:false});
await writeFile(path.join(ROOT,'FIXTURE.json'),fixtureText,{flag:'wx'});
await writeFile(path.join(ROOT,'MANIFEST.json'),stable(manifest),{flag:'wx'});
console.log('NSS1_S1FC_FIXTURE',JSON.stringify(manifest));
