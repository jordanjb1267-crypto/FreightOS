import { describe, expect, it } from 'vitest';
import {
  DURABLE_SCHEMA_NAMESPACE,
  listRegisteredSchemas,
  N3_EVENT_CORRECTION_DURABLE_REF,
  N3_EVENT_CORRECTION_ID,
  NETWORK_EVENT_TYPE_PATTERN,
  resolveDurableRef,
  UnknownSchemaError,
  V1_2_EVENT_ENVELOPE_ID,
  V1_4_LOGISTICS_OBJECT_REFERENCE_ID,
  V1_4_NETWORK_EVENT_ENVELOPE_DURABLE_REF,
  validateAgainstDurableRef,
  validateN3EventCorrection,
} from '../../src/network.ts';

/**
 * N3 — durable schema references, the network type namespace, and the correction contract.
 *
 * WHY DURABLE REFERENCES EXIST AT ALL. The eight v1.4 contracts are protected handoff artifacts and
 * carry `$id`s under `schemas.freightos.example` — a namespace reserved by RFC 2606 for
 * documentation and testing. `network_events` is permanently immutable, so a `schema_ref` written
 * into it is a forever reference. Freezing a documentation namespace into forever references was
 * rejected by the owner, and editing the protected artifacts to change their `$id` was equally
 * unavailable. The resolution is a NAMING LAYER: a durable reference under the owner-controlled
 * `rigreceipts.com`, DERIVED from the protected `$id` rather than hand-written, resolving to the
 * same bytes. This file is where "derived, not invented" stops being a comment.
 *
 * DURABLE REFERENCES ARE PERMANENT PROTOCOL IDENTITIES. A future product or company rename is not
 * authorization to rewrite them. The tests below therefore pin the exact namespace string: if
 * someone renames it, this file fails and the failure is the conversation.
 *
 * ANTI-VACUITY. Every refusal below is paired with an acceptance over the same call, and
 * `the correction validator discriminates` runs first, so a validator wired to nothing — or one
 * that returned `true` unconditionally — cannot leave this file green.
 */

/** A correction payload that satisfies the governed contract in full. */
const VALID_CORRECTION = {
  corrected_event_id: '018f3a4b-0000-7000-8000-000000000001',
  replacement_event_id: '018f3a4b-0000-7000-8000-000000000002',
  reason: 'the observed weight was transposed',
  effective_at: '2026-08-10T12:00:00Z',
} as const;

describe('the durable schema namespace', () => {
  it('is the owner-controlled production domain, pinned exactly', () => {
    expect(DURABLE_SCHEMA_NAMESPACE).toBe('https://schemas.rigreceipts.com/network/');
    // The one thing that must never be true again.
    expect(DURABLE_SCHEMA_NAMESPACE).not.toContain('.example');
  });

  it('gives every contract a durable reference, and every reference is unique', () => {
    const all = listRegisteredSchemas();
    expect(all.length).toBeGreaterThan(1);
    for (const entry of all) {
      expect(entry.durableRef, `${entry.id} has no durable reference`).toBeTruthy();
    }
    const refs = all.map((s) => s.durableRef);
    // Two contracts sharing a durable reference would make `schema_ref` ambiguous in a table that
    // can never be corrected in place.
    expect(new Set(refs).size).toBe(refs.length);
  });

  it('derives each durable reference from the protected $id — it does not invent them', () => {
    // The mapping is not a hand-maintained table. Asserting the derivation is what keeps a
    // hand-edit from silently repointing one contract's durable name at another's bytes.
    for (const entry of listRegisteredSchemas().filter((s) => s.layer === 'v1.4')) {
      const slug = entry.id.slice(entry.id.lastIndexOf('/') + 1);
      expect(entry.durableRef).toBe(`${DURABLE_SCHEMA_NAMESPACE}${slug}`);
      // The slug carries the contract name AND its major version, so v1 and a future v2 can never
      // collapse onto one durable reference.
      expect(slug).toMatch(/^[a-z0-9-]+\.v\d+\.json$/);
    }
  });

  it('puts every reference a network event can carry under the production namespace', () => {
    for (const entry of listRegisteredSchemas().filter((s) => s.layer !== 'v1.2')) {
      expect(entry.durableRef.startsWith(DURABLE_SCHEMA_NAMESPACE)).toBe(true);
    }
  });

  it('mints NO production alias for the v1.2 envelope, deliberately', () => {
    // ADR-N0007 Option B: v1.2 is a peer contract, internal, and never referenced by a network
    // event. A durable alias would advertise it as part of the network protocol surface. Its
    // durable reference is therefore its own canonical id — the honest statement that it has none.
    const v12 = listRegisteredSchemas().find((s) => s.layer === 'v1.2');
    expect(v12).toBeDefined();
    expect(v12!.durableRef).toBe(V1_2_EVENT_ENVELOPE_ID);
    expect(v12!.durableRef.startsWith(DURABLE_SCHEMA_NAMESPACE)).toBe(false);
  });

  it('registers the N3 correction contract with id and durable reference coinciding', () => {
    // Authored under the production namespace from the start, because it is a NEW N3 contract and
    // not a protected artifact — so there is nothing to alias.
    const entry = resolveDurableRef(N3_EVENT_CORRECTION_DURABLE_REF);
    expect(entry.id).toBe(N3_EVENT_CORRECTION_ID);
    expect(entry.durableRef).toBe(entry.id);
    expect(entry.layer).toBe('n3');
    expect(entry.artifactClass).toBe('event-correction');
    expect(entry.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('durable reference resolution', () => {
  it('resolves a v1.4 contract through its durable reference to the protected bytes', () => {
    const entry = resolveDurableRef(V1_4_NETWORK_EVENT_ENVELOPE_DURABLE_REF);
    expect(entry.id).toBe('https://schemas.freightos.example/network/event-envelope.v1.json');
    expect(entry.path).toContain('docs/production-handoff');
    expect(entry.layer).toBe('v1.4');
  });

  it('fails closed on an unregistered reference', () => {
    expect(() => resolveDurableRef(`${DURABLE_SCHEMA_NAMESPACE}invented.v1.json`)).toThrow(
      UnknownSchemaError,
    );
    expect(() => resolveDurableRef('')).toThrow(UnknownSchemaError);
    expect(() => resolveDurableRef('http://schemas.rigreceipts.com/network/event-envelope.v1.json'))
      .toThrow(UnknownSchemaError);
  });

  it('will not accept a documentation-namespace id where a durable reference is required', () => {
    // THE POINT OF THE WHOLE NAMING LAYER. `schema_ref` is a durable reference, and the protected
    // `$id` is not one. If the canonical `.example` id resolved here, a producer could write the
    // documentation namespace into the permanent journal by using the other spelling.
    expect(() => resolveDurableRef(V1_4_LOGISTICS_OBJECT_REFERENCE_ID)).toThrow(UnknownSchemaError);
    expect(() =>
      resolveDurableRef('https://schemas.freightos.example/network/event-envelope.v1.json'),
    ).toThrow(UnknownSchemaError);
  });

  it('validates through a durable reference, and discriminates', () => {
    const ref = `${DURABLE_SCHEMA_NAMESPACE}logistics-object-reference.v1.json`;
    expect(
      validateAgainstDurableRef(ref, { network_id: 'obj-00000001', object_type: 'shipment' }).valid,
    ).toBe(true);
    expect(validateAgainstDurableRef(ref, { network_id: 'obj-00000001' }).valid).toBe(false);
    expect(validateAgainstDurableRef(ref, {}).valid).toBe(false);
  });

  it('refuses to validate against a reference it cannot resolve', () => {
    // Not "valid because unknown". An unresolvable contract is a refusal, not a pass.
    expect(() => validateAgainstDurableRef(`${DURABLE_SCHEMA_NAMESPACE}nope.v1.json`, {})).toThrow(
      UnknownSchemaError,
    );
  });
});

describe('the network event type namespace', () => {
  it('accepts the governed reverse-DNS shape', () => {
    for (const type of [
      'com.rigreceipts.network.shipment.arrived.v1',
      'com.rigreceipts.network.gate.scan.v12',
      'com.rigreceipts.network.a.v1',
      'com.rigreceipts.network.some_event-name.v2',
    ]) {
      expect(NETWORK_EVENT_TYPE_PATTERN.test(type), type).toBe(true);
    }
  });

  it('refuses the v1.2 vocabulary, foreign roots and unversioned types', () => {
    for (const type of [
      'rig.freight.shipment.created.v1', // the v1.2 vocabulary — ADR-N0007 keeps them separate
      'com.freightos.network.shipment.arrived.v1', // a namespace the owner does not control
      'com.rigreceipts.shipment.arrived.v1', // not under `.network.`
      'com.rigreceipts.network.shipment.arrived', // unversioned
      'com.rigreceipts.network.Shipment.Arrived.v1', // uppercase
      'com.rigreceipts.network..v1', // empty semantic segment
      'com.rigreceipts.network.shipment.arrived.v1 ', // trailing space
      ' com.rigreceipts.network.shipment.arrived.v1',
      'com.rigreceipts.network.shipment.arrived.vX',
      '',
    ]) {
      expect(NETWORK_EVENT_TYPE_PATTERN.test(type), type).toBe(false);
    }
  });

  it('is anchored at both ends, so a governed type cannot be smuggled inside a longer string', () => {
    expect(NETWORK_EVENT_TYPE_PATTERN.test('x com.rigreceipts.network.a.v1')).toBe(false);
    expect(NETWORK_EVENT_TYPE_PATTERN.test('com.rigreceipts.network.a.v1\nevil')).toBe(false);
  });
});

describe('the N3 event correction contract', () => {
  it('the correction validator discriminates', () => {
    // Run first and deliberately minimal: if this pair cannot separate, nothing below means
    // anything. This is the control the N1 CI defect taught us to write.
    expect(validateN3EventCorrection(VALID_CORRECTION).valid).toBe(true);
    expect(validateN3EventCorrection({}).valid).toBe(false);
  });

  it('requires all four fields — each one individually', () => {
    for (const field of Object.keys(VALID_CORRECTION)) {
      const without = { ...VALID_CORRECTION } as Record<string, unknown>;
      delete without[field];
      const outcome = validateN3EventCorrection(without);
      expect(outcome.valid, `dropping ${field} was accepted`).toBe(false);
      expect(outcome.errors.map((e) => e.message).join(' ')).toContain(field);
    }
  });

  it('is a LINEAGE STATEMENT and carries no replacement content or delegated authority', () => {
    // The owner's ruling, enforced by `additionalProperties: false` rather than by convention:
    // a correction relates two already-accepted facts. It does not carry the new truth, and it
    // does not name who authorised it — `organization_id` on the envelope and the journal's
    // trusted `accepted_by` already record both provenance layers.
    for (const smuggled of [
      { correcting_authority: 'org:someone' },
      { superseding_data: { weight_kg: 42 } },
      { authority_mode: 'carrier_agent' },
      { tenant_id: '018f3a4b-0000-7000-8000-000000000009' },
    ]) {
      expect(
        validateN3EventCorrection({ ...VALID_CORRECTION, ...smuggled }).valid,
        JSON.stringify(smuggled),
      ).toBe(false);
    }
  });

  it('refuses the journal COLUMN spelling of the lineage field', () => {
    // `corrects_event_id` is the column; `corrected_event_id` is the contract. They differ by one
    // participle, and reading the payload with the column's spelling yields `undefined` silently.
    // The contract refuses the wrong spelling outright, so the mistake cannot reach the journal.
    const { corrected_event_id: id, ...rest } = VALID_CORRECTION;
    expect(validateN3EventCorrection({ ...rest, corrects_event_id: id }).valid).toBe(false);
  });

  it('demands real uuids and a real timestamp', () => {
    expect(
      validateN3EventCorrection({ ...VALID_CORRECTION, corrected_event_id: 'not-a-uuid' }).valid,
    ).toBe(false);
    expect(
      validateN3EventCorrection({ ...VALID_CORRECTION, replacement_event_id: '' }).valid,
    ).toBe(false);
    expect(
      validateN3EventCorrection({ ...VALID_CORRECTION, effective_at: 'last tuesday' }).valid,
    ).toBe(false);
    // …and a reason that actually says something.
    expect(validateN3EventCorrection({ ...VALID_CORRECTION, reason: '' }).valid).toBe(false);
  });

  it('does not resolve the correction contract by accident from a v1.4 durable reference', () => {
    // Each contract validates only its own shape. A correction payload is not an object reference
    // and must not pass as one, or `schema_ref` would stop meaning anything.
    const objectRef = `${DURABLE_SCHEMA_NAMESPACE}logistics-object-reference.v1.json`;
    expect(validateAgainstDurableRef(objectRef, VALID_CORRECTION).valid).toBe(false);
    expect(
      validateAgainstDurableRef(N3_EVENT_CORRECTION_DURABLE_REF, {
        network_id: 'obj-00000001',
        object_type: 'shipment',
      }).valid,
    ).toBe(false);
  });
});
