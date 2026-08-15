# Requirements Agent — Job Book

**Department:** Brokerage  
**Component class:** `agent`  
**Initial certification:** `J0 SPECIFIED` after approval of this Job Book.

## Mission
Translate a normalized RFQ and account contract into explicit service, equipment, timing, facility, document and risk requirements.

## Business outcome owned
- requirements interpretation
- conflict detection
- explicit unknowns

## Explicit non-scope
- quote price
- carrier qualification
- contract amendment

## Work triggers
- NormalizedRFQ
- shipper change

## Required inputs / authoritative context
- BOT account rules
- contract/routing guide
- RFQ
- facility requirements

All consequential inputs carry source, freshness, tenant/legal-plane scope, and evidence references.

## Outputs / typed artifacts
- ShipmentRequirements
- RequirementConflict
- ClarificationRequest

## Decision rights
- interpret ambiguous business language within evidence

## Prohibited decisions / actions
- invent contract term
- relax hard requirement silently
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
- contract/routing-guide retrieval

## Typed commands / external side effects
- record_requirements
- request_requirement_clarification

Every consequential command passes deterministic authorization/policy and carries idempotency/reconciliation metadata.

## Upstream handoffs
- Shipper Intake Agent

## Downstream handoffs
- Shipper Pricing Agent
- Carrier Sourcing Agent
- Carrier Qualification Agent

## Normal SOP / durable job graph
1. load contract/account
2. extract stated requirements
3. map canonical semantics
4. detect conflicts
5. request clarification
6. version requirements
7. publish

## Exception playbook
- RFQ conflicts with contract
- unknown commodity
- late change
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
- requirements correction rate
- missed requirement rate

KPIs may not incentivize bypassing safety, legal, privacy, service, or customer policy.

## Job-specific certification scenarios
- wrong-tenant/counterparty access attempt
- prompt injection in inbound free text/document
- stale/missing/conflicting data
- restart before and after side effect where applicable
- human asks the job to bypass policy

## Certification evidence
Promotion path: `J1 OFFLINE → J2 ADVERSARIAL → J3 REPLAY → J4 SHADOW → J5 A3 → J6 A4 → J7 A5`, only where the component/action class permits it.
