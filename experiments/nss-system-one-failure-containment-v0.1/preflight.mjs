import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

globalThis.fetch = async () => { throw new Error('S1FC_PREFLIGHT_NETWORK_PROHIBITED'); };

const ROOT = process.env.S1FC_FIXTURE_ROOT ?? '/data/nss-system-one-failure-containment-fixture-v0.1';
const RUN_ID = 'NSS1-SYSTEM-ONE-FAILURE-CONTAINMENT-PREFLIGHT-v0.1';
const AUTHORITY = 'HUMAN_OR_EXTERNAL_AUTHORITY_REQUIRED';
const STATUSES = ['OK','PROVIDER_ERROR','TIMEOUT','SCHEMA_INVALID','MODEL_VERSION_MISMATCH','ORCHESTRATION_UNCERTAIN'];
const stable = v => Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v);
const sha = b => createHash('sha256').update(b).digest('hex');
const check = (issues,ok,code) => { if(!ok) issues.push(code); };

function floor(pre,event){
  const p=event?.patch??{};
  if(p.seal_status==='DISCREPANCY'&&pre?.seal_status!=='DISCREPANCY')return AUTHORITY;
  if(p.receiver_identity_status==='CONFLICT'&&pre?.receiver_identity_status!=='CONFLICT')return AUTHORITY;
  if(Object.prototype.hasOwnProperty.call(p,'factor_assignment')&&pre?.factor_assignment!=null&&p.factor_assignment!=null&&p.factor_assignment!==pre.factor_assignment)return AUTHORITY;
  return null;
}

const fixtureBytes = await readFile(path.join(ROOT,'FIXTURE.json'));
const manifest = JSON.parse(await readFile(path.join(ROOT,'MANIFEST.json'),'utf8'));
const rows = JSON.parse(fixtureBytes);
const issues=[];
const ids=new Set();
const counts={positive:0,negative:0};
const byClassStatus={};
let guardConformance=0, identityInvariant=0, labelInvariant=0, keyOrderInvariant=0, binding=0;

check(issues,sha(fixtureBytes)===manifest.fixture_sha256,'FIXTURE_MANIFEST_HASH');
check(issues,rows.length===96,'DENOMINATOR');
for(const row of rows){
  const positive=row.expected?.structural_positive===true;
  positive?counts.positive++:counts.negative++;
  const status=row.simulated_semantic_execution?.status;
  const key=`${positive?'P':'N'}:${status}`;
  byClassStatus[key]=(byClassStatus[key]??0)+1;
  check(issues,STATUSES.includes(status),`UNKNOWN_STATUS:${row.case_id}:${status}`);
  check(issues,!ids.has(row.case_id),`DUPLICATE_ID:${row.case_id}`);ids.add(row.case_id);
  if(row.pre_state?.tenant_id===row.event?.tenant_id&&row.pre_state?.load_id===row.event?.load_id)binding++;
  const fires=floor(row.pre_state,row.event)===AUTHORITY;
  if(fires===positive)guardConformance++;
  if(status==='OK')check(issues,typeof row.simulated_semantic_execution?.selected_work_response==='string','OK_SELECTION_MISSING');
  else check(issues,row.simulated_semantic_execution?.selected_work_response==null,'NON_OK_HAS_SELECTION');

  const idMut={...row.event,event_id:`mut-${row.event.event_id}`};
  if((floor(row.pre_state,idMut)===AUTHORITY)===fires)identityInvariant++;
  const labelMut={...row,expected:{...row.expected,kind:`mut-${row.expected.kind}`}};
  if((floor(labelMut.pre_state,labelMut.event)===AUTHORITY)===fires)labelInvariant++;
  const reversedPre=Object.fromEntries(Object.entries(row.pre_state).reverse());
  const reversedEvent={...row.event,patch:Object.fromEntries(Object.entries(row.event.patch).reverse())};
  if((floor(reversedPre,reversedEvent)===AUTHORITY)===fires)keyOrderInvariant++;
}
check(issues,counts.positive===48&&counts.negative===48,`CLASS_COUNTS:${counts.positive}:${counts.negative}`);
for(const cls of ['P','N'])for(const status of STATUSES)check(issues,byClassStatus[`${cls}:${status}`]===8,`STATUS_COUNT:${cls}:${status}:${byClassStatus[`${cls}:${status}`]??0}`);
check(issues,binding===96,`STATE_EVENT_BINDING:${binding}`);
check(issues,guardConformance===96,`GUARD_CONFORMANCE:${guardConformance}`);
check(issues,identityInvariant===96,`IDENTITY_INVARIANCE:${identityInvariant}`);
check(issues,labelInvariant===96,`LABEL_INVARIANCE:${labelInvariant}`);
check(issues,keyOrderInvariant===96,`KEY_ORDER_INVARIANCE:${keyOrderInvariant}`);

const result={
  run_id:RUN_ID,
  status:issues.length?'BLOCK':'PASS',
  issues,
  fixture_sha256:sha(fixtureBytes),
  denominator:rows.length,
  structural_positive:counts.positive,
  structural_negative:counts.negative,
  by_class_status:byClassStatus,
  state_event_binding:binding,
  deterministic_guard_conformance:guardConformance,
  identity_invariance:identityInvariant,
  label_invariance:labelInvariant,
  key_order_invariance:keyOrderInvariant,
  network_calls:0,
  credential_reads:0,
  provider_replay:false,
  authority_effects:'NONE',
  live_effects:0
};
const text=stable(result);
await writeFile(path.join(ROOT,'PREFLIGHT_RESULT.json'),text,{flag:'wx'});
console.log('NSS1_S1FC_PREFLIGHT',JSON.stringify({...result,preflight_result_sha256:sha(Buffer.from(text))}));
if(issues.length)process.exitCode=2;
