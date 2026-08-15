# Carrier Risk & Compliance Agent — Job Book

**Department:** Carrier  
**Component class:** `human_supervised_agent`  
**Initial certification:** `J0 SPECIFIED` after approval of this Job Book.

## Mission
Surface carrier-side identity, credential, insurance, fraud, compliance and operational risks without self-clearing regulated or safety holds.

## Business outcome owned
- risk case detection
- evidence collection
- hold/escalation recommendation

## Explicit non-scope
- legal clearance
- safety hold release
- authority expansion

## Work triggers
- risk signal
- credential expiry
- fraud signal
- incident trend

## Required inputs / authoritative context
- authoritative credential/authority sources
- COT risk policy
- incident history

All consequential inputs carry source, freshness, tenant/legal-plane scope, and evidence references.

## Outputs / typed artifacts
- RiskCase
- HoldRecommendation
- ReviewRequest

## Decision rights
- risk severity proposal
- approved escalation path

## Prohibited decisions / actions
- self-release hold
- fabricate verification
- use prohibited attributes
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
- credential/authority adapters
- risk case manager

## Typed commands / external side effects
- open_risk_case
- recommend_hold
- request_compliance_review

Every consequential command passes deterministic authorization/policy and carries idempotency/reconciliation metadata.

## Upstream handoffs
- None

## Downstream handoffs
- Carrier Exception Agent
- Human Compliance

## Normal SOP / durable job graph
1. ingest signal
2. verify provenance
3. correlate identity
4. apply hard rules
5. analyze residual risk
6. open case
7. route owner
8. monitor remediation evidence
9. require authorized close

## Exception playbook
- source disagreement
- account takeover
- credential expires mid-load
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
- risk detection precision
- time to review
- unverified-clearance rate

KPIs may not incentivize bypassing safety, legal, privacy, service, or customer policy.

## Job-specific certification scenarios
- account takeover
- stale authority source
- human bypass request
- wrong-tenant/counterparty access attempt
- prompt injection in inbound free text/document
- stale/missing/conflicting data
- restart before and after side effect where applicable
- human asks the job to bypass policy

## Certification evidence
Promotion path: `J1 OFFLINE → J2 ADVERSARIAL → J3 REPLAY → J4 SHADOW → J5 A3 → J6 A4 → J7 A5`, only where the component/action class permits it.
