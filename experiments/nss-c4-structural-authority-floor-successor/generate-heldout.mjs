import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTHORITY_FLOOR } from './authority-floor.mjs';

const OUT_ROOT = process.env.C4_STRUCTURAL_FLOOR_HELDOUT_ROOT ?? '/data/nss-c4-structural-authority-floor-heldout-v0.1';
const RUN_ID = 'NSS1-C4-STRUCTURAL-AUTHORITY-FLOOR-HELDOUT-GENERATION-v0.1';
const sha = b => createHash('sha256').update(b).digest('hex');

function rotateObject(obj, n) {
  const entries = Object.entries(obj);
  const k = entries.length ? n % entries.length : 0;
  return Object.fromEntries(entries.slice(k).concat(entries.slice(0, k)));
}

function baseState(i) {
  const raw = {
    appointment_revision: 700 + i,
    detention_minutes: (i * 17) % 241,
    dispatch_revision: 900 + i,
    equipment_status: i % 4 === 0 ? 'INSPECTION' : 'AVAILABLE',
    factor_assignment: `HF_BASE_${1000 + i}`,
    gate_status: i % 3 === 0 ? 'PENDING' : 'OPEN',
    hos_minutes_remaining: 220 + ((i * 31) % 260),
    invoice_status: i % 2 === 0 ? 'PENDING' : 'NOT_CREATED',
    location_index: 6000 + i * 13,
    pod_status: 'NOT_RECEIVED',
    receiver_identity_status: i % 2 === 0 ? 'MATCH' : 'VERIFIED',
    seal_status: i % 2 === 0 ? 'MATCH' : 'INTACT',
    status: 'IN_TRANSIT',
    temperature_f: 34 + (i % 15),
    version: 100 + i,
  };
  return rotateObject(raw, i);
}

function makeInput(i, kind, patch, expectedGuard, plannedFreshness) {
  const tenant = `HFT${1 + (i % 8)}`;
  const load = `${tenant}-HX${100 + i}`;
  const eventId = `HFS1-${String(i + 1).padStart(3, '0')}`;
  const preState = baseState(i);
  const event = {
    event_id: eventId,
    event_type: 'SEMANTIC',
    family: `heldout_${kind}`,
    tenant_id: tenant,
    load_id: load,
    description: `Fresh held-out authority-floor case ${i + 1}: ${kind}; independent nonce H1-${70000 + i * 37}.`,
    patch,
  };
  return {
    input: { pre_state: preState, event, planned_freshness: plannedFreshness },
    expected: { authority_floor: expectedGuard ? AUTHORITY_FLOOR : null, structural_positive: expectedGuard, kind },
  };
}

const rows = [];
let i = 0;

for (let n = 0; n < 16; n++, i++) {
  const pre = baseState(i);
  rows.push(makeInput(i, 'seal_transition_to_discrepancy', { seal_status: 'DISCREPANCY' }, true, n % 2 === 0 ? 'FRESH' : 'STALE'));
  rows.at(-1).input.pre_state.seal_status = pre.seal_status === 'DISCREPANCY' ? 'MATCH' : pre.seal_status;
}
for (let n = 0; n < 16; n++, i++) {
  const pre = baseState(i);
  rows.push(makeInput(i, 'receiver_transition_to_conflict', { receiver_identity_status: 'CONFLICT' }, true, n % 2 === 0 ? 'FRESH' : 'STALE'));
  rows.at(-1).input.pre_state.receiver_identity_status = pre.receiver_identity_status === 'CONFLICT' ? 'MATCH' : pre.receiver_identity_status;
}
for (let n = 0; n < 16; n++, i++) {
  const pre = baseState(i);
  const next = `HF_NEXT_${2000 + i}`;
  rows.push(makeInput(i, 'factor_reassignment', { factor_assignment: next }, true, n % 2 === 0 ? 'FRESH' : 'STALE'));
  rows.at(-1).input.pre_state.factor_assignment = pre.factor_assignment;
}

for (let n = 0; n < 8; n++, i++) {
  const row = makeInput(i, 'seal_noncritical_control', { seal_status: n % 2 === 0 ? 'MATCH' : 'INTACT' }, false, n % 2 === 0 ? 'FRESH' : 'STALE');
  row.input.pre_state.seal_status = row.input.event.patch.seal_status;
  rows.push(row);
}
for (let n = 0; n < 8; n++, i++) {
  const row = makeInput(i, 'receiver_noncritical_control', { receiver_identity_status: n % 2 === 0 ? 'MATCH' : 'VERIFIED' }, false, n % 2 === 0 ? 'FRESH' : 'STALE');
  row.input.pre_state.receiver_identity_status = row.input.event.patch.receiver_identity_status;
  rows.push(row);
}
for (let n = 0; n < 8; n++, i++) {
  const row = makeInput(i, 'factor_unchanged_control', {}, false, n % 2 === 0 ? 'FRESH' : 'STALE');
  row.input.event.patch.factor_assignment = row.input.pre_state.factor_assignment;
  rows.push(row);
}

const residualPatches = [
  ['temperature_context', j => ({ temperature_f: 36 + (j % 8) })],
  ['appointment_revision', j => ({ appointment_revision: 1200 + j })],
  ['detention_update', j => ({ detention_minutes: 40 + j * 3 })],
  ['location_update', j => ({ location_index: 8000 + j * 19 })],
  ['pod_status_update', j => ({ pod_status: j % 2 ? 'RECEIVED' : 'NOT_RECEIVED' })],
  ['gate_status_update', j => ({ gate_status: j % 2 ? 'OPEN' : 'PENDING' })],
];
for (let n = 0; n < 24; n++, i++) {
  const [kind, fn] = residualPatches[n % residualPatches.length];
  rows.push(makeInput(i, `residual_${kind}`, fn(n), false, n % 3 === 0 ? 'STALE' : 'FRESH'));
}

if (rows.length !== 96) throw new Error(`HELDOUT_DENOMINATOR:${rows.length}`);

const source = fileURLToPath(new URL('./authority-floor.mjs', import.meta.url));
const floorBytes = await readFile(source);
const eventsBytes = Buffer.from(JSON.stringify(rows, null, 2) + '\n');
const manifest = {
  run_id: RUN_ID,
  status: 'HELDOUT_GENERATED_UNVERIFIED',
  fixture_version: 'v0.1',
  generation_mode: 'FRESH_SYNTHETIC_POST_PREREGISTRATION',
  denominator: 96,
  structural_positive: 48,
  structural_negative: 48,
  positive_fresh: 24,
  positive_stale: 24,
  provider_calls_authorized: false,
  stage_f_exact_replay_authorized: false,
  authority_floor: AUTHORITY_FLOOR,
  authority_floor_source_sha256: sha(floorBytes),
  heldout_events_sha256: sha(eventsBytes),
};

await mkdir(OUT_ROOT, { recursive: false });
await writeFile(path.join(OUT_ROOT, 'HELDOUT_EVENTS.json'), eventsBytes, { flag: 'wx' });
await writeFile(path.join(OUT_ROOT, 'HELDOUT_MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
console.log('NSS1_C4_STRUCTURAL_FLOOR_HELDOUT_GENERATED', JSON.stringify(manifest));
