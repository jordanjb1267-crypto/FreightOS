# ADR-N0013 — N3 universal network event journal

- **ADR ID:** N0013
- **Title:** A new append-only journal, durable schema references under an owner-controlled domain,
  and an event that grants no authority
- **Status:** Accepted — owner rulings N3-D1…N3-D10, N3 workstream
- **Date:** 2026-08-10
- **Related:** ADR-N0007 (envelope versioning), ADR-N0008 (event artifact separation),
  ADR-N0009 (idempotency, correlation and causation), ADR-N0010 (network kernel bounds),
  ADR-N0011 (tenant and organization separation), ADR-N0012 (N2 schema registry),
  ADR-0020 (control-plane access), ADR-0024 (package paths and dependency direction),
  `docs/governance/EVENT_ENVELOPE_COMPATIBILITY_PROFILE.md`
- **Resolves** ADR-N0012 open decisions 1, 3 and 4, and ADR-N0007's open tenant-scoping question.

## Context

ADR-N0010 assigned kernel elements 4 and 5 — the universal event envelope with classification, and
network idempotency with correlation/causation — to N3. ADR-N0012 closed N2 and carried four
questions forward, three of them explicitly to N3:

> 1. What exact value does a durable v1.4 network-event `schema_ref` serialize to?
> 2. Whether a `network_schema_versions` projection is needed — N3, on evidence only.
> 3. The v1.4 prose uses `com.freightos.*` event type examples while the v1.2 contract enforces
>    `^rig\.freight\.…`. N3 owns the network event type and profile decision.

ADR-N0007 additionally left open whether the journal carries `tenant_id` alongside
`organization_id`, and made the v1.2/v1.4 compatibility profile an N3 deliverable.

One question could not be answered from the repository at all. Every network identifier in the
repository was either a documentation namespace (`schemas.freightos.example`, reserved by RFC 2606),
a local development host (`rigfreightos.local`), or a third-party domain. `network_events` is
permanently immutable, so a `schema_ref` and a `type` written into it are **forever references**.
Implementation stopped and reported rather than freezing a documentation namespace into immutable
history, or inferring a production domain from the project name. The owner supplied it.

## Decision

### N3-D1 — The owner-controlled namespace

- **Domain:** `rigreceipts.com`
- **Reverse-DNS root:** `com.rigreceipts`
- **Durable schema references:** `https://schemas.rigreceipts.com/network/<contract>.vN.json`
- **Network event types:** `com.rigreceipts.network.<semantic>.vN`, enforced by a CHECK on
  `network_events.type` and by `NETWORK_EVENT_TYPE_PATTERN`.

**These are permanent protocol identities.** A future product or company rename is not authorization
to rewrite them: durable events already reference them, and a reference that changes meaning is
precisely what immutability forbids. The `.example` and `.local` namespaces are rejected for durable
use for the same reason.

### N3-D2 — Durable schema references are a naming layer, derived and never invented

The eight v1.4 contracts are **protected handoff artifacts** and keep their `$id`s under
`schemas.freightos.example`. They are not edited. Instead each carries a `durableRef` **derived**
from its own `$id` — the last path segment, which already contains the contract name and its major
version — appended to the production namespace. The derivation is asserted, not hand-maintained
(`packages/schemas/test/unit/n3-durable-refs.test.ts`).

Resolution is **one-directional**: a durable reference resolves to the protected bytes, and a
canonical `.example` `$id` does **not** resolve where a durable reference is required. Otherwise a
producer could write the documentation namespace into the permanent journal by using the other
spelling.

The v1.2 envelope gets **no production alias**. It is internal, never referenced by a network event,
and minting one would advertise it as part of the network protocol surface.

This answers ADR-N0012 open decision 1.

### N3-D3 — `network_schema_versions` is a projection, on evidence

ADR-N0012 D1 permitted a database projection **only on evidence**. The evidence is referential
integrity: `network_events.schema_ref` and `network_events.envelope_schema_ref` are foreign keys, so
an event cannot name a contract the platform does not govern — a guarantee the application layer
alone cannot make against a permanently immutable table.

The projection is bound by ADR-N0012 D1's own conditions and each is enforced:

- **Derived from the canonical package registry**, seeded by the migration and asserted field-for-
  field against `listRegisteredSchemas()` in the integration suite.
- **Not a second source of truth.** It carries identity and integrity metadata only — durable
  reference, registry id, version, artifact class, content hash, status. **It does not store schema
  definitions**, so it cannot disagree with the package about what a contract _says_.
- **Not runtime-mutable.** No runtime identity holds INSERT, UPDATE or DELETE; UPDATE and DELETE are
  rejected by trigger as well.

This answers ADR-N0012 open decision 3.

### N3-D4 — Classification is syntactic in N3, and nothing may branch on it

`classification` is a non-blank string and nothing more. **No governed vocabulary exists**, and N3
does not invent one — the N2 precedent (`object_type`, ADR-N0012 D4) applies directly.

Consequently **no code in this database may branch on it**: not RLS, not authorization, not
disclosure, not retention, not subscription, not delivery. This is enforced structurally, by a
catalog query asserting no policy predicate and no function body in `app`/`admin`/`authn`
references `classification`. A test that merely avoided writing such a branch would prove nothing;
the gate proves none exists anywhere.

### N3-D5 — Exactly eight event classes

`app.network_event_class` is `observed`, `asserted`, `verified`, `derived`, `predicted`,
`command_result`, `correction`, `dispute` — the exact enumeration already present in the protected
v1.4 envelope contract. The enum ships complete because `ALTER TYPE … ADD VALUE` cannot run inside a
transaction, so a partial enum would make its own extension a non-transactional migration.

`event_class` is nullable: the v1.4 contract makes it optional, and a NOT NULL column would be N3
widening a governed contract.

### N3-D6 — Event identity is UUIDv7, in two layers

- **Storage/contract layer:** `uuid`, globally unique, and nothing more. A future external producer
  may legitimately send a v4.
- **Generation layer:** FreightOS mints UUIDv7 for index locality on the highest-write append-only
  table in the system.

**Ordering is an index optimisation and nothing else.** No correctness anywhere derives domain
ordering from an identifier — `occurred_at` and `recorded_at` are the time facts, separately.

### N3-D7 — A new journal, not `outbox_events` and not `audit_events`

ADR-N0008 separates four artifacts. `outbox_events` was disqualified on repository evidence, not
preference: it carries a **mutable delivery state machine** (`status`, `attempts`, `claimed_at`,
`claim_expires_at`, `published_at`, `last_error`) and a `rig.freight.*` type CHECK. A permanently
immutable journal cannot share a table with rows that are updated on every delivery attempt.
`audit_events` is the record of last resort and is not weakened for network convenience.

Neither table is modified by N3. That is asserted by pinning both tables' column, trigger and policy
**names** — not counts, which any add-plus-remove pair would satisfy.

### N3-D8 — Trusted acceptance metadata: `recorded_at` and `accepted_by`

`recorded_at`, `accepted_by` and `tenant_id` are **trusted**: established by FreightOS, never
producer-supplied. They are deliberately absent from `EventDraft` — there is no field for a caller
to fill and the server to overwrite, because a discarded claim invites the belief that it was
honoured. The database re-derives all three in a BEFORE INSERT trigger regardless, as defence in
depth against a future writer that forgets.

`occurred_at` (the envelope's `time`) and `recorded_at` are never conflated. Future `time` is
tolerated only within a configured skew — **application configuration, not protocol** (see N3-D10).

### N3-D9 — A dedicated writer role, with column-level privileges

PostgreSQL cannot evaluate JSON Schema 2020-12, so payload conformance can only be established in
the application. The journal is permanently immutable, so a schema-invalid row is not a bug that can
be fixed later — it is uncorrectable corruption. Therefore `freightos_app` holds **no INSERT** on
`network_events` by any route, and exactly one new role exists: **`freightos_event_writer`**.

`freightos_control_plane` was **not** reused. It is powerful enough, which is the argument against
it: ADR-0020 scopes it to control-plane provisioning, and widening it to routine event ingestion
would make the most privileged identity in the system the most frequently used one.

Duplicate resolution needs to compare a repeated `event_id` against what was already accepted. A
global journal SELECT for the writer was **rejected by the owner** as too broad. Instead the journal
carries a mandatory `event_fingerprint`, and the writer holds **column-level** `SELECT
(event_id, event_fingerprint)` — enough to distinguish a retransmission from a conflicting rewrite,
and **no ability to read any payload, subject, classification or tenant column of any event**.

The acceptance trigger is **invoker rights**, deliberately. A SECURITY DEFINER would read past the
participant policy to resolve the tenant, which is adding privileged code to work around row-level
security. **N3 adds zero SECURITY DEFINER functions.**

### N3-D10 — Corrections are companion fact events

A correction is a **lineage statement**, never a mutation and never a carrier of replacement
content. It relates an already-accepted fact to an already-accepted **companion** fact that carries
the replacement truth. The original row is untouched and remains replayable.

The governed contract
(`https://schemas.rigreceipts.com/network/event-correction.v1.json`) has exactly four fields:
`corrected_event_id`, `replacement_event_id`, `reason`, `effective_at`, with
`additionalProperties: false`.

- **No `correcting_authority`.** Explicitly ruled out. The envelope's `organization_id` records on
  whose behalf the correction is asserted and the journal's trusted `accepted_by` records the
  FreightOS acceptance principal; together they preserve both provenance layers without inventing
  delegation semantics that do not exist.
- **No `superseding_data`.** The replacement truth is a separate accepted fact with its own
  identity, provenance and schema — not a blob riding inside a correction.

Lineage is written to `corrects_event_id` / `replacement_event_id` **only** from a payload validated
against this contract. Both are foreign keys back into the journal, so a correction cannot name an
event that was never accepted.

### N3-D11 — The correction organization invariant

**A correction may correct and replace only events belonging to the SAME canonical
`organization_id` as the correction event itself.**

One organization challenging another organization's fact is a **`dispute`** — already a governed
event class — not a correction. N3 implements no cross-organization correction and no delegation
semantics of any kind.

**Enforced as referential integrity, not as a read.** `network_events` carries an additional
`UNIQUE (event_id, organization_id)` and both lineage keys are composite:

```
(corrects_event_id,    organization_id) -> network_events (event_id, organization_id)
(replacement_event_id, organization_id) -> network_events (event_id, organization_id)
```

`event_id` remains the **primary key and the sole event identity**; the composite UNIQUE is
satisfied for free and exists only because PostgreSQL requires a foreign key's referenced columns to
be unique. Identity is not redefined as the pair.

Three properties make this the right mechanism rather than a convenient one:

- **It needs no privilege.** Referential checks run as the referenced table's owner and are subject
  to neither row-level security nor the inserting role's column grants. The alternative — have the
  acceptance component read each target's `organization_id` and compare — would require giving
  `freightos_event_writer` a global read of journal organization metadata, which is the exact
  privilege N3-D9's column-level design exists to avoid. The writer cannot read `organization_id`
  from any row, its own included, and the invariant still holds.
- **`MATCH SIMPLE` is load-bearing.** `organization_id` is `NOT NULL`, so the key is checked exactly
  when a lineage column is present — that is, exactly on corrections. `MATCH FULL` would reject
  every ordinary event, because `(NULL, organization)` is neither all-null nor all-non-null.
- **It closes an existence oracle.** The key is the _pair_, so `(foreign_event, my_org)` is absent
  whether or not `foreign_event` exists under another organization. A correction can therefore never
  be used to confirm that another organization's event id is real: both cases fail with the same
  constraint, the same SQLSTATE, and a message differing only in the uuid the caller supplied.

The invariant is organizational, not tenant-based: an external organization with `tenant_id IS NULL`
corrects its own lineage exactly like anyone else, and still cannot reach a tenant-bound
organization's facts.

**Clock skew is application configuration.** `NETWORK_EVENT_MAX_FUTURE_SKEW_SECONDS` defaults to
300 and is validated at startup. It is deliberately absent from the JSON Schema, from every CHECK
and from the migration: a strict `time <= recorded_at` would reject legitimate producer clock skew,
and a number frozen into DDL would be speculative governance that a future external-ingress
workstream could not vary per source, channel or device without a migration.

## The central invariant

**An event can assert a fact. An event cannot grant permission merely by existing.**

An event names an organization, a source, subjects, a classification and a schema. Every one of
those is a plausible-looking route from "the journal says so" to "therefore you may". The invariant
is graded against a full privilege snapshot — permissions, session context, role graph, table
privileges and per-table row digests — before and after hostile events, rather than against a
re-run SELECT that could degrade into a constant.

The privilege oracle is **role-roster-independent by construction**. The N1 CI defect was an oracle
that enumerated `pg_roles` outright: roles are cluster-global, other test files mint logins as they
run, and a role conferring nothing on anybody registered as authority drift. This oracle keeps the
security question and drops the roster.

## Event/command/workflow impact

Network events are recorded. **Nothing consumes them yet, by design.** N3 implements no
subscriptions, no delivery, no webhooks, no replay service, no reconciliation, no commands, no
workflows, no external ingress, no outbox derivation and no autonomous execution. Those are later
bands.

## Interoperability impact

The v1.2 ↔ v1.4 compatibility profile is delivered as
`docs/governance/EVENT_ENVELOPE_COMPATIBILITY_PROFILE.md`, satisfying ADR-N0007's N3 obligation.
**No adapter is authorized and none exists.** Both directions are lossy and the losses are not
symmetric; the profile states each one and records what would have to be true before an adapter is
proposed. ADR-N0007's non-regression rule stands unchanged.

This answers ADR-N0012 open decision 4: the network vocabulary is `com.rigreceipts.network.*`, and
the v1.4 prose's `com.freightos.*` examples are illustrative prose, not a governed catalog.

## Security impact

- **One** new PostgreSQL role, `freightos_event_writer`: LOGIN, NOSUPERUSER, NOCREATEDB,
  NOCREATEROLE, NOBYPASSRLS, NOREPLICATION. It holds **no outbound role membership at all**, and the
  migration refuses to complete if any of the named escalation edges exists in either direction.
- **One implicit membership edge exists and is pinned rather than denied.** PostgreSQL gives a
  CREATEROLE non-superuser `ADMIN TRUE, INHERIT FALSE, SET FALSE` over every role it creates, so
  `freightos_migrator` administers the writer — which is what lets the revert drop it. INHERIT or
  SET on that edge would hand the migrator the writer's INSERT on an immutable journal, so the
  migration asserts that **no** membership of the writer, from any role, confers either.
- **Zero** new SECURITY DEFINER functions.
- Both new tables are `ENABLE` **and** `FORCE ROW LEVEL SECURITY`; both are append-only by trigger
  and by ACL, neither being sufficient alone.
- `tenant_id IS NULL` means the asserting organization is **external**. It never means public, and
  the RLS read matrix asserts that no tenant-bound session sees a NULL-tenant row.
- `freightos_app` holds no INSERT on the journal by any route — direct, default-privilege or role
  membership.
- N1's invariant is untouched: network participant presence still confers zero security authority.

## Migration and rollback

Migration `0029_network_event_journal`. The revert removes every N3 artifact by name — **no
CASCADE** — reverses the additive N1 touches first, then revokes every table, column, schema and
database privilege the writer holds. Revocation is **catalog-driven and targeted**, never
`ON ALL TABLES IN SCHEMA`: touching a table with no explicit ACL materialises one, so a blanket
revoke would leave unrelated tables' catalog entries different from where they started.

**A role is cluster-global; a migration is per-database**, and the revert models that rather than
fighting it:

- If the writer owns relations, the revert **fails loudly rather than using `DROP OWNED`**.
  Destroying an unrelated role's property to make a revert tidy is worse than a failed revert.
- Zero remaining privilege references **in this database** is a hard assertion — that is the part
  0029 controls, and a leftover there is a defect in the revert.
- **The role is not dropped**, and that is this repository's standing doctrine rather than an N3
  choice. 0020's down migration records it verbatim — _"0020 was the only migration attempting a
  DROP ROLE, and it was wrong to"_ — and 0026 re-derived it independently: _"what reverting must
  actually guarantee is that the role has no REACH, not that its catalog row is gone."_
  `freightos_hierarchy_owner`, `freightos_identity_guard`, `freightos_admin_owner`,
  `freightos_audit_writer` and `freightos_binding_owner` are all created idempotently on the way up
  and left in place on the way down, because `DROP ROLE` consults every database in the cluster and
  a per-database migration cannot reach the others. The migrator's implicit ADMIN membership is
  retained for the same reason 0020 gives: revoking it would remove the row PostgreSQL creates for
  a role's creator and leave a later re-apply unable to grant the role at all.
- **The reach guarantee is measured, not inferred.** §5 asks `pg_shdepend` — the same catalog
  `DROP ROLE` consults — plus policies and default ACLs, because "we revoked the grants we
  remembered" is how a revert ends up almost right.
- **One N3-specific caveat, stated because it is real.** The five roles above are all NOLOGIN, so a
  surviving catalog row is inert by construction. `freightos_event_writer` is a LOGIN service
  credential, so inertness has to be established: after the revert it holds no schema USAGE, no
  table or column privilege and no policy in this database, so a session that connects can do
  nothing. `ALTER ROLE … NOLOGIN` is deliberately **not** used — it is equally cluster-global and
  would disable the writer for every other database still at N3, which is the same error as
  dropping it.

The down migration asserts its own totality, including that the five N1 tables survive RLS-forced
and that the four shared `app` helpers N3 borrowed are still present.

## Alternatives considered

**Reuse `outbox_events` as the journal.** Rejected on repository evidence — see N3-D7.

**A SECURITY DEFINER acceptance function.** Rejected. `freightos_audit_writer`'s definer pattern does
not transfer: a PL/pgSQL definer cannot run JSON Schema validation, so the definer would buy
privilege without buying the guarantee that motivates it.

**Grant `freightos_app` direct INSERT to avoid a new role.** Rejected. It would satisfy a
zero-new-roles expectation by dissolving the boundary the expectation exists to protect.

**A global journal SELECT for the writer.** Rejected by the owner as too broad; replaced by
`event_fingerprint` plus column-level privileges (N3-D9).

**Payload-hash de-duplication.** Rejected under ADR-N0009: two identical gate scans are two facts.
Identity is `event_id`; the fingerprint answers only whether a _repeated_ id carries the same event.

**Editing the protected v1.4 artifacts to replace `schemas.freightos.example`.** Rejected. The
protected tree is not edited to manufacture a production identity; N3-D2's naming layer achieves the
same result without touching it.

## Open decisions

Carried forward deliberately:

1. **Canonical `object_type` semantics** — still the canonical logistics domain-model workstream's,
   not N3's. `subject` entries are validated as object references; their `object_type` values are
   not governed.
2. **A governed `classification` vocabulary** — deferred until there is a disclosure, retention or
   subscription decision that actually needs one. Until then, N3-D4's no-branching rule holds.
3. **A governed network event type catalog** — N3 fixes the _namespace_, not the list of types.
4. **Whether the network journal supersedes the outbox path in fact** — ADR-N0007's question, still
   unscheduled. The four preconditions are listed in the compatibility profile.
5. **Subscriptions, delivery, replay and reconciliation** — later bands, on their own evidence.
