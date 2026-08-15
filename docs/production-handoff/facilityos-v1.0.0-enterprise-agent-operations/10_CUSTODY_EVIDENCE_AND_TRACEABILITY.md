# 10 — Custody, Evidence, and Traceability

## Custody

Custody is explicit domain state with:
- from party
- to party
- shipment/consignment/handling unit
- location
- time
- authorized actors
- evidence
- conditions
- policy
- disputes.

## Evidence

May include:
- BOL/document version
- signature
- seal
- scan
- barcode/RFID
- photo
- sensor observation
- WMS transaction
- gate/visit event
- inspection.

## Separation

Events:
- shipping
- loading complete
- custody transfer
- departure
- receiving
- accepting
may be related but are not the same.

## EPCIS mapping

Where a customer uses GS1 EPCIS/CBV, map canonical events to appropriate shipping/receiving/handling-unit visibility events.

Standards messages remain interoperability representations, not the sole source of truth.

## Chain

Every evidence object has:
- origin
- hash
- time
- capture identity/device/system
- transformation history
- access classification
- associated business state.

## Dispute

Never rewrite historical custody.
Create disputed/superseding state and preserve evidence.
