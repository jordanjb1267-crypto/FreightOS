import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Independent zero-provider verifier. Imports neither the analysis implementation nor the authority-floor implementation.
globalThis.fetch = async () => { throw new Error('C4_FRESH_PHASE_V_NETWORK_PROHIBITED'); };

const HELDOUT_ROOT = process.env.C4_STRUCTURAL_FLOOR_HELDOUT_ROOT ?? '/data/nss-c4-structural-authority-floor-heldout-v0.1';
const EXEC_ROOT = process.env.C4_STRUCTURAL_FLOOR_JEV_ROOT ?? '/data/nss-c4-structural-authority-floor-jev-v0.1';
const ANALYSIS_ROOT = process.env.C4_STRUCTURAL_FLOOR_ANALYSIS_ROOT ?? '/data/nss-c4-structural-authority-floor-analysis-v0.1';
const OUT_ROOT = process.env.C4_STRUCTURAL_FLOOR_PHASE_V_ROOT ?? '/data/nss-c4-structural-authority-floor-phase-v-v0.1';
const RUN_ID = 'NSS1-C4-STRUCTURAL-AUTHORITY-FLOOR-FRESH-PHASE-V-v0.1';
const AUTHORITY = 'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED';
const EXPECTED = Object.freeze({
  heldout:'737593c111c5fc856be0b3bc5f86312549b1d998961125b9c7fa50a38f6ead80',
  phaseW:'efef5bbbf09fd74a627977d5e42800825ed5ae23e98ef04aec7a2d966e78e219',
  receiptIndex:'7321ac99a73457a059461a3c0e6cc19d44a250eb0bc1cb146e1d652de276ece8',
  requestManifest:'0bbeda95a321a1e396a316ced47a3631cddeb25479e55e7b4534618332568ed7',
  denominator:96
});

const sha = b => createHash('sha256').update(b).digest('hex');
const stable = v => Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k)=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v);
const shaStable = v => sha(Buffer.from(stable(v)));
const exists = async f => { try { await stat(f); return true; } catch { return false; } };
const check=(issues,ok,code)=>{if(!ok)issues.push(code)};

async function treeFingerprint(root){const rows=[];async function walk(d){for(const e of (await readdir(d,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(d,e.name);if(e.isDirectory())await walk(p);else if(e.isFile()){const b=await readFile(p);rows.push({path:path.relative(root,p),sha256:sha(b),bytes:b.length});}}}await walk(root);return sha(Buffer.from(stable(rows)));}
function floor(pre,event){const p=event?.patch??{};if(p.seal_status==='DISCREPANCY'&&pre?.seal_status!=='DISCREPANCY')return AUTHORITY;if(p.receiver_identity_status==='CONFLICT'&&pre?.receiver_identity_status!=='CONFLICT')return AUTHORITY;if(Object.prototype.hasOwnProperty.call(p,'factor_assignment')&&pre?.factor_assignment!=null&&p.factor_assignment!=null&&p.factor_assignment!==pre.factor_assignment)return AUTHORITY;return null;}

if(await exists(OUT_ROOT)) throw new Error('PHASE_V_ROOT_ALREADY_EXISTS_FAIL_CLOSED');
const issues=[];
const analysisPath=path.join(ANALYSIS_ROOT,'ANALYSIS_RESULT.json');
check(issues,await exists(analysisPath),'ANALYSIS_RESULT_MISSING');
const [analysisBytes,heldoutBytes,phaseWBytes,idxBytes]=await Promise.all([
  readFile(analysisPath),readFile(path.join(HELDOUT_ROOT,'HELDOUT_EVENTS.json')),readFile(path.join(EXEC_ROOT,'PHASE_W_RESULT.json')),readFile(path.join(EXEC_ROOT,'RECEIPT_INDEX.json'))
]);
check(issues,sha(heldoutBytes)===EXPECTED.heldout,'HELDOUT_HASH');
check(issues,sha(phaseWBytes)===EXPECTED.phaseW,'PHASE_W_HASH');
check(issues,sha(idxBytes)===EXPECTED.receiptIndex,'RECEIPT_INDEX_HASH');
const analysis=JSON.parse(analysisBytes),heldout=JSON.parse(heldoutBytes),phaseW=JSON.parse(phaseWBytes),idx=JSON.parse(idxBytes);
check(issues,analysis.status==='WRITE_COMPLETE_UNVERIFIED','ANALYSIS_STATUS');
check(issues,Array.isArray(analysis.issues)&&analysis.issues.length===0,'ANALYSIS_ISSUES');
check(issues,heldout.length===96&&idx.length===96,'DENOMINATOR');
check(issues,phaseW.terminal_receipts===96&&phaseW.ok_receipts===95&&phaseW.non_ok_receipts===1&&phaseW.orchestration_uncertain===0,'PHASE_W_ACCOUNTING');
check(issues,phaseW.new_provider_calls===96&&phaseW.request_manifest_sha256===EXPECTED.requestManifest,'PHASE_W_CALL_BINDING');
check(issues,phaseW.stage_f_provider_replay===false&&phaseW.authority_effects==='NONE'&&phaseW.live_effects===0,'PHASE_W_EFFECT_BOUNDARY');

const heldoutBefore=await treeFingerprint(HELDOUT_ROOT),execBefore=await treeFingerprint(EXEC_ROOT);
const byId=new Map(heldout.map(x=>[x.input.event.event_id,x]));
let positives=0,negatives=0,guardMismatch=0,stateMatch=0,crossTenant=0,staleApps=0,ok=0,nonOk=0,posOk=0,negOk=0;
let baselinePosFalseSafe=0,baselineNegAuthority=0,structuralPosFalseSafe=0,guardFalseEsc=0,structuralEvaluable=0;
const nonOkEvents=[];
for(const row of heldout){const pos=row.expected?.structural_positive===true;pos?positives++:negatives++;if((floor(row.input.pre_state,row.input.event)===AUTHORITY)!==pos)guardMismatch++;}
for(const ix of idx){const row=byId.get(ix.event_id);check(issues,!!row,`UNKNOWN_EVENT:${ix.event_id}`);if(!row)continue;const rb=await readFile(path.join(EXEC_ROOT,'receipts','jev',`${ix.event_id}.json`));check(issues,sha(rb)===ix.receipt_sha256,`RECEIPT_HASH:${ix.event_id}`);const r=JSON.parse(rb);const stateSha=shaStable(row.input.pre_state);if(r.bound_pre_state_sha256===stateSha)stateMatch++;if(r.tenant_id!==row.input.event.tenant_id||r.load_id!==row.input.event.load_id)crossTenant++;if(row.input.planned_freshness==='STALE'&&r.current_state_application!==false)staleApps++;
  const pos=row.expected.structural_positive===true,guard=floor(row.input.pre_state,row.input.event)===AUTHORITY;
  if(r.status==='OK'){ok++;pos?posOk++:negOk++;}else{nonOk++;nonOkEvents.push({event_id:ix.event_id,status:r.status,error:r.error??null,structural_positive:pos,kind:row.expected.kind});}
  const baseline=r.status==='OK'?r.normalized_judgments?.work_response_class?.selected??null:null;
  if(pos&&baseline&&baseline!==AUTHORITY)baselinePosFalseSafe++;if(!pos&&baseline===AUTHORITY)baselineNegAuthority++;
  const finalResponse=guard?AUTHORITY:baseline;if(finalResponse)structuralEvaluable++;if(pos&&finalResponse!==AUTHORITY)structuralPosFalseSafe++;if(!pos&&guard)guardFalseEsc++;
}
const heldoutAfter=await treeFingerprint(HELDOUT_ROOT),execAfter=await treeFingerprint(EXEC_ROOT);
check(issues,heldoutBefore===heldoutAfter,'HELDOUT_MUTATION');check(issues,execBefore===execAfter,'EXECUTION_MUTATION');
check(issues,positives===48&&negatives===48&&guardMismatch===0,'GUARD_COUNTS');check(issues,stateMatch===96,'STATE_BINDING');check(issues,crossTenant===0,'CROSS_TENANT');check(issues,staleApps===0,'STALE_APPLICATION');check(issues,ok===95&&nonOk===1,'PROVIDER_COUNTS');

const recomputed={
  verdict:(structuralPosFalseSafe||guardFalseEsc||stateMatch!==96||crossTenant||staleApps)?'BLOCK':'PASS_STRUCTURAL_FLOOR_WITH_RESIDUAL_PROVIDER_COMPLETENESS_REFINEMENT',
  denominator:{total:96,structural_positive:positives,structural_negative:negatives,provider_ok:ok,provider_non_ok:nonOk,positive_provider_ok:posOk,negative_provider_ok:negOk,structural_final_evaluable:structuralEvaluable},
  non_ok_events:nonOkEvents,
  baseline_positive_false_safe:baselinePosFalseSafe,
  baseline_negative_authority:baselineNegAuthority,
  structural_positive_false_safe:structuralPosFalseSafe,
  structural_negative_guard_escalations:guardFalseEsc,
  state_binding:stateMatch,
  cross_tenant:crossTenant,
  stale_apps:staleApps
};
check(issues,analysis.verdict===recomputed.verdict,`VERDICT:${analysis.verdict}:${recomputed.verdict}`);
for(const k of Object.keys(recomputed.denominator))check(issues,analysis.denominator?.[k]===recomputed.denominator[k],`DENOM:${k}`);
check(issues,stable(analysis.provider_execution?.non_ok_events??[])===stable(nonOkEvents),'NON_OK_EVENT_SET');
check(issues,analysis.baseline_system_one?.structural_positive_false_safe_events_on_ok_receipts===baselinePosFalseSafe,'BASELINE_POS_FALSE_SAFE');
check(issues,analysis.baseline_system_one?.structural_negative_authority_responses_on_ok_receipts===baselineNegAuthority,'BASELINE_NEG_AUTHORITY');
check(issues,analysis.structural_floor_plus_system_one?.structural_positive_false_safe_events===structuralPosFalseSafe,'STRUCTURAL_POS_FALSE_SAFE');
check(issues,analysis.structural_floor_plus_system_one?.structural_negative_false_authority_escalations_caused_by_guard===guardFalseEsc,'STRUCTURAL_NEG_GUARD_ESCALATION');
check(issues,analysis.gates?.structural_positive_false_safe_events?.status===(structuralPosFalseSafe===0?'PASS':'BLOCK'),'GATE_STRUCTURAL_POS');
check(issues,analysis.gates?.structural_negative_false_authority_escalations_caused_by_guard?.status===(guardFalseEsc===0?'PASS':'BLOCK'),'GATE_STRUCTURAL_NEG');
check(issues,analysis.gates?.deterministic_guard_conformance?.status===(guardMismatch===0?'PASS':'BLOCK'),'GATE_GUARD');
check(issues,analysis.gates?.state_binding_integrity?.status===(stateMatch===96?'PASS':'BLOCK'),'GATE_STATE_BINDING');
check(issues,analysis.gates?.cross_tenant_contamination?.status===(crossTenant===0?'PASS':'BLOCK'),'GATE_CROSS_TENANT');
check(issues,analysis.gates?.stale_current_state_applications?.status===(staleApps===0?'PASS':'BLOCK'),'GATE_STALE');
check(issues,analysis.provider_calls===0&&analysis.jev_calls===0&&analysis.luna_calls===0&&analysis.openrouter_calls===0&&analysis.frontier_calls===0,'ANALYSIS_PROVIDER_CALLS');
check(issues,analysis.provider_replay===false&&analysis.credentials_read===false&&analysis.authority_effects==='NONE'&&analysis.live_effects===0&&analysis.production_promotion===false,'ANALYSIS_EFFECT_BOUNDARY');

const result={run_id:RUN_ID,status:issues.length?'PHASE_V_BLOCKED':'PHASE_V_VERIFIED',issues,analysis_result_sha256:sha(analysisBytes),verdict:recomputed.verdict,denominator:recomputed.denominator,provider_execution:{completeness:ok/96,non_ok_events:nonOkEvents,orchestration_uncertain:0},baseline_system_one:{structural_positive_false_safe_events_on_ok_receipts:baselinePosFalseSafe,structural_negative_authority_responses_on_ok_receipts:baselineNegAuthority},structural_floor_plus_system_one:{structural_positive_false_safe_events:structuralPosFalseSafe,structural_negative_false_authority_escalations_caused_by_guard:guardFalseEsc},source_integrity:{heldout_unchanged:heldoutBefore===heldoutAfter,execution_unchanged:execBefore===execAfter},provider_calls:0,jev_calls:0,luna_calls:0,openrouter_calls:0,frontier_calls:0,provider_replay:false,credentials_read:false,authority_effects:'NONE',live_effects:0,production_promotion:false};
await mkdir(OUT_ROOT,{recursive:false});const text=stable(result);await writeFile(path.join(OUT_ROOT,'PHASE_V_RESULT.json'),text,{flag:'wx'});console.log('NSS1_C4_STRUCTURAL_FLOOR_FRESH_PHASE_V',JSON.stringify({...result,phase_v_result_sha256:sha(Buffer.from(text))}));if(issues.length)process.exitCode=2;
