import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.env.EVIDENCE_DIR ?? '/data/nss1-stage-a-v0.1';
const SEMANTIC_FAMILIES = [
  'irrelevant_advertisement','minor_gps_update','appointment_material_change','contradictory_facility_evidence',
  'mechanical_breakdown','detention_threshold_crossed','pod_arrival','wrong_load_pod','invoice_after_pod',
  'factor_assignment_change','reconciliation_success','in_flight_state_change','malicious_instruction_distractor'
];
const ALL_FAMILIES = [
  'irrelevant_advertisement','minor_gps_update','appointment_material_change','exact_duplicate_appointment','stale_appointment',
  'contradictory_facility_evidence','mechanical_breakdown','detention_threshold_crossed','pod_arrival','wrong_load_pod',
  'invoice_after_pod','factor_assignment_change','provider_fault','uncertain_external_effect','reconciliation_success',
  'completed_work_replay','out_of_order_event','in_flight_state_change','crash_restart_boundary','malicious_instruction_distractor'
];
const RANK = {
  NO_ACTION:0,
  STATE_UPDATE_ONLY:1,
  NEED_DETECTED:2,
  KNOWN_PROCEDURE:3,
  GENERAL_REASONING_REQUIRED:4,
  FRONTIER_ESCALATION_REQUIRED:5,
  HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED:6,
  PROVIDER_EXECUTABILITY_FAILURE:-1,
};

async function readJson(name){ return JSON.parse(await readFile(path.join(ROOT,name),'utf8')); }
function eventNumber(id){ return Number(id.split('-')[1]); }
function familyOf(id){ return ALL_FAMILIES[Math.floor((eventNumber(id)-1)/16)]; }
function loadIndex(id){ return ((eventNumber(id)-1)%16)+1; }
function rowMap(rows){ return new Map(rows.map(r=>[r.event_id,r])); }
function isFalseSafe(row){ return (RANK[row.compiled_disposition] ?? -1) < (RANK[row.expected_disposition] ?? 99); }
function metrics(rows){
  let correct=0,falseSafe=0;
  for(const row of rows){ if(row.compiled_disposition===row.expected_disposition) correct++; if(isFalseSafe(row)) falseSafe++; }
  return { n:rows.length, correct, accuracy:rows.length?correct/rows.length:null, false_safe:falseSafe, false_safe_rate:rows.length?falseSafe/rows.length:null };
}
function evaluatePolicy(policy, ids, A, B){
  const rows=[], familyBreakdown={}; let lunaCalls=0,jevCalls=0;
  for(const id of ids){
    const family=familyOf(id), provider=policy[family], row=provider==='luna'?A.get(id):B.get(id);
    rows.push(row); if(provider==='luna') lunaCalls++; else jevCalls++;
    familyBreakdown[family]??={provider,n:0,correct:0,false_safe:0};
    const f=familyBreakdown[family]; f.n++; if(row.compiled_disposition===row.expected_disposition) f.correct++; if(isFalseSafe(row)) f.false_safe++;
  }
  for(const f of Object.values(familyBreakdown)){ f.accuracy=f.n?f.correct/f.n:null; f.false_safe_rate=f.n?f.false_safe/f.n:null; }
  const m=metrics(rows);
  return { ...m, luna_calls:lunaCalls, jev_calls:jevCalls, luna_suppression_vs_monolith:ids.length?1-lunaCalls/ids.length:null, family_breakdown:familyBreakdown };
}
function policyFromMask(mask){ const p={}; for(let i=0;i<SEMANTIC_FAMILIES.length;i++) p[SEMANTIC_FAMILIES[i]]=((mask>>i)&1)?'luna':'jev'; return p; }
function observedArmMetrics(rows, ids){ const wanted=new Set(ids); return metrics(rows.filter(r=>wanted.has(r.event_id))); }
function dominates(x,y){
  return x.train.accuracy>=y.train.accuracy && x.train.false_safe_rate<=y.train.false_safe_rate && x.train.luna_calls<=y.train.luna_calls &&
    (x.train.accuracy>y.train.accuracy || x.train.false_safe_rate<y.train.false_safe_rate || x.train.luna_calls<y.train.luna_calls);
}
function pairedCompare(policyRows, baselineRows){
  let policy_only=0,baseline_only=0,both_correct=0,both_wrong=0;
  for(let i=0;i<policyRows.length;i++){
    const p=policyRows[i].compiled_disposition===policyRows[i].expected_disposition;
    const b=baselineRows[i].compiled_disposition===baselineRows[i].expected_disposition;
    if(p&&b) both_correct++; else if(p&&!b) policy_only++; else if(!p&&b) baseline_only++; else both_wrong++;
  }
  return {policy_only_correct:policy_only,baseline_only_correct:baseline_only,both_correct,both_wrong};
}
function materializeRows(policy, ids, A, B){ return ids.map(id=>policy[familyOf(id)]==='luna'?A.get(id):B.get(id)); }

async function main(){
  const [a,b,c,freeze] = await Promise.all([
    readJson('ARM_A_LUNA_RESULT.json'),readJson('ARM_B_JEV_RESULT.json'),readJson('ARM_C_ROUTED_RESULT.json'),readJson('FREEZE_POINTER.json')
  ]);
  const A=rowMap(a.rows), B=rowMap(b.rows);
  const ids=[...A.keys()].sort((x,y)=>eventNumber(x)-eventNumber(y));
  const trainIds=ids.filter(id=>loadIndex(id)<=8), holdoutIds=ids.filter(id=>loadIndex(id)>=9);
  if(trainIds.length!==104 || holdoutIds.length!==104) throw new Error(`SPLIT_CARDINALITY_FAILURE:${trainIds.length}/${holdoutIds.length}`);

  const allLuna=Object.fromEntries(SEMANTIC_FAMILIES.map(f=>[f,'luna']));
  const allJev=Object.fromEntries(SEMANTIC_FAMILIES.map(f=>[f,'jev']));
  const lunaTrain=evaluatePolicy(allLuna,trainIds,A,B), lunaHoldout=evaluatePolicy(allLuna,holdoutIds,A,B);
  const jevTrain=evaluatePolicy(allJev,trainIds,A,B), jevHoldout=evaluatePolicy(allJev,holdoutIds,A,B);

  const candidates=[];
  for(let mask=0;mask<(1<<SEMANTIC_FAMILIES.length);mask++){
    const policy=policyFromMask(mask), train=evaluatePolicy(policy,trainIds,A,B);
    candidates.push({mask,policy,train});
  }
  const frontier=candidates.filter((x,i)=>!candidates.some((y,j)=>i!==j&&dominates(y,x)));

  const noTrainAccuracyLoss=candidates.filter(x=>x.train.accuracy>=lunaTrain.accuracy && x.train.false_safe_rate<=lunaTrain.false_safe_rate);
  noTrainAccuracyLoss.sort((x,y)=>x.train.luna_calls-y.train.luna_calls || y.train.accuracy-x.train.accuracy || x.train.false_safe_rate-y.train.false_safe_rate);
  const maxSuppressionNoTrainLoss=noTrainAccuracyLoss[0]??null;

  const maxTrainAccuracy=[...candidates].sort((x,y)=>y.train.accuracy-x.train.accuracy || x.train.false_safe_rate-y.train.false_safe_rate || x.train.luna_calls-y.train.luna_calls)[0];
  const safetyFirst=[...candidates].filter(x=>x.train.false_safe_rate<=lunaTrain.false_safe_rate).sort((x,y)=>y.train.accuracy-x.train.accuracy || x.train.luna_calls-y.train.luna_calls || x.train.false_safe_rate-y.train.false_safe_rate)[0];

  const selected={};
  for(const [name,cand] of Object.entries({max_suppression_no_train_loss:maxSuppressionNoTrainLoss,max_train_accuracy:maxTrainAccuracy,safety_first:safetyFirst})){
    if(!cand) {selected[name]=null; continue;}
    const holdout=evaluatePolicy(cand.policy,holdoutIds,A,B);
    const policyRows=materializeRows(cand.policy,holdoutIds,A,B), baselineRows=materializeRows(allLuna,holdoutIds,A,B);
    selected[name]={mask:cand.mask,policy:cand.policy,train:cand.train,holdout,paired_vs_luna_holdout:pairedCompare(policyRows,baselineRows)};
  }

  const frontierHoldout=frontier.map(cand=>({mask:cand.mask,policy:cand.policy,train:cand.train,holdout:evaluatePolicy(cand.policy,holdoutIds,A,B)}));
  const observedTrain=observedArmMetrics(c.rows,trainIds), observedHoldout=observedArmMetrics(c.rows,holdoutIds);

  const out={
    gate:'NSS1_STAGE_A_ZERO_CALL_COUNTERFACTUAL_FAMILY_ROUTING_SEARCH_V0_1',
    provider_calls_made_by_this_analysis:0,
    freeze_pointer:freeze,
    split:{train_load_indices:'1-8',holdout_load_indices:'9-16',train_events:trainIds.length,holdout_events:holdoutIds.length},
    search_space:{policy_class:'one-provider-per-semantic-family',families:SEMANTIC_FAMILIES.length,policies_evaluated:candidates.length,frontier_size:frontier.length},
    baselines:{all_luna:{train:lunaTrain,holdout:lunaHoldout},all_jev:{train:jevTrain,holdout:jevHoldout},observed_arm_c:{train:observedTrain,holdout:observedHoldout}},
    selected,
    train_pareto_frontier:frontierHoldout,
    interpretation_boundary:'EXPLORATORY_RECEIPT_REPLAY_ONLY_NO_CONFIRMATORY_PROMOTION'
  };
  console.log('NSS1_ROUTING_SEARCH',JSON.stringify(out));
}
main().catch(e=>{console.error('NSS1_ROUTING_SEARCH_BLOCK',e?.stack??String(e));process.exitCode=1});
