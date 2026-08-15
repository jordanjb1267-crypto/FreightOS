# 04 — Facility Workflow Graph Standard

## Required graph fields

- ID/version
- tenant/site scope
- trigger schema
- state schema
- nodes/edges
- system-of-record reads
- deterministic gates
- intelligence nodes
- human interrupts
- side-effect nodes
- deadlines
- retries
- idempotency
- reconciliation
- degraded mode
- terminal states
- evaluation suite.

## Canonical pattern

```text
Trigger
 ↓
Load authoritative state
 ↓
Identity/tenant/site validation
 ↓
FOT + current policy
 ↓
Interpret/classify if needed
 ↓
Deterministic feasibility
 ↓
Authority/policy
 ↓
Approval if required
 ↓
Idempotency
 ↓
Side effect
 ↓
External verification
 ↓
Event/evidence
 ↓
Reconciliation
 ↓
Terminal / next graph
```

## Mandatory graph families

- facility onboarding/FOT
- cargo readiness
- appointment
- pre-arrival
- vehicle visit/check-in
- BOL/document submission
- gate
- yard/staging
- dock
- shipping
- receiving
- custody
- detention
- discrepancy
- facility exception
- facility outage/recovery.

## Mutation tests

Fail CI if:
- side effect bypasses policy;
- document acceptance bypasses required office/authority;
- custody is inferred from document existence;
- goods receipt is inferred from BOL submission;
- retry is unbounded;
- graph lacks terminal state;
- idempotency missing;
- customer/site context is unverified;
- physical-control command surface appears.
