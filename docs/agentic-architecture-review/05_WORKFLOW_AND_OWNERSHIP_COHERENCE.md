# 05 — Workflow, WorkUnit and Ownership Coherence

## 1. The WorkUnit model — standard vs contract

`v1.8 03_WORK_UNIT_AND_RESPONSIBILITY_MODEL.md` is 17 lines. It is correct as far as it goes and it
is contradicted by its own contract.

**The standard (`:5`)** names 17 required fields: work-unit ID, tenant/legal plane, job/version,
subject refs, current owner, contributors, state, **priority**, deadline, **authoritative
context**, artifact refs, approvals, exceptions, **idempotency scope**, evidence, and **completion
criteria**.

**The standard (`:9`)** gives an ownership lifecycle:

```text
UNASSIGNED → OWNED → HANDOFF_PENDING → OWNED_BY_NEXT → COMPLETE
```

**The standard (`:11`)** gives the central invariant: "No active work may have zero accountable
owners beyond routing SLA or two accountable owners simultaneously."

**The standard (`:13-17`)** gives a RACI rule: exactly one accountable job/human role, executing
components, consulted jobs, authorized observers.

**The contract** (`contracts/work_unit.schema.json`, 81 lines) required fields: `workUnitId`,
`tenantId`, `jobType`, `jobVersion`, `subjectRefs`, `state`, `currentOwner`, `createdAt`,
`deadline`. Optional: `legalPlane`, `contributors`, `artifactRefs`, `approvalRefs`,
`exceptionRefs`, `evidenceRefs`.

### 1.1 The four missing required fields — CONFLICT

| Standard `:5` requires | In the contract? |
| ---------------------- | ---------------- |
| priority               | **no**           |
| authoritative context  | **no**           |
| idempotency scope      | **no**           |
| completion criteria    | **no**           |

A v1.8 standard declares four fields required that a v1.8 contract omits. Either the schema is
incomplete or the standard is wrong; nothing in the package resolves it.

`idempotency scope` is the most consequential absence. Every job book asserts "Duplicate delivery
cannot create duplicate business effect," and `06_JOB_CERTIFICATION_AND_EVALUATION.md:11` makes
"duplicate financial/booking effect" a certification-blocking failure. Neither the WorkUnit nor any
of the 91 commands defines an idempotency key or its scope.

### 1.2 `state` has no enum — the load-bearing gap

```json
"state": { "type": "string" }
```

No enum. `03:9` names five states; the contract encodes none of them. `currentOwner` is likewise
`{"type":"string"}` with no constraint tying it to the 76 job slugs or to any principal identity.

**Consequence for §8's orphan-state and duplicate-owner analysis: it is vacuous.** The charter asks
the audit to find every orphan state and every duplicate-owner state in the design. The design
defines no state set to orphan. That is a stronger finding than a list of orphaned states would
have been.

### 1.3 Orphan state, proven

Two contracts must interlock and do not:

- `job_handoff.schema.json` `acceptanceState` enum: `PENDING | ACCEPTED | REJECTED | EXPIRED`
- `03:9` WorkUnit lifecycle: `UNASSIGNED → OWNED → HANDOFF_PENDING → OWNED_BY_NEXT → COMPLETE`

A handoff that reaches `EXPIRED` leaves its WorkUnit in `HANDOFF_PENDING` with no defined
transition. `04_AGENT_INTERACTION_ATLAS.md:19` covers rejection — "If rejected, ownership remains
with the sender until rerouted/escalated" — but says nothing about expiry, and the WorkUnit
lifecycle has no state for it.

The lifecycle also has **no failure or cancellation terminal**. `COMPLETE` is the only terminal
state. A WorkUnit whose work is abandoned, superseded, or terminated by an exception has nowhere to
go. The exception lifecycle in `05_EXCEPTION_OWNERSHIP_STANDARD.md:9` does carry
`CANCELLED | DUPLICATE | UNRESOLVED_ESCALATED`, but no rule maps an exception terminal onto a
WorkUnit terminal.

### 1.4 Duplicate owner is prohibited in prose and unpreventable in contract

`03:11` prohibits two simultaneous accountable owners. All 76 job books repeat "One WorkUnit has
one accountable owner at a time."

Nothing enforces it. `currentOwner` is a single unconstrained string, and nothing prevents two
`JobHandoff` records both reaching `ACCEPTED` against the same `workUnitId`. There is no version,
no optimistic-concurrency token, no ownership-epoch field, and no uniqueness constraint — the
schema has no notion of "the currently accepted handoff."

The merged W0/W1 audit independently identified **8 same-participant duplicate-owner overlaps** in
the design (`docs/workforce-engineering/WORK_UNIT_OWNERSHIP_MAP.md`), applying v1.7's
cross-participant rule so that carrier/broker/shipper tracking twins are correctly _not_ scored as
duplicates. This audit concurs with both the count and the discipline.

### 1.5 Cross-company ownership is unrepresentable

`tenantId` is single-valued. `legalPlane` is an unconstrained string with no enum. There is no
`ownerOrganization`, no `counterpartyOrganization`, no co-ownership construct.

`04_AGENT_INTERACTION_ATLAS.md:21` states the correct rule — "Cross-company interactions terminate
at the FreightOS Network boundary. The receiving participant independently evaluates the incoming
artifact under its own Operational Twin, authority, and workflow." A WorkUnit therefore should
never cross a company boundary; each participant runs its own. That is the right model.

But nothing in the contract expresses it, and the same `JobHandoff` type is used for both internal
and cross-company edges (see [09](09_NETWORK_HANDOFF_AND_EVIDENCE_COHERENCE.md) §4). An engineer
implementing from the contract alone would not know the boundary exists.

### 1.6 The thirteen §8 semantics

| Semantic                    | Specified where                               | Status                                                                                 |
| --------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| WorkUnit                    | `03:3`, `work_unit.schema.json`               | COMPLETE                                                                               |
| accountable owner           | `03:11`, `currentOwner`                       | PARTIAL — named, unconstrained, unenforced                                             |
| contributor                 | `contributors[]`                              | COMPLETE                                                                               |
| ownership transfer          | `04:17`, `job_handoff.schema.json`            | PARTIAL — validation predicate good, no WorkUnit-side transition                       |
| handoff pending             | `03:9` state name; `acceptanceState: PENDING` | PARTIAL — two models, unlinked                                                         |
| accepted / rejected handoff | `acceptanceState`, `rejectionReason`, `04:19` | **COMPLETE** — the best-formed part                                                    |
| deadlines                   | `deadline` required in both contracts         | PARTIAL — field exists, `{"type":"string"}` with no `format`, no value in any job book |
| expiry                      | `acceptanceState: EXPIRED`                    | PARTIAL — terminal exists, no expiry timestamp, no WorkUnit transition                 |
| idempotency scope           | —                                             | **GAP**                                                                                |
| completion criteria         | —                                             | **GAP**                                                                                |
| exceptions                  | `exceptionRefs`, `05_` lifecycle              | PARTIAL                                                                                |
| evidence                    | `evidenceRefs`, `EvidenceEnvelope`            | PARTIAL                                                                                |
| cross-company ownership     | prose only (`04:21`)                          | **GAP** in contract                                                                    |

Two of thirteen are complete, three are gaps, eight are partial.

## 2. The nine traced workflows (§8)

Each trace asks: can ownership be followed end to end, and where does it break?

### Trace 1 — Owner-operator operating day

**Upstream:** v1.5 `05_UNIVERSAL_DISPATCH_ORCHESTRATION.md`, `07_CARRIER_OPERATIONS_ROUTE.md:24-34`
(one-truck fast path). **Simulation:** `01_owner_operator_day.yaml` (4 lines).

Chain from the simulation's own `sequence`: Load Discovery → Profitability → Feasibility → Planning
→ Carrier Negotiation → Dispatch → Tracking → Documentation → Settlement/Reconciliation.

All nine jobs have real commands and real edges. The chain is followable at the level of _which job
comes next_. It breaks at: no WorkUnit state values, no deadline values, no idempotency key on
`assign_driver_equipment`, no defined transition when Planning's output is invalidated by a
capacity change mid-chain (v1.5 `04_:5` "company adaptation" and the simulation's own fault
"readiness change after plan" both point at this and neither specifies the ownership consequence).

**Verdict: DESIGN_PARTIAL.** Best-covered trace in the corpus.

### Trace 2 — Enterprise carrier dispatch

**Upstream:** v1.5 `05_:4` (scale), `12_ENTERPRISE_SCALE_AND_CELL_ARCHITECTURE.md`.
**Simulation:** `02_enterprise_carrier_dispatch.yaml` (3 lines, no `sequence`).

Named faults are the right ones — simultaneous driver unavailability, appointment domino, regional
outage, exception storm — and the acceptance criteria include "unique ownership" and "orchestrator
cannot override feasibility or policy," which is exactly the correct invariant.

Neither is specified anywhere. There is no partition key for ownership at scale (v1.5 `12_:4` names
partition keys as a concept; no contract carries one), no definition of a "region" for the
isolation assertion, and no rule for how the Chief Dispatch Orchestrator's ownership of
"work-queue prioritization" interacts with a specialist's ownership of the WorkUnit it prioritises.

**Verdict: DESIGN_PARTIAL, ownership at scale DESIGN_STUB.**

### Trace 3 — Broker quote-to-settlement

**Upstream:** v1.6, 25 documents, the most complete operational chain in the corpus
(`08_BROKERAGE_OPERATIONS_ROUTE.md:12`: RFQ → quote → commitment → carrier source → qualification →
negotiation → allocation → tender → execution → documents/accessorials → invoice/pay → transaction
record). **Simulation:** `03_broker_quote_to_settlement.yaml` (3 lines).

All 22 brokerage jobs carry real commands and 41 interaction-matrix rows. Ownership is followable
across the whole chain at job level. The chain's own hard problems are named as faults — carrier
authority change before tender, ambiguous acceptance, payment destination change — and none has a
specified ownership consequence.

`money.move` and `bank.change` are `red_actions` in `config/policy/base_policy.yaml`; the brokerage
jobs that would trigger them (`carrier_pay`, `shipper_billing`) declare commands
(`create_carrier_payable`, `record_carrier_payment_status`) that map to no policy action at all
(see [06](06_ACTION_COMMAND_POLICY_VOCABULARY_AUDIT.md)).

**Verdict: DESIGN_PARTIAL.** Note the whole trace is `LEGAL_AND_MARKET_GATED` and
`BROKERAGE_EXECUTION_ENABLED=false`; designing it is permitted, running it is not.

### Trace 4 — Facility origin (outbound / shipping)

**Upstream:** FacilityOS `07_SHIPPING_ORIGIN_OPERATIONS.md` (65 lines), owner named as
Shipping Office Agent (`job_books/facility/shipping_office.md:8`).
**Simulation: none exists.**

The owning job is a stub: placeholder command, zero edges, zero matrix rows. The upstream chapter
exists but was not decomposed.

**Verdict: DESIGN_STUB.** This is one of the two required workflows with no simulation at all.

### Trace 5 — Facility destination (inbound / receiving)

**Upstream:** FacilityOS `08_RECEIVING_DESTINATION_OPERATIONS.md` (75 lines) plus the 213-line
`06_BOL_DOCUMENT_AND_OFFICE_EXCHANGE.md`. **Simulation:** `04_facility_driver_bol_receiving.yaml`
(3 lines).

The simulation's acceptance criteria are the sharpest in the corpus and are exactly right: "BOL
never implies custody, BOL never implies goods receipt, no physical-control command, fallback
reconciles." These restate FacilityOS's own invariants (`facility_graphs.yaml`:
`no_document_implies_custody`, `no_bol_implies_goods_receipt`, `no_physical_control_surface`).

All owning jobs are stubs.

**Verdict: DESIGN_STUB at workforce level, DESIGN_PARTIAL upstream.** The distinction matters for
remediation: the semantics exist in FacilityOS and need decomposing, not inventing.

### Trace 6 — Breakdown / service event

**Upstream:** v1.5 `07_MAINTENANCE_REPAIR_ROADSIDE.md` (118 lines), v1.7 `11_` and `12_:43-56`.
**Simulation:** `05_breakdown_network_exception.yaml` (3 lines, has `sequence`, **no `faults`**).

The named chain crosses four participants: Maintenance Readiness (carrier) → Carrier Exception
(carrier) → Service Intake → Service Eligibility → Service Capacity → Service Appointment/Dispatch
(service provider) → Tracking (carrier) → Facility Coordination.

Its acceptance criteria are correct — "one accountable owner per participant, independent
authority, purpose-limited network disclosure." But the six service-provider jobs in the chain are
all stubs, so ownership becomes untraceable at the participant boundary. This is the trace where
the shipper/service-provider stub cliff does the most damage: the _cross-company exception_ path is
the hardest thing in the architecture and its downstream half has no design.

**Verdict: DESIGN_STUB across the participant boundary.**

### Trace 7 — Direct shipper-to-carrier

**Upstream:** v1.7 `10_:41-48` (legal routing). **Simulation:** `06_shipper_direct_carrier.yaml`
(3 lines) — correctly asserts "shipper-to-carrier legal route preserved, no brokerage authority
implied."

All 12 shipper jobs are stubs. The carrier side is partial. The legal invariant is correct and
important; nothing implements or tests it.

**Verdict: DESIGN_STUB on the shipper side.**

### Trace 8 — Brokered shipper-to-carrier

**Upstream:** v1.7 `12_END_TO_END_NETWORK_WORKFLOW.md:5-29` — a 23-step numbered end-to-end
narrative from "Shipper creates demand" to "RigDesk evaluates next asset mission/readiness."
**Simulation: none exists.**

This is the flagship workflow of the whole product — the brokered road shipment that touches all
five participants. v1.7 narrates it in 23 steps. Simulation `03` is the brokerage department's own
internal chain and names no shipper participant; simulation `06` explicitly excludes the brokered
route.

`12_:31-41` carries the correct communication principle ("broker proposes/tenders; carrier
independently accepts; facility independently admits/schedules; service provider independently
accepts work. No central model impersonates every company"). `12_:58-61` gives the evidence chain.
Neither is turned into ownership transitions or an executable scenario.

**Verdict: DESIGN_PARTIAL upstream (a real narrative exists), DESIGN_STUB downstream (no
simulation, no ownership model, half the participating jobs are stubs).**

### Trace 9 — Cross-tenant adversarial

**Upstream:** v1.3 tenant isolation, ADR-N0011, N5-A/N5-B disclosure.
**Simulation:** `07_cross_tenant_adversarial.yaml`, in full:

```yaml
name: cross_tenant_adversarial
faults:
  [
    request another customer's rate,
    prompt injection document,
    stale approval reuse,
    duplicate result,
  ]
acceptance: [all unauthorized attempts denied, no confidential leakage, evidence reconstructable]
```

The four faults are well chosen and the three acceptance criteria are the right ones. There is no
initial state, no participants, no tenants, no attack path, no oracle.

The underlying platform controls, by contrast, are genuinely strong and implemented: structural RLS
tenant isolation, ADR-N0011's prohibition on deriving tenant from organization, N5-A default-deny
named grants with JSON-Pointer field allowlists, and the N5-B sensitivity ceiling a grantor cannot
override.

**Verdict: DESIGN_STUB at workforce level; the platform invariants it would test are
DESIGN_COMPLETE and IMPLEMENTED.** The gap is the test, not the control.

### 2.1 Trace summary

| #   | Workflow                         | Upstream design             | Workforce design | Simulation  |
| --- | -------------------------------- | --------------------------- | ---------------- | ----------- |
| 1   | Owner-operator day               | PARTIAL                     | PARTIAL          | 4-line stub |
| 2   | Enterprise carrier dispatch      | PARTIAL                     | PARTIAL          | 3-line stub |
| 3   | Broker quote-to-settlement       | **COMPLETE**                | PARTIAL          | 3-line stub |
| 4   | Facility origin / outbound       | PARTIAL                     | **STUB**         | **none**    |
| 5   | Facility destination / receiving | PARTIAL                     | **STUB**         | 3-line stub |
| 6   | Breakdown / service event        | PARTIAL                     | **STUB**         | 3-line stub |
| 7   | Direct shipper-to-carrier        | STUB                        | **STUB**         | 3-line stub |
| 8   | Brokered shipper-to-carrier      | PARTIAL (23-step narrative) | **STUB**         | **none**    |
| 9   | Cross-tenant adversarial         | COMPLETE (platform)         | **STUB**         | 3-line stub |

## 3. Workflow-graph semantics across packages

Compared in [02](02_CROSS_PACKAGE_CONTRACT_MATRIX.md) §4. For ownership specifically:

`v1.5 workflow_definition.schema.json` requires `nodes`, `edges`, `terminalStates` and
`sideEffectNodes` — the four things an ownership model needs. **No graph instance in any package
supplies them.** All three YAMLs express graphs as stage-name lists.

`sideEffectNodes` is the critical one: it is the field that would tell an implementation which
nodes need idempotency, reconciliation and policy evaluation. It is required by the contract and
supplied by nothing.

v1.5 `04_ADAPTIVE_WORKFLOW_GRAPH_RUNTIME.md` (176 lines) is the strongest workflow chapter in the
corpus — it has sections on durable execution, exactly-once business effect, deadlines, graph
introspection and graph mutation tests. Its invariant `every_external_write_is_idempotent` +
`every_external_write_is_reconciled` is correct doctrine. It does not descend to a key, a scope or
a reconciliation procedure.

## 4. Status

| Area                                    | Architecture status | Design status                                                                                      |
| --------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| WorkUnit construct                      | PARTIAL             | DESIGN_PARTIAL                                                                                     |
| WorkUnit state machine                  | **GAP**             | **DESIGN_STUB** (5 states named in prose, no enum, no transitions, no guards, no failure terminal) |
| Accountable owner                       | PARTIAL             | DESIGN_PARTIAL                                                                                     |
| Ownership transfer / handoff acceptance | PARTIAL             | DESIGN_PARTIAL (acceptance states COMPLETE)                                                        |
| Handoff expiry → WorkUnit transition    | **GAP**             | DESIGN_STUB (orphan state proven)                                                                  |
| Duplicate-owner prevention              | **CONFLICT**        | DESIGN_STUB (prohibited in prose, unrepresentable in contract)                                     |
| Idempotency scope                       | **GAP**             | **DESIGN_STUB**                                                                                    |
| Completion criteria                     | **GAP**             | **DESIGN_STUB**                                                                                    |
| Deadlines                               | PARTIAL             | DESIGN_PARTIAL (field present, no values anywhere)                                                 |
| Cross-company ownership                 | **GAP** in contract | DESIGN_PARTIAL (doctrine correct at `04:21`)                                                       |
| WorkUnit standard vs WorkUnit contract  | **CONFLICT**        | —                                                                                                  |
| Workflow graph contract                 | COMPLETE            | DESIGN_COMPLETE                                                                                    |
| Workflow graph instances                | PARTIAL             | DESIGN_PARTIAL (0 of 3 conform)                                                                    |
| Nine traced workflows                   | —                   | 3 PARTIAL, 6 STUB, 2 with no simulation at all                                                     |

Implementation status throughout: `IMPLEMENTATION_ABSENT`. `grep` for
`WorkUnit|work_unit|job_handoff|handoffId` across `packages/`, `schemas/` and `db/` returns zero
hits.
