# ADR-N0009 — Network idempotency, correlation and causation

- **ADR ID:** N0009
- **Title:** Identifier semantics for events, commands and replay
- **Status:** Proposed — N0 governance wiring, awaiting external rereview
- **Date:** 2026-08-10
- **Related:** v1.4.0 `05_UNIVERSAL_EVENT_MODEL.md` §5–7, `06_INTENT_COMMAND_AND_WORKFLOW_PROTOCOL.md` §3–4, `11_EVENT_BUS…` §5; v1.3.0 `07_EVENT_BUS_IDEMPOTENCY_RECONCILIATION.md`
- **Semantics only. No store is created by this ADR.**

## Context

`outbox_events` already carries `event_id`, `correlation_id` and `causation_id`, and nothing defines
what they mean, what they are unique against, or how long they must persist. Every later capability —
delivery, replay, reconciliation, correction lineage, command idempotency — depends on those answers,
and they are far cheaper to fix now than after two consumers have assumed different ones.

Delivery is **at-least-once** unless a transport proves stronger (`05_…` §6), so duplicate handling
is a correctness requirement, not an optimization.

## Decision

| Identifier            | Scope                               | Uniqueness boundary                                  | Assigned by                      | Retention                                                                     |
| --------------------- | ----------------------------------- | ---------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------- |
| **`event_id`**        | One immutable statement of fact     | **Globally unique.** The deduplication key.          | Producer, at creation            | Life of the event record                                                      |
| **`command_id`**      | One command _instance_              | Globally unique                                      | Command issuer                   | Life of the command record                                                    |
| **`idempotency_key`** | One _intended effect_               | Unique per **(requester participant, command_type)** | Caller                           | ≥ the command's `expires_at`, and never shorter than the longest retry window |
| **`correlation_id`**  | One business interaction end-to-end | Not unique; shared                                   | Originator; propagated unchanged | Life of the longest record carrying it                                        |
| **`causation_id`**    | The _immediate_ parent              | Not unique; points to one `event_id` or `command_id` | Emitter of the caused record     | Life of the record                                                            |

### Rules

1. **`event_id` is the dedupe key.** A consumer that has processed an `event_id` must not process it
   again. Under at-least-once delivery, redelivery is normal traffic, not an error.
2. **`idempotency_key` is scoped, not global.** Two participants may legitimately send the same key
   for unrelated intents; the same participant repeating a key for the same command type means _the
   same intent_. A repeat returns the prior result or safely resumes — never a second tow, booking,
   payment or approval (`06_…` §4).
3. **Execution claims are persisted before external side effects.** The claim is what makes a crash
   between "acted" and "recorded" recoverable rather than silently duplicating.
4. **`correlation_id` propagates unchanged; `causation_id` is rewritten at each hop.** Correlation
   answers _what interaction_, causation answers _what directly caused this_. Collapsing them loses
   the causal chain that `18` (state explainable from events) depends on.
5. **Replay re-delivers events; replay never re-executes commands.** A replayed event is the same
   event with the same `event_id`, so an idempotent consumer converges. Commands are excluded from
   replay entirely — this is the boundary that keeps reconciliation from moving money twice.
6. **Corrections reference, never overwrite.** A correction event is a new event with its own
   `event_id`, a reference to the original, a reason and a correcting authority. Projections must
   declare whether they have incorporated it (`05_…` §7).
7. **Absence is not a gap.** Ordering guarantees are per aggregate/partition/workflow, never global
   (`05_…` §5). Consumers tolerate late arrival and must not infer loss from a sequence hole alone.

## Alternatives considered

**Globally unique `idempotency_key`.** Rejected: it makes one participant's key choice able to
collide with another's, turning an unrelated caller's retry into a rejected command.

**One identifier for correlation and causation.** Rejected: it cannot express a chain, only
membership, and the reconstruction requirement needs the chain.

**Dedupe on payload hash instead of `event_id`.** Rejected: two genuinely distinct events can carry
identical payloads — two identical gate scans seconds apart are two facts, not one.

## Event/command/workflow impact

Binds N3 (event journal), N4 (outbox/dedupe), N6 (delivery and replay) and N7 (command store).

## Migration and rollback

None in N0. The existing `outbox_events` columns are already consistent with these semantics; no
column changes.

## Open decisions

Concrete retention durations per event class (v1.4.0 decision 13). Whether the idempotency store is a
dedicated table or a column set on the command record — an N7 decision.
