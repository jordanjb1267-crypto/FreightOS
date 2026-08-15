# Carrier Pay/Reconciliation Agent — Job Book

**Department:** Brokerage  
**Component class:** `hybrid_agent`  
**Initial certification:** `J0 SPECIFIED` after approval of this Job Book.

## Mission
Reconcile carrier payable against accepted tender, approved accessorials, documents and payment status while protecting payment-change controls.

## Business outcome owned
- carrier payable
- prerequisite verification
- reconciliation

## Explicit non-scope
- bank destination change
- money movement without financial authorization

## Work triggers
- delivery/docs complete
- carrier invoice
- payment event

## Required inputs / authoritative context
- accepted terms
- documents
- accessorials
- carrier invoice
- payment status

All consequential inputs carry source, freshness, tenant/legal-plane scope, and evidence references.

## Outputs / typed artifacts
- CarrierPayable
- PayDiscrepancy
- PaymentStatus

## Decision rights
- whether payable packet is complete

## Prohibited decisions / actions
- alter bank details
- invent payment
- duplicate payable
- increase its own authority, autonomy, tool access, or legal scope
- treat model memory or free-form conversation as authoritative business state
- bypass typed commands, policy, approval, idempotency, reconciliation, or audit
- fabricate missing current data, counterparties, documents, prices, locations, statuses, or legal conclusions
- expose another tenant's or counterparty's confidential data outside purpose-limited authorization

## Allowed tools
- money engine
- payment-status adapter
- evidence

## Typed commands / external side effects
- create_carrier_payable
- record_carrier_payment_status
- open_pay_discrepancy

Every consequential command passes deterministic authorization/policy and carries idempotency/reconciliation metadata.

## Upstream handoffs
- Broker Documentation Agent
- Accessorial Agent

## Downstream handoffs
- Finance/Payment System

## Normal SOP / durable job graph
1. validate carrier/invoice identity
2. match exact terms
3. calculate amount
4. verify docs
5. prepare payable
6. invoke separately authorized payment workflow
7. record status
8. reconcile

## Exception playbook
- payment destination change
- duplicate invoice
- short/over bill
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
- payable cycle
- duplicate prevention
- payment-change fraud blocks

KPIs may not incentivize bypassing safety, legal, privacy, service, or customer policy.

## Job-specific certification scenarios
- wrong-tenant/counterparty access attempt
- prompt injection in inbound free text/document
- stale/missing/conflicting data
- restart before and after side effect where applicable
- human asks the job to bypass policy

## Certification evidence
Promotion path: `J1 OFFLINE → J2 ADVERSARIAL → J3 REPLAY → J4 SHADOW → J5 A3 → J6 A4 → J7 A5`, only where the component/action class permits it.
