import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const EVIDENCE_ROOT=process.env.STAGE_F_EVIDENCE_ROOT??'/tmp/stage-f-verified/stage-f-evidence';
const PREFLIGHT_ROOT=process.env.PREFLIGHT_ROOT??'/tmp/nss1-stage-f-runner-preflight-v0.1';
const EXPECTED_ARCHIVE='b43f7bb6f2a158300c63ff0df9519de21a18e1005860490f4f97ac907ba52af8';
function stable(v){if(Array.isArray(v))return`[${v.map(stable).join(',')}]`;if(v&&typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;return JSON.stringify(v)}
function shaText(s){return createHash('sha256').update(s).digest('hex')}
function sha(v){return shaText(stable(v))}
async function readJson(root,name){return JSON.parse(await readFile(path.join(root,name),'utf8'))}
async function writeStable(name,v){const text=stable(v);await mkdir(PREFLIGHT_ROOT,{recursive:true});await writeFile(path.join(PREFLIGHT_ROOT,name),text);return shaText(text)}

const [manifest,result,index,writeState,matrix,attempts,semanticGold,needGold,workGold,knownNovel,freshness,acceptance,metrics] = await Promise.all([
  readJson(PREFLIGHT_ROOT,'RUNNER_EXECUTION_MANIFEST.json'),readJson(PREFLIGHT_ROOT,'PREFLIGHT_RESULT.json'),readJson(PREFLIGHT_ROOT,'ARTIFACT_INDEX.json'),readJson(PREFLIGHT_ROOT,'WRITE_STATE.json'),
  readJson(EVIDENCE_ROOT,'provider_matrix.json'),readJson(EVIDENCE_ROOT,'semantic_attempts.json'),readJson(EVIDENCE_ROOT,'semantic_gold.json'),readJson(EVIDENCE_ROOT,'need_gold.json'),readJson(EVIDENCE_ROOT,'work_disposition_gold.json'),readJson(EVIDENCE_ROOT,'known_novel.json'),readJson(EVIDENCE_ROOT,'freshness_gold.json'),readJson(EVIDENCE_ROOT,'acceptance_gates.json'),readJson(EVIDENCE_ROOT,'metric_spec.json')
]);
const issues=[];const check=(l,g,w)=>{if(g!==w)issues.push(`${l}:${g}:${w}`)};
check('RESULT_STATUS',result.status,'PASS');
check('WRITE_STATE',writeState.status,'WRITE_COMPLETE_UNVERIFIED');
check('MANIFEST_SHA_BINDING',sha(manifest),result.runner_execution_manifest_sha256);
check('WRITE_MANIFEST_SHA',writeState.runner_execution_manifest_sha256,result.runner_execution_manifest_sha256);
check('INDEX_SHA',sha(index),writeState.artifact_index_sha256);
check('ARCHIVE_SHA_BINDING',manifest.upstream.verified_archive_sha256,EXPECTED_ARCHIVE);
check('MATRIX_SHA_RECOMPUTE',sha(matrix),manifest.roots.provider_matrix_sha256);
check('ATTEMPTS_SHA_RECOMPUTE',sha(attempts),manifest.roots.semantic_attempts_sha256);
check('SEMANTIC_GOLD_SHA_RECOMPUTE',sha(semanticGold),manifest.roots.semantic_gold_sha256);
check('NEED_GOLD_SHA_RECOMPUTE',sha(needGold),manifest.roots.need_gold_sha256);
check('WORK_GOLD_SHA_RECOMPUTE',sha(workGold),manifest.roots.work_disposition_gold_sha256);
check('KNOWN_NOVEL_SHA_RECOMPUTE',sha(knownNovel),manifest.roots.known_novel_sha256);
check('FRESHNESS_SHA_RECOMPUTE',sha(freshness),manifest.roots.freshness_gold_sha256);
check('ACCEPTANCE_SHA_RECOMPUTE',sha(acceptance),manifest.acceptance_gates_sha256);
check('METRIC_SHA_RECOMPUTE',sha(metrics),manifest.metric_spec_sha256);
check('MATRIX_ROWS',matrix.length,240);check('ATTEMPTS',attempts.length,240);check('CONTROL_LUNA',matrix.filter(x=>x.control_provider==='LUNA').length,240);check('CANDIDATE_LUNA',matrix.filter(x=>x.candidate_provider==='LUNA').length,80);check('CANDIDATE_JEV',matrix.filter(x=>x.candidate_provider==='JEV').length,160);check('KNOWN',knownNovel.filter(x=>x.status==='KNOWN').length,160);check('NOVEL',knownNovel.filter(x=>x.status==='NOVEL').length,80);check('FRESH',freshness.filter(x=>x.status==='FRESH_AT_FROZEN_COMPLETION').length,160);check('STALE',freshness.filter(x=>x.status!=='FRESH_AT_FROZEN_COMPLETION').length,80);
const ids=new Set(attempts.map(x=>x.event.event_id));for(const m of matrix)if(!ids.has(m.event_id))issues.push(`MATRIX_MISSING_ATTEMPT:${m.event_id}`);
for(const [label,xs] of [['SEMANTIC',semanticGold],['NEED',needGold],['WORK',workGold],['NOVELTY',knownNovel],['FRESHNESS',freshness]]){const s=new Set(xs.map(x=>x.event_id));for(const id of ids)if(!s.has(id))issues.push(`${label}_MISSING:${id}`)}
check('PROVIDER_CALLS',result.provider_calls,0);check('CREDENTIALS_READ',result.credentials_read,false);check('PROVIDER_ATTEMPTS_EXISTING',result.counts.provider_attempts_existing,0);check('PROVIDER_RECEIPTS_EXISTING',result.counts.provider_receipts_existing,0);check('RAW_RESPONSES_EXISTING',result.counts.raw_responses_existing,0);check('AUTHORITY_EFFECTS',result.authority_effects,'NONE');check('LIVE_EFFECTS',result.live_effects,0);

const verification={run_id:result.run_id,status:issues.length?'BLOCK':'PASS',issues,provider_calls:0,credentials_read:false,provider_attempts:0,provider_receipts:0,raw_responses:0,runner_execution_manifest_sha256:result.runner_execution_manifest_sha256,artifact_index_sha256:writeState.artifact_index_sha256,verified_stage_f_archive_sha256:EXPECTED_ARCHIVE,authority_effects:'NONE',live_effects:0,production_promotion:false};
const verificationSha=await writeStable('VERIFICATION_RESULT.json',verification);
const pointer={run_id:result.run_id,status:issues.length?'STAGE_F_PROVIDER_RUNNER_PREFLIGHT_BLOCK':'STAGE_F_PROVIDER_RUNNER_PREFLIGHT_PASS',runner_execution_manifest_sha256:result.runner_execution_manifest_sha256,artifact_index_sha256:writeState.artifact_index_sha256,verification_result_sha256:verificationSha,verified_stage_f_archive_sha256:EXPECTED_ARCHIVE,provider_calls:0,provider_receipts:0,authority_effects:'NONE',next_transition:issues.length?'REMEDIATE_STAGE_F_PROVIDER_RUNNER_PREFLIGHT':'STAGE_F_PROVIDER_SHADOW_EXECUTION_AUTHORIZATION'};
const pointerSha=await writeStable('FREEZE_POINTER.json',pointer);
console.log('NSS1_STAGE_F_PROVIDER_RUNNER_VERIFY_COMPLETE',JSON.stringify({verification,freeze_pointer_sha256:pointerSha,pointer}));
if(issues.length)process.exitCode=2;
