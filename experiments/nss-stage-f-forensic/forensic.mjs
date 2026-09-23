import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

// Hard-disable any accidental provider/network execution.
globalThis.fetch = async () => { throw new Error('STAGE_F_FORENSIC_NETWORK_PROHIBITED'); };

const ROOT = process.env.EVIDENCE_DIR ?? '/data/nss1-stage-f-provider-v0.2';
const OUT = process.env.FORENSIC_OUT ?? '/data/nss1-stage-f-forensic-v0.1';
const EXPECTED_RECEIPT_INDEX_SHA = '2e50185fa5d4ee5c3f137ccfbb4283d5a8964e6e3d53288a29043ee8f9d207e7';
const EXPECTED_QSET_SHA = '0e8c01c8d98e2fbbeb9f7b034ef638dcf11df0f9f2189834322830bb0b758bcb';
const EXPECTED_RUN = 'NSS1-STAGE-F-PROVIDER-SHADOW-v0.2';
const EXPECTED_MANIFEST = '3a91b0041c798c665c5910db0b989e6deec0c3af2bb02b4d11f0e125f8bc37e5';

const shaBuf = b => createHash('sha256').update(b).digest('hex');
const shaText = s => shaBuf(Buffer.from(s));
const json = async p => JSON.parse(await readFile(p, 'utf8'));
const exists = async p => { try { await stat(p); return true; } catch { return false; } };
const listJson = async p => (await exists(p)) ? (await readdir(p)).filter(x => x.endsWith('.json')).sort() : [];
const listFiles = async p => (await exists(p)) ? (await readdir(p)).sort() : [];
const inc = (m,k) => { const key = String(k ?? 'null'); m[key] = (m[key] ?? 0) + 1; };
const addNum = (m,k,v) => { if (typeof v === 'number' && Number.isFinite(v)) m[k] = (m[k] ?? 0) + v; };
const quantile = (xs,q) => { if (!xs.length) return null; const a=[...xs].sort((a,b)=>a-b); const i=(a.length-1)*q; const lo=Math.floor(i),hi=Math.ceil(i); return lo===hi?a[lo]:a[lo]+(a[hi]-a[lo])*(i-lo); };

async function ledgerFingerprint(){
  const rels=[];
  for (const top of ['attempts','receipts','raw']) {
    const topPath=path.join(ROOT,top);
    if (!(await exists(topPath))) continue;
    for (const provider of (await readdir(topPath)).sort()) {
      const pp=path.join(topPath,provider);
      for (const f of (await readdir(pp)).sort()) {
        const p=path.join(pp,f); const s=await stat(p); if(!s.isFile()) continue;
        const b=await readFile(p); rels.push({path:path.relative(ROOT,p),sha256:shaBuf(b),bytes:b.length});
      }
    }
  }
  for (const f of ['RECEIPT_INDEX.json','PHASE_W_RESULT.json']) {
    const p=path.join(ROOT,f); if(await exists(p)){const b=await readFile(p);rels.push({path:f,sha256:shaBuf(b),bytes:b.length});}
  }
  rels.sort((a,b)=>a.path.localeCompare(b.path));
  return {files:rels,sha256:shaText(JSON.stringify(rels))};
}

const before = await ledgerFingerprint();
const receiptIndexPath = path.join(ROOT,'RECEIPT_INDEX.json');
const phaseWPath = path.join(ROOT,'PHASE_W_RESULT.json');
if (!(await exists(receiptIndexPath)) || !(await exists(phaseWPath))) throw new Error('MISSING_TERMINAL_LEDGER_ROOT');
const receiptIndexBytes = await readFile(receiptIndexPath);
const receiptIndexSha = shaBuf(receiptIndexBytes);
if (receiptIndexSha !== EXPECTED_RECEIPT_INDEX_SHA) throw new Error(`RECEIPT_INDEX_SHA_MISMATCH:${receiptIndexSha}`);
const receiptIndex = JSON.parse(receiptIndexBytes.toString('utf8'));
const phaseW = await json(phaseWPath);
if (phaseW.run_id !== EXPECTED_RUN) throw new Error(`RUN_ID_MISMATCH:${phaseW.run_id}`);
if (phaseW.successor_runner_execution_manifest_sha256 !== EXPECTED_MANIFEST) throw new Error('RUNNER_MANIFEST_MISMATCH');

const providers=['luna','jev'];
const summaries={};
const receiptByKey=new Map();
const issues=[];

for (const provider of providers) {
  const receiptDir=path.join(ROOT,'receipts',provider);
  const attemptDir=path.join(ROOT,'attempts',provider);
  const rawDir=path.join(ROOT,'raw',provider);
  const receiptFiles=await listJson(receiptDir);
  const attemptFiles=await listJson(attemptDir);
  const rawFiles=await listFiles(rawDir);
  const status={}, errors={}, requested_models={}, effective_models={}, freshness={}, current_state_application={}, usageTotals={};
  const latencies=[];
  let qset_mismatch=0,state_binding_mismatch=0,receipt_index_mismatch=0,raw_hash_mismatch=0,raw_expected=0,raw_present=0,attempt_missing=0,attempt_receipt_id_mismatch=0;

  const indexMap=new Map(receiptIndex.filter(x=>x.provider===provider).map(x=>[x.event_id,x]));
  for (const file of receiptFiles) {
    const p=path.join(receiptDir,file); const bytes=await readFile(p); const receipt=JSON.parse(bytes.toString('utf8')); const eventId=receipt.event_id; const key=`${provider}:${eventId}`; receiptByKey.set(key,receipt);
    inc(status,receipt.status); inc(errors,receipt.error ?? 'NONE'); inc(requested_models,receipt.requested_model); inc(effective_models,receipt.effective_model); inc(freshness,receipt.frozen_freshness); inc(current_state_application,receipt.current_state_application);
    if(typeof receipt.latency_ms==='number')latencies.push(receipt.latency_ms);
    for(const [k,v] of Object.entries(receipt.usage??{})) addNum(usageTotals,k,v);
    if(receipt.question_set_sha256!==EXPECTED_QSET_SHA) qset_mismatch++;
    const idx=indexMap.get(eventId); if(!idx || idx.receipt_sha256!==shaBuf(bytes)) receipt_index_mismatch++;
    const attemptPath=path.join(attemptDir,`${eventId}.json`);
    if(!(await exists(attemptPath))) attempt_missing++;
    else { const attempt=await json(attemptPath); if(attempt.event_id!==eventId || attempt.provider!==provider) attempt_receipt_id_mismatch++; if(attempt.bound_state_sha256!==receipt.bound_state_sha256) state_binding_mismatch++; }
    if(receipt.raw_response_sha256){ raw_expected++; const rp=path.join(rawDir,`${eventId}.txt`); if(await exists(rp)){ raw_present++; const rb=await readFile(rp); if(shaBuf(rb)!==receipt.raw_response_sha256)raw_hash_mismatch++; } }
  }
  summaries[provider]={
    receipts:receiptFiles.length, attempts:attemptFiles.length, raw_files:rawFiles.length,
    status, errors, requested_models, effective_models, freshness, current_state_application,
    receipt_index_entries:indexMap.size, receipt_index_mismatch, qset_mismatch, state_binding_mismatch,
    attempt_missing, attempt_receipt_id_mismatch, raw_expected, raw_present, raw_hash_mismatch,
    latency_ms:{count:latencies.length,mean:latencies.length?latencies.reduce((a,b)=>a+b,0)/latencies.length:null,p50:quantile(latencies,.5),p95:quantile(latencies,.95),p99:quantile(latencies,.99),max:latencies.length?Math.max(...latencies):null},
    usage_totals:usageTotals
  };
}

const totalReceipts=providers.reduce((n,p)=>n+summaries[p].receipts,0);
const totalAttempts=providers.reduce((n,p)=>n+summaries[p].attempts,0);
const allNonOk=[];
for(const [key,r] of receiptByKey){ if(r.status!=='OK') allNonOk.push({key,status:r.status,error:r.error,requested_model:r.requested_model,effective_model:r.effective_model,raw_response_sha256:r.raw_response_sha256}); }

const nonOkClassHistogram={};
for(const r of allNonOk) inc(nonOkClassHistogram,`${r.status}|${r.error ?? 'NONE'}|${r.effective_model ?? 'null'}`);

let failure_attribution='MULTIPLE_OR_UNRESOLVED_FAILURE_CLASSES';
const nonOkProviders = providers.filter(p => (summaries[p].receipts - (summaries[p].status.OK ?? 0)) > 0);
if (nonOkProviders.length===1 && nonOkProviders[0]==='jev' && Object.keys(nonOkClassHistogram).length===1) failure_attribution='SINGLE_JEV_FAILURE_CLASS';

const after = await ledgerFingerprint();
if(before.sha256!==after.sha256) issues.push('ORIGINAL_LEDGER_CHANGED_DURING_FORENSIC_READ');
if(totalReceipts!==400)issues.push(`RECEIPT_COUNT:${totalReceipts}`);
if(totalAttempts!==400)issues.push(`ATTEMPT_COUNT:${totalAttempts}`);
if(receiptIndex.length!==400)issues.push(`RECEIPT_INDEX_COUNT:${receiptIndex.length}`);
for(const p of providers){ for(const k of ['receipt_index_mismatch','qset_mismatch','state_binding_mismatch','attempt_missing','attempt_receipt_id_mismatch','raw_hash_mismatch']) if(summaries[p][k]!==0)issues.push(`${p.toUpperCase()}_${k.toUpperCase()}:${summaries[p][k]}`); }

const result={
  run_id:EXPECTED_RUN,
  forensic_status:issues.length?'BLOCK':'PASS',
  provider_calls:0,
  network_calls:0,
  authority_effects:'NONE',
  input:{root:ROOT,receipt_index_sha256:receiptIndexSha,phase_w_status:phaseW.status,phase_w_terminal_receipts:phaseW.terminal_receipts,phase_w_ok_receipts:phaseW.ok_receipts,phase_w_non_ok_receipts:phaseW.non_ok_receipts},
  original_ledger_before_sha256:before.sha256,
  original_ledger_after_sha256:after.sha256,
  original_ledger_unchanged:before.sha256===after.sha256,
  totals:{receipts:totalReceipts,attempts:totalAttempts,receipt_index_entries:receiptIndex.length,non_ok:allNonOk.length},
  providers:summaries,
  non_ok_class_histogram:nonOkClassHistogram,
  failure_attribution,
  issues
};

await mkdir(OUT,{recursive:true});
const resultText=JSON.stringify(result,null,2)+'\n';
const resultSha=shaText(resultText);
await writeFile(path.join(OUT,'FORENSIC_RESULT.json'),resultText,{flag:'wx'});
const pointer={run_id:EXPECTED_RUN,forensic_result_sha256:resultSha,input_receipt_index_sha256:receiptIndexSha,original_ledger_sha256:after.sha256,provider_calls:0,authority_effects:'NONE'};
await writeFile(path.join(OUT,'FREEZE_POINTER.json'),JSON.stringify(pointer,null,2)+'\n',{flag:'wx'});
console.log('NSS1_STAGE_F_FORENSIC_COMPLETE',JSON.stringify({...result,forensic_result_sha256:resultSha,freeze_pointer:pointer}));