import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.env.EVIDENCE_DIR ?? '/data/nss1-stage-c-v0.1';
const RANK={NO_ACTION:0,STATE_UPDATE_ONLY:1,NEED_DETECTED:2,KNOWN_PROCEDURE:3,GENERAL_REASONING_REQUIRED:4,FRONTIER_ESCALATION_REQUIRED:5,HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED:6};
function stable(v){if(Array.isArray(v))return`[${v.map(stable).join(',')}]`;if(v&&typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;return JSON.stringify(v)}
function shaText(s){return createHash('sha256').update(s).digest('hex')}
function sha(v){return shaText(stable(v))}
async function exists(p){try{await readFile(p);return true}catch{return false}}
async function readJson(p){return JSON.parse(await readFile(p,'utf8'))}
async function walk(dir,base=dir,rows=[]){for(const ent of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(dir,ent.name);if(ent.isDirectory())await walk(p,base,rows);else{const data=await readFile(p);rows.push({path:path.relative(base,p),sha256:shaText(data),bytes:data.length})}}return rows}
function b(j){return Number(j?.probability??0)>=0.5}
function compileBase(event,j){if(j.external_authority_required&&b(j.external_authority_required))return'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED';const n=j.need_exists?b(j.need_exists):null,w=j.work_response_class?.selected??null,r=j.relevant_to_responsibility?b(j.relevant_to_responsibility):null;if(n!==null&&w!==null&&((n&&w==='NO_WORK')||(!n&&w!=='NO_WORK')))return event.family==='factor_assignment_change'?'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED':'GENERAL_REASONING_REQUIRED';if(w==='NO_WORK')return r===false?'NO_ACTION':'STATE_UPDATE_ONLY';return{CREATE_NEED_ONLY:'NEED_DETECTED',KNOWN_PROCEDURE:'KNOWN_PROCEDURE',GENERAL_REASONING:'GENERAL_REASONING_REQUIRED',FRONTIER_REASONING:'FRONTIER_ESCALATION_REQUIRED',HUMAN_OR_EXTERNAL_AUTHORITY:'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED'}[w]??'GENERAL_REASONING_REQUIRED'}
function applyFloor(event,d){if(event.safety_floor_required&&RANK[d]<RANK.GENERAL_REASONING_REQUIRED)return'GENERAL_REASONING_REQUIRED';return d}
function metrics(rows){const u=rows.filter(r=>r.disposition!=='PROVIDER_UNAVAILABLE'),correct=u.filter(r=>r.correct).length,fs=u.filter(r=>r.false_safe).length,cost=u.reduce((s,r)=>s+(r.cost_usd??0),0);return{events:rows.length,usable:u.length,correct,accuracy:u.length?correct/u.length:null,false_safe:fs,false_safe_rate:u.length?fs/u.length:null,provider_unavailable:rows.length-u.length,cost_usd:cost}}

const inventory = await walk(ROOT);
const required=['PRE_RECEIPT_FREEZE.json','CONTROL_RESULT.json','CANDIDATE_RESULT.json','RESULT.json'];
const present=Object.fromEntries(await Promise.all(required.map(async n=>[n,await exists(path.join(ROOT,n))])));
const pre=present['PRE_RECEIPT_FREEZE.json']?await readJson(path.join(ROOT,'PRE_RECEIPT_FREEZE.json')):null;
const controlPersisted=present['CONTROL_RESULT.json']?await readJson(path.join(ROOT,'CONTROL_RESULT.json')):null;
const candidatePersisted=present['CANDIDATE_RESULT.json']?await readJson(path.join(ROOT,'CANDIDATE_RESULT.json')):null;
const resultPersisted=present['RESULT.json']?await readJson(path.join(ROOT,'RESULT.json')):null;
const plan=pre?.execution_plan??null;
const receiptFiles=inventory.filter(x=>x.path.startsWith('receipts/')&&x.path.endsWith('.json'));
const attemptFiles=inventory.filter(x=>x.path.startsWith('attempts/')&&x.path.endsWith('.json'));
const rawFiles=inventory.filter(x=>x.path.startsWith('raw/')&&x.path.endsWith('.txt'));
const receipts=[];
for(const f of receiptFiles){try{const r=await readJson(path.join(ROOT,f.path));receipts.push({...r,_path:f.path,_file_sha256:f.sha256})}catch{receipts.push({_path:f.path,_parse_error:true})}}
const attempts=[];
for(const f of attemptFiles){try{attempts.push({...await readJson(path.join(ROOT,f.path)),_path:f.path})}catch{attempts.push({_path:f.path,_parse_error:true})}}
const byKey=new Map(receipts.filter(r=>!r._parse_error).map(r=>[`${r.provider}:${r.event_id}`,r]));
let controlRows=[],candidateRows=[];
if(plan?.events){for(const e of plan.events){const expected=e.work_outcome_gold?.expected_disposition??e.expected??null;const lr=byKey.get(`luna:${e.event_id}`);if(lr?.status==='OK'){const d=compileBase(e,lr.normalized_judgments);controlRows.push({event_id:e.event_id,family:e.family,provider:'luna',disposition:d,expected,correct:d===expected,false_safe:RANK[d]<RANK[expected],cost_usd:lr.cost_usd??0})}else controlRows.push({event_id:e.event_id,family:e.family,provider:'luna',disposition:'PROVIDER_UNAVAILABLE',expected,correct:false,false_safe:false,cost_usd:0});const cp=e.candidate_provider??'luna',cr=cp==='luna'?lr:byKey.get(`jev:${e.event_id}`);if(cr?.status==='OK'){const base=compileBase(e,cr.normalized_judgments),d=applyFloor(e,base);candidateRows.push({event_id:e.event_id,family:e.family,provider:cp,base_disposition:base,safety_floor_applied:d!==base,disposition:d,expected,correct:d===expected,false_safe:RANK[d]<RANK[expected],cost_usd:cr.cost_usd??0})}else candidateRows.push({event_id:e.event_id,family:e.family,provider:cp,disposition:'PROVIDER_UNAVAILABLE',expected,correct:false,false_safe:false,cost_usd:0})}}
const controlMetrics=metrics(controlRows),candidateMetrics=metrics(candidateRows);
const execManifest=pre?.execution_manifest_sha256??pre?.execution_plan?.execution_manifest_sha256??sha(plan??{});
const providerStatus={};for(const p of ['luna','jev']){const rs=receipts.filter(r=>r.provider===p);providerStatus[p]={receipt_files:rs.length,ok:rs.filter(r=>r.status==='OK').length,non_ok:rs.filter(r=>r.status!=='OK').length,effective_models:[...new Set(rs.map(r=>r.effective_model).filter(Boolean))],requested_models:[...new Set(rs.map(r=>r.requested_model).filter(Boolean))]}}
const recomputed={control:controlMetrics,candidate:{...candidateMetrics,luna_suppression:plan?.events?.length?1-plan.events.filter(e=>(e.candidate_provider??'luna')==='luna').length/plan.events.length:null,safety_floor_applications:candidateRows.filter(r=>r.safety_floor_applied).length},deltas_pp:{accuracy:controlMetrics.accuracy!=null&&candidateMetrics.accuracy!=null?(candidateMetrics.accuracy-controlMetrics.accuracy)*100:null,false_safe:controlMetrics.false_safe_rate!=null&&candidateMetrics.false_safe_rate!=null?(candidateMetrics.false_safe_rate-controlMetrics.false_safe_rate)*100:null}};
const comparisons={control_matches:persistedMetricMatch(controlPersisted?.metrics,recomputed.control),candidate_matches:persistedMetricMatch(candidatePersisted?.metrics,recomputed.candidate),result_status:resultPersisted?.status??null,result_architecture_pass:resultPersisted?.architecture_pass??null,result_manifest_matches:resultPersisted?.execution_manifest_sha256?resultPersisted.execution_manifest_sha256===execManifest:null};
function persistedMetricMatch(p,r){if(!p)return false;for(const k of ['events','usable','correct','provider_unavailable'])if(p[k]!==r[k])return false;for(const k of ['accuracy','false_safe_rate','cost_usd']){if(p[k]==null&&r[k]==null)continue;if(Math.abs(Number(p[k])-Number(r[k]))>1e-12)return false}return true}
const complete = !!plan && receipts.every(r=>!r._parse_error) && attempts.every(a=>!a._parse_error) && controlRows.length===plan.events.length && candidateRows.length===plan.events.length && providerStatus.luna.receipt_files===plan.events.length && providerStatus.jev.receipt_files===plan.events.filter(e=>(e.candidate_provider??'luna')==='jev').length;
const classification=complete&&comparisons.control_matches&&comparisons.candidate_matches?'COMPLETE_RECONSTRUCTABLE':(receipts.length||present['RESULT.json']?'PARTIAL_RECONSTRUCTABLE':'INCONCLUSIVE');
const report={forensic_recovery:classification,read_only:true,provider_calls:0,root:ROOT,execution_manifest_sha256:execManifest,inventory:{file_count:inventory.length,root_sha256:sha(inventory),receipt_files:receiptFiles.length,attempt_files:attemptFiles.length,raw_files:rawFiles.length,present},provider_status:providerStatus,recomputed,comparisons,terminal_complete_marker_present:await exists(path.join(ROOT,'FREEZE_POINTER.json')),stage_c_complete_log_not_reconstructed_from_files:true,authority_effects:'NONE',openrouter_calls:0,frontier_calls:0};
console.log('NSS1_STAGE_C_FORENSIC_RECOVERY',JSON.stringify(report));
