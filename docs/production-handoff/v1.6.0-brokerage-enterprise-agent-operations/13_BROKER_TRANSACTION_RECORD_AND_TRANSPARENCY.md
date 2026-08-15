# 13 — Broker Transaction Record and Transparency

## Current federal baseline — property brokers

The architecture must support the transaction record required by 49 CFR 371.3.

For each applicable transaction, preserve at minimum:
- consignor name/address;
- originating motor carrier name/address/registration number;
- bill of lading or freight bill number;
- broker compensation for brokerage service and payer;
- non-brokerage service description/compensation/payer;
- freight charges collected by broker and carrier payment date.

Retention baseline: three years, subject to stricter contract/state/legal requirements.

Each party to the brokered transaction has the current regulatory right to review the required transaction record.

## Product design

Create a canonical `BrokerTransactionRecord` linked to:
- shipment
- shipper
- carrier
- commercial terms
- BOL/freight bill
- compensation records
- payment status
- audit/evidence.

## Access

Transaction-record access:
- authenticated party relationship
- field-level disclosure policy
- immutable audit
- export receipt.

Do not expose unrelated transactions.

## Proposed-rule readiness

As of 2026-08-14, FMCSA's "Transparency in Property Broker Transactions" changes remain proposed, not final.

Design feature capability for:
- automated electronic record delivery after transaction completion;
- timing policy;
- non-waiver policy controls;
- expanded record fields if finalized.

Keep disabled unless/when final law and counsel-approved implementation require it.

## Record correction

Corrections append/version; do not silently rewrite historical compensation/payment evidence.

## Customer export

Brokerage tenant can export compliant transaction records and audit evidence in standard machine/human-readable forms.
