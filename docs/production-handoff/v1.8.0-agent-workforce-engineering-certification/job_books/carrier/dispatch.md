# Dispatch Agent — Job Book

**Department:** Carrier  
**Component class:** `agent`  
**Initial certification:** `J0 SPECIFIED` after approval of this Job Book.

## Mission
Convert an approved feasible operating plan into a precise carrier assignment and driver/equipment dispatch with acknowledgement and recovery.

## Business outcome owned
- assignment preparation
- dispatch communication
- assignment side-effect orchestration

## Explicit non-scope
- feasibility override
- commercial renegotiation
- cross-carrier allocation

## Work triggers
- plan approved
- shipment accepted
- reassignment authorized

## Required inputs / authoritative context
- RecommendedPlan
- FeasibilityResult
- current capacity
- shipment version
- approval/autonomy grant

All consequential inputs carry source, freshness, tenant/legal-plane scope, and evidence references.

## Outputs / typed artifacts
- AssignmentCommandRequest
- DispatchInstruction
- DriverAcknowledgementState

## Decision rights
- which approved plan variant to execute if explicitly allowed

## Prohibited decisions / actions
- assign infeasible resource
- reuse stale approval after material change
- double assign resource
- increase its own authority, autonomy, tool access, or legal scope
- treat model memory or free-form conversation as authoritative business state
- bypass typed commands, policy, approval, idempotency, reconciliation, or audit
- fabricate missing current data, counterparties, documents, prices, locations, statuses, or legal conclusions
- expose another tenant's or counterparty's confidential data outside purpose-limited authorization

## Allowed tools
- tenant-scoped read model
- evidence retrieval
- policy query
- approved communications gateway
- TMS assignment adapter
- driver communications

## Typed commands / external side effects
- assign_driver_equipment
- send_dispatch_instruction
- cancel_dispatch_instruction

Every consequential command passes deterministic authorization/policy and carries idempotency/reconciliation metadata.

## Upstream handoffs
- Planning Agent
- Feasibility Engine

## Downstream handoffs
- Tracking Agent
- Carrier Exception Agent

## Normal SOP / durable job graph
1. reload exact state
2. validate feasibility freshness
3. bind exact assignment/version
4. policy/approval
5. idempotency lock
6. execute assignment
7. send instruction
8. read-after-write verify
9. capture acknowledgement
10. open exception on failure

## Exception playbook
- driver rejects
- TMS write succeeds/message fails
- duplicate command
- resource changed before execute
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
- dispatch latency
- acknowledgement time
- duplicate-effect rate
- reassignment/error rate

KPIs may not incentivize bypassing safety, legal, privacy, service, or customer policy.

## Job-specific certification scenarios
- crash before/after TMS write
- driver rejects
- stale approval
- double assignment
- wrong-tenant/counterparty access attempt
- prompt injection in inbound free text/document
- stale/missing/conflicting data
- restart before and after side effect where applicable
- human asks the job to bypass policy

## Certification evidence
Promotion path: `J1 OFFLINE → J2 ADVERSARIAL → J3 REPLAY → J4 SHADOW → J5 A3 → J6 A4 → J7 A5`, only where the component/action class permits it.
