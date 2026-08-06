# 19 — Multimodal Expansion Model

## 1. Principle

Truck is the initial operating wedge, but core identifiers, objects, events, documents, and workflows must not hard-code one mode.

## 2. Mode-neutral concepts

- party;
- shipment/consignment;
- transport movement;
- leg;
- location/facility;
- equipment/transport means;
- handling unit;
- booking/tender;
- custody;
- document;
- event;
- charge/settlement;
- exception.

## 3. Mode-specific profiles

### Road

Driver, tractor, trailer, HOS/ELD, roadside service, facility dwell, rate confirmation, POD.

### Rail

Rail carrier, terminal, railcar/container, waybill, interchange, train event, demurrage.

### Ocean

Carrier, vessel/voyage, port/terminal, container, booking, bill of lading, transshipment, detention/demurrage.

### Air

Airline/flight, airport/ground handler, ULD, air waybill, security screening, ONE Record logistics objects.

## 4. Expansion gate

A new mode requires:

- canonical-gap analysis;
- standards profile;
- legal/document review;
- identity and authority mapping;
- event/workflow catalog;
- partner pilot;
- conformance suite;
- no regression to road operations.

## 5. Cross-modal journey

A shipment may contain multiple mode-specific legs connected by handoff and custody events. FreightOS must preserve one end-to-end correlation while respecting each mode's authoritative systems and documents.
