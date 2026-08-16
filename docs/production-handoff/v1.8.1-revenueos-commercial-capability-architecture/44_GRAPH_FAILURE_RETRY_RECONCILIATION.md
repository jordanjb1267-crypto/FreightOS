# 44 — Graph Failure, Retry, Reconciliation and Recovery Standard

## Failure classes

Every graph node classifies failures as: `VALIDATION`, `AUTHORITY`, `POLICY`, `DEPENDENCY`, `TIMEOUT`, `RATE_LIMIT`, `MODEL`, `DATA_STALE`, `DATA_CONFLICT`, `SIDE_EFFECT_UNKNOWN`, `SIDE_EFFECT_REJECTED`, `KILL_SWITCH`, or `INTERNAL`.

## Retry

Retries are never implicit. Each node declares one of: `none`, `bounded_retry`, `idempotent_retry`, or `reconcile_before_retry`. Retry budgets, backoff, expiry, and dedupe/idempotency keys are runtime contracts to be fixed before J1.

## Crash windows

Certification must inject crashes immediately before and after each consequential side effect. Recovery must prove no lost effect, no duplicate effect, and evidence continuity.

## Reconciliation

External effects and externally visible publications require a reconciliation state. If outcome cannot be proven, the WorkUnit enters `HOLD/SIDE_EFFECT_UNKNOWN`; it cannot optimistically repeat.

## Stale work

Material dependency changes produce invalidation events. An in-flight WorkUnit must re-evaluate guards/authority before proceeding. Stale approvals or price/promise/source-rights decisions cannot be reused.

## Poison and repeated failure

Repeated deterministic failure routes to a dead-letter/exception WorkUnit with owner, evidence, last safe state, retry history, and recovery action. It never loops indefinitely.

## Degraded operation

Model or vendor outage preserves authoritative state. Deterministic routing may continue only when its inputs remain valid. Missing intelligence becomes `UNKNOWN/STALE`, not invented context.
