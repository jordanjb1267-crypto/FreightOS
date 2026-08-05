/**
 * Schema packages — PHASE_0_FOUNDATION requires "domain, command, event, policy, and
 * agent-manifest schema packages".
 *
 * The JSON Schemas themselves live at the repository root under schemas/ as generated operational
 * copies of the handoff (ADR-0014). This package compiles them once and exposes typed validators,
 * so no other package parses schema files itself.
 *
 * Constitution Art. IV.3: "Model outputs are schema validated." A validator that is easy to reach
 * for is what makes that rule survive contact with a deadline.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import _Ajv2020 from 'ajv/dist/2020.js';
import _addFormats from 'ajv-formats';
import type { AnySchema, ErrorObject } from 'ajv';

/**
 * Walk upward for the workspace marker rather than counting `../` segments, so this keeps working
 * whether the module runs from source, from dist, or from a test runner's temp directory.
 *
 * Duplicated from packages/config rather than imported — F-11. Both packages are ADR-0024 L0, and
 * L0 has no lower layer to depend on, so `@freightos/schemas -> @freightos/config` is a same-layer
 * edge the layering rule forbids. It was reaching across with a relative path, which declared
 * nothing in package.json and so was invisible to the check. Fourteen lines of path walking is the
 * cheaper of the two ways to be honest about that; the other is a new package below L0 whose only
 * member is this function.
 */
function repositoryRoot(from: string = fileURLToPath(import.meta.url)): string {
  let dir = dirname(from);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('repository root not found: no pnpm-workspace.yaml above');
    dir = parent;
  }
}

// ajv v8 ships CommonJS. Under NodeNext the runtime interop is correct but the types resolve to a
// namespace rather than a constructor, so the default export is re-pointed explicitly.
const Ajv2020 = _Ajv2020 as unknown as typeof _Ajv2020.default;
const addFormats = _addFormats as unknown as typeof _addFormats.default;

export const SCHEMA_FILES = {
  eventEnvelope: 'schemas/event-envelope.schema.json',
  agentManifest: 'schemas/agent-manifest.schema.json',
  policyDecision: 'schemas/policy-decision.schema.json',
  meterEvent: 'schemas/meter-event.schema.json',
  modalAdapter: 'schemas/modal-adapter.schema.json',
  custodyEvent: 'schemas/custody-event.schema.json',
  facilityAdapter: 'schemas/facility-adapter.schema.json',
  autonomousVehicleAdapter: 'schemas/autonomous-vehicle-adapter.schema.json',
} as const;

export type SchemaName = keyof typeof SCHEMA_FILES;

export interface ValidationFailure {
  readonly path: string;
  readonly message: string;
}

export interface ValidationOutcome {
  readonly valid: boolean;
  readonly errors: readonly ValidationFailure[];
}

// `strict: false` because the handoff schemas use annotation keywords Ajv's strict mode rejects.
// `allErrors` so a caller sees every problem at once rather than one per round trip.
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const compiled = new Map<SchemaName, ReturnType<typeof ajv.compile>>();

function validatorFor(name: SchemaName) {
  const cached = compiled.get(name);
  if (cached) return cached;

  const absolute = join(repositoryRoot(), SCHEMA_FILES[name]);
  const schema = JSON.parse(readFileSync(absolute, 'utf8')) as AnySchema;
  const validate = ajv.compile(schema);
  compiled.set(name, validate);
  return validate;
}

export function validate(name: SchemaName, value: unknown): ValidationOutcome {
  const validator = validatorFor(name);
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

export class SchemaValidationError extends Error {
  readonly schema: SchemaName;
  readonly failures: readonly ValidationFailure[];

  constructor(schema: SchemaName, failures: readonly ValidationFailure[]) {
    super(
      `${schema} validation failed: ${failures.map((f) => `${f.path} ${f.message}`).join('; ')}`,
    );
    this.name = 'SchemaValidationError';
    this.schema = schema;
    this.failures = failures;
  }
}

/** Throwing variant, for boundaries where an invalid value must not proceed. */
export function assertValid(name: SchemaName, value: unknown): void {
  const outcome = validate(name, value);
  if (!outcome.valid) throw new SchemaValidationError(name, outcome.errors);
}

export function listSchemas(): readonly SchemaName[] {
  return Object.keys(SCHEMA_FILES) as SchemaName[];
}
