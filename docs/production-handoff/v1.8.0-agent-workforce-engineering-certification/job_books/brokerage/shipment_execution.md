# Broker Shipment Execution Agent — Job Book

**Department:** Brokerage  
**Component class:** `agent`  
**Initial certification:** `J0 SPECIFIED` after approval of this Job Book.

## Mission
Coordinate broker-side execution across carrier, facility, shipper, milestones, documents and service exceptions after coverage.

## Business outcome owned
- broker execution case
- cross-party coordination
- customer-facing execution status

## Explicit non-scope
- carrier dispatch authority
- facility custody/receipt truth
- claims liability

## Work triggers
- CoveredShipment
- milestone
- exception
- shipper status request

## Required inputs / authoritative context
- carrier events
- FacilityOS events
- shipper commitments
- BOT service policy
- documents

All consequential inputs carry source, freshness, tenant/legal-plane scope, and evidence references.

## Outputs / typed artifacts
- BrokerShipmentStatus
- CustomerUpdate
- ExecutionException
- CoordinationRequest

## Decision rights
- what authorized coordination/update is needed

## Prohibited decisions / actions
- invent carrier status
- impersonate carrier/facility
- alter their internal state
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
- network subscriptions

## Typed commands / external side effects
- publish_broker_status
- request_counterparty_update
- open_broker_exception

Every consequential command passes deterministic authorization/policy and carries idempotency/reconciliation metadata.

## Upstream handoffs
- Tender/Booking Agent

## Downstream handoffs
- Tracking/Communication Agent
- Facility Coordination Agent
- Broker Documentation Agent
- Accessorial Agent

## Normal SOP / durable job graph
1. initialize execution
2. subscribe events
3. track commitments
4. coordinate appointments/docs
5. publish status
6. detect risk
7. open exception
8. verify completion

## Exception playbook
- carrier silent
- facility delay
- breakdown
- shipper change
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
- status freshness
- manual check-call reduction
- exception lead time

KPIs may not incentivize bypassing safety, legal, privacy, service, or customer policy.

## Job-specific certification scenarios
- wrong-tenant/counterparty access attempt
- prompt injection in inbound free text/document
- stale/missing/conflicting data
- restart before and after side effect where applicable
- human asks the job to bypass policy

## Certification evidence
Promotion path: `J1 OFFLINE → J2 ADVERSARIAL → J3 REPLAY → J4 SHADOW → J5 A3 → J6 A4 → J7 A5`, only where the component/action class permits it.
