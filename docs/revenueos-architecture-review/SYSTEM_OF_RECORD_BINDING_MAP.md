# System-of-Record Binding Map

Can the repository represent explicit authority bindings per fact and domain — so that a system
holding a _copy_ of data does not thereby become _authoritative_ for it, and so that no split-brain
truth arises between FreightOS and a customer's TMS/WMS/ERP?

## 1. Verdict

**The design answers the question correctly and the repository cannot yet express the answer.**
Authority binding is the single most important Twin concept, and it has zero runtime representation.

## 2. The six authority modes, as designed

`matrices/SYSTEM_AUTHORITY_AND_SYNC_MATRIX.csv` — a well-formed artifact:

| Mode                            | May update Twin                           | May write external                                              | Conflict default                                          |
| ------------------------------- | ----------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------- |
| `EXTERNAL_AUTHORITATIVE`        | yes, after authenticated mapped sync      | only if external contract permits **and** command is authorized | external wins, or **HOLD if ambiguous**                   |
| `FREIGHTOS_AUTHORITATIVE`       | yes                                       | yes, through governed adapter when authorized                   | FreightOS current version wins, subject to reconciliation |
| `CUSTOMER_CONFIG_AUTHORITATIVE` | yes, by controlled config change          | only if a separate integration projection is approved           | approved config version wins                              |
| `NETWORK_ASSERTED`              | **only under local verification/binding** | **no direct write authority**                                   | local evaluation / HOLD                                   |
| `DERIVED`                       | yes, with lineage                         | **not by itself**                                               | recompute/invalidate on source change                     |
| `HUMAN_ASSERTED`                | according to verification policy          | **not by itself**                                               | verification / customer policy                            |

Three properties are exactly right:

- **A copy is not authority.** `NETWORK_ASSERTED` may update the Twin _only under local
  verification_, and holds **no direct write authority** — a counterparty asserting a fact does not
  make it true locally.
- **Derived facts cannot write.** `DERIVED` is "not by itself" for external writes and must
  _recompute/invalidate on source change_.
- **Ambiguity halts.** Two modes default to HOLD rather than picking a winner.

The intended target mapping (load master → TMS; driver GPS → telematics; HOS → ELD; dispatch policy
→ approved Twin config; profitability → FreightOS derived; facility readiness → network assertion)
is expressible in this vocabulary without strain.

## 3. What the repository can represent today

| Requirement                                  | Status                  | Evidence                                                                                                                   |
| -------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Source identity                              | **PARTIAL**             | `source_system` column on `network_participant_aliases` (`0028`); no source registry                                       |
| External identifier → canonical mapping      | **PARTIAL**             | `network_participant_aliases` — namespace, value, participant, effective dating. **Participants only, not business facts** |
| Mapping verification state                   | **YES**                 | `app.network_alias_verification_status`                                                                                    |
| Mapping revocation                           | **YES**                 | `revoked_at`, `revoked_by`                                                                                                 |
| Mapping version                              | **PARTIAL**             | `record_version` + effective dating; no adapter mapping version                                                            |
| **Authority per fact/domain**                | **NO**                  | `fact-authority-binding.schema.json` is design only; no table, no enum                                                     |
| Ordering / version semantics on inbound sync | **NO**                  | —                                                                                                                          |
| Duplicate suppression / idempotent sync      | **NO**                  | `network_transport_intents` (`0030`) is idempotent, but for network transport, not system sync                             |
| Freshness / staleness                        | **NO**                  | —                                                                                                                          |
| Conflict state                               | **NO**                  | TWIN-G10 is a design graph                                                                                                 |
| Write-back                                   | **NO**                  | no adapter; egress zero                                                                                                    |
| Loop prevention (echo)                       | **NO**                  | —                                                                                                                          |
| Degraded mode / recovery                     | **NO**                  | TWIN-G11 is a design graph                                                                                                 |
| `OUTCOME_UNKNOWN`                            | **NO**                  | conflict C-13                                                                                                              |
| Legal authority class                        | **YES, different axis** | `app.legal_authority_class`, `app.operating_context` (`0010`, `0022`) govern _who may act_, not _which system owns a fact_ |

**The most important distinction:** `app.legal_authority_class` is **not** a fact-authority binding.
It answers "may this actor operate in this context", not "is the TMS or FreightOS authoritative for
this load's pickup appointment". Reusing it for fact authority would conflate two axes and is
explicitly not recommended.

## 4. Gaps

### SR-01 — No fact-authority binding exists _(blocking)_

There is no table, enum, or column expressing which system owns which fact. TW-03 scores
NOT_IMPLEMENTED. Everything else in this document depends on it.

### SR-02 — Alias mapping covers participants, not facts

`network_participant_aliases` is a good model — namespace, verification, effective dating,
`source_system`, revocation — and it maps **participant identities only**. A Twin needs the same
shape for loads, shipments, appointments, drivers, equipment and invoices. **Required change:**
generalize the alias pattern to a fact-level external-identity map rather than inventing a new one.
TW-04 scores PARTIAL on the participant-level precedent.

### SR-03 — No ordering, versioning, or echo suppression on inbound sync

TW-06, TW-07 and TW-08 all score NOT_IMPLEMENTED. Echo suppression (TW-08) is the subtle one: a
FreightOS write to a TMS that returns as an inbound sync must not be re-applied as an external
assertion, or the two systems will oscillate. Nothing addresses this, and TWIN-G02
(`TwinSyncWorkUnit`) has no echo-suppression node.

### SR-04 — Conflict default is `HOLD`, which is undefined

Two of six authority modes resolve ambiguity to **HOLD**. `HOLD` is declared terminal in all 36
graphs and defined as a node in none — no owner, no timeout, no exit. **The Twin's primary
conflict-resolution mechanism terminates in an ownerless state.** This is where defect G-2 has its
sharpest consequence: a split-brain fact between a customer's TMS and FreightOS would sit in `HOLD`
with nobody accountable for resolving it. Conflict **C-14**.

### SR-05 — Adapters exist as schemas only, with a fork risk

`schemas/modal-adapter.schema.json`, `facility-adapter.schema.json`,
`autonomous-vehicle-adapter.schema.json` exist; zero adapter code. Section 8 requires that adapters
translate into canonical FreightOS semantics and **not fork business logic per vendor**. Nothing
enforces that today, and it is the failure mode that makes integration layers unmaintainable.
**Required change:** an adapter conformance test proving vendor adapters produce canonical artifacts
with no vendor-specific branching in domain logic.

### SR-06 — No mapping conformance or version registry

TW-33 requires explicit adapter mapping/version/conformance. Nothing exists. This also blocks the
Promise Firewall claim class "integration supported" (PF-03).

## 5. Split-brain risk assessment

| Fact domain        | Intended authority                            | Expressible today                         | Split-brain risk if built without SR-01   |
| ------------------ | --------------------------------------------- | ----------------------------------------- | ----------------------------------------- |
| Load master        | TMS (`EXTERNAL_AUTHORITATIVE`)                | **no**                                    | **high** — both systems accept edits      |
| Driver GPS         | telematics (`EXTERNAL_AUTHORITATIVE`)         | **no**                                    | medium — read-mostly                      |
| HOS                | ELD (`EXTERNAL_AUTHORITATIVE`)                | **no**                                    | **high** — safety and legal consequence   |
| Dispatch policy    | Twin config (`CUSTOMER_CONFIG_AUTHORITATIVE`) | **no**                                    | medium                                    |
| Profitability      | FreightOS (`DERIVED`)                         | **no**                                    | low — derived, no external write          |
| Facility readiness | network (`NETWORK_ASSERTED`)                  | **partial** — disclosure machinery exists | low — no direct write authority by design |
| Appointment        | contested (WMS vs network)                    | **no**                                    | **high** — two writers, no arbiter        |

The three high-risk domains all involve an external system that legitimately writes and a FreightOS
plane that wants to. Without SR-01 they cannot be arbitrated, and SR-04 means the arbitration state
has no owner.

## 6. Required changes

1. Implement fact-authority binding as a first-class table with the six modes (**SR-01**, blocking).
2. Generalize `network_participant_aliases` to fact-level external identity (**SR-02**).
3. Ordering, versioning and echo suppression on inbound sync (**SR-03**, blocking before any write-back).
4. Define and own `HOLD` before it becomes the conflict arbiter (**SR-04 / C-14**, blocking).
5. Adapter conformance test forbidding per-vendor business-logic forks (**SR-05**).
