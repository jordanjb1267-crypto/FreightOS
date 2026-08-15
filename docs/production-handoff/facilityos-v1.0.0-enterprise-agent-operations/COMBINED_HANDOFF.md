# RIG FacilityOS Enterprise Agent Operations Handoff v1.0.0 — Combined

Individual package files are controlling. This is a convenience combination. Existing FreightOS/FacilityOS files were not modified.


---

<!-- SOURCE: 00_MASTER_HANDOFF.md -->

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


---

<!-- SOURCE: 01_FACILITYOS_CONSTITUTION.md -->

# 01 — FacilityOS Constitution

## Article I — Coordination, not unsafe physical control

FacilityOS coordinates operations but does not directly control industrial or vehicle motion.

## Article II — Customer-specific through configuration

Facility differences belong in:
- FOT;
- policies;
- workflows;
- capability packs;
- integrations;
- authority grants;
not hidden prompts or customer code forks.

## Article III — Operational state is explicit

Appointments, visits, gate entry, staging, dock assignment, loading, custody, receiving, discrepancies, detention, documents and release are explicit states/events.

Conversation is not state.

## Article IV — Authority before side effect

No agent may:
- admit a vehicle;
- issue a credential;
- accept a document;
- reschedule an appointment;
- assign an operational target;
- record custody;
- record goods receipt;
- release cargo;
- submit an external transaction
unless deterministic policy and current authority permit it.

## Article V — Human-understandable operation

The facility can inspect:
- what FacilityOS believes;
- workflows;
- agents;
- policies;
- autonomy;
- evidence;
- pending decisions;
- change history.

## Article VI — Progressive autonomy

`DISCOVER -> OBSERVE -> SHADOW -> PREPARE -> APPROVAL_EXECUTE -> POLICY_AUTONOMOUS -> EXCEPTION_SUPERVISED`

Each action class progresses independently.

## Article VII — Driver dignity and accessibility

Driver workflows must be:
- mobile-first;
- low-friction;
- multilingual-ready;
- accessible;
- usable without paid seat;
- resilient to poor connectivity;
- supported by manual/kiosk fallback.

Do not force a driver to install an app when a secure web/QR/manual alternative can satisfy policy.

## Article VIII — Evidence integrity

Original documents/media are immutable evidence objects.
Derived OCR/extraction is secondary and correctable.
Every document version is hashed and attributable.

## Article IX — Cross-party data minimization

A carrier sees only authorized facility/shipment/visit information.
A facility receives only required carrier/driver/asset data.
FacilityOS does not create a broad cross-company surveillance layer.

## Article X — Enterprise proof

Production claims require tenant isolation, authority, graph, idempotency, reconciliation, outage, shadow, security, kill-switch and rollback evidence.


---

<!-- SOURCE: 02_FACILITY_OPERATIONAL_TWIN.md -->

# 02 — Facility Operational Twin (FOT)

## Purpose

The FOT is the customer-visible representation of how FacilityOS understands a site/network.

## Structure

### Enterprise
- facility network
- legal entity
- business unit
- region
- site/campus

### Site topology
- building
- gate
- yard
- staging area
- dock
- shipping office
- receiving office
- inspection area
- parking/queue area
- logical operational zone

### Rules
- operating hours
- appointment windows
- early/late policy
- check-in policy
- ID/credential requirements
- trailer/equipment restrictions
- cargo restrictions
- PPE/site rules
- shipping instructions
- receiving instructions
- document/BOL requirements
- seal rules
- temperature rules
- detention policy
- release rules

### Roles
- guard/gate
- shipping office
- receiving office
- dock coordinator
- yard coordinator
- warehouse supervisor
- operations manager
- inventory control
- quality/safety
- customer service
- escalation/on-call

### Systems
For each ERP/WMS/YMS/WES/TMS/access/document system:
- owner
- authoritative fields
- interface
- freshness
- read/write
- outage behavior
- credential class
- reconciliation.

## Fact states

`PROPOSED | VERIFIED | APPROVED | DISPUTED | DEPRECATED`

No PROPOSED fact can authorize a consequential action.

## Vocabulary

Examples:
- "shipping window"
- "lumper"
- "will call"
- "drop lot"
- "live unload"
- "receiving number"
- "PO"
- "BOL"
- "load number"
- "pickup number"

Map customer terms to canonical concepts. Ambiguous identifiers stay unresolved until verified.

## Facility geometry

FacilityOS may maintain logical/operational geometry and restrictions.

Safety-critical geometry/clearance/robotics routes require authoritative facility/controller sources and explicit provenance.

## FOT change impact

A change reports impacted:
- appointments
- visit credentials
- workflows
- document requirements
- agent manifests
- autonomy grants
- carrier instructions
- integrations.

## Drift

Create review when actual operation repeatedly differs from FOT.
Never silently rewrite policy from observed behavior.


---

<!-- SOURCE: 03_FACILITY_AGENT_ORGANIZATION_FACTORY.md -->

# 03 — Facility Agent Organization Factory

## Factory inputs

- tenant/site
- FOT version
- enabled workflow packs
- integration bindings
- facility policies
- authority grants
- autonomy certifications
- operating calendar
- SLO tier.

## Core agent manifests

### Facility Operations Orchestrator
Coordinates graph routing; no blanket authority.

### Cargo/Order Readiness
Reads authoritative inventory/order readiness.

### Appointment
Schedules/recommends/reschedules inside policy.

### Carrier/Driver Coordination
Communicates authorized instructions/status.

### Gate
Prepares/verifies visit credentials and check-in state.

### Yard Orchestration
Recommends staging/queue targets, never physical motion.

### Dock
Coordinates dock readiness/assignment target.

### Shipping Office
Manages origin-office workflow and document readiness.

### Receiving Office
Manages destination-office workflow, receipt/discrepancy.

### Document/BOL
Ingests, correlates, extracts, validates and routes documents.

### Load/Unload Verification
Coordinates required evidence/checklist.

### Custody/Evidence
Proposes/records custody only through governed command.

### Detention
Runs clocks/evidence per contract/facility policy.

### Discrepancy
Manages shortage/overage/damage/rejection workflow.

### Capacity/Labor Planning
Forecasts/recommends; does not command workforce/industrial systems unless separately governed.

### Exception
Routes operational exceptions/escalations.

### Customer Communication
Sends governed notifications.

## Context

Agent task context is limited to:
- tenant/site;
- visit/shipment;
- relevant FOT subset;
- current system-of-record state;
- current workflow;
- authority/policy;
- evidence.

No broad tenant prompt.

## Agent communication

Typed:
- observation
- request
- proposal
- approval request
- command request
- result
- escalation.

Free-form agent chat is never execution authority.


---

<!-- SOURCE: 04_FACILITY_WORKFLOW_GRAPH_STANDARD.md -->

# 04 — Facility Workflow Graph Standard

## Required graph fields

- ID/version
- tenant/site scope
- trigger schema
- state schema
- nodes/edges
- system-of-record reads
- deterministic gates
- intelligence nodes
- human interrupts
- side-effect nodes
- deadlines
- retries
- idempotency
- reconciliation
- degraded mode
- terminal states
- evaluation suite.

## Canonical pattern

```text
Trigger
 ↓
Load authoritative state
 ↓
Identity/tenant/site validation
 ↓
FOT + current policy
 ↓
Interpret/classify if needed
 ↓
Deterministic feasibility
 ↓
Authority/policy
 ↓
Approval if required
 ↓
Idempotency
 ↓
Side effect
 ↓
External verification
 ↓
Event/evidence
 ↓
Reconciliation
 ↓
Terminal / next graph
```

## Mandatory graph families

- facility onboarding/FOT
- cargo readiness
- appointment
- pre-arrival
- vehicle visit/check-in
- BOL/document submission
- gate
- yard/staging
- dock
- shipping
- receiving
- custody
- detention
- discrepancy
- facility exception
- facility outage/recovery.

## Mutation tests

Fail CI if:
- side effect bypasses policy;
- document acceptance bypasses required office/authority;
- custody is inferred from document existence;
- goods receipt is inferred from BOL submission;
- retry is unbounded;
- graph lacks terminal state;
- idempotency missing;
- customer/site context is unverified;
- physical-control command surface appears.


---

<!-- SOURCE: 05_VEHICLE_VISIT_AND_DRIVER_EXPERIENCE.md -->

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


---

<!-- SOURCE: 06_BOL_DOCUMENT_AND_OFFICE_EXCHANGE.md -->

# 06 — Bill of Lading, Document, and Shipping/Receiving Office Exchange

## 1. Principle

A Bill of Lading is a first-class `TransportDocument`, with its own identity, versions, provenance, associations, acknowledgements and policy.

The architecture supports paper and electronic records.

FacilityOS does not make a universal legal determination about a BOL's title/negotiability/e-signature effect. Tenant policy and jurisdictional/legal review control legal treatment.

## 2. Channels

BOL may arrive via:
- driver mobile upload/photo/PDF;
- driver QR/scoped-link;
- shipping-office generation;
- shipping-office scan of paper;
- receiving-office scan;
- carrier API;
- shipper API;
- EDI X12 211 where applicable;
- secure email ingestion;
- FreightOS document reference;
- approved external document platform.

## 3. Document record

Required:
- document ID
- tenant/site
- document type
- shipment/consignment/leg refs
- appointment/visit refs
- source channel
- submitted-by identity/party
- captured-by identity where different
- received timestamp
- original object reference
- cryptographic hash
- MIME/media metadata
- extraction version
- validation state
- office disposition
- signature/acknowledgement refs
- supersedes/superseded-by
- retention/data classification.

## 4. States

```text
EXPECTED
RECEIVED
MALWARE_SCAN_PASSED
PARSED
MATCH_CANDIDATE
MATCHED
VALIDATION_REQUIRED
ACCEPTED_FOR_OPERATIONAL_USE
CORRECTION_REQUESTED
REJECTED
SUPERSEDED
VOIDED
ARCHIVED
```

`ACCEPTED_FOR_OPERATIONAL_USE` does not itself transfer custody/title or create goods receipt.

## 5. Driver → shipping office origin graph

```text
Appointment/visit exists
 ↓
BOL required
 ↓
Driver presents/uploads BOL
 ↓
Server receipt + immutable original hash
 ↓
Security/media validation
 ↓
Document type/extraction
 ↓
Match to shipment/visit
 ↓
Required-field/policy validation
 ↓
Shipping Office queue
 ↓
Accept / correction request / reject
 ↓
Driver receives digital receipt/status
 ↓
Accepted document reference becomes available to authorized FreightOS/carrier parties
```

If the facility itself issues the BOL, graph can begin with facility-generated draft → authorized office issuance → driver acknowledgement/copy.

## 6. Driver → receiving office destination graph

```text
Arrival/visit
 ↓
Driver presents BOL / delivery documents
 ↓
Receipt/hash/match
 ↓
Receiving-office validation
 ↓
Unload/inspection workflow
 ↓
Goods receipt / discrepancy decision
 ↓
POD / receiving acknowledgement where applicable
 ↓
Authorized digital copy/status to driver/carrier/shipper
```

BOL presentation is separate from receiving acceptance.

## 7. Extraction

OCR/AI may extract:
- BOL number
- shipper
- consignee
- carrier
- pickup/delivery refs
- PO numbers
- seal
- commodity descriptions
- pieces/handling units
- weight
- special instructions.

Extraction is untrusted until validated by deterministic checks and/or authorized review.

Never silently overwrite the original.

## 8. Matching

Candidate match may use:
- BOL number
- shipment/load number
- appointment
- PO
- carrier
- trailer
- seal
- shipper/consignee
- facility
- date/time.

Ambiguous match = HOLD/REVIEW.

Do not attach a BOL to the "closest" load when identity is uncertain.

## 9. Signatures/acknowledgements

Capture:
- signer identity/role where verified
- timestamp
- exact document version
- context/action
- signature/evidence method
- device/session assurance
- policy version.

A captured scribble alone is not authority.

## 10. Physical paper

Office can scan/capture:
- who received paper
- time
- document hash/image
- paper returned/retained/copy given
- any handwritten exceptions.

## 11. Duplicate/supersession

Duplicate hash:
- link to existing record, do not create conflicting truth.

New version:
- preserve prior;
- create explicit supersession;
- require re-review if material fields changed.

## 12. Security

- malware scan
- file type/size limits
- no active document content execution
- OCR sandbox
- PII/data classification
- authorization on download
- watermark/share policy where configured
- immutable audit.

## 13. Events

Examples:
- `transport_document.expected`
- `transport_document.received`
- `transport_document.matched`
- `transport_document.correction_requested`
- `transport_document.accepted_for_operational_use`
- `transport_document.rejected`
- `transport_document.superseded`
- `bol.presented`
- `bol.office_acknowledged`

These events never imply custody/goods receipt unless a separate corresponding governed event exists.


---

<!-- SOURCE: 07_SHIPPING_ORIGIN_OPERATIONS.md -->

# 07 — Shipping / Origin Operations

## Graph

```text
Order / shipment requirement
 ↓
Inventory/cargo readiness
 ↓
Appointment
 ↓
Pre-arrival documents/credentials
 ↓
Vehicle arrival
 ↓
Gate/staging/dock
 ↓
Shipping-office verification
 ↓
BOL/document readiness
 ↓
Load workflow
 ↓
Seal/condition/evidence
 ↓
Authorized custody transition
 ↓
Release/departure
 ↓
FreightOS departure event
```

## Shipping-office work queue

May include:
- appointment reference
- carrier/driver/vehicle
- order/load number
- BOL status
- pickup numbers
- missing docs
- load readiness
- seal
- exceptions
- release status.

## BOL scenarios

- shipper-generated BOL
- carrier-provided BOL
- paper BOL
- EDI/API BOL
- corrected/reissued BOL
- multi-stop/multi-order association.

## Release

FacilityOS may coordinate digital release only when:
- loading complete state is authoritative;
- required documents accepted;
- required custody evidence complete;
- facility hold absent;
- policy/authorized human permits release.

FacilityOS does not actuate gate hardware or physical vehicle motion.


---

<!-- SOURCE: 08_RECEIVING_DESTINATION_OPERATIONS.md -->

# 08 — Receiving / Destination Operations

## Graph

```text
Inbound notice / appointment
 ↓
ETA + receiving readiness
 ↓
Pre-arrival docs
 ↓
Arrival/check-in
 ↓
BOL presentation
 ↓
Gate/staging/dock
 ↓
Unload
 ↓
Inspection / count / condition
 ↓
Goods receipt OR discrepancy/rejection
 ↓
POD/receiving evidence
 ↓
Custody state
 ↓
Departure
 ↓
FreightOS / ERP-WMS reconciliation
```

## Receiving office

Queue:
- appointment
- shipment/order/PO
- BOL
- carrier/driver/vehicle
- dock
- unload status
- expected vs observed
- discrepancy
- receiving disposition.

## Goods receipt

Must reference:
- authoritative receiving actor/system
- handling units/quantities
- time
- facility
- evidence
- discrepancy state
- source WMS/ERP transaction if external system authoritative.

## POD

POD is a document/evidence artifact linked to receipt/delivery state.

Do not make "signed BOL" and "POD" universally synonymous; tenant workflows may differ.

## Partial/rejected receipt

Model explicitly:
- received full
- received partial
- shortage
- overage
- damage
- rejected
- quarantined/quality hold
- unknown pending inspection.

Downstream FreightOS/shipper/carrier must receive authorized status without exposing unrelated facility data.


---

<!-- SOURCE: 09_GATE_YARD_DOCK_ORCHESTRATION.md -->

# 09 — Gate, Yard, and Dock Orchestration

## Gate

Digital coordination:
- appointment/visit identity
- credential
- check-in
- restrictions
- required documents
- queue/staging destination.

No barrier/door/PLC actuation by general FacilityOS agent.

## Yard

Track:
- staging zones
- trailer/vehicle position as authorized
- queue state
- drop/live status
- dock readiness
- yard tasks as digital work objects.

Optimization may recommend moves.
Authorized humans/certified yard systems control physical execution.

## Dock

Track:
- dock capability
- assignment target
- readiness
- service start/end
- occupancy
- cargo/equipment restrictions
- loading/unloading queue.

## Conflict prevention

Deterministically validate:
- double booking
- incompatible equipment/cargo
- closed dock
- hold
- stale readiness
- conflicting active visit.

## Facility target event

An assignment is an operational target, not a physical-motion command.

## Degraded operation

On YMS/access outage:
- preserve manual facility operation;
- disable unsafe automatic target/credential writes;
- capture events for later reconciliation;
- expose stale state.


---

<!-- SOURCE: 10_CUSTODY_EVIDENCE_AND_TRACEABILITY.md -->

# 10 — Custody, Evidence, and Traceability

## Custody

Custody is explicit domain state with:
- from party
- to party
- shipment/consignment/handling unit
- location
- time
- authorized actors
- evidence
- conditions
- policy
- disputes.

## Evidence

May include:
- BOL/document version
- signature
- seal
- scan
- barcode/RFID
- photo
- sensor observation
- WMS transaction
- gate/visit event
- inspection.

## Separation

Events:
- shipping
- loading complete
- custody transfer
- departure
- receiving
- accepting
may be related but are not the same.

## EPCIS mapping

Where a customer uses GS1 EPCIS/CBV, map canonical events to appropriate shipping/receiving/handling-unit visibility events.

Standards messages remain interoperability representations, not the sole source of truth.

## Chain

Every evidence object has:
- origin
- hash
- time
- capture identity/device/system
- transformation history
- access classification
- associated business state.

## Dispute

Never rewrite historical custody.
Create disputed/superseding state and preserve evidence.


---

<!-- SOURCE: 11_APPOINTMENTS_CAPACITY_AND_DETENTION.md -->

# 11 — Appointments, Capacity, and Detention

## Appointment

Versioned commitment:
- parties
- facility
- shipment/work
- window
- service type
- equipment
- requirements
- status
- source
- revision history.

## Capacity

FacilityOS can model:
- dock capability/availability
- operating calendar
- yard/staging capacity
- service duration distributions
- receiving/shipping capacity signals
- external labor/resource availability summaries.

Forecasts are not authoritative capacity unless policy says how they are used.

## Appointment automation

Policy-bounded:
- suggest
- accept
- reschedule
- reject
depending autonomy certification.

Always propagate downstream impact to FreightOS.

## Detention

Clock inputs:
- appointment terms
- qualifying arrival
- check-in
- service start
- service complete
- release/departure
- holds/exclusions
- contract/policy.

Detention result must preserve:
- formula/policy version
- timestamps/evidence
- disputed periods.

AI cannot invent contractual free time.

## Driver visibility

Driver can see:
- qualifying recorded timestamps
- current visit state
- detention evidence status where authorized
without receiving unrelated commercial data.


---

<!-- SOURCE: 12_DISCREPANCY_EXCEPTION_AND_CLAIMS_EVIDENCE.md -->

# 12 — Discrepancy, Exception, and Claims Evidence

## Discrepancy types

- shortage
- overage
- damage
- seal mismatch
- temperature/condition
- wrong item
- missing document
- BOL mismatch
- PO/order mismatch
- appointment mismatch
- rejected cargo
- quality hold
- custody dispute.

## Graph

```text
Issue detected
 ↓
Capture evidence
 ↓
Classify
 ↓
Determine affected objects/parties
 ↓
Contain operational impact
 ↓
Authorized review
 ↓
Correct / accept with exception / reject / hold
 ↓
Network notification
 ↓
Reconciliation
```

## Claims boundary

FacilityOS can assemble evidence and initiate a governed claims/dispute workflow.

It does not adjudicate legal liability unless a separately governed authorized process exists.

## BOL mismatch

Never auto-edit original BOL.
Create:
- mismatch finding
- correction request
- corrected/superseding document
- office disposition.

## Downstream

FreightOS receives authorized exception facts needed to:
- update ETA/status
- protect evidence
- prepare accessorial/claim workflow
- inform carrier/shipper.


---

<!-- SOURCE: 13_INTEGRATIONS_AND_STANDARDS.md -->

# 13 — Facility Integrations and Standards

## Existing systems

FacilityOS should connect rather than initially replace:
- ERP
- WMS
- YMS
- WES
- TMS
- dock/appointment software
- access control
- document management
- email/SMS
- carrier portals
- EDI gateways
- label/barcode/RFID systems.

## Adapter contract

Every adapter declares:
- tenant/site
- external system
- auth
- authoritative fields
- canonical mappings
- read/write commands
- idempotency
- retries
- reconciliation
- outage behavior
- version support
- semantic loss
- conformance suite.

## Transportation documents

Support canonical mapping for:
- X12 211 Motor Carrier Bill of Lading where trading partners use it;
- X12 204/990/214/210 as relevant to surrounding carrier workflow;
- customer/vendor proprietary APIs.

## Facility/warehouse

Potential mappings:
- X12 163 appointment
- X12 940 warehouse shipping order
- X12 943 stock transfer shipment advice
- X12 944 stock transfer receipt advice
- X12 945 warehouse shipping advice
- X12 322 terminal/intermodal activity where relevant.

## Traceability

GS1 EPCIS/CBV is a preferred interoperability profile where item/handling-unit shipping/receiving/custody visibility is required.

## Legal-document caution

UCC Article 7 includes bills of lading/documents of title in U.S. commercial law and supports electronic-document concepts, but FacilityOS must not infer a document's legal status solely from file format or system label.

Jurisdiction/contract/legal configuration remains explicit.

## Mapping

AI may propose mapping.
Production mapping requires:
- schema validation
- deterministic transformation tests
- round trip where applicable
- customer/system-owner confirmation
- error/dead-letter handling.


---

<!-- SOURCE: 14_CUSTOMER_CONTROL_AND_EXPLAINABILITY.md -->

# 14 — Customer Control and Explainability

## Facility Operations Console

### What FacilityOS Understands
FOT assertions + evidence + confidence + status.

### Facility Map
Logical facility topology, systems and operational zones.

### Workflow Map
Each graph with steps, approvals, agents, side effects, exceptions.

### Agent Directory
Role, scope, tools, autonomy, evaluation, kill switch.

### Document/BOL Queue
Expected/received/matched/review/correction/accepted/superseded.

### Visit Board
Pre-arrival -> arrived -> gate -> staging -> dock -> service -> release -> departed.

### Shipping Office
Outbound work/doc/release queue.

### Receiving Office
Inbound BOL/receipt/discrepancy queue.

### Exception Center
Issues, owners, SLA, evidence, network impact.

## Explanation

For a consequential action show:
- current state
- FOT rules used
- authoritative sources
- hard constraints
- recommendation/action
- approval/autonomy
- side effect
- result/reconciliation.

Do not expose hidden chain-of-thought.

## Corrections

Customer corrections create versioned FOT/workflow changes and impact analysis.
Historical audit remains immutable.


---

<!-- SOURCE: 15_AUTONOMY_SHADOW_AND_CERTIFICATION.md -->

# 15 — Autonomy, Shadow, and Certification

## Levels

A0 Observe
A1 Recommend
A2 Prepare
A3 Approval-to-Execute
A4 Policy-Bounded Autonomy
A5 Exception-Supervised

## Facility examples

A1:
- dock recommendation
- readiness forecast.

A2:
- prepare appointment change
- draft driver instruction
- prepare BOL correction request.

A3:
- human approves exact appointment reschedule
- human approves document operational acceptance
- human approves credential issuance.

A4 candidate after proof:
- routine appointment acceptance
- routine notifications
- low-risk credential issuance
- non-safety-critical staging/dock target update
- standard document receipt acknowledgement.

Never A4 through this general agent plane:
- physical safety interlock
- industrial motion
- unauthorized custody/legal acceptance
- high-risk facility/safety hold release.

## Shadow

Compare to real facility decisions.

Measure:
- appointment decision agreement
- BOL matching/validation
- dock recommendation
- exception detection
- document correction accuracy
- receipt/discrepancy preparation
- escalation correctness.

## Promotion

Per:
tenant + site + workflow + action + scope.

## Downgrade

On:
- FOT drift
- system schema change
- unexplained overrides
- security incident
- reconciliation mismatch
- safety hold
- evaluation regression
- customer request.


---

<!-- SOURCE: 16_ENTERPRISE_SCALE_AND_MULTI_FACILITY.md -->

# 16 — Enterprise Scale and Multi-Facility Architecture

## Same logical product

Small site:
```text
Site
├── Shipping
├── Receiving
├── Gate
└── 4 docks
```

Enterprise:
```text
Enterprise
├── Region
│   ├── Campus
│   │   ├── Buildings
│   │   ├── Gates
│   │   ├── Yards
│   │   └── hundreds of docks
└── thousands of sites
```

Same canonical objects.

## Site/network hierarchy

Enterprise -> legal entity -> business unit -> region -> campus -> site -> building/zone -> gate/yard/dock.

## Deployment

- shared cell
- dedicated execution partition
- dedicated enterprise cell.

## Partition

Use:
tenant + site/region + workflow/visit.

Do not coordinate an entire global facility network through one model context.

## Policy inheritance

Enterprise default
→ region override
→ site override
→ workflow-specific rule

Every override is explicit/provenanced.

## Network operations

Central enterprise control can view permitted:
- throughput
- capacity
- appointment health
- dwell
- exceptions
- facility health.

Local command authority remains scoped.

## Scale evidence

Test declared tiers:
- sites
- visits/day
- appointment events/sec
- documents/day
- EPCIS/EDI events
- concurrent mobile driver sessions
- dock updates
- exception burst.

No scale marketing claim without measured test evidence.


---

<!-- SOURCE: 17_FREIGHTOS_NETWORK_COMMUNICATION.md -->

# 17 — FreightOS Network Communication

## Goal

FacilityOS is a network endpoint, not an isolated warehouse application.

## Carrier → Facility

Before arrival, authorized FreightOS/carrier agent may send:
- shipment/leg
- appointment reference
- carrier
- vehicle/equipment
- driver/operator credential
- ETA
- cargo/document requirements
- BOL/document reference
- exceptions.

## Facility → Carrier

FacilityOS may return authorized:
- appointment status
- facility readiness
- approach/gate instructions
- credential
- check-in status
- staging/dock target
- service status
- document request/status
- detention timestamps/evidence
- discrepancy
- departure/release state.

## Origin flow

```text
Shipper/ERP-WMS
 ↓
FacilityOS readiness
 ↓
Carrier/FreightOS appointment
 ↓
Driver arrival
 ↓
BOL ↔ Shipping Office
 ↓
Load/evidence/custody
 ↓
Departure
 ↓
FreightOS journey state
```

## Destination flow

```text
FreightOS ETA
 ↓
FacilityOS receiving readiness
 ↓
Driver arrival
 ↓
BOL → Receiving Office
 ↓
Unload/inspection
 ↓
Receipt/discrepancy/POD
 ↓
FreightOS + shipper/carrier
```

## Cross-party protocol

Use typed events/proposals/commands.
Free-form message cannot change appointment/custody/receipt/authority by itself.

## Network moat

Each facility integration increases the value of carrier-side FreightOS because shared canonical communication replaces repeated point-to-point human coordination.

Data rights and neutrality rules remain controlling.


---

<!-- SOURCE: 18_SECURITY_PRIVACY_AND_DATA_GOVERNANCE.md -->

# 18 — Security, Privacy, and Data Governance

## Tenant/site isolation

Every private object belongs to verified tenant/site scope.
Client-provided IDs are selectors, never authority.

## Driver data minimization

Collect only needed:
- identity/credential
- carrier
- visit
- contact/channel
- operational acknowledgement
- document submission.

Avoid unnecessary persistent precise location tracking.

## Documents

- encrypted storage
- access control
- malware scan
- content type validation
- immutable original
- hash
- retention
- audit
- signed URLs/short expiry
- no public buckets.

## OCR/model

Documents are untrusted.
Prompt injection from document content cannot alter tools/policy.

## Sensitive cargo

Hazmat, pharma, food, high-value, customs/security may require stricter capability packs and data access.

## Identity

Support enterprise workforce identity/SSO and workload identity.
Driver/visitor access can use scoped temporary credentials.

## Cross-party sharing

Share minimum authorized view/assertion.
Do not copy an entire facility record to every carrier.

## Audit

Consequential:
- document disposition
- appointment
- credential
- visit
- custody
- receipt
- discrepancy
- release
- external write
is attributable and reconstructable.

## Deletion/retention

Tenant policy/legal obligations control retention.
Deletion must not rewrite immutable required audit/evidence history; use appropriate retention/legal-hold semantics.


---

<!-- SOURCE: 19_OBSERVABILITY_AND_OUTCOMES.md -->

# 19 — Observability and Outcomes

## Technical

- API/event success
- queue lag
- adapter health
- dead letters
- replay
- auth latency
- document processing
- storage
- mobile session health.

## Visit

- appointment adherence
- gate dwell
- yard dwell
- dock dwell
- service duration
- total visit duration
- detention.

## Documents

- BOL expected-to-received
- auto-match rate
- false match
- correction rate
- office review time
- duplicate/supersession
- missing document at arrival.

## Shipping

- readiness forecast accuracy
- load start/complete
- release latency
- document completion.

## Receiving

- unload latency
- goods receipt latency
- discrepancy rate
- rejection/hold
- POD completion.

## Agents

- recommendation acceptance
- edit/override
- policy denial
- escalation
- autonomy downgrade
- unsupported claim
- side-effect reconciliation.

## Network

- carrier/facility message delivery
- pre-arrival issue resolution
- appointment changes propagated
- downstream exceptions prevented/surfaced.

## ROI

Customer savings/outcomes require baseline and measured methodology.
Do not invent labor/dwell savings.


---

<!-- SOURCE: 20_CUSTOMER_IMPLEMENTATION_AND_GO_LIVE.md -->

# 20 — Customer Implementation and Go-Live

## Productized implementation

### Phase 0 Scope
Site(s), workflows, outcomes, systems, security.

### Phase 1 Facility discovery
Build candidate FOT.

### Phase 2 Systems
Connect read-only ERP/WMS/YMS/TMS/docs/appointment sources.

### Phase 3 Workflow mapping
Shipping, receiving, appointment, visit, BOL, dock, custody, discrepancy.

### Phase 4 Agent organization
Instantiate canonical manifests.

### Phase 5 Shadow
Observe facility decisions and document flows.

### Phase 6 A3
Approval-to-execute selected actions.

### Phase 7 A4
Certified bounded actions.

### Phase 8 Network expansion
Connect carrier/shipper flows and more sites.

## Fast single-site onboarding

1. Create facility.
2. Define shipping/receiving offices.
3. Import gates/docks/hours.
4. Define appointment/driver rules.
5. Define BOL/document requirements.
6. Connect email/WMS/YMS/TMS if supported.
7. Test driver QR visit.
8. Test BOL submission.
9. Test office review.
10. Shadow visits.
11. Go live narrow scope.

## Enterprise

- SSO/security
- multi-site import
- data/system ownership
- regional policy inheritance
- EDI/API
- sandbox
- canary site/shift/carrier
- rollout waves.

## No big-bang

Start:
one site + one workflow + selected carriers/shift
then expand.


---

<!-- SOURCE: 21_ACCEPTANCE_GATES.md -->

# 21 — FacilityOS Acceptance Gates

FO-01 existing FreightOS/handoff non-regression
FO-02 Facility Operational Twin version/diff/provenance
FO-03 proposed FOT facts cannot authorize side effects
FO-04 agent manifest completeness
FO-05 typed durable workflow graphs
FO-06 deterministic policy choke point
FO-07 side-effect idempotency
FO-08 read-after-write/reconciliation
FO-09 tenant/site isolation
FO-10 driver scoped-access isolation
FO-11 document malware/content security
FO-12 immutable original + hash/version
FO-13 BOL duplicate/supersession behavior
FO-14 ambiguous BOL matching holds for review
FO-15 BOL acceptance does not imply custody
FO-16 BOL acceptance does not imply goods receipt
FO-17 shipping-office origin workflow
FO-18 receiving-office destination workflow
FO-19 paper BOL office-scan workflow
FO-20 poor-connectivity/manual fallback
FO-21 appointment conflict/revision
FO-22 gate/staging/dock isolation
FO-23 custody authorized evidence
FO-24 goods-receipt source-of-truth
FO-25 discrepancy/rejection workflow
FO-26 detention clock/evidence
FO-27 WMS/YMS outage/degraded mode
FO-28 duplicate/out-of-order EDI/EPCIS
FO-29 kill switches by tenant/site/workflow/agent/tool
FO-30 physical-control surface absent
FO-31 shadow certification before A3+
FO-32 autonomy downgrade
FO-33 customer explainability/correction
FO-34 cross-party minimal data view
FO-35 FreightOS network event conformance
FO-36 single-site fixture
FO-37 enterprise multi-site fixture
FO-38 load/scale proof for declared tier
FO-39 crash before/after external write
FO-40 backup/restore/rollback/evidence report

FAIL on FO-01 through FO-35 blocks affected production scope.


---

<!-- SOURCE: 22_IMPLEMENTATION_ROADMAP.md -->

# 22 — Implementation Roadmap

**Important:** this roadmap is architecture sequencing, not automatic authorization to bypass FreightOS horizon/module gates.

## Phase 0
Repository and existing facility-primitives gap analysis only.

## Phase 1 Contracts
- FOT
- facility agent manifest
- workflow graph
- TransportDocument/BOL
- VehicleVisit
- custody/receipt/discrepancy
- capability/adapter contracts.

## Phase 2 FOT
- persistence
- version/diff
- customer review
- system-of-record map.

## Phase 3 Driver/Visit Foundation
- scoped visit credential
- mobile web/QR
- visit state
- manual fallback.

## Phase 4 BOL/Document Exchange
- immutable document store
- driver submit
- office scan
- extraction/matching
- office queue
- correction/supersession
- receipts.

## Phase 5 Shipping/Receiving
- office work queues
- load/unload
- receipt/discrepancy
- custody evidence.

## Phase 6 Appointment/Gate/Yard/Dock
- typed graphs
- conflict checks
- targets
- detention.

## Phase 7 Agent Organization + Shadow
- manifests
- context assembly
- evaluations.

## Phase 8 Approval-to-Execute
- selected non-safety side effects.

## Phase 9 Policy-Bounded Autonomy
- certified low-risk actions only.

## Phase 10 Enterprise Network
- hierarchy
- multi-site
- cells
- enterprise policy inheritance
- large-scale EDI/event processing.

## Phase 11 FreightOS Network Expansion
- standardized carrier/facility communication
- cross-party conformance
- broader participant rollout.


---

<!-- SOURCE: 23_CLAUDE_MASTER_IMPLEMENTATION_PROMPT.md -->

# 23 — Claude Master Implementation Prompt

You are the senior principal engineer, facility systems architect, enterprise agent architect, security/reliability engineer, and logistics network architect responsible for integrating the FacilityOS Enterprise Agent Operations Handoff v1.0.0 into the existing FreightOS/RIG architecture.

## Relationship

This is additive architecture.

Read:
- current FreightOS production handoff;
- sequencing/module-state rules;
- v1.3 security/resilience;
- v1.4 network architecture;
- v1.5 enterprise agent operations;
- this entire FacilityOS package.

Do not edit existing accepted handoff files merely to install this package.

Do not interpret this package as automatic authorization to activate Full FacilityOS. Existing module-state/promotion gates remain controlling.

## Strategic objective

FacilityOS must eventually be a sellable/replicable enterprise facility operating layer that can understand a customer's site(s), be understood/corrected by the customer, and safely automate digital facility workflows while connecting those workflows to FreightOS carrier/shipper operations.

A driver's BOL submission to shipping/receiving is first-class scope.

## Immediate assignment — Phase 0 only

Create a new branch.

Inspect, do not broadly implement.

### Inspect

1. branch/HEAD/tree
2. existing Facility/Appointment/VehicleVisit primitives
3. shipping/receiving domain
4. documents/current BOL model if any
5. custody/goods receipt/discrepancy
6. gate/yard/dock
7. detention
8. APIs/webhooks/email/EDI
9. X12/EPCIS mappings
10. identity/temporary driver access
11. object storage/document security
12. agent manifests
13. workflow engine/checkpointing
14. side-effect gateway/idempotency
15. FreightOS network events
16. WMS/YMS/TMS integration boundaries
17. module-state/sequencing restrictions
18. tests/CI/deployment.

### Produce Phase 0 artifacts

- current FacilityOS/facility-primitives architecture
- FOT gap analysis
- facility agent gap
- workflow graph inventory
- BOL/document gap analysis
- driver-to-office workflow gap
- shipping origin gap
- receiving destination gap
- custody/receipt gap
- facility integration/standards map
- FO-01..FO-40 matrix
- repository-specific PR sequence
- owner decisions.

### Prohibitions

Do not:
- enable standalone Full FacilityOS;
- run production migrations;
- enable new live facility writes;
- change permissions;
- expose secrets/customer data;
- enable industrial/vehicle physical control;
- modify earlier handoff content;
- adopt a new framework merely to match this document;
- claim implementation from documentation;
- merge/deploy.

## Completion report

Return:
1. branch/HEAD/tree
2. exact files created/changed
3. proof existing handoffs unchanged
4. current architecture
5. FO gate matrix
6. gaps
7. PR plan
8. owner decisions
9. exact test/inspection commands
10. confirmation of zero production/live side effects.

Stop after Phase 0.


---

<!-- SOURCE: README.md -->

# RIG FacilityOS Enterprise Agent Operations Handoff v1.0.0

**Status:** additive production architecture / implementation-control package  
**Date:** 2026-08-14  
**Activation:** this package does not override the existing FreightOS sequencing doctrine. Full FacilityOS remains promotion/customer-gated until the controlling FreightOS gates explicitly authorize implementation.

## Purpose

FacilityOS is the governed operating system and network endpoint for physical logistics facilities.

It must allow:
- a small shipping/receiving operation;
- a single warehouse;
- a carrier terminal;
- a distribution center;
- a manufacturing shipping department;
- a port/ramp/terminal-adjacent operation;
- a large enterprise with thousands of facilities

to connect its current systems, teach FacilityOS how the location operates, inspect/correct that understanding, and progressively automate appointment, gate, yard, dock, shipping, receiving, document, BOL, custody, detention, discrepancy, and facility-communication workflows.

## Central architecture

```text
Canonical FacilityOS
        +
Facility Operational Twin
        +
Facility Agent Organization
        +
Typed Durable Workflow Graphs
        +
Facility Policies / Authority
        +
Integration Adapters
        +
Capability Packs
        ↓
Customer-specific facility operations
without customer-specific product forks
```

## Critical new first-class workflow

A driver's **Bill of Lading submission to a shipping or receiving office** is a governed document/evidence workflow, not a generic upload.

FacilityOS must support:
- pre-arrival document exchange;
- driver mobile submission;
- QR/scoped-link submission;
- office scan/manual capture;
- EDI/API ingestion where available;
- X12 211 mapping where applicable;
- document hashing/versioning;
- extraction and validation;
- shipment/appointment/visit correlation;
- shipping/receiving-office review;
- rejection/correction/supersession;
- signatures/acknowledgements as evidence;
- custody and goods-receipt state as separate governed transitions;
- digital copies/receipts to authorized parties;
- offline/manual degraded operation followed by reconciliation.

## Physical-safety boundary

FacilityOS may coordinate targets, queues, appointments, work, documents, credentials, and commercial/operational state.

It SHALL NOT directly control:
- forklifts;
- yard tractors;
- conveyors;
- cranes;
- AS/RS;
- dock restraints;
- doors;
- PLCs;
- safety interlocks;
- physical-motion systems.

## Existing-system posture

FacilityOS integrates with existing ERP/WMS/YMS/WES/TMS/access-control/document systems. Initial adoption must not require replacing them.

## Repository destination

```text
docs/production-handoff/facilityos/v1.0.0-enterprise-agent-operations/
```

## Read order

1. `00_MASTER_HANDOFF.md`
2. `01_FACILITYOS_CONSTITUTION.md`
3. `02_FACILITY_OPERATIONAL_TWIN.md`
4. `03_FACILITY_AGENT_ORGANIZATION_FACTORY.md`
5. `04_FACILITY_WORKFLOW_GRAPH_STANDARD.md`
6. `05_VEHICLE_VISIT_AND_DRIVER_EXPERIENCE.md`
7. `06_BOL_DOCUMENT_AND_OFFICE_EXCHANGE.md`
8. `07_SHIPPING_ORIGIN_OPERATIONS.md`
9. `08_RECEIVING_DESTINATION_OPERATIONS.md`
10. `09_GATE_YARD_DOCK_ORCHESTRATION.md`
11. `10_CUSTODY_EVIDENCE_AND_TRACEABILITY.md`
12. `11_APPOINTMENTS_CAPACITY_AND_DETENTION.md`
13. `12_DISCREPANCY_EXCEPTION_AND_CLAIMS_EVIDENCE.md`
14. `13_INTEGRATIONS_AND_STANDARDS.md`
15. `14_CUSTOMER_CONTROL_AND_EXPLAINABILITY.md`
16. `15_AUTONOMY_SHADOW_AND_CERTIFICATION.md`
17. `16_ENTERPRISE_SCALE_AND_MULTI_FACILITY.md`
18. `17_FREIGHTOS_NETWORK_COMMUNICATION.md`
19. `18_SECURITY_PRIVACY_AND_DATA_GOVERNANCE.md`
20. `19_OBSERVABILITY_AND_OUTCOMES.md`
21. `20_CUSTOMER_IMPLEMENTATION_AND_GO_LIVE.md`
22. `21_ACCEPTANCE_GATES.md`
23. `22_IMPLEMENTATION_ROADMAP.md`
24. `23_CLAUDE_MASTER_IMPLEMENTATION_PROMPT.md`
25. contracts, diagrams, templates, source registry.

## Non-regression

Do not modify earlier FreightOS or FacilityOS architecture files simply to install this package.


---

<!-- SOURCE: SOURCE_REGISTRY.md -->

# FacilityOS Source Registry

Revalidated 2026-08-14.

## Existing governing FreightOS sources
The controlling FreightOS handoffs remain authoritative for:
- tenant/security/authority
- canonical logistics model
- network events/commands
- facility domain boundaries
- physical-control prohibitions
- module sequencing.

## X12
- Transaction Sets: https://x12.org/products/transaction-sets
  - 211 Motor Carrier Bill of Lading
  - 204 Motor Carrier Load Tender
  - 210 Motor Carrier Freight Details and Invoice
  - 214 Transportation Carrier Shipment Status
  - 163 Transportation Appointment Schedule Information
  - 940/943/944/945 warehouse flows where applicable
  - 322 terminal/intermodal activity where applicable

## GS1
- EPCIS / CBV: https://www.gs1.org/standards/epcis
- EPCIS/CBV Implementation Guideline: https://ref.gs1.org/guidelines/epcis-cbv/
- Standards repository: https://ref.gs1.org/standards/

## U.S. commercial-document legal reference
- Uniform Commercial Code / Article 7: https://www.uniformlaws.org/acts/ucc

Legal treatment is jurisdiction/contract specific. Source presence does not authorize the software to make legal conclusions.


---

<!-- SOURCE: contracts/facility_agent_manifest.schema.json -->

{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "facilityos://schemas/agent-manifest/v1",
  "title": "FacilityAgentManifest",
  "type": "object",
  "required": [
    "agentId",
    "tenantId",
    "role",
    "manifestVersion",
    "scope",
    "tools",
    "commands",
    "policyVersion",
    "autonomy",
    "killSwitch"
  ],
  "properties": {
    "agentId": {
      "type": "string"
    },
    "tenantId": {
      "type": "string"
    },
    "siteIds": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "role": {
      "type": "string"
    },
    "manifestVersion": {
      "type": "string"
    },
    "scope": {
      "type": "object"
    },
    "tools": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "commands": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "policyVersion": {
      "type": "string"
    },
    "autonomy": {
      "type": "object"
    },
    "evaluationVersion": {
      "type": "string"
    },
    "killSwitch": {
      "type": "object"
    }
  },
  "additionalProperties": false
}


---

<!-- SOURCE: contracts/facility_graphs.yaml -->

version: 1.0.0
name: facilityos-enterprise-operations

invariants:
  - no_side_effect_bypasses_policy
  - no_document_implies_custody
  - no_bol_implies_goods_receipt
  - all_external_writes_idempotent_and_reconciled
  - no_physical_control_surface
  - driver_access_is_visit_scoped
  - original_documents_are_immutable
  - customer_specific_behavior_is_configuration_first

graphs:
  bol_submission:
    stages:
      - document_expected
      - driver_or_office_submit
      - server_receipt
      - malware_media_validation
      - immutable_hash
      - extract
      - match
      - deterministic_validation
      - office_review
      - accept_correct_reject
      - submitter_receipt
      - network_event

  vehicle_visit:
    stages:
      - pre_arrival
      - credential
      - arrival
      - check_in
      - document_gate
      - staging
      - dock
      - service
      - release
      - departure
      - reconcile

  shipping:
    stages:
      - cargo_readiness
      - appointment
      - pre_arrival
      - office_document_check
      - loading
      - seal_evidence
      - custody
      - release
      - departure

  receiving:
    stages:
      - inbound_notice
      - receiving_readiness
      - arrival
      - bol_presentation
      - unload
      - inspection
      - receipt_or_discrepancy
      - pod
      - departure

  facility_exception:
    stages:
      - detect
      - evidence
      - classify
      - contain
      - escalate
      - resolve
      - reconcile


---

<!-- SOURCE: contracts/facility_operational_twin.schema.json -->

{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "facilityos://schemas/facility-operational-twin/v1",
  "title": "FacilityOperationalTwin",
  "type": "object",
  "required": [
    "tenantId",
    "siteId",
    "version",
    "status",
    "topology",
    "systems",
    "policies",
    "assertions"
  ],
  "properties": {
    "tenantId": {
      "type": "string"
    },
    "siteId": {
      "type": "string"
    },
    "version": {
      "type": "string"
    },
    "status": {
      "enum": [
        "PROPOSED",
        "APPROVED",
        "DEPRECATED"
      ]
    },
    "topology": {
      "type": "object"
    },
    "roles": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "systems": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "policies": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "vocabulary": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "workflows": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "assertions": {
      "type": "array",
      "items": {
        "type": "object"
      }
    }
  },
  "additionalProperties": false
}


---

<!-- SOURCE: contracts/transport_document.schema.json -->

{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "facilityos://schemas/transport-document/v1",
  "title": "TransportDocument",
  "type": "object",
  "required": [
    "documentId",
    "tenantId",
    "documentType",
    "state",
    "receivedAt",
    "sourceChannel",
    "originalHash",
    "associations"
  ],
  "properties": {
    "documentId": {
      "type": "string"
    },
    "tenantId": {
      "type": "string"
    },
    "siteId": {
      "type": [
        "string",
        "null"
      ]
    },
    "documentType": {
      "enum": [
        "BOL",
        "POD",
        "RATE_CONFIRMATION",
        "PACKING_LIST",
        "RECEIVING_DOCUMENT",
        "OTHER"
      ]
    },
    "state": {
      "enum": [
        "EXPECTED",
        "RECEIVED",
        "MALWARE_SCAN_PASSED",
        "PARSED",
        "MATCH_CANDIDATE",
        "MATCHED",
        "VALIDATION_REQUIRED",
        "ACCEPTED_FOR_OPERATIONAL_USE",
        "CORRECTION_REQUESTED",
        "REJECTED",
        "SUPERSEDED",
        "VOIDED",
        "ARCHIVED"
      ]
    },
    "sourceChannel": {
      "enum": [
        "DRIVER_MOBILE",
        "DRIVER_SCOPED_WEB",
        "OFFICE_SCAN",
        "API",
        "EDI_X12_211",
        "EMAIL",
        "FREIGHTOS_REFERENCE",
        "EXTERNAL_PLATFORM"
      ]
    },
    "submittedBy": {
      "type": [
        "object",
        "null"
      ]
    },
    "capturedBy": {
      "type": [
        "object",
        "null"
      ]
    },
    "receivedAt": {
      "type": "string"
    },
    "originalObjectRef": {
      "type": "string"
    },
    "originalHash": {
      "type": "string"
    },
    "mimeType": {
      "type": "string"
    },
    "associations": {
      "type": "object"
    },
    "extractedFields": {
      "type": "object"
    },
    "validation": {
      "type": "object"
    },
    "officeDisposition": {
      "type": [
        "object",
        "null"
      ]
    },
    "signatureRefs": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "supersedes": {
      "type": [
        "string",
        "null"
      ]
    },
    "supersededBy": {
      "type": [
        "string",
        "null"
      ]
    },
    "dataClassification": {
      "type": "string"
    }
  },
  "additionalProperties": false
}


---

<!-- SOURCE: contracts/vehicle_visit.schema.json -->

{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "facilityos://schemas/vehicle-visit/v1",
  "title": "VehicleVisit",
  "type": "object",
  "required": [
    "visitId",
    "tenantId",
    "siteId",
    "state",
    "appointmentRef"
  ],
  "properties": {
    "visitId": {
      "type": "string"
    },
    "tenantId": {
      "type": "string"
    },
    "siteId": {
      "type": "string"
    },
    "appointmentRef": {
      "type": "string"
    },
    "shipmentRefs": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "carrierRef": {
      "type": [
        "string",
        "null"
      ]
    },
    "driverRef": {
      "type": [
        "string",
        "null"
      ]
    },
    "vehicleRef": {
      "type": [
        "string",
        "null"
      ]
    },
    "equipmentRefs": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "state": {
      "enum": [
        "PRE_ARRIVAL",
        "ARRIVED",
        "CHECKED_IN",
        "STAGING",
        "DOCK_ASSIGNED",
        "SERVICE_STARTED",
        "SERVICE_COMPLETED",
        "RELEASED",
        "DEPARTED",
        "CANCELLED",
        "EXCEPTION"
      ]
    },
    "credentialRef": {
      "type": [
        "string",
        "null"
      ]
    },
    "documentRefs": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "custodyRefs": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "receiptRefs": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "timestamps": {
      "type": "object"
    }
  },
  "additionalProperties": false
}


---

<!-- SOURCE: diagrams/01_facilityos_network.mmd -->

flowchart TB
  SHIP[Shipper / ERP / WMS] --> FOS[FacilityOS]
  FOS --> NET[FreightOS Network]
  NET --> CAR[Carrier Agent Organization]
  CAR --> DRIVER[Driver / RigDesk]
  DRIVER --> FOS
  FOS --> OFFICE[Shipping / Receiving Office]
  OFFICE --> DOC[BOL / Documents / Evidence]
  DOC --> FOS
  FOS --> GYD[Gate / Yard / Dock Digital Coordination]
  GYD --> WH[Existing WMS / YMS / WES]
  FOS --> NET


---

<!-- SOURCE: diagrams/02_bol_submission.mmd -->

flowchart TD
  A[BOL Required] --> B{Submission Channel}
  B --> C[Driver Mobile / QR]
  B --> D[Office Paper Scan]
  B --> E[API / EDI X12 211]
  C --> F[Server Receipt + Hash]
  D --> F
  E --> F
  F --> G[Security + Parse]
  G --> H[Shipment / Visit Match]
  H --> I{Unambiguous?}
  I -->|No| J[Office Review Hold]
  I -->|Yes| K[Policy Validation]
  K --> L[Shipping / Receiving Office Queue]
  J --> L
  L --> M{Disposition}
  M -->|Accept| N[Accepted for Operational Use]
  M -->|Correct| O[Correction Requested]
  M -->|Reject| P[Rejected]
  N --> Q[Receipt + Network Event]
  O --> B


---

<!-- SOURCE: diagrams/03_vehicle_visit.mmd -->

flowchart LR
  A[Pre-arrival] --> B[Arrival]
  B --> C[Check-in]
  C --> D[Document Gate]
  D --> E[Staging]
  E --> F[Dock]
  F --> G[Service]
  G --> H[Custody / Receipt Evidence]
  H --> I[Release]
  I --> J[Departure]


---

<!-- SOURCE: templates/bol_workflow_discovery.md -->

# BOL Workflow Discovery

## Site / workflow owner

## Origin or destination?

## Who normally creates the BOL?

## Who presents/submits it?

## Accepted channels
- paper
- email
- portal
- API
- EDI
- mobile/photo

## Required fields/references

## How is it matched to the shipment/order/appointment?

## Who may accept it for operational use?

## What makes it invalid or require correction?

## Signature/acknowledgement practice

## What copy does the driver/carrier receive?

## Does BOL acceptance affect:
- gate entry?
- loading?
- unloading?
- custody?
- goods receipt?
- release?
Document each separately.

## Systems of record

## Retention

## Exceptions

## Desired automation level
A0/A1/A2/A3/A4

## Shadow test set


---

<!-- SOURCE: templates/customer_go_live_checklist.md -->

# FacilityOS Customer Go-Live Checklist

- [ ] Facility Operational Twin approved
- [ ] Shipping/receiving offices mapped
- [ ] Systems of record approved
- [ ] Driver access tested
- [ ] BOL mobile submission tested
- [ ] Paper BOL office scan tested
- [ ] API/EDI BOL path tested if enabled
- [ ] Ambiguous BOL match holds
- [ ] Duplicate/supersession tested
- [ ] BOL does not imply custody
- [ ] BOL does not imply goods receipt
- [ ] Appointment revision tested
- [ ] Gate/staging/dock conflict tests pass
- [ ] Custody evidence tested
- [ ] Receipt/discrepancy tested
- [ ] Detention evidence tested
- [ ] WMS/YMS outage mode tested
- [ ] Cross-tenant/site access denied
- [ ] Kill switches tested
- [ ] Shadow evaluation passed
- [ ] A3/A4 grants recorded
- [ ] FreightOS network messages reconciled
- [ ] Rollback/restore tested
- [ ] Customer signoff recorded


---

<!-- SOURCE: templates/facility_intake.yaml -->

tenant:
site:
facility_type:
modes_supported: [road]

offices:
  shipping:
  receiving:

topology:
  gates: []
  staging_areas: []
  docks: []
  operational_zones: []

hours:
appointment_rules:
driver_instructions:
document_requirements:
  origin_bol:
  destination_bol:
  pod:
  other: []

systems:
  erp: []
  wms: []
  yms: []
  wes: []
  tms: []
  document_management: []
  edi: []

authority:
  appointment_approvers: []
  document_disposition_roles: []
  custody_roles: []
  goods_receipt_system_or_roles: []
  release_roles: []

autonomy_preferences:
  candidate_a4_actions: []
  always_human: []

exceptions:
  escalation: []
