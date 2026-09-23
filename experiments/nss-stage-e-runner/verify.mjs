import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

globalThis.fetch=async()=>{throw new Error('STAGE_E_PHASE_V_PROVIDER_CALL_PROHIBITED')};

const ZERO_ROOT=process.env.STAGE_E_ZERO_ROOT??'/data/nss1-stage-e-zero-call-v0.1';
const EXEC_ROOT=process.env.EVIDENCE_DIR??'/data/nss1-stage-e-provider-v0.1';
const FROZEN_RUNNER_SHA='9b477dbb495d6aa3c890a4177efcbe35b18aa0e87691b1801aac135bebdea38b';
const ZERO_MANIFEST='517f2fada5fe54dc22f21fff3b26d55a48e874bf5b08b46225287261e533062a';
const ZERO_POINTER='c7c7863c7d858a85ac7871b0f367ec7d3d2a0c665d84dcf7dc5119113b375d56';
const MATRIX_SHA='76eb87303b6307c5fd7d67c3719b78989d05ee34dbe5bbf7356071f1f1a20b28';
const QSET_SHA='c007ae5b13c152a93432adb6491fd59d156bfc54a2c14bb537ff77af13edabb2';
const OPENAI_MODEL='gpt-5.6-luna',JEV_REQUESTED='jev-latest',JEV_EFFECTIVE='jev-1.13.0';

function stable(v){if(Array.isArray(v))return`[${v.map(stable).join(',')}]`;if(v&&typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;return JSON.stringify(v)}
function shaText(s){return createHash('sha256').update(s).digest('hex')}
function sha(v){return shaText(stable(v))}
async function readJson(f){return JSON.parse(await readFile(f,'utf8'))}
async function ensure(p){await mkdir(p,{recursive:true})}
async function writeStable(file,v){const t=stable(v);await ensure(path.dirname(file));await writeFile(file,t);return{sha256:shaText(t),bytes:Buffer.byteLength(t)}}
async function exists(f){try{await readFile(f);return true}catch{return false}}

const issues=[];
for(const req of ['PRE_RECEIPT_FREEZE.json','RECEIPT_INDEX.json','RESULT.json','WRITE_STATE.json'])if(!(await exists(path.join(EXEC_ROOT,req))))issues.push('MISSING:'+req);
if(issues.length){console.log('NSS1_STAGE_E_PROVIDER_VERIFY_COMPLETE',JSON.stringify({status:'BLOCK_EVIDENCE_INCOMPLETE',issues,provider_calls:0}));process.exitCode=2}else{
  const [pre,index,result,writeState,zeroAttempts,matrix,qset,zeroPointer]=await Promise.all([
    readJson(path.join(EXEC_ROOT,'PRE_RECEIPT_FREEZE.json')),
    readJson(path.join(EXEC_ROOT,'RECEIPT_INDEX.json')),
    readJson(path.join(EXEC_ROOT,'RESULT.json')),
    readJson(path.join(EXEC_ROOT,'WRITE_STATE.json')),
    readJson(path.join(ZERO_ROOT,'semantic_attempts.json')),
    readJson(path.join(ZERO_ROOT,'provider_matrix.json')),
    readJson(path.join(ZERO_ROOT,'question_set.json')),
    readJson(path.join(ZERO_ROOT,'freeze_pointer.json'))
  ]);
  if(pre?.preflight?.runner_execution_manifest_sha256!==FROZEN_RUNNER_SHA)issues.push('RUNNER_MANIFEST');
  if(pre?.preflight?.provider_receipts!==0)issues.push('PRE_RECEIPT_NOT_ZERO');
  if(pre?.preflight?.zero_call_execution_manifest_sha256!==ZERO_MANIFEST)issues.push('ZERO_MANIFEST');
  if(pre?.preflight?.zero_call_freeze_pointer_sha256!==ZERO_POINTER||sha(zeroPointer)!==ZERO_POINTER)issues.push('ZERO_POINTER');
  if(sha(matrix)!==MATRIX_SHA)issues.push('MATRIX_SHA');if(sha(qset)!==QSET_SHA)issues.push('QSET_SHA');
  if(index.length!==400)issues.push('RECEIPT_INDEX_COUNT:'+index.length);
  if(writeState.provider_receipts!==400)issues.push('WRITE_RECEIPT_COUNT:'+writeState.provider_receipts);
  if(writeState.runner_execution_manifest_sha256!==FROZEN_RUNNER_SHA)issues.push('WRITE_MANIFEST');
  if(writeState.receipt_index_sha256!==sha(index))issues.push('RECEIPT_INDEX_SHA');
  if(writeState.result_sha256!==sha(result))issues.push('RESULT_SHA');
  const attemptById=new Map(zeroAttempts.map(a=>[a.event.event_id,a]));
  const matrixById=new Map(matrix.map(m=>[m.event_id,m]));
  let receiptHashMismatches=0,rawHashMismatches=0,stateBindingMismatches=0,modelIdentityMismatches=0,qsetMismatches=0,parseFailures=0,ok=0,luna=0,jev=0,stale=0,fresh=0,unexpected=0;
  const seen=new Set();
  for(const x of index){
    const key=`${x.provider}:${x.event_id}`;if(seen.has(key)){issues.push('DUP_RECEIPT:'+key);continue}seen.add(key);
    const f=path.join(EXEC_ROOT,x.path);let text,r;try{text=await readFile(f,'utf8');r=JSON.parse(text)}catch{parseFailures++;continue}
    if(shaText(text)!==x.sha256)receiptHashMismatches++;
    const a=attemptById.get(r.event_id),m=matrixById.get(r.event_id);if(!a||!m){unexpected++;continue}
    if(r.bound_state_sha256!==a.bound_state_sha256)stateBindingMismatches++;
    if(r.question_set_sha256!==QSET_SHA)qsetMismatches++;
    if(r.provider==='luna'){luna++;if(r.requested_model!==OPENAI_MODEL||(r.status==='OK'&&r.effective_model!==OPENAI_MODEL))modelIdentityMismatches++}
    else if(r.provider==='jev'){jev++;if(m.provider!=='JEV')unexpected++;if(r.requested_model!==JEV_REQUESTED||(r.status==='OK'&&r.effective_model!==JEV_EFFECTIVE))modelIdentityMismatches++}
    else unexpected++;
    if(r.status==='OK')ok++;
    if(r.frozen_freshness==='STALE_REJECTED_AT_FROZEN_COMPLETION')stale++;if(r.frozen_freshness==='FRESH_AT_FROZEN_COMPLETION')fresh++;
    if(r.raw_response_sha256){const rp=path.join(EXEC_ROOT,'raw',r.provider,r.event_id+'.txt');try{const raw=await readFile(rp,'utf8');if(shaText(raw)!==r.raw_response_sha256)rawHashMismatches++}catch{rawHashMismatches++}}
    else if(r.status==='OK')rawHashMismatches++;
  }
  if(luna!==240)issues.push('LUNA_COUNT:'+luna);if(jev!==160)issues.push('JEV_COUNT:'+jev);if(ok!==400)issues.push('OK_RECEIPTS:'+ok);if(parseFailures)issues.push('PARSE_FAILURES:'+parseFailures);if(receiptHashMismatches)issues.push('RECEIPT_HASH:'+receiptHashMismatches);if(rawHashMismatches)issues.push('RAW_HASH:'+rawHashMismatches);if(stateBindingMismatches)issues.push('STATE_BINDING:'+stateBindingMismatches);if(modelIdentityMismatches)issues.push('MODEL_IDENTITY:'+modelIdentityMismatches);if(qsetMismatches)issues.push('QSET:'+qsetMismatches);if(unexpected)issues.push('UNEXPECTED:'+unexpected);
  if(result.runner_execution_manifest_sha256!==FROZEN_RUNNER_SHA)issues.push('RESULT_MANIFEST');if(result.provider_receipts!==400||result.terminal_receipts!==400)issues.push('RESULT_COUNTS');if(result.stale_receipt_current_state_applications!==0)issues.push('STALE_APPLICATION');if(result.authority_effects!=='NONE'||result.openrouter_calls!==0||result.frontier_calls!==0||result.live_effects!==0)issues.push('AUTHORITY_OR_EFFECT');
  const status=issues.length?'BLOCK':'PASS';
  const verification={run_id:'NSS1-STAGE-E-PROVIDER-SHADOW-v0.1',status,issues,provider_calls:0,runner_execution_manifest_sha256:FROZEN_RUNNER_SHA,receipt_count:index.length,ok_receipts:ok,luna_receipts:luna,jev_receipts:jev,deterministically_fresh_receipts:fresh,deterministically_stale_receipts:stale,receipt_hash_mismatches:receiptHashMismatches,raw_hash_mismatches:rawHashMismatches,state_binding_mismatches:stateBindingMismatches,model_identity_mismatches:modelIdentityMismatches,qset_mismatches:qsetMismatches,unexpected_receipts:unexpected,parse_failures:parseFailures,stale_receipt_current_state_applications:0,provider_outputs:'NON_AUTHORITATIVE_SHADOW_JUDGMENT',authority_effects:'NONE',openrouter_calls:0,frontier_calls:0,live_effects:0};
  const vm=await writeStable(path.join(EXEC_ROOT,'VERIFICATION_RESULT.json'),verification);
  const pointer={run_id:verification.run_id,status:status==='PASS'?'STAGE_E_PROVIDER_SHADOW_PASS':'STAGE_E_PROVIDER_SHADOW_BLOCK',runner_execution_manifest_sha256:FROZEN_RUNNER_SHA,verification_result_sha256:vm.sha256,receipt_index_sha256:sha(index),result_sha256:sha(result),provider_calls_in_verification:0,authority_effects:'NONE'};
  const pm=await writeStable(path.join(EXEC_ROOT,'FREEZE_POINTER.json'),pointer);
  console.log('NSS1_STAGE_E_PROVIDER_VERIFY_COMPLETE',JSON.stringify({...verification,verification_result_sha256:vm.sha256,freeze_pointer_sha256:pm.sha256,next_transition:status==='PASS'?'STAGE_E_PROVIDER_SHADOW_RESULT_FREEZE':'STAGE_E_PROVIDER_SHADOW_BLOCK_REVIEW'}));
  if(status!=='PASS')process.exitCode=2;
}
