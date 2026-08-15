# 12 — Discrepancy, Exception, and Claims Evidence

## Discrepancy types

- shortage
- overage
- damage
- seal mismatch
- temperature/condition
- wrong item
- missing document
- BOL mismatch
- PO/order mismatch
- appointment mismatch
- rejected cargo
- quality hold
- custody dispute.

## Graph

```text
Issue detected
 ↓
Capture evidence
 ↓
Classify
 ↓
Determine affected objects/parties
 ↓
Contain operational impact
 ↓
Authorized review
 ↓
Correct / accept with exception / reject / hold
 ↓
Network notification
 ↓
Reconciliation
```

## Claims boundary

FacilityOS can assemble evidence and initiate a governed claims/dispute workflow.

It does not adjudicate legal liability unless a separately governed authorized process exists.

## BOL mismatch

Never auto-edit original BOL.
Create:
- mismatch finding
- correction request
- corrected/superseding document
- office disposition.

## Downstream

FreightOS receives authorized exception facts needed to:
- update ETA/status
- protect evidence
- prepare accessorial/claim workflow
- inform carrier/shipper.
