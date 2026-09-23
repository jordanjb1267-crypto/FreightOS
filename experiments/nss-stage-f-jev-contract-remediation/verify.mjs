import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

globalThis.fetch = async () => { throw new Error('JEV_CONTRACT_REMEDIATION_VERIFY_NETWORK_PROHIBITED'); };

const ROOT = process.env.STAGE_F_EVIDENCE_ROOT;
const PREFLIGHT = process.env.REMEDIATION_PREFLIGHT_ROOT;
if (!ROOT || !PREFLIGHT) throw new Error('ROOT_AND_PREFLIGHT_REQUIRED');

const EXPECTED = Object.freeze({
  question_set: '0e8c01c8d98e2fbbeb9f7b034ef638dcf11df0f9f2189834322830bb0b758bcb',
  provider_matrix: '8135ad29cf2c13d0c433de6a4825d0395889d0c25ef6556e873048728bba9ff8',
  semantic_attempts: 'bd878169d903942d7e0d1cc45f6ac7941303896399486ccd7d02edfb691145f9',
  state_snapshots: '89ec348ea6ef1087fe905f230c6ffc069f76e1599221edde20800cc940dccff7'
});
const severityLevels = [
  '0 — informational; no material operational consequence',
  '1 — low operational consequence',
  '2 — material operational consequence',
  '3 — economic or service critical consequence',
  '4 — authority or safety critical consequence'
];
function stable(v){if(Array.isArray(v))return`[${v.map(stable).join(',')}]`;if(v&&typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;return JSON.stringify(v)}
const shaText=s=>createHash('sha256').update(s).digest('hex');
const shaBuf=b=>createHash('sha256').update(b).digest('hex');
const shaStable=v=>shaText(stable(v));
const json=async(base,name)=>JSON.parse(await readFile(path.join(base,name),'utf8'));

const issues=[];
for(const [name,expected] of [['question_set.json',EXPECTED.question_set],['provider_matrix.json',EXPECTED.provider_matrix],['semantic_attempts.json',EXPECTED.semantic_attempts],['state_snapshots.json',EXPECTED.state_snapshots]]){
  const got=shaBuf(await readFile(path.join(ROOT,name)));if(got!==expected)issues.push(`ROOT_HASH:${name}:${got}`);
}
const [qset,matrix,attempts,snapshots,responsibility,observedManifest,observedResult]=await Promise.all([
  json(ROOT,'question_set.json'),json(ROOT,'provider_matrix.json'),json(ROOT,'semantic_attempts.json'),json(ROOT,'state_snapshots.json'),json(ROOT,'responsibility.json'),json(PREFLIGHT,'REQUEST_MANIFEST.json'),json(PREFLIGHT,'PREFLIGHT_RESULT.json')
]);

function independentQuestions(questionSet){
  const out={};
  for(const [id,q] of Object.entries(questionSet)){
    if(q.type==='noul') out[id]=q.condition==null?{type:'noul',instructions:q.instruction}:{type:'noul',instructions:q.instruction,criteria:{true:q.condition}};
    else if(q.type==='choice') out[id]={type:'choice',instructions:q.instruction,criteria:Object.fromEntries(q.options.map(x=>[x,x]))};
    else if(q.type==='score') out[id]={type:'score',instructions:q.instruction,criteria:[...severityLevels]};
    else throw new Error(`UNSUPPORTED_QUESTION_TYPE:${id}:${q.type}`);
  }
  return out;
}
const questions=independentQuestions(qset);
for(const [id,q] of Object.entries(questions)){
  if(q.type==='noul'&&q.criteria!=null&&(typeof q.criteria!=='object'||Array.isArray(q.criteria)))issues.push(`NOUL_SCHEMA:${id}`);
  if(q.type==='choice'&&(!q.criteria||typeof q.criteria!=='object'||Array.isArray(q.criteria)))issues.push(`CHOICE_SCHEMA:${id}`);
  if(q.type==='score'&&(!Array.isArray(q.criteria)||q.criteria.length<1))issues.push(`SCORE_SCHEMA:${id}`);
}
const byAttempt=new Map(attempts.map(x=>[x.event.event_id,x]));
const bySnap=new Map(snapshots.map(x=>[x.event_id,x]));
const rows=matrix.filter(x=>x.candidate_provider==='JEV').sort((a,b)=>a.event_id.localeCompare(b.event_id));
const recomputed=[];
for(const row of rows){
  const a=byAttempt.get(row.event_id),s=bySnap.get(row.event_id);if(!a||!s){issues.push(`JOIN:${row.event_id}`);continue}
  const state={authoritative_pre_state:s.pre_state,observed_event:a.event,frozen_binding:{event_id:row.event_id,state_sha256:a.state_sha256,state_version:a.state_version,freshness:a.planned_freshness},responsibility};
  const body={state,model:'jev-latest',questions};
  recomputed.push({event_id:row.event_id,body_sha256:shaStable(body),state_sha256:a.state_sha256,question_set_sha256:EXPECTED.question_set,model:'jev-latest',question_schema_sha256:shaStable(questions)});
}
if(rows.length!==160)issues.push(`JEV_ROWS:${rows.length}`);
if(stable(recomputed)!==stable(observedManifest))issues.push('REQUEST_MANIFEST_RECOMPUTE_MISMATCH');
if(observedResult.request_manifest_sha256!==shaStable(recomputed))issues.push('REQUEST_MANIFEST_SHA_MISMATCH');
if(observedResult.question_schema_sha256!==shaStable(questions))issues.push('QUESTION_SCHEMA_SHA_MISMATCH');
if(observedResult.provider_calls!==0||observedResult.provider_attempts!==0||observedResult.provider_receipts!==0||observedResult.credentials_read!==false)issues.push('ZERO_CALL_BOUNDARY_VIOLATION');
if(observedResult.status!=='PASS')issues.push(`PHASE_W_STATUS:${observedResult.status}`);

const verification={
  status:issues.length?'BLOCK':'PASS',
  candidate:'NSS1-STAGE-F-JEV-CONTRACT-REMEDIATION-v0.1',
  recomputed_requests:recomputed.length,
  request_manifest_sha256:shaStable(recomputed),
  question_schema_sha256:shaStable(questions),
  phase_w_result_sha256:shaBuf(await readFile(path.join(PREFLIGHT,'PREFLIGHT_RESULT.json'))),
  provider_calls:0,network_calls:0,credentials_read:false,authority_effects:'NONE',issues
};
const text=JSON.stringify(verification,null,2)+'\n';
await writeFile(path.join(PREFLIGHT,'VERIFICATION_RESULT.json'),text,{flag:'wx'});
await writeFile(path.join(PREFLIGHT,'FREEZE_POINTER.json'),JSON.stringify({candidate:verification.candidate,verification_result_sha256:shaText(text),request_manifest_sha256:verification.request_manifest_sha256,question_schema_sha256:verification.question_schema_sha256,provider_calls:0,authority_effects:'NONE'},null,2)+'\n',{flag:'wx'});
console.log('NSS1_STAGE_F_JEV_CONTRACT_REMEDIATION_VERIFY',JSON.stringify({...verification,verification_result_sha256:shaText(text)}));
if(issues.length)process.exitCode=2;
