# 05 — Shipper Intake, RFQ, and Quoting

## Intake channels

- portal
- email
- API
- EDI
- TMS/CRM
- phone/manual entry
- FreightOS network request.

## Normalize

Capture:
- shipper
- origin/destination
- dates/windows
- mode/equipment
- commodity
- quantity/weight
- special requirements
- facility requirements
- insurance/security constraints
- accessorial terms
- contract/routing guide
- requested quote/commitment deadline.

## Quote graph

```text
RFQ
 ↓
Validate shipper/account/credit
 ↓
Requirements normalization
 ↓
Determine contract/spot context
 ↓
Estimate carrier buy / market exposure
 ↓
Apply deterministic pricing/margin policy
 ↓
Agent recommendation/draft
 ↓
Approval if required
 ↓
Send quote
 ↓
Capture shipper response
 ↓
Version quote / expire / accept
```

## Shipper price

Must record:
- deterministic inputs
- rate components
- assumptions
- policy version
- approver/autonomy
- expiration.

Model may recommend a price but cannot be sole pricing authority.

## Commitment

A quote is not a shipment commitment until exact acceptance and terms are recorded.

Material change to:
- lane
- equipment
- dates
- commodity
- accessorials
- rate
requires version/re-evaluation.

## Routing guide

Contracted shipper rules can prioritize:
- primary carrier sequence;
- private network;
- brokerage pool;
- mode;
- service requirements.

Routing guides are BOT/configuration, not prompts.
