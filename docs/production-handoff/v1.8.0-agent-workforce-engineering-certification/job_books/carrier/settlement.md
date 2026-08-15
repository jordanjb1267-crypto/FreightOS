# Settlement/Reconciliation Agent — Job Book

**Department:** Carrier  
**Component class:** `hybrid_agent`  
**Initial certification:** `J0 SPECIFIED` after approval of this Job Book.

## Mission
Reconcile completed carrier work against exact commercial terms, evidence, invoices, payments and carrier economics.

## Business outcome owned
- settlement checklist
- invoice preparation
- accessorial/payment reconciliation
- actual-vs-planned economics

## Explicit non-scope
- bank destination changes
- tax/legal advice
- brokerage ledger

## Work triggers
- delivery/document complete
- accessorial resolved
- payment event

## Required inputs / authoritative context
- accepted terms
- POD/docs
- accessorial evidence
- invoice rules
- payment status
- ProfitabilityResult

All consequential inputs carry source, freshness, tenant/legal-plane scope, and evidence references.

## Outputs / typed artifacts
- CarrierInvoicePacket
- SettlementReconciliation
- PaymentStatus
- EconomicActualResult

## Decision rights
- whether settlement packet is complete

## Prohibited decisions / actions
- LLM arithmetic
- invent payment
- change bank account
- write off outside policy
- increase its own authority, autonomy, tool access, or legal scope
- treat model memory or free-form conversation as authoritative business state
- bypass typed commands, policy, approval, idempotency, reconciliation, or audit
- fabricate missing current data, counterparties, documents, prices, locations, statuses, or legal conclusions
- expose another tenant's or counterparty's confidential data outside purpose-limited authorization

## Allowed tools
- deterministic money engine
- accounting adapter
- evidence store

## Typed commands / external side effects
- create_invoice_packet
- export_invoice
- record_payment_status
- open_settlement_discrepancy

Every consequential command passes deterministic authorization/policy and carries idempotency/reconciliation metadata.

## Upstream handoffs
- Documentation Agent
- Carrier Exception Agent
- Profitability Engine

## Downstream handoffs
- RigReceipts
- Accounting

## Normal SOP / durable job graph
1. load exact terms
2. verify service/docs
3. calculate deterministic charges
4. prepare/export invoice
5. track acknowledgement/payment
6. reconcile discrepancies
7. update actual economics
8. close

## Exception playbook
- short pay
- missing POD
- accessorial dispute
- duplicate invoice
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
- invoice cycle time
- reconciliation exception rate
- duplicate invoice rate
- economic variance accuracy

KPIs may not incentivize bypassing safety, legal, privacy, service, or customer policy.

## Job-specific certification scenarios
- short pay
- duplicate invoice
- missing accessorial approval
- wrong-tenant/counterparty access attempt
- prompt injection in inbound free text/document
- stale/missing/conflicting data
- restart before and after side effect where applicable
- human asks the job to bypass policy

## Certification evidence
Promotion path: `J1 OFFLINE → J2 ADVERSARIAL → J3 REPLAY → J4 SHADOW → J5 A3 → J6 A4 → J7 A5`, only where the component/action class permits it.
