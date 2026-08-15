# RIG FacilityOS Enterprise Agent Operations Handoff v1.0.0

**Status:** additive production architecture / implementation-control package  
**Date:** 2026-08-14  
**Activation:** this package does not override the existing FreightOS sequencing doctrine. Full FacilityOS remains promotion/customer-gated until the controlling FreightOS gates explicitly authorize implementation.

## Purpose

FacilityOS is the governed operating system and network endpoint for physical logistics facilities.

It must allow:
- a small shipping/receiving operation;
- a single warehouse;
- a carrier terminal;
- a distribution center;
- a manufacturing shipping department;
- a port/ramp/terminal-adjacent operation;
- a large enterprise with thousands of facilities

to connect its current systems, teach FacilityOS how the location operates, inspect/correct that understanding, and progressively automate appointment, gate, yard, dock, shipping, receiving, document, BOL, custody, detention, discrepancy, and facility-communication workflows.

## Central architecture

```text
Canonical FacilityOS
        +
Facility Operational Twin
        +
Facility Agent Organization
        +
Typed Durable Workflow Graphs
        +
Facility Policies / Authority
        +
Integration Adapters
        +
Capability Packs
        ↓
Customer-specific facility operations
without customer-specific product forks
```

## Critical new first-class workflow

A driver's **Bill of Lading submission to a shipping or receiving office** is a governed document/evidence workflow, not a generic upload.

FacilityOS must support:
- pre-arrival document exchange;
- driver mobile submission;
- QR/scoped-link submission;
- office scan/manual capture;
- EDI/API ingestion where available;
- X12 211 mapping where applicable;
- document hashing/versioning;
- extraction and validation;
- shipment/appointment/visit correlation;
- shipping/receiving-office review;
- rejection/correction/supersession;
- signatures/acknowledgements as evidence;
- custody and goods-receipt state as separate governed transitions;
- digital copies/receipts to authorized parties;
- offline/manual degraded operation followed by reconciliation.

## Physical-safety boundary

FacilityOS may coordinate targets, queues, appointments, work, documents, credentials, and commercial/operational state.

It SHALL NOT directly control:
- forklifts;
- yard tractors;
- conveyors;
- cranes;
- AS/RS;
- dock restraints;
- doors;
- PLCs;
- safety interlocks;
- physical-motion systems.

## Existing-system posture

FacilityOS integrates with existing ERP/WMS/YMS/WES/TMS/access-control/document systems. Initial adoption must not require replacing them.

## Repository destination

```text
docs/production-handoff/facilityos/v1.0.0-enterprise-agent-operations/
```

## Read order

1. `00_MASTER_HANDOFF.md`
2. `01_FACILITYOS_CONSTITUTION.md`
3. `02_FACILITY_OPERATIONAL_TWIN.md`
4. `03_FACILITY_AGENT_ORGANIZATION_FACTORY.md`
5. `04_FACILITY_WORKFLOW_GRAPH_STANDARD.md`
6. `05_VEHICLE_VISIT_AND_DRIVER_EXPERIENCE.md`
7. `06_BOL_DOCUMENT_AND_OFFICE_EXCHANGE.md`
8. `07_SHIPPING_ORIGIN_OPERATIONS.md`
9. `08_RECEIVING_DESTINATION_OPERATIONS.md`
10. `09_GATE_YARD_DOCK_ORCHESTRATION.md`
11. `10_CUSTODY_EVIDENCE_AND_TRACEABILITY.md`
12. `11_APPOINTMENTS_CAPACITY_AND_DETENTION.md`
13. `12_DISCREPANCY_EXCEPTION_AND_CLAIMS_EVIDENCE.md`
14. `13_INTEGRATIONS_AND_STANDARDS.md`
15. `14_CUSTOMER_CONTROL_AND_EXPLAINABILITY.md`
16. `15_AUTONOMY_SHADOW_AND_CERTIFICATION.md`
17. `16_ENTERPRISE_SCALE_AND_MULTI_FACILITY.md`
18. `17_FREIGHTOS_NETWORK_COMMUNICATION.md`
19. `18_SECURITY_PRIVACY_AND_DATA_GOVERNANCE.md`
20. `19_OBSERVABILITY_AND_OUTCOMES.md`
21. `20_CUSTOMER_IMPLEMENTATION_AND_GO_LIVE.md`
22. `21_ACCEPTANCE_GATES.md`
23. `22_IMPLEMENTATION_ROADMAP.md`
24. `23_CLAUDE_MASTER_IMPLEMENTATION_PROMPT.md`
25. contracts, diagrams, templates, source registry.

## Non-regression

Do not modify earlier FreightOS or FacilityOS architecture files simply to install this package.
