# Amendment A-1 — Physical Logistics and Autonomous Mobility

**Version:** 1.0.0  
**Status:** Binding architecture amendment  
**Applies to:** FreightOS, RIGDESK, RigReceipts, RIG Freight Network, RIG FacilityOS, and RIG Autonomous Vehicle Operations

## 1. Strategic objective

FreightOS must close the operating loop between inventory, shipper, warehouse, yard, dock, carrier, vehicle, receiver, customer, settlement, and maintenance.

```text
Inventory / customer order
        ↓
FacilityOS origin readiness
        ↓
FreightOS journey orchestration
        ↓
CarrierOS / autonomous vehicle mission
        ↓
FacilityOS destination receiving
        ↓
Inventory receipt / settlement
        ↓
RIGDESK maintenance / next mission
```

The platform owns the commercial mission, operational handoff, chain of custody, exception workflow, and settlement evidence. Certified vehicle, robotics, and industrial-control systems retain physical-motion and safety authority.

## 2. Product boundaries

### RIG FacilityOS

FacilityOS coordinates:

- Inventory and order readiness
- Pickup and delivery appointments
- Gate access and vehicle visits
- Yard staging and dock assignments
- Loading and unloading work queues
- Handling-unit verification
- Seal, condition, temperature, and evidence capture
- Custody transfer
- Receiving and discrepancy workflows
- Detention evidence
- Warehouse, yard, ERP, WMS, WES, and facility-system integrations

FacilityOS initially integrates with existing warehouse execution systems. It does not attempt to replace every WMS, YMS, WES, PLC, or warehouse-control system in its first release.

### RIG Autonomous Vehicle Operations

The Autonomous Vehicle Operations layer coordinates:

- Provider-independent vehicle identity and capability
- Operational design domain eligibility
- Mission request and authorization
- Facility compatibility
- Gate and dock credentials
- Remote-assistance cases
- Minimal-risk and recovery events
- Vehicle-health and maintenance dependencies
- Customer and facility communication
- Mission reconciliation

It does not perform the dynamic driving task.

### FreightOS Network Orchestrator

FreightOS remains authoritative for:

- Shipment, consignment, journey, and transport-leg state
- Appointment and facility commitments
- Carrier and autonomous-capacity assignment
- Chain-of-custody state
- Contracts and legal context
- Commercial communications
- Documents and evidence
- Charges, invoicing, settlement, and claims initiation
- Cross-leg and downstream exception propagation

## 3. Non-negotiable safety boundary

FreightOS, Claude, MCP clients, and general-purpose agents must never directly command:

- Steering, acceleration, braking, lane selection, reversing, collision avoidance, or emergency maneuvers
- Vehicle perception, object classification, or dynamic-driving-task fallback
- Robotic forklifts, autonomous yard tractors, conveyors, cranes, automated storage/retrieval systems, or warehouse robots
- Dock restraints, doors, industrial interlocks, programmable logic controllers, or safety systems

Permitted strategic commands include:

- Request mission validation
- Submit authorized origin/destination and time windows
- Place or release a commercial mission hold
- Assign a facility gate, staging zone, or dock as an operational target
- Request remote assistance
- Request human recovery
- Request inspection, maintenance, fuel, charging, cleaning, or calibration

The receiving certified system decides whether and how physical motion occurs.

## 4. Closed-loop operating workflow

### 4.1 Order and inventory readiness

FacilityOS receives a customer order, transfer order, shipment request, or purchase-order requirement and verifies:

- Inventory allocation and release
- Picking, packing, staging, and quality status
- Handling units and identification
- Cargo restrictions and required documentation
- Temperature, food-grade, pharmaceutical, hazmat, security, customs, and inspection requirements
- Probability of readiness before the planned vehicle arrival

No vehicle should be dispatched solely because a calendar appointment exists. Dispatch policy must consider cargo readiness and facility capacity.

### 4.2 Appointment and capacity coordination

The appointment workflow considers:

- Origin and destination operating hours
- Yard, gate, dock, labor, and material-handling capacity
- Cargo readiness
- Vehicle ETA and route feasibility
- Driver hours where applicable
- Autonomous-vehicle ODD and provider eligibility
- Downstream appointments and customer commitments

Appointments remain versioned commitments. Rescheduling produces new evidence and downstream impact calculations.

### 4.3 Pre-arrival and facility credentialing

Before arrival, the facility receives the authorized shipment, carrier, vehicle, equipment, ETA, cargo requirements, and appointment credential. The driver or autonomous provider receives approved approach, gate, staging, dock, restrictions, and exception procedures.

Credentials may use mobile tokens, QR, RFID, license-plate recognition, telematics identity, provider-signed vehicle identity, or manual guard verification. Credential type is configurable per facility.

### 4.4 Gate, yard, and dock

FacilityOS records check-in, check-out, staging, dock assignment, service start, service completion, dwell, and detention. Recommendations may optimize yard and dock use; physical movement remains under approved human or certified facility-system control.

### 4.5 Loading, unloading, and verification

The workflow may require:

- Cargo and handling-unit identity
- Quantity, weight, dimensions, and load distribution
- Temperature and sensor evidence
- Loading sequence and securement
- Seal identity and integrity
- Condition photographs or machine evidence
- Required documents and signatures

### 4.6 Custody transfer

Every custody transfer records:

- Shipment, consignment, handling units, cargo, and equipment
- Releasing and accepting parties
- Facility and operational location
- Time and evidence
- Condition, quantity, temperature, seal, and exceptions
- Human or machine credential
- Contractual meaning and authority mode

Custody is a domain state, not an inferred chat statement.

### 4.7 In-transit and destination readiness

FreightOS continuously connects vehicle ETA, receiver capacity, dock readiness, customer commitments, cargo conditions, weather/route disruptions, energy needs, and maintenance conditions. A receiving failure should be surfaced before arrival whenever authoritative data permits.

### 4.8 Receiving and commercial completion

FacilityOS supports receiving, inspection, inventory receipt, shortage/overage/damage, rejection, claims initiation, POD, accessorials, invoice evidence, and settlement reconciliation.

### 4.9 Post-mission vehicle decision

After service, the platform may recommend or request:

- Next load or repositioning
- Fuel or charging
- Cleaning or washout
- Technician inspection
- Preventive or corrective maintenance
- Sensor cleaning or calibration
- Roadside or towing recovery
- Terminal return

RIGDESK owns maintenance work orders and return-to-service evidence. FreightOS updates capacity only after the authoritative maintenance or provider state permits it.

## 5. FacilityOS agent organization

Each facility tenant receives isolated, manifest-governed agents:

- Facility Operations Orchestrator
- Order Readiness Agent
- Appointment Agent
- Facility Capacity Agent
- Gate Agent
- Yard Orchestration Agent
- Dock Agent
- Load Verification Agent
- Receiving Agent
- Facility Exception Agent
- Labor and Resource Planning Agent
- Customer Communication Agent

Agents may observe, recommend, prepare, and—where policy allows—execute non-safety-critical commercial and scheduling actions. They cannot command physical motion or bypass a facility safety controller.

## 6. Autonomous Vehicle Operations agents

- Autonomous Mission Orchestrator
- ODD and Eligibility Agent
- Vehicle/Facility Compatibility Agent
- Remote Assistance Coordinator
- Autonomous Maintenance Coordinator
- Mission Exception Agent
- Mission Reconciliation Agent

The ODD and Eligibility Agent explains provider-returned eligibility and policy results. It does not invent ODD authorization.

## 7. Facility domain

Required entities include:

- Facility, FacilityCampus, Building, Zone
- Gate, Yard, YardPosition, StagingArea, DockDoor
- FacilityResource and FacilityOperatingCalendar
- InventoryCommitment and CargoReadiness
- Appointment and VehicleVisit
- GateCredential and FacilityTask
- LoadPlan and UnloadPlan
- Seal, Inspection, SensorObservation
- CustodyTransfer and GoodsReceipt
- Discrepancy and DetentionClock
- FacilityRestriction and FacilityCompatibilityProfile

A facility is not represented only as a latitude/longitude or generic stop.

## 8. Autonomous mobility domain

Required entities include:

- AutonomousVehicleProvider
- AutonomousVehicle
- AutomationCapability
- OperationalDesignDomainProfile
- MissionEligibilityDecision
- AutonomousMission
- MissionAuthorization
- RemoteAssistanceCase
- MinimalRiskEvent
- VehicleHealthSummary
- RecoveryRequest
- ProviderCredential
- FacilityCertification

High-frequency vehicle telemetry remains outside the primary transactional query path. The domain ledger stores authoritative summaries and references.

## 9. State machines

### Cargo readiness

```text
PLANNED → INVENTORY_ALLOCATED → PICKING → PICKED → PACKED → STAGED → RELEASED → READY_FOR_LOADING
```

Alternatives: SHORT, DAMAGED, QUALITY_HOLD, CUSTOMS_HOLD, CUSTOMER_HOLD, NOT_READY.

### Appointment

```text
REQUESTED → CAPACITY_CHECKING → PROPOSED → CONFIRMED → VEHICLE_ASSIGNED
→ ARRIVAL_TRACKING → CHECKED_IN → YARD_ASSIGNED → DOCK_ASSIGNED
→ SERVICE_STARTED → SERVICE_COMPLETE → CHECKED_OUT → CLOSED
```

Alternatives: REJECTED, CANCELLED, RESCHEDULED, MISSED, FACILITY_HOLD, CARRIER_HOLD.

### Custody

```text
SHIPPER_CONTROL → RELEASE_AUTHORIZED → LOADING_VERIFIED → CARRIER_CUSTODY
→ DELIVERY_PRESENTED → RECEIVER_INSPECTION → RECEIVER_ACCEPTED
```

Alternatives: PARTIALLY_ACCEPTED, REJECTED, DAMAGED, SHORT, OVER, SEAL_EXCEPTION, CLAIM_OPENED.

### Autonomous mission

```text
DRAFT → CARGO_ELIGIBLE → VEHICLE_REQUESTED → PROVIDER_VALIDATING → ODD_ELIGIBLE
→ VEHICLE_ASSIGNED → VEHICLE_READY → ORIGIN_READY → MISSION_AUTHORIZED
→ EN_ROUTE_TO_ORIGIN → ORIGIN_SERVICE → LINEHAUL → DESTINATION_SERVICE
→ DELIVERY_COMPLETE → POST_MISSION_INSPECTION → AVAILABLE
```

Exception states: ODD_INELIGIBLE, WEATHER_HOLD, FACILITY_HOLD, REMOTE_ASSISTANCE, MINIMAL_RISK_CONDITION, VEHICLE_FAULT, CARGO_EXCEPTION, CYBERSECURITY_HOLD, MISSION_ABORTED, HUMAN_RECOVERY_REQUIRED.

## 10. Autonomous Vehicle Gateway contract

The provider-independent gateway may receive:

- Vehicle and provider identity
- Automation capability and current state
- ODD profile and mission eligibility
- Location and ETA
- Vehicle, sensor, energy, trailer, and cargo-health summaries
- Remote-assistance, minimal-risk, maintenance, and cybersecurity status

It may submit:

- Mission ID and shipment context
- Authorized origin/destination and time windows
- Cargo, trailer, weight, and facility requirements
- Facility geofence, gate credential, staging, and dock target
- Commercial hold, cancellation, recovery, and maintenance requests

It must never expose low-level vehicle-control commands.

## 11. Remote assistance

FreightOS distinguishes:

- Remote monitoring
- Remote confirmation
- Remote guidance
- Remote authorization
- Remote driving
- Field recovery

The initial product may coordinate the first four only where provider contracts authorize them. It does not provide remote driving. Every case records provider, operator role, communication path, latency/availability status where supplied, action, outcome, and evidence.

## 12. Facility digital twin

The facility digital twin contains:

- Static geometry and operational locations
- Vehicle entrances and approved routes supplied by the facility
- Gates, staging zones, yards, and docks
- Restrictions, capabilities, hours, and emergency procedures
- Scheduled capacity and real-time operational state
- Autonomous-vehicle compatibility and certification

FreightOS must not invent facility geometry, route clearances, or safety conditions. Data requires facility or approved-provider provenance and versioning.

## 13. Integration standards

The boundary layer should support:

- Existing ERP, WMS, WES, YMS, TMS, telematics, and ADS-provider APIs
- X12 163 for transportation appointments where trading partners use it
- X12 940, 943, 944, and 945 for warehouse order, shipment, receipt, and advice workflows
- X12 322 for terminal/intermodal ramp activity where applicable
- GS1 EPCIS/CBV for event visibility, including shipping, receiving, aggregation, sensor, and custody-related business context

Standards messages are translated into the canonical FreightOS model and are never the sole system of record.

## 14. RIGDESK maintenance loop

RIGDESK must support autonomous and human-operated equipment through:

- Mission-readiness checks
- Preventive and predictive maintenance
- Vehicle and ADS diagnostic summaries
- Sensor cleaning and calibration
- Tire, brake, steering, and redundant-system condition
- Fueling, charging, cleaning, and washout
- Inspection, roadside repair, towing, parts, and technician dispatch
- Return-to-service evidence

An agent cannot override an ADS-provider or safety-system hold.

## 15. Implementation sequence

1. Facility Connectivity
2. Facility Copilot
3. Facility Policy-Bounded Automation
4. Autonomous Vehicle Shadow Integration
5. Supervised Autonomous Missions
6. Policy-Bounded Autonomous Corridors
7. Closed-Loop Physical Freight Network
8. Multimodal terminal integration

Road dispatch and shipper workflows remain the preceding commercial foundation. Rail, ocean, and air adapters continue to use the same Shipment → Journey → TransportLeg core.

## 16. Activation gates

No live autonomous mission may execute until:

- The provider integration passes contract, security, safety-boundary, and failure testing
- The provider is authoritative for ODD and vehicle readiness
- Origin and destination facilities are compatible and approved
- Cargo/equipment/route are eligible
- Remote-assistance and recovery procedures are active where required
- Insurance, contracts, legal review, incident procedures, and customer authorization are documented
- Human stop/hold authority and kill switches are tested
- Shadow and approval-only evidence passes the phase gate

## 17. Final architecture position

FreightOS will not manufacture or control the automated-driving system. It becomes the universal operating and commercial layer through which inventory, facilities, carriers, autonomous vehicles, customers, receivers, maintenance providers, and multimodal networks coordinate and transact.
