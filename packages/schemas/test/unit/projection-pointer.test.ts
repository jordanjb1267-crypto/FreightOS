import { describe, expect, it } from 'vitest';
import {
  parseProjectionPointer,
  projectPayload,
  validateProjection,
  validateProjectionPointer,
} from '../../src/projection-pointer.ts';

/**
 * N5-A projection pointers.
 *
 * The rules here are the mechanism by which "unknown fields cannot leave" is true BY CONSTRUCTION
 * rather than by review. Each block below names the rule it defends and the escape it closes.
 */

const WORKFLOW_STATE = 'https://schemas.rigreceipts.com/network/workflow-state.v1.json';

/** The projection migration 0032 seeds. Kept in step with the migration by the integration suite. */
const SEEDED = [
  '/workflow_id',
  '/state',
  '/updated_at',
  '/participants',
  '/subject_refs/-/network_id',
  '/subject_refs/-/external_aliases/-/issuer',
];

describe('pointer syntax', () => {
  it('parses property steps and the every-element step', () => {
    expect(parseProjectionPointer('/subject_refs/-/network_id')).toEqual([
      { kind: 'property', name: 'subject_refs' },
      { kind: 'everyElement' },
      { kind: 'property', name: 'network_id' },
    ]);
  });

  it('rejects a numeric array index — rule A', () => {
    // Element position is not a stable identity: a producer reordering an array would silently
    // change which element is disclosed.
    expect(() => parseProjectionPointer('/stops/0/city')).toThrow(/numeric array index/);
  });

  it('rejects the document root', () => {
    expect(() => parseProjectionPointer('/')).toThrow(/not an addressable field/);
  });

  it('requires a leading slash', () => {
    expect(() => parseProjectionPointer('workflow_id')).toThrow(/must begin/);
  });
});

describe('schema resolution', () => {
  it('accepts every pointer migration 0032 seeds', () => {
    // If this fails, the migration is seeding a projection the contract does not support — which is
    // exactly the drift the CI gate exists to catch, before a disclosure ever runs.
    expect(validateProjection(WORKFLOW_STATE, SEEDED)).toEqual([]);
  });

  it('rejects a property the contract does not declare', () => {
    expect(validateProjectionPointer(WORKFLOW_STATE, '/nope')?.reason).toMatch(/not declared/);
  });

  it('permits a whole array of scalars — rule B', () => {
    // Safe because a scalar array has no child fields a later contract version could add.
    expect(validateProjectionPointer(WORKFLOW_STATE, '/participants')).toBeNull();
  });

  it('rejects a whole array of objects — rule C', () => {
    expect(validateProjectionPointer(WORKFLOW_STATE, '/subject_refs')?.reason).toMatch(
      /array of objects/,
    );
  });

  it('rejects an object terminal — rule G', () => {
    // `/subject_refs/-` resolves to the element object itself.
    expect(validateProjectionPointer(WORKFLOW_STATE, '/subject_refs/-')?.reason).toMatch(
      /terminal is an object/,
    );
  });

  it('rejects a nested object array reached through every-element traversal', () => {
    expect(
      validateProjectionPointer(WORKFLOW_STATE, '/subject_refs/-/external_aliases')?.reason,
    ).toMatch(/array of objects/);
  });

  it('follows a $ref across contracts — rule E', () => {
    // `subject_refs.items` is a $ref to logistics-object-reference, whose own `external_aliases`
    // is a further object array. Two levels of every-element traversal, across a contract boundary.
    expect(
      validateProjectionPointer(WORKFLOW_STATE, '/subject_refs/-/external_aliases/-/issuer'),
    ).toBeNull();
  });

  it('rejects every-element traversal of something that is not an array', () => {
    expect(validateProjectionPointer(WORKFLOW_STATE, '/workflow_id/-')?.reason).toMatch(
      /not an array/,
    );
  });

  it('is not vacuous — it reports several failures at once', () => {
    const failures = validateProjection(WORKFLOW_STATE, ['/nope', '/subject_refs', '/state']);
    expect(failures.map((f) => f.pointer).sort()).toEqual(['/nope', '/subject_refs']);
  });
});

describe('applying a projection', () => {
  const payload = {
    workflow_id: 'wf-1',
    workflow_type: 'commercially_sensitive',
    state: 'in_transit',
    version: 3,
    participants: ['org-a', 'org-b'],
    open_exceptions: ['detention'],
    updated_at: '2026-01-01T00:00:00Z',
    last_event_id: 'evt-9',
    subject_refs: [
      {
        network_id: 'n1',
        object_type: 'shipment',
        external_aliases: [{ issuer: 'scac', value: 'SECRET-1', verified: true }],
      },
      { network_id: 'n2', object_type: 'leg', external_aliases: [{ issuer: 'gln', value: 'SECRET-2' }] },
    ],
  };

  it('emits exactly the authorized fields', () => {
    expect(projectPayload(payload, SEEDED)).toEqual({
      workflow_id: 'wf-1',
      state: 'in_transit',
      updated_at: '2026-01-01T00:00:00Z',
      participants: ['org-a', 'org-b'],
      subject_refs: [
        { network_id: 'n1', external_aliases: [{ issuer: 'scac' }] },
        { network_id: 'n2', external_aliases: [{ issuer: 'gln' }] },
      ],
    });
  });

  it('omits unauthorized fields by ABSENCE, never by null or a placeholder', () => {
    const out = projectPayload(payload, SEEDED) as Record<string, unknown>;
    // A null would itself disclose that the field exists, which the recipient was not granted.
    for (const absent of ['workflow_type', 'version', 'open_exceptions', 'last_event_id']) {
      expect(Object.hasOwn(out, absent), `${absent} leaked`).toBe(false);
    }
    const refs = out['subject_refs'] as Record<string, unknown>[];
    expect(Object.hasOwn(refs[0]!, 'object_type')).toBe(false);
    const aliases = refs[0]!['external_aliases'] as Record<string, unknown>[];
    expect(Object.hasOwn(aliases[0]!, 'value')).toBe(false);
    expect(Object.hasOwn(aliases[0]!, 'verified')).toBe(false);
  });

  it('preserves source order in arrays — rule H', () => {
    const out = projectPayload(payload, SEEDED) as { subject_refs: { network_id: string }[] };
    expect(out.subject_refs.map((r) => r.network_id)).toEqual(['n1', 'n2']);
  });

  it('leaves a new unknown field inside an object array absent', () => {
    // The schema-evolution case, at the projection layer: a payload carrying a field nobody
    // authorized must not emit it, whatever the contract says.
    const evolved = {
      ...payload,
      subject_refs: [
        {
          network_id: 'n1',
          object_type: 'shipment',
          precise_coordinates: { lat: 1, lon: 2 },
          external_aliases: [{ issuer: 'scac', value: 'SECRET-1' }],
        },
      ],
    };
    const out = projectPayload(evolved, SEEDED) as { subject_refs: Record<string, unknown>[] };
    expect(Object.hasOwn(out.subject_refs[0]!, 'precise_coordinates')).toBe(false);
  });

  it('contributes nothing for an authorized pointer absent from this payload', () => {
    // Absence is absence, not failure: an optional field that is not present simply yields nothing.
    const sparse = { workflow_id: 'wf-2', state: 'created' };
    expect(projectPayload(sparse, SEEDED)).toEqual({ workflow_id: 'wf-2', state: 'created' });
  });

  it('emits nothing at all for an empty allowlist', () => {
    expect(projectPayload(payload, [])).toEqual({});
  });
});
