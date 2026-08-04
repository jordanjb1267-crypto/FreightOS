# Phase 1 Quantitative Acceptance Thresholds

**Status:** Owner-approved (Phase 1 rulings, 2026-08-04)
**Closes:** risk R-12, which recorded that `14_TEST_AND_ACCEPTANCE_STRATEGY.md:36` defers every
threshold to the implementer and that no quantitative bar existed anywhere in the package.

These thresholds are binding for Phase 1. A pull request that misses one does not merge.

## 1. Mandatory binary gates

Each is pass/fail with no tolerance. Every one is already measurable with the tooling merged in
Phase 0, except where a Phase 1 obligation is noted.

| Gate                                           | Required value                                    | Measured by                                                                  |
| ---------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| Format                                         | zero findings                                     | `pnpm format:check`                                                          |
| Lint                                           | zero findings                                     | `pnpm lint`                                                                  |
| Typecheck                                      | zero errors                                       | `pnpm typecheck`                                                             |
| Unit and integration tests                     | 100% passing                                      | `pnpm test`, `pnpm test:integration`                                         |
| Handoff checksums                              | 100% passing                                      | `sha256sum -c SHA256SUMS.txt`                                                |
| Handoff modifications                          | **zero** unless separately versioned and approved | `git diff` over `docs/production-handoff/`, plus `pnpm validate:provenance`  |
| Secret scan                                    | zero findings                                     | gitleaks over full history                                                   |
| Critical or high security findings             | zero unresolved                                   | security review at the phase exit gate                                       |
| Deferred operational modules                   | **zero**                                          | `pnpm validate:scope` → `DEFERRED_MODULES_DISABLED=PASS`                     |
| Billing-enabled products                       | **zero**                                          | `pnpm validate:scope` → `BILLING_DISABLED=PASS`                              |
| Effective A4 or A5 autonomy                    | **zero**                                          | `pnpm validate:scope` → `AUTONOMY_CEILING=PASS`                              |
| Tenant-owned tables without RLS                | **zero**                                          | integration test enumerating `pg_tables` against `pg_policies`               |
| RLS-enabled tables without applicable policies | **zero**                                          | same test — extends `rls.test.ts:192` to Phase 1 tables                      |
| Domain state machines without transition tests | **zero**                                          | transition-coverage test asserting every declared transition has a case      |
| Migrations without tested recovery paths       | **zero**                                          | migration suite — the runner already rejects a migration lacking a down file |

## 2. Coverage

Applies to **newly introduced deterministic Phase 1 domain logic**, excluding generated files,
schema declarations, fixtures, and raw migrations.

| Metric            | Minimum |
| ----------------- | ------- |
| Line coverage     | **90%** |
| Branch coverage   | **85%** |
| Function coverage | **90%** |

**Coverage must not be increased through meaningless tests.** A test that executes a line without
asserting a behaviour does not count toward these numbers, and reviewers are expected to reject
tests written to move the metric. The enumerated invariants in §3 are the substantive bar; §2 is
the floor beneath it.

## 3. Domain invariants — 100% coverage required

Each item below requires complete test coverage of its enumerated cases. These are not sampled.

| #   | Invariant                                | Notes                                                                                       |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Cross-tenant denial                      | Read, write, update, and reference-by-primary-key, per aggregate                            |
| 2   | Legal-entity mismatch denial             | Including the ADR-0021 category-4 parent-disagreement case                                  |
| 3   | Organization-node mismatch denial        | Including inherited-node consistency                                                        |
| 4   | Invalid state transitions                | Every prohibited transition in all thirteen machines returns a typed refusal and is audited |
| 5   | Append-only audit protection             | `UPDATE`, `DELETE`, `TRUNCATE` × application role and table owner                           |
| 6   | Outbox idempotency                       | Replay emits no second event; `event_id` uniqueness holds                                   |
| 7   | Deterministic money calculation fixtures | Identical inputs produce identical outputs across repeated runs                             |
| 8   | Formula-version recording                | Every stored calculation carries a non-null version                                         |
| 9   | Rounding fixtures                        | Explicit mode, boundary cases, no intermediate rounding                                     |
| 10  | Active-powered-unit eligibility          | Every clause of the eligibility rule, including the unknown-maintenance case                |
| 11  | Maintenance fail-closed behaviour        | Stale, simulated, or non-authoritative data never makes equipment available (ADR: Ruling C) |
| 12  | Detention `POLICY_REQUIRED` behaviour    | No policy → no clock, explicit refusal, no default (ADR-0025)                               |
| 13  | Adapter-contract conformance             | Every fixture round-trips; outbound send refuses; capability gaps reported                  |

## 4. Migration gates

Every migration pull request must prove:

- Apply from empty
- Apply from the accepted prior baseline
- Down migration, or a documented recovery path
- Reapply
- Checksum integrity
- Edited-after-apply detection
- **No unauthorized reference-DDL execution** — `db/reference/` is never run (ADR-0017)

The Phase 0 suite already evidences six of these seven
(`packages/database/test/integration/migrations.test.ts:34-191`). "Apply from the accepted prior
baseline" is the Phase 1 addition: a migration must apply cleanly on top of the schema as it exists
at the previous merged PR, not only on an empty database.

## 5. Deliberately not set in Phase 1

Agent accuracy, unsupported-assertion rate, tool-selection accuracy, escalation rate, model
latency, and model cost. `14_…:34-36` requires these to be evidence-based, and Phase 1 runs no
agent — there is no evidence to set them from. They are Phase 2 owner deliverables and are tracked
as an open question.

## 6. Relationship to the phase exit gate

These thresholds are additional to `checklists/PHASE_EXIT_GATE.md`, not a replacement for it.
`17_CLAUDE_IMPLEMENTATION_INSTRUCTIONS.md:63` still governs how results are reported: "should
work", "looks complete", "tests passed" without output, and "secure" without controls and findings
are all rejected. Every Phase 1 pull request reports exact commands, exact counts, and exact exit
codes.
