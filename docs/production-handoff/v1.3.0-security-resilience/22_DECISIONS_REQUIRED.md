# 22 — Owner Decisions Required Before Later Phases

The following decisions should be recorded during Phase 0 or before the listed implementation phase. Defaults below are recommendations, not silent authorization to change major architecture.

| Decision | Recommended default | Required before |
|---|---|---|
| Primary cloud and region strategy | One primary region/multi-zone, cross-region backups, warm recovery; no premature active-active claim | Phase 5 |
| Cell placement unit | Organization/enterprise as primary placement boundary, with high-volume dedicated-cell option | Phase 7 |
| Identity provider strategy | Managed identity plus internal authorization; do not build password/MFA primitives from scratch | Phase 1 |
| Policy engine | Central policy definitions with locally available enforcement/last-known-good decisions | Phase 1 |
| Highly sensitive encryption | Managed KMS plus field/envelope encryption for selected D4/D5 domains | Phase 2 |
| Audit retention | Separate restricted append-only store; duration set by risk/contract/legal review | Phase 2 |
| Event platform | Durable platform supporting partitioning, retention, replay, and access control | Phase 3 |
| Exactly-once policy | At-least-once delivery with idempotent consumers and exactly-once business effects | Phase 3 |
| Production SLOs | Adopt baseline targets from this package and revise after measured load | Phase 4 |
| Error-budget release policy | Pause nonessential Class A/B releases when budget is exhausted | Phase 4 |
| Build provenance target | Signed artifacts, SBOM, provenance; progress toward SLSA Build L3 properties | Phase 5 |
| Backup isolation | Cross-account/project and cross-region protection for critical copies | Phase 5 |
| AI provider data policy | No generalized training on FreightOS/customer prompts or outputs without explicit contractual approval | Phase 6 |
| Agent execution ceiling | Recommendation-only until identity, audit, idempotency, and approvals pass | Phase 6 |
| Autonomous remediation | Start Level 1; allow only individually approved Level 2 runbooks | Phase 6 |
| External assurance | Independent penetration test before broad enterprise/network activation | Phase 8 |

## Decisions that must not be delegated to an agent

- enabling live money movement;
- enabling autonomous dispatch or roadside execution at broad scope;
- accepting systemic residual cross-tenant risk;
- reducing audit or backup protections;
- changing data-use/training rights;
- changing constitutional guarantees;
- accepting R4 risk;
- representing FreightOS as compliant/certified or guaranteeing zero outages/breaches.
