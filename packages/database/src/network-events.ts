/**
 * N3 — the trusted network-event acceptance component.
 *
 * This module is the ONLY sanctioned path into `network_events`, and the reason it must be is
 * structural: PostgreSQL cannot evaluate JSON Schema 2020-12, so payload conformance can only be
 * established here. The journal is permanently immutable, so a schema-invalid row is not a bug that
 * can be fixed later — it is uncorrectable corruption. That is why `freightos_app` holds no INSERT
 * and why a dedicated `freightos_event_writer` credential exists.
 *
 * WHAT ACCEPTANCE MEANS, precisely: one transaction that authenticates the producer context,
 * validates the organization reference and derives tenant scope, resolves the exact governed
 * payload contract, mints or accepts an event id, sets `recorded_at`, derives `accepted_by`,
 * constructs the COMPLETE final envelope, validates that final envelope, validates `data` against
 * the exact payload schema, enforces the future-time tolerance, computes the fingerprint, resolves
 * duplicates, and inserts. An invalid event never reaches the table.
 *
 * CLAIMED VERSUS TRUSTED. Everything a producer supplies is a claim. `recorded_at`, `accepted_by`
 * and `tenant_id` are trusted and are not in `EventDraft` at all — there is deliberately no field
 * for a caller to fill and the server to overwrite, because a discarded claim invites the belief
 * that it was honoured. The database re-derives all three regardless, which is defence in depth
 * against a future writer that forgets.
 *
 * WHAT THIS IS NOT: no subscriptions, no delivery, no webhooks, no replay service, no
 * reconciliation, no commands, no workflows, no external ingress, no outbox derivation. N3 records
 * accepted facts; everything that consumes them is a later band.
 */

import { randomUUID } from 'node:crypto';
import type { Queryable } from './session.ts';
import {
  canonicalSha256,
  N3_EVENT_CORRECTION_DURABLE_REF,
  NETWORK_EVENT_TYPE_PATTERN,
  resolveDurableRef,
  V1_4_NETWORK_EVENT_ENVELOPE_DURABLE_REF,
  validateAgainstDurableRef,
  type CanonicalJsonValue,
} from '@freightos/schemas';

/**
 * The future-time tolerance, in seconds.
 *
 * APPLICATION CONFIGURATION, not protocol. It is deliberately absent from the JSON Schema, from any
 * database CHECK and from migration 0029: a strict `time <= recorded_at` would reject legitimate
 * producer clock skew, and any number frozen into DDL would be speculative governance that a future
 * external-ingress workstream could not vary per source, channel or device without a migration.
 */
export const DEFAULT_MAX_FUTURE_SKEW_SECONDS = 300;

export function maxFutureSkewSeconds(
  env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const raw = env['NETWORK_EVENT_MAX_FUTURE_SKEW_SECONDS'];
  if (raw === undefined || raw === '') return DEFAULT_MAX_FUTURE_SKEW_SECONDS;
  const value = Number(raw);
  // Validated at startup rather than at first use, so a typo fails the deployment rather than one
  // unlucky event months later.
  if (!Number.isInteger(value) || value < 0) {
    throw new NetworkEventConfigurationError(
      `NETWORK_EVENT_MAX_FUTURE_SKEW_SECONDS must be a non-negative integer, got ${JSON.stringify(raw)}`,
    );
  }
  return value;
}

export class NetworkEventConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkEventConfigurationError';
  }
}

/** An event was refused before it could reach the journal. */
export class EventRejectedError extends Error {
  readonly reason: EventRejectionReason;
  readonly detail: readonly string[];

  constructor(reason: EventRejectionReason, message: string, detail: readonly string[] = []) {
    super(message);
    this.name = 'EventRejectedError';
    this.reason = reason;
    this.detail = detail;
  }
}

export type EventRejectionReason =
  | 'envelope_invalid'
  | 'payload_invalid'
  | 'unknown_schema_ref'
  | 'type_namespace'
  | 'future_time'
  | 'identity_conflict'
  | 'correction_invalid';

/**
 * The acceptance input.
 *
 * No `recorded_at`, no `accepted_by`, no `tenant_id` — those are trusted and derived. `event_id` is
 * optional: absent means FreightOS mints one.
 */
export interface EventDraft {
  readonly type: string;
  readonly source: string;
  readonly subject: readonly CanonicalJsonValue[];
  readonly time: string;
  readonly organization_id: string;
  readonly classification: string;
  readonly schema_ref: string;
  readonly data: CanonicalJsonValue;
  readonly event_id?: string;
  readonly event_class?: string;
  readonly correlation_id?: string;
  readonly causation_id?: string;
  readonly workflow_id?: string;
  readonly trace_id?: string;
  readonly evidence_refs?: readonly string[];
}

export interface AcceptedEvent {
  readonly event_id: string;
  readonly event_fingerprint: string;
  /** True when this call inserted; false when an identical event was already accepted. */
  readonly inserted: boolean;
}

/**
 * UUIDv7 — time-ordered, for index locality on the highest-write append-only table in the system.
 *
 * Node's `randomUUID` is v4, so the version and variant nibbles are rewritten over a 48-bit
 * big-endian millisecond prefix. ORDERING IS AN INDEX OPTIMIZATION AND NOTHING ELSE: no correctness
 * anywhere may derive domain ordering from an identifier, and the database enforces only `uuid`
 * plus global uniqueness so a future external producer may legitimately send a v4.
 */
export function generateEventId(nowMs: number = Date.now()): string {
  const bytes = Buffer.from(randomUUID().replace(/-/g, ''), 'hex');
  bytes.writeUIntBE(nowMs, 0, 6);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The stored envelope, exactly as the governed v1.4 contract defines it. */
interface FinalEnvelope {
  readonly specversion: '1.0';
  readonly id: string;
  readonly type: string;
  readonly source: string;
  readonly subject: readonly CanonicalJsonValue[];
  readonly time: string;
  readonly recorded_at: string;
  readonly organization_id: string;
  readonly classification: string;
  readonly schema_ref: string;
  readonly data: CanonicalJsonValue;
  readonly event_class?: string;
  readonly correlation_id?: string;
  readonly causation_id?: string;
  readonly workflow_id?: string;
  readonly trace_id?: string;
  readonly evidence_refs?: readonly string[];
}

/** Drop absent optionals so the envelope contains only what was actually supplied. */
function withOptionals(
  base: Record<string, unknown>,
  optionals: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out = { ...base };
  for (const [key, value] of Object.entries(optionals)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * The fingerprint of a semantic event.
 *
 * NOT event identity — `event_id` alone is that, and two different ids with identical content stay
 * two facts. The fingerprint answers only whether a REPEATED id carries the same event.
 *
 * Trusted acceptance metadata is excluded on purpose: a legitimate retransmission is accepted at a
 * different `recorded_at`, by possibly a different principal, so including either would make every
 * retry look like a conflict.
 */
export function eventFingerprint(envelope: FinalEnvelope): string {
  const { recorded_at: _recordedAt, ...semantic } = envelope;
  return canonicalSha256(semantic as unknown as CanonicalJsonValue);
}

/**
 * The two governed payload fields, under the names the CONTRACT gives them.
 *
 * Deliberately spelled the contract's way rather than the column's way. `corrected_event_id` (the
 * payload field) and `corrects_event_id` (the journal column) differ by one participle, and reading
 * the payload with the column's spelling silently yields `undefined` — no type error, no validation
 * error, just a correction that loses half its lineage and a CHECK violation somewhere downstream.
 * The rename happens once, visibly, at the bottom of this function.
 */
interface CorrectionPayload {
  readonly corrected_event_id: string;
  readonly replacement_event_id: string;
}

interface CorrectionLineage {
  readonly corrects_event_id: string;
  readonly replacement_event_id: string;
}

/**
 * Extract correction lineage — only from a payload validated against the governed contract.
 *
 * Never parsed from arbitrary JSON keys by convention: a journal foreign key derived from a field
 * nobody governs is a foreign key to whatever a producer decided to call something.
 *
 * PRECONDITION, established by step 6 of `acceptNetworkEvent`: `envelope.data` has already been
 * validated against the contract `envelope.schema_ref` names. That is what makes the cast below
 * safe, and it is why this function pins `schema_ref` to the governed correction contract rather
 * than re-running the validator — pinning the contract pins the shape. A second validation here
 * could never fail, and a guard that cannot fire is worse than no guard: it reads as protection.
 */
function correctionLineage(envelope: FinalEnvelope): CorrectionLineage | null {
  if (envelope.event_class !== 'correction') return null;

  if (envelope.schema_ref !== N3_EVENT_CORRECTION_DURABLE_REF) {
    throw new EventRejectedError(
      'correction_invalid',
      `a correction event must carry the governed correction contract, not ${envelope.schema_ref}`,
    );
  }

  const payload = envelope.data as unknown as CorrectionPayload;
  const { corrected_event_id: corrects, replacement_event_id: replacement } = payload;

  // Rejected here as well as by the database CHECK, so the caller gets a reason rather than a
  // constraint name.
  if (corrects === envelope.id || replacement === envelope.id || corrects === replacement) {
    throw new EventRejectedError(
      'correction_invalid',
      'a correction may not target itself, be its own replacement, or replace an event with itself',
    );
  }
  return { corrects_event_id: corrects, replacement_event_id: replacement };
}

/**
 * Accept one network event.
 *
 * `client` must be a connection held by the trusted acceptance component, authenticated as
 * `freightos_event_writer`. It is the caller's job to open the surrounding transaction; every
 * statement below runs inside it so that an invalid event leaves nothing behind.
 */
export async function acceptNetworkEvent(
  client: Queryable,
  draft: EventDraft,
  options: { readonly maxFutureSkewSeconds?: number; readonly now?: Date } = {},
): Promise<AcceptedEvent> {
  const skew = options.maxFutureSkewSeconds ?? maxFutureSkewSeconds();
  const now = options.now ?? new Date();

  // 1. Type namespace. Rejected before anything else touches the database, and rejected here as
  //    well as by the column CHECK so that a v1.2 `rig.freight.*` type gets an explanation.
  if (!NETWORK_EVENT_TYPE_PATTERN.test(draft.type)) {
    throw new EventRejectedError(
      'type_namespace',
      `event type ${JSON.stringify(draft.type)} is outside the governed network namespace`,
    );
  }

  // 2. Resolve the exact governed payload contract from its durable reference. Fails closed.
  try {
    resolveDurableRef(draft.schema_ref);
  } catch {
    throw new EventRejectedError(
      'unknown_schema_ref',
      `no governed contract is registered for durable schema reference ${draft.schema_ref}`,
    );
  }

  // 3. Identity: mint or accept. A supplied id is honoured whatever its UUID version — the
  //    acceptance contract is uniqueness, not format.
  const eventId = draft.event_id ?? generateEventId(now.getTime());

  // 4. Construct the COMPLETE final envelope, including the trusted acceptance time.
  const recordedAt = now.toISOString();
  const envelope = withOptionals(
    {
      specversion: '1.0',
      id: eventId,
      type: draft.type,
      source: draft.source,
      subject: draft.subject,
      time: draft.time,
      recorded_at: recordedAt,
      organization_id: draft.organization_id,
      classification: draft.classification,
      schema_ref: draft.schema_ref,
      data: draft.data,
    },
    {
      event_class: draft.event_class,
      correlation_id: draft.correlation_id,
      causation_id: draft.causation_id,
      workflow_id: draft.workflow_id,
      trace_id: draft.trace_id,
      evidence_refs: draft.evidence_refs,
    },
  ) as unknown as FinalEnvelope;

  // 5. Validate the FINAL envelope — the artifact that will actually be stored, not the draft.
  const envelopeOutcome = validateAgainstDurableRef(
    V1_4_NETWORK_EVENT_ENVELOPE_DURABLE_REF,
    envelope,
  );
  if (!envelopeOutcome.valid) {
    throw new EventRejectedError(
      'envelope_invalid',
      'the constructed envelope does not satisfy the governed v1.4 network event envelope',
      envelopeOutcome.errors.map((e) => `${e.path} ${e.message}`),
    );
  }

  // 6. Validate `data` against the exact payload contract the durable reference names.
  //
  //    THE ONLY PLACE PAYLOAD CONFORMANCE IS DECIDED — for every contract, corrections included.
  //    Step 8 relies on that: having established `schema_ref` is the governed correction contract,
  //    it may read the payload's fields without re-validating them.
  const payloadOutcome = validateAgainstDurableRef(draft.schema_ref, draft.data);
  if (!payloadOutcome.valid) {
    throw new EventRejectedError(
      'payload_invalid',
      `event data does not satisfy ${draft.schema_ref}`,
      payloadOutcome.errors.map((e) => `${e.path} ${e.message}`),
    );
  }

  // 7. Future-time tolerance.
  const occurredMs = Date.parse(draft.time);
  if (Number.isNaN(occurredMs)) {
    throw new EventRejectedError(
      'envelope_invalid',
      `time ${JSON.stringify(draft.time)} is not a timestamp`,
    );
  }
  if (occurredMs > now.getTime() + skew * 1000) {
    throw new EventRejectedError(
      'future_time',
      `event time ${draft.time} is more than ${skew}s after acceptance — a fact from the future is not a fact`,
    );
  }

  // 8. Lineage, from the payload step 6 has already validated. Must stay after step 6.
  const lineage = correctionLineage(envelope);

  // 9. Fingerprint over the semantic event.
  const fingerprint = eventFingerprint(envelope);

  // 10. Insert, resolving duplicates by identity. `ON CONFLICT DO NOTHING` keeps the race between
  //     two concurrent retransmissions inside the database rather than in a check-then-insert
  //     window, and the follow-up read is limited to the two columns the writer may see.
  const inserted = await client.query<{ event_id: string }>(
    `INSERT INTO network_events (
       event_id, type, source, subject, occurred_at, organization_id, classification,
       schema_ref, envelope_schema_ref, data, event_class, correlation_id, causation_id,
       workflow_id, trace_id, evidence_refs, event_fingerprint,
       corrects_event_id, replacement_event_id,
       recorded_at, accepted_by
     ) VALUES (
       $1, $2, $3, $4::jsonb, $5::timestamptz, $6, $7,
       $8, $9, $10::jsonb, $11::app.network_event_class, $12, $13,
       $14, $15, $16::jsonb, $17,
       $18, $19,
       now(), 'pending'
     )
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id`,
    [
      eventId,
      draft.type,
      draft.source,
      JSON.stringify(draft.subject),
      draft.time,
      draft.organization_id,
      draft.classification,
      draft.schema_ref,
      V1_4_NETWORK_EVENT_ENVELOPE_DURABLE_REF,
      JSON.stringify(draft.data),
      draft.event_class ?? null,
      draft.correlation_id ?? null,
      draft.causation_id ?? null,
      draft.workflow_id ?? null,
      draft.trace_id ?? null,
      draft.evidence_refs === undefined ? null : JSON.stringify(draft.evidence_refs),
      fingerprint,
      lineage?.corrects_event_id ?? null,
      lineage?.replacement_event_id ?? null,
    ],
  );

  if (inserted.rowCount === 1) {
    return { event_id: eventId, event_fingerprint: fingerprint, inserted: true };
  }

  // The id already exists. Compare fingerprints — NOT payloads: the writer deliberately cannot read
  // anyone's payload, and identity-only comparison is all duplicate resolution needs.
  const existing = await client.query<{ event_fingerprint: string }>(
    'SELECT event_fingerprint FROM network_events WHERE event_id = $1',
    [eventId],
  );
  const seen = existing.rows[0]?.event_fingerprint;
  if (seen === fingerprint) {
    return { event_id: eventId, event_fingerprint: fingerprint, inserted: false };
  }
  throw new EventRejectedError(
    'identity_conflict',
    `event ${eventId} already exists with different immutable content — ` +
      'the same event identity may not silently change meaning',
    [`existing=${seen ?? '(unreadable)'}`, `offered=${fingerprint}`],
  );
}
