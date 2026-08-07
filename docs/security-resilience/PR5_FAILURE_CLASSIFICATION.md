# PR #5 second remediation — classification of the 22 remaining integration failures

Required by owner ruling `PR_5_SECOND_REMEDIATION_CONTINUE_TO_GREEN` §8 steps 1–2: classify every
failure **before** modifying anything.

**Measured at:** `e6010a2`, integration suite, live PostgreSQL 16. Started at 64, currently 22.

**Headline: no failure falls into category 5 or 6.** Nothing here indicates the repaired
implementation broke legitimate behaviour, and nothing indicates the remediation reopened or
introduced an authority flaw. All 22 are consequences of the security model changing as intended,
plus migration bookkeeping.

| Cat | Meaning                                                               | Count |
| --- | --------------------------------------------------------------------- | ----- |
| 1   | stale test path — calls a write path intentionally removed            | 10    |
| 2   | expected-semantic change — correct outcome changed                    | 4     |
| 3   | fixture defect — setup no longer models a valid authority arrangement | 2     |
| 4   | migration/inventory bookkeeping — enumeration stale                   | 6     |
| 5   | **actual runtime regression**                                         | **0** |
| 6   | **new security regression**                                           | **0** |

---

## Category 1 — stale test path (10)

Nine hierarchy tests reparent by `UPDATE organization_nodes SET parent_id` as `freightos_app`. 0018
§6 removed that privilege because reparenting rewrites the closure and therefore changes effective
authority — ruling 7. They now fail `permission denied for table organization_nodes`, which is the
control working.

| #   | Test                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | `hierarchy invariants > rejects a move that would make a node its own ancestor`                                          |
| 2   | `hierarchy invariants > rejects a self-parent`                                                                           |
| 3   | `hierarchy invariants > rejects moving a tall subtree under a deep parent`                                               |
| 4   | `moving a subtree > re-parents the subtree, re-depths it, and rebuilds the closure`                                      |
| 5   | `the closure cannot be written by what it authorizes — F-02 > still maintains itself when the tree legitimately changes` |
| 6   | `concurrent hierarchy mutation — F-03 > refuses the second of two moves that would together form a cycle`                |
| 7   | `concurrent hierarchy mutation — F-03 > serialises two moves of the same subtree and keeps the last one`                 |
| 8   | `concurrent hierarchy mutation — F-03 > does not let two tenants block each other`                                       |
| 9   | `concurrent hierarchy mutation — F-03 > releases the lock with the transaction rather than with the statement`           |

**Resolution:** route legitimate movement through `admin.move_organization_node` with an actor that
genuinely holds `identity.organization_node.write`, and add the four controls the ruling requires —
direct-table negative, authorized-command positive, unauthorized-command negative, cross-tenant.
Tests 1–3 are negative tests of 0007's triggers; those triggers still fire on the admin path, so the
assertions survive by moving, not by weakening. Tests 6–9 hold two open transactions, so
`openSession()` moves to the administrative connection; the advisory lock is taken inside the
trigger and its behaviour is unchanged. **Detach-to-root stays unsupported** and is not to be added.

| #   | Test                                                                                                                   | Note                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 10  | `the privileged audit trail is append-only > keeps every Phase 0 audit row valid — operation_class defaults to domain` | Direct `INSERT` as a runtime role, removed by 0018 §1. Needs the §6 A/B decision below. |

**§6 decision for #10:** the subject is `operation_class`'s **column default**, not who may write —
so it is case **B**, a constraint-level test, and belongs on the table owner. It must not be
restored to `freightos_app`.

## Category 2 — expected-semantic change (4)

| #   | Test                                                                                                                                        | Was                                   | Now                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------- |
| 11  | `self-elevation is refused > refuses an administrator adding a permission to a role it holds`                                               | `failed`                              | `denied`                                                        |
| 12  | `self-elevation cannot be stood down — F-01, R2-01 > refuses expanding a role the actor once held and no longer does`                       | `failed`                              | `denied`                                                        |
| 13  | `the administrative boundary gates every mutation — R2-01 > refuses a direct self-grant and an indirect one through a role the actor holds` | `failed`                              | `denied`                                                        |
| 14  | `the standing autonomous_mobility suspension > is not writable by a tenant session`                                                         | policy refusal (`row-level security`) | privilege refusal (`permission denied for table kill_switches`) |

**11–13.** Under the ruling's definition — `denied` when authorization refused execution _before_
the consequential operation was attempted, `failed` when execution was authorized and the operation
itself failed — `denied` is now correct. Previously the actor passed the gate (any active member
did) and was stopped by the 0010 trigger _during_ the mutation, which is genuinely `failed`. 0018 §3
evaluates the permission first, so the request never reaches the mutation. The five confirmations
the ruling requires must be proven per test before the strings are touched: authorization precedes
mutation, no partial execution, no success emitted, the denial is accurately audited, and
`admin.prior_success` does not treat the denial as prior success.

**14.** The refusal moved _earlier_, from the policy layer to the privilege layer, because 0018 §4
revoked table-wide `INSERT`/`UPDATE`. Strictly stronger. The assertion should accept either, or
assert the privilege refusal specifically and keep a separate policy-layer test on a path that still
has the grant.

## Category 3 — fixture defect (2)

| #   | Test                                                                                                                            | Cause                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 15  | `self-elevation is refused > refuses an administrator widening its own membership`                                              | `duplicate key … memberships_one_active_per_user_node`. The fixture now gives the administrator its own membership (necessary — it must hold permissions), so the test's attempt to create one collides before the guard is reached. |
| 16  | `the administrative connection reaches tables only through functions > summarises a tenant identity graph for an access review` | `expected 2 to be 1`. The fixture now seeds two roles: `fleet_administrator` (under test) and `tenant_administrator` (the administrator's own).                                                                                      |

Both follow from the accepted §7 fixture doctrine — a dedicated administrative role, not
administration through the role whose lifecycle is being tested. #15 must be reworked to _update_
the existing membership rather than insert a second, so the guard is actually exercised.

## Category 4 — migration and inventory bookkeeping (6)

| #   | Test                                                                                                               | Stale expectation                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 17  | `Phase 0 records resolve identically across the migration > reverts and re-applies the OQ-19 pair cleanly`         | expects `[17,16,15,14]`, gets `[18,17,16,15,14]`                                                                        |
| 18  | `apply from the accepted Phase 0 baseline > carries Phase 0 data across the upgrade unchanged`                     | expects 13 migrations, gets 14                                                                                          |
| 19  | `Phase 0 records resolve identically across the migration > refuses the revert while a row still uses a new scope` | `invalid input value for enum app.kill_switch_scope: "legal_entity"` — reverts toward 0014 without first reverting 0018 |
| 20  | `the shape ADR-0020 requires > exposes an enumerated surface and nothing else`                                     | 20 admin functions expected, 22 present (`move_organization_node`, `claim_operation`)                                   |
| 21  | `the role graph, described accurately — R2-05 > reports every membership with its three options`                   | 9 memberships expected, 10 present                                                                                      |
| 22  | `the role graph, described accurately — R2-05 > distinguishes inherited authority from SET ROLE reachability`      | 5 roles expected, 6 present (`freightos_audit_writer`)                                                                  |

**#19 is the one to treat as migration correctness, not cleanup** — ruling §4. It must be resolved
by proving forward-apply → exact enum state → revert → exact prior state → re-apply → exact state,
not by adjusting an assertion. #17, #18 and #20–#22 are genuine inventory changes: 0018 exists, adds
two enumerated admin functions, adds one NOLOGIN definer role, and the fixture adds one membership.
Per ruling §5, the migration assertions should verify the exact ordered set rather than an opaque
count, and must confirm no skipped or duplicate version and a matching revert path.

---

## What this classification establishes

Every one of the 22 is explained by the security model changing as designed, or by enumeration that
has legitimately moved. **None requires weakening a remediated invariant, and none is evidence of a
regression.** No approved security invariant needs to change to reach green.
