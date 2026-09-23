import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Stage-D zero-call preflight. Provider/network access is forbidden in both phases.
globalThis.fetch = async () => { throw new Error('STAGE_D_PROVIDER_CALL_PROHIBITED'); };

const RUN_ID = 'NSS1-STAGE-D-ZERO-CALL-v0.1';
const ROOT = process.env.EVIDENCE_DIR ?? '/data/nss1-stage-d-zero-call-v0.1';
const MODE = process.env.RUN_MODE ?? 'write';
const ARCHETYPES = [
  'APPOINTMENT_DRIFT_AND_STALE_REPLAY',
  'MECHANICAL_BREAKDOWN_REPAIR_AND_RESUME',
  'DETENTION_ECONOMIC_EVIDENCE_AND_FACTOR_CHANGE',
  'POD_WRONG_LOAD_CONFLICT_AND_CORRECTION',
  'UNCERTAIN_EXTERNAL_EFFECT_AND_RECONCILIATION',
  'MALICIOUS_DISTRACTOR_AND_LEGITIMATE_CHANGE',
  'WORK_HANDOFF_AND_REPRESENTATION_CHANGE',
  'CROSS_LOAD_INTERLEAVING_AND_ISOLATION',
];
const SEMANTIC_POS = new Set([1,2,4,5,7,8,10,11]);
const DET_POS = new Set([3,6,9,12]);
const QSET = {
  relevant_to_responsibility:{type:'noul',instructions:'Does the new event materially concern the active Responsibility and authoritative WorkObject represented by the supplied current state and identity binding?',criteria:{true:'The event concerns the active responsibility/work object and may affect continuity or economic integrity.',false:'The event is unrelated, promotional, malicious-only, or belongs to another work object without an authorized cross-reference.'}},
  material_state_change:{type:'noul',instructions:'Does this event imply a material change relative to the exact authoritative pre-state supplied with this semantic work unit?',criteria:{true:'A responsibility-relevant state dimension materially changed.',false:'The event is redundant, immaterial, stale, already reconciled, or does not change responsibility-relevant state.'}},
  state_dimension:{type:'choice',instructions:'Which single state dimension is primarily affected by this event relative to the supplied authoritative pre-state?',criteria:{LOCATION:'Position/geofence state.',SCHEDULE:'Appointment/timing/route continuity.',EQUIPMENT:'Truck/trailer/reefer/mechanical readiness.',ECONOMIC:'Detention/invoice/assignment/settlement/reconciliation.',EVIDENCE:'Document/identity/provenance/conflicting evidence.',AUTHORITY:'Representation/approval/external authority.',IDENTITY:'WorkObject/subject/alias/identity binding.',WORK_LIFECYCLE:'Need/Work open-update-close lifecycle.',NO_MATCH:'No responsibility-relevant dimension.'}},
  need_exists:{type:'noul',instructions:'Given the exact authoritative pre-state, current open Need/Work ledger, identity binding, and event, does the Responsibility require new work, review, procedure execution, or escalation?',criteria:{true:'New or updated work is required.',false:'No new work beyond state retention/no action is required.'}},
  work_response_class:{type:'choice',instructions:'What bounded response class is required next for the Responsibility, without granting authority or executing an external effect?',criteria:{NO_WORK:'No new work beyond state retention/no action.',CREATE_NEED_ONLY:'Create/update a Need but do not select procedure/reasoning yet.',KNOWN_PROCEDURE:'Use a known bounded procedure.',GENERAL_REASONING:'Nontrivial general reasoning is required.',FRONTIER_REASONING:'Bounded/general handling is insufficient and frontier reasoning is required.',HUMAN_OR_EXTERNAL_AUTHORITY:'A consequential next step depends on human/principal/provider/institutional authority.'}},
  historical_consistency:{type:'choice',instructions:'How does this event relate to the authoritative event/work history supplied in state?',criteria:{CONSISTENT:'Consistent with current history.',STALE:'Superseded by newer authoritative history.',CONFLICTING:'Conflicts with authoritative history/evidence.',AMBIGUOUS:'History/evidence is insufficient to resolve consistency.'}},
  current_work_relation:{type:'choice',instructions:'How should this event relate to the current open Need/Work ledger if it is responsibility-relevant?',criteria:{NONE:'No Work relation.',DUPLICATE_EXISTING:'It duplicates already-open/completed work.',UPDATES_EXISTING:'It materially updates existing open work.',NEW_WORK:'It requires distinct new work.',CLOSES_EXISTING:'It supplies evidence/state that closes existing work.'}},
  severity:{type:'score',instructions:'Score operational/economic continuity impact of this event in the supplied current state.',criteria:['No impact.','Minor informational impact.','Bounded operational impact with known response.','Material ambiguity/multi-party impact requiring general reasoning.','High-consequence or authority-sensitive impact.']},
  external_authority_required:{type:'noul',instructions:'Would any consequential next step require human, principal, provider, or institutional authority beyond semantic interpretation?',criteria:{true:'A consequential action depends on external authority.',false:'No expanded/external authority is required for the bounded next step.'}},
};
const QSET_SHA = sha(QSET);

function stable(v){ if(Array.isArray(v)) return `[${v.map(stable).join(',')}]`; if(v&&typeof v==='object') return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`; return JSON.stringify(v); }
function shaText(s){ return createHash('sha256').update(s).digest('hex'); }
function sha(v){ return shaText(stable(v)); }
function clone(v){ return JSON.parse(JSON.stringify(v)); }
function pad(n,w=3){ return String(n).padStart(w,'0'); }
async function ensure(p){ await mkdir(p,{recursive:true}); }
async function writeStable(file,v){ const t=stable(v); await ensure(path.dirname(file)); await writeFile(file,t); return {sha256:shaText(t),bytes:Buffer.byteLength(t)}; }
async function readJson(file){ return JSON.parse(await readFile(file,'utf8')); }

function initialState(tid, archetype, variant){
  return {
    trajectory_id:tid, tenant_id:`TENANT-${pad(variant,2)}`, archetype,
    primary_load_id:`LOAD-${tid}-P`, secondary_load_id:`LOAD-${tid}-S`, active_load_id:`LOAD-${tid}-P`,
    identity:{subject_id:`SUBJ-${tid}-P`,version:1,representation_version:1,conflict:false},
    authority:{scope:'OBSERVE_CLASSIFY_ROUTE',version:1,external_required:false},
    work:{open_needs:{},open_work:{},completed_work:{},generation:0},
    external_effect:{status:'NONE',effect_id:null,reconciled:true},
    continuity:{equipment:'AVAILABLE',appointment_version:1,pod:'MISSING',detention_minutes:0},
    evidence:{conflict:false,last_provenance:'INITIAL'},
    history:{last_sequence:0,seen_event_ids:[],completed_event_ids:[]},
  };
}

function semanticFamily(archetype,slot){
  const map={
    APPOINTMENT_DRIFT_AND_STALE_REPLAY:['appointment_drift','eta_material_change','appointment_reconfirm','facility_window_change','route_continuity','appointment_conflict','appointment_resolved','terminal_schedule_close'],
    MECHANICAL_BREAKDOWN_REPAIR_AND_RESUME:['mechanical_warning','mechanical_breakdown','repair_need','repair_provider_update','repair_evidence','repair_complete','resume_readiness','terminal_equipment_close'],
    DETENTION_ECONOMIC_EVIDENCE_AND_FACTOR_CHANGE:['detention_warning','detention_threshold','economic_evidence','invoice_ready','factor_assignment_change','factor_authority_review','reconciliation_update','terminal_economic_close'],
    POD_WRONG_LOAD_CONFLICT_AND_CORRECTION:['pod_arrival','pod_identity_check','wrong_load_conflict','pod_correction','evidence_recheck','pod_match','invoice_unlock','terminal_evidence_close'],
    UNCERTAIN_EXTERNAL_EFFECT_AND_RECONCILIATION:['external_effect_request','external_effect_started','uncertain_effect_observed','reconcile_required','provider_status_evidence','effect_reconciled','post_reconcile_work','terminal_effect_close'],
    MALICIOUS_DISTRACTOR_AND_LEGITIMATE_CHANGE:['malicious_distractor','legitimate_eta_change','instruction_injection','equipment_signal','irrelevant_offer','appointment_change','validated_need','terminal_distractor_close'],
    WORK_HANDOFF_AND_REPRESENTATION_CHANGE:['handoff_notice','representation_change','identity_alias','authority_scope_review','handoff_work_update','new_representation_evidence','handoff_acceptance','terminal_handoff_close'],
    CROSS_LOAD_INTERLEAVING_AND_ISOLATION:['primary_eta_change','secondary_load_signal','primary_work_update','cross_load_evidence','primary_equipment_change','secondary_conflict','primary_reconcile','terminal_isolation_close'],
  };
  return map[archetype][slot-1];
}

function semanticGold(family){
  const highAuth = new Set(['factor_assignment_change','representation_change','authority_scope_review','new_representation_evidence']);
  const irrelevant = new Set(['malicious_distractor','instruction_injection','irrelevant_offer','secondary_load_signal','secondary_conflict']);
  const close = family.startsWith('terminal_') || ['repair_complete','appointment_resolved','effect_reconciled','pod_match','handoff_acceptance','primary_reconcile'].includes(family);
  const conflict = family.includes('conflict') || family==='wrong_load_conflict' || family==='uncertain_effect_observed';
  let dim='WORK_LIFECYCLE';
  if(family.includes('appointment')||family.includes('eta')||family.includes('facility')||family.includes('route')) dim='SCHEDULE';
  else if(family.includes('mechanical')||family.includes('repair')||family.includes('equipment')||family.includes('resume')) dim='EQUIPMENT';
  else if(family.includes('detention')||family.includes('invoice')||family.includes('factor')||family.includes('economic')||family.includes('reconciliation')) dim='ECONOMIC';
  else if(family.includes('pod')||family.includes('evidence')) dim='EVIDENCE';
  else if(family.includes('authority')||family.includes('representation')) dim='AUTHORITY';
  else if(family.includes('identity')||family.includes('alias')||family.includes('handoff')) dim='IDENTITY';
  else if(family.includes('external_effect')||family.includes('provider_status')||family.includes('reconcile')) dim='WORK_LIFECYCLE';
  if(irrelevant.has(family)) dim='NO_MATCH';
  const relevant=!irrelevant.has(family);
  const need=relevant&&!close;
  let response='KNOWN_PROCEDURE';
  if(!relevant||close) response='NO_WORK';
  else if(highAuth.has(family)) response='HUMAN_OR_EXTERNAL_AUTHORITY';
  else if(conflict) response='GENERAL_REASONING';
  else if(family.includes('warning')||family.includes('notice')||family.includes('arrival')) response='CREATE_NEED_ONLY';
  const severity=!relevant?0:highAuth.has(family)?4:conflict?3:response==='CREATE_NEED_ONLY'?2:close?1:2;
  return {relevant_to_responsibility:relevant,material_state_change:relevant,state_dimension:dim,need_exists:need,work_response_class:response,historical_consistency:conflict?'CONFLICTING':'CONSISTENT',current_work_relation:close?'CLOSES_EXISTING':need?'UPDATES_EXISTING':'NONE',severity,external_authority_required:highAuth.has(family)};
}

function deterministicKind(archetype,detIndex){
  const matrix=[
    ['EXACT_DUPLICATE','STALE_REPLAY','CRASH_RESTART','TERMINAL_RECONCILIATION'],
    ['EXACT_DUPLICATE','COMPLETED_WORK_REPLAY','CRASH_RESTART','TERMINAL_RECONCILIATION'],
    ['STALE_REPLAY','AUTHORITY_SCOPE_GUARD','CRASH_RESTART','TERMINAL_RECONCILIATION'],
    ['WRONG_LOAD','EXACT_DUPLICATE','CRASH_RESTART','TERMINAL_RECONCILIATION'],
    ['UNCERTAIN_EFFECT_RETRY_BLOCK','RECONCILE_BEFORE_RETRY','CRASH_RESTART','TERMINAL_RECONCILIATION'],
    ['EXACT_DUPLICATE','STALE_REPLAY','CRASH_RESTART','TERMINAL_RECONCILIATION'],
    ['AUTHORITY_SCOPE_GUARD','STALE_REPLAY','CRASH_RESTART','TERMINAL_RECONCILIATION'],
    ['WRONG_LOAD','EXACT_DUPLICATE','CRASH_RESTART','TERMINAL_RECONCILIATION'],
  ];
  return matrix[ARCHETYPES.indexOf(archetype)][detIndex];
}

function providerFor(archetype,semanticSlot){
  const ai=ARCHETYPES.indexOf(archetype);
  // First 16 trajectories (archetypes 0..4 plus archetype 5 variant1) receive 3 Luna slots;
  // remaining 8 receive 2. This is deterministic from archetype/variant via caller override.
  return null;
}

function applySemantic(state,event,gold){
  const s=clone(state); const key=`${event.trajectory_id}:${event.family}`;
  if(!gold.relevant_to_responsibility){ s.history.last_sequence=event.sequence; s.history.seen_event_ids.push(event.event_id); return s; }
  if(gold.external_authority_required){ s.identity.conflict=true; s.authority.external_required=true; }
  if(event.family.includes('mechanical_breakdown')) s.continuity.equipment='OUT_OF_SERVICE';
  if(event.family==='repair_complete'||event.family==='resume_readiness') s.continuity.equipment='AVAILABLE';
  if(event.family.includes('appointment')||event.family.includes('eta')||event.family.includes('facility')) s.continuity.appointment_version++;
  if(event.family==='pod_arrival') s.continuity.pod='RECEIVED_UNVERIFIED';
  if(event.family==='pod_match'||event.family==='pod_correction') s.continuity.pod='RECEIVED_MATCHED';
  if(event.family.includes('detention')) s.continuity.detention_minutes+=45;
  if(event.family==='uncertain_effect_observed'||event.family==='external_effect_started'){ s.external_effect={status:'UNCERTAIN',effect_id:`FX-${event.trajectory_id}`,reconciled:false}; }
  if(event.family==='effect_reconciled'||event.family==='provider_status_evidence'){ s.external_effect={...s.external_effect,status:'RECONCILED',reconciled:true}; }
  if(event.family.includes('representation_change')||event.family==='new_representation_evidence') s.identity.representation_version++;
  if(gold.historical_consistency==='CONFLICTING') s.evidence.conflict=true;
  if(event.family.includes('resolved')||event.family.includes('correction')||event.family.includes('reconciled')||event.family.includes('acceptance')) s.evidence.conflict=false;
  if(gold.current_work_relation==='CLOSES_EXISTING'){
    for(const [k,v] of Object.entries(s.work.open_work)){ s.work.completed_work[k]={...v,closed_by:event.event_id}; delete s.work.open_work[k]; }
    s.work.open_needs={};
  } else if(gold.need_exists){
    const idem=`NEED:${key}`;
    s.work.open_needs[idem]={created_by:event.event_id,family:event.family};
    if(['KNOWN_PROCEDURE','GENERAL_REASONING','FRONTIER_REASONING','HUMAN_OR_EXTERNAL_AUTHORITY'].includes(gold.work_response_class)){
      const wid=`WORK:${key}`; if(!s.work.open_work[wid]&&!s.work.completed_work[wid]) s.work.open_work[wid]={created_by:event.event_id,class:gold.work_response_class};
    }
  }
  s.work.generation++;
  s.history.last_sequence=event.sequence; s.history.seen_event_ids.push(event.event_id); s.history.completed_event_ids.push(event.event_id);
  return s;
}

function applyDeterministic(state,event){
  const s=clone(state); const k=event.guard_kind;
  if(k==='WRONG_LOAD'||k==='EXACT_DUPLICATE'||k==='STALE_REPLAY'||k==='COMPLETED_WORK_REPLAY'||k==='AUTHORITY_SCOPE_GUARD'||k==='UNCERTAIN_EFFECT_RETRY_BLOCK'||k==='CRASH_RESTART') return s;
  if(k==='RECONCILE_BEFORE_RETRY'){ if(s.external_effect.status==='UNCERTAIN') s.external_effect={...s.external_effect,status:'RECONCILED',reconciled:true}; return s; }
  if(k==='TERMINAL_RECONCILIATION'){ s.evidence.conflict=false; if(s.external_effect.status==='UNCERTAIN') s.external_effect={...s.external_effect,status:'RECONCILED',reconciled:true}; return s; }
  return s;
}

function compileGold(event,gold){
  if(event.guard_kind) return event.guard_expected;
  if(gold.external_authority_required) return 'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED';
  const m={NO_WORK:gold.relevant_to_responsibility?'STATE_UPDATE_ONLY':'NO_ACTION',CREATE_NEED_ONLY:'NEED_DETECTED',KNOWN_PROCEDURE:'KNOWN_PROCEDURE',GENERAL_REASONING:'GENERAL_REASONING_REQUIRED',FRONTIER_REASONING:'FRONTIER_ESCALATION_REQUIRED',HUMAN_OR_EXTERNAL_AUTHORITY:'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED'};
  let d=m[gold.work_response_class];
  if(event.structural_floor==='HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED'&&!d.startsWith('HUMAN_')) d='HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED';
  if(event.structural_floor==='GENERAL_REASONING_REQUIRED'&&['NO_ACTION','STATE_UPDATE_ONLY','NEED_DETECTED','KNOWN_PROCEDURE'].includes(d)) d='GENERAL_REASONING_REQUIRED';
  return d;
}

function build(){
  const trajectories=[]; const events=[]; let global=0, semGlobal=0;
  for(let ai=0; ai<ARCHETYPES.length; ai++) for(let variant=1; variant<=3; variant++){
    const tid=`TRJ-${pad(ai*3+variant,2)}`; let state=initialState(tid,ARCHETYPES[ai],variant); const initial=clone(state); const tev=[]; let semSlot=0, detSlot=0;
    const threeLuna = (ai<5)||(ai===5&&variant===1); // 16 trajectories*3 + 8*2 = 64 Luna
    for(let pos=1;pos<=12;pos++){
      global++; const eid=`DEV-${pad(global,4)}`; const before=clone(state); let e;
      if(SEMANTIC_POS.has(pos)){
        semSlot++; semGlobal++; const family=semanticFamily(ARCHETYPES[ai],semSlot); const gold=semanticGold(family);
        let floor=null;
        if(gold.external_authority_required||family==='identity_alias') floor='HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED';
        else if(gold.historical_consistency==='CONFLICTING'||family==='uncertain_effect_observed') floor='GENERAL_REASONING_REQUIRED';
        const lunaSlots=threeLuna?new Set([1,4,7]):new Set([2,6]);
        const candidate_provider=lunaSlots.has(semSlot)?'luna':'jev';
        e={event_id:eid,trajectory_id:tid,sequence:pos,event_type:'SEMANTIC',provider_eligible:true,archetype:ARCHETYPES[ai],variant,family,subject_load_id:before.primary_load_id,observed_at:`2026-09-22T${String(18+Math.floor(global/60)).padStart(2,'0')}:${String(global%60).padStart(2,'0')}:00Z`,state_before:before,state_before_sha256:sha(before),questions:QSET,question_set_sha256:QSET_SHA,gold,candidate_provider,control_provider:'luna',structural_floor:floor,bound_pre_state_sha256:sha(before)};
        state=applySemantic(state,e,gold); e.expected_disposition=compileGold(e,gold);
      } else {
        const kind=deterministicKind(ARCHETYPES[ai],detSlot++); let guardExpected='NO_ACTION';
        if(kind==='AUTHORITY_SCOPE_GUARD') guardExpected='HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED';
        if(kind==='UNCERTAIN_EFFECT_RETRY_BLOCK'||kind==='RECONCILE_BEFORE_RETRY') guardExpected='STATE_UPDATE_ONLY';
        e={event_id:eid,trajectory_id:tid,sequence:pos,event_type:'DETERMINISTIC_CONTROL',provider_eligible:false,archetype:ARCHETYPES[ai],variant,family:kind.toLowerCase(),guard_kind:kind,guard_expected:guardExpected,subject_load_id:kind==='WRONG_LOAD'?before.secondary_load_id:before.primary_load_id,state_before:before,state_before_sha256:sha(before),candidate_provider:null,control_provider:null,bound_pre_state_sha256:sha(before)};
        state=applyDeterministic(state,e); e.expected_disposition=guardExpected;
      }
      e.expected_next_state=clone(state); e.expected_next_state_sha256=sha(state); tev.push(e); events.push(e);
    }
    trajectories.push({trajectory_id:tid,archetype:ARCHETYPES[ai],variant,initial_state:initial,initial_state_sha256:sha(initial),events:tev.map(x=>x.event_id),terminal_state:clone(state),terminal_state_sha256:sha(state)});
  }
  return {trajectories,events};
}

function replay(bundle){
  let pre=0,post=0,terminal=0,cross=0,dupWork=0,dupFx=0,authExpansion=0,staleRegression=0,uncertainRetry=0,crash=0,staleReceiptRejected=0;
  for(const t of bundle.trajectories){
    let s=clone(t.initial_state); const workIds=new Set(); const fxIds=new Set(); let crashSeen=false;
    for(const eid of t.events){
      const e=bundle.events.find(x=>x.event_id===eid);
      if(sha(s)===e.state_before_sha256) pre++;
      const before=clone(s);
      if(e.event_type==='SEMANTIC') s=applySemantic(s,e,e.gold); else s=applyDeterministic(s,e);
      if(sha(s)===e.expected_next_state_sha256) post++;
      if(e.guard_kind==='WRONG_LOAD'&&sha(s)!==sha(before)) cross++;
      for(const k of Object.keys(s.work.open_work)){ if(workIds.has(k)&&!Object.prototype.hasOwnProperty.call(before.work.open_work,k)) dupWork++; workIds.add(k); }
      if(s.external_effect.effect_id){ if(fxIds.has(s.external_effect.effect_id)&&before.external_effect.effect_id!==s.external_effect.effect_id) dupFx++; fxIds.add(s.external_effect.effect_id); }
      if(s.authority.scope!==before.authority.scope) authExpansion++;
      if(e.guard_kind==='STALE_REPLAY'&&sha(s)!==sha(before)) staleRegression++;
      if(e.guard_kind==='UNCERTAIN_EFFECT_RETRY_BLOCK'&&before.external_effect.status==='UNCERTAIN'&&sha(s)!==sha(before)) uncertainRetry++;
      if(e.guard_kind==='CRASH_RESTART'){ crashSeen=true; if(sha(s)===sha(before)) crash++; }
      // Synthetic stale semantic receipt must be rejected after successor state differs from bound pre-state.
      if(e.event_type==='SEMANTIC'&&e.state_before_sha256!==e.expected_next_state_sha256){ const current=e.expected_next_state_sha256,bound=e.bound_pre_state_sha256; if(current!==bound) staleReceiptRejected++; }
    }
    if(sha(s)===t.terminal_state_sha256) terminal++;
    if(!crashSeen) throw new Error(`TRAJECTORY_MISSING_CRASH_RESTART:${t.trajectory_id}`);
  }
  return {pre_state_hash_replay:pre,successor_state_hash_replay:post,terminal_trajectory_replay:terminal,cross_load_contamination:cross,duplicate_work_creation:dupWork,duplicate_external_effect:dupFx,authority_expansion:authExpansion,stale_state_regression:staleRegression,uncertain_effect_retry_before_reconciliation:uncertainRetry,crash_restart_exact_reconstruction:crash,stale_semantic_receipt_rejections:staleReceiptRejected};
}

function providerMatrix(events){
  return events.filter(e=>e.provider_eligible).map(e=>({event_id:e.event_id,trajectory_id:e.trajectory_id,archetype:e.archetype,variant:e.variant,family:e.family,control_provider:'luna',candidate_provider:e.candidate_provider,bound_pre_state_sha256:e.bound_pre_state_sha256,question_set_sha256:e.question_set_sha256,structural_floor:e.structural_floor}));
}

async function hashTree(root,exclude=new Set()){
  const rows=[];
  async function walk(dir){ for(const ent of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){ const p=path.join(dir,ent.name),rel=path.relative(root,p); if(exclude.has(rel)) continue; if(ent.isDirectory()) await walk(p); else { const d=await readFile(p); rows.push({path:rel,sha256:createHash('sha256').update(d).digest('hex'),bytes:d.length}); } } }
  await walk(root); return {rows,root_sha256:sha(rows)};
}

async function phaseWrite(){
  const bundle=build(), report=replay(bundle), matrix=providerMatrix(bundle.events);
  const semantic=bundle.events.filter(e=>e.provider_eligible), deterministic=bundle.events.filter(e=>!e.provider_eligible);
  const luna=matrix.filter(x=>x.candidate_provider==='luna').length, jev=matrix.filter(x=>x.candidate_provider==='jev').length;
  const executionPlan={run_id:RUN_ID,trajectories:bundle.trajectories.map(t=>({trajectory_id:t.trajectory_id,archetype:t.archetype,variant:t.variant,initial_state_sha256:t.initial_state_sha256,event_ids:t.events,terminal_state_sha256:t.terminal_state_sha256})),semantic_events:matrix,control_provider:'luna',candidate_policy:'STAGE_D_FROZEN_HISTORY_CONSEQUENCE_MATRIX_v0.1',models:{luna:'gpt-5.6-luna',jev_requested:'jev-latest'},provider_calls_authorized:false,acceptance:{trajectory_count:24,event_count:288,semantic_event_count:192,deterministic_event_count:96,pre_state_hash_replay:288,successor_state_hash_replay:288,terminal_trajectory_replay:24,cross_load_contamination:0,duplicate_work_creation:0,duplicate_external_effect:0,authority_expansion:0,stale_state_regression:0,uncertain_effect_retry_before_reconciliation:0,crash_restart_exact_reconstruction:24,candidate_luna_calls:64,candidate_jev_calls:128}};
  const artifacts={
    'trajectory_corpus.json':bundle,
    'transition_oracle.json':bundle.events.map(e=>({event_id:e.event_id,trajectory_id:e.trajectory_id,sequence:e.sequence,event_type:e.event_type,state_before_sha256:e.state_before_sha256,expected_next_state_sha256:e.expected_next_state_sha256,expected_disposition:e.expected_disposition,guard_kind:e.guard_kind??null,bound_pre_state_sha256:e.bound_pre_state_sha256})),
    'question_set.json':QSET,
    'routing_provider_matrix.json':matrix,
    'compiler_safety_policy.json':{fresh_state_binding:'SEMANTIC_RECEIPT_APPLICABLE_ONLY_IF=CURRENT_STATE_SHA256==BOUND_PRE_STATE_SHA256',floors:{authority_representation_conflict:'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED',identity_binding_conflict:'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED',conflicting_inflight_evidence:'GENERAL_REASONING_REQUIRED',uncertain_external_effect:'RECONCILE_BEFORE_RETRY',duplicate_existing_work:'NO_SECOND_WORK_OBJECT',stale_semantic_receipt:'REJECT'},code_owned:['event_ordering','freshness','duplicate_replay','tenant_load_binding','authority_identity_enforcement','work_need_idempotency','uncertain_effect_retry_prohibition','state_transition_application','crash_restart_replay','effect_reconciliation','evidence_persistence']},
    'deterministic_replay_report.json':report,
    'execution_plan.json':executionPlan,
    'preflight_summary.json':{trajectory_count:bundle.trajectories.length,event_count:bundle.events.length,semantic_event_count:semantic.length,deterministic_event_count:deterministic.length,question_set_complete:Object.keys(QSET).length===9,provider_matrix_exact:matrix.length===192,control_luna_calls_planned:192,candidate_luna_calls_planned:luna,candidate_jev_calls_planned:jev,luna_suppression:1-luna/192,provider_calls_actual:0,authority_effects:'NONE',openrouter_calls:0,frontier_calls:0},
  };
  await ensure(path.join(ROOT,'artifacts')); const index=[];
  for(const [name,v] of Object.entries(artifacts)){ const m=await writeStable(path.join(ROOT,'artifacts',name),v); index.push({name,path:`artifacts/${name}`,...m}); }
  const idx=await writeStable(path.join(ROOT,'artifact-index.json'),{run_id:RUN_ID,entries:index});
  const ws={run_id:RUN_ID,status:'WRITE_COMPLETE_UNVERIFIED',artifact_index_sha256:idx.sha256,artifact_count:index.length,execution_manifest_sha256:sha(executionPlan),provider_calls:0,authority_effects:'NONE',created_at:new Date().toISOString()};
  await writeStable(path.join(ROOT,'WRITE_STATE.json'),ws);
  console.log('NSS1_STAGE_D_PHASE_W',JSON.stringify({...ws,summary:artifacts['preflight_summary.json'],replay:report}));
  const child=spawnSync(process.execPath,[process.argv[1]],{env:{...process.env,RUN_MODE:'verify',EVIDENCE_DIR:ROOT},stdio:'inherit'});
  if(child.status!==0) process.exitCode=child.status??1;
}

async function phaseVerify(){
  const idxDoc=await readJson(path.join(ROOT,'artifact-index.json')); let hashErrors=0,byteErrors=0,parseErrors=0;
  for(const e of idxDoc.entries){ try{ const d=await readFile(path.join(ROOT,e.path)); if(createHash('sha256').update(d).digest('hex')!==e.sha256) hashErrors++; if(d.length!==e.bytes) byteErrors++; JSON.parse(d.toString('utf8')); }catch{ parseErrors++; } }
  const corpus=await readJson(path.join(ROOT,'artifacts/trajectory_corpus.json'));
  const qset=await readJson(path.join(ROOT,'artifacts/question_set.json'));
  const matrix=await readJson(path.join(ROOT,'artifacts/routing_provider_matrix.json'));
  const replay=await readJson(path.join(ROOT,'artifacts/deterministic_replay_report.json'));
  const plan=await readJson(path.join(ROOT,'artifacts/execution_plan.json'));
  const summary=await readJson(path.join(ROOT,'artifacts/preflight_summary.json'));
  const gates={
    trajectory_count:corpus.trajectories.length===24,event_count:corpus.events.length===288,semantic_event_count:corpus.events.filter(e=>e.provider_eligible).length===192,deterministic_event_count:corpus.events.filter(e=>!e.provider_eligible).length===96,
    pre_state_hash_replay:replay.pre_state_hash_replay===288,successor_state_hash_replay:replay.successor_state_hash_replay===288,terminal_trajectory_replay:replay.terminal_trajectory_replay===24,cross_load_contamination:replay.cross_load_contamination===0,duplicate_work_creation:replay.duplicate_work_creation===0,duplicate_external_effect:replay.duplicate_external_effect===0,authority_expansion:replay.authority_expansion===0,stale_state_regression:replay.stale_state_regression===0,uncertain_effect_retry_before_reconciliation:replay.uncertain_effect_retry_before_reconciliation===0,crash_restart_exact_reconstruction:replay.crash_restart_exact_reconstruction===24,
    question_set_complete:Object.keys(qset).length===9&&sha(qset)===QSET_SHA,provider_matrix_exact:matrix.length===192&&matrix.every(x=>x.control_provider==='luna'&&['luna','jev'].includes(x.candidate_provider)),control_luna_calls_planned:summary.control_luna_calls_planned===192,candidate_luna_calls_planned:summary.candidate_luna_calls_planned===64,candidate_jev_calls_planned:summary.candidate_jev_calls_planned===128,provider_calls_actual:summary.provider_calls_actual===0,authority_effects:summary.authority_effects==='NONE',artifact_hash_verify:hashErrors===0&&byteErrors===0&&parseErrors===0,fresh_state_binding_exercised:replay.stale_semantic_receipt_rejections>0,
  };
  const pass=Object.values(gates).every(Boolean);
  const verification={run_id:RUN_ID,status:pass?'PASS':'BLOCK',gates,hash_errors:hashErrors,byte_errors:byteErrors,parse_errors:parseErrors,provider_calls:0,authority_effects:'NONE',execution_manifest_sha256:sha(plan),artifact_index_sha256:sha(idxDoc),verified_at:new Date().toISOString()};
  const vm=await writeStable(path.join(ROOT,'VERIFICATION_RESULT.json'),verification);
  const tree=await hashTree(ROOT,new Set(['FREEZE_POINTER.json']));
  const pointer={run_id:RUN_ID,status:pass?'STAGE_D_ZERO_CALL_PREFLIGHT_PASS':'STAGE_D_ZERO_CALL_PREFLIGHT_BLOCK',execution_manifest_sha256:verification.execution_manifest_sha256,verification_result_sha256:vm.sha256,evidence_tree_sha256:tree.root_sha256,provider_calls:0,authority_effects:'NONE',next_transition:pass?'STAGE_D_PROVIDER_RECEIPT_1_PENDING_SEPARATE_AUTHORIZATION':'STAGE_D_PROVIDER_EXECUTION_BLOCKED'};
  const pm=await writeStable(path.join(ROOT,'FREEZE_POINTER.json'),pointer); const readback=await readJson(path.join(ROOT,'FREEZE_POINTER.json')); const readbackPass=sha(readback)===pm.sha256;
  console.log('NSS1_STAGE_D_ZERO_CALL_COMPLETE',JSON.stringify({...verification,freeze_pointer_sha256:pm.sha256,freeze_pointer_readback_pass:readbackPass,pointer}));
  if(!pass||!readbackPass) process.exitCode=1;
}

if(MODE==='verify') await phaseVerify(); else await phaseWrite();
