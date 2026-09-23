import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDERS } from './provider-adapters.mjs';

const RUN_MODE = process.env.RUN_MODE ?? 'preflight';
const EVIDENCE_ROOT = process.env.STAGE_F_EVIDENCE_ROOT ?? '/tmp/stage-f-verified/stage-f-evidence';
const EXEC_ROOT = process.env.EVIDENCE_DIR ?? '/tmp/nss1-stage-f-provider-v0.1';
const OUT_ROOT = process.env.PREFLIGHT_OUT ?? '/tmp/nss1-stage-f-runner-preflight-v0.1';

const EXPECTED = Object.freeze({
  verified_archive_sha256:'b43f7bb6f2a158300c63ff0df9519de21a18e1005860490f4f97ac907ba52af8',
  artifact_index_sha256:'93ade59996340f91a2d5ca9ba4a95273b6c4b2b0bafc9ab2ab2bf82b7016c6b8',
  verification_result_sha256:'5ce0fe75671232b2be18baa63078fc0f22bd550c6dda2648b1668fe67d0e69f5',
  freeze_pointer_sha256:'e5c179dfb80a911225538d19f60ba71c006fb1fb61b6c8bc58711a94e6c6b1c5',
  events_sha256:'1fe85f6a8d2bb5f89597d75ad4f5861a4a839b1c04e56b56fd3d7aa27193ea24',
  state_snapshots_sha256:'89ec348ea6ef1087fe905f230c6ffc069f76e1599221edde20800cc940dccff7',
  initial_states_sha256:'511aae40a7e17562df0ff7fbc12404130597b6f8af9b9baae5d64970a192b0c4',
  semantic_attempts_sha256:'bd878169d903942d7e0d1cc45f6ac7941303896399486ccd7d02edfb691145f9',
  question_set_sha256:'0e8c01c8d98e2fbbeb9f7b034ef638dcf11df0f9f2189834322830bb0b758bcb',
  provider_matrix_sha256:'8135ad29cf2c13d0c433de6a4825d0395889d0c25ef6556e873048728bba9ff8',
  semantic_gold_sha256:'72cadf0a6286c77630519ae505363d59cc0b78f07f5691afaba90bc11aff16ec',
  need_gold_sha256:'863451a33a17578694139c34159ce0059d005d1fa670f6a4f9c1a3c107bd81a2',
  work_disposition_gold_sha256:'adf958371a3735959a305d2dcdb5ba04dac40f52197da998f1c4663ccd255cdf',
  consequence_gold_sha256:'4ade0ab7822d4f19d07e598d53f335a534577befbbf1417a8daf2b035562b07d',
  consequence_weights_sha256:'02852e77dfd19d582bbe001ed8d803616ad9640800b6e9dbefae914c9f7e62aa',
  known_novel_sha256:'7bc0a5665739b20cf0c240635fd2ce7eb9686f55af577336ed4e0fea213e7984',
  freshness_gold_sha256:'c2c9c6b092e80c745b74493682f8934c1b6f10ba7bf90718066797f57ca11a31',
  authority_expectations_sha256:'21bd90921881cc8b0082062835db997489a11585ab0655661d3b7b786591e7d5',
  reconciliation_expectations_sha256:'0cef87523c54bc67e06efb68e5362ee5e8bf496e070904baf5d4930058cac57c',
  metric_spec_sha256:'0363e563b8a621bcf28b487737f13bc6620ddb1ea7465f46b4f3a5dbd35a1fc4',
  acceptance_gates_sha256:'aa121991d20f06c301f65e263bf3bca692142e7929ecc8c854fdfbb0bbf24efb'
});

function stable(v){if(Array.isArray(v))return`[${v.map(stable).join(',')}]`;if(v&&typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;return JSON.stringify(v)}
function shaText(s){return createHash('sha256').update(s).digest('hex')}
function sha(v){return shaText(stable(v))}
async function readJson(name){return JSON.parse(await readFile(path.join(EVIDENCE_ROOT,name),'utf8'))}
async function ensure(p){await mkdir(p,{recursive:true})}
async function writeStable(name,v){const text=stable(v);await ensure(OUT_ROOT);await writeFile(path.join(OUT_ROOT,name),text);return{sha256:shaText(text),bytes:Buffer.byteLength(text)}}
async function countJson(dir){try{return (await readdir(dir)).filter(x=>x.endsWith('.json')).length}catch{return 0}}
async function countTxt(dir){try{return (await readdir(dir)).filter(x=>x.endsWith('.txt')).length}catch{return 0}}

if (RUN_MODE !== 'preflight') throw new Error(`STAGE_F_PROVIDER_EXECUTION_NOT_AUTHORIZED:${RUN_MODE}`);
if (process.env.OPENAI_API_KEY || process.env.TYPESAFE_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OpenRouter_API_KEY) throw new Error('STAGE_F_PREFLIGHT_PROVIDER_CREDENTIALS_PRESENT');
globalThis.fetch = async () => { throw new Error('STAGE_F_PREFLIGHT_NETWORK_CALL_PROHIBITED'); };

const names = [
  'ARTIFACT_INDEX.json','VERIFICATION_RESULT.json','FREEZE_POINTER.json','events.json','state_snapshots.json','initial_states.json','semantic_attempts.json','question_set.json','provider_matrix.json','semantic_gold.json','need_gold.json','work_disposition_gold.json','consequence_class_gold.json','consequence_weights.json','known_novel.json','freshness_gold.json','authority_expectations.json','reconciliation_expectations.json','metric_spec.json','acceptance_gates.json'
];
const data = {};
for (const name of names) data[name] = await readJson(name);

const issues=[];
const check=(label,got,want)=>{if(got!==want)issues.push(`${label}:${got}:${want}`)};
check('ARTIFACT_INDEX_SHA',sha(data['ARTIFACT_INDEX.json']),EXPECTED.artifact_index_sha256);
check('VERIFICATION_RESULT_SHA',sha(data['VERIFICATION_RESULT.json']),EXPECTED.verification_result_sha256);
check('FREEZE_POINTER_SHA',sha(data['FREEZE_POINTER.json']),EXPECTED.freeze_pointer_sha256);
check('EVENTS_SHA',sha(data['events.json']),EXPECTED.events_sha256);
check('STATE_SNAPSHOTS_SHA',sha(data['state_snapshots.json']),EXPECTED.state_snapshots_sha256);
check('INITIAL_STATES_SHA',sha(data['initial_states.json']),EXPECTED.initial_states_sha256);
check('SEMANTIC_ATTEMPTS_SHA',sha(data['semantic_attempts.json']),EXPECTED.semantic_attempts_sha256);
check('QUESTION_SET_SHA',sha(data['question_set.json']),EXPECTED.question_set_sha256);
check('PROVIDER_MATRIX_SHA',sha(data['provider_matrix.json']),EXPECTED.provider_matrix_sha256);
check('SEMANTIC_GOLD_SHA',sha(data['semantic_gold.json']),EXPECTED.semantic_gold_sha256);
check('NEED_GOLD_SHA',sha(data['need_gold.json']),EXPECTED.need_gold_sha256);
check('WORK_GOLD_SHA',sha(data['work_disposition_gold.json']),EXPECTED.work_disposition_gold_sha256);
check('CONSEQUENCE_GOLD_SHA',sha(data['consequence_class_gold.json']),EXPECTED.consequence_gold_sha256);
check('CONSEQUENCE_WEIGHTS_SHA',sha(data['consequence_weights.json']),EXPECTED.consequence_weights_sha256);
check('KNOWN_NOVEL_SHA',sha(data['known_novel.json']),EXPECTED.known_novel_sha256);
check('FRESHNESS_GOLD_SHA',sha(data['freshness_gold.json']),EXPECTED.freshness_gold_sha256);
check('AUTHORITY_EXPECTATIONS_SHA',sha(data['authority_expectations.json']),EXPECTED.authority_expectations_sha256);
check('RECONCILIATION_EXPECTATIONS_SHA',sha(data['reconciliation_expectations.json']),EXPECTED.reconciliation_expectations_sha256);
check('METRIC_SPEC_SHA',sha(data['metric_spec.json']),EXPECTED.metric_spec_sha256);
check('ACCEPTANCE_GATES_SHA',sha(data['acceptance_gates.json']),EXPECTED.acceptance_gates_sha256);
if(data['VERIFICATION_RESULT.json'].status!=='PASS')issues.push(`UPSTREAM_VERIFICATION:${data['VERIFICATION_RESULT.json'].status}`);
if(data['FREEZE_POINTER.json'].status!=='STAGE_F_ZERO_CALL_PREFLIGHT_PASS')issues.push(`UPSTREAM_POINTER:${data['FREEZE_POINTER.json'].status}`);

const events=data['events.json'], attempts=data['semantic_attempts.json'], matrix=data['provider_matrix.json'];
const semanticGold=data['semantic_gold.json'], needGold=data['need_gold.json'], workGold=data['work_disposition_gold.json'], consequenceGold=data['consequence_class_gold.json'], knownNovel=data['known_novel.json'], freshness=data['freshness_gold.json'], authority=data['authority_expectations.json'], reconciliation=data['reconciliation_expectations.json'];
const byEvent = xs => new Map(xs.map(x=>[x.event_id,x]));
const attemptMap = new Map(attempts.map(x=>[x.event.event_id,x]));
const goldMaps=[['SEMANTIC_GOLD',byEvent(semanticGold)],['NEED_GOLD',byEvent(needGold)],['WORK_GOLD',byEvent(workGold)],['CONSEQUENCE_GOLD',byEvent(consequenceGold)],['KNOWN_NOVEL',byEvent(knownNovel)],['FRESHNESS_GOLD',byEvent(freshness)],['AUTHORITY_EXPECTATION',byEvent(authority)],['RECONCILIATION_EXPECTATION',byEvent(reconciliation)]];

check('TOTAL_EVENTS',events.length,320);
check('SEMANTIC_EVENTS',events.filter(x=>x.event_type==='SEMANTIC').length,240);
check('DETERMINISTIC_EVENTS',events.filter(x=>x.event_type!=='SEMANTIC').length,80);
check('SEMANTIC_ATTEMPTS',attempts.length,240);
check('PROVIDER_MATRIX_ROWS',matrix.length,240);
check('CONTROL_LUNA',matrix.filter(x=>x.control_provider==='LUNA').length,240);
check('CANDIDATE_LUNA',matrix.filter(x=>x.candidate_provider==='LUNA').length,80);
check('CANDIDATE_JEV',matrix.filter(x=>x.candidate_provider==='JEV').length,160);
check('KNOWN_SEMANTIC',knownNovel.filter(x=>x.status==='KNOWN').length,160);
check('NOVEL_SEMANTIC',knownNovel.filter(x=>x.status==='NOVEL').length,80);
check('FRESH_SEMANTIC',freshness.filter(x=>x.status==='FRESH_AT_FROZEN_COMPLETION').length,160);
check('STALE_SEMANTIC',freshness.filter(x=>x.status!=='FRESH_AT_FROZEN_COMPLETION').length,80);

for(const m of matrix){
  const a=attemptMap.get(m.event_id); if(!a){issues.push(`MISSING_ATTEMPT:${m.event_id}`);continue}
  if(a.question_set_sha256!==EXPECTED.question_set_sha256)issues.push(`ATTEMPT_QSET_BINDING:${m.event_id}`);
  for(const [label,map] of goldMaps) if(!map.has(m.event_id)) issues.push(`MISSING_${label}:${m.event_id}`);
  const novelty=goldMaps[4][1].get(m.event_id)?.status;
  if(novelty==='NOVEL'&&m.candidate_provider!=='LUNA')issues.push(`NOVEL_NOT_LUNA:${m.event_id}`);
  if(novelty==='KNOWN'&&m.candidate_provider!=='JEV')issues.push(`KNOWN_NOT_JEV:${m.event_id}`);
}

const here=path.dirname(fileURLToPath(import.meta.url));
const providerAdaptersText=await readFile(path.join(here,'provider-adapters.mjs'),'utf8');
const executeEntryText=await readFile(path.join(here,'execute-entry.mjs'),'utf8');
const preflightText=await readFile(path.join(here,'runner-preflight.mjs'),'utf8');
const providerAdaptersSha=shaText(providerAdaptersText), executeEntrySha=shaText(executeEntryText), preflightSourceSha=shaText(preflightText);

const providerAttempts = (await countJson(path.join(EXEC_ROOT,'attempts','luna'))) + (await countJson(path.join(EXEC_ROOT,'attempts','jev')));
const providerReceipts = (await countJson(path.join(EXEC_ROOT,'receipts','luna'))) + (await countJson(path.join(EXEC_ROOT,'receipts','jev')));
const rawResponses = (await countTxt(path.join(EXEC_ROOT,'raw','luna'))) + (await countTxt(path.join(EXEC_ROOT,'raw','jev')));
if(providerAttempts!==0)issues.push(`PREEXISTING_PROVIDER_ATTEMPTS:${providerAttempts}`);
if(providerReceipts!==0)issues.push(`PREEXISTING_PROVIDER_RECEIPTS:${providerReceipts}`);
if(rawResponses!==0)issues.push(`PREEXISTING_RAW_RESPONSES:${rawResponses}`);

const runnerManifest={
  run_id:'NSS1-STAGE-F-PROVIDER-RUNNER-PREFLIGHT-v0.1',
  upstream:{
    verified_archive_sha256:EXPECTED.verified_archive_sha256,
    artifact_index_sha256:EXPECTED.artifact_index_sha256,
    verification_result_sha256:EXPECTED.verification_result_sha256,
    freeze_pointer_sha256:EXPECTED.freeze_pointer_sha256
  },
  roots:{events_sha256:EXPECTED.events_sha256,state_snapshots_sha256:EXPECTED.state_snapshots_sha256,initial_states_sha256:EXPECTED.initial_states_sha256,semantic_attempts_sha256:EXPECTED.semantic_attempts_sha256,question_set_sha256:EXPECTED.question_set_sha256,provider_matrix_sha256:EXPECTED.provider_matrix_sha256,semantic_gold_sha256:EXPECTED.semantic_gold_sha256,need_gold_sha256:EXPECTED.need_gold_sha256,work_disposition_gold_sha256:EXPECTED.work_disposition_gold_sha256,consequence_gold_sha256:EXPECTED.consequence_gold_sha256,consequence_weights_sha256:EXPECTED.consequence_weights_sha256,known_novel_sha256:EXPECTED.known_novel_sha256,freshness_gold_sha256:EXPECTED.freshness_gold_sha256,authority_expectations_sha256:EXPECTED.authority_expectations_sha256,reconciliation_expectations_sha256:EXPECTED.reconciliation_expectations_sha256,metric_spec_sha256:EXPECTED.metric_spec_sha256,acceptance_gates_sha256:EXPECTED.acceptance_gates_sha256},
  denominator:{total_events:320,semantic_events:240,deterministic_events:80,known_semantic:160,novel_semantic:80,fresh_semantic:160,stale_semantic:80,tenants:4,loads:16},
  providers:{luna:{...PROVIDERS.luna,control_calls:240,candidate_shared_calls:80},jev:{...PROVIDERS.jev,candidate_calls:160}},
  provider_attempt_plan:{distinct_attempts:400,luna_attempts:240,jev_attempts:160,candidate_luna_calls:80,candidate_jev_calls:160,candidate_luna_suppression:2/3,shared_luna_observation_count:80},
  typed_semantics:{noul:'probability_of_yes_against_frozen_binary_truth',choice:'finite_option_selection_against_exact_gold',score:'ordered_0_to_4_severity_against_frozen_target'},
  freshness:{rule:'MODEL_COMPLETION != CURRENT_TRUTH',stale_current_state_application:'PROHIBITED'},
  evidence:{attempt_before_call:true,raw_response_before_terminal_receipt:true,raw_hash_bound:true,started_without_terminal:'ORCHESTRATION_UNCERTAIN_RETRY_PROHIBITED',post_hoc_provider_replay:false,independent_verification_required:true},
  execution_boundary:{preflight_provider_calls:0,preflight_credentials_read:false,execute_requires_separate_authorization_artifact:true,authorization_checked_before_credentials:true,authority_effects:'NONE',live_effects:0,production_promotion:false},
  source:{provider_adapters_sha256:providerAdaptersSha,execute_entry_sha256:executeEntrySha,runner_preflight_sha256:preflightSourceSha},
  acceptance_gates_sha256:EXPECTED.acceptance_gates_sha256,
  metric_spec_sha256:EXPECTED.metric_spec_sha256
};
const runnerExecutionManifestSha=sha(runnerManifest);
const result={
  run_id:runnerManifest.run_id,
  status:issues.length?'BLOCK':'PASS',issues,
  runner_execution_manifest_sha256:runnerExecutionManifestSha,
  provider_adapters_sha256:providerAdaptersSha,execute_entry_sha256:executeEntrySha,runner_preflight_sha256:preflightSourceSha,
  verified_stage_f_archive_sha256:EXPECTED.verified_archive_sha256,
  artifact_index_sha256:EXPECTED.artifact_index_sha256,
  provider_matrix_sha256:EXPECTED.provider_matrix_sha256,
  question_set_sha256:EXPECTED.question_set_sha256,
  semantic_gold_sha256:EXPECTED.semantic_gold_sha256,need_gold_sha256:EXPECTED.need_gold_sha256,work_disposition_gold_sha256:EXPECTED.work_disposition_gold_sha256,
  metric_spec_sha256:EXPECTED.metric_spec_sha256,acceptance_gates_sha256:EXPECTED.acceptance_gates_sha256,
  counts:{total_events:320,semantic_events:240,deterministic_events:80,control_luna_calls:240,candidate_luna_calls:80,candidate_jev_calls:160,distinct_provider_attempts:400,provider_attempts_existing:providerAttempts,provider_receipts_existing:providerReceipts,raw_responses_existing:rawResponses},
  provider_calls:0,credentials_read:false,authority_effects:'NONE',live_effects:0,production_promotion:false
};

const manifestWrite=await writeStable('RUNNER_EXECUTION_MANIFEST.json',runnerManifest);
const resultWrite=await writeStable('PREFLIGHT_RESULT.json',result);
const index={run_id:runnerManifest.run_id,entries:[{path:'RUNNER_EXECUTION_MANIFEST.json',sha256:manifestWrite.sha256,bytes:manifestWrite.bytes},{path:'PREFLIGHT_RESULT.json',sha256:resultWrite.sha256,bytes:resultWrite.bytes}]};
const indexWrite=await writeStable('ARTIFACT_INDEX.json',index);
const writeState={run_id:runnerManifest.run_id,status:issues.length?'BLOCK':'WRITE_COMPLETE_UNVERIFIED',artifact_index_sha256:indexWrite.sha256,runner_execution_manifest_sha256:runnerExecutionManifestSha,provider_calls:0,provider_attempts:providerAttempts,provider_receipts:providerReceipts,raw_responses:rawResponses,authority_effects:'NONE'};
await writeStable('WRITE_STATE.json',writeState);
console.log('NSS1_STAGE_F_PROVIDER_RUNNER_PREFLIGHT',JSON.stringify(result));
if(issues.length)process.exitCode=2;
