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
