# ADR-N0018 — N7 external transport boundary

- **ADR ID:** N0018
- **Title:** Carrying an authorized artifact out of the database, without acquiring the right to decide
  what it contains
- **Status:** Accepted. All twelve owner rulings made; the non-egress half implemented as N7-A.
  **Still no executable egress** — see the implementation-status section.
- **Date:** 2026-08-14
- **Migration:** `0035_network_external_transport_foundation`. The ADR as first written proposed no
  migration; the rulings it asked for produced one.
- **Base:** `b6fb791a17ac554a92373a465a0cf23f6abd879a` (N6 merged)
- **Related:** ADR-N0013 (N3 journal), ADR-N0014 (N4 transport intent), ADR-N0015 (N5-A authorization
  core), ADR-N0016 (N5-B sensitivity ceiling), ADR-N0017 (N6 authorized disclosure delivery),
  `docs/governance/N7_THREAT_MODEL.md`, `N7_DATA_FLOW.md`, `N7_ROLE_ACL_MODEL.md`,
  `N7_EGRESS_CI_MODEL.md`, `N7_MUTATION_PLAN.md`, `N7_OWNER_RULINGS.md`

## Context

N6 ends with an artifact in an internal inbox. Every question about _what may be disclosed_ is
settled and frozen before that point: N4 recorded the debt, a subscription recorded interest, N5-B
set the ceiling, N5-A set the field authority, and N6 materialized the exact bytes and bound them to
a digest. The inbox row is the record that delivery **succeeded** — internally.

Nothing has left the database.

N7 is the first phase in the network band that can cause an irreversible external effect. That
single property is what makes it different from everything before it. N3 through N6 can be reverted:
a migration goes down, a row is removed, a decision is re-evaluated. A byte that reached a
counterparty cannot be recalled. Every design choice below follows from that asymmetry.

## The one-sentence security invariant

> **N7 may choose how and where an already-authorized N6 artifact is transported. It may never choose
> what disclosure content is authorized.**

Two corollaries, stated so neither can be reasoned away later:

```
N7 destination authority   !=   N5 disclosure authority
transport configuration    !=   permission to disclose
```

**A destination cannot expand an artifact.** There is no configuration value, no adapter option, no
endpoint property and no remote response that can add a field, widen a projection, raise a
sensitivity ceiling, or change who a disclosure was authorized for. If a proposed N7 feature would
require any of those, it is not an N7 feature — it is an N5 change, and it belongs in N5's review.

## The trust chain, frozen

```
N3 accepted fact
  → N4 transport debt
    → subscription interest
      → fresh N5-B ceiling
        → fresh N5-A authorization
          → immutable N6 artifact
            → N6 internal inbox
              → N7 external transport
```

N7 may not bypass N4, subscriptions, N5-B, N5-A, N6 artifact creation, or N6 attempt-time
reauthorization. It has exactly one legitimate entry point: **an artifact that already has a
committed N6 inbox row.**

## What N7 is allowed to answer

1. Which externally registered destination corresponds to this already-authorized recipient?
2. Is that destination currently eligible and enabled?
3. Which transport adapter owns it?
4. What exact immutable bytes are sent?
5. How is that transmission authenticated?
6. How are retries and idempotency handled?
7. How is remote acknowledgement interpreted?
8. What metadata is retained?
9. How is transport disabled — globally, per adapter, per destination?
10. How do we prove no transport occurred when authorization or configuration was invalid?

## What N7 is forbidden to decide

Recipient identity from caller input · purpose · permitted fields · sensitivity · projection · grant
union · historical replay eligibility.

Each of those has an owner earlier in the chain, and N7 reading one from a caller argument would be
the exact defect class N6 spent four regressions on.

## The design rule N6 paid for — carried forward as binding

R-07 through R-11 were one shape, met five times:

> **Whenever the same authority, provenance, recipient, artifact, event, subscription, destination or
> transport identity appears in two places, derive one from the other, or enforce equality at the
> exact boundary where both coexist. Never rely on caller convention.**

R-07…R-10 were independent single-column foreign keys where the invariant was that several rows
describe the same disclosure. R-11 was the same shape one layer up, in a function's arguments —
which is why the schema fix could not catch it and the schema guarantee could not substitute for it.

**Every N7 object and API must publish a duplicated-identity table**, classifying each duplicated
value as exactly one of:

| Class                     | Meaning                                                                         |
| ------------------------- | ------------------------------------------------------------------------------- |
| `DERIVED`                 | Not stored or passed twice at all; read from the single authoritative row.      |
| `DATABASE-BOUND`          | Stored twice, equality enforced by a composite foreign key or generated column. |
| `CRYPTOGRAPHICALLY-BOUND` | Equality enforced by a digest or signature over both values.                    |
| `RUNTIME-ASSERTED`        | Compared in code before any effect, fail-closed, with an ordering guarantee.    |
| `INVALID DESIGN`          | Duplicated with nothing enforcing agreement. Must not ship.                     |

`RUNTIME-ASSERTED` is permitted only where no database or cryptographic binding is possible — and it
carries R-11's ordering obligation: the check must run **before** any other refusal that could mask
it, and must have its own distinguishable outcome.

## Decisions

### The recipient column is written once and constrains both parents

This is the central structural decision, and it falls straight out of R-08's remediation.

`network_disclosure_artifacts` already carries `UNIQUE (artifact_id, recipient_participant_id)` — a
key added so the inbox could bind its recipient to the artifact's. A destination table can carry the
mirror key, `UNIQUE (destination_id, recipient_participant_id)`. An external transport obligation
then stores `recipient_participant_id` **once** and points both composite keys at it:

```
external_transport (artifact_id,   recipient_participant_id) → artifacts    (artifact_id,   recipient_participant_id)
external_transport (destination_id, recipient_participant_id) → destinations (destination_id, recipient_participant_id)
```

Because there is only one `recipient_participant_id` column in the row, "the artifact's recipient
equals the destination's recipient" is not a rule anyone has to remember — it is the shape of the
row. `artifact recipient A + destination owned by B` is unrepresentable, not rejected.

**Duplicated-identity class: `DATABASE-BOUND`.** This is the direct N7 application of R-08 and R-11,
and it is the reason the architecture proposes composite keys rather than two `uuid REFERENCES`
columns.

### Transport binds one artifact, and derives everything else

The transport obligation carries `artifact_id` and **not** an independently supplied event,
subscription, payload or digest. All of those are reachable from the artifact by join, and every one
of them supplied separately would be a fresh instance of the R-07 shape.

Where a denormalized copy is genuinely required — an audit query that must not depend on a join
surviving, for instance — it must be `DATABASE-BOUND` by a composite key against the artifact
(`(artifact_id, payload_digest) → artifacts (artifact_id, payload_digest)`, which needs the matching
UNIQUE on the artifact side). A denormalized copy with nothing enforcing agreement is
`INVALID DESIGN`.

### The wire content is the artifact's bytes, unmodified

```
wire disclosure content  =  N6 frozen artifact payload_canonical
```

N7 does not re-project, re-serialize, re-canonicalize or regenerate. `payload_canonical` is text
precisely so that a digest binds the bytes rather than a rendering of an equivalent structure; N7
transmits that string.

N7 **may** wrap it in a transport envelope. The envelope and the authorized payload are different
things and the architecture keeps them lexically separate:

- **authorized disclosure payload** — the artifact's frozen bytes, never altered
- **transport metadata / envelope** — message id, artifact id, recipient and destination identity,
  artifact digest, issue time, protocol version

An envelope field may not be derived from the payload's _content_, and no envelope field may
influence what the payload contains.

### The external envelope is a new N2 durable schema

N6 deliberately shipped no external machine envelope. N7 needs one, and it must be **new**:

- do **not** reuse `event-envelope.v1` — that is N3's contract for accepted facts, and a transport
  frame is not an event;
- do **not** reuse any N3 event contract as a transport envelope;
- register it as a governed N2 durable schema with an explicit version and canonical serialization.

Envelope version and payload schema version are **separate dimensions** (§40 of the directive) and
must not be collapsed into one number. A destination may accept envelope v1 while accepting only
some payload schema versions, and both facts have to be independently expressible.

Candidate conceptual fields — **not frozen**, pending owner ruling: `transport_message_id`,
`artifact_id`, recipient identity, destination identity, artifact digest, payload, `issued_at`,
protocol version.

### Schema compatibility is explicit, never inherited by prefix

Mutation D-Q's lesson applies directly:

```
new durable schema version   !=   automatically compatible with a destination
```

A destination declares which durable schema versions it accepts, by exact reference. No prefix
match, no "v1.x implies v1.y", no most-recent-wins. An artifact whose `durable_schema_ref` is not in
a destination's declared set produces **no transport obligation** — it does not produce a best-effort
send.

### N7 has its own state; N6's `delivered` is not overloaded

```
N6 delivered            =  internal inbox row committed
N7 accepted/delivered   =  an external transport-specific fact
```

N6's delivery record is immutable historical truth about an internal event. Overloading it to also
mean "left the building" would destroy the distinction the whole band exists to preserve — the same
error as collapsing `DELIVERY ATTEMPTED` into `DELIVERY SUCCEEDED`.

The four-way distinction therefore extends to five:

```
TRANSPORT OWED != DISCLOSURE AUTHORIZED != DELIVERY ATTEMPTED
    != INTERNALLY DELIVERED != EXTERNALLY ACCEPTED
```

### Transport acknowledgement is not remote business processing

`HTTP 2xx` means a remote HTTP server accepted bytes. It does not mean a counterparty's system
recorded, understood or acted on the disclosure — unless that protocol explicitly guarantees it, in
which case the guarantee is a property of the adapter and is documented per adapter.

The state vocabulary keeps these apart, and no state named `delivered` may be reachable purely from
a status code without an adapter-specific acknowledgement rule that says so.

### Retry preserves the obligation exactly

A retry sends the **same artifact** to the **same destination** with the **same authorized payload**
and the **same idempotency identity**. A retry may never recompute disclosure fields, silently select
another destination, widen the payload, or create a replacement artifact. If the destination has been
revoked or disabled, transport stops — it does not fail over.

The idempotency identity is a property of the _obligation_, not of the attempt, and is stable across
every retry of that obligation. Regenerating it per attempt is listed as a mutation
(`N7-M-13`) precisely because it is the natural mistake.

### Revocation stops the future and rewrites no history

Destination deactivation follows N5-A's grant-revocation and N6's subscription-revocation doctrine:
an append-only revocation record, not a boolean that can be set back. A flag that can be flipped
back is a pause with an audit gap.

- Pending transmissions: stop. No further attempts.
- Retryable failures: terminate as `destination_disabled`, not retried.
- Historically succeeded deliveries: remain visible and unaltered. Reverting the schema is not a
  recall, and neither is revoking a destination.
- Re-enabling: creates a **new destination identity**, not a resurrection. Whether that produces new
  obligations for artifacts authorized under the old one is an owner ruling (`OR-10`), and the
  architectural default is **no** — that would be replay.

### Replay stays deferred

```
retry the same external obligation   !=   replay / recreate a historical obligation
```

N7's initial scope contains no administrative replay endpoint and no mechanism to create a transport
obligation for a historical artifact that never had one. Replay requires separate owner approval.

### The endpoint is never a caller argument

```
authenticated destination administration
  → persisted governed destination
    → transport worker derives the endpoint from destination_id
```

There is no runtime URL parameter anywhere in the N7 surface. This is the same rule N6's source gate
enforces for recipient and purpose, applied to the destination, and it is the single most important
control against SSRF: an attacker who cannot name an address cannot aim the request.

### Secrets are referenced, never stored

No raw external credential, token, signing key or password is stored in an ordinary FreightOS table.
A destination row carries a **reference** to a secret in a secret manager or deployment secret
surface. The reference's ownership, rotation, revocation, audit, access role, redaction rules and
logging prohibition are specified in `N7_ROLE_ACL_MODEL.md`.

`DATA_CLASSIFICATION.md` already classes credential material `SECRET` with logging **Never**; N7
adds no exception to that.

### Egress capability is bounded, named, and CI-visible

The existing `check-network-egress.mjs` proves the repository has **zero** egress capability. N7
cannot simply switch it off — that would replace a proof with an absence.

Instead it evolves into an **allowlist gate**: zero egress everywhere except an explicitly enumerated
adapter boundary, with the allowlist itself asserted so that widening it is a visible, reviewable
diff. The gate also becomes a **named CI step**, which closes the standing
`NETWORK_EGRESS_CI_OBSERVABILITY` finding — a control that only ever ran locally was never really a
control. Design in `N7_EGRESS_CI_MODEL.md`.

### Separation of duties is the default, not the exception

The three authorities N7 touches are kept apart on purpose:

```
database authority   !=   network egress authority   !=   secret authority
```

A dedicated `freightos_transport_worker` is **recommended** over reusing
`freightos_delivery_worker`, and the recommendation is argued in `N7_ROLE_ACL_MODEL.md` rather than
assumed. The short form: a role that can read every authorized artifact should not also be the role
that can open sockets, because a single process compromise then crosses both boundaries at once.

That recommendation is **coupled** to owner ruling `OR-05` (fresh N5 before each external attempt) —
see the next section, which is the most consequential open question in this ADR.

## The coupling the owner must see

Directive §21 (worker separation) and §34 (fresh N5 at egress) cannot be decided independently.

- Choose **Option B** — re-run N6 reauthorization before every external attempt — and whichever role
  performs egress must also be able to read N5-A grants, N5-B ceilings, subscriptions and the N3
  journal. That is precisely the read surface the separation was meant to keep away from the
  egress-capable process.
- Choose **Option A** — N6 authorization is final at inbox commit — and the transport worker needs
  almost nothing: the artifact bytes for a valid obligation, and its destination. Separation is
  clean. Revocation responsiveness is the cost: a grant revoked after inbox commit does not stop a
  pending external send.

There is a third shape worth ruling on, because it gets both properties:

- **Option C — brokered permit.** The N6-side worker re-runs reauthorization and writes a
  short-lived, single-use _egress permit_ bound to `(artifact_id, destination_id)`. The transport
  worker holds no N5 read access at all and can send only against an unexpired, unconsumed permit.
  Cost: a second worker, a permit lifetime to reason about, and a new table.

Recommendation and full comparison in `N7_OWNER_RULINGS.md` (`OR-05`). **Not chosen here.**

## Implementation status — what N7-A actually shipped

This ADR was written before implementation, and the sections above are preserved as the argument
that was put to the owner, conditionals and all. This section records what was ruled and built. Where
the two disagree, this section is current and the text above is the reasoning that produced it.

**Ruled: `OR-05` Option C, the brokered permit.** The consequences ran through the whole design:

- **Five N7 tables, not four.** The permit relation
  (`network_external_transport_permits`) is the fourth-plus-one: destinations, destination
  revocations, obligations, permits, attempts. Every document in this set that says "four" predates
  the ruling.
- **Two runtime roles, and the separation is the primary security invariant.**
  `freightos_delivery_worker` re-runs reauthorization and MINTS permits; it holds no egress.
  `freightos_transport_worker` will one day execute transport; it holds no N5 read of any kind and
  **cannot insert a permit at all** — there is no INSERT grant for it to widen, not merely a policy
  that refuses. Neither role is a member of the other, in either direction, and migration 0035
  asserts that at deploy time.

      authorization role  !=  egress role

- **Migration 0035**, `0035_network_external_transport_foundation`. Additive over a populated 0034,
  with exactly one change to an N6 relation: `network_disclosure_artifacts_id_digest_key`, a
  `UNIQUE (artifact_id, payload_digest)` the permit's digest foreign key binds against. The revert
  removes it again.
- **Zero egress capability, unchanged.** `NETWORK_EGRESS=PASS` and
  `NETWORK_EGRESS_ALLOWLIST=PASS` (zero approved modules) both hold after 0035. No HTTP client, no
  socket, no DNS, no credential resolution, no adapter, no replay. The CI gate that will govern
  egress was built **before** the first primitive exists, so its first exercise is not the change
  that needs it.
- **`SECURITY DEFINER` delta = 0.** N7-A adds exactly one function,
  `app.network_external_transport_transition()`, and it is INVOKER rights. A transport foundation
  that had needed a definer would have been smuggling privilege through the one door SR-2's gates
  watch.

**Ruled after N7-A — `OR-13`: external envelope registration is DEFERRED TO N7-B.**

The section above marks the envelope's fields "not frozen, pending owner ruling". `OR-13` rules that
the freezing itself waits: the field set, serialization contract, signing surface and acknowledgement
semantics are not settled, and registering a governed durable N2 wire contract before the first
adapter exercises those boundaries would freeze bytes nobody has had to produce — and a durable
schema is by design the hardest thing in this repository to change afterwards.

N7-A therefore registers **no** external wire-envelope durable schema, emits no envelope, and
contains no external serialization code. It ships the _routing_ half instead: a destination declares
the artifact payload's `durable_schema_ref` it accepts, by **exact reference**, with no prefix and no
family inheritance. The two versions stay separate dimensions —

```
artifact payload durable_schema_ref   !=   external transport envelope version
```

— and nothing in 0035 collapses them. No further migration is to be created to satisfy the
superseded registration requirement; `0035` is N7-A's only migration. Full ruling in
`N7_OWNER_RULINGS.md` (`OR-13`), asserted mechanically by
`scripts/test/n7-envelope-deferral-gate.test.ts`.

**Still open:**

- **`OR-06`'s open half** — whether endpoints are ultimately stored inline or resolved from a
  reference. Until it is ruled, `endpoint_ref` holds a reference and a CHECK constraint refuses
  anything with a URL scheme.

## Consequences

- N7 is the first phase whose failures are not recoverable by migration. The architecture therefore
  spends its complexity budget on preventing a wrong send rather than on recovering from one.
- The four-way distinction becomes five-way. Anything that reads "delivered" now has to say which
  boundary it means.
- The zero-egress guarantee ends by design. It is replaced by a bounded, named, enumerated egress
  surface — which is a weaker property honestly stated, not the same property.
- N6 gains no new authority and loses none. This ADR proposes no change to migration 0034, to any N6
  table, policy, role or test.
- Twelve owner rulings are required before implementation. They are tabulated, not buried. All
  twelve were subsequently ruled; see the implementation-status section above for the two whose
  consequences changed this document's own table count.

## Out of scope for this phase

Executable transport of any kind · HTTP clients · webhook senders · Kafka, NATS, SQS, SNS, Redis ·
destination secrets · external credentials · signing keys · persisted endpoint URLs · replay engines ·
external queue producers · background transport processes · network egress exemptions · any
migration.
