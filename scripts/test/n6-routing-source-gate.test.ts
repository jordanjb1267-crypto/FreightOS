import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * N6 routing authority, proven at the SOURCE.
 *
 * Behaviour proves the current evaluator ignores caller-supplied routing inputs. It cannot prove
 * the evaluator is unable to start reading them, because a future implementation that accepted a
 * `recipientParticipantId` argument would compile and would pass every behavioural test written
 * against honest fixtures — the fixtures would simply pass the same recipient the subscription
 * names. This is the lesson N5-B learned about producer-supplied `classification`, applied to
 * routing: the dangerous version of the bug is the one that agrees with the tests.
 *
 * So the gate is structural. The exported surface must not name a recipient, purpose, pointer,
 * projection, destination or classification parameter at all, and comments are stripped first
 * because the module documents at length what it refuses to accept.
 */

const MODULE = fileURLToPath(
  new URL('../../packages/context/src/disclosure-delivery.ts', import.meta.url),
);

/** Executable source only. The prose explaining the refusals must not trip the detector. */
function executableSource(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * The public function signatures, flattened.
 *
 * A parameter list is where a caller's authority would enter, so that is what is inspected rather
 * than the whole file — the module legitimately MENTIONS `recipientParticipantId` when it reads
 * one off a governed subscription, and forbidding the identifier outright would forbid the correct
 * implementation along with the wrong one.
 */
function exportedSignatures(source: string): readonly string[] {
  const out: string[] = [];
  const re = /export function\s+\w+\s*\(([\s\S]*?)\)\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1]!);
  return out;
}

/**
 * The parameter NAMES a caller binds, without their types.
 *
 * The distinction is the whole gate. `metadata: SensitivityMetadata` is the governed N5-B
 * vocabulary read out of the database and passing it is correct; a parameter NAMED
 * `sensitivityCode` would be a caller asserting a classification. Matching on the type name would
 * forbid the correct implementation along with the wrong one, which is how a security gate ends up
 * being deleted for being wrong rather than fixed.
 */
function parameterNames(signature: string): readonly string[] {
  return (
    signature
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((part) => part.split(':')[0]!.trim())
      // The trailing `?` of an OPTIONAL parameter is stripped before the shape test.
      //
      // Without this the gate had a hole exactly where a real one would be introduced. `purpose?:
      // string` split to `purpose?`, which fails `^\w+$`, so the name was DISCARDED before any
      // forbidden word was looked for — and an optional parameter is precisely how caller-supplied
      // authority arrives in practice, because it is the form that does not break existing callers.
      // Mutations D-C, D-D, D-E and D-I all walked through this and were recorded as undetected.
      .map((name) => name.replace(/\?$/, ''))
      .filter((name) => /^\w+$/.test(name))
  );
}

const SOURCE = executableSource(readFileSync(MODULE, 'utf8'));

/** What a caller must never be able to hand the router. */
const FORBIDDEN_PARAMETERS = [
  'recipient',
  'purpose',
  'pointer',
  'projection',
  'destination',
  'classification',
  'sensitivity',
  'grant',
  'fields',
  // R-11. An escape hatch from the artifact/event pairing check would be a caller asserting
  // provenance, which is the same class of thing as a caller asserting a recipient. None of the
  // module's real parameters — input, metadata, artifact, attemptNumber, random, attemptCount,
  // createdAt, now — contains any of these, so the gate costs nothing until someone adds one.
  'override',
  'ignore',
  'trust',
  'skip',
  'bypass',
  'force',
] as const;

describe('the N6 router accepts no caller-supplied authority', () => {
  const signatures = exportedSignatures(SOURCE);

  it('exports functions at all — the gate would be vacuous over an empty set', () => {
    expect(signatures.length).toBeGreaterThanOrEqual(4);
  });

  const names = signatures.flatMap((s) => parameterNames(s));

  it('binds parameters at all — the gate would be vacuous over an empty set', () => {
    expect(names.length).toBeGreaterThanOrEqual(6);
  });

  for (const forbidden of FORBIDDEN_PARAMETERS) {
    it(`binds no \`${forbidden}\` parameter in any exported signature`, () => {
      const offending = names.filter((n) => n.toLowerCase().includes(forbidden));
      expect(offending, `parameters named after ${forbidden}: ${offending.join(', ')}`).toEqual([]);
    });
  }

  it('detects a planted OPTIONAL parameter, and a multi-line signature', () => {
    // The regression control for the hole D-C/D-D/D-E/D-I found. An optional parameter is the
    // form caller-supplied authority actually takes — it compiles without touching a single
    // existing call site — and it was the one form this gate could not see.
    const optional = exportedSignatures(
      `export function resolveRouting(
         input: DeliveryRoutingInput,
         metadata: SensitivityMetadata | null,
         requestedPurpose?: string,
         recipientOverride?: string,
         permittedPointersOverride?: readonly string[],
       ): RoutingResolution {`,
    ).flatMap((s) => parameterNames(s));
    expect(optional).toContain('requestedPurpose');
    expect(optional).toContain('recipientOverride');
    expect(optional).toContain('permittedPointersOverride');
    for (const forbidden of ['purpose', 'recipient', 'pointer'] as const) {
      expect(
        optional.filter((n) => n.toLowerCase().includes(forbidden)),
        `an optional ${forbidden} parameter must be visible to the gate`,
      ).not.toEqual([]);
    }
  });

  it('detects a planted parameter — the detector is live', () => {
    const planted = exportedSignatures(
      'export function resolveRouting(recipientParticipantId: string, purposeCode: string): void {',
    ).flatMap((s) => parameterNames(s));
    expect(planted.some((n) => n.toLowerCase().includes('recipient'))).toBe(true);
    expect(planted.some((n) => n.toLowerCase().includes('purpose'))).toBe(true);
  });

  it('does not flag the module for DOCUMENTING what it refuses to accept', () => {
    // Anti-vacuity in the other direction: the header prose names every forbidden word, and a gate
    // that failed on prose would force the explanation to be deleted to make the test pass.
    const raw = readFileSync(MODULE, 'utf8');
    expect(raw).toContain('recipientParticipantId');
    expect(names.some((n) => n.toLowerCase().includes('recipient'))).toBe(false);
  });

  it('does not flag a governed metadata parameter for its TYPE name', () => {
    // `metadata: SensitivityMetadata` must pass: the governed N5-B vocabulary is exactly what the
    // evaluator is supposed to receive. Only a parameter NAMED after a sensitivity is a threat.
    expect(names).toContain('metadata');
    expect(names.some((n) => n.toLowerCase().includes('sensitivity'))).toBe(false);
  });

  it('reads the field set from N5-A and from nowhere else', () => {
    // `permittedPointers` is the only pointer source in executable scope. A raw-event fallback or
    // an include-extra escape hatch would have to name something else.
    expect(SOURCE).toContain('permittedPointers(decision)');
    for (const escape of ['include_extra', 'includeExtra', 'rawEvent', 'raw_event', 'fullRecord']) {
      expect(SOURCE).not.toContain(escape);
    }
  });

  it('is handed no event classification and no tenant, because the types cannot carry them', () => {
    // THE TYPE SURFACE IS THE CONTROL — mutations D-H and D-N.
    //
    // "Use the producer's classification as routing authority" and "short-circuit N5 when the
    // tenants match" are both UNWRITEABLE against the current types: `DisclosureEvent` carries
    // exactly `eventId`, `organizationId`, `schemaRef` and `data`, and `DisclosureParticipant`
    // carries no tenant at all. Both mutations were applied and changed nothing, because the
    // fields they read do not exist — which is a stronger outcome than a detector firing, but only
    // for as long as the types stay that shape. This is the gate that keeps them that shape: a
    // future widening has to fail here before the bypass it enables becomes writeable.
    const disclosure = readFileSync(
      new URL('../../packages/context/src/disclosure.ts', import.meta.url),
      'utf8',
    );
    const body = (name: string): string => {
      const start = disclosure.indexOf(`export interface ${name} {`);
      expect(start, `${name} must exist for this gate to mean anything`).toBeGreaterThan(-1);
      return disclosure.slice(start, disclosure.indexOf('\n}', start));
    };

    const event = body('DisclosureEvent');
    for (const field of ['classification', 'tenantId', 'tenant_id', 'sensitivity']) {
      expect(event, `DisclosureEvent must not carry ${field}`).not.toContain(field);
    }
    // Anti-vacuity: the four fields it DOES carry are present, so the absences above are read off
    // a real interface rather than an empty string.
    for (const field of ['eventId', 'organizationId', 'schemaRef', 'data']) {
      expect(event).toContain(field);
    }

    const participant = body('DisclosureParticipant');
    for (const field of ['tenantId', 'tenant_id']) {
      expect(participant, `DisclosureParticipant must not carry ${field}`).not.toContain(field);
    }
    expect(participant).toContain('participantId');

    // And N6's own module reads neither, whatever the shared types grow later.
    for (const escape of ['.classification', 'tenantId', 'tenant_id']) {
      expect(SOURCE, `${escape} must not appear in the N6 router`).not.toContain(escape);
    }
  });

  it('keeps the artifact/event pairing contract — R-11', () => {
    // THE CONTRACT T-02 TAUGHT US TO PIN. An API invariant that holds because nobody has removed
    // it yet is not an invariant; the type surface is what keeps it true. Four things have to
    // survive for the pairing check to remain writeable AND required.

    // 1 & 2. Both identities must remain available to the function. If either field were renamed
    //        or dropped, the check would stop compiling — but a future edit could equally drop the
    //        CHECK and keep the fields, so these are the floor rather than the whole gate.
    const disclosure = readFileSync(
      new URL('../../packages/context/src/disclosure.ts', import.meta.url),
      'utf8',
    );
    expect(disclosure, 'DisclosureEvent must still carry eventId').toMatch(/\beventId\b/);
    expect(SOURCE, 'DisclosureArtifact must still carry networkEventId').toMatch(
      /readonly networkEventId: string;/,
    );

    // 3. The refusal reason remains part of the result contract. Deleting the union member is the
    //    cheapest way to delete the behaviour, and it would otherwise fail only inside the tests
    //    that assert it rather than at the contract.
    expect(SOURCE, 'artifact_event_mismatch must remain a ReauthorizationRefusalReason').toContain(
      "| 'artifact_event_mismatch'",
    );

    // 4. THE ORDERING, structurally. Read off the function body rather than the whole file, so a
    //    mention of either token in the header prose cannot satisfy it. The comparison must appear
    //    before the N5 call — behaviour proves the current order, this keeps it.
    const start = SOURCE.indexOf('export function reauthorizeDelivery');
    expect(start, 'reauthorizeDelivery must exist for this gate to mean anything').toBeGreaterThan(
      -1,
    );
    const body = SOURCE.slice(start, SOURCE.indexOf('\n}', start));
    const guard = body.indexOf('artifact.networkEventId !== input.event.eventId');
    const n5 = body.indexOf('evaluateDisclosureWithCeiling');
    expect(guard, 'the pairing comparison must be present in the body').toBeGreaterThan(-1);
    expect(n5, 'the N5 evaluation must be present in the body').toBeGreaterThan(-1);
    expect(guard, 'provenance must be checked BEFORE N5 evaluation').toBeLessThan(n5);

    // And before the subscription lookup, which is the other refusal that could mask it.
    const lookup = body.indexOf('input.subscriptions.find');
    expect(lookup).toBeGreaterThan(-1);
    expect(guard, 'provenance must be checked BEFORE the subscription lookup').toBeLessThan(lookup);
  });

  it('performs no network egress of any kind', () => {
    for (const primitive of [
      'fetch(',
      'node:http',
      'node:https',
      'node:net',
      'node:tls',
      'undici',
      'axios',
      'WebSocket',
    ]) {
      expect(SOURCE, `${primitive} must not appear in the N6 module`).not.toContain(primitive);
    }
  });
});
