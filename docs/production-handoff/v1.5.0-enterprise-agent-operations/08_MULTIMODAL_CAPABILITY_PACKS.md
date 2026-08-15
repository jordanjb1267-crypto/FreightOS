# 08 — Multimodal Capability Packs

## 1. Core principle

Truck is the first commercial wedge. Architecture remains mode-neutral.

A capability pack extends canonical FreightOS without replacing core identity, tenancy, events, commands, evidence, audit, or workflow runtime.

## 2. Capability pack contract

Each pack declares:
- pack ID/version
- supported canonical objects
- specialized objects
- vocabulary mappings
- event types
- command types
- documents
- constraints
- workflow modules
- agent specializations
- integrations/standards
- fixtures
- conformance tests
- risk/legal profile
- metrics
- deprecations.

## 3. Road pack

Entities:
- driver/crew
- tractor
- trailer/chassis
- terminal
- stop
- appointment

Special domains:
- HOS/ELD
- roadside
- POD/rate confirmation
- tractor/trailer readiness
- facility dwell.

## 4. Rail pack

Entities:
- rail carrier
- railcar
- locomotive/consist reference where needed
- train/movement
- terminal/ramp
- interchange
- waybill

Workflows:
- car assignment
- interchange
- waybill/document
- movement tracking
- demurrage
- exception handling.

Do not force road concepts such as "driver dispatch" into rail semantics.

## 5. Ocean pack

Entities:
- ocean carrier
- vessel
- voyage
- container
- port/terminal
- booking
- bill of lading
- transshipment.

Workflows:
- booking
- container planning
- cutoff/deadline
- port/terminal events
- transshipment
- detention/demurrage
- document/evidence.

## 6. Multimodal journey

Core:
```text
Shipment
└── TransportJourney
    ├── Road leg
    ├── Rail leg
    ├── Ocean leg
    └── Road leg
```

Handoff/custody events connect legs.
Each leg can use its own capability pack and authoritative partners while preserving end-to-end correlation.

## 7. Customer deployment

A road-only owner-operator loads Road pack only.
A rail enterprise loads Rail pack.
A multimodal forwarder/carrier loads multiple packs subject to legal-plane controls.

No tenant pays operational complexity for modes it does not use.
