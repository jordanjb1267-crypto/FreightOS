# FreightOS RevenueOS, Commercial Capability, Freight Market Intelligence, Typed Graph & Operational Twin Interaction Architecture v1.8.1 — Combined

Individual package files are controlling. This combined file is generated for review convenience and does not change precedence.

---

<!-- SOURCE: 00_MASTER_HANDOFF.md -->

# 00 — Master RevenueOS & Commercial Capability Handoff

## 1. Objective

FreightOS SHALL support modular adoption without fragmenting its technical foundation.

A customer may purchase only the Operational Twin and capabilities appropriate to its operation while all enabled capabilities remain governed by the same FreightOS identity, authority, policy, workflow, audit, network, resilience, and certification substrate.

## 2. Canonical stack

```text
CUSTOMER / PARTNER EXPERIENCE
        │
        ▼
COMMERCIAL OFFER + CONTRACT
        │
        ▼
VERSIONED COMMERCIAL ENTITLEMENTS
        │                 (never sufficient for authority)
        ▼
ACTIVATION / IMPLEMENTATION GATES
        │
        ▼
PARTICIPANT OPERATIONAL TWIN
        │
        ▼
ENABLED CAPABILITIES
        │
        ▼
CERTIFIED JOBS / COMPONENTS + DURABLE WORKFLOW GRAPHS
        │
        ▼
IDENTITY / AUTHORITY / POLICY / LEGAL / AUTONOMY GATES
        │
        ▼
FREIGHTOS NETWORK KERNEL + ADAPTERS
        │
        ▼
EXTERNAL / BUSINESS EFFECTS + EVIDENCE + RECONCILIATION
```

RevenueOS operates beside this stack as the governed commercial plane. It may propose what should be sold, but it cannot self-activate the operational stack.

A shared **Freight Market Intelligence (FMI) substrate** sits across commercial and operational products. RevenueOS owns the customer-facing market-intelligence function, while Carrier, Brokerage, FacilityOS, Shipper, and Service Provider/RigDesk domains may consume the same provenance-bearing signals as evidence within their own authority boundaries.

## 3. Product hierarchy

```text
FreightOS Platform
├── Core Platform Services
├── FreightOS Network
├── Participant Products / Operational Twins
│   ├── Carrier
│   ├── Facility
│   ├── Shipper
│   ├── Broker
│   └── Service Provider / RigDesk
├── Capabilities
│   ├── Dispatch
│   ├── Appointments
│   ├── Documents
│   ├── Maintenance
│   ├── Detention
│   ├── Billing / Collections
│   ├── Communications
│   └── future mode-specific capabilities
├── Workforce Implementations
│   ├── agents
│   ├── hybrid agents
│   ├── human-supervised agents
│   └── deterministic services
└── RevenueOS
    ├── account intelligence
    ├── qualification
    ├── discovery
    ├── solution configuration
    ├── pricing / ROI
    ├── proposal / security response
    ├── promise governance
    ├── partner/channel management
    ├── attribution / commissions
    ├── implementation handoff
    ├── expansion / renewal
    └── market intelligence division / customer briefings

Shared Freight Market Intelligence Substrate
├── source/rights registry
├── rates / capacity / demand / volume
├── freight news / disruptions / regulation
├── fuel / commodity / multimodal intelligence
├── maintenance/service-market intelligence
├── forecasts / regime classification
└── customer relevance + operational evidence interfaces
```

## 4. Product-boundary rule

The externally purchased unit is a **Capability Contract**, not a specific agent.

A capability defines:

- business outcome;
- participant/Twin applicability;
- included workflow surfaces;
- required upstream dependencies;
- authoritative data classes;
- allowed action classes;
- maximum autonomy envelope;
- certification requirements;
- service/deployment constraints;
- commercial meter(s);
- version and compatibility rules;
- activation prerequisites;
- exclusions/non-scope.

A capability may be implemented by one or more existing jobs/components. Internal decomposition may evolve without silently changing the customer contract.

## 5. Commercial entitlement is not authority

A paid entitlement answers:

> Is this organization commercially licensed to use this capability/version/quantity during this period?

It does **not** answer:

> May this actor/agent execute this command now?

Execution still requires all applicable identity, authorization, policy, legal, autonomy, certification, data, workflow-state, and approval gates.

## 6. RevenueOS mission

RevenueOS SHALL convert a prospect's operating model and verified pain points into a bounded, supportable FreightOS configuration and commercial offer.

RevenueOS SHALL NOT optimize solely for bookings. It is accountable for **qualified, supportable, collectible, implementable revenue**.

## 7. Commercial plane isolation

No RevenueOS component receives implicit authority because it can see CRM, pricing, customer, or product information.

RevenueOS cannot:

- alter authoritative Operational Twin facts;
- grant production command permissions;
- waive security/legal/certification gates;
- modify product capability status;
- activate integrations;
- change autonomy grants;
- create unsupported roadmap commitments;
- represent an unverified feature as shipped;
- override deterministic pricing/discount limits;
- approve its own exception.

## 8. Seller classes

Canonical seller relationship classes:

1. `referral_scout` — introduces qualified accounts; no closing authority.
2. `independent_sales_agent` — may prospect/qualify/sell approved SKUs within explicit bounds.
3. `certified_advisor` — consultative solution configuration for approved scope.
4. `channel_reseller` — B2B partner selling approved offers under partner agreement.
5. `enterprise_ae` — internal/authorized seller for complex enterprise opportunities.
6. `strategic_partner` — separately governed relationship, often integration/service/channel combined.

Worker/contractor legal classification is not inferred from these labels. Employment and independent-contractor treatment must follow actual law and contracts.

## 9. Customer adoption ladder

Commercial rollout can be staged independently by capability:

```text
DISCOVER / MODEL
      ↓
OBSERVE
      ↓
RECOMMEND
      ↓
ASSIST / DRAFT
      ↓
EXECUTE WITH APPROVAL
      ↓
BOUNDED AUTONOMY
```

This ladder maps to, but does not replace, the controlling FreightOS autonomy and job-certification levels. A commercial label cannot promote a component beyond its certified technical ceiling.

## 10. Land-and-expand doctrine

A customer can begin with one Twin and one capability, then expand when evidence supports value.

Example:

```text
Carrier Twin + Dispatch
      ↓
Documents
      ↓
Maintenance
      ↓
Detention
      ↓
Financial Operations
      ↓
Counterparty connections
      ↓
Network participation
```

The expansion system must detect value opportunities without dark patterns or unauthorized data use.

## 11. Network doctrine

Modular adoption must strengthen—not fragment—the network.

A carrier, facility, shipper, broker, or service provider may use different capabilities while interoperating through canonical FreightOS protocol, identities, evidence, and network semantics.

The commercial system must never require every counterparty to become a native customer before a workflow can deliver unilateral value.

## 12. Freight Market Intelligence rule

RevenueOS SHALL be able to study freight markets, freight news, rates, capacity, demand, fuel, disruptions, relevant regulatory developments, multimodal conditions, and maintenance/service-market conditions, then translate those signals into customer-specific briefings and alerts.

However, intelligence publication and consumption never transfer operational authority. A rate/capacity/news signal is evidence, not permission to quote, tender, accept, assign, dispatch, repair, spend, admit, or otherwise create a business effect. See files 31–38 and FMI-01..FMI-28.

## 13. Implementation rule

This package defines contracts and audit requirements. The first repository action is a cross-package audit. Runtime work begins only after owner review of that audit and explicit authorization.

## 14. Typed graph and provisional Job Book control extension

RevenueOS/FMI audit candidates are now specified through:
- `39_TYPED_GRAPH_ENGINEERING_STANDARD.md`;
- `40_REVENUEOS_TYPED_GRAPH_CATALOG.md`;
- `41_FMI_TYPED_GRAPH_CATALOG.md`;
- `42_CROSS_PLANE_OPERATIONAL_CONSUMPTION_GRAPHS.md`;
- `43_GRAPH_AUTHORITY_STATE_AND_HANDOFF_INVARIANTS.md`;
- `44_GRAPH_FAILURE_RETRY_RECONCILIATION.md`;
- `45_GRAPH_CERTIFICATION_SIMULATION_AND_REPLAY.md`;
- `46_GRAPH_ACCEPTANCE_GATES_GR_01_GR_32.md`;
- machine-readable `graphs/`;
- provisional audit-candidate `job_books/`;
- graph ownership/handoff matrices.

These artifacts remain non-activating design candidates. Claude must audit them against accepted v1.3–v1.8 Job Books, WorkUnits, workflow runtime, authority, network, and certification contracts before any candidate is accepted as J0 or implemented.


## 16. Final package control inventory

This package specifies, as audit candidates rather than production claims:

- 17 RevenueOS jobs/components with paired Markdown + JSON provisional Job Books;
- 20 Freight Market Intelligence jobs/components with paired Markdown + JSON provisional Job Books;
- 8 RevenueOS typed durable graphs;
- 10 FMI typed durable graphs;
- 6 cross-plane operational-consumption graphs;
- 12 Operational Twin interaction/coexistence graphs;
- 147 registered typed edge-artifact classes;
- graph WorkUnit and handoff-envelope schemas;
- graph node-ownership and edge-handoff matrices;
- four acceptance-gate families totaling 148 gates: REV-01..48, FMI-01..28, GR-01..32, TW-01..40.

The required sequence is controlled by `49_END_TO_END_IMPLEMENTATION_SEQUENCE.md`. The package release-integrity criteria are controlled by `50_PACKAGE_RELEASE_AND_INTEGRITY_CHECKLIST.md`.

## 15. Operational Twin interaction fabric refinement

The final pre-v1.9 architecture adds an explicit coexistence contract for participant Operational Twins. A Twin must function across human-led, assisted, collaborative, approval-execute, and bounded-autonomy workflows while remaining synchronized with declared customer systems of record and projecting only authorized information into the FreightOS network.

Controlling additive files: `51`–`62`, `graphs/twin/`, the Twin schemas, Twin fixtures, and TW-01..TW-40.

The refinement does not require TMS/WMS/ERP replacement, does not create a second Twin source of truth, does not promote autonomy, and does not permit hidden learning. Claude must audit whether the real repository can support these contracts using the accepted runtime/adapter/network/authority foundations before any implementation or v1.9 continuation.

---

<!-- SOURCE: 01_REVENUEOS_CONSTITUTION.md -->

# 01 — RevenueOS Constitution

## Article I — Mission

RevenueOS exists to create durable customer value and collectible revenue by matching verified logistics problems to supportable FreightOS capabilities.

## Article II — Truth over bookings

A booking, quota, commission, forecast, or partner pressure never authorizes a false or unsupported claim.

Product state must use a controlled vocabulary such as:

- `GA_CERTIFIED`
- `GA_BOUNDED`
- `PILOT_APPROVED`
- `DESIGN_ONLY`
- `DEFERRED`
- `PROHIBITED`

Exact repository vocabulary is subject to audit; RevenueOS must consume a single authoritative product registry rather than invent parallel status labels.

## Article III — Commercial authority is bounded

Every seller, partner, and revenue agent has a versioned authority profile covering:

- sellable SKUs;
- customer segments;
- geographies/verticals where applicable;
- discount ceiling;
- term ceiling;
- non-standard contract rights;
- proposal rights;
- roadmap-discussion rights;
- data access;
- export rights;
- approval route;
- expiry/review.

Absence of a grant means no authority.

## Article IV — No promise bypass

No human or AI seller can bypass the Sales Promise Firewall.

Unsupported commitments must be rejected or routed to an explicit exception workflow. Silence, email wording, CRM notes, side letters, chat messages, or verbal statements cannot create system authority.

## Article V — Separation of duties

At minimum, the following may not be self-approved by the beneficiary/requester:

- exceptional discount;
- non-standard SLA;
- security exception;
- data-processing exception;
- new integration commitment;
- roadmap/date commitment;
- custom development obligation;
- commission override;
- attribution reassignment after protected stage;
- partner tier promotion;
- seller certification promotion.

## Article VI — Customer configuration integrity

RevenueOS may propose a customer configuration. Implementation/customer-authorized processes own acceptance of operational facts and activation. RevenueOS cannot write approved Twin facts by implication.

## Article VII — Commission integrity

Commission is derived from deterministic, auditable commercial events. No salesperson or manager may silently rewrite historical attribution, collection events, or payout evidence.

## Article VIII — Privacy and least access

Revenue data access follows purpose limitation and least privilege. Seller access to operational data is not assumed. Sensitive carrier, driver, facility, shipper, pricing, document, financial, safety, or personal data must remain behind the controlling data policy.

## Article IX — Partner equality and containment

Partners may receive published, governed capabilities appropriate to their agreement. Partner status does not grant internal administrative or production operating authority.

## Article X — Evidence

Consequential commercial decisions generate evidence sufficient to answer:

- who/what proposed it;
- which account/opportunity/offer version;
- product registry version;
- authority profile version;
- deterministic gates evaluated;
- approvals obtained;
- customer acceptance;
- financial event source;
- commission derivation;
- later corrections or disputes.

## Article XI — Fail closed

Unknown authority, stale product status, missing pricing input, unresolved attribution, unverified collection, or ambiguous activation state becomes HOLD/REVIEW—not an invented assumption.

## Article XII — Non-regression

Revenue growth cannot weaken FreightOS security, network, authority, resilience, legal, autonomy, or workforce certification requirements.

---

<!-- SOURCE: 02_CANONICAL_PRODUCT_AND_CAPABILITY_GRAPH.md -->

# 02 — Canonical Product and Capability Graph

## Why this graph exists

RevenueOS requires a machine-readable representation of what FreightOS can sell. Without it, sales scripts become a shadow product catalog and eventually diverge from engineering reality.

## Canonical nodes

### Platform
`FreightOS`

### Participant product / Operational Twin
A sellable participant operating surface built on a `ParticipantOperationalTwin` specialization.

Initial participant families already defined by prior architecture:

- Carrier Operational Twin (COT)
- Facility Operational Twin (FOT)
- Shipper Operational Twin (SOT)
- Broker Operational Twin (BOT)
- Service Provider Operational Twin (SPOT / RigDesk context)

### Capability
A customer-facing business outcome contract.

### Workflow
A durable graph implementing part of a capability.

### Job/component
Certified workforce responsibility: agent, hybrid agent, human-supervised agent, deterministic service, or human role.

### Command/action class
A bounded executable action with authority and policy semantics.

### Integration binding
An approved adapter required by a capability for a specific customer.

### Meter
A value-aligned billing quantity.

## Required graph edges

- `platform HAS_PARTICIPANT_PRODUCT`
- `participant_product OFFERS_CAPABILITY`
- `capability REQUIRES_CAPABILITY`
- `capability IMPLEMENTED_BY_WORKFLOW`
- `workflow OWNED_BY_JOB`
- `job MAY_REQUEST_COMMAND`
- `capability REQUIRES_INTEGRATION_CLASS`
- `capability METERED_BY`
- `capability REQUIRES_CERTIFICATION`
- `capability COMPATIBLE_WITH`
- `capability EXCLUDES`
- `capability CONSUMES_MARKET_SIGNAL_CLASS`
- `market_signal RELEVANT_TO_PARTICIPANT_PRODUCT`
- `market_signal MAY_INFORM_WORKFLOW` (never means MAY_COMMAND)

## Product registry invariants

1. Every quoted SKU resolves to exactly one versioned offer definition.
2. Every offer resolves to explicit capabilities.
3. Every capability resolves to implementation/certification requirements.
4. No offer can imply a command not represented in the command/authority registry.
5. Deprecated versions remain reconstructable for historical contracts.
6. A capability's marketing name may change without changing its immutable internal identity.
7. An internal job/component may change without changing the capability contract unless behavior/authority/SLO materially changes.
8. A material capability change requires compatibility analysis and versioning.
9. A market-intelligence capability resolves to explicit source/signal classes, freshness/confidence rules, customer relevance policy, and consumer boundaries.
10. No graph edge from market intelligence directly creates command authority.

## Capability lifecycle

Recommended abstract lifecycle:

```text
DRAFT
 → REVIEWED
 → PILOT_ELIGIBLE
 → SELLABLE_BOUNDED
 → SELLABLE_GENERAL
 → DEPRECATED
 → RETIRED
```

The audit must map this concept to existing repository vocabularies rather than create duplicate runtime status models.

## Example

```text
Carrier Operations
  └── Dispatch Execution Capability v1
      ├── requires: Carrier Twin
      ├── workflows:
      │   ├── opportunity intake
      │   ├── feasibility/profitability
      │   ├── planning
      │   ├── assignment
      │   └── execution exceptions
      ├── jobs/components: references to certified v1.8 Job Books
      ├── commands: bounded set from command registry
      ├── max autonomy: min(capability ceiling, job certification, customer grant, policy)
      └── meter: managed truck / managed load / agreed enterprise commitment
```

## No agent-as-SKU default

An individual agent may be marketed as a recognizable feature only if the commercial contract still resolves to a governed capability. The implementation identity must not become the durable contract boundary by accident.

---

<!-- SOURCE: 03_OPERATIONAL_TWIN_COMMERCIAL_PACKAGING.md -->

# 03 — Operational Twin Commercial Packaging

## Principle

The Operational Twin is the customer's durable operating context; capabilities are purchased around it.

A Twin is not a generic data lake and is not an unreviewed AI memory. Approved operational facts preserve provenance, lifecycle, and impact analysis.

## Commercial base

A participant product may include a minimal Twin entitlement sufficient to support purchased capabilities. Commercial packaging must not force unrelated capabilities merely because they share the same Twin substrate.

## Initial product families

### Carrier
Common capability families:
- dispatch/planning;
- documents;
- communications/check calls;
- appointments;
- detention;
- maintenance/roadside coordination;
- billing/collections/settlement support;
- compliance/safety support where legally and technically appropriate;
- carrier market intelligence: lane rates, capacity, demand, fuel, disruptions, seasonality and customer-specific operating impact.

### FacilityOS
Common capability families:
- appointment scheduling;
- pre-arrival/readiness;
- gate/check-in;
- yard/dock coordination;
- driver communication;
- document/BOL/POD handling;
- exception/detention evidence;
- receipt/closeout;
- facility market intelligence: inbound/outbound volume pressure, carrier capacity, port/rail/border spillover and disruption-driven readiness.

### Shipper
Common capability families:
- transportation request/tender support;
- appointment coordination;
- execution visibility;
- exception management;
- documents;
- reconciliation;
- shipper market intelligence: procurement rates, capacity, routing-guide risk, modal/corridor conditions and disruptions.

### Broker
Commercial availability remains subject to brokerage legal/authority gates from prior accepted architecture. RevenueOS cannot activate dormant brokerage merely because a customer requests it.

Brokerage market intelligence is nonetheless a first-class design requirement: buy-side capacity, lane rates, demand/volume, tender/rejection or equivalent licensed signals, disruptions, shipper-market context and margin-risk inputs. Intelligence does not activate brokerage or authorize a quote, tender, carrier award, or legal brokerage act.

### Service Provider / RigDesk
Common capability families:
- case intake;
- triage;
- provider matching/coordination;
- service status;
- evidence;
- repair/roadside workflow support;
- maintenance/service market intelligence: parts/service/wrecker capacity, weather/disruption exposure, fuel/operating-cost context, OEM/service-network alerts where authoritative and permitted.

## Presets vs bespoke configuration

Small customers may receive opinionated presets. Enterprise customers may receive a configured bundle. Both resolve to the same canonical capability catalog; bespoke naming or commercial packaging must not create a code fork.

## Bundle rule

Bundles are commercial conveniences only. A bundle expands to individual versioned entitlements. Removing one capability from a bundle must be representable without changing the customer's entire platform identity.

## Cross-Twin customer

One enterprise may hold multiple participant roles/Twins. Entitlements must be scoped by organization/legal entity/participant context and must not collapse legal planes.

---

<!-- SOURCE: 04_CAPABILITY_CONTRACT_STANDARD.md -->

# 04 — Capability Contract Standard

Every sellable capability SHALL have a versioned definition with the following fields.

## Identity
- immutable `capability_id`;
- semantic/version identifier;
- product family;
- customer-facing name;
- lifecycle status;
- owner.

## Business contract
- outcome statement;
- target participant types;
- included workflow outcomes;
- explicit exclusions;
- prerequisites;
- supported deployment tiers;
- supported regions/legal contexts if constrained.

## Technical contract
- required Twin facts/classes;
- required integrations/adapters;
- workflow graph references;
- job/component references;
- command/action classes;
- evidence outputs;
- reconciliation requirements;
- degraded-mode behavior.

## Intelligence contract (when applicable)
- permitted market-signal classes;
- source classes and rights requirements;
- freshness/expiry policy;
- confidence/uncertainty requirements;
- customer relevance fields;
- allowed operational consumers;
- prohibited direct effects;
- forecast exposure rules;
- correction/recalculation behavior.

## Authority contract
- maximum commercial autonomy claim;
- required job certification levels;
- required approval classes;
- prohibited actions;
- financial/exposure limits if relevant;
- legal-plane constraints.

The effective autonomy is always the strict minimum of all controlling ceilings.

## Commercial contract
- SKU mappings;
- allowed pricing models;
- value meter(s);
- quantity definition;
- minimum/maximum term rules;
- renewal/expansion behavior;
- partner eligibility.

## Activation contract
Activation requires evidence for:
- entitlement valid;
- product version supportable;
- customer/Twin prerequisites;
- integration conformance;
- workforce certification;
- policy/legal approval;
- required customer approvals;
- observability/support readiness;
- rollout mode selected.

## Change classification

A change is **material** when it changes customer outcome, authority, data disclosure, legal responsibility, SLO/availability, billing meter, required integration, or compatibility. Material changes require capability versioning and migration analysis.

---

<!-- SOURCE: 05_ENTITLEMENT_AND_ACTIVATION_ARCHITECTURE.md -->

# 05 — Entitlement and Activation Architecture

## Separation

Commercial entitlement and operational activation are separate state machines.

### Entitlement state

```text
PROPOSED → CONTRACTED → ACTIVE → SUSPENDED → EXPIRED / TERMINATED
```

### Activation state

```text
NOT_CONFIGURED
 → CONFIGURING
 → SHADOW
 → APPROVAL_REQUIRED
 → ACTIVE_BOUNDED
 → SUSPENDED
 → DECOMMISSIONED
```

The exact implementation vocabulary is subject to repository audit.

## Entitlement key

At minimum:

```text
organization/legal entity
participant/Twin identity
capability_id + version range
commercial offer/SKU
quantity/meter limit
contract/effective period
commercial restrictions
source contract/order
```

## Activation key

At minimum:

```text
participant/Twin
capability version
workflow/job versions
integration bindings
policy version
legal gate state
customer approvals
autonomy grants
certification evidence
rollout mode
kill switch / suspension state
```

## Invariants

1. Active entitlement with failed activation gates = commercially licensed but unavailable/held.
2. Active capability with expired/terminated entitlement must enter controlled suspension/continuity behavior; do not abruptly create unsafe operational failure.
3. Payment status never bypasses safety/legal/policy requirements.
4. Commercial staff may request entitlement changes but may not directly grant production authority.
5. Trial/pilot entitlements have explicit limits and expiry.
6. Entitlements are versioned and auditable.
7. A capability cannot read unrelated Twin data merely because the organization licenses another capability.

## Metering

Metering must be generated from authoritative business events where possible, not LLM token counts. Candidate units include asset, managed shipment, facility visit, service case, integration/network volume, or enterprise platform commitment.

Meter data must be replayable/reconcilable and separated from operational truth when the billing projection is derived.

---

<!-- SOURCE: 06_PRODUCT_CATALOG_AND_SKU_MODEL.md -->

# 06 — Product Catalog and SKU Model

## Catalog layers

1. **Capability registry** — what the product can support.
2. **Offer catalog** — what may be sold now.
3. **SKU catalog** — how an offer is priced/metered commercially.
4. **Bundle catalog** — optional grouping of SKUs.
5. **Entitlement template** — rights created when contracted.
6. **Activation template** — technical prerequisites; never auto-approved from payment alone.

## Offer eligibility

A capability can appear in the sellable catalog only when:

- lifecycle status allows it;
- owner exists;
- support model exists;
- capability contract is complete;
- applicable workforce certification threshold is satisfied or offer explicitly says pilot/shadow;
- required security/legal/product approvals exist;
- known limitations are represented.

## Catalog source of truth

There shall be one canonical source consumed by:

- sales UI;
- proposal generator;
- partner portal;
- pricing engine;
- contract/order generation;
- entitlement service;
- implementation handoff;
- expansion recommendations;
- customer admin UI where applicable.

Marketing copy may render from it but cannot override it.

## SKU design doctrine

Use customer value units where possible. Avoid proliferating SKUs for every internal agent. A single capability SKU may map to multiple workforce components.

## Examples — illustrative, not launch prices

- `carrier.dispatch.core`
- `carrier.documents.core`
- `carrier.maintenance.coordination`
- `facility.appointment.core`
- `facility.gate_dock.coordination`
- `facility.documents.core`
- `shipper.execution.visibility`
- `network.integration.volume`

Prices and final names require commercial owner approval and are intentionally not set by this architecture package.

---

<!-- SOURCE: 07_REVENUE_ORGANIZATION_ARCHITECTURE.md -->

# 07 — Revenue Organization Architecture

## Commercial roles

RevenueOS supports human and automated roles but treats each role as a bounded job with evidence and authority.

### Human organization

- revenue leadership;
- enterprise account executives;
- segment sellers;
- certified advisors/solution consultants;
- partner/channel managers;
- customer success/expansion owners;
- deal desk/pricing approvers;
- security/legal/product approvers;
- finance/commission operations.

### External network

- referral scouts;
- independent sales agents;
- certified advisors;
- channel resellers;
- systems/integration partners;
- strategic ecosystem partners.

## RevenueOS planes

```text
INTELLIGENCE PLANE
account/contact/research/intent

SELLING PLANE
qualification/discovery/demo/proposal/follow-up

CONFIGURATION PLANE
Twin fit/capability selection/rollout design/ROI

CONTROL PLANE
catalog/pricing/promise/discount/security/legal approvals

PARTNER PLANE
onboarding/certification/deal registration/territory/channel conflict

FINANCIAL PLANE
contract/order/collection/attribution/commission

HANDOFF PLANE
implementation package/customer acceptance/expansion feedback
```

## Orchestration rule

A Revenue Operations Orchestrator may route WorkUnits but is not a superuser. Routing responsibility never implies authority to approve price, promise, contract, entitlement, or operational activation.

---

<!-- SOURCE: 08_SELLER_CLASSES_AUTHORITY_AND_RELATIONSHIPS.md -->

# 08 — Seller Classes, Authority, and Relationships

## Referral scout

May:
- register a prospect subject to policy;
- submit qualifying context;
- receive status permitted by referral agreement.

May not:
- quote binding pricing unless separately authorized;
- promise capabilities;
- access customer operational data;
- approve discounts;
- execute contracts for FreightOS.

## Independent sales agent

May perform approved prospecting, discovery, demonstrations, and proposals for approved SKUs within explicit authority profile.

## Certified advisor

May configure more complex capability combinations after certification. Cannot approve exceptions outside profile.

## Channel reseller

A B2B entity with a partner agreement, product scope, pricing/discount rules, deal registration, support responsibilities, data boundaries, brand/claim rules, audit rights, and termination process.

## Enterprise AE

May own complex opportunities and coordinate deal teams. Still subject to Promise Firewall, pricing authority, legal/security review, and product status.

## Strategic partner

Separate contract and governance; may combine integration, services, and distribution. No implicit cross-plane authority.

## Authority profile fields

- principal/organization;
- relationship class;
- certification level;
- eligible products/SKUs;
- account/territory scope;
- max discount;
- max contract term;
- permitted proposal templates;
- permitted non-standard terms categories;
- data access scopes;
- export scopes;
- partner deal-registration rights;
- approval escalation path;
- effective/expiry dates;
- suspension status.

## Legal classification note

Commission payment method does not determine employee/contractor status. Actual control, economic relationship, jurisdiction, and agreement govern classification. The runtime system must therefore store a contractual relationship type rather than infer legal status from seller class.

---

<!-- SOURCE: 09_PARTNER_CHANNEL_AND_DEAL_REGISTRATION.md -->

# 09 — Partner, Channel, and Deal Registration Architecture

## Goals

- scale distribution through industry relationships;
- prevent duplicate claims and channel conflict;
- preserve customer choice;
- make attribution evidence-based;
- prevent partners from creating unsupported commitments.

## Partner lifecycle

```text
APPLIED
 → DUE_DILIGENCE
 → CONTRACTED
 → TRAINING
 → CERTIFIED
 → ACTIVE
 → SUSPENDED / EXPIRED / TERMINATED
```

## Deal registration

A partner may register an account/opportunity with:

- prospect legal/business identity;
- source/evidence;
- contact consent/lawful basis where required;
- target product family;
- date/time;
- conflict check;
- expiry window.

Registration creates a claim for review, not permanent ownership of a customer.

## Conflict rules

Deterministic precedence should consider:

1. existing customer relationship;
2. active protected opportunity;
3. first qualified registration with sufficient evidence;
4. customer-requested seller/partner;
5. strategic account restrictions;
6. anti-gaming rules.

Manual override requires reason, approver, evidence, and append-only correction—not history deletion.

## Partner commercial models

Supported concepts may include:

- referral fee;
- first-year revenue share;
- recurring/residual share;
- reseller margin;
- implementation/services revenue;
- strategic co-sell.

The architecture does not set final percentages. Finance/legal/commercial approval controls program terms.

## Partner safety

Partners receive only the data needed for their role. They do not gain access to all customer/twin/network data because they sourced the account.

---

<!-- SOURCE: 10_TERRITORY_ROUTING_AND_ACCOUNT_OWNERSHIP.md -->

# 10 — Territory, Routing, and Account Ownership

## Principle

Territories are routing and compensation constructs, not property rights over customers.

## Supported dimensions

- participant type;
- vertical/operating segment;
- company size;
- geography;
- named account;
- partner source;
- product family;
- strategic-account flag.

## Preferred early model

Use vertical/segment specialization where it improves domain credibility, with named-account protection for complex enterprise pursuits. Do not rely only on geography.

## Account identity

Account matching must normalize subsidiaries, DBAs, domains, parent groups, DOT/MC or facility identifiers where lawfully appropriate, and other business identities to prevent duplicates.

## Ownership state

```text
UNASSIGNED
 → ROUTED
 → ACCEPTED
 → ACTIVE_PURSUIT
 → PROTECTED
 → WON / LOST / RECYCLE
```

Protection requires activity/evidence and expires. Dormant accounts return to routing under policy.

## Anti-gaming

- bulk placeholder registrations do not create ownership;
- fake activity is auditable misconduct;
- seller-created duplicate accounts are merged through governed identity resolution;
- attribution cannot depend solely on mutable CRM owner field.

---

<!-- SOURCE: 11_OPPORTUNITY_AND_COMMERCIAL_WORKUNIT_LIFECYCLE.md -->

# 11 — Opportunity and Commercial WorkUnit Lifecycle

## Opportunity stages

```text
IDENTIFIED
 → QUALIFIED
 → DISCOVERY
 → SOLUTION_FIT
 → COMMERCIAL_REVIEW
 → SECURITY_LEGAL_PROCUREMENT
 → COMMIT
 → WON / LOST / HOLD
 → IMPLEMENTATION_HANDOFF
```

Stage names may map to an existing CRM; the durable semantic state must remain explicit.

## Required evidence by stage

### Qualified
- verified organization/contact;
- target participant type;
- plausible pain/use case;
- fit/exclusion checks.

### Discovery
- current workflow;
- actors/systems;
- measurable pain;
- required integrations;
- decision process;
- constraints.

### Solution fit
- proposed Twin(s);
- capabilities;
- rollout mode;
- dependencies;
- known gaps;
- unsupported requests separated.

### Commercial review
- approved pricing inputs;
- discount gates;
- term;
- meter/quantity;
- commission-affecting facts.

### Security/legal/procurement
- approved responses;
- deviations tracked;
- no self-attested unsupported compliance claims.

### Won
- executed agreement/order evidence;
- exact offer versions;
- entitlement intent;
- implementation handoff package.

## Commercial WorkUnits

Every consequential task can be represented as a WorkUnit with one accountable owner, deadline, inputs, outputs, escalation, evidence, and idempotent side-effect semantics where applicable.

---

<!-- SOURCE: 12_SALES_PROMISE_FIREWALL.md -->

# 12 — Sales Promise Firewall

## Purpose

Prevent commercial pressure from creating technical, security, legal, operational, or roadmap obligations outside approved authority.

## Protected promise classes

- feature availability;
- capability behavior;
- autonomy level;
- integration support;
- migration scope;
- implementation date;
- uptime/SLA;
- performance/scale;
- security controls;
- compliance/certification;
- data residency/retention;
- legal/regulatory behavior;
- custom development;
- support coverage;
- pricing/discount/term;
- roadmap commitment;
- third-party/vendor behavior.

## Evaluation

```text
Requested statement/commitment
        ↓
Resolve promise class
        ↓
Fetch authoritative registry/policy
        ↓
Is exact claim allowed for this offer/customer/authority profile?
   ├─ YES → approved language / evidence reference
   └─ NO  → exception workflow or reject
```

## Rules

1. AI-generated text must pass the same gate as human-authored text.
2. Free-text edits after approval invalidate approval if protected fields/claims change.
3. A demo environment must identify simulated/non-production capability where material.
4. Roadmap discussions must distinguish aspiration from approved contractual commitment.
5. Security questionnaires must source claims from a controlled trust/control registry.
6. Scale claims require test/evidence; theoretical architecture is not production proof.
7. Unsupported customer requirement becomes `GAP`, not silently re-labeled as configuration.

## Promise artifact

Every externally binding proposal/order/SOW should reference a structured `PromiseSet` containing approved claim IDs/versions and exception approvals.

## Enforcement points

- proposal generator;
- quote approval;
- e-signature packet generation;
- partner portal;
- outbound AI/email drafting where binding claims are present;
- RFP/security questionnaire output;
- CRM commit stage.

---

<!-- SOURCE: 13_PRICING_DISCOUNT_QUOTE_AND_DEAL_DESK.md -->

# 13 — Pricing, Discount, Quote, and Deal Desk

## Pricing architecture

Pricing should consume:

- SKU/version;
- quantity/value meter;
- term;
- deployment tier;
- implementation scope;
- support tier;
- approved partner economics;
- taxes/pass-throughs where appropriate;
- approved discount program.

## Deterministic core

Final arithmetic and authorization are deterministic. Models may recommend or explain but do not become the source of numeric authority.

## Discount control

Example authority hierarchy:

```text
standard seller → bounded discount
senior/enterprise seller → larger bounded discount
revenue leader/deal desk → exception band
executive/owner → extraordinary exception
```

Exact thresholds are owner/commercial decisions, not hard-coded by this package.

## Quote immutability

A quote version includes:

- quote ID/version;
- catalog version;
- pricing-rule version;
- customer/account;
- SKUs/capabilities;
- quantities/meters;
- term;
- discount and approval evidence;
- expiration;
- PromiseSet version;
- taxes/pass-through treatment;
- partner attribution.

Accepted quote terms are never silently mutated.

## ROI

ROI models must separate:

- customer-provided facts;
- verified observed facts;
- benchmark assumptions;
- scenario assumptions;
- estimated savings;
- guaranteed outcomes (normally none unless explicitly contractually approved).

A salesperson cannot present an estimate as guaranteed savings.

---

<!-- SOURCE: 14_ATTRIBUTION_COMMISSION_AND_PAYOUT_LEDGER.md -->

# 14 — Attribution, Commission, and Payout Ledger

## Principle

Commission is an auditable financial calculation, not a mutable CRM opinion.

## Event chain

```text
Lead source
 → Account identity
 → Deal registration
 → Opportunity contributors
 → Commercial agreement
 → Invoice/receivable
 → Cash collection
 → Eligibility event
 → Commission calculation
 → Vesting/hold
 → Approval
 → Payout
 → Correction/clawback if contractually valid
```

## Recommended commission base

A configurable definition such as:

```text
Eligible Revenue =
  qualifying cash collected
  - refunds
  - credits
  - excluded taxes
  - excluded pass-through costs
```

Program-specific terms may differ, but the formula must be versioned and deterministic.

## Commission plan

Each plan records:

- plan ID/version;
- eligible relationship classes;
- eligible SKUs/revenue types;
- rates/tiers/accelerators;
- split rules;
- expansion/residual treatment;
- collection/vesting trigger;
- refund/clawback rules;
- dispute window;
- effective dates;
- approval.

## Attribution

Possible roles:

- source/referrer;
- opportunity owner;
- closer;
- solution advisor;
- partner;
- expansion owner.

A revenue event may split credit under a versioned rule. Percentages must sum deterministically and reject invalid combinations.

## Clawbacks/corrections

Only contractually defined events can create negative adjustments. Never rewrite the original earning event; append a correction linked to it.

## No direct payout authority

RevenueOS calculation may produce a payable recommendation. Actual money movement follows finance/payment authorization controls outside model discretion.

## Disputes

Disputes freeze only the contested portion where practical and preserve all source evidence. Resolver must be independent from the sole beneficiary of the override.

---

<!-- SOURCE: 15_SELLER_PARTNER_CERTIFICATION.md -->

# 15 — Seller and Partner Certification

## Purpose

A seller's deal authority should depend on proven knowledge, not only account assignment.

## Certification ladder

```text
S0 REGISTERED
S1 PRODUCT FOUNDATIONS
S2 DISCOVERY QUALIFIED
S3 CAPABILITY CONFIGURATION
S4 COMMERCIAL AUTHORIZED
S5 ENTERPRISE AUTHORIZED
S6 STRATEGIC / PARTNER SPECIALIST
```

These levels are separate from agent Job Certification J0–J7.

## Required domains

- FreightOS mission and product boundaries;
- Participant Operational Twins;
- capability catalog;
- workflow/agent distinction;
- autonomy limits;
- security/privacy basics;
- prohibited promises;
- pricing/discount authority;
- partner/channel rules;
- customer discovery;
- ROI assumptions;
- implementation handoff;
- data handling;
- legal/regulatory escalation.

## Testing

Certification should include scenario-based tests:

- customer asks for unsupported feature;
- customer demands production autonomy before certification;
- discount above authority;
- competitor/security claim request;
- customer supplies sensitive data improperly;
- partner ownership conflict;
- roadmap-date pressure;
- request to misstate scale/compliance;
- customer wants brokerage capability while legal gate is dormant;
- customer wants one capability but seller attempts unnecessary bundle.

## Promotion

Certification is evidence-based, expires/reviews periodically, and may be suspended for misconduct or material catalog changes.

---

<!-- SOURCE: 16_REVENUEOS_AGENT_WORKFORCE.md -->

# 16 — RevenueOS Agent Workforce

## Separation from v1.8 logistics workforce

This package proposes a **commercial-plane workforce** for audit. It does not silently append jobs to the accepted 76-job logistics workforce registry. Claude must determine the correct repository integration after cross-package review.

## Proposed jobs/components

| Job/component | Class | Mission | Explicit non-scope |
|---|---|---|---|
| Revenue Operations Orchestrator | deterministic/workflow router | route commercial WorkUnits | no commercial approval |
| Account Intelligence Agent | agent | research account/operating context | no authority claims |
| Prospecting Agent | agent | identify/contact eligible prospects under policy | no spam/consent bypass |
| Qualification Service | hybrid/deterministic | score fit/exclusions | no final contract authority |
| Discovery Copilot | agent | prepare/capture structured discovery | no Twin approval |
| Solution Configuration Agent | agent | map needs to catalog capabilities | no unsupported SKU creation |
| ROI Engine | deterministic service | calculate approved scenarios | no fabricated inputs/guarantees |
| Pricing Engine | deterministic service | price approved SKUs | no policy override |
| Proposal Agent | agent | assemble approved offer language | Promise Firewall required |
| Security/RFP Agent | human-supervised agent | draft sourced responses | no unsupported control claims |
| Deal Desk Coordinator | human-supervised workflow | route exceptions/approvals | no self-approval |
| CRM/Opportunity Steward | hybrid agent | maintain state/evidence | no attribution history rewrite |
| Partner Operations Agent | hybrid agent | onboarding/deal registration support | no partner authority grant |
| Implementation Handoff Agent | agent | package sold configuration/evidence | no activation |
| Expansion Agent | agent | find evidence-based expansion fit | no dark patterns/auto-buy |
| Commission Calculation Service | deterministic service | derive earnings from events | no payout authority |
| Commercial Compliance Guard | deterministic/hybrid | detect promise/authority/policy violations | no exception approval |

## Universal controls

Every enabled revenue component requires:

- tenant/commercial-plane identity;
- manifest/version;
- purpose;
- allowed data scopes;
- approved tools;
- approved action classes;
- human approval rules;
- audit/evidence;
- kill switch;
- model policy where applicable;
- evaluation/certification;
- no production logistics authority by default.

## Typed commercial handoffs

Examples:

- `AccountBrief`
- `QualificationDecision`
- `DiscoveryRecord`
- `SolutionConfigurationProposal`
- `ROIScenario`
- `QuoteRequest`
- `PromiseCheckResult`
- `ProposalPackage`
- `ExceptionRequest`
- `DealRegistration`
- `ImplementationHandoff`
- `ExpansionRecommendation`
- `CommissionCalculation`

Free-form agent chat cannot create authority.

## Market Intelligence Division

RevenueOS also owns the customer-facing market-intelligence function defined in `31_FREIGHT_MARKET_INTELLIGENCE_SUBSTRATE.md` through `38_MARKET_INTELLIGENCE_SOURCE_STRATEGY.md`. Its proposed decomposition is in `35_MARKET_INTELLIGENCE_AGENT_WORKFORCE.md`.

Those jobs/components are **not automatically additions to the 17 roles above or the accepted v1.8 logistics workforce**. Claude must detect overlap/merge opportunities and decide whether each responsibility belongs in RevenueOS, a shared FMI service, an existing participant workforce, a deterministic service, or a human-governed process.

---

<!-- SOURCE: 17_REVENUE_WORKFLOW_GRAPHS.md -->

# 17 — Revenue Workflow Graphs

## Graph A — Prospect to qualified opportunity

```text
Account discovered
 → identity/deduplication
 → outreach eligibility/policy
 → contact/outreach
 → response/intent
 → qualification evidence
 → QUALIFIED or RECYCLE/HOLD
```

## Graph B — Discovery to configuration

```text
Qualified opportunity
 → discovery WorkUnits
 → operating workflow map
 → systems/integration inventory
 → pain/value evidence
 → participant/Twin fit
 → capability match
 → gaps separated
 → rollout-mode proposal
 → solution review
```

## Graph C — Quote/proposal

```text
Solution configuration
 → catalog validation
 → pricing inputs
 → deterministic pricing
 → discount authority
 → Promise Firewall
 → security/legal checks as required
 → proposal version
 → customer review
 → revise via new version or accept
```

## Graph D — Closed won to implementation

```text
Executed agreement/order
 → verify offer version
 → create entitlement intent
 → create implementation handoff
 → implementation validates prerequisites
 → Twin/customer configuration review
 → integrations/conformance
 → shadow/certification gates
 → activation decision outside sales plane
```

## Graph E — Expansion

```text
Operational evidence
 → value/usage signal
 → capability-fit hypothesis
 → customer-success review
 → expansion discovery
 → normal quote/proposal controls
 → entitlement change
 → normal activation controls
```

## Graph F — Commission

```text
Eligible financial event
 → resolve plan/version
 → resolve attribution snapshot
 → calculate
 → validate holds/clawback rules
 → finance approval
 → payout record
 → reconciliation
```

## Crash/idempotency rule

Any workflow that produces CRM mutations, proposals, orders, entitlement requests, external messages, or financial events must define idempotency/reconciliation behavior. Duplicate delivery must not duplicate a binding effect.

---

<!-- SOURCE: 18_CUSTOMER_SOLUTION_CONFIGURATION.md -->

# 18 — Customer Solution Configuration

## RevenueOS output

The core commercial output is a structured `SolutionConfigurationProposal`, not merely a slide deck.

It contains:

- prospect/customer identity;
- participant/Twin(s);
- verified current workflows;
- pain/value evidence;
- proposed capabilities and versions;
- excluded/unneeded capabilities;
- required integrations;
- required data sources;
- proposed rollout mode per capability;
- requested autonomy vs supported/certified ceiling;
- implementation dependencies;
- gaps/unsupported requests;
- ROI scenarios and assumptions;
- commercial offer reference;
- approvals/evidence;
- customer Market Relevance Profile when an intelligence capability is proposed;
- required market-signal domains, source classes, freshness and consumer boundaries;
- explicit statement of which intelligence is informational versus eligible as governed workflow evidence.

## Minimalism rule

Recommend the smallest coherent configuration that solves the stated problem. Do not maximize SKU count by default.

## Gap taxonomy

- `CONFIGURABLE` — supported with customer configuration;
- `INTEGRATION_REQUIRED` — supported after approved adapter binding;
- `PILOT_ONLY` — not GA, controlled pilot possible;
- `PRODUCT_GAP` — not supported;
- `LEGAL_POLICY_BLOCK` — cannot offer until gate resolved;
- `OUT_OF_SCOPE` — not a FreightOS responsibility.

## Customer-facing explanation

Translate architecture to operating outcomes. Customers need not understand graph theory or agent manifests to adopt the system. Enterprise customers may inspect deeper architecture/security artifacts under controlled disclosure.

---

<!-- SOURCE: 19_IMPLEMENTATION_HANDOFF_AND_ACTIVATION_BOUNDARY.md -->

# 19 — Implementation Handoff and Activation Boundary

## Purpose

Prevent the classic failure where sales says “closed won” and implementation discovers a materially different product promise.

## Required handoff package

- executed order/contract references;
- offer/catalog version;
- exact capability entitlements;
- PromiseSet;
- approved exceptions;
- discovery evidence;
- SolutionConfigurationProposal;
- integration inventory;
- data/privacy constraints;
- deployment/support tier;
- timeline commitments actually approved;
- customer stakeholders/approvers;
- known gaps;
- acceptance criteria.

## Implementation acceptance

Implementation may:

- accept the handoff;
- return it for missing evidence;
- flag a promise/catalog conflict;
- propose corrected configuration;
- block activation.

Implementation does not have to honor an unauthorized sales promise merely because it appears in notes.

## Activation

Sales may request activation but does not approve it. Activation follows existing Twin, workflow, workforce certification, authority, security, legal, and integration conformance gates.

## Post-activation

Customer-success/RevenueOS receives outcome telemetry appropriate to commercial purpose, not unrestricted raw operational data.

---

<!-- SOURCE: 20_EXPANSION_RENEWAL_AND_NETWORK_FLYWHEEL.md -->

# 20 — Expansion, Renewal, and Network Flywheel

## Expansion principle

Expansion is based on demonstrated customer need/value and network opportunity, not forced full-platform adoption.

## Signals

Examples:

- repeated manual WorkUnits adjacent to an enabled capability;
- customer-requested workflow;
- high exception volume;
- integration/network friction;
- facility/carrier/shipper counterparties repeatedly interacting through FreightOS;
- nearing contracted meter/capacity;
- customer outcome metrics showing readiness for next rollout stage;
- persistent market conditions showing a capability could materially reduce customer exposure (for example recurring capacity volatility, facility congestion spillover, or maintenance-service scarcity), provided the signal is evidence-based and not manufactured urgency.

## Constraints

- signals must respect purpose/privacy boundaries;
- model recommendation does not auto-purchase;
- customer must receive transparent commercial terms;
- autonomy expansion is a separate certification/approval decision;
- network counterparties are not automatically converted into prospects using confidential operational information.

## Flywheel

```text
Unilateral capability value
 → customer adoption
 → better counterparty interaction
 → verified network identity/history
 → lower coordination friction
 → optional connected/native participation
 → more workflows become automatable
 → additional capability value
```

## Renewal

Renewal should consider:

- realized outcomes;
- contracted vs actual usage;
- incident/support history;
- capability/version lifecycle;
- required migration;
- customer satisfaction;
- network value;
- pricing policy.

Do not hide degraded capability or unresolved material incidents during renewal.

---

<!-- SOURCE: 21_SECURITY_PRIVACY_LEGAL_AND_COMPLIANCE.md -->

# 21 — Security, Privacy, Legal, and Compliance Requirements

## Existing controls remain controlling

RevenueOS inherits FreightOS zero-trust, tenant isolation, data classification, audit, idempotency, vendor, incident, and AI governance controls.

## Commercial-specific threats

- CRM cross-tenant leakage;
- prompt injection from prospect documents/RFPs/emails;
- seller data exfiltration;
- unauthorized customer list export;
- partner over-access;
- fabricated product/security claims;
- commission fraud;
- fake referral registrations;
- malicious attribution changes;
- quote tampering;
- contract/offer version mismatch;
- shadow spreadsheets creating competing truth;
- AI emailing binding statements without approval;
- misuse of sensitive network/operational data for prospecting.

## Required safeguards

- least privilege;
- purpose-scoped views;
- DLP/export controls appropriate to data class;
- structured product/trust claim registry;
- signed/versioned quote/proposal artifacts where appropriate;
- append-only audit for consequential commercial events;
- dual control for sensitive overrides;
- external-message safeguards;
- partner isolation;
- secret protection;
- retention/deletion rules;
- legal review of worker/partner agreements, commissions, marketing/outreach, data use, and regulated product claims.

## Compliance claims

Sales/partners may only claim certifications/compliance actually achieved and approved for external use. “Designed toward” or “readiness” must not be represented as certification.

## Brokerage/financial boundaries

Commercial demand cannot activate brokerage, payment, financing, insurance, or other regulated planes before their accepted legal/authority gates are satisfied.

---

<!-- SOURCE: 22_OBSERVABILITY_METRICS_AND_REVENUE_QUALITY.md -->

# 22 — Observability, Metrics, and Revenue Quality

## Principle

RevenueOS measures more than bookings. The target is supportable, collectible, retained revenue with successful adoption.

## Funnel metrics

- sourced accounts;
- qualified rate;
- discovery conversion;
- solution-fit conversion;
- proposal conversion;
- win rate;
- sales cycle;
- partner-sourced mix;
- cost per qualified opportunity where measurable.

## Revenue-quality metrics

- implementation rejection/rework rate;
- unauthorized promise rate;
- product-gap rate;
- time from won to accepted handoff;
- time to first value;
- activation success;
- early cancellation/refund;
- collection quality;
- expansion/renewal;
- support burden by sold configuration;
- exception/discount rate;
- commission dispute rate.

## Network metrics

- connected counterparties per active customer;
- cross-participant workflow completion;
- adoption progression External → Connected → Native where applicable;
- network interactions delivered without requiring native adoption;
- capability expansion attributable to real network value.

## Guardrails

No KPI may incentivize:

- misrepresentation;
- unsafe autonomy;
- illegal outreach;
- unnecessary SKU bundling;
- concealment of product gaps;
- bypass of implementation/security/legal review;
- customer lock-in through data obstruction.

## Evidence

Dashboards must be reconstructable from authoritative events/projections with definitions/versioning for material metrics.

## Market-intelligence quality metrics

- source freshness/availability;
- ingestion latency;
- provenance completeness;
- stale-signal delivery rate;
- correction propagation latency;
- conflict/disagreement rate;
- lane/sample coverage where applicable;
- forecast error/calibration by horizon and domain;
- customer-alert precision/recall where measurable;
- relevance false-positive/false-negative rate;
- customer suppression/notification preferences honored;
- source-rights violations: target zero;
- cross-tenant/network re-identification violations: target zero.

---

<!-- SOURCE: 23_TESTING_ADVERSARIAL_AND_FAILURE_INJECTION.md -->

# 23 — Testing, Adversarial, and Failure-Injection Standard

## Product/catalog tests

- quote references retired capability;
- catalog changes during active quote;
- bundle expansion produces correct entitlements;
- capability dependency missing;
- unsupported autonomy claim;
- stale certification status;
- agent implementation changed but capability contract unchanged;
- material change requires version bump.

## Promise Firewall attacks

- human edits approved proposal after approval;
- LLM invents roadmap date;
- partner claims unsupported integration;
- RFP agent claims nonexistent certification;
- seller converts “planned” into “available”;
- customer asks agent to bypass policy;
- injected PDF/email tells agent to approve claim.

## Authority tests

- referral scout attempts binding quote;
- seller exceeds discount ceiling;
- partner accesses another partner/customer account;
- RevenueOS agent attempts Twin write;
- commercial user attempts activation;
- deal-desk requester self-approves exception.

## Attribution/commission tests

- duplicate lead registrations;
- duplicate cash event;
- refund after payout;
- split totals >100%;
- plan version changes mid-deal;
- seller changes CRM owner after close;
- manual override without approval;
- parent/subsidiary identity collision;
- currency/tax/pass-through edge cases;
- replay after crash.

## Workflow resilience

Inject crashes:

- before/after outbound email;
- before/after quote creation;
- before/after e-sign packet generation;
- before/after entitlement request;
- before/after commission event;
- during partner registration conflict resolution.

Prove one intended business effect and visible reconciliation.

## Privacy/security

- cross-tenant CRM/API/search/export tests;
- prompt injection in RFPs/prospect docs;
- data exfiltration attempts;
- seller tries to query unrelated operational data;
- partner token overreach;
- secret leakage in proposal/logs.

## Certification

No production commercial automation with external/binding effects is accepted solely because unit tests pass. Use offline, adversarial, replay, shadow, and bounded promotion appropriate to the component/action class.

## Market intelligence attacks

The complete FMI suite is defined in `37_MARKET_INTELLIGENCE_TESTS_AND_ACCEPTANCE_GATES.md`. At minimum test stale rates, thin-lane overconfidence, source conflicts, false/rumor news, prompt injection in articles, license/redistribution violations, private-rate leakage, source outages, correction lineage, forecast-vs-observation confusion, customer relevance overreach, and attempts to convert a market signal directly into Carrier/Broker/Facility/Maintenance authority.

---

<!-- SOURCE: 24_ACCEPTANCE_GATES_REV_01_REV_48.md -->

# 24 — RevenueOS Acceptance Gates (REV-01..REV-48)

Use the strict status vocabulary already controlling in the repository audit context: `PASS`, `PARTIAL`, `FAIL`, `NOT IMPLEMENTED`, `NOT APPLICABLE` with rationale. Documentation alone cannot make a runtime gate PASS.

| ID | Gate | Minimum evidence |
|---|---|---|
| REV-01 | Canonical product registry exists | versioned registry + ownership + CI validation |
| REV-02 | Product/Twin/capability hierarchy explicit | schema + fixtures + repository mapping |
| REV-03 | Capability is contract boundary, not agent identity | mappings show many-to-many implementation support |
| REV-04 | Sellable lifecycle status governed | transition policy + approvals + tests |
| REV-05 | Catalog is single commercial source | consumers identified; shadow catalog blocked/detected |
| REV-06 | Entitlement is versioned | schema + lifecycle tests |
| REV-07 | Entitlement cannot authorize commands | negative authorization tests |
| REV-08 | Activation state separate | independent state/gate tests |
| REV-09 | Bundle expands to atomic entitlements | deterministic expansion tests |
| REV-10 | Capability dependencies enforced | invalid activation/quote denied |
| REV-11 | Seller authority profile explicit | schema + policy tests |
| REV-12 | Absence of seller grant fails closed | negative tests |
| REV-13 | Partner isolation enforced | cross-partner/customer negative tests |
| REV-14 | Deal registration deterministic/audited | conflict/replay tests |
| REV-15 | Account identity/deduplication controlled | duplicate/entity tests |
| REV-16 | Opportunity stage evidence defined | workflow/state tests |
| REV-17 | Revenue WorkUnits durable where required | restart/recovery evidence |
| REV-18 | Commercial orchestrator has no super-authority | negative tests |
| REV-19 | Revenue agents have no logistics operating authority | command/Twin-write denial tests |
| REV-20 | Promise Firewall covers protected claims | policy + adversarial suite |
| REV-21 | Proposal edits invalidate stale approvals | tamper/version tests |
| REV-22 | Roadmap claims controlled | unsupported-date tests |
| REV-23 | Security/compliance claims sourced | trust-registry linkage + negative tests |
| REV-24 | Scale/performance claims evidence-backed | evidence reference required |
| REV-25 | Pricing arithmetic deterministic | golden tests/property tests |
| REV-26 | Discount limits deterministic | boundary/override tests |
| REV-27 | Quote versions immutable/reconstructable | history/replay tests |
| REV-28 | ROI assumptions distinguish fact vs estimate | schema + rendering tests |
| REV-29 | Closed-won handoff is structured | contract/fixture + validation |
| REV-30 | Implementation may reject unsupported handoff | state/exception tests |
| REV-31 | Sales cannot activate production capability | negative tests |
| REV-32 | Expansion uses same controls as initial sale | workflow tests |
| REV-33 | Commission plan versioned | schema + effective-date tests |
| REV-34 | Commission based on authoritative events | source/reconciliation proof |
| REV-35 | Duplicate collection cannot double-pay | idempotency tests |
| REV-36 | Attribution history append-only/correctable | mutation/correction tests |
| REV-37 | Split rules deterministic | property tests |
| REV-38 | Clawback/correction linked to original | ledger tests |
| REV-39 | Calculation cannot move money | authorization separation proof |
| REV-40 | Commission disputes preserve evidence | dispute workflow tests |
| REV-41 | Seller certification gates authority | promotion/expiry tests |
| REV-42 | Partner certification gates rights | negative + expiry tests |
| REV-43 | Prospecting/outreach obeys legal/policy controls | policy tests + audit |
| REV-44 | Commercial data least-privilege | tenant/purpose/export tests |
| REV-45 | External AI messages bounded | approval/promise/injection tests |
| REV-46 | Commercial observability measures revenue quality | dashboards/definitions/evidence |
| REV-47 | Network expansion does not misuse confidential data | data-use negative tests |
| REV-48 | No implementation claim relies on docs alone | repo SHA + executable evidence |

## Blocking rules

Any `FAIL` in REV-07, 12, 13, 19, 20, 23, 25, 26, 31, 34, 35, 39, 43, 44, 45, or 47 blocks production RevenueOS activation for the affected surface.

The cross-package audit may identify stricter inherited blockers; those also block.

## FMI gate family

REV-01..REV-48 remain the commercial-plane gate family. Market-intelligence architecture has a separate additive gate family, **FMI-01..FMI-28**, defined in `37_MARKET_INTELLIGENCE_TESTS_AND_ACCEPTANCE_GATES.md`. Neither family weakens the other.

---

<!-- SOURCE: 25_REPOSITORY_INTEGRATION_BOUNDARIES.md -->

# 25 — Repository Integration Boundaries

## Audit first

Do not assume the repository should create new services/tables merely because this package names them conceptually. Claude must inventory existing primitives and reuse them where they satisfy the contract.

## Reuse candidates to inspect

- tenant/organization/participant identity;
- role/permission/authority framework;
- capability registry or agent registry;
- workflow/WorkUnit infrastructure;
- event/outbox/inbox/idempotency;
- policy engine;
- audit/evidence ledger;
- integration/adaptor registry;
- billing/plan/entitlement structures;
- existing CRM/integration hooks if any;
- workforce manifests and Job Books;
- deployment/cell boundaries;
- security/control registry.

## Do not create parallel truths

Prohibited without explicit architectural justification:

- second organization hierarchy;
- second authority engine;
- second audit ledger;
- separate customer identity model for sales;
- duplicate capability registry;
- duplicate workflow runtime;
- ungoverned “sales feature” database;
- spreadsheet as authoritative commission ledger;
- partner-specific code forks;
- customer-specific agent code forks.

## Expected additive surfaces after audit

Potential implementation surfaces may include:

- capability/offer schema additions;
- entitlement separation/extension;
- commercial authority profiles;
- PromiseSet/promise policy;
- opportunity/work-unit contracts;
- attribution/commission ledger projection;
- partner/deal-registration contracts;
- RevenueOS workforce manifests/jobs;
- tests/fixtures/CI gates.

These are hypotheses, not authorization.

## Migration doctrine

Any runtime schema change must use repository-standard safe migration practices, preserve existing behavior, and have rollback/forward-fix evidence. Installation of this handoff itself is documentation only.

---

<!-- SOURCE: 26_CROSS_PACKAGE_AUDIT_SPEC.md -->

# 26 — Cross-Package Audit Specification

## Objective

Before v1.9 proceeds, determine whether this v1.8.1 package is coherent with the accepted FreightOS architecture and real repository state.

## Required accepted inputs

Audit the merged/accepted repository and controlling packages, including at least:

- v1.3 Security & Resilience;
- v1.4 Network Architecture;
- v1.5 Enterprise Agent Operations;
- FacilityOS handoff associated with the accepted agent-operations architecture;
- v1.6 Brokerage Operations;
- v1.7 Agentic Logistics Network Coherence;
- v1.8 Agent Workforce Engineering & Certification;
- repository-local W0/W1 audit artifacts that are merged/accepted and applicable;
- current runtime/database/tests/CI.

Do not use an unmerged or unaccepted design branch as evidence.

## v1.9 quarantine

Do not read or use `design/v1.9.0-workforce-operational-design-completion` as design evidence. Preserve it untouched. This audit exists specifically to determine what should happen before further v1.9 work.

## Questions Claude must answer

1. Does “Capability as commercial boundary” conflict with any accepted product boundary?
2. Does v1.7 already contain sufficient entitlement/catalog primitives?
3. How should Capability references map to v1.8's 76 jobs/components and Job Books?
4. Are there existing capability packs that should be canonical rather than new catalog objects?
5. Can commercial entitlements be represented without weakening authority?
6. Which existing tables/types/services already implement plan/subscription/entitlement concepts?
7. Where should RevenueOS live without polluting participant legal/operational planes?
8. Can existing WorkUnit/graph infrastructure represent revenue workflows?
9. What is the correct identity/role model for external sellers/partners?
10. Which data classes may RevenueOS access?
11. Where should PromiseSet and approved product/security claims live?
12. Does an existing audit/event ledger satisfy commission provenance?
13. Which financial/payment boundaries must remain outside RevenueOS?
14. What must be added to CI to prevent catalog/promise/entitlement drift?
15. Which proposed RevenueOS jobs are agent/hybrid/deterministic/workflow/human/merge/missing?
16. Do any proposed jobs duplicate v1.8 roles?
17. What new Job Books/certification would eventually be required?
18. Which REV gates are already PASS/PARTIAL/FAIL/NOT IMPLEMENTED/NA from executable evidence?
19. Are any rules in this package weaker than inherited controls?
20. What owner decisions remain before implementation?
21. Which accepted jobs/components already perform freight-market, rate, capacity, news, disruption, commodity, fuel, multimodal, or maintenance-market intelligence?
22. Should each proposed FMI responsibility be RevenueOS-owned, shared substrate, participant-domain owned, deterministic service, workflow, human role, merge, or not implemented?
23. Can current event/evidence schemas represent provenance, freshness, confidence, correction lineage, and rights policy without creating a shadow source of truth?
24. Which existing Carrier/Brokerage/Facility/Shipper/Service jobs may consume FMI, and what authority boundaries must be proven?
25. What source/license/rights controls are absent?
26. Which FMI-01..FMI-28 gates are PASS/PARTIAL/FAIL/NOT IMPLEMENTED/NA from executable evidence?

## Audit outputs

Create repository-local audit artifacts outside immutable production-handoff package content, following existing audit precedent. Recommended folder:

```text
docs/revenueos-architecture-review/
```

Required files:

- `README.md`
- `CURRENT_PRODUCT_COMMERCIAL_INVENTORY.md`
- `CAPABILITY_GRAPH_GAP_MAP.md`
- `ENTITLEMENT_ACTIVATION_GAP_MAP.md`
- `REVENUE_PLANE_AUTHORITY_MAP.md`
- `REVENUE_WORKFORCE_DECOMPOSITION.md`
- `PROMISE_FIREWALL_GAP_MAP.md`
- `PARTNER_CHANNEL_GAP_MAP.md`
- `ATTRIBUTION_COMMISSION_GAP_MAP.md`
- `DATA_PRIVACY_BOUNDARY_MAP.md`
- `REV_01_REV_48_MATRIX.md`
- `FMI_ARCHITECTURE_AND_SOURCE_GAP_MAP.md`
- `FMI_WORKFORCE_DECOMPOSITION.md`
- `FMI_OPERATIONAL_CONSUMER_AUTHORITY_MAP.md`
- `FMI_01_FMI_28_MATRIX.md`
- `CROSS_PACKAGE_CONFLICT_REGISTER.md`
- `PROPOSED_ADDITIVE_PR_SEQUENCE.md`
- `OWNER_DECISIONS.md` only if genuine decisions remain.

## Evidence rule

A gate is not PASS based on this handoff, an unmerged branch, a mock, or an architectural assumption. Cite repository paths, migrations, tests, commands, SHA, and runtime/CI evidence as appropriate.

## Stop condition

After the audit artifacts are produced and verified, **STOP**. Do not implement RevenueOS runtime work and do not resume v1.9 until owner review/authorization.

## Graph/Job Book reconciliation

The cross-package audit must reconcile every `AUDIT_CANDIDATE` RevenueOS/FMI Job Book and every `REV-G*`, `FMI-G*`, and `XPL-G*` graph against accepted v1.5–v1.8 responsibilities, WorkUnit ownership, typed handoffs, authority, autonomy, and existing durable workflow runtime. It must score `GR-01..GR-32` and stop before implementation.

## Operational Twin coexistence hypotheses

Test rather than assume:

- H14. One ParticipantOperationalTwin contract can support human-led through bounded-autonomy workflows without separate product foundations.
- H15. Existing TMS/WMS/ERP/ELD/etc. can remain authoritative for declared scopes while FreightOS provides agent/network value.
- H16. Field/object authority and synchronization can be explicit enough to prevent split-brain truth and adapter loops.
- H17. Human and agent work can share repository-native WorkUnits with one accountable owner per state.
- H18. Observed customer behavior can produce Twin change proposals without hidden learning or self-modified authority.
- H19. Internal Twin state can be projected into minimum-necessary network artifacts without exposing raw private state.
- H20. Native FreightOS customers can coordinate with non-native/connected counterparties without forcing simultaneous adoption.
- H21. Network messages can enter local workflows without transferring sender authority.
- H22. The repository can implement the 12 TWIN graphs without a second orchestration/runtime stack.

Audit TW-01..TW-40 and produce: `TWIN_RUNTIME_COEXISTENCE_GAP_MAP.md`, `SYSTEM_OF_RECORD_BINDING_MAP.md`, `HUMAN_AGENT_WORKUNIT_COEXISTENCE.md`, `TWIN_NETWORK_INGRESS_EGRESS_MAP.md`, `TWIN_LEARNING_CHANGE_CONTROL_GAP.md`, and `TW_01_TW_40_MATRIX.md`.

---

<!-- SOURCE: 27_OWNER_DECISIONS.md -->

# 27 — Owner Decisions Reserved

This architecture intentionally does not invent these business decisions.

## Commercial packaging

1. Final product/capability customer-facing names.
2. Initial launch capability set by participant type.
3. Bundle strategy vs a-la-carte default.
4. Free/trial/pilot policy.
5. Initial value meters and minimum commitments.
6. Pricing and implementation fees.

## Sales organization

7. Which seller classes launch first.
8. Employee vs independent agent vs reseller mix after legal review.
9. Initial vertical/territory design.
10. Seller certification requirements before quoting.
11. Which enterprise deal classes require internal AE ownership.

## Partner economics

12. Referral percentage/term.
13. reseller margin/revenue share.
14. residual/expansion economics.
15. services/implementation rights.
16. deal-registration protection window.

## Commission economics

17. Eligible-revenue formula.
18. rates, accelerators, quotas if any.
19. payment timing/vesting.
20. refund/cancellation clawback policy.
21. split-credit rules.

## Product governance

22. Which capability lifecycle states may be externally sold.
23. pilot language and approval authority.
24. standard discount ceilings.
25. contract/SLA exception authority.
26. roadmap commitment authority.

## Rollout

27. First customer segment for RevenueOS pilot.
28. First partner cohort.
29. CRM/commerce tooling choice if existing repository architecture does not already settle it.
30. Whether external seller portal is launch-critical or later.

Claude may recommend options after repository audit, but none of these becomes settled architecture merely because a recommendation appears in an audit report.

## Market intelligence

The following remain owner/commercial decisions after repository audit rather than architecture assumptions:

1. Which market-intelligence domains launch first by participant type.
2. Which licensed market-data/news vendors, if any, are commercially justified at launch.
3. Which intelligence capabilities are bundled with a Twin versus separately priced Capability Packs.
4. Whether customer-facing intelligence is included, metered, or premium by participant/product.
5. Which customer-private data may contribute to customer-only modeling.
6. Whether any customer/network data may contribute to aggregated intelligence, under what contractual/privacy thresholds.
7. Minimum cohort/anti-reidentification thresholds for network aggregates.
8. Which forecasts may be exposed externally and what confidence/quality threshold is required.
9. Which market signals are allowed to become inputs to A3+ operational decisions after certification.
10. Maximum permissible automation based on market intelligence for Carrier and Brokerage launch stages.
11. Whether freight news content is summarized from public/licensed sources, licensed as a feed, or limited to event metadata/links depending on rights.
12. Budget ceiling for commercial market-data providers and fallback strategy.

---

<!-- SOURCE: 28_CLAUDE_CROSS_PACKAGE_AUDIT_PROMPT.md -->

# 28 — Claude Master Cross-Package Audit Prompt

Copy everything below the divider into a **new Claude session** dedicated to the cross-package review.

---

You are acting as senior principal engineer, enterprise agent architect, logistics systems architect, security reviewer, product-platform architect, and adversarial production reviewer for FreightOS.

## Assignment

Audit the newly installed **FreightOS v1.8.1 RevenueOS & Commercial Capability Architecture** against the complete accepted FreightOS architecture and the real current repository **before any further v1.9 work**.

This is an AUDIT-ONLY assignment. You are not authorized to implement RevenueOS runtime code, migrations, permissions, integrations, production agents, or v1.9.

## Independence / v1.9 quarantine

There is a preserved unaccepted draft branch:

`design/v1.9.0-workforce-operational-design-completion`

Do **not** read it, checkout it, diff it for content, cherry-pick it, inspect its files, or use it as evidence. Preserve it untouched. Its existence may be disclosed only as a quarantined unaccepted draft. The audit must be independent of it.

## Preflight — fail closed

From the repository root:

1. record current branch, HEAD, origin/main, and tree state;
2. require a clean tree before creating the audit branch;
3. verify all accepted production handoff packages expected through v1.8.1 exist;
4. verify package manifests/hashes with repository-standard commands;
5. identify merged repository-local W0/W1 audit artifacts;
6. do not repair an unexpected dirty tree automatically;
7. do not delete/move untracked files to force preflight green;
8. if a precondition fails, report it and stop.

Create a new audit branch from clean, current main. Suggested name:

`audit/revenueos-commercial-capability-pre-v1.9`

Do not rebase unrelated work into it.

## Required reading precedence

Read the accepted repository and controlling packages in order sufficient to preserve stricter rules, including:

- core constitution/product/engineering/architecture/security documents;
- v1.3 Security & Resilience;
- v1.4 Network Architecture;
- v1.5 Enterprise Agent Operations;
- accepted FacilityOS package;
- v1.6 Brokerage Operations;
- v1.7 Agentic Logistics Network Coherence;
- v1.8 Agent Workforce Engineering & Certification;
- merged/accepted workforce W0/W1 audit outputs;
- v1.8.1 RevenueOS & Commercial Capability Architecture;
- current migrations/schema/runtime/tests/CI relevant to identity, authority, workflows, agents, entitlements/billing, audit, network, integrations, and commercial concepts.

Where two accepted rules conflict, apply the stricter security/authority/tenant/privacy/legal/audit/resilience/certification rule and record the conflict. Do not silently reconcile material contradictions.

## Core hypotheses to test — do not assume true

H1. FreightOS can use Capability as the commercial contract boundary while jobs/agents remain implementation details.

H2. Customers can license only needed Twins/capabilities without fragmenting the shared FreightOS foundation.

H3. Versioned commercial entitlement can remain strictly separate from runtime command authority.

H4. RevenueOS can live on a commercial plane without inheriting participant operational/legal authority.

H5. Existing WorkUnit/durable graph infrastructure can be reused for revenue workflows instead of creating a second orchestration system.

H6. The accepted v1.8 workforce can be referenced by capabilities without weakening Job Book ownership, J0-J7 certification, autonomy ceilings, or typed handoffs.

H7. Sales Promise Firewall can be enforced from authoritative product/security/policy registries rather than free text.

H8. Attribution/commission can be derived from append-only authoritative commercial/financial events without giving RevenueOS payout authority.

H9. Referral/agent/reseller/partner identities can be represented with existing identity/tenant/relationship controls or a narrowly additive model.

H10. RevenueOS can own the customer-facing Freight Market Intelligence function while a shared FMI substrate provides provenance-bearing signals to operational domains without transferring authority.

H11. Carrier, Brokerage, FacilityOS, Shipper, and Service Provider/RigDesk workforces can consume market/news/rate/capacity/disruption intelligence as evidence without allowing intelligence components to command domain actions.

H12. Source rights, provenance, freshness, confidence, correction lineage, and forecast uncertainty can be governed as first-class contracts rather than hidden inside prompts or vendor adapters.

H13. This package does not require or justify resuming v1.9 until the audit is reviewed.

## Repository investigation

Inspect at minimum:

1. organization/tenant/legal-entity/participant hierarchy;
2. role/permission/authority model;
3. agent registry/manifests;
4. v1.8 Job Books, workforce matrices, certification and command mappings;
5. workflow/WorkUnit/durable execution primitives;
6. command/policy/approval/autonomy gates;
7. event/outbox/inbox/idempotency/reconciliation;
8. audit/evidence/provenance;
9. existing products/plans/SKUs/subscriptions/billing/entitlements/features/flags;
10. integration/partner identity and API structures;
11. product/capability registries if any;
12. customer onboarding/configuration/Twin schemas;
13. security/trust/compliance claim sources;
14. CRM/revenue/customer-success integrations if present;
15. financial/payment boundaries;
16. tests/CI/validators that could enforce drift controls;
17. docs/audit artifact conventions;
18. existing freight-market/rate/capacity/news/fuel/weather/disruption/commodity/port/rail/ocean/maintenance intelligence code, agents, services, schemas, integrations, or datasets;
19. existing market-data source rights/licensing registries or vendor controls;
20. existing customer/Twin fields that can safely drive customer-specific market relevance without creating hidden inferred authority.

## Required decomposition of proposed RevenueOS workforce

For every proposed role in v1.8.1 file `16_REVENUEOS_AGENT_WORKFORCE.md`, classify it as one of:

- existing agent;
- existing hybrid agent;
- existing deterministic service;
- existing workflow/orchestrator;
- existing human role;
- merge with existing role;
- genuinely missing agent;
- genuinely missing hybrid;
- genuinely missing deterministic service;
- genuinely missing workflow;
- not appropriate to implement.

For each, cite evidence and identify required Job Book/certification implications. Do not create implementation yet.

## Required decomposition of proposed FMI workforce

For every proposed role in `35_MARKET_INTELLIGENCE_AGENT_WORKFORCE.md`, classify it as one of:

- existing participant-domain agent;
- existing RevenueOS/commercial agent;
- existing hybrid agent;
- existing deterministic/model service;
- existing workflow/orchestrator;
- existing human role;
- merge with existing role;
- genuinely missing shared-FMI component;
- genuinely missing RevenueOS-FMI component;
- not appropriate to implement.

For each, identify the authoritative source inputs, permitted signal outputs, consumers, prohibited commands, job/certification implications, and whether it belongs to a shared substrate versus a participant legal/operational plane. Do not create implementation yet.

## REV gate scoring

Score REV-01..REV-48 using only:

- PASS
- PARTIAL
- FAIL
- NOT IMPLEMENTED
- NOT APPLICABLE (with rationale)

Documentation presence alone is not PASS. An unmerged branch is not PASS. A mock is not PASS.

For every PASS/PARTIAL/FAIL, cite exact repository evidence: paths, migrations, functions, tests, CI checks, schemas, or commands.

## FMI gate scoring

Score FMI-01..FMI-28 from `37_MARKET_INTELLIGENCE_TESTS_AND_ACCEPTANCE_GATES.md` with the same status vocabulary and evidence rule.

Specifically prove or reject:

- market/source rights before ingestion;
- source provenance and correction lineage;
- raw observation vs derived indicator vs forecast separation;
- freshness/staleness behavior;
- customer-private/network-aggregate privacy;
- news/prompt-injection resistance;
- rate/capacity methodology and uncertainty;
- forecast calibration;
- customer relevance explainability;
- strict Carrier/Brokerage/Facility/Maintenance authority separation.

## Cross-package conflict review

Explicitly test for conflicts with:

- v1.3 zero-trust/security/AI controls;
- v1.4 participant equality, data sovereignty, authority, versioning and conformance;
- v1.5 Twin + tenant agent organization + typed graph doctrine;
- FacilityOS physical authority/operational ownership boundaries;
- v1.6 brokerage legal/authority separation;
- v1.7 participant coherence, commercial packaging, entitlements and network adoption model;
- v1.8 76-job workforce, WorkUnit ownership, role/tool/command boundaries and J0-J7 certification;
- current repository implementation and W0/W1 findings;
- any accepted market/rate/profitability/load-discovery/pricing/feasibility/maintenance intelligence responsibilities so v1.8.1 does not duplicate or steal their ownership.

## Audit deliverables

Create only documentation under:

`docs/revenueos-architecture-review/`

Create:

1. `README.md`
2. `CURRENT_PRODUCT_COMMERCIAL_INVENTORY.md`
3. `CAPABILITY_GRAPH_GAP_MAP.md`
4. `ENTITLEMENT_ACTIVATION_GAP_MAP.md`
5. `REVENUE_PLANE_AUTHORITY_MAP.md`
6. `REVENUE_WORKFORCE_DECOMPOSITION.md`
7. `PROMISE_FIREWALL_GAP_MAP.md`
8. `PARTNER_CHANNEL_GAP_MAP.md`
9. `ATTRIBUTION_COMMISSION_GAP_MAP.md`
10. `DATA_PRIVACY_BOUNDARY_MAP.md`
11. `REV_01_REV_48_MATRIX.md`
12. `FMI_ARCHITECTURE_AND_SOURCE_GAP_MAP.md`
13. `FMI_WORKFORCE_DECOMPOSITION.md`
14. `FMI_OPERATIONAL_CONSUMER_AUTHORITY_MAP.md`
15. `FMI_01_FMI_28_MATRIX.md`
16. `CROSS_PACKAGE_CONFLICT_REGISTER.md`
17. `PROPOSED_ADDITIVE_PR_SEQUENCE.md`
18. `OWNER_DECISIONS.md` only if genuine unresolved owner decisions remain.

Do not modify accepted production-handoff files during audit.

## Required adversarial review

Attempt to falsify the design with at least these cases:

- commercial entitlement accidentally grants runtime command authority;
- RevenueOS agent obtains Carrier/Facility/Broker operational permissions;
- capability SKU implies an uncertified v1.8 job can execute;
- seller promises a design-only/deferred capability;
- seller/partner overrides security or legal gate;
- a bundle recreates a monolithic forced-purchase model;
- a partner gains cross-customer data;
- commission incentive encourages unsupported selling;
- attribution can be rewritten after cash collection;
- RevenueOS becomes a second source of truth for customer identity, audit, workflows, or product status;
- rollout label bypasses J/A certification ceilings;
- network expansion leaks confidential counterparty data;
- crash/retry duplicates quote/order/entitlement/commission side effects;
- v1.8.1 contradicts accepted W0/W1 findings;
- RevenueOS market agent gains Carrier/Broker/Facility/Maintenance command authority;
- market-rate signal bypasses Carrier profitability/acceptance controls;
- capacity/rate signal bypasses Brokerage pricing, credit, margin, tender, or award authority;
- facility-impact forecast attempts gate/dock/custody control;
- maintenance-market alert causes repair spend/roadside dispatch;
- stale licensed rate remains CURRENT;
- thin-lane sample is presented as high-confidence market truth;
- source rights do not permit the intended ingestion/display/derived use;
- prompt-injected news article alters tools/policy;
- rumor becomes confirmed operational fact;
- customer-private rate/capacity information leaks into another participant's market brief;
- network aggregate permits re-identification;
- a forecast is presented as an observed rate;
- a correction does not invalidate/recompute a consequential derived signal.

## No implementation

Do not:

- create runtime tables/migrations;
- change permissions/RLS;
- enable agents;
- activate external writes;
- create real seller/partner accounts;
- connect a CRM;
- change prices;
- create payout logic;
- connect/ingest/licence/scrape market or news data;
- create market-data vendor accounts;
- activate market-driven operational actions;
- merge;
- deploy;
- resume v1.9;
- read the quarantined v1.9 draft.

## Verification before commit

1. prove diff is confined to `docs/revenueos-architecture-review/`;
2. prove accepted handoff package hashes are unchanged;
3. run applicable docs/format/secret/provenance checks;
4. show no runtime/migration/config/dependency changes;
5. commit the audit as a discrete docs-only commit;
6. push only if repository governance permits and report exact branch/HEAD.

## Completion report

Return:

1. branch / HEAD / origin-main / tree;
2. preflight evidence;
3. accepted packages read and hash/provenance status;
4. explicit statement that quarantined v1.9 content was not read or used;
5. files created;
6. architecture verdict: COHERENT / COHERENT WITH REQUIRED CHANGES / BLOCKED;
7. top conflicts/gaps by severity;
8. capability/entitlement verdict;
9. RevenueOS authority verdict;
10. workforce decomposition summary;
11. Promise Firewall verdict;
12. partner/channel verdict;
13. attribution/commission verdict;
14. REV-01..REV-48 summary counts and blockers;
15. FMI architecture/source-rights verdict;
16. FMI workforce decomposition summary;
17. FMI operational-consumer authority verdict;
18. FMI-01..FMI-28 summary counts and blockers;
19. proposed additive PR sequence — design only;
20. owner decisions genuinely required;
21. exact commands/tests run;
22. explicit confirmation: no runtime implementation, no market/news ingestion, no live effects, no v1.9 continuation.

STOP after the audit. Await owner review.

## Mandatory typed-graph and Job Book audit extension

Before recommending any implementation or v1.9 continuation, read all of:
- `39_TYPED_GRAPH_ENGINEERING_STANDARD.md` through `46_GRAPH_ACCEPTANCE_GATES_GR_01_GR_32.md`;
- `graphs/GRAPH_REGISTRY.json` and every machine-readable graph under `graphs/`;
- every provisional Job Book under `job_books/revenueos/` and `job_books/fmi/`;
- `matrices/GRAPH_REGISTRY.csv`, `GRAPH_NODE_OWNERSHIP.csv`, and `GRAPH_EDGE_HANDOFFS.csv`.

For every proposed job/component, classify it against the accepted v1.8 workforce as `EXISTING`, `MERGE`, `DUPLICATE`, `AGENT`, `HYBRID`, `DETERMINISTIC_SERVICE`, `WORKFLOW`, `HUMAN_SUPERVISED`, `GENUINELY_MISSING`, or `REJECT`. Do not promote an `AUDIT_CANDIDATE` Job Book to J0 yourself.

For every graph, perform a graph-theoretic and authority audit: entry/terminal reachability; unreachable/orphan states; cycles; owner uniqueness; typed-edge completeness; sender/receiver authority isolation; side-effect inventory; idempotency/reconciliation; stale-version invalidation; kill-switch behavior; failure/timeout/retry completeness; and overlap with existing repository workflow graphs.

Score `GR-01..GR-32` in addition to `REV-01..REV-48` and `FMI-01..FMI-28`. Add these repository-local audit outputs:
- `GRAPH_REGISTRY_RECONCILIATION.md`
- `GRAPH_NODE_OWNERSHIP_GAP_MAP.md`
- `GRAPH_EDGE_AND_HANDOFF_GAP_MAP.md`
- `GRAPH_AUTHORITY_CONFLICT_MAP.md`
- `GRAPH_FAILURE_RETRY_RECONCILIATION_GAP.md`
- `GRAPH_CERTIFICATION_GAP.md`
- `GR_01_GR_32_MATRIX.md`
- `PROVISIONAL_JOB_BOOK_RECONCILIATION.md`

**Stop after audit.** Do not implement graphs, create runtime tables, add migrations, register/enable jobs, change permissions, activate agents, create operational commands, or continue v1.9.

## Additional mandatory Operational Twin interaction audit

The final package includes an Operational Twin interaction fabric. Read `51`–`62`, `graphs/twin/`, Twin schemas/fixtures/matrices, and audit them against v1.4/v1.5/v1.7/v1.8 plus current repository integration/runtime evidence.

Do not assume FreightOS should replace a customer's TMS/WMS/ERP. Determine, by domain/object/field where possible, what is currently authoritative and whether the repository can represent explicit external/FreightOS/config/network/derived/human authority bindings without split-brain truth.

You must test H14–H22 from `26_CROSS_PACKAGE_AUDIT_SPEC.md`, audit TWIN-G01..TWIN-G12, and score TW-01..TW-40.

Required additional outputs under `docs/revenueos-architecture-review/`:

- `TWIN_RUNTIME_COEXISTENCE_GAP_MAP.md`
- `SYSTEM_OF_RECORD_BINDING_MAP.md`
- `HUMAN_AGENT_WORKUNIT_COEXISTENCE.md`
- `TWIN_NETWORK_INGRESS_EGRESS_MAP.md`
- `TWIN_LEARNING_CHANGE_CONTROL_GAP.md`
- `TWIN_GRAPH_RUNTIME_COMPATIBILITY.md`
- `TW_01_TW_40_MATRIX.md`

Explicitly test whether a human-heavy customer can get material value from the Twin before A3/A4 automation, whether existing systems can remain in place, and whether external/connected counterparties can communicate through the network. Stop before implementation, migration, adapter activation, autonomy promotion, or v1.9.

---

<!-- SOURCE: 29_INSTALLATION_AND_OWNER_RUNBOOK.md -->

# 29 — Installation and Owner Runbook

## Goal

Install this package as immutable additive design documentation, then have Claude independently audit it against accepted FreightOS before any implementation or v1.9 continuation.

## A. Local preflight

From the real FreightOS repository root:

```bash
cd /Users/jordanburwell/Developer/FreightOS

git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
```

Do not proceed from a dirty tree unless you intentionally understand and preserve the existing work. Do not delete or move files merely to satisfy the preflight.

## B. Update main

Only if clean and normal repository governance permits:

```bash
git switch main
git pull --ff-only origin main
git status --short
```

## C. Create installation branch

```bash
git switch -c setup/install-revenueos-commercial-capability-v1.8.1
```

## D. Copy package

Assuming this generated folder is in Downloads, adjust source path if necessary:

```bash
mkdir -p docs/production-handoff
cp -R "/path/to/FreightOS_v1.8.1_RevenueOS_Commercial_Capability_Architecture" \
  "docs/production-handoff/v1.8.1-revenueos-commercial-capability-architecture"
```

## E. Verify manifest before commit

```bash
cd docs/production-handoff/v1.8.1-revenueos-commercial-capability-architecture
shasum -a 256 -c MANIFEST.sha256
cd "$(git rev-parse --show-toplevel)"
```

Every entry must report `OK`.

## F. Inspect scope

```bash
git status --short
git diff --stat
git diff --name-only
```

Expected change: new documentation package only. No runtime, migration, dependency, config, credential, or existing accepted handoff modification.

## G. Stage and commit

```bash
git add docs/production-handoff/v1.8.1-revenueos-commercial-capability-architecture

git diff --cached --stat
git diff --cached --name-only

git commit -m "docs: install FreightOS RevenueOS capability architecture v1.8.1"
```

## H. Run repository checks

Run the checks your current FreightOS repository requires for documentation/handoff packages. At minimum include package hash validation, formatting/docs checks, provenance/drift checks, and secret scan if present. Do not guess around a failure; capture it.

## I. Push installation branch

After local checks are green:

```bash
git push -u origin setup/install-revenueos-commercial-capability-v1.8.1
```

Open a documentation-only PR. Do not merge automatically unless your normal governance authorizes it.

## J. After accepted installation

Start a **new Claude session**, not the prior design session.

Copy:

```bash
pbcopy < docs/production-handoff/v1.8.1-revenueos-commercial-capability-architecture/28_CLAUDE_CROSS_PACKAGE_AUDIT_PROMPT.md
```

Paste it into Claude from the real FreightOS repository context.

## K. What Claude must do

Claude performs a docs-only cross-package audit and creates `docs/revenueos-architecture-review/`.

It must not read the preserved unaccepted v1.9 draft, implement RevenueOS/FMI, connect or ingest market/news sources, or continue v1.9. The audit must separately score REV-01..REV-48 and FMI-01..FMI-28 and decompose both the RevenueOS workforce and the proposed FMI workforce against what already exists.

## L. What you send back for review

Send the full Claude completion report plus, preferably, the generated audit package or repository diff. Review the verdict and blockers before authorizing the next design/implementation step.

## M. Decision gate

Only after review choose among:

- accept v1.8.1 as coherent and define an additive implementation sequence;
- revise v1.8.1 design conflicts first;
- fold required commercial/capability corrections into the eventual v1.9 scope;
- keep v1.9 paused if architectural blockers remain.

No option is pre-authorized by this package.

## N. Typed-graph / Job Book audit completion

The audit is incomplete unless Claude also:

- reads all 37 provisional Job Books and machine-readable descriptors;
- audits all 36 typed durable graphs, including TWIN-G01..TWIN-G12;
- validates ownership, typed artifacts, authority boundaries, retry/reconciliation and stale-version behavior;
- reconciles candidate responsibilities against the accepted v1.8 workforce instead of assuming they are new jobs;
- scores `GR-01..GR-32` and `TW-01..TW-40` in addition to `REV-01..REV-48` and `FMI-01..FMI-28`.

See `49_END_TO_END_IMPLEMENTATION_SEQUENCE.md` for the complete owner sequence from package installation through post-audit implementation authorization.

---

<!-- SOURCE: 30_SOURCE_TRACEABILITY_AND_NON_REGRESSION.md -->

# 30 — Source Traceability and Non-Regression

## Derived continuity

This package intentionally extends established FreightOS principles rather than replacing them:

- v1.3: zero-trust identity/authority, auditability, idempotency, resilience, bounded AI, evidence-first acceptance;
- v1.4: neutral network semantics, participant equality, data sovereignty, deterministic command authority, conformance and versioning;
- v1.5: customer-specific Operational Twin + tenant agent organization + typed durable workflow graphs + authority before automation + no normal customer code forks;
- FacilityOS: facility operational ownership and physical-world authority boundaries;
- v1.6: brokerage legal/authority/financial-responsibility separation;
- v1.7: unified Participant Operational Twin model, capability packs, commercial packaging independent of code foundation, versioned entitlements/activation gates, unilateral-to-network adoption;
- v1.8: explicit workforce jobs/components, WorkUnit ownership, typed handoffs, tool/command boundaries, certification, simulations and commercial claim controls.

## New material introduced here

- Capability Contract as explicit commercial boundary;
- machine-readable commercial product/capability graph requirements;
- formal commercial entitlement vs activation separation;
- RevenueOS commercial plane;
- seller/partner authority profiles;
- Sales Promise Firewall;
- structured solution configuration;
- deterministic attribution/commission model;
- seller/partner certification;
- RevenueOS workforce proposal for audit;
- REV-01..REV-48 gate set;
- shared Freight Market Intelligence substrate;
- RevenueOS Market Intelligence Division;
- source/rights/provenance/freshness standards;
- customer-specific market relevance/impact engine;
- strict intelligence-to-operational-authority separation;
- FMI-01..FMI-28 gate set.

## Non-regression test

If any new rule would permit an action prohibited by an accepted earlier package, the new rule is invalid until explicitly reconciled by owner-approved architecture change.

---

<!-- SOURCE: 31_FREIGHT_MARKET_INTELLIGENCE_SUBSTRATE.md -->

# 31 — Freight Market Intelligence Substrate

## 1. Purpose

FreightOS SHALL maintain a shared, provenance-bearing Freight Market Intelligence (FMI) substrate so commercial and operational products can reason from a coherent view of freight-market conditions without making RevenueOS an operational authority.

RevenueOS owns the **commercial/customer-facing market intelligence function**: research, synthesis, account relevance, briefings, alerts, and commercial explanation. The underlying market observations and derived signals are published through the FMI substrate for governed consumption by Carrier, Brokerage, FacilityOS, Shipper, Service Provider/RigDesk, and RevenueOS components.

## 2. Architectural position

```text
PUBLIC / LICENSED / CUSTOMER / NETWORK SOURCES
                    │
                    ▼
          SOURCE REGISTRY + RIGHTS
                    │
                    ▼
       INGESTION / NORMALIZATION LAYER
                    │
                    ▼
        FREIGHT MARKET INTELLIGENCE
              SHARED SUBSTRATE
                    │
     ┌──────────────┼───────────────────────────────┐
     │              │               │               │
 RevenueOS       Carrier         Brokerage       FacilityOS
 briefings       planning        pricing/sourcing capacity/readiness
     │              │               │               │
     └──────────────┼───────────────┼───────────────┘
                    │
               Shipper / RigDesk
```

## 3. FMI is intelligence, not authority

An FMI artifact may be an observation, normalized metric, derived indicator, forecast, interpretation, or customer-impact assessment.

An FMI artifact is **never by itself**:

- a command;
- an approval;
- a price authorization;
- a load acceptance;
- a carrier qualification decision;
- a dispatch assignment;
- a facility physical-control decision;
- a maintenance authorization;
- a customer entitlement;
- a legal/compliance determination.

Operational components may consume FMI as evidence/input only within their existing authority, policy, certification, workflow, and approval boundaries.

## 4. Covered intelligence domains

The substrate SHALL be extensible across transport modes and market domains. Initial taxonomy includes:

1. truckload spot rates;
2. truckload contract rates where licensed/available;
3. lane-level capacity tightness;
4. load-to-truck / tender / rejection / availability indicators where licensed;
5. shipment volume and demand;
6. seasonality and produce/agriculture flows;
7. fuel and energy prices;
8. labor and driver/warehouse capacity indicators;
9. weather and disaster disruptions;
10. road, bridge, border, port, rail, and terminal disruptions;
11. freight and logistics news;
12. regulatory and policy changes;
13. commodity and industrial activity affecting freight demand;
14. port/container activity;
15. rail traffic/intermodal activity;
16. ocean freight conditions where relevant and legally/licensed available;
17. equipment, parts, tire, service-shop, towing, and maintenance-network capacity indicators where available;
18. OEM recall/service bulletins and other authoritative maintenance disruptions where permitted;
19. insurance/claims and safety signals only where lawful, relevant, and approved;
20. customer/network-local historical operating signals, subject to privacy and data-sharing policy.

## 5. Canonical signal lifecycle

```text
RAW OBSERVATION
      ↓
VALIDATED SOURCE EVENT
      ↓
NORMALIZED MARKET OBSERVATION
      ↓
DERIVED INDICATOR
      ↓
FORECAST / INTERPRETATION (optional)
      ↓
CUSTOMER RELEVANCE ASSESSMENT
      ↓
CUSTOMER IMPACT BRIEF / ALERT
```

Raw facts, derived metrics, forecasts, and recommendations SHALL remain distinguishable.

## 6. Customer-specific relevance

FMI SHALL not deliver one generic national news feed to every customer.

Customer relevance may consider, only within approved scopes:

- participant type;
- active Operational Twin(s);
- enabled capabilities;
- operating geographies;
- lanes/corridors;
- equipment types;
- commodities/customer industries;
- facilities/ports/rail ramps served;
- service/maintenance network;
- current and planned WorkUnits;
- customer-declared operating strategy;
- risk tolerances and notification preferences.

Relevance logic may rank and explain signals but cannot silently alter approved Twin facts.

## 7. Example customer outcomes

### Carrier

- lane rate trend and capacity shifts;
- likely repositioning opportunity;
- produce/seasonal volume changes;
- fuel movement affecting trip economics;
- disruptions affecting ETA or service risk;
- market regime changes affecting dispatch strategy.

### Broker

- buy-side capacity tightness;
- sell/buy rate context;
- lane volatility;
- sourcing difficulty;
- tender/rejection changes;
- disruption and commodity-driven demand;
- margin-risk context.

### Facility

- inbound/outbound freight surge indicators;
- port/rail/border disruption spillover;
- expected appointment pressure;
- seasonal commodity volume;
- carrier-capacity constraints affecting arrivals.

### Shipper

- procurement/routing-guide risk;
- rate and capacity movement;
- service-risk corridors;
- mode-shift indicators;
- disruption exposure.

### Service Provider / RigDesk / Maintenance

- parts/service capacity disruptions;
- weather and road incident clusters;
- fuel and operating-cost changes;
- maintenance demand surges;
- OEM/service network alerts where authoritative and permitted.

## 8. Operational-twin boundary

FMI may **reference** approved Twin data to determine relevance. FMI cannot write new authoritative Twin facts merely because it inferred them.

Example:

> Frequent customer loads from Dallas to Atlanta may make Dallas→Atlanta rate intelligence highly relevant.

That does not authorize FMI to mutate the customer's approved lane strategy, rate floor, customer preference, dispatch policy, or operating authority.

## 9. Network effect

As FreightOS participation grows, network-derived intelligence may become more valuable, but network data must remain governed by:

- participant consent;
- purpose limitation;
- data classification;
- aggregation thresholds;
- anti-reidentification rules;
- commercial-confidentiality boundaries;
- source rights/licensing;
- provenance and correction.

No customer's confidential rate, load, counterparty, cost, or operational information becomes another participant's raw market feed merely because both use FreightOS.

## 10. Non-activation

This document does not authorize ingestion of paid/vendor feeds, scraping, news redistribution, customer cross-use, market-data resale, autonomous pricing, automated load acceptance, or external operational writes.

---

<!-- SOURCE: 32_MARKET_DATA_SOURCE_AND_PROVENANCE_STANDARD.md -->

# 32 — Market Data Source, Rights, and Provenance Standard

## 1. Source registry

Every FMI source SHALL be registered before production use.

Required fields:

- source ID;
- provider/owner;
- source class;
- access method;
- permitted use;
- redistribution rights;
- derived-data rights;
- customer-display rights;
- model-training/learning rights if relevant;
- retention limits;
- refresh cadence;
- expected latency;
- geographic/mode coverage;
- known biases/coverage gaps;
- cost/meter;
- credentials/connector class;
- legal/commercial owner;
- technical owner;
- suspension/kill switch;
- effective/version dates.

## 2. Source classes

1. `official_public` — government/regulator/statistical authority.
2. `industry_public` — associations/industry reports with explicit public-use terms.
3. `licensed_market_data` — commercial data under contract/API/license.
4. `licensed_news` — content/feeds with explicit permitted machine use and display rights.
5. `customer_private` — one customer's data, scoped to that customer unless separate lawful authorization exists.
6. `network_aggregate` — privacy/contract-governed FreightOS-derived aggregate.
7. `partner_contributed` — governed external-partner data.
8. `open_web_observation` — public page/event metadata only where collection and downstream use are legally/contractually permitted.

## 3. Rights before ingestion

Technical accessibility is not permission.

A crawler, browser, API token, or public webpage does not by itself establish rights to:

- bulk collect;
- retain indefinitely;
- train models;
- redistribute;
- display full content;
- create commercial derived datasets;
- resell data.

Source rights must be explicit and auditable.

## 4. Provenance envelope

Every normalized observation SHALL retain:

- `source_id`;
- `source_record_id` or stable reference where available;
- source published/effective timestamp;
- observed/ingested timestamp;
- transformation version;
- original units;
- normalized units;
- geography/lane/mode scope;
- confidence/quality state;
- rights policy/version;
- lineage to derived signals.

## 5. News handling

News-derived signals SHALL distinguish:

- reported fact;
- source allegation/claim;
- official announcement;
- analyst interpretation;
- FreightOS-derived operational implication.

Headlines or model summaries cannot convert an unverified claim into authoritative truth.

## 6. Source quality

Source quality scoring may include:

- authority;
- directness;
- sample size/coverage;
- recency;
- historical reliability;
- geographic fit;
- market representativeness;
- methodology transparency;
- corroboration.

A source-quality score is not a substitute for provenance.

## 7. Conflicting sources

When credible sources conflict:

- preserve both observations;
- show methodology/scope differences;
- avoid false precision;
- derive a consensus only through a versioned method;
- mark unresolved divergence;
- prevent lower-confidence conflict from silently overwriting stronger evidence.

## 8. Vendor outage/degradation

Every paid/critical source requires:

- freshness monitoring;
- circuit breaker;
- source health state;
- fallback or HOLD behavior;
- customer-visible staleness where consequential;
- reconciliation after recovery.

Stale data cannot masquerade as current market state.

---

<!-- SOURCE: 33_MARKET_SIGNAL_TAXONOMY_AND_CONFIDENCE.md -->

# 33 — Market Signal Taxonomy, Freshness, Confidence, and Forecast Discipline

## 1. Signal classes

Canonical classes:

- `observation` — directly observed/published value or event;
- `normalized_observation` — transformed into canonical FreightOS semantics;
- `derived_indicator` — deterministic calculation over observations;
- `forecast` — future estimate with horizon/uncertainty;
- `regime_classification` — bounded characterization such as loose/balanced/tight capacity;
- `news_event` — sourced report/announcement;
- `disruption_signal` — operational disruption with geography/time scope;
- `customer_impact_assessment` — relevance/impact interpretation for one participant;
- `recommendation_input` — evidence intended for another governed decision component.

## 2. Required fields

Every signal includes:

- immutable signal ID/version;
- signal class;
- metric/event type;
- transport mode;
- geography/lane/market scope;
- equipment/commodity scope where applicable;
- observation/effective time;
- ingested time;
- freshness state;
- valid-until or expiry logic;
- source references;
- transformation/model version;
- confidence/uncertainty;
- units and statistical basis;
- rights/access class;
- customer/network disclosure policy;
- correction lineage.

## 3. Freshness states

Use only:

- `CURRENT`
- `AGING`
- `STALE`
- `UNKNOWN`
- `WITHHELD`

Operational consumers define how each state affects their own decisions. FMI cannot silently extend validity.

## 4. Confidence

Confidence must be calibrated to the type of evidence.

Examples:

- exact published diesel price from an authoritative release: high observation confidence, limited future relevance;
- lane spot-rate estimate from a licensed sample: confidence depends on sample/recency/lane density;
- news report about a future strike: event probability and impact uncertainty must remain explicit;
- long-horizon rate forecast: never represented as a current observed rate.

## 5. Forecast envelope

Every forecast SHALL state:

- target variable;
- point/interval estimate as supported;
- horizon;
- model/version;
- training/reference window;
- known regime limitations;
- calibration/backtest metric;
- confidence/interval;
- invalidation conditions;
- generated timestamp;
- data freshness.

Forecasts cannot be labeled guaranteed, certain, or authoritative future state.

## 6. Regime detection

A Market Regime component may characterize markets using approved metrics, for example:

- `LOOSE_CAPACITY`
- `BALANCED`
- `TIGHT_CAPACITY`
- `DISRUPTED`
- `DATA_INSUFFICIENT`

The classification method must be deterministic or model-versioned and backtested. Customer-facing explanations show the evidence driving the classification.

## 7. Corrections

Corrections append lineage:

```text
signal v1
   ↓ corrected_by
signal v2
```

Do not erase the historical signal when it was consequentially consumed; preserve what the system knew at decision time.

---

<!-- SOURCE: 34_CUSTOMER_RELEVANCE_AND_IMPACT_ENGINE.md -->

# 34 — Customer Relevance and Impact Engine

## 1. Objective

Market intelligence becomes useful when it answers:

> What changed, why does it matter to this participant, which parts of its operation are exposed, and what governed workflow should consider the information?

The Customer Relevance and Impact Engine (CRIE) performs that mapping without creating operational authority.

## 2. Inputs

CRIE may consume:

- approved participant/Twin facts;
- enabled capability set;
- current/authorized market exposure profile;
- lane/corridor/equipment/commodity scopes;
- facilities/ports/rail ramps/service geographies;
- customer notification preferences;
- active workflow references where policy allows;
- canonical FMI signals.

## 3. Outputs

Typed outputs:

- `CustomerMarketRelevanceAssessment`;
- `CustomerImpactBrief`;
- `MarketAlert`;
- `WorkflowEvidenceReference`;
- `MarketOpportunityObservation`;
- `MarketRiskObservation`.

## 4. Relevance dimensions

Each assessment may score:

- direct geographic overlap;
- lane/corridor overlap;
- equipment compatibility;
- commodity/customer-industry exposure;
- current WorkUnit exposure;
- service network exposure;
- financial sensitivity;
- time-to-impact;
- confidence;
- materiality.

## 5. Persona-specific translation

### Carrier operations

Translate market signals into questions such as:

- Are current lanes tightening or loosening?
- Has the expected market rate changed materially?
- Is outbound demand shifting toward another nearby market?
- Does a disruption threaten pickup/delivery feasibility?
- Has fuel changed enough to alter profitability assumptions?

### Broker operations

- Is carrier buy capacity tightening?
- Is the sell/buy spread assumption stale?
- Is sourcing difficulty increasing by equipment/lane?
- Does a disruption require wider carrier search or customer repricing review?
- Is margin risk rising?

### Facility operations

- Is an inbound freight surge likely?
- Are port/border/rail delays likely to create arrival bunching?
- Is carrier scarcity likely to create appointment misses?

### Shipper operations

- Which lanes are exposed to procurement/routing-guide failure?
- Where are spot/contract economics diverging?
- Which disruptions warrant modal or routing review?

### Maintenance / RigDesk

- Are parts/service/wrecker capacities constrained in operating regions?
- Are weather/road conditions likely to increase breakdown/service demand?
- Are fuel/maintenance input changes materially affecting operating cost?

## 6. No automatic policy rewrite

A strong market signal may generate a **proposal** to review:

- a rate floor;
- a dispatch preference;
- a sourcing radius;
- a facility staffing plan;
- a maintenance stocking policy.

It cannot change those policies itself unless a separate controlling workflow explicitly grants that bounded authority and all existing gates pass.

## 7. Explainability

Every material customer alert must support:

- why this customer received it;
- what source signals contributed;
- freshness/confidence;
- what customer facts created relevance;
- what operational surfaces may be affected;
- whether action is informational, recommended, approval-required, or handled by another certified workflow.

---

<!-- SOURCE: 35_MARKET_INTELLIGENCE_AGENT_WORKFORCE.md -->

# 35 — RevenueOS Market Intelligence Division / Shared FMI Workforce

## 1. Status

This is a **proposed decomposition for Claude audit**. It does not silently append production jobs to the accepted v1.8 workforce or activate any component.

Some responsibilities may already exist in Carrier/Brokerage/Facility/Shipper/Service Provider job books or should be deterministic services instead of agents. Claude must classify overlaps before implementation.

## 2. Proposed jobs/components

| Job/component | Proposed class | Mission | Explicit non-scope |
|---|---|---|---|
| Market Intelligence Orchestrator | deterministic/workflow router | schedule/reroute research and signal WorkUnits | no market conclusion authority by itself |
| Source Registry Steward | human-supervised/deterministic | govern source metadata, rights, freshness and suspension | no silent rights assumptions |
| Freight News Intelligence Agent | agent | monitor and summarize relevant freight/logistics developments | no unsourced truth or operational command |
| Capacity Intelligence Agent | hybrid agent | detect capacity tightness/availability changes | no carrier qualification/tender |
| Rate Intelligence Agent | hybrid agent | normalize/analyze market rate signals | no authorized quote or load acceptance |
| Demand & Volume Intelligence Agent | hybrid agent | detect freight demand/volume shifts | no dispatch command |
| Lane & Corridor Intelligence Agent | hybrid agent | synthesize lane-local market state | no route/assignment command |
| Fuel & Energy Intelligence Service | deterministic/hybrid | publish fuel/energy cost observations and trends | no customer fuel policy rewrite |
| Commodity & Seasonality Intelligence Agent | hybrid agent | identify commodity/seasonal freight impacts | no trading/commodity action |
| Disruption Intelligence Agent | hybrid agent | detect weather/infrastructure/border/port/rail disruptions | no emergency authority |
| Regulatory & Policy Intelligence Agent | human-supervised agent | identify relevant transportation policy/regulatory developments | no legal advice/compliance determination |
| Rail & Intermodal Intelligence Agent | hybrid agent | synthesize rail/intermodal traffic/capacity signals | no rail execution authority |
| Ocean & Port Intelligence Agent | hybrid agent | synthesize ocean/port capacity/congestion signals | no ocean contracting authority |
| Maintenance Market Intelligence Agent | hybrid agent | parts/service/OEM/service-network disruption intelligence | no repair authorization |
| Market Regime Classification Service | deterministic/model service | classify bounded market regimes from approved metrics | no business policy changes |
| Forecast Ensemble Service | model/deterministic wrapper | produce versioned, calibrated forecasts | no guarantees or commands |
| Customer Relevance & Impact Agent | agent | map market signals to participant exposure | no Twin mutation/command |
| Market Briefing Agent | agent | produce customer/role-specific briefings | no unsupported claims |
| Market Alerting Service | deterministic/workflow | route material alerts by policy | no operational action by alert alone |
| Intelligence Quality & Evidence Supervisor | human-supervised/hybrid | detect stale/conflicting/low-quality signals and evaluation drift | no exception self-approval |

## 3. Plane relationship

RevenueOS may own/customer-package the Market Intelligence Division, but the normalized FMI substrate is shared infrastructure.

No RevenueOS seller, commercial agent, or market-intelligence agent acquires Carrier/Broker/Facility/Shipper/Service Provider command permissions merely by producing a signal.

## 4. Certification

Model/agent components require job-specific evaluation for:

- false-news/rumor resistance;
- source spoofing;
- prompt injection in articles/documents;
- stale data;
- conflicting rate sources;
- thin-lane/sample-size uncertainty;
- geographic mismatch;
- customer confidentiality;
- forecast calibration;
- hallucinated causal explanation;
- overconfident recommendation;
- cross-tenant leakage;
- licensing/rights violation;
- degraded-source behavior.

## 5. Commercial role

RevenueOS can use FMI to:

- improve account research;
- demonstrate customer-specific market intelligence during discovery;
- configure relevant Intelligence Capability Packs;
- generate approved value/ROI scenarios;
- support renewals/expansion based on actual customer usage and relevance.

It cannot use private customer/network intelligence to target prospects outside permitted purpose.

---

<!-- SOURCE: 36_OPERATIONAL_CONSUMPTION_BOUNDARIES.md -->

# 36 — Operational Consumption Boundaries

## 1. Principle

FMI supplies evidence. Operational domains retain decisions and commands.

```text
FMI SIGNAL
   ↓
DOMAIN-SPECIFIC CONSUMER
   ↓
DETERMINISTIC POLICY / AUTHORITY / WORKFLOW STATE
   ↓
PROPOSAL OR COMMAND REQUEST
   ↓
EXISTING FREIGHTOS EXECUTION GATES
```

## 2. Carrier consumption

Approved consumers may include:

- Load Discovery;
- Profitability Engine;
- Feasibility Engine;
- Planning/Dispatch components;
- ETA/exception workflows;
- maintenance/roadside planning.

Market rates/capacity may affect recommendations or scoring, but cannot alone authorize acceptance, assignment, negotiation, or external write.

## 3. Brokerage consumption

Approved consumers may include:

- Shipper Pricing;
- Carrier Sourcing;
- Margin Risk;
- procurement/tender planning;
- exception/customer communication.

Broker pricing must still pass deterministic pricing, credit, margin, legal, and quote-authority controls. Market intelligence does not become a license to quote any amount.

## 4. Facility consumption

FMI may support:

- expected arrival pressure;
- staffing/readiness forecasts;
- appointment-risk alerts;
- inbound/outbound surge planning.

It cannot exercise gate admission, dock assignment, custody, or physical facility authority unless a separately certified FacilityOS workflow does so.

## 5. Shipper consumption

FMI may support:

- procurement benchmarking;
- routing-guide risk;
- sourcing strategy recommendations;
- mode/corridor risk assessments.

It cannot bind a tender, carrier award, contract, or rate outside shipper authority workflows.

## 6. Service/RigDesk/Maintenance consumption

FMI may support:

- service-capacity awareness;
- parts risk;
- weather/disruption preparation;
- maintenance-demand forecasting;
- cost context.

It cannot diagnose a vehicle solely from market news, authorize repairs, spend customer funds, or dispatch roadside service without the controlling diagnostic/service workflow and authority.

## 7. RevenueOS consumption

RevenueOS may use FMI to:

- create customer-relevant market briefs;
- demonstrate applicable market conditions;
- identify capability fit;
- support renewal/expansion discussion;
- explain why an operational capability matters.

RevenueOS may not use FMI to manipulate urgency, fabricate scarcity, promise future rates, or misrepresent forecasts as guarantees.

## 8. Anti-circularity

A FreightOS operational action may itself become a customer-private or network-aggregate observation only through explicit telemetry/data policy. A recommendation cannot cite its own prior recommendation as independent market evidence.

---

<!-- SOURCE: 37_MARKET_INTELLIGENCE_TESTS_AND_ACCEPTANCE_GATES.md -->

# 37 — FMI Tests, Adversarial Cases, and Acceptance Gates

## 1. Required adversarial families

- source says one rate; model invents another;
- stale rate remains labeled current;
- national rate is applied to a thin local lane without disclosure;
- customer-private rate leaks to another carrier/broker;
- partner terms prohibit redistribution but UI exposes raw data;
- headline contains prompt injection;
- rumor is converted into confirmed disruption;
- duplicated source events create duplicated alerts;
- correction fails to propagate to derived signal;
- forecast is presented as observed fact;
- capacity forecast directly triggers load acceptance;
- broker rate intelligence bypasses margin/credit controls;
- carrier rate intelligence bypasses profitability policy;
- facility forecast attempts physical-control command;
- maintenance market signal triggers repair spend;
- source outage silently freezes old data;
- conflicting sources are collapsed without uncertainty;
- customer relevance uses unapproved inferred Twin facts;
- network aggregate permits re-identification;
- seller uses customer-private market data in prospecting;
- news/copyright/license rights are exceeded;
- model creates legal/regulatory advice from policy news.

## 2. FMI acceptance gates

Use the same status vocabulary as accepted FreightOS audit gates: `PASS`, `PARTIAL`, `FAIL`, `NOT IMPLEMENTED`, `NOT APPLICABLE` with rationale.

| ID | Requirement | Minimum acceptance evidence |
|---|---|---|
| FMI-01 | Canonical source registry | registry schema + versioned records + owners |
| FMI-02 | Rights before ingestion | tests/workflow prevent unapproved source activation |
| FMI-03 | Provenance preserved | observation-to-derived lineage reconstruction |
| FMI-04 | Raw/derived/forecast separation | schema and UI/API tests |
| FMI-05 | Freshness is explicit | stale/unknown test fixtures and consumer behavior |
| FMI-06 | Corrections append lineage | correction/replay test |
| FMI-07 | Duplicate ingestion is idempotent | duplicate source event creates one canonical effect |
| FMI-08 | Conflicting sources remain explainable | disagreement fixture + output evidence |
| FMI-09 | Source outage fails safely | outage/freshness simulation |
| FMI-10 | Customer-private isolation | cross-tenant negative tests |
| FMI-11 | Network aggregate privacy | cohort/re-identification tests |
| FMI-12 | Licensed-data enforcement | rights-policy negative tests |
| FMI-13 | News injection resistance | adversarial article/document suite |
| FMI-14 | Rumor/claim labeling | factuality/provenance evaluation |
| FMI-15 | Rate signal methodology | sample/coverage/method version captured |
| FMI-16 | Capacity signal methodology | metric/version/coverage captured |
| FMI-17 | Forecast calibration | backtest and calibration evidence by horizon/domain |
| FMI-18 | Forecast uncertainty | interval/confidence and invalidation shown |
| FMI-19 | Customer relevance explainability | reason/evidence/customer-fact trace |
| FMI-20 | Relevance cannot mutate Twin | authority/negative tests |
| FMI-21 | Carrier execution separation | market signal cannot directly accept/assign/negotiate |
| FMI-22 | Brokerage execution separation | market signal cannot bypass quote/margin/credit authority |
| FMI-23 | Facility physical-authority separation | no gate/dock/custody command from FMI |
| FMI-24 | Maintenance spend/dispatch separation | no repair/roadside spend from FMI alone |
| FMI-25 | RevenueOS separation | commercial agents cannot inherit logistics authority |
| FMI-26 | Customer brief truthfulness | sourced, freshness/confidence, no guarantee language |
| FMI-27 | Observability | latency/freshness/error/drift/source health metrics |
| FMI-28 | No documentation-only PASS | repository/runtime evidence required for implementation claims |

## 3. Promotion rule

No FMI agent/model may become a production dependency for consequential autonomous decisions until its relevant job certification and FMI gates are evidenced in the repository/runtime environment.

---

<!-- SOURCE: 38_MARKET_INTELLIGENCE_SOURCE_STRATEGY.md -->

# 38 — Freight Market Intelligence Source Strategy

## 1. Strategy

FreightOS should combine authoritative public data, licensed market datasets, customer-private operating data, and privacy-protected network aggregates rather than relying on a single vendor or web scraper.

## 2. Source tiers

### Tier A — authoritative/public foundations

Examples to evaluate and register include:

- U.S. Energy Information Administration fuel/energy data;
- U.S. DOT Bureau of Transportation Statistics freight indicators/FAF/TSI;
- U.S. Bureau of Labor Statistics transportation price/labor indicators;
- USDA Agricultural Marketing Service truck/rail/barge/ocean and refrigerated/produce market datasets;
- Federal Maritime Commission containerized-freight and ocean regulatory datasets;
- Maritime Administration port/vessel datasets;
- other regulator/authority feeds relevant to border, safety, weather, infrastructure, and mode-specific operations.

These provide stable macro/official context but may not provide the lane-level, high-frequency specificity required for dispatch or brokerage decisions.

### Tier B — licensed freight market data

Evaluate commercial products for:

- truckload rate benchmarks;
- lane-level capacity;
- tender/rejection/volume signals;
- high-frequency market indices;
- rate forecasts;
- multimodal market intelligence;
- API/redistribution/derived-data rights.

No vendor is architecturally mandatory. The adapter layer must preserve canonical FMI contracts.

### Tier C — customer-private data

Customer historical:

- accepted/declined loads;
- actual rates;
- deadhead;
- service failures;
- dwell;
- facility performance;
- maintenance/service events;
- equipment utilization.

This can materially improve customer-specific relevance but remains customer-scoped unless separately authorized for aggregate use.

### Tier D — FreightOS network aggregate

Long-term proprietary advantage may derive from privacy-protected network observations such as:

- anonymous lane movement density;
- aggregated service/dwell patterns;
- aggregated capacity/availability;
- normalized facility throughput indicators;
- aggregate maintenance/service demand.

These require explicit governance, minimum cohorts, anti-reidentification, contractual rights, and evidence that commercially sensitive participant data cannot be reconstructed.

## 3. Build/buy boundary

FreightOS SHOULD build:

- source registry;
- canonical market signal schema;
- provenance/rights enforcement;
- normalization;
- customer relevance/impact mapping;
- market-signal distribution;
- source-agnostic operational interfaces;
- evaluation/quality/freshness controls;
- network aggregate governance.

FreightOS SHOULD generally buy/license rather than recreate where economically sensible:

- deep proprietary lane transaction datasets;
- broad high-frequency tender/capacity datasets;
- specialized commercial news/data feeds;
- some weather/traffic/port/rail datasets where managed feeds are superior.

## 4. Scraping doctrine

Scraping is a collection mechanism, not a data strategy.

It may be used only when:

- access is lawful/contractually permitted;
- source terms permit the intended use;
- collection is technically reliable;
- provenance is preserved;
- rate limits and robots/access controls are respected as applicable;
- redistribution/derived-use rights are known;
- a source change cannot silently corrupt semantics.

Paid APIs are not automatically required, but avoiding API spend is never allowed to create legal, reliability, or evidence debt.

## 5. Resilience

No single commercial data vendor should become an unexamined constitutional dependency. Consumers declare minimum evidence needs and degraded behavior so FreightOS can switch, combine, or temporarily hold when a source fails.

---

<!-- SOURCE: 39_TYPED_GRAPH_ENGINEERING_STANDARD.md -->

# 39 — Typed Graph Engineering Standard

## Status and precedence

This is an additive **audit-candidate** graph standard for RevenueOS and Freight Market Intelligence (FMI). It does not replace accepted v1.3–v1.8 authority, WorkUnit, Job Book, network, or certification rules. Where a conflict exists, the stricter accepted rule controls and Claude must record the conflict.

## Required graph contract

Every consequential RevenueOS/FMI workflow MUST be represented as a typed durable graph. A sequence diagram, prompt chain, agent chat, cron job, queue consumer, or UI state machine is not sufficient by itself. Each graph must declare:

1. immutable graph ID and version;
2. canonical WorkUnit type and trigger;
3. one accountable owner for every active state;
4. state/node IDs;
5. entry preconditions and exit postconditions;
6. typed edge artifact;
7. edge guard;
8. independent authority check where relevant;
9. side-effect class;
10. timeout/deadline;
11. retry policy;
12. reconciliation rule;
13. stale-version invalidation rule;
14. failure transition;
15. terminal states;
16. graph-level invariants;
17. audit/evidence requirements;
18. kill-switch behavior;
19. certification and replay fixtures.

## Ownership invariant

Exactly one job/service/human role is accountable for a WorkUnit state at one time. Multiple components may contribute evidence, but shared accountability is prohibited. Ownership transfers only through a typed edge whose receiving preconditions pass.

## Typed edges, not chat

Every handoff carries a typed artifact and explicit version. Free-form text may be attached as evidence but cannot itself represent approval, authority, entitlement, command, source rights, or a binding commercial term.

## State transition discipline

A transition is valid only when:

`current state/version + required evidence + guard + receiver preconditions + independent policy/authority = permitted next state`.

No model output can replace deterministic policy/authority checks.

## Side-effect discipline

External communication, commercial offers, CRM mutations, entitlement intents, financial records, market publications, and logistics commands are separately classified side effects. Each binding side effect requires an idempotency key or an explicit non-repeatable protocol, durable result evidence, and reconciliation before retry when outcome is uncertain.

## Version invalidation

A WorkUnit/proposal/approval must be invalidated when a material referenced object changes and the graph declares that dependency binding. Examples: catalog version, price policy, source-rights status, customer configuration, Operational Twin fact, approval scope, forecast input snapshot, seller authority, or entitlement version.

## Cross-plane rule

RevenueOS, FMI, and operational participant workforces are separate authority planes. A typed artifact may cross a boundary; permissions do not. The receiver evaluates its own identity, policy, authority, freshness, and approval rules.

## Graph admission

No graph becomes production-valid because it appears in this package. Claude must map it against existing runtime/workflow constructs and accepted v1.5–v1.8 contracts. Owner acceptance can promote a surviving candidate to J0 specification; implementation/certification follows separately.

---

<!-- SOURCE: 40_REVENUEOS_TYPED_GRAPH_CATALOG.md -->

# 40 — RevenueOS Typed Graph Catalog

The commercial plane is decomposed into durable, typed graphs rather than conversational agent chains.

| Graph | Name | WorkUnit | Nodes | Edges | Machine-readable file |
|---|---|---|---:|---:|---|
| `REV-G01` | Prospect discovery and governed outreach | `CommercialProspectWorkUnit` | 6 | 5 | `graphs/revenueos/rev_g01.json` |
| `REV-G02` | Qualification and structured discovery | `CommercialQualificationWorkUnit` | 6 | 5 | `graphs/revenueos/rev_g02.json` |
| `REV-G03` | Customer solution configuration | `SolutionConfigurationWorkUnit` | 7 | 6 | `graphs/revenueos/rev_g03.json` |
| `REV-G04` | Quote and proposal control graph | `CommercialOfferWorkUnit` | 7 | 6 | `graphs/revenueos/rev_g04.json` |
| `REV-G05` | Partner deal registration and attribution | `DealRegistrationWorkUnit` | 5 | 4 | `graphs/revenueos/rev_g05.json` |
| `REV-G06` | Closed-won to implementation boundary | `ImplementationHandoffWorkUnit` | 6 | 5 | `graphs/revenueos/rev_g06.json` |
| `REV-G07` | Evidence-based expansion and renewal | `ExpansionWorkUnit` | 5 | 4 | `graphs/revenueos/rev_g07.json` |
| `REV-G08` | Commission calculation, hold, approval and reconciliation | `CommissionWorkUnit` | 8 | 7 | `graphs/revenueos/rev_g08.json` |

All graphs are `AUDIT_CANDIDATE`. They are not runtime implementation claims.

---

<!-- SOURCE: 41_FMI_TYPED_GRAPH_CATALOG.md -->

# 41 — Freight Market Intelligence Typed Graph Catalog

The FMI plane separates ingestion, verification, derivation, forecasting, relevance, briefing, correction, and maintenance/regulatory intelligence into independently testable graphs.

| Graph | Name | WorkUnit | Nodes | Edges | Machine-readable file |
|---|---|---|---:|---:|---|
| `FMI-G01` | Source-rights to normalized market observation | `MarketIngestionWorkUnit` | 6 | 5 | `graphs/fmi/fmi_g01.json` |
| `FMI-G02` | Freight news verification and publication | `FreightNewsWorkUnit` | 6 | 5 | `graphs/fmi/fmi_g02.json` |
| `FMI-G03` | Rate, capacity, and lane-state synthesis | `LaneMarketStateWorkUnit` | 7 | 7 | `graphs/fmi/fmi_g03.json` |
| `FMI-G04` | Demand, seasonality, disruption and market-regime graph | `MarketRegimeWorkUnit` | 7 | 6 | `graphs/fmi/fmi_g04.json` |
| `FMI-G05` | Forecast production and calibration | `MarketForecastWorkUnit` | 6 | 5 | `graphs/fmi/fmi_g05.json` |
| `FMI-G06` | Customer relevance and impact graph | `CustomerMarketImpactWorkUnit` | 6 | 5 | `graphs/fmi/fmi_g06.json` |
| `FMI-G07` | Market briefing and alert delivery | `MarketBriefingWorkUnit` | 6 | 5 | `graphs/fmi/fmi_g07.json` |
| `FMI-G08` | Maintenance/service-market intelligence | `MaintenanceMarketWorkUnit` | 5 | 4 | `graphs/fmi/fmi_g08.json` |
| `FMI-G09` | Regulatory and policy intelligence | `RegulatoryIntelligenceWorkUnit` | 5 | 4 | `graphs/fmi/fmi_g09.json` |
| `FMI-G10` | Correction, retraction, recompute and customer notice | `MarketCorrectionWorkUnit` | 6 | 5 | `graphs/fmi/fmi_g10.json` |

All graphs are `AUDIT_CANDIDATE`. They are not runtime implementation claims.

---

<!-- SOURCE: 42_CROSS_PLANE_OPERATIONAL_CONSUMPTION_GRAPHS.md -->

# 42 — Cross-Plane Operational Consumption Graphs

These graphs make the critical boundary explicit: FMI can inform an operational domain, but only the receiving participant workforce can propose/authorize/execute its logistics command under its accepted authority model.

| Graph | Name | WorkUnit | Nodes | Edges | Machine-readable file |
|---|---|---|---:|---:|---|
| `XPL-G01` | FMI-to-operational consumption authority bridge | `OperationalDecisionWorkUnit` | 6 | 6 | `graphs/cross_plane/xpl_g01.json` |
| `XPL-G02` | Carrier dispatch intelligence consumption | `OperationalDecisionWorkUnit` | 6 | 6 | `graphs/cross_plane/xpl_g02.json` |
| `XPL-G03` | Broker pricing/sourcing intelligence consumption | `OperationalDecisionWorkUnit` | 6 | 6 | `graphs/cross_plane/xpl_g03.json` |
| `XPL-G04` | Facility capacity/arrival intelligence consumption | `OperationalDecisionWorkUnit` | 6 | 6 | `graphs/cross_plane/xpl_g04.json` |
| `XPL-G05` | Shipper procurement/execution intelligence consumption | `OperationalDecisionWorkUnit` | 6 | 6 | `graphs/cross_plane/xpl_g05.json` |
| `XPL-G06` | Maintenance/service intelligence consumption | `OperationalDecisionWorkUnit` | 6 | 6 | `graphs/cross_plane/xpl_g06.json` |

All graphs are `AUDIT_CANDIDATE`. They are not runtime implementation claims.

---

<!-- SOURCE: 43_GRAPH_AUTHORITY_STATE_AND_HANDOFF_INVARIANTS.md -->

# 43 — Graph Authority, State and Handoff Invariants

The following invariants are blocking controls across every candidate graph.

1. **Single owner:** one accountable owner per WorkUnit state.
2. **No authority inheritance:** sender permissions never transfer with an artifact.
3. **Entitlement ≠ activation:** commercial entitlement never creates production operational authority.
4. **Signal ≠ command:** observation, derived indicator, forecast, news event, relevance score, impact statement, recommendation, and alert are non-command artifacts.
5. **Proposal ≠ approval:** an agent-produced proposal cannot approve itself.
6. **Approval is exact:** approval binds to exact subject, action, version, scope, limits, approver, and expiry.
7. **Stale invalidation:** material version changes invalidate bound proposals/approvals before side effect.
8. **Command isolation:** external side effects occur only through registered command/executor boundaries.
9. **Idempotent effect:** duplicate transport/delivery cannot duplicate a business effect.
10. **Reconcile before retry:** uncertain side-effect outcome must be reconciled before retry.
11. **Evidence lineage:** each consequential state is reconstructable from immutable/versioned evidence.
12. **Unknown fails closed:** missing identity, policy, source rights, approval, evidence, or authority yields HOLD/DENY/UNKNOWN.
13. **Kill-switch precedence:** disable/hold controls dominate graph progress.
14. **No hidden Twin mutation:** commercial/FMI learning may propose; it cannot silently rewrite approved customer operations.
15. **No graph self-modification:** agents cannot change graph topology, guards, authority rules, tools, budgets, or certification state.
16. **No cross-tenant learning leak:** customer/network-derived intelligence follows purpose, aggregation, privacy, and disclosure policy.

Any graph that cannot satisfy these invariants must be rejected or decomposed before implementation.

---

<!-- SOURCE: 44_GRAPH_FAILURE_RETRY_RECONCILIATION.md -->

# 44 — Graph Failure, Retry, Reconciliation and Recovery Standard

## Failure classes

Every graph node classifies failures as: `VALIDATION`, `AUTHORITY`, `POLICY`, `DEPENDENCY`, `TIMEOUT`, `RATE_LIMIT`, `MODEL`, `DATA_STALE`, `DATA_CONFLICT`, `SIDE_EFFECT_UNKNOWN`, `SIDE_EFFECT_REJECTED`, `KILL_SWITCH`, or `INTERNAL`.

## Retry

Retries are never implicit. Each node declares one of: `none`, `bounded_retry`, `idempotent_retry`, or `reconcile_before_retry`. Retry budgets, backoff, expiry, and dedupe/idempotency keys are runtime contracts to be fixed before J1.

## Crash windows

Certification must inject crashes immediately before and after each consequential side effect. Recovery must prove no lost effect, no duplicate effect, and evidence continuity.

## Reconciliation

External effects and externally visible publications require a reconciliation state. If outcome cannot be proven, the WorkUnit enters `HOLD/SIDE_EFFECT_UNKNOWN`; it cannot optimistically repeat.

## Stale work

Material dependency changes produce invalidation events. An in-flight WorkUnit must re-evaluate guards/authority before proceeding. Stale approvals or price/promise/source-rights decisions cannot be reused.

## Poison and repeated failure

Repeated deterministic failure routes to a dead-letter/exception WorkUnit with owner, evidence, last safe state, retry history, and recovery action. It never loops indefinitely.

## Degraded operation

Model or vendor outage preserves authoritative state. Deterministic routing may continue only when its inputs remain valid. Missing intelligence becomes `UNKNOWN/STALE`, not invented context.

---

<!-- SOURCE: 45_GRAPH_CERTIFICATION_SIMULATION_AND_REPLAY.md -->

# 45 — Graph Certification, Simulation and Replay Standard

A Job Book certification is insufficient if the graph containing that job is not certified. Certification therefore occurs at both **component** and **graph** levels.

## Candidate-to-production path

`AUDIT_CANDIDATE → G0 ACCEPTED SPEC → G1 STATIC CONTRACT → G2 ADVERSARIAL → G3 REPLAY/CRASH → G4 SHADOW → G5 BOUNDED LIVE`

Graph certification never raises a component above its own J-level or A-level; the effective permission is the strictest conjunction of graph, component, command, policy, entitlement, and autonomy controls.

## Required graph simulations

Every graph must test: happy path; duplicate trigger; duplicate edge delivery; stale source/config/catalog/policy version; wrong tenant; wrong participant/legal plane; invalid sender; receiver precondition failure; authority denial; approval expiry; kill switch at every consequential node; dependency outage; model outage; timeout; crash before side effect; crash after side effect; reconciliation mismatch; malformed typed artifact; prompt injection in untrusted text; and replay after correction.

## Cross-plane simulations

`XPL-G01..G06` additionally must prove that an FMI signal cannot directly call a logistics command, a RevenueOS entitlement cannot bypass operational activation, and a broker/carrier/facility/service agent never inherits the market-intelligence producer's permissions.

## Evidence

Graph certification produces graph/version, repository SHA, fixture IDs, node/edge coverage, injected failure matrix, observed transitions, audit/event trace, duplicate-effect oracle, stale-invalidation proof, and reviewer/owner acceptance.

---

<!-- SOURCE: 46_GRAPH_ACCEPTANCE_GATES_GR_01_GR_32.md -->

# 46 — Graph Acceptance Gates GR-01..GR-32

Status vocabulary: `PASS`, `PARTIAL`, `FAIL`, `NOT IMPLEMENTED`, `NOT APPLICABLE` with rationale. Documentation presence alone cannot produce PASS for an implementation/runtime gate.

| ID | Gate | Minimum evidence |
|---|---|---|
| GR-01 | Graph registry complete | Every RevenueOS/FMI consequential workflow has immutable graph ID/version and machine-readable definition |
| GR-02 | Schema validity | Every graph validates against typed-workflow-graph schema |
| GR-03 | Single-owner states | Automated check proves exactly one accountable owner per node |
| GR-04 | Reachability | All non-entry nodes reachable and all nonterminal nodes can reach a terminal/hold path |
| GR-05 | Typed edges | Every edge names a typed artifact |
| GR-06 | Receiver validation | Every cross-job edge requires receiver-side preconditions |
| GR-07 | Authority isolation | Sender authority never transfers across edge |
| GR-08 | Side-effect inventory | All external/binding side effects are explicitly classified |
| GR-09 | Idempotency | Duplicate delivery cannot duplicate business effect |
| GR-10 | Reconcile-before-retry | Unknown external effect is reconciled before retry |
| GR-11 | Stale invalidation | Material dependency/version changes invalidate stale work where required |
| GR-12 | Failure transitions | Every node has explicit failure transition |
| GR-13 | Timeout/deadline | Every node declares timeout/deadline policy |
| GR-14 | Retry budget | Retrying nodes have bounded/tested retry budget |
| GR-15 | Kill switch | Kill switch halts/holds graph safely at every consequential node |
| GR-16 | Audit reconstruction | Graph execution can be reconstructed from durable evidence |
| GR-17 | No free-form authority | Chat/text cannot satisfy approval/command/rights artifacts |
| GR-18 | No self-modification | Agent cannot change graph, guard, policy, tools, budgets, or certification |
| GR-19 | Entitlement boundary | Revenue entitlement cannot activate operational command |
| GR-20 | FMI boundary | FMI signal/forecast/alert cannot directly execute logistics command |
| GR-21 | Carrier consumption | Carrier consumer independently re-evaluates Twin/authority/policy |
| GR-22 | Broker consumption | Broker consumer independently evaluates quote/sourcing/margin/authority rules |
| GR-23 | Facility consumption | Facility intelligence cannot create physical gate/dock/custody authority |
| GR-24 | Service consumption | Maintenance intelligence cannot authorize repair/spend/roadside dispatch |
| GR-25 | Source-rights invalidation | Suspended/expired source rights stop new derived publication/use as required |
| GR-26 | Correction propagation | Source correction identifies and supersedes dependent artifacts |
| GR-27 | Forecast invalidation | Forecast is invalidated/recomputed on material bound input/model changes |
| GR-28 | Cross-tenant privacy | Graph fixtures prove tenant/network intelligence does not leak |
| GR-29 | Crash windows | Failure injection before/after side effects produces exactly-once business effect |
| GR-30 | Replay determinism | Deterministic nodes reproduce expected output from frozen inputs/version |
| GR-31 | Graph/component certification conjunction | Effective permission never exceeds strictest graph/J/A/command/policy limit |
| GR-32 | No documentation-only PASS | No GR gate passes without repository/runtime evidence where implementation is required |

---

<!-- SOURCE: 47_TYPED_ARTIFACT_WORKUNIT_AND_EDGE_CONTRACTS.md -->

# 47 — Typed Artifact, WorkUnit and Edge Contract Standard

## Purpose

Graph topology is not sufficient. Every node transition must be backed by versioned WorkUnit and handoff envelopes so ownership, evidence, authority, expiry, and stale-version behavior survive retries, restarts, and cross-plane transfer.

## WorkUnit envelope

The audit-candidate schema is `schemas/graph-workunit-envelope.schema.json`. A WorkUnit binds the exact graph/version/node, one owner, tenant and represented participant/legal plane, deadlines, input/policy references, approval/entitlement/autonomy references when relevant, retry state, idempotency key when relevant, and an audit correlation ID.

## Handoff envelope

The audit-candidate schema is `schemas/graph-handoff-envelope.schema.json`. A handoff binds exact source/target graph and node, source WorkUnit, tenant/participant, artifact type/version, payload/evidence refs, sender manifest version, expiry, and any authority/policy references.

The receiver MUST NOT trust the sender's authority. It validates the envelope, tenant/participant, artifact version, expiry, evidence freshness, policy, and its own authority before accepting ownership.

## Artifact registry

`graphs/TYPED_ARTIFACT_REGISTRY.json` enumerates every edge artifact used by the candidate graphs and every edge on which it appears. These names are candidates only: Claude must reconcile them against the accepted v1.8 `WorkUnit`, `JobHandoff`, network artifact, approval, command, and evidence contracts. Duplicate semantic types should be merged rather than creating parallel schemas.

## Authority-bearing artifacts

An artifact labelled authority-bearing is never authority merely because the JSON exists. Final accepted authority artifacts must bind exact principal, represented organization, action, subject, version, scope/limits, policy decision, approval basis, effective/expiry time, and revocation state, and must be checked outside probabilistic models.

## Compatibility

Breaking artifact or graph changes require a new version, migration/compatibility rule, in-flight WorkUnit treatment, stale invalidation behavior, replay proof, and deprecation window. Silent semantic change under the same version is prohibited.

---

<!-- SOURCE: 48_GRAPH_CHANGE_MANAGEMENT_AND_VERSIONING.md -->

# 48 — Graph Change Management and Versioning

## Immutable versions

A graph version is immutable once accepted. Changing node ownership, edge semantics, authority guard, side-effect class, artifact semantics, retry/reconciliation behavior, or terminal state requires a new graph version.

## Change classes

- `PATCH_METADATA`: description/evidence links only; no execution semantics.
- `COMPATIBLE_ADDITIVE`: additive optional evidence/observability with compatibility proof.
- `EXECUTION_SEMANTIC`: node/edge/guard/owner/side-effect/retry change; new graph version and replay required.
- `AUTHORITY_SEMANTIC`: permission/approval/command/legal-plane change; new version plus designated authority/security review and owner approval.

## In-flight WorkUnits

A release plan must state whether an in-flight WorkUnit finishes on the prior version, is safely migrated, is invalidated/restarted, or is held for human review. Silent reassignment to the latest graph is prohibited.

## Rollout

Accepted new versions progress through replay/shadow/canary or stricter existing FreightOS release controls. Version rollout cannot increase effective autonomy merely because graph topology changed.

## Rollback

Rollback must preserve evidence and reconcile external effects. A WorkUnit already producing an externally binding effect cannot simply be replayed on an older graph without command-specific reconciliation.

---

<!-- SOURCE: 49_END_TO_END_IMPLEMENTATION_SEQUENCE.md -->

# 49 — End-to-End Owner Implementation Sequence

## Purpose

This sequence is the controlling owner workflow for installing, auditing, and only then advancing FreightOS beyond this v1.8.1 architecture package.

The word **implementation** is deliberately split into three distinct acts:

1. **Install the immutable handoff package** into the FreightOS repository.
2. **Audit the package against accepted architecture and current repository reality** without changing runtime behavior.
3. **Authorize a later implementation plan** only after the owner reviews the audit result.

No runtime RevenueOS/FMI implementation, market-data ingestion, seller activation, commission payout, operational-command activation, or v1.9 continuation is authorized by steps 1 or 2.

---

## Phase A — Preserve current repository state

From the real FreightOS repository root:

```bash
cd /Users/jordanburwell/Developer/FreightOS

git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse main
git rev-parse origin/main
```

### Required gate A1

Proceed only when the working tree state is understood and intentionally preserved.

If the tree is dirty, do not delete, stash, reset, checkout, or move work merely to force a clean state. Record the state and resolve it under normal repository governance first.

### Required gate A2

The preserved unaccepted v1.9 draft remains quarantined. Do not inspect it for design evidence during this sequence.

---

## Phase B — Install v1.8.1 as documentation-only architecture

### B1 — Update accepted main

Only from a clean/authorized state:

```bash
git switch main
git pull --ff-only origin main
git status --short
```

Expected: clean working tree.

### B2 — Create an installation branch

```bash
git switch -c setup/install-revenueos-commercial-capability-v1.8.1
```

### B3 — Extract/copy the package

If the ZIP is in Downloads:

```bash
cd "$HOME/Downloads"
unzip -q FreightOS_v1.8.1_RevenueOS_Commercial_Capability_Architecture.zip
```

Then:

```bash
cd /Users/jordanburwell/Developer/FreightOS
mkdir -p docs/production-handoff
cp -R \
  "$HOME/Downloads/FreightOS_v1.8.1_RevenueOS_Commercial_Capability_Architecture" \
  "docs/production-handoff/v1.8.1-revenueos-commercial-capability-architecture"
```

If the destination already exists unexpectedly, stop and inspect. Do not merge two package copies by hand.

### B4 — Verify package integrity

```bash
cd docs/production-handoff/v1.8.1-revenueos-commercial-capability-architecture
shasum -a 256 -c MANIFEST.sha256
cd "$(git rev-parse --show-toplevel)"
```

Every manifest entry must report `OK`.

### B5 — Verify documentation-only scope

```bash
git status --short
git diff --stat
git diff --name-only
```

Expected changes are confined to:

```text
docs/production-handoff/v1.8.1-revenueos-commercial-capability-architecture/
```

Forbidden installation changes include runtime source, migrations, permissions, RLS, dependencies, credentials, `.env`, pricing configuration, live integrations, existing accepted handoff rewrites, or production agent activation.

### B6 — Stage and inspect

```bash
git add docs/production-handoff/v1.8.1-revenueos-commercial-capability-architecture

git diff --cached --stat
git diff --cached --name-only
```

### B7 — Commit

```bash
git commit -m "docs: install FreightOS RevenueOS capability architecture v1.8.1"
```

### B8 — Run current repository governance/CI checks

Use the exact checks defined by the current FreightOS repository. At minimum, where present, run:

- handoff package hash/integrity validation;
- handoff provenance/drift validation;
- formatting/docs/schema validation;
- network/governance validation;
- security/secret scan;
- any CI step required for documentation-only handoff PRs.

Do not weaken, skip, rename, or substitute a failing gate merely to obtain green status.

### B9 — Push

```bash
git push -u origin setup/install-revenueos-commercial-capability-v1.8.1
```

Open a documentation-only PR using `PR_BODY.md` as the basis for the PR description.

### B10 — Review and merge under normal governance

Do not self-declare the architecture implemented. This merge establishes the package as accepted documentation only.

---

## Phase C — Refresh accepted main after package merge

After the installation PR is accepted/merged:

```bash
cd /Users/jordanburwell/Developer/FreightOS
git switch main
git pull --ff-only origin main
git status --short
```

Record:

```bash
git rev-parse HEAD
git rev-parse origin/main
```

Expected: local `main == origin/main`, clean tree.

---

## Phase D — Launch an independent Claude cross-package audit

### D1 — Start a new Claude Code session

Use a new session rooted at:

```text
/Users/jordanburwell/Developer/FreightOS
```

Do not continue the v1.9 design session for this audit.

### D2 — Copy the controlling audit prompt

```bash
pbcopy < \
docs/production-handoff/v1.8.1-revenueos-commercial-capability-architecture/28_CLAUDE_CROSS_PACKAGE_AUDIT_PROMPT.md
```

Paste it into the new Claude session.

### D3 — Audit-only branch

Claude is instructed to create/use:

```text
audit/revenueos-commercial-capability-pre-v1.9
```

It must inspect accepted v1.3–v1.8 packages, current main implementation, migrations, tests, CI, WorkUnit/durable-graph infrastructure, authority, network, existing Job Books and workforce artifacts.

It must not inspect the quarantined unaccepted v1.9 draft for design evidence.

### D4 — Required audit surfaces

Claude must separately audit:

1. canonical Product → Twin → Capability → Job/Component → Graph hierarchy;
2. commercial entitlement versus operational activation/authority;
3. RevenueOS commercial-plane isolation;
4. seller/partner classes and authority;
5. Sales Promise Firewall;
6. pricing/discount/quote/deal-desk boundaries;
7. attribution/commission/payout separation;
8. implementation handoff;
9. shared Freight Market Intelligence substrate;
10. source rights/provenance/freshness/conflict/correction rules;
11. participant-specific market relevance;
12. FMI-to-Carrier operational consumption;
13. FMI-to-Broker operational consumption;
14. FMI-to-Facility/Shipper/RigDesk consumption;
15. all 37 provisional Job Books against the accepted 76-job workforce;
16. all 36 typed durable graphs, including TWIN-G01..TWIN-G12, against existing workflow/runtime architecture;
17. all typed edge artifacts, WorkUnit envelopes, ownership and cross-plane handoffs;
18. failure/retry/idempotency/reconciliation/stale-version behavior;
19. graph and job certification interaction;
20. cross-package conflicts and stricter-rule precedence.

### D5 — Required acceptance-gate scoring

Claude must score all four families using only reproducible repository evidence:

```text
REV-01..REV-48   (48)
FMI-01..FMI-28   (28)
GR-01..GR-32     (32)
TW-01..TW-40     (40)
---------------------
TOTAL            148
```

Allowed statuses:

- `PASS`
- `PARTIAL`
- `FAIL`
- `NOT IMPLEMENTED`
- `NOT APPLICABLE` with rationale

Documentation presence alone cannot produce `PASS` for runtime implementation.

### D6 — Required audit outputs

Claude must produce a repository-local audit package under:

```text
docs/revenueos-architecture-review/
```

At minimum:

```text
README.md
CURRENT_PRODUCT_COMMERCIAL_INVENTORY.md
CAPABILITY_GRAPH_GAP_MAP.md
ENTITLEMENT_ACTIVATION_GAP_MAP.md
REVENUE_PLANE_AUTHORITY_MAP.md
REVENUE_WORKFORCE_DECOMPOSITION.md
PROMISE_FIREWALL_GAP_MAP.md
PARTNER_CHANNEL_GAP_MAP.md
ATTRIBUTION_COMMISSION_GAP_MAP.md
FMI_ARCHITECTURE_GAP_MAP.md
FMI_WORKFORCE_DECOMPOSITION.md
MARKET_SOURCE_AND_PROVENANCE_GAP_MAP.md
OPERATIONAL_CONSUMPTION_BOUNDARY_MAP.md
GRAPH_RUNTIME_COMPATIBILITY_MAP.md
GRAPH_NODE_OWNERSHIP_AUDIT.md
GRAPH_EDGE_HANDOFF_AUDIT.md
GRAPH_FAILURE_REPLAY_GAP_MAP.md
JOB_BOOK_OVERLAP_AND_MERGE_MAP.md
REV_01_REV_48_MATRIX.md
FMI_01_FMI_28_MATRIX.md
GR_01_GR_32_MATRIX.md
CROSS_PACKAGE_CONFLICT_REGISTER.md
PROPOSED_ADDITIVE_PR_SEQUENCE.md
OWNER_DECISIONS.md        # only when genuinely unresolved
```

### D7 — Mandatory stop

Claude must stop after the audit. It is not authorized to:

- implement runtime RevenueOS/FMI;
- create migrations/tables;
- change production permissions;
- register or enable candidate jobs;
- ingest live market/news data;
- connect CRM/data vendors;
- activate sellers/partners;
- create commission payouts;
- change pricing;
- activate operational commands;
- read/use the quarantined v1.9 draft as evidence;
- continue v1.9.

---

## Phase E — Owner review gate

Bring back the complete Claude audit report and preferably the audit branch diff/package.

The owner review must answer:

1. Which v1.8.1 candidates are already implemented under different names?
2. Which candidate jobs duplicate or overlap accepted v1.8 Job Books?
3. Which responsibilities should be deterministic services rather than agents?
4. Which graph definitions fit existing durable execution unchanged?
5. Which graphs need translation into current repository-native workflow primitives?
6. Which cross-plane handoffs conflict with accepted authority/data rules?
7. Which proposed capabilities require new product/catalog primitives?
8. Which REV/FMI/GR gates are already satisfied by accepted runtime evidence?
9. Which failures are architectural blockers versus expected NOT IMPLEMENTED items?
10. What is the minimum additive implementation sequence that preserves main and existing production behavior?

### Audit verdict vocabulary

Use one of:

- `COHERENT`
- `COHERENT_WITH_REQUIRED_CHANGES`
- `BLOCKED`

No runtime implementation proceeds on `BLOCKED`.

---

## Phase F — Build the repository-specific implementation plan

Only after owner acceptance of the audit should the next package/branch convert surviving architecture candidates into implementation PRs.

The implementation sequence should be additive and dependency-ordered. A typical order is:

1. canonical catalog/capability contracts;
2. entitlement model and non-authoritative activation intent;
3. RevenueOS authority plane and Promise Firewall primitives;
4. repository-native WorkUnit/typed graph contracts or adapters;
5. surviving RevenueOS deterministic services/jobs at J0/J1 only;
6. FMI source registry/provenance contracts without live ingestion;
7. FMI deterministic normalization/quality services;
8. surviving FMI intelligence jobs in offline/replay environments;
9. customer relevance/impact calculation in non-operational mode;
10. cross-plane read-only operational consumption adapters;
11. shadow certification;
12. bounded commercial workflows;
13. seller/partner/attribution/commission accounting controls;
14. production capability activation only when technical certification and legal/commercial approvals both permit it.

Each PR must have its own tests, rollback/failure proof, exact authority change inventory, and no broader autonomy than required.

---

## Phase G — Relationship to v1.9

v1.9 remains paused during installation and audit.

After the audit, choose explicitly among:

1. v1.8.1 requires corrections before v1.9;
2. RevenueOS/FMI foundations become explicit prerequisites incorporated into the final v1.9 architecture;
3. RevenueOS/FMI can proceed as a parallel additive implementation stream without changing v1.9's core workforce scope;
4. material conflict requires redesign before either stream proceeds.

Do not merge the quarantined v1.9 draft merely because v1.8.1 exists.

---

## Final owner rule

The sequence is:

```text
INSTALL DESIGN
      ↓
VERIFY PACKAGE + CI
      ↓
MERGE DOCUMENTATION ONLY
      ↓
INDEPENDENT CROSS-PACKAGE AUDIT
      ↓
OWNER REVIEW
      ↓
REPOSITORY-SPECIFIC IMPLEMENTATION PLAN
      ↓
IMPLEMENT IN SMALL ADDITIVE PRs
      ↓
CERTIFY JOBS + GRAPHS
      ↓
SHADOW / REPLAY / FAILURE PROOF
      ↓
BOUNDED ACTIVATION
      ↓
ONLY THEN RESOLVE v1.9 CONTINUATION
```

No skipped arrow is authorized by this handoff.

## Operational Twin coexistence dependency gate

Before any later runtime implementation sequence is approved, the audit must resolve:

1. repository-native Twin representation and customer correction surface;
2. system/fact authority binding model;
3. adapter mapping/synchronization/conformance model;
4. human+agent shared WorkUnit ownership;
5. governed external writeback/reconciliation;
6. Twin learning/change proposal path;
7. network inbound/outbound projection path;
8. non-native counterparty bridge;
9. Twin experience-mode configuration versus actual authority;
10. TW-01..TW-40 evidence gaps.

A likely dependency order after audit is: read-only system binding → Twin projection/reconciliation → human assist/workbench → network ingress/egress → controlled writeback → learning/change control → workflow-specific approval execution → bounded autonomy. The audit may change this order.

---

<!-- SOURCE: 50_PACKAGE_RELEASE_AND_INTEGRITY_CHECKLIST.md -->

# 50 — Package Release and Integrity Checklist

## Release identity

- Package: `FreightOS_v1.8.1_RevenueOS_Commercial_Capability_Architecture`
- Architecture version: `v1.8.1`
- Status: documentation/contracts/fixtures only
- Runtime activation: none
- Required first executable action after merge: independent cross-package audit

## Required content families

A release is incomplete unless it contains all of the following:

- master handoff and constitution;
- capability/product/Twin/commercial architecture;
- RevenueOS authority, sales, channel, pricing, attribution and commission design;
- Sales Promise Firewall;
- FMI substrate, provenance, signal taxonomy, relevance engine and source strategy;
- 17 RevenueOS provisional Job Books in Markdown and JSON;
- 20 FMI provisional Job Books in Markdown and JSON;
- machine-readable graph registry;
- 8 RevenueOS graphs;
- 10 FMI graphs;
- 6 cross-plane graphs;
- typed artifact registry;
- graph node ownership and edge-handoff matrices;
- schemas for commercial and FMI objects;
- schemas for typed graphs, graph WorkUnits and graph handoffs;
- provisional Job Book descriptor schema;
- REV-01..REV-48 gates;
- FMI-01..FMI-28 gates;
- GR-01..GR-32 gates;
- adversarial/failure/replay guidance;
- cross-package audit specification;
- Claude audit prompt;
- installation/owner runbook;
- end-to-end implementation sequence;
- README, PR body, combined handoff, and manifest.

## Static integrity checks

Before distribution:

1. Every JSON file parses.
2. Every typed graph validates against `schemas/typed-workflow-graph.schema.json`.
3. Every provisional Job Book JSON validates against `schemas/provisional-job-book.schema.json`.
4. Every graph edge references nodes in the same graph.
5. Every graph has at least one entry and terminal state and all non-entry nodes are reachable from an entry path unless explicitly documented otherwise.
6. Every Job Book graph membership resolves to a graph in `graphs/GRAPH_REGISTRY.json`.
7. Every typed graph edge artifact resolves to the typed artifact registry where required.
8. Graph node ownership and edge-handoff matrices correspond to machine-readable graph definitions.
9. `COMBINED_HANDOFF.md` includes all numbered handoff files.
10. `MANIFEST.sha256` validates every distributed package file except the manifest itself.
11. The ZIP is rebuilt only after all checks above pass.

## Audit non-regression checks

Before package acceptance, verify that the handoff does not itself:

- change runtime code;
- change a migration;
- change privileges/RLS;
- activate A3/A4/A5;
- register/enable an audit-candidate job as production;
- mark an audit-candidate graph production-valid;
- connect a market/news source;
- create pricing or commission payout side effects;
- create seller/partner identities;
- change an Operational Twin;
- authorize v1.9.

## Completion condition

A release may be called **package-integrity complete** when all static checks pass and the manifest validates exactly. This does not mean the architecture is repository-implemented or production-certified.

## Twin refinement release checks

- [ ] Files 51–62 present
- [ ] TWIN-G01..TWIN-G12 validate against typed graph schema
- [ ] Twin graph registry/matrices match graph files
- [ ] Twin schemas parse
- [ ] Twin fixtures parse
- [ ] TW-01..TW-40 present
- [ ] Claude audit prompt requires TWIN audit and stops before implementation/v1.9
- [ ] Combined handoff includes 51–62
- [ ] Manifest regenerated after all changes
- [ ] Final ZIP verified from fresh extraction

---

<!-- SOURCE: 51_OPERATIONAL_TWIN_INTERACTION_FABRIC.md -->

# 51 — Operational Twin Interaction Fabric

## Purpose

This additive audit-candidate standard closes the coexistence boundary between a participant's Operational Twin, its human workforce, its existing software estate, FreightOS agents/services, and the wider FreightOS network.

It does **not** require a customer to replace its TMS, WMS, YMS, ERP, ELD, telematics, maintenance, accounting, email, document, or other operational systems. It does not promote autonomy. Existing v1.3–v1.8 security, authority, network, workflow, Job Book, and certification rules remain controlling.

## North-star contract

The Operational Twin is the participant's governed semantic and operational coordination layer. It must be useful in all of these conditions:

1. human-led operation with FreightOS only observing;
2. human-led operation with FreightOS assisting/drafting;
3. mixed human + agent collaboration on shared WorkUnits;
4. selected actions executed only after explicit approval;
5. selected workflows operating under bounded autonomy;
6. legacy counterparties interacting through email/EDI/API/link/document channels;
7. connected counterparties exchanging canonical FreightOS network artifacts;
8. native counterparties coordinating through their own Twins and independently evaluated authority.

A customer may occupy different modes simultaneously by workflow. Example: autonomous document/status work, approval-gated dispatch, human-led pricing, and observe-only maintenance.

## The Twin is not automatically the system of record

For every material fact or command domain, the Twin SHALL know the declared authority relationship between FreightOS and external systems. The Twin may be:

- authoritative;
- a governed mirror of an external authoritative system;
- a derived projection;
- a holder of customer-approved configuration;
- a receiver of network assertions with provenance;
- a coordination layer spanning multiple systems.

No adapter may silently make FreightOS authoritative merely because it can read or write a field.

## Five interaction surfaces

```text
HUMAN WORKFORCE
      ↕
TWIN WORKBENCH / WORKUNITS
      ↕
PARTICIPANT OPERATIONAL TWIN
  ↙        ↓         ↘
AGENTS   SYSTEMS    NETWORK
         OF RECORD
```

The Twin must keep these surfaces separate enough to preserve authority and provenance while making them feel like one coherent operating environment to the customer.

## Internal state versus network state

Internal Twin state is never automatically a network publication. Network communication is a projection:

```text
Internal fact/work state
      ↓
disclosure + purpose + relationship policy
      ↓
canonical network artifact
      ↓
receiving participant independently authenticates/evaluates
      ↓
its own Twin / WorkUnit / authority plane
```

## Customer-understandable guarantees

The customer must be able to answer:

- What is FreightOS doing now?
- What is a person doing now?
- Which system is authoritative for this fact?
- What came from my TMS/WMS/etc.?
- What did FreightOS infer or propose?
- What changed and who approved it?
- What is waiting for my approval?
- What was sent to a counterparty?
- What did that counterparty actually acknowledge?
- What will happen if an integration is stale or unavailable?
- Which workflows are observe/assist/approval/autonomous today?

## Non-regression

This layer must not create:

- a shadow TMS/WMS/ERP;
- hidden customer-specific business logic inside adapters;
- hidden learned configuration;
- authority transfer through network messages;
- cross-tenant data leakage;
- duplicate side effects during sync/writeback;
- a requirement that all counterparties become FreightOS customers.

---

<!-- SOURCE: 52_HUMAN_AGENT_COEXISTENCE_AND_WORKFORCE_AUGMENTATION.md -->

# 52 — Human + Agent Coexistence and Workforce Augmentation

## Goal

FreightOS must create value before full autonomy. The system SHALL support an existing workforce using the Operational Twin as an added employee base, analyst, coordinator, dispatcher assistant, document team, exception desk, or communication layer without forcing organizational replacement.

## Experience modes

These are customer-facing operating modes, not replacements for accepted autonomy/certification levels. Effective authority is still the minimum permitted by Job certification, graph certification, A-level/action grant, policy, approval, legal plane, command permission, and current state.

| Mode | Customer experience | Side effects |
|---|---|---|
| `OBSERVE` | Twin watches, normalizes, summarizes, detects | none |
| `ASSIST` | drafts, recommends, retrieves, prepares | none unless a separate authorized deterministic action exists |
| `COLLABORATE` | human and agent share a WorkUnit; agent performs bounded subwork | only independently authorized sub-actions |
| `APPROVAL_EXECUTE` | agent prepares exact action; authorized human/service approves exact version | approved command only |
| `BOUNDED_AUTONOMY` | certified graph executes permitted action classes within current grants | bounded commands only |

Mode is set **per workflow/action**, not globally per customer.

## Shared WorkUnit doctrine

One WorkUnit has one accountable owner at a time. Human and agent participation is represented as explicit ownership/handoff, contribution, review, or approval events—not ambiguous shared ownership.

A human may:

- take ownership;
- edit a draft;
- reject a recommendation;
- request more evidence;
- approve an exact proposal;
- override when policy permits;
- place a WorkUnit on hold;
- escalate;
- return ownership to an agent/job.

An agent may not treat a human's free-text chat as a permission grant unless it is converted into the accepted typed approval/command contract by the deterministic authority layer.

## Workforce augmentation UX

The Twin workbench should expose role-specific queues rather than requiring users to converse with a chatbot for every task:

- work queue;
- exceptions;
- approvals;
- drafts ready for review;
- network inbox/outbox;
- stale integration warnings;
- customer/Twin change proposals;
- recommended next actions;
- evidence and rationale;
- SLA/deadline status;
- handoff/ownership history.

## Human learning loop

Repeated human behavior may generate a candidate pattern. It may not silently become policy.

```text
Observed human action
→ pattern candidate
→ evidence window
→ proposed Twin/SOP/config change
→ impact analysis
→ authorized customer review
→ APPROVED or REJECTED
→ versioned Twin change
→ affected graph/agent re-evaluation
```

## Mixed-maturity customer example

A carrier may run:

- document ingestion/status = bounded autonomous;
- load scoring = assist;
- dispatch assignment = approval-execute;
- customer exception communication = collaborate;
- repair authorization = human-led;

The Twin remains one coherent operating context across all five.

---

<!-- SOURCE: 53_SYSTEM_OF_RECORD_BINDING_AND_SYNC_STANDARD.md -->

# 53 — System-of-Record Binding and Synchronization Standard

## Purpose

An Operational Twin must integrate with the customer's current software without creating ambiguous truth or unsafe bidirectional loops.

## Required binding model

Every material object/field family SHALL declare a binding containing at minimum:

- participant/tenant;
- external system identity and adapter version;
- canonical FreightOS object/field;
- external object/field;
- external identifier mapping;
- authority mode;
- sync direction;
- freshness/SLA;
- conflict rule;
- write permission;
- idempotency strategy;
- ordering/version strategy;
- deletion/tombstone behavior;
- reconciliation method;
- classification/disclosure restrictions;
- effective interval;
- owner and kill switch.

## Authority modes

- `EXTERNAL_AUTHORITATIVE` — external system owns the business fact; FreightOS mirrors/uses it.
- `FREIGHTOS_AUTHORITATIVE` — FreightOS owns the business fact and may project/write it to integrations when authorized.
- `CUSTOMER_CONFIG_AUTHORITATIVE` — approved Twin configuration owns the rule/policy.
- `NETWORK_ASSERTED` — counterparty/network assertion is evidence, not automatically local truth.
- `DERIVED` — computed from authoritative inputs; must retain lineage/version.
- `HUMAN_ASSERTED` — authorized human assertion with provenance; subject to declared verification rules.

`BIDIRECTIONAL` is a transport direction, **not** an authority mode.

## Sync directions

- `PULL_ONLY`
- `PUSH_ONLY`
- `BIDIRECTIONAL_GOVERNED`
- `EVENT_SUBSCRIPTION`
- `MANUAL_IMPORT`
- `NO_SYNC_REFERENCE_ONLY`

## Inbound synchronization

```text
external event/snapshot
→ authenticate source
→ dedupe/order/version
→ map to canonical semantics
→ evaluate declared authority binding
→ detect conflict/staleness
→ record observation/evidence
→ update governed Twin projection if allowed
→ emit impacted-workflow invalidation/re-evaluation
```

## Outbound/writeback

```text
approved local business change
→ current binding/authority check
→ adapter command
→ idempotency key
→ external result
→ read-after-write or equivalent reconciliation
→ authoritative status update
```

A timeout after a potentially successful external write is `UNKNOWN`, not failure. Reconcile before retry.

## Loop prevention

Every adapter path must prevent event echo/feedback loops through stable correlation/causation IDs, source/version markers, idempotency keys, and semantic comparison where needed.

## Conflict doctrine

Conflicts SHALL be explicit states, not last-writer-wins by accident. Permitted strategies include:

- authoritative-source wins;
- version/sequence wins where contractually valid;
- human review;
- relationship-specific rule;
- merge for non-exclusive fields;
- HOLD when truth cannot be established.

## Adapter doctrine

Adapters translate. They do not own participant business policy. Customer-specific differences belong in versioned mappings/configuration/Twin policy, not code forks inside connectors.

---

<!-- SOURCE: 54_TWIN_LEARNING_CONFIGURATION_AND_CHANGE_CONTROL.md -->

# 54 — Twin Learning, Configuration, and Change Control

## Principle

The Twin may learn **about** how a customer operates; it may not silently rewrite how the customer is authorized to operate.

## Knowledge classes

- `OBSERVED` — event or behavior observed with provenance;
- `INFERRED` — model/analytic interpretation with confidence;
- `PROPOSED` — candidate Twin/SOP/configuration change;
- `VERIFIED` — evidence checked according to policy;
- `APPROVED` — authorized customer configuration;
- `DISPUTED`;
- `DEPRECATED`.

Only approved facts/rules may become authoritative configuration where v1.7 requires approval.

## Learnable domains

Subject to customer policy and data rights, the Twin may propose learning about:

- role ownership;
- common routing patterns;
- preferred communication channels;
- business hours/time zones;
- recurring exception handling;
- appointment practices;
- document expectations;
- escalation chains;
- customer/vendor preferences;
- workflow sequencing;
- thresholds that are not constitutional/legal/safety boundaries.

## Non-learnable without explicit controlled change

Observation cannot silently modify:

- identity/authority;
- legal plane;
- financial destinations;
- safety constraints;
- privacy/data-sharing rules;
- kill switches;
- autonomy ceiling;
- seller promises;
- regulated compliance decisions;
- system-of-record authority binding.

## Twin diff

Every accepted change emits a semantic diff with:

- before/after;
- provenance;
- approver;
- effective date;
- affected jobs/graphs;
- affected integrations;
- affected network projections;
- affected entitlements/autonomy grants where applicable;
- re-certification/replay requirements.

## Rollback/correction

A bad learned rule must be reversible without erasing evidence. Correction creates a new version and preserves prior history.

---

<!-- SOURCE: 55_NETWORK_COMMUNICATION_AND_COUNTERPARTY_INTERACTION_STANDARD.md -->

# 55 — Network Communication and Counterparty Interaction Standard

## Goal

Every participant Twin should communicate seamlessly with the broader FreightOS network while preserving each participant's independent authority, confidentiality, systems of record, and adoption level.

## Network participation remains asymmetric

A native FreightOS carrier can communicate with a broker using only EDI/email/API. A native facility can coordinate with a non-native driver. A connected shipper can exchange canonical events without adopting a native Twin. Network utility must not require simultaneous native adoption.

## Inbound network path

```text
network artifact
→ authenticate sender/workload
→ resolve participant + relationship
→ verify schema/version/signature/freshness
→ purpose/disclosure policy
→ map canonical object references
→ create/update local WorkUnit or observation
→ local Twin/policy/authority evaluation
→ human/agent processing
```

Receipt of a network artifact never transfers sender authority.

## Outbound network path

```text
internal Twin/work state
→ candidate network projection
→ classification + purpose + relationship
→ minimum-necessary field projection
→ customer/network disclosure policy
→ canonical artifact
→ durable send
→ acknowledgement/result
→ reconciliation
```

## Internal versus external vocabulary

The Twin may preserve a customer's local vocabulary and system identifiers while the network uses canonical FreightOS semantics. Mapping is versioned and provenance-bearing.

## Conversation continuity

Human emails, SMS/voice transcripts, EDI messages, API events, and native agent/network messages may all belong to one business conversation/workflow, but the canonical business state must not depend on free-form transcript alone.

Required correlation should include, where applicable:

- participant IDs;
- shipment/load/visit/service-case references;
- WorkUnit/workflow ID;
- correlation/causation IDs;
- sender identity;
- channel;
- message/artifact version;
- evidence references;
- acknowledgement/reconciliation state.

## Counterparty trust boundary

One participant's agent cannot invoke another participant's internal tools. It may send a Request/Proposal/Tender/etc.; the receiving side independently evaluates identity, relationship, policy, authority, and current state.

## Human-network bridge

A customer employee may use the Twin workbench to communicate outward through FreightOS while FreightOS handles canonical references, evidence, channel routing, tracking, and reconciliation. This is valuable even when the employee remains the decision maker.

---

<!-- SOURCE: 56_PARTICIPANT_TWIN_BEHAVIOR_PROFILES.md -->

# 56 — Participant Twin Behavior Profiles

This file specifies how the common Twin interaction fabric specializes without creating separate foundations.

## Carrier Operational Twin (COT)

**Existing-system coexistence:** TMS, load boards/work sources, ELD/telematics, routing, maintenance systems, accounting/factoring, email/docs.

**Human augmentation:** dispatch queues, load/economics recommendations, assignment drafts, exception desk, document/status automation, maintenance coordination.

**Network inputs:** tenders, appointment responses, facility readiness, shipper/broker requests, service-provider updates, FMI context.

**Network outputs:** capacity, tender responses, ETA/milestones, exceptions, documents, appointment requests, asset-readiness/service status subject to disclosure policy.

**Critical rule:** TMS coexistence can remain permanent; FreightOS need not become the TMS system of record to provide agent/network value.

## Broker Operational Twin (BOT)

**Coexistence:** brokerage TMS, CRM, email, load boards/carrier networks, accounting/settlement, compliance/qualification sources.

**Human augmentation:** RFQ triage, pricing context, carrier sourcing, qualification evidence, negotiation drafts, coverage desk, tracking/exception/document reconciliation.

**Network:** shipper requests/quotes, carrier requests/tenders, facility coordination, evidence and execution events.

**Critical rule:** Brokerage Plane authority remains structurally separate; Twin/network convenience cannot erase regulated broker controls.

## Facility Operational Twin (FOT)

**Coexistence:** WMS/YMS/ERP, dock/yard systems, appointment tools, gate systems, email/docs, safety/physical controllers.

**Human augmentation:** appointment desk, arrival/readiness, document intake, yard/dock recommendations, shipping/receiving exception coordination.

**Network:** readiness, appointments, arrival/check-in status, dock/custody evidence, detention/discrepancy events.

**Critical rule:** physical/safety authority and authoritative WMS/YMS state remain independently governed; FreightOS may coordinate without replacing them.

## Shipper Operational Twin (SOT)

**Coexistence:** ERP/TMS/procurement, order management, supplier portals, warehouse systems, finance.

**Human augmentation:** transportation intake, routing/tender recommendations, visibility/control tower, exception and invoice review.

**Network:** shipment intent/tenders, requirements, status requests, exception coordination, settlement evidence.

## Service Provider Operational Twin (SPOT / RigDesk context)

**Coexistence:** shop/dealer/DMS/field-service systems, scheduling, parts inventory, OEM/provider networks, accounting.

**Human augmentation:** service intake, triage, capacity/scheduling, estimate drafting, status/evidence, parts/service coordination.

**Network:** service requests, acceptance/capacity, estimate/status, completion/evidence/billing artifacts.

**Critical rule:** diagnostic intelligence does not itself authorize repair spending, towing, or physical service actions.

## Common user experience

Each profile exposes the same conceptual controls with domain-specific labels:

- My work;
- Agent work;
- Needs approval;
- Exceptions;
- Network inbox/outbox;
- System health/sync;
- Twin knowledge/configuration;
- workflow mode/autonomy;
- evidence/audit.

---

<!-- SOURCE: 57_TWIN_INTERACTION_TYPED_GRAPH_CATALOG.md -->

# 57 — Twin Interaction Typed Graph Catalog

All graphs below are `AUDIT_CANDIDATE`. Claude must reconcile them against existing v1.5–v1.8 WorkUnit/workflow infrastructure and merge duplicates rather than creating a second runtime.

| ID | Purpose | Core boundary |
|---|---|---|
| TWIN-G01 | system discovery and binding | no integration becomes authoritative without approved binding |
| TWIN-G02 | inbound external-system synchronization | map/dedupe/order/conflict before Twin projection |
| TWIN-G03 | human-led WorkUnit with agent assistance | assistance cannot silently become action |
| TWIN-G04 | collaborative draft/review/approval | exact-version approval before controlled execution |
| TWIN-G05 | authorized external-system writeback | idempotent command + reconcile-before-retry |
| TWIN-G06 | Twin learning/configuration change | observed behavior becomes proposal, never hidden rule |
| TWIN-G07 | inbound network communication | sender authority never transfers to receiver |
| TWIN-G08 | outbound network projection | minimum-necessary purpose-limited disclosure |
| TWIN-G09 | cross-party request/response coordination | each participant independently decides/executes |
| TWIN-G10 | fact conflict and reconciliation | conflicts visible; no accidental last-writer-wins |
| TWIN-G11 | integration degraded/disconnected recovery | stale status explicit; recovery reconciles |
| TWIN-G12 | workflow experience-mode/autonomy change | mode change cannot raise effective authority by itself |

Machine-readable definitions live under `graphs/twin/`.

---

<!-- SOURCE: 58_TWIN_FAILURE_CONFLICT_AND_RECONCILIATION.md -->

# 58 — Twin Failure, Conflict, and Reconciliation

## Failure classes

- adapter unavailable;
- authentication/credential failure;
- schema/version mismatch;
- stale external snapshot;
- duplicate event;
- out-of-order event;
- conflicting authoritative claims;
- external write outcome unknown;
- mapping ambiguity;
- customer configuration conflict;
- network acknowledgement timeout;
- counterparty correction/dispute;
- human/agent concurrent edit;
- kill switch/revocation.

## Required behavior

Unknown is represented as `UNKNOWN/STALE/HOLD`, never silently interpreted as current truth.

## Concurrent human/agent edit

Material edits must use version/precondition checks. If a human edits the WorkUnit/proposal after an agent prepared it, any approval bound to the prior version is invalidated.

## External write uncertainty

```text
command submitted
→ timeout/uncertain result
→ mark OUTCOME_UNKNOWN
→ query/reconcile external state
→ confirmed effect? record success
→ confirmed no effect? bounded retry if still authorized/current
→ cannot establish? HOLD/escalate
```

## Integration outage

The Twin should continue safe functions that do not require fresh unavailable data. Anything dependent on stale authoritative data must degrade visibly and fail closed where required.

## Recovery

After restoration:

- re-authenticate;
- determine missed change window;
- ingest/replay safely;
- reconcile versions;
- invalidate stale proposals/approvals;
- resolve conflicts;
- restore freshness status;
- record recovery evidence.

---

<!-- SOURCE: 59_TWIN_DATA_DISCLOSURE_AND_NETWORK_PROJECTION.md -->

# 59 — Twin Data Disclosure and Network Projection

## Principle

The Twin may know far more than any counterparty is allowed to know. Network participation therefore requires explicit projection, never raw-Twin sharing.

## Projection decision

Every outbound network artifact is evaluated against:

- sender identity/represented organization;
- receiver or permitted audience;
- relationship;
- business purpose;
- object/workflow context;
- data classification;
- consent/contract;
- legal plane;
- field-level disclosure policy;
- retention/usage constraints;
- version/effective time.

## Examples

A carrier may share `available_capacity` without sharing driver payroll or private cost structure.

A facility may share `appointment_confirmed` without sharing its full internal production schedule.

A broker may tender agreed commercial terms without exposing other carriers' bids.

A shipper may communicate requirements without exposing internal procurement strategy.

A service provider may share service completion/readiness without exposing unrelated customer records.

## Network-derived data returning to Twin

Network observations remain provenance-bearing. A counterparty assertion is not automatically local authoritative truth. It may update local state only under the relevant relationship, verification, and authority binding.

## Aggregate intelligence

Cross-customer/network learning remains subject to the existing FMI privacy, aggregation, re-identification, purpose, and rights controls.

---

<!-- SOURCE: 60_TWIN_ACCEPTANCE_GATES_TW_01_TW_40.md -->

# 60 — Operational Twin Interaction Acceptance Gates TW-01..TW-40

No gate is PASS from documentation alone.

| ID | Requirement | Minimum evidence |
|---|---|---|
| TW-01 | Every participant profile maps to common Twin interaction contract | repository/schema mapping |
| TW-02 | Systems of record are explicitly inventoried | tenant fixture + configuration evidence |
| TW-03 | Material fields/object families have authority bindings | binding registry + negative tests |
| TW-04 | External IDs map to canonical IDs with provenance | mapping tests |
| TW-05 | Customer can onboard read-only before write authority | integration test |
| TW-06 | Inbound sync is idempotent | duplicate delivery test |
| TW-07 | Ordering/version semantics are enforced | reordered-event test |
| TW-08 | Adapter echo/feedback loops are prevented | loop fault-injection test |
| TW-09 | Freshness/staleness is explicit | outage/stale-data test |
| TW-10 | Conflicting facts create explicit conflict state | conflicting-source test |
| TW-11 | Conflict resolution follows declared authority rule | deterministic resolution test |
| TW-12 | Human correction/override is versioned and auditable | workflow test |
| TW-13 | Observed behavior only proposes Twin change | learning test |
| TW-14 | No hidden learning can rewrite approved configuration | adversarial/mutation test |
| TW-15 | SOP/config changes are versioned with impact diff | version/change test |
| TW-16 | Human and agent participation uses one WorkUnit model | runtime mapping + tests |
| TW-17 | Exactly one accountable owner exists per WorkUnit state | invariant test |
| TW-18 | OBSERVE/ASSIST cannot acquire side-effect authority from mode label | negative authority test |
| TW-19 | Approval binds exact proposal/version/scope | stale approval test |
| TW-20 | Experience mode is per workflow/action and cannot exceed accepted autonomy | policy tests |
| TW-21 | External writeback requires declared binding + command authority | negative permission test |
| TW-22 | External writeback is idempotent | duplicate/crash test |
| TW-23 | Unknown write result reconciles before retry | timeout/crash test |
| TW-24 | Dependency outage has safe degraded/disconnected behavior | failure simulation |
| TW-25 | Inbound network artifacts authenticate sender/relationship/purpose | adversarial network tests |
| TW-26 | Outbound network data passes disclosure projection | field-level negative tests |
| TW-27 | Minimum-necessary disclosure is enforced | projection fixtures |
| TW-28 | Non-native counterparties can participate through supported channels | email/EDI/API/link fixture/test |
| TW-29 | Local vocabulary maps to canonical network semantics | conformance tests |
| TW-30 | Network messages never transfer sender authority | cross-party adversarial test |
| TW-31 | Cross-tenant Twin/system/network paths remain isolated | DB/API/cache/storage tests |
| TW-32 | TMS/WMS/ERP replacement is not required for supported integration mode | coexistence pilot evidence |
| TW-33 | Adapter mapping/version/conformance is explicit | conformance report |
| TW-34 | Customer can reconstruct source, decision, owner, send and acknowledgement | audit trace demo |
| TW-35 | Customer can inspect/correct approved Twin understanding | UX + authorization test |
| TW-36 | COT/BOT/FOT/SOT/SPOT preserve domain ownership differences | profile contract tests |
| TW-37 | Scale changes topology, not Twin/authority semantics | multi-size fixtures/load tests |
| TW-38 | Human workbench supports queues, approvals, exceptions and handoffs without chatbot-only operation | UX acceptance evidence |
| TW-39 | TWIN graphs pass static/adversarial/replay/shadow certification before bounded live use | graph certification evidence |
| TW-40 | Claims of seamless coexistence/network operation require customer-live integration and network evidence | production evidence, not design |

---

<!-- SOURCE: 61_FINAL_ARCHITECTURE_AUDIT_AND_CLAIM_BOUNDARY.md -->

# 61 — Final Architecture Audit and Claim Boundary

## Audit conclusion at design level

The accepted v1.4/v1.7 architecture already contains the correct strategic primitives: protocol-before-monopoly, preservation of existing system investments, participant Operational Twins, systems-of-record declarations, adapter/conformance, staged onboarding, non-native counterparty participation, typed network artifacts, and no hidden learning.

The v1.8.1 package adds the missing commercialization, RevenueOS, FMI, Job Book, typed-graph, and cross-plane controls. This refinement adds the previously underspecified runtime coexistence contract among Twin, humans, existing systems, and network.

Therefore the architecture is **coherent as a design hypothesis** if the repository audit confirms no material contradictions.

## What the architecture can claim after implementation evidence

A strong eventual category claim can be supported only after evidence proves the implemented system can:

1. model a participant's real operation in an inspectable/correctable Twin;
2. coexist with existing TMS/WMS/ERP/ELD/etc. without mandatory rip-and-replace;
3. augment a human workforce before full autonomy;
4. promote selected workflows progressively under bounded authority;
5. coordinate agents and humans through durable typed WorkUnits;
6. communicate with native, connected, and external counterparties through governed network contracts;
7. preserve independent participant authority and data sovereignty;
8. reconcile side effects and system/network truth under failure;
9. do the above across more than one participant class with customer-live evidence.

## Claim that remains prohibited before evidence

Do not say the architecture alone proves that FreightOS is already "the system in which all logistics operates," that every TMS can be integrated, that full autonomy is achieved, or that the network is seamless at production scale.

Use staged language: designed → implemented → certified → shadow-proven → customer-live → scaled.

## Final pre-v1.9 audit thesis

Claude must now test whether the real repository can support the unified model without a second orchestration runtime, shadow authority plane, duplicated Twin source of truth, or customer-specific code forks.

---

<!-- SOURCE: 62_TWIN_WORKBENCH_AND_HUMAN_CONTROL_SURFACE.md -->

# 62 — Twin Workbench and Human Control Surface

## Purpose

The Operational Twin must be usable as a workforce multiplier, not only as infrastructure for autonomous agents.

## Core surfaces

### My Work
WorkUnits owned by the human, prioritized by deadline/risk/business value.

### Agent Work
Visible work being handled by agents/services, with state, owner, deadline, evidence and ability to interrupt where authorized.

### Needs Approval
Exact-version proposals with summarized action, consequence, evidence, policy basis, expiry and approve/reject/modify paths.

### Exceptions
Conflicts, stale integrations, uncertain external writes, network disputes, SLA breaches and unsupported cases.

### Network Inbox / Outbox
Business artifacts grouped by shipment/visit/service case/counterparty, with acknowledgement/reconciliation—not a generic chat feed.

### Systems & Sync
Connected systems, authority bindings, freshness, last successful synchronization, mappings, degraded state and kill switches.

### Twin Knowledge
Approved operational facts/SOPs/configuration, provenance, pending proposals, corrections and semantic diffs.

### Workflow Modes
Per-workflow customer-facing mode plus the stricter effective certification/autonomy state. Changing the UI mode cannot itself change authority.

### Evidence / Audit
Who/what acted, why, what source was used, what was sent, what happened externally, and whether reconciliation closed.

## UX doctrine

- role-aware, not agent-centric;
- exception-first at scale;
- explain source/freshness/confidence;
- make automation interruptible where policy allows;
- never hide degraded/stale state behind a confident model response;
- customers should not need to understand graph IDs to operate the system;
- enterprise administrators may inspect the underlying graph/authority/configuration contracts.

## Workforce transition

The same interface should remain usable as a customer progresses from human-heavy to autonomous operation. The queue composition changes; the underlying objects, evidence, policies, and network relationships do not need to be rebuilt.
