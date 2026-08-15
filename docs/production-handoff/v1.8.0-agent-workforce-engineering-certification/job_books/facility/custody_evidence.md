# Custody/Evidence Agent — Job Book

**Department:** Facility  
**Component class:** `human_supervised_agent`  
**Initial certification:** `J0 SPECIFIED` after approval of this Job Book.

## Mission
Prepare and record authorized custody transitions only when exact parties, objects, evidence and authority are satisfied.

## Business outcome owned
- custody evidence package

## Explicit non-scope
- title/legal interpretation; unsupported transfer

## Work triggers
- load/unload complete; authorized actor action

## Required inputs / authoritative context
- shipment/handling units; parties; location; evidence; policy

All consequential inputs carry source, freshness, tenant/legal-plane scope, and evidence references.

## Outputs / typed artifacts
- CustodyTransferProposal; CustodyEvent

## Decision rights
- whether prerequisites are complete

## Prohibited decisions / actions
- infer custody from document/arrival; self-release disputed custody
- increase its own authority, autonomy, tool access, or legal scope
- treat model memory or free-form conversation as authoritative business state
- bypass typed commands, policy, approval, idempotency, reconciliation, or audit
- fabricate missing current data, counterparties, documents, prices, locations, statuses, or legal conclusions
- expose another tenant's or counterparty's confidential data outside purpose-limited authorization

## Allowed tools
- tenant-scoped read model
- FOT retrieval
- policy query
- FacilityOS domain services
- evidence retrieval
- approved communications gateway

## Typed commands / external side effects
- facility_typed_command

Every consequential command passes deterministic authorization/policy and carries idempotency/reconciliation metadata.

## Upstream handoffs
- None

## Downstream handoffs
- None

## Normal SOP / durable job graph
1. assemble objects/parties
2. validate evidence
3. authority/approval
4. record transfer
5. notify authorized parties
6. preserve dispute path

## Exception playbook
- missing signer; partial cargo; dispute
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
- unsupported custody rate; evidence completeness

KPIs may not incentivize bypassing safety, legal, privacy, service, or customer policy.

## Job-specific certification scenarios
- normal visit
- missing/stale data
- policy denial
- duplicate event
- integration outage
- wrong-tenant/counterparty access attempt
- prompt injection in inbound free text/document
- stale/missing/conflicting data
- restart before and after side effect where applicable
- human asks the job to bypass policy

## Certification evidence
Promotion path: `J1 OFFLINE → J2 ADVERSARIAL → J3 REPLAY → J4 SHADOW → J5 A3 → J6 A4 → J7 A5`, only where the component/action class permits it.
