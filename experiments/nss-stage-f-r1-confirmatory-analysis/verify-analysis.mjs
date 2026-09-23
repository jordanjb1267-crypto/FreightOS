import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Independent Phase-V verifier for Stage-F R1 confirmatory analysis.
// It imports neither analyze.mjs nor any provider adapter and performs no network I/O.
globalThis.fetch = async () => { throw new Error('STAGE_F_R1_ANALYSIS_PHASE_V_NETWORK_PROHIBITED'); };

const GOLD_ROOT = process.env.STAGE_F_GOLD_ROOT ?? '/tmp/stage-f-verified/stage-f-evidence';
const SOURCE_ROOT = process.env.STAGE_F_SOURCE_LEDGER_ROOT ?? '/data/nss1-stage-f-provider-v0.2';
const R1_ROOT = process.env.STAGE_F_R1_LEDGER_ROOT ?? '/data/nss1-stage-f-jev-remediation-r1-v0.1';
const PHASE_A_ROOT = process.env.STAGE_F_R1_ANALYSIS_OUT ?? '/data/nss1-stage-f-r1-confirmatory-analysis-v0.1';
const OUT_ROOT = process.env.STAGE_F_R1_ANALYSIS_PHASE_V_OUT ?? '/data/nss1-stage-f-r1-confirmatory-analysis-phase-v-v0.1';
const RUN_ID = 'NSS1-STAGE-F-R1-GOLD-CONFIRMATORY-ANALYSIS-PHASE-V-v0.1';

const EXPECTED = Object.freeze({
  phaseA: 'f9cf601755cf456c4c814a0ea7f7eb4435f66231cce32e94471e645d6505f70f',
  predecessorIndex: '2e50185fa5d4ee5c3f137ccfbb4283d5a8964e6e3d53288a29043ee8f9d207e7',
  r1Index: 'b47252de25cc86dc6bf94f4c52ac7f44f21faabb1db13a41801400b35944b900',
  qset: '0e8c01c8d98e2fbbeb9f7b034ef638dcf11df0f9f2189834322830bb0b758bcb',
  matrix: '8135ad29cf2c13d0c433de6a4825d0395889d0c25ef6556e873048728bba9ff8',
  semanticGold: '72cadf0a6286c77630519ae505363d59cc0b78f07f5691afaba90bc11aff16ec',
  semanticAttempts: 'bd878169d903942d7e0d1cc45f6ac7941303896399486ccd7d02edfb691145f9',
  consequenceGold: '4ade0ab7822d4f19d07e598d53f335a534577befbbf1417a8daf2b035562b07d',
  knownNovel: '7bc0a5665739b20cf0c240635fd2ce7eb9686f55af577336ed4e0fea213e7984',
  freshness: 'c2c9c6b092e80c745b74493682f8934c1b6f10ba7bf90718066797f57ca11a31',
  acceptance: 'aa121991d20f06c301f65e263bf3bca692142e7929ecc8c854fdfbb0bbf24efb',
  metricSpec: '0363e563b8a621bcf28b487737f13bc6620ddb1ea7465f46b4f3a5dbd35a1fc4'
});

const sha = b => createHash('sha256').update(b).digest('hex');
const rawHash = async f => sha(await readFile(f));
const json = async f => JSON.parse(await readFile(f,'utf8'));
const exists = async f => { try { await stat(f); return true; } catch { return false; } };
const issue = (issues, ok, code) => { if (!ok) issues.push(code); };
const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
const close = (a,b,t=1e-12) => a===null&&b===null || Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=t;
function logLoss(p,y){const q=Math.max(1e-15,Math.min(1-1e-15,Number(p)));return -(y*Math.log(q)+(1-y)*Math.log(1-q));}

async function ledgerFingerprint(root){
  const entries=[];
  for(const top of ['attempts','receipts','raw']){
    const d=path.join(root,top); if(!(await exists(d))) continue;
    for(const provider of (await readdir(d)).sort()){
      const pd=path.join(d,provider); let ds=[]; try{ds=await readdir(pd,{withFileTypes:true})}catch{}
      for(const ent of ds.sort((a,b)=>a.name.localeCompare(b.name))){if(!ent.isFile())continue;const p=path.join(pd,ent.name),b=await readFile(p);entries.push({path:path.relative(root,p),sha256:sha(b),bytes:b.length});}
    }
  }
  for(const n of ['RECEIPT_INDEX.json','PHASE_W_RESULT.json']){const p=path.join(root,n);if(await exists(p)){const b=await readFile(p);entries.push({path:n,sha256:sha(b),bytes:b.length});}}
  entries.sort((a,b)=>a.path.localeCompare(b.path));
  return sha(Buffer.from(JSON.stringify(entries)));
}

function semanticMetrics(map,ids,goldById,qset){
  const b=[],ll=[],scores=[];let choiceCorrect=0,choiceTotal=0,missing=0;
  for(const id of ids){const r=map.get(id),g=goldById.get(id)?.gold;if(!r||!g){missing++;continue}
    for(const [qid,q] of Object.entries(qset)){const j=r.normalized_judgments?.[qid];if(!j){missing++;continue}
      if(q.type==='noul'){const y=g[qid]===true?1:0,p=Number(j.probability);if(!Number.isFinite(p)){missing++;continue}b.push((p-y)**2);ll.push(logLoss(p,y));}
      else if(q.type==='choice'){choiceTotal++;if(j.selected===g[qid])choiceCorrect++;}
      else if(q.type==='score'){const e=Math.abs(Number(j.score)-Number(g[qid]));if(Number.isFinite(e))scores.push(e);else missing++;}
    }
  }
  return {missing,overall_brier:mean(b),overall_log_loss:mean(ll),choice_accuracy:choiceTotal?choiceCorrect/choiceTotal:null,choice_correct:choiceCorrect,score_mae:mean(scores)};
}

function workMetrics(map,ids,goldById,consequenceById,qset){
  const order=new Map(qset.work_response_class.options.map((x,i)=>[x,i]));let exact=0,falseSafe=0,falseEsc=0,c4=0,missing=0;
  for(const id of ids){const r=map.get(id),g=goldById.get(id)?.gold,c=consequenceById.get(id);if(!r||!g||!c){missing++;continue}const p=r.normalized_judgments?.work_response_class?.selected;const pi=order.get(p),gi=order.get(g.work_response_class);if(pi===undefined||gi===undefined){missing++;continue}if(pi===gi)exact++;else if(pi<gi){falseSafe++;if(c.class==='C4_AUTHORITY_OR_SAFETY_CRITICAL')c4++;}else falseEsc++;}
  const n=ids.length-missing;return{n,exact,exact_accuracy:n?exact/n:null,false_safe:falseSafe,false_safe_rate:n?falseSafe/n:null,false_escalation:falseEsc,false_escalation_rate:n?falseEsc/n:null,c4_false_safe_events:c4};
}

const issues=[];
const phaseAPath=path.join(PHASE_A_ROOT,'ANALYSIS_RESULT.json');
issue(issues,await exists(phaseAPath),'PHASE_A_MISSING');
if(await exists(phaseAPath)) issue(issues,(await rawHash(phaseAPath))===EXPECTED.phaseA,'PHASE_A_HASH_MISMATCH');
const phaseA=await json(phaseAPath);
issue(issues,phaseA.status==='WRITE_COMPLETE_UNVERIFIED','PHASE_A_STATUS');
issue(issues,phaseA.issues?.length===0,'PHASE_A_ISSUES');

for(const [name,expected] of Object.entries({
  'question_set.json':EXPECTED.qset,'provider_matrix.json':EXPECTED.matrix,'semantic_gold.json':EXPECTED.semanticGold,'semantic_attempts.json':EXPECTED.semanticAttempts,
  'consequence_class_gold.json':EXPECTED.consequenceGold,'known_novel.json':EXPECTED.knownNovel,'freshness_gold.json':EXPECTED.freshness,
  'acceptance_gates.json':EXPECTED.acceptance,'metric_spec.json':EXPECTED.metricSpec
})) issue(issues,(await rawHash(path.join(GOLD_ROOT,name)))===expected,`GOLD_HASH:${name}`);

const sourceBefore=await ledgerFingerprint(SOURCE_ROOT),r1Before=await ledgerFingerprint(R1_ROOT);
const predIdxPath=path.join(SOURCE_ROOT,'RECEIPT_INDEX.json'),r1IdxPath=path.join(R1_ROOT,'RECEIPT_INDEX.json');
issue(issues,(await rawHash(predIdxPath))===EXPECTED.predecessorIndex,'PREDECESSOR_INDEX_HASH');
issue(issues,(await rawHash(r1IdxPath))===EXPECTED.r1Index,'R1_INDEX_HASH');
const [predIdx,r1Idx,qset,matrix,gold,attempts,consequence,known,fresh,acceptance,metricSpec]=await Promise.all([
  json(predIdxPath),json(r1IdxPath),json(path.join(GOLD_ROOT,'question_set.json')),json(path.join(GOLD_ROOT,'provider_matrix.json')),json(path.join(GOLD_ROOT,'semantic_gold.json')),
  json(path.join(GOLD_ROOT,'semantic_attempts.json')),json(path.join(GOLD_ROOT,'consequence_class_gold.json')),json(path.join(GOLD_ROOT,'known_novel.json')),json(path.join(GOLD_ROOT,'freshness_gold.json')),
  json(path.join(GOLD_ROOT,'acceptance_gates.json')),json(path.join(GOLD_ROOT,'metric_spec.json'))
]);
issue(issues,predIdx.length===400,'PREDECESSOR_COUNT');issue(issues,r1Idx.length===160,'R1_COUNT');issue(issues,matrix.length===240&&attempts.length===240,'SEMANTIC_COUNT');

const control=new Map(),predJev=[];
for(const row of predIdx){const p=path.join(SOURCE_ROOT,'receipts',row.provider,`${row.event_id}.json`),bytes=await readFile(p);issue(issues,sha(bytes)===row.receipt_sha256,`PREDECESSOR_RECEIPT:${row.event_id}`);const r=JSON.parse(bytes);if(row.provider==='luna')control.set(row.event_id,r);else predJev.push(row.event_id);}
const r1=new Map();for(const row of r1Idx){const p=path.join(R1_ROOT,'receipts','jev',`${row.event_id}.json`),bytes=await readFile(p);issue(issues,sha(bytes)===row.receipt_sha256,`R1_RECEIPT:${row.event_id}`);r1.set(row.event_id,JSON.parse(bytes));}
issue(issues,control.size===240&&r1.size===160,'PROVIDER_COUNTS');issue(issues,[...r1.keys()].sort().join('|')===predJev.sort().join('|'),'R1_EVENT_SET');

const matrixById=new Map(matrix.map(x=>[x.event_id,x])),goldById=new Map(gold.map(x=>[x.event_id,x])),attemptById=new Map(attempts.map(x=>[x.event.event_id,x])),consequenceById=new Map(consequence.map(x=>[x.event_id,x])),freshById=new Map(fresh.map(x=>[x.event_id,x]));
const ids=attempts.map(x=>x.event.event_id).sort(),candidate=new Map();let candidateLuna=0,candidateJev=0;
for(const id of ids){const m=matrixById.get(id);if(m.candidate_provider==='JEV'){candidate.set(id,r1.get(id));candidateJev++;}else{candidate.set(id,control.get(id));candidateLuna++;}}
issue(issues,candidateLuna===80&&candidateJev===160,'CANDIDATE_COUNTS');

let controlOk=0,candidateOk=0,stateTotal=0,stateMatch=0,crossTenant=0,staleApps=0;
for(const id of ids){const a=attemptById.get(id),fg=freshById.get(id);for(const [lane,r] of [['control',control.get(id)],['candidate',candidate.get(id)]]){if(!r){issues.push(`MISSING:${lane}:${id}`);continue}if(lane==='control'&&r.status==='OK')controlOk++;if(lane==='candidate'&&r.status==='OK')candidateOk++;stateTotal++;if(r.bound_state_sha256===a.state_sha256)stateMatch++;if(r.tenant_id!==a.event.tenant_id||r.load_id!==a.event.load_id)crossTenant++;if(fg?.status==='STALE_REJECTED_AT_FROZEN_COMPLETION'&&r.current_state_application!==false)staleApps++;}}

const cSem=semanticMetrics(control,ids,goldById,qset),rSem=semanticMetrics(candidate,ids,goldById,qset),cWork=workMetrics(control,ids,goldById,consequenceById,qset),rWork=workMetrics(candidate,ids,goldById,consequenceById,qset);
const suppression=1-candidateLuna/240,workDelta=(rWork.exact_accuracy-cWork.exact_accuracy)*100,falseSafeDelta=(rWork.false_safe_rate-cWork.false_safe_rate)*100;

const needRulePresent = JSON.stringify({q:qset.need_exists,m:metricSpec,a:acceptance}).toLowerCase().includes('threshold');
const gates={
  control_provider_executability:{observed:controlOk/240,status:controlOk===240?'PASS':'BLOCK'},
  candidate_provider_executability:{observed:candidateOk/240,status:candidateOk===240?'PASS':'BLOCK'},
  state_binding_integrity:{observed:stateMatch/stateTotal,status:stateMatch===stateTotal&&stateTotal===480?'PASS':'BLOCK'},
  cross_tenant_contamination:{observed:crossTenant,status:crossTenant===0?'PASS':'BLOCK'},
  stale_current_state_applications:{observed:staleApps,status:staleApps===0?'PASS':'BLOCK'},
  candidate_luna_suppression:{observed:suppression,status:suppression>=acceptance.candidate_luna_suppression_min?'PASS':'BLOCK'},
  work_disposition_accuracy_delta_vs_control_pp:{observed:workDelta,status:workDelta>=acceptance.work_disposition_accuracy_delta_min_pp?'PASS':'BLOCK'},
  false_safe_rate_delta_vs_control_pp:{observed:falseSafeDelta,status:falseSafeDelta<=acceptance.false_safe_rate_delta_max_pp?'PASS':'BLOCK'},
  need_recall_delta_vs_control_pp:{observed:null,status:needRulePresent?'UNEXPECTED_RULE_PRESENT_NOT_EVALUATED':'INCONCLUSIVE'},
  c4_false_safe_events:{observed:rWork.c4_false_safe_events,status:rWork.c4_false_safe_events<=acceptance.c4_false_safe_events_max?'PASS':'BLOCK'},
  authority_effects:{observed:'NONE',status:'PASS'}
};
const blocked=Object.values(gates).some(x=>x.status==='BLOCK');const inconclusive=Object.values(gates).some(x=>x.status==='INCONCLUSIVE');const verdict=blocked?'BLOCK':inconclusive?'INCONCLUSIVE_MISSING_PRE_REGISTERED_NEED_DECISION_RULE':'PASS';

// Compare independently recomputed Phase-V values against Phase A.
issue(issues,phaseA.architecture_verdict===verdict,`PHASE_A_VERDICT:${phaseA.architecture_verdict}:${verdict}`);
for(const key of Object.keys(gates)){issue(issues,phaseA.gates?.[key]?.status===gates[key].status,`GATE_STATUS:${key}`);const a=phaseA.gates?.[key]?.observed,b=gates[key].observed;if(a!==null||b!==null)issue(issues,close(a,b),`GATE_VALUE:${key}:${a}:${b}`);}
issue(issues,phaseA.work?.control?.exact===cWork.exact,'CONTROL_WORK_EXACT');issue(issues,phaseA.work?.candidate?.exact===rWork.exact,'CANDIDATE_WORK_EXACT');
issue(issues,phaseA.work?.candidate?.c4_false_safe_events===rWork.c4_false_safe_events,'C4_FALSE_SAFE');
issue(issues,close(phaseA.semantic?.control?.noul?.overall_brier,cSem.overall_brier),'CONTROL_BRIER');issue(issues,close(phaseA.semantic?.candidate?.noul?.overall_brier,rSem.overall_brier),'CANDIDATE_BRIER');
issue(issues,close(phaseA.semantic?.control?.choice?.exact_accuracy,cSem.choice_accuracy),'CONTROL_CHOICE');issue(issues,close(phaseA.semantic?.candidate?.choice?.exact_accuracy,rSem.choice_accuracy),'CANDIDATE_CHOICE');
issue(issues,close(phaseA.semantic?.control?.score?.mae,cSem.score_mae),'CONTROL_SCORE');issue(issues,close(phaseA.semantic?.candidate?.score?.mae,rSem.score_mae),'CANDIDATE_SCORE');
issue(issues,!needRulePresent,'NEED_THRESHOLD_POSTHOC_OR_UNEXPECTED');

const sourceAfter=await ledgerFingerprint(SOURCE_ROOT),r1After=await ledgerFingerprint(R1_ROOT);issue(issues,sourceBefore===sourceAfter,'SOURCE_LEDGER_MUTATION');issue(issues,r1Before===r1After,'R1_LEDGER_MUTATION');

const result={run_id:RUN_ID,status:issues.length?'PHASE_V_VERIFICATION_FAIL':'PHASE_V_VERIFIED',issues,verification_mode:'INDEPENDENT_ZERO_PROVIDER_READ_ONLY_RECOMPUTATION',phase_a_result_sha256:EXPECTED.phaseA,architecture_verdict:verdict,denominator:{semantic_events:240,control_luna:240,candidate_luna:80,candidate_jev:160,luna_suppression:suppression},semantic:{control:cSem,candidate:rSem},work:{control:cWork,candidate:rWork,work_disposition_accuracy_delta_pp:workDelta,false_safe_rate_delta_pp:falseSafeDelta},gates,need_decision_rule:{pre_registered_threshold_present:needRulePresent,status:needRulePresent?'UNEXPECTED':'NOT_EVALUABLE_MISSING_PRE_REGISTERED_DECISION_RULE'},source_integrity:{predecessor_before_sha256:sourceBefore,predecessor_after_sha256:sourceAfter,predecessor_unchanged:sourceBefore===sourceAfter,r1_before_sha256:r1Before,r1_after_sha256:r1After,r1_unchanged:r1Before===r1After},provider_calls:0,jev_calls:0,luna_calls:0,openrouter_calls:0,frontier_calls:0,credentials_read:false,provider_replay:false,authority_effects:'NONE',production_promotion:false};
await mkdir(OUT_ROOT,{recursive:true});const out=path.join(OUT_ROOT,'PHASE_V_RESULT.json');await writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});const resultSha=await rawHash(out);console.log('NSS1_STAGE_F_R1_CONFIRMATORY_ANALYSIS_PHASE_V',JSON.stringify({...result,result_sha256:resultSha}));if(issues.length)process.exitCode=2;
