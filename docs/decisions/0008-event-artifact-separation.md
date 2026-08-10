# ADR-N0008 — Event artifact separation

- **ADR ID:** N0008
- **Title:** Four distinct event artifacts; `audit_events` is not a network bus
- **Status:** Proposed — N0 governance wiring, awaiting external rereview
- **Date:** 2026-08-10
- **Related:** v1.4.0 `00_MASTER_HANDOFF.md` §9, `05_UNIVERSAL_EVENT_MODEL.md`, `21_NETWORK_OBSERVABILITY_AND_SLOS.md`
- **Architectural non-regression rule. Binds N3 and N4.**

## Context

The repository has two append-only tables — `audit_events` and `outbox_events` — and the network
architecture describes several more kinds of record. The cheap move at N3 is to reuse
`audit_events` as the network journal because it already exists, is append-only, and is
tenant-scoped. The handoff names this exact shortcut: _"a generic message table is not a governed
event model."_

The reason it is prohibited is not tidiness. `audit_events` exists to prove that security and
governance actions happened, under protections built for that purpose: append-only enforced by
trigger _and_ ACL, UPDATE/DELETE/TRUNCATE rejected even for the owner, forged-provenance tests, a
`legal_entity_id` check constraint, and a closed `purpose` vocabulary. Every one of those becomes an
obstacle when the same table is asked to carry high-volume logistics facts with corrections, replay,
projection and retention classes — and the predictable result is that a network requirement is met by
loosening an audit protection.

## Decision

Four artifacts, separately stored, separately governed:

| Artifact                    | Answers                                                                       | Where                                             | Mutability                                                                   |
| --------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Security audit event**    | _Did a governed security or authority action occur, and by whom?_             | `audit_events` (exists)                           | Append-only. No correction; an erroneous entry is followed by another entry. |
| **Network / domain event**  | _What logistics fact occurred, was asserted, observed, derived or corrected?_ | Network journal (**N3**)                          | Append-only, with explicit **correction events** carrying lineage.           |
| **Command result**          | _What was the outcome of an attempted command?_                               | Command store (**N7**)                            | Bound to a command ID and idempotency key; deterministic on replay.          |
| **Observation / telemetry** | _What is the system's operational state?_                                     | Observability pipeline (**not a database table**) | Sampled, aggregated, expiring.                                               |

### Rules

1. `audit_events` **may not** be used as a network event bus, a domain event store, a command result
   store, or a telemetry sink.
2. No network requirement may weaken an audit protection. If a network need appears to require
   relaxing append-only, provenance or the purpose vocabulary, the design is wrong.
3. The network journal does **not** inherit audit's guarantees by proximity; it states its own.
4. A single real-world occurrence may legitimately produce **both** an audit event and a network
   event. That is duplication of _fact_, not of _record_, and it is correct: they answer different
   questions to different audiences with different retention.
5. Telemetry never becomes a durable event record merely because it is convenient to query.

## Alternatives considered

**One event table with a `kind` discriminator.** Rejected: it forces one retention policy, one
projection policy and one mutability rule onto four artifacts that need four, and it puts network
volume behind audit's guarantees.

**Network journal as a view over `audit_events`.** Rejected: corrections, classification, evidence
references and replay position have nowhere to live, and audit rows would have to carry network
fields to make the view work.

**Reuse `outbox_events` as the network journal.** Not rejected outright — deferred to N4 with
evidence. The outbox is a _delivery intent_ record, not a journal, and conflating publication intent
with the durable statement of fact is a different error from the audit one. v1.4.0 decision 7 governs.

## Data ownership/privacy impact

Separation is what lets network events carry `classification` and field-level projection without
introducing a redaction path into the audit ledger, where redaction must not exist.

## Migration and rollback

None in N0. N3 adds the journal as a new table; no existing table is altered.

## Acceptance evidence

N3 must show the journal is a distinct object with its own append-only proof, and that no network
read path reaches `audit_events`.
