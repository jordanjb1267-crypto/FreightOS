import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const expected={
  routing:'92416080e3a8fa66cf8e9589acbaad311ad674971291e9bc3d95c8e1f225cad3',
  adapter:'d11da109d6c45fb9f0a74414ed1f29f6d5874cd376c641c817a8cd4ff0d6b075',
  manifest:'4f202748b0ca4aaf08eb8388dcb17d985412c356d799d83625da372247699652',
  corpus:'5213178f40142b6673ebe0438b8e7a7651ab12639e399a8af97deb3ddff54b63',
  stateMaterialization:'ed020ff686ec96a304b45fffdae09ba8284f99dc25a276f02de12df83cc9a9a5',
  semanticGold:'00fa3c4514f95c00c81ae3aefb1dd8fdcc42e56acc4b931edc9190350a08ec21'
};
const routing=readFileSync(new URL('./nss1-r1-routing-overlay.json',import.meta.url),'utf8');
const adapter=readFileSync(new URL('./nss1-r1-provider-adapter.json',import.meta.url),'utf8');
const manifest=readFileSync(new URL('./nss1-r1-manifest.json',import.meta.url),'utf8');
const r=JSON.parse(routing),m=JSON.parse(manifest);
const observed={routing:sha(routing),adapter:sha(adapter),manifest:sha(manifest)};
const gates={
  routing_hash:observed.routing===expected.routing,
  adapter_hash:observed.adapter===expected.adapter,
  manifest_hash:observed.manifest===expected.manifest,
  corpus_binding:m.c001_corpus_sha256===expected.corpus,
  state_materialization_binding:m.state_materialization_sha256===expected.stateMaterialization,
  semantic_gold_binding:m.semantic_gold_overlay_sha256===expected.semanticGold,
  routing_binding:m.routing_overlay_sha256===expected.routing,
  adapter_binding:m.provider_adapter_sha256===expected.adapter,
  semantic_count:m.semantic_event_count===208&&r.events.semantic_event_ids.length===208,
  deterministic_count:m.deterministic_event_count===112&&r.events.deterministic_event_ids.length===112,
  call_budget:m.expected_provider_calls.jev===416&&m.expected_provider_calls.luna===352&&m.expected_provider_calls.frontier===0&&m.expected_provider_calls.openrouter===0,
  semantic_change:m.semantic_change===false,
  receipt_boundary:r.receipt_boundary.provider_receipts_before_execution===0&&r.receipt_boundary.immutability_after_receipt_1===true,
  no_authority:m.authority_effects==='NONE'&&m.external_effects==='NONE'
};
const pass=Object.values(gates).every(Boolean);
console.log(JSON.stringify({experiment:'NSS1_STAGE_A_R1_PACKAGE_PREFLIGHT',status:pass?'PASS':'BLOCK',observed,expected,gates,provider_calls:0,authority_effects:'NONE'}));
if(!pass)process.exit(1);
