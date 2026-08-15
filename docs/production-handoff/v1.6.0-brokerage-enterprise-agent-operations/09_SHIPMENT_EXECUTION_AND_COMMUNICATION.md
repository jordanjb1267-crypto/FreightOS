# 09 — Shipment Execution and Communication

## Post-booking

Brokerage plane coordinates:
- dispatch confirmation
- pickup readiness
- appointment
- driver/carrier status
- facility communication
- milestone tracking
- exceptions
- documents
- customer updates.

## Communication

Agent may send authorized:
- pickup confirmation
- status
- ETA
- delay
- appointment update
- document request
- exception notice.

Communication must identify brokerage role where required and must not misrepresent broker as carrier.

## System of truth

Carrier/Facility events are evidence/assertions with provenance.

Broker read model derives shipment status from:
- carrier
- facility
- shipper
- documents
- verified integrations.

Conflicts create exception, not silent overwrite.

## No fake check calls

If no authoritative status is available:
state = UNKNOWN/STALE.
Agent cannot invent driver location or ETA.

## Degraded mode

Model outage:
- deterministic shipment/status workflows continue.
Integration outage:
- mark stale, use alternate/manual procedure, reconcile later.
