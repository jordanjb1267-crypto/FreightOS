# N7 External Transport — Data Flow and Proposed Model

> **Status: the table model shipped in migration 0035** — five relations, not the four proposed
> here, because `OR-05` Option C was ruled and the brokered permit became a table. Column and
> constraint names below were proposals; where the migration differs, the migration is current.
> No adapter exists and no byte leaves the process.

Companion to ADR-N0018 and `N7_THREAT_MODEL.md`.

---

## 1. Where N7 starts

```
N6 inbox row committed  (the artifact HAS been delivered internally)
        │
        ├─ is there an eligible destination for this artifact's recipient?      OR-03
        │     ├─ no  → no obligation. Not an error. Not every recipient wants external delivery.
        │     └─ yes → one obligation per eligible destination                  OR-04
        │
        ▼
N7 external transport obligation  (pending)
        │
        ├─ [OR-05] fresh N5 reauthorization?  ─ refused → terminated: authorization_withdrawn
        ├─ destination still eligible?        ─ no      → terminated: destination_disabled
        ├─ egress kill switch clear?          ─ no      → SUPPRESSED (no attempt consumed)
        ├─ schema version accepted by destination?      → no obligation was created in the first place
        │
        ▼
   adapter attempt  ── B3, irreversible ──►  counterparty
        │
        ├─ accepted        → obligation terminal: accepted
        ├─ retryable       → attempt recorded, backoff, same obligation
        └─ terminal        → obligation terminal: failed_terminal
```

The obligation is created **from a committed inbox row**, never from an artifact alone. An artifact
without an inbox row was authorized but not internally delivered, and N7 has no business with it.

## 2. Proposed tables

Four were proposed. **Five shipped** — `OR-05` Option C added `network_external_transport_permits`,
documented in `N7_OWNER_RULINGS.md` and in migration 0035 §7. Each is challenged below rather than
assumed: state proliferation is its own risk, and each earns its place by holding a fact nothing
else can hold.

### 2.1 `network_transport_destinations`

| Aspect                     | Proposal                                                                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose                    | The governed identity of an external place data may go.                                                                                                                 |
| PK                         | `destination_id uuid`                                                                                                                                                   |
| Immutable identity         | `recipient_participant_id`, `recipient_participant_type` (GENERATED `'organization'` STORED), `destination_kind`, `transport_adapter`, `endpoint_ref`, `credential_ref` |
| Mutable operational config | **none** — see below                                                                                                                                                    |
| FKs                        | `(recipient_participant_id, recipient_participant_type) → network_participants (id, participant_type)`                                                                  |
| Unique                     | `(destination_id, recipient_participant_id)` — the key the obligation binds against                                                                                     |
| Audit                      | `created_at`, `created_by`                                                                                                                                              |
| Immutability               | append-only: no UPDATE, no DELETE (triggers, as 0034 does)                                                                                                              |
| RLS                        | recipient's tenant reads; destination-admin principal inserts under an explicit permission; transport worker reads                                                      |
| Retention                  | see §8                                                                                                                                                                  |

**Why nothing is mutable.** An endpoint that can be `UPDATE`d makes "where did artifact X actually
go" unanswerable from the row — you would need the row's history, which append-only tables exist to
avoid needing. Changing a destination is: create new, revoke old. This costs an extra row and buys a
straight answer.

**`endpoint_ref` is not necessarily a URL column.** Whether the endpoint is stored inline (a URL
string, validated at admission) or as a reference into configuration is owner ruling `OR-06`'s
second half. Inline is simpler and keeps the audit self-contained; a reference keeps a customer
hostname out of the database. Either way it is **immutable** and **never a runtime argument**.

**`credential_ref` is a reference, never a secret.** A `CHECK` refuses anything shaped like credential
material, mirroring the constraint `service_account_credentials` already carries.

### 2.2 `network_transport_destination_revocations`

| Aspect       | Proposal                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Purpose      | That a destination was deactivated, and when, and why.                                                                    |
| PK           | `revocation_id uuid`                                                                                                      |
| FK / Unique  | `destination_id` **UNIQUE** → destinations — at most one effective revocation, N6's subscription-revocation shape exactly |
| Fields       | `reason`, `revoked_at`, `revoked_by`                                                                                      |
| Immutability | append-only                                                                                                               |

Eligibility is therefore **derived**: a destination is eligible iff no revocation row exists (and any
effective window is current). There is no `enabled boolean`. A flag that can be set back to true is a
pause with an audit gap — N6's words, and they apply unchanged.

### 2.3 `network_external_transports`

The obligation. One row per `(artifact, destination)` pair that must leave.

| Aspect       | Proposal                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| PK           | `transport_id uuid`                                                                                                          |
| Binding      | `artifact_id`, `destination_id`, **`recipient_participant_id` written once**                                                 |
| FK 1         | `(artifact_id, recipient_participant_id) → network_disclosure_artifacts (artifact_id, recipient_participant_id)`             |
| FK 2         | `(destination_id, recipient_participant_id) → network_transport_destinations (destination_id, recipient_participant_id)`     |
| FK 3         | `inbox_id → network_disclosure_inbox (inbox_id)` — the obligation's origin fact                                              |
| Unique       | `(artifact_id, destination_id)` — one obligation per artifact per destination; the **idempotency identity**                  |
| State        | `pending`, `failed_retryable`, `accepted`, `terminated_failed`, `terminated_unauthorized`, `terminated_destination_disabled` |
| Lifecycle    | `attempt_count`, `next_attempt_at`, `record_version`, `created_at`, `accepted_at`, `terminated_at`, `terminal_reason`        |
| Immutability | identity columns immutable by trigger; only lifecycle columns move; no DELETE, no TRUNCATE                                   |

**The load-bearing detail.** `recipient_participant_id` appears **once** and both composite keys
resolve against it. "The artifact's recipient equals the destination's recipient" is the shape of the
row, not a rule someone has to remember. This is R-08 and R-11 applied before they can happen again.

Both composite FKs need exact-order supporting indexes — **F-20**, which is schema-wide and will fail
CI if forgotten.

**No independently supplied event, subscription, payload or digest.** All are reachable from
`artifact_id`. Any denormalized copy must be `DATABASE-BOUND` by a further composite key (and the
matching UNIQUE on the artifact side), or it is `INVALID DESIGN`.

### 2.4 `network_external_transport_attempts`

| Aspect       | Proposal                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Purpose      | That an external attempt happened, and how it went.                                                                                |
| PK           | `attempt_id uuid`                                                                                                                  |
| FK           | `transport_id → network_external_transports`                                                                                       |
| Unique       | `(transport_id, attempt_number)`                                                                                                   |
| Fields       | attempt number, adapter, started/completed, outcome (closed taxonomy), status category, remote request id, latency ms, retry-after |
| Prohibited   | payload copy, canonical bytes, request headers, credentials, arbitrary response body                                               |
| Immutability | append-only                                                                                                                        |

Same shape and same prohibitions as `network_delivery_attempts`, for the same reason: an attempt row
is metadata, and a payload copy here would be a second governed-by-nothing copy of disclosed content.

### 2.5 Tables deliberately NOT proposed

| Rejected                                                   | Why                                                                                                                                                                                            |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `network_transport_endpoints` (separate from destinations) | Splits one immutable identity across two rows and invites them to disagree. The R-07 shape.                                                                                                    |
| `network_transport_queue`                                  | The obligation table with a `next_attempt_at` index **is** the queue. A second one would need to agree with the first.                                                                         |
| `network_transport_replay`                                 | Replay is deferred. No table for an unauthorized capability.                                                                                                                                   |
| `network_transport_secrets`                                | Secrets are referenced, never stored.                                                                                                                                                          |
| A `destinations.enabled` column                            | Revocation is a row.                                                                                                                                                                           |
| An `egress_permit` table                                   | Only if `OR-05` Option C is chosen — proposed there, not here. **Option C was ruled, so this table SHIPPED** as `network_external_transport_permits`; the N7 surface is five tables, not four. |

## 3. Duplicated-identity review

Required by ADR-N0018. Every value that appears in more than one place in the N7 surface:

| #    | Duplicated identity        | Appears in                        | Class                     | Enforcement                                                                                                                         |
| ---- | -------------------------- | --------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| D-1  | recipient participant      | artifact, destination, obligation | `DATABASE-BOUND`          | one column, two composite FKs                                                                                                       |
| D-2  | participant type           | artifact, destination, inbox      | `DERIVED`                 | `GENERATED ALWAYS AS ('organization') STORED`                                                                                       |
| D-3  | artifact ↔ obligation      | obligation                        | `DATABASE-BOUND`          | composite FK 1                                                                                                                      |
| D-4  | destination ↔ obligation   | obligation                        | `DATABASE-BOUND`          | composite FK 2                                                                                                                      |
| D-5  | inbox row ↔ obligation     | obligation                        | `DATABASE-BOUND`          | FK 3                                                                                                                                |
| D-6  | event id                   | artifact only                     | `DERIVED`                 | never stored on the obligation                                                                                                      |
| D-7  | subscription id            | artifact only                     | `DERIVED`                 | never stored on the obligation                                                                                                      |
| D-8  | payload bytes              | artifact only                     | `DERIVED`                 | obligation stores none                                                                                                              |
| D-9  | payload digest             | artifact; envelope on the wire    | `CRYPTOGRAPHICALLY-BOUND` | digest recomputed over the exact bytes sent, immediately before send                                                                |
| D-10 | idempotency identity       | obligation; wire envelope         | `DERIVED`                 | deterministic function of `transport_id`; never regenerated                                                                         |
| D-11 | endpoint                   | destination only                  | `DERIVED`                 | worker resolves from `destination_id`; no runtime argument                                                                          |
| D-12 | credential                 | secret manager only               | `DERIVED`                 | destination stores a reference                                                                                                      |
| D-13 | adapter identity           | destination; attempt row          | `RUNTIME-ASSERTED`        | attempt writer reads it from the destination it acted on; asserted equal before insert                                              |
| D-14 | artifact ↔ adapter request | in-memory request object          | `RUNTIME-ASSERTED`        | request constructed only from a persisted obligation; digest re-verified pre-send (R-11 ordering: checked before any other refusal) |

**No `INVALID DESIGN` entries.** D-13 and D-14 are the only `RUNTIME-ASSERTED` items, and both carry
R-11's ordering obligation — the assertion runs before any refusal that could mask it, and yields its
own distinguishable outcome rather than a generic failure.

## 4. Constraints and indexes (proposed)

```
destinations
  PK (destination_id)
  UNIQUE (destination_id, recipient_participant_id)          ← obligation binds here
  FK (recipient_participant_id, recipient_participant_type) → network_participants
  INDEX (recipient_participant_id, recipient_participant_type)   F-20
  CHECK credential_ref is a reference, not credential material

destination_revocations
  PK (revocation_id)
  UNIQUE (destination_id)  FK → destinations

external_transports
  PK (transport_id)
  UNIQUE (artifact_id, destination_id)                       ← idempotency identity
  FK (artifact_id, recipient_participant_id)   → artifacts
  FK (destination_id, recipient_participant_id) → destinations
  FK (inbox_id) → inbox
  INDEX (artifact_id, recipient_participant_id)              F-20
  INDEX (destination_id, recipient_participant_id)           F-20
  INDEX (state, next_attempt_at) WHERE state IN ('pending','failed_retryable')
  CHECK terminal states carry a timestamp and a reason

external_transport_attempts
  PK (attempt_id)
  UNIQUE (transport_id, attempt_number)
  FK (transport_id) → external_transports
  CHECK outcome ∈ closed taxonomy
```

Requires one new UNIQUE on the N6 side **only if** a denormalized digest is kept:
`network_disclosure_artifacts UNIQUE (artifact_id, payload_digest)`. If the digest is derived by
join, no N6 change is needed at all — which is the preferred outcome, since it keeps N7 additive.

## 5. Adapter interface (conceptual — no implementation)

```
INPUT   immutable TransportRequest, constructed only from a persisted obligation:
          transport_id, adapter, endpoint (resolved from destination),
          credential handle (opaque; never the secret),
          envelope, authorized payload bytes, idempotency identity, deadline

OUTPUT  closed result: outcome ∈ taxonomy, status category, remote request id,
          latency, retry-after, optional allowlisted acknowledgement fields
```

The adapter receives **no database handle**, no authorization state, and no ability to decide
eligibility. It cannot read an artifact, cannot resolve a destination, and cannot write a row. It
turns an immutable request into a classified result — that is its whole job, and the narrowness is
what makes the egress allowlist meaningful.

Timeouts: connect, response, and a **whole-attempt deadline** that bounds the entire operation
including DNS. A per-request timeout does not bound a request that keeps making slow progress —
carried forward deliberately.

## 6. First adapter — analysis and recommendation

|                     | HTTPS webhook                            | Managed queue                    | Email                | EDI/API-specific |
| ------------------- | ---------------------------------------- | -------------------------------- | -------------------- | ---------------- |
| Security surface    | **high** (SSRF)                          | low                              | medium               | medium           |
| Protocol complexity | low                                      | medium                           | high (MIME, bounces) | **high**         |
| Idempotency         | key honoured only if receiver cooperates | native dedup, usually            | none                 | varies           |
| Ack semantics       | ambiguous (2xx ≠ processed)              | broker ack ≠ consumer processing | delivery ≠ read      | often explicit   |
| Secret management   | token/HMAC/mTLS                          | vendor IAM                       | SMTP creds           | varies           |
| SSRF risk           | **the whole problem**                    | none                             | none                 | low              |
| Observability       | good                                     | good                             | poor                 | varies           |
| Testability         | **excellent** (local fake receiver)      | needs emulator                   | poor                 | needs partner    |
| Vendor coupling     | **none**                                 | high                             | medium               | very high        |

**Recommendation: generic HTTPS webhook**, with a hard prerequisite.

It is the only candidate with zero vendor coupling and excellent local testability, and it is what
counterparties actually ask for. It also carries the entire SSRF surface — which is an argument for
doing it _first_, while the threat model is fresh and the controls are the main body of work, rather
than bolting HTTP onto an architecture shaped around a broker's guarantees.

**Prerequisite, non-negotiable:** the SSRF control set in `N7_THREAT_MODEL.md` §5 lands and passes
its adversarial mutations as a **separately reviewable unit before any adapter code**. If that
sequencing is not acceptable, the honest alternative is a managed queue first — lower risk, but it
defers every hard question rather than answering one.

This is owner ruling `OR-01`.

## 7. Kill switch

Three scopes, all fail-closed:

```
global external transport disable   →  no adapter may send
per-adapter disable                 →  that adapter may not send
per-destination disable             →  distinct from revocation: operational, reversible
```

Requirements: checked **immediately before the network call** (not at selection); a suppression does
**not** consume an attempt; suppression is recorded and counted; each scope independently testable.

`per-destination disable` and destination _revocation_ are deliberately different things — one is an
operator pausing traffic, the other is a governed statement that this destination is finished. Only
the second is append-only and irreversible.

## 8. Retention — decided and undecided

| Class                     | Proposal                                      | Status               |
| ------------------------- | --------------------------------------------- | -------------------- |
| Destination configuration | retain while any transport references it      | **proposed**         |
| Destination revocations   | permanent                                     | **proposed** (audit) |
| Transport obligations     | permanent — the record that a disclosure left | **proposed** (audit) |
| Attempt metadata          | duration **undecided**                        | **OR-12**            |
| Acknowledgement metadata  | with its attempt                              | follows OR-12        |
| Transport audit           | permanent, `AUDIT` class                      | **proposed**         |

Durations are not invented here. `DATA_CLASSIFICATION.md` and the retention policy do not yet supply
numbers for transport attempt metadata, and guessing one would put a fabricated figure into a
governance document. Flagged as `OR-12`.

## 9. Observability

Metrics, all keyed by safe identifiers (`destination_id`, `adapter`, `transport_id`) and **never**
carrying payload:

```
pending obligations (gauge)         attempt latency (histogram)
success / failure rate by outcome   retry counts
terminal failures by reason         authorization-prevented sends
kill-switch suppressions            destination-disabled suppressions
adapter health                      queue depth per destination
```

`authorization-prevented sends` and `kill-switch suppressions` are first-class metrics, not error-log
lines: "we chose not to send" is an operational fact somebody has to be able to see on a dashboard.

## 10. Audit provenance

Every external transport action is attributable machine provenance, per SR-2 doctrine — no fabricated
human actor. Recorded: actor type (`system`), worker identity, destination, artifact, transport,
attempt, result. The actor form follows the existing `system:*` principal shape that N6's fixtures
already use; N7 introduces no new principal grammar.
