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
