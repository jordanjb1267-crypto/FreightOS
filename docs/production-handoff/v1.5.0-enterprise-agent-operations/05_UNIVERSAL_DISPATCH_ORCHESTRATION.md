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
