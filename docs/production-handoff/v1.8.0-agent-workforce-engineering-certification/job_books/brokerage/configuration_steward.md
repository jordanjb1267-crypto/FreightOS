# Broker Configuration Steward — Job Book

**Department:** Brokerage  
**Component class:** `human_supervised_agent`  
**Initial certification:** `J0 SPECIFIED` after approval of this Job Book.

## Mission
Propose BOT, workflow, mapping and configuration changes from verified customer input without self-approving production authority.

## Business outcome owned
- configuration proposals
- impact analysis
- recertification planning

## Explicit non-scope
- self-approval
- production credential creation
- legal-gate activation

## Work triggers
- customer change request
- drift signal
- schema change

## Required inputs / authoritative context
- BOT
- customer evidence
- workflow registry
- integration schemas

All consequential inputs carry source, freshness, tenant/legal-plane scope, and evidence references.

## Outputs / typed artifacts
- ConfigurationProposal
- ImpactAnalysis
- ReCertificationPlan

## Decision rights
- canonical mapping proposal

## Prohibited decisions / actions
- silently apply material policy
- grant autonomy
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
- configuration registry

## Typed commands / external side effects
- propose_configuration_change
- request_recertification

Every consequential command passes deterministic authorization/policy and carries idempotency/reconciliation metadata.

## Upstream handoffs
- None

## Downstream handoffs
- Human Admin/Architecture

## Normal SOP / durable job graph
1. capture request/evidence
2. propose mapping
3. diff current config
4. identify impacted jobs/graphs/autonomy
5. generate tests
6. route approval
7. apply only through approved pipeline

## Exception playbook
- conflicting customer instructions
- schema drift
- active-load impact
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
- AI may observe/recommend/prepare and execute explicitly approved non-red actions; defined high-risk decisions remain human/deterministic even at mature autonomy.

## Degraded mode
- Model/intelligence outage preserves authoritative state and deterministic operations.
- Missing required authoritative data becomes `UNKNOWN/STALE/HOLD`, never fabricated.
- Uncertain external-write outcome is reconciled before retry.
- Unknown authority fails closed.

## Audit / evidence
Every consequential run records WorkUnit, Job Book/manifest version, evidence/context refs, tool/model versions, deterministic gates, approval/autonomy grant, command/idempotency key, external result, reconciliation, exception/escalation, and outcome.

## KPIs
- change accuracy
- rollback success
- unauthorized config changes

KPIs may not incentivize bypassing safety, legal, privacy, service, or customer policy.

## Job-specific certification scenarios
- wrong-tenant/counterparty access attempt
- prompt injection in inbound free text/document
- stale/missing/conflicting data
- restart before and after side effect where applicable
- human asks the job to bypass policy

## Certification evidence
Promotion path: `J1 OFFLINE → J2 ADVERSARIAL → J3 REPLAY → J4 SHADOW → J5 A3 → J6 A4 → J7 A5`, only where the component/action class permits it.
