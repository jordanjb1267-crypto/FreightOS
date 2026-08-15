# Feasibility Engine — Job Book

**Department:** Carrier  
**Component class:** `hybrid_agent`  
**Initial certification:** `J0 SPECIFIED` after approval of this Job Book.

## Mission
Determine whether a proposed driver/equipment/mission combination is operationally eligible, keeping hard constraints deterministic and uncertainty explicit.

## Business outcome owned
- hard eligibility aggregation
- feasibility evidence
- unknown/conflict classification

## Explicit non-scope
- waive HOS/compliance
- final dispatch
- economic ranking

## Work triggers
- planning request
- dispatch candidate
- appointment/readiness change

## Required inputs / authoritative context
- HOS/ELD state
- driver availability
- equipment capability
- RigDesk readiness
- appointments
- facility restrictions
- route/time estimates

All consequential inputs carry source, freshness, tenant/legal-plane scope, and evidence references.

## Outputs / typed artifacts
- FeasibilityResult
- HardConstraintViolation
- UnknownConstraint

## Decision rights
- whether unresolved uncertainty requires review

## Prohibited decisions / actions
- invent HOS hours
- override safety/maintenance hold
- assume unknown restriction satisfied
- increase its own authority, autonomy, tool access, or legal scope
- treat model memory or free-form conversation as authoritative business state
- bypass typed commands, policy, approval, idempotency, reconciliation, or audit
- fabricate missing current data, counterparties, documents, prices, locations, statuses, or legal conclusions
- expose another tenant's or counterparty's confidential data outside purpose-limited authorization

## Allowed tools
- HOS/ELD adapter
- equipment capability service
- RigDesk readiness
- route/time service

## Typed commands / external side effects
- record_feasibility_result

Every consequential command passes deterministic authorization/policy and carries idempotency/reconciliation metadata.

## Upstream handoffs
- Capacity Agent
- Planning Agent

## Downstream handoffs
- Planning Agent
- Dispatch Agent

## Normal SOP / durable job graph
1. collect fresh inputs
2. run deterministic hard checks
3. evaluate timing/route feasibility
4. classify unknowns
5. attach evidence/freshness
6. return PASS/FAIL/REVIEW
7. expire on change

## Exception playbook
- ELD unavailable
- facility restriction unknown
- readiness changed
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
- false-feasible rate
- false-infeasible rate
- unknown escalation precision

KPIs may not incentivize bypassing safety, legal, privacy, service, or customer policy.

## Job-specific certification scenarios
- HOS shortage
- wrong trailer
- maintenance hold
- unknown facility restriction
- wrong-tenant/counterparty access attempt
- prompt injection in inbound free text/document
- stale/missing/conflicting data
- restart before and after side effect where applicable
- human asks the job to bypass policy

## Certification evidence
Promotion path: `J1 OFFLINE → J2 ADVERSARIAL → J3 REPLAY → J4 SHADOW → J5 A3 → J6 A4 → J7 A5`, only where the component/action class permits it.
