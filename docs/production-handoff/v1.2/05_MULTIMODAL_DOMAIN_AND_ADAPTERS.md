# Multimodal Domain and Adapter Specification

## Universal model

`Shipment` is the commercial movement requirement.  
`TransportJourney` is the end-to-end movement.  
`TransportLeg` is one mode-specific segment.  
`Consignment` groups goods transported/documented together.  
`HandlingUnit` is a physical grouping such as pallet, container, package, tank, or ULD.

## Universal entities

Shipment, Consignment, CargoItem, HandlingUnit, TransportOrder, Booking, Tender, Quote, Contract, TransportJourney, TransportLeg, TransportSegment, Conveyance, TransportEquipment, EquipmentAssignment, Party, PartyRole, Location, Facility, Stop, Schedule, Milestone, Event, Document, Charge, Invoice, Settlement, Exception, Claim, CustomsProcedure, RegulatoryRequirement.

## TransportLeg contract

Each leg stores mode, service type, origin/destination, planned/actual windows, performing carrier, contract/rate, conveyance/equipment, cargo, status, charges, documents, events, exceptions, sequencing, and versioned modal extension.

Mode-specific fields do not become random nullable core columns.

## Cargo

Extensible classification supports description, customer code, weight, volume, quantity, dimensions, packaging, handling, temperature, dangerous goods, food/pharma, value/security, customs, origin, restrictions, loading, stackability, chain of custody, and mappings such as HS/STCC/licensed codes.

## Equipment

Capability-based model:

- Mode/powered status
- Dimensions/capacity
- Axle/deck
- Access/loading
- Temperature zones
- Liquid/dry bulk
- Pressure/food-grade/hazmat
- Securement
- Container/chassis/rail/ro-ro
- Gauge/permits
- Sensors/telematics

New profiles are registry data, not schema migrations.

## Modal adapter interface

Each adapter defines mode, version, entities, fields, state machine, documents, events, exceptions, meters, policy packs, agent tools, connectors, standards mappings, and fixtures.

## Road

Supports FTL, LTL, drayage, final mile, parcel, private fleets, dedicated carriage, dry van, reefer, open deck, tanker/bulk, heavy haul, power only, auto transport, and specialized equipment.

Initial X12 targets: 204, 990, 214, 210.

## Rail

Entities: RailCarrier, Railcar, Train, Block, Station, Junction, Interchange, RailRoute, RailWaybill, CarOrder, Placement, Release, DemurrageEvent, RailCharge.

Targets: X12 404, 417, 410, 421; Railinc reference data; STCC.

## Ocean

Entities: OceanCarrier, Vessel, Voyage, Service, PortCall, Terminal, OceanBooking, ShippingInstruction, BillOfLading, Container, Seal, VerifiedGrossMass, Transshipment, Demurrage, Detention, FreeTime, CustomsHold.

Targets: DCSA Booking, Bill of Lading, Track and Trace, schedules, and ISO container identifiers.

## Future air

Protect extension points for master/house AWB, flight, airport, airline, handler, ULD, security, chargeable weight, IATA Cargo-XML, and ONE Record.

## Multimodal orchestration

The journey engine correlates milestones, propagates delays, recalculates feasibility, preserves commitments, transfers custody, tracks handoffs, allocates cost/revenue, coordinates documents/customs, models free time, and reconciles settlement.
