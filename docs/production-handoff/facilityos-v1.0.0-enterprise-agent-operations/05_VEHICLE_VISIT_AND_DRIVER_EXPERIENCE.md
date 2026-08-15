# 05 — Vehicle Visit and Driver Experience

## VehicleVisit

A visit binds:
- facility
- appointment
- shipment/transport leg
- carrier
- driver/operator identity where required
- tractor/vehicle
- trailer/equipment
- credential
- arrival/check-in
- yard/staging
- dock
- service
- documents
- custody/receipt references
- departure/check-out.

## Driver access

Supported:
- RigDesk/driver app
- FacilityOS mobile web
- QR scoped link
- SMS/email deep link where approved
- kiosk
- guard/office assisted capture.

Use short-lived, visit-scoped authorization.

## Pre-arrival driver screen

Show:
- facility name/address
- appointment window
- entrance/gate
- check-in instructions
- reference numbers
- site restrictions
- document checklist
- current staging/dock target if authorized
- exception/help path.

## Arrival

Driver can:
- present credential
- attest arrival
- submit required documents
- receive queue/staging instruction
- see office request
- acknowledge instructions.

Geolocation must not be required unless policy/use case justifies it.

## Poor connectivity

Allow encrypted local capture if native app supports it.
Clearly distinguish:
- captured locally
- queued
- server received
- office accepted.

A document is not "submitted" until server receipt is confirmed.

## No smartphone

Facility must support:
- physical document handoff;
- office scan;
- kiosk;
- guard-assisted workflow.

The evidence chain records the actual submitter/capture channel.
