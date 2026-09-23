import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RUN_MODE=process.env.RUN_MODE??'preflight';
const ROOT=process.env.STAGE_F_EVIDENCE_ROOT;
const EXEC_ROOT=process.env.EVIDENCE_DIR??'/data/nss1-stage-f-provider-v0.2';
const OUT=process.env.PROGRAM_PREFLIGHT_OUT??'/tmp/nss-stage-f-phase-w-program';
const AUTH_PATH=process.env.STAGE_F_EXECUTION_AUTHORIZATION_PATH;
const EXPECTED_ARCHIVE='b43f7bb6f2a158300c63ff0df9519de21a18e1005860490f4f97ac907ba52af8';
const PREDECESSOR_MANIFEST='5f068643ca73307f363cfc2aa4f616e68fd23df5ba372f1f3017f0cfe54a1e85';
const PREFLIGHT_POINTER='bab19728324ef85a08575c171a986f62cdbd6713ba8cda116be67c0ad44c61d6';
const TIMEOUT_MS=120000;
const MAX_CONCURRENCY=6;
const RUN_ID='NSS1-STAGE-F-PROVIDER-SHADOW-v0.2';
const SELF=fileURLToPath(import.meta.url);
const DIR=path.dirname(SELF);
const EXPECTED={
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
 'acceptance_gates.json':'aa121991d20f06c301f65e263bf3bca692142e7929ecc8c854fdfbb0bbf24efb'
};

function stable(v){if(Array.isArray(v))return`[${v.map(stable).join(',')}]`;if(v&&typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;return JSON.stringify(v)}
const shaText=s=>createHash('sha256').update(s).digest('hex');
const shaBuf=b=>createHash('sha256').update(b).digest('hex');
const sha=v=>shaText(stable(v));
const json=async f=>JSON.parse(await readFile(f,'utf8'));
const exists=async f=>{try{await readFile(f);return true}catch{return false}};
async function atomicStable(file,v){await mkdir(path.dirname(file),{recursive:true});const tmp=`${file}.tmp-${process.pid}-${Date.now()}`;const text=stable(v);await writeFile(tmp,text);await rename(tmp,file);return{sha256:shaText(text),bytes:Buffer.byteLength(text)}}
async function rawHash(file){return shaBuf(await readFile(file))}

if(!ROOT)throw new Error('STAGE_F_EVIDENCE_ROOT_REQUIRED');

async function verifyFrozenEvidence(){
 const issues=[];
 for(const [name,expected] of Object.entries(EXPECTED)){const got=await rawHash(path.join(ROOT,name));if(got!==expected)issues.push(`ROOT_HASH:${name}:${got}`)}
 const [events,attempts,matrix,qset,snapshots,known,fresh]=await Promise.all(['events.json','semantic_attempts.json','provider_matrix.json','question_set.json','state_snapshots.json','known_novel.json','freshness_gold.json'].map(x=>json(path.join(ROOT,x))));
 if(events.length!==320)issues.push(`EVENT_COUNT:${events.length}`);
 if(events.filter(x=>x.event_type==='SEMANTIC').length!==240)issues.push('SEMANTIC_COUNT');
 if(attempts.length!==240||matrix.length!==240)issues.push(`ATTEMPT_MATRIX_COUNT:${attempts.length}:${matrix.length}`);
 const knownCount=known.filter(x=>x.status==='KNOWN').length,novelCount=known.filter(x=>x.status==='NOVEL').length;
 if(knownCount!==160||novelCount!==80)issues.push(`KNOWN_NOVEL:${knownCount}:${novelCount}`);
 const freshCount=fresh.filter(x=>x.status==='FRESH_AT_FROZEN_COMPLETION').length,staleCount=fresh.filter(x=>x.status==='STALE_REJECTED_AT_FROZEN_COMPLETION').length;
 if(freshCount!==160||staleCount!==80)issues.push(`FRESH_STALE:${freshCount}:${staleCount}`);
 const candLuna=matrix.filter(x=>x.candidate_provider==='LUNA').length,candJev=matrix.filter(x=>x.candidate_provider==='JEV').length;
 if(candLuna!==80||candJev!==160)issues.push(`ROUTING:${candLuna}:${candJev}`);
 const byAttempt=new Map(attempts.map(x=>[x.event.event_id,x])),bySnap=new Map(snapshots.map(x=>[x.event_id,x]));
 for(const row of matrix){const a=byAttempt.get(row.event_id),s=bySnap.get(row.event_id);if(!a||!s)issues.push(`JOIN:${row.event_id}`);else{if(a.state_sha256!==s.pre_state_sha256)issues.push(`STATE_JOIN:${row.event_id}`);if(a.question_set_sha256!==EXPECTED['question_set.json'])issues.push(`QSET_JOIN:${row.event_id}`)}}
 return{issues,events,attempts,matrix,qset,snapshots,known,fresh};
}

async function sourceHashes(){
 const files={phase_w_program:SELF,provider_adapters:path.join(DIR,'provider-adapters.mjs'),execute_entry:path.join(DIR,'execute-entry.mjs'),phase_v_verifier:path.join(DIR,'verify-phase-w.mjs')};
 const out={};for(const [k,f] of Object.entries(files)){if(!(await exists(f)))throw new Error(`SOURCE_MISSING:${k}`);out[k]=await rawHash(f)}return out;
}

function manifest(src){return{
 run_id:RUN_ID,
 predecessor_runner_execution_manifest_sha256:PREDECESSOR_MANIFEST,
 preflight_freeze_pointer_sha256:PREFLIGHT_POINTER,
 verified_stage_f_archive_sha256:EXPECTED_ARCHIVE,
 evidence_roots:EXPECTED,
 providers:{luna:{provider:'OPENAI_RESPONSES_API',requested_model:'gpt-5.6-luna',effective_required:'gpt-5.6-luna'},jev:{provider:'TYPESAFE_SYSTEM_ONE',requested_model:'jev-latest',effective_required:'jev-1.13.0'}},
 schedule:{control_luna:240,candidate_shared_luna:80,candidate_jev:160,distinct_provider_attempts:400,luna_suppression:2/3,dispatch_order:'EVENT_ID_ASC_THEN_PROVIDER_LUNA_BEFORE_JEV'},
 runtime:{max_concurrency:MAX_CONCURRENCY,provider_timeout_ms:TIMEOUT_MS,restart_policy_semantics:'STARTED_WITHOUT_TERMINAL_TO_ORCHESTRATION_UNCERTAIN_NO_REPLAY'},
 evidence:{attempt_before_call:true,raw_response_primary:true,terminal_receipt_required:true,raw_sha_bound:true,provider_replay:false,independent_phase_v_required:true},
 semantics:{provider_outputs:'NON_AUTHORITATIVE_SHADOW_JUDGMENT',current_state_application:false,stale_receipts:'HISTORICAL_ONLY_REJECT_FROM_CURRENT_STATE'},
 source_sha256:src,
 metric_spec_sha256:EXPECTED['metric_spec.json'],acceptance_gates_sha256:EXPECTED['acceptance_gates.json'],
 authority_effects:'NONE',openrouter_calls:0,frontier_calls:0,live_effects:0,production_promotion:false
}}

function labelsFor(q){return q.type==='choice'?q.options:['0','1','2','3','4']}
function normalizeDist(o){const entries=Object.entries(o??{}).map(([k,v])=>[k,Number(v)]),sum=entries.reduce((s,[,v])=>s+v,0);if(!Number.isFinite(sum)||sum<=0)throw new Error('INVALID_DISTRIBUTION');return Object.fromEntries(entries.map(([k,v])=>[k,v/sum]))}
function normalize(qset,answers,origin){const out={};for(const [id,q] of Object.entries(qset)){let a=answers?.[id];if(a===undefined)throw new Error(`MISSING_ANSWER:${id}`);if(q.type==='noul'){const p=Number(a?.noul??a?.probability??a);if(!Number.isFinite(p)||p<0||p>1)throw new Error(`INVALID_NOUL:${id}`);out[id]={type:'noul',probability:p,origin};continue}const labels=labelsFor(q),probs=normalizeDist(a?.probabilities??a);for(const l of labels)if(!(l in probs))throw new Error(`MISSING_LABEL:${id}:${l}`);const selected=labels.reduce((b,l)=>(probs[l]??0)>(probs[b]??0)?l:b,labels[0]);if(q.type==='choice')out[id]={type:'choice',selected,probabilities:probs,confidence:probs[selected],origin};else out[id]={type:'score',score:labels.reduce((s,l)=>s+Number(l)*(probs[l]??0),0),probabilities:probs,confidence:Math.max(...Object.values(probs)),origin}}return out}
function lunaOutput(raw){let text='';for(const o of raw.output??[])if(o.type==='message')for(const c of o.content??[])if(c.type==='output_text')text+=c.text??'';if(!text)throw new Error('LUNA_EMPTY_OUTPUT');return JSON.parse(text).answers??{}}

async function listJson(dir){try{return(await readdir(dir)).filter(x=>x.endsWith('.json'))}catch{return[]}}
async function makeTasks(matrix){const tasks=[];for(const r of matrix){tasks.push({event_id:r.event_id,provider:'luna'});if(r.candidate_provider==='JEV')tasks.push({event_id:r.event_id,provider:'jev'})}return tasks.sort((a,b)=>a.event_id.localeCompare(b.event_id)||(a.provider==='luna'?-1:1))}

async function callOne(task,ctx,surface,keys){
 const attempt=ctx.attemptById.get(task.event_id),snap=ctx.snapshotById.get(task.event_id);if(!attempt||!snap)throw new Error(`MISSING_TASK_BINDING:${task.event_id}`);
 const pdir=task.provider,receiptFile=path.join(EXEC_ROOT,'receipts',pdir,`${task.event_id}.json`),attemptFile=path.join(EXEC_ROOT,'attempts',pdir,`${task.event_id}.json`),rawFile=path.join(EXEC_ROOT,'raw',pdir,`${task.event_id}.txt`);
 if(await exists(receiptFile))return json(receiptFile);
 if(await exists(attemptFile)){const prior=await json(attemptFile);const uncertain={run_id:RUN_ID,event_id:task.event_id,tenant_id:attempt.event.tenant_id,load_id:attempt.event.load_id,provider:pdir,status:'ORCHESTRATION_UNCERTAIN',requested_model:pdir==='luna'?'gpt-5.6-luna':'jev-latest',effective_model:null,started_at:prior.started_at,finished_at:new Date().toISOString(),bound_state_sha256:attempt.state_sha256,question_set_sha256:EXPECTED['question_set.json'],raw_response_sha256:null,normalized_judgments:null,usage:{},cost_usd:null,latency_ms:null,error:'STARTED_WITHOUT_TERMINAL_RECEIPT_RETRY_PROHIBITED',frozen_freshness:attempt.planned_freshness,current_state_application:false};await atomicStable(receiptFile,uncertain);return uncertain}
 const requested=task.provider==='luna'?'gpt-5.6-luna':'jev-latest',started_at=new Date().toISOString(),start=Date.now();
 await atomicStable(attemptFile,{run_id:RUN_ID,event_id:task.event_id,tenant_id:attempt.event.tenant_id,load_id:attempt.event.load_id,provider:pdir,status:'STARTED',started_at,bound_state_sha256:attempt.state_sha256,question_set_sha256:EXPECTED['question_set.json'],requested_model:requested,frozen_freshness:attempt.planned_freshness});
 let rawText='',status='TRANSPORT_FAILURE',effective=null,normalized=null,usage={},error=null;
 try{
  const providerState={authoritative_pre_state:snap.pre_state,observed_event:attempt.event,frozen_binding:{event_id:task.event_id,state_sha256:attempt.state_sha256,state_version:attempt.state_version,freshness:attempt.planned_freshness},responsibility:ctx.responsibility};
  const res=task.provider==='luna'?await surface.callLuna({apiKey:keys.openai,providerState,questionSet:ctx.qset,timeoutMs:TIMEOUT_MS}):await surface.callJev({apiKey:keys.typesafe,providerState,questionSet:ctx.qset,timeoutMs:TIMEOUT_MS});
  rawText=await res.text();await mkdir(path.dirname(rawFile),{recursive:true});await writeFile(rawFile,rawText);let raw;try{raw=JSON.parse(rawText)}catch{throw new Error('NON_JSON_PROVIDER_RESPONSE')}
  effective=raw.model??null;usage=raw.usage??{};if(!res.ok){status='PROVIDER_ERROR';throw new Error(`${task.provider.toUpperCase()}_${res.status}`)}
  const expectedModel=task.provider==='luna'?'gpt-5.6-luna':'jev-1.13.0';if(effective!==expectedModel){status='MODEL_IDENTITY_FAILURE';throw new Error(`MODEL_IDENTITY:${effective}`)}
  const answers=task.provider==='luna'?lunaOutput(raw):(raw.answers??{});normalized=normalize(ctx.qset,answers,task.provider==='luna'?'SELF_REPORTED_PROBABILITY':'NATIVE_MODEL_PROBABILITY');status='OK';
 }catch(e){error=String(e?.message??e)}
 const receipt={run_id:RUN_ID,event_id:task.event_id,tenant_id:attempt.event.tenant_id,load_id:attempt.event.load_id,provider:pdir,status,requested_model:requested,effective_model:effective,started_at,finished_at:new Date().toISOString(),latency_ms:Date.now()-start,bound_state_sha256:attempt.state_sha256,question_set_sha256:EXPECTED['question_set.json'],raw_response_sha256:rawText?shaText(rawText):null,normalized_judgments:normalized,usage,cost_usd:null,error,frozen_freshness:attempt.planned_freshness,current_state_application:false};await atomicStable(receiptFile,receipt);return receipt;
}

const frozen=await verifyFrozenEvidence();const src=await sourceHashes();const successorManifest=manifest(src);const successorManifestSha=sha(successorManifest);
const common={run_id:RUN_ID,predecessor_runner_execution_manifest_sha256:PREDECESSOR_MANIFEST,preflight_freeze_pointer_sha256:PREFLIGHT_POINTER,verified_stage_f_archive_sha256:EXPECTED_ARCHIVE,successor_runner_execution_manifest_sha256:successorManifestSha,source_sha256:src,counts:{events:frozen.events.length,semantic:frozen.events.filter(x=>x.event_type==='SEMANTIC').length,deterministic:frozen.events.filter(x=>x.event_type!=='SEMANTIC').length,attempts:frozen.attempts.length,matrix:frozen.matrix.length,distinct_provider_attempts:400},runtime:successorManifest.runtime,issues:[...frozen.issues],provider_calls:0,authority_effects:'NONE'};

if(RUN_MODE==='preflight'){
 globalThis.fetch=async()=>{throw new Error('STAGE_F_SUCCESSOR_PREFLIGHT_NETWORK_PROHIBITED')};
 const attemptCount=(await listJson(path.join(EXEC_ROOT,'attempts','luna'))).length+(await listJson(path.join(EXEC_ROOT,'attempts','jev'))).length,receiptCount=(await listJson(path.join(EXEC_ROOT,'receipts','luna'))).length+(await listJson(path.join(EXEC_ROOT,'receipts','jev'))).length;
 if(attemptCount||receiptCount)common.issues.push(`PREEXISTING_EFFECT_EVIDENCE:${attemptCount}:${receiptCount}`);
 const result={...common,status:common.issues.length?'BLOCK':'PASS',provider_attempts:attemptCount,provider_receipts:receiptCount,credentials_read:false,receipt_1_crossed:false,successor_manifest:successorManifest};await atomicStable(path.join(OUT,'PHASE_W_PROGRAM_PREFLIGHT.json'),result);console.log('NSS1_STAGE_F_PHASE_W_PROGRAM_PREFLIGHT',JSON.stringify({...result,successor_manifest:undefined}));if(common.issues.length)process.exitCode=2;
}else if(RUN_MODE==='execute'){
 if(common.issues.length)throw new Error(`FROZEN_EVIDENCE_BLOCK:${common.issues.join('|')}`);if(!AUTH_PATH)throw new Error('STAGE_F_SUCCESSOR_EXECUTION_AUTHORIZATION_REQUIRED');const auth=await json(AUTH_PATH);
 const required={status:'AUTHORIZED_TO_EXECUTE_STAGE_F_PROVIDER_SHADOW',successor_runner_execution_manifest_sha256:successorManifestSha,predecessor_runner_execution_manifest_sha256:PREDECESSOR_MANIFEST,preflight_freeze_pointer_sha256:PREFLIGHT_POINTER,verified_stage_f_archive_sha256:EXPECTED_ARCHIVE,distinct_provider_attempts:400};for(const [k,v] of Object.entries(required))if(auth[k]!==v)throw new Error(`AUTH_MISMATCH:${k}`);
 const preAttempts=(await listJson(path.join(EXEC_ROOT,'attempts','luna'))).length+(await listJson(path.join(EXEC_ROOT,'attempts','jev'))).length,preReceipts=(await listJson(path.join(EXEC_ROOT,'receipts','luna'))).length+(await listJson(path.join(EXEC_ROOT,'receipts','jev'))).length;if(preReceipts)throw new Error(`PREEXISTING_RECEIPTS:${preReceipts}`);
 process.env.STAGE_F_EXECUTION_AUTHORIZATION_PATH=AUTH_PATH;const { EXECUTION_SURFACE }=await import('./execute-entry.mjs');const keys={openai:process.env.OPENAI_API_KEY,typesafe:process.env.TYPESAFE_API_KEY};if(!keys.openai||!keys.typesafe)throw new Error('CREDENTIALS_MISSING_AFTER_AUTH');
 const ctx={qset:frozen.qset,responsibility:await json(path.join(ROOT,'responsibility.json')),attemptById:new Map(frozen.attempts.map(x=>[x.event.event_id,x])),snapshotById:new Map(frozen.snapshots.map(x=>[x.event_id,x]))};const tasks=await makeTasks(frozen.matrix);let next=0;const receipts=[];async function worker(){while(true){const i=next++;if(i>=tasks.length)return;receipts[i]=await callOne(tasks[i],ctx,EXECUTION_SURFACE,keys)}}await Promise.all(Array.from({length:MAX_CONCURRENCY},()=>worker()));
 const terminal=receipts.length,ok=receipts.filter(x=>x.status==='OK').length,uncertain=receipts.filter(x=>x.status==='ORCHESTRATION_UNCERTAIN').length,nonOk=terminal-ok;const index=[];for(const r of receipts){const rf=path.join(EXEC_ROOT,'receipts',r.provider,`${r.event_id}.json`);index.push({event_id:r.event_id,provider:r.provider,receipt_sha256:await rawHash(rf),raw_response_sha256:r.raw_response_sha256,status:r.status})}index.sort((a,b)=>a.event_id.localeCompare(b.event_id)||a.provider.localeCompare(b.provider));const indexWrite=await atomicStable(path.join(EXEC_ROOT,'RECEIPT_INDEX.json'),index);const result={run_id:RUN_ID,status:terminal===400&&ok===400?'WRITE_COMPLETE_UNVERIFIED':'BLOCK',successor_runner_execution_manifest_sha256:successorManifestSha,terminal_receipts:terminal,ok_receipts:ok,non_ok_receipts:nonOk,orchestration_uncertain:uncertain,receipt_index_sha256:indexWrite.sha256,provider_calls_planned:400,authority_effects:'NONE',live_effects:0,openrouter_calls:0,frontier_calls:0};await atomicStable(path.join(EXEC_ROOT,'PHASE_W_RESULT.json'),result);console.log('NSS1_STAGE_F_PROVIDER_WRITE_COMPLETE',JSON.stringify(result));if(result.status!=='WRITE_COMPLETE_UNVERIFIED')process.exitCode=2;
}else throw new Error(`UNSUPPORTED_RUN_MODE:${RUN_MODE}`);
