# ADR-N0014 — N4 transactional transport intent

- **ADR ID:** N0014
- **Title:** A durable promise that transport is owed, created atomically with the accepted fact —
  and nothing else
- **Status:** Accepted — owner rulings N4-D1…N4-D12, N4 workstream
- **Date:** 2026-08-11
- **Related:** ADR-N0007 (envelope versioning), ADR-N0008 (event artifact separation),
  ADR-N0009 (idempotency and causation), ADR-N0010 (kernel bounds), ADR-N0013 (event journal),
  v1.4.0 `05_UNIVERSAL_EVENT_MODEL.md` §5–6, `08_DATA_SOVEREIGNTY…`, `11_EVENT_BUS…`,
  `23_IMPLEMENTATION_ROADMAP_PR_SEQUENCE.md` PR 4, `25_DECISIONS_REQUIRED.md` decision 7
- **Resolves the reuse question ADR-N0008 deferred to N4 with evidence.**

## Context

N3 records canonical network truth and nothing consumes it. The governed roadmap names the next
step in its own words — `23_…:47-49`, **"PR 4 — Transactional outbox: Guarantee state change and
event publication intent are committed together"** — and ADR-N0009:65 assigns the band:
**"N4 (outbox/dedupe), N6 (delivery and replay)."**

Two questions had to be answered from evidence rather than preference. ADR-N0008 deferred the first
verbatim: _"**Reuse `outbox_events` as the network journal.** Not rejected outright — deferred to N4
with evidence."_ The second is `25_DECISIONS_REQUIRED.md` decision 7, managed broker versus
relational outbox-first, which that document reserves to the owner and forbids implementation from
inventing.

The failure this band exists to prevent is narrow and specific: an accepted event commits, the
process dies, and nothing anywhere records that the fact was ever owed to the network. No amount of
later delivery machinery recovers a debt that was never written down.

## Decision

### N4-D1 — A new table, not `outbox_events` and not a generic shared table

`network_transport_intents` is new. Four database-level facts reject a network event from the legacy
outbox outright, each verified against PostgreSQL 16 by attempted insert rather than read off the
DDL:

1. `outbox_events_event_type_check` is `^rig\.freight\.[a-z0-9_.-]+\.v[0-9]+$` and `NOT NULL`. A
   `com.rigreceipts.network.*` type is refused. Widening it regresses the v1.2 vocabulary, which
   ADR-N0007's non-regression rule forbids; fabricating a `rig.freight.*` value and parking the real
   type elsewhere is semantic compromise by definition.
2. `tenant_id` is `NOT NULL`, while the journal's is nullable and NULL means the asserting
   organization is **external** — which ADR-N0011 calls the normal case, not an edge case.
3. The same row is refused a **second** time by RLS: `outbox_events_isolation`'s
   `WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id())` evaluates to NULL
   for a NULL tenant and fails closed. Fixing it needs `DROP NOT NULL` on the v1.2 table's sole RLS
   discriminator **and** a policy change — a tenant-isolation change, the category where the
   stricter requirement controls.
4. The v1.2 legal quartet — `legal_authority_class`, `operating_context`, `actor_id`, `purpose`, the
   last SQL-enforced by `app.is_permitted_purpose` — is required and has no v1.4 source. The
   compatibility profile names the consequence: _"an invented value is either rejected or is a false
   claim in the audit path."_

A fifth fact is a security one rather than a schema one: `freightos_app` holds **INSERT and UPDATE**
on `outbox_events`. N3 removed exactly that privilege from the journal on purpose, and reuse would
hand the application runtime a write seat at the network transport table.

**What this ADR does not claim.** An adversarial review, run against a live cluster, disproved
several arguments that were offered for this conclusion — including N3-D7's sentence that a
permanently immutable journal "cannot share a table with rows that are updated on every delivery
attempt", which is false as a technical claim: a `WHEN`-clause trigger refuses updates per row. The
four blockers above are the ones that survive scrutiny, and they are sufficient. The weaker
arguments are recorded here as withdrawn rather than left standing.

### N4-D2 — Atomic, in the same transaction, for every accepted event

Every newly accepted network event creates exactly one intent in the same PostgreSQL transaction.
No filtered publication rule, because no publication-rule vocabulary exists and inventing one would
be policy; no asynchronous derivation, because that reintroduces the window the pattern exists to
close.

This required **no change to N3**. `acceptNetworkEvent(client, …)` already takes a caller-supplied
connection and states that _"it is the caller's job to open the surrounding transaction"_, and
`withLegalContext` already wraps one `BEGIN`/`COMMIT`.

### N4-D3 / N4-D5 — One intent per event, keyed by the event id itself

`network_event_id` is **both** the primary key and the foreign key into `network_events(event_id)`.
With one intent per event a second opaque identifier would have no lifecycle: nothing can reference
it, it cannot be reused, and it would create a second candidate identity for one fact. Making the
event id the key also makes "one per event" a property of the schema and an orphan intent
unrepresentable.

### N4-D6 — No state machine

Row existence **is** the state: _transport is owed for this accepted event_. There is no `status`,
no `attempts`, no claim or lease columns, no `next_attempt_at`, no `last_error`, no `published_at`.
A status enum whose values are all unreachable is a guess frozen into a migration, and this
repository has already paid for widening an enum after the fact — `app.kill_switch_scope` needed
migrations `0014`/`0015` and a `-- freightos:no-transaction` declaration because
`ALTER TYPE … ADD VALUE` cannot run in a transaction that references the new value.

Because there is no publisher state, the table is **immutable after creation**, sealed with the same
shared rejector `audit_events` has used since 0003. N6 introduces publisher state when a publisher,
claim semantics, a retry policy and an acknowledgement meaning all exist to give those values
meaning.

### N4-D7 — Relational outbox-first; no broker selected

A broker cannot improve the correctness of the intent record: the lost-publication window is between
the database commit and the transport hand-off, and only a database-transactional record closes it.
Current production event volume is zero, and `22_…:95` makes selection follow workload evidence.
The decision remains the owner's under `25_DECISIONS_REQUIRED.md` decision 7; this records the
ruling, not a technical inevitability.

**No broker dependency was added.** The repository's entire runtime dependency surface remains
`ajv`, `ajv-formats`, `pg`, `yaml`, `zod`.

### N4-D8 — No partition key

N4 has no publisher and no broker, so a partition key would be a stored value nothing reads. It is
additive later at no cost, and no partition key is assigned anywhere in the governing documents:
`templates/EVENT_CATALOG_ENTRY_TEMPLATE.md` has the slot and no catalog is populated.

### N4-D9 — A database trigger creates the intent, with invoker rights

`app.network_event_transport_intent()` is an `AFTER INSERT … FOR EACH ROW` trigger on
`network_events`. Putting the coupling in the database rather than in the acceptance component is
what makes it a property of the schema instead of application discipline: **no code path —
application, maintenance, test or interactive — can commit an event without recording the debt.**

Privilege impact is identical to having the writer insert the row itself: a trigger function runs
with the invoker's privileges unless it is `SECURITY DEFINER`, so both designs need exactly one new
grant and neither needs a definer. With cost equal, the trigger wins on enforcement strength.

**N4 adds zero `SECURITY DEFINER` functions**, preserving N3's posture. The function performs one
local `INSERT` and nothing else: no network I/O, no broker call, no queue publish, no filesystem
effect, no authorization derivation, and no branch on `classification`, `organization_id`, `source`,
`subject`, `data` or `event_class`. The relation is schema-qualified because the table is
RLS-enabled and therefore protected under migration 0027's guard.

**AFTER rather than BEFORE**, because PostgreSQL does not fire an AFTER row trigger for a row
suppressed by `ON CONFLICT DO NOTHING` — which is exactly how `acceptNetworkEvent` resolves a
retransmission — so re-acceptance creates no second intent.

#### The conflict clause names no target, and that is a privilege boundary

`ON CONFLICT (network_event_id) DO NOTHING` — naming the arbiter index — **requires SELECT on the
table**, because inferring the arbiter lets the statement read the conflicting row. The bare
`ON CONFLICT DO NOTHING` requires only INSERT. Verified on this exact table: with INSERT alone the
targeted form fails `permission denied for table network_transport_intents` while the untargeted
form reaches the foreign key.

Granting the writer SELECT to buy the targeted spelling would widen the acceptance identity's read
reach to satisfy a syntax preference, and the writer's inability to read this table is a designed
property — it creates a debt it cannot enumerate. The untargeted form is exact here because the
table carries exactly **one** unique arbiter, its primary key; that equivalence is asserted by the
migration and by test rather than assumed, because it would quietly stop holding if a second unique
constraint were ever added.

### N4-D10 — No historical backfill

Installing N4 creates no intent for any event already in the journal. This falls out of the trigger
design rather than being implemented: a trigger fires only on new inserts, so there is no cutoff
timestamp, no exclusion predicate and no flag to misconfigure. A backfill remains possible later as
an explicit, separately authorized operation — which is the right shape, because moving historical
facts into transport is a disclosure decision, not a migration side effect.

Two activation boundaries are deliberately kept apart: **intent creation** begins when 0030 is
applied, prospectively; **publication** begins in the band that introduces a publisher, behind its
own configuration. Installing N4 therefore cannot publish anything, historical or new.

### N4-D11 — No publisher role

N4 creates **no PostgreSQL role**. `freightos_event_writer` must not double as a publisher: the
acceptance identity deliberately cannot read payloads, and a publisher must read full payloads
across tenants. A future publisher's cross-tenant journal read is a significant service capability
that deserves its own security review, and it must not be hidden inside the control-plane role —
ADR-0020 scopes that to provisioning, and routing event traffic through the most privileged identity
is what N3 refused when it declined to reuse it.

A consequence worth stating: because N4 adds no role, it adds **nothing cluster-global**, and so has
none of the multi-database rollback complexity N3 discovered late. Reverting is `DROP TRIGGER`,
`DROP FUNCTION`, `DROP TABLE` — all database-local, no `CASCADE`, no `DROP OWNED`.

### N4-D12 — N4 publishes nothing, internally or externally

N4 creates transport debt only. No broker publication, no external publication, no egress path, and
no publisher to walk one. This is forced by evidence, not caution: `08_…` requires every data
element to carry **permitted recipients** and consent to be a **versioned grant**, and neither
exists; `11_…:53` makes routing depend on field-level projection and `classification`, and
`classification` is a free-text column with **no governed vocabulary** (ADR-N0013 open decision 2).
Publishing today would disclose data with no policy capable of saying who may receive it.

The security checklist states the surrounding rule: the repository has no external ingress surface,
and _"the first one is an architectural event, not a detail."_ The same applies to the first egress.

### The two invariants N4 freezes

**TRANSPORT INTENT CONFERS ZERO SECURITY AUTHORITY.** The existence of a row must never grant a
permission, widen tenant visibility, authorize a command, alter participant authority or change
journal truth. Asserted against a full privilege snapshot with a synthetic anti-vacuity control, and
structurally: no policy and no function anywhere reads the intent table except the one that writes
it.

**TRANSPORT IS OWED ≠ AUTHORIZED FOR EXTERNAL DISCLOSURE.** An intent does not mean public,
network-visible, counterparty-visible, consented or approved for egress. N5 owns disclosure
governance, and no N4 policy branches on `classification` to infer anything.

## Alternatives considered

**Reuse `outbox_events`.** Rejected on the four surviving blockers in N4-D1, and on the
`freightos_app` privilege. Recorded honestly: parts of the case originally made for this rejection
did not survive adversarial review, and only the blockers above are relied on.

**Refactor `outbox_events` into a generic shared transport table.** Rejected: it requires the
compatibility profile's precondition 3 — a ruling on `purpose`, `legalauthorityclass`,
`operatingcontext` and `legalentityid` in the network layer — which is unanswered, and it rewrites a
live v1.2 contract to serve a network requirement.

**A `status` column with `pending | claimed | published | failed` from birth.** Rejected under
N4-D6: every value except `pending` is unreachable without a publisher, and the enum's future shape
depends on decisions (retry policy, acknowledgement semantics) that do not exist. The cost of adding
it later is a column; the cost of getting it wrong now is a migration that lies about what the system
can do.

**The acceptance component inserting the intent itself.** Rejected under N4-D9: identical privilege
cost, strictly weaker enforcement — a direct insert by any trusted path would create no debt.

**Selecting a broker now.** Rejected under N4-D7 and reserved to the owner by decision 7.

## The AsyncAPI starter contract is not a broker selection

`docs/production-handoff/v1.4.0-network-architecture/contracts/asyncapi/freightos-network-events.asyncapi.yaml`
declares `protocol: kafka-secure` against host `events.sandbox.freightos.example`. Recorded here so
it cannot later be mistaken for owner approval of Kafka:

- it self-describes as a **"Starter contract"**;
- it is listed in the package `MANIFEST.sha256` and is **protected** — it must not be edited;
- it is referenced by **no runtime code and no CI**;
- its host is the documentation namespace ADR-N0013 N3-D1 rejects for durable use;
- it contradicts `11_…:5`, `22_…:95` and open decision 7, and under the handoff's own tie-break the
  stricter rule — technology neutrality — governs.

It is a reference artifact. Nothing in N4 is implemented from it.

## Data ownership/privacy impact

The intent stores **no payload, no subject, no envelope, no serialized event and no `tenant_id`**.
The canonical journal is immutable, so a reference can never dangle or drift and duplication buys no
consistency; projection and redaction are decided at routing time from the subscriber's policy, so a
snapshot frozen at acceptance would have to be re-projected anyway. Duplicating the isolation
discriminator would duplicate the isolation decision without a reader to serve. No role holds SELECT
on the table — the read boundary is N6's to open together with the identity governed to use it.

**Governance gap, recorded and deferred.** `docs/governance/DATA_CLASSIFICATION.md` has no entry for
`network_participants`, `network_schema_versions`, `network_events`, and now
`network_transport_intents`. This does not block N4 — it stores no payload copy, performs no egress
and grants no tenant read surface — but it must be resolved as part of the N5 governance and
disclosure work **before external emission is authorized**. The register is a protected artifact and
extending it is not an N4 architecture decision.

## Event/command/workflow impact

Transport debt is recorded. **Nothing discharges it yet, by design.** N4 implements no publisher, no
worker, no broker, no subscriptions, no destinations, no webhooks, no delivery attempts, no receipts,
no replay, no reconciliation and no egress. Delivery semantics remain **at-least-once** (ADR-N0009,
`05_…` §6) and `event_id` remains the dedupe key; N4 changes neither and implements neither.

## Migration and rollback

One additive pair, `0030_network_transport_intent.{up,down}.sql`. One table, one function, one
trigger on `network_events`, three append-only guards, one INSERT policy, one additive grant. Zero
new roles, zero `SECURITY DEFINER`, zero changes to `network_events` columns, constraints, policies
or existing triggers, zero changes to `outbox_events` and `audit_events`, zero new dependencies.

The revert drops the trigger, then the function, then the table, by name and without `CASCADE` or
`DROP OWNED`, and asserts that N3 is intact and that no role was dropped. Round trip, one-step-down
and fresh-install parity are proven on a private cluster.

## Open decisions

Carried forward deliberately, none of them N4's to answer:

1. **Broker selection** — v1.4.0 decision 7, deferred by N4-D7 until workload and N6 requirements
   justify it.
2. **Retry and backoff constants**, including the definition of the _"longest retry window"_ that
   ADR-N0009:26 already depends on and no document defines.
3. **Retention by event class** — v1.4.0 decision 13, OQ-12. No intent is ever deleted by N4.
4. **A governed `classification` vocabulary** — ADR-N0013 open decision 2. Its own deferral trigger
   fires when subscriptions start.
5. **Dead-letter policy** — entry criteria, retention, redrive authorization and ownership. N4
   creates no terminal state and deletes nothing.
6. **Partition key assignment**, if and when N6 needs one.
7. **The publisher identity and its cross-tenant journal read** — N4-D11 leaves it uncreated and
   unreviewed on purpose.
8. **The classification-register gap** above, assigned to N5.
