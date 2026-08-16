# Workforce Simulation Gap — v1.8.0 W0/W1

**Status:** W0/W1 audit deliverable. **Baseline:** `main` @ `09624b9`. **Branch:** `audit/v1.8.0-workforce-w0-w1`. **Date:** 2026-08-15. **Companions:** [`WORK_UNIT_OWNERSHIP_MAP.md`](WORK_UNIT_OWNERSHIP_MAP.md), [`EVALUATION_GAP_MATRIX.md`](EVALUATION_GAP_MATRIX.md), [`WF_01_WF_40_MATRIX.md`](WF_01_WF_40_MATRIX.md).

> A gate cannot be PASS when evidence exists only in an unmerged branch, mock, or document. — v1.4.0 `24_ACCEPTANCE_GATES_EVIDENCE_MATRIX.md`

## Method and status of the simulation artifacts

v1.8 `08_END_TO_END_WORKFORCE_SIMULATION_STANDARD.md` requires every department simulation to verify ten things: (1) handoff acceptance/rejection, (2) unique ownership continuity, (3) cross-job deadlines, (4) duplicates/out-of-order events, (5) partial external side effects, (6) participant/network boundaries, (7) human approvals, (8) exception transfer, (9) crash recovery, (10) final evidence reconstruction — and "a workflow cannot be marketed as autonomous until its complete workforce simulation passes at the claimed autonomy level."

The seven `simulations/*.yaml` are **declarative stubs** — 3 to 5 lines each: a `name`, an `acceptance` list, usually a `faults` list, and (only in 01 and 05) a `sequence` of job names. There are no fixtures, no expected outputs, no acceptance oracle, no runner. Their shape is inconsistent (05 has no `faults`; 02, 03, 04, 06, 07 have no `sequence`). On the two-dimension scale they are **DESIGN_STUB**; the harness is **IMPLEMENTATION_ABSENT** — W0 §17: no simulator, no scenario runner, no fault injector, one fixture file, `INTERFACE_AND_SIMULATION_ONLY` names no simulator (`grep -rniE simulat packages/*/src scripts/*.mjs` → the enum literal only).

Verbatim (from `docs/production-handoff/v1.8.0-agent-workforce-engineering-certification/simulations/`):

```yaml
# 01_owner_operator_day.yaml
name: owner_operator_day
sequence:
  [
    Load Discovery Agent,
    Profitability Engine,
    Feasibility Engine,
    Planning Agent,
    Carrier Negotiation Agent,
    Dispatch Agent,
    Tracking Agent,
    Documentation Agent,
    Settlement/Reconciliation Agent,
  ]
faults: [stale opportunity, readiness change after plan, duplicate dispatch, missing POD]
acceptance: [no orphan work, no duplicate side effect, typed handoffs, exact owner approvals]
# 02_enterprise_carrier_dispatch.yaml
name: enterprise_carrier_dispatch
faults: [simultaneous driver unavailability, appointment domino, regional outage, exception storm]
acceptance: [unique ownership, region isolation, orchestrator cannot override feasibility or policy]
# 03_broker_quote_to_settlement.yaml
name: broker_quote_to_settlement
faults:
  [
    carrier authority change before tender,
    ambiguous acceptance,
    facility delay/accessorial dispute,
    payment destination change,
  ]
acceptance:
  [
    no plane leakage,
    unqualified carrier never tendered,
    money deterministic,
    transaction record complete,
  ]
# 04_facility_driver_bol_receiving.yaml
name: facility_driver_bol_receiving
faults: [duplicate BOL, ambiguous shipment match, partial receipt, YMS outage]
acceptance:
  [
    BOL never implies custody,
    BOL never implies goods receipt,
    no physical-control command,
    fallback reconciles,
  ]
# 05_breakdown_network_exception.yaml
name: breakdown_network_exception
sequence:
  [
    Maintenance Readiness Agent,
    Carrier Exception Agent,
    Service Intake Agent,
    Service Eligibility Engine,
    Service Capacity Agent,
    Service Appointment/Dispatch Agent,
    Tracking Agent,
    Facility Coordination Agent,
  ]
acceptance:
  [one accountable owner per participant, independent authority, purpose-limited network disclosure]
# 06_shipper_direct_carrier.yaml
name: shipper_direct_carrier
faults: [routing-guide primary unavailable, counter changes service requirement]
acceptance: [shipper-to-carrier legal route preserved, no brokerage authority implied]
# 07_cross_tenant_adversarial.yaml
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

## Part A — 7 simulations × 10 mandatory verifications

Cell: **declared** — the stub's acceptance/faults name it; **implied** — follows from the sequence but is not stated; **absent** — not addressed. Harness capability today: **none** for every row.

| Simulation                       | 1 handoff accept/reject     | 2 unique ownership                                 | 3 cross-job deadlines          | 4 duplicates/out-of-order        | 5 partial external side effects                     | 6 participant/network boundary                                           | 7 human approvals                               | 8 exception transfer                    | 9 crash recovery            | 10 evidence reconstruction                    | Harness today |
| -------------------------------- | --------------------------- | -------------------------------------------------- | ------------------------------ | -------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------- | --------------------------------------- | --------------------------- | --------------------------------------------- | ------------- |
| 01 owner_operator_day            | declared ("typed handoffs") | declared ("no orphan work")                        | absent                         | declared ("duplicate dispatch")  | implied ("missing POD")                             | absent                                                                   | declared ("exact owner approvals")              | implied ("readiness change after plan") | absent                      | absent                                        | none          |
| 02 enterprise_carrier_dispatch   | absent                      | declared ("unique ownership")                      | implied ("appointment domino") | absent                           | absent                                              | absent ("region isolation" is tenant/region, not network)                | implied ("orchestrator cannot override policy") | declared ("exception storm")            | implied ("regional outage") | absent                                        | none          |
| 03 broker_quote_to_settlement    | absent                      | absent                                             | absent                         | implied ("ambiguous acceptance") | implied ("payment destination change")              | declared ("no plane leakage")                                            | implied ("payment destination change" red)      | declared ("accessorial dispute")        | absent                      | declared ("transaction record complete")      | none          |
| 04 facility_driver_bol_receiving | absent                      | absent                                             | absent                         | declared ("duplicate BOL")       | declared ("partial receipt", "fallback reconciles") | absent                                                                   | absent                                          | implied ("ambiguous shipment match")    | implied ("YMS outage")      | implied ("BOL never implies custody/receipt") | none          |
| 05 breakdown_network_exception   | absent                      | declared ("one accountable owner per participant") | absent                         | absent                           | absent                                              | declared ("independent authority", "purpose-limited network disclosure") | absent                                          | declared (the whole scenario)           | absent                      | absent                                        | none          |
| 06 shipper_direct_carrier        | absent                      | absent                                             | absent                         | absent                           | absent                                              | declared ("legal route preserved", "no brokerage authority implied")     | implied ("counter changes service requirement") | absent                                  | absent                      | absent                                        | none          |
| 07 cross_tenant_adversarial      | absent                      | absent                                             | absent                         | declared ("duplicate result")    | absent                                              | declared ("no confidential leakage")                                     | declared ("stale approval reuse")               | absent                                  | absent                      | declared ("evidence reconstructable")         | none          |

No simulation declares crash recovery or cross-job deadlines explicitly; only 03 and 07 declare evidence reconstruction; only 01 declares handoff acceptance. **Finding W01-F-SIM-01:** even as designs, the seven stubs cover 21 of 70 verification cells explicitly.

## Part B — per simulation: jobs, gates, module constraints, what a harness would need

| Simulation                       | Sequence jobs → W1 class / design status                                                                                                                                                                                                                                      | WF gate served                                     | Module/legal constraint                                                                                                                  | Preserved rule (must hold in any future harness)                                                                                                                                                                                                              | Needed to become runnable                                                                                                                                                                                                                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 owner_operator_day            | Load Discovery DET/PARTIAL · Profitability DET/PARTIAL · Feasibility DET/PARTIAL · Planning HYBRID/PARTIAL · Negotiation KEEP/PARTIAL · Dispatch WORKFLOW/PARTIAL · Tracking DET/PARTIAL · Documentation HYBRID/PARTIAL · Settlement DET/PARTIAL                              | WF-29 (carrier)                                    | `carrier_copilot` ACTIVE_BUILD, A3 max, Phase 1 ≤A2 and no copilot work (decisions/0002 §5)                                              | exact owner approvals; no duplicate side effect (idempotency key per command)                                                                                                                                                                                 | WorkUnit/handoff runtime; fixtures for the 9 jobs; fault injectors (stale opportunity, readiness change, duplicate dispatch, missing POD); acceptance oracle for orphan/duplicate/typed/approval                                                                                                              |
| 02 enterprise_carrier_dispatch   | none named — implies Chief Dispatch Orchestrator WORKFLOW + all carrier jobs                                                                                                                                                                                                  | WF-29                                              | as above                                                                                                                                 | "orchestrator cannot override feasibility or policy" (C-10)                                                                                                                                                                                                   | sequence definition; multi-region tenancy fixture; exception-storm generator; ownership-uniqueness oracle                                                                                                                                                                                                     |
| 03 broker_quote_to_settlement    | none named — brokerage chain (intake → pricing → sourcing → qualification → allocation → tender → execution → accessorial → billing/pay → transaction record) all NOT_IN_CURRENT_HORIZON                                                                                      | WF-30 ("exists and remains legal/promotion-gated") | `digital_brokerage` LEGAL_AND_MARKET_GATED; gate unsigned; **no activation**; five refusal layers                                        | no plane leakage; unqualified carrier never tendered; payment-destination change human-only; money deterministic                                                                                                                                              | may be authored and simulated **offline only**; can never be run against live authority; needs the brokerage sequence and fixtures                                                                                                                                                                            |
| 04 facility_driver_bol_receiving | none named — facility gate/document_bol/shipping_office/receiving_office/custody_evidence/discrepancy, all STUB                                                                                                                                                               | WF-31 ("preserves physical-control prohibition")   | `facilityos_lite` PROMOTION_GATED; FACILITY_AUTOMATION_GATE unsigned; minimum_facility_primitives FOUNDATION_ONLY has no code            | **no physical-control command** — today enforced only at CI (`validate-scope.mjs:481-531`), DB standing suspension (0016) and capability level (`capabilities.ts:140-153`), never by any job; BOL never implies custody/goods receipt (FacilityOS invariants) | facility Job Books must first leave the stub state (edges, commands); then fixtures (duplicate BOL, ambiguous match, partial receipt, YMS outage) and an oracle asserting no forbidden verb is ever emitted                                                                                                   |
| 05 breakdown_network_exception   | Maintenance Readiness DET/PARTIAL · Carrier Exception KEEP/PARTIAL · Service Intake DET/STUB · Service Eligibility DET/STUB · Service Capacity DET/STUB · Service Appointment/Dispatch WORKFLOW/STUB · Tracking DET/PARTIAL · Facility Coordination (brokerage) MERGE/PARTIAL | WF-34 (cross-participant exception)                | RigDesk is system of record (Ruling C); service-provider books are stubs; brokerage facility_coordination merges into shipment_execution | one accountable owner **per participant**; independent authority; purpose-limited disclosure (N5 primitives exist, no worker)                                                                                                                                 | service-provider design remediation first; then cross-participant fixture across three planes; disclosure oracle                                                                                                                                                                                              |
| 06 shipper_direct_carrier        | none named — shipper requirements/routing_guide/tender/tracking, all STUB; carrier negotiation/dispatch                                                                                                                                                                       | WF-32 (legal routing)                              | `shipper_control_tower` PROMOTION_GATED; Ruling A: no shipper execution workflow                                                         | shipper-to-carrier legal route; no brokerage authority implied                                                                                                                                                                                                | shipper design remediation; fixture with routing-guide fallback and counter; legal-route oracle                                                                                                                                                                                                               |
| 07 cross_tenant_adversarial      | none named — a platform property (RLS, N5 disclosure, capability matrix, approval binding, idempotency)                                                                                                                                                                       | WF-35                                              | applies to every module                                                                                                                  | all unauthorized attempts denied; no leakage; evidence reconstructable                                                                                                                                                                                        | the platform primitives are tested individually (`rls.test.ts`, `network-disclosure-*.test.ts`, `capabilities.test.ts`, `authorization-boundary.test.ts`) but no **workforce** simulation drives a job through them; needs job fixtures + injection corpus + stale-approval fixture + duplicate-result oracle |

## Part C — the instruction's §7 cross-workforce proof (consolidated)

Consolidated from the ownership map (`W01-F-OWN-*`), edge inventory (`W01-F-EDGE-*`), tool drift (`W01-F-TOOL-*`), role matrix (`W01-F-AV-01`, `W01-F-PLAT-01`) and this file (`W01-F-SIM-*`):

1. **Work has no accountable owner** — runtime: every step of every simulation (no WorkUnit exists) [W01-F-OWN-01]; design: 41 jobs with no edges make steps 1, 8–11, 13–16, 23 and the RigDesk/facility/shipper hops of the exception chain owner-less [W01-F-OWN-02, -03]; five of seven simulations name no sequence [W01-F-SIM-02].
2. **Multiple jobs could both believe they own it** — brokerage facility_coordination/shipment_execution, documentation/shipment_execution, shipment_execution/relationship_support; facility receiving_office/discrepancy; shipper shipment_intake/requirements, provider_selection/routing_guide/quote_analysis; registry capacity/labor pair; AV maintenance coordinator vs carrier maintenance_readiness [W01-F-OWN-04..-11]. Cross-participant twins are legitimate (v1.7).
3. **Free-form rather than typed handoff** — 89 edges, none typed; one boilerplate contract string; `acceptanceState` optional in the design schema; no schema or table in the repository [W01-F-EDGE-01, -02].
4. **Side effect without idempotency/reconciliation proof** — 91 design commands, none with a defined idempotency key; the repository's idempotency primitives have no job caller; there is **no reconciliation process at all** [W01-F-OWN-12]; the outbox has no producer/consumer; N6/N7 have no worker (W0 §§3, 10, 12, 15).
5. **Deterministic job delegated to model judgment** — 69 of 78 agent-shaped roles are deterministic, workflow, merge or human by the anti-sprawl test (after refutation) [W01-F-OWN-13; role matrix].
6. **Agent without real owned outcome** — relationship_support, service_analytics, facility/service customer_communication [W01-F-OWN-14].
7. **Architecture names a job that has no implementation** — all 76 jobs (0 implemented); 32 manifests with no runtime; 7 AV manifests naming a department v1.8 lacks [W01-F-OWN-15, W01-F-AV-01].
8. **Implementation has a job not represented in v1.8** — N5/N6/N7 disclosure-and-transport chain, control-plane operator functions, migration authority, kill-switch operator, verified-actor binding [W01-F-PLAT-01].

## Part D — repository test infrastructure a future harness could build on, and what does not exist

**Exists (W0 §17):** the three-project Vitest topology with behavioural runtime probes; the dead-test sweep with positive controls; negative-control gates that plant a violation and assert the gate fires (`scripts/test/network-egress.test.ts`, `egress-allowlist-gate.test.ts`, `network-governance.test.ts`); catalog-assertion migrations that prove post-state (0029 §9, 0031 §3); N3 duplicate/identity-conflict tests; RLS and disclosure integration suites that would back simulation 07's platform assertions.

**Does not exist:** any scenario runner, fault injector, fixture corpus, acceptance oracle, `evals/` registry, JobCertification store, department simulation, or code path that could execute a job in the first place. **Finding W01-F-SIM-03:** WF-29..WF-35 cannot move from FAIL/NOT YET APPLICABLE by writing more simulation YAML; they require the design remediation (stubs → specifications), the W2 contracts, and a runtime that does not exist — in that order.
