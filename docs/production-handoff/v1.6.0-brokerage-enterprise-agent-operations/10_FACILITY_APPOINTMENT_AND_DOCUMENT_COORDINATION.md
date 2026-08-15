# 10 — Facility, Appointment, and Document Coordination

## Network integration

Brokerage agents use FreightOS/FacilityOS rather than duplicate facility state.

## Origin

Broker may coordinate:
- appointment
- cargo readiness
- driver instructions
- BOL/document requirements
- check-in exception
- detention/accessorial evidence.

## Destination

Broker may coordinate:
- receiving appointment
- ETA
- BOL/POD status
- receiving discrepancy
- delivery completion.

## BOL

Brokerage transaction record may reference bill-of-lading/freight-bill number as required by applicable recordkeeping.

The broker document agent does not own facility custody/receipt state.

## Appointment change

A facility appointment change propagates:
FacilityOS → FreightOS → Brokerage Shipment Execution → Carrier Agent + Shipper.

## Access controls

Broker sees cross-party data only to the extent authorized for the transaction.
Private carrier cost structure and unrelated facility data remain isolated.
