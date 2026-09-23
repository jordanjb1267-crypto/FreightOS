import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTHORITY_FLOOR, structuralAuthorityFloor } from './authority-floor.mjs';

const ROOT = process.env.C4_STRUCTURAL_FLOOR_HELDOUT_ROOT ?? '/data/nss-c4-structural-authority-floor-heldout-v0.1';
const RUN_ID = 'NSS1-C4-STRUCTURAL-AUTHORITY-FLOOR-HELDOUT-PREFLIGHT-v0.1';
const sha = b => createHash('sha256').update(b).digest('hex');
const issues = [];
const check = (ok, code) => { if (!ok) issues.push(code); };

const eventsBytes = await readFile(path.join(ROOT, 'HELDOUT_EVENTS.json'));
const manifest = JSON.parse(await readFile(path.join(ROOT, 'HELDOUT_MANIFEST.json'), 'utf8'));
const rows = JSON.parse(eventsBytes);
const floorPath = fileURLToPath(new URL('./authority-floor.mjs', import.meta.url));
const floorBytes = await readFile(floorPath);
const floorText = floorBytes.toString('utf8');

check(sha(eventsBytes) === manifest.heldout_events_sha256, 'EVENT_HASH_MISMATCH');
check(sha(floorBytes) === manifest.authority_floor_source_sha256, 'FLOOR_SOURCE_HASH_MISMATCH');
check(rows.length === 96 && manifest.denominator === 96, `DENOMINATOR:${rows.length}`);
check(rows.filter(x => x.expected.structural_positive).length === 48, 'POSITIVE_DENOMINATOR');
check(rows.filter(x => !x.expected.structural_positive).length === 48, 'NEGATIVE_DENOMINATOR');
check(rows.filter(x => x.expected.structural_positive && x.input.planned_freshness === 'FRESH').length === 24, 'POSITIVE_FRESH_DENOMINATOR');
check(rows.filter(x => x.expected.structural_positive && x.input.planned_freshness === 'STALE').length === 24, 'POSITIVE_STALE_DENOMINATOR');

const forbiddenSourcePatterns = [
  /\.family\b/,
  /\bsequence\b/,
  /\bexpected\b/,
  /\bgold\b/i,
  /\bconsequence\b/i,
  /\bevent_id\b/,
  /\btenant_id\b/,
  /\bload_id\b/,
  /\bplanned_freshness\b/,
  /\bprobability\b/,
];
for (const re of forbiddenSourcePatterns) check(!re.test(floorText), `FORBIDDEN_GUARD_SURFACE:${re}`);

const ids = rows.map(x => x.input.event.event_id);
check(new Set(ids).size === rows.length, 'EVENT_ID_DUPLICATE');
check(rows.every(x => !x.input.event.event_id.startsWith('SFE-')), 'STAGE_F_EVENT_ID_REUSE');
check(rows.every(x => !x.input.event.description.includes('Stage-F')), 'STAGE_F_DESCRIPTION_REUSE');
check(rows.every(x => !Object.prototype.hasOwnProperty.call(x.input.event, 'sequence')), 'FIXTURE_SEQUENCE_PRESENT');
check(rows.every(x => !('gold' in x.input) && !('consequence' in x.input)), 'GOLD_OR_CONSEQUENCE_IN_RUNTIME_INPUT');
check(new Set(rows.map(x => JSON.stringify(x.input))).size === rows.length, 'INPUT_BODY_DUPLICATE');

const kindCounts = {};
let conformant = 0;
let positiveConformant = 0;
let negativeConformant = 0;
let identityInvariant = 0;
let familyInvariant = 0;
let orderInvariant = 0;

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  kindCounts[row.expected.kind] = (kindCounts[row.expected.kind] ?? 0) + 1;
  const actual = structuralAuthorityFloor(row.input.pre_state, row.input.event);
  if (actual === row.expected.authority_floor) {
    conformant++;
    if (row.expected.structural_positive) positiveConformant++;
    else negativeConformant++;
  } else issues.push(`GUARD_MISMATCH:${row.input.event.event_id}:${actual}:${row.expected.authority_floor}`);

  const identityMutated = {
    ...row.input.event,
    event_id: `MUT-${i}`,
    tenant_id: `MUT-T${i % 5}`,
    load_id: `MUT-L${i}`,
    description: `Identity-perturbed held-out case ${i}`,
  };
  if (structuralAuthorityFloor(row.input.pre_state, identityMutated) === actual) identityInvariant++;
  else issues.push(`IDENTITY_INVARIANCE:${row.input.event.event_id}`);

  const familyMutated = { ...row.input.event, family: `independent_family_${(i * 13) % 17}` };
  if (structuralAuthorityFloor(row.input.pre_state, familyMutated) === actual) familyInvariant++;
  else issues.push(`FAMILY_INVARIANCE:${row.input.event.event_id}`);

  const entries = Object.entries(row.input.pre_state).reverse();
  const reordered = Object.fromEntries(entries);
  if (structuralAuthorityFloor(reordered, row.input.event) === actual) orderInvariant++;
  else issues.push(`STATE_ORDER_INVARIANCE:${row.input.event.event_id}`);
}

check(conformant === 96, `GUARD_CONFORMANCE:${conformant}`);
check(positiveConformant === 48, `POSITIVE_CONFORMANCE:${positiveConformant}`);
check(negativeConformant === 48, `NEGATIVE_CONFORMANCE:${negativeConformant}`);
check(identityInvariant === 96, `IDENTITY_INVARIANCE_COUNT:${identityInvariant}`);
check(familyInvariant === 96, `FAMILY_INVARIANCE_COUNT:${familyInvariant}`);
check(orderInvariant === 96, `STATE_ORDER_INVARIANCE_COUNT:${orderInvariant}`);
check(rows.every(x => x.expected.authority_floor === null || x.expected.authority_floor === AUTHORITY_FLOOR), 'EXPECTED_FLOOR_DOMAIN');

const result = {
  run_id: RUN_ID,
  status: issues.length ? 'BLOCK' : 'PASS',
  issues,
  heldout_events_sha256: manifest.heldout_events_sha256,
  authority_floor_source_sha256: manifest.authority_floor_source_sha256,
  denominator: 96,
  structural_positive: 48,
  structural_negative: 48,
  positive_fresh: 24,
  positive_stale: 24,
  guard_conformance: conformant,
  positive_conformance: positiveConformant,
  negative_conformance: negativeConformant,
  identity_invariance: identityInvariant,
  family_label_invariance: familyInvariant,
  state_key_order_invariance: orderInvariant,
  kind_counts: kindCounts,
  provider_calls: 0,
  stage_f_provider_replay: false,
  credentials_read: false,
  authority_effects: 'NONE',
  live_effects: 0,
};

const out = path.join(ROOT, 'PREFLIGHT_RESULT.json');
await writeFile(out, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log('NSS1_C4_STRUCTURAL_FLOOR_HELDOUT_PREFLIGHT', JSON.stringify({ ...result, result_sha256: sha(await readFile(out)) }));
if (issues.length) process.exitCode = 2;
