/**
 * N2 — the versioned network schema registry.
 *
 * ADR-N0010 element 6: "Makes 3–5 enforceable rather than advisory." This module is what turns the
 * v1.4.0 network contracts from documents into validators, and it answers the six questions the N2
 * ruling asks of a registry: what schema is this artifact using, which version, is that schema
 * governed, is it active, what artifact class does it govern, and can a payload be validated
 * against it.
 *
 * IT IS NOT AN EVENT JOURNAL, AN OBJECT STORE, A PERMISSION SYSTEM OR A BROKER. It resolves
 * contracts and validates payloads. Nothing here reads or writes tenant data, and nothing here
 * participates in an authorization decision.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THERE IS NO OPERATIONAL COPY OF THE v1.4 SCHEMAS
 *
 * The v1.2 schemas live at the repository root as generated operational copies because three of
 * them are DELIBERATE OVERRIDES of the handoff (ADR-0015, ADR-0019) — the copy exists to hold a
 * divergence, and `check-handoff-provenance.mjs` polices it.
 *
 * The v1.4 network schemas have no overrides and need none. So rather than materialise a second
 * copy and then build a parity gate to prove the copy has not drifted, this module reads the
 * PROTECTED ARTIFACTS DIRECTLY. Drift is not detected, it is impossible: there is one file. The
 * source is already covered by `MANIFEST.sha256` and by `scripts/check-network-governance.mjs`,
 * which fails on modification, deletion and unlisted addition.
 *
 * The content hashes below are the second, independent lock — see `CONTENT_HASHES`.
 * ---------------------------------------------------------------------------------------------
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import _Ajv2020 from 'ajv/dist/2020.js';
import _addFormats from 'ajv-formats';
import type { AnySchema, ErrorObject, ValidateFunction } from 'ajv';

const Ajv2020 = _Ajv2020 as unknown as typeof _Ajv2020.default;
const addFormats = _addFormats as unknown as typeof _addFormats.default;

/** Duplicated from index.ts for the reason recorded there — ADR-0024 L0 has no lower layer. */
function repositoryRoot(from: string = fileURLToPath(import.meta.url)): string {
  let dir = dirname(from);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('repository root not found: no pnpm-workspace.yaml above');
    dir = parent;
  }
}

/** The protected v1.4.0 package. Source governance, not a copy of it. */
const NETWORK_SCHEMA_DIR = 'docs/production-handoff/v1.4.0-network-architecture/schemas';

/**
 * What a governed schema is FOR. This is the "artifact class" the N2 ruling asks the registry to
 * answer, and it is derived from the v1.4.0 documents rather than invented: each value names a
 * contract family those documents already define.
 */
export type ArtifactClass =
  | 'event-envelope'
  | 'command-envelope'
  | 'object-reference'
  | 'participant-identity'
  | 'capability-advertisement'
  | 'consent-grant'
  | 'evidence-envelope'
  | 'workflow-state'
  | 'event-correction';

/**
 * Lifecycle status.
 *
 * DELIBERATELY MINIMAL — two states, not a workflow. `20_NETWORK_GOVERNANCE…` §6 requires that a
 * deprecation state replacement, affected partners, final support date, migration tests and
 * rollback; none of that is a schema-registry field, and inventing a `retired` state would imply a
 * removal path the same section forbids without governance sign-off.
 *
 * DEPRECATED DOES NOT MEAN INVALID HISTORICAL DATA. A deprecated schema stays fully resolvable and
 * fully enforceable, because historical artifacts were written against it and replay, audit and
 * compatibility analysis all have to keep working. Nothing in this module can make a registered
 * schema unresolvable.
 */
export type SchemaStatus = 'active' | 'deprecated';

export interface RegisteredSchema {
  /** Canonical, immutable identity — the schema's own `$id`. Not a filesystem path. */
  readonly id: string;
  /** Major contract version, parsed from the canonical id rather than asserted beside it. */
  readonly version: number;
  readonly artifactClass: ArtifactClass;
  readonly status: SchemaStatus;
  /** Governance layer the contract belongs to. Two layers coexist by design — ADR-N0007. */
  readonly layer: 'v1.2' | 'v1.4' | 'n3';
  /** Repository-relative path to the authoritative file. Provenance, never identity. */
  readonly path: string;
  /** SHA-256 over the file's canonical bytes. See CONTENT_HASHES. */
  readonly contentHash: string;
  /**
   * The PRODUCTION-STABLE identity durable artifacts store — N3.
   *
   * The protected v1.4 contracts declare `$id`s under `schemas.freightos.example`. As JSON Schema
   * identifiers those are valid and are never fetched over the network — they are names, not
   * addresses — and N2 keeps them as the canonical validator identity. Every schema this module
   * compiles is read from a file on disk whose bytes are hash-pinned; nothing here retrieves
   * anything by URL, which is why the registry can carry a namespace it does not control.
   *
   * But `.example` is the reserved documentation namespace, and a durable
   * network event is permanent: freezing a documentation namespace into immutable history would be
   * unfixable later, because changing it afterwards would be a new schema identity.
   *
   * So N3 introduces a second, production-owned identity that maps IMMUTABLY 1:1 onto
   * `(id, version, contentHash)`. The protected files are not edited — this is an additional
   * naming layer, not a rewrite. A durable ref may never be repointed at different content; a
   * semantic change requires a new durable ref.
   */
  readonly durableRef: string;
}

/**
 * A registry key: canonical id plus major version.
 *
 * NO DEFAULT-VERSION MAGIC. There is deliberately no `resolve('network.event')` that means
 * "whatever is newest". A caller that upgrades this package must never silently start validating
 * against a different contract than it did yesterday, because durable artifacts written under the
 * old contract would then be graded by the new one.
 */
export interface SchemaKey {
  readonly id: string;
  readonly version: number;
}

/**
 * NO TYPESCRIPT PARAMETER PROPERTIES ANYWHERE IN THIS MODULE.
 *
 * `constructor(readonly key: SchemaKey)` is valid TypeScript and unloadable under
 * `node --experimental-strip-types`, which refuses any syntax that would need code generation
 * rather than erasure. That is not hypothetical here: `pnpm db:up`, `db:down` and `db:status` all
 * run source through exactly that mode, so a parameter property in a package they could import
 * makes the module unloadable in a real execution path. Fields are declared and assigned instead.
 */
export class UnknownSchemaError extends Error {
  readonly key: SchemaKey;

  constructor(key: SchemaKey) {
    super(`no governed schema registered for id="${key.id}" version=${key.version}`);
    this.name = 'UnknownSchemaError';
    this.key = key;
  }
}

export class SchemaIntegrityError extends Error {
  readonly id: string;
  readonly expected: string;
  readonly actual: string;

  constructor(id: string, expected: string, actual: string) {
    super(
      `governed schema ${id} content hash mismatch: expected ${expected}, found ${actual} — ` +
        'a registered schema id/version may not change meaning in place',
    );
    this.name = 'SchemaIntegrityError';
    this.id = id;
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * THE CONTENT LOCK.
 *
 * SHA-256 of each authoritative file's exact bytes, pinned here in source. `$id` and version alone
 * cannot express "and the meaning has not changed" — a schema file can be edited while keeping both.
 * The registry therefore refuses to compile a schema whose bytes differ from the hash recorded
 * against its canonical identity, which is the machine-checkable form of the N2 immutability rule:
 * same id + same version + different content is an error, not an upgrade.
 *
 * Hashing the raw file bytes rather than a re-serialised object is deliberate. `JSON.parse` followed
 * by `JSON.stringify` is not canonical — key order, number formatting and whitespace are all
 * implementation-defined — so a hash over re-serialised output would be a hash over Node's
 * serialiser, not over the contract.
 *
 * Changing a governed contract therefore requires: a new `$id`/version, its own hash, and review of
 * both. Updating a hash in place to absorb an edit is the exact move the mutation test forbids.
 */
const CONTENT_HASHES: Readonly<Record<string, string>> = Object.freeze({
  'https://schemas.freightos.example/network/event-envelope.v1.json':
    'bd704380c2357e3d5a4df01a694384331fef7517c8fe4a6eb4a0b980904c537a',
  'https://schemas.freightos.example/network/command-envelope.v1.json':
    'a9f3d16cf149b35a7190c116e44d3f56fc67432a6db80c7616bc7ae5e7876b96',
  'https://schemas.freightos.example/network/logistics-object-reference.v1.json':
    'eb5cb021cfdf93ff6402ce6959c0de832e2ae5333fba33ed911ec7f69e0cdff9',
  'https://schemas.freightos.example/network/participant-identity.v1.json':
    'c403cf99be06a2e3f74c171e16c8081c7338038dfc1b129f9778ca5d368e5531',
  'https://schemas.freightos.example/network/capability-advertisement.v1.json':
    '76b89dac0e733e221f8ddd651427d536546fef56b29873c86a1914574f42a3b6',
  'https://schemas.freightos.example/network/consent-grant.v1.json':
    'bfe04dd1e0222d9d73cc43252140641fcec9a890532938aa596d81e2da9b7377',
  'https://schemas.freightos.example/network/evidence-envelope.v1.json':
    'a78903548e297c35986e86a8001622aceb893e0746aa6ff23a2f13fa0c95bd88',
  'https://schemas.freightos.example/network/workflow-state.v1.json':
    'b3baae8a704b7e30ab924fe19c2a5f49bb7d3230fc8b258171a2687e54d5491a',
  'https://schemas.rigreceipts.com/network/event-correction.v1.json':
    '75381aa0971b34bdce58e1d6d01c020d23234e4ae82f535d363efc16c3001f0e',
});

/** File name per canonical id. The path is provenance; the id is identity. */
const NETWORK_FILES: Readonly<Record<string, string>> = Object.freeze({
  'https://schemas.freightos.example/network/event-envelope.v1.json':
    'network-event-envelope.schema.json',
  'https://schemas.freightos.example/network/command-envelope.v1.json':
    'network-command-envelope.schema.json',
  'https://schemas.freightos.example/network/logistics-object-reference.v1.json':
    'logistics-object-reference.schema.json',
  'https://schemas.freightos.example/network/participant-identity.v1.json':
    'participant-identity.schema.json',
  'https://schemas.freightos.example/network/capability-advertisement.v1.json':
    'capability-advertisement.schema.json',
  'https://schemas.freightos.example/network/consent-grant.v1.json':
    'consent-grant.schema.json',
  'https://schemas.freightos.example/network/evidence-envelope.v1.json':
    'evidence-envelope.schema.json',
  'https://schemas.freightos.example/network/workflow-state.v1.json':
    'workflow-state.schema.json',
});

const ARTIFACT_CLASSES: Readonly<Record<string, ArtifactClass>> = Object.freeze({
  'https://schemas.freightos.example/network/event-envelope.v1.json': 'event-envelope',
  'https://schemas.freightos.example/network/command-envelope.v1.json': 'command-envelope',
  'https://schemas.freightos.example/network/logistics-object-reference.v1.json':
    'object-reference',
  'https://schemas.freightos.example/network/participant-identity.v1.json': 'participant-identity',
  'https://schemas.freightos.example/network/capability-advertisement.v1.json':
    'capability-advertisement',
  'https://schemas.freightos.example/network/consent-grant.v1.json': 'consent-grant',
  'https://schemas.freightos.example/network/evidence-envelope.v1.json': 'evidence-envelope',
  'https://schemas.freightos.example/network/workflow-state.v1.json': 'workflow-state',
});

/** The v1.2 envelope, registered so the two contracts are comparable rather than merely adjacent. */
export const V1_2_EVENT_ENVELOPE_ID = 'https://rigfreightos.local/schemas/event-envelope.schema.json';
export const V1_4_NETWORK_EVENT_ENVELOPE_ID =
  'https://schemas.freightos.example/network/event-envelope.v1.json';
export const V1_4_LOGISTICS_OBJECT_REFERENCE_ID =
  'https://schemas.freightos.example/network/logistics-object-reference.v1.json';

/**
 * The owner-controlled production namespace for durable schema references — N3.
 *
 * `rigreceipts.com` is the registrable domain the owner controls. These identifiers are PERMANENT
 * PROTOCOL IDENTITIES: a future product or company rename is not authorization to rewrite them,
 * because durable events already reference them and a reference that changes meaning is exactly
 * what the immutability rule forbids.
 */
export const DURABLE_SCHEMA_NAMESPACE = 'https://schemas.rigreceipts.com/network/';

/** The reverse-DNS root and the network event type pattern derived from the same ownership. */
export const NETWORK_EVENT_TYPE_PATTERN = /^com\.rigreceipts\.network\.[a-z0-9_.-]+\.v[0-9]+$/;

/**
 * The N3 correction contract. Unlike the eight v1.4 schemas it is NOT a protected handoff artifact
 * — it is a new N3-governed contract, so it is authored under the production namespace directly and
 * its canonical id and durable ref coincide. It lives inside this package rather than under the
 * protected tree precisely because the protected tree must not be edited to manufacture it.
 */
export const N3_EVENT_CORRECTION_ID =
  'https://schemas.rigreceipts.com/network/event-correction.v1.json';

const N3_SCHEMA_DIR = 'packages/schemas/schemas';

/**
 * Durable slug DERIVED, never invented: the last path segment of the protected `$id`, which already
 * carries both the contract name and its `.vN`. Recording the derivation rather than hand-writing
 * each mapping is what keeps the two identities provably in step.
 */
function durableRefFor(canonicalId: string): string {
  const slug = canonicalId.slice(canonicalId.lastIndexOf('/') + 1);
  return `${DURABLE_SCHEMA_NAMESPACE}${slug}`;
}

/** Major version parsed from a canonical id ending `.v<N>.json`, or 1 for the unversioned v1.2 id. */
function versionFromId(id: string): number {
  const m = /\.v(\d+)\.json$/.exec(id);
  return m ? Number(m[1]) : 1;
}

function sha256OfFile(absolute: string): string {
  return createHash('sha256').update(readFileSync(absolute)).digest('hex');
}

function buildRegistry(): readonly RegisteredSchema[] {
  const root = repositoryRoot();
  const entries: RegisteredSchema[] = [];

  for (const [id, file] of Object.entries(NETWORK_FILES)) {
    const path = `${NETWORK_SCHEMA_DIR}/${file}`;
    entries.push({
      id,
      version: versionFromId(id),
      artifactClass: ARTIFACT_CLASSES[id]!,
      status: 'active',
      layer: 'v1.4',
      path,
      contentHash: sha256OfFile(join(root, path)),
      durableRef: durableRefFor(id),
    });
  }

  // The N3 correction contract — authored under the production namespace, so canonical id and
  // durable ref are the same string. Registered here so it resolves through exactly the same
  // explicit {id, version} path as everything else; there is no second registry.
  {
    const path = `${N3_SCHEMA_DIR}/event-correction.v1.schema.json`;
    entries.push({
      id: N3_EVENT_CORRECTION_ID,
      version: versionFromId(N3_EVENT_CORRECTION_ID),
      artifactClass: 'event-correction',
      status: 'active',
      layer: 'n3',
      path,
      contentHash: sha256OfFile(join(root, path)),
      durableRef: N3_EVENT_CORRECTION_ID,
    });
  }

  // The v1.2 envelope is registered as a peer contract, NOT as a superseded one. ADR-N0007 Option
  // B: both remain valid under separate schema identities, and deprecation is not scheduled.
  entries.push({
    id: V1_2_EVENT_ENVELOPE_ID,
    version: 1,
    artifactClass: 'event-envelope',
    status: 'active',
    layer: 'v1.2',
    path: 'schemas/event-envelope.schema.json',
    contentHash: sha256OfFile(join(root, 'schemas/event-envelope.schema.json')),
    // The v1.2 envelope is internal (ADR-N0007) and never referenced by a durable network event,
    // so its durable ref is its own canonical id: no production alias is minted for a contract
    // that will never appear in the network journal.
    durableRef: V1_2_EVENT_ENVELOPE_ID,
  });

  return Object.freeze(entries);
}

let registryCache: readonly RegisteredSchema[] | undefined;

/** Every governed schema, both layers. Sorted by id so the listing is deterministic. */
export function listRegisteredSchemas(): readonly RegisteredSchema[] {
  registryCache ??= Object.freeze([...buildRegistry()].sort((a, b) => a.id.localeCompare(b.id)));
  return registryCache;
}

/** Resolve one exact contract. Fails closed on an unknown id or an unsupported version. */
export function resolveSchema(key: SchemaKey): RegisteredSchema {
  const found = listRegisteredSchemas().find(
    (s) => s.id === key.id && s.version === key.version,
  );
  if (!found) throw new UnknownSchemaError(key);
  return found;
}

export function isRegistered(key: SchemaKey): boolean {
  return listRegisteredSchemas().some((s) => s.id === key.id && s.version === key.version);
}

/**
 * One Ajv instance holding every v1.4 schema, because four of them `$ref`
 * `logistics-object-reference.v1.json` and a `$ref` cannot resolve against a schema the instance
 * has never been shown. Registering all eight is what makes the event envelope's `subject` array
 * actually enforce the object-reference contract rather than silently accept anything.
 */
let ajvCache: InstanceType<typeof Ajv2020> | undefined;

function networkAjv(): InstanceType<typeof Ajv2020> {
  if (ajvCache) return ajvCache;

  const root = repositoryRoot();
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  for (const entry of listRegisteredSchemas().filter((s) => s.layer !== 'v1.2')) {
    const absolute = join(root, entry.path);
    const actual = sha256OfFile(absolute);
    const expected = CONTENT_HASHES[entry.id];
    // INTEGRITY BEFORE COMPILATION. A schema whose bytes no longer match its registered identity is
    // refused rather than compiled, so a silent semantic edit cannot become an enforced contract.
    // A registered schema with NO pinned hash is refused too. Silently compiling an unpinned
    // contract is how the lock would erode: add a schema, forget the hash, and integrity becomes
    // opt-in. Every governed v1.4 contract must be pinned to be usable.
    if (expected === undefined) {
      throw new SchemaIntegrityError(entry.id, '(no pinned hash)', actual);
    }
    if (expected !== actual) {
      throw new SchemaIntegrityError(entry.id, expected, actual);
    }
    ajv.addSchema(JSON.parse(readFileSync(absolute, 'utf8')) as AnySchema, entry.id);
  }

  ajvCache = ajv;
  return ajv;
}

export interface ValidationFailure {
  readonly path: string;
  readonly message: string;
}

export interface ValidationOutcome {
  readonly valid: boolean;
  readonly errors: readonly ValidationFailure[];
}

function toOutcome(validator: ValidateFunction, value: unknown): ValidationOutcome {
  const valid = validator(value) as boolean;
  if (valid) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: (validator.errors ?? []).map((e: ErrorObject) => ({
      path: e.instancePath || '(root)',
      message: e.message ?? 'invalid',
    })),
  };
}

/**
 * Validate against ONE EXPLICITLY NAMED governed contract.
 *
 * The key is required. There is no overload that guesses, and no "latest" alias, because a caller
 * that does not state which contract it means cannot be given a deterministic answer — and because
 * an artifact durable enough to be replayed must be graded by the contract it was written under.
 */
export function validateAgainst(key: SchemaKey, value: unknown): ValidationOutcome {
  const entry = resolveSchema(key);

  if (entry.layer === 'v1.2') {
    // The v1.2 contract is compiled in its own Ajv instance. Mixing the two layers in one instance
    // would let a `$ref` cross a governance boundary that ADR-N0007 keeps closed.
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const schema = JSON.parse(
      readFileSync(join(repositoryRoot(), entry.path), 'utf8'),
    ) as AnySchema;
    return toOutcome(ajv.compile(schema), value);
  }

  const validator = networkAjv().getSchema(entry.id);
  if (!validator) throw new UnknownSchemaError(key);
  return toOutcome(validator, value);
}

/**
 * VERSION-QUALIFIED PUBLIC API.
 *
 * Named for the contract each one enforces rather than for the concept. There is deliberately no
 * `validateEventEnvelope`: two governed event-envelope contracts exist under different identities,
 * and a name that does not say which one would change meaning under a package upgrade.
 */
export const validateV12EventEnvelope = (value: unknown): ValidationOutcome =>
  validateAgainst({ id: V1_2_EVENT_ENVELOPE_ID, version: 1 }, value);

export const validateV14NetworkEventEnvelope = (value: unknown): ValidationOutcome =>
  validateAgainst({ id: V1_4_NETWORK_EVENT_ENVELOPE_ID, version: 1 }, value);

export const validateV14LogisticsObjectReference = (value: unknown): ValidationOutcome =>
  validateAgainst({ id: V1_4_LOGISTICS_OBJECT_REFERENCE_ID, version: 1 }, value);

/**
 * THE LOGISTICS OBJECT REFERENCE — ADR-N0010 element 3, as a validated contract.
 *
 * The governed shape is exactly what `logistics-object-reference.schema.json` says and nothing
 * more: `network_id` and `object_type` required, `version` and `external_aliases` optional,
 * `additionalProperties: false`.
 *
 * MODE-NEUTRAL BY CONSTRUCTION. The contract names an object by KIND and CANONICAL ID. There is no
 * `truck_id`, `load_id`, `trailer_id` or `driver_id` anywhere in it, so road, rail, ocean and air
 * all use the same primitive and no mode gets a privileged position in a network-wide contract.
 *
 * NOT A PARTICIPANT. ADR-N0005 participants and ADR-N0010 element 3 object references are separate
 * kernel concepts and this module never converts one into the other: a participant is who acts, an
 * object reference is what is acted upon. There is deliberately no helper that turns a
 * `network_participant_id` into an object reference.
 *
 * AND IT CONFERS NOTHING. This is a shape check. It performs no lookup, reaches no database, and
 * returns no object — so constructing a reference to anything, in any tenant, yields exactly one
 * capability: a boolean saying the value is well-formed.
 */
export interface LogisticsObjectReference {
  readonly network_id: string;
  readonly object_type: string;
  readonly version?: number | string;
  readonly external_aliases?: readonly {
    readonly issuer: string;
    readonly value: string;
    readonly verified?: boolean;
  }[];
}

export function isLogisticsObjectReference(value: unknown): value is LogisticsObjectReference {
  return validateV14LogisticsObjectReference(value).valid;
}

/**
 * Resolve a DURABLE reference to its governed contract.
 *
 * This is the lookup a durable artifact performs: an event row stores a production durable ref, and
 * validation must reach exactly the contract that ref was minted against — never "the newest one
 * with a similar name". Fails closed on an unknown ref for the same reason `resolveSchema` does.
 */
export function resolveDurableRef(durableRef: string): RegisteredSchema {
  const found = listRegisteredSchemas().find((s) => s.durableRef === durableRef);
  if (!found) {
    throw new UnknownSchemaError({ id: durableRef, version: 0 });
  }
  return found;
}

/** Validate a payload against the contract a durable reference names. */
export function validateAgainstDurableRef(durableRef: string, value: unknown): ValidationOutcome {
  const entry = resolveDurableRef(durableRef);
  return validateAgainst({ id: entry.id, version: entry.version }, value);
}

/** The durable reference of the v1.4 network event envelope — what `envelope_schema_ref` stores. */
export const V1_4_NETWORK_EVENT_ENVELOPE_DURABLE_REF = `${DURABLE_SCHEMA_NAMESPACE}event-envelope.v1.json`;

/** The durable reference of the N3 correction payload contract. */
export const N3_EVENT_CORRECTION_DURABLE_REF = N3_EVENT_CORRECTION_ID;

export const validateN3EventCorrection = (value: unknown): ValidationOutcome =>
  validateAgainst({ id: N3_EVENT_CORRECTION_ID, version: 1 }, value);
