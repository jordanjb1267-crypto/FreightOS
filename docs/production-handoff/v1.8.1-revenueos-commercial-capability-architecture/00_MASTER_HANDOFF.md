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
