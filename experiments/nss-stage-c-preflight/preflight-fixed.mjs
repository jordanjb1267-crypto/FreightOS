import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('./preflight.mjs', import.meta.url), 'utf8');
const needle = "return{initial_states:initial,events,final_states,semantic_count:semanticCount,total_count:events.length}";
const replacement = "return{initial_states:initial,events,final_states:finalStates,semantic_count:semanticCount,total_count:events.length}";
if (!src.includes(needle)) throw new Error('EXPECTED_PREFLIGHT_PATCH_TARGET_NOT_FOUND');
const patched = src.replace(needle, replacement);
if (patched === src) throw new Error('PREFLIGHT_PATCH_NOT_APPLIED');
await import(`data:text/javascript;base64,${Buffer.from(patched).toString('base64')}`);
