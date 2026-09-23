import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT='experiments/nss-stage-f-r1-c4-false-safe-forensic';
const files={
  authorization:await readFile(path.join(ROOT,'STAGE_F_R1_C4_FALSE_SAFE_FORENSIC_ATTRIBUTION_AUTHORIZATION_v0.1.md'),'utf8'),
  analyze:await readFile(path.join(ROOT,'analyze.mjs'),'utf8'),
  verify:await readFile(path.join(ROOT,'verify.mjs'),'utf8'),
  entry:await readFile(path.join(ROOT,'railway-entry.mjs'),'utf8')
};
const issues=[];const check=(ok,code)=>{if(!ok)issues.push(code)};
for(const [name,text] of Object.entries({analyze:files.analyze,verify:files.verify})){
  check(!text.includes('callJev('),`${name}:JEV_CALL_SURFACE`);
  check(!text.includes('callLuna('),`${name}:LUNA_CALL_SURFACE`);
  check(!text.includes('OpenRouter'),`${name}:OPENROUTER_SURFACE`);
  check(!text.includes('TYPESAFE_API_KEY'),`${name}:TYPESAFE_CREDENTIAL_SURFACE`);
  check(!text.includes('OPENAI_API_KEY'),`${name}:OPENAI_CREDENTIAL_SURFACE`);
  check(!text.includes('process.env.OpenRouter_API_KEY'),`${name}:OPENROUTER_CREDENTIAL_SURFACE`);
}
check(files.entry.includes("globalThis.fetch = async () => { throw new Error('STAGE_F_R1_C4_FORENSIC_NETWORK_PROHIBITED'); };"),'ENTRY_NETWORK_DISABLE');
check(files.entry.indexOf('host-evidence-loader.mjs')<files.entry.indexOf('globalThis.fetch'),'ENTRY_ARCHIVE_BEFORE_NETWORK_DISABLE');
check(files.analyze.includes("PHASE_V_VERIFIED_AFTER_TYPED_GATE_COMPARATOR_REPAIR"),'ANALYZE_TYPED_REPAIR_DEPENDENCY');
check(files.analyze.includes("c4Ids.length===48"),'ANALYZE_C4_48');
check(files.analyze.includes("falseSafe.length===23"),'ANALYZE_C4_FALSE_SAFE_23');
check(files.analyze.includes("correct.length===25"),'ANALYZE_C4_CORRECT_25');
check(files.verify.includes("fs.length===23"),'VERIFY_C4_FALSE_SAFE_23');
check(files.verify.includes("exact.length===25"),'VERIFY_C4_EXACT_25');
check(files.authorization.includes('Jev = 0')&&files.authorization.includes('Luna = 0')&&files.authorization.includes('frontier = 0'),'AUTHORIZATION_ZERO_PROVIDER');
check(files.authorization.includes('No guard may use consequence-class gold itself as an execution predicate.'),'AUTHORIZATION_GOLD_LEAKAGE_RULE');
const result={run_id:'NSS1-STAGE-F-R1-C4-FALSE-SAFE-FORENSIC-PREFLIGHT-v0.1',status:issues.length?'BLOCK':'PASS',issues,provider_calls:0,credentials_read:false,authority_effects:'NONE'};
console.log('NSS1_STAGE_F_R1_C4_FORENSIC_PREFLIGHT',JSON.stringify(result));if(issues.length)process.exitCode=2;
