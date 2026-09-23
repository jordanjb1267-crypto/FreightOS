import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { callLuna, callJev, PROVIDERS } from './provider-adapters.mjs';

function stable(v){if(Array.isArray(v))return`[${v.map(stable).join(',')}]`;if(v&&typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;return JSON.stringify(v)}
function sha(v){return createHash('sha256').update(stable(v)).digest('hex')}

const RUN_MODE = process.env.RUN_MODE ?? 'preflight';
if (RUN_MODE !== 'execute') throw new Error(`STAGE_F_EXECUTE_ENTRY_REJECTED_MODE:${RUN_MODE}`);

const authPath = process.env.STAGE_F_EXECUTION_AUTHORIZATION_PATH;
if (!authPath) throw new Error('STAGE_F_EXECUTION_AUTHORIZATION_ARTIFACT_REQUIRED');
const auth = JSON.parse(await readFile(authPath, 'utf8'));
if (auth.status !== 'AUTHORIZED_TO_EXECUTE_STAGE_F_PROVIDER_SHADOW') throw new Error('STAGE_F_EXECUTION_NOT_AUTHORIZED');
if (!auth.runner_execution_manifest_sha256 || !auth.preflight_freeze_pointer_sha256 || !auth.verified_stage_f_archive_sha256) throw new Error('STAGE_F_EXECUTION_AUTHORIZATION_INCOMPLETE');

// Credentials are intentionally read only after the separate authorization artifact is validated.
const openaiKey = process.env.OPENAI_API_KEY;
const typesafeKey = process.env.TYPESAFE_API_KEY;
if (!openaiKey || !typesafeKey) throw new Error('STAGE_F_PROVIDER_CREDENTIALS_MISSING_AFTER_AUTHORIZATION');

export const EXECUTION_SURFACE = Object.freeze({
  authorization_sha256: sha(auth),
  providers: PROVIDERS,
  callLuna,
  callJev
});

console.log('NSS1_STAGE_F_EXECUTE_ENTRY_AUTHORIZATION_ACCEPTED', JSON.stringify({
  authorization_sha256: sha(auth),
  runner_execution_manifest_sha256: auth.runner_execution_manifest_sha256,
  preflight_freeze_pointer_sha256: auth.preflight_freeze_pointer_sha256,
  verified_stage_f_archive_sha256: auth.verified_stage_f_archive_sha256,
  provider_calls_made: 0,
  note: 'This entrypoint validates execution authorization and exposes the bound provider adapters; provider-loop activation requires the separately frozen execution program.'
}));
