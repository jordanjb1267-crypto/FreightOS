import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.env.EVIDENCE_DIR ?? '/data/nss1-stage-b-v0.1';
const ARMS = ['control_luna','balanced_7170','aggressive_4098'];
const PROVIDERS = ['luna','jev'];
const RESULT_FILES = {
  control_luna: 'CONTROL_LUNA.json',
  balanced_7170: 'BALANCED_7170.json',
  aggressive_4098: 'AGGRESSIVE_4098.json',
};
const RANK = {NO_ACTION:0,STATE_UPDATE_ONLY:1,NEED_DETECTED:2,KNOWN_PROCEDURE:3,GENERAL_REASONING_REQUIRED:4,FRONTIER_ESCALATION_REQUIRED:5,HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED:6};

async function readJson(p){return JSON.parse(await readFile(p,'utf8'))}
async function jsonFiles(dir){try{return (await readdir(dir)).filter(x=>x.endsWith('.json')).sort()}catch{return[]}}
function ts(s){const n=Date.parse(s??'');return Number.isFinite(n)?n:Number.POSITIVE_INFINITY}

async function loadRows(){
  const out={};
  for(const arm of ARMS){
    const rows=await readJson(path.join(ROOT,RESULT_FILES[arm]));
    out[arm]=new Map(rows.map(r=>[r.event_id,r]));
  }
  return out;
}

async function loadReceipts(){
  const byKey=new Map();
  for(const arm of ARMS){for(const provider of PROVIDERS){
    const dir=path.join(ROOT,'receipts',arm,provider);
    for(const file of await jsonFiles(dir)){
      const r=await readJson(path.join(dir,file));
      const key=`${r.event_id}|${provider}`;
      if(!byKey.has(key))byKey.set(key,[]);
      byKey.get(key).push({...r,arm,provider,file});
    }
  }}
  return byKey;
}

function selectCanonical(candidates){
  const ok=candidates.filter(r=>r.status==='OK').sort((a,b)=>ts(a.started_at)-ts(b.started_at)||a.arm.localeCompare(b.arm)||a.file.localeCompare(b.file));
  return ok[0]??null;
}

function metrics(rows){
  const usable=rows.filter(r=>r.status==='OK');
  const correct=usable.filter(r=>r.compiled_disposition===r.expected_disposition).length;
  const falseSafe=usable.filter(r=>r.false_safe).length;
  const fam={};
  for(const r of rows){
    fam[r.family]??={n:0,usable:0,correct:0,false_safe:0,luna:0,jev:0};
    const f=fam[r.family];f.n++;f[r.provider]++;
    if(r.status==='OK'){f.usable++;if(r.compiled_disposition===r.expected_disposition)f.correct++;if(r.false_safe)f.false_safe++;}
  }
  for(const f of Object.values(fam)){f.accuracy=f.usable?f.correct/f.usable:null;f.false_safe_rate=f.usable?f.false_safe/f.usable:null;}
  const luna=rows.filter(r=>r.provider==='luna').length,jev=rows.filter(r=>r.provider==='jev').length;
  return {events:rows.length,usable:usable.length,correct,accuracy:usable.length?correct/usable.length:null,false_safe:falseSafe,false_safe_rate:usable.length?falseSafe/usable.length:null,luna_calls:luna,jev_calls:jev,luna_suppression:1-luna/rows.length,provider_unavailable:rows.length-usable.length,total_cost_usd:usable.reduce((s,r)=>s+Number(r.cost_usd??0),0),family_breakdown:fam};
}

function paired(policy,control){
  const cm=new Map(control.filter(r=>r.status==='OK').map(r=>[r.event_id,r]));
  let policyOnly=0,controlOnly=0,both=0,neither=0,n=0;
  for(const p of policy){if(p.status!=='OK')continue;const c=cm.get(p.event_id);if(!c)continue;n++;const pc=p.compiled_disposition===p.expected_disposition,cc=c.compiled_disposition===c.expected_disposition;if(pc&&cc)both++;else if(pc&&!cc)policyOnly++;else if(!pc&&cc)controlOnly++;else neither++;}
  return {common_usable:n,policy_only_correct:policyOnly,control_only_correct:controlOnly,both_correct:both,both_wrong:neither};
}

function verdict(m,control,kind){
  const noninferior=m.accuracy!==null&&control.accuracy!==null&&m.accuracy>=control.accuracy-0.05;
  const safe=m.false_safe_rate!==null&&control.false_safe_rate!==null&&m.false_safe_rate<=control.false_safe_rate+0.02;
  const suppress=m.luna_suppression>=(kind==='balanced'?0.50:0.75);
  return {exact_noninferiority:noninferior,false_safe_safety:safe,cognitive_suppression:suppress,shared_receipt_availability:m.provider_unavailable===0,pass:noninferior&&safe&&suppress&&m.provider_unavailable===0};
}

async function main(){
  const pre=await readJson(path.join(ROOT,'PRE_RECEIPT_FREEZE.json'));
  const rows=await loadRows();
  const receipts=await loadReceipts();
  const controlRows=[...rows.control_luna.values()].sort((a,b)=>a.event_id.localeCompare(b.event_id));
  const eventMeta=new Map(controlRows.map(r=>[r.event_id,{event_id:r.event_id,family:r.family,known_family:r.known_family,expected_disposition:r.expected_disposition}]));

  const canonical=new Map();
  const variance={groups_with_multiple_ok:0,compiled_disposition_disagreement_groups:0,correctness_disagreement_groups:0,false_safe_disagreement_groups:0,by_provider:{luna:{groups:0,multiple_ok:0,compiled_disagreement:0},jev:{groups:0,multiple_ok:0,compiled_disagreement:0}},examples:[]};

  for(const [key,candidates] of receipts.entries()){
    const [eventId,provider]=key.split('|');
    const chosen=selectCanonical(candidates);
    if(chosen){
      const sourceRow=rows[chosen.arm].get(eventId);
      if(!sourceRow||sourceRow.provider!==provider||sourceRow.status!=='OK')throw new Error(`ROW_RECEIPT_BINDING_FAILURE:${key}:${chosen.arm}`);
      canonical.set(key,{receipt:chosen,row:sourceRow});
    }
    const oks=candidates.filter(r=>r.status==='OK');
    variance.by_provider[provider].groups++;
    if(oks.length>1){
      variance.groups_with_multiple_ok++;variance.by_provider[provider].multiple_ok++;
      const armRows=oks.map(r=>rows[r.arm].get(eventId)).filter(Boolean);
      const dispositions=new Set(armRows.map(r=>r.compiled_disposition));
      const correctness=new Set(armRows.map(r=>r.compiled_disposition===r.expected_disposition));
      const falseSafe=new Set(armRows.map(r=>Boolean(r.false_safe)));
      if(dispositions.size>1){variance.compiled_disposition_disagreement_groups++;variance.by_provider[provider].compiled_disagreement++;}
      if(correctness.size>1)variance.correctness_disagreement_groups++;
      if(falseSafe.size>1)variance.false_safe_disagreement_groups++;
      if(variance.examples.length<20&&(dispositions.size>1||correctness.size>1||falseSafe.size>1))variance.examples.push({event_id:eventId,provider,arms:oks.map(r=>r.arm),compiled:[...dispositions],correctness:[...correctness],false_safe:[...falseSafe]});
    }
  }

  function normalizedArm(name,policy){
    const out=[];
    for(const meta of eventMeta.values()){
      const provider=policy==='luna'?'luna':(policy[meta.family]??'luna');
      const selected=canonical.get(`${meta.event_id}|${provider}`);
      if(!selected){out.push({...meta,provider,status:'CANONICAL_PROVIDER_OBSERVATION_UNAVAILABLE',compiled_disposition:'PROVIDER_EXECUTABILITY_FAILURE',false_safe:false,cost_usd:0,canonical_source_arm:null,canonical_started_at:null});continue;}
      const sr=selected.row;
      out.push({...meta,provider,status:'OK',compiled_disposition:sr.compiled_disposition,false_safe:Boolean(sr.false_safe),primitive_correct:sr.primitive_correct??null,cost_usd:Number(selected.receipt.cost_usd??sr.cost_usd??0),latency_ms:Number(selected.receipt.latency_ms??sr.latency_ms??0),canonical_source_arm:selected.receipt.arm,canonical_started_at:selected.receipt.started_at,canonical_receipt_response_id:selected.receipt.response_id??null,canonical_raw_response_sha256:selected.receipt.raw_response_sha256??null});
    }
    return out.sort((a,b)=>a.event_id.localeCompare(b.event_id));
  }

  const control=normalizedArm('control','luna');
  const balanced=normalizedArm('balanced',pre.balanced_policy);
  const aggressive=normalizedArm('aggressive',pre.aggressive_policy);
  const cm=metrics(control),bm=metrics(balanced),am=metrics(aggressive);
  const result={
    gate:'NSS1_STAGE_B_SHARED_RECEIPT_NORMALIZATION_V0_1',
    provider_calls_made:0,
    selector:'EARLIEST_SUCCESSFUL_TERMINAL_RECEIPT_BY_STARTED_AT_THEN_ARM_THEN_FILENAME',
    original_result_sha256:(await readJson(path.join(ROOT,'FREEZE_POINTER.json'))).result_sha256,
    corpus_sha256:pre.preflight.corpus_sha256,
    manifest_sha256:pre.preflight.manifest_sha256,
    policies_sha256:pre.preflight.policies_sha256,
    canonical_provider_observation_counts:{luna:[...canonical.keys()].filter(k=>k.endsWith('|luna')).length,jev:[...canonical.keys()].filter(k=>k.endsWith('|jev')).length},
    variance,
    normalized:{control:cm,balanced:bm,aggressive:am,balanced_paired_vs_control:paired(balanced,control),aggressive_paired_vs_control:paired(aggressive,control),balanced_gates:verdict(bm,cm,'balanced'),aggressive_gates:verdict(am,cm,'aggressive')},
    unavailable:{control:control.filter(r=>r.status!=='OK').map(r=>r.event_id),balanced:balanced.filter(r=>r.status!=='OK').map(r=>r.event_id),aggressive:aggressive.filter(r=>r.status!=='OK').map(r=>r.event_id)},
    authority_effects:'NONE',openrouter_calls:0,frontier_calls:0
  };
  console.log('NSS1_STAGE_B_SHARED_RECEIPT_NORMALIZATION',JSON.stringify(result));
}

main().catch(e=>{console.error('NSS1_STAGE_B_SHARED_RECEIPT_NORMALIZATION_BLOCK',e?.stack??String(e));process.exitCode=1});
