# Data Model and State Machines

## Common fields

id, tenant_id, organization_node_id, legal_entity_id, authority_mode, status, version, created_at, updated_at, created_by.

## Domains

### Identity/authority

OrganizationNode, LegalEntity, OperatingAuthority, User, Membership, Role, Permission, ServiceAccount, AgencyAppointment, CommercialAgreement.

### Freight

Shipment, Consignment, CargoItem, HandlingUnit, Journey, TransportLeg, Stop, Location, Facility, LoadOpportunity, Quote, Tender, Booking.

### Carrier operations

CarrierProfile, Driver, DriverPreference, PoweredUnit, NonpoweredEquipment, EquipmentCapability, AvailabilityWindow, MaintenanceRestriction, Assignment.

### Execution

DispatchPlan, NegotiationSession, Offer, Counteroffer, TrackingEvent, Milestone, ETAObservation, Communication, ExceptionCase, ResolutionAction, Document, DocumentValidation, Approval.

### Finance

CostProfile, ProfitabilityEstimate, Charge, Invoice, InvoiceLine, Payment, Settlement, BrokerageTransaction, FinancialExposure, Claim.

### Agents/policy

AgentDefinition, AgentDeployment, ModelDeployment, ToolDefinition, ToolInvocation, PolicyDefinition, PolicyDecision, WorkflowExecution, AgentRecommendation, AgentAction, EvaluationResult, AuditEvent.

### Commercial

Product, Plan, PriceCatalog, Entitlement, Meter, MeterEvent, UsageAggregate, Commitment, ContractOverride, BillingAccount.

## Load opportunity state

INGESTED → NORMALIZED → VALIDATED → ELIGIBLE → SCORED → RECOMMENDED → NEGOTIATING → ACCEPTED → CONVERTED.

Terminal: REJECTED, EXPIRED, WITHDRAWN, DUPLICATE, INELIGIBLE.

## Shipment state

DRAFT → TENDERED → ACCEPTED → ASSIGNED → DISPATCHED → EN_ROUTE_TO_PICKUP → AT_PICKUP → LOADED → IN_TRANSIT → AT_DELIVERY → DELIVERED → DOCUMENTS_COMPLETE → INVOICED → PAID → CLOSED.

Exceptions are linked cases.

## Agent action state

PROPOSED → POLICY_EVALUATING → DENIED

or

PROPOSED → POLICY_EVALUATING → APPROVAL_REQUIRED → APPROVED → AUTHORIZED → EXECUTING → SUCCEEDED.

Failure: EXECUTING → RETRY_SCHEDULED → FAILED → MANUAL_RECOVERY.

## Concurrency

Mutable aggregates use versions. Commands include expected version. Conflicts return typed results.

## Money

Use integer minor units and ISO currency. Record inputs, formula version, currency, rounding, output, timestamp, and actor.

## Physical logistics domains

### Facility

Facility, FacilityCampus, Building, Zone, Gate, Yard, YardPosition, StagingArea, DockDoor, FacilityResource, FacilityOperatingCalendar, FacilityRestriction, FacilityCompatibilityProfile.

### Origin and destination execution

InventoryCommitment, CargoReadiness, Appointment, VehicleVisit, GateCredential, FacilityTask, LoadPlan, UnloadPlan, Seal, Inspection, SensorObservation, CustodyTransfer, GoodsReceipt, Discrepancy, DetentionClock.

### Autonomous mobility

AutonomousVehicleProvider, AutonomousVehicle, AutomationCapability, ODDProfile, MissionEligibilityDecision, AutonomousMission, MissionAuthorization, RemoteAssistanceCase, MinimalRiskEvent, VehicleHealthSummary, RecoveryRequest, FacilityCertification.

### Safety authority

Every facility task and autonomous mission records the external authoritative controller. FreightOS state cannot imply authority over physical motion.
