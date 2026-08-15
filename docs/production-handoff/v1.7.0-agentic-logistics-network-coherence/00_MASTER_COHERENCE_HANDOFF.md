# 00 — FreightOS Agentic Logistics Network Master Coherence Handoff

## 1. North-star definition

FreightOS SHALL be engineered as:

> **A logistics-native agent operating system, interoperability protocol, and permissioned communications/execution network through which logistics organizations can automate their internal workflows and coordinate safely with one another.**

FreightOS is not merely:
- a dispatch application;
- a TMS;
- a load board;
- a digital broker;
- a facility system;
- a chatbot;
- an integration hub.

Those are customer-facing products/capabilities built on the same network kernel.

## 2. The coherent stack

```text
┌─────────────────────────────────────────────────────────────┐
│ CUSTOMER EXPERIENCES                                        │
│ Carrier Ops | Broker Ops | FacilityOS | Shipper | Service   │
├─────────────────────────────────────────────────────────────┤
│ PARTICIPANT OPERATIONAL TWINS                               │
│ COT | BOT | FOT | SOT | SPOT                                │
├─────────────────────────────────────────────────────────────┤
│ TENANT AGENT ORGANIZATIONS                                  │
│ canonical manifests + customer scopes + capability packs    │
├─────────────────────────────────────────────────────────────┤
│ DURABLE WORKFLOW GRAPH RUNTIME                              │
│ state + deadlines + approvals + recovery + reconciliation   │
├─────────────────────────────────────────────────────────────┤
│ IDENTITY / AUTHORITY / POLICY / LEGAL PLANES                │
│ deterministic; fail closed                                  │
├─────────────────────────────────────────────────────────────┤
│ FREIGHTOS NETWORK KERNEL                                    │
│ semantic model | events | intents | commands | evidence     │
├─────────────────────────────────────────────────────────────┤
│ ADAPTER + CONFORMANCE LAYER                                 │
│ API | webhooks | EDI | MCP | email/docs | legacy systems    │
├─────────────────────────────────────────────────────────────┤
│ EXISTING LOGISTICS SYSTEMS / COUNTERPARTIES                 │
└─────────────────────────────────────────────────────────────┘
```

## 3. One foundation, many customer jobs

A customer does not need to adopt the whole network vision.

### Carrier
"Automate dispatch and operations."

### Broker
"Automate RFQ-to-settlement brokerage work."

### Facility
"Automate appointment-to-receipt facility work."

### Shipper
"Automate transportation procurement, execution oversight, and exception management."

### Service provider
"Automate repair/roadside intake, scheduling, service execution, evidence, and billing."

Each experience is independently valuable.

## 4. Network compounding

Every customer deployment creates:
- verified participant identity;
- operational twin;
- agent organization;
- workflow endpoints;
- event subscriptions;
- counterparty relationships;
- conformance-tested integrations;
- reusable evidence/history.

This makes later direct agent-to-agent coordination easier than the first deployment.

## 5. Protocol over forced replacement

FreightOS SHALL integrate with existing TMS/WMS/YMS/ERP/ELD/CRM/accounting/maintenance systems.

Native FreightOS applications may eventually replace inferior workflows, but network participation must not require wholesale replacement.

## 6. Universal participant model

Every participant has:

```text
Identity
Organization / Legal Context
Operational Twin
Capabilities
Systems of Record
Policies
Agent Organization
Workflow Graphs
Authority Grants
Network Relationships
Evidence / Audit
```

The fields differ by participant profile, but the control model is common.

## 7. Universal execution doctrine

Every consequential automation follows:

```text
Observe
  ↓
Understand authoritative context
  ↓
Propose / plan
  ↓
Validate feasibility
  ↓
Authorize deterministically
  ↓
Human approval if required
  ↓
Execute through typed gateway
  ↓
Verify result
  ↓
Emit evidence/event
  ↓
Reconcile
```

## 8. Autonomy doctrine

`A0 Observe → A1 Recommend → A2 Prepare → A3 Approval-to-Execute → A4 Policy-Bounded Autonomy → A5 Exception-Supervised`

Autonomy is granted per:
tenant + legal plane + workflow + action class + scope + exposure.

## 9. Scale doctrine

The same conceptual model serves:
- one truck;
- one broker;
- one warehouse;
- one repair shop;
- a 100-truck fleet;
- a 10,000-truck enterprise;
- thousands of facilities;
- multimodal logistics networks.

Scale changes topology, partitioning, deployment cells, and worker count—not constitutional semantics.

## 10. Current sequencing

The north-star architecture is fully preserved, while implementation stays within the currently authorized FreightOS horizon/module states.

No design document can promote:
- Full FacilityOS;
- Digital Brokerage;
- exchange;
- regulated expansion;
- rail/ocean execution;
- autonomous red actions
without existing promotion/legal gates.
