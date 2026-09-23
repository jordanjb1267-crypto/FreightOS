import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// The Railway entry loads and hash-verifies the frozen Stage-F archive first,
// then disables network access before importing this analyzer.
const GOLD_ROOT = process.env.STAGE_F_GOLD_ROOT ?? '/tmp/stage-f-verified/stage-f-evidence';
const SOURCE_ROOT = process.env.STAGE_F_SOURCE_LEDGER_ROOT ?? '/data/nss1-stage-f-provider-v0.2';
const R1_ROOT = process.env.STAGE_F_R1_LEDGER_ROOT ?? '/data/nss1-stage-f-jev-remediation-r1-v0.1';
const R1_PHASE_V_ROOT = process.env.STAGE_F_R1_PHASE_V_ROOT ?? '/data/nss1-stage-f-r1-phase-v-v0.3';
const OUT_ROOT = process.env.STAGE_F_R1_ANALYSIS_OUT ?? '/data/nss1-stage-f-r1-confirmatory-analysis-v0.1';
const RUN_ID = 'NSS1-STAGE-F-R1-GOLD-CONFIRMATORY-ANALYSIS-v0.1';

const EXPECTED = Object.freeze({
  archive: 'b43f7bb6f2a158300c63ff0df9519de21a18e1005860490f4f97ac907ba52af8',
  predecessorIndex: '2e50185fa5d4ee5c3f137ccfbb4283d5a8964e6e3d53288a29043ee8f9d207e7',
  r1Index: 'b47252de25cc86dc6bf94f4c52ac7f44f21faabb1db13a41801400b35944b900',
  r1PhaseVResult: '7901d874dae0b803b0d6a341d296fb7aadf26616aa8f629f0098726440a1eb54',
  r1RunnerManifest: 'a25b395fb70a571bea8711d1354a6032772a553468da8d005100aed4f3b386b8',
  gold: {
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
    'acceptance_gates.json':'aa121991d20f06c301f65e263bf3bca692142e7929ecc8c854fdfbb0bbf24efb',
    'responsibility.json':'8db6a17b53f51cc2ecc265f8d4d331b0ae497ed9228d2533eedc88355e92e98b'
  }
});

const shaBuf = b => createHash('sha256').update(b).digest('hex');
const shaText = s => shaBuf(Buffer.from(s));
const json = async f => JSON.parse(await readFile(f,'utf8'));
const exists = async f => { try { await stat(f); return true; } catch { return false; } };
const check = (condition, code, issues) => { if (!condition) issues.push(code); };
const bump = (obj,key,n=1) => { obj[String(key)] = (obj[String(key)] ?? 0) + n; };
const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
function nearestRank(xs,p){ if(!xs.length)return null; const a=[...xs].sort((x,y)=>x-y); return a[Math.max(0,Math.ceil(p*a.length)-1)]; }
function stats(xs){ const a=xs.map(Number).filter(Number.isFinite); return {count:a.length,mean:mean(a),p50:nearestRank(a,.5),p95:nearestRank(a,.95),p99:nearestRank(a,.99),min:a.length?Math.min(...a):null,max:a.length?Math.max(...a):null}; }
function safeLogLoss(p,y){ const q=Math.min(1-1e-15,Math.max(1e-15,Number(p))); return -(y*Math.log(q)+(1-y)*Math.log(1-q)); }

async function ledgerFingerprint(root){
  const entries=[];
  for(const top of ['attempts','receipts','raw']){
    const d=path.join(root,top); if(!(await exists(d))) continue;
    for(const provider of (await readdir(d)).sort()){
      const pd=path.join(d,provider); let ds; try{ds=await readdir(pd,{withFileTypes:true})}catch{continue}
      for(const ent of ds.sort((a,b)=>a.name.localeCompare(b.name))){ if(!ent.isFile()) continue; const p=path.join(pd,ent.name),b=await readFile(p); entries.push({path:path.relative(root,p),sha256:shaBuf(b),bytes:b.length}); }
    }
  }
  for(const name of ['RECEIPT_INDEX.json','PHASE_W_RESULT.json']){ const p=path.join(root,name); if(await exists(p)){const b=await readFile(p);entries.push({path:name,sha256:shaBuf(b),bytes:b.length});} }
  entries.sort((a,b)=>a.path.localeCompare(b.path));
  return {entries,sha256:shaText(JSON.stringify(entries))};
}

async function verifyFrozenGold(issues){
  for(const [name,expected] of Object.entries(EXPECTED.gold)){
    const p=path.join(GOLD_ROOT,name); check(await exists(p),`GOLD_MISSING:${name}`,issues); if(await exists(p)){const got=shaBuf(await readFile(p));check(got===expected,`GOLD_HASH:${name}:${got}`,issues);}
  }
  const v=await json(path.join(GOLD_ROOT,'VERIFICATION_RESULT.json'));
  check(v.status==='PASS','GOLD_PHASE_V_NOT_PASS',issues);
  check(v.provider_calls===0,'GOLD_PROVIDER_CALLS_NONZERO',issues);
}

function semanticMetrics(receiptsByEvent, eventIds, semanticGoldById, qset){
  const noul={}; const allBrier=[],allLog=[]; let choiceCorrect=0,choiceTotal=0; const scoreErrors=[]; let missing=0;
  for(const id of eventIds){
    const r=receiptsByEvent.get(id),g=semanticGoldById.get(id)?.gold; if(!r||!g){missing++;continue}
    for(const [qid,q] of Object.entries(qset)){
      const j=r.normalized_judgments?.[qid]; if(!j){missing++;continue}
      if(q.type==='noul'){
        const y=g[qid]===true?1:0,p=Number(j.probability); if(!Number.isFinite(p)){missing++;continue}
        const b=(p-y)**2,ll=safeLogLoss(p,y); allBrier.push(b);allLog.push(ll);const z=noul[qid]??={brier:[],log_loss:[]};z.brier.push(b);z.log_loss.push(ll);noul[qid]=z;
      }else if(q.type==='choice'){
        choiceTotal++;if(j.selected===g[qid])choiceCorrect++;
      }else if(q.type==='score'){
        const e=Math.abs(Number(j.score)-Number(g[qid]));if(Number.isFinite(e))scoreErrors.push(e);else missing++;
      }
    }
  }
  const noulOut={};for(const [qid,z] of Object.entries(noul))noulOut[qid]={brier:mean(z.brier),log_loss:mean(z.log_loss),count:z.brier.length};
  return {events:eventIds.length,missing_judgments:missing,noul:{overall_brier:mean(allBrier),overall_log_loss:mean(allLog),by_question:noulOut},choice:{exact_accuracy:choiceTotal?choiceCorrect/choiceTotal:null,correct:choiceCorrect,total:choiceTotal},score:{mae:mean(scoreErrors),count:scoreErrors.length}};
}

function workMetrics(receiptsByEvent,eventIds,semanticGoldById,consequenceById,qset){
  const options=qset.work_response_class.options;const order=new Map(options.map((x,i)=>[x,i]));let exact=0,falseSafe=0,falseEsc=0,c4FalseSafe=0,missing=0;const byClass={},byFamily={};
  for(const id of eventIds){
    const r=receiptsByEvent.get(id),g=semanticGoldById.get(id)?.gold,con=consequenceById.get(id);if(!r||!g||!con){missing++;continue}
    const predicted=r.normalized_judgments?.work_response_class?.selected,required=g.work_response_class;const pi=order.get(predicted),gi=order.get(required);if(pi===undefined||gi===undefined){missing++;continue}
    const isExact=pi===gi,isSafe=pi<gi,isEsc=pi>gi;if(isExact)exact++;if(isSafe)falseSafe++;if(isEsc)falseEsc++;if(isSafe&&con.class==='C4_AUTHORITY_OR_SAFETY_CRITICAL')c4FalseSafe++;
    const c=byClass[con.class]??={events:0,exact:0,false_safe:0,false_escalation:0};c.events++;if(isExact)c.exact++;if(isSafe)c.false_safe++;if(isEsc)c.false_escalation++;byClass[con.class]=c;
  }
  for(const c of Object.values(byClass)){c.exact_accuracy=c.events?c.exact/c.events:null;c.false_safe_rate=c.events?c.false_safe/c.events:null;c.false_escalation_rate=c.events?c.false_escalation/c.events:null;}
  const n=eventIds.length-missing;
  return {events:eventIds.length,evaluable_events:n,missing,exact_accuracy:n?exact/n:null,exact,false_safe_rate:n?falseSafe/n:null,false_safe:falseSafe,false_escalation_rate:n?falseEsc/n:null,false_escalation:falseEsc,c4_false_safe_events:c4FalseSafe,by_consequence_class:byClass};
}

function aggregateUsageCost(receipts){
  const usageKeys=['input_tokens','output_tokens','total_tokens'];const usage={};for(const k of usageKeys){const vals=receipts.map(r=>Number(r.usage?.[k])).filter(Number.isFinite);usage[k]={present:vals.length,missing:receipts.length-vals.length,sum:vals.length?vals.reduce((a,b)=>a+b,0):null,mean:mean(vals)}}
  const costs=receipts.map(r=>Number(r.cost_usd)).filter(Number.isFinite);return{usage,cost_usd:{present:costs.length,missing:receipts.length-costs.length,sum:costs.length===receipts.length?costs.reduce((a,b)=>a+b,0):null}};
}

function pp(a,b){return (a===null||b===null)?null:(a-b)*100;}

async function main(){
  const issues=[];
  if(await exists(path.join(OUT_ROOT,'ANALYSIS_RESULT.json')))throw new Error('ANALYSIS_RESULT_ALREADY_EXISTS');
  await verifyFrozenGold(issues);

  const sourceBefore=await ledgerFingerprint(SOURCE_ROOT),r1Before=await ledgerFingerprint(R1_ROOT);
  const predIndexPath=path.join(SOURCE_ROOT,'RECEIPT_INDEX.json'),r1IndexPath=path.join(R1_ROOT,'RECEIPT_INDEX.json'),phaseVPath=path.join(R1_PHASE_V_ROOT,'PHASE_V_RESULT.json');
  check(shaBuf(await readFile(predIndexPath))===EXPECTED.predecessorIndex,'PREDECESSOR_INDEX_HASH',issues);
  check(shaBuf(await readFile(r1IndexPath))===EXPECTED.r1Index,'R1_INDEX_HASH',issues);
  check(shaBuf(await readFile(phaseVPath))===EXPECTED.r1PhaseVResult,'R1_PHASE_V_HASH',issues);
  const phaseV=await json(phaseVPath);check(phaseV.status==='PHASE_V_VERIFIED','R1_PHASE_V_STATUS',issues);check(phaseV.r1_runner_execution_manifest_sha256===EXPECTED.r1RunnerManifest,'R1_RUNNER_MANIFEST',issues);check(phaseV.issues?.length===0,'R1_PHASE_V_ISSUES',issues);

  const [qset,matrix,semanticGold,needGold,workGold,consequenceGold,knownNovel,freshness,attempts,acceptance,metricSpec,goldVerification]=await Promise.all([
    'question_set.json','provider_matrix.json','semantic_gold.json','need_gold.json','work_disposition_gold.json','consequence_class_gold.json','known_novel.json','freshness_gold.json','semantic_attempts.json','acceptance_gates.json','metric_spec.json','VERIFICATION_RESULT.json'
  ].map(n=>json(path.join(GOLD_ROOT,n))));
  check(matrix.length===240&&attempts.length===240,'SEMANTIC_DENOMINATOR',issues);

  const predIndex=await json(predIndexPath),r1Index=await json(r1IndexPath);check(predIndex.length===400,'PREDECESSOR_INDEX_COUNT',issues);check(r1Index.length===160,'R1_INDEX_COUNT',issues);
  const controlMap=new Map(),predecessorJevIds=[];
  for(const row of predIndex){
    const rp=path.join(SOURCE_ROOT,'receipts',row.provider,`${row.event_id}.json`),bytes=await readFile(rp);check(shaBuf(bytes)===row.receipt_sha256,`PREDECESSOR_RECEIPT_HASH:${row.provider}:${row.event_id}`,issues);const r=JSON.parse(bytes.toString('utf8'));
    if(row.provider==='luna')controlMap.set(row.event_id,r);else predecessorJevIds.push(row.event_id);
  }
  const r1Map=new Map();
  for(const row of r1Index){const rp=path.join(R1_ROOT,'receipts','jev',`${row.event_id}.json`),bytes=await readFile(rp);check(shaBuf(bytes)===row.receipt_sha256,`R1_RECEIPT_HASH:${row.event_id}`,issues);const r=JSON.parse(bytes.toString('utf8'));r1Map.set(row.event_id,r);}
  check(controlMap.size===240,'CONTROL_LUNA_COUNT',issues);check(r1Map.size===160,'R1_JEV_COUNT',issues);
  check([...r1Map.keys()].sort().join('|')===predecessorJevIds.sort().join('|'),'R1_EVENT_SET_MISMATCH',issues);

  const matrixById=new Map(matrix.map(x=>[x.event_id,x]));const semanticGoldById=new Map(semanticGold.map(x=>[x.event_id,x]));const consequenceById=new Map(consequenceGold.map(x=>[x.event_id,x]));const knownById=new Map(knownNovel.map(x=>[x.event_id,x]));const freshById=new Map(freshness.map(x=>[x.event_id,x]));const attemptById=new Map(attempts.map(x=>[x.event.event_id,x]));
  const ids=attempts.map(x=>x.event.event_id).sort();const candidateMap=new Map();let candidateLuna=0,candidateJev=0;
  for(const id of ids){const m=matrixById.get(id);const r=m?.candidate_provider==='JEV'?r1Map.get(id):controlMap.get(id);if(!r){issues.push(`MISSING_CANDIDATE_RECEIPT:${id}`);continue}candidateMap.set(id,r);if(m.candidate_provider==='JEV')candidateJev++;else candidateLuna++;}
  check(candidateLuna===80&&candidateJev===160,'CANDIDATE_PROVIDER_COUNTS',issues);

  let controlOk=0,candidateOk=0,stateChecks=0,stateMatches=0,crossTenant=0,staleApplications=0;
  for(const id of ids){const a=attemptById.get(id),cr=controlMap.get(id),rr=candidateMap.get(id),fg=freshById.get(id);if(cr?.status==='OK')controlOk++;if(rr?.status==='OK')candidateOk++;for(const r of [cr,rr]){if(!r)continue;stateChecks++;if(r.bound_state_sha256===a.state_sha256)stateMatches++;if(r.tenant_id!==a.event.tenant_id||r.load_id!==a.event.load_id)crossTenant++;if(fg?.status==='STALE_REJECTED_AT_FROZEN_COMPLETION'&&r.current_state_application!==false)staleApplications++;}}

  const controlSemantic=semanticMetrics(controlMap,ids,semanticGoldById,qset),candidateSemantic=semanticMetrics(candidateMap,ids,semanticGoldById,qset);
  const controlWork=workMetrics(controlMap,ids,semanticGoldById,consequenceById,qset),candidateWork=workMetrics(candidateMap,ids,semanticGoldById,consequenceById,qset);

  const controlReceipts=ids.map(id=>controlMap.get(id)),candidateReceipts=ids.map(id=>candidateMap.get(id));
  const econControl=aggregateUsageCost(controlReceipts),econCandidate=aggregateUsageCost(candidateReceipts);

  const knownIds=ids.filter(id=>knownById.get(id)?.status==='KNOWN'),novelIds=ids.filter(id=>knownById.get(id)?.status==='NOVEL'),freshIds=ids.filter(id=>freshById.get(id)?.status==='FRESH_AT_FROZEN_COMPLETION'),staleIds=ids.filter(id=>freshById.get(id)?.status==='STALE_REJECTED_AT_FROZEN_COMPLETION');
  const familyBreakdown={};for(const id of ids){const k=knownById.get(id);const f=k?.family??'UNKNOWN';(familyBreakdown[f]??=[]).push(id);}const byFamily={};for(const [f,eids] of Object.entries(familyBreakdown))byFamily[f]={status:knownById.get(eids[0])?.status,control_semantic:semanticMetrics(controlMap,eids,semanticGoldById,qset),candidate_semantic:semanticMetrics(candidateMap,eids,semanticGoldById,qset),control_work:workMetrics(controlMap,eids,semanticGoldById,consequenceById,qset),candidate_work:workMetrics(candidateMap,eids,semanticGoldById,consequenceById,qset)};

  const needDecisionRule={status:'NOT_EVALUABLE_MISSING_PRE_REGISTERED_DECISION_RULE',reason:'Frozen NEED_GOLD is binary and need_exists is a Noul probability, but frozen metric_spec/question_set/acceptance_gates contain no probability-to-binary threshold or gating rule. No post-receipt threshold is selected.'};

  const suppression=1-candidateLuna/240;
  const workDelta=pp(candidateWork.exact_accuracy,controlWork.exact_accuracy),falseSafeDelta=pp(candidateWork.false_safe_rate,controlWork.false_safe_rate);
  const gates={
    control_provider_executability:{required:acceptance.control_provider_executability,observed:controlOk/240,status:controlOk===240?'PASS':'BLOCK'},
    candidate_provider_executability:{required:acceptance.candidate_provider_executability,observed:candidateOk/240,status:candidateOk===240?'PASS':'BLOCK'},
    state_binding_integrity:{required:acceptance.state_binding_integrity,observed:stateChecks?stateMatches/stateChecks:null,status:stateMatches===stateChecks&&stateChecks===480?'PASS':'BLOCK'},
    cross_tenant_contamination:{required:acceptance.cross_tenant_contamination,observed:crossTenant,status:crossTenant===0?'PASS':'BLOCK'},
    stale_current_state_applications:{required:acceptance.stale_current_state_applications,observed:staleApplications,status:staleApplications===0?'PASS':'BLOCK'},
    candidate_luna_suppression:{required_min:acceptance.candidate_luna_suppression_min,observed:suppression,status:suppression>=acceptance.candidate_luna_suppression_min?'PASS':'BLOCK'},
    work_disposition_accuracy_delta_vs_control_pp:{required_min:acceptance.work_disposition_accuracy_delta_min_pp,observed:workDelta,status:workDelta>=acceptance.work_disposition_accuracy_delta_min_pp?'PASS':'BLOCK'},
    false_safe_rate_delta_vs_control_pp:{required_max:acceptance.false_safe_rate_delta_max_pp,observed:falseSafeDelta,status:falseSafeDelta<=acceptance.false_safe_rate_delta_max_pp?'PASS':'BLOCK'},
    need_recall_delta_vs_control_pp:{required_min:acceptance.need_recall_delta_min_pp,observed:null,status:'INCONCLUSIVE',reason:needDecisionRule.reason},
    c4_false_safe_events:{required_max:acceptance.c4_false_safe_events_max,observed:candidateWork.c4_false_safe_events,status:candidateWork.c4_false_safe_events<=acceptance.c4_false_safe_events_max?'PASS':'BLOCK'},
    authority_effects:{required:acceptance.authority_effects,observed:'NONE',status:'PASS'}
  };
  const blocked=Object.values(gates).some(g=>g.status==='BLOCK'),inconclusive=Object.values(gates).some(g=>g.status==='INCONCLUSIVE');
  const architectureVerdict=blocked?'BLOCK':inconclusive?'INCONCLUSIVE_MISSING_PRE_REGISTERED_NEED_DECISION_RULE':'PASS';

  const sourceAfter=await ledgerFingerprint(SOURCE_ROOT),r1After=await ledgerFingerprint(R1_ROOT);check(sourceBefore.sha256===sourceAfter.sha256,'SOURCE_LEDGER_MUTATED',issues);check(r1Before.sha256===r1After.sha256,'R1_LEDGER_MUTATED',issues);

  const result={
    run_id:RUN_ID,status:issues.length?'ANALYSIS_INTEGRITY_BLOCK':'WRITE_COMPLETE_UNVERIFIED',issues,
    architecture_verdict:issues.length?'INCONCLUSIVE_ANALYSIS_INTEGRITY':architectureVerdict,
    evidence:{predecessor_receipt_index_sha256:EXPECTED.predecessorIndex,r1_receipt_index_sha256:EXPECTED.r1Index,r1_phase_v_result_sha256:EXPECTED.r1PhaseVResult,question_set_sha256:EXPECTED.gold['question_set.json'],provider_matrix_sha256:EXPECTED.gold['provider_matrix.json'],semantic_gold_sha256:EXPECTED.gold['semantic_gold.json'],need_gold_sha256:EXPECTED.gold['need_gold.json'],work_disposition_gold_sha256:EXPECTED.gold['work_disposition_gold.json'],acceptance_gates_sha256:EXPECTED.gold['acceptance_gates.json'],metric_spec_sha256:EXPECTED.gold['metric_spec.json']},
    denominator:{semantic_events:240,control_luna:240,candidate_luna:80,candidate_jev:160,known:knownIds.length,novel:novelIds.length,fresh:freshIds.length,stale:staleIds.length,luna_suppression:suppression},
    semantic:{control:controlSemantic,candidate:candidateSemantic,known_candidate:semanticMetrics(candidateMap,knownIds,semanticGoldById,qset),novel_candidate:semanticMetrics(candidateMap,novelIds,semanticGoldById,qset),fresh_candidate:semanticMetrics(candidateMap,freshIds,semanticGoldById,qset),stale_candidate:semanticMetrics(candidateMap,staleIds,semanticGoldById,qset)},
    work:{control:controlWork,candidate:candidateWork,work_disposition_accuracy_delta_pp:workDelta,false_safe_rate_delta_pp:falseSafeDelta,need_precision_recall:needDecisionRule},
    economy:{control:{luna_calls:240,jev_calls:0,latency_ms:stats(controlReceipts.map(r=>r.latency_ms)),...econControl},candidate:{luna_calls:80,jev_calls:160,latency_ms:stats(candidateReceipts.map(r=>r.latency_ms)),...econCandidate},useful_correct_work_per_luna_call:{control:controlWork.exact/240,candidate:candidateWork.exact/80},useful_correct_work_per_inference_dollar:(econControl.cost_usd.sum!==null&&econCandidate.cost_usd.sum!==null&&econControl.cost_usd.sum>0&&econCandidate.cost_usd.sum>0)?{control:controlWork.exact/econControl.cost_usd.sum,candidate:candidateWork.exact/econCandidate.cost_usd.sum}:{status:'NOT_EVALUABLE_INCOMPLETE_PERSISTED_COST'}},
    gates,
    by_family:byFamily,
    source_integrity:{predecessor_before_sha256:sourceBefore.sha256,predecessor_after_sha256:sourceAfter.sha256,predecessor_unchanged:sourceBefore.sha256===sourceAfter.sha256,r1_before_sha256:r1Before.sha256,r1_after_sha256:r1After.sha256,r1_unchanged:r1Before.sha256===r1After.sha256},
    provider_calls:0,network_provider_calls:0,credentials_read:false,provider_replay:false,authority_effects:'NONE',live_effects:0,production_promotion:false
  };
  await mkdir(OUT_ROOT,{recursive:true});const text=JSON.stringify(result,null,2)+'\n';await writeFile(path.join(OUT_ROOT,'ANALYSIS_RESULT.json'),text,{flag:'wx'});const resultSha=shaText(text);const pointer={run_id:RUN_ID,analysis_result_sha256:resultSha,architecture_verdict:result.architecture_verdict,predecessor_receipt_index_sha256:EXPECTED.predecessorIndex,r1_receipt_index_sha256:EXPECTED.r1Index,provider_calls:0,authority_effects:'NONE'};await writeFile(path.join(OUT_ROOT,'FREEZE_POINTER.json'),JSON.stringify(pointer,null,2)+'\n',{flag:'wx'});
  console.log('NSS1_STAGE_F_R1_CONFIRMATORY_ANALYSIS_COMPLETE',JSON.stringify({...result,by_family:undefined,analysis_result_sha256:resultSha,freeze_pointer:pointer}));
  if(issues.length)process.exitCode=2;
}

await main();
