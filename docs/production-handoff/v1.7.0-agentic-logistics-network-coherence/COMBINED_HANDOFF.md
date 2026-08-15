# FreightOS Agentic Logistics Network Coherence Handoff v1.7.0 — Combined

Individual package files are controlling. This additive coherence package does not replace prior accepted FreightOS/FacilityOS/Brokerage handoffs.


---

<!-- SOURCE: 00_MASTER_COHERENCE_HANDOFF.md -->

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


---

<!-- SOURCE: 01_PRODUCT_CATEGORY_AND_POSITIONING.md -->

# 01 — Product Category and Positioning

## Category statement

**FreightOS — The agentic operating and communications network for logistics.**

## Two-value proposition

### Internal automation
"Give your logistics organization an autonomous operations workforce."

### Network automation
"Let that workforce coordinate directly with customers, carriers, brokers, facilities, and service providers through a governed logistics network."

## Customer-facing language

Do not lead with:
- protocol;
- distributed agent architecture;
- digital twin;
- autonomous network.

Lead with immediate operational outcome.

### Owner-operator
"Automate the back office and repetitive dispatch work while you drive."

### Fleet
"Automate dispatch, status, exceptions, paperwork, and asset coordination across the fleet."

### Brokerage
"Automate RFQ, pricing, carrier sourcing, tendering, execution, documents, and reconciliation."

### Facility
"Automate appointments, driver communication, BOL intake, gate/yard/dock coordination, shipping and receiving."

### Shipper
"Automate transportation intake, routing, tendering, visibility, exceptions, and invoice review."

### Service provider
"Automate repair/roadside intake, capacity, estimates, scheduling, status, evidence, and billing."

## Category guardrail

Internally, FreightOS can be compared conceptually with horizontal agent operating systems/runtime platforms.

Publicly, FreightOS stands on its own category:
- logistics-native;
- governed;
- interoperable;
- enterprise;
- multimodal;
- customer-deployable.

## Product promise

**Understand the operation. Automate the work. Connect the network.**

## Non-promise

Do not promise:
- fully autonomous everything on day one;
- replacement of regulated legal entities;
- universal system replacement;
- unsupported savings/headcount elimination;
- autonomous safety-critical physical control.


---

<!-- SOURCE: 02_UNIFIED_PLATFORM_ARCHITECTURE.md -->

# 02 — Unified Platform Architecture

## Platform layers

### Layer 1 — FreightOS Network Kernel
Owns:
- participant identities;
- relationships;
- canonical logistics references;
- event/intent/command/evidence envelopes;
- capability registry;
- schema/conformance;
- subscriptions/routing;
- trust/audit.

### Layer 2 — Authority and Policy
Owns:
- tenancy;
- legal plane;
- permissions;
- delegation;
- approvals;
- autonomy grants;
- exposure;
- kill switches.

### Layer 3 — Durable Operations Runtime
Owns:
- graph state;
- checkpointing;
- retries;
- deadlines;
- human interrupts;
- side-effect gateways;
- reconciliation;
- degraded mode.

### Layer 4 — Intelligence Runtime
Owns:
- classification;
- extraction;
- planning;
- optimization;
- drafting;
- summarization;
- anomaly detection.

Intelligence cannot grant authority.

### Layer 5 — Participant Profiles
Carrier / Broker / Facility / Shipper / Service.

Each profile provides:
- Twin schema;
- canonical agent manifests;
- workflow catalog;
- UI/application surfaces;
- integration pack;
- evaluation suites.

### Layer 6 — Capability Packs
- Road
- Rail
- Ocean
- Facility
- Maintenance/Service
- Brokerage
- future Air
- commodity/specialty packs.

### Layer 7 — Experience + Integration
Native apps, partner apps, APIs, EDI, MCP, email/document gateways.

## Shared kernel rule

If a capability can be expressed once in the network kernel, do not reimplement it independently in Carrier/Broker/Facility applications.

Examples:
- identity;
- evidence;
- document reference;
- approvals;
- event envelopes;
- idempotency;
- reconciliation;
- audit.

## Domain ownership rule

Do not centralize domain truth unnecessarily.

Examples:
- RigDesk may own detailed asset/service state;
- FacilityOS may own facility visit/receiving state;
- Brokerage Plane owns brokerage commercial transaction state;
- FreightOS core owns canonical shipment/journey/network coordination.

Use governed references/events.


---

<!-- SOURCE: 03_PARTICIPANT_OPERATIONAL_TWIN_STANDARD.md -->

# 03 — Participant Operational Twin Standard

## Universal concept

`ParticipantOperationalTwin` is the common abstraction for customer-understandable operational configuration.

Existing specializations:
- Company Operational Twin (carrier)
- Broker Operational Twin
- Facility Operational Twin

Planned:
- Shipper Operational Twin
- Service Provider Operational Twin.

## Mandatory sections

Every twin type declares:
1. participant/legal identity;
2. organizational topology;
3. roles/responsibilities;
4. systems of record;
5. vocabulary mappings;
6. assets/resources/capabilities;
7. workflows/SOPs;
8. policies/thresholds;
9. approvals/escalations;
10. integrations;
11. exception taxonomy;
12. data classification;
13. evidence/provenance;
14. uncertainty;
15. version/effective dates.

## Fact lifecycle

`PROPOSED → VERIFIED → APPROVED`

Alternate:
`DISPUTED / DEPRECATED`

Only approved facts may serve as authoritative customer configuration.

## Customer contract

The customer can answer:
- What does FreightOS believe?
- Where did that belief come from?
- Who approved it?
- Which workflows depend on it?
- What happens if I change it?
- Which agents can use it?
- Which counterparties can see any part of it?

## Universal diff

A Twin change produces:
- semantic diff;
- impacted workflow graph list;
- impacted agent manifest list;
- impacted autonomy grants;
- integration impact;
- network disclosure impact;
- required re-certification.

## No hidden learning

Observed behavior may produce a proposal.
It cannot silently rewrite approved operations.


---

<!-- SOURCE: 04_UNIFIED_AGENT_ORGANIZATION_STANDARD.md -->

# 04 — Unified Agent Organization Standard

## Universal factory

```text
Participant Operational Twin
+ Participant Profile
+ Enabled Capability Packs
+ Integration Bindings
+ Policy / Legal Plane
+ Autonomy Grants
+ SLO / Deployment Tier
        ↓
Tenant Agent Organization
```

## Universal agent manifest

Every production agent has:
- immutable agent ID;
- tenant;
- represented participant/legal entity;
- role;
- manifest version;
- scope;
- allowed reads;
- allowed proposals;
- allowed commands;
- tools;
- financial/exposure limits;
- legal plane;
- policy version;
- autonomy by action;
- model policy;
- evaluation version;
- expiry/review;
- kill switch.

## Logical vs runtime agents

Logical responsibilities remain separate even when one runtime worker performs many duties for a small customer.

This gives:
- simple UX for small customer;
- enterprise governance internally.

## Agent communication

Typed artifacts:
- Observation
- Request
- Proposal
- Quote
- Counter
- Tender
- ApprovalRequest
- CommandRequest
- Result
- Exception
- EvidenceReference.

Free-form agent conversations may support reasoning but cannot be execution authority.

## Cross-company boundary

Agent A never directly acquires Agent B's permissions.

Each side independently:
- authenticates;
- evaluates policy;
- decides;
- executes within its own authority.


---

<!-- SOURCE: 05_FREIGHTOS_NETWORK_PROTOCOL.md -->

# 05 — FreightOS Agentic Logistics Protocol

## Purpose

The protocol is the shared language between:
- FreightOS-native agents;
- external systems;
- partner applications;
- EDI/API adapters.

## Artifact classes

### Observation
"I observed X."

### Assertion
"Participant states X with provenance."

### Request
"Please perform/consider X."

### Proposal
"I propose X."

### Commercial Offer
"Here are exact commercial terms."

### Approval
"Authorized actor approves exact version/scope."

### Command
"Execute this authorized bounded action."

### Result
"External/business action returned X."

### Event
"Material state transition occurred."

### Evidence Envelope
"These artifacts support the state."

### Correction / Dispute
"Previous assertion/event is contested/corrected."

## Core protocol fields

- message ID/version
- tenant/participant
- legal plane
- sender identity
- represented organization
- recipient/capability
- logistics object refs
- correlation/causation
- timestamp
- expiry
- policy/evidence refs
- schema version
- idempotency key where command
- signature/auth proof as required.

## Meaning before transport

The same semantic artifact may travel via:
- native API;
- event bus;
- webhook;
- EDI;
- MCP;
- partner API;
- email/document adapter.

Transport does not define business semantics.

## Example

Carrier delay:

```text
Observation: predicted delay
→ ShipmentEvent proposal
→ authoritative carrier status event
→ FreightOS propagates impacted commitment
→ FacilityOS evaluates appointment
→ Broker/Shipper receives authorized exception
```

No party needs access to another party's full internal state.


---

<!-- SOURCE: 06_CUSTOMER_ENTRY_POINTS_AND_PRODUCT_SURFACES.md -->

# 06 — Customer Entry Points and Product Surfaces

## Principle

Sell an operating outcome, not "join our network."

## Carrier entry

### Solo/owner-operator
- back office
- dispatch preparation
- paperwork
- appointments
- maintenance/roadside coordination.

### Fleet
- dispatch pods
- planning
- status automation
- exception management
- document/invoice workflow
- asset readiness.

## Broker entry
- RFQ/quote
- sourcing/qualification
- negotiation
- tender
- execution
- documents/accessorials
- invoice/pay reconciliation.

## Facility entry
- appointment
- driver communication
- BOL
- gate/yard/dock
- shipping/receiving
- custody/discrepancy/detention.

## Shipper entry
- shipment/order intake
- routing guide
- quote/tender orchestration
- provider selection under appropriate legal model
- visibility
- exception
- invoice audit.

## Service entry
- breakdown/service request
- triage intake
- availability/estimate
- scheduling
- work status
- evidence
- invoice.

## Network-only participant

Counterparty may initially participate through:
- secure link;
- email/EDI/API adapter;
- portal;
- event subscription
without purchasing a full native product.

This is a deliberate adoption mechanism.


---

<!-- SOURCE: 07_CARRIER_OPERATIONS_ROUTE.md -->

# 07 — Carrier Operations Route

## Customer value

Automate internal carrier operations while preserving carrier control.

## Operational Twin
Existing Company Operational Twin.

## Primary graphs

- work/load intake
- profitability/economics
- planning
- driver/equipment feasibility
- dispatch/assignment
- status
- exception
- document
- facility appointment
- maintenance/roadside
- invoice/reconciliation.

## One-truck fast path

```text
Connect work source + email/docs + truck
→ build minimal COT
→ observe
→ shadow
→ automate paperwork/status
→ approval-to-execute selected dispatch/admin
→ bounded autonomous back office
```

## Fleet path

Roll out:
one dispatch pod/fleet/workflow
→ region/terminal
→ enterprise.

## Network output

Carrier operations naturally emit:
- capacity;
- tender responses;
- dispatch;
- ETA;
- milestone;
- exception;
- documents;
- asset-readiness;
- appointment requests.

These are valuable to brokers, shippers, facilities, and service providers.


---

<!-- SOURCE: 08_BROKERAGE_OPERATIONS_ROUTE.md -->

# 08 — Brokerage Operations Route

## Customer value

Automate routine brokerage work under a separately authorized Brokerage Plane.

## Operational Twin
Broker Operational Twin.

## Primary graphs

RFQ → quote → commitment → carrier source → qualification → negotiation → allocation → tender → execution → documents/accessorials → invoice/pay → transaction record.

## Small broker fast path

Start with:
- TMS/email
- shipper accounts
- carrier network
- margin rules
- qualification policy
- shadow RFQs/coverage.

## Enterprise path

Account/branch canary → regional expansion → selected A4 → exception-supervised selected books.

## Network output

Broker connects otherwise fragmented shipper/carrier/facility communication.

## Legal invariant

Autonomous broker labor does not remove the need for legally required brokerage entity/authority/compliance.


---

<!-- SOURCE: 09_FACILITY_OPERATIONS_ROUTE.md -->

# 09 — Facility Operations Route

## Customer value

Automate digital coordination around the physical facility without replacing safety-critical controllers or requiring immediate WMS/YMS replacement.

## Operational Twin
Facility Operational Twin.

## Primary graphs

readiness → appointment → pre-arrival → driver check-in → BOL/document → gate → staging → dock → shipping/receiving → custody/evidence → detention/discrepancy → release.

## Adoption path

One site + one inbound/outbound workflow
→ selected carriers
→ all visits
→ multi-site
→ network-wide facility operations.

## Network output

FacilityOS emits:
- readiness;
- appointment;
- visit;
- dock/service state;
- document status;
- BOL/POD;
- custody/receipt evidence;
- delay/detention;
- discrepancy.

These remove broker/carrier status calls and reduce manual coordination.


---

<!-- SOURCE: 10_SHIPPER_OPERATIONS_ROUTE.md -->

# 10 — Shipper Operations Route

## Purpose

Complete the participant model with a future Shipper Operational Twin (SOT).

This is architecture definition, not current module activation.

## SOT domains

- shipper legal/business units
- facilities
- order/transport requirements
- routing guides
- approved carriers/brokers
- procurement rules
- service commitments
- commodity/equipment
- contract/rate structures
- tender rules
- appointment requirements
- claims/accessorial policies
- invoice audit
- ERP/TMS/WMS integrations.

## Agent roles

- Shipment Intake
- Requirements
- Routing Guide
- Quote Analysis
- Tender
- Provider/Carrier Selection according to legal plane
- Tracking
- Exception
- Facility Coordination
- Documentation
- Invoice Audit
- Service Analytics.

## Legal routing

Shipper may:
- tender directly to contracted carriers;
- interact with authorized brokerage;
- use other permitted models.

FreightOS must preserve the governing legal/contractual role.

## Strategic role

Shipper-native adoption is powerful after carrier/broker/facility endpoints exist because the shipper can orchestrate a network already represented in FreightOS.


---

<!-- SOURCE: 11_SERVICE_PROVIDER_OPERATIONS_ROUTE.md -->

# 11 — Service Provider / RigDesk Network Route

## Purpose

Make service providers another standardized participant profile rather than an isolated marketplace.

## Future Service Provider Operational Twin (SPOT)

- shop/provider identity
- locations/service radius
- capabilities
- hours/on-call
- bays/resources
- equipment
- technician/certification metadata where relevant
- pricing/estimate policy
- authorization/payment workflow
- towing/roadside capability
- parts/supplier integrations
- evidence/invoice requirements.

## Agent roles

- Service Intake
- Eligibility
- Capacity
- Estimate
- Appointment/Dispatch
- Customer Communication
- Work Status
- Evidence
- Parts/Dependency
- Invoice/Reconciliation.

## Relationship to RigDesk

RigDesk remains the vehicle/service operating product.

FreightOS Network provides:
- participant identity;
- requests;
- evidence;
- mission/dispatch consequences;
- cross-party communication.

Do not duplicate detailed maintenance system-of-record ownership in FreightOS core.


---

<!-- SOURCE: 12_END_TO_END_NETWORK_WORKFLOW.md -->

# 12 — End-to-End Network Workflow

## Representative brokered road shipment

```text
1 Shipper creates demand
2 Brokerage agent receives RFQ
3 Broker quote accepted
4 Broker sources qualified carrier
5 Carrier agent evaluates tender
6 Carrier accepts
7 Carrier agent assigns driver/asset
8 FacilityOS confirms origin readiness/appointment
9 Driver arrives/checks in
10 BOL/document exchange
11 Load + custody evidence
12 Carrier journey executes
13 Destination FacilityOS receives ETA
14 Driver presents delivery docs
15 Unload + goods receipt / discrepancy
16 POD/receipt evidence
17 FreightOS propagates completion
18 Broker reconciles accessorials
19 Shipper invoice prepared
20 Carrier payable/status recorded
21 Broker transaction record closed
22 Carrier/RigReceipts economics reconcile
23 RigDesk evaluates next asset mission/readiness
```

## Communication principle

Each participant owns its internal decision.

Example:
- broker proposes/tenders;
- carrier independently accepts;
- facility independently admits/schedules;
- service provider independently accepts work.

No central model impersonates every company.

## Exception propagation

A breakdown can produce:

```text
RigDesk asset exception
→ Carrier dispatch impact
→ FreightOS shipment ETA impact
→ FacilityOS appointment impact
→ Broker customer-service impact
→ Shipper commitment impact
```

Each receives only authorized information necessary for its role.

## Evidence chain

A completed shipment can reconstruct:
shipper commitment → broker tender → carrier assignment → facility custody → transit → receipt/POD → invoice/pay records.

That shared causality is a core network asset.


---

<!-- SOURCE: 13_AUTHORITY_AND_LEGAL_PLANE_MATRIX.md -->

# 13 — Authority and Legal Plane Matrix

## Planes

### Carrier-Agent
Acts for one carrier.
May allocate that carrier's own assets/drivers according to policy.
Cannot select among unrelated carriers for shipper compensation.

### Brokerage
Acts for authorized brokerage entity.
May arrange freight among unrelated carriers subject to legal/compliance gate.

### Shipper
Acts for shipper.
May create transportation demand and execute permitted direct-carrier/broker workflows.

### Facility
Acts for facility operator.
May coordinate digital site operations but not unauthorized physical safety control.

### Service
Acts for provider/service organization.
May accept/perform service within provider authority.

### Network
Routes artifacts and enforces network policy.
Does not silently inherit participant commercial authority.

## Cross-plane rule

A person/organization may participate in multiple planes only through distinct:
- legal context;
- credentials/scopes;
- ledgers where required;
- policies;
- commands;
- audit.

## Red actions

Examples:
- authority changes
- payment destination changes
- claims settlement
- safety hold release
- physical-control expansion
remain high-control regardless of model confidence.

## Missing context

Fail closed.


---

<!-- SOURCE: 14_ADOPTION_AND_ONBOARDING_FACTORY.md -->

# 14 — Adoption and Onboarding Factory

## Goal

Make customer implementation increasingly a product capability.

## Universal onboarding graph

```text
Create participant/tenant
 ↓
Discover systems + organization
 ↓
Import evidence/SOPs/schema
 ↓
Build proposed Operational Twin
 ↓
Customer review/correction
 ↓
Connect read-only integrations
 ↓
Map workflows
 ↓
Instantiate agent organization
 ↓
Shadow
 ↓
Measure
 ↓
A3 selected actions
 ↓
A4 selected actions
 ↓
Expand
```

## Small customer

Use opinionated presets and plain language.

Never require the customer to understand:
- graph theory;
- agent manifests;
- event schemas.

## Enterprise customer

Expose:
- architecture/security
- SSO
- data residency
- conformance
- role/authority matrix
- workflow catalog
- rollout controls.

## Onboarding agents

Implementation agents may:
- inspect permitted schemas/docs;
- propose mappings;
- propose twin assertions;
- generate conformance fixtures;
- draft workflow maps.

They may not:
- self-approve authority;
- activate production write access;
- waive security/legal gates.

## Success metric

New customer = primarily configuration + integration + certification, not custom product development.


---

<!-- SOURCE: 15_INTEGRATION_AND_COUNTERPARTY_ADOPTION.md -->

# 15 — Integration and Counterparty Adoption Strategy

## Three participation levels

### Level 1 — External
Email/link/EDI/API interaction.
No native FreightOS product required.

### Level 2 — Connected
Verified participant identity + integrations + network events.

### Level 3 — Native
Operational Twin + Agent Organization + native FreightOS application.

## Migration path

```text
External Counterparty
→ sees lower-friction FreightOS interactions
→ connects API/EDI
→ gains participant identity/history
→ adopts native automation when value is clear
```

## Why this matters

The network should not require simultaneous multi-sided adoption.

A brokerage customer can create immediate value while communicating with non-native carriers/facilities.

A carrier customer can create immediate value while interacting with legacy brokers/facilities.

## Adapter doctrine

Adapters translate to canonical protocol.
Do not fork business logic into every connector.

## Conformance

Before production write:
- auth
- mappings
- duplicates
- ordering
- retries
- idempotency
- reconciliation
- revocation
- schema/version
must pass.


---

<!-- SOURCE: 16_COMMERCIAL_AND_DEPLOYMENT_MODEL.md -->

# 16 — Commercial and Deployment Model

## Product architecture

```text
FreightOS Platform
├── Carrier Operations
├── Brokerage Operations
├── FacilityOS
├── Shipper Operations
├── Service/RigDesk Network
├── Capability Packs
└── Network / API / Integration services
```

Commercial packaging can differ without creating different code foundations.

## Deployment tiers

### Shared SaaS
SMB / standard customers.

### Dedicated execution partition
High-volume workloads with isolated worker/queue capacity.

### Dedicated cell
Enterprise/regulatory/customer-required isolation:
- DB
- queues
- keys
- workers
- region/residency.

### Private/partner deployment
Only when product/business/security model supports it; maintain canonical release train.

## Billing principles

Bill by customer value units where possible, not "AI tokens."

Potential units:
- active asset/fleet
- managed shipment
- broker transaction
- completed facility visit
- active facility
- service case
- integration/network volume
- enterprise platform commitment.

## Separate legal/commercial revenue

Keep:
- SaaS
- brokerage
- marketplace/exchange
- service fees
- financing/insurance
distinct where applicable.

## Licensing/entitlements

All sellable modules have versioned entitlements and activation gates.
Entitlement alone cannot bypass legal/policy gates.


---

<!-- SOURCE: 17_NETWORK_FLYWHEEL_AND_MOAT.md -->

# 17 — Network Flywheel and Defensibility

## Flywheel

```text
Unilateral automation value
        ↓
Participant adopts
        ↓
Counterparties receive better communication
        ↓
Counterparties connect
        ↓
More workflows become machine-readable
        ↓
Agent coordination improves
        ↓
Operational value rises
        ↓
More participant adoption
```

## Defensibility layers

1. logistics semantic model;
2. participant operational twins;
3. workflow graph library;
4. authority/legal-plane system;
5. integration/conformance library;
6. verified participant identities/relationships;
7. evidence/audit history;
8. agent interoperability;
9. multimodal capability packs;
10. embedded operational adoption.

## What is not the moat

- access to one LLM;
- a prompt library;
- a chatbot UI;
- one load-board integration.

Models can commoditize.

## Data moat guardrail

Network data advantage must not depend on violating customer confidentiality.

Durable advantage should come from:
- permitted network relationships;
- conformance;
- operational reliability;
- aggregate/de-identified insight where contractually allowed;
- better automation from customer-approved configuration.

## Switching cost

The goal is earned operational embedding:
- twin;
- integrations;
- workflows;
- identity;
- policies;
- evidence;
- network relationships.

Not artificial lock-in.


---

<!-- SOURCE: 18_COHERENT_IMPLEMENTATION_SEQUENCE.md -->

# 18 — Coherent Implementation Sequence

This sequence does not override current module-state governance. It provides the dependency order.

## Stage A — Foundation
Already governing:
- security/resilience
- tenant/identity/authority
- universal freight model
- durable events/commands
- policy/audit
- agent runtime
- adapter/conformance.

## Stage B — Carrier unilateral value
Current primary wedge:
- road FTL
- Dispatch Copilot
- back office
- selected A3
- RigReceipts/RigDesk boundaries
- minimum facility primitives.

## Stage C — Carrier enterprise agent layer
- Company Operational Twin
- Agent Organization Factory
- durable carrier workflow graphs
- one-truck + enterprise fixtures.

## Stage D — Facility network endpoint
Only after promotion:
- Facility Operational Twin
- BOL/driver-office
- appointment/visit
- shipping/receiving
- selected A3/A4.

## Stage E — Brokerage network endpoint
Only after legal/promotion gate:
- Broker Operational Twin
- quote/source/qualify/tender
- execution
- transaction record
- selected A3/A4.

## Stage F — Shipper control
- Shipper Operational Twin
- routing/tender/control tower
- network procurement pathways.

## Stage G — Service-provider network
- Service Provider Twin
- repair/roadside/service agent endpoints.

## Stage H — Connected automation
Turn point-to-point human coordination into typed network workflows.

## Stage I — Multimodal
Road → rail/ocean packs, preserving universal network artifacts.

## Stage J — Exchange
Only after identity, network utility, legal/liquidity/fraud/settlement maturity.

## Critical rule

Build protocol/twin/runtime contracts early enough to avoid future rewrites, but activate products only through existing gates.


---

<!-- SOURCE: 19_GOVERNANCE_AND_NON_REGRESSION.md -->

# 19 — Governance and Non-Regression

## Precedence

Existing Constitution, security/resilience, legal/safety gates, sequencing doctrine and signed ADRs remain controlling.

## This package may

- add common abstractions;
- clarify product hierarchy;
- define long-term participant profiles;
- define dependency order;
- create design contracts/fixtures.

## This package may not

- activate deferred modules;
- weaken legal-plane separation;
- permit cross-tenant data leakage;
- authorize physical motion;
- change brokerage authority requirements;
- replace deterministic money/policy with AI;
- rewrite prior accepted handoffs merely for consistency.

## Common-parent rule

The new `ParticipantOperationalTwin` abstraction is conceptual/contractual.

Do not destructively rename:
- Company Operational Twin;
- Broker Operational Twin;
- Facility Operational Twin.

Implement compatibility/mapping if a shared type becomes useful.

## Architecture decision requirement

Any move to collapse previously separate domain ownership requires ADR with:
- data ownership
- legal/security impact
- migration
- API compatibility
- rollback
- tests.

## No marketing overclaim

Do not claim FreightOS already operates the full network merely because architecture exists.

Differentiate:
- designed;
- implemented;
- shadow-tested;
- customer-live;
- autonomous scope.


---

<!-- SOURCE: 20_COHERENCE_ACCEPTANCE_GATES.md -->

# 20 — Coherence Acceptance Gates

COH-01 existing accepted handoffs unchanged
COH-02 one canonical network kernel identified
COH-03 participant-profile boundaries documented
COH-04 COT/BOT/FOT preserved under common twin abstraction
COH-05 future SOT/SPOT do not activate deferred products
COH-06 universal agent-manifest contract maps to profile manifests
COH-07 universal workflow-graph invariants apply across profiles
COH-08 shared network artifacts are versioned
COH-09 every profile uses authority-before-automation
COH-10 Carrier-Agent/Brokerage legal separation remains structural
COH-11 Facility physical-control prohibition remains structural
COH-12 RigDesk/domain ownership not duplicated
COH-13 external participant can interoperate without native app
COH-14 customer-specific behavior configuration-first
COH-15 no customer code fork required for reference fixtures
COH-16 one-truck carrier reference path coherent
COH-17 one-person broker reference path coherent
COH-18 single-site facility reference path coherent
COH-19 enterprise topology maps to same primitives
COH-20 cross-party end-to-end shipment reconstructable
COH-21 network artifact disclosure is purpose-limited
COH-22 side effects remain idempotent/reconciled
COH-23 autonomy grants remain granular
COH-24 model outage has defined degraded operation
COH-25 onboarding factory cannot self-grant production authority
COH-26 module-state governance remains controlling
COH-27 implementation dependency sequence has no circular ownership
COH-28 commercial packages map to canonical modules
COH-29 deployment tiers share canonical contracts
COH-30 exact evidence report proves coherence changes are additive

FAIL COH-01..COH-27 blocks adoption of this package as governing coherence architecture.


---

<!-- SOURCE: 21_CLAUDE_COHERENCE_INTEGRATION_PROMPT.md -->

# 21 — Claude Coherence Integration Prompt

You are the senior principal architect responsible for reconciling FreightOS v1.4 network architecture, v1.5 enterprise agent operations, FacilityOS enterprise agent operations, v1.6 brokerage enterprise agent operations, and the current FreightOS implementation into one coherent architecture without disturbing accepted work.

## Immediate assignment — documentation/control integration only

Do not implement deferred runtime modules.

### Read first

- Constitution
- sequencing/module states
- v1.3 security/resilience
- v1.4 network architecture
- v1.5 enterprise agent operations
- FacilityOS enterprise agent package
- v1.6 brokerage enterprise agent package
- this v1.7 package
- current repository architecture/runtime.

## Goal

Establish a repository-local coherence map that proves all products use:

`Participant Operational Twin → Agent Organization → Typed Durable Workflow → Authority/Legal Gate → FreightOS Protocol → Adapter/Counterparty → Verification/Reconciliation`

without destructive renaming or architectural forks.

## Phase C0 — inspect only

Create a new branch.

Produce:
1. current product/module map;
2. domain ownership map;
3. twin inventory and compatibility map;
4. agent-manifest inventory;
5. workflow-runtime inventory;
6. network-artifact inventory;
7. legal-plane matrix;
8. integration/adapter map;
9. customer entry-point map;
10. cross-party shipment sequence diagram from actual code/contracts;
11. module-state/dependency graph;
12. COH-01..COH-30 matrix;
13. duplication/conflict inventory;
14. proposed additive PR sequence;
15. owner decisions.

## Restrictions

Do not:
- rename existing twins;
- rewrite existing handoffs;
- activate FacilityOS/Brokerage/Exchange;
- change module states;
- run production migrations;
- enable live external writes;
- change authority;
- merge/deploy;
- claim coherence because docs agree.

## Required recommendation

Where implementation duplicates concepts, prefer:
- shared interfaces/contracts;
- adapters;
- backward-compatible migration;
over destructive consolidation.

## Completion

Return:
- branch/HEAD/tree
- files changed
- proof accepted handoffs unchanged
- COH matrix
- conflicts/duplication
- target architecture
- PR sequence
- no-live-side-effect attestation.

Stop after C0.


---

<!-- SOURCE: README.md -->

# FreightOS Agentic Logistics Network Coherence Handoff v1.7.0

**Status:** additive governing coherence architecture  
**Date:** 2026-08-14  
**Purpose:** unify the previously defined carrier, brokerage, facility, network, security, and enterprise-agent architectures into one coherent product and implementation route without replacing or weakening any accepted handoff.

## Category

**FreightOS is the agentic operating and communications network for logistics.**

It has two inseparable jobs:

1. **Inside an organization:** understand and automate logistics operations.
2. **Between organizations:** let governed agents and existing systems communicate, coordinate, and execute through a shared logistics protocol.

This package is the coherence layer. It does not activate any deferred/legal-gated module.

## Core pattern

```text
Participant
    ↓
Participant Operational Twin
    ↓
Tenant Agent Organization
    ↓
Typed Durable Workflow Graphs
    ↓
Identity / Authority / Legal / Policy Gate
    ↓
FreightOS Network Protocol
    ↓
Counterparty Agent Organization or Adapter
    ↓
Verified External Result / Evidence / Reconciliation
```

## Participant profiles

The universal `ParticipantOperationalTwin` concept specializes into:
- Carrier Company Operational Twin
- Broker Operational Twin
- Facility Operational Twin
- Shipper Operational Twin
- Service Provider Operational Twin

Existing named twins remain valid. This package introduces their common parent concept; it does not rename prior artifacts.

## Key commercial principle

Customers buy the problem they need solved:

- owner-operator: back-office + dispatch automation;
- fleet: dispatch + exception + asset coordination;
- broker/3PL: RFQ-to-settlement automation;
- facility: appointment-to-receipt automation;
- shipper: transport procurement/control-tower automation;
- service provider: repair/roadside/service workflow automation.

Every deployment also creates a FreightOS network endpoint.

## Internal analogy

FreightOS may be thought of internally as a logistics-native agent runtime/protocol/network—analogous in concept to a horizontal agent platform, but deeply specialized for logistics semantics, authority, evidence, multimodal workflows, and regulated operating planes.

Do not publicly position FreightOS as another company's product, clone, or derivative.

## Repository destination

```text
docs/production-handoff/v1.7.0-agentic-logistics-network-coherence/
```

## Binding rule

This package defines architectural coherence and long-term sequencing. The existing FreightOS Constitution, security/resilience rules, legal/safety gates, and module-state/horizon controls remain controlling for what may be implemented now.


---

<!-- SOURCE: contracts/module_dependency_graph.yaml -->

version: 1.0.0

foundation:
  - security_resilience
  - identity_tenancy_authority
  - universal_freight_model
  - network_kernel
  - policy_audit
  - workflow_runtime
  - integration_conformance
  - agent_runtime

modules:
  carrier_operations:
    depends_on: [foundation]
    status_source: current_module_state_registry

  facilityos:
    depends_on: [foundation, carrier_operations]
    activation: promotion_or_customer_gate

  brokerage_operations:
    depends_on: [foundation, carrier_operations]
    activation: legal_and_promotion_gate

  shipper_operations:
    depends_on: [foundation, carrier_operations]
    activation: promotion_gate

  service_provider_network:
    depends_on: [foundation, rigdesk]
    activation: promotion_gate

  multimodal:
    depends_on: [foundation]
    activation: mode_specific_gate

  exchange:
    depends_on:
      - foundation
      - brokerage_operations
      - shipper_operations
      - network_identity_liquidity_fraud_settlement_maturity
    activation: legal_liquidity_commercial_gate


---

<!-- SOURCE: contracts/network_artifacts.yaml -->

version: 1.0.0

artifacts:
  Observation:
    authoritative: false
  Assertion:
    authoritative: "only according to issuer authority and verification"
  Request:
    authoritative: false
  Proposal:
    authoritative: false
  CommercialOffer:
    authoritative: "exact terms only when issued by authorized party"
  Approval:
    authoritative: "for exact bound action/version/scope"
  Command:
    authoritative: "execution intent after authorization"
    requires_idempotency: true
  Result:
    authoritative: "subject to external/system-of-record semantics"
  NetworkEvent:
    append_only: true
  EvidenceEnvelope:
    immutable_reference: true
  Correction:
    append_only: true
  Dispute:
    append_only: true

common_fields:
  - artifact_id
  - schema_version
  - sender_identity
  - represented_organization
  - tenant
  - legal_plane
  - logistics_object_refs
  - correlation_id
  - causation_id
  - created_at
  - expires_at
  - evidence_refs
  - policy_ref


---

<!-- SOURCE: contracts/participant_profile.yaml -->

version: 1.0.0

participant_profiles:
  carrier:
    twin: CompanyOperationalTwin
    legal_planes: [carrier_agent]
    native_surfaces: [carrier_operations, rigdesk, driver]
    primary_workflows:
      - planning
      - dispatch
      - execution
      - documents
      - maintenance_roadside

  broker:
    twin: BrokerOperationalTwin
    legal_planes: [brokerage]
    native_surfaces: [brokerage_operations]
    primary_workflows:
      - rfq_quote
      - carrier_source_qualify
      - negotiate_allocate_tender
      - execution
      - settlement

  facility:
    twin: FacilityOperationalTwin
    legal_planes: [facility]
    native_surfaces: [facilityos]
    primary_workflows:
      - readiness
      - appointment
      - vehicle_visit
      - bol_document
      - gate_yard_dock
      - shipping_receiving
      - custody_discrepancy

  shipper:
    twin: ShipperOperationalTwin
    status: architecture_only
    legal_planes: [shipper]
    native_surfaces: [shipper_control_tower]
    primary_workflows:
      - shipment_intake
      - routing
      - tender
      - tracking
      - exception
      - invoice_audit

  service_provider:
    twin: ServiceProviderOperationalTwin
    status: architecture_only
    legal_planes: [service_provider]
    native_surfaces: [rigdesk_provider]
    primary_workflows:
      - service_intake
      - eligibility
      - estimate
      - schedule
      - service_execution
      - evidence_invoice


---

<!-- SOURCE: diagrams/01_coherent_stack.mmd -->

flowchart TB
  UX[Customer Experiences: Carrier | Broker | Facility | Shipper | Service]
  TW[Participant Operational Twins]
  AG[Agent Organization Factory]
  WF[Typed Durable Workflow Graphs]
  AU[Identity / Authority / Legal / Policy]
  NK[FreightOS Network Kernel]
  AD[Adapters / Conformance]
  EXT[Existing Systems + Counterparties]

  UX --> TW --> AG --> WF --> AU --> NK --> AD --> EXT
  EXT --> AD --> NK
  NK --> WF


---

<!-- SOURCE: diagrams/02_network_participants.mmd -->

flowchart LR
  S[Shipper Agents] <--> N[FreightOS Network]
  B[Broker Agents] <--> N
  C[Carrier Agents] <--> N
  F[FacilityOS Agents] <--> N
  P[Service Provider Agents] <--> N
  R[RigDesk / RigReceipts] <--> N


---

<!-- SOURCE: diagrams/03_adoption_flywheel.mmd -->

flowchart TD
  U[Unilateral Automation Value] --> A[Participant Adoption]
  A --> E[Counterparty Exposure]
  E --> C[Counterparty Connects]
  C --> M[More Machine-Readable Workflows]
  M --> V[Higher Network Utility]
  V --> U


---

<!-- SOURCE: templates/coherence_review_checklist.md -->

# FreightOS Coherence Review Checklist

- [ ] Customer-facing problem is clear
- [ ] Participant profile identified
- [ ] Operational Twin specialization identified
- [ ] Agent manifests canonical/configurable
- [ ] Workflow is typed/durable
- [ ] Legal plane identified
- [ ] Authority is deterministic
- [ ] External side effects isolated
- [ ] Idempotency/reconciliation defined
- [ ] Network artifacts used instead of ad hoc messages
- [ ] Existing-system adapter path exists
- [ ] Counterparty can participate without native app
- [ ] Data disclosure is purpose-limited
- [ ] Product domain ownership is not duplicated
- [ ] Autonomy level/scoped promotion defined
- [ ] Small-customer path works
- [ ] Enterprise topology path works
- [ ] Module-state gate respected
- [ ] Rollback/degraded mode defined
- [ ] Acceptance/evidence gates exist
