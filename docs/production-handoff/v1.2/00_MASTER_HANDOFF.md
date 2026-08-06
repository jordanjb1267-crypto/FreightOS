# RIG FreightOS Master Production Handoff

## 1. Mission

Build a universal, governed freight operating system capable of progressing through these commercial stages without replacing its foundation. The complete architecture is preserved now, but implementation is governed by `21_SEQUENCING_DOCTRINE_AND_ACTIVE_SCOPE.md` and is currently limited to Horizon 1:

1. AI Dispatch Copilot
2. Carrier-controlled Autonomous Dispatch
3. Shipper Control Tower
4. Licensed Digital Brokerage
5. Autonomous Freight Exchange
6. Multimodal road–rail–ocean orchestration
7. Facility, yard, dock, custody, and receiving orchestration
8. Autonomous-vehicle mission and maintenance orchestration
9. Future air-cargo orchestration

FreightOS must operate for a one-truck owner-operator and for an enterprise controlling more than 100,000 active powered units.

## 2. Product thesis

FreightOS sells operational outcomes through role-specific applications, a durable freight ledger, deterministic policy controls, and tenant-isolated agent organizations.

```text
Customer applications
        ↓
Identity, tenant, and legal-context gateway
        ↓
Policy, risk, approval, and autonomy gate
        ↓
Freight domain command services
        ↓
Durable workflows and agent runtime
        ↓
External systems and communications
        ↓
Immutable audit and event ledger
```

## 3. Empire structure

### RigReceipts

Owns cost profiles, expenses, break-even and target RPM, cash-flow needs, lane profitability, rate observations, and expected-versus-actual economics.

### RIGDESK CarrierOS

Owns fleet structure, drivers, powered and nonpowered equipment, availability, maintenance readiness, breakdown operations, service-provider operations, carrier dispatch interfaces, and driver mobile experience.

### RIG FreightOS

Owns mode-neutral shipments and journeys, load opportunities, carrier planning, profitability scoring, negotiation, dispatch, shipment execution, documents, exceptions, autonomous workflows, agents, policies, audit, APIs, EDI, and MCP.

### RIG Freight Network

Owns shipper transport orders, brokerage quotes and tenders, carrier sourcing and allocation, brokerage records, exchange matching, network trust, claims, and settlement for regulated network operations.

### RIG FacilityOS

Owns inventory/cargo readiness, appointments, vehicle visits, gate/yard/dock coordination, facility capacity, loading/unloading evidence, custody, receiving, discrepancies, and facility integrations.

### RIG Autonomous Vehicle Operations

Owns provider-independent mission orchestration, ODD/readiness exchange, facility compatibility, remote-assistance coordination, autonomous mission exceptions, and RIGDESK maintenance handoff. It never controls the dynamic driving task.

## 4. Operating planes

### Carrier-Agent Plane

Acts for one appointed motor carrier at a time. It cannot allocate freight between unrelated carriers.

### Brokerage Plane

The authorized brokerage entity may receive shipper freight, select among carriers, negotiate both sides, tender shipments, record compensation, and manage brokerage transactions.

Credentials, queues, ledgers, contracts, bank accounts, and authority must remain separate.

## 5. System of record

The authoritative state is the transactional database and audit ledger.

Never authoritative:

- LLM conversation history
- Agent memory
- Prompt text
- Vector retrieval
- Email thread alone
- Model summaries
- UI-local state

Agents mutate business state only through typed commands that pass authorization and policy.

## 6. Universal freight model

The core commercial object is a `Shipment`.

A shipment is fulfilled by a `TransportJourney`, containing one or more `TransportLeg` records.

```text
Shipment
├── Consignments
├── Cargo and handling units
├── Commercial commitments
└── Transport Journey
    ├── Road Leg
    ├── Rail Leg
    ├── Ocean Leg
    └── Future Air Leg
```

No core table may assume one truck, one carrier, one leg, a road address, owned equipment, or closed freight/trailer enums.

## 7. Scale model

```text
Enterprise
└── Legal Entity
    └── Operating Authority
        └── Business Unit
            └── Region
                └── Terminal
                    └── Fleet
                        └── Driver and Equipment
```

Small accounts share regional cells. Strategic accounts may receive dedicated databases, workers, queues, encryption keys, and data residency.

## 8. Initial production slice

Ship first:

- Interstate road FTL
- Dry van
- Owner-operators and fleets
- Existing brokers
- Manual, email, document, and approved integration ingestion
- Profitability scoring
- Load ranking
- Multi-load planning
- Negotiation drafts
- Approval-to-send
- Driver-dispatch preparation
- Shipment status board
- Document chase
- Invoice preparation
- Post-load profit reconciliation
- Complete agent and policy audit

Exclude initially:

- Standalone FacilityOS
- Direct shipper procurement by RIG
- Cross-carrier allocation
- Brokerage fund handling or execution
- A4/A5 automatic load acceptance
- Public freight exchange
- Live autonomous-vehicle missions
- Claims settlement
- Rail, ocean, or air operational execution

Minimum facility primitives for appointments, vehicle visits, loading/unloading, custody, detention, goods receipt, and discrepancies are part of the initial carrier workflow. They are not authorization to build FacilityOS as a standalone product.

## 9. Architecture choice

Begin as a strict modular monolith with specialized workers and versioned boundaries.

Use:

- TypeScript strict mode
- pnpm workspace and Turborepo
- Next.js
- React Native
- Fastify
- PostgreSQL with row-level security
- SQL-first migrations
- Temporal for long-running consequential workflows
- PostgreSQL outbox plus managed queue initially
- CloudEvents-compatible envelopes
- OpenTelemetry
- S3-compatible object storage
- Provider-independent model gateway
- MCP as an adapter over governed domain capabilities

Extract modules only for scaling, compliance isolation, availability, credentials, or team ownership.

## 10. Commercial model

Carrier plans: Core, Copilot, Autonomous.

Pricing uses platform fees, active powered-unit fees, included autonomous operations, mode-specific meters, specialized packs, and enterprise services. It does not require per-seat billing or customer-visible AI-token billing.

## 11. Agent design

Each tenant receives an isolated agent organization:

- Chief Dispatch Orchestrator
- Capacity Agent
- Load Discovery Agent
- Profitability Agent
- Planning Agent
- Negotiation Agent
- Feasibility Agent
- Dispatch Agent
- Tracking Agent
- Exception Agent
- Documentation Agent
- Settlement Agent
- Risk Agent

Each has a versioned manifest, tools, authority mode, maximum autonomy, prohibited actions, escalations, evaluations, and rollback.

## 12. Autonomy

- A0 Observe
- A1 Recommend
- A2 Prepare
- A3 Approval-to-Execute
- A4 Policy-Bounded Autonomy
- A5 Exception-Supervised Operation

Autonomy is granted per tenant, action, workflow, legal plane, exposure, confidence, equipment, and counterparty.

## 13. Deterministic controls

AI may interpret, rank, plan, negotiate, classify, and explain.

AI cannot be sole authority for identity, access, legal mode, permissions, rate floors, exposure, eligibility, contract state, money movement, invoice arithmetic, kill switches, or retention.

## 14. Multimodal strategy

Road ships first. Rail and ocean are independent adapters mapping to the universal core. Air remains a protected extension.

Each adapter defines entities, data, state machines, documents, events, exceptions, meters, policies, tools, connectors, standards, and fixtures.

## 15. Release horizons

### Horizon 1 — Current authorized implementation

- Phase 0: Constitution, repository, schemas, scope registry, threat model
- Phase 1: Universal core, road FTL carrier foundation, minimum facility primitives
- Phase 2: AI Dispatch Copilot
- Phase 3: Selected A3 Approval-to-Execute and production hardening

### Horizon 2 — Promotion gated

- Selected A4 Carrier Autonomous Dispatch
- FacilityOS Lite
- Shipper and receiver collaboration

### Horizon 3 — Conditional expansion

- Full FacilityOS
- Licensed Digital Brokerage
- Autonomous Vehicle partner integration
- Road–rail intermodal and port drayage
- Ocean visibility and orchestration

### Horizon 4 — Network evolution

- Autonomous corridors
- Multimodal brokerage
- Autonomous Freight Exchange
- Global multimodal orchestration
- Future air operations

Claude must stop after Horizon 1 until an owner-approved promotion ADR updates the module registry.
## 16. Production-ready definition

A phase is not production ready until threats are modeled, migrations recover, tenant isolation passes, commands are idempotent, workflows recover, agents pass evaluations, policies are auditable, kill switches and restores are tested, runbooks and alerts exist, legal gates pass, and the exact release commit is clean and tagged.

## 15. Physical logistics and autonomous mobility

FreightOS closes the loop from inventory readiness through facility service, vehicle mission, receiver acceptance, settlement, and maintenance. FacilityOS and the Autonomous Vehicle Gateway use the universal freight ledger and event architecture.

Safety boundary:

- FreightOS controls the commercial mission and operational handoff.
- ADS providers control the dynamic driving task, ODD, readiness, fallback, and minimal-risk operation.
- Facility controllers and authorized humans control robotics, PLCs, conveyors, doors, restraints, and safety interlocks.
- No agent, MCP tool, approval, or feature flag can grant FreightOS physical-motion authority.

Implementation proceeds through Facility Connectivity, Facility Copilot, Facility Automation, AV Shadow, Supervised Missions, Autonomous Corridors, and the Closed-Loop Physical Freight Network.

## Security, Privacy, Resilience, and Autonomous Repair Control Package

The controlling requirements for FreightOS security, privacy, tenant isolation, zero-trust identity and authorization, reliability, disaster recovery, secure software delivery, incident response, AI-agent authority, and bounded autonomous remediation are located at:

`docs/production-handoff/v1.3.0-security-resilience/`

This package is additive. Where a prior implementation preference conflicts with a non-regression requirement in that package, the stricter security, privacy, reliability, resilience, or authority requirement controls. Major architecture or product-scope conflicts must be escalated and documented rather than resolved silently.
