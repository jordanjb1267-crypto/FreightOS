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
