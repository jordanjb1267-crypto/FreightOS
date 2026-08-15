# FreightOS Enterprise Agent Operations Handoff v1.5.0 — Combined Document

The individual files in this package are controlling for implementation use. This combined document is a convenience artifact. Existing FreightOS files were not modified.


---

<!-- SOURCE: 00_MASTER_HANDOFF.md -->

# 00 — FreightOS Enterprise Agent Operations Master Handoff

## 1. Executive mandate

FreightOS SHALL support rapid, governed deployment of a tenant-isolated agent organization into any logistics company without requiring the company to abandon its existing TMS, ERP, ELD, telematics, email, spreadsheets, maintenance systems, rail systems, ocean systems, or operating vocabulary.

The first commercial wedge SHOULD be **operations automation**:
- owner-operator back-office automation;
- dispatch preparation and dispatch orchestration;
- driver/asset coordination;
- document and exception handling;
- maintenance readiness;
- repair and roadside orchestration;
- settlement preparation and reconciliation;
- progressively autonomous carrier operations.

The same architecture MUST scale from one operator and one truck to enterprises controlling very large fleets and multimodal networks.

## 2. Customer-specific without customer forks

FreightOS MUST distinguish:

```text
Canonical FreightOS Product
        │
        ├── Tenant topology
        ├── Company Operational Twin
        ├── Workflow definitions
        ├── Agent manifests
        ├── Authority/autonomy grants
        ├── Integration adapters
        ├── Mode capability packs
        ├── Vocabulary mappings
        └── Customer policies
```

Customer-specific behavior MUST primarily be data/configuration/policy/workflow composition over versioned canonical capabilities.

A customer's SOP MUST NOT become a hidden prompt-only fork.

## 3. Company Operational Twin

Every production tenant receives a versioned, inspectable **Company Operational Twin (COT)** describing:
- organization and legal entities;
- business units, terminals, fleets, departments, regions;
- human roles and escalation owners;
- assets, capabilities, relationships, and operating modes;
- systems of record and integrations;
- dispatch models and shift structure;
- service and maintenance processes;
- document flows;
- operational vocabulary;
- customer SOPs and approval thresholds;
- decision policies;
- exception taxonomy;
- communication channels;
- regulatory/legal operating context;
- known uncertainties and unresolved mappings.

The customer can inspect, correct, approve, version, and diff this twin.

The COT is authoritative configuration only after explicit validation; model memory is never the source of truth.

## 4. Tenant Agent Organization

Each tenant receives an isolated agent organization generated from:
- tenant topology;
- enabled capability packs;
- workflows;
- COT;
- authority grants;
- autonomy certification;
- integrations;
- SLA/SLO class.

Agents do not gain authority from role names. Each agent uses a versioned manifest and deterministic policy authorization.

## 5. Operational graphs

FreightOS SHALL represent consequential automation as typed durable graphs.

Required graph families:
- company-discovery and configuration;
- dispatch;
- load/mission planning;
- tracking and execution;
- exceptions;
- documentation;
- communications;
- maintenance/repair/roadside;
- settlement/reconciliation;
- back office;
- customer approvals/escalations;
- agent evaluation;
- incident recovery.

A free-form multi-agent chat is not an operational graph.

## 6. Launch path

Recommended commercial deployment ladder:

### L0 — Connect + Understand
Map company, systems, workflows, terminology, permissions.

### L1 — Observe
Read-only operational intelligence.

### L2 — Prepare
Agents prepare actions, messages, plans, documents, assignments.

### L3 — Approval-to-Execute
Human approves exact bounded action; FreightOS executes and verifies.

### L4 — Policy-Bounded Autonomy
Selected low/medium-risk actions execute automatically inside approved policy.

### L5 — Exception-Supervised Operation
Humans primarily handle exceptions, strategic decisions, and high-risk actions.

Autonomy is granted per workflow/action, not as one blanket tenant switch.

## 7. Scale invariant

The logical workflow SHALL remain recognizable at every scale.

One truck:
```text
Owner
  ├── FreightOS Dispatcher/Back-Office Agent
  ├── Driver/Asset = owner + truck
  ├── one or few integrations
  └── owner approval
```

Large carrier:
```text
Enterprise
  ├── Regions
  │   ├── Terminals
  │   │   ├── Fleets
  │   │   ├── Dispatch pods
  │   │   └── service teams
  ├── Central planning
  ├── Network operations
  ├── Maintenance operations
  └── tenant agent organization sharded by scope
```

The platform scales topology and execution partitioning, not product semantics.

## 8. Multimodal invariant

Core state remains mode-neutral. Road, rail, ocean, and future mode packs define:
- capabilities;
- specialized entities;
- documents;
- events;
- workflows;
- constraints;
- connectors;
- terminology;
- evaluations.

## 9. Enterprise productization invariant

Every feature must be evaluated as though FreightOS may need to:
- sell it as SaaS;
- deploy it in a dedicated tenant/cell;
- integrate into an enterprise;
- support contractual SLOs;
- expose audited APIs;
- preserve customer data ownership;
- upgrade without customer forks;
- migrate configurations;
- demonstrate controls to security/procurement teams.

## 10. Existing control packages

This package does not supersede:
- zero-trust identity;
- structural tenant isolation;
- authority boundaries;
- event idempotency and reconciliation;
- security/resilience;
- network protocols;
- multimodal canonical domain model;
- audit/observability;
- regulated brokerage separation.

If a conflict appears, choose the stricter existing safety/security rule and escalate the architecture conflict explicitly.


---

<!-- SOURCE: 01_ENTERPRISE_AGENT_CONSTITUTION.md -->

# 01 — Enterprise Agent Constitution

## Article I — Agents are governed workloads

An agent is a versioned workload identity with:
- tenant;
- represented organization;
- purpose;
- domain role;
- tool allowlist;
- read scope;
- command scope;
- financial limits;
- geographic/mode scope;
- policy version;
- autonomy level;
- data-use policy;
- model/runtime version;
- evaluation version;
- effective/expiration times;
- kill switch.

An "agent persona" without these fields is not production-capable.

## Article II — No hidden authority

Prompts, retrieved documents, model confidence, customer urgency, prior conversation, or another agent cannot increase authority.

Only deterministic authorization and valid delegation grants can authorize consequential commands.

## Article III — Explainable company adaptation

A customer SHALL be able to answer:
- What does FreightOS believe our structure is?
- What systems does it believe are authoritative?
- What workflows is it automating?
- Which steps are AI vs deterministic?
- Which actions can each agent execute?
- When will it escalate?
- What evidence caused a decision?
- What changed since yesterday/version N?
- How do we correct its understanding?
- How do we stop it?

## Article IV — Progressive autonomy

Autonomy is earned by evidence.

Each workflow/action progresses independently:
`DISCOVER -> OBSERVE -> SHADOW -> PREPARE -> APPROVAL_EXECUTE -> POLICY_AUTONOMOUS -> EXCEPTION_SUPERVISED`

Regression, drift, policy changes, integration changes, incidents, or material workflow changes can automatically lower autonomy.

## Article V — Operational truth

System of record:
- transactional state;
- immutable/auditable events;
- signed/verified source records;
- approved company configuration.

Never authoritative:
- LLM memory;
- chat history;
- vector retrieval;
- model summary;
- unsupported inferred SOP;
- one person's undocumented assertion when company governance requires approval.

## Article VI — No customer forks

Customer differences live in versioned configuration and capability composition.

A code fork is allowed only for a separately governed product/regulated deployment decision, never as the default implementation shortcut.

## Article VII — Side-effect isolation

All consequential external writes pass through typed side-effect gateways:
- dispatch/assignment;
- communications;
- maintenance/service;
- booking/appointment;
- financial/settlement;
- document submission;
- external-system mutation.

Gateways enforce:
identity, tenancy, policy, current state, idempotency, approvals, retry classification, audit, reconciliation.

## Article VIII — Human command

Humans can:
- inspect;
- approve/reject;
- correct;
- constrain;
- pause;
- revoke;
- lower autonomy;
- roll back configuration;
- request explanation.

No UI control may silently bypass policy.

## Article IX — Multimodal neutrality

An agent role such as `MissionPlanner` is core.
Mode packs may specialize it as:
- road dispatch planner;
- rail movement planner;
- ocean voyage/container coordinator.

Core logic cannot assume "driver" where the universal concept is "operator/crew/controller" or "truck" where the concept is "transport means/equipment".

## Article X — Enterprise evidence

No production automation claim is complete without:
- tenant isolation proof;
- authority tests;
- shadow/evaluation evidence;
- workflow reconstruction;
- idempotency/reconciliation;
- failover/degraded-mode evidence;
- customer acceptance;
- kill-switch proof;
- rollback/version proof.


---

<!-- SOURCE: 02_COMPANY_OPERATIONAL_TWIN.md -->

# 02 — Company Operational Twin (COT)

## 1. Purpose

The COT is the customer-visible, versioned representation of how FreightOS understands the customer's operating model.

It is the bridge between:
- generic FreightOS capabilities;
- each company's actual organization and SOPs.

It prevents opaque "AI learned your business" behavior.

## 2. Twin domains

### Organization
- enterprise/legal entities
- operating authorities
- divisions/business units
- regions
- terminals
- departments
- dispatch desks/pods
- maintenance locations
- shifts/timezones

### People and roles
- roles, not only names
- responsibility scopes
- escalation chains
- approval powers
- on-call schedules
- separation-of-duty rules

### Assets/capacity
Mode-neutral assets plus pack-specific types:
- tractors/trailers
- railcars/locomotives
- containers/vessels/voyages
- facilities
- maintenance resources
- third-party capacity

### Systems
For every source/system:
- name
- purpose
- owner
- system-of-record fields
- read/write capability
- API/EDI/webhook/file/email/manual ingestion
- freshness expectations
- outage behavior
- credential class
- data classification

### Vocabulary
Map customer language to canonical FreightOS semantics.

Example:
```text
customer "planner" -> canonical `dispatch_planner`
customer "board" -> `active_assignment_read_model`
customer "breakdown" -> `asset_service_exception`
customer "load" -> may mean Shipment, TransportLeg, Tender, or Assignment
```

Ambiguous terms MUST remain unresolved until confirmed.

### SOPs
Each SOP is decomposed into:
- trigger
- inputs
- preconditions
- deterministic rules
- judgment steps
- approvals
- external side effects
- evidence
- deadlines
- exceptions
- escalation
- completion criteria

### Policies
Examples:
- load acceptance floor
- max deadhead
- equipment compatibility
- customer priority
- driver/home-time constraints
- maintenance stop conditions
- roadside authority thresholds
- repair spending thresholds
- detention escalation
- document deadlines
- communication policy

### Exceptions
Tenant-defined taxonomy mapped to canonical categories.

## 3. Acquisition pipeline

```text
Source Inventory
      ↓
Evidence Import
      ↓
Candidate Facts
      ↓
Normalization
      ↓
Conflict Detection
      ↓
Customer Review
      ↓
Approved Operational Twin
      ↓
Workflow/Agent Configuration
```

## 4. Sources

Possible inputs:
- structured intake;
- existing TMS/ERP/WMS/ELD/telematics/maintenance schemas;
- SOP documents;
- org charts;
- role descriptions;
- dispatch boards;
- email/message templates;
- EDI/API docs;
- sample redacted records;
- customer interviews/workshops;
- observed workflows in shadow mode.

Do not infer authority from documents alone.

## 5. Fact states

Every twin assertion:
- `PROPOSED`
- `VERIFIED`
- `APPROVED`
- `DISPUTED`
- `DEPRECATED`

Every assertion stores:
- source/evidence;
- confidence;
- reviewer/approver;
- effective period;
- canonical mapping;
- uncertainty;
- version.

## 6. Customer-visible diff

Before activating a new COT version, show:
- added facts;
- changed facts;
- removed/deprecated facts;
- workflows affected;
- autonomy grants affected;
- agent manifests affected;
- integrations affected;
- required re-evaluations.

## 7. Drift

Detect drift when:
- observed operations repeatedly disagree with COT;
- integration schema changes;
- company changes terminal/fleet/roles;
- new workflow appears;
- exception rate rises;
- approvals routinely override agent preparation.

Drift creates a review proposal. It does not silently rewrite policy.

## 8. Minimal one-truck COT

A one-truck onboarding may be:
- one legal entity;
- owner = dispatcher = driver = approver;
- one truck/trailer set;
- one email;
- one ELD/TMS/load-source integration or manual intake;
- one maintenance preference set;
- one document workflow;
- one approval authority.

Same schema, fewer nodes.

## 9. Mega-carrier COT

May include:
- hierarchy;
- thousands of assets;
- many systems;
- regional policy overlays;
- multiple dispatch models;
- union/contractual/operational rules where applicable;
- maintenance networks;
- multiple legal entities;
- per-region autonomy;
- high-volume event sources.

The twin MUST support scope inheritance plus explicit overrides and provenance.


---

<!-- SOURCE: 03_TENANT_AGENT_ORGANIZATION_FACTORY.md -->

# 03 — Tenant Agent Organization Factory

## 1. Goal

Instantiate a customer-specific agent organization from canonical manifests instead of hand-building agents per customer.

## 2. Canonical roles

Core roles:
- Chief Operations Orchestrator
- Capacity/Resource Agent
- Opportunity/Work Intake Agent
- Profitability/Economics Agent
- Planning Agent
- Feasibility/Readiness Agent
- Dispatch/Assignment Agent
- Tracking/Execution Agent
- Communications Agent
- Exception Agent
- Documentation Agent
- Maintenance Readiness Agent
- Repair/Roadside Agent
- Settlement/Reconciliation Agent
- Compliance/Risk Agent
- Customer Configuration Steward

Optional mode-pack roles:
- Rail Interchange Agent
- Rail Equipment Agent
- Ocean Booking Agent
- Container/Port Agent
- Voyage/Transshipment Agent
- Facility/Yard Agent

## 3. Factory inputs

```yaml
tenant:
company_operational_twin_version:
enabled_capability_packs:
enabled_workflows:
autonomy_grants:
integration_bindings:
sla_profile:
region_cell_placement:
data_residency:
model_policy:
```

## 4. Factory output

For each instantiated role:
- agent instance ID
- manifest version
- tenant/scope
- capability pack
- allowed reads
- allowed proposal types
- allowed commands
- side-effect gateways
- budget/financial limits
- escalation target
- autonomy level per command
- evaluation suite
- model routing
- concurrency limits
- kill-switch membership

## 5. Small-customer composition

Roles MAY collapse into fewer runtime workers for efficiency, but logical duties remain separately governed.

Example:
```text
One-Truck Operations Agent
  logical capabilities:
    dispatch preparation
    documents
    communications
    maintenance reminders
    roadside preparation
    back-office reconciliation
```

The runtime may be one worker; the policy manifests remain distinct.

## 6. Large-enterprise composition

Roles are partitioned by:
- enterprise/business unit
- region
- terminal
- dispatch pod
- fleet
- mode
- workflow class

Example:
```text
Chief Orchestrator
├── Central Planning
├── East Region
│   ├── Terminal A Dispatch
│   ├── Terminal B Dispatch
│   └── East Maintenance
└── West Region
```

Global agents cannot automatically inherit local command authority.

## 7. Context assembly

Context is assembled per task from:
1. verified identity/tenant;
2. relevant COT scope;
3. current authoritative operational state;
4. workflow definition;
5. policy/authority;
6. approved evidence;
7. limited relevant history.

Never inject the entire tenant data set into every prompt.

## 8. Agent-to-agent protocol

Agents exchange typed:
- observation
- request
- proposal
- approval request
- command request
- result
- escalation

Agent-to-agent communication cannot execute a command by itself.

## 9. Versioning

Changing:
- manifest
- tool
- model
- COT behavior
- workflow
- policy
- mode pack
requires impact analysis and potentially re-certification.

## 10. Commercial replication

A new customer deployment should require:
- tenant creation;
- COT discovery;
- integration binding;
- capability selection;
- workflow mapping;
- shadow certification;
- autonomy grants.

It should not require rewriting canonical agents.


---

<!-- SOURCE: 04_ADAPTIVE_WORKFLOW_GRAPH_RUNTIME.md -->

# 04 — Adaptive Workflow Graph Runtime

## 1. Principle

Every consequential automated business process is a versioned durable graph.

The graph is company-adaptable through data/configuration while preserving canonical node contracts.

## 2. Graph definition

Each workflow defines:
- workflow ID/version
- tenant
- capability pack
- trigger schema
- state schema
- nodes
- edges/conditions
- deadlines
- retry policy
- approval interrupts
- side-effect nodes
- compensations
- reconciliation
- terminal states
- degraded behavior
- evaluation suite

## 3. Node classes

### Deterministic
- auth
- tenancy
- policy
- arithmetic
- eligibility
- data validation
- state transition
- idempotency
- routing where rules suffice

### Intelligence
- classify
- summarize
- extract
- rank
- plan
- draft
- interpret ambiguity

### Human interrupt
- approve/reject
- correct
- select
- attest exception

### Side effect
- mutate TMS
- send message
- create assignment
- request roadside
- book appointment
- submit document
- financial instruction where authorized

### Verification/reconciliation
- read-after-write
- external ID confirmation
- business-state confirmation
- timeout/compensation

## 4. Canonical execution pattern

```text
Trigger
  ↓
Load authoritative state
  ↓
Validate tenant/identity
  ↓
Interpret/plan where needed
  ↓
Deterministic feasibility
  ↓
Policy/authority gate
  ↓
Approval interrupt if required
  ↓
Idempotency lock
  ↓
Side effect
  ↓
Verify external result
  ↓
Record event/evidence
  ↓
Reconcile
  ↓
Next node / terminal
```

## 5. Company adaptation

Do not alter graph safety structure per customer.

Customer configuration may control:
- thresholds
- routing targets
- escalations
- office hours
- preferred vendors
- acceptable modes
- asset pools
- approval owners
- communication templates
- operational priorities
- side-effect adapter binding.

A customer cannot configure away constitutional security gates.

## 6. Durable execution

Graph runtime must survive:
- process restart
- worker loss
- provider outage
- integration timeout
- duplicate event
- delayed approval
- failover to another worker/cell where supported.

Checkpoints occur before and after external side effects.

## 7. Exactly-once business effect

Transport may be at-least-once.
Business effect must be idempotent/reconcilable.

Idempotency key should bind:
tenant + workflow + command + resource + relevant version.

## 8. Deadlines

Every consequential graph declares:
- SLA
- decision deadline
- command deadline
- approval expiration
- retry budget
- escalation deadline.

No infinite autonomous loop.

## 9. Graph introspection

Customer/operator can inspect:
- current node
- why it is there
- evidence
- pending approval
- next possible actions
- authority
- elapsed time
- failures
- replay/recovery status.

## 10. Graph mutation tests

CI must fail if:
- side effect can bypass policy;
- a new edge bypasses approval;
- a retry loop is unbounded;
- a graph lacks terminal states;
- a command lacks idempotency;
- tenant context can be client-supplied without verification;
- intelligence output directly becomes authority.


---

<!-- SOURCE: 05_UNIVERSAL_DISPATCH_ORCHESTRATION.md -->

# 05 — Universal Dispatch Orchestration

## 1. Objective

Dispatch is the initial commercial wedge because every carrier must continuously turn demand/capacity/constraints into executable assignments.

FreightOS SHALL support:
- one-person dispatch;
- centralized dispatch;
- terminal dispatch;
- regional dispatch;
- driver-manager model;
- planning + dispatch split;
- relay/team operations;
- mode-specific planning through capability packs.

## 2. Universal dispatch graph

```text
Work / shipment / movement demand
        ↓
Normalize + validate
        ↓
Determine operating/legal context
        ↓
Discover eligible capacity/resources
        ↓
Feasibility/readiness
        ↓
Economics / priority / service scoring
        ↓
Candidate plans
        ↓
Policy constraints
        ↓
Human approval OR autonomous authorization
        ↓
Assignment/tender/booking command
        ↓
Counterparty/operator acknowledgement
        ↓
Execution monitoring
        ↓
Exception graph
        ↓
Completion + document/evidence
        ↓
Post-operation reconciliation
```

## 3. Road specialization

May include:
- driver availability
- tractor/trailer compatibility
- HOS/ELD-derived constraints through governed adapters
- home-time/preferences
- appointment windows
- deadhead
- maintenance readiness
- cargo/equipment requirements
- terminal/customer rules
- roadside status.

No model may invent HOS legality or override deterministic/compliance data.

## 4. Scale

### One truck
FreightOS may:
- ingest load/work;
- calculate feasibility/economics;
- draft/prepare confirmation;
- schedule reminders;
- handle check calls/status;
- chase documents;
- prepare invoice/back office;
- coordinate maintenance/roadside subject to policy.

The owner remains one human role with many responsibilities.

### 100 trucks
Partition by dispatch desk/fleet and use one chief orchestrator.

### 10,000+ assets
Use regional/cell partitioning, central planning/read models, event-driven coordination, and scoped agent workers.

No global model prompt coordinates every asset.

## 5. Assignment policy

Inputs may include:
- eligibility
- service commitments
- profitability
- asset readiness
- driver/crew constraints
- customer priority
- dwell and route risk
- operational balance
- repositioning
- home-time
- maintenance need
- predicted exception risk.

Every factor:
- has purpose;
- is versioned;
- can be explained;
- cannot use prohibited/discriminatory attributes;
- is evaluated for drift.

## 6. Human understanding

For each recommendation/assignment display:
- proposed move;
- why;
- considered alternatives;
- hard constraints;
- soft factors;
- economics where authorized;
- readiness;
- customer/company rules used;
- confidence/uncertainty;
- required approval;
- what FreightOS will do next.

## 7. Exception graph

Canonical exception families:
- late/missed appointment
- no capacity
- driver/crew unavailable
- equipment fault
- breakdown
- weather/route
- facility delay
- document issue
- customer change
- rejection/refusal
- integration failure
- safety/compliance
- financial/authorization issue.

Each tenant maps local terms to these families.

## 8. No blanket autonomy

A tenant may have:
- automatic routine status messages;
- approval-required reassignment;
- autonomous assignment only inside one terminal;
- manual high-value customer movements;
- emergency roadside auto-request under capped policy.

Autonomy is granular.


---

<!-- SOURCE: 06_BACK_OFFICE_AUTOMATION.md -->

# 06 — Back-Office Automation

## 1. Goal

FreightOS must deliver immediate value even to a one-truck owner by removing repetitive administrative work while the driver/operator remains focused on operating.

## 2. Workflow families

### Intake
- load/order ingestion
- confirmation/document extraction
- customer requirement extraction
- appointment capture
- contact/communication normalization

### Trip/mission setup
- create canonical shipment/journey/leg
- task/deadline creation
- required-document checklist
- operational contact map

### Communication
- approved check-call/status updates
- ETA requests/updates
- appointment messages
- exception escalation drafts/sends
- document requests

### Documentation
- BOL/POD/receipts/rate confirmation capture
- classification
- shipment association
- missing-document detection
- evidence/versioning
- submission preparation

### Billing preparation
- completed-work validation
- rate/contract evidence
- accessorial evidence
- invoice packet preparation
- accounting export/integration
- discrepancy queue

### Reconciliation
- expected vs actual
- missing payment status
- short-pay/discrepancy detection
- issue evidence bundle

### Administrative
- permit/credential reminders where in scope
- maintenance reminders
- recurring business checklist
- customer-specific compliance tasks

## 3. One-truck default pack

Provide a minimal preset:
`OwnerOperatorBackOfficePack`

Configured through:
- preferred email
- load source(s)
- document storage
- accounting destination
- status preferences
- maintenance preferences
- approval policy.

No complex enterprise setup required.

## 4. Enterprise back office

For a large customer:
- queues partition by business unit;
- shared services may centralize billing/document functions;
- role-based escalations;
- bulk EDI/API ingestion;
- exception dashboards;
- segregation of duties;
- audit and SLA.

## 5. Never auto-assume

Do not infer:
- payment destination
- banking details
- tax classification
- legal authority
- customer contract term
- credential validity
from conversational text alone.

## 6. Customer benefit telemetry

Track:
- manual touches avoided
- document cycle time
- missing-document rate
- billing-prep latency
- reconciliation exceptions
- human approval time
- correction rate.

Do not claim labor savings without measured tenant evidence.


---

<!-- SOURCE: 07_MAINTENANCE_REPAIR_ROADSIDE.md -->

# 07 — Maintenance, Repair, and Roadside Operations

## 1. Purpose

Maintenance/repair/roadside is a first-class operational graph because asset readiness directly affects dispatch and mission feasibility.

## 2. Readiness graph

Inputs:
- scheduled maintenance
- fault/diagnostic signals
- driver/operator report
- inspection state
- service history
- open repair order
- asset restrictions
- parts/service availability where known.

Output:
`READY | READY_WITH_CONDITION | NOT_READY | UNKNOWN`

Include:
- evidence
- freshness
- unresolved faults
- expiry
- policy version.

Never present as manufacturer/safety certification unless governed as such.

## 3. Repair graph

```text
Issue detected/reported
      ↓
Severity + immobilization classification
      ↓
Safety/emergency gate
      ↓
Asset/mission context
      ↓
Company repair policy
      ↓
Preferred/eligible provider discovery
      ↓
Estimate/availability request
      ↓
Approval threshold
      ↓
Service command
      ↓
Status tracking
      ↓
Completion evidence
      ↓
Readiness reassessment
      ↓
Dispatch impact / next mission
```

## 4. Roadside graph

Supports:
- breakdown
- tow
- tire
- fuel
- lockout/jump where relevant
- mobile repair
- emergency service escalation.

Critical controls:
- exact asset identity;
- safe location handling;
- approved provider policy;
- spending cap;
- driver/customer approval where required;
- ETA/status;
- cancellation;
- duplicate-request prevention;
- read-after-write confirmation;
- post-service evidence.

## 5. One-truck behavior

The owner may preconfigure:
- preferred service network;
- maximum auto-authorized roadside amount;
- actions always requiring approval;
- emergency contacts;
- towing preferences.

This lets FreightOS prepare or execute bounded assistance without requiring a fleet maintenance department.

## 6. Enterprise behavior

Large fleets may use:
- central maintenance control;
- regional shops;
- preferred-vendor contracts;
- warranty programs;
- PO thresholds;
- after-hours escalation;
- parts workflows;
- replacement/substitute equipment;
- dispatch re-planning.

## 7. Integration with RigDesk

Where RigDesk owns asset/service-provider UX or maintenance records, FreightOS uses governed APIs/events rather than duplicating system-of-record ownership.

FreightOS consumes readiness and orchestrates mission consequences; RigDesk may own detailed maintenance/provider operations according to the controlling ecosystem domain map.

## 8. Safety

AI does not diagnose safety-critical mechanical condition as a definitive certification.
Ambiguous high-risk conditions escalate.
Emergency services and roadside actions declare fail-safe/degraded behavior explicitly.


---

<!-- SOURCE: 08_MULTIMODAL_CAPABILITY_PACKS.md -->

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


---

<!-- SOURCE: 09_CUSTOMER_CONTROL_AND_EXPLAINABILITY.md -->

# 09 — Customer Control and Explainability

## 1. Product requirement

Enterprise adoption depends on trust. The customer must be able to understand and govern its FreightOS agent organization without reading source code.

## 2. Customer Operations Console

Required surfaces:

### Company Map
- org structure
- terminals/fleets
- systems
- assets/capability summary
- role/escalation map

### "What FreightOS Understands"
- COT facts
- evidence/source
- confidence
- status
- last verified
- corrections
- pending disputes

### Workflow Map
For every automated workflow:
- trigger
- steps
- agent nodes
- deterministic nodes
- approvals
- external actions
- exception routes
- system of record
- SLA
- autonomy level.

### Agent Directory
- role
- scope
- tools
- authority
- autonomy
- current version
- latest evaluation
- kill switch
- responsible human owner.

### Approval Center
- action
- why
- evidence
- impact
- exact side effects
- expiry
- alternatives.

### Operations Timeline
- event
- decision
- command
- result
- correction
- escalation
- human action.

## 3. Explanation contract

For consequential recommendations/actions, FreightOS should provide:
- objective
- input facts
- hard constraints
- company policies
- alternatives considered
- reason for selection
- uncertainty
- authorization path
- external side effect
- verification outcome.

Do not expose hidden chain-of-thought. Provide concise evidence-based decision rationale.

## 4. Customer corrections

Corrections create:
- proposed COT change
- impacted workflows
- impacted agent manifests
- re-evaluation requirements
- effective date.

Do not rewrite historical audit.

## 5. Setup simplicity

### One-truck
Wizard:
1. Who are you?
2. What equipment do you operate?
3. Where does work arrive?
4. How do you dispatch/accept work?
5. Where do documents go?
6. How do you handle maintenance/roadside?
7. What may FreightOS do automatically?
8. Connect accounts / test.
9. Run shadow day.
10. approve go-live.

### Enterprise
Workspace with:
- importers
- workshops
- API/EDI mapping
- SSO/SCIM where applicable
- role/authority workshops
- sandbox
- staged rollout by region/terminal/workflow.

Same conceptual artifacts; different implementation depth.


---

<!-- SOURCE: 10_AUTONOMY_CERTIFICATION_AND_SHADOW_MODE.md -->

# 10 — Autonomy Certification and Shadow Mode

## 1. Principle

Autonomy is a measured capability, not a subscription toggle.

## 2. Stages

### A0 Observe
Read-only.

### A1 Recommend
Produces recommendation/explanation.

### A2 Prepare
Creates draft action/document/message/plan but cannot execute.

### A3 Approval-to-Execute
Human approves exact side effect.

### A4 Policy-Bounded Autonomy
Executes listed actions inside explicit policy.

### A5 Exception-Supervised
Routine flow is autonomous; humans own exceptions/high-risk decisions.

## 3. Shadow certification

Before A3+:
- run workflow against real or representative events without external side effects;
- compare FreightOS output to human/operator outcome;
- measure agreement and error classes;
- require minimum sample;
- include edge cases;
- include integration failure;
- include stale/missing data;
- include conflict/exception;
- customer operations owner reviews.

## 4. Evaluation dimensions

- factual grounding
- system-of-record fidelity
- eligibility/feasibility correctness
- policy compliance
- assignment quality
- SLA timeliness
- exception detection
- escalation correctness
- communication quality
- side-effect correctness
- reconciliation
- customer override rate.

High aggregate accuracy cannot hide a safety/authority failure.

## 5. Promotion

Promotion record includes:
- tenant
- workflow
- command/action class
- scope
- evaluation version/results
- policy version
- approver
- limits
- expiration/review date.

## 6. Automatic downgrade

Downgrade/pause on:
- material policy change
- integration schema change
- COT drift
- evaluation regression
- security incident
- unexplained override spike
- side-effect mismatch
- stale authoritative data
- customer request.

## 7. Canary

Large enterprises:
- one workflow
- one terminal/fleet/region
- selected shift
- limited transaction count
before expansion.

## 8. One-truck fast path

Small customers need not endure enterprise bureaucracy, but safety gates remain.

Fast path:
- minimal COT
- connector test
- 1–3 day or sufficient-volume shadow
- owner confirms behavior
- approve narrow A3/A4 actions.

Autonomy never skips authority/idempotency/reconciliation.


---

<!-- SOURCE: 11_INTEGRATION_ADAPTER_AND_CONFORMANCE.md -->

# 11 — Integration Adapter and Conformance Architecture

## 1. Principle

FreightOS adapts to customer systems; it does not require wholesale replacement on day one.

## 2. Adapter types

- API
- webhook
- EDI X12/EDIFACT
- file/SFTP
- email ingestion
- event stream
- database CDC where approved
- manual import/export
- MCP/tool adapter over governed capabilities
- vendor-specific connectors.

## 3. Adapter contract

Every adapter declares:
- tenant
- external system
- direction
- authentication
- data classification
- canonical mappings
- semantic loss
- system-of-record fields
- read/write commands
- rate limits
- retries
- idempotency
- reconciliation
- outage behavior
- version support
- conformance tests.

## 4. System of record matrix

Per field/object, designate:
- FreightOS authoritative
- external authoritative
- shared/reconciled
- derived
- evidence only.

Conflict resolution is explicit.

## 5. Onboarding discovery

FreightOS should inspect available:
- schemas
- sample payloads
- API docs
- EDI implementation guides
- webhook catalogs
- export formats.

AI may propose mappings.
Mappings require deterministic validation and customer/system-owner confirmation before production writes.

## 6. Sandbox first

Before production:
- auth/connectivity
- fixtures
- mapping round trip
- duplicate
- out-of-order
- missing field
- invalid enum
- retry
- timeout
- schema version
- write confirmation
- reconciliation
- access revocation.

## 7. Connector isolation

Connector workers have least privilege.
A compromised connector cannot grant broader tenant authority or access unrelated tenant data.

## 8. Upgrade

Vendor/customer integration change:
- detect
- mark compatibility state
- test new version
- canary
- migrate
- preserve rollback
- re-certify affected workflows.


---

<!-- SOURCE: 12_ENTERPRISE_SCALE_AND_CELL_ARCHITECTURE.md -->

# 12 — Enterprise Scale and Cell Architecture

## 1. One logical product

Scale must not split FreightOS into "SMB version" and "enterprise rewrite."

## 2. Tenant topology

```text
Enterprise
└── Legal Entity
    └── Operating Authority / Legal Plane
        └── Business Unit
            └── Region
                └── Terminal / Facility
                    └── Fleet / Operations Group
                        └── Asset / Human / Agent scope
```

Smaller tenants simply have fewer levels.

## 3. Placement tiers

### Shared cell
Small/medium tenants with structural logical isolation.

### Dedicated execution partition
High-volume tenant/region with dedicated workers/queues.

### Dedicated cell
Strategic/regulatory/performance tenant:
- database
- queues
- encryption boundaries
- workers
- regional placement
as required.

Canonical APIs/contracts remain consistent.

## 4. Partition keys

Operational processing should partition by stable domain scope such as:
tenant + operating unit / region / workflow / asset group.

Do not use one global agent context or one unbounded queue for all customers.

## 5. Control vs data

Global/control plane:
- identity metadata
- policy versions
- schema/catalog
- deployment/config
- conformance.

Operational cells:
- active workflow data
- tenant state
- command execution
- local last-known-good policy
- relevant COT subset.

Avoid synchronous global dependency on every dispatch step.

## 6. High-volume principles

- event-driven
- bounded batch sizes
- partition-aware queues
- backpressure
- tenant quotas
- fairness
- hot-partition detection
- idempotent consumers
- replay
- DLQ
- read models
- horizontal worker scale.

## 7. Capacity

Do not claim "one million trucks" from architecture diagrams.
Establish:
- workload model
- events per asset/day
- dispatch decisions/sec
- connector calls/sec
- document throughput
- storage growth
- peak ratios
- SLO
and prove load tests in staged tiers.

## 8. Noisy-neighbor controls

Per tenant/cell:
- compute
- queues
- connector concurrency
- model budget
- storage/retention
- rate limits.

## 9. Data residency

Customer/regulatory needs may constrain placement.
Residency policy is explicit and testable, not inferred from company address.


---

<!-- SOURCE: 13_KNOWLEDGE_MEMORY_AND_DATA_GOVERNANCE.md -->

# 13 — Knowledge, Memory, and Data Governance

## 1. Four layers

### Authoritative operational state
Transactional DB + governed external systems.

### Company Operational Twin
Approved tenant configuration/semantics.

### Evidence/knowledge
Documents, SOPs, integration docs, contracts where allowed.

### Agent working memory
Task-local derived context.

Only the first two can directly drive deterministic authorization inputs.

## 2. Retrieval

Retrieval must:
- enforce tenant/role/data-classification;
- preserve source;
- preserve version;
- preserve freshness;
- return evidence IDs;
- treat content as data, not instruction.

## 3. Prompt injection

External:
- email
- document
- EDI free text
- webpage
- vendor message
is untrusted data.

It cannot:
- alter tools;
- elevate authority;
- modify system prompt/policy;
- expose secrets;
- cause external side effect without workflow gate.

## 4. Memory

Agent memory:
- tenant-scoped
- purpose-limited
- retention-bound
- correctable
- non-authoritative.

Do not create persistent "personal memories" about employees beyond defined operational need.

## 5. Model providers

Enterprise tenant policy can control:
- approved provider
- region
- data retention
- training use
- model class
- cost limits
- fallback.

No customer data may be used for generalized model training without explicit contractual permission.

## 6. Cross-tenant learning

Allowed:
- product-level aggregate improvement using permitted, de-identified/non-sensitive signals;
- generic evaluation fixtures.

Not allowed by default:
- revealing one customer's rates, routes, SOPs, customers, performance, or exceptions to another tenant;
- using a customer's proprietary content in another customer's prompt/context.

## 7. Semantic mapping memory

Proposed vocabulary/workflow mappings live as COT assertions, not opaque vector-only memory.

## 8. Data minimization

An agent receives only the smallest necessary slice:
tenant + task + policy + relevant state + relevant evidence.


---

<!-- SOURCE: 14_OBSERVABILITY_EVALUATION_AND_OUTCOMES.md -->

# 14 — Observability, Evaluation, and Customer Outcomes

## 1. Enterprise observability

Measure infrastructure + business correctness + agent behavior.

## 2. Workflow telemetry

For every graph:
- started
- completed
- failed
- escalated
- deadline miss
- retry
- approval latency
- side effect
- verification
- reconciliation drift
- compensation.

## 3. Agent telemetry

- proposal count
- accepted/rejected/edited
- override rate
- unsupported-claim rate
- tool errors
- policy denials
- escalation precision
- evaluation pass rate
- model/provider latency/cost.

## 4. Dispatch outcomes

- work intake-to-plan latency
- assignment latency
- unassigned aging
- late exceptions
- asset utilization where appropriate
- deadhead where applicable
- service-level misses
- planner/dispatcher manual touches
- correction/reassignment rate.

Do not optimize a metric in a way that harms safety, service, labor commitments, or customer policy.

## 5. Back-office outcomes

- document completion
- billing-prep time
- missing documents
- reconciliation exceptions
- manual touches
- exception aging.

## 6. Maintenance/roadside

- readiness freshness
- breakdown-to-provider-request
- provider acceptance
- ETA
- downtime
- duplicate service prevention
- dispatch re-plan latency.

## 7. Customer trust

- approval rate
- reason for rejection
- correction rate
- "understanding" disputes
- autonomy downgrades
- kill-switch events.

## 8. Evaluation registry

Every agent/workflow version points to:
- fixtures
- synthetic scenarios
- tenant-specific shadow set where allowed
- adversarial cases
- mutation tests
- current result.

## 9. Evidence reconstruction

For a consequential action, reconstruct:
identity -> COT -> state -> evidence -> agent proposal -> policy -> approval -> command -> external response -> reconciliation.

## 10. Commercial proof

Customer ROI claims require customer-specific measured baseline and methodology.
No generic "saves X dispatchers" claim without evidence.


---

<!-- SOURCE: 15_CUSTOMER_IMPLEMENTATION_AND_GO_LIVE.md -->

# 15 — Customer Implementation and Go-Live

## 1. Productized implementation

Goal: onboarding is repeatable professional services + automated discovery, not custom engineering.

## 2. Customer tiers

### Fast Start
Owner-operator / very small fleet.

### Standard
Small/medium fleet with common integrations.

### Enterprise
Complex hierarchy, SSO, many integrations, security/procurement.

### Strategic/Dedicated
Dedicated cell, residency, custom conformance, high scale.

## 3. Universal implementation sequence

### Phase 0 — Commercial/scope
- tenant/legal entity
- desired outcomes
- target workflow(s)
- operating mode(s)
- risk class
- data/security requirements.

### Phase 1 — Company discovery
- COT sources
- systems
- SOPs
- roles
- vocabulary
- topology
- policies.

### Phase 2 — Connectivity
- read-only connectors first
- map system-of-record
- fixture/conformance tests.

### Phase 3 — Workflow mapping
- map as-is
- map FreightOS target
- identify deterministic vs judgment steps
- exception paths.

### Phase 4 — Agent organization
- instantiate manifests
- scope tools/data
- configure escalation.

### Phase 5 — Shadow
- observe
- compare
- correct COT/workflows.

### Phase 6 — Approval-to-execute
- selected side effects
- read-after-write
- customer signoff.

### Phase 7 — Bounded autonomy
- independently certified actions.

### Phase 8 — Expand
- additional fleet/terminal/workflow/mode.

## 4. Fast Start target experience

The one-truck customer should be able to:
- create company
- describe operating model
- connect email/load source/documents/accounting where supported
- validate one cost/dispatch/document workflow
- run shadow
- approve selected automation
with minimal technical vocabulary.

## 5. Enterprise implementation artifacts

- COT
- source-of-truth matrix
- integration inventory
- data map
- workflow catalog
- agent manifest inventory
- authority matrix
- security review
- conformance results
- shadow report
- go-live approval
- rollback
- support/escalation.

## 6. Rollout

Never big-bang entire mega-carrier.

Prefer:
workflow -> terminal/fleet -> shift/region -> wider scope.

## 7. Customer success handoff

Operations team receives:
- system map
- dashboards
- runbooks
- approval responsibilities
- autonomy review dates
- incident path
- change process.


---

<!-- SOURCE: 16_ACCEPTANCE_GATES.md -->

# 16 — Acceptance Gates

## EA-01 Existing package non-regression
No prior FreightOS handoff file altered by installation of this package.

## EA-02 COT schema
Customer operational twin is versioned, inspectable, attributable, diffable.

## EA-03 COT authority
Unapproved/proposed twin assertions cannot silently grant command authority.

## EA-04 Agent manifest
Every production agent has tenant, scope, tools, authority, policy, version, kill switch.

## EA-05 Workflow graph
Every consequential automated workflow is typed/durable with terminal states.

## EA-06 Policy choke point
No external side-effect path can bypass deterministic policy.

## EA-07 Idempotency
Duplicate delivery produces one business effect.

## EA-08 Reconciliation
External mutation is read-back/reconciled.

## EA-09 Approval
Approval binds exact action/resource/version/expiry.

## EA-10 Shadow certification
A3+ workflow has shadow/evaluation evidence.

## EA-11 Autonomy downgrade
Drift/incident/config change can lower autonomy safely.

## EA-12 Customer explainability
Customer can inspect what FreightOS believes and correct it.

## EA-13 Tenant isolation
Cross-tenant state/memory/config/tool access denied structurally.

## EA-14 Integration conformance
Read/write adapters have mapping, failure, retry, replay tests.

## EA-15 One-truck fixture
Full Fast Start works for synthetic one-truck carrier.

## EA-16 Enterprise fixture
Hierarchical carrier fixture works across regions/terminals/fleets.

## EA-17 Multimodal fixture
Core can represent road + rail + ocean legs without schema fork.

## EA-18 Maintenance/roadside
Duplicate request, spend threshold, provider failure, and re-plan tested.

## EA-19 Back office
Document/billing/reconciliation workflow proven.

## EA-20 Dispatch
Observe -> shadow -> approval-execute dispatch flow proven.

## EA-21 Fail degraded
Intelligence outage does not erase already-authorized operational state.

## EA-22 Kill switch
Tenant/workflow/agent/tool-specific pause proven.

## EA-23 Crash recovery
Crash before/after external side effect resumes safely.

## EA-24 Scale
Load tests prove declared deployment tier; no unsupported scale claim.

## EA-25 Customer-fork prevention
Customer-specific behavior is configuration/adapter/policy unless an ADR explicitly approves code divergence.

## EA-26 Evidence
Release report includes SHA, tests, environment, deployment, known risks.

### Release vocabulary

- PASS
- PARTIAL
- FAIL
- NOT IMPLEMENTED
- NOT APPLICABLE with justification

A FAIL on EA-01 through EA-23 blocks production autonomy in affected scope.


---

<!-- SOURCE: 17_IMPLEMENTATION_ROADMAP.md -->

# 17 — Implementation Roadmap

This package is additive. Implementation sequence MUST be reconciled with the repository's current accepted migration/PR state before code changes.

## Phase 0 — Repository/COT gap analysis
PR-A1:
- inventory existing agent manifests
- workflow runtime
- tenant topology
- integrations
- autonomy gates
- current dispatch objects
- maintenance/roadside ownership
- audit/evidence
- existing v1.3/v1.4 controls
- map gaps to EA gates.

No runtime change.

## Phase 1 — Enterprise agent contracts
PR-A2:
- COT schema
- agent manifest schema
- capability pack schema
- workflow graph contract
- autonomy grant contract
- registries.

## Phase 2 — Company Operational Twin
PR-A3:
- persistence
- version/diff
- fact states
- customer review
- source/evidence
- drift proposals.

## Phase 3 — Agent Organization Factory
PR-A4:
- canonical manifests
- tenant instantiation
- scope partition
- context assembly
- kill switches.

## Phase 4 — Durable Workflow Runtime hardening
PR-A5:
- typed graphs
- checkpoints
- idempotency
- approvals
- reconciliation
- crash tests.

Use existing workflow engine if suitable; do not replace proven infrastructure just to match terminology.

## Phase 5 — One-Truck Fast Start
PR-A6:
- synthetic owner-operator fixture
- intake
- docs
- communications
- load/mission workflow
- back office
- dashboard.

This is the first adoption-focused reference implementation.

## Phase 6 — Dispatch Copilot
PR-A7:
- universal dispatch graph
- road pack
- candidate planning
- explainability
- shadow evaluation.

## Phase 7 — Approval-to-Execute Dispatch
PR-A8:
- side-effect gateway
- exact approval
- external write adapter
- read-after-write
- reconciliation.

## Phase 8 — Maintenance/Roadside
PR-A9:
- readiness
- repair
- roadside
- dispatch replan integration.

## Phase 9 — Policy-Bounded Autonomy
PR-A10:
- autonomy grants
- promotion/downgrade
- canary
- incident pause.

## Phase 10 — Enterprise topology
PR-A11:
- hierarchy
- scoped workers
- partitioning
- quotas
- enterprise SSO/integration hooks as required.

## Phase 11 — Multimodal packs
PR-A12 road conformance maturity
PR-A13 rail pack
PR-A14 ocean pack
PR-A15 multimodal journey.

## Phase 12 — Productized implementation
PR-A16:
- customer onboarding console
- implementation templates
- conformance portal
- exportable acceptance pack
- tenant deployment automation.

## Cross-PR controls

Every runtime PR:
- tenant tests
- authority tests
- idempotency where side effects exist
- migration up/down/recovery as applicable
- compatibility
- observability
- rollback
- documentation
- no production enablement by default.


---

<!-- SOURCE: 18_CLAUDE_MASTER_IMPLEMENTATION_PROMPT.md -->

# 18 — Claude Master Implementation Prompt

You are the senior principal engineer, enterprise agent architect, logistics systems architect, security engineer, and production reviewer responsible for integrating the FreightOS Enterprise Agent Operations Handoff v1.5.0 into the existing FreightOS repository.

## Controlling relationship

This package is additive.

Read:
- all existing FreightOS constitution/product/production handoffs;
- `docs/production-handoff/v1.3.0-security-resilience/`;
- `docs/production-handoff/v1.4.0-network-architecture/`;
- this entire `v1.5.0-enterprise-agent-operations/` package.

Do not delete, rewrite, rename, weaken, or silently reinterpret prior accepted content.

Where there is conflict:
1. preserve stricter security/authority/tenant/privacy rule;
2. document conflict;
3. stop affected implementation branch pending owner decision if material.

## Strategic objective

Make FreightOS productizable as an enterprise autonomous logistics operating system whose first adoption wedge is customer-specific dispatch and operations automation.

It must support:
- one-truck owner back-office/dispatch automation;
- fleets with hundreds/thousands of assets;
- large enterprise dispatch organizations;
- maintenance, repair, roadside, documentation, communication, and reconciliation;
- road first;
- rail/ocean through capability packs;
- no customer-specific code forks as normal implementation.

## Immediate assignment — Phase 0 only

Do not implement runtime changes yet.

Create a new branch and perform a repository-specific gap analysis.

### Inspect

1. branch/HEAD/remote/tree;
2. current handoff installation;
3. database/migrations;
4. tenant hierarchy;
5. identity/authority;
6. current agent manifests/runtime;
7. current workflow engine/durable execution;
8. event/outbox/inbox/idempotency;
9. dispatch/load/shipment/assignment models;
10. integration adapters;
11. maintenance/roadside/RigDesk boundaries;
12. document/back-office workflows;
13. audit/evidence;
14. observability;
15. deployment/cells;
16. tests/CI;
17. existing one-truck and enterprise fixtures;
18. multimodal readiness.

### Produce

Under a new repository-local Phase 0 folder:
- current-state agent architecture
- COT gap map
- workflow graph inventory
- command/side-effect inventory
- tenant agent-scope map
- customer-fork risk inventory
- dispatch automation gap analysis
- back-office gap analysis
- maintenance/roadside gap analysis
- multimodal pack readiness
- EA-01..EA-26 matrix
- repository-specific PR sequence
- owner decisions required.

### Restrictions

Do not:
- alter existing production handoff files;
- enable agents;
- run production migrations;
- change permissions;
- enable dispatch/roadside writes;
- expose secrets;
- adopt a new orchestration framework if existing durable workflow infrastructure satisfies the contract;
- perform broad refactor;
- claim v1.5 implementation from documentation presence;
- merge or deploy.

## Engineering doctrine

- customer-specific configuration, canonical product;
- Company Operational Twin, not hidden memory;
- typed graph, not agent chat;
- authority before automation;
- shadow proof before autonomy;
- external side effects isolated;
- idempotency + reconciliation;
- inspectable/correctable customer understanding;
- road-first, mode-neutral core;
- scale through topology/partitioning;
- no unsupported scale claims.

## Completion response

Return:
1. branch/HEAD/tree;
2. files added/changed;
3. proof existing handoff files were not altered;
4. current-state architecture;
5. EA gate matrix;
6. gaps;
7. PR sequence;
8. owner decisions;
9. exact tests/commands;
10. explicit confirmation of no production/live side effects.

Stop after Phase 0.


---

<!-- SOURCE: README.md -->

# FreightOS Enterprise Agent Operations Handoff v1.5.0

**Status:** additive production architecture and implementation handoff  
**Date:** 2026-08-14  
**Relationship:** additive to all existing FreightOS production handoffs, especially v1.3.0 Security/Privacy/Resilience and v1.4.0 Network Architecture. It does **not** replace or weaken any existing accepted requirement.

## Purpose

This package tightens FreightOS around its earliest high-adoption commercial wedge:

> **Deploy a customer-specific FreightOS agent organization that can understand, explain, and safely automate the customer's logistics operations—from a one-truck owner-operator's back office to a multinational multimodal carrier's dispatch, maintenance, roadside, documentation, exception, and coordination workflows—without creating customer-specific code forks.**

The system must be equally understandable and implementable for:
- a one-truck owner-operator;
- a small fleet;
- a regional carrier;
- a mega-carrier with hundreds, thousands, or more powered units;
- a rail operator;
- an ocean carrier/operator;
- a multimodal enterprise;
- future logistics participants represented through mode capability packs.

## Governing doctrine

1. **Company understanding is a product artifact, not hidden agent memory.**
2. **The customer must understand what FreightOS understands.**
3. **Canonical product, customer configuration. No customer forks.**
4. **Typed operational graphs before autonomous execution.**
5. **Authority before automation.**
6. **Shadow proof before autonomy.**
7. **Every external side effect is governed, idempotent, auditable, and reconcilable.**
8. **Mode-neutral core; mode-specific capability packs.**
9. **One truck and one million assets use the same conceptual model at different topology/scaling tiers.**
10. **FreightOS must remain useful when the intelligence plane is unavailable.**

## Intended repository destination

```text
docs/production-handoff/v1.5.0-enterprise-agent-operations/
```

## Existing files

Do **not** edit, delete, rename, reorder, or reinterpret prior handoff files while installing this package. Install this package in its own directory.

Any later additive pointer from a governing index/master must be a separate, explicit, reviewable documentation-only change.

## Reading order

1. `00_MASTER_HANDOFF.md`
2. `01_ENTERPRISE_AGENT_CONSTITUTION.md`
3. `02_COMPANY_OPERATIONAL_TWIN.md`
4. `03_TENANT_AGENT_ORGANIZATION_FACTORY.md`
5. `04_ADAPTIVE_WORKFLOW_GRAPH_RUNTIME.md`
6. `05_UNIVERSAL_DISPATCH_ORCHESTRATION.md`
7. `06_BACK_OFFICE_AUTOMATION.md`
8. `07_MAINTENANCE_REPAIR_ROADSIDE.md`
9. `08_MULTIMODAL_CAPABILITY_PACKS.md`
10. `09_CUSTOMER_CONTROL_AND_EXPLAINABILITY.md`
11. `10_AUTONOMY_CERTIFICATION_AND_SHADOW_MODE.md`
12. `11_INTEGRATION_ADAPTER_AND_CONFORMANCE.md`
13. `12_ENTERPRISE_SCALE_AND_CELL_ARCHITECTURE.md`
14. `13_KNOWLEDGE_MEMORY_AND_DATA_GOVERNANCE.md`
15. `14_OBSERVABILITY_EVALUATION_AND_OUTCOMES.md`
16. `15_CUSTOMER_IMPLEMENTATION_AND_GO_LIVE.md`
17. `16_ACCEPTANCE_GATES.md`
18. `17_IMPLEMENTATION_ROADMAP.md`
19. `18_CLAUDE_MASTER_IMPLEMENTATION_PROMPT.md`
20. machine-readable contracts under `contracts/`
21. diagrams under `diagrams/`
22. templates under `templates/`

## Non-implementation warning

Installing these documents does not prove FreightOS implements them. Runtime claims require repository evidence, tests, migration proof, deployment evidence, customer-sandbox conformance, and the acceptance gates in this package.


---

<!-- SOURCE: SOURCE_RELATIONSHIP.md -->

# Source Relationship and Non-Regression Note

This v1.5.0 package was designed as an additive tightening of existing FreightOS architecture.

It explicitly preserves prior architectural positions including:
- FreightOS as a neutral communication/coordination/execution network;
- authority before automation;
- structural tenant isolation;
- agents as governed identities with tool/data/command limits;
- typed commands rather than agent memory as authority;
- human approval and exception tiers;
- mode-neutral core with road/rail/ocean profiles;
- durable event/command/idempotency/reconciliation architecture;
- critical operational continuity when intelligence is unavailable.

The new contribution is primarily:
1. Company Operational Twin;
2. customer-visible understanding/correction;
3. Tenant Agent Organization Factory;
4. production graph standard for customer automation;
5. one-truck-to-enterprise deployment composition;
6. adoption-first dispatch/back-office/repair/roadside launch path;
7. autonomy certification/shadow mode;
8. customer implementation factory/no-fork requirement;
9. mode capability-pack contract;
10. enterprise acceptance gates for repeatable customer deployment.

No existing Library artifact was modified to create this package.


---

<!-- SOURCE: contracts/agent_manifest.schema.json -->

{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "freightos://schemas/agent-manifest/v1",
  "title": "AgentManifest",
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
    "role": {
      "type": "string"
    },
    "manifestVersion": {
      "type": "string"
    },
    "scope": {
      "type": "object"
    },
    "readScopes": {
      "type": "array",
      "items": {
        "type": "string"
      }
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
    "financialLimits": {
      "type": "object"
    },
    "policyVersion": {
      "type": "string"
    },
    "autonomy": {
      "type": "object"
    },
    "modelPolicy": {
      "type": "object"
    },
    "evaluationVersion": {
      "type": "string"
    },
    "effectiveAt": {
      "type": "string"
    },
    "expiresAt": {
      "type": [
        "string",
        "null"
      ]
    },
    "killSwitch": {
      "type": "object"
    }
  },
  "additionalProperties": false
}


---

<!-- SOURCE: contracts/autonomy_grant.schema.json -->

{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "freightos://schemas/autonomy-grant/v1",
  "title": "AutonomyGrant",
  "type": "object",
  "required": [
    "tenantId",
    "workflowId",
    "actionClass",
    "scope",
    "level",
    "policyVersion",
    "evidenceRef",
    "approvedBy",
    "effectiveAt"
  ],
  "properties": {
    "tenantId": {
      "type": "string"
    },
    "workflowId": {
      "type": "string"
    },
    "actionClass": {
      "type": "string"
    },
    "scope": {
      "type": "object"
    },
    "level": {
      "enum": [
        "A0",
        "A1",
        "A2",
        "A3",
        "A4",
        "A5"
      ]
    },
    "limits": {
      "type": "object"
    },
    "policyVersion": {
      "type": "string"
    },
    "evidenceRef": {
      "type": "string"
    },
    "approvedBy": {
      "type": "string"
    },
    "effectiveAt": {
      "type": "string"
    },
    "expiresAt": {
      "type": [
        "string",
        "null"
      ]
    },
    "revokedAt": {
      "type": [
        "string",
        "null"
      ]
    }
  },
  "additionalProperties": false
}


---

<!-- SOURCE: contracts/capability_pack.schema.json -->

{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "freightos://schemas/capability-pack/v1",
  "title": "CapabilityPack",
  "type": "object",
  "required": [
    "packId",
    "version",
    "mode",
    "objects",
    "events",
    "commands",
    "workflows",
    "conformanceSuite"
  ],
  "properties": {
    "packId": {
      "type": "string"
    },
    "version": {
      "type": "string"
    },
    "mode": {
      "enum": [
        "core",
        "road",
        "rail",
        "ocean",
        "air",
        "facility",
        "service"
      ]
    },
    "objects": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "specializedObjects": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "events": {
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
    "documents": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "workflows": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "agentSpecializations": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "standards": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "conformanceSuite": {
      "type": "string"
    },
    "riskProfile": {
      "type": "object"
    }
  },
  "additionalProperties": false
}


---

<!-- SOURCE: contracts/company_operational_twin.schema.json -->

{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "freightos://schemas/company-operational-twin/v1",
  "title": "CompanyOperationalTwin",
  "type": "object",
  "required": [
    "tenantId",
    "version",
    "status",
    "organization",
    "systems",
    "workflows",
    "assertions"
  ],
  "properties": {
    "tenantId": {
      "type": "string",
      "minLength": 1
    },
    "version": {
      "type": "string",
      "minLength": 1
    },
    "status": {
      "enum": [
        "PROPOSED",
        "APPROVED",
        "DEPRECATED"
      ]
    },
    "organization": {
      "type": "object"
    },
    "roles": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "assets": {
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
    "policies": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "exceptions": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "assertions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "state",
          "subject",
          "predicate",
          "sourceRefs",
          "effectiveAt"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "state": {
            "enum": [
              "PROPOSED",
              "VERIFIED",
              "APPROVED",
              "DISPUTED",
              "DEPRECATED"
            ]
          },
          "subject": {
            "type": "string"
          },
          "predicate": {
            "type": "string"
          },
          "value": {},
          "sourceRefs": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1
          },
          "approvedBy": {
            "type": [
              "string",
              "null"
            ]
          },
          "effectiveAt": {
            "type": "string"
          },
          "expiresAt": {
            "type": [
              "string",
              "null"
            ]
          },
          "uncertainty": {
            "type": [
              "string",
              "null"
            ]
          }
        }
      }
    }
  },
  "additionalProperties": false
}


---

<!-- SOURCE: contracts/enterprise_agent_graph.yaml -->

version: 1.0.0
name: freightos-enterprise-agent-operations

invariants:
  - no_side_effect_bypasses_policy
  - no_agent_message_is_authority
  - every_external_write_is_idempotent
  - every_external_write_is_reconciled
  - customer_specific_behavior_is_configuration_first
  - approved_cot_only_for_authoritative_configuration
  - autonomy_is_granted_per_workflow_action_scope
  - mode_neutral_core
  - tenant_scoped_context_and_memory

graph_families:
  company_discovery:
    stages:
      - source_inventory
      - evidence_ingest
      - candidate_assertions
      - normalization
      - conflict_detection
      - customer_review
      - cot_approval
      - impact_analysis

  dispatch:
    stages:
      - demand_intake
      - normalize
      - context
      - capacity_discovery
      - feasibility
      - economics_priority
      - candidate_plan
      - policy
      - approval_or_autonomy
      - assignment_side_effect
      - acknowledgement
      - execution_monitor
      - exception
      - completion
      - reconciliation

  back_office:
    stages:
      - intake
      - classify
      - associate
      - deadline_tasks
      - communication
      - document_completion
      - billing_prepare
      - reconciliation
      - exception

  maintenance_roadside:
    stages:
      - issue_intake
      - severity
      - safety_gate
      - readiness
      - provider_discovery
      - estimate_availability
      - policy
      - approval_or_autonomy
      - service_side_effect
      - tracking
      - completion
      - readiness_reassess
      - dispatch_replan

  incident_recovery:
    stages:
      - classify
      - contain
      - pause_scope
      - evidence
      - recovery
      - verify
      - reconcile
      - resume_gate


---

<!-- SOURCE: contracts/workflow_definition.schema.json -->

{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "freightos://schemas/workflow-definition/v1",
  "title": "WorkflowDefinition",
  "type": "object",
  "required": [
    "workflowId",
    "version",
    "stateSchemaRef",
    "nodes",
    "edges",
    "terminalStates",
    "sideEffectNodes"
  ],
  "properties": {
    "workflowId": {
      "type": "string"
    },
    "version": {
      "type": "string"
    },
    "capabilityPack": {
      "type": [
        "string",
        "null"
      ]
    },
    "stateSchemaRef": {
      "type": "string"
    },
    "nodes": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "edges": {
      "type": "array",
      "items": {
        "type": "object"
      }
    },
    "terminalStates": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string"
      }
    },
    "sideEffectNodes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "approvalNodes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "deadlinePolicy": {
      "type": "object"
    },
    "retryPolicy": {
      "type": "object"
    },
    "degradedMode": {
      "type": "object"
    },
    "evaluationSuite": {
      "type": "string"
    }
  },
  "additionalProperties": false
}


---

<!-- SOURCE: templates/company_intake.yaml -->

tenant:
  legal_name:
  operating_name:
  modes: []
  truck_count:
  other_asset_counts: {}
  operating_regions: []
  timezones: []

desired_outcomes:
  - dispatch_automation
  - back_office
  - documentation
  - maintenance_roadside

organization:
  roles: []
  terminals: []
  fleets: []
  escalation_contacts: []

systems:
  tms: []
  eld_telematics: []
  accounting: []
  maintenance: []
  email_messaging: []
  document_storage: []
  rail: []
  ocean: []

workflow_priorities:
  first_workflow:
  current_process_owner:
  biggest_manual_burden:
  biggest_exception:
  current_sla:

autonomy_preferences:
  always_approval: []
  candidate_auto_actions: []
  spending_limits: {}
  communication_limits: {}

security:
  sso_required:
  data_residency:
  retention_requirements:
  vendor_review_required:


---

<!-- SOURCE: templates/customer_go_live_checklist.md -->

# Customer Go-Live Checklist

- [ ] Tenant/security review complete
- [ ] COT reviewed and approved
- [ ] System-of-record matrix approved
- [ ] Integration conformance complete
- [ ] Agent manifests reviewed
- [ ] Workflow graph reviewed
- [ ] Authority/autonomy grants signed
- [ ] Shadow evaluation passed
- [ ] Exception scenarios tested
- [ ] Duplicate/idempotency test passed
- [ ] Reconciliation test passed
- [ ] Connector outage test passed
- [ ] Kill switches tested
- [ ] Rollback tested
- [ ] Customer Operations Console access verified
- [ ] Escalation/on-call verified
- [ ] Data retention/export/delete requirements configured
- [ ] Production canary scope defined
- [ ] Owner/customer approval recorded


---

<!-- SOURCE: templates/workflow_discovery.md -->

# Workflow Discovery Template

## Identity
- Workflow name:
- Tenant:
- Business owner:
- Technical owner:
- Mode:
- Scope:

## Trigger

## Inputs + systems of record

## Current steps

For each step:
- actor
- system
- input
- decision/rule
- judgment
- external side effect
- deadline
- evidence
- exception

## Hard policies

## Soft preferences

## Approval thresholds

## Exceptions + escalation

## Desired FreightOS state

Mark each target step:
- deterministic
- intelligence
- human interrupt
- side effect
- reconciliation

## Autonomy target
A0 / A1 / A2 / A3 / A4 / A5

## Shadow success criteria

## Rollback / kill switch
