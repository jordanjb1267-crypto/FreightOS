# Broker Transaction Record Service — Job Book

**Department:** Brokerage  
**Component class:** `deterministic_service`  
**Initial certification:** `J0 SPECIFIED` after approval of this Job Book.

## Mission
Construct, retain and expose the required brokerage transaction record from authoritative shipment, carrier, compensation and payment evidence.

## Business outcome owned
- transaction-record completeness
- retention metadata
- party-access export

## Explicit non-scope
- legal advice
- compensation policy
- payment execution

## Work triggers
- transaction milestones
- close request
- party access request

## Required inputs / authoritative context
- shipment
- consignor
- originating carrier
- BOL/freight bill number
- broker compensation
- non-broker services
- freight charges/payment date

All consequential inputs carry source, freshness, tenant/legal-plane scope, and evidence references.

## Outputs / typed artifacts
- BrokerTransactionRecord
- RecordCompletenessError
- AuthorizedRecordExport

## Decision rights
- deterministic completeness/access checks

## Prohibited decisions / actions
- omit required field silently
- expose unrelated transactions
- shorten below legal baseline
- increase its own authority, autonomy, tool access, or legal scope
- treat model memory or free-form conversation as authoritative business state
- bypass typed commands, policy, approval, idempotency, reconciliation, or audit
- fabricate missing current data, counterparties, documents, prices, locations, statuses, or legal conclusions
- expose another tenant's or counterparty's confidential data outside purpose-limited authorization

## Allowed tools
- transaction ledger
- record-access policy

## Typed commands / external side effects
- create_broker_transaction_record
- export_authorized_transaction_record

Every consequential command passes deterministic authorization/policy and carries idempotency/reconciliation metadata.

## Upstream handoffs
- Shipper Billing Agent
- Carrier Pay/Reconciliation Agent

## Downstream handoffs
- Compliance Supervisor Agent

## Normal SOP / durable job graph
1. collect authoritative fields
2. validate completeness
3. version record
4. set retention
5. authorize party access
6. export/audit
7. append correction

## Exception playbook
- missing BOL number
- payment date pending
- party identity mismatch
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
- record completeness
- unauthorized disclosure rate
- retention conformance

KPIs may not incentivize bypassing safety, legal, privacy, service, or customer policy.

## Job-specific certification scenarios
- wrong-tenant/counterparty access attempt
- prompt injection in inbound free text/document
- stale/missing/conflicting data
- restart before and after side effect where applicable
- human asks the job to bypass policy

## Certification evidence
Promotion path: `J1 OFFLINE → J2 ADVERSARIAL → J3 REPLAY → J4 SHADOW → J5 A3 → J6 A4 → J7 A5`, only where the component/action class permits it.
