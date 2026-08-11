import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  canonicalSha256,
  CanonicalizationError,
} from '../../src/canonical-json.ts';

/**
 * N3 — the canonicaliser that event fingerprints rest on.
 *
 * `event_fingerprint` decides whether a repeated `event_id` is an ordinary retransmission or a
 * conflicting rewrite of an accepted fact. That makes byte-determinism a correctness property, not
 * a tidiness one, and it is why `JSON.stringify` is unusable: it emits object keys in insertion
 * order, so the same event assembled two ways would fingerprint two ways.
 *
 * Every rule the N3 ruling names is tested here, and each is tested as a PAIR — something that must
 * not change the output, next to something that must. A canonicaliser that returned a constant
 * would pass half of these; nothing passes both halves except one that reads the value.
 */
describe('deterministic canonical JSON', () => {
  it('is insensitive to object key insertion order', () => {
    const a = { alpha: 1, beta: 2, gamma: 3 };
    const b: Record<string, number> = {};
    b['gamma'] = 3;
    b['alpha'] = 1;
    b['beta'] = 2;

    expect(canonicalJson(b)).toBe(canonicalJson(a));
    expect(canonicalJson(a)).toBe('{"alpha":1,"beta":2,"gamma":3}');
    // JSON.stringify does NOT have this property — the reason this module exists.
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(a));
  });

  it('is insensitive to key order at every nesting depth', () => {
    const a = { outer: { x: { deep: 1, deeper: 2 }, y: [{ p: 1, q: 2 }] } };
    const b = { outer: { y: [{ q: 2, p: 1 }], x: { deeper: 2, deep: 1 } } };
    expect(canonicalJson(b)).toBe(canonicalJson(a));
  });

  it('PRESERVES array order — order is meaning, not formatting', () => {
    // The one ordering that must not be normalised. Two subjects in a different order are a
    // different event.
    expect(canonicalJson(['a', 'b'])).not.toBe(canonicalJson(['b', 'a']));
    expect(canonicalJson([1, 2, 3])).toBe('[1,2,3]');
  });

  it('distinguishes null from absent', () => {
    // The governed contracts distinguish them, so the fingerprint must too.
    expect(canonicalJson({ a: null })).not.toBe(canonicalJson({}));
    expect(canonicalJson({ a: null })).toBe('{"a":null}');
    expect(canonicalJson({ a: undefined })).toBe('{}');
  });

  it('renders numbers deterministically and refuses the ones JSON cannot carry', () => {
    expect(canonicalJson({ n: 1 })).toBe('{"n":1}');
    expect(canonicalJson({ n: 1.5 })).toBe('{"n":1.5}');
    expect(canonicalJson({ n: -0 })).toBe('{"n":0}');
    expect(canonicalJson({ n: 1e21 })).toBe('{"n":1e+21}');
    // JSON.stringify renders these as `null`, which would make two different values fingerprint
    // identically. Refusing is the only honest behaviour.
    expect(() => canonicalJson({ n: Number.POSITIVE_INFINITY })).toThrow(CanonicalizationError);
    expect(() => canonicalJson({ n: Number.NaN })).toThrow(CanonicalizationError);
  });

  it('escapes strings and separates keys from values unambiguously', () => {
    expect(canonicalJson({ 'a"b': 'c\nd' })).toBe('{"a\\"b":"c\\nd"}');
    // Two different shapes must not collide through naive concatenation.
    expect(canonicalJson({ ab: 1 })).not.toBe(canonicalJson({ a: 'b1' }));
  });

  it('refuses values that have no honest JSON form', () => {
    expect(() => canonicalJson(new Date() as never)).toThrow(CanonicalizationError);
    expect(() => canonicalJson(new Map() as never)).toThrow(CanonicalizationError);
    expect(() => canonicalJson({ n: 1n } as never)).toThrow(CanonicalizationError);
    expect(() => canonicalJson([undefined] as never)).toThrow(CanonicalizationError);
    // A class instance must not be able to smuggle a different serialisation through toJSON.
    class Sneaky {
      toJSON(): string {
        return 'harmless';
      }
    }
    expect(() => canonicalJson(new Sneaky() as never)).toThrow(CanonicalizationError);
  });

  it('handles the nested subject/data shapes a real event carries', () => {
    const envelope = {
      specversion: '1.0',
      id: 'e',
      subject: [
        { network_id: 'obj-00000001', object_type: 'example-only' },
        { object_type: 'example-two', network_id: 'obj-00000002' },
      ],
      data: { nested: { b: [3, 2, 1], a: null } },
    };
    const reordered = {
      data: { nested: { a: null, b: [3, 2, 1] } },
      subject: [
        { object_type: 'example-only', network_id: 'obj-00000001' },
        { network_id: 'obj-00000002', object_type: 'example-two' },
      ],
      id: 'e',
      specversion: '1.0',
    };
    expect(canonicalJson(reordered)).toBe(canonicalJson(envelope));

    // …but swapping the two subjects is a different event.
    const swapped = { ...envelope, subject: [envelope.subject[1]!, envelope.subject[0]!] };
    expect(canonicalJson(swapped)).not.toBe(canonicalJson(envelope));
  });

  it('hashes to stable lowercase hex, and different values hash differently', () => {
    const digest = canonicalSha256({ b: 2, a: 1 });
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalSha256({ a: 1, b: 2 })).toBe(digest);
    expect(canonicalSha256({ a: 1, b: 3 })).not.toBe(digest);
  });
});
