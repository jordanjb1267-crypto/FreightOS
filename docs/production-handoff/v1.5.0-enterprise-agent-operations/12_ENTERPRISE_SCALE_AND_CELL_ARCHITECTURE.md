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
