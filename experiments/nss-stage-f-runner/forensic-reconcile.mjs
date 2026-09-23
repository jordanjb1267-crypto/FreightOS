import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT=process.env.EVIDENCE_DIR??'/data/nss1-stage-f-provider-v0.2';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function list(dir){try{return (await readdir(dir)).filter(x=>x.endsWith('.json')).sort()}catch{return[]}}
async function json(f){return JSON.parse(await readFile(f,'utf8'))}
function bump(o,k){k=String(k??'NULL');o[k]=(o[k]??0)+1}
const providers=['luna','jev'];
const receipts=[];let rawPresent=0,rawMissing=0;const originalHashes={};
for(const p of providers){for(const f of await list(path.join(ROOT,'receipts',p))){const fp=path.join(ROOT,'receipts',p,f);const buf=await readFile(fp);originalHashes[`receipts/${p}/${f}`]=sha(buf);const r=JSON.parse(buf.toString('utf8'));receipts.push(r);if(r.raw_response_sha256){try{const rb=await readFile(path.join(ROOT,'raw',p,`${r.event_id}.txt`));if(sha(rb)!==r.raw_response_sha256)throw new Error('RAW_HASH_MISMATCH');rawPresent++}catch{rawMissing++}}}}
const idxBuf=await readFile(path.join(ROOT,'RECEIPT_INDEX.json'));const indexSha=sha(idxBuf);const resultBuf=await readFile(path.join(ROOT,'PHASE_W_RESULT.json'));const phaseW=JSON.parse(resultBuf.toString('utf8'));
const byProvider={},byStatus={},byError={},byEffectiveModel={},nonOkByProvider={};
for(const r of receipts){bump(byProvider,r.provider);bump(byStatus,r.status);bump(byEffectiveModel,`${r.provider}:${r.effective_model}`);if(r.status!=='OK'){bump(byError,`${r.provider}:${r.status}:${r.error}`);bump(nonOkByProvider,r.provider)}}
const out={run_id:phaseW.run_id,phase_w_status:phaseW.status,receipt_count:receipts.length,index_sha256:indexSha,index_sha_matches:indexSha==='2e50185fa5d4ee5c3f137ccfbb4283d5a8964e6e3d53288a29043ee8f9d207e7',by_provider:byProvider,by_status:byStatus,non_ok_by_provider:nonOkByProvider,by_effective_model:byEffectiveModel,non_ok_error_distribution:byError,raw_present:rawPresent,raw_missing_or_mismatch:rawMissing,orchestration_uncertain:receipts.filter(r=>r.status==='ORCHESTRATION_UNCERTAIN').length,authority_effects:'NONE',provider_calls:0,provider_replay:false};
console.log('NSS1_STAGE_F_FORENSIC_RECONCILIATION',JSON.stringify(out));
if(receipts.length!==400||!out.index_sha_matches||rawMissing!==0)process.exitCode=2;
