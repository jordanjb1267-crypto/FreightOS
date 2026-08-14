# N7 External Transport — Owner Rulings Required

Architecture phase. Twelve decisions the architecture deliberately does **not** make. Each has a
recommendation and a stated consequence, so a ruling is a choice between named options rather than an
open question.

Nothing below is implemented. Companion to ADR-N0018.

---

## Summary table

| #     | Ruling                                | Recommendation                                 | Blocks               |
| ----- | ------------------------------------- | ---------------------------------------------- | -------------------- |
| OR-01 | First transport adapter               | HTTPS webhook, SSRF controls first             | all adapter work     |
| OR-02 | Dedicated N7 worker vs. reuse         | dedicated `freightos_transport_worker`         | role migration       |
| OR-03 | What creates an external obligation   | explicit per-destination opt-in                | schema               |
| OR-04 | Multiple destinations per recipient   | allow N, one obligation each                   | schema               |
| OR-05 | Fresh N5 before each external attempt | **Option C (brokered permit)**                 | worker model, schema |
| OR-06 | Endpoint administration authority     | recipient-side admin, permission-gated         | schema, permissions  |
| OR-07 | Secret-management boundary            | deployment secret surface, resolved in-process | adapter              |
| OR-08 | Destination purpose filtering         | allow, routing-only                            | schema               |
| OR-09 | Retry limits and maximum age          | mirror N6: 6 attempts / 24h                    | engine               |
| OR-10 | Replay policy                         | remain deferred                                | —                    |
| OR-11 | Acknowledgement semantics             | per-adapter, 2xx ≠ processed                   | taxonomy             |
| OR-12 | Attempt-metadata retention            | **no recommendation — needs policy**           | retention            |

**OR-02 and OR-05 are coupled and must be ruled together.** See OR-05.

---

## OR-01 — Which transport adapter is implemented first

**Options.** Generic HTTPS webhook · managed queue (SQS/SNS/PubSub) · email · EDI/API-specific.

**Recommendation: HTTPS webhook**, conditional on sequencing.

It is the only candidate with zero vendor coupling and excellent local testability — a scripted
loopback receiver exercises every acknowledgement, timeout and failure path without an emulator or a
partner. It is also what counterparties actually ask for.

It carries the entire SSRF surface, which is an argument for doing it while the threat model is
fresh rather than shaping the architecture around a broker's guarantees and retrofitting HTTP later.

**Condition:** the SSRF control set (`N7_THREAT_MODEL.md` §5) and its adversarial sub-matrix
(`N7-S-01…18` plus the positive control) land and pass as a **separately reviewable unit before any
adapter code**. If that sequencing is unacceptable, the honest alternative is a managed queue first —
lower risk, but it defers every hard question instead of answering one.

**Consequence of choosing a queue instead:** vendor coupling enters the architecture at the adapter
boundary, secret management becomes IAM-shaped, and the ack-semantics question (OR-11) is postponed
rather than resolved.

---

## OR-02 — Dedicated N7 worker, or reuse `freightos_delivery_worker`

**Recommendation: dedicated `freightos_transport_worker`.**

`freightos_delivery_worker` holds SELECT on twenty relations — the N3 journal, N4 intents, the
participant registry, N5-A grants and revocations, N5-B ceilings, subscriptions. Reuse would give a
single identity both **full governed-state read access** and **egress capability**, so one process
compromise crosses both trust boundaries at once.

The operational argument is as strong as the security one: under reuse, "stop all external transport"
and "stop internal delivery" become the same lever, because they are the same role. Separation makes
the egress kill switch independent, which is what it is for.

**Cost:** one more cluster-global role under 0029 teardown doctrine, one more LOGIN identity in the
integration harness (now mechanically enforced by the credential-coverage gate), one more connection
pool.

**Read OR-05 before ruling.** Option B substantially weakens what this separation achieves.

---

## OR-03 — What creates an external transport obligation

**Options.**
**(a)** Automatic from every committed inbox row where an eligible destination exists.
**(b)** Explicit per-destination opt-in — a destination declares it wants external delivery.
**(c)** Separate external subscription, parallel to N6's interest model.

**Recommendation: (b).**

**Not every N6 recipient wants external delivery.** N6's inbox is a complete product surface on its
own; a recipient reading artifacts from the inbox has been served. Making external transport
automatic (a) would send data out of the building because a destination row happened to exist —
turning configuration into an instruction.

(b) keeps the decision where the destination already lives and adds no new table. (c) is the most
explicit but duplicates N6's subscription semantics, and two interest models that can disagree is the
R-07 shape wearing different clothes.

**Consequence:** a destination row means "send here", so creating one is a consequential act and
belongs behind the same permission gate as OR-06.

---

## OR-04 — May one recipient have multiple destinations for the same artifact

**Options.** 0 · exactly 1 · N.

**Recommendation: N, with one obligation per destination.**

Real recipients have a production endpoint and an archive, or are migrating between systems. Forcing
1 pushes fan-out into customer infrastructure.

**The constraint that keeps this safe:** destination multiplicity is **routing**, not authorization.
N5-A already refused to let multiple grants multiply delivery obligations — multiple grants are
provenance for one union of fields (mutation D-U). Destinations must not reintroduce that error from
the other end: N destinations produce N _transports_ of the **same artifact**, never N artifacts and
never N authorizations.

`UNIQUE (artifact_id, destination_id)` is what makes this precise: one obligation per pair,
idempotent per pair, independent outcomes.

---

## OR-05 — Fresh N5 authorization before each external attempt

**The most consequential ruling in this phase, and it is coupled to OR-02.**

The situation: a grant is revoked _after_ the N6 inbox row commits but _before_ an external attempt.

### Option A — N6 authorization is final at inbox commit

N7 retries the artifact without a fresh N5 check.

|                           |                                                                  |
| ------------------------- | ---------------------------------------------------------------- |
| Revocation responsiveness | **poor** — a revoked grant does not stop a pending external send |
| Artifact immutability     | unaffected                                                       |
| Separation of duties      | **clean** — transport worker needs no N5 read at all             |
| Availability              | best — no evaluation on the send path                            |
| Audit                     | simple                                                           |

### Option B — every external attempt re-runs N6 reauthorization

|                           |                                                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Revocation responsiveness | **best** — the last check is immediately before egress                                                                                                      |
| Artifact immutability     | unaffected (the subset rule can only refuse, never narrow)                                                                                                  |
| Separation of duties      | **substantially weakened** — the egress-capable role now needs N5-A, N5-B, subscriptions and the journal: exactly the read surface OR-02 wanted to withhold |
| Availability              | N5 evaluation cost on every attempt                                                                                                                         |
| Audit                     | a composite decision digest per attempt — richer, and more of it                                                                                            |

### Option C — brokered egress permit _(recommended)_

The N6-side worker re-runs reauthorization and writes a **short-lived, single-use egress permit**
bound to `(artifact_id, destination_id)`. The transport worker holds no N5 read access and may send
only against an unexpired, unconsumed permit.

|                           |                                                                          |
| ------------------------- | ------------------------------------------------------------------------ |
| Revocation responsiveness | good — bounded by permit lifetime, which is a tunable                    |
| Separation of duties      | **preserved** — egress process never reads governed authorization state  |
| Availability              | good — evaluation off the send path                                      |
| Cost                      | a permit table, a lifetime to reason about, two workers in the loop      |
| New failure mode          | permit expiry between issue and send → re-issue, not a transport failure |

**Recommendation: Option C**, because it is the only option that does not force a choice between
revocation responsiveness and blast radius. Its cost is real and is stated: one more table and one
more concept.

**If simplicity outweighs that**, Option B is defensible — but then OR-02's separation should be
described honestly as "for auditability and kill-switch independence, with an unchanged read blast
radius", not as least privilege.

**Option A should not be chosen** unless the owner accepts that a revoked authorization can still
result in an external disclosure.

**In all three options:** a transport error must never trigger reauthorization that changes artifact
content. N6's subset rule already guarantees reauthorization can only permit or refuse; it can never
produce a narrower replacement artifact.

---

## OR-06 — Who may create and change a destination endpoint

**Recommendation: the recipient's own tenant, behind an explicit permission**, mirroring N6's
recipient-authored subscription: `network.transport_destination.create` / `.revoke` / `.read`, with
the destination's recipient validated against the caller's own tenancy in the policy's `WITH CHECK`.

Rationale: the recipient knows where its own systems live, and N6 already established that the
recipient authors its own interest. A grantor choosing where a recipient's data lands would be a
different and larger authority.

**Sub-decision — is the endpoint stored inline or by reference?** Inline (a validated URL column)
keeps the audit self-contained and is simpler. By-reference keeps customer hostnames out of the
database. Either way the endpoint is **immutable** and **never a runtime argument**. No recommendation
— this depends on how the deployment treats hostnames as data.

**Not negotiable regardless of ruling:** T-04's control. Changing an endpoint is create-new +
revoke-old, never `UPDATE`.

**Caution.** Under OR-03(b), a destination row means "send here". Recipient-side administration plus
automatic obligation creation would let a tenant insider (adversary A3) direct their own
already-authorized data anywhere the SSRF filter permits. That is not a disclosure-authority
violation — the data was authorized for that organization — but it is worth ruling on deliberately
rather than inheriting.

---

## OR-07 — Secret-management boundary

**Recommendation: a deployment secret surface, resolved in-process, referenced by the destination
row.** No specific vendor selected — the architecture requires only resolve / rotate / revoke /
audit.

Required properties: secret ownership follows the destination's tenant; rotation does not require a
new destination identity; revocation without destination revocation yields `authentication_failed`
(terminal, non-retryable — retrying a rejected credential is how accounts get locked); resolution is
auditable by reference, never by value; and secrets never appear in a table, a log, a metric or an
attempt record.

**Ruling needed on:** which surface the deployment provides, and whether per-destination or
per-tenant scoping is the unit of secret isolation.

---

## OR-08 — May a destination filter by purpose

**Recommendation: yes, as routing configuration only.**

A destination may declare that it accepts only certain purpose codes. This is genuinely useful — a
billing endpoint does not want operational telemetry.

**The distinction that must be frozen:** purpose filtering **narrows** what a destination receives.
It can never authorize anything. A destination declaring a purpose it has no N5-A grant for receives
nothing, and the filter is applied _after_ authorization, never as an input to it.

Same rule as the subscription: interest narrows, it never widens.

---

## OR-09 — Retry limits and maximum transport age

**Recommendation: mirror N6** — six attempts, twenty-four hours, thirty seconds doubling to a
thirty-minute cap, full jitter. Exhaustion **terminates** the obligation rather than parking it.

Rationale: a second, different retry policy in an adjacent phase is a thing that will drift. If
external transport genuinely needs different numbers, that is a deliberate change with a reason —
not a default.

**Open sub-question:** whether `429` with `Retry-After` may extend the age bound, and by how much. A
counterparty asking for a six-hour backoff should not silently extend a twenty-four-hour obligation
to a week. Recommendation: honour `Retry-After` **within** the existing age bound, never beyond it.

---

## OR-10 — Replay policy

**Recommendation: remain deferred.**

```
retry the same external obligation   !=   replay / recreate a historical obligation
```

Initial N7 has no administrative replay endpoint and no mechanism to create an obligation for a
historical artifact that never had one. Re-enabling a revoked destination creates a **new**
destination identity and does **not** generate obligations for artifacts authorized under the old
one — that would be replay through the back door.

N6 refused replay for a specific reason: re-sending a historical event because a new grant appeared
is replay wearing a delivery's clothes, and the unconditional uniqueness exists to prevent it. N7
inherits the reasoning intact.

---

## OR-11 — Acknowledgement semantics

**Recommendation: per-adapter, with `2xx ≠ processed` as the default.**

```
transport acknowledgement   !=   remote business processing
```

A transport-level `accepted` means bytes were taken by a remote endpoint. Only an adapter whose
protocol _explicitly_ guarantees business-level processing may map a response to a state meaning the
counterparty acted on the disclosure — and that guarantee is documented per adapter, not assumed from
a status code.

**Ruling needed on:** whether N7 ships any state stronger than `accepted` at all. Recommendation:
**no** for the first adapter. A generic webhook cannot honestly support one.

**If structured acknowledgement data is needed:** an allowlisted parsed acknowledgement schema per
adapter, size-bounded, never an arbitrary body (T-11).

---

## OR-12 — Retention of attempt and acknowledgement metadata

**No recommendation.** This one is genuinely open.

Destination configuration, revocations, transport obligations and transport audit all have defensible
permanent-retention arguments — they are the record that a disclosure left the building. **Attempt
metadata is different:** it is high-volume operational telemetry that also carries forensic value.

`DATA_CLASSIFICATION.md` and the retention policy supply no duration for this class, and inventing
one would put a fabricated figure into a governance document. Flagged rather than guessed.

**Ruling needed on:** retention duration for attempt rows and acknowledgement metadata, and whether
they follow the `AUDIT` class (permanent) or an operational-telemetry class (bounded).

---

## Sequencing note

**OR-01, OR-02, OR-03 and OR-05 block schema work.** The rest can be ruled during implementation
without rework — OR-09, OR-11 and OR-12 in particular are tunable after the shape is fixed.

OR-05 should be ruled **first**: it determines the worker model (OR-02), whether a permit table
exists at all, and therefore the shape of the schema the other rulings attach to.
