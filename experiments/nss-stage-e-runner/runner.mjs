import { createHash } from 'node:crypto';
import { readFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MODE = process.env.RUN_MODE ?? 'preflight';
const ZERO_ROOT = process.env.STAGE_E_ZERO_ROOT ?? '/data/nss1-stage-e-zero-call-v0.1';
const EXEC_ROOT = process.env.EVIDENCE_DIR ?? '/data/nss1-stage-e-provider-v0.1';
const ZERO_MANIFEST = '517f2fada5fe54dc22f21fff3b26d55a48e874bf5b08b46225287261e533062a';
const ZERO_POINTER = 'c7c7863c7d858a85ac7871b0f367ec7d3d2a0c665d84dcf7dc5119113b375d56';
const MATRIX_SHA = '76eb87303b6307c5fd7d67c3719b78989d05ee34dbe5bbf7356071f1f1a20b28';
const QSET_SHA = 'c007ae5b13c152a93432adb6491fd59d156bfc54a2c14bb537ff77af13edabb2';
const OPENAI_MODEL = 'gpt-5.6-luna';
const JEV_REQUESTED_MODEL = 'jev-latest';
const JEV_EFFECTIVE_REQUIRED = 'jev-1.13.0';

function stable(v){if(Array.isArray(v))return`[${v.map(stable).join(',')}]`;if(v&&typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;return JSON.stringify(v)}
function shaText(s){return createHash('sha256').update(s).digest('hex')}
function sha(v){return shaText(stable(v))}
async function readJson(file){return JSON.parse(await readFile(file,'utf8'))}
async function exists(file){try{await readFile(file);return true}catch{return false}}
async function ensure(dir){await mkdir(dir,{recursive:true})}
async function writeStable(file,v){const t=stable(v);await ensure(path.dirname(file));await writeFile(file,t);return{sha256:shaText(t),bytes:Buffer.byteLength(t)}}

if(MODE!=='preflight') throw new Error(`STAGE_E_EXECUTION_NOT_YET_AUTHORIZED:${MODE}`);
globalThis.fetch=async()=>{throw new Error('STAGE_E_PREFLIGHT_PROVIDER_CALL_PROHIBITED')};

const [index,pointer,matrix,qset,attempts,events,initialStates] = await Promise.all([
  readJson(path.join(ZERO_ROOT,'artifact_index.json')),
  readJson(path.join(ZERO_ROOT,'freeze_pointer.json')),
  readJson(path.join(ZERO_ROOT,'provider_matrix.json')),
  readJson(path.join(ZERO_ROOT,'question_set.json')),
  readJson(path.join(ZERO_ROOT,'semantic_attempts.json')),
  readJson(path.join(ZERO_ROOT,'events.json')),
  readJson(path.join(ZERO_ROOT,'initial_states.json')),
]);

const issues=[];
if(index.execution_manifest_sha256!==ZERO_MANIFEST)issues.push(`ZERO_MANIFEST:${index.execution_manifest_sha256}`);
if(sha(pointer)!==ZERO_POINTER)issues.push(`ZERO_POINTER:${sha(pointer)}`);
if(pointer.status!=='STAGE_E_ZERO_CALL_PASS')issues.push(`ZERO_STATUS:${pointer.status}`);
if(sha(matrix)!==MATRIX_SHA)issues.push(`MATRIX_SHA:${sha(matrix)}`);
if(sha(qset)!==QSET_SHA)issues.push(`QSET_SHA:${sha(qset)}`);
if(events.length!==384)issues.push(`EVENT_COUNT:${events.length}`);
if(events.filter(e=>e.semantic).length!==288)issues.push(`SEMANTIC_EVENT_COUNT:${events.filter(e=>e.semantic).length}`);
if(attempts.length!==240)issues.push(`ATTEMPT_COUNT:${attempts.length}`);
if(matrix.length!==240)issues.push(`MATRIX_COUNT:${matrix.length}`);
const lunaRows=matrix.filter(m=>m.provider==='LUNA').length;
const jevRows=matrix.filter(m=>m.provider==='JEV').length;
if(lunaRows!==80||jevRows!==160)issues.push(`MATRIX_ROUTE_COUNTS:${lunaRows}:${jevRows}`);
const attemptById=new Map(attempts.map(a=>[a.event.event_id,a]));
for(const m of matrix){const a=attemptById.get(m.event_id);if(!a)issues.push(`MISSING_ATTEMPT:${m.event_id}`);else{if(m.bound_state_sha256!==a.bound_state_sha256)issues.push(`STATE_BINDING:${m.event_id}`);if(m.question_set_sha256!==QSET_SHA)issues.push(`QSET_BINDING:${m.event_id}`)}}

const runnerManifest={
  run_id:'NSS1-STAGE-E-PROVIDER-SHADOW-v0.1',
  zero_call_execution_manifest_sha256:ZERO_MANIFEST,
  zero_call_freeze_pointer_sha256:ZERO_POINTER,
  provider_matrix_sha256:MATRIX_SHA,
  question_set_sha256:QSET_SHA,
  denominator:{total_events:384,semantic_events:288,provider_eligible_attempts:240,tenants:4,loads:12},
  providers:{
    luna:{requested:OPENAI_MODEL,effective_required:OPENAI_MODEL,control_calls:240,candidate_shared_receipts:80},
    jev:{requested:JEV_REQUESTED_MODEL,effective_required:JEV_EFFECTIVE_REQUIRED,candidate_calls:160}
  },
  total_distinct_provider_attempts:400,
  candidate:{luna_calls:80,jev_calls:160,luna_suppression:2/3},
  semantics:{provider_outputs:'NON_AUTHORITATIVE_SHADOW_JUDGMENT',authoritative_state_mutation_from_model_output:false,fresh_state_rule:'CURRENT_AUTHORITATIVE_STATE_SHA256 == FROZEN_BOUND_STATE_SHA256',stale_receipt_rule:'REJECT_FROM_CURRENT_STATE_APPLICATION'},
  evidence:{attempt_before_call:true,raw_response_persisted:true,terminal_receipt_required:true,raw_hash_bound:true,started_without_terminal_receipt:'ORCHESTRATION_UNCERTAIN_RETRY_PROHIBITED',post_hoc_provider_replay:false,independent_verification:true},
  gates:{terminal_receipts:400,unexpected_attempts:0,raw_hash_mismatches:0,accepted_model_identity_mismatches:0,state_binding_mismatches:0,stale_receipt_current_state_applications:0,cross_tenant_contamination:0,cross_load_contamination:0,authority_expansion:0,openrouter_calls:0,frontier_calls:0,live_effects:0,authority_effects:'NONE'},
  initial_states_sha256:sha(initialStates),
  semantic_attempts_sha256:sha(attempts),
  events_sha256:sha(events),
  provider_calls_authorized_after_exact_preflight_freeze:false
};
const runnerSha=sha(runnerManifest);

const receiptRoots=[path.join(EXEC_ROOT,'receipts','luna'),path.join(EXEC_ROOT,'receipts','jev')];
let existingReceipts=[];
for(const dir of receiptRoots){try{for(const f of await readdir(dir))if(f.endsWith('.json'))existingReceipts.push(path.join(path.basename(dir),f))}catch{}}
if(existingReceipts.length)issues.push(`PREEXISTING_RECEIPTS:${existingReceipts.length}`);

const out={
  run_id:runnerManifest.run_id,
  status:issues.length?'BLOCK':'PASS',
  issues,
  provider_receipts:existingReceipts.length,
  runner_execution_manifest_sha256:runnerSha,
  zero_call_execution_manifest_sha256:ZERO_MANIFEST,
  zero_call_freeze_pointer_sha256:ZERO_POINTER,
  provider_matrix_sha256:MATRIX_SHA,
  question_set_sha256:QSET_SHA,
  event_count:384,
  semantic_event_count:288,
  provider_eligible_attempts:240,
  control_luna_calls:240,
  candidate_shared_luna_receipts:80,
  candidate_jev_calls:160,
  total_distinct_provider_attempts:400,
  candidate_luna_suppression:2/3,
  model_identities:{luna:{requested:OPENAI_MODEL,effective_required:OPENAI_MODEL},jev:{requested:JEV_REQUESTED_MODEL,effective_required:JEV_EFFECTIVE_REQUIRED}},
  provider_outputs:'NON_AUTHORITATIVE_SHADOW_JUDGMENT',
  authority_effects:'NONE',openrouter_calls:0,frontier_calls:0,live_effects:0
};

await writeStable('/tmp/NSS1_STAGE_E_PROVIDER_RUNNER_PREFLIGHT.json',{runner_manifest:runnerManifest,result:out});
console.log('NSS1_STAGE_E_PROVIDER_EXECUTION_PREFLIGHT',JSON.stringify(out));
if(issues.length)process.exitCode=2;
