# Event envelope compatibility profile — v1.2 ↔ v1.4 network

- **Status:** Descriptive. Delivers the N3 obligation ADR-N0007 recorded.
- **Date:** 2026-08-10
- **Related:** ADR-N0007 (envelope versioning), ADR-N0008 (event artifact separation),
  ADR-N0011 (tenant and organization separation), ADR-N0013 (universal network event journal)

## What this document is, and is not

ADR-N0007 chose Option B: the two envelopes are **distinct versioned contracts and neither
supersedes the other**. It deferred one deliverable to N3, verbatim:

> A **compatibility profile** — an explicit field mapping and a statement of what each direction
> loses — is an **N3** deliverable, written when there is a journal to map onto. N0 does not write
> it, and no adapter is authorized here.

This is that document, and nothing beyond it.

**NO ADAPTER IS AUTHORIZED, AND NONE EXISTS.** There is no code in this repository that converts a
v1.2 envelope into a network event or the reverse, and this document does not authorize one. It is a
statement of what such a conversion would cost, written so the cost is known **before** anyone
proposes paying it. ADR-N0007's non-regression rule still binds: the v1.2 envelope, `outbox_events`,
`audit_events` and `app.is_permitted_purpose` may not be altered by any network change whose stated
purpose is envelope convergence.

The honest summary of everything below: **the two directions are both lossy, and the losses are not
symmetric.** v1.2 → v1.4 loses the legal-authority quartet that FreightOS enforces in SQL. v1.4 →
v1.2 loses the entire network layer — subject references, schema governance, acceptance provenance
and lineage. Neither loss is recoverable from the other envelope's content.

## The two contracts

|                        | v1.2 domain envelope                                            | v1.4 network envelope                                              |
| ---------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `$id`                  | `https://rigfreightos.local/schemas/event-envelope.schema.json` | `https://schemas.freightos.example/network/event-envelope.v1.json` |
| Durable reference      | _(none — see below)_                                            | `https://schemas.rigreceipts.com/network/event-envelope.v1.json`   |
| Naming                 | `alllowercase`                                                  | `snake_case`                                                       |
| Scope key              | `tenantid` (required)                                           | `organization_id` (required)                                       |
| `additionalProperties` | `false`                                                         | `false`                                                            |
| Governs                | `outbox_events`, the domain/audit path                          | `network_events`                                                   |
| Type vocabulary        | `rig.freight.*` (SQL-enforced CHECK)                            | `com.rigreceipts.network.<semantic>.vN` (SQL-enforced CHECK)       |

The v1.2 envelope has **no durable production alias**, deliberately. It is internal and is never
referenced by a network event, so minting one would advertise it as part of the network protocol
surface. Its durable reference is its own `$id` — the honest statement that it has none.

Because both contracts set `additionalProperties: false` and their required sets are disjoint in
both directions, **a payload valid under either is rejected by the other**. That mutual rejection is
the accepted boundary, not a defect. It is asserted directly in
`packages/schemas/test/unit/network-schemas.test.ts`.

## Field mapping

`→` means "carries the same meaning". `≈` means "related but not equivalent — read the note".
`—` means "no counterpart exists".

### v1.2 → v1.4 network

| v1.2 field            | v1.4                                       | Note                                                                                                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `specversion`         | → `specversion`                            | Both `1.0`.                                                                                                                                                                                                                                                                                   |
| `id`                  | → `id`                                     | v1.2 does not constrain the form; v1.4 does not either. The journal stores `uuid`.                                                                                                                                                                                                            |
| `type`                | ≈ `type`                                   | **Vocabularies do not overlap.** `rig.freight.*` is refused by the journal's CHECK. Re-typing is a semantic act, not a rename.                                                                                                                                                                |
| `source`              | → `source`                                 |                                                                                                                                                                                                                                                                                               |
| `subject`             | ≈ `subject`                                | v1.2 `subject` is an optional free string. v1.4 `subject` is a **required non-empty array of logistics object references** (`network_id` + `object_type`). A v1.2 string cannot be promoted to a reference without inventing an `object_type`, whose vocabulary is ungoverned (ADR-N0012 D4). |
| `time`                | → `time`                                   | Domain occurrence time in both. Stored as `occurred_at`.                                                                                                                                                                                                                                      |
| `tenantid`            | ≈ `tenant_id`                              | **Not an envelope field in v1.4.** The journal derives `tenant_id` from the organization participant's own binding; it is never producer-supplied. See "Tenant scoping" below.                                                                                                                |
| `legalentityid`       | —                                          | **LOST.** No network counterpart.                                                                                                                                                                                                                                                             |
| `legalauthorityclass` | —                                          | **LOST.** ADR-0015/0019 vocabulary, absent from v1.4.                                                                                                                                                                                                                                         |
| `operatingcontext`    | —                                          | **LOST.** ADR-0015/0019 vocabulary, absent from v1.4.                                                                                                                                                                                                                                         |
| `actorid`             | ≈ `accepted_by`                            | **Not equivalent.** `actorid` is the acting principal _claimed by the producer_. `accepted_by` is the FreightOS **acceptance** principal, established server-side. Mapping one onto the other would convert a claim into trusted provenance.                                                  |
| `correlationid`       | → `correlation_id`                         |                                                                                                                                                                                                                                                                                               |
| `purpose`             | —                                          | **LOST, and this is the sharpest loss.** `purpose` is a closed vocabulary enforced in SQL by `app.is_permitted_purpose` (migration 0006) and carried as a column on both `outbox_events` and `audit_events`. v1.4 has no field for it.                                                        |
| `causationid`         | → `causation_id`                           |                                                                                                                                                                                                                                                                                               |
| `policyversion`       | —                                          | **LOST.** No network counterpart.                                                                                                                                                                                                                                                             |
| `data`                | → `data`                                   | v1.2 leaves `data` ungoverned. v1.4 governs it by `schema_ref`, so a converted event would need a governed payload contract that does not exist for domain event types.                                                                                                                       |
| —                     | `recorded_at`                              | Trusted acceptance time, established by the journal. Not derivable from a v1.2 envelope.                                                                                                                                                                                                      |
| —                     | `classification`                           | Required in v1.4; no v1.2 source.                                                                                                                                                                                                                                                             |
| —                     | `schema_ref`                               | Required in v1.4; no v1.2 source.                                                                                                                                                                                                                                                             |
| —                     | `event_class`                              | Optional. No v1.2 source.                                                                                                                                                                                                                                                                     |
| —                     | `evidence_refs`, `workflow_id`, `trace_id` | Optional. No v1.2 source.                                                                                                                                                                                                                                                                     |

**Net:** five required or SQL-enforced v1.2 fields have no v1.4 home
(`legalentityid`, `legalauthorityclass`, `operatingcontext`, `purpose`, `policyversion`), and three
required v1.4 fields cannot be synthesised from v1.2 content (`subject` as references,
`classification`, `schema_ref`). A conversion is therefore **not a mapping**; it is a re-authoring
that requires decisions no adapter can make on its own.

### v1.4 network → v1.2

| v1.4 field                                                                                               | v1.2                                                            | Note                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `specversion`, `id`, `source`, `time`, `correlation_id`, `causation_id`, `data`                          | → direct                                                        | Modulo the naming convention.                                                                                                                                                                                  |
| `type`                                                                                                   | ≈ `type`                                                        | Would have to be re-typed into `rig.freight.*`, which the v1.2 contract enforces.                                                                                                                              |
| `organization_id`                                                                                        | ≈ `tenantid`                                                    | **Not equivalent, and the substitution is unsafe.** ADR-N0011: an organization is a network participant; a tenant is a FreightOS billing/isolation boundary. External organizations have **no tenant at all**. |
| `subject`                                                                                                | ≈ `subject`                                                     | Array of structured references → one optional string. Lossy for any event with more than one subject, and the structure is discarded.                                                                          |
| `recorded_at`, `classification`, `schema_ref`, `event_class`, `evidence_refs`, `workflow_id`, `trace_id` | —                                                               | **LOST.** No v1.2 counterpart for any of them.                                                                                                                                                                 |
| `corrects_event_id`, `replacement_event_id`                                                              | —                                                               | **LOST.** Correction lineage has no v1.2 representation.                                                                                                                                                       |
| —                                                                                                        | `legalauthorityclass`, `operatingcontext`, `actorid`, `purpose` | **Required by v1.2 and unavailable.** A converter would have to invent all four, and `purpose` is checked in SQL — so an invented value is either rejected or is a false claim in the audit path.              |

**Net:** the v1.4 → v1.2 direction cannot be completed at all without fabricating four
legal-authority values. That is a conclusive argument against an automated adapter in this
direction, not a limitation to be worked around.

## Tenant scoping — the question ADR-N0007 left open

ADR-N0007 left open: _"Whether the network envelope's absent tenant scoping is acceptable, or
whether the network journal carries `tenant_id` alongside `organization_id`."_

**Settled in N3: the journal carries `tenant_id`, and it is not an envelope field.**

- `organization_id` is the **claimed** asserting participant, part of the governed envelope, and
  proven to be an organization by a composite foreign key into `network_participants`.
- `tenant_id` is **storage and RLS metadata**, derived at acceptance from that participant's own
  binding, and discarded-and-rederived in the database even if a future writer supplies it.
- **`tenant_id IS NULL` means the asserting organization is external. It never means public.** The
  RLS policies grant no read on NULL-tenant rows to any tenant-bound session, and
  `packages/database/test/integration/network-event-journal.test.ts` asserts exactly that.

Keeping `tenant_id` out of the envelope is what makes this safe: there is no field for a producer to
fill and the server to silently overwrite, so a discarded claim cannot be mistaken for an honoured
one.

## Event type vocabularies

ADR-N0012 carried this forward: _"The v1.4 prose uses `com.freightos.*` event type examples while
the v1.2 contract enforces `^rig\.freight\.…`. N3 owns the network event type and profile
decision."_

**Settled in N3.** The network vocabulary is `com.rigreceipts.network.<semantic>.vN`, rooted in a
DNS namespace the owner controls, enforced by a CHECK on `network_events.type` and by
`NETWORK_EVENT_TYPE_PATTERN` in the acceptance component. The v1.4 prose's `com.freightos.*`
examples are **illustrative prose, not a governed catalog**, and are not adopted.

The two vocabularies are disjoint by construction and are **independently versioned** under
ADR-N0007. A `rig.freight.*` type is refused by the journal, with a reason
(`type_namespace`) rather than a constraint name. Re-typing a domain event as a network event is an
explicit, evidenced act — never an accident of a shared prefix.

## What would have to be true before an adapter is proposed

Recorded so a future proposal starts from evidence rather than from convenience. All of these are
open; none is scheduled.

1. A governed payload contract for each domain event type that would cross the boundary — `data` is
   ungoverned in v1.2 and governed by `schema_ref` in v1.4.
2. A governed `object_type` vocabulary, so a v1.2 `subject` string can become a logistics object
   reference. Owned by the canonical domain-model workstream (ADR-N0012 D4).
3. A ruling on `purpose`, `legalauthorityclass`, `operatingcontext` and `legalentityid` in the
   network layer — either network counterparts, or an explicit decision that network events are
   outside their scope. Inventing values is not available: `purpose` is SQL-enforced.
4. A decision on whether the network journal supersedes the outbox path **in fact**. ADR-N0007 says
   deprecation of v1.2 is not scheduled and becomes a question only then.

Until all four are answered, the correct posture is the current one: two contracts, mutually
rejecting, each enforced where it governs.
