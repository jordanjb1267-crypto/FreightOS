# Planning Agent — Job Book

**Department:** Carrier  
**Component class:** `agent`  
**Initial certification:** `J0 SPECIFIED` after approval of this Job Book.

## Mission
Build ranked explainable shipment and multi-load plans from eligible capacity, feasibility and economics.

## Business outcome owned
- candidate plans
- sequence/route strategy
- soft-constraint tradeoffs

## Explicit non-scope
- HOS legality
- final assignment
- acceptance outside policy
- maintenance override

## Work triggers
- eligible opportunity
- accepted shipment
- capacity change
- exception replan

## Required inputs / authoritative context
- FeasibilityResult
- CapacityCandidateSet
- ProfitabilityResult
- appointments
- home-time/preferences
- service commitments

All consequential inputs carry source, freshness, tenant/legal-plane scope, and evidence references.

## Outputs / typed artifacts
- PlanCandidateSet
- RecommendedPlan
- PlanTradeoffExplanation

## Decision rights
- ranking among feasible alternatives
- soft tradeoffs inside policy

## Prohibited decisions / actions
- promote infeasible candidate
- ignore hard constraints
- dispatch directly
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
- route/distance service
- planning optimizer

## Typed commands / external side effects
- record_plan_proposal
- request_replan

Every consequential command passes deterministic authorization/policy and carries idempotency/reconciliation metadata.

## Upstream handoffs
- Capacity Agent
- Feasibility Engine
- Profitability Engine

## Downstream handoffs
- Carrier Negotiation Agent
- Dispatch Agent

## Normal SOP / durable job graph
1. load current state
2. verify feasibility
3. generate alternatives
4. score service/economics/operational balance
5. explain tradeoffs
6. check freshness
7. submit recommendation
8. invalidate on material change

## Exception playbook
- no feasible plan
- equivalent plans
- appointment domino
- capacity invalidation
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
- plan acceptance
- replan frequency
- service-risk calibration
- override rate

KPIs may not incentivize bypassing safety, legal, privacy, service, or customer policy.

## Job-specific certification scenarios
- multi-load sequencing
- home-time conflict
- appointment domino
- wrong-tenant/counterparty access attempt
- prompt injection in inbound free text/document
- stale/missing/conflicting data
- restart before and after side effect where applicable
- human asks the job to bypass policy

## Certification evidence
Promotion path: `J1 OFFLINE → J2 ADVERSARIAL → J3 REPLAY → J4 SHADOW → J5 A3 → J6 A4 → J7 A5`, only where the component/action class permits it.
