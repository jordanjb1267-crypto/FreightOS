# 18 — FreightOS Network Communication

## The closed operating loop

```text
SHIPPER
   ↓ demand / RFQ
BROKERAGE AGENTS
   ↓ tender / allocation
CARRIER AGENTS
   ↓ dispatch / execution
DRIVER / ASSET
   ↓ arrival / documents
FACILITYOS
   ↓ readiness / gate / dock / custody / receipt
FREIGHTOS NETWORK
   ↓ events / evidence / exceptions
BROKERAGE AGENTS
   ↓ shipper communication / invoicing / carrier pay record
SHIPPER + CARRIER
```

## Shipper → Broker

- RFQ
- contract/routing guide
- requirements
- commitment
- changes
- invoice/payment status.

## Broker → Carrier

- capacity inquiry
- tender
- negotiation
- assignment
- shipment requirements
- appointment/facility instructions.

## Carrier → Broker

- quote/counter
- accept/reject
- dispatch
- ETA/milestones
- exception
- documents.

## Facility → Broker

Through authorized FreightOS events:
- readiness
- appointment
- visit
- BOL/document status
- detention evidence
- discrepancy
- receipt/POD status.

## Network advantages

When all three sides use canonical network artifacts:
- fewer calls/emails/manual re-entry;
- less status ambiguity;
- faster exception propagation;
- stronger evidence;
- easier reconciliation.

Do not turn network advantage into forced data sharing or self-preferencing.
