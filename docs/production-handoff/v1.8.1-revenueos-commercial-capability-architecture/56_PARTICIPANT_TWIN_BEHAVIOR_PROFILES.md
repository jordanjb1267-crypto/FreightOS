# 56 — Participant Twin Behavior Profiles

This file specifies how the common Twin interaction fabric specializes without creating separate foundations.

## Carrier Operational Twin (COT)

**Existing-system coexistence:** TMS, load boards/work sources, ELD/telematics, routing, maintenance systems, accounting/factoring, email/docs.

**Human augmentation:** dispatch queues, load/economics recommendations, assignment drafts, exception desk, document/status automation, maintenance coordination.

**Network inputs:** tenders, appointment responses, facility readiness, shipper/broker requests, service-provider updates, FMI context.

**Network outputs:** capacity, tender responses, ETA/milestones, exceptions, documents, appointment requests, asset-readiness/service status subject to disclosure policy.

**Critical rule:** TMS coexistence can remain permanent; FreightOS need not become the TMS system of record to provide agent/network value.

## Broker Operational Twin (BOT)

**Coexistence:** brokerage TMS, CRM, email, load boards/carrier networks, accounting/settlement, compliance/qualification sources.

**Human augmentation:** RFQ triage, pricing context, carrier sourcing, qualification evidence, negotiation drafts, coverage desk, tracking/exception/document reconciliation.

**Network:** shipper requests/quotes, carrier requests/tenders, facility coordination, evidence and execution events.

**Critical rule:** Brokerage Plane authority remains structurally separate; Twin/network convenience cannot erase regulated broker controls.

## Facility Operational Twin (FOT)

**Coexistence:** WMS/YMS/ERP, dock/yard systems, appointment tools, gate systems, email/docs, safety/physical controllers.

**Human augmentation:** appointment desk, arrival/readiness, document intake, yard/dock recommendations, shipping/receiving exception coordination.

**Network:** readiness, appointments, arrival/check-in status, dock/custody evidence, detention/discrepancy events.

**Critical rule:** physical/safety authority and authoritative WMS/YMS state remain independently governed; FreightOS may coordinate without replacing them.

## Shipper Operational Twin (SOT)

**Coexistence:** ERP/TMS/procurement, order management, supplier portals, warehouse systems, finance.

**Human augmentation:** transportation intake, routing/tender recommendations, visibility/control tower, exception and invoice review.

**Network:** shipment intent/tenders, requirements, status requests, exception coordination, settlement evidence.

## Service Provider Operational Twin (SPOT / RigDesk context)

**Coexistence:** shop/dealer/DMS/field-service systems, scheduling, parts inventory, OEM/provider networks, accounting.

**Human augmentation:** service intake, triage, capacity/scheduling, estimate drafting, status/evidence, parts/service coordination.

**Network:** service requests, acceptance/capacity, estimate/status, completion/evidence/billing artifacts.

**Critical rule:** diagnostic intelligence does not itself authorize repair spending, towing, or physical service actions.

## Common user experience

Each profile exposes the same conceptual controls with domain-specific labels:

- My work;
- Agent work;
- Needs approval;
- Exceptions;
- Network inbox/outbox;
- System health/sync;
- Twin knowledge/configuration;
- workflow mode/autonomy;
- evidence/audit.
