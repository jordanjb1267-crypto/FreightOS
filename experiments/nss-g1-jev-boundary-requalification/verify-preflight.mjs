import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.env.G1_PREFLIGHT_ROOT;
if (!ROOT) throw new Error('G1_PREFLIGHT_ROOT_REQUIRED');

const stable = v => Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v);
const shaText = s => createHash('sha256').update(s).digest('hex');
const sha = v => shaText(stable(v));
const json = async name => JSON.parse(await readFile(path.join(ROOT,name),'utf8'));

const qset = await json('question_set.json');
const fixtures = await json('fixtures.json');
const manifest = await json('execution_manifest.json');
const result = await json('PREFLIGHT_RESULT.json');
const writeState = await json('WRITE_STATE.json');
const artifactIndex = await json('ARTIFACT_INDEX.json');
const issues=[];

if(manifest.run_id!=='NSS1-G1-JEV-BOUNDARY-REQUALIFICATION-v0.1') issues.push('RUN_ID');
if(manifest.predecessor_stage_f_branch_head!=='50ad1605be92002949989c2bb40163aa0586eebc') issues.push('STAGE_F_PREDECESSOR');
if(manifest.experiment_relationship!=='FRESH_SUCCESSOR_NOT_STAGE_F_REPLAY') issues.push('RELATIONSHIP');
if(fixtures.length!==32) issues.push(`FIXTURE_COUNT:${fixtures.length}`);
if(fixtures.filter(x=>x.phase==='CANARY').length!==8) issues.push('CANARY_COUNT');
if(fixtures.filter(x=>x.phase==='EXPANSION').length!==24) issues.push('EXPANSION_COUNT');
const expectedFamilies=['minor_gps_update','detention_threshold_crossed','contradictory_facility_evidence','factor_assignment_change'];
for(const family of expectedFamilies) if(fixtures.filter(x=>x.family===family).length!==8) issues.push(`FAMILY_COUNT:${family}`);
if(new Set(fixtures.map(x=>x.fixture_id)).size!==32) issues.push('FIXTURE_ID_UNIQUENESS');
if(new Set(fixtures.map(x=>x.attempt_id)).size!==32) issues.push('ATTEMPT_ID_UNIQUENESS');
if(fixtures.some(x=>x.fixture_id.startsWith('SFE-')||x.provider_state?.observed_event?.event_id?.startsWith('SFE-'))) issues.push('STAGE_F_ID_REUSE');
if(manifest.question_set_sha256!==sha(qset)) issues.push('QUESTION_SET_HASH');
if(manifest.question_set_sha256!=='0e8c01c8d98e2fbbeb9f7b034ef638dcf11df0f9f2189834322830bb0b758bcb') issues.push('QUESTION_SET_DRIFT_FROM_STAGE_F');
if(manifest.fixtures_sha256!==sha(fixtures)) issues.push('FIXTURE_HASH');
if(manifest.max_jev_calls!==32||manifest.luna_calls!==0||manifest.openrouter_calls!==0||manifest.frontier_calls!==0) issues.push('CALL_BUDGET');
if(manifest.provider.provider!=='TYPESAFE_SYSTEM_ONE'||manifest.provider.requested_model!=='jev-latest'||manifest.provider.required_effective_model!=='jev-1.13.0') issues.push('PROVIDER_IDENTITY');
if(manifest.canary_rule?.identical_infrastructure_failure_stop_at!==2) issues.push('CANARY_STOP_RULE');
if(manifest.full_boundary_gate?.terminalized!==32||manifest.full_boundary_gate?.orchestration_uncertain!==0||manifest.full_boundary_gate?.provider_reachability!==32||manifest.full_boundary_gate?.required_model_resolution!==32||manifest.full_boundary_gate?.raw_response_capture!==32) issues.push('BOUNDARY_GATE');
if(result.provider_calls!==0||result.provider_credentials_read!==false||manifest.provider_calls_during_preflight!==0||manifest.provider_credentials_read!==false) issues.push('PREFLIGHT_EFFECT');
if(result.stage_f_id_reuse_detected!==false) issues.push('REUSE_RESULT');
if(result.authority_effects!=='NONE'||manifest.authority_effects!=='NONE'||manifest.live_freight_effects!==0||manifest.production_promotion!==false) issues.push('AUTHORITY_BOUNDARY');
if(writeState.provider_calls!==0||writeState.provider_credentials_read!==false||writeState.authority_effects!=='NONE') issues.push('WRITE_STATE_BOUNDARY');

for(const entry of artifactIndex.entries){
  const text=await readFile(path.join(ROOT,entry.path),'utf8');
  if(shaText(text)!==entry.sha256) issues.push(`ARTIFACT_HASH:${entry.path}`);
}

const verification={
  run_id:manifest.run_id,
  status:issues.length?'BLOCK':'PASS',
  issues,
  fixture_count:fixtures.length,
  canary_count:fixtures.filter(x=>x.phase==='CANARY').length,
  expansion_count:fixtures.filter(x=>x.phase==='EXPANSION').length,
  question_set_sha256:manifest.question_set_sha256,
  execution_manifest_sha256:writeState.execution_manifest_sha256,
  provider_calls:0,
  provider_credentials_read:false,
  authority_effects:'NONE'
};
await writeFile(path.join(ROOT,'VERIFICATION_RESULT.json'),stable(verification));
console.log('NSS1_G1_PREFLIGHT_VERIFY_COMPLETE',JSON.stringify(verification));
if(issues.length) process.exitCode=1;
