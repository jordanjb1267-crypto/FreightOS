# 00 — FacilityOS Enterprise Agent Operations Master Handoff

## 1. Mission

FacilityOS SHALL become the governed communication and execution layer for facility-side logistics operations while allowing facilities to preserve existing investments in warehouse, yard, labor, access-control, industrial-control, and enterprise systems.

FacilityOS owns the **digital operational coordination layer** around the physical facility:
- readiness;
- appointments;
- pre-arrival;
- gate/visit;
- yard/staging;
- dock;
- shipping;
- receiving;
- documents;
- custody evidence;
- detention;
- discrepancies;
- carrier/driver communication;
- facility/network events.

## 2. Facility Operational Twin

Every tenant/site receives an inspectable, versioned Facility Operational Twin (FOT).

The FOT describes:
- site hierarchy and logical topology;
- gates, yards, staging zones, dock doors, buildings and operational zones;
- hours/calendars;
- shipping/receiving offices;
- roles, shifts, approvals and escalation;
- appointment rules;
- carrier/driver instructions;
- cargo/equipment restrictions;
- document/BOL requirements;
- loading/unloading SOPs;
- receiving SOPs;
- custody evidence requirements;
- detention rules;
- exception/discrepancy policies;
- systems of record;
- integrations;
- capacity/labor interfaces;
- facility terminology;
- data provenance/freshness.

Physical geometry/safety data must have authoritative provenance and cannot be invented by an agent.

## 3. Facility Agent Organization

FacilityOS instantiates a tenant/site-scoped agent organization from canonical manifests.

Canonical logical roles:
- Facility Operations Orchestrator
- Cargo/Order Readiness Agent
- Appointment Agent
- Carrier/Driver Coordination Agent
- Gate Agent
- Yard Orchestration Agent
- Dock Agent
- Shipping Office Agent
- Receiving Office Agent
- Document/BOL Agent
- Load/Unload Verification Agent
- Custody/Evidence Agent
- Detention Agent
- Discrepancy Agent
- Capacity/Labor Planning Agent
- Facility Exception Agent
- Facility Customer Communication Agent
- Integration/Configuration Steward

Small sites may collapse runtime workers but not policy responsibilities.

## 4. Driver ↔ office communication

The driver experience is part of the network.

A driver must be able to:
- receive facility instructions;
- confirm appointment/visit identity;
- check in;
- receive gate/staging/dock targets;
- submit BOL and required documents;
- receive submission receipt;
- respond to correction requests;
- receive accepted/superseded document status;
- capture authorized signatures/evidence;
- receive checkout/release information;
- preserve an authorized copy for carrier records.

A driver does not need a paid FacilityOS seat.

## 5. Document and custody separation

A BOL submission is evidence/document state.

It MUST NOT automatically mean:
- cargo loaded;
- cargo accepted;
- title transferred;
- custody transferred;
- goods received;
- proof of delivery completed;
- invoice approved.

Those are separate, governed business states with their own evidence and authority.

## 6. Network position

```text
Shipper / Inventory / ERP-WMS
          ↓
      FacilityOS
          ↓
FreightOS Network ↔ Carrier Agent Organization
          ↓
Driver / Asset / RigDesk
          ↓
Destination FacilityOS
          ↓
Receiving / Inventory / Settlement Evidence
```

## 7. Productization

Every feature must support:
- shared SaaS;
- enterprise multi-facility deployment;
- dedicated cells where required;
- versioned APIs/events;
- customer-specific configuration without forks;
- data export/deletion;
- audit;
- SLOs;
- repeatable onboarding;
- customer procurement/security review.

## 8. Sequencing

This architecture may be installed now as design/control material.

Runtime implementation and activation remain subordinate to the FreightOS module-state registry and promotion gates.
