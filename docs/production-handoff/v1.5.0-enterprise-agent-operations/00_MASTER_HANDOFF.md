# 00 — FreightOS Enterprise Agent Operations Master Handoff

## 1. Executive mandate

FreightOS SHALL support rapid, governed deployment of a tenant-isolated agent organization into any logistics company without requiring the company to abandon its existing TMS, ERP, ELD, telematics, email, spreadsheets, maintenance systems, rail systems, ocean systems, or operating vocabulary.

The first commercial wedge SHOULD be **operations automation**:
- owner-operator back-office automation;
- dispatch preparation and dispatch orchestration;
- driver/asset coordination;
- document and exception handling;
- maintenance readiness;
- repair and roadside orchestration;
- settlement preparation and reconciliation;
- progressively autonomous carrier operations.

The same architecture MUST scale from one operator and one truck to enterprises controlling very large fleets and multimodal networks.

## 2. Customer-specific without customer forks

FreightOS MUST distinguish:

```text
Canonical FreightOS Product
        │
        ├── Tenant topology
        ├── Company Operational Twin
        ├── Workflow definitions
        ├── Agent manifests
        ├── Authority/autonomy grants
        ├── Integration adapters
        ├── Mode capability packs
        ├── Vocabulary mappings
        └── Customer policies
```

Customer-specific behavior MUST primarily be data/configuration/policy/workflow composition over versioned canonical capabilities.

A customer's SOP MUST NOT become a hidden prompt-only fork.

## 3. Company Operational Twin

Every production tenant receives a versioned, inspectable **Company Operational Twin (COT)** describing:
- organization and legal entities;
- business units, terminals, fleets, departments, regions;
- human roles and escalation owners;
- assets, capabilities, relationships, and operating modes;
- systems of record and integrations;
- dispatch models and shift structure;
- service and maintenance processes;
- document flows;
- operational vocabulary;
- customer SOPs and approval thresholds;
- decision policies;
- exception taxonomy;
- communication channels;
- regulatory/legal operating context;
- known uncertainties and unresolved mappings.

The customer can inspect, correct, approve, version, and diff this twin.

The COT is authoritative configuration only after explicit validation; model memory is never the source of truth.

## 4. Tenant Agent Organization

Each tenant receives an isolated agent organization generated from:
- tenant topology;
- enabled capability packs;
- workflows;
- COT;
- authority grants;
- autonomy certification;
- integrations;
- SLA/SLO class.

Agents do not gain authority from role names. Each agent uses a versioned manifest and deterministic policy authorization.

## 5. Operational graphs

FreightOS SHALL represent consequential automation as typed durable graphs.

Required graph families:
- company-discovery and configuration;
- dispatch;
- load/mission planning;
- tracking and execution;
- exceptions;
- documentation;
- communications;
- maintenance/repair/roadside;
- settlement/reconciliation;
- back office;
- customer approvals/escalations;
- agent evaluation;
- incident recovery.

A free-form multi-agent chat is not an operational graph.

## 6. Launch path

Recommended commercial deployment ladder:

### L0 — Connect + Understand
Map company, systems, workflows, terminology, permissions.

### L1 — Observe
Read-only operational intelligence.

### L2 — Prepare
Agents prepare actions, messages, plans, documents, assignments.

### L3 — Approval-to-Execute
Human approves exact bounded action; FreightOS executes and verifies.

### L4 — Policy-Bounded Autonomy
Selected low/medium-risk actions execute automatically inside approved policy.

### L5 — Exception-Supervised Operation
Humans primarily handle exceptions, strategic decisions, and high-risk actions.

Autonomy is granted per workflow/action, not as one blanket tenant switch.

## 7. Scale invariant

The logical workflow SHALL remain recognizable at every scale.

One truck:
```text
Owner
  ├── FreightOS Dispatcher/Back-Office Agent
  ├── Driver/Asset = owner + truck
  ├── one or few integrations
  └── owner approval
```

Large carrier:
```text
Enterprise
  ├── Regions
  │   ├── Terminals
  │   │   ├── Fleets
  │   │   ├── Dispatch pods
  │   │   └── service teams
  ├── Central planning
  ├── Network operations
  ├── Maintenance operations
  └── tenant agent organization sharded by scope
```

The platform scales topology and execution partitioning, not product semantics.

## 8. Multimodal invariant

Core state remains mode-neutral. Road, rail, ocean, and future mode packs define:
- capabilities;
- specialized entities;
- documents;
- events;
- workflows;
- constraints;
- connectors;
- terminology;
- evaluations.

## 9. Enterprise productization invariant

Every feature must be evaluated as though FreightOS may need to:
- sell it as SaaS;
- deploy it in a dedicated tenant/cell;
- integrate into an enterprise;
- support contractual SLOs;
- expose audited APIs;
- preserve customer data ownership;
- upgrade without customer forks;
- migrate configurations;
- demonstrate controls to security/procurement teams.

## 10. Existing control packages

This package does not supersede:
- zero-trust identity;
- structural tenant isolation;
- authority boundaries;
- event idempotency and reconciliation;
- security/resilience;
- network protocols;
- multimodal canonical domain model;
- audit/observability;
- regulated brokerage separation.

If a conflict appears, choose the stricter existing safety/security rule and escalate the architecture conflict explicitly.
