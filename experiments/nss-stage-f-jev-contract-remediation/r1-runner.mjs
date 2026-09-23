import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTypeSafeBody, shaStable } from './provider-contract.mjs';
import { callJevR1, R1_PROVIDER } from './r1-provider-adapter.mjs';

const RUN_MODE = process.env.RUN_MODE ?? 'preflight';
const ROOT = process.env.STAGE_F_EVIDENCE_ROOT;
const EXEC_ROOT = process.env.EVIDENCE_DIR ?? '/data/nss1-stage-f-jev-remediation-r1-v0.1';
const OUT = process.env.R1_PREFLIGHT_OUT ?? '/tmp/nss-stage-f-r1-runner-preflight';
const AUTH_PATH = process.env.STAGE_F_R1_EXECUTION_AUTHORIZATION_PATH;
const RUN_ID = 'NSS1-STAGE-F-JEV-REMEDIATION-R1-v0.1';
const TIMEOUT_MS = 120000;
const MAX_CONCURRENCY = 6;
const EXPECTED_REQUEST_MANIFEST = '2de00a307df61db89cf69dd142b2e26cc9c102349f9fe8f40e5460cd39c29403';
const EXPECTED_QUESTION_SCHEMA = 'fb81d34a0ed11798d04bc332c28fcf0e80b7db4361ca16e488e6dcba1b2273b0';
const PREDECESSOR_RECEIPT_INDEX = '2e50185fa5d4ee5c3f137ccfbb4283d5a8964e6e3d53288a29043ee8f9d207e7';
const PREDECESSOR_FORENSIC_RESULT = '65447706a68cf3ab92e0c115db98cf25c3c7a6aea8a1407b748c6211e1b8538f';
const VERIFIED_STAGE_F_ARCHIVE = 'b43f7bb6f2a158300c63ff0df9519de21a18e1005860490f4f97ac907ba52af8';
const REMEDIATION_VERIFICATION = 'aee61afac6472bc6249ddffd194fbe47c8823c76da822609fa34537a30e67da9';
const SELF = fileURLToPath(import.meta.url);
const DIR = path.dirname(SELF);

const EXPECTED = Object.freeze({
  'events.json':'1fe85f6a8d2bb5f89597d75ad4f5861a4a839b1c04e56b56fd3d7aa27193ea24',
  'state_snapshots.json':'89ec348ea6ef1087fe905f230c6ffc069f76e1599221edde20800cc940dccff7',
  'initial_states.json':'511aae40a7e17562df0ff7fbc12404130597b6f8af9b9baae5d64970a192b0c4',
  'semantic_attempts.json':'bd878169d903942d7e0d1cc45f6ac7941303896399486ccd7d02edfb691145f9',
  'question_set.json':'0e8c01c8d98e2fbbeb9f7b034ef638dcf11df0f9f2189834322830bb0b758bcb',
  'provider_matrix.json':'8135ad29cf2c13d0c433de6a4825d0395889d0c25ef6556e873048728bba9ff8',
  'semantic_gold.json':'72cadf0a6286c77630519ae505363d59cc0b78f07f5691afaba90bc11aff16ec',
  'need_gold.json':'863451a33a17578694139c34159ce0059d005d1fa670f6a4f9c1a3c107bd81a2',
  'work_disposition_gold.json':'adf958371a3735959a305d2dcdb5ba04dac40f52197da998f1c4663ccd255cdf',
  'consequence_class_gold.json':'4ade0ab7822d4f19d07e598d53f335a534577befbbf1417a8daf2b035562b07d',
  'consequence_weights.json':'02852e77dfd19d582bbe001ed8d803616ad9640800b6e9dbefae914c9f7e62aa',
  'known_novel.json':'7bc0a5665739b20cf0c240635fd2ce7eb9686f55af577336ed4e0fea213e7984',
  'freshness_gold.json':'c2c9c6b092e80c745b74493682f8934c1b6f10ba7bf90718066797f57ca11a31',
  'authority_expectations.json':'21bd90921881cc8b0082062835db997489a11585ab0655661d3b7b786591e7d5',
  'reconciliation_expectations.json':'0cef87523c54bc67e06efb68e5362ee5e8bf496e070904baf5d4930058cac57c',
  'metric_spec.json':'0363e563b8a621bcf28b487737f13bc6620ddb1ea7465f46b4f3a5dbd35a1fc4',
  'acceptance_gates.json':'aa121991d20f06c301f65e263bf3bca692142e7929ecc8c854fdfbb0bbf24efb',
  'responsibility.json':'8db6a17b53f51cc2ecc265f8d4d331b0ae497ed9228d2533eedc88355e92e98b'
});

function stable(v){if(Array.isArray(v))return`[${v.map(stable).join(',')}]`;if(v&&typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;return JSON.stringify(v)}
const shaText=s=>createHash('sha256').update(s).digest('hex');
const shaBuf=b=>createHash('sha256').update(b).digest('hex');
const sha=v=>shaText(stable(v));
const json=async f=>JSON.parse(await readFile(f,'utf8'));
const exists=async f=>{try{await readFile(f);return true}catch{return false}};
const rawHash=async f=>shaBuf(await readFile(f));
async function atomicStable(file,v){await mkdir(path.dirname(file),{recursive:true});const tmp=`${file}.tmp-${process.pid}-${Date.now()}`;const text=stable(v);await writeFile(tmp,text);await rename(tmp,file);return{sha256:shaText(text),bytes:Buffer.byteLength(text)}}
async function listJson(dir){try{return(await readdir(dir)).filter(x=>x.endsWith('.json')).sort()}catch{return[]}}

if(!ROOT)throw new Error('STAGE_F_EVIDENCE_ROOT_REQUIRED');

async function verifyFrozenEvidence(){
  const issues=[];
  for(const [name,expected] of Object.entries(EXPECTED)){const got=await rawHash(path.join(ROOT,name));if(got!==expected)issues.push(`ROOT_HASH:${name}:${got}`)}
  const [events,attempts,matrix,qset,snapshots,responsibility]=await Promise.all(['events.json','semantic_attempts.json','provider_matrix.json','question_set.json','state_snapshots.json','responsibility.json'].map(x=>json(path.join(ROOT,x))));
  if(events.length!==320)issues.push(`EVENT_COUNT:${events.length}`);
  if(events.filter(x=>x.event_type==='SEMANTIC').length!==240)issues.push('SEMANTIC_COUNT');
  if(attempts.length!==240||matrix.length!==240)issues.push(`ATTEMPT_MATRIX_COUNT:${attempts.length}:${matrix.length}`);
  const rows=matrix.filter(x=>x.candidate_provider==='JEV').sort((a,b)=>a.event_id.localeCompare(b.event_id));
  if(rows.length!==160)issues.push(`JEV_ROW_COUNT:${rows.length}`);
  const byAttempt=new Map(attempts.map(x=>[x.event.event_id,x])),bySnap=new Map(snapshots.map(x=>[x.event_id,x]));
  const req=[];
  for(const row of rows){const a=byAttempt.get(row.event_id),s=bySnap.get(row.event_id);if(!a||!s){issues.push(`JOIN:${row.event_id}`);continue}if(a.state_sha256!==s.pre_state_sha256)issues.push(`STATE_JOIN:${row.event_id}`);if(a.question_set_sha256!==EXPECTED['question_set.json'])issues.push(`QSET_JOIN:${row.event_id}`);const providerState={authoritative_pre_state:s.pre_state,observed_event:a.event,frozen_binding:{event_id:row.event_id,state_sha256:a.state_sha256,state_version:a.state_version,freshness:a.planned_freshness},responsibility};const body=makeTypeSafeBody({providerState,questionSet:qset});req.push({event_id:row.event_id,body_sha256:shaStable(body),state_sha256:a.state_sha256,question_set_sha256:EXPECTED['question_set.json'],model:body.model,question_schema_sha256:shaStable(body.questions)});}
  const requestManifestSha=sha(req);
  const schemaSet=new Set(req.map(x=>x.question_schema_sha256));
  if(requestManifestSha!==EXPECTED_REQUEST_MANIFEST)issues.push(`REQUEST_MANIFEST:${requestManifestSha}`);
  if(schemaSet.size!==1||req[0]?.question_schema_sha256!==EXPECTED_QUESTION_SCHEMA)issues.push(`QUESTION_SCHEMA:${[...schemaSet].join(',')}`);
  return{issues,events,attempts,matrix,qset,snapshots,responsibility,rows,byAttempt,bySnap,requestManifestSha};
}

async function sourceHashes(){
  const files={runner:SELF,provider_contract:path.join(DIR,'provider-contract.mjs'),r1_provider_adapter:path.join(DIR,'r1-provider-adapter.mjs'),preflight_verifier:path.join(DIR,'verify-r1-runner-preflight.mjs')};
  const out={};for(const [k,f] of Object.entries(files)){if(!(await exists(f)))throw new Error(`SOURCE_MISSING:${k}`);out[k]=await rawHash(f)}return out;
}
function runnerManifest(src){return{
  run_id:RUN_ID,
  predecessor_run_id:'NSS1-STAGE-F-PROVIDER-SHADOW-v0.2',
  verified_stage_f_archive_sha256:VERIFIED_STAGE_F_ARCHIVE,
  predecessor_receipt_index_sha256:PREDECESSOR_RECEIPT_INDEX,
  predecessor_forensic_result_sha256:PREDECESSOR_FORENSIC_RESULT,
  remediation_verification_sha256:REMEDIATION_VERIFICATION,
  request_manifest_sha256:EXPECTED_REQUEST_MANIFEST,
  question_schema_sha256:EXPECTED_QUESTION_SCHEMA,
  evidence_roots:EXPECTED,
  provider:R1_PROVIDER,
  schedule:{new_jev_calls:160,new_luna_calls:0,reused_luna_control_receipts:240,reused_luna_candidate_fallback_receipts:80,semantic_event_denominator:240,luna_suppression:2/3,dispatch_order:'EVENT_ID_ASC'},
  runtime:{max_concurrency:MAX_CONCURRENCY,provider_timeout_ms:TIMEOUT_MS,restart_policy_semantics:'STARTED_WITHOUT_TERMINAL_TO_ORCHESTRATION_UNCERTAIN_NO_REPLAY'},
  evidence:{attempt_before_call:true,raw_response_primary:true,terminal_receipt_required:true,raw_sha_bound:true,provider_replay:false,independent_phase_v_required:true,original_stage_f_ledger_immutable:true},
  semantics:{provider_outputs:'NON_AUTHORITATIVE_SHADOW_JUDGMENT',current_state_application:false,stale_receipts:'HISTORICAL_ONLY_REJECT_FROM_CURRENT_STATE'},
  source_sha256:src,
  metric_spec_sha256:EXPECTED['metric_spec.json'],acceptance_gates_sha256:EXPECTED['acceptance_gates.json'],
  authority_effects:'NONE',openrouter_calls:0,frontier_calls:0,live_effects:0,production_promotion:false
}}

function labelsFor(q){return q.type==='choice'?q.options:['0','1','2','3','4']}
function normalizeDist(o){const entries=Object.entries(o??{}).map(([k,v])=>[k,Number(v)]),sum=entries.reduce((s,[,v])=>s+v,0);if(!Number.isFinite(sum)||sum<=0)throw new Error('INVALID_DISTRIBUTION');return Object.fromEntries(entries.map(([k,v])=>[k,v/sum]))}
function normalize(qset,answers){const out={};for(const [id,q] of Object.entries(qset)){const a=answers?.[id];if(a===undefined)throw new Error(`MISSING_ANSWER:${id}`);if(q.type==='noul'){const p=Number(a?.noul??a?.probability??a);if(!Number.isFinite(p)||p<0||p>1)throw new Error(`INVALID_NOUL:${id}`);out[id]={type:'noul',probability:p,origin:'NATIVE_MODEL_PROBABILITY'};continue}const labels=labelsFor(q),probs=normalizeDist(a?.probabilities??a);for(const l of labels)if(!(l in probs))throw new Error(`MISSING_LABEL:${id}:${l}`);const selected=labels.reduce((b,l)=>(probs[l]??0)>(probs[b]??0)?l:b,labels[0]);if(q.type==='choice')out[id]={type:'choice',selected,probabilities:probs,confidence:probs[selected],origin:'NATIVE_MODEL_PROBABILITY'};else out[id]={type:'score',score:labels.reduce((s,l)=>s+Number(l)*(probs[l]??0),0),probabilities:probs,confidence:Math.max(...Object.values(probs)),origin:'NATIVE_MODEL_PROBABILITY'}}return out}

async function callOne(eventId,ctx,apiKey){
  const a=ctx.byAttempt.get(eventId),s=ctx.bySnap.get(eventId);if(!a||!s)throw new Error(`MISSING_TASK_BINDING:${eventId}`);
  const receiptFile=path.join(EXEC_ROOT,'receipts','jev',`${eventId}.json`),attemptFile=path.join(EXEC_ROOT,'attempts','jev',`${eventId}.json`),rawFile=path.join(EXEC_ROOT,'raw','jev',`${eventId}.txt`);
  if(await exists(receiptFile))return json(receiptFile);
  if(await exists(attemptFile)){const prior=await json(attemptFile);const uncertain={run_id:RUN_ID,event_id:eventId,tenant_id:a.event.tenant_id,load_id:a.event.load_id,provider:'jev',status:'ORCHESTRATION_UNCERTAIN',requested_model:R1_PROVIDER.requested_model,effective_model:null,started_at:prior.started_at,finished_at:new Date().toISOString(),bound_state_sha256:a.state_sha256,question_set_sha256:EXPECTED['question_set.json'],raw_response_sha256:null,normalized_judgments:null,usage:{},cost_usd:null,latency_ms:null,error:'STARTED_WITHOUT_TERMINAL_RECEIPT_RETRY_PROHIBITED',frozen_freshness:a.planned_freshness,current_state_application:false};await atomicStable(receiptFile,uncertain);return uncertain}
  const started_at=new Date().toISOString(),start=Date.now();
  await atomicStable(attemptFile,{run_id:RUN_ID,event_id:eventId,tenant_id:a.event.tenant_id,load_id:a.event.load_id,provider:'jev',status:'STARTED',started_at,bound_state_sha256:a.state_sha256,question_set_sha256:EXPECTED['question_set.json'],requested_model:R1_PROVIDER.requested_model,frozen_freshness:a.planned_freshness});
  let rawText='',status='TRANSPORT_FAILURE',effective=null,normalized=null,usage={},error=null;
  try{const providerState={authoritative_pre_state:s.pre_state,observed_event:a.event,frozen_binding:{event_id:eventId,state_sha256:a.state_sha256,state_version:a.state_version,freshness:a.planned_freshness},responsibility:ctx.responsibility};const res=await callJevR1({apiKey,providerState,questionSet:ctx.qset,timeoutMs:TIMEOUT_MS});rawText=await res.text();await mkdir(path.dirname(rawFile),{recursive:true});await writeFile(rawFile,rawText);let raw;try{raw=JSON.parse(rawText)}catch{throw new Error('NON_JSON_PROVIDER_RESPONSE')}effective=raw.model??null;usage=raw.usage??{};if(!res.ok){status='PROVIDER_ERROR';throw new Error(`JEV_${res.status}`)}if(effective!==R1_PROVIDER.effective_required){status='MODEL_IDENTITY_FAILURE';throw new Error(`MODEL_IDENTITY:${effective}`)}normalized=normalize(ctx.qset,raw.answers??{});status='OK'}catch(e){error=String(e?.message??e)}
  const receipt={run_id:RUN_ID,event_id:eventId,tenant_id:a.event.tenant_id,load_id:a.event.load_id,provider:'jev',status,requested_model:R1_PROVIDER.requested_model,effective_model:effective,started_at,finished_at:new Date().toISOString(),latency_ms:Date.now()-start,bound_state_sha256:a.state_sha256,question_set_sha256:EXPECTED['question_set.json'],raw_response_sha256:rawText?shaText(rawText):null,normalized_judgments:normalized,usage,cost_usd:null,error,frozen_freshness:a.planned_freshness,current_state_application:false};await atomicStable(receiptFile,receipt);return receipt;
}

const frozen=await verifyFrozenEvidence();const src=await sourceHashes();const manifest=runnerManifest(src);const manifestSha=sha(manifest);
const common={run_id:RUN_ID,runner_execution_manifest_sha256:manifestSha,request_manifest_sha256:frozen.requestManifestSha,question_schema_sha256:EXPECTED_QUESTION_SCHEMA,verified_stage_f_archive_sha256:VERIFIED_STAGE_F_ARCHIVE,predecessor_receipt_index_sha256:PREDECESSOR_RECEIPT_INDEX,remediation_verification_sha256:REMEDIATION_VERIFICATION,counts:{events:frozen.events.length,semantic:240,new_jev_attempts:160,reused_luna_control:240,reused_luna_candidate_fallback:80},runtime:manifest.runtime,source_sha256:src,issues:[...frozen.issues],provider_calls:0,authority_effects:'NONE'};

if(RUN_MODE==='preflight'){
  globalThis.fetch=async()=>{throw new Error('STAGE_F_R1_PREFLIGHT_NETWORK_PROHIBITED')};
  const attempts=(await listJson(path.join(EXEC_ROOT,'attempts','jev'))).length,receipts=(await listJson(path.join(EXEC_ROOT,'receipts','jev'))).length;
  if(attempts||receipts)common.issues.push(`PREEXISTING_R1_EFFECT_EVIDENCE:${attempts}:${receipts}`);
  const result={...common,status:common.issues.length?'BLOCK':'PASS',provider_attempts:attempts,provider_receipts:receipts,credentials_read:false,receipt_1_crossed:false,runner_manifest:manifest};await atomicStable(path.join(OUT,'R1_RUNNER_PREFLIGHT.json'),result);console.log('NSS1_STAGE_F_R1_RUNNER_PREFLIGHT',JSON.stringify({...result,runner_manifest:undefined}));if(common.issues.length)process.exitCode=2;
}else if(RUN_MODE==='execute'){
  if(common.issues.length)throw new Error(`FROZEN_EVIDENCE_BLOCK:${common.issues.join('|')}`);if(!AUTH_PATH)throw new Error('STAGE_F_R1_EXECUTION_AUTHORIZATION_REQUIRED');const auth=await json(AUTH_PATH);const required={status:'AUTHORIZED_TO_EXECUTE_STAGE_F_R1_JEV_REMEDIATION',runner_execution_manifest_sha256:manifestSha,request_manifest_sha256:EXPECTED_REQUEST_MANIFEST,question_schema_sha256:EXPECTED_QUESTION_SCHEMA,verified_stage_f_archive_sha256:VERIFIED_STAGE_F_ARCHIVE,predecessor_receipt_index_sha256:PREDECESSOR_RECEIPT_INDEX,new_jev_attempts:160};for(const [k,v] of Object.entries(required))if(auth[k]!==v)throw new Error(`AUTH_MISMATCH:${k}`);
  const preReceipts=(await listJson(path.join(EXEC_ROOT,'receipts','jev'))).length;if(preReceipts)throw new Error(`PREEXISTING_R1_RECEIPTS:${preReceipts}`);const key=process.env.TYPESAFE_API_KEY;if(!key)throw new Error('TYPESAFE_API_KEY_MISSING_AFTER_AUTH');const ctx={qset:frozen.qset,responsibility:frozen.responsibility,byAttempt:frozen.byAttempt,bySnap:frozen.bySnap};let next=0;const receipts=[];async function worker(){while(true){const i=next++;if(i>=frozen.rows.length)return;receipts[i]=await callOne(frozen.rows[i].event_id,ctx,key)}}await Promise.all(Array.from({length:MAX_CONCURRENCY},()=>worker()));const terminal=receipts.length,ok=receipts.filter(x=>x.status==='OK').length,uncertain=receipts.filter(x=>x.status==='ORCHESTRATION_UNCERTAIN').length,nonOk=terminal-ok;const index=[];for(const r of receipts){const rf=path.join(EXEC_ROOT,'receipts','jev',`${r.event_id}.json`);index.push({event_id:r.event_id,provider:'jev',receipt_sha256:await rawHash(rf),raw_response_sha256:r.raw_response_sha256,status:r.status})}index.sort((a,b)=>a.event_id.localeCompare(b.event_id));const iw=await atomicStable(path.join(EXEC_ROOT,'RECEIPT_INDEX.json'),index);const result={run_id:RUN_ID,status:terminal===160&&ok===160?'WRITE_COMPLETE_UNVERIFIED':'BLOCK',runner_execution_manifest_sha256:manifestSha,terminal_receipts:terminal,ok_receipts:ok,non_ok_receipts:nonOk,orchestration_uncertain:uncertain,receipt_index_sha256:iw.sha256,new_provider_calls_planned:160,reused_luna_control_receipts:240,reused_luna_candidate_fallback_receipts:80,authority_effects:'NONE',live_effects:0,openrouter_calls:0,frontier_calls:0};await atomicStable(path.join(EXEC_ROOT,'PHASE_W_RESULT.json'),result);console.log('NSS1_STAGE_F_R1_PROVIDER_WRITE_COMPLETE',JSON.stringify(result));if(result.status!=='WRITE_COMPLETE_UNVERIFIED')process.exitCode=2;
}else throw new Error(`UNSUPPORTED_RUN_MODE:${RUN_MODE}`);
