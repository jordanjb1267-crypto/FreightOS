# Network security non-regression checklist

**Status:** Proposed — N0 governance wiring
**Applies to:** every network implementation PR from N1 onward
**Related:** ADR-N0003 (identity separation), ADR-N0011 (tenant vs organization), v1.4.0 `24_ACCEPTANCE_GATES_EVIDENCE_MATRIX.md`

Network architecture is additive and **subordinate**. Every question below is answered in the PR
description, in writing, before review. "No" is a fine answer; an _absent_ answer is not, and a "no"
that the diff contradicts is a finding.

The last question is the one that matters most: a checklist that produces no failing test produces
no evidence.

## The questions

| #   | Question                                                                   | Why it is asked                                                                                      |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | Does this create a new **security principal**?                             | A principal is authority. New principals are the highest-consequence change a network PR can make.   |
| 2   | Does it create a **participant but no principal**?                         | The expected answer for N1-class work. If yes, question 3 must be provably "no".                     |
| 3   | **Can any new row grant authority?**                                       | The ADR-N0003 invariant. Requires a mutation test, not an assertion.                                 |
| 4   | Does it change **RLS** — policies, `FORCE`, or the isolation predicate?    | Tenant isolation is the security boundary; changes need cross-tenant denial evidence.                |
| 5   | Does it change **SECURITY DEFINER** code?                                  | Definer functions run as their owner. Owner, `search_path` pinning and ACL must all be re-evidenced. |
| 6   | Does it create a **PostgreSQL role**?                                      | Roles are cluster-global and fall under the migration-authority convergence contract immediately.    |
| 7   | Does it change **migration-authority convergence**?                        | The fresh-first-run defect came from exactly this. Requires the fresh-cluster regression.            |
| 8   | Does it **broaden** schema, table, function or column privileges?          | Grants are easy to widen accidentally and hard to notice.                                            |
| 9   | Does it introduce an **external ingress surface**?                         | The repository currently has none. The first one is an architectural event, not a detail.            |
| 10  | Does it create **replay or idempotency state**?                            | Duplicate suppression is a correctness property under at-least-once delivery (ADR-N0009).            |
| 11  | Does it **expose tenant data** — directly, by projection, or by inference? | Including aggregates and counts, which leak.                                                         |
| 12  | Does it introduce **delegation**?                                          | Layer C of ADR-N0003. Not authorized without its own ADR.                                            |
| 13  | Does it alter **audit provenance**?                                        | Audit is the record of last resort; it may not be weakened for network convenience (ADR-N0008).      |
| 14  | Does it cross **tenant or organization boundaries**?                       | A relationship may cross; data authority may not (ADR-N0011).                                        |
| 15  | Does it require **fresh-cluster proof**?                                   | Anything touching roles, convergence or first-run lifecycle does.                                    |
| 16  | **What mutation proves its central security claim?**                       | Name the mutation, the expected failure, and the exact assertion text.                               |

## Rules

1. **Question 16 is mandatory and specific.** "Tests cover it" is not an answer. Name the mutation,
   state the expected failure message, and show it failing before it passes.
2. **A "no" that the diff contradicts is a finding**, not a correction. The checklist is evidence.
3. **Any "yes" to 1, 4, 5, 6, 7, 8, 9 or 12** requires the corresponding existing gate to be re-run
   and reported, not assumed from a green suite.
4. **A network requirement never justifies weakening a security control.** If a network capability
   appears to require it, the design is wrong — escalate rather than relax.
5. **No gate is PASS on documentation.** v1.4.0 `24_…` §"Status vocabulary": a gate cannot pass when
   evidence exists only in an unmerged branch, a mock, or a document.

## Standing invariants that no network PR may regress

Authenticated PostgreSQL principal as trust anchor · `freightos_admin` as capability, not identity ·
per-operator LOGIN identities · protected operator-to-user bindings · SECURITY DEFINER owner isolation
· pinned safe `search_path` · authority and provenance anti-spoofing · authority-table DML
restrictions · protected audit provenance · migration role and membership contracts · cluster-global
advisory-lock isolation for migration and role mutation · post-migration authority convergence on
genuinely fresh installations · production and harness convergence parity · fresh-cluster security
regressions · exact migration up/down parity gates.
