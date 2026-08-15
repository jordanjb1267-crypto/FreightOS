# 08 — Receiving / Destination Operations

## Graph

```text
Inbound notice / appointment
 ↓
ETA + receiving readiness
 ↓
Pre-arrival docs
 ↓
Arrival/check-in
 ↓
BOL presentation
 ↓
Gate/staging/dock
 ↓
Unload
 ↓
Inspection / count / condition
 ↓
Goods receipt OR discrepancy/rejection
 ↓
POD/receiving evidence
 ↓
Custody state
 ↓
Departure
 ↓
FreightOS / ERP-WMS reconciliation
```

## Receiving office

Queue:
- appointment
- shipment/order/PO
- BOL
- carrier/driver/vehicle
- dock
- unload status
- expected vs observed
- discrepancy
- receiving disposition.

## Goods receipt

Must reference:
- authoritative receiving actor/system
- handling units/quantities
- time
- facility
- evidence
- discrepancy state
- source WMS/ERP transaction if external system authoritative.

## POD

POD is a document/evidence artifact linked to receipt/delivery state.

Do not make "signed BOL" and "POD" universally synonymous; tenant workflows may differ.

## Partial/rejected receipt

Model explicitly:
- received full
- received partial
- shortage
- overage
- damage
- rejected
- quarantined/quality hold
- unknown pending inspection.

Downstream FreightOS/shipper/carrier must receive authorized status without exposing unrelated facility data.
