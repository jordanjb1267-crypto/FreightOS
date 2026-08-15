# 17 — Implementation Roadmap

This package is additive. Implementation sequence MUST be reconciled with the repository's current accepted migration/PR state before code changes.

## Phase 0 — Repository/COT gap analysis
PR-A1:
- inventory existing agent manifests
- workflow runtime
- tenant topology
- integrations
- autonomy gates
- current dispatch objects
- maintenance/roadside ownership
- audit/evidence
- existing v1.3/v1.4 controls
- map gaps to EA gates.

No runtime change.

## Phase 1 — Enterprise agent contracts
PR-A2:
- COT schema
- agent manifest schema
- capability pack schema
- workflow graph contract
- autonomy grant contract
- registries.

## Phase 2 — Company Operational Twin
PR-A3:
- persistence
- version/diff
- fact states
- customer review
- source/evidence
- drift proposals.

## Phase 3 — Agent Organization Factory
PR-A4:
- canonical manifests
- tenant instantiation
- scope partition
- context assembly
- kill switches.

## Phase 4 — Durable Workflow Runtime hardening
PR-A5:
- typed graphs
- checkpoints
- idempotency
- approvals
- reconciliation
- crash tests.

Use existing workflow engine if suitable; do not replace proven infrastructure just to match terminology.

## Phase 5 — One-Truck Fast Start
PR-A6:
- synthetic owner-operator fixture
- intake
- docs
- communications
- load/mission workflow
- back office
- dashboard.

This is the first adoption-focused reference implementation.

## Phase 6 — Dispatch Copilot
PR-A7:
- universal dispatch graph
- road pack
- candidate planning
- explainability
- shadow evaluation.

## Phase 7 — Approval-to-Execute Dispatch
PR-A8:
- side-effect gateway
- exact approval
- external write adapter
- read-after-write
- reconciliation.

## Phase 8 — Maintenance/Roadside
PR-A9:
- readiness
- repair
- roadside
- dispatch replan integration.

## Phase 9 — Policy-Bounded Autonomy
PR-A10:
- autonomy grants
- promotion/downgrade
- canary
- incident pause.

## Phase 10 — Enterprise topology
PR-A11:
- hierarchy
- scoped workers
- partitioning
- quotas
- enterprise SSO/integration hooks as required.

## Phase 11 — Multimodal packs
PR-A12 road conformance maturity
PR-A13 rail pack
PR-A14 ocean pack
PR-A15 multimodal journey.

## Phase 12 — Productized implementation
PR-A16:
- customer onboarding console
- implementation templates
- conformance portal
- exportable acceptance pack
- tenant deployment automation.

## Cross-PR controls

Every runtime PR:
- tenant tests
- authority tests
- idempotency where side effects exist
- migration up/down/recovery as applicable
- compatibility
- observability
- rollback
- documentation
- no production enablement by default.
