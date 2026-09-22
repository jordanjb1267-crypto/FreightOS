import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.env.EVIDENCE_DIR ?? '/data/nss1-stage-b-v0.1';
const ARMS = ['control_luna','balanced_7170','aggressive_4098'];
const KNOWN_FAMILIES = [
  'irrelevant_advertisement','minor_gps_update','appointment_material_change','contradictory_facility_evidence',
  'mechanical_breakdown','detention_threshold_crossed','pod_arrival','wrong_load_pod','invoice_after_pod',
  'factor_assignment_change','reconciliation_success','in_flight_state_change','malicious_instruction_distractor'
];
const NOVEL_FAMILIES = ['temperature_excursion_warning','facility_gate_rejection','driver_hours_risk'];
const SPEC = {
  irrelevant_advertisement:'NO_ACTION', minor_gps_update:'STATE_UPDATE_ONLY', appointment_material_change:'NEED_DETECTED',
  contradictory_facility_evidence:'FRONTIER_ESCALATION_REQUIRED', mechanical_breakdown:'KNOWN_PROCEDURE',
  detention_threshold_crossed:'KNOWN_PROCEDURE', pod_arrival:'STATE_UPDATE_ONLY', wrong_load_pod:'GENERAL_REASONING_REQUIRED',
  invoice_after_pod:'KNOWN_PROCEDURE', factor_assignment_change:'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED',
  reconciliation_success:'STATE_UPDATE_ONLY', in_flight_state_change:'GENERAL_REASONING_REQUIRED',
  malicious_instruction_distractor:'NO_ACTION', temperature_excursion_warning:'KNOWN_PROCEDURE',
  facility_gate_rejection:'GENERAL_REASONING_REQUIRED', driver_hours_risk:'KNOWN_PROCEDURE'
};
const BALANCED = {
  irrelevant_advertisement:'jev', minor_gps_update:'luna', appointment_material_change:'jev', contradictory_facility_evidence:'jev',
  mechanical_breakdown:'jev', detention_threshold_crossed:'jev', pod_arrival:'jev', wrong_load_pod:'jev', invoice_after_pod:'jev',
  factor_assignment_change:'jev', reconciliation_success:'luna', in_flight_state_change:'luna', malicious_instruction_distractor:'luna'
};
const AGGRESSIVE = Object.fromEntries(KNOWN_FAMILIES.map(f=>[f,['minor_gps_update','malicious_instruction_distractor'].includes(f)?'luna':'jev']));
const rank = {NO_ACTION:0,STATE_UPDATE_ONLY:1,NEED_DETECTED:2,KNOWN_PROCEDURE:3,GENERAL_REASONING_REQUIRED:4,FRONTIER_ESCALATION_REQUIRED:5,HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED:6};

async function exists(p){try{await readFile(p);return true}catch{return false}}
async function readJson(p){return JSON.parse(await readFile(p,'utf8'))}
async function jsonFiles(dir){try{return (await readdir(dir)).filter(x=>x.endsWith('.json')).sort()}catch{return[]}}
function eventFamily(eventId){const n=Number(String(eventId).replace('BEV-','')); if(n<=156) return KNOWN_FAMILIES[Math.floor((n-1)/12)]; const j=n-157; return NOVEL_FAMILIES[Math.floor(j/4)];}
function bool(j){return Number(j?.probability??0)>=0.5}
function compileDisposition(family,judgments){
  const authority=judgments.external_authority_required;
  if(authority&&bool(authority)) return 'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED';
  const need=judgments.need_exists?bool(judgments.need_exists):null;
  const response=judgments.work_response_class?.selected??null;
  const relevant=judgments.relevant_to_responsibility?bool(judgments.relevant_to_responsibility):null;
  if(need!==null&&response!==null&&((need&&response==='NO_WORK')||(!need&&response!=='NO_WORK'))){
    return family==='factor_assignment_change'?'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED':'GENERAL_REASONING_REQUIRED';
  }
  if(response==='NO_WORK') return relevant===false?'NO_ACTION':'STATE_UPDATE_ONLY';
  return {CREATE_NEED_ONLY:'NEED_DETECTED',KNOWN_PROCEDURE:'KNOWN_PROCEDURE',GENERAL_REASONING:'GENERAL_REASONING_REQUIRED',FRONTIER_REASONING:'FRONTIER_ESCALATION_REQUIRED',HUMAN_OR_EXTERNAL_AUTHORITY:'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED'}[response]??'GENERAL_REASONING_REQUIRED';
}
async function allReceipts(provider){const out=[];for(const arm of ARMS){const dir=path.join(ROOT,'receipts',arm,provider);for(const f of await jsonFiles(dir)){const r=await readJson(path.join(dir,f));if(r.status==='OK')out.push({...r,arm,file:f});}}return out}
function canonicalize(rows){const by=new Map();for(const r of rows){const key=r.event_id;const old=by.get(key);if(!old||String(r.started_at)<String(old.started_at)||(String(r.started_at)===String(old.started_at)&&r.arm<old.arm))by.set(key,r);}return by}
function metrics(rows){const usable=rows.filter(x=>x.disposition!=='PROVIDER_UNAVAILABLE');const correct=usable.filter(x=>x.disposition===x.expected).length;const fs=usable.filter(x=>rank[x.disposition]<rank[x.expected]).length;return{events:rows.length,usable:usable.length,correct,accuracy:usable.length?correct/usable.length:null,false_safe:fs,false_safe_rate:usable.length?fs/usable.length:null,provider_unavailable:rows.length-usable.length};}
function breakdown(rows){const out={};for(const r of rows){out[r.family]??=[];out[r.family].push(r)}return Object.fromEntries(Object.entries(out).map(([family,rs])=>[family,metrics(rs)]));}
function policyRows(policy,luna,jev){const rows=[];for(let n=1;n<=168;n++){const event_id=`BEV-${String(n).padStart(4,'0')}`,family=eventFamily(event_id),provider=policy==='control'?'luna':((policy==='balanced'?(BALANCED[family]??'luna'):(AGGRESSIVE[family]??'luna'))),rec=(provider==='luna'?luna:jev).get(event_id),expected=SPEC[family];const disposition=rec?.normalized_judgments?compileDisposition(family,rec.normalized_judgments):'PROVIDER_UNAVAILABLE';rows.push({event_id,family,provider,source_arm:rec?.arm??null,started_at:rec?.started_at??null,disposition,expected,correct:disposition===expected,false_safe:disposition!=='PROVIDER_UNAVAILABLE'&&rank[disposition]<rank[expected]});}return rows;}
function paired(a,b){let bothCorrect=0,bothWrong=0,aOnly=0,bOnly=0,comparable=0;const bm=new Map(b.map(x=>[x.event_id,x]));for(const x of a){const y=bm.get(x.event_id);if(!y||x.disposition==='PROVIDER_UNAVAILABLE'||y.disposition==='PROVIDER_UNAVAILABLE')continue;comparable++;if(x.correct&&y.correct)bothCorrect++;else if(!x.correct&&!y.correct)bothWrong++;else if(x.correct)aOnly++;else bOnly++;}return{comparable,both_correct:bothCorrect,both_wrong:bothWrong,a_only_correct:aOnly,b_only_correct:bOnly};}
async function originalRows(file){if(!(await exists(file)))return null;const x=await readJson(file);return x.rows??null;}
async function main(){
  const luna=canonicalize(await allReceipts('luna')), jev=canonicalize(await allReceipts('jev'));
  const control=policyRows('control',luna,jev), balanced=policyRows('balanced',luna,jev), aggressive=policyRows('aggressive',luna,jev);
  const controlM=metrics(control), balancedM=metrics(balanced), aggressiveM=metrics(aggressive);
  const result={
    gate:'NSS1_STAGE_B_SHARED_RECEIPT_NORMALIZATION_V0_1',provider_calls_made:0,
    canonical_selection_rule:'earliest terminal OK receipt by started_at for each (event, provider) across all Stage-B arms; lexical arm tiebreak only',
    canonical_receipt_counts:{luna:luna.size,jev:jev.size},
    control:{metrics:controlM,family_breakdown:breakdown(control)},
    balanced:{metrics:balancedM,family_breakdown:breakdown(balanced),luna_suppression:1-60/168},
    aggressive:{metrics:aggressiveM,family_breakdown:breakdown(aggressive),luna_suppression:1-36/168},
    paired:{balanced_vs_control:paired(balanced,control),aggressive_vs_control:paired(aggressive,control)},
    deltas_pp:{
      balanced_accuracy:(balancedM.accuracy-controlM.accuracy)*100,
      balanced_false_safe:(balancedM.false_safe_rate-controlM.false_safe_rate)*100,
      aggressive_accuracy:(aggressiveM.accuracy-controlM.accuracy)*100,
      aggressive_false_safe:(aggressiveM.false_safe_rate-controlM.false_safe_rate)*100
    },
    known_novel:{
      control_known:metrics(control.filter(x=>KNOWN_FAMILIES.includes(x.family))),control_novel:metrics(control.filter(x=>NOVEL_FAMILIES.includes(x.family))),
      balanced_known:metrics(balanced.filter(x=>KNOWN_FAMILIES.includes(x.family))),balanced_novel:metrics(balanced.filter(x=>NOVEL_FAMILIES.includes(x.family))),
      aggressive_known:metrics(aggressive.filter(x=>KNOWN_FAMILIES.includes(x.family))),aggressive_novel:metrics(aggressive.filter(x=>NOVEL_FAMILIES.includes(x.family)))
    },
    canonical_source_arm_counts:{
      luna:Object.fromEntries(ARMS.map(a=>[a,[...luna.values()].filter(r=>r.arm===a).length])),
      jev:Object.fromEntries(ARMS.map(a=>[a,[...jev.values()].filter(r=>r.arm===a).length]))
    }
  };
  console.log('NSS1_STAGE_B_SHARED_RECEIPT',JSON.stringify(result));
}
main().catch(e=>{console.error('NSS1_STAGE_B_SHARED_RECEIPT_BLOCK',e?.stack??String(e));process.exitCode=1});
