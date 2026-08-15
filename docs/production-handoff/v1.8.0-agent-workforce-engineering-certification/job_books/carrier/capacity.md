# Capacity Agent — Job Book

**Department:** Carrier  
**Component class:** `hybrid_agent`  
**Initial certification:** `J0 SPECIFIED` after approval of this Job Book.

## Mission
Maintain an explainable current view of usable carrier capacity and surface capacity candidates without making final assignments.

## Business outcome owned
- availability synthesis
- capacity candidate sets
- capacity uncertainty/conflicts

## Explicit non-scope
- final dispatch assignment
- HOS legality
- load acceptance
- cross-carrier sourcing

## Work triggers
- driver/asset availability change
- planning request
- maintenance/readiness change

## Required inputs / authoritative context
- driver/equipment roster
- availability/location freshness
- maintenance readiness
- planned commitments
- COT constraints

All consequential inputs carry source, freshness, tenant/legal-plane scope, and evidence references.

## Outputs / typed artifacts
- CapacitySnapshot
- CapacityCandidateSet
- CapacityConflict

## Decision rights
- whether data is fresh enough to expose as candidate capacity

## Prohibited decisions / actions
- mark unavailable resource available against source of truth
- assign driver/asset
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
- fleet/driver APIs
- RigDesk readiness

## Typed commands / external side effects
- record_capacity_snapshot
- invalidate_capacity_candidate

Every consequential command passes deterministic authorization/policy and carries idempotency/reconciliation metadata.

## Upstream handoffs
- Chief Dispatch Orchestrator

## Downstream handoffs
- Feasibility Engine
- Planning Agent

## Normal SOP / durable job graph
1. load authoritative resource state
2. normalize availability
3. exclude hard holds
4. identify overlaps
5. construct candidate pools
6. label uncertainty/freshness
7. return candidates
8. invalidate when state changes

## Exception playbook
- missing ELD/roster state
- double commitment
- readiness changed after candidate creation
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
- Deterministic sub-decisions never become model discretion.
- A0-A5 applies only to judgment/communication and bounded side effects.

## Degraded mode
- Model/intelligence outage preserves authoritative state and deterministic operations.
- Missing required authoritative data becomes `UNKNOWN/STALE/HOLD`, never fabricated.
- Uncertain external-write outcome is reconciled before retry.
- Unknown authority fails closed.

## Audit / evidence
Every consequential run records WorkUnit, Job Book/manifest version, evidence/context refs, tool/model versions, deterministic gates, approval/autonomy grant, command/idempotency key, external result, reconciliation, exception/escalation, and outcome.

## KPIs
- capacity freshness
- false-available rate
- candidate recall

KPIs may not incentivize bypassing safety, legal, privacy, service, or customer policy.

## Job-specific certification scenarios
- double-booked tractor
- stale driver status
- maintenance hold
- wrong-tenant/counterparty access attempt
- prompt injection in inbound free text/document
- stale/missing/conflicting data
- restart before and after side effect where applicable
- human asks the job to bypass policy

## Certification evidence
Promotion path: `J1 OFFLINE → J2 ADVERSARIAL → J3 REPLAY → J4 SHADOW → J5 A3 → J6 A4 → J7 A5`, only where the component/action class permits it.
