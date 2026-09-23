import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Zero-provider, read-only forensic attribution of Stage-F R1 C4 false-safe dispositions.
// Network must already be disabled by the host entry before this module is imported.
const GOLD_ROOT = process.env.STAGE_F_GOLD_ROOT ?? '/tmp/stage-f-verified-c4-forensic/stage-f-evidence';
const SOURCE_ROOT = process.env.STAGE_F_SOURCE_LEDGER_ROOT ?? '/data/nss1-stage-f-provider-v0.2';
const R1_ROOT = process.env.STAGE_F_R1_LEDGER_ROOT ?? '/data/nss1-stage-f-jev-remediation-r1-v0.1';
const TYPED_REPAIR_ROOT = process.env.STAGE_F_R1_TYPED_GATE_REPAIR_OUT ?? '/data/nss1-stage-f-r1-confirmatory-analysis-phase-v-typed-gate-repair-v0.1';
const OUT_ROOT = process.env.STAGE_F_R1_C4_FORENSIC_OUT ?? '/data/nss1-stage-f-r1-c4-false-safe-forensic-v0.1';
const RUN_ID = 'NSS1-STAGE-F-R1-C4-FALSE-SAFE-FORENSIC-v0.1';

const EXPECTED = Object.freeze({
  predecessorIndex: '2e50185fa5d4ee5c3f137ccfbb4283d5a8964e6e3d53288a29043ee8f9d207e7',
  r1Index: 'b47252de25cc86dc6bf94f4c52ac7f44f21faabb1db13a41801400b35944b900',
  phaseA: 'f9cf601755cf456c4c814a0ea7f7eb4435f66231cce32e94471e645d6505f70f',
  gold: {
    'question_set.json':'0e8c01c8d98e2fbbeb9f7b034ef638dcf11df0f9f2189834322830bb0b758bcb',
    'provider_matrix.json':'8135ad29cf2c13d0c433de6a4825d0395889d0c25ef6556e873048728bba9ff8',
    'semantic_gold.json':'72cadf0a6286c77630519ae505363d59cc0b78f07f5691afaba90bc11aff16ec',
    'semantic_attempts.json':'bd878169d903942d7e0d1cc45f6ac7941303896399486ccd7d02edfb691145f9',
    'consequence_class_gold.json':'4ade0ab7822d4f19d07e598d53f335a534577befbbf1417a8daf2b035562b07d',
    'known_novel.json':'7bc0a5665739b20cf0c240635fd2ce7eb9686f55af577336ed4e0fea213e7984',
    'freshness_gold.json':'c2c9c6b092e80c745b74493682f8934c1b6f10ba7bf90718066797f57ca11a31'
  }
});

const sha = b => createHash('sha256').update(b).digest('hex');
const json = async f => JSON.parse(await readFile(f,'utf8'));
const exists = async f => { try { await stat(f); return true; } catch { return false; } };
const check = (ok, code, issues) => { if (!ok) issues.push(code); };
const bump = (o,k,n=1) => { o[String(k ?? 'UNKNOWN')] = (o[String(k ?? 'UNKNOWN')] ?? 0) + n; };
const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
const q = (xs,p) => { if(!xs.length)return null; const a=[...xs].sort((a,b)=>a-b); return a[Math.max(0,Math.ceil(p*a.length)-1)]; };
const numStats = xs => { const a=xs.map(Number).filter(Number.isFinite); return {count:a.length,mean:mean(a),p25:q(a,.25),p50:q(a,.5),p75:q(a,.75),min:a.length?Math.min(...a):null,max:a.length?Math.max(...a):null}; };

async function ledgerFingerprint(root){
  const entries=[];
  for(const top of ['attempts','receipts','raw']){
    const d=path.join(root,top); if(!(await exists(d))) continue;
    for(const provider of (await readdir(d)).sort()){
      const pd=path.join(d,provider); let ds=[]; try{ds=await readdir(pd,{withFileTypes:true})}catch{}
      for(const ent of ds.sort((a,b)=>a.name.localeCompare(b.name))){ if(!ent.isFile())continue; const p=path.join(pd,ent.name),b=await readFile(p); entries.push({path:path.relative(root,p),sha256:sha(b),bytes:b.length}); }
    }
  }
  for(const n of ['RECEIPT_INDEX.json','PHASE_W_RESULT.json']){ const p=path.join(root,n); if(await exists(p)){const b=await readFile(p);entries.push({path:n,sha256:sha(b),bytes:b.length});} }
  entries.sort((a,b)=>a.path.localeCompare(b.path));
  return sha(Buffer.from(JSON.stringify(entries)));
}

function flattenScalars(value,prefix='event',out={}){
  if(value===null||value===undefined) return out;
  if(['string','number','boolean'].includes(typeof value)){out[prefix]=value;return out;}
  if(Array.isArray(value)){
    if(value.length<=8 && value.every(x=>x===null||['string','number','boolean'].includes(typeof x))) out[prefix]=value.join('|');
    return out;
  }
  if(typeof value==='object') for(const k of Object.keys(value).sort()) flattenScalars(value[k],`${prefix}.${k}`,out);
  return out;
}

function familyFor(id,knownById,attemptById){
  const k=knownById.get(id),e=attemptById.get(id)?.event ?? {};
  return k?.family ?? e.family ?? e.event_family ?? e.event_type ?? e.type ?? 'UNKNOWN';
}

function probability(receipt,id){
  const p=Number(receipt?.normalized_judgments?.[id]?.probability);
  return Number.isFinite(p)?p:null;
}

function featureTokens(record){
  const tokens=[];
  for(const [k,v] of Object.entries(record.scalar_event_features ?? {})){
    const s=String(v);
    if(/(^|\.)(event_id|tenant_id|load_id|attempt_id|receipt_id|nonce|sha256|hash)$/i.test(k)) continue;
    if(s.length>120) continue;
    tokens.push(`${k}=${s}`);
  }
  return [...new Set(tokens)];
}

function enrichment(falseSafe,correct){
  const fs=new Map(),ok=new Map();
  for(const r of falseSafe) for(const t of featureTokens(r)) fs.set(t,(fs.get(t)??0)+1);
  for(const r of correct) for(const t of featureTokens(r)) ok.set(t,(ok.get(t)??0)+1);
  const rows=[];
  for(const t of new Set([...fs.keys(),...ok.keys()])){
    const a=fs.get(t)??0,b=ok.get(t)??0,total=a+b;if(total<3||a===0)continue;
    rows.push({feature:t,false_safe_support:a,correct_c4_support:b,total_support:total,false_safe_precision:a/total,false_safe_recall:a/falseSafe.length,provenance:'PRE_DISPOSITION_OBSERVABLE_FEATURE'});
  }
  rows.sort((x,y)=>y.false_safe_precision-x.false_safe_precision||y.false_safe_support-x.false_safe_support||x.feature.localeCompare(y.feature));
  return {descriptive_feature_enrichment:rows,candidate_guard_surfaces:rows.filter(x=>x.false_safe_support>=3&&x.false_safe_precision>=0.8)};
}

if(await exists(OUT_ROOT)) throw new Error('C4_FORENSIC_OUTPUT_ALREADY_EXISTS_FAIL_CLOSED');
const issues=[];
const typedPath=path.join(TYPED_REPAIR_ROOT,'TYPED_GATE_REPAIR_RESULT.json');
check(await exists(typedPath),'TYPED_GATE_REPAIR_RESULT_MISSING',issues);
if(await exists(typedPath)){
  const t=await json(typedPath);
  check(t.status==='PHASE_V_VERIFIED_AFTER_TYPED_GATE_COMPARATOR_REPAIR','TYPED_GATE_REPAIR_NOT_VERIFIED',issues);
  check(t.phase_a_result_sha256===EXPECTED.phaseA,'TYPED_GATE_PHASE_A_IDENTITY',issues);
  check(t.architecture_verdict==='BLOCK','TYPED_GATE_ARCHITECTURE_VERDICT',issues);
  check(t.c4_false_safe_events===23&&t.c4_gate_status==='BLOCK','TYPED_GATE_C4_RESULT',issues);
  check(t.need_recall_gate_status==='INCONCLUSIVE'&&t.need_pre_registered_threshold_present===false,'TYPED_GATE_NEED_RESULT',issues);
  check(t.provider_calls===0&&t.credentials_read===false&&t.provider_replay===false&&t.authority_effects==='NONE','TYPED_GATE_EFFECT_BOUNDARY',issues);
}

for(const [name,expected] of Object.entries(EXPECTED.gold)){
  const p=path.join(GOLD_ROOT,name);check(await exists(p),`GOLD_MISSING:${name}`,issues);if(await exists(p))check(sha(await readFile(p))===expected,`GOLD_HASH:${name}`,issues);
}

const sourceBefore=await ledgerFingerprint(SOURCE_ROOT),r1Before=await ledgerFingerprint(R1_ROOT);
const predIndexPath=path.join(SOURCE_ROOT,'RECEIPT_INDEX.json'),r1IndexPath=path.join(R1_ROOT,'RECEIPT_INDEX.json');
check(await exists(predIndexPath),'PREDECESSOR_INDEX_MISSING',issues);check(await exists(r1IndexPath),'R1_INDEX_MISSING',issues);
if(await exists(predIndexPath))check(sha(await readFile(predIndexPath))===EXPECTED.predecessorIndex,'PREDECESSOR_INDEX_HASH',issues);
if(await exists(r1IndexPath))check(sha(await readFile(r1IndexPath))===EXPECTED.r1Index,'R1_INDEX_HASH',issues);

const [qset,matrix,semanticGold,attempts,consequence,known,fresh,predIndex,r1Index]=await Promise.all([
  'question_set.json','provider_matrix.json','semantic_gold.json','semantic_attempts.json','consequence_class_gold.json','known_novel.json','freshness_gold.json'
].map(n=>json(path.join(GOLD_ROOT,n))).concat([json(predIndexPath),json(r1IndexPath)]));
check(attempts.length===240&&matrix.length===240,'SEMANTIC_COUNT',issues);check(predIndex.length===400,'PREDECESSOR_COUNT',issues);check(r1Index.length===160,'R1_COUNT',issues);

const control=new Map(),predecessorJevIds=[];
for(const row of predIndex){
  const p=path.join(SOURCE_ROOT,'receipts',row.provider,`${row.event_id}.json`),b=await readFile(p);check(sha(b)===row.receipt_sha256,`PREDECESSOR_RECEIPT_HASH:${row.provider}:${row.event_id}`,issues);const r=JSON.parse(b);if(row.provider==='luna')control.set(row.event_id,r);else predecessorJevIds.push(row.event_id);
}
const r1=new Map();
for(const row of r1Index){const p=path.join(R1_ROOT,'receipts','jev',`${row.event_id}.json`),b=await readFile(p);check(sha(b)===row.receipt_sha256,`R1_RECEIPT_HASH:${row.event_id}`,issues);r1.set(row.event_id,JSON.parse(b));}
check(control.size===240,'CONTROL_COUNT',issues);check(r1.size===160,'R1_RECEIPT_COUNT',issues);check([...r1.keys()].sort().join('|')===predecessorJevIds.sort().join('|'),'R1_EVENT_SET',issues);

const matrixById=new Map(matrix.map(x=>[x.event_id,x])),goldById=new Map(semanticGold.map(x=>[x.event_id,x])),attemptById=new Map(attempts.map(x=>[x.event.event_id,x])),consequenceById=new Map(consequence.map(x=>[x.event_id,x])),knownById=new Map(known.map(x=>[x.event_id,x])),freshById=new Map(fresh.map(x=>[x.event_id,x]));
const ids=attempts.map(x=>x.event.event_id).sort(),candidate=new Map();let candidateJev=0,candidateLuna=0;
for(const id of ids){const m=matrixById.get(id);const r=m?.candidate_provider==='JEV'?r1.get(id):control.get(id);if(!r){issues.push(`MISSING_CANDIDATE:${id}`);continue}candidate.set(id,r);if(m.candidate_provider==='JEV')candidateJev++;else candidateLuna++;}
check(candidateJev===160&&candidateLuna===80,'CANDIDATE_PROVIDER_COUNTS',issues);

const order=new Map(qset.work_response_class.options.map((x,i)=>[x,i]));
const c4Ids=ids.filter(id=>consequenceById.get(id)?.class==='C4_AUTHORITY_OR_SAFETY_CRITICAL');
const falseSafe=[],correct=[];
for(const id of c4Ids){
  const r=candidate.get(id),g=goldById.get(id)?.gold,a=attemptById.get(id);if(!r||!g||!a){issues.push(`C4_MISSING:${id}`);continue}
  const predicted=r.normalized_judgments?.work_response_class?.selected,required=g.work_response_class,pi=order.get(predicted),gi=order.get(required);if(pi===undefined||gi===undefined){issues.push(`C4_WORK_CLASS_MISSING:${id}`);continue}
  const rec={
    event_id:id,
    candidate_provider:matrixById.get(id)?.candidate_provider ?? null,
    receipt_provider:r.provider ?? null,
    requested_model:r.requested_model ?? null,
    effective_model:r.effective_model ?? r.model ?? null,
    family:familyFor(id,knownById,attemptById),
    predicted_work_response_class:predicted,
    gold_work_response_class:required,
    predicted_ordinal:pi,
    gold_ordinal:gi,
    safety_gap:gi-pi,
    external_authority_required_probability:probability(r,'external_authority_required'),
    material_change_probability:probability(r,'material_change'),
    need_exists_probability:probability(r,'need_exists'),
    relevance_probability:probability(r,'relevance'),
    known_novel_status:knownById.get(id)?.status ?? null,
    freshness_status:freshById.get(id)?.status ?? null,
    bound_state_sha256:r.bound_state_sha256 ?? null,
    expected_state_sha256:a.state_sha256 ?? null,
    state_binding_match:r.bound_state_sha256===a.state_sha256,
    scalar_event_features:flattenScalars(a.event)
  };
  if(pi<gi) falseSafe.push(rec); else if(pi===gi) correct.push(rec); else issues.push(`C4_FALSE_ESCALATION_UNEXPECTED:${id}`);
}
check(c4Ids.length===48,`C4_COUNT:${c4Ids.length}`,issues);check(falseSafe.length===23,`C4_FALSE_SAFE_COUNT:${falseSafe.length}`,issues);check(correct.length===25,`C4_CORRECT_COUNT:${correct.length}`,issues);

const byFamily={},byPredicted={},byKnown={},byFresh={},byGap={};
for(const r of falseSafe){bump(byFamily,r.family);bump(byPredicted,r.predicted_work_response_class);bump(byKnown,r.known_novel_status);bump(byFresh,r.freshness_status);bump(byGap,r.safety_gap);}
const authorityFalseSafe=falseSafe.map(r=>r.external_authority_required_probability),authorityCorrect=correct.map(r=>r.external_authority_required_probability);
const thresholds=[0.25,0.5,0.75].map(threshold=>({
  threshold,
  false_safe_at_or_above:falseSafe.filter(r=>Number.isFinite(r.external_authority_required_probability)&&r.external_authority_required_probability>=threshold).length,
  correct_at_or_above:correct.filter(r=>Number.isFinite(r.external_authority_required_probability)&&r.external_authority_required_probability>=threshold).length,
  provenance:'POST_RESPONSE_FEATURE_DIAGNOSTIC_ONLY_NOT_A_SELECTED_DECISION_RULE'
}));
const featureAnalysis=enrichment(falseSafe,correct);

const sourceAfter=await ledgerFingerprint(SOURCE_ROOT),r1After=await ledgerFingerprint(R1_ROOT);check(sourceBefore===sourceAfter,'SOURCE_LEDGER_MUTATION',issues);check(r1Before===r1After,'R1_LEDGER_MUTATION',issues);
const result={
  run_id:RUN_ID,
  status:issues.length?'FORENSIC_BLOCK_SOURCE_INTEGRITY':'FORENSIC_WRITE_COMPLETE_UNVERIFIED',
  issues,
  controlling_architecture_verdict:'BLOCK',
  denominator:{semantic_events:240,candidate_jev:160,candidate_luna:80,c4_events:c4Ids.length,c4_false_safe:falseSafe.length,c4_correct:correct.length},
  false_safe_event_ids:falseSafe.map(x=>x.event_id).sort(),
  correct_c4_event_ids:correct.map(x=>x.event_id).sort(),
  attribution:{by_family:byFamily,by_predicted_work_response:byPredicted,by_known_novel:byKnown,by_freshness:byFresh,by_safety_gap:byGap,external_authority_probability:{false_safe:numStats(authorityFalseSafe),correct_c4:numStats(authorityCorrect)},post_response_threshold_diagnostics:thresholds,...featureAnalysis},
  provenance_rules:{gold_only_feature:'PROHIBITED_AS_GUARD',post_response_feature:'DIAGNOSTIC_OR_POST_RESPONSE_ESCALATION_ONLY',pre_disposition_observable_feature:'ELIGIBLE_FOR_FRESH_SUCCESSOR_PREREGISTRATION_ONLY_AFTER_REVIEW',unresolved_feature_provenance:'PROHIBITED_AS_GUARD'},
  source_integrity:{predecessor_before_sha256:sourceBefore,predecessor_after_sha256:sourceAfter,predecessor_unchanged:sourceBefore===sourceAfter,r1_before_sha256:r1Before,r1_after_sha256:r1After,r1_unchanged:r1Before===r1After},
  provider_calls:0,jev_calls:0,luna_calls:0,openrouter_calls:0,frontier_calls:0,credentials_read:false,provider_replay:false,authority_effects:'NONE',live_effects:0,production_promotion:false
};
await mkdir(OUT_ROOT,{recursive:false});
const eventsPath=path.join(OUT_ROOT,'C4_FALSE_SAFE_EVENTS.json'),resultPath=path.join(OUT_ROOT,'C4_FALSE_SAFE_FORENSIC_RESULT.json');
await writeFile(eventsPath,JSON.stringify({false_safe:falseSafe,false_safe_count:falseSafe.length,correct_c4:correct,correct_c4_count:correct.length},null,2)+'\n',{flag:'wx'});
await writeFile(resultPath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log('NSS1_STAGE_F_R1_C4_FALSE_SAFE_FORENSIC',JSON.stringify({...result,false_safe_event_ids:undefined,correct_c4_event_ids:undefined,result_sha256:sha(await readFile(resultPath)),events_sha256:sha(await readFile(eventsPath))}));
if(issues.length)process.exitCode=2;
