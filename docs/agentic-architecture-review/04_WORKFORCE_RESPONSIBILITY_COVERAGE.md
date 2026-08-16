# 04 — Workforce Responsibility Coverage (Closed World)

Both directions, per §6: every upstream operational responsibility must have a downstream owner,
and every one of the 76 v1.8 jobs must have an upstream justification.

## 1. Method

- Upstream responsibilities were extracted from the section structure and operational chapters of
  v1.5 (19 docs), FacilityOS (24), v1.6 (25) and v1.7 (22), plus the `graph_families`/`graphs`
  stage lists in the three graph YAMLs.
- Downstream owners were taken from the 76 job books (`job_books/*/*.json`, `.md`),
  `matrices/role_classification.csv` and `contracts/agent_job_catalog.json`.
- Coverage status was computed mechanically, not judged by reading prose.

## 2. Direction 1 — upstream responsibility → owning job

### 2.1 v1.5 Enterprise Agent Operations → carrier workforce

| Upstream responsibility (v1.5)                            | Owning v1.8 job                                                        | Class                  | Coverage                                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------- |
| work/load intake (`05_`, graph `load_intake`)             | Load Discovery Agent                                                   | agent                  | COVERED                                                                           |
| profitability / economics (`05_`)                         | Profitability Engine                                                   | deterministic_service  | COVERED                                                                           |
| planning (`05_`)                                          | Planning Agent                                                         | agent                  | COVERED                                                                           |
| driver/equipment feasibility (`05_`)                      | Feasibility Engine                                                     | hybrid_agent           | COVERED                                                                           |
| dispatch / assignment (`05_`)                             | Dispatch Agent                                                         | agent                  | COVERED                                                                           |
| status / tracking (`05_`)                                 | Tracking Agent                                                         | hybrid_agent           | COVERED                                                                           |
| exception (`05_` exception graph)                         | Carrier Exception Agent                                                | agent                  | COVERED                                                                           |
| documents (`06_`)                                         | Documentation Agent                                                    | hybrid_agent           | COVERED                                                                           |
| facility appointment (carrier side)                       | _(no carrier job)_                                                     | —                      | **GAP** — see §2.5                                                                |
| maintenance / repair / roadside (`07_`)                   | Maintenance Readiness Agent                                            | hybrid_agent           | PARTIAL — readiness only; repair and roadside execution sit with service_provider |
| invoice / reconciliation (`06_`, `05_`)                   | Settlement/Reconciliation Agent                                        | hybrid_agent           | COVERED                                                                           |
| capacity (`05_`)                                          | Capacity Agent                                                         | hybrid_agent           | COVERED                                                                           |
| negotiation (`05_`)                                       | Carrier Negotiation Agent                                              | agent                  | COVERED                                                                           |
| risk / compliance                                         | Carrier Risk & Compliance Agent                                        | human_supervised_agent | COVERED                                                                           |
| cross-workflow coordination                               | Chief Dispatch Orchestrator                                            | agent                  | COVERED                                                                           |
| Company Operational Twin acquisition and approval (`02_`) | _(no job)_                                                             | —                      | **GAP**                                                                           |
| tenant Agent Organization Factory (`03_`)                 | _(no job)_                                                             | —                      | **GAP**                                                                           |
| back-office automation families (`06_`)                   | partially Documentation + Settlement                                   | —                      | PARTIAL                                                                           |
| customer corrections and explainability (`09_`)           | _(no job)_                                                             | —                      | **GAP**                                                                           |
| autonomy certification and shadow mode (`10_`)            | _(no job)_                                                             | —                      | **GAP**                                                                           |
| integration adapter and conformance (`11_`)               | _(no carrier job; brokerage and facility have Configuration Stewards)_ | —                      | **GAP**                                                                           |
| knowledge / memory / data governance (`13_`)              | _(no job)_                                                             | —                      | **GAP**                                                                           |
| observability and outcomes (`14_`)                        | _(no carrier job; shipper has Service Analytics)_                      | —                      | **GAP**                                                                           |
| onboarding / go-live (`15_`)                              | _(no job)_                                                             | —                      | **GAP**                                                                           |

**Carrier is the best-covered plane for operational responsibilities and the worst for
platform-lifecycle responsibilities.** Nine of the responsibilities v1.5 defines — Twin
acquisition, the organization factory, explainability, certification, conformance, knowledge
governance, observability, onboarding — have no owner anywhere in the 76.

That may be deliberate: these are arguably platform functions rather than logistics jobs. But v1.5
defines them as recurring operational responsibilities with customer-visible behaviour
(`09_CUSTOMER_CONTROL_AND_EXPLAINABILITY.md:1-121` specifies a Customer Operations Console, an
explanation contract and a customer-correction loop), and no document says they are out of
workforce scope. Recorded as **GAP — unassigned upstream responsibility**, not as an error.

Notably, brokerage and facility _do_ each get a Configuration Steward for exactly this class of
work. Carrier does not. That asymmetry is unexplained.

### 2.2 FacilityOS → facility workforce

| Upstream responsibility (FacilityOS)              | Owning v1.8 job                                    | Coverage                |
| ------------------------------------------------- | -------------------------------------------------- | ----------------------- |
| appointment lifecycle (`11_`)                     | Appointment Agent                                  | COVERED (job is a stub) |
| capacity and labour (`11_`)                       | Capacity/Labor Planning Agent                      | COVERED (stub)          |
| cargo / order readiness (`07_`, `08_`)            | Cargo/Order Readiness Agent                        | COVERED (stub)          |
| FOT / mapping / integration change (`02_`, `13_`) | Facility Integration/Configuration Steward         | COVERED (stub)          |
| custody and evidence (`10_`)                      | Custody/Evidence Agent                             | COVERED (stub)          |
| facility and customer communications (`14_`)      | Facility Customer Communication Agent              | COVERED (stub)          |
| detention (`11_`)                                 | Detention Clock Service                            | COVERED (stub)          |
| discrepancies (`12_`)                             | Discrepancy Agent                                  | COVERED (stub)          |
| dock (`09_`)                                      | Dock Agent                                         | COVERED (stub)          |
| BOL and document lifecycle (`06_`, 213 lines)     | Document/BOL Agent                                 | COVERED (stub)          |
| driver and carrier interaction (`05_`)            | Carrier/Driver Coordination Agent                  | COVERED (stub)          |
| facility exceptions (`12_`)                       | Facility Exception Agent                           | COVERED (stub)          |
| gate (`09_`)                                      | Gate Agent                                         | COVERED (stub)          |
| load / unload verification (`07_`, `08_`)         | Load/Unload Verification Agent                     | COVERED (stub)          |
| site-wide coordination                            | Facility Operations Orchestrator                   | COVERED (stub)          |
| receiving / destination (`08_`)                   | Receiving Office Agent                             | COVERED (stub)          |
| shipping / origin (`07_`)                         | Shipping Office Agent                              | COVERED (stub)          |
| yard (`09_`)                                      | Yard Orchestration Agent                           | COVERED (stub)          |
| safety / physical-control boundary                | _(expressed as `non_scope` in every facility job)_ | COVERED as prohibition  |
| multi-facility scaling (`16_`)                    | _(no job)_                                         | **GAP**                 |
| FreightOS network semantics (`17_`)               | _(no job)_                                         | **GAP**                 |
| autonomy and certification (`15_`)                | _(no job)_                                         | **GAP**                 |
| go-live (`20_`)                                   | _(no job)_                                         | **GAP**                 |

**Name-level coverage is complete: 18 of 18 facility responsibilities have a named owner.**
Design-level coverage is zero: all 18 owners are stubs. This is the significant case — FacilityOS
supplies 1,957 lines of substantive design across 24 documents, including a 213-line BOL chapter
and typed `vehicle_visit` and `transport_document` schemas, and none of it was decomposed into the
job books that claim it.

### 2.3 v1.6 Brokerage → brokerage workforce

Every one of the 22 operational responsibilities v1.6 defines has a named owner with **real
commands and real handoff edges**: shipper intake, RFQ, pricing, sourcing, qualification,
negotiation, allocation, tender/booking, execution, tracking/communication, facility coordination,
documents, accessorials, claims/evidence, shipper billing, carrier pay, reconciliation, transaction
record, compliance/authority, configuration, relationship support, orchestration.

Unowned: branch and book scaling (`17_`), autonomy and certification (`16_`), go-live (`21_`),
observability (`20_`) — the same platform-lifecycle class as §2.1.

One anomaly: **Customer/Carrier Relationship Support Agent** carries three real commands but
`upstream: []` and `downstream: []`, and appears in zero interaction-matrix rows. It is the single
zero-edge job outside the three stub departments.

### 2.4 v1.7 → shipper and service-provider workforce

Both are exact 1:1 expansions of v1.7's two "Agent roles" bullet lists (12 and 10 names), from
route documents that label themselves "architecture definition, not current module activation".
Coverage is therefore **complete by construction and vacuous**: every named role has a job book,
and no job book has a design. Detail in
[03_PARTICIPANT_AND_TWIN_COHERENCE.md](03_PARTICIPANT_AND_TWIN_COHERENCE.md) §7.

### 2.5 Cross-cutting upstream responsibilities with no owner

| Responsibility                                  | Defined in                                                           | Owner                                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Carrier-side facility appointment               | v1.5 `07_` graph list, v1.7 `07_:20`                                 | **none** — brokerage and shipper have Facility Coordination Agents; carrier does not              |
| Twin acquisition / approval / drift             | v1.5 `02_`, FacilityOS `02_`, v1.6 `02_`, v1.7 `03_`                 | **none** (facility and brokerage Configuration Stewards propose changes; nobody owns acquisition) |
| Agent Organization Factory                      | v1.5 `03_`, FacilityOS `03_`, v1.6 `03_`, v1.7 `04_`, `14_`          | **none**                                                                                          |
| Explainability / customer correction            | v1.5 `09_`, FacilityOS `14_`, v1.6 `15_`                             | **none**                                                                                          |
| Autonomy certification / shadow / promotion     | v1.5 `10_`, FacilityOS `15_`, v1.6 `16_`, v1.8 `06_`                 | **none**                                                                                          |
| Integration conformance                         | v1.5 `11_`, FacilityOS `13_`, v1.7 `15_`                             | facility/brokerage Stewards only                                                                  |
| Knowledge, memory, retrieval, injection defence | v1.5 `13_`                                                           | **none**                                                                                          |
| Onboarding / go-live                            | v1.5 `15_`, FacilityOS `20_`, v1.6 `21_`, v1.7 `14_`                 | **none**                                                                                          |
| Multimodal capability pack loading              | v1.5 `08_`                                                           | **none**                                                                                          |
| Autonomous-mobility operations                  | ADR-0015 `operating_context: autonomous_mobility`; 7 registry agents | **none** — see §3.3                                                                               |

Ten cross-cutting responsibilities, each defined in two to four packages, none with a workforce
owner. Some are plausibly platform rather than workforce; none is documented as such.

## 3. Direction 2 — v1.8 job → upstream justification

### 3.1 Full roster

Columns: declared component class; whether the job's `commands` are real identifiers or the
department placeholder; `upstream`/`downstream` counts from the job-book JSON; rows in
`interaction_matrix.csv`; resulting design status.

| #   | dept             | job (slug)                                                           | class                    | commands        | up/down | matrix rows | design   |
| --- | ---------------- | -------------------------------------------------------------------- | ------------------------ | --------------- | ------- | ----------- | -------- |
| 1   | carrier          | Capacity Agent (`capacity`)                                          | `hybrid_agent`           | 2 real          | 1/2     | 2           | PARTIAL  |
| 2   | carrier          | Chief Dispatch Orchestrator (`chief_dispatch_orchestrator`)          | `agent`                  | 3 real          | 0/4     | 4           | PARTIAL  |
| 3   | carrier          | Dispatch Agent (`dispatch`)                                          | `agent`                  | 3 real          | 2/2     | 2           | PARTIAL  |
| 4   | carrier          | Documentation Agent (`documentation`)                                | `hybrid_agent`           | 3 real          | 2/1     | 1           | PARTIAL  |
| 5   | carrier          | Carrier Exception Agent (`exception`)                                | `agent`                  | 5 real          | 4/3     | 3           | PARTIAL  |
| 6   | carrier          | Feasibility Engine (`feasibility`)                                   | `hybrid_agent`           | 1 real          | 2/2     | 2           | PARTIAL  |
| 7   | carrier          | Load Discovery Agent (`load_discovery`)                              | `agent`                  | 3 real          | 0/3     | 3           | PARTIAL  |
| 8   | carrier          | Maintenance Readiness Agent (`maintenance_readiness`)                | `hybrid_agent`           | 3 real          | 1/3     | 3           | PARTIAL  |
| 9   | carrier          | Carrier Negotiation Agent (`negotiation`)                            | `agent`                  | 3 real          | 2/1     | 1           | PARTIAL  |
| 10  | carrier          | Planning Agent (`planning`)                                          | `agent`                  | 2 real          | 3/2     | 2           | PARTIAL  |
| 11  | carrier          | Profitability Engine (`profitability`)                               | `deterministic_service`  | 1 real          | 1/3     | 3           | PARTIAL  |
| 12  | carrier          | Carrier Risk & Compliance Agent (`risk_compliance`)                  | `human_supervised_agent` | 3 real          | 0/2     | 2           | PARTIAL  |
| 13  | carrier          | Settlement/Reconciliation Agent (`settlement`)                       | `hybrid_agent`           | 4 real          | 3/2     | 2           | PARTIAL  |
| 14  | carrier          | Tracking Agent (`tracking`)                                          | `hybrid_agent`           | 3 real          | 1/2     | 2           | PARTIAL  |
| 15  | brokerage        | Accessorial Agent (`accessorial`)                                    | `hybrid_agent`           | 3 real          | 2/2     | 2           | PARTIAL  |
| 16  | brokerage        | Allocation Agent (`allocation`)                                      | `hybrid_agent`           | 1 real          | 2/1     | 1           | PARTIAL  |
| 17  | brokerage        | Carrier Pay/Reconciliation Agent (`carrier_pay`)                     | `hybrid_agent`           | 3 real          | 2/1     | 1           | PARTIAL  |
| 18  | brokerage        | Carrier Qualification Agent (`carrier_qualification`)                | `hybrid_agent`           | 3 real          | 1/3     | 3           | PARTIAL  |
| 19  | brokerage        | Carrier Sourcing Agent (`carrier_sourcing`)                          | `agent`                  | 2 real          | 1/1     | 1           | PARTIAL  |
| 20  | brokerage        | Claims/Evidence Agent (`claims_evidence`)                            | `human_supervised_agent` | 3 real          | 2/1     | 1           | PARTIAL  |
| 21  | brokerage        | Compliance Supervisor Agent (`compliance_supervisor`)                | `human_supervised_agent` | 3 real          | 3/2     | 2           | PARTIAL  |
| 22  | brokerage        | Broker Configuration Steward (`configuration_steward`)               | `human_supervised_agent` | 2 real          | 0/1     | 1           | PARTIAL  |
| 23  | brokerage        | Broker Documentation Agent (`documentation`)                         | `hybrid_agent`           | 2 real          | 3/3     | 3           | PARTIAL  |
| 24  | brokerage        | Facility Coordination Agent (`facility_coordination`)                | `agent`                  | 2 real          | 1/2     | 2           | PARTIAL  |
| 25  | brokerage        | Margin Risk Service (`margin_risk`)                                  | `deterministic_service`  | 2 real          | 2/2     | 2           | PARTIAL  |
| 26  | brokerage        | Broker Negotiation Agent (`negotiation`)                             | `agent`                  | 2 real          | 2/2     | 2           | PARTIAL  |
| 27  | brokerage        | Brokerage Operations Orchestrator (`operations_orchestrator`)        | `agent`                  | 3 real          | 0/5     | 5           | PARTIAL  |
| 28  | brokerage        | Customer/Carrier Relationship Support Agent (`relationship_support`) | `agent`                  | 3 real          | 0/0     | 0           | STUB     |
| 29  | brokerage        | Requirements Agent (`requirements`)                                  | `agent`                  | 2 real          | 1/3     | 3           | PARTIAL  |
| 30  | brokerage        | Broker Shipment Execution Agent (`shipment_execution`)               | `agent`                  | 3 real          | 1/4     | 4           | PARTIAL  |
| 31  | brokerage        | Shipper Billing Agent (`shipper_billing`)                            | `hybrid_agent`           | 2 real          | 2/1     | 1           | PARTIAL  |
| 32  | brokerage        | Shipper Intake Agent (`shipper_intake`)                              | `hybrid_agent`           | 2 real          | 0/1     | 1           | PARTIAL  |
| 33  | brokerage        | Shipper Pricing Agent (`shipper_pricing`)                            | `hybrid_agent`           | 3 real          | 1/1     | 1           | PARTIAL  |
| 34  | brokerage        | Tender/Booking Agent (`tender_booking`)                              | `hybrid_agent`           | 3 real          | 1/2     | 2           | PARTIAL  |
| 35  | brokerage        | Tracking/Communication Agent (`tracking_communication`)              | `hybrid_agent`           | 2 real          | 1/2     | 2           | PARTIAL  |
| 36  | brokerage        | Broker Transaction Record Service (`transaction_record`)             | `deterministic_service`  | 2 real          | 2/1     | 1           | PARTIAL  |
| 37  | facility         | Appointment Agent (`appointment`)                                    | `hybrid_agent`           | **placeholder** | 0/0     | 0           | **STUB** |
| 38  | facility         | Capacity/Labor Planning Agent (`capacity_labor`)                     | `agent`                  | **placeholder** | 0/0     | 0           | **STUB** |
| 39  | facility         | Cargo/Order Readiness Agent (`cargo_readiness`)                      | `hybrid_agent`           | **placeholder** | 0/0     | 0           | **STUB** |
| 40  | facility         | Facility Integration/Configuration Steward (`configuration_steward`) | `human_supervised_agent` | **placeholder** | 0/0     | 0           | **STUB** |
| 41  | facility         | Custody/Evidence Agent (`custody_evidence`)                          | `human_supervised_agent` | **placeholder** | 0/0     | 0           | **STUB** |
| 42  | facility         | Facility Customer Communication Agent (`customer_communication`)     | `agent`                  | **placeholder** | 0/0     | 0           | **STUB** |
| 43  | facility         | Detention Clock Service (`detention`)                                | `deterministic_service`  | **placeholder** | 0/0     | 0           | **STUB** |
| 44  | facility         | Discrepancy Agent (`discrepancy`)                                    | `agent`                  | **placeholder** | 0/0     | 0           | **STUB** |
| 45  | facility         | Dock Agent (`dock`)                                                  | `hybrid_agent`           | **placeholder** | 0/0     | 0           | **STUB** |
| 46  | facility         | Document/BOL Agent (`document_bol`)                                  | `hybrid_agent`           | **placeholder** | 0/0     | 0           | **STUB** |
| 47  | facility         | Carrier/Driver Coordination Agent (`driver_coordination`)            | `agent`                  | **placeholder** | 0/0     | 0           | **STUB** |
| 48  | facility         | Facility Exception Agent (`facility_exception`)                      | `agent`                  | **placeholder** | 0/0     | 0           | **STUB** |
| 49  | facility         | Gate Agent (`gate`)                                                  | `hybrid_agent`           | **placeholder** | 0/0     | 0           | **STUB** |
| 50  | facility         | Load/Unload Verification Agent (`load_unload_verification`)          | `hybrid_agent`           | **placeholder** | 0/0     | 0           | **STUB** |
| 51  | facility         | Facility Operations Orchestrator (`operations_orchestrator`)         | `agent`                  | **placeholder** | 0/0     | 0           | **STUB** |
| 52  | facility         | Receiving Office Agent (`receiving_office`)                          | `agent`                  | **placeholder** | 0/0     | 0           | **STUB** |
| 53  | facility         | Shipping Office Agent (`shipping_office`)                            | `agent`                  | **placeholder** | 0/0     | 0           | **STUB** |
| 54  | facility         | Yard Orchestration Agent (`yard`)                                    | `hybrid_agent`           | **placeholder** | 0/0     | 0           | **STUB** |
| 55  | shipper          | Shipper Documentation Agent (`documentation`)                        | `hybrid_agent`           | **placeholder** | 0/0     | 0           | **STUB** |
| 56  | shipper          | Shipper Exception Agent (`exception`)                                | `agent`                  | **placeholder** | 0/0     | 0           | **STUB** |
| 57  | shipper          | Shipper Facility Coordination Agent (`facility_coordination`)        | `agent`                  | **placeholder** | 0/0     | 0           | **STUB** |
| 58  | shipper          | Invoice Audit Engine (`invoice_audit`)                               | `hybrid_agent`           | **placeholder** | 0/0     | 0           | **STUB** |
| 59  | shipper          | Provider/Carrier Selection Agent (`provider_selection`)              | `hybrid_agent`           | **placeholder** | 0/0     | 0           | **STUB** |
| 60  | shipper          | Quote Analysis Agent (`quote_analysis`)                              | `hybrid_agent`           | **placeholder** | 0/0     | 0           | **STUB** |
| 61  | shipper          | Shipper Requirements Agent (`requirements`)                          | `agent`                  | **placeholder** | 0/0     | 0           | **STUB** |
| 62  | shipper          | Routing Guide Engine (`routing_guide`)                               | `deterministic_service`  | **placeholder** | 0/0     | 0           | **STUB** |
| 63  | shipper          | Service Analytics Agent (`service_analytics`)                        | `agent`                  | **placeholder** | 0/0     | 0           | **STUB** |
| 64  | shipper          | Shipment Intake Agent (`shipment_intake`)                            | `hybrid_agent`           | **placeholder** | 0/0     | 0           | **STUB** |
| 65  | shipper          | Shipper Tender Agent (`tender`)                                      | `hybrid_agent`           | **placeholder** | 0/0     | 0           | **STUB** |
| 66  | shipper          | Shipper Tracking Agent (`tracking`)                                  | `hybrid_agent`           | **placeholder** | 0/0     | 0           | **STUB** |
| 67  | service_provider | Service Appointment/Dispatch Agent (`appointment_dispatch`)          | `agent`                  | **placeholder** | 0/0     | 0           | **STUB** |
| 68  | service_provider | Service Capacity Agent (`capacity`)                                  | `hybrid_agent`           | **placeholder** | 0/0     | 0           | **STUB** |
| 69  | service_provider | Service Customer Communication Agent (`customer_communication`)      | `agent`                  | **placeholder** | 0/0     | 0           | **STUB** |
| 70  | service_provider | Service Eligibility Engine (`eligibility`)                           | `hybrid_agent`           | **placeholder** | 0/0     | 0           | **STUB** |
| 71  | service_provider | Estimate Agent (`estimate`)                                          | `hybrid_agent`           | **placeholder** | 0/0     | 0           | **STUB** |
| 72  | service_provider | Service Evidence Agent (`evidence`)                                  | `hybrid_agent`           | **placeholder** | 0/0     | 0           | **STUB** |
| 73  | service_provider | Service Invoice/Reconciliation Agent (`invoice_reconciliation`)      | `hybrid_agent`           | **placeholder** | 0/0     | 0           | **STUB** |
| 74  | service_provider | Parts & Dependency Agent (`parts_dependency`)                        | `agent`                  | **placeholder** | 0/0     | 0           | **STUB** |
| 75  | service_provider | Service Intake Agent (`service_intake`)                              | `hybrid_agent`           | **placeholder** | 0/0     | 0           | **STUB** |
| 76  | service_provider | Work Status Agent (`work_status`)                                    | `hybrid_agent`           | **placeholder** | 0/0     | 0           | **STUB** |

**Totals: 35 PARTIAL, 41 STUB, 0 COMPLETE.** These reproduce the merged W0/W1 audit's independent
counts exactly (`docs/workforce-engineering/JOB_BOOK_IMPLEMENTATION_MATRIX.md`), which were
themselves derived by a different method. Two independent derivations agreeing to the digit is
strong evidence the counts are right.

### 3.2 Justification verdict

| Question                                              | Answer                                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Unsupported inventions (a job with no upstream basis) | **None.** Every one of the 76 traces to an upstream responsibility, a v1.7 role list, or an explicit FacilityOS/v1.6 chapter.   |
| Missing jobs                                          | Ten cross-cutting responsibilities (§2.5), plus carrier-side facility appointment, plus the entire autonomous-mobility context. |
| Duplicates                                            | 10 exact slug reuses across departments; 13 thematic families spanning participants (§3.4).                                     |
| Jobs that should not be agents                        | See [Lens C](14_DUPLICATION_CONTRADICTION_GAP_REGISTER.md) and §3.5.                                                            |

### 3.3 The reverse gap — an implemented agent family with no job

`config/agents/registry.yaml` declares 32 agent manifests: 13 `carrier_copilot`, 12
`facilityos_lite`, 7 `autonomous_vehicle_gateway`.

The seven autonomous-mobility manifests — `autonomous-mission-orchestrator`,
`odd-eligibility-agent`, `vehicle-facility-compatibility-agent`, `remote-assistance-coordinator`,
`autonomous-maintenance-coordinator`, `autonomous-mission-exception-agent`,
`mission-reconciliation-agent` — have **no v1.8 job book**. An entire declared agent family sits
outside the workforce catalogue.

The merged W0/W1 audit escalated this as OD-2 and **resolved** it from the corpus: AV manifests stay
declared, suspended, effective A0, with no job and no workstream until an owner-signed promotion
ADR and the AV Activation Gate (`config/scope/module_states.yaml` has
`autonomous_vehicle_gateway: INTERFACE_AND_SIMULATION_ONLY, earliest_horizon: 3`). One documentation
request remains open: whether a future package records AV as _excluded from_ the workforce
catalogue or merely _deferred_. This audit concurs with that resolution and does not re-escalate it.

Conversely, all 22 brokerage, 12 shipper and 10 service-provider jobs have no registry manifest.
For brokerage that is correct and deliberate — the registry header states brokerage is
`LEGAL_AND_MARKET_GATED` and its variant is authored when the legal gate is signed. For shipper and
service provider it is simply absent.

### 3.4 Cross-participant duplication

Exact slug reused across departments (10): `documentation` (carrier, brokerage, shipper);
`capacity` (carrier, service_provider); `configuration_steward` (brokerage, facility);
`customer_communication` (facility, service_provider); `exception` (carrier, shipper);
`facility_coordination` (brokerage, shipper); `negotiation` (brokerage, carrier);
`operations_orchestrator` (brokerage, facility); `requirements` (brokerage, shipper);
`tracking` (carrier, shipper).

Thematic families spanning participants (13): orchestration (3), intake (3), tracking/comms (7),
documentation (4), capacity (3), exception (3), evidence (3), money/settlement (7), pricing/quote
(5), requirements (3), eligibility (6), configuration steward (2), facility coordination (2).

**Assessment: this duplication is a regression from the controlling model, not a consequence of
it.**

The audit initially reasoned that legal-plane separation justified separate job definitions —
ADR-0003 and ADR-0015 do make `carrier_agent` and `brokerage` genuinely distinct legal contexts with
separate credentials, ledgers and audit. Adversarial review overturned that position, and the
controlling artifacts say the opposite.

The **v1.2 base governance layer** — the highest-precedence layer in the corpus — models these very
roles as **one manifest parameterised by plane**. `docs/production-handoff/v1.2/config/agents/
registry.yaml` contains 32 manifests of which **20 declare multiple planes**, including all twelve
of the roles v1.8 later split:

```text
capacity-agent, load-discovery-agent, profitability-agent, planning-agent, negotiation-agent,
feasibility-agent, dispatch-agent, tracking-agent, exception-agent, documentation-agent,
settlement-agent, risk-agent      →  planes: [carrier_agent, brokerage]

order-readiness-agent, appointment-agent, receiving-agent,
facility-customer-communication-agent  →  planes: [facility_operator, shipper_owned]
load-verification-agent                →  planes: [facility_operator, carrier_agent]
```

The generated operational registry then **deletes** the brokerage variants rather than duplicating
them (`config/agents/registry.yaml:12-14`): "Agents the handoff declared on both the carrier and
brokerage planes keep only the carrier manifest. Brokerage is LEGAL_AND_MARKET_GATED and disabled
in Horizon 1; its variant is authored separately when the brokerage legal gate is signed."

Separation is enforced by two typed columns and `app.is_permitted_legal_pairing` in migration 0001 —
**not** by maintaining two markdown files. Legal-plane separation justifies distinct runtime
_instances_ carrying distinct authority context, credentials and ledgers. It does not justify
distinct job _definitions_. Of the ten exact slug reuses, none is required to be two definitions on
legal grounds.

The defect therefore has two parts, and the second is the one previously identified:

1. **v1.8 re-expanded a dual-plane model into duplicate definitions**, reversing a decision the base
   layer had already made.
2. **The duplicates share no abstraction.** Each is authored independently with no common capability
   definition, no shared schema and no plane parameter — the Job Book schema has no
   `legal_authority_class`, no `operating_context` and no plane field at all, so parameterisation is
   not even expressible. Nothing keeps the three Documentation Agents consistent and nothing would
   detect them drifting. `configuration_steward` is the clearest case: brokerage and facility, both
   `human_supervised_agent`, both "propose, do not self-approve", near-identical text, two
   separately maintained documents.

The only cross-department commonality that exists today is four undefined free-text tool strings —
`tenant-scoped read model`, `policy query`, `evidence retrieval`, `approved communications gateway` —
which appear in all five departments and are defined nowhere in the package, in `contracts/`, or in
the repository.

### 3.4.1 Duplicate command ownership inside the authored departments

The "one accountable owner" invariant (`00_MASTER_WORKFORCE_HANDOFF.md:41`) is already violated
within the two well-developed departments:

| Command           | Declared by                                                                |
| ----------------- | -------------------------------------------------------------------------- |
| `open_exception`  | `carrier/tracking`, `carrier/exception`                                    |
| `request_replan`  | `carrier/planning`, `carrier/exception`, `carrier/maintenance_readiness`   |
| `open_escalation` | `carrier/chief_dispatch_orchestrator`, `brokerage/operations_orchestrator` |

Because `work_unit.schema.json` gives `state` no enum and `currentOwner` no binding to any job slug,
nothing can adjudicate which job owns the case a duplicated command creates.

### 3.5 Deterministic work modelled as agent work

`01_ROLE_DECOMPOSITION_AND_AGENT_MINIMIZATION.md:8` designates deterministic services for
"arithmetic, eligibility rules, exact clocks, schema validation, authorization, idempotency, fixed
routing, and state transitions."

Three jobs named as engines are classified `hybrid_agent`:

| Job                        | Department       | Class          | `01:8` category it matches          |
| -------------------------- | ---------------- | -------------- | ----------------------------------- |
| Feasibility Engine         | carrier          | `hybrid_agent` | eligibility rules                   |
| Service Eligibility Engine | service_provider | `hybrid_agent` | eligibility rules                   |
| Invoice Audit Engine       | shipper          | `hybrid_agent` | arithmetic against contracted terms |

while Routing Guide Engine ("fixed routing") and Profitability Engine ("arithmetic") _are_
`deterministic_service`.

Worse: two of the five `deterministic_service` jobs — **Detention Clock Service** ("exact clocks")
and **Routing Guide Engine** ("fixed routing"), the two flagship cases from `01:8` — carry
placeholder commands and are unbuildable.

`workflow_service` is in the schema enum and used **zero** times. The three orchestrators
(brokerage, carrier, facility) are all classified `agent` while owning "work ownership", "priority"
and "cross-workflow dependency" — textbook workflow-service responsibility.

The mechanism that should have caught all of this is `01:19`: "Every proposed agent must include an
alternative analysis: deterministic service, workflow node, existing job, or human-only."
**0 of 76 job books contain one.**

## 4. Where the design actually lives inside a job book

Calibration matters: the corpus is not uniformly empty. The `.md` job books carry 23 H2 sections
mapping well onto the 25 elements `02_JOB_BOOK_STANDARD.md` requires — that structural requirement
is substantially met.

The best case, `carrier/dispatch.md`, is genuinely job-specific in its first ~50 lines: three owned
outcomes, three non-scope items, three work triggers, five required inputs, three typed output
artifacts (`AssignmentCommandRequest`, `DispatchInstruction`, `DriverAcknowledgementState`), a
decision right, three job-specific prohibitions, and three real commands
(`assign_driver_equipment`, `send_dispatch_instruction`, `cancel_dispatch_instruction`).

Its last ~90 lines are boilerplate shared with all 76: SLA/deadlines (no value), concurrency and
idempotency (no key, no scope), customer-configurable behaviour, autonomy behaviour, degraded mode,
audit/evidence, and eight of ten certification scenarios.

Applying the Lens A test to the _best_ job book: an engineer must still invent the idempotency key
and scope for `assign_driver_equipment` (while "double assign resource" is listed as prohibited),
the definition of "material change" that invalidates a stale approval, every deadline value, the
driver-acknowledgement timeout, and the reconciliation procedure when the TMS write outcome is
uncertain.

Boilerplate quantified across all 76:

| Section                   | Job-specific content | Boilerplate                              |
| ------------------------- | -------------------- | ---------------------------------------- |
| Exception playbook        | 1–2 lines            | 5 lines, each appearing exactly 76 times |
| Certification scenarios   | 1–2 lines            | 5 lines appearing 76 times               |
| Prohibited actions        | 0–3 lines            | 5 lines appearing 76 times               |
| SLA / deadlines           | none                 | 2 lines, 76 times, no values             |
| Concurrency / idempotency | none                 | 4 lines, 76 times, no keys               |
| Customer configuration    | none                 | 7 lines, 76 times                        |
| Autonomy behaviour        | none                 | 2–3 lines, 76 times, no level assigned   |
| Degraded mode             | none                 | 4 lines, 76 times                        |
| Audit / evidence          | none                 | 1 line, 76 times                         |

## 5. Status

| Coverage question                                           | Status                                                                                                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Every upstream operational responsibility has a named owner | **PARTIAL** — operational responsibilities yes; ten cross-cutting responsibilities no                                                    |
| Every named owner has an adequate job-specific design       | **GAP** — 41 of 76 are stubs, 35 partial, 0 complete                                                                                     |
| Every job has upstream justification                        | **COMPLETE** — no unsupported inventions                                                                                                 |
| No unjustified duplication                                  | **PARTIAL** — duplication justified by legal plane, but no shared abstraction                                                            |
| Deterministic work correctly classified                     | **PARTIAL** — 3 engines misclassified, 2 flagship deterministic services are stubs, `workflow_service` unused, 0/76 alternative analyses |
| Implemented agents all have jobs                            | **GAP** — 7 AV manifests unowned (resolved as deferred by W0/W1 OD-2)                                                                    |

Implementation status for the entire workforce: `IMPLEMENTATION_ABSENT`. No `WorkUnit`, handoff
record, job certification, agent runtime, tool registry or `evals/` directory exists. Per §3 this
is expected under Horizon 1 and is not scored as a failure; the 41 design stubs are.
