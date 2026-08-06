# 04 — Canonical Logistics Domain Model

## 1. Design goals

The canonical model enables different systems to communicate without requiring identical internal schemas. It must be stable, extensible, versioned, and explicit about semantics.

## 2. Aggregate families

### Party and network

- Organization
- Person
- Membership
- Facility
- Authority credential
- Contact point
- Relationship
- Capability

### Freight demand and commitment

- Order
- Shipment
- Consignment
- Load
- Booking
- Tender
- Quote
- Contract
- Stop
- Appointment
- Route plan

### Assets and capacity

- Tractor
- Trailer
- Container
- Chassis
- Railcar
- Vessel/voyage reference
- Aircraft/flight reference
- Handling unit
- Equipment capability
- Capacity window

### Cargo

- Commodity
- Item
- Package
- Pallet
- Handling unit
- Dangerous-goods declaration
- Temperature or condition requirement
- Seal

### Execution

- Assignment
- Journey
- Leg
- Handoff
- Arrival
- Gate event
- Loading/unloading activity
- Custody transfer
- Exception

### Service and maintenance

- Fault
- Diagnostic observation
- Service request
- Estimate
- Work order
- Part
- Repair event
- Tow event
- Mission-readiness assessment

### Documents and evidence

- Document
- Document version
- Signature
- Evidence item
- Rate confirmation
- Bill of lading
- Proof of delivery
- Receipt
- Image/video reference

### Financial truth

- Charge
- Accessorial
- Invoice
- Deduction
- Payment instruction
- Payment status
- Settlement
- Dispute
- Claim
- Reconciliation record

## 3. Modeling rules

- Separate commercial agreement from physical execution.
- Separate planned, predicted, observed, asserted, and verified values.
- Use time intervals with timezone and precision.
- Represent location provenance and uncertainty.
- Preserve units and currency explicitly.
- Never overload one status field to represent multiple lifecycle dimensions.
- Use references rather than duplicating authoritative objects.
- Permit extensions through registered namespaces.

## 4. Object lifecycle

Every canonical aggregate defines:

- creation authority;
- lifecycle states;
- valid transitions;
- immutable fields;
- correction method;
- ownership and visibility;
- related event types;
- retention class;
- external-standard mappings.

## 5. Source of truth

FreightOS may be:

- system of record;
- authoritative mirror;
- derived view;
- routing index;
- evidence custodian;
- pointer to an external authoritative source.

The role must be declared per object and field. “Stored in FreightOS” does not automatically mean “authoritative.”
