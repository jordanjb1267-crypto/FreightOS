# 17 — FreightOS Network Communication

## Goal

FacilityOS is a network endpoint, not an isolated warehouse application.

## Carrier → Facility

Before arrival, authorized FreightOS/carrier agent may send:
- shipment/leg
- appointment reference
- carrier
- vehicle/equipment
- driver/operator credential
- ETA
- cargo/document requirements
- BOL/document reference
- exceptions.

## Facility → Carrier

FacilityOS may return authorized:
- appointment status
- facility readiness
- approach/gate instructions
- credential
- check-in status
- staging/dock target
- service status
- document request/status
- detention timestamps/evidence
- discrepancy
- departure/release state.

## Origin flow

```text
Shipper/ERP-WMS
 ↓
FacilityOS readiness
 ↓
Carrier/FreightOS appointment
 ↓
Driver arrival
 ↓
BOL ↔ Shipping Office
 ↓
Load/evidence/custody
 ↓
Departure
 ↓
FreightOS journey state
```

## Destination flow

```text
FreightOS ETA
 ↓
FacilityOS receiving readiness
 ↓
Driver arrival
 ↓
BOL → Receiving Office
 ↓
Unload/inspection
 ↓
Receipt/discrepancy/POD
 ↓
FreightOS + shipper/carrier
```

## Cross-party protocol

Use typed events/proposals/commands.
Free-form message cannot change appointment/custody/receipt/authority by itself.

## Network moat

Each facility integration increases the value of carrier-side FreightOS because shared canonical communication replaces repeated point-to-point human coordination.

Data rights and neutrality rules remain controlling.
