import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDERS } from '../nss-stage-f-runner/provider-adapters.mjs';

const OUT = process.env.G1_PREFLIGHT_OUT ?? './g1-preflight-evidence';
const RUN_ID = 'NSS1-G1-JEV-BOUNDARY-REQUALIFICATION-v0.1';
const STAGE_F_HEAD = '50ad1605be92002949989c2bb40163aa0586eebc';
const STAGE_F_QSET_SHA = '0e8c01c8d98e2fbbeb9f7b034ef638dcf11df0f9f2189834322830bb0b758bcb';
const SELF = fileURLToPath(import.meta.url);
const DIR = path.dirname(SELF);

const QSET = {
  relevance:{type:'noul',instruction:'Is this event relevant to maintaining active-load continuity or economic integrity?',condition:'The event materially belongs to the active responsibility scope.'},
  material_change:{type:'noul',instruction:'Does this event represent a material change requiring state/work evaluation?',condition:'The event changes operational, economic, service, identity, or authority-relevant state.'},
  need_exists:{type:'noul',instruction:'Does the authoritative state and event create an unmet Need?',condition:'A responsibility-relevant unmet condition exists that warrants work or controlled escalation.'},
  severity:{type:'score',instruction:'Score consequence severity from 0 through 4.',min:0,max:4},
  work_response_class:{type:'choice',instruction:'Choose the required work response class.',options:['NO_ACTION','STATE_UPDATE_ONLY','CREATE_NEED_ONLY','KNOWN_PROCEDURE','GENERAL_REASONING_REQUIRED','FRONTIER_REASONING_REQUIRED','HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED']},
  external_authority_required:{type:'noul',instruction:'Is human or external authority required before the consequential work can be completed?',condition:'The next consequential step requires authority not held by the semantic runtime.'}
};

const STRATA = [
  {family:'minor_gps_update', consequence:'C0_INFORMATIONAL', need:false, material:false, severity:0, work:'STATE_UPDATE_ONLY', authority:false, patch:i=>({location_index:1000+i})},
  {family:'detention_threshold_crossed', consequence:'C2_OPERATIONAL_MATERIAL', need:true, material:true, severity:2, work:'KNOWN_PROCEDURE', authority:false, patch:i=>({detention_minutes:180+i})},
  {family:'contradictory_facility_evidence', consequence:'C3_ECONOMIC_OR_SERVICE_CRITICAL', need:true, material:true, severity:3, work:'GENERAL_REASONING_REQUIRED', authority:false, patch:i=>({facility_evidence_status:`CONFLICT_G1_${i}`})},
  {family:'factor_assignment_change', consequence:'C4_AUTHORITY_OR_SAFETY_CRITICAL', need:true, material:true, severity:4, work:'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED', authority:true, patch:i=>({factor_assignment:`G1_FACTOR_${i}`})}
];

const stable = v => Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v);
const shaText = s => createHash('sha256').update(s).digest('hex');
const sha = v => shaText(stable(v));
async function rawHash(file){ return createHash('sha256').update(await readFile(file)).digest('hex'); }
async function writeStable(name, value){ const text = stable(value); await writeFile(path.join(OUT,name), text); return {path:name, sha256:shaText(text), bytes:Buffer.byteLength(text)}; }

function baseState(s, i){
  return {
    tenant_id:`G1T${s+1}`,
    load_id:`G1T${s+1}-L${String(i+1).padStart(2,'0')}`,
    version:0,
    status:'IN_TRANSIT',
    location_index:400+s*100+i,
    appointment_revision:10+s,
    facility_evidence_status:'CLEAR',
    detention_minutes:30+s,
    pod_status:'MISSING',
    invoice_status:'MISSING',
    factor_assignment:'G1_FACTOR_BASE',
    equipment_status:'READY',
    evidence_identity_status:'MATCH',
    dispatch_revision:20+i,
    experiment_nonce:`G1-${s+1}-${i+1}-20260923`
  };
}

await rm(OUT,{recursive:true,force:true});
await mkdir(OUT,{recursive:true});
if (sha(QSET) !== STAGE_F_QSET_SHA) throw new Error(`QUESTION_SET_DRIFT:${sha(QSET)}`);

const fixtures=[];
for(let s=0;s<STRATA.length;s++){
  const stratum=STRATA[s];
  for(let i=0;i<8;i++){
    const fixture_id=`G1-S${s+1}-F${String(i+1).padStart(2,'0')}`;
    const attempt_id=`${RUN_ID}:${fixture_id}:A1`;
    const pre=baseState(s,i);
    const patch=stratum.patch((s+1)*100+i+1);
    const event={
      event_id:`G1-E-${s+1}-${String(i+1).padStart(2,'0')}`,
      family:stratum.family,
      description:`G1 fresh synthetic ${stratum.family.replaceAll('_',' ')} diagnostic fixture ${i+1} in stratum ${s+1}; nonce ${pre.experiment_nonce}.`,
      patch,
      experiment:'G1_JEV_BOUNDARY_REQUALIFICATION',
      stage_f_replay:false
    };
    const provider_state={
      authoritative_pre_state:pre,
      observed_event:event,
      frozen_binding:{fixture_id,attempt_id,state_sha256:sha(pre),experiment:RUN_ID},
      responsibility:{id:'MAINTAIN_ACTIVE_LOAD_CONTINUITY_AND_ECONOMIC_INTEGRITY_G1',mode:'ISOLATED_SYNTHETIC_SHADOW',authority_effects:'NONE'}
    };
    const requestBody={state:provider_state,model:PROVIDERS.jev.requested_model,questions:'BOUND_BY_STAGE_F_QUESTION_SET_AND_ADAPTER'};
    fixtures.push({
      fixture_id, attempt_id, stratum:s+1, family:stratum.family, consequence_class:stratum.consequence,
      phase:i<2?'CANARY':'EXPANSION', state_sha256:sha(pre), request_body_sha256:sha(requestBody), provider_state,
      gold:{relevance:true,material_change:stratum.material,need_exists:stratum.need,severity:stratum.severity,work_response_class:stratum.work,external_authority_required:stratum.authority},
      authority_effects:'NONE'
    });
  }
}

const sourceFiles={
  preflight:SELF,
  execute:path.join(DIR,'execute.mjs'),
  verify:path.join(DIR,'verify-preflight.mjs'),
  provider_adapter:path.join(DIR,'../nss-stage-f-runner/provider-adapters.mjs'),
  authorization:path.join(DIR,'G1_JEV_BOUNDARY_REQUALIFICATION_AUTHORIZATION_v0.1.md')
};
const source_sha256={};
for(const [k,f] of Object.entries(sourceFiles)) source_sha256[k]=await rawHash(f);

const execution_manifest={
  run_id:RUN_ID,
  predecessor_stage_f_branch_head:STAGE_F_HEAD,
  experiment_relationship:'FRESH_SUCCESSOR_NOT_STAGE_F_REPLAY',
  fixture_count:32,
  canary_count:8,
  expansion_count:24,
  strata:STRATA.map(x=>({family:x.family,consequence_class:x.consequence})),
  question_set_sha256:sha(QSET),
  fixtures_sha256:sha(fixtures),
  provider:{provider:PROVIDERS.jev.provider,endpoint:PROVIDERS.jev.endpoint,requested_model:PROVIDERS.jev.requested_model,required_effective_model:PROVIDERS.jev.effective_required},
  max_jev_calls:32,
  luna_calls:0,
  openrouter_calls:0,
  frontier_calls:0,
  canary_rule:{all_terminal_required:true,orchestration_uncertain_max:0,identical_infrastructure_failure_stop_at:2},
  full_boundary_gate:{terminalized:32,orchestration_uncertain:0,provider_reachability:32,required_model_resolution:32,raw_response_capture:32},
  evidence:{attempt_before_call:true,no_replay_started_without_terminal:true,raw_capture_required_for_boundary_pass:true,diagnostic_failure_separation:true},
  source_sha256,
  provider_calls_during_preflight:0,
  provider_credentials_read:false,
  authority_effects:'NONE',live_freight_effects:0,production_promotion:false
};

const entries=[];
entries.push(await writeStable('question_set.json',QSET));
entries.push(await writeStable('fixtures.json',fixtures));
entries.push(await writeStable('execution_manifest.json',execution_manifest));
const result={
  run_id:RUN_ID,status:'WRITE_COMPLETE_UNVERIFIED',fixture_count:fixtures.length,canary_count:fixtures.filter(x=>x.phase==='CANARY').length,expansion_count:fixtures.filter(x=>x.phase==='EXPANSION').length,
  strata_counts:Object.fromEntries(STRATA.map(x=>[x.family,fixtures.filter(f=>f.family===x.family).length])),
  unique_fixture_ids:new Set(fixtures.map(x=>x.fixture_id)).size,
  unique_attempt_ids:new Set(fixtures.map(x=>x.attempt_id)).size,
  stage_f_id_reuse_detected:fixtures.some(x=>x.fixture_id.startsWith('SFE-')||x.provider_state.observed_event.event_id.startsWith('SFE-')),
  question_set_matches_stage_f:true,
  provider_calls:0,provider_credentials_read:false,luna_calls:0,openrouter_calls:0,frontier_calls:0,authority_effects:'NONE'
};
entries.push(await writeStable('PREFLIGHT_RESULT.json',result));
entries.sort((a,b)=>a.path.localeCompare(b.path));
const artifactIndex={run_id:RUN_ID,entries};
const ai=await writeStable('ARTIFACT_INDEX.json',artifactIndex);
const writeState={run_id:RUN_ID,status:'WRITE_COMPLETE_UNVERIFIED',artifact_index_sha256:ai.sha256,execution_manifest_sha256:sha(execution_manifest),provider_calls:0,provider_credentials_read:false,authority_effects:'NONE'};
await writeStable('WRITE_STATE.json',writeState);
console.log('NSS1_G1_PREFLIGHT_WRITE_COMPLETE',JSON.stringify({...writeState,result}));
