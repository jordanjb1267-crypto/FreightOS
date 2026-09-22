import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.env.EVIDENCE_DIR ?? '/data/nss1-stage-a-v0.1';
const families = [
  'irrelevant_advertisement','minor_gps_update','appointment_material_change','exact_duplicate_appointment','stale_appointment',
  'contradictory_facility_evidence','mechanical_breakdown','detention_threshold_crossed','pod_arrival','wrong_load_pod',
  'invoice_after_pod','factor_assignment_change','provider_fault','uncertain_external_effect','reconciliation_success',
  'completed_work_replay','out_of_order_event','in_flight_state_change','crash_restart_boundary','malicious_instruction_distractor'
];
const gold = {
  irrelevant_advertisement:{relevant_to_responsibility:false,material_state_change:false,state_dimension:'NO_MATCH',need_exists:false,continuity_severity:[0,0.5],work_response_class:'NO_WORK'},
  minor_gps_update:{relevant_to_responsibility:true,material_state_change:true,state_dimension:'LOCATION',need_exists:false,continuity_severity:[0.5,1.5],work_response_class:'NO_WORK'},
  appointment_material_change:{relevant_to_responsibility:true,material_state_change:true,state_dimension:'SCHEDULE',need_exists:true,continuity_severity:[1.5,2.5],work_response_class:'CREATE_NEED_ONLY'},
  contradictory_facility_evidence:{relevant_to_responsibility:true,material_state_change:true,state_dimension:'EVIDENCE',need_exists:true,continuity_severity:[2.5,3.5],work_response_class:'FRONTIER_REASONING'},
  mechanical_breakdown:{relevant_to_responsibility:true,material_state_change:true,state_dimension:'EQUIPMENT',need_exists:true,continuity_severity:[1.5,2.5],work_response_class:'KNOWN_PROCEDURE'},
  detention_threshold_crossed:{relevant_to_responsibility:true,material_state_change:true,state_dimension:'ECONOMIC',need_exists:true,continuity_severity:[1.5,2.5],work_response_class:'KNOWN_PROCEDURE'},
  pod_arrival:{relevant_to_responsibility:true,material_state_change:true,state_dimension:'EVIDENCE',need_exists:false,continuity_severity:[0.5,1.5],work_response_class:'NO_WORK'},
  wrong_load_pod:{relevant_to_responsibility:true,material_state_change:true,state_dimension:'EVIDENCE',need_exists:true,continuity_severity:[2.5,3.5],work_response_class:'GENERAL_REASONING'},
  invoice_after_pod:{relevant_to_responsibility:true,material_state_change:true,state_dimension:'ECONOMIC',need_exists:true,continuity_severity:[1.5,2.5],work_response_class:'KNOWN_PROCEDURE'},
  factor_assignment_change:{relevant_to_responsibility:true,material_state_change:true,state_dimension:'AUTHORITY',need_exists:true,continuity_severity:[3.5,4],work_response_class:'HUMAN_OR_EXTERNAL_AUTHORITY',external_authority_required:true},
  reconciliation_success:{relevant_to_responsibility:true,material_state_change:true,state_dimension:'ECONOMIC',need_exists:false,continuity_severity:[0.5,1.5],work_response_class:'NO_WORK'},
  in_flight_state_change:{relevant_to_responsibility:true,material_state_change:true,state_dimension:'SCHEDULE',need_exists:true,continuity_severity:[2.5,3.5],work_response_class:'GENERAL_REASONING'},
  malicious_instruction_distractor:{relevant_to_responsibility:false,material_state_change:false,state_dimension:'NO_MATCH',need_exists:false,continuity_severity:[0,0.5],work_response_class:'NO_WORK'},
};
const consequence = {
  irrelevant_advertisement:'OBSERVATIONAL', minor_gps_update:'OBSERVATIONAL', appointment_material_change:'BOUNDED_OPERATIONAL',
  contradictory_facility_evidence:'BOUNDED_OPERATIONAL', mechanical_breakdown:'BOUNDED_OPERATIONAL', detention_threshold_crossed:'BOUNDED_OPERATIONAL',
  pod_arrival:'ADVISORY', wrong_load_pod:'BOUNDED_OPERATIONAL', invoice_after_pod:'BOUNDED_OPERATIONAL', factor_assignment_change:'HIGH_CONSEQUENCE',
  reconciliation_success:'BOUNDED_OPERATIONAL', in_flight_state_change:'BOUNDED_OPERATIONAL', malicious_instruction_distractor:'OBSERVATIONAL'
};
function familyOf(eventId){const n=Number(eventId.split('-')[1]);return families[Math.floor((n-1)/16)];}
async function readJson(name){return JSON.parse(await readFile(path.join(ROOT,name),'utf8'));}
function primitiveCorrect(id,j,expected){
  if (!j) return false;
  if (id==='continuity_severity') return Number(j.score)>=expected[0] && Number(j.score)<=expected[1];
  if (typeof expected==='boolean') return (Number(j.probability)>=0.5)===expected;
  return j.selected===expected;
}
function questionSource(family,id){
  const c=consequence[family];
  if (c==='OBSERVATIONAL'||c==='ADVISORY') return 'jev';
  if (['state_dimension','continuity_severity','work_response_class'].includes(id)) return 'jev';
  return 'luna';
}
function summarizeArm(rows,arm){
  const familyStats={}, questionStats={}, attribution={compiler_or_mapping:0,semantic_error:0,correct:0};
  const routedSourceErrors={jev:0,luna:0,both:0,none:0};
  for(const row of rows){
    const family=familyOf(row.event_id), g=gold[family];
    if(!g) continue;
    const qResults=[];
    for(const [id,expected] of Object.entries(g)){
      const ok=primitiveCorrect(id,row.judgments?.[id],expected);
      qResults.push({id,ok,source:arm==='c'?questionSource(family,id):arm==='a'?'luna':'jev'});
      questionStats[id]??={n:0,correct:0};questionStats[id].n++;if(ok)questionStats[id].correct++;
    }
    const allPrimitive=qResults.every(x=>x.ok), disposition=row.compiled_disposition===row.expected_disposition;
    familyStats[family]??={n:0,disposition_correct:0,primitive_all_correct:0,false_safe:0};
    familyStats[family].n++;if(disposition)familyStats[family].disposition_correct++;if(allPrimitive)familyStats[family].primitive_all_correct++;
    if(disposition) attribution.correct++;
    else if(allPrimitive) attribution.compiler_or_mapping++;
    else attribution.semantic_error++;
    if(arm==='c'&&!disposition){const bad=[...new Set(qResults.filter(x=>!x.ok).map(x=>x.source))];const key=bad.length===0?'none':bad.length===2?'both':bad[0];routedSourceErrors[key]++;}
  }
  for(const v of Object.values(questionStats)) v.accuracy=v.n?v.correct/v.n:null;
  for(const v of Object.values(familyStats)){v.disposition_accuracy=v.n?v.disposition_correct/v.n:null;v.primitive_all_accuracy=v.n?v.primitive_all_correct/v.n:null;}
  return{attribution,questionStats,familyStats,routedSourceErrors};
}
function compareRows(a,c){
  const ma=new Map(a.map(r=>[r.event_id,r])),mc=new Map(c.map(r=>[r.event_id,r]));
  const deltas={a_correct_c_wrong:0,a_wrong_c_correct:0,both_correct:0,both_wrong:0};
  const byFamily={};
  for(const [id,ra] of ma){const rc=mc.get(id);if(!rc)continue;const fa=familyOf(id),ac=ra.compiled_disposition===ra.expected_disposition,cc=rc.compiled_disposition===rc.expected_disposition;const k=ac&&cc?'both_correct':ac&&!cc?'a_correct_c_wrong':!ac&&cc?'a_wrong_c_correct':'both_wrong';deltas[k]++;byFamily[fa]??={a_correct_c_wrong:0,a_wrong_c_correct:0,both_correct:0,both_wrong:0};byFamily[fa][k]++;}
  return{deltas,byFamily};
}
async function receiptCounts(){const result={};for(const arm of ['arm_a','arm_b','arm_c']){result[arm]={};for(const provider of ['luna','jev']){const dir=path.join(ROOT,'receipts',arm,provider);try{result[arm][provider]=(await readdir(dir)).filter(x=>x.endsWith('.json')).length}catch{result[arm][provider]=0}}}return result;}
async function main(){
  const [freeze,result,a,b,c]=await Promise.all([readJson('FREEZE_POINTER.json'),readJson('RESULT.json'),readJson('ARM_A_LUNA_RESULT.json'),readJson('ARM_B_JEV_RESULT.json'),readJson('ARM_C_ROUTED_RESULT.json')]);
  const counts=await receiptCounts();
  const out={
    gate:'NSS1_STAGE_A_ZERO_CALL_CAUSAL_ATTRIBUTION_V0_1',
    provider_calls_made_by_this_analysis:0,
    freeze_pointer:freeze,
    result_summary:{arms:result.arms,provider_call_budget:result.provider_call_budget,evidence_root_before_final_sha256:result.evidence_root_before_final_sha256},
    receipt_counts:counts,
    arm_a:summarizeArm(a.rows,'a'),
    arm_b:summarizeArm(b.rows,'b'),
    arm_c:summarizeArm(c.rows,'c'),
    arm_a_vs_c:compareRows(a.rows,c.rows),
  };
  console.log('NSS1_ATTRIBUTION',JSON.stringify(out));
}
main().catch(e=>{console.error('NSS1_ATTRIBUTION_BLOCK',e?.stack??String(e));process.exitCode=1});
