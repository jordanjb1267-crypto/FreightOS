import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.env.EVIDENCE_DIR ?? '/data/nss1-stage-b-v0.1';
const ARMS = ['control_luna','balanced_7170','aggressive_4098'];
const PROVIDERS = ['luna','jev'];
async function exists(p){try{await readFile(p);return true}catch{return false}}
async function readJson(p){return JSON.parse(await readFile(p,'utf8'))}
async function jsonFiles(dir){try{return (await readdir(dir)).filter(x=>x.endsWith('.json')).sort()}catch{return[]}}
async function summarizeDir(kind,arm,provider){const dir=path.join(ROOT,kind,arm,provider),files=await jsonFiles(dir),statuses={};const ids=[];for(const f of files){const row=await readJson(path.join(dir,f));const status=String(row.status??'UNKNOWN');statuses[status]=(statuses[status]??0)+1;ids.push({file:f,event_id:row.event_id??null,status,started_at:row.started_at??null,finished_at:row.finished_at??null,error:row.error??null})}return{count:files.length,statuses,ids}}
async function main(){const summary={gate:'NSS1_STAGE_B_FORENSIC_READ_ONLY_V0_1',provider_calls_made:0,root:ROOT,files:{pre_receipt_freeze:await exists(path.join(ROOT,'PRE_RECEIPT_FREEZE.json')),control_result:await exists(path.join(ROOT,'CONTROL_LUNA.json')),balanced_result:await exists(path.join(ROOT,'BALANCED_7170.json')),aggressive_result:await exists(path.join(ROOT,'AGGRESSIVE_4098.json')),result:await exists(path.join(ROOT,'RESULT.json')),freeze_pointer:await exists(path.join(ROOT,'FREEZE_POINTER.json'))},arms:{},uncertain_started_without_terminal:[]};
 for(const arm of ARMS){summary.arms[arm]={};for(const provider of PROVIDERS){const attempts=await summarizeDir('attempts',arm,provider),receipts=await summarizeDir('receipts',arm,provider);const receiptNames=new Set(receipts.ids.map(x=>x.file));const uncertain=attempts.ids.filter(x=>!receiptNames.has(x.file));for(const x of uncertain)summary.uncertain_started_without_terminal.push({arm,provider,...x});summary.arms[arm][provider]={attempts:{count:attempts.count,statuses:attempts.statuses},receipts:{count:receipts.count,statuses:receipts.statuses},started_without_terminal:uncertain.length};}}
 if(summary.files.pre_receipt_freeze) summary.pre_receipt_freeze=await readJson(path.join(ROOT,'PRE_RECEIPT_FREEZE.json'));
 if(summary.files.result) summary.result=await readJson(path.join(ROOT,'RESULT.json'));
 if(summary.files.freeze_pointer) summary.freeze_pointer=await readJson(path.join(ROOT,'FREEZE_POINTER.json'));
 console.log('NSS1_STAGE_B_FORENSIC',JSON.stringify(summary));
}
main().catch(e=>{console.error('NSS1_STAGE_B_FORENSIC_BLOCK',e?.stack??String(e));process.exitCode=1});
