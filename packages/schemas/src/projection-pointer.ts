/**
 * N5-A — FreightOS disclosure-projection pointers.
 *
 * A projection is an explicit allowlist of field pointers bound to exactly one registered payload
 * contract, and it is the only way a disclosure grant can say what data may leave. This module owns
 * three things: what a pointer may look like, whether a pointer actually resolves against the
 * contract it claims to project, and how a pointer set is applied to a payload.
 *
 * WHY AN ALLOWLIST, RESTATED HERE BECAUSE THIS IS WHERE IT IS ENFORCED. Under a denylist, a field
 * that did not exist when the rule was written leaves by default. `network_events.data` is validated
 * against an evolving contract, so "a field nobody has considered yet" is not hypothetical — it is
 * the normal consequence of a schema version bump. No amount of test coverage repairs a default
 * that is wrong, so the default here is that a pointer nobody wrote does not leave.
 *
 * THE SYNTAX IS JSON-POINTER-LIKE WITH ONE DOCUMENTED EXTENSION.
 *
 * RFC 6901 defines `-` as referring to the nonexistent element after the last element of an array;
 * it is JSON Patch that gives that token an operational meaning, and in a read context it never
 * resolves. FreightOS reuses it at an array traversal step to mean EVERY ELEMENT. That is a
 * FreightOS extension and is called one — the claim "RFC 6901 says `-` means every element" would
 * be false. Reusing the token is safe precisely because it can never be a real index, so no
 * ambiguity with a numeric path is possible.
 *
 * THE RULES, each of which exists to close a specific way a field could escape:
 *
 *   A. Numeric array indexes are REJECTED. `/stops/0/city` is not a stable identity — a producer
 *      reordering an array would silently change which element is disclosed.
 *   B. A whole array of SCALARS is permitted. It has no child fields a later contract version
 *      could add, so nothing can ride in behind it.
 *   C. A whole array of OBJECTS is REJECTED. This is rule G's case and the sharpest one: the array
 *      is a container whose element shape can grow.
 *   D. At an array step, `-` traverses every element.
 *   E. Nested every-element traversal is permitted: `/subject_refs/-/external_aliases/-/issuer`.
 *   F. A terminal may be a scalar, a scalar array, or a scalar reached through every-element
 *      traversal.
 *   G. A terminal may NOT be an object or an array of objects. This is the closure rule, and it is
 *      what makes "unknown fields cannot leave" true BY CONSTRUCTION rather than by check: if no
 *      pointer can name an object, no pointer can transitively carry a future child of one.
 *
 * Rule G has a tempting exception — an object with `additionalProperties: false` genuinely cannot
 * gain fields within its own schema version, so a whole-object pointer there would be safe. It is
 * deliberately NOT taken. It makes safety conditional on a schema keyword, and the cost of naming
 * leaves individually is small.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listRegisteredSchemas, resolveDurableRef } from './network.ts';

function repositoryRoot(from: string = fileURLToPath(import.meta.url)): string {
  // packages/schemas/src/projection-pointer.ts → repository root.
  return join(from, '..', '..', '..', '..');
}

// ---------------------------------------------------------------------------
// Pointer syntax.
// ---------------------------------------------------------------------------

/** A property step, or the FreightOS every-element step. */
export type PointerToken =
  | { readonly kind: 'property'; readonly name: string }
  | { readonly kind: 'everyElement' };

export class ProjectionPointerError extends Error {
  constructor(
    readonly pointer: string,
    readonly reason: string,
  ) {
    super(`invalid projection pointer ${JSON.stringify(pointer)}: ${reason}`);
    this.name = 'ProjectionPointerError';
  }
}

/** Property names a pointer may address. Deliberately the same shape the database CHECK enforces. */
const PROPERTY_NAME = /^[a-z][a-z0-9_]*$/;

/**
 * Parse a pointer into tokens, rejecting anything outside the syntax.
 *
 * This is syntax only. Whether the pointer RESOLVES — and whether it terminates somewhere it is
 * allowed to — needs the schema, and is `validateProjectionPointer`'s job.
 */
export function parseProjectionPointer(pointer: string): readonly PointerToken[] {
  if (!pointer.startsWith('/')) {
    throw new ProjectionPointerError(pointer, 'must begin with "/"');
  }
  if (pointer === '/') {
    throw new ProjectionPointerError(pointer, 'the document root is not an addressable field');
  }

  const raw = pointer.slice(1).split('/');
  const tokens: PointerToken[] = [];

  for (const segment of raw) {
    if (segment === '-') {
      tokens.push({ kind: 'everyElement' });
      continue;
    }
    if (/^[0-9]+$/.test(segment)) {
      // Rule A, and the message says why rather than just "invalid".
      throw new ProjectionPointerError(
        pointer,
        `numeric array index ${JSON.stringify(segment)} is not permitted — element position is ` +
          'not a stable identity. Use "-" to address every element.',
      );
    }
    if (!PROPERTY_NAME.test(segment)) {
      throw new ProjectionPointerError(
        pointer,
        `segment ${JSON.stringify(segment)} is not a permitted property name`,
      );
    }
    tokens.push({ kind: 'property', name: segment });
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// The schema walker.
// ---------------------------------------------------------------------------

interface JsonSchemaNode {
  readonly $id?: string;
  readonly $ref?: string;
  readonly type?: string | readonly string[];
  readonly properties?: Record<string, JsonSchemaNode>;
  readonly items?: JsonSchemaNode;
}

/** Every registered contract document, by canonical `$id`. Built once. */
let documentsById: Map<string, JsonSchemaNode> | undefined;

function schemaDocuments(): Map<string, JsonSchemaNode> {
  if (documentsById) return documentsById;
  const root = repositoryRoot();
  const map = new Map<string, JsonSchemaNode>();
  for (const entry of listRegisteredSchemas()) {
    const document = JSON.parse(readFileSync(join(root, entry.path), 'utf8')) as JsonSchemaNode;
    map.set(entry.id, document);
  }
  documentsById = map;
  return map;
}

/**
 * Resolve a `$ref` the way the governed contracts actually use it.
 *
 * The v1.4 contracts reference siblings relatively — `"logistics-object-reference.v1.json"` — which
 * JSON Schema resolves against the referring document's `$id` base. That is the same resolution Ajv
 * performs when it compiles them, so the walker and the validator agree about what a `$ref` means.
 */
function resolveRef(ref: string, baseId: string): JsonSchemaNode {
  const absolute = new URL(ref, baseId).toString();
  const target = schemaDocuments().get(absolute);
  if (!target) {
    throw new Error(`projection walker cannot resolve $ref ${ref} against base ${baseId}`);
  }
  return target;
}

/** Follow `$ref` until a concrete node is reached, tracking the base id for relative refs. */
function deref(node: JsonSchemaNode, baseId: string): { node: JsonSchemaNode; baseId: string } {
  let current = node;
  let base = baseId;
  // A small bound rather than `while (true)`: a $ref cycle in a governed contract is a defect, and
  // an infinite loop is a worse way to report it than an error.
  for (let hops = 0; hops < 16; hops += 1) {
    if (current.$ref === undefined) return { node: current, baseId: base };
    const target = resolveRef(current.$ref, base);
    base = target.$id ?? base;
    current = target;
  }
  throw new Error(`projection walker exceeded $ref depth from base ${baseId}`);
}

const SCALAR_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'null']);

function typesOf(node: JsonSchemaNode): readonly string[] {
  if (node.type === undefined) return [];
  return typeof node.type === 'string' ? [node.type] : node.type;
}

/** A node is scalar when every type it admits is scalar. `["string","null"]` is still scalar. */
function isScalar(node: JsonSchemaNode): boolean {
  const types = typesOf(node);
  return types.length > 0 && types.every((t) => SCALAR_TYPES.has(t));
}

function isArray(node: JsonSchemaNode): boolean {
  return typesOf(node).includes('array');
}

function isObject(node: JsonSchemaNode): boolean {
  return typesOf(node).includes('object') || node.properties !== undefined;
}

export interface PointerValidationFailure {
  readonly pointer: string;
  readonly reason: string;
}

/**
 * Validate one pointer against the exact contract identified by `durableSchemaRef`.
 *
 * Returns `null` when the pointer is legal, or a failure describing precisely what is wrong.
 * Returning rather than throwing is deliberate: the caller validating a whole projection wants
 * every problem at once, not the first one.
 */
export function validateProjectionPointer(
  durableSchemaRef: string,
  pointer: string,
): PointerValidationFailure | null {
  let tokens: readonly PointerToken[];
  try {
    tokens = parseProjectionPointer(pointer);
  } catch (error) {
    return { pointer, reason: error instanceof Error ? error.message : String(error) };
  }

  const entry = resolveDurableRef(durableSchemaRef);
  const root = schemaDocuments().get(entry.id);
  if (!root) return { pointer, reason: `no document for registered schema ${entry.id}` };

  let cursor: JsonSchemaNode = root;
  let baseId = root.$id ?? entry.id;

  for (const [index, token] of tokens.entries()) {
    const here = deref(cursor, baseId);
    cursor = here.node;
    baseId = here.baseId;

    if (token.kind === 'everyElement') {
      if (!isArray(cursor)) {
        return {
          pointer,
          reason: `"-" at position ${index} traverses a node that is not an array`,
        };
      }
      if (cursor.items === undefined) {
        return { pointer, reason: `array at position ${index} declares no items schema` };
      }
      cursor = cursor.items;
      continue;
    }

    if (!isObject(cursor) || cursor.properties === undefined) {
      return {
        pointer,
        reason: `cannot address property ${JSON.stringify(token.name)} on a non-object at position ${index}`,
      };
    }
    const next = cursor.properties[token.name];
    if (next === undefined) {
      return {
        pointer,
        reason: `property ${JSON.stringify(token.name)} is not declared by the contract`,
      };
    }
    cursor = next;
  }

  // Terminal rules — F and G.
  const terminal = deref(cursor, baseId).node;

  if (isScalar(terminal)) return null;

  if (isArray(terminal)) {
    const items = terminal.items;
    if (items === undefined) {
      return { pointer, reason: 'terminal array declares no items schema' };
    }
    const element = deref(items, baseId).node;
    if (isScalar(element)) return null;
    return {
      pointer,
      reason:
        'terminal is an array of objects. A whole object array cannot be projected, because a ' +
        'later contract version may add a property to its elements and that property would leave ' +
        'without ever being authorized. Address the element leaves individually with "-".',
    };
  }

  if (isObject(terminal)) {
    return {
      pointer,
      reason:
        'terminal is an object. A whole object cannot be projected, because a later contract ' +
        'version may add a property to it. Address its leaves individually.',
    };
  }

  return { pointer, reason: 'terminal has no usable type declaration' };
}

/** Validate a whole projection, returning every failure rather than the first. */
export function validateProjection(
  durableSchemaRef: string,
  pointers: readonly string[],
): readonly PointerValidationFailure[] {
  return pointers
    .map((p) => validateProjectionPointer(durableSchemaRef, p))
    .filter((f): f is PointerValidationFailure => f !== null);
}

// ---------------------------------------------------------------------------
// Applying a projection to a payload.
// ---------------------------------------------------------------------------

type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

function isPlainObject(value: unknown): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Merge one pointer's authorized slice of `source` into `target`.
 *
 * ABSENCE, NOT MASKING. An unauthorized field is simply not present in the output — never `null`,
 * never a placeholder, never a "redacted" marker. A null would itself disclose that the field
 * exists, which is information the recipient was not granted.
 *
 * A pointer that does not resolve in THIS payload contributes nothing and is not an error: an
 * optional field being absent is absence, not failure.
 */
function graft(source: JsonValue, target: JsonValue, tokens: readonly PointerToken[]): JsonValue {
  if (tokens.length === 0) return source;

  const [token, ...rest] = tokens;

  if (token!.kind === 'everyElement') {
    if (!Array.isArray(source)) return target;
    // Source order is preserved — a projection must not reorder a producer's array.
    const existing = Array.isArray(target) ? target : [];
    const out: JsonValue[] = [];
    for (const [i, element] of source.entries()) {
      const merged = graft(element!, existing[i] ?? (isPlainObject(element) ? {} : element!), rest);
      out.push(merged);
    }
    return out;
  }

  if (!isPlainObject(source)) return target;
  if (!(token!.name in source)) return target;

  const base: Record<string, JsonValue> = isPlainObject(target) ? { ...target } : {};
  const child = source[token!.name]!;
  const seed = base[token!.name] ?? (Array.isArray(child) ? [] : isPlainObject(child) ? {} : child);
  base[token!.name] = graft(child, seed, rest);
  return base;
}

/**
 * Project `payload` through an allowlist of pointers.
 *
 * The result contains exactly the authorized fields that are present in the payload, with array
 * order preserved and every unauthorized or unknown field absent.
 */
export function projectPayload(payload: unknown, pointers: readonly string[]): JsonValue {
  let out: JsonValue = {};
  for (const pointer of pointers) {
    const tokens = parseProjectionPointer(pointer);
    out = graft(payload as JsonValue, out, tokens);
  }
  return out;
}
