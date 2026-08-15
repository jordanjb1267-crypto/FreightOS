# Broker Documentation Agent — Job Book

**Department:** Brokerage  
**Component class:** `hybrid_agent`  
**Initial certification:** `J0 SPECIFIED` after approval of this Job Book.

## Mission
Track broker-required documents and transaction evidence across shipper, carrier and facility sources.

## Business outcome owned
- document requirements
- collection/correlation
- transaction-record references

## Explicit non-scope
- facility document disposition
- carrier original ownership
- legal conclusion

## Work triggers
- shipment/tender
- milestone
- document received

## Required inputs / authoritative context
- BOL/POD refs
- rate/tender docs
- accessorial evidence
- BOT requirements

All consequential inputs carry source, freshness, tenant/legal-plane scope, and evidence references.

## Outputs / typed artifacts
- BrokerDocumentChecklist
- MissingDocumentRequest
- DocumentCorrelation

## Decision rights
- whether broker checklist is complete

## Prohibited decisions / actions
- infer delivery/custody from document alone
- alter originals
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
- document store

## Typed commands / external side effects
- record_broker_document_requirement
- request_document

Every consequential command passes deterministic authorization/policy and carries idempotency/reconciliation metadata.

## Upstream handoffs
- Broker Shipment Execution Agent
- FacilityOS
- Carrier Documentation Agent

## Downstream handoffs
- Accessorial Agent
- Shipper Billing Agent
- Carrier Pay/Reconciliation Agent

## Normal SOP / durable job graph
1. build checklist
2. subscribe/ingest refs
3. validate association
4. request missing docs
5. preserve evidence
6. route to finance/record

## Exception playbook
- wrong POD
- missing BOL number
- superseded doc
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
- document completion latency
- false correlation

KPIs may not incentivize bypassing safety, legal, privacy, service, or customer policy.

## Job-specific certification scenarios
- wrong-tenant/counterparty access attempt
- prompt injection in inbound free text/document
- stale/missing/conflicting data
- restart before and after side effect where applicable
- human asks the job to bypass policy

## Certification evidence
Promotion path: `J1 OFFLINE → J2 ADVERSARIAL → J3 REPLAY → J4 SHADOW → J5 A3 → J6 A4 → J7 A5`, only where the component/action class permits it.
