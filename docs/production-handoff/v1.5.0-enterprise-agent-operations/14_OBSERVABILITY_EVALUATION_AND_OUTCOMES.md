# 14 — Observability, Evaluation, and Customer Outcomes

## 1. Enterprise observability

Measure infrastructure + business correctness + agent behavior.

## 2. Workflow telemetry

For every graph:
- started
- completed
- failed
- escalated
- deadline miss
- retry
- approval latency
- side effect
- verification
- reconciliation drift
- compensation.

## 3. Agent telemetry

- proposal count
- accepted/rejected/edited
- override rate
- unsupported-claim rate
- tool errors
- policy denials
- escalation precision
- evaluation pass rate
- model/provider latency/cost.

## 4. Dispatch outcomes

- work intake-to-plan latency
- assignment latency
- unassigned aging
- late exceptions
- asset utilization where appropriate
- deadhead where applicable
- service-level misses
- planner/dispatcher manual touches
- correction/reassignment rate.

Do not optimize a metric in a way that harms safety, service, labor commitments, or customer policy.

## 5. Back-office outcomes

- document completion
- billing-prep time
- missing documents
- reconciliation exceptions
- manual touches
- exception aging.

## 6. Maintenance/roadside

- readiness freshness
- breakdown-to-provider-request
- provider acceptance
- ETA
- downtime
- duplicate service prevention
- dispatch re-plan latency.

## 7. Customer trust

- approval rate
- reason for rejection
- correction rate
- "understanding" disputes
- autonomy downgrades
- kill-switch events.

## 8. Evaluation registry

Every agent/workflow version points to:
- fixtures
- synthetic scenarios
- tenant-specific shadow set where allowed
- adversarial cases
- mutation tests
- current result.

## 9. Evidence reconstruction

For a consequential action, reconstruct:
identity -> COT -> state -> evidence -> agent proposal -> policy -> approval -> command -> external response -> reconciliation.

## 10. Commercial proof

Customer ROI claims require customer-specific measured baseline and methodology.
No generic "saves X dispatchers" claim without evidence.
