# ADR-N0007 — Network event envelope versioning

- **ADR ID:** N0007
- **Title:** The v1.2 envelope is not superseded; the network envelope is a separate contract
- **Status:** Proposed — N0 governance wiring, awaiting external rereview
- **Date:** 2026-08-10
- **Related:** v1.4.0 `05_UNIVERSAL_EVENT_MODEL.md`, `schemas/network-event-envelope.schema.json`; root `schemas/event-envelope.schema.json`; ADR-0015, ADR-0019
- **Changes no runtime behavior.** N0 freezes the strategy only.

## Context

Two envelopes exist and they are not compatible. Both set `additionalProperties: false`, and their
required sets are disjoint in both directions.

|                       | v1.2 `event-envelope` (installed, enforced)                                                                                   | v1.4 `network-event-envelope` (handoff only)                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Required              | `specversion, id, type, source, time, tenantid, legalauthorityclass, operatingcontext, actorid, correlationid, purpose, data` | `specversion, id, type, source, subject, time, recorded_at, organization_id, classification, schema_ref, data` |
| Naming                | `alllowercase`                                                                                                                | `snake_case`                                                                                                   |
| Scope key             | `tenantid`                                                                                                                    | `organization_id`                                                                                              |
| Absent from the other | `legalauthorityclass`, `operatingcontext`, `actorid`, `purpose`                                                               | `recorded_at`, `classification`, `schema_ref`, `event_class`, `evidence_refs`, `workflow_id`, `trace_id`       |

Three facts from the repository decide this, and none of them is aesthetic.

1. **The v1.2 envelope is not the handoff's.** It is a declared `overrides` entry in
   `handoff-provenance.json`, deliberately diverged under ADR-0015 and ADR-0019: `authoritymode` was
   replaced by `legalauthorityclass` + `operatingcontext`, and `purpose` was added as a required
   closed vocabulary. Adopting v1.4 in its place would silently drop all four fields.
2. **`purpose` is enforced in SQL.** Migration 0006 defines `app.is_permitted_purpose`, and
   `outbox_events` and `audit_events` both carry a `purpose` column. Dropping it from the envelope
   would put the contract and the database in direct conflict.
3. **`outbox_events` is the v1.2 shape**, and it is a table proven append-only by trigger and ACL,
   with UPDATE/DELETE/TRUNCATE rejection tests. Reshaping it buys nothing before a network journal
   exists to consume it.

Supersession is therefore not safe on repository evidence. That conclusion comes from the three facts
above, not from a preference.

## Decision

**Option B — both contracts remain valid under separate schema identities.**

- `schemas/event-envelope.schema.json` (v1.2) continues to govern the existing domain/outbox path,
  **unchanged**. Its override and ADR-0015/0019 rationale stand.
- `network-event-envelope` is installed in **N2** as a _new, separately identified_ contract under a
  distinct `$id`. It governs the network event journal introduced in **N3**. It does not replace, and
  is not merged into, the v1.2 envelope.
- A **compatibility profile** — an explicit field mapping and a statement of what each direction
  loses — is an **N3** deliverable, written when there is a journal to map onto. N0 does not write it,
  and no adapter is authorized here.
- Deprecation of the v1.2 envelope is **not scheduled**. It becomes a question only if and when the
  network journal supersedes the outbox path in fact, which is not a decision N0 can make.

### Non-regression rule

The v1.2 envelope, `outbox_events`, `audit_events` and `app.is_permitted_purpose` may not be altered
by any network PR whose stated purpose is envelope convergence. Convergence is a migration with its
own evidence, not a side effect.

## Alternatives considered

**A — v1.4 supersedes v1.2 in place.** Rejected on the three facts above: it drops
`legalauthorityclass`, `operatingcontext`, `actorid` and `purpose`, contradicts a SQL-enforced
vocabulary, and reshapes a proven append-only table for no benefit before N3.

**C — a third canonical envelope superseding both.** Rejected as premature. It commits to a merged
design before a single network event exists, and there is no evidence yet about what network
consumers need. C remains available at N3 and is not foreclosed.

## Event/command/workflow impact

Network events (N3) will carry the network envelope; domain events continue on the v1.2 envelope
until a separately evidenced migration says otherwise. The two are distinguished by schema `$id`, not
by convention.

## Interoperability impact

External consumers see the network envelope only. The v1.2 envelope stays internal.

## Migration and rollback

None in N0. Zero schema files change; zero database objects change.

## Open decisions

v1.4.0 decision 7 (managed broker vs relational outbox-first) shapes whether N4 extends
`outbox_events` or adds a journal beside it. Whether the network envelope's absent tenant scoping is
acceptable, or whether the network journal carries `tenant_id` alongside `organization_id` — governed
by ADR-N0011 and settled in N3.
