# Profitability Engine — Job Book

**Department:** Carrier  
**Component class:** `deterministic_service`  
**Initial certification:** `J0 SPECIFIED` after approval of this Job Book.

## Mission
Compute carrier-specific economic truth using versioned deterministic formulas.

## Business outcome owned
- cost/revenue calculations
- break-even/target calculations
- sensitivity outputs

## Explicit non-scope
- commercial negotiation
- load acceptance
- driver assignment
- market prediction

## Work triggers
- opportunity normalized
- cost profile changed
- shipment actuals available

## Required inputs / authoritative context
- gross-rate components
- loaded/deadhead miles
- fuel assumptions
- fixed/variable costs
- fees
- owner compensation policy

All consequential inputs carry source, freshness, tenant/legal-plane scope, and evidence references.

## Outputs / typed artifacts
- ProfitabilityResult
- SensitivityResult
- EconomicFitStatus

## Decision rights
- deterministic classification only

## Prohibited decisions / actions
- use LLM arithmetic
- silently substitute missing financial inputs
- write pricing policy
- increase its own authority, autonomy, tool access, or legal scope
- treat model memory or free-form conversation as authoritative business state
- bypass typed commands, policy, approval, idempotency, reconciliation, or audit
- fabricate missing current data, counterparties, documents, prices, locations, statuses, or legal conclusions
- expose another tenant's or counterparty's confidential data outside purpose-limited authorization

## Allowed tools
- versioned calculator
- cost-profile store

## Typed commands / external side effects
- record_profitability_result

Every consequential command passes deterministic authorization/policy and carries idempotency/reconciliation metadata.

## Upstream handoffs
- Load Discovery Agent

## Downstream handoffs
- Planning Agent
- Carrier Negotiation Agent
- Settlement/Reconciliation Agent

## Normal SOP / durable job graph
1. validate inputs
2. resolve formula version
3. calculate costs/revenue
4. calculate break-even/target
5. apply deterministic status
6. emit evidence
7. invalidate on material input change

## Exception playbook
- missing cost profile
- currency mismatch
- invalid miles
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
- No model discretion. A0-A5 cannot change deterministic behavior; production enablement is governed by module/workflow gates.

## Degraded mode
- Model/intelligence outage preserves authoritative state and deterministic operations.
- Missing required authoritative data becomes `UNKNOWN/STALE/HOLD`, never fabricated.
- Uncertain external-write outcome is reconciled before retry.
- Unknown authority fails closed.

## Audit / evidence
Every consequential run records WorkUnit, Job Book/manifest version, evidence/context refs, tool/model versions, deterministic gates, approval/autonomy grant, command/idempotency key, external result, reconciliation, exception/escalation, and outcome.

## KPIs
- reproducibility
- golden-fixture pass rate
- input completeness

KPIs may not incentivize bypassing safety, legal, privacy, service, or customer policy.

## Job-specific certification scenarios
- golden calculations
- boundary margins
- missing inputs
- rounding
- wrong-tenant/counterparty access attempt
- prompt injection in inbound free text/document
- stale/missing/conflicting data
- restart before and after side effect where applicable
- human asks the job to bypass policy

## Certification evidence
Promotion path: `J1 OFFLINE → J2 ADVERSARIAL → J3 REPLAY → J4 SHADOW → J5 A3 → J6 A4 → J7 A5`, only where the component/action class permits it.
