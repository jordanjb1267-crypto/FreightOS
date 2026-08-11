/**
 * N3 — deterministic canonical JSON, for event fingerprinting.
 *
 * WHY THIS EXISTS AT ALL. `event_fingerprint` decides whether a repeated `event_id` carries the
 * same semantic event or a conflicting one, and that decision is a correctness boundary: get it
 * wrong in the permissive direction and a producer silently overwrites the meaning of an accepted
 * fact; get it wrong in the strict direction and an ordinary retransmission is rejected as a
 * conflict. So the bytes being hashed have to depend on the VALUE and on nothing else.
 *
 * `JSON.stringify` does not have that property. It serialises object keys in insertion order, so
 * two structurally identical drafts — one built literal-first, one assembled field by field, one
 * round-tripped through a queue — produce different bytes and therefore different fingerprints.
 * Using it and calling the result canonical is the exact mistake the N3 ruling names.
 *
 * A repository search found no canonical-JSON implementation and no suitable dependency already
 * present, so this is the smallest deterministic canonicaliser the accepted-event structure needs.
 * It is deliberately NOT a general RFC 8785 implementation: it covers the JSON value space a
 * validated network event can contain and REFUSES everything else rather than guessing, because a
 * silent guess is how a fingerprint stops meaning what it claims.
 *
 * The rules, each of which is mutation-tested:
 *
 *   * object keys are sorted by UTF-16 code unit — insertion order cannot affect output, at any
 *     nesting depth;
 *   * array order is PRESERVED — `[a, b]` and `[b, a]` are different values and must fingerprint
 *     differently, so this is the one ordering that must not be normalised;
 *   * `null` is preserved and is distinct from an absent key, because the governed contracts
 *     distinguish them;
 *   * `undefined` values and function/symbol values are treated as ABSENT, matching JSON semantics;
 *   * numbers use JavaScript's own Number→String, which is deterministic for every finite double;
 *     non-finite numbers are REFUSED rather than silently becoming `null` the way JSON.stringify
 *     renders them;
 *   * no `toJSON` is honoured and no prototype is consulted — only own enumerable properties of
 *     plain objects and arrays, so a class instance cannot smuggle a different serialisation in.
 */

import { createHash } from 'node:crypto';

export class CanonicalizationError extends Error {
  readonly path: string;

  constructor(path: string, detail: string) {
    super(`cannot canonicalize value at ${path}: ${detail}`);
    this.name = 'CanonicalizationError';
    this.path = path;
  }
}

/** A JSON value this canonicaliser accepts. */
export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue | undefined };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
}

function write(value: unknown, path: string): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';

    case 'number':
      // `JSON.stringify` renders Infinity and NaN as `null`, which would make two genuinely
      // different values fingerprint identically. Refusing is the only honest option.
      if (!Number.isFinite(value)) {
        throw new CanonicalizationError(path, `non-finite number (${String(value)})`);
      }
      // Number→String is fully specified by ECMA-262 and identical across conforming engines.
      return String(value);

    case 'string':
      // JSON.stringify on a primitive string performs exactly the RFC 8259 string escaping, with
      // no ordering surface of its own — the one place its behaviour is safe to lean on.
      return JSON.stringify(value);

    case 'bigint':
      throw new CanonicalizationError(path, 'bigint has no JSON representation');

    case 'undefined':
    case 'function':
    case 'symbol':
      // Only reachable at the root; inside containers these are filtered as absent.
      throw new CanonicalizationError(path, `${typeof value} is not a JSON value`);

    default:
      break;
  }

  if (Array.isArray(value)) {
    // ORDER PRESERVED. Sorting here would make two different values indistinguishable.
    const parts = value.map((item, index) => {
      const at = `${path}[${index}]`;
      // A hole or an explicit `undefined` in an array serialises as `null` in JSON, and that is
      // the one place JSON's own semantics are lossy. Refuse rather than encode the ambiguity.
      if (item === undefined) throw new CanonicalizationError(at, 'undefined array element');
      return write(item, at);
    });
    return `[${parts.join(',')}]`;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value)
      .filter((key) => {
        const entry = value[key];
        return entry !== undefined && typeof entry !== 'function' && typeof entry !== 'symbol';
      })
      // Sort by UTF-16 code unit — the default comparison, stated explicitly because a
      // locale-aware sort would not be deterministic across environments.
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    const parts = keys.map(
      (key) => `${JSON.stringify(key)}:${write(value[key], `${path}.${key}`)}`,
    );
    return `{${parts.join(',')}}`;
  }

  throw new CanonicalizationError(
    path,
    'only plain objects, arrays and JSON primitives are canonicalizable',
  );
}

/** The deterministic canonical form of a JSON value. */
export function canonicalJson(value: CanonicalJsonValue): string {
  return write(value, '(root)');
}

/** SHA-256 over the canonical form, lowercase hex. */
export function canonicalSha256(value: CanonicalJsonValue): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}
