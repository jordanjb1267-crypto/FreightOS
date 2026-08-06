# 06 — Cellular Architecture, Reliability, and Disaster Recovery

## 1. Objective

Prevent a single tenant, deployment, integration, region, database, queue, or service failure from interrupting the entire FreightOS network.

## 2. Cellular architecture

FreightOS SHOULD evolve toward independent operational cells. Each cell contains a bounded subset of tenants and the services required for their active operations:

- application workloads;
- operational database partition;
- event processing and queues;
- cache and search partition;
- integration workers;
- cell-level observability;
- cell-scoped secrets and keys where practical.

A global control layer may provide identity federation, schema registry, tenant placement, policy distribution, network discovery, and administrative coordination. The control layer MUST distribute signed, versioned, last-known-good configuration so an outage does not stop active operational processing.

## 3. Blast-radius controls

- per-cell and per-integration quotas;
- bulkheads and isolated worker pools;
- circuit breakers and strict timeouts;
- per-tenant rate limits;
- queue partitioning;
- load shedding by service criticality;
- feature and integration kill switches;
- independent deployment rings;
- bounded database connection pools;
- no global synchronous dependency on analytics or AI.

## 4. Criticality and default targets

Initial targets are in `policies/service-criticality.yaml` and `policies/slo-defaults.yaml`. They are targets to validate, not promises to market before evidence exists.

Recommended GA baselines:

| Class | Examples | Availability target | RTO | RPO |
|---|---|---:|---:|---:|
| A | Identity enforcement, active dispatch access, emergency service, event ingestion | 99.95% | 30 minutes | 5 minutes |
| B | Tendering, appointment, repair approval, documents, settlement workflow | 99.9% | 2 hours | 15 minutes |
| C | Predictions, analytics, benchmarking, nonurgent search | 99.5% | 8 hours | 4 hours |
| D | Historical exports and nonurgent administration | 99.0% | 24 hours | 24 hours |

A mature Class A service may target 99.99% only after architecture, staffing, on-call, and measured evidence support it.

## 5. Degraded operation

Each Class A/B workflow MUST document:

- unavailable dependency;
- user-visible effect;
- operations that remain available;
- state captured locally or queued;
- authorization behavior;
- reconciliation procedure;
- maximum degraded duration;
- escalation trigger.

Examples:

- AI unavailable: deterministic workflows continue; recommendations queue.
- maps unavailable: cached route and manual addresses remain; route freshness is shown.
- telematics unavailable: last-known location is labeled stale; manual check-in is allowed under policy.
- payment provider unavailable: transaction remains pending with a stable idempotency key; no blind resubmission.
- OCR unavailable: document is stored and manually classifiable.

## 6. Multi-region strategy

Do not claim active-active resilience until consistency, routing, state ownership, and failback are tested. Acceptable staged progression:

1. single region with multi-zone deployment and cross-region backups;
2. warm recovery region with tested infrastructure and data restoration;
3. selected stateless active-active services;
4. cell-aware multi-region operations;
5. active-active only for domains with proven conflict strategy.

## 7. Disaster recovery requirements

- infrastructure as code for recoverable services;
- protected and tested backup copies;
- documented dependency and secret recovery;
- DNS/routing recovery procedures;
- restoration of policy, schema, queue offsets, and object metadata;
- recovery sequencing by criticality;
- reconciliation after restore;
- periodic full and partial exercises;
- evidence that tenant boundaries remain intact after recovery.

## 8. Recovery authority

Automated failover may occur only when the failure mode and data-consistency consequences are understood and tested. Destructive failover, failback, or primary promotion requires bounded automation or approved operator action with preserved evidence.
