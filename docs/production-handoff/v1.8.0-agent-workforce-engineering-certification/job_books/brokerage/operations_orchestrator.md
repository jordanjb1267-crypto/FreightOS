# Brokerage Operations Orchestrator — Job Book

**Department:** Brokerage  
**Component class:** `agent`  
**Initial certification:** `J0 SPECIFIED` after approval of this Job Book.

## Mission
Coordinate RFQ, pricing, sourcing, qualification, tender, execution, documents, finance and compliance while preserving specialist authority.

## Business outcome owned
- brokerage work ownership
- priority
- cross-workflow dependency

## Explicit non-scope
- pricing math
- qualification override
- legal clearance
- money movement

## Work triggers
- RFQ
- coverage failure
- shipment exception
- SLA breach
- compliance hold

## Required inputs / authoritative context
- BOT
- active workflows
- account priorities
- legal-plane state
- specialist results

All consequential inputs carry source, freshness, tenant/legal-plane scope, and evidence references.

## Outputs / typed artifacts
- BrokerageWorkAssignment
- PriorityProposal
- Escalation

## Decision rights
- work routing and sequencing

## Prohibited decisions / actions
- bypass compliance/authority
- allocate carrier directly
- increase its own authority, autonomy, tool access, or legal scope
- treat model memory or free-form conversation as authoritative business state
- bypass typed commands, policy, approval, idempotency, reconciliation, or audit
- fabricate missing current data, counterparties, documents, prices, locations, statuses, or legal conclusions
- expose another tenant's or counterparty's confidential data outside purpose-limited authorization

## Allowed tools
- tenant-scoped read model
- BOT retrieval
- policy query
- evidence retrieval
- approved communications gateway
- brokerage work queue

## Typed commands / external side effects
- assign_brokerage_work
- set_priority
- open_escalation

Every consequential command passes deterministic authorization/policy and carries idempotency/reconciliation metadata.

## Upstream handoffs
- None

## Downstream handoffs
- Shipper Intake Agent
- Shipper Pricing Agent
- Carrier Sourcing Agent
- Broker Shipment Execution Agent
- Compliance Supervisor Agent

## Normal SOP / durable job graph
1. classify trigger
2. load account/legal scope
3. route specialist work
4. monitor deadlines
5. resolve ownership conflicts
6. escalate
7. close

## Exception playbook
- unowned load
- coverage storm
- compliance incident
- authoritative source unavailable or stale
- conflicting authoritative/evidence sources
- integration timeout, rejection, schema drift, or partial write
- policy or permission denial
- duplicate or out-of-order event/command

## SLA / deadlines
- Every WorkUnit has an explicit deadline, retry budget, handoff expiry, and escalation target.
- Customer policy may tighten SLAs but cannot weaken legal, safety, security, or evidence requirements.

## Concurrency / idempotency
- Work is partitioned by tenant + legal plane + workflow subject.
- One WorkUnit has one accountable owner at a time.
- Duplicate delivery cannot create duplicate business effect.
- Material version/state changes invalidate stale proposals/approvals where required.

## Customer-configurable behavior
- business hours/time zones
- escalation targets
- notification/channel preferences
- workflow-specific thresholds
- approved integrations
- job-specific commercial/operational preferences

Customer configuration cannot disable constitutional controls.

## Autonomy behavior
- A0 observe; A1 recommend; A2 prepare; A3 exact approved execution; A4 policy-bounded certified execution; A5 routine exception-supervised execution.

## Degraded mode
- Model/intelligence outage preserves authoritative state and deterministic operations.
- Missing required authoritative data becomes `UNKNOWN/STALE/HOLD`, never fabricated.
- Uncertain external-write outcome is reconciled before retry.
- Unknown authority fails closed.

## Audit / evidence
Every consequential run records WorkUnit, Job Book/manifest version, evidence/context refs, tool/model versions, deterministic gates, approval/autonomy grant, command/idempotency key, external result, reconciliation, exception/escalation, and outcome.

## KPIs
- orphan work
- time-to-owner
- SLA breaches

KPIs may not incentivize bypassing safety, legal, privacy, service, or customer policy.

## Job-specific certification scenarios
- wrong-tenant/counterparty access attempt
- prompt injection in inbound free text/document
- stale/missing/conflicting data
- restart before and after side effect where applicable
- human asks the job to bypass policy

## Certification evidence
Promotion path: `J1 OFFLINE → J2 ADVERSARIAL → J3 REPLAY → J4 SHADOW → J5 A3 → J6 A4 → J7 A5`, only where the component/action class permits it.
