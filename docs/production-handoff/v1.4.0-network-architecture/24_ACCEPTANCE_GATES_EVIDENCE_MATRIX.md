# 24 — Acceptance Gates and Evidence Matrix

| Gate | Requirement | Minimum evidence |
|---|---|---|
| NA-01 | Canonical identities are immutable and external aliases are versioned | schema, migration test, collision tests |
| NA-02 | Cross-organization authority is deny-by-default | policy tests, fabricated-identity tests |
| NA-03 | Canonical schemas are registry-controlled and CI-validated | registry artifact, compatibility tests |
| NA-04 | Material events are durable and append-only | outbox/journal tests, recovery proof |
| NA-05 | Event consumers are idempotent and replay-safe | duplicate/replay test results |
| NA-06 | Corrections preserve original history | correction lineage test |
| NA-07 | Field-level disclosure follows classification/consent | projection tests, negative access tests |
| NA-08 | Commands include authority, preconditions, expiry, and idempotency | schema and executor tests |
| NA-09 | External side effects cannot duplicate under retry/crash | fault-injection evidence |
| NA-10 | High-risk commands require deterministic approval gates | policy/approval tests |
| NA-11 | Agent proposals cannot bypass authority or invoke unlisted tools | adversarial tests and audit |
| NA-12 | Partner adapters declare semantic loss and version support | mapping profile and conformance report |
| NA-13 | Delivery failures are visible, retryable, and reconcilable | DLQ/replay/lag evidence |
| NA-14 | Evidence has hash, provenance, access policy, and lineage | schema/storage tests |
| NA-15 | Critical workflows have degraded mode and recovery runbook | game-day or simulation evidence |
| NA-16 | Existing application behavior is preserved during adapter rollout | regression suite, canary evidence |
| NA-17 | Production partner access requires conformance and security approval | signed onboarding checklist |
| NA-18 | Network state can be explained from events and object versions | trace/reconstruction demonstration |
| NA-19 | Observability measures business delivery, not only infrastructure | dashboards and alert tests |
| NA-20 | No implementation claim relies only on documentation | repository SHA, test output, environment evidence |

## Status vocabulary

Use only:

- PASS
- PARTIAL
- FAIL
- NOT IMPLEMENTED
- NOT APPLICABLE, with rationale

A gate cannot be PASS when evidence exists only in an unmerged branch, mock, or document.
