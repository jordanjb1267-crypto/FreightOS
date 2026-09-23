import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const RUN_ID='NSS1-STAGE-F-GOLD-BEARING-PREFLIGHT-v0.1';
const OUT=process.env.STAGE_F_OUT??'./stage-f-evidence';
const PROVIDER_CALLS=0;
const QSET={
  relevance:{type:'noul',instruction:'Is this event relevant to maintaining active-load continuity or economic integrity?',condition:'The event materially belongs to the active responsibility scope.'},
  material_change:{type:'noul',instruction:'Does this event represent a material change requiring state/work evaluation?',condition:'The event changes operational, economic, service, identity, or authority-relevant state.'},
  need_exists:{type:'noul',instruction:'Does the authoritative state and event create an unmet Need?',condition:'A responsibility-relevant unmet condition exists that warrants work or controlled escalation.'},
  severity:{type:'score',instruction:'Score consequence severity from 0 through 4.',min:0,max:4},
  work_response_class:{type:'choice',instruction:'Choose the required work response class.',options:['NO_ACTION','STATE_UPDATE_ONLY','CREATE_NEED_ONLY','KNOWN_PROCEDURE','GENERAL_REASONING_REQUIRED','FRONTIER_REASONING_REQUIRED','HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED']},
  external_authority_required:{type:'noul',instruction:'Is human or external authority required before the consequential work can be completed?',condition:'The next consequential step requires authority not held by the semantic runtime.'}
};
const CONSEQUENCE_WEIGHTS={C0_INFORMATIONAL:1,C1_OPERATIONAL_LOW:2,C2_OPERATIONAL_MATERIAL:4,C3_ECONOMIC_OR_SERVICE_CRITICAL:8,C4_AUTHORITY_OR_SAFETY_CRITICAL:16};
const FAMILIES=[
  {family:'minor_gps_update',known:'KNOWN',material:false,need:false,severity:0,work:'STATE_UPDATE_ONLY',authority:false,consequence:'C0_INFORMATIONAL',patch:(k)=>({location_index:k})},
  {family:'appointment_material_change',known:'KNOWN',material:true,need:true,severity:2,work:'GENERAL_REASONING_REQUIRED',authority:false,consequence:'C2_OPERATIONAL_MATERIAL',patch:(k)=>({appointment_revision:k})},
  {family:'contradictory_facility_evidence',known:'KNOWN',material:true,need:true,severity:3,work:'GENERAL_REASONING_REQUIRED',authority:false,consequence:'C3_ECONOMIC_OR_SERVICE_CRITICAL',patch:()=>({facility_evidence_status:'CONFLICT'})},
  {family:'mechanical_breakdown',known:'KNOWN',material:true,need:true,severity:3,work:'KNOWN_PROCEDURE',authority:false,consequence:'C3_ECONOMIC_OR_SERVICE_CRITICAL',patch:()=>({equipment_status:'BREAKDOWN'})},
  {family:'detention_threshold_crossed',known:'KNOWN',material:true,need:true,severity:2,work:'KNOWN_PROCEDURE',authority:false,consequence:'C2_OPERATIONAL_MATERIAL',patch:(k)=>({detention_minutes:120+k})},
  {family:'pod_arrival',known:'KNOWN',material:true,need:true,severity:1,work:'KNOWN_PROCEDURE',authority:false,consequence:'C1_OPERATIONAL_LOW',patch:()=>({pod_status:'RECEIVED'})},
  {family:'wrong_load_pod',known:'KNOWN',material:true,need:true,severity:3,work:'GENERAL_REASONING_REQUIRED',authority:false,consequence:'C3_ECONOMIC_OR_SERVICE_CRITICAL',patch:()=>({evidence_identity_status:'MISMATCH'})},
  {family:'invoice_after_pod',known:'KNOWN',material:true,need:true,severity:1,work:'KNOWN_PROCEDURE',authority:false,consequence:'C1_OPERATIONAL_LOW',patch:()=>({invoice_status:'RECEIVED'})},
  {family:'factor_assignment_change',known:'KNOWN',material:true,need:true,severity:4,work:'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED',authority:true,consequence:'C4_AUTHORITY_OR_SAFETY_CRITICAL',patch:(k)=>({factor_assignment:`FACTOR_${k}`})},
  {family:'in_flight_state_change',known:'KNOWN',material:true,need:true,severity:2,work:'GENERAL_REASONING_REQUIRED',authority:false,consequence:'C2_OPERATIONAL_MATERIAL',patch:(k)=>({dispatch_revision:k})},
  {family:'temperature_excursion_warning',known:'NOVEL',material:true,need:true,severity:3,work:'GENERAL_REASONING_REQUIRED',authority:false,consequence:'C3_ECONOMIC_OR_SERVICE_CRITICAL',patch:(k)=>({temperature_f:48+k%3})},
  {family:'facility_gate_rejection',known:'NOVEL',material:true,need:true,severity:2,work:'GENERAL_REASONING_REQUIRED',authority:false,consequence:'C2_OPERATIONAL_MATERIAL',patch:()=>({gate_status:'REJECTED'})},
  {family:'driver_hours_risk',known:'NOVEL',material:true,need:true,severity:3,work:'GENERAL_REASONING_REQUIRED',authority:false,consequence:'C3_ECONOMIC_OR_SERVICE_CRITICAL',patch:(k)=>({hos_minutes_remaining:20+k})},
  {family:'cargo_seal_discrepancy',known:'NOVEL',material:true,need:true,severity:4,work:'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED',authority:true,consequence:'C4_AUTHORITY_OR_SAFETY_CRITICAL',patch:()=>({seal_status:'DISCREPANCY'})},
  {family:'receiver_identity_conflict',known:'NOVEL',material:true,need:true,severity:4,work:'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED',authority:true,consequence:'C4_AUTHORITY_OR_SAFETY_CRITICAL',patch:()=>({receiver_identity_status:'CONFLICT'})}
];
const DETERMINISTIC=['exact_duplicate','out_of_order_event','stale_state_event','crash_restart_boundary','uncertain_external_effect'];
const STALE_SEQS=new Set([2,5,8,11,14]);

function stable(v){if(Array.isArray(v))return`[${v.map(stable).join(',')}]`;if(v&&typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;return JSON.stringify(v)}
function shaText(s){return createHash('sha256').update(s).digest('hex')}
function sha(v){return shaText(stable(v))}
async function writeStable(name,v){const text=stable(v);await writeFile(path.join(OUT,name),text);return{path:name,sha256:shaText(text),bytes:Buffer.byteLength(text)}}
function initialState(t,l){return{tenant_id:`SFT${t}`,load_id:`SFT${t}-L${l}`,version:0,status:'IN_TRANSIT',location_index:0,appointment_revision:0,facility_evidence_status:'CLEAR',detention_minutes:0,pod_status:'MISSING',invoice_status:'MISSING',factor_assignment:'FACTOR_0',equipment_status:'READY',temperature_f:36,gate_status:'UNKNOWN',hos_minutes_remaining:480,seal_status:'MATCH',receiver_identity_status:'MATCH',evidence_identity_status:'MATCH',dispatch_revision:0,last_event_id:null}}
function desc(f,t,l,seq){return `Stage-F fresh synthetic event ${seq} for tenant SFT${t}, load SFT${t}-L${l}: ${f.replaceAll('_',' ')}; evidence nonce F-${t}-${l}-${seq}-20260923.`}

async function main(){await rm(OUT,{recursive:true,force:true});await mkdir(OUT,{recursive:true});
 const initial_states=[],events=[],snapshots=[],attempts=[],semantic_gold=[],need_gold=[],work_gold=[],consequence_gold=[],known_novel=[],authority_expectations=[],freshness_gold=[],reconciliation_expectations=[],provider_matrix=[];
 for(let t=1;t<=4;t++)for(let l=1;l<=4;l++){
  let state=initialState(t,l);initial_states.push(state);
  for(let i=0;i<FAMILIES.length;i++){
   const seq=i+1,f=FAMILIES[i],event_id=`SFE-T${t}-L${l}-E${String(seq).padStart(2,'0')}`,pre=structuredClone(state),patch=f.patch(t*100+l*10+seq),post={...pre,...patch,version:pre.version+1,last_event_id:event_id};
   const ev={event_id,tenant_id:pre.tenant_id,load_id:pre.load_id,sequence:seq,event_type:'SEMANTIC',family:f.family,description:desc(f.family,t,l,seq),patch,pre_state_sha256:sha(pre),post_state_sha256:sha(post)};events.push(ev);snapshots.push({event_id,pre_state:pre,post_state:post,pre_state_sha256:sha(pre),post_state_sha256:sha(post)});
   const freshness=STALE_SEQS.has(seq)?'STALE_REJECTED_AT_FROZEN_COMPLETION':'FRESH_AT_FROZEN_COMPLETION';const state_text=`Authoritative pre-state: ${stable(pre)}\nObserved event: ${ev.description}`;
   attempts.push({event:ev,state_sha256:sha(pre),state_version:pre.version,state_text,question_set_sha256:sha(QSET),planned_freshness:freshness});
   semantic_gold.push({event_id,gold:{relevance:true,material_change:f.material,need_exists:f.need,severity:f.severity,work_response_class:f.work,external_authority_required:f.authority}});
   need_gold.push({event_id,need:f.need?'NEED':'NO_NEED'});work_gold.push({event_id,required_disposition:f.work,ordering_index:QSET.work_response_class.options.indexOf(f.work)});consequence_gold.push({event_id,class:f.consequence,weight:CONSEQUENCE_WEIGHTS[f.consequence]});known_novel.push({event_id,family:f.family,status:f.known});authority_expectations.push({event_id,external_authority_required:f.authority,authority_effects:'NONE'});freshness_gold.push({event_id,status:freshness,current_state_applicability:freshness.startsWith('FRESH')?'ELIGIBLE_SUBJECT_TO_OTHER_GATES':'REJECT_FROM_CURRENT_STATE'});reconciliation_expectations.push({event_id,expected:'RECONCILE_RECEIPT_TO_BOUND_STATE_AND_REJECT_IF_STALE'});provider_matrix.push({event_id,control_provider:'LUNA',candidate_provider:f.known==='NOVEL'?'LUNA':'JEV'});state=post;
  }
  for(let d=0;d<DETERMINISTIC.length;d++){
   const seq=16+d,family=DETERMINISTIC[d],event_id=`SFE-T${t}-L${l}-E${String(seq).padStart(2,'0')}`,pre=structuredClone(state),patch={},post={...pre,version:pre.version+1,last_event_id:event_id};
   events.push({event_id,tenant_id:pre.tenant_id,load_id:pre.load_id,sequence:seq,event_type:'DETERMINISTIC',family,description:desc(family,t,l,seq),patch,pre_state_sha256:sha(pre),post_state_sha256:sha(post),duplicate_of:family==='exact_duplicate'?`SFE-T${t}-L${l}-E15`:null});snapshots.push({event_id,pre_state:pre,post_state:post,pre_state_sha256:sha(pre),post_state_sha256:sha(post)});state=post;
  }
 }
 const metric_spec={semantic:{noul:['brier','log_loss'],choice:['exact_accuracy'],score:['mae']},work:['exact_accuracy','need_precision','need_recall','false_safe_rate','false_escalation_rate','consequence_weighted_error'],economy:['luna_suppression','latency_p50_p95_p99','token_usage','measured_historical_cost','useful_correct_work_per_luna_call','useful_correct_work_per_inference_dollar'],no_universal_scalar_winner:true};
 const acceptance_gates={control_provider_executability:1,candidate_provider_executability:1,state_binding_integrity:1,cross_tenant_contamination:0,stale_current_state_applications:0,candidate_luna_suppression_min:0.5,work_disposition_accuracy_delta_min_pp:-5,false_safe_rate_delta_max_pp:2,need_recall_delta_min_pp:-5,c4_false_safe_events_max:0,authority_effects:'NONE'};
 const responsibility={id:'MAINTAIN_ACTIVE_LOAD_CONTINUITY_AND_ECONOMIC_INTEGRITY_STAGE_F',mode:'ISOLATED_SYNTHETIC_SHADOW',authority_effects:'NONE'};
 const files={responsibility,initial_states,events,state_snapshots:snapshots,question_set:QSET,semantic_attempts:attempts,semantic_gold,need_gold,work_disposition_gold:work_gold,consequence_class_gold:consequence_gold,consequence_weights:CONSEQUENCE_WEIGHTS,known_novel,authority_expectations,freshness_gold,reconciliation_expectations,provider_matrix,metric_spec,acceptance_gates};
 const entries=[];for(const [name,v] of Object.entries(files))entries.push(await writeStable(`${name}.json`,v));entries.sort((a,b)=>a.path.localeCompare(b.path));
 const counts={tenants:4,loads:16,total_events:events.length,semantic_events:attempts.length,deterministic_events:events.filter(e=>e.event_type==='DETERMINISTIC').length,known_semantic:known_novel.filter(x=>x.status==='KNOWN').length,novel_semantic:known_novel.filter(x=>x.status==='NOVEL').length,control_luna_calls:provider_matrix.length,candidate_luna_calls:provider_matrix.filter(x=>x.candidate_provider==='LUNA').length,candidate_jev_calls:provider_matrix.filter(x=>x.candidate_provider==='JEV').length,fresh_semantic:freshness_gold.filter(x=>x.status.startsWith('FRESH')).length,stale_semantic:freshness_gold.filter(x=>x.status.startsWith('STALE')).length,provider_calls:PROVIDER_CALLS};
 const result={run_id:RUN_ID,status:'WRITE_COMPLETE_UNVERIFIED',counts,luna_suppression:1-counts.candidate_luna_calls/counts.control_luna_calls,question_set_sha256:sha(QSET),provider_matrix_sha256:sha(provider_matrix),semantic_gold_sha256:sha(semantic_gold),need_gold_sha256:sha(need_gold),work_disposition_gold_sha256:sha(work_gold),consequence_gold_sha256:sha(consequence_gold),known_novel_sha256:sha(known_novel),events_sha256:sha(events),state_snapshots_sha256:sha(snapshots),provider_calls:0,authority_effects:'NONE'};entries.push(await writeStable('result.json',result));entries.sort((a,b)=>a.path.localeCompare(b.path));const artifact_index={run_id:RUN_ID,entries};const ai=await writeStable('ARTIFACT_INDEX.json',artifact_index);const write_state={run_id:RUN_ID,status:'WRITE_COMPLETE_UNVERIFIED',artifact_index_sha256:ai.sha256,counts,provider_calls:0,authority_effects:'NONE'};const ws=await writeStable('WRITE_STATE.json',write_state);console.log('NSS1_STAGE_F_PREFLIGHT_WRITE_COMPLETE',JSON.stringify({...write_state,write_state_sha256:ws.sha256,result}));
}
main().catch(e=>{console.error('NSS1_STAGE_F_PREFLIGHT_FATAL',e);process.exitCode=1});
