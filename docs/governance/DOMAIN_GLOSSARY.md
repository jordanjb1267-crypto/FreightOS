# Canonical Domain Glossary

**Status:** Owner-approved (Phase 1 rulings, 2026-08-04)
**Scope:** Binding canonical names for FreightOS implementation artifacts — tables, types, events,
and API resources.

This register does **not** replace
`docs/production-handoff/v1.2/docs/DOMAIN_GLOSSARY.md`. That file is part of the immutable
preserved package (ADR-0014 §3) and is never edited. Where the handoff uses more than one name for
one concept, or names a concept it never defines, this register records the canonical choice and
the reasoning. Resolving drift by decision — rather than by editing the handoff — is the mechanism
ADR-0014 requires.

## 1. Resolved naming drift

| Concept                        | Names in the sources                                                                                                                                 | **Canonical**                                     | Table / type                                         | Reasoning                                                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| End-to-end movement            | `Journey` (`07_…:15`); `TransportJourney` (`05_…:6`, `00_…:97`)                                                                                      | **`TransportJourney`**                            | `transport_journeys`                                 | Two of three sources agree, and the reference DDL already uses `transport_journeys` (`db/reference/0002:37`)                                                              |
| Modal segment                  | `TransportLeg` (`05_…:7`); `TransportSegment` (listed at `05_…:13`, defined nowhere)                                                                 | **`TransportLeg`**                                | `transport_legs`                                     | `TransportSegment` has no definition, no fields, and no state machine. Phase 1 creates no such entity                                                                     |
| Custody record                 | `CustodyTransfer` (`07_…:75`, `db/reference/0005:139`); custody event (`schemas/custody-event.schema.json`)                                          | **`CustodyEvent`**                                | `custody_events`                                     | It is an append-only evidence record. "Transfer" implies a mutable process object, which is exactly what it must not be                                                   |
| Delivery shortfall             | `Discrepancy` (`07_…:75`); `facility_discrepancies` (`db/reference/0005:171`)                                                                        | **`DeliveryDiscrepancy`**                         | `delivery_discrepancies`                             | Disambiguates from any future facility-internal discrepancy concept                                                                                                       |
| Readiness of goods             | `InventoryCommitment` and `CargoReadiness` both listed (`07_…:75`); only the former implemented, carrying a readiness field (`db/reference/0005:60`) | **`CargoReadiness`**                              | `cargo_readiness`                                    | `InventoryCommitment` is a warehouse-inventory concept. Building it edges toward the WMS replacement `21_…:89` forbids. **`InventoryCommitment` is out of Phase 1 scope** |
| Exception case                 | `ExceptionCase` (`07_…:23`); `Exception` (`05_…:13`)                                                                                                 | **`Exception`**                                   | `exceptions`                                         | Shorter form, and `05_…` is the domain specification                                                                                                                      |
| Position on a leg              | `Stop` named at `05_…:13` and `07_…:15`; never defined                                                                                               | **`Stop`**                                        | `stops`                                              | Name retained; **definition supplied** in Phase 1 — an ordered position on a leg with a location, stop type, planned and actual windows, and milestones                   |
| Non-powered equipment          | `NonpoweredEquipment` (`07_…:19`); `TransportEquipment` (`05_…:13`)                                                                                  | **`NonpoweredEquipment`** for road Phase 1        | `nonpowered_equipment`                               | `TransportEquipment` is reserved as the multimodal superset for rail, ocean, and air                                                                                      |
| Legal posture                  | `authority_mode` (`04_…:31`, `07_…:5`, `config/policy/base_policy.yaml`, `schemas/custody-event.schema.json`)                                        | **`legal_authority_class` + `operating_context`** | `app.legal_authority_class`, `app.operating_context` | ADR-0015. Two dimensions, never recollapsed                                                                                                                               |
| Optimistic concurrency counter | `version` (ADR-0017, `07_…:61`, `tenants`)                                                                                                           | **`record_version`**                              | column name                                          | ADR-0021. `version` collides with policy version, formula version, contract version, and adapter version, all of which Phase 1 also stores                                |

## 2. Entities Phase 1 defines that the handoff names but does not specify

| Entity                         | Handoff mention                                                | Phase 1 source of definition |
| ------------------------------ | -------------------------------------------------------------- | ---------------------------- |
| `Stop`                         | `05_…:13`, `07_…:15`                                           | Plan §6 Specification 7      |
| `DetentionClock`               | `07_…:75`, `19_…:233`                                          | ADR-0025 and plan §5.11      |
| `FreeTimeRule`                 | none — implied by detention                                    | ADR-0025                     |
| `CarrierAppointment`           | implied by `09_…:43` and `packages/context/src/legal.ts:47-50` | Plan §6 Specification 1      |
| `ActivePoweredUnitObservation` | implied by `03_PRICING_AND_BILLING.md:59-61`                   | Plan §6 Specification 2      |
| `ExternalContractInvocation`   | none — the replay log both external boundaries require         | Plan §6 Specifications 8, 9  |

## 3. Entities explicitly out of Phase 1 scope

Named in the handoff, deliberately not built. Recorded so their absence reads as a decision rather
than an oversight.

| Entity                                                                                                                                                                | Why                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `InventoryCommitment`                                                                                                                                                 | Warehouse inventory; `21_…:89` forbids a WMS replacement                              |
| `TransportSegment`                                                                                                                                                    | Undefined in every source                                                             |
| `Booking`, `Tender`, `Quote`, `Contract`                                                                                                                              | Commercial commitment objects requiring consequential action; Phase 3 at the earliest |
| `NegotiationSession`, `Offer`, `Counteroffer`                                                                                                                         | Phase 2 Dispatch Copilot                                                              |
| `DispatchPlan`                                                                                                                                                        | Phase 2                                                                               |
| `AgentDefinition`, `ToolInvocation`, `AgentAction`, `EvaluationResult`                                                                                                | Phase 2 agent runtime                                                                 |
| `PolicyDecision`, `Approval`                                                                                                                                          | Phase 2 policy engine; Phase 3 approval binding                                       |
| `Invoice`, `InvoiceLine`, `Payment`, `Settlement`, `BillingAccount`, `Meter`, `MeterEvent`, `Entitlement`                                                             | Billing is disabled                                                                   |
| `Claim`, `BrokerageTransaction`, `FinancialExposure`                                                                                                                  | Red actions and the brokerage plane                                                   |
| All `AutonomousVehicle*`, `ODDProfile`, `AutonomousMission`, `RemoteAssistanceCase`                                                                                   | `PARTNER_AND_SAFETY_GATED`; ADR-0019 holds `autonomous_mobility` suspended            |
| `FacilityCampus`, `Building`, `Zone`, `YardPosition`, `FacilityResource`, `LoadPlan`, `UnloadPlan`, `Inspection`, `SensorObservation`, `FacilityCompatibilityProfile` | Beyond the `21_…:77-87` primitive list                                                |

## 4. Phase 1 state vocabularies

Canonical state sets. Full transition matrices are in
`docs/plans/phase-1-definition-and-owner-decisions.md` §5.

| Machine              | States                                                                                                                                                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Load Opportunity     | `INGESTED`, `NORMALIZED`, `VALIDATED`, `ELIGIBLE`, `SCORED`\*, `RECOMMENDED`\*, `NEGOTIATING`\*, `ACCEPTED`\*, `CONVERTED`\* · terminal `REJECTED`, `EXPIRED`, `WITHDRAWN`, `DUPLICATE`, `INELIGIBLE`                                                                                                 |
| Shipment             | `DRAFT`, `TENDERED`, `ACCEPTED`, `ASSIGNED`, `DISPATCHED`\*, `EN_ROUTE_TO_PICKUP`, `AT_PICKUP`, `LOADED`, `IN_TRANSIT`, `AT_DELIVERY`, `DELIVERED`, `DOCUMENTS_COMPLETE`, `INVOICED`\*, `PAID`\*, `CLOSED`, `CANCELLED`                                                                               |
| Consignment          | `DRAFT`, `CONFIRMED`, `IN_CUSTODY`, `DELIVERED`, `RECEIPTED` · `SHORT`, `DAMAGED`, `REJECTED`, `CANCELLED`                                                                                                                                                                                            |
| Transport Journey    | `PLANNED`, `ACTIVE`, `COMPLETED` · `CANCELLED`, `SUSPENDED`                                                                                                                                                                                                                                           |
| Transport Leg        | `PLANNED`, `ASSIGNED`, `AT_ORIGIN`, `LOADED`, `IN_TRANSIT`, `AT_DESTINATION`, `UNLOADED`, `COMPLETED` · `CANCELLED`, `EXCEPTION_HELD`                                                                                                                                                                 |
| Assignment           | `PLANNED`, `CONFIRMED`, `ACTIVE`, `COMPLETED` · `CANCELLED`, `SUPERSEDED`                                                                                                                                                                                                                             |
| Appointment          | `REQUESTED`, `CAPACITY_CHECKING`, `PROPOSED`, `CONFIRMED`, `VEHICLE_ASSIGNED`, `ARRIVAL_TRACKING`, `CHECKED_IN`, `YARD_ASSIGNED`, `DOCK_ASSIGNED`, `SERVICE_STARTED`, `SERVICE_COMPLETE`, `CHECKED_OUT`, `CLOSED` · `REJECTED`, `CANCELLED`, `RESCHEDULED`, `MISSED`, `FACILITY_HOLD`, `CARRIER_HOLD` |
| Vehicle Visit        | `EXPECTED`, `ARRIVED`, `CHECKED_IN`, `STAGED`, `AT_DOCK`, `SERVICE_STARTED`, `SERVICE_COMPLETE`, `CHECKED_OUT`, `DEPARTED` · `TURNED_AWAY`, `ABANDONED`                                                                                                                                               |
| Cargo Readiness      | `PLANNED`, `INVENTORY_ALLOCATED`, `PICKING`, `PICKED`, `PACKED`, `STAGED`, `RELEASED`, `READY_FOR_LOADING` · `SHORT`, `DAMAGED`, `QUALITY_HOLD`, `CUSTOMS_HOLD`, `CUSTOMER_HOLD`, `NOT_READY`                                                                                                         |
| Custody              | `SHIPPER_CONTROL`, `RELEASE_AUTHORIZED`, `LOADING_VERIFIED`, `CARRIER_CUSTODY`, `DELIVERY_PRESENTED`, `RECEIVER_INSPECTION`, `RECEIVER_ACCEPTED` · `PARTIALLY_ACCEPTED`, `REJECTED`, `DAMAGED`, `SHORT`, `OVER`, `SEAL_EXCEPTION`, `CLAIM_OPENED`                                                     |
| Detention            | `NOT_STARTED`, `RUNNING`, `PAUSED`, `STOPPED`, `EVIDENCED`, `DISPUTED`, `RESOLVED` · `VOIDED`                                                                                                                                                                                                         |
| Delivery Discrepancy | `REPORTED`, `UNDER_REVIEW`, `SUBSTANTIATED`, `RESOLVED` · `DISMISSED`, `ESCALATED_TO_CLAIM`                                                                                                                                                                                                           |
| Exception            | `OPEN`, `ACKNOWLEDGED`, `IN_PROGRESS`, `RESOLVED` · `DISMISSED`, `ESCALATED`                                                                                                                                                                                                                          |

\* The state exists in the enum but **no Phase 1 transition may enter it.** Carrying the value and
refusing the transition is a stronger guarantee than omitting the value, because it makes the
refusal testable.

## 5. Package ownership

Canonical package for each domain concept, per ADR-0024.

| Package                          | Owns                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/config`                | Scope registry, autonomy ceiling, environment validation                                                                                                                              |
| `packages/schemas`               | JSON Schemas and their validators                                                                                                                                                     |
| `packages/context`               | Legal authority class, operating context, capability matrix, kill-switch resolution                                                                                                   |
| `packages/database`              | Migrations, migrator, session context, typed SQL access                                                                                                                               |
| `packages/identity`              | Organization nodes, legal entities, operating authorities, carrier appointments, users, memberships, roles, permissions, service accounts, policy bindings                            |
| `packages/parties`               | Parties, party roles, locations, addresses, contacts, operating hours, restrictions, external identifiers                                                                             |
| `packages/carrier`               | Carrier profiles, drivers, powered units, nonpowered equipment, equipment capabilities, availability windows, maintenance restrictions, assignments, active-powered-unit observations |
| `packages/modal-core`            | Shipment, Consignment, CargoItem, HandlingUnit, TransportJourney, TransportLeg, Stop, Milestone, CustodyEvent, Exception, Document, and the modal adapter SDK                         |
| `packages/mode-road`             | Road adapter manifest, road extension schema, equipment matching, route and commercial facts, connector interface, canonical fixtures                                                 |
| `packages/facility-primitives`   | Facilities, appointments, cargo readiness, vehicle visits, load/unload events, seals, detention clocks, free-time rules, goods receipts, delivery discrepancies                       |
| `packages/rigreceipts-contracts` | RigReceipts contract types, versions, simulator, fixtures                                                                                                                             |
| `packages/rigdesk-contracts`     | RIGDESK contract types, versions, simulator, fixtures                                                                                                                                 |

Dependency direction and the layer rule are in ADR-0024. Circular dependencies are prohibited and
asserted in CI.

## 6. Terms carried forward unchanged

These are already unambiguous in the handoff glossary and are repeated here only to confirm no
Phase 1 redefinition: Shipment, Consignment, Load Opportunity, Powered Unit, Carrier-Agent Mode,
Brokerage Mode, Policy Decision, Approval, Cell, Dynamic Driving Task, Operational Design Domain,
Vehicle Visit, Remote Assistance, Facility Digital Twin.
