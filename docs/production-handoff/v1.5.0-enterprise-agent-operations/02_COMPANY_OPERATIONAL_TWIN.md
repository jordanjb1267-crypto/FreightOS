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
