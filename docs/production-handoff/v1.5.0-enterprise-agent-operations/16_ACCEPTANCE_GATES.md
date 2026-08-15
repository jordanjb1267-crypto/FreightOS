# 16 — Acceptance Gates

## EA-01 Existing package non-regression
No prior FreightOS handoff file altered by installation of this package.

## EA-02 COT schema
Customer operational twin is versioned, inspectable, attributable, diffable.

## EA-03 COT authority
Unapproved/proposed twin assertions cannot silently grant command authority.

## EA-04 Agent manifest
Every production agent has tenant, scope, tools, authority, policy, version, kill switch.

## EA-05 Workflow graph
Every consequential automated workflow is typed/durable with terminal states.

## EA-06 Policy choke point
No external side-effect path can bypass deterministic policy.

## EA-07 Idempotency
Duplicate delivery produces one business effect.

## EA-08 Reconciliation
External mutation is read-back/reconciled.

## EA-09 Approval
Approval binds exact action/resource/version/expiry.

## EA-10 Shadow certification
A3+ workflow has shadow/evaluation evidence.

## EA-11 Autonomy downgrade
Drift/incident/config change can lower autonomy safely.

## EA-12 Customer explainability
Customer can inspect what FreightOS believes and correct it.

## EA-13 Tenant isolation
Cross-tenant state/memory/config/tool access denied structurally.

## EA-14 Integration conformance
Read/write adapters have mapping, failure, retry, replay tests.

## EA-15 One-truck fixture
Full Fast Start works for synthetic one-truck carrier.

## EA-16 Enterprise fixture
Hierarchical carrier fixture works across regions/terminals/fleets.

## EA-17 Multimodal fixture
Core can represent road + rail + ocean legs without schema fork.

## EA-18 Maintenance/roadside
Duplicate request, spend threshold, provider failure, and re-plan tested.

## EA-19 Back office
Document/billing/reconciliation workflow proven.

## EA-20 Dispatch
Observe -> shadow -> approval-execute dispatch flow proven.

## EA-21 Fail degraded
Intelligence outage does not erase already-authorized operational state.

## EA-22 Kill switch
Tenant/workflow/agent/tool-specific pause proven.

## EA-23 Crash recovery
Crash before/after external side effect resumes safely.

## EA-24 Scale
Load tests prove declared deployment tier; no unsupported scale claim.

## EA-25 Customer-fork prevention
Customer-specific behavior is configuration/adapter/policy unless an ADR explicitly approves code divergence.

## EA-26 Evidence
Release report includes SHA, tests, environment, deployment, known risks.

### Release vocabulary

- PASS
- PARTIAL
- FAIL
- NOT IMPLEMENTED
- NOT APPLICABLE with justification

A FAIL on EA-01 through EA-23 blocks production autonomy in affected scope.
