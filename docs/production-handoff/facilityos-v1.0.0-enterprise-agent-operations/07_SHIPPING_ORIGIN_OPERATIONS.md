# 07 — Shipping / Origin Operations

## Graph

```text
Order / shipment requirement
 ↓
Inventory/cargo readiness
 ↓
Appointment
 ↓
Pre-arrival documents/credentials
 ↓
Vehicle arrival
 ↓
Gate/staging/dock
 ↓
Shipping-office verification
 ↓
BOL/document readiness
 ↓
Load workflow
 ↓
Seal/condition/evidence
 ↓
Authorized custody transition
 ↓
Release/departure
 ↓
FreightOS departure event
```

## Shipping-office work queue

May include:
- appointment reference
- carrier/driver/vehicle
- order/load number
- BOL status
- pickup numbers
- missing docs
- load readiness
- seal
- exceptions
- release status.

## BOL scenarios

- shipper-generated BOL
- carrier-provided BOL
- paper BOL
- EDI/API BOL
- corrected/reissued BOL
- multi-stop/multi-order association.

## Release

FacilityOS may coordinate digital release only when:
- loading complete state is authoritative;
- required documents accepted;
- required custody evidence complete;
- facility hold absent;
- policy/authorized human permits release.

FacilityOS does not actuate gate hardware or physical vehicle motion.
