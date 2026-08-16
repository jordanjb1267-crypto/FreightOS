# 11 — Simulation and End-to-End Coverage

## 1. The corpus

Seven files. **22 lines in total.**

| File                                    | Lines | Bytes | Keys present                                                    |
| --------------------------------------- | ----- | ----- | --------------------------------------------------------------- |
| `01_owner_operator_day.yaml`            | 4     | 413   | `name`, `sequence` (9 jobs), `faults` (4), `acceptance` (4)     |
| `02_enterprise_carrier_dispatch.yaml`   | 3     | 234   | `name`, `faults` (4), `acceptance` (3)                          |
| `03_broker_quote_to_settlement.yaml`    | 3     | 285   | `name`, `faults` (4), `acceptance` (4)                          |
| `04_facility_driver_bol_receiving.yaml` | 3     | 238   | `name`, `faults` (4), `acceptance` (4)                          |
| `05_breakdown_network_exception.yaml`   | 3     | —     | `name`, `sequence` (8 jobs), `acceptance` (3) — **no `faults`** |
| `06_shipper_direct_carrier.yaml`        | 3     | —     | `name`, `faults` (2), `acceptance` (2)                          |
| `07_cross_tenant_adversarial.yaml`      | 3     | —     | `name`, `faults` (4), `acceptance` (3)                          |

The whole of simulation 07, verbatim:

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

There is no common schema. Five files have `faults` and no `sequence`; one has `sequence` and no
`faults`; one has both. No single runner could consume all seven.

## 2. The twenty required elements

§14 defines a simulation as DESIGN_COMPLETE only if it specifies all twenty. Measured across all
seven:

| #   | Required element                               | 01                       | 02      | 03      | 04      | 05      | 06      | 07      |
| --- | ---------------------------------------------- | ------------------------ | ------- | ------- | ------- | ------- | ------- | ------- |
| 1   | initial state                                  | –                        | –       | –       | –       | –       | –       | –       |
| 2   | participants                                   | partial (via `sequence`) | –       | –       | –       | partial | –       | –       |
| 3   | Twins / config                                 | –                        | –       | –       | –       | –       | –       | –       |
| 4   | WorkUnits                                      | –                        | –       | –       | –       | –       | –       | –       |
| 5   | inputs                                         | –                        | –       | –       | –       | –       | –       | –       |
| 6   | event sequence                                 | partial                  | –       | –       | –       | partial | –       | –       |
| 7   | ownership transitions                          | –                        | –       | –       | –       | –       | –       | –       |
| 8   | handoffs                                       | –                        | –       | –       | –       | –       | –       | –       |
| 9   | commands                                       | –                        | –       | –       | –       | –       | –       | –       |
| 10  | policy decisions                               | –                        | –       | –       | –       | –       | –       | –       |
| 11  | approvals                                      | –                        | –       | –       | –       | –       | –       | –       |
| 12  | faults                                         | ✓                        | ✓       | ✓       | ✓       | **–**   | ✓       | ✓       |
| 13  | timeouts                                       | –                        | –       | –       | –       | –       | –       | –       |
| 14  | retries                                        | –                        | –       | –       | –       | –       | –       | –       |
| 15  | crash points                                   | –                        | –       | –       | –       | –       | –       | –       |
| 16  | adversarial inputs                             | –                        | –       | –       | –       | –       | –       | partial |
| 17  | expected evidence                              | –                        | –       | –       | –       | –       | –       | –       |
| 18  | forbidden outcomes                             | partial (`acceptance`)   | partial | partial | partial | partial | partial | partial |
| 19  | deterministic pass/fail oracle                 | –                        | –       | –       | –       | –       | –       | –       |
| 20  | business semantics an engineer need not invent | –                        | –       | –       | –       | –       | –       | –       |

**Best case: 3 of 20 fully or partially present (simulation 01). Worst: 2 of 20.**

Every one of the seven is `DESIGN_STUB`. None is executable as a deterministic test. An engineer
handed any of these would have to invent the initial state, the participants, the Twin
configuration, the WorkUnits, every input, the event ordering, every ownership transition, every
command, every policy decision and approval, all timing, all crash points, the expected evidence
and the oracle — that is, everything except a name, a fault list and an acceptance sentence.

## 3. What the simulations get right

They are not worthless, and the audit should say why.

The **fault selections are well chosen**. `03`'s "carrier authority change before tender" and
"payment destination change" are the two most dangerous events in a brokerage lifecycle. `01`'s
"readiness change after plan" is the canonical carrier replanning trigger. `07`'s four adversarial
inputs are the right four.

The **acceptance criteria state real invariants**, several of which are the sharpest sentences in
v1.8:

- `04`: "BOL never implies custody, BOL never implies goods receipt, no physical-control command,
  fallback reconciles" — restates FacilityOS's own `no_document_implies_custody`,
  `no_bol_implies_goods_receipt`, `no_physical_control_surface` invariants
- `02`: "orchestrator cannot override feasibility or policy"
- `03`: "no plane leakage, unqualified carrier never tendered, money deterministic"
- `06`: "shipper-to-carrier legal route preserved, no brokerage authority implied"
- `05`: "one accountable owner per participant, independent authority, purpose-limited network
  disclosure"

These are correct and non-obvious. They are the seed of good simulations. They are not simulations.

## 4. Coverage of the nine required workflows

| #   | Required workflow                          | Simulation | Status     |
| --- | ------------------------------------------ | ---------- | ---------- |
| 1   | owner-operator operating day               | `01`       | stub       |
| 2   | enterprise carrier dispatch                | `02`       | stub       |
| 3   | broker quote-to-settlement                 | `03`       | stub       |
| 4   | **facility origin (outbound / shipping)**  | **none**   | **ABSENT** |
| 5   | facility destination (inbound / receiving) | `04`       | stub       |
| 6   | breakdown / service event                  | `05`       | stub       |
| 7   | direct shipper-to-carrier                  | `06`       | stub       |
| 8   | **brokered shipper-to-carrier**            | **none**   | **ABSENT** |
| 9   | cross-tenant adversarial                   | `07`       | stub       |

**Seven of nine map to a stub; two map to nothing at all.**

`04` is inbound-only — its faults are "duplicate BOL, ambiguous shipment match, partial receipt,
YMS outage" and its acceptance is "BOL never implies goods receipt." No outbound term appears. The
outbound business outcome is defined at `job_books/facility/shipping_office.md:8` ("outbound
shipping-office queue from pickup readiness through document acceptance, loading evidence and
release prerequisites") and no simulation exercises it.

`03` is the brokerage department's own internal chain and names no shipper participant or shipper
job. `06` explicitly excludes the brokered route ("no brokerage authority implied"). So the
**flagship end-to-end workflow of the entire product** — the brokered road shipment that v1.7
`12_:5-29` narrates in 23 steps across all five participants — has no simulation.

### 4.1 The gate set cannot cover nine workflows

`12_WORKFORCE_ACCEPTANCE_GATES.md:31-37` defines exactly seven simulation gates: WF-29 carrier,
WF-30 brokerage, WF-31 facility (**singular**), WF-32 shipper, WF-33 service, WF-34
cross-participant, WF-35 cross-tenant.

That structure is **department-shaped, not workflow-shaped.** There is no gate slot for facility
outbound and none for the brokered shipper path. Adding two simulation files would not fix it —
the gate set would still be seven department gates.

This is a structural finding, not a content one: passing WF-31 on the receiving scenario would
license a facility autonomy claim that the outbound workflow has never been simulated to support,
including the physical-control prohibition WF-31 is named for.

## 5. The standard does not say what a simulation is

`08_END_TO_END_WORKFORCE_SIMULATION_STANDARD.md` is 17 lines. It is genuinely useful on **what** must
be verified — ten mandatory verifications at `:6-15`: handoff acceptance/rejection, unique
ownership continuity, cross-job deadlines, duplicates/out-of-order events, partial external side
effects, participant/network boundaries, human approvals, exception transfer, crash recovery, final
evidence reconstruction. `:3` and `:17` carry two correct normative rules ("A department is not
certified merely because individual jobs pass isolated tests"; "A workflow cannot be marketed as
autonomous until its complete workforce simulation passes at the claimed autonomy level").

It says nothing about **how** a simulation is expressed: no schema, no key set, no fixture format,
no oracle semantics, no definition of "passes" at `:17`, no evidence-record shape for `:15`.

That silence is the direct upstream cause of the corpus's inconsistency. With no required key set,
`05` has `sequence` and no `faults` while five others have `faults` and no `sequence`.

## 6. Standard vs artifacts — three contradictions

**(a) Crash recovery is mandatory and absent everywhere.** `08:14` makes crash recovery a mandatory
verification. No simulation specifies a crash point, a restart, or a partial-write boundary. Since
`06_JOB_CERTIFICATION_AND_EVALUATION.md:11` makes "duplicate financial/booking effect" a
certification-blocking failure, and crash-before/crash-after coverage is the control that prevents
it, all seven artifacts are non-conformant to their own standard on the verification that matters
most.

**(b) Prompt injection is gated and untested where it matters.**
`12_WORKFORCE_ACCEPTANCE_GATES.md:24` (WF-22) requires prompt-injection tests "where untrusted
content exists." `04` is the corpus's only document-ingestion scenario — its subject is an inbound
BOL — and specifies no injection case. Only `07` mentions prompt injection, as the two-word label
"prompt injection document". An injection that induces a physical-control command is exactly the
attack `04`'s own "no physical-control command" assertion exists to catch, and nothing tests it.

**(c) The ten mandatory verifications are not covered.** Explicitly declared across the seven
simulations: roughly 21 of 70 verification cells. Five of seven name no job at all, so for those
five the scenario does not identify what is being simulated.

## 7. No harness

No scenario runner, fault injector, fixture corpus or acceptance-oracle engine exists in
`packages/` or `scripts/`. `grep -riE simulat` across both returns only the module-state enum
literal `INTERFACE_AND_SIMULATION_ONLY` and incidental comments.

Per §3 the missing _implementation_ is expected. What makes this a GAP rather than a deferral is the
conjunction: `09_IMPLEMENTATION_SEQUENCE.md:18-19` specifies the harness in nine words, so both the
seven scenarios **and** the harness that would run them are DESIGN_STUB.

## 8. Corroboration

The merged W0/W1 audit reached the same verdict independently
(`docs/workforce-engineering/WORKFORCE_SIMULATION_GAP.md`), with one immaterial correction this
audit confirms: W0/W1 describes the files as "3 to 5 lines each"; they are 3–4 (01 is 4, the rest
3). Its finding W01-F-SIM-03 is the sharpest statement of the structural point — WF-29..WF-35
cannot move by writing more simulation files, because the gate set itself is misshapen.

## 9. Status

| Area                                                     | Architecture status | Design status                     | Implementation status |
| -------------------------------------------------------- | ------------------- | --------------------------------- | --------------------- |
| Simulation standard — what to verify (`08:6-15`)         | PARTIAL             | DESIGN_PARTIAL                    | —                     |
| Simulation standard — how to express one                 | **GAP**             | **DESIGN_STUB**                   | —                     |
| Simulation 01 owner-operator day                         | **GAP**             | **DESIGN_STUB** (3/20)            | IMPLEMENTATION_ABSENT |
| Simulation 02 enterprise carrier dispatch                | **GAP**             | **DESIGN_STUB** (2/20)            | IMPLEMENTATION_ABSENT |
| Simulation 03 broker quote-to-settlement                 | **GAP**             | **DESIGN_STUB** (2/20)            | IMPLEMENTATION_ABSENT |
| Simulation 04 facility receiving                         | **GAP**             | **DESIGN_STUB** (2/20)            | IMPLEMENTATION_ABSENT |
| Simulation 05 breakdown / service                        | **GAP**             | **DESIGN_STUB** (2/20, no faults) | IMPLEMENTATION_ABSENT |
| Simulation 06 shipper direct                             | **GAP**             | **DESIGN_STUB** (2/20)            | IMPLEMENTATION_ABSENT |
| Simulation 07 cross-tenant adversarial                   | **GAP**             | **DESIGN_STUB** (2/20)            | IMPLEMENTATION_ABSENT |
| Facility origin / outbound workflow                      | **GAP**             | **absent entirely**               | —                     |
| Brokered shipper-to-carrier workflow                     | **GAP**             | **absent entirely**               | —                     |
| Gate set shape (7 department gates vs 9 workflows)       | **GAP**             | DESIGN_PARTIAL                    | —                     |
| Crash-recovery coverage                                  | **CONFLICT**        | DESIGN_STUB — mandatory, 0 of 7   |
| Prompt-injection coverage where untrusted content exists | **CONFLICT**        | DESIGN_STUB                       |
| Simulation harness                                       | **GAP**             | **DESIGN_STUB** — 9 words         | IMPLEMENTATION_ABSENT |

**Answer to §14: no simulation in the corpus is implementation-ready. All seven require engineers
to invent the business semantics.** The acceptance criteria they carry are, however, a genuinely
useful starting point — they name the right invariants, and remediation should preserve them rather
than start over.
