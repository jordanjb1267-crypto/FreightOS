import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isLogisticsObjectReference,
  listRegisteredSchemas,
  resolveSchema,
  UnknownSchemaError,
  V1_2_EVENT_ENVELOPE_ID,
  V1_4_NETWORK_EVENT_ENVELOPE_ID,
  validateAgainst,
  validateV12EventEnvelope,
  validateV14LogisticsObjectReference,
  validateV14NetworkEventEnvelope,
} from '../../src/network.ts';

/**
 * N2 — the schema registry and the compatibility boundary between v1.2 and v1.4.
 *
 * ADR-N0007 chose Option B: the two event envelopes are DISTINCT VERSIONED CONTRACTS and neither
 * supersedes the other. That is a claim about two schemas, and this file is where it stops being a
 * claim: the two identities differ, their required sets are disjoint in both directions, and both
 * set `additionalProperties: false`, so a payload valid under one is REJECTED by the other. The
 * mutual rejection is the accepted boundary, not a defect to be smoothed over by widening either
 * contract.
 *
 * WHY THE CONTROLS MATTER HERE SPECIFICALLY. The N1 CI defect was a test oracle that could not
 * distinguish the states it claimed to grade. A schema suite is unusually easy to write that way:
 * a validator that returned `true` for everything, or one wired to the wrong file, would pass every
 * success-only fixture in this file. So every rejection case below is paired with an acceptance
 * case over the same validator, and `the validator discriminates` proves the validation dimension
 * can actually change before any other assertion relies on it.
 */

/** A representative v1.2 envelope — every required attribute, legal class/context pairing. */
const V1_2_ENVELOPE = {
  specversion: '1.0',
  id: 'e1f8a0d2-0d6a-4a1e-8f36-2b9a1c4d7e55',
  type: 'rig.freight.shipment.created.v1',
  source: '/freightos/test',
  time: '2026-08-10T12:00:00Z',
  tenantid: '11111111-1111-4111-8111-111111111111',
  legalentityid: '33333333-3333-4333-8333-333333333333',
  legalauthorityclass: 'carrier_agent',
  operatingcontext: 'carrier',
  actorid: 'user:11111111-1111-4111-8111-111111111111',
  correlationid: 'c1f8a0d2-0d6a-4a1e-8f36-2b9a1c4d7e55',
  purpose: 'service_operation',
  data: {},
} as const;

/** A representative v1.4 network envelope — including a `subject` of object references. */
const V1_4_ENVELOPE = {
  specversion: '1.0',
  id: 'evt-0001',
  type: 'com.freightos.shipment.arrived.v1',
  source: 'urn:freightos:test',
  subject: [{ network_id: 'obj-00000001', object_type: 'shipment' }],
  time: '2026-08-10T12:00:00Z',
  recorded_at: '2026-08-10T12:00:01Z',
  organization_id: 'org-0001',
  classification: 'internal',
  schema_ref: 'https://schemas.freightos.example/network/event-envelope.v1.json',
  data: {},
} as const;

describe('the validator discriminates — anti-vacuity controls', () => {
  it('accepts the representative payload for each contract and rejects an empty object', () => {
    // Without this pair every rejection below could be produced by a validator that rejects
    // everything, and every acceptance by one that accepts everything.
    expect(validateV12EventEnvelope(V1_2_ENVELOPE).valid, 'v1.2 fixture is not valid').toBe(true);
    expect(validateV14NetworkEventEnvelope(V1_4_ENVELOPE).valid, 'v1.4 fixture is not valid').toBe(
      true,
    );
    expect(validateV12EventEnvelope({}).valid).toBe(false);
    expect(validateV14NetworkEventEnvelope({}).valid).toBe(false);
  });

  it('reports a non-empty, path-bearing error surface rather than a bare boolean', () => {
    const outcome = validateV14NetworkEventEnvelope({ specversion: '1.0' });
    expect(outcome.valid).toBe(false);
    expect(outcome.errors.length).toBeGreaterThan(0);
    for (const e of outcome.errors) {
      expect(e.path.length).toBeGreaterThan(0);
      expect(e.message.length).toBeGreaterThan(0);
    }
  });

  it('changes its answer when exactly one required field is removed', () => {
    // The sharpest control: one field moves the outcome, so the validator is reading the payload
    // rather than reporting a constant.
    for (const field of ['recorded_at', 'organization_id', 'classification', 'schema_ref'] as const) {
      const { [field]: _removed, ...without } = V1_4_ENVELOPE;
      expect(
        validateV14NetworkEventEnvelope(without).valid,
        `removing ${field} did not change the v1.4 outcome`,
      ).toBe(false);
    }
    for (const field of ['purpose', 'actorid', 'operatingcontext', 'tenantid'] as const) {
      const { [field]: _removed, ...without } = V1_2_ENVELOPE;
      expect(
        validateV12EventEnvelope(without).valid,
        `removing ${field} did not change the v1.2 outcome`,
      ).toBe(false);
    }
  });
});

describe('the v1.2 / v1.4 compatibility boundary — ADR-N0007 Option B', () => {
  it('gives the two contracts different canonical identities', () => {
    expect(V1_2_EVENT_ENVELOPE_ID).not.toBe(V1_4_NETWORK_EVENT_ENVELOPE_ID);
    const ids = listRegisteredSchemas().map((s) => s.id);
    expect(ids).toContain(V1_2_EVENT_ENVELOPE_ID);
    expect(ids).toContain(V1_4_NETWORK_EVENT_ENVELOPE_ID);
    expect(new Set(ids).size, 'two governed schemas share a canonical id').toBe(ids.length);
  });

  it('keeps their required sets disjoint in both directions', () => {
    const required = (path: string): string[] =>
      (JSON.parse(readFileSync(path, 'utf8')) as { required: string[] }).required;
    const v12 = new Set(required('schemas/event-envelope.schema.json'));
    const v14 = new Set(
      required(
        'docs/production-handoff/v1.4.0-network-architecture/schemas/network-event-envelope.schema.json',
      ),
    );
    // Only what an envelope cannot avoid is shared. The distinguishing fields are exclusive.
    for (const only of ['tenantid', 'legalauthorityclass', 'operatingcontext', 'actorid', 'purpose'])
      expect(v14.has(only), `v1.4 unexpectedly requires ${only}`).toBe(false);
    for (const only of ['subject', 'recorded_at', 'organization_id', 'classification', 'schema_ref'])
      expect(v12.has(only), `v1.2 unexpectedly requires ${only}`).toBe(false);
  });

  // CASE C — a valid v1.2 payload must NOT be falsely accepted as a v1.4 network envelope.
  it('rejects a v1.2 envelope when validated as v1.4', () => {
    const outcome = validateV14NetworkEventEnvelope(V1_2_ENVELOPE);
    expect(outcome.valid, 'a v1.2 envelope was accepted as a network envelope').toBe(false);
  });

  // CASE D — and the converse.
  it('rejects a v1.4 network envelope when validated as v1.2', () => {
    const outcome = validateV12EventEnvelope(V1_4_ENVELOPE);
    expect(outcome.valid, 'a network envelope was accepted as a v1.2 envelope').toBe(false);
  });

  it('does not deprecate the v1.2 envelope — both are active peers', () => {
    const v12 = resolveSchema({ id: V1_2_EVENT_ENVELOPE_ID, version: 1 });
    const v14 = resolveSchema({ id: V1_4_NETWORK_EVENT_ENVELOPE_ID, version: 1 });
    expect(v12.status).toBe('active');
    expect(v14.status).toBe('active');
    expect(v12.layer).toBe('v1.2');
    expect(v14.layer).toBe('v1.4');
  });
});

describe('additionalProperties:false remains meaningful', () => {
  it('rejects an unexpected property on each envelope rather than ignoring it', () => {
    expect(validateV14NetworkEventEnvelope({ ...V1_4_ENVELOPE, smuggled: 'x' }).valid).toBe(false);
    expect(validateV12EventEnvelope({ ...V1_2_ENVELOPE, smuggled: 'x' }).valid).toBe(false);
    // …and the same payload without the extra property is accepted, so the rejection is caused by
    // the extra property and not by something else in the fixture.
    expect(validateV14NetworkEventEnvelope(V1_4_ENVELOPE).valid).toBe(true);
    expect(validateV12EventEnvelope(V1_2_ENVELOPE).valid).toBe(true);
  });

  it('rejects an unexpected property nested inside a subject object reference', () => {
    // The `$ref` into logistics-object-reference must actually resolve, or `subject` would accept
    // anything shaped like an array. This is the case that proves it does.
    expect(
      validateV14NetworkEventEnvelope({
        ...V1_4_ENVELOPE,
        subject: [{ network_id: 'obj-00000001', object_type: 'shipment', smuggled: 'x' }],
      }).valid,
      'the subject $ref did not resolve — nested additionalProperties was not enforced',
    ).toBe(false);
  });
});

describe('explicit version resolution — no default-version magic', () => {
  // CASE E — unknown schema id fails closed.
  it('fails closed on an unknown schema id', () => {
    expect(() => resolveSchema({ id: 'https://example.invalid/nope.json', version: 1 })).toThrow(
      UnknownSchemaError,
    );
    expect(() => validateAgainst({ id: 'https://example.invalid/nope.json', version: 1 }, {})).toThrow(
      /no governed schema registered/,
    );
  });

  // CASE F — known id at an unsupported version fails closed rather than falling back.
  it('fails closed on a known id at an unregistered version', () => {
    expect(() => resolveSchema({ id: V1_4_NETWORK_EVENT_ENVELOPE_ID, version: 2 })).toThrow(
      UnknownSchemaError,
    );
    // The v1 contract is registered, so the failure above is about the VERSION, not the id.
    expect(() => resolveSchema({ id: V1_4_NETWORK_EVENT_ENVELOPE_ID, version: 1 })).not.toThrow();
  });

  it('exposes no alias that resolves to "the newest installed version"', () => {
    // A durable artifact is graded by the contract it was written under. If this module ever grows
    // a `latest`/`current` resolver, a package upgrade would silently re-grade history.
    const source = readFileSync('packages/schemas/src/network.ts', 'utf8');
    for (const forbidden of ['latestVersion', 'currentVersion', 'resolveLatest', 'newestVersion']) {
      expect(source, `${forbidden} would reintroduce default-version magic`).not.toContain(
        forbidden,
      );
    }
  });
});

describe('registered schema integrity — content immutability', () => {
  it('registers all eight v1.4 contracts plus the v1.2 envelope', () => {
    const all = listRegisteredSchemas();
    expect(all.filter((s) => s.layer === 'v1.4')).toHaveLength(8);
    expect(all.filter((s) => s.layer === 'v1.2')).toHaveLength(1);
    expect(new Set(all.map((s) => s.artifactClass)).size).toBeGreaterThan(5);
  });

  // CASE G — the pinned hash is the real hash of the authoritative file.
  it('pins each schema to the SHA-256 of its authoritative bytes', () => {
    for (const entry of listRegisteredSchemas()) {
      const actual = createHash('sha256').update(readFileSync(entry.path)).digest('hex');
      expect(entry.contentHash, `${entry.id} hash does not match ${entry.path}`).toBe(actual);
      expect(entry.contentHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('refuses a governed schema that carries no pinned hash', () => {
    // Integrity must not be opt-in. If a contract could be registered without a hash, the lock
    // would erode by omission: add a schema, forget the pin, and it compiles unprotected. Asserted
    // on the source because the condition is unreachable at runtime by design — which is the point.
    const source = readFileSync('packages/schemas/src/network.ts', 'utf8');
    expect(source).toContain("throw new SchemaIntegrityError(entry.id, '(no pinned hash)', actual)");
    // Every registered v1.4 contract is actually pinned, so the guard is not standing over nothing.
    const pinned = /CONTENT_HASHES[\s\S]*?\n\}\);/.exec(source)?.[0] ?? '';
    for (const entry of listRegisteredSchemas().filter((s) => s.layer === 'v1.4')) {
      expect(pinned, `${entry.id} has no pinned hash`).toContain(entry.id);
    }
  });

  it('derives identity from the schema $id, never from the filesystem path', () => {
    for (const entry of listRegisteredSchemas().filter((s) => s.layer === 'v1.4')) {
      const declared = (JSON.parse(readFileSync(entry.path, 'utf8')) as { $id: string }).$id;
      expect(entry.id, `${entry.path} registered under an id it does not declare`).toBe(declared);
      // The path is provenance. A rename must not be able to change what a schema IS.
      expect(entry.id).not.toContain(entry.path);
    }
  });

  it('reads the protected artifacts directly, so no operational copy can drift', () => {
    const v14 = listRegisteredSchemas().filter((s) => s.layer === 'v1.4');
    expect(v14).toHaveLength(8);
    for (const entry of v14) {
      expect(
        entry.path.startsWith('docs/production-handoff/v1.4.0-network-architecture/schemas/'),
        `${entry.id} is served from a copy at ${entry.path}`,
      ).toBe(true);
    }
  });
});

describe('the logistics object reference — ADR-N0010 element 3', () => {
  it('accepts the governed minimal shape', () => {
    expect(
      validateV14LogisticsObjectReference({ network_id: 'obj-00000001', object_type: 'shipment' })
        .valid,
    ).toBe(true);
  });

  it('requires both network_id and object_type', () => {
    expect(validateV14LogisticsObjectReference({ network_id: 'obj-00000001' }).valid).toBe(false);
    expect(validateV14LogisticsObjectReference({ object_type: 'shipment' }).valid).toBe(false);
  });

  it('rejects an unexpected property and a too-short network_id', () => {
    expect(
      validateV14LogisticsObjectReference({
        network_id: 'obj-00000001',
        object_type: 'shipment',
        tenant_id: '11111111-1111-4111-8111-111111111111',
      }).valid,
      'the reference accepted a field the governed contract does not define',
    ).toBe(false);
    expect(
      validateV14LogisticsObjectReference({ network_id: 'short', object_type: 'shipment' }).valid,
    ).toBe(false);
  });

  it('accepts the optional governed fields and nothing else', () => {
    expect(
      validateV14LogisticsObjectReference({
        network_id: 'obj-00000001',
        object_type: 'shipment',
        version: 3,
        external_aliases: [{ issuer: 'partner:sap', value: 'SAP-9', verified: false }],
      }).valid,
    ).toBe(true);
    expect(
      validateV14LogisticsObjectReference({
        network_id: 'obj-00000001',
        object_type: 'shipment',
        external_aliases: [{ issuer: 'partner:sap' }],
      }).valid,
      'an alias without a value was accepted',
    ).toBe(false);
  });

  it('is MODE-NEUTRAL — the same contract names road, rail, ocean and air subjects', () => {
    // The governed contract carries object KIND and canonical id, so no mode needs a schema change.
    // If this ever fails it means a mode-specific field entered a network-wide primitive.
    for (const objectType of ['shipment', 'railcar', 'vessel_voyage', 'flight', 'trailer']) {
      expect(
        isLogisticsObjectReference({ network_id: 'obj-00000001', object_type: objectType }),
        `${objectType} could not be expressed`,
      ).toBe(true);
    }
    const contract = readFileSync(
      'docs/production-handoff/v1.4.0-network-architecture/schemas/logistics-object-reference.schema.json',
      'utf8',
    );
    for (const modeSpecific of ['truck_id', 'load_id', 'trailer_id', 'driver_id', 'container_id']) {
      expect(contract, `${modeSpecific} is baked into the universal reference`).not.toContain(
        modeSpecific,
      );
    }
  });

  it('is NOT a participant reference — the two kernel concepts stay separate', () => {
    // ADR-N0005 participants are who acts; element 3 references are what is acted upon. Nothing in
    // this module converts one into the other, and the object-reference contract has no
    // participant field to collapse them through.
    const contract = readFileSync(
      'docs/production-handoff/v1.4.0-network-architecture/schemas/logistics-object-reference.schema.json',
      'utf8',
    );
    expect(contract).not.toContain('participant_id');
    expect(contract).not.toContain('network_participant');
    const source = readFileSync('packages/schemas/src/network.ts', 'utf8');
    expect(source, 'a participant→object-reference helper would collapse the separation').not.toMatch(
      /participantToObjectReference|asObjectReference\s*\(/,
    );
  });

  it('CONFERS ZERO AUTHORITY — validating a reference performs no lookup and returns no object', () => {
    // The central N2 security claim, at the only layer N2 implements: the reference is a shape,
    // and a shape check cannot reach data. A reference naming another tenant's identifier is
    // exactly as valid, and exactly as powerless, as one naming your own.
    const foreignTenantIdentifier = '22222222-2222-4222-8222-222222222222';
    const reference = { network_id: foreignTenantIdentifier, object_type: 'shipment' };

    const outcome = validateV14LogisticsObjectReference(reference);
    expect(outcome.valid, 'a syntactically valid reference should validate').toBe(true);

    // The entire result surface is a boolean and an error list. There is no resolver, no row, no
    // handle — nothing that could carry access to the named object.
    expect(Object.keys(outcome).sort()).toEqual(['errors', 'valid']);
    expect(outcome.errors).toEqual([]);

    // And no exported name in this module offers to resolve a reference into an object.
    const source = readFileSync('packages/schemas/src/network.ts', 'utf8');
    for (const resolver of ['resolveObject', 'fetchObject', 'loadObject', 'dereference']) {
      expect(source, `${resolver} would turn naming into access`).not.toContain(resolver);
    }
  });
});
