# Sequencing Doctrine and Active Build Scope

**Version:** 1.2.0  
**Status:** Binding implementation-control doctrine  
**Authority:** Subordinate only to the Constitution, legal/safety gates, and explicit signed owner decisions

## 1. Core doctrine

> Architect the complete FreightOS ecosystem now, but implement only the approved active build scope.

A deferred product may receive domain interfaces, schemas, adapter contracts, disabled configuration, synthetic fixtures, replay tooling, simulation harnesses, documentation, and activation-gate tests. It may not receive production applications, live workers, external-write credentials, customer-facing routes, active billing entitlements, or deployable execution services until its promotion gate is explicitly opened.

The existence of a future architecture document, schema, phase prompt, price hypothesis, database placeholder, or feature flag is not authorization to implement or activate that product.

## 2. Binding implementation states

| State | Meaning | Permitted output |
|---|---|---|
| `ACTIVE_BUILD` | Authorized current implementation | Production-grade code, migrations, tests, UI, workers, integrations, deployment artifacts |
| `FOUNDATION_ONLY` | Minimum shared primitives required by the active product | Canonical entities, APIs, simple workflows, basic UI, tests; no standalone product |
| `INTERFACE_AND_SIMULATION_ONLY` | Preserve future compatibility | Contracts, schemas, fixtures, mocks, replay/simulation; no live external writes |
| `PROMOTION_GATED` | May begin only after predecessor evidence and owner authorization | No implementation before signed promotion decision |
| `CUSTOMER_GATED` | Requires committed design partners and validated buyer workflow | Research/contracts only before gate |
| `LEGAL_AND_MARKET_GATED` | Requires legal authority, contracts, operations, and market demand | Dormant architecture only |
| `PARTNER_AND_SAFETY_GATED` | Requires provider/OEM partner and signed safety activation gate | Interface, shadow, and simulation only until gate |
| `LIQUIDITY_GATED` | Requires sufficient two-sided network density and settlement capability | Architecture and simulation only |
| `DORMANT` | Protected future extension | Documentation and compatibility constraints only |

## 3. Current module registry

| Module | State | Current authorization |
|---|---|---|
| FreightOS shared core | `ACTIVE_BUILD` | Full Horizon 1 implementation |
| Road FTL carrier operations | `ACTIVE_BUILD` | Full Horizon 1 implementation |
| FreightOS Core | `ACTIVE_BUILD` | Launch-catalog implementation target |
| AI Dispatch Copilot | `ACTIVE_BUILD` | A0–A2 and selected A3 workflows |
| RigReceipts economics boundary | `ACTIVE_BUILD` | Contract/integration implementation |
| RIGDESK maintenance hooks | `ACTIVE_BUILD` | Readiness, breakdown, work-order, return-to-service boundaries |
| Minimum facility primitives | `FOUNDATION_ONLY` | Facility, appointment, vehicle visit, loading/unloading, custody, detention, receipt, discrepancy |
| Carrier Autonomous Dispatch A4/A5 | `PROMOTION_GATED` | Policies, simulation, and tests only |
| Shipper Control Tower | `PROMOTION_GATED` | Domain/interface preparation only |
| FacilityOS Lite | `PROMOTION_GATED` | Begins after Copilot validation and owner authorization |
| Full FacilityOS | `CUSTOMER_GATED` | Contracts, schemas, simulations only |
| Digital Brokerage | `LEGAL_AND_MARKET_GATED` | Dormant architecture only |
| Autonomous Freight Exchange | `LIQUIDITY_GATED` | Matching simulation only |
| Autonomous Vehicle Gateway | `INTERFACE_AND_SIMULATION_ONLY` | Provider-independent contracts and shadow harness |
| Live autonomous missions | `PARTNER_AND_SAFETY_GATED` | Prohibited until signed activation gate |
| Rail adapter | `INTERFACE_AND_SIMULATION_ONLY` | Schema, mappings, contracts, fixtures only |
| Ocean adapter | `INTERFACE_AND_SIMULATION_ONLY` | Schema, mappings, contracts, fixtures only |
| Air adapter | `DORMANT` | Protected extension only |

The machine-readable authority is `config/scope/module_states.yaml`.

## 4. Horizon 1 — current authorized build

Claude may implement only:

1. Governance, repository, CI, threat model, ADRs, and validation.
2. Hierarchical tenant, organization, legal-entity, authority, identity, role, and permission architecture.
3. Mode-neutral `Shipment → TransportJourney → TransportLeg` domain.
4. Road FTL adapter and extensible cargo/equipment registries.
5. Carrier, fleet, driver, tractor, trailer, availability, and maintenance-readiness domains.
6. RigReceipts carrier-economics integration boundary.
7. Load ingestion, normalization, deterministic profitability, ranking, and multi-load planning.
8. AI Dispatch Copilot agents, evidence, confidence, evaluation, and audit.
9. Human approval and selected A3 approval-to-execute workflows.
10. Shipment execution, milestones, documents, exceptions, invoicing, and post-load reconciliation.
11. Policy, authority, billing, security, observability, reliability, idempotency, kill switches, and recovery.
12. Minimum facility primitives necessary to complete pickup and delivery handoffs.
13. API, webhook, EDI-boundary, and governed MCP capabilities required by Horizon 1.
14. Future module schemas, contracts, disabled configuration, fixtures, and simulation only.

## 5. Minimum facility primitives allowed in Horizon 1

The active carrier product may implement:

- Facility identity, contacts, hours, and restrictions
- Pickup/delivery appointment
- Cargo-readiness status
- Vehicle visit and arrival/departure milestones
- Gate, staging, and dock references
- Loading and unloading start/completion
- Seal and structured custody event
- Detention clock and evidence
- Goods receipt and delivery discrepancy
- Simple shipper/receiver collaboration links
- API, email, document, EDI, and webhook ingestion required for these records

It may not implement a standalone FacilityOS application, warehouse inventory ledger, labor-management system, WMS replacement, YMS replacement, WES replacement, robotics control, PLC control, or industrial motion.

## 6. Scaffold-only scope

The following may exist only as contracts, schemas, types, disabled registries, synthetic fixtures, and simulation/replay tooling:

- Facility adapter SDK beyond minimum facility primitives
- Autonomous Vehicle Gateway
- ADS provider adapters
- Rail modal adapter
- Ocean modal adapter
- Air extension
- Brokerage authority and transaction interfaces
- Exchange matching and clearing interfaces
- Future mode-specific billing meters

Scaffold code must not open network connections to real providers, contain production credentials, emit live external writes, create public routes, start production workers, or enable billable entitlements.

## 7. Explicitly prohibited current build

Claude must not currently implement or deploy:

- Full FacilityOS or a warehouse-management replacement
- A4/A5 carrier autonomous dispatch
- Direct RIG shipper procurement or traffic allocation
- Digital Brokerage execution
- Autonomous Freight Exchange execution
- Live autonomous vehicle mission execution
- Remote driving or any dynamic-driving-task control
- Rail operational workflows
- Ocean operational workflows
- Air operational workflows
- Production brokerage, rail, ocean, facility-automation, or ADS credentials

## 8. Release horizons

### Horizon 1 — Current funded build

Foundation, universal core, road FTL carrier operations, Dispatch Copilot, selected A3, minimum facility handoff primitives, and production hardening.

### Horizon 2 — Promotion after Copilot validation

Carrier A4 policies, selected Autonomous Dispatch, FacilityOS Lite, and shipper/receiver collaboration.

### Horizon 3 — Conditional expansion

Full FacilityOS, licensed Digital Brokerage, ADS/OEM partner integration, road–rail intermodal, port drayage, and ocean visibility.

### Horizon 4 — Network evolution

Autonomous corridors, multimodal brokerage, Autonomous Freight Exchange, and global multimodal orchestration.

Claude must stop after Horizon 1. A later phase prompt does not override this stop rule without a signed owner promotion decision recorded in the repository decision log.

## 9. Commercial status

Only FreightOS Core, FreightOS Copilot, standard implementation, approved integrations, and support may be prepared as the initial launch catalog.

All other price catalogs are planning targets and must carry:

```text
COMMERCIAL_STATUS = PRE_LAUNCH_TARGET
BILLING_ENABLED = FALSE
CUSTOMER_SALE_ALLOWED = FALSE
```

Carrier Autonomous pricing remains a target catalog until its A4 promotion gate passes. No future product may appear in checkout, invoice generation, entitlement activation, sales proposals presented as generally available, or public pricing pages before commercial activation.

## 10. Repository rule

Allowed during Horizon 1:

```text
packages/modal-core/
packages/mode-road/
packages/facility-primitives/
packages/facility-contracts/
packages/autonomous-vehicle-contracts/
packages/mode-rail-contracts/
packages/mode-ocean-contracts/
packages/brokerage-contracts/
packages/exchange-contracts/
```

Prohibited until promotion:

```text
apps/facility-control-tower/
services/autonomous-mission-executor/
services/brokerage-allocation/
services/exchange-clearing/
services/rail-operations/
services/ocean-booking/
services/air-operations/
```

Equivalent directories, services, workers, public routes, or deployment units are prohibited even if named differently.

## 11. Anti-overbuilding acceptance rules

Validation fails if:

- A deferred module exposes a production worker, public route, or live external-write connector.
- A live brokerage, ADS, rail, ocean, or facility-automation credential is configured.
- A future product is billable or sale-enabled.
- Autonomous vehicle control tools exist.
- A FacilityOS standalone application is deployable.
- A rail or ocean operational workflow is enabled.
- Claude advances beyond Horizon 1 without a signed decision.
- A scaffold adapter performs non-simulated external writes.
- An agent can promote its own module, legal gate, safety gate, or autonomy level.

## 12. Promotion authority

A module state may change only through:

1. An owner-approved architecture decision record.
2. Updated machine-readable module state.
3. Completed predecessor exit evidence.
4. Applicable legal, security, safety, customer, partner, or liquidity gate.
5. Updated roadmap, tests, pricing status, and Claude prompt.
6. Reviewed pull request and exact commit SHA.

Conversation context, a future phase document, an implemented schema, or technical feasibility alone is not promotion authority.
