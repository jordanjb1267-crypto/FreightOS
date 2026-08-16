# Handoff Edge Inventory — v1.8.0 W1

**Status:** W1 audit deliverable. **Baseline:** `main` @ `09624b9`. **Branch:** `audit/v1.8.0-workforce-w0-w1`. **Date:** 2026-08-15.

> A gate cannot be PASS when evidence exists only in an unmerged branch, mock, or document. — v1.4.0 `24_ACCEPTANCE_GATES_EVIDENCE_MATRIX.md`

## Method and repository reality

Three design sources were merged mechanically: `matrices/interaction_matrix.csv` (73 rows), every `upstream`/`downstream` pair in the 76 Job Book JSON files (89 directed edges), and the six `diagrams/*_interaction_atlas.mmd` files (61 edges). The union is **89 distinct edges**; the CSV is a strict subset of the Job Book edges (0 CSV edges missing from books; 16 book edges missing from the CSV; 12 CSV edges missing from the diagrams). Every CSV row carries the same contract string — `typed Handoff/Request/Proposal; receiver validates before ownership transfer` — so no edge specifies which of the ten permitted artifact types of `04_AGENT_INTERACTION_ATLAS.md` (Observation, Request, Proposal, DecisionResult, ApprovalRequest, CommandRequest, Exception, Handoff, EvidenceReference, CompletionNotice) it carries.

**Repository:** no typed handoff schema, WorkUnit, ownership record or acceptance state exists in `packages/schemas`, `schemas/` or any migration (W0 §2: `WorkUnit|work_unit|job_handoff|JobHandoff|handoffId` → 0 hits; no `CREATE TABLE … handoff`). The v1.8 `contracts/job_handoff.schema.json` is design only and leaves `acceptanceState` (`PENDING|ACCEPTED|REJECTED|EXPIRED`) **optional**, contradicting WF-14 ("explicitly accepted/rejected") and WF-15 ("sender retains ownership until accepted") — the gate text is stricter and governs (C-13). Every edge below is therefore **untyped and unimplemented**; the columns record only what the design declares.

## Coverage by department

| Dept | Jobs | Job-book edges (from) | CSV edges | Diagram edges | Jobs with zero edges | Typed schema in repo |
| ---- | ---- | --------------------- | --------- | ------------- | -------------------- | -------------------- |

| Carrier | 14 | 34 | 32 | 29 | 0 | none |
| Brokerage | 22 | 49 | 41 | 32 | 1 | none |
| Facility | 18 | 0 | 0 | 0 | 18 | none |
| Shipper | 12 | 0 | 0 | 0 | 12 | none |
| Service Provider | 10 | 0 | 0 | 0 | 10 | none |
| external actors / systems named as endpoints | — | 6 | 0 | 0 | — | none |

## Edge table (union of the three sources)

Legend: "network boundary" marks an edge whose endpoints belong to different participants (v1.7: "Agent A never directly acquires Agent B's permissions"; the receiving participant independently evaluates the artifact). Endpoints not matching a v1.8 job name are external actors, human roles or systems declared in Job Books.

| Edge (from → to)                                                     | Dept(s)     | In CSV | In job books | In diagram | Cross-department | Cross-participant? |
| -------------------------------------------------------------------- | ----------- | ------ | ------------ | ---------- | ---------------- | ------------------ |
| Carrier Documentation Agent → Broker Documentation Agent             | ?/brokerage | —      | Y            | —          | Y                | network boundary   |
| FacilityOS → Broker Documentation Agent                              | ?/brokerage | —      | Y            | —          | Y                | network boundary   |
| FacilityOS → Carrier Exception Agent                                 | ?/carrier   | —      | Y            | —          | Y                | —                  |
| FacilityOS Document/BOL Agent → Documentation Agent                  | ?/carrier   | —      | Y            | —          | Y                | —                  |
| RigDesk → Carrier Exception Agent                                    | ?/carrier   | —      | Y            | —          | Y                | —                  |
| RigDesk → Maintenance Readiness Agent                                | ?/carrier   | —      | Y            | —          | Y                | —                  |
| Accessorial Agent → Carrier Pay/Reconciliation Agent                 | brokerage   | Y      | Y            | Y          | —                | —                  |
| Accessorial Agent → Shipper Billing Agent                            | brokerage   | Y      | Y            | Y          | —                | —                  |
| Allocation Agent → Tender/Booking Agent                              | brokerage   | Y      | Y            | Y          | —                | —                  |
| Broker Configuration Steward → Human Admin/Architecture              | brokerage/? | Y      | Y            | —          | Y                | network boundary   |
| Broker Documentation Agent → Accessorial Agent                       | brokerage   | Y      | Y            | Y          | —                | —                  |
| Broker Documentation Agent → Carrier Pay/Reconciliation Agent        | brokerage   | Y      | Y            | Y          | —                | —                  |
| Broker Documentation Agent → Claims/Evidence Agent                   | brokerage   | —      | Y            | —          | —                | —                  |
| Broker Documentation Agent → Shipper Billing Agent                   | brokerage   | Y      | Y            | Y          | —                | —                  |
| Broker Negotiation Agent → Allocation Agent                          | brokerage   | Y      | Y            | Y          | —                | —                  |
| Broker Negotiation Agent → Margin Risk Service                       | brokerage   | —      | Y            | —          | —                | —                  |
| Broker Negotiation Agent → Tender/Booking Agent                      | brokerage   | Y      | Y            | Y          | —                | —                  |
| Broker Shipment Execution Agent → Accessorial Agent                  | brokerage   | Y      | Y            | Y          | —                | —                  |
| Broker Shipment Execution Agent → Broker Documentation Agent         | brokerage   | Y      | Y            | Y          | —                | —                  |
| Broker Shipment Execution Agent → Claims/Evidence Agent              | brokerage   | —      | Y            | —          | —                | —                  |
| Broker Shipment Execution Agent → Facility Coordination Agent        | brokerage   | Y      | Y            | Y          | —                | —                  |
| Broker Shipment Execution Agent → Tracking/Communication Agent       | brokerage   | Y      | Y            | Y          | —                | —                  |
| Broker Transaction Record Service → Compliance Supervisor Agent      | brokerage   | Y      | Y            | Y          | —                | —                  |
| Brokerage Operations Orchestrator → Broker Shipment Execution Agent  | brokerage   | Y      | Y            | Y          | —                | —                  |
| Brokerage Operations Orchestrator → Carrier Sourcing Agent           | brokerage   | Y      | Y            | Y          | —                | —                  |
| Brokerage Operations Orchestrator → Compliance Supervisor Agent      | brokerage   | Y      | Y            | Y          | —                | —                  |
| Brokerage Operations Orchestrator → Shipper Intake Agent             | brokerage   | Y      | Y            | Y          | —                | —                  |
| Brokerage Operations Orchestrator → Shipper Pricing Agent            | brokerage   | Y      | Y            | Y          | —                | —                  |
| Carrier Pay/Reconciliation Agent → Broker Transaction Record Service | brokerage   | —      | Y            | —          | —                | —                  |
| Carrier Pay/Reconciliation Agent → Finance/Payment System            | brokerage/? | Y      | Y            | —          | Y                | network boundary   |
| Carrier Qualification Agent → Allocation Agent                       | brokerage   | Y      | Y            | Y          | —                | —                  |
| Carrier Qualification Agent → Broker Negotiation Agent               | brokerage   | Y      | Y            | Y          | —                | —                  |
| Carrier Qualification Agent → Compliance Supervisor Agent            | brokerage   | Y      | Y            | Y          | —                | —                  |
| Carrier Sourcing Agent → Carrier Qualification Agent                 | brokerage   | Y      | Y            | Y          | —                | —                  |
| Claims/Evidence Agent → Human Claims/Legal                           | brokerage/? | Y      | Y            | —          | Y                | network boundary   |
| Compliance Supervisor Agent → Brokerage Operations Orchestrator      | brokerage   | Y      | Y            | Y          | —                | —                  |
| Compliance Supervisor Agent → Human Compliance                       | brokerage/? | Y      | Y            | —          | Y                | network boundary   |
| Facility Coordination Agent → Accessorial Agent                      | brokerage   | —      | Y            | —          | —                | —                  |
| Facility Coordination Agent → FacilityOS                             | brokerage/? | Y      | Y            | —          | Y                | network boundary   |
| Facility Coordination Agent → Tracking/Communication Agent           | brokerage   | Y      | Y            | Y          | —                | —                  |
| Margin Risk Service → Allocation Agent                               | brokerage   | Y      | Y            | Y          | —                | —                  |
| Margin Risk Service → Compliance Supervisor Agent                    | brokerage   | Y      | Y            | Y          | —                | —                  |
| Requirements Agent → Carrier Qualification Agent                     | brokerage   | Y      | Y            | Y          | —                | —                  |
| Requirements Agent → Carrier Sourcing Agent                          | brokerage   | Y      | Y            | Y          | —                | —                  |
| Requirements Agent → Shipper Pricing Agent                           | brokerage   | Y      | Y            | Y          | —                | —                  |
| Shipper Billing Agent → Accounting                                   | brokerage/? | Y      | Y            | —          | Y                | network boundary   |
| Shipper Billing Agent → Broker Transaction Record Service            | brokerage   | —      | Y            | —          | —                | —                  |
| Shipper Intake Agent → Requirements Agent                            | brokerage   | Y      | Y            | Y          | —                | —                  |
| Shipper Pricing Agent → Broker Negotiation Agent                     | brokerage   | —      | Y            | —          | —                | —                  |
| Shipper Pricing Agent → Carrier Sourcing Agent                       | brokerage   | Y      | Y            | Y          | —                | —                  |
| Shipper Pricing Agent → Margin Risk Service                          | brokerage   | —      | Y            | —          | —                | —                  |
| Tender/Booking Agent → Broker Shipment Execution Agent               | brokerage   | Y      | Y            | Y          | —                | —                  |
| Tender/Booking Agent → Carrier Agent Organization                    | brokerage/? | Y      | Y            | —          | Y                | network boundary   |
| Tracking/Communication Agent → Broker Exception workflow             | brokerage/? | Y      | Y            | —          | Y                | network boundary   |
| Tracking/Communication Agent → Shipper                               | brokerage/? | Y      | Y            | —          | Y                | network boundary   |
| Capacity Agent → Feasibility Engine                                  | carrier     | Y      | Y            | Y          | —                | —                  |
| Capacity Agent → Planning Agent                                      | carrier     | Y      | Y            | Y          | —                | —                  |
| Carrier Exception Agent → Documentation Agent                        | carrier     | Y      | Y            | Y          | —                | —                  |
| Carrier Exception Agent → Planning Agent                             | carrier     | Y      | Y            | Y          | —                | —                  |
| Carrier Exception Agent → Settlement/Reconciliation Agent            | carrier     | Y      | Y            | Y          | —                | —                  |
| Carrier Negotiation Agent → Dispatch Agent                           | carrier     | Y      | Y            | Y          | —                | —                  |
| Carrier Risk & Compliance Agent → Carrier Exception Agent            | carrier     | Y      | Y            | Y          | —                | —                  |
| Carrier Risk & Compliance Agent → Human Compliance                   | carrier/?   | Y      | Y            | —          | Y                | —                  |
| Chief Dispatch Orchestrator → Capacity Agent                         | carrier     | —      | Y            | —          | —                | —                  |
| Chief Dispatch Orchestrator → Carrier Exception Agent                | carrier     | Y      | Y            | Y          | —                | —                  |
| Chief Dispatch Orchestrator → Dispatch Agent                         | carrier     | Y      | Y            | Y          | —                | —                  |
| Chief Dispatch Orchestrator → Load Discovery Agent                   | carrier     | Y      | Y            | Y          | —                | —                  |
| Chief Dispatch Orchestrator → Planning Agent                         | carrier     | Y      | Y            | Y          | —                | —                  |
| Dispatch Agent → Carrier Exception Agent                             | carrier     | Y      | Y            | Y          | —                | —                  |
| Dispatch Agent → Tracking Agent                                      | carrier     | Y      | Y            | Y          | —                | —                  |
| Documentation Agent → Settlement/Reconciliation Agent                | carrier     | Y      | Y            | Y          | —                | —                  |
| Feasibility Engine → Dispatch Agent                                  | carrier     | Y      | Y            | Y          | —                | —                  |
| Feasibility Engine → Planning Agent                                  | carrier     | Y      | Y            | Y          | —                | —                  |
| Load Discovery Agent → Feasibility Engine                            | carrier     | Y      | Y            | Y          | —                | —                  |
| Load Discovery Agent → Planning Agent                                | carrier     | Y      | Y            | Y          | —                | —                  |
| Load Discovery Agent → Profitability Engine                          | carrier     | Y      | Y            | Y          | —                | —                  |
| Maintenance Readiness Agent → Capacity Agent                         | carrier     | Y      | Y            | Y          | —                | —                  |
| Maintenance Readiness Agent → Carrier Exception Agent                | carrier     | Y      | Y            | Y          | —                | —                  |
| Maintenance Readiness Agent → Feasibility Engine                     | carrier     | Y      | Y            | Y          | —                | —                  |
| Planning Agent → Carrier Negotiation Agent                           | carrier     | Y      | Y            | Y          | —                | —                  |
| Planning Agent → Dispatch Agent                                      | carrier     | Y      | Y            | Y          | —                | —                  |
| Planning Agent → Feasibility Engine                                  | carrier     | —      | Y            | —          | —                | —                  |
| Profitability Engine → Carrier Negotiation Agent                     | carrier     | Y      | Y            | Y          | —                | —                  |
| Profitability Engine → Planning Agent                                | carrier     | Y      | Y            | Y          | —                | —                  |
| Profitability Engine → Settlement/Reconciliation Agent               | carrier     | Y      | Y            | Y          | —                | —                  |
| Settlement/Reconciliation Agent → Accounting                         | carrier/?   | Y      | Y            | —          | Y                | —                  |
| Settlement/Reconciliation Agent → RigReceipts                        | carrier/?   | Y      | Y            | —          | Y                | —                  |
| Tracking Agent → Carrier Exception Agent                             | carrier     | Y      | Y            | Y          | —                | —                  |
| Tracking Agent → Documentation Agent                                 | carrier     | Y      | Y            | Y          | —                | —                  |

## Free-form / untyped edges

All 89 edges. None names an artifact type; the CSV contract string is boilerplate; no schema exists in the repository. **Finding W01-F-EDGE-01:** WF-07 ("every output/handoff is typed") is unmet at design level for every edge and unmet at implementation level entirely.

## Cross-participant edges (network boundary)

11 edges cross a participant boundary in the design (carrier↔brokerage, brokerage↔facility, carrier↔service provider, plus edges to `Shipper`, `FacilityOS`, `RigDesk`, `RigReceipts` as external endpoints). Under v1.7 `04_…` and `12_…` each side owns its internal decision and the artifact terminates at the FreightOS Network boundary; nothing in the repository yet routes such an artifact (N6/N7 exist as decision functions and a permit control plane without a worker — W0 §§10, 12).

## Discrepancies between CSV, Job Books and diagrams

- Job-book edges absent from the CSV (16): `Broker Documentation Agent → Claims/Evidence Agent`; `Broker Negotiation Agent → Margin Risk Service`; `Broker Shipment Execution Agent → Claims/Evidence Agent`; `Carrier Documentation Agent → Broker Documentation Agent`; `Carrier Pay/Reconciliation Agent → Broker Transaction Record Service`; `Chief Dispatch Orchestrator → Capacity Agent`; `Facility Coordination Agent → Accessorial Agent`; `FacilityOS → Broker Documentation Agent`; `FacilityOS → Carrier Exception Agent`; `FacilityOS Document/BOL Agent → Documentation Agent`; `Planning Agent → Feasibility Engine`; `RigDesk → Carrier Exception Agent`; `RigDesk → Maintenance Readiness Agent`; `Shipper Billing Agent → Broker Transaction Record Service`; `Shipper Pricing Agent → Broker Negotiation Agent`; `Shipper Pricing Agent → Margin Risk Service`.
- CSV edges absent from the diagrams (12): `Broker Configuration Steward → Human Admin/Architecture`; `Carrier Pay/Reconciliation Agent → Finance/Payment System`; `Carrier Risk & Compliance Agent → Human Compliance`; `Claims/Evidence Agent → Human Claims/Legal`; `Compliance Supervisor Agent → Human Compliance`; `Facility Coordination Agent → FacilityOS`; `Settlement/Reconciliation Agent → Accounting`; `Settlement/Reconciliation Agent → RigReceipts`; `Shipper Billing Agent → Accounting`; `Tender/Booking Agent → Carrier Agent Organization`; `Tracking/Communication Agent → Broker Exception workflow`; `Tracking/Communication Agent → Shipper`.
- Naming drift across departments: brokerage books reference `Carrier Documentation Agent` (the carrier job is named `Documentation Agent`) and `FacilityOS Document/BOL Agent` (facility job `Document/BOL Agent`); external endpoints `Accounting`, `Finance/Payment System`, `Human Admin/Architecture`, `Human Claims/Legal`, `Human Compliance`, `Carrier Agent Organization`, `Broker Exception workflow`, `Shipper`, `FacilityOS`, `RigDesk`, `RigReceipts` appear only in Job Books, never in the CSV or diagrams. **Finding W01-F-EDGE-02:** three sources, three edge sets — WF-38 ("unregistered agent-interaction edges fail CI") has no registry to fail against.

## Zero-edge departments and jobs

Facility (18), Shipper (12) and Service Provider (10) declare **no** interaction edges in any source; brokerage `relationship_support` declares none. 41 jobs are orphans in the design graph: `brokerage/relationship_support`, `facility/appointment`, `facility/capacity_labor`, `facility/cargo_readiness`, `facility/configuration_steward`, `facility/custody_evidence`, `facility/customer_communication`, `facility/detention`, `facility/discrepancy`, `facility/dock`, `facility/document_bol`, `facility/driver_coordination`, `facility/facility_exception`, `facility/gate`, `facility/load_unload_verification`, `facility/operations_orchestrator`, `facility/receiving_office`, `facility/shipping_office`, `facility/yard`, `service_provider/appointment_dispatch`, `service_provider/capacity`, `service_provider/customer_communication`, `service_provider/eligibility`, `service_provider/estimate`, `service_provider/evidence`, `service_provider/invoice_reconciliation`, `service_provider/parts_dependency`, `service_provider/service_intake`, `service_provider/work_status`, `shipper/documentation`, `shipper/exception`, `shipper/facility_coordination`, `shipper/invoice_audit`, `shipper/provider_selection`, `shipper/quote_analysis`, `shipper/requirements`, `shipper/routing_guide`, `shipper/service_analytics`, `shipper/shipment_intake`, `shipper/tender`, `shipper/tracking`. **Finding W01-F-EDGE-03:** these departments cannot be certified against WF-12..WF-15 or simulated (WF-31..WF-33) until edges exist — a design gap, not an implementation gap.

## What a typed-handoff runtime would have to enforce (requirements only)

One accountable owner per WorkUnit; handoff carries `fromJob`, `toJob`, `workUnitId`, `artifactRef` + version, `expectedNextState`, `deadline`, and a **required** `acceptanceState`; receiver validates tenant/legal plane, artifact schema/version, subject identity, evidence, freshness, authority and expected state before ownership transfers; rejection leaves ownership with the sender; expiry re-routes or escalates; every edge registered so an unregistered edge fails CI (WF-38); cross-participant edges terminate at the network boundary and are re-evaluated by the receiver under its own authority.
