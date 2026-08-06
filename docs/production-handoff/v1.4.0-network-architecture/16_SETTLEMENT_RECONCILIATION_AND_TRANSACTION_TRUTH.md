# 16 — Settlement, Reconciliation, and Transaction Truth

## 1. Scope

FreightOS should first establish contractual and operational truth, not assume regulated custody of funds.

## 2. Reconciliation graph

Link:

- rate/contract terms;
- executed shipment and stop events;
- documents and evidence;
- accessorial policy;
- charges and deductions;
- invoice versions;
- payment instructions;
- payment-provider status;
- disputes and claims;
- final settlement outcome.

## 3. Financial artifacts

A financial artifact declares currency, precision, tax treatment where relevant, payer/payee, contractual basis, evidence, status, and external provider references.

## 4. Payment commands

Payment execution requires separate controls:

- verified parties and destination;
- amount and currency limits;
- dual control or step-up thresholds;
- sanctions/fraud screening where applicable;
- idempotency;
- provider reconciliation;
- immutable audit;
- no sensitive banking data in general event payloads.

## 5. Dispute model

Disputes preserve:

- contested object/charge/event;
- claimant and respondent;
- reason code and narrative;
- evidence;
- response deadline;
- provisional state;
- resolution and authority;
- financial adjustment events.

## 6. Regulatory boundary

Before acting as broker, factor, lender, insurer, money transmitter, escrow agent, or title-control platform, FreightOS requires legal analysis, licensing/partner strategy, operational controls, and owner approval.
