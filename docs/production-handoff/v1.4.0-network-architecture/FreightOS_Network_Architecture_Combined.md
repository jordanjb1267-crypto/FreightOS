# FreightOS Network Architecture Handoff v1.4.0 — Combined Document

The individual files remain controlling for repository use.


---

<!-- SOURCE: README.md -->

# FreightOS Network Architecture Handoff v1.4.0

## Purpose

This package defines FreightOS as a **neutral logistics coordination network** rather than a monolithic application. It establishes the architecture through which organizations, people, vehicles, facilities, documents, software systems, and authorized agents can exchange governed logistics data and coordinate operational actions.

The applications are network entry points. The network is the durable system.

## Controlling position

FreightOS must become the trusted communication and execution layer for logistics while preserving participant data ownership, existing system investments, and explicit authority boundaries. It must not require every participant to adopt one user interface, one database, or one operating system.

## Package relationship

This package is additive to:

- the FreightOS v1.2 production handoff;
- the FreightOS v1.3.0 security, privacy, resilience, and autonomous-repair package.

Security and resilience requirements remain controlling for all network implementation. This package does not weaken tenant isolation, zero-trust authorization, privacy, auditability, release safety, or operational continuity requirements.

## Intended repository destination

```text
docs/production-handoff/v1.4.0-network-architecture/
```

## First implementation action

Use `26_CLAUDE_MASTER_IMPLEMENTATION_PROMPT.md`. The first phase is repository inventory, domain mapping, and architecture-gap analysis only. No broad runtime rewrite, data migration, network activation, or partner integration may occur during the initial phase.

## Package map

- `00`–`08`: governing architecture, identity, domain objects, events, commands, topology, and data sovereignty
- `09`–`13`: interoperability, APIs, event transport, evidence, and agent communication
- `14`–`20`: human control, discovery, settlement, operational graphs, trust, multimodal support, and governance
- `21`–`29`: observability, reference architecture, implementation sequencing, acceptance, decisions, Claude prompt, installation, build/buy boundaries, and pilot design
- `policies/`: machine-readable policy examples
- `schemas/`: JSON Schema contracts
- `contracts/`: OpenAPI and AsyncAPI starter contracts
- `mappings/`: standards-alignment profiles
- `templates/`: repeatable design and partner artifacts
- `checklists/`: implementation and go-live gates

## Non-implementation warning

Committing this package installs requirements. It does not prove that those requirements are implemented. Every implementation claim requires repository evidence, tests, and acceptance-gate results.


---

<!-- SOURCE: 00_MASTER_HANDOFF.md -->

# 00 — FreightOS Network Architecture Master Handoff

## 1. Executive mandate

FreightOS shall be built as the permissioned communication, coordination, and execution network through which logistics participants, assets, systems, and autonomous agents exchange information and coordinate the movement, servicing, documentation, and settlement of physical freight.

FreightOS is not limited to a TMS, load board, visibility application, repair marketplace, or digital brokerage. Those capabilities may exist as products and network endpoints, but none individually defines the network.

## 2. Governing principles

1. **Protocol before monopoly.** FreightOS must interoperate with existing systems instead of requiring wholesale replacement.
2. **Applications bootstrap the network.** Each product must create standalone value and emit reusable network events.
3. **Identity before transaction.** Every consequential action must be attributable to a verified human, organization, workload, device, asset, or agent identity.
4. **Authority before automation.** No command may execute solely because a model or integration requested it.
5. **Data stays governed.** Originators retain defined rights over confidential data; sharing is purpose-limited, auditable, and revocable where legally possible.
6. **Events form history.** Material logistics facts are append-only, versioned, and correctable without silent mutation.
7. **Commands express intent.** Observations, proposals, approvals, and execution commands are distinct artifacts.
8. **Evidence supports truth.** High-consequence events and disputes must link to provenance and evidence.
9. **Standards are adopted, not ignored.** FreightOS maps to recognized logistics and software standards through explicit profiles and adapters.
10. **Failure is contained.** The network must degrade safely and preserve critical operations under dependency failure.
11. **Neutrality is strategic.** FreightOS must not structurally privilege its own application when an external participant has equivalent verified authority and conformance.
12. **No premature regulated expansion.** Financial, insurance, brokerage, and title-transfer functions require explicit legal and operational approval.

## 3. Network layers

FreightOS consists of:

- **Trust layer:** identities, organizations, relationships, authority, consent, credentials, reputation, risk.
- **Semantic layer:** canonical logistics objects, identifiers, vocabularies, lifecycle states, external-standard mappings.
- **Event layer:** observations, state transitions, evidence references, subscriptions, delivery, replay, corrections.
- **Intent layer:** offers, requests, proposals, approvals, commands, rejection, cancellation, escalation.
- **Workflow layer:** cross-party state machines, deadlines, handoffs, exceptions, reconciliation, compensation.
- **Execution layer:** dispatch, appointment, service, document, settlement instruction, and other bounded side effects.
- **Intelligence layer:** prediction, optimization, anomaly detection, agent proposals, and approved automation.
- **Experience layer:** RigReceipts, RigDesk, FreightOS portals, provider tools, facility tools, APIs, partner applications.

## 4. Required network planes

- **Governance plane:** policies, schemas, conformance rules, trust frameworks, decision records.
- **Control plane:** identity, authorization, consent, routing, capability registry, schema registry, subscription management.
- **Data plane:** API requests, event publication, event delivery, document and evidence transfer.
- **Execution plane:** commands with real-world or financial side effects.
- **Observation plane:** telemetry, audit, trace correlation, service and business SLO measurement.

The control plane must not become a single synchronous dependency for every critical data-plane operation. Cached, signed, short-lived policy material and safe degraded modes are required.

## 5. Canonical network artifacts

Every production network interaction shall use one or more of these artifacts:

- Participant identity
- Organization and membership
- Logistics object reference
- Network event
- Evidence envelope
- Intent or proposal
- Approval record
- Command envelope
- Workflow instance
- Capability advertisement
- Consent grant
- Subscription
- Delivery receipt
- Reconciliation record
- Correction or dispute record

## 6. Product role

- **RigReceipts:** economics, documents, expenses, rates, facilities, settlements, carrier outcome data.
- **RigDesk:** asset health, service triage, roadside, shop operations, repair evidence, provider capacity.
- **FreightOS core:** identity, orchestration, workflow, interoperability, event routing, trust, coordination.
- **Facility endpoint:** appointments, arrival, gate, dock, dwell, accessorial evidence.
- **Shipper/broker endpoint:** tenders, commitments, execution, documents, exceptions, settlement.
- **Future exchange:** governed capacity and demand discovery only after identity, evidence, and transaction controls mature.

## 7. Implementation doctrine

- Introduce a modular network kernel before broad service decomposition.
- Start with a canonical schema registry and event contracts.
- Use adapters around existing application models before destructive rewrites.
- Preserve application availability and backward compatibility.
- Pilot with known counterparties and bounded workflows.
- Require conformance testing before partner production access.
- Build measurable network utility before seeking universal adoption.

## 8. Acceptance doctrine

No phase is complete based on code quantity or documentation alone. Completion requires:

- deterministic tests;
- security and tenant-isolation evidence;
- schema and contract validation;
- replay and idempotency evidence;
- failure and recovery testing;
- migration and rollback proof;
- user-level operational outcome verification;
- audit and trace evidence;
- approved decision records for unresolved tradeoffs.

## 9. Prohibited shortcuts

- A shared database is not a network protocol.
- A generic message table is not a governed event model.
- An AI agent is not an authorization service.
- A webhook without idempotency and signatures is not a reliable integration.
- A UI status is not proof of a physical event.
- Copying all partner data into FreightOS is not interoperability.
- A schema with no lifecycle/version policy is not a canonical model.
- A national marketplace with no local density is not a network moat.


---

<!-- SOURCE: 01_NETWORK_ARCHITECTURE_CONSTITUTION.md -->

# 01 — Network Architecture Constitution

## Article I — Purpose

FreightOS exists to reduce coordination friction across logistics without concentrating unnecessary control or data. It shall provide trusted identities, shared semantics, governed communication, bounded execution, and auditable outcomes.

## Article II — Participant equality

A verified external application, carrier, provider, facility, or agent may interact through the same published contracts as a FreightOS-owned application when it satisfies the same authorization, security, conformance, and commercial requirements.

Private internal APIs may exist, but they may not become the only method for exercising a network capability intended for partner use.

## Article III — Data sovereignty

- Data access must be authorized by policy, relationship, purpose, and context.
- Confidential commercial information is never shared merely because parties participate in the same shipment.
- Aggregated intelligence must enforce minimum cohort and re-identification protections.
- Raw documents and sensitive fields require narrower access than derived verification assertions.
- Every network export must preserve classification and usage constraints.

## Article IV — Truth and correction

- Material history is append-only.
- Corrections reference the event or object version being corrected.
- Disputed claims are represented as disputes, not erased.
- Derived states must be reproducible from source events or explicitly versioned projections.
- Observed, asserted, inferred, and verified facts must remain distinguishable.

## Article V — Authority

- Every command has a named requester, principal, represented organization, authority basis, and policy decision.
- Approval requirements are evaluated outside probabilistic models.
- Financial destinations, legal identity, operating authority, and emergency actions receive step-up controls.
- Agents may never expand their own scopes, tool access, budgets, or approval thresholds.

## Article VI — Interoperability

FreightOS shall maintain explicit mappings to relevant external standards. The canonical model may extend them but must not claim conformance where required fields, semantics, security, or lifecycle behavior are missing.

## Article VII — Reliability

- Event delivery is durable and observable.
- Commands are idempotent or explicitly non-repeatable.
- Dependency failure must not silently convert stale data into current truth.
- Critical workflows have safe degraded modes.
- Reconciliation must identify missed, duplicated, reordered, or conflicting events.

## Article VIII — Versioning

- Schemas and APIs are versioned independently from applications.
- Breaking changes require migration plans, compatibility windows, conformance tests, and deprecation notice.
- Consumers declare supported versions and capabilities.
- Unknown fields are handled according to contract rather than discarded implicitly.

## Article IX — Governance

Changes to network identity, canonical objects, authority, settlement semantics, chain of custody, data-sharing policy, or cross-party dispute behavior require a Network Architecture Decision Record and designated review.

## Article X — Non-regression

No feature deadline, partner demand, or AI capability may bypass the controlling security/resilience package or weaken the articles above without an explicit owner-approved constitutional amendment.


---

<!-- SOURCE: 02_CATEGORY_MISSION_AND_PRODUCT_BOUNDARIES.md -->

# 02 — Category, Mission, and Product Boundaries

## Category

**Logistics Coordination Network**

## Mission statement

Create the trusted communication and execution network through which logistics participants, assets, systems, and authorized agents coordinate physical freight, service recovery, documentation, and settlement.

## What FreightOS is

- A neutral coordination layer
- A canonical logistics graph
- A permissioned event and command network
- A trust and evidence system
- A workflow orchestration system
- An interoperability and developer platform
- A source of governed network intelligence

## What FreightOS is not by default

- The legal carrier, broker, insurer, lender, or document-of-title custodian
- A replacement for every TMS, WMS, ELD, ERP, telematics, or OEM platform
- A centralized owner of all participant data
- An unrestricted autonomous actor
- A blockchain requirement
- A public social network
- An unverified load board

## Product boundaries

### RigReceipts

Owns the user experience for carrier financial truth and document-derived economics. It may publish verified network assertions but should not expose private cost structures to counterparties without explicit permission.

### RigDesk

Owns vehicle and service operations, including diagnostic triage, provider matching, repair workflows, and service history. It publishes mission-readiness and service events with controlled disclosure.

### FreightOS Core

Owns identities, canonical references, event/command protocols, subscriptions, workflow coordination, capability discovery, interoperability, policy enforcement, and network audit.

### Marketplace capabilities

Must be implemented as governed discovery and transaction workflows, not as implicit entitlement to data or counterparties. Matching and ranking rules require transparency, conflict controls, and anti-manipulation testing.

## Strategic wedge

The network should be bootstrapped through workflows that produce immediate unilateral value:

1. load economics and document ingestion;
2. facility arrival and detention evidence;
3. vehicle readiness and service recovery;
4. cross-party exception coordination;
5. settlement reconciliation.

Each wedge creates reusable identities, events, evidence, and outcome data.


---

<!-- SOURCE: 03_NETWORK_PARTICIPANT_IDENTITY_GRAPH.md -->

# 03 — Network Participant and Identity Graph

## 1. Identity types

FreightOS must distinguish:

- Legal organization
- Operating division or business unit
- Location or facility
- Human user
- Membership and role
- Software client
- Workload or service
- Device
- Vehicle, trailer, container, and equipment
- Agent
- External credential or authority record

These identities are related but never interchangeable.

## 2. Identifier policy

Each network entity receives an immutable FreightOS identifier. External identifiers are aliases with issuer, jurisdiction, effective period, verification status, and provenance.

Examples include:

- USDOT/MC authority references
- EIN or business-registration references
- VIN
- license and credential references
- SCAC, GLN, LEI, IATA, DUNS or other industry identifiers where applicable
- partner-system IDs

FreightOS identifiers must not encode mutable attributes or customer-readable secrets.

## 3. Relationship graph

Relationships are first-class, time-bounded records:

- organization employs driver;
- carrier controls vehicle;
- fleet leases trailer;
- broker tenders shipment to carrier;
- facility is operated by organization;
- agent represents organization within a scope;
- provider is approved for a fleet;
- user is authorized for a location;
- software client is delegated a capability.

Every relationship includes origin, verification, effective interval, revocation state, and evidence references.

## 4. Federation

External identity providers may authenticate users and workloads, but FreightOS remains responsible for mapping the authenticated subject to network identity and authority.

Workload identities should support short-lived, cryptographically verifiable credentials. Trust-domain federation is preferred over long-lived shared secrets for high-trust integrations.

## 5. Authority context

Authorization decisions must consider:

- subject identity;
- represented organization;
- membership and role;
- resource owner and classification;
- relationship to shipment/workflow;
- requested action;
- amount, geography, time, and risk constraints;
- device/workload assurance;
- consent and contractual basis;
- policy version.

## 6. Impersonation and delegation

- Human impersonation for support is exceptional, time-limited, visible, and audited.
- Agents and integrations use delegation grants, not shared user credentials.
- Delegation may be narrower than the delegator's full authority.
- Revocation propagates to active sessions and queued commands according to risk.

## 7. Required evidence

Identity acceptance tests must prove:

- cross-organization access is denied;
- fabricated actor identifiers confer no authority;
- revoked relationships stop future actions;
- historical audit remains attributable;
- workload credentials expire and rotate;
- agent delegation cannot be escalated by prompt or payload content.


---

<!-- SOURCE: 04_CANONICAL_LOGISTICS_DOMAIN_MODEL.md -->

# 04 — Canonical Logistics Domain Model

## 1. Design goals

The canonical model enables different systems to communicate without requiring identical internal schemas. It must be stable, extensible, versioned, and explicit about semantics.

## 2. Aggregate families

### Party and network

- Organization
- Person
- Membership
- Facility
- Authority credential
- Contact point
- Relationship
- Capability

### Freight demand and commitment

- Order
- Shipment
- Consignment
- Load
- Booking
- Tender
- Quote
- Contract
- Stop
- Appointment
- Route plan

### Assets and capacity

- Tractor
- Trailer
- Container
- Chassis
- Railcar
- Vessel/voyage reference
- Aircraft/flight reference
- Handling unit
- Equipment capability
- Capacity window

### Cargo

- Commodity
- Item
- Package
- Pallet
- Handling unit
- Dangerous-goods declaration
- Temperature or condition requirement
- Seal

### Execution

- Assignment
- Journey
- Leg
- Handoff
- Arrival
- Gate event
- Loading/unloading activity
- Custody transfer
- Exception

### Service and maintenance

- Fault
- Diagnostic observation
- Service request
- Estimate
- Work order
- Part
- Repair event
- Tow event
- Mission-readiness assessment

### Documents and evidence

- Document
- Document version
- Signature
- Evidence item
- Rate confirmation
- Bill of lading
- Proof of delivery
- Receipt
- Image/video reference

### Financial truth

- Charge
- Accessorial
- Invoice
- Deduction
- Payment instruction
- Payment status
- Settlement
- Dispute
- Claim
- Reconciliation record

## 3. Modeling rules

- Separate commercial agreement from physical execution.
- Separate planned, predicted, observed, asserted, and verified values.
- Use time intervals with timezone and precision.
- Represent location provenance and uncertainty.
- Preserve units and currency explicitly.
- Never overload one status field to represent multiple lifecycle dimensions.
- Use references rather than duplicating authoritative objects.
- Permit extensions through registered namespaces.

## 4. Object lifecycle

Every canonical aggregate defines:

- creation authority;
- lifecycle states;
- valid transitions;
- immutable fields;
- correction method;
- ownership and visibility;
- related event types;
- retention class;
- external-standard mappings.

## 5. Source of truth

FreightOS may be:

- system of record;
- authoritative mirror;
- derived view;
- routing index;
- evidence custodian;
- pointer to an external authoritative source.

The role must be declared per object and field. “Stored in FreightOS” does not automatically mean “authoritative.”


---

<!-- SOURCE: 05_UNIVERSAL_EVENT_MODEL.md -->

# 05 — Universal Event Model

## 1. Purpose

A FreightOS event is an immutable statement that something relevant occurred, was asserted, was observed, was inferred, or was corrected.

## 2. Event classes

- **Observed:** produced by a sensor, device, system, or authenticated human observation.
- **Asserted:** claimed by a participant but not independently verified.
- **Verified:** accepted after prescribed evidence or counterparty confirmation.
- **Derived:** computed from other events or models.
- **Predicted:** forecast with model/version/confidence metadata.
- **Command-result:** outcome of an attempted command.
- **Correction:** supersedes or clarifies prior event content without deletion.
- **Dispute:** challenges an event or derived state.

## 3. Required envelope

Every event includes:

- event ID;
- type and semantic version;
- source identity;
- subject references;
- occurred-at and recorded-at timestamps;
- tenant/organization context;
- classification and visibility policy reference;
- correlation, causation, workflow, and trace IDs;
- schema reference;
- idempotency/deduplication material;
- evidence references where required;
- signature or transport-authentication context;
- payload.

## 4. Naming

Use reverse-domain or controlled namespace naming:

```text
com.freightos.shipment.arrived.v1
com.freightos.facility.gate-entered.v1
com.freightos.vehicle.fault-observed.v1
com.freightos.service.repair-authorized.v1
com.freightos.settlement.invoice-disputed.v1
```

The major event version belongs in the type or schema reference. Minor compatible evolution follows registry policy.

## 5. Ordering

Global ordering is not required and should not be claimed. Ordering guarantees are defined per aggregate, partition key, or workflow. Consumers must tolerate late arrival and explicitly handle sequence gaps.

## 6. Delivery

Events use durable publication, consumer acknowledgements, retry with backoff, dead-letter isolation, replay, and reconciliation. Delivery semantics are at-least-once unless a specific transport proves stronger semantics; consumers remain idempotent.

## 7. Corrections

A correction event references the original event, reason, correcting authority, and effective time. Derived projections must identify whether they incorporate the correction.

## 8. Evidence thresholds

Examples:

- arrival may accept geofence + authenticated device;
- custody transfer may require both parties or signed document evidence;
- bank-account change is not an event-only operation and requires command/approval controls;
- repair completion may require provider assertion plus work-order evidence;
- detention charge requires policy, timeline events, and supporting documentation.


---

<!-- SOURCE: 06_INTENT_COMMAND_AND_WORKFLOW_PROTOCOL.md -->

# 06 — Intent, Command, and Workflow Protocol

## 1. Separation of concepts

- **Intent:** a participant's desired outcome.
- **Proposal:** a suggested action, often produced by a human or agent.
- **Request:** an invitation for another participant to act.
- **Approval:** authorization by an eligible principal.
- **Command:** a bounded instruction to an execution handler.
- **Result:** accepted, rejected, failed, expired, cancelled, or completed outcome.

No proposal becomes a command without deterministic policy evaluation.

## 2. Command envelope

Required fields include:

- command ID and type/version;
- requester and represented organization;
- target resource and expected version;
- authority grant/policy decision reference;
- approval references;
- idempotency key;
- issued-at and expiration;
- preconditions;
- maximum financial/operational bounds;
- correlation/workflow/trace IDs;
- payload;
- compensation strategy where applicable.

## 3. Optimistic concurrency

Commands that mutate shared state must declare expected object version or explicit conflict behavior. Silent last-write-wins is prohibited for consequential logistics, authority, custody, and financial records.

## 4. Idempotency

Command handlers persist execution claims before external side effects. A repeated idempotency key returns the prior result or safely resumes the same execution; it never creates a duplicate tow, booking, payment, or approval.

## 5. Workflow model

Cross-party workflows are explicit state machines with:

- participating roles;
- entry conditions;
- state transitions;
- deadlines and timers;
- required evidence;
- approval rules;
- exceptions;
- compensation or reversal actions;
- completion and reconciliation criteria.

## 6. Saga discipline

Distributed transactions use orchestrated or choreographed sagas only where their ownership and compensation semantics are clear. Compensating an action does not imply erasing the original event.

## 7. Human control

High-consequence commands require human approval according to risk policy. Emergency action may use pre-authorized limits but must generate immediate notice, audit, and retrospective review.


---

<!-- SOURCE: 07_NETWORK_TOPOLOGY_AND_PLANES.md -->

# 07 — Network Topology and Planes

## 1. Logical topology

FreightOS uses a hub-and-federation model:

- a shared network kernel provides identity, policy, schemas, discovery, routing, and audit;
- applications and partners connect through APIs, event channels, batch/EDI adapters, and controlled portals;
- authoritative business data may remain with the participant or designated domain service;
- FreightOS maintains sufficient references, policy, and replicated operational state to coordinate safely.

## 2. Governance plane

Contains:

- network constitution;
- schema and vocabulary registry;
- conformance levels;
- partner agreements;
- policy definitions;
- architecture decisions;
- deprecation calendar.

## 3. Control plane

Contains:

- identity federation;
- authorization and consent;
- participant registry;
- capability and endpoint registry;
- subscription registry;
- schema resolution;
- routing policy;
- key and credential metadata.

## 4. Data plane

Handles:

- event ingestion and delivery;
- API resource exchange;
- evidence/document transfer;
- query and subscription responses;
- partner acknowledgements.

## 5. Execution plane

Runs commands with side effects through isolated executors. Each executor has an allowlist, rate and amount limits, idempotency store, circuit breaker, audit emitter, and kill switch.

## 6. Observation plane

Correlates business and technical telemetry without exposing sensitive payloads. It measures event freshness, delivery lag, command success, reconciliation drift, workflow deadlines, authorization denials, and partner conformance.

## 7. Regional and cellular evolution

The initial implementation may be single-region and modular, but interfaces must not assume one database or one deployment cell. Network IDs, routing, schemas, and event envelopes must support later partitioning by region, tenant, and criticality.

## 8. Offline and edge operation

Driver, vehicle, facility, and roadside workflows require bounded offline behavior:

- signed cached assignments and permissions;
- local event queue;
- monotonic client sequence;
- secure reconciliation after reconnect;
- stale-policy expiration;
- conflict handling;
- no offline execution of prohibited financial or identity changes.


---

<!-- SOURCE: 08_DATA_SOVEREIGNTY_CONSENT_AND_DISCLOSURE.md -->

# 08 — Data Sovereignty, Consent, and Selective Disclosure

## 1. Policy goal

FreightOS must maximize network utility while minimizing unnecessary data concentration and disclosure.

## 2. Data control model

Every data element has:

- originator;
- controller/owner designation;
- custodian;
- subject where applicable;
- purpose;
- classification;
- permitted recipients;
- retention and deletion rule;
- derivation lineage;
- legal/contractual basis;
- geographic restrictions.

## 3. Consent grants

Consent is represented as a versioned grant specifying:

- grantor and represented organization;
- recipient or recipient class;
- resources/fields;
- permitted purposes/actions;
- effective and expiry time;
- revocation behavior;
- downstream-sharing restrictions;
- audit and notification terms.

Consent does not replace other legal or contractual requirements.

## 4. Selective disclosure

Prefer assertions over raw data:

- `authority_verified=true` rather than full credential files;
- `mission_ready=true` with expiry and constraints rather than full repair history;
- `payment_destination_verified=true` rather than bank details;
- facility performance band rather than identifiable driver narratives.

## 5. Data residency and federation

Architecture must support storing sensitive source data in participant-controlled or regional stores while exposing governed APIs, events, or proofs. Replication requires an explicit purpose and retention policy.

## 6. Analytics

Network analytics must define:

- minimum cohorts;
- suppression rules;
- outlier handling;
- re-identification risk review;
- allowed joins;
- model training permission;
- customer opt-out where contractually applicable;
- lineage to source classifications.

## 7. Revocation

Revocation stops future access and subscriptions. It does not erase immutable records that FreightOS must retain for security, transaction evidence, legal obligation, or dispute resolution; those exceptions must be documented and access-restricted.


---

<!-- SOURCE: 09_INTEROPERABILITY_STANDARDS_AND_ADAPTERS.md -->

# 09 — Interoperability Standards and Adapter Architecture

## 1. Strategy

FreightOS owns a canonical model but must map to external standards through versioned profiles. Adapters translate syntax and semantics; they do not silently invent missing facts.

## 2. Baseline standards

- **GS1 EPCIS/CBV:** supply-chain visibility event semantics and business context.
- **CloudEvents:** portable event envelope conventions.
- **AsyncAPI:** event-driven interface contracts.
- **OpenAPI:** HTTP API contracts.
- **DCSA standards:** ocean booking, bill of lading, track-and-trace, and platform interoperability profiles.
- **IATA ONE Record:** air-cargo logistics objects, APIs, and federated data-sharing concepts.
- **UN/CEFACT reference data models:** multimodal and buy-ship-pay semantic alignment.
- **EDI/X12 and EDIFACT:** legacy partner compatibility where required.
- **OIDC/OAuth and workload identity standards:** participant and system authentication/delegation.

## 3. Adapter rules

Every adapter declares:

- source and target versions;
- supported messages/objects/events;
- field and code mappings;
- semantic loss;
- defaults and prohibited inference;
- timezone/unit/currency behavior;
- identifier mapping;
- security and consent expectations;
- retry/idempotency behavior;
- conformance tests;
- deprecation status.

## 4. Anti-corruption layer

External schemas terminate at an adapter boundary. Core domain logic consumes canonical objects and events. Partner-specific quirks must not spread throughout the core.

## 5. Round-trip integrity

Where two-way interoperability is promised, tests must prove that supported fields survive canonical translation and return without unauthorized mutation or semantic drift.

## 6. Conformance claims

FreightOS may state:

- mapped;
- profile-compatible;
- partially conformant;
- conformant;
- certified by an external program.

These labels are not interchangeable. Evidence must support the exact claim.


---

<!-- SOURCE: 10_API_GATEWAY_AND_DEVELOPER_PLATFORM.md -->

# 10 — API Gateway, Partner Integration, and Developer Platform

## 1. API styles

- Resource APIs for canonical objects and queries
- Command APIs for bounded actions
- Event APIs for publication and subscription
- Bulk and file exchange for legacy/high-volume workflows
- Webhook delivery for simple partner consumption
- Streaming channels where justified by latency and scale

## 2. API gateway responsibilities

- authentication and delegated authorization;
- organization and tenant context binding;
- schema validation;
- request size and rate limits;
- idempotency enforcement;
- replay protection;
- correlation and trace IDs;
- partner version routing;
- audit emission;
- abuse and anomaly detection;
- safe error normalization.

The gateway does not replace domain authorization inside services.

## 3. Partner environments

- documentation and sample payloads;
- sandbox identities and synthetic data;
- deterministic conformance suite;
- webhook/event replay tools;
- rate-limit and failure simulation;
- compatibility report;
- production credential issuance only after approval.

## 4. Versioning

Use explicit API versions and compatibility policy. Breaking changes require parallel support, migration guidance, and partner communication. Emergency security removals follow a documented exception process.

## 5. Webhooks

Require:

- HTTPS;
- signed payloads;
- timestamp and replay window;
- event ID and idempotency;
- acknowledgement rules;
- retry schedule;
- dead-letter handling;
- endpoint verification;
- subscription-scoped secrets or asymmetric keys;
- payload minimization.

## 6. Developer portal

The portal should eventually expose:

- API/AsyncAPI contracts;
- schema registry;
- event catalog;
- capability registry;
- changelog and deprecations;
- conformance status;
- integration health;
- key/credential management;
- support and incident notices.


---

<!-- SOURCE: 11_EVENT_BUS_SUBSCRIPTIONS_AND_DELIVERY.md -->

# 11 — Event Bus, Subscriptions, and Delivery Guarantees

## 1. Logical bus

The logical network event bus is independent of any specific broker technology. Implementation may evolve from a managed queue/broker to partitioned streaming infrastructure without changing the public event contract.

## 2. Publication pipeline

1. authenticate producer;
2. resolve represented organization;
3. authorize event type and subjects;
4. validate schema and classification;
5. check idempotency/deduplication;
6. persist durable event and audit record;
7. acknowledge publication;
8. route to authorized subscriptions;
9. record delivery attempts and receipts;
10. reconcile gaps.

## 3. Subscriptions

A subscription defines:

- subscriber identity;
- event types and filters;
- subject/resource scope;
- purpose and consent basis;
- delivery channel;
- payload projection/redaction;
- version support;
- start position and retention window;
- retry/dead-letter policy;
- expiry and revocation.

## 4. Backpressure

Slow consumers may not degrade publishers or unrelated consumers. Apply bounded queues, delivery pause, lag alerts, catch-up policies, and controlled replay.

## 5. Reconciliation

Publishers and consumers expose sequence/checkpoint material where available. Reconciliation identifies:

- missing events;
- duplicates;
- unauthorized events;
- schema failures;
- late events;
- divergent aggregate state;
- delivery acknowledgements without processing completion.

## 6. Privacy

Routing decisions evaluate field-level projection and classification. A subscriber authorized for an event type may still receive a reduced payload.

## 7. Retention

Retention differs by event class, legal/evidence need, and consumer recovery requirement. Long-term analytical copies must preserve classification and correction lineage.


---

<!-- SOURCE: 12_DOCUMENT_EVIDENCE_AND_CHAIN_OF_CUSTODY.md -->

# 12 — Documents, Evidence, and Chain of Custody

## 1. Evidence model

An evidence envelope references content without treating every file as universally shareable. It includes:

- evidence ID and type;
- content hash;
- capture time and uploader/capture device;
- subject and related event;
- media/document metadata;
- storage location and encryption domain;
- classification and access policy;
- authenticity/verification state;
- transformations and redactions;
- retention and legal-hold status.

## 2. Document versions

Documents are immutable versions. Amendments and corrections create new versions with lineage. OCR output and extracted fields are derived artifacts, not replacements for source documents.

## 3. Custody events

Chain-of-custody events should capture:

- transferor and transferee;
- cargo/handling-unit references;
- location and time;
- seal/condition identifiers;
- authority and role;
- acceptance/rejection;
- evidence;
- exceptions;
- signatures or confirmations.

## 4. Proof strength

FreightOS assigns proof level based on source and corroboration, for example:

- self-asserted;
- device-attested;
- document-supported;
- counterparty-confirmed;
- independently verified;
- legally signed/title-controlled.

Proof level is contextual and does not imply universal legal validity.

## 5. Sensitive documents

Identity, banking, contracts, manifests, hazardous-goods, medical, customs, and title-related documents require narrower storage and access profiles. Documents are never inserted into model prompts unless explicitly permitted and minimized.

## 6. Disputes

Dispute workflows link claims to events, documents, policies, deadlines, participants, and resolution. Evidence is preserved even when a commercial resolution changes the amount owed.


---

<!-- SOURCE: 13_AGENT_TO_AGENT_COORDINATION_PROTOCOL.md -->

# 13 — Agent-to-Agent Coordination Protocol

## 1. Objective

Authorized agents may coordinate logistics through the same governed network as humans and systems, but they are not trusted merely because they are FreightOS agents.

## 2. Agent identity

Each agent has:

- immutable network identity;
- owner and represented organization;
- purpose and role;
- model/runtime version;
- tool allowlist;
- data scope;
- command and financial limits;
- approval policy;
- valid period;
- revocation and kill-switch state.

## 3. Allowed messages

- observation summary;
- information request;
- proposal;
- negotiation position within bounds;
- approval request;
- command request;
- escalation;
- command-result interpretation.

Free-form agent conversation is never sufficient authorization for execution.

## 4. Proposal envelope

An agent proposal includes:

- proposed action;
- affected resources;
- objective;
- supporting evidence and assumptions;
- confidence/uncertainty;
- alternatives considered;
- expected cost and operational impact;
- required approvers;
- expiration;
- agent identity and policy version.

## 5. Deterministic gate

Before execution, policy independently verifies identity, authority, limits, preconditions, conflicts, approvals, idempotency, and current state. Prompt instructions cannot alter these controls.

## 6. Negotiation

Agents may negotiate only within explicit floors, ceilings, time limits, counterparties, and terms. They must disclose machine representation when required by policy or law. Secret collusion, bid manipulation, discriminatory ranking, and unauthorized commercial disclosure are prohibited.

## 7. Memory and context

Agent memory must inherit source data classification and retention. Cross-tenant memory and unapproved model training are prohibited.

## 8. Failure behavior

On ambiguity, conflicting commands, stale context, policy service failure, or anomalous counterpart behavior, agents stop execution and escalate. They do not infer authority from urgency.


---

<!-- SOURCE: 14_HUMAN_APPROVAL_EXCEPTION_AND_ESCALATION.md -->

# 14 — Human Approval, Exceptions, and Escalation

## 1. Human-in-command model

Humans define policy and approval boundaries. Automation operates inside those boundaries and must expose enough context for meaningful oversight.

## 2. Risk-tiered approval

### Tier 0 — Read/observe

No external side effect; normal authorization still applies.

### Tier 1 — Reversible low-impact

May execute automatically within bounded policy, with audit and notification.

### Tier 2 — Material operational

Examples: appointment change, provider dispatch, load reassignment. Requires designated approval or explicit pre-authorization.

### Tier 3 — Financial/legal/safety critical

Examples: bank-account change, title/custody control, major repair, hazardous-goods exception, regulatory representation. Requires step-up verification and often dual control.

## 3. Approval record

Approvals bind:

- approver identity and organization;
- exact action and resource version;
- limits and conditions;
- expiration;
- evidence presented;
- authentication assurance;
- policy decision;
- revocation/cancellation state.

## 4. Exception types

- operational delay;
- conflicting participant reports;
- missing evidence;
- authorization failure;
- integration failure;
- safety risk;
- financial discrepancy;
- data-quality conflict;
- suspected fraud;
- legal/regulatory hold.

## 5. Escalation

Escalation routes by severity, ownership, time sensitivity, and business relationship. The system must avoid alert flooding and preserve a clear accountable owner.

## 6. Emergency mode

Emergency actions require pre-defined scopes and maximums. They must not become a bypass for ordinary approval. Every emergency execution triggers immediate audit, notification, and retrospective review.


---

<!-- SOURCE: 15_MARKETPLACE_CAPACITY_AND_SERVICE_DISCOVERY.md -->

# 15 — Marketplace, Capacity, and Service Discovery

## 1. Purpose

The network may expose verified demand, capacity, service capability, and availability. Discovery is distinct from contracting and execution.

## 2. Capability advertisement

A participant may advertise:

- service/equipment type;
- geography or corridor;
- time window;
- capacity or availability;
- certifications and constraints;
- pricing model or quote requirement;
- response SLA;
- verification status;
- data freshness;
- terms reference.

## 3. Matching

Matching may consider suitability, location, readiness, price, reliability, trust, response time, relationship, and policy. Ranking factors must be governed and tested for manipulation and unfair self-preferencing.

## 4. Commercial separation

The network must distinguish:

- advertisement;
- invitation/request;
- quote;
- negotiation;
- offer;
- acceptance;
- contract/commitment;
- assignment;
- execution;
- settlement.

A match is not a contract.

## 5. Density strategy

Launch by corridor, service category, or known partner cluster. Report actual supply coverage and response metrics; never market nominal nationwide coverage that cannot meet operating expectations.

## 6. Abuse controls

- identity and authority verification;
- duplicate and fake capacity detection;
- rate and quote manipulation monitoring;
- collusion analysis;
- prohibited-cargo controls;
- sanctions/compliance checks where required;
- user reporting and dispute process;
- provider suspension and appeal.


---

<!-- SOURCE: 16_SETTLEMENT_RECONCILIATION_AND_TRANSACTION_TRUTH.md -->

# 16 — Settlement, Reconciliation, and Transaction Truth

## 1. Scope

FreightOS should first establish contractual and operational truth, not assume regulated custody of funds.

## 2. Reconciliation graph

Link:

- rate/contract terms;
- executed shipment and stop events;
- documents and evidence;
- accessorial policy;
- charges and deductions;
- invoice versions;
- payment instructions;
- payment-provider status;
- disputes and claims;
- final settlement outcome.

## 3. Financial artifacts

A financial artifact declares currency, precision, tax treatment where relevant, payer/payee, contractual basis, evidence, status, and external provider references.

## 4. Payment commands

Payment execution requires separate controls:

- verified parties and destination;
- amount and currency limits;
- dual control or step-up thresholds;
- sanctions/fraud screening where applicable;
- idempotency;
- provider reconciliation;
- immutable audit;
- no sensitive banking data in general event payloads.

## 5. Dispute model

Disputes preserve:

- contested object/charge/event;
- claimant and respondent;
- reason code and narrative;
- evidence;
- response deadline;
- provisional state;
- resolution and authority;
- financial adjustment events.

## 6. Regulatory boundary

Before acting as broker, factor, lender, insurer, money transmitter, escrow agent, or title-control platform, FreightOS requires legal analysis, licensing/partner strategy, operational controls, and owner approval.


---

<!-- SOURCE: 17_FACILITY_ASSET_AND_MISSION_READINESS_GRAPH.md -->

# 17 — Facility, Asset, and Mission-Readiness Graph

## 1. Objective

FreightOS should connect facility behavior, vehicle condition, driver/operational constraints, provider coverage, route risk, and load economics to answer whether a mission is executable.

## 2. Facility graph

Track:

- identifiers and operating organization;
- appointment rules;
- gate/dock capabilities;
- equipment/commodity constraints;
- hours and closures;
- arrival, gate, dock, load/unload, departure events;
- dwell distributions and evidence quality;
- accessorial policies and dispute outcomes;
- communication endpoints;
- data freshness.

## 3. Asset graph

Track:

- identity and control relationship;
- configuration and capability;
- telemetry freshness;
- maintenance and fault events;
- service restrictions;
- inspection/compliance status;
- route/load compatibility;
- mission-readiness assessments.

## 4. Mission-readiness assertion

A mission-readiness assertion includes:

- asset and mission references;
- eligible/ineligible/conditional state;
- constraints;
- assessment time and expiry;
- source data freshness;
- model/rule version;
- evidence and unresolved faults;
- permitted disclosure level.

It is not a warranty or safety certification unless explicitly governed as such.

## 5. Feedback loop

Predictions are compared with actual outcomes: delay, breakdown, service, cost, completion, settlement, and next-mission impact. Model learning must respect data-use permissions and avoid leaking participant-specific economics.


---

<!-- SOURCE: 18_NETWORK_REPUTATION_TRUST_AND_RISK.md -->

# 18 — Network Reputation, Trust, and Risk

## 1. Separation

Identity verification, transaction reputation, operational performance, and risk prediction are separate dimensions. A verified organization can still perform poorly; a new organization may lack history without being untrustworthy.

## 2. Trust inputs

- identity and authority verification;
- credential freshness;
- successful transaction history;
- event/evidence consistency;
- disputes and resolutions;
- delivery, payment, facility, service, and response performance;
- security incidents and integration behavior;
- anomaly and fraud signals.

## 3. Score governance

Scores require:

- documented purpose;
- explainable factors;
- minimum evidence threshold;
- uncertainty and freshness;
- anti-gaming controls;
- correction and appeal;
- prohibited attributes;
- bias and disparate-impact review where applicable;
- versioning and monitoring.

## 4. Disclosure

Raw internal fraud signals are not broadly exposed. Participants receive actionable explanations and appeal channels consistent with security and anti-evasion needs.

## 5. Network enforcement

Responses may include step-up verification, reduced limits, manual review, quarantine, suspended capabilities, or removal. Enforcement is proportional, documented, and appealable except where immediate security containment is necessary.


---

<!-- SOURCE: 19_MULTIMODAL_EXPANSION_MODEL.md -->

# 19 — Multimodal Expansion Model

## 1. Principle

Truck is the initial operating wedge, but core identifiers, objects, events, documents, and workflows must not hard-code one mode.

## 2. Mode-neutral concepts

- party;
- shipment/consignment;
- transport movement;
- leg;
- location/facility;
- equipment/transport means;
- handling unit;
- booking/tender;
- custody;
- document;
- event;
- charge/settlement;
- exception.

## 3. Mode-specific profiles

### Road

Driver, tractor, trailer, HOS/ELD, roadside service, facility dwell, rate confirmation, POD.

### Rail

Rail carrier, terminal, railcar/container, waybill, interchange, train event, demurrage.

### Ocean

Carrier, vessel/voyage, port/terminal, container, booking, bill of lading, transshipment, detention/demurrage.

### Air

Airline/flight, airport/ground handler, ULD, air waybill, security screening, ONE Record logistics objects.

## 4. Expansion gate

A new mode requires:

- canonical-gap analysis;
- standards profile;
- legal/document review;
- identity and authority mapping;
- event/workflow catalog;
- partner pilot;
- conformance suite;
- no regression to road operations.

## 5. Cross-modal journey

A shipment may contain multiple mode-specific legs connected by handoff and custody events. FreightOS must preserve one end-to-end correlation while respecting each mode's authoritative systems and documents.


---

<!-- SOURCE: 20_NETWORK_GOVERNANCE_VERSIONING_AND_CONFORMANCE.md -->

# 20 — Network Governance, Versioning, and Conformance

## 1. Governance bodies/functions

Initially these may be roles rather than committees:

- Network Architecture Owner
- Domain Model Steward
- Security and Privacy Owner
- API/Event Contract Maintainer
- Partner Conformance Owner
- Product/Operations Representative
- Legal/Compliance Reviewer for regulated domains

## 2. Registries

Maintain:

- participant and capability registry;
- schema registry;
- event catalog;
- command catalog;
- vocabulary/code-list registry;
- external-standard mapping registry;
- deprecation registry;
- conformance status registry.

## 3. Change classes

- editorial/non-semantic;
- backward-compatible additive;
- behavioral compatible;
- breaking schema/API;
- authority/security critical;
- emergency security change.

Each class has required reviewers, tests, notice, and rollout behavior.

## 4. Conformance levels

- **L0 Documented:** contracts and declared scope exist.
- **L1 Syntactic:** payload/API validation passes.
- **L2 Semantic:** lifecycle and field meanings conform.
- **L3 Operational:** idempotency, failure, replay, and SLO tests pass.
- **L4 Trusted:** security, privacy, evidence, and authority controls pass.
- **L5 Certified:** approved independent or standards-body certification where available.

## 5. Compatibility

Consumers publish supported versions/capabilities. Producers may not assume every consumer understands newly added behavior. Feature negotiation and schema defaults are explicit.

## 6. Deprecation

Every deprecation states replacement, affected partners, final support date, migration tests, and emergency rollback. Network-critical deprecations require usage evidence and direct partner confirmation.


---

<!-- SOURCE: 21_NETWORK_OBSERVABILITY_AND_SLOS.md -->

# 21 — Network Observability and SLOs

## 1. User-centered measurements

Technical uptime is insufficient. Measure whether participants can publish, receive, understand, and act on logistics information correctly and on time.

## 2. Core indicators

- event publication success;
- event durability confirmation latency;
- delivery latency by partner/channel;
- consumer lag and dead-letter rate;
- duplicate and gap rate;
- schema rejection rate;
- authorization decision latency/availability;
- command acceptance and completion rate;
- idempotency collision/duplicate-prevention count;
- workflow deadline misses;
- stale telemetry and stale capability advertisements;
- reconciliation drift;
- partner conformance failures;
- cross-tenant/security anomalies.

## 3. Suggested service classes

### N0 — Emergency and active execution

Dispatch, active shipment, roadside, identity/authorization. Highest reliability and alert urgency.

### N1 — Transaction coordination

Tender, appointment, documents, service approvals, settlement instructions.

### N2 — Intelligence and analytics

Predictions, benchmarks, recommendations, historical reports.

### N3 — Administrative

Configuration, exports, nonurgent catalog changes.

Final numeric SLOs require owner decisions and production baselines; they must not be invented during documentation installation.

## 4. Trace correlation

Use stable correlation, causation, workflow, command, event, and trace identifiers. Logs must not contain unnecessary payloads or secrets.

## 5. Business reconciliation dashboards

Dashboards must expose unresolved gaps and state divergence, not only infrastructure health. A green broker with undelivered critical events is not healthy.


---

<!-- SOURCE: 22_REFERENCE_ARCHITECTURE.md -->

# 22 — Reference Architecture

## 1. Initial modular network kernel

Recommended bounded modules:

1. **Identity and Relationship Registry**
2. **Policy, Consent, and Delegation Engine**
3. **Canonical Object Registry and Resolver**
4. **Schema, Vocabulary, and Event Catalog**
5. **Event Ingestion and Durable Store**
6. **Subscription and Delivery Service**
7. **Command Gateway and Idempotent Executors**
8. **Workflow Orchestrator**
9. **Evidence and Document Registry**
10. **Capability and Endpoint Registry**
11. **Reconciliation Service**
12. **Audit and Network Observability**
13. **Standards/Partner Adapter Framework**
14. **Agent Proposal Gateway**

These can initially live in a modular monolith or limited services. Boundaries and contracts matter before deployment count.

## 2. Data stores

Use purpose-specific logical stores:

- transactional relational store;
- append-only event/audit store;
- object/evidence storage;
- search/read models;
- idempotency and delivery state;
- analytics warehouse/lake with governed ingestion;
- schema and policy registries.

Physical consolidation is allowed initially if access, lifecycle, migration, and blast-radius boundaries remain explicit.

## 3. Core flow

```text
Producer/Endpoint
  -> Gateway/Adapter
  -> Identity + Policy + Schema Validation
  -> Durable Event or Command Acceptance
  -> Event Store / Workflow / Executor
  -> Authorized Subscriptions and Read Models
  -> Delivery Receipts + Reconciliation
  -> Audit/Observability
```

## 4. Agent flow

```text
Event/Context
  -> Agent reads permitted projection
  -> Agent emits proposal
  -> Deterministic policy and state validation
  -> Human approval when required
  -> Command gateway
  -> Idempotent executor
  -> Result event and audit
```

## 5. Partner flow

```text
External Standard/API/EDI
  -> Partner-specific adapter
  -> Canonical mapping + semantic validation
  -> Network event/object/command
  -> response or outbound mapping
  -> conformance and reconciliation evidence
```

## 6. Deployment evolution

### Phase A

Modular kernel, one production region, managed infrastructure, no broad external execution.

### Phase B

Separated event delivery/execution workers, partner sandbox, bounded pilots, replay/reconciliation.

### Phase C

Cells/regions, workload identity federation, partner production integrations, capacity discovery.

### Phase D

Multimodal profiles, high-volume network services, regulated partnerships, autonomous bounded coordination.

## 7. Technology neutrality

The handoff does not mandate Kafka, a particular cloud, service mesh, graph database, or blockchain. Selection follows workload evidence, team capacity, security, total cost, and reversibility.


---

<!-- SOURCE: 23_IMPLEMENTATION_ROADMAP_PR_SEQUENCE.md -->

# 23 — Implementation Roadmap and Pull-Request Sequence

## Governing rule

One pull request should introduce one reviewable capability with tests and rollback. Documentation installation remains separate from runtime implementation.

## Phase 0 — Inventory and gap analysis

### PR 0A — Network inventory document

- current domain models and identifiers;
- API/event/webhook inventory;
- tenant and authority boundaries;
- existing outbox/queue/workflow patterns;
- partner/standards integrations;
- data ownership and source-of-truth map;
- known live side effects.

No runtime change.

### PR 0B — Architecture decision baseline

Create ADRs for:

- canonical ID strategy;
- event envelope;
- schema registry;
- modular kernel boundaries;
- outbox/event durability;
- command/idempotency model;
- initial partner/pilot scope.

## Phase 1 — Contracts before transport

### PR 1 — Canonical identifiers and object references

Add immutable IDs, external alias model, relationship primitives, and tests. No destructive ID migration.

### PR 2 — Schema registry and contract validation

Install JSON Schema validation, registry metadata, versioning rules, and CI checks.

### PR 3 — Universal event envelope

Add event model, event catalog entries, validation, classification, correlation, correction, and tests.

### PR 4 — Transactional outbox

Guarantee state change and event publication intent are committed together. Add recovery and duplicate tests.

## Phase 2 — Event network

### PR 5 — Event ingestion and durable journal

Authenticated/authorized publication, append-only record, dedupe, audit.

### PR 6 — Subscription and projection policy

Field-level redaction, purpose/consent, subscription lifecycle.

### PR 7 — Delivery worker and receipts

Retry, backoff, webhook signatures, dead-letter, replay, lag telemetry.

### PR 8 — Reconciliation

Gap detection, checkpoints, replay authorization, divergent-state reports.

## Phase 3 — Commands and workflows

### PR 9 — Command envelope and idempotency store

Expected version, preconditions, expiry, approval, deterministic result.

### PR 10 — Bounded executor framework

Allowlist, limits, circuit breakers, side-effect adapters, kill switches.

### PR 11 — Workflow state machine framework

Timers, transitions, evidence, compensation, audit.

### PR 12 — Human approval service

Risk tiers, step-up, dual control where required, immutable approvals.

## Phase 4 — Evidence and interoperability

### PR 13 — Evidence/document registry

Hashes, lineage, classifications, transformations, access.

### PR 14 — Adapter framework

Anti-corruption boundary, mapping metadata, errors, conformance harness.

### PR 15 — First standards profile

Select one pilot profile—recommended GS1/EPCIS-aligned road event subset—and prove mapping and round-trip behavior.

### PR 16 — Partner sandbox and conformance portal

Synthetic data, contracts, replay, failure testing, reports.

## Phase 5 — First end-to-end network workflow

Recommended pilot: facility arrival/dwell/detention or roadside service coordination.

### PR 17 — Domain workflow

Canonical objects, events, commands, approvals, evidence, read model.

### PR 18 — Existing app adapters

RigReceipts/RigDesk/FreightOS application integration without breaking current workflows.

### PR 19 — Known partner pilot adapter

Sandbox first, then controlled production behind flags and limits.

### PR 20 — Outcome and reconciliation dashboard

User-visible state, delivery, exceptions, discrepancies, audit.

## Phase 6 — Agent proposal layer

### PR 21 — Agent identity and proposal envelope

Read-only proposal flow; no direct execution.

### PR 22 — Deterministic proposal gate

Policy, current state, authority, limits, approvals.

### PR 23 — Bounded low-risk automation

One reversible capability with canary, kill switch, audit, and post-action verification.

## Phase 7 — Network expansion

- capability discovery;
- service/provider exchange;
- settlement reconciliation;
- additional standards profiles;
- regional/cellular evolution;
- multimodal pilots.

## Cross-PR gates

Every runtime PR must include:

- backward compatibility analysis;
- tenant/authorization tests;
- event/schema contract tests;
- migration and rollback plan;
- observability and runbook updates;
- no unapproved live activation;
- evidence mapped to `24_ACCEPTANCE_GATES_EVIDENCE_MATRIX.md`.


---

<!-- SOURCE: 24_ACCEPTANCE_GATES_EVIDENCE_MATRIX.md -->

# 24 — Acceptance Gates and Evidence Matrix

| Gate | Requirement | Minimum evidence |
|---|---|---|
| NA-01 | Canonical identities are immutable and external aliases are versioned | schema, migration test, collision tests |
| NA-02 | Cross-organization authority is deny-by-default | policy tests, fabricated-identity tests |
| NA-03 | Canonical schemas are registry-controlled and CI-validated | registry artifact, compatibility tests |
| NA-04 | Material events are durable and append-only | outbox/journal tests, recovery proof |
| NA-05 | Event consumers are idempotent and replay-safe | duplicate/replay test results |
| NA-06 | Corrections preserve original history | correction lineage test |
| NA-07 | Field-level disclosure follows classification/consent | projection tests, negative access tests |
| NA-08 | Commands include authority, preconditions, expiry, and idempotency | schema and executor tests |
| NA-09 | External side effects cannot duplicate under retry/crash | fault-injection evidence |
| NA-10 | High-risk commands require deterministic approval gates | policy/approval tests |
| NA-11 | Agent proposals cannot bypass authority or invoke unlisted tools | adversarial tests and audit |
| NA-12 | Partner adapters declare semantic loss and version support | mapping profile and conformance report |
| NA-13 | Delivery failures are visible, retryable, and reconcilable | DLQ/replay/lag evidence |
| NA-14 | Evidence has hash, provenance, access policy, and lineage | schema/storage tests |
| NA-15 | Critical workflows have degraded mode and recovery runbook | game-day or simulation evidence |
| NA-16 | Existing application behavior is preserved during adapter rollout | regression suite, canary evidence |
| NA-17 | Production partner access requires conformance and security approval | signed onboarding checklist |
| NA-18 | Network state can be explained from events and object versions | trace/reconstruction demonstration |
| NA-19 | Observability measures business delivery, not only infrastructure | dashboards and alert tests |
| NA-20 | No implementation claim relies only on documentation | repository SHA, test output, environment evidence |

## Status vocabulary

Use only:

- PASS
- PARTIAL
- FAIL
- NOT IMPLEMENTED
- NOT APPLICABLE, with rationale

A gate cannot be PASS when evidence exists only in an unmerged branch, mock, or document.


---

<!-- SOURCE: 25_DECISIONS_REQUIRED.md -->

# 25 — Decisions Requiring Owner Approval

Implementation should not invent these decisions silently.

## Product and network

1. First network pilot: facility/detention, roadside service, or shipment execution?
2. First external participant class and corridor/market?
3. Which capabilities remain internal until a later partner program?
4. Neutral-network commercial terms and self-preferencing rules?

## Architecture

5. Canonical ID format and public exposure rules?
6. Initial deployment topology and cloud/region?
7. Managed event infrastructure versus relational outbox-first approach?
8. Schema registry implementation?
9. Data residency commitments at launch?
10. Partner workload identity maturity target?

## Data

11. Which data may be used for aggregate intelligence and model training?
12. Minimum cohort and privacy thresholds?
13. Event/document retention by class?
14. Which assertions may be shared instead of raw source data?

## Operations

15. Initial numeric SLOs and support coverage?
16. Maximum automatic command tier at launch?
17. Emergency action limits and notification policy?
18. Partner conformance enforcement and suspension process?

## Legal/regulatory

19. Brokerage, payment, title/document, insurance, and financing boundaries?
20. Required network terms, data-sharing agreement, and dispute forum?
21. Electronic-signature and document-of-title legal strategy?

Claude may recommend options with tradeoffs but must not present an unapproved answer as settled architecture.


---

<!-- SOURCE: 26_CLAUDE_MASTER_IMPLEMENTATION_PROMPT.md -->

# 26 — Claude Master Implementation Prompt

Copy the prompt below into the existing Claude session responsible for FreightOS.

---

You are the senior principal engineer and network architect responsible for integrating the FreightOS Network Architecture Handoff v1.4.0 into the existing FreightOS repository.

## Controlling sources

Read all files under:

```text
docs/production-handoff/v1.4.0-network-architecture/
```

Also read the existing production handoff and:

```text
docs/production-handoff/v1.3.0-security-resilience/
```

The v1.4.0 package is additive. Security, privacy, resilience, tenant isolation, and autonomous-repair controls remain controlling. Do not weaken prior accepted behavior.

## Immediate assignment: Phase 0 only

Perform a repository-specific inventory and gap analysis. Do not implement broad runtime changes yet.

Inspect:

1. repository branch, HEAD, remote, and working-tree state;
2. applications, services, packages, deployment topology, and data stores;
3. organization, actor, role, permission, membership, and service identities;
4. existing canonical/domain objects and identifiers;
5. APIs, webhooks, queues, jobs, outbox/event patterns, and workflow engines;
6. document/evidence storage and audit history;
7. external integrations, credentials, side effects, and production flags;
8. tenant-isolation and source-of-truth boundaries;
9. existing standards/EDI mappings;
10. agent identities, tools, authority, and approval controls;
11. tests, CI gates, migrations, backup/restore, and release controls;
12. live or production-capable environments.

## Required artifacts

Create repository-local Phase 0 documents in a new branch, following existing documentation conventions:

- current-state network inventory;
- domain and identifier map;
- API/event/integration inventory;
- source-of-truth and data-ownership matrix;
- event/command/workflow gap analysis;
- standards and adapter map;
- security/resilience dependency map;
- acceptance-gate status matrix using PASS/PARTIAL/FAIL/NOT IMPLEMENTED;
- prioritized PR sequence adjusted to the actual repository;
- decisions requiring owner approval.

## Prohibitions during Phase 0

Do not:

- run production migrations;
- change database ownership or authority;
- enable live integrations, agents, payments, dispatch, roadside, or external webhooks;
- rotate, expose, or paste secrets;
- rewrite existing applications into microservices;
- adopt Kafka, blockchain, graph databases, service mesh, or any technology merely because it appears in architecture examples;
- claim conformance or implementation without evidence;
- combine dependency/security remediation with the architecture inventory unless it is required to safely inspect the repository;
- alter current user workflows.

## Engineering doctrine

- Protocol first, application-enabled.
- Adapters before destructive rewrites.
- Contracts before transport selection.
- Authority before automation.
- Events are immutable statements; commands are bounded side effects.
- Documentation is not implementation evidence.
- Preserve backward compatibility and rollback.
- Escalate major decisions rather than silently resolving them.

## Required completion report

Return:

1. branch, HEAD SHA, remote, and clean/dirty state;
2. exact files created or changed;
3. current architecture and network-capability inventory;
4. security/tenant/authority observations;
5. acceptance-gate matrix;
6. repository-specific PR plan;
7. owner decisions required;
8. risks and blockers;
9. test/validation commands and exact results;
10. explicit confirmation that no live operation, migration, permission, credential, or external side effect was changed.

Stop after Phase 0 and wait for review. Do not begin Phase 1 automatically.

---


---

<!-- SOURCE: 27_INSTALLATION_AND_HANDOFF_MERGE_INSTRUCTIONS.md -->

# 27 — Installation and Existing-Handoff Merge Instructions

## 1. Destination

From the FreightOS repository root, install this package at:

```text
docs/production-handoff/v1.4.0-network-architecture/
```

## 2. Branch

```bash
git switch main
git pull --ff-only origin main
git switch -c setup/install-network-architecture-handoff-v1.4.0
```

Do not begin from the prior documentation branch unless it has been merged and local `main` has been updated.

## 3. Copy

```bash
mkdir -p docs/production-handoff
cp -R /path/to/FreightOS_Network_Architecture_Handoff_v1.4.0 \
  docs/production-handoff/v1.4.0-network-architecture
```

## 4. Verify

```bash
cd docs/production-handoff/v1.4.0-network-architecture
shasum -a 256 -c MANIFEST.sha256
cd "$(git rev-parse --show-toplevel)"
```

All entries must report `OK`.

## 5. Additive pointer

Append this section to the existing controlling master handoff, without removing prior content:

```markdown
## FreightOS Network Architecture Control Package

The controlling requirements for FreightOS network identity, canonical logistics objects, event and command protocols, cross-party workflow coordination, interoperability, data sovereignty, partner APIs, agent communication, network governance, and conformance are located at:

`docs/production-handoff/v1.4.0-network-architecture/`

This package is additive to the v1.3.0 security and resilience package. No network feature may weaken tenant isolation, privacy, zero-trust authorization, auditability, release safety, or operational continuity. Material conflicts must be escalated and documented rather than resolved silently.
```

If the repository maintains a handoff index, add the package there as well.

## 6. Stage and inspect

```bash
git add docs/production-handoff/v1.4.0-network-architecture
# Stage only the existing master/index files you intentionally edited.
git status --short
git diff --cached --stat
git diff --cached --name-only
```

Every staged file must be documentation/policy/schema/contract material under `docs/production-handoff/`.

## 7. Commit and push

```bash
git commit -m "docs: install FreightOS network architecture handoff v1.4.0"
git push -u origin setup/install-network-architecture-handoff-v1.4.0
```

## 8. Pull request

The installation PR is documentation-only. It must not contain runtime code, migrations, dependency upgrades, credentials, configuration changes, or live integration activation.

## 9. After merge

```bash
git switch main
git pull --ff-only origin main
pbcopy < docs/production-handoff/v1.4.0-network-architecture/26_CLAUDE_MASTER_IMPLEMENTATION_PROMPT.md
```

Paste the prompt into the existing FreightOS Claude session. Phase 0 inventory only.


---

<!-- SOURCE: 28_BUILD_BUY_AND_INTEGRATION_BOUNDARIES.md -->

# 28 — Build, Buy, and Integration Boundaries

## Build as FreightOS core

- canonical identities and object references;
- relationship and delegation graph;
- event/command envelopes and catalogs;
- policy/consent integration layer;
- workflow and reconciliation semantics;
- evidence and provenance model;
- partner conformance framework;
- network audit and business observability;
- agent proposal/authority gateway;
- proprietary mission, facility, asset, and transaction graphs.

## Prefer managed infrastructure initially

- relational databases;
- durable queues/streams;
- object storage;
- key management and secrets;
- identity-provider primitives;
- observability infrastructure;
- API gateway/WAF;
- email/SMS/push delivery;
- document OCR;
- payments and regulated financial rails.

## Integrate rather than replace

- ELD and telematics;
- OEM vehicle data;
- TMS/WMS/ERP/accounting;
- maps/routes/weather;
- carrier authority and compliance sources;
- existing standards-based ocean/air systems;
- payment, factoring, insurance, and identity-verification providers.

## Reconsider building when

- external providers cannot supply a critical signal reliably;
- cost at proven scale exceeds controlled internal ownership;
- provider control creates unacceptable systemic risk;
- proprietary capability materially improves network outcomes;
- legal and operational readiness exists.

## Avoid premature commitments

- custom hardware;
- proprietary blockchain;
- universal data lake containing all participant raw data;
- global microservice decomposition;
- nationwide marketplace without density;
- regulated balance-sheet products.


---

<!-- SOURCE: 29_PILOT_AND_NETWORK_BOOTSTRAP_PLAN.md -->

# 29 — Pilot and Network Bootstrap Plan

## 1. Pilot selection criteria

Choose a workflow with:

- frequent pain;
- measurable economic/operational outcome;
- two or more participant types;
- available evidence;
- bounded legal risk;
- reversible rollout;
- existing application entry point;
- realistic known partners.

## 2. Recommended first pilots

### Option A — Facility arrival, dwell, and detention

Participants: driver/carrier, facility, shipper/broker. Produces high-value timeline, evidence, exception, and settlement data.

### Option B — Roadside service coordination

Participants: driver/fleet, provider, dispatcher, optionally shipper/broker. Exercises real-time command, approval, location, evidence, and mission-replanning.

### Option C — Shipment execution and document reconciliation

Participants: carrier, broker/shipper, facility. Exercises tender, assignment, milestones, POD, charges, invoice truth.

## 3. Pilot stages

1. internal synthetic workflow;
2. shadow mode using real but non-authoritative data;
3. one known counterparty in sandbox;
4. production read/observe;
5. reversible low-risk commands;
6. expanded volume with error budget;
7. second participant/system implementation proving interoperability.

## 4. Success metrics

- event completeness and latency;
- duplicate/gap rate;
- time saved;
- exception detection and resolution;
- economic recovery or avoided cost;
- partner integration effort;
- user trust and override rate;
- security/privacy incidents;
- reconciliation accuracy;
- repeat usage.

## 5. Network proof

A pilot proves network architecture only when at least two independently implemented endpoints exchange the same canonical workflow without private database coupling.

## 6. Stop conditions

Pause or roll back for cross-tenant exposure, incorrect authority, unreconciled duplicate side effects, unacceptable data drift, unresolved critical security finding, or user operations being materially impaired.


---

<!-- SOURCE: REFERENCES.md -->

# References and Standards Baseline

This package uses the following standards as alignment targets. Implementers must verify the current published version before claiming conformance.

- GS1 — EPCIS and Core Business Vocabulary
- CNCF — CloudEvents
- AsyncAPI Initiative — AsyncAPI Specification
- OpenAPI Initiative — OpenAPI Specification
- Digital Container Shipping Association — digital shipping, booking, bill of lading, track-and-trace, and eBL interoperability standards
- IATA — ONE Record
- UN/CEFACT — Reference Data Models, including multimodal and buy-ship-pay concepts
- SPIFFE/SPIRE — workload identity and federation concepts
- NIST and the FreightOS v1.3.0 security/resilience handoff for zero trust, secure development, resilience, and incident response

## Standards policy

References provide semantic and interoperability direction. They do not create automatic conformance. Every claimed profile requires mapping, version declaration, required-field validation, lifecycle behavior, security requirements, and conformance evidence.
