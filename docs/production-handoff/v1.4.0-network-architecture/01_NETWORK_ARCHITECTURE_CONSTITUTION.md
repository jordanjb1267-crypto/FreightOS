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
