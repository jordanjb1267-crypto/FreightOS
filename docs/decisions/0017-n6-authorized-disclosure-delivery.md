# ADR-N0017 — N6 authorized disclosure delivery

- **ADR ID:** N0017
- **Title:** Turning an authorized disclosure into a recorded delivery, without leaving the database
- **Status:** Proposed — N6 implementation, awaiting external rereview
- **Date:** 2026-08-14
- **Migration:** `0034_network_authorized_disclosure_delivery`
- **Related:** ADR-N0013 (N3 journal), ADR-N0014 (N4 transport intent), ADR-N0015 (N5-A disclosure
  authorization core), ADR-N0016 (N5-B sensitivity ceiling), `docs/governance/DATA_CLASSIFICATION.md`

## Context

N4 records that transport is OWED. N5-A records that a named recipient is authorized for a named
purpose over a named field set. N5-B records whether that kind of content may cross an organization
boundary at all. Nothing yet records that a disclosure was actually made.

The four states are distinct and the distinction is the design:

> `TRANSPORT OWED` ≠ `DISCLOSURE AUTHORIZED` ≠ `DELIVERY ATTEMPTED` ≠ `DELIVERY SUCCEEDED`

Collapsing any pair loses something that cannot be reconstructed. A debt that is treated as an
authorization discloses without a grant. An authorization treated as an attempt claims a delivery
that never happened. An attempt treated as a success reports arrival that was never observed.

## The N6/N7 boundary

**N6 has ZERO external egress.** It computes what may be disclosed, freezes the authorized bytes,
records the obligation and commits the artifact to an internal FreightOS inbox. Nothing leaves the
database. There is no publisher, no webhook sender, no broker, no queue adapter, no delivery worker
process, no retry job, no subscriber API and no external wire envelope.

N7 is where an external transport would live, and it is BLOCKED. The seam is deliberate: everything
that decides WHAT may be disclosed is settled and testable before anything can transmit it, so the
transport layer inherits a decision rather than participating in one. `NETWORK_EGRESS=PASS` is a
standing local validator over the N6 sources, and the N6 router carries a source gate asserting the
absence of `fetch`, `node:http`, `node:https`, `node:net`, `node:tls`, `undici`, `axios` and
`WebSocket`.

## Decisions

### N4 is consumed explicitly, never inferred

`network_disclosure_routing_resolutions.network_event_id` and
`network_disclosure_deliveries.network_event_id` are foreign keys to
**`network_transport_intents`**, not to `network_events`. A delivery cannot exist for an event that
owes no transport, and the constraint says so rather than a comment.

The alternative — deriving transport debt from the existence of a journal row — was rejected by
owner ruling. The two are not the same fact: N4 is minted by an unconditional trigger today, so the
sets coincide, and a rule that holds only because two things happen to coincide is exactly the kind
of invariant that breaks silently when one of them changes. Mutation D-V repoints the delivery FK at
the journal and the migration refuses: _deliveries must reference network_transport_intents_.

### A subscription is INTEREST, never authorization

`network_disclosure_subscriptions` carries a recipient, a purpose, a durable schema ref, a
destination kind and an effective window. It carries **no field, no pointer and no projection**, and
a test asserts that no such column exists.

A subscription can only narrow: it selects which authorized disclosures a recipient wishes to
receive. It cannot widen, because it names nothing that N5-A would have to honour. Mutation D-G
makes the subscription authorize by itself and routing tests fail.

### Subscriptions are authored by the RECIPIENT

The insert policy derives `recipient_participant_id` from the authenticated principal's tenancy
rather than accepting it as an argument, so a caller cannot subscribe on behalf of an organization
it does not hold. Mutation D-O relaxes it and the cross-tenant refusal test fails.

Interest is withdrawn by an append-only revocation row, never by UPDATE and never by DELETE —
the same shape N5-A uses for grant revocation, and for the same reason: withdrawing interest is an
event, and erasing the record of having been interested is not.

### Routing is PROSPECTIVE and resolved exactly once

`network_disclosure_routing_resolutions` is keyed by `network_event_id` alone. An event is resolved
once against the interest and authority that existed at that moment, and the answer is final. A
grant written afterwards does not reopen it — there is nowhere to record a second, different answer.
Mutation D-R relaxes the primary key and the prospective-routing test fails.

The resolution stores counts, not decisions: matched, authorized, denied, with a CHECK that they
account for each other exactly.

### One artifact per matched subscription, never one per subscription × grant

Multiple applicable grants are N5-A's provenance for a single union of fields — that is what its
multi-grant union means — not multiple instructions to deliver. Fanning out per grant would deliver
the same event to the same recipient once for every grant that happened to authorize part of it.
Mutation D-U fans out and the unit gate fails.

### The seven-table model

| Table                                         | What it records                               |
| --------------------------------------------- | --------------------------------------------- |
| `network_disclosure_subscriptions`            | recipient-authored interest                   |
| `network_disclosure_subscription_revocations` | append-only withdrawal of interest            |
| `network_disclosure_routing_resolutions`      | that an event was resolved, once, with counts |
| `network_disclosure_artifacts`                | the frozen authorized bytes and their digests |
| `network_disclosure_deliveries`               | the obligation and its mutable state          |
| `network_delivery_attempts`                   | that an attempt happened, and how it went     |
| `network_disclosure_inbox`                    | that delivery SUCCEEDED                       |

Two tables rather than one for artifact and delivery, because the artifact is immutable and the
delivery is not. An inbox row is the success record and the second idempotency barrier.

### The artifact is immutable; the delivery state is not

An artifact freezes `permitted_pointers`, the canonical payload, the payload digest, the
authorization digest and the composite decision digest. It is append-only.

`network_disclosure_deliveries` carries the state machine — five states, `pending`,
`failed_retryable`, `delivered`, `terminated_failed`, `terminated_unauthorized`. There is no
`leased` and no `delivering`: a lease is a transport concern and N6 has no transport.
`app.network_delivery_transition()` enforces immutable identity, no exit from a terminal state, the
legal transition matrix and `record_version = OLD.record_version + 1`. Mutation D-M disables it and
the state-machine tests fail.

### Re-authorization happens at ATTEMPT time, every time

Authorization at queue time is not authorization at send time. Every attempt re-evaluates N5-B then
N5-A against CURRENT authority, and the result is compared to the frozen artifact rather than
substituted for it. Mutations D-A (skip re-authorization) and D-F (evaluate at queue time) both fail
the unit gate.

### A retry is byte-identical, and there is no narrower replacement

The subset rule:

```
artifact.permittedPointers ⊆ current.permittedPointers
```

A BROADER current authorization changes nothing — the artifact is what leaves, so a retry can never
widen a disclosure (mutation D-K). A NARROWER one REFUSES with `terminated_unauthorized`; the
artifact is not silently replaced with a reduced payload, because a delivery whose content changed
between attempts is not the same delivery and quietly substituting one would make the payload digest
and the delivery identity disagree about what was sent (mutation D-X).

### Uniqueness is UNCONDITIONAL

`UNIQUE (network_event_id, subscription_id)` on deliveries, not partial. A terminated obligation
still blocks recreation: recreating one would be replay wearing a delivery's clothes. Mutations D-L
(remove it) and D-W (make it partial on state) both fail.

### The internal inbox, and pending invisibility

The only destination kind is `freightos_inbox`. An artifact is invisible to its own recipient until
an inbox row exists — the artifact read policy resolves visibility THROUGH the inbox, so "authorized"
and "delivered" cannot be confused by a reader. Mutation D-P opens it and the visibility test fails.

### Attempts record transport outcomes only

`app.network_delivery_attempt_outcome` is `delivered`, `database_transient`, `database_conflict`,
`internal_error`. An authorization denial is NOT an attempt outcome: a refusal terminates the
delivery, it does not attempt it. Adding `unauthorized` (mutation D-T) fails the taxonomy gate.

An attempt row carries no payload, no canonical bytes and no response body — a failure record is
metadata only, and copying disclosed content into it would create a second copy governed by nothing
(mutation D-S).

### The worker role

`freightos_delivery_worker` — LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, **NOBYPASSRLS**,
NOREPLICATION. It executes authority and never creates it: SELECT on everything it must read, writes
only on N6's own operational tables and the inbox, and no write anywhere in N1, N2, N3, N4, N5-A or
N5-B.

The migrator's edge over it is exactly `admin=true, inherit=false, set=false`. Administering a role,
inheriting it and being able to become it are three different powers, and only the first is granted.
**The worker is not SET-ROLE reachable from any role.** Mutation L-D widens it to `SET TRUE` and the
role-contract gate fails.

### The FORCE-RLS SELECT compatibility rule

This is the doctrine N6 paid for twice.

> Under FORCE ROW LEVEL SECURITY, a SELECT grant with no admitting policy returns **zero rows, not
> an error**. A GRANT alone is therefore not a privilege — it is a permanently empty read that
> raises nothing.

Whether a new grant needs a new policy depends entirely on the SHAPE of the policy already there:

| Pre-existing policy                                                   | Effect of granting the worker SELECT           |
| --------------------------------------------------------------------- | ---------------------------------------------- |
| `TO public USING (true)` — N5-B's three                               | worker reads immediately; **no policy needed** |
| `TO public`, non-tenant predicate — four N5-A reference tables        | reads immediately; none needed                 |
| `TO freightos_app` + tenant + permission — N5-A grants, revocations   | **zero rows**; policy required                 |
| `TO {admin_owner, app, control_plane, migrator}` — N3 journal         | **zero rows**; policy required                 |
| `TO public` but predicated on `current_tenant_id()` — N1 participants | **zero rows**; policy required                 |
| no SELECT policy at all — N4                                          | **zero rows**; policy required                 |

So 0034 adds **five** SELECT policies to relations it does not own — `network_transport_intents`,
`network_events`, `network_participants`, `network_disclosure_grants`,
`network_disclosure_grant_revocations` — and adds **none** to N5-B, whose three policies it does not
modify in any way. Those were already role-agnostic.

Each new policy mirrors one N3 already grants its own background identity:
`network_events_writer_identity_read` is `USING (true)` and
`network_participants_event_writer_read` narrows to organizations. The participant policy takes the
narrower form, because every N6 recipient binding is an `organization` by generated column.

### Migration assertion (m)

The rule is enforced by the migration itself, and it RECOMPUTES rather than listing:

> for every relation on which `freightos_delivery_worker` holds SELECT, at least one permissive
> SELECT policy must be capable of admitting it

`WORKER_FORCE_RLS_SELECT_WITHOUT_APPLICABLE_POLICY = 0` is a release gate. A twenty-first grant added
later is covered the moment it exists. Assertion (l) additionally names the five foreign-table
policies, because those are the ones most easily lost — they live on somebody else's table, and
losing one leaves a GRANT behind that reads as absence.

Behavioural tests then prove the worker sees actual rows. A structural check alone would still pass
if a policy existed but admitted nothing.

### The same hazard, opposite polarity, in the revert

The revert's destructive-history guard counted `network_disclosure_inbox` and
`network_disclosure_deliveries` as the migrator. Both are FORCE-RLS and no policy admitted it, so
both counts were always zero and the guard could never fire — it would have waved every downgrade
through and destroyed exactly the history it protects. Regression #5 failed CLOSED; this failed
**OPEN**.

The remedy is the pattern 0032's revert established: a temporary, exactly-scoped policy that exists
only for the statements that need it and is dropped before anything else runs. The migrator does not
gain the ability to read delivery history; it gains it for the length of one count. The identity-table
guards are scoped further, to the three N6 permission keys.

### Participant-registry bindings and F-20

Three N6 tables carry direct recipient identity — subscriptions, artifacts, inbox. Each binds to the
registry through a composite foreign key over `(recipient_participant_id, recipient_participant_type)`
with `recipient_participant_type` a `GENERATED ALWAYS AS ('organization') STORED` column, so the
recipient is provably an organization by construction. Every composite FK has an exact supporting
index in constraint column order — F-20 — and the schema-wide detector reports zero offenders.

**Participant identity is not tenant identity, and `tenant_id` may never substitute.** The evaluator
enforces this structurally: `DisclosureParticipant` carries no tenant field at all, so a same-tenant
shortcut around N5 is unwriteable (mutation D-H).

### The provenance chain — one authoritative tuple, four composite keys

Registry binding proves each recipient reference names a real organization. It says nothing about
whether two rows describing the same disclosure describe the _same_ disclosure — and they did not
have to. Every relationship between subscription, artifact, delivery and inbox was carried by an
independent single-column foreign key, so each column was individually valid while the row as a
whole could be self-contradictory. Four defects followed from that one shape, all reproduced against
the shipped candidate before any schema changed:

- **R-07** — a delivery for `(E2, S2)` could bind an artifact minted for `(E1, S1)`. The row then
  answered "who is this delivery for" two ways, and `reauthorizeDelivery` — which resolves the
  subscription from the **artifact** — would evaluate against one while the delivery record asserted
  the other.
- **R-08** — an inbox row could name any registered organization as recipient. Because
  `network_disclosure_artifacts_recipient_read` decides artifact visibility by joining _that_ column
  to the reader's tenant, an inbox row citing a tenant-B organization made a tenant-A artifact
  readable by tenant B. Cross-tenant disclosure of authorized bytes, reachable without touching a
  grant, a policy or a privilege. Reproduced: one row visible.
- **R-09** — an inbox row could cite delivery `D` and artifact `A'` where `D` bound `A`, publishing
  content that was never the subject of that delivery.
- **R-10** — an artifact could name a subscription belonging to one organization and a recipient
  belonging to another.

The invariant, stated once: **every row in the chain names the same disclosure, and the database
makes any other arrangement unrepresentable.** Four composite foreign keys carry it, each in the
shape 0029 established for `network_events_corrects_same_organization` — a named
`UNIQUE (identity, attribute)` on the referenced side, the composite key on the referencing side,
and the subsumed single-column foreign key removed rather than left to agree by luck:

```
subscriptions (subscription_id, recipient_participant_id)
  ← artifacts.network_disclosure_artifacts_subscription_recipient
artifacts (artifact_id, network_event_id, subscription_id)
  ← deliveries.network_disclosure_deliveries_artifact_binding
deliveries (delivery_id, artifact_id)
  ← inbox.network_disclosure_inbox_delivery_artifact
artifacts (artifact_id, recipient_participant_id)
  ← inbox.network_disclosure_inbox_artifact_recipient
```

The chain is anchored in an authenticated tenancy at its head: a subscription's recipient is
validated against the author's own tenant by `network_disclosure_subscriptions_insert`, and every
later link inherits that. Each new key has an exact supporting index in constraint column order, so
the schema-wide F-20 detector still reports zero offenders. Migration assertion **(n)** pins all four
by full `pg_get_constraintdef` text rather than by count — four keys were _already_ present when
every binding was independent, so a count could never have caught this.

**No delivery → routing-resolution foreign key.** `network_disclosure_routing_resolutions` is keyed
by the N4 intent as its PRIMARY KEY, and a delivery carries that same key, so the lineage is total
and there is exactly one resolution a delivery could belong to. Unlike the four keys above there is
no second candidate and therefore no contradiction available; a direct key would add no fact and
would impose a write order on a worker N6 does not ship. What the resolution proves that a delivery
cannot — matched, authorized and denied counts — is a fact about enumeration, not about any one
delivery.

### The trigger surface is pinned structurally

Behaviour proves the transition guard refuses what it should. It cannot distinguish a guard that
stopped running from one that never had to: recreated as `AFTER`, disabled with
`ALTER TABLE … DISABLE TRIGGER`, or given a `WHEN` clause excusing exactly the rows it exists to
stop, most behavioural assertions would survive while the mechanism was gone. A disabled trigger is
still in `pg_trigger`, so presence proves nothing.

0032 and 0033 pin their triggers this way; 0034 shipped with zero `pg_trigger` assertions. Migration
assertion **(o)** and a standing integration inventory now compare all twenty-one 0034-owned triggers
by table, name, timing, event, row-or-statement level, function identity, enabled state and `WHEN`
presence. Four controls — drop, wrong timing, disabled, planted `WHEN` — each make the inventory
fail and are rolled back. This closed an assertion-coverage gap, not an unguarded hole: no
production trigger was missing or misconfigured.

### A guard must see the rows it inspects — on the way up, too

Migration assertion **(f)** claims the three N6 permission keys are held by nobody. It read
`role_permissions` as the migration principal, and that table is FORCE-RLS with policies predicated
on `app.current_tenant_id()` — which a deployment session does not have. Measured on this branch:
the migrator saw **0** rows where the superuser saw **3**. The claim was true by blindness.

This is the R-06 hazard on the _up_ side, in a migration whose own revert had already been fixed for
it. 0034 now takes the same temporary, exactly-scoped policy its revert takes — the three keys and
nothing else, the migration principal and nobody else, dropped before the migration ends — and
checks the service-account arm as well as the role arm. An integration test measures both numbers
against the same rows, because a guard that cannot tell 0 from 3 is not evidence of anything.

### Two role inventories, kept apart

The revert's completeness check asks whether **this database** still references the worker; its
boundedness check asks whether **the cluster** gained or lost a `freightos%` role. Those are
different questions and conflating them is how cluster-global residue passes a per-database check.

Both were weaker than their claims. The per-database check filtered on `pg_shdepend.dbid` alone,
which cannot see a database-level grant — recorded with `dbid = 0` and the database in `objid`, the
one arm the teardown has to revoke by name and special-case — so it was blind to exactly the residue
it exists to catch. The cluster-global check compared a _count_, which cannot tell "the worker went"
from "the worker stayed and something else went". The first now matches both arms; the second
compares exact sorted role names in both directions, admitting only `freightos_delivery_worker` as
removable and nothing at all as added.

### Producer classification is inert

`network_events.classification` is producer-supplied and carries no authority in N6 routing or
authorization. `DisclosureEvent` does not expose it, so consulting it requires widening the type
first — which the type-surface gate fails (mutation D-N).

### Cluster-global role teardown

A PostgreSQL role is one catalog row shared by every database, and `DROP ROLE` consults `pg_shdepend`
across all of them. PostgreSQL cannot revoke privileges in a database you are not connected to. So
the revert: revokes locally; REFUSES when the worker owns a relation; consults `pg_shdepend`
excluding self; RETAINS with a NOTICE when another database still holds the role; and drops only as
the last holder. No `DROP OWNED BY`, no `CASCADE` — either would reach into objects this migration
never created, in this database only, leaving every other database's grants intact.

The proof needs a last-holder case, which is a property of the whole cluster, so it runs on a
disposable cluster of its own with four databases: retention with a neighbour, a negative control
that contributes no dependency, the last-holder drop, and the owned-relation refusal.

### No replay

There is no replay engine and no dead-letter worker. Retry is bounded — six attempts, twenty-four
hours, thirty seconds doubling to a thirty-minute cap, full jitter — and exhaustion terminates the
obligation rather than parking it somewhere for later re-emission.

## Consequences

- N6 can prove what would be disclosed, to whom, and on what authority, without disclosing anything.
- A recipient's inbox is the only destination, so nothing external depends on N6's shape yet.
- Ten real defects were found and fixed, nine of them in security-relevant surfaces. Two were the
  same FORCE-RLS hazard with opposite consequences (R-05 failed closed, R-06 failed open). Four —
  R-07 through R-10 — were one shape: independent single-column keys where the invariant was that
  several rows describe the same disclosure. Only R-08 was reachable as a disclosure to a party that
  should not have received it, and it was reachable without touching a grant, a policy or a
  privilege.
- The residual on `reauthorizeDelivery` is recorded rather than closed: the schema now guarantees a
  persisted delivery and its artifact cannot disagree, but the function still takes an artifact and
  an event as separate arguments and does not require them to match. No production caller exists —
  the worker is N7 — and refusing the pair at runtime would mean a new refusal reason, which is new
  N6 semantics rather than a repair. It is N7's to settle when it writes the caller.
- N7 inherits a settled decision surface and a worker role that already has exactly the reads it
  needs and no writes it does not.

## Out of scope

Kafka, NATS, SQS, SNS, Redis Streams, webhook infrastructure, a public subscriber API, a replay
engine, a dead-letter worker, secret-manager integration, message-level encryption, a partner SDK, a
recipient acknowledgement protocol, multi-region, cross-cloud, billing and route optimization.
