import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

globalThis.fetch = async () => { throw new Error('STAGE_F_JEV422_DIAG_NETWORK_PROHIBITED'); };

const ROOT = process.env.EVIDENCE_DIR ?? '/data/nss1-stage-f-provider-v0.2';
const OUT = process.env.JEV422_DIAG_OUT ?? '/data/nss1-stage-f-jev422-diagnosis-v0.1';
const RAW = path.join(ROOT,'raw','jev');
const RECEIPTS = path.join(ROOT,'receipts','jev');
const EXPECTED_COUNT = 160;
const shaBuf = b => createHash('sha256').update(b).digest('hex');
const shaText = s => shaBuf(Buffer.from(s));
const exists = async p => { try { await stat(p); return true; } catch { return false; } };
const stable = v => Array.isArray(v) ? `[${v.map(stable).join(',')}]` : (v && typeof v==='object') ? `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v);
const inc=(m,k)=>{m[k]=(m[k]??0)+1};

if(!(await exists(RAW)) || !(await exists(RECEIPTS))) throw new Error('JEV422_LEDGER_MISSING');
const files=(await readdir(RAW)).filter(x=>x.endsWith('.txt')).sort();
const exactBodies={}, schemaClasses={}, httpErrors={}, samples={};
let parseFailures=0, receiptMismatches=0;
const perEvent=[];

function schemaKey(parsed){
  if(Array.isArray(parsed?.detail)){
    const d=parsed.detail.map(x=>({loc:x?.loc??null,msg:x?.msg??null,type:x?.type??null,url:x?.url??null,ctx:x?.ctx??null}));
    return stable({detail:d});
  }
  if(parsed && typeof parsed==='object'){
    const copy={...parsed}; delete copy.input; delete copy.state; delete copy.questions;
    return stable(copy);
  }
  return stable(parsed);
}

for(const f of files){
  const eventId=f.slice(0,-4); const p=path.join(RAW,f); const b=await readFile(p); const body=b.toString('utf8'); const bodySha=shaBuf(b); inc(exactBodies,bodySha);
  let parsed=null; try{parsed=JSON.parse(body)}catch{parseFailures++;}
  const key=parsed===null?'NON_JSON':schemaKey(parsed); inc(schemaClasses,key); if(!(key in samples)) samples[key]=body.slice(0,4000);
  const rp=path.join(RECEIPTS,`${eventId}.json`); if(await exists(rp)){
    const r=JSON.parse(await readFile(rp,'utf8')); if(r.raw_response_sha256!==bodySha||r.status!=='PROVIDER_ERROR'||r.error!=='JEV_422')receiptMismatches++;
    inc(httpErrors,`${r.status}|${r.error}|${r.effective_model??'null'}`);
  } else receiptMismatches++;
  perEvent.push({event_id:eventId,raw_sha256:bodySha,schema_class_sha256:shaText(key)});
}

const result={
  status:(files.length===EXPECTED_COUNT&&parseFailures===0&&receiptMismatches===0)?'PASS':'BLOCK',
  provider_calls:0,network_calls:0,authority_effects:'NONE',
  input_root:ROOT,
  raw_body_count:files.length,
  parse_failures:parseFailures,
  receipt_mismatches:receiptMismatches,
  unique_exact_raw_bodies:Object.keys(exactBodies).length,
  exact_body_histogram:exactBodies,
  unique_validation_schema_classes:Object.keys(schemaClasses).length,
  validation_schema_class_histogram:schemaClasses,
  validation_schema_samples:samples,
  receipt_error_histogram:httpErrors,
  per_event:perEvent
};
await mkdir(OUT,{recursive:true});
const text=JSON.stringify(result,null,2)+'\n'; const resultSha=shaText(text);
await writeFile(path.join(OUT,'JEV422_DIAGNOSIS.json'),text,{flag:'wx'});
await writeFile(path.join(OUT,'FREEZE_POINTER.json'),JSON.stringify({result_sha256:resultSha,raw_body_count:files.length,provider_calls:0,authority_effects:'NONE'},null,2)+'\n',{flag:'wx'});
console.log('NSS1_STAGE_F_JEV422_DIAGNOSIS_COMPLETE',JSON.stringify({...result,per_event:undefined,result_sha256:resultSha}));