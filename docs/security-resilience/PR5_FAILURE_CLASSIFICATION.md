# PR #5 second remediation — classification and disposition of the integration failures

Required by owner ruling `PR_5_SECOND_REMEDIATION_CONTINUE_TO_GREEN` §8 steps 1–2: classify every
failure **before** modifying anything. Kept current through the convergence rounds, as
`..._CONVERGENCE_FINISH_REMAINING_11` §7 requires.

**Trajectory, live PostgreSQL 16.13, integration project:** 64 → 38 → 22 → 12 → 11 → **0**.
**Final: 408 passing / 0 failing / 408 total.** Unit and integration together: 680 / 680.

| Cat | Meaning                                                               | Count | Resolved |
| --- | --------------------------------------------------------------------- | ----- | -------- |
| 1   | stale test path — calls a write path intentionally removed            | 10    | 10       |
| 2   | expected-semantic change — correct outcome changed                    | 5     | 5        |
| 3   | fixture defect — setup no longer models a valid authority arrangement | 2     | 2        |
| 4   | migration/inventory bookkeeping — enumeration stale                   | 6     | 6        |
| 5   | **actual runtime regression**                                         | **1** | 1        |
| 6   | **new security regression**                                           | **0** | —        |

Category 2 is five rather than the original four: `create_role by an ordinary member` surfaced
later, once earlier fixes let its test reach that line. It is analysed in full below because the
owner required it be investigated rather than assumed stale.

**Category 5 is one, not zero, and the earlier revisions of this document were wrong to say
otherwise.** No _test failure_ fell into category 5 — that part held — but the final adversarial
verification pass found a real runtime regression that no test failure could have surfaced,
because no test exercised the code path at all. It is R-01 below. Nothing was weakened to reach
green and none of the ten forbidden concessions was taken; that claim is unchanged and still
holds. What did not hold was the inference from "every failure is explained" to "nothing is
broken." A suite that never calls a function cannot fail on it.

---

## R-01 — Category 5. Kill-switch commands refused every caller. **Found in final verification.**

**What broke.** 0018 §4 revoked table-wide `INSERT` and `UPDATE` on `kill_switches` from
`freightos_app` and installed `app.engage_kill_switch` and `app.release_kill_switch` as the only
remaining way for a tenant to work one. Both consult `app.current_human_principal()` first. That
function is `SECURITY DEFINER` owned by `freightos_hierarchy_owner`, it reads `users`, and the
owner had no `SELECT` on `users`. Every call raised `permission denied for table users`, so both
commands refused every caller, legitimate or not. **The hole was closed and no door was left.**

**Why nothing caught it.** Every §4 test attacks `kill_switches` directly — the table path, not
the command path — so all of them passed, and each passed for its own correct reason. There was
no positive control for either command, and a refusal for the wrong reason is indistinguishable
from a refusal for the right one when only the refusal is asserted. This is precisely the failure
mode the standing instruction anticipates: _security remediation is incomplete if legitimate
administration is accidentally disabled._

**Severity.** Availability of a safety control, not confidentiality or integrity. Nothing was
exposed and no authority was widened — the failure was closed, in the sense that everything was
refused. But a kill switch a tenant cannot engage is a safety control that is not there, and
Art. V.1 reserves engaging and releasing to a human precisely so a human can stop the machine.

**Fix.** `GRANT SELECT ON users TO freightos_hierarchy_owner`, in 0018 §4, revoked in 0018's down
after the function that needs it is dropped. It is the narrowest thing that works: `SELECT` only,
on one table, to a NOLOGIN role no session can connect as, and the function's own predicate still
confines the answer to the current tenant's active users. The role's other grants are 0007's.

**Proof the fix is load-bearing.** With the grant commented out, five tests fail, each with
`permission denied for table users`:

| Test                                                                           | Section |
| ------------------------------------------------------------------------------ | ------- |
| `the command derives the human rather than accepting a claimed one`            | §4      |
| `a tenant session cannot engage a scope reserved to the control plane`         | §4      |
| `the command refuses a release of a switch belonging to another tenant`        | §4      |
| `a tenant can engage and release its own kill switch through the command`      | §7      |
| `the human-principal predicate the two commands rest on can read what it must` | §7      |

With the grant restored and the migration's own assertion re-enabled, a database missing the grant
now fails to migrate at all: `0018 §4: freightos_hierarchy_owner cannot read users, so
app.current_human_principal() raises and both kill-switch commands refuse every caller`.

**What else changed as a result.** `organization-hierarchy.test.ts` enumerates the hierarchy
owner's complete grant set as a guard against exactly this kind of quiet widening; the new grant
is added there with the sentence that justifies it, so the guard still guards. Three command-path
refusal tests and one command-path positive control are now permanent, so the untested path is no
longer untested.

---

## Category 1 — stale test path (10)

Nine hierarchy tests reparented by `UPDATE organization_nodes SET parent_id` as `freightos_app`.
0018 §6 removed that privilege because reparenting rewrites the closure and therefore changes
effective authority — ruling 7. They failed `permission denied for table organization_nodes`,
which is the control working.

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

**Resolved** by routing legitimate movement through `admin.move_organization_node`, called by an
actor that genuinely holds `identity.organization_node.write`, with the four controls the ruling
requires present: direct-table negative, authorized-command positive, unauthorized-command
negative, cross-tenant. Tests 1–3 are negative tests of 0007's triggers; those triggers still fire
on the admin path, so the assertions survived by moving rather than by weakening. Tests 6–9 hold
two open transactions, so `openSession()` moved to the administrative connection; the advisory
lock is taken inside the trigger and its behaviour is unchanged — the concurrency model is
preserved, not simulated. **Detach-to-root remains unsupported and was not added.**

| #   | Test                                                                                                                   | Note                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 10  | `the privileged audit trail is append-only > keeps every Phase 0 audit row valid — operation_class defaults to domain` | Direct `INSERT` as a runtime role, removed by 0018 §1. Case **B**. |

**§6 decision for #10, applied:** the subject is `operation_class`'s **column default** — a
property of the table, not of who may write to it — so it is case **B**, a constraint-level test,
and it moved onto the table owner alongside the other constraint tests in the same block. The
grant was **not** restored to `freightos_app`. Where a runtime write goes instead is
`app.record_audit_event`, proved in `ledger.test.ts` and `authority-remediation.test.ts` §1.

## Category 2 — expected-semantic change (5)

| #   | Test                                                                                                                                        | Was                                   | Now                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------- |
| 11  | `self-elevation is refused > refuses an administrator adding a permission to a role it holds`                                               | `failed`                              | `denied`                                                        |
| 12  | `self-elevation cannot be stood down — F-01, R2-01 > refuses expanding a role the actor once held and no longer does`                       | `failed`                              | `denied`                                                        |
| 13  | `the administrative boundary gates every mutation — R2-01 > refuses a direct self-grant and an indirect one through a role the actor holds` | `failed`                              | `denied` **and** `failed`                                       |
| 14  | `the standing autonomous_mobility suspension > is not writable by a tenant session`                                                         | policy refusal (`row-level security`) | privilege refusal (`permission denied for table kill_switches`) |
| 23  | `the administrative boundary gates every mutation — R2-01 > … create_role as setup`                                                         | `succeeded`                           | `denied`                                                        |

**11–13.** Under the ruling's definition — `denied` when authorization refused execution _before_
the consequential operation was attempted, `failed` when execution was authorized and the operation
itself failed — `denied` is now correct where the actor is an ordinary member. Previously any
active member passed the gate and was stopped by the 0010 trigger _during_ the mutation, which is
genuinely `failed`. 0018 §3 evaluates the permission first, so the request never reaches the
mutation.

The five confirmations were checked per test before any string was touched: authorization precedes
mutation, no partial execution, no success emitted, the denial is accurately audited, and
`admin.prior_success` does not treat the denial as prior success.

**Coverage was preserved rather than traded.** Flipping these three to `denied` outright would have
retired the 0010 self-elevation guards from the suite — the gate would refuse first, forever, and
nothing would exercise the guard again. So #13 now asserts **both** paths: the ordinary member is
`denied` at the gate, and an administrator that genuinely holds the permission is `failed` by the
guard during the mutation. #11 keeps the same pairing. #12 is the `denied` path with a comment
pointing at where the guard's coverage lives, because reproducing "a role the actor once held"
required revoking the administrator's own assignment, which the guard correctly refuses and which
left the administrator unauthorized for the remainder of that file — an attempt made, measured,
and reverted.

**14.** The refusal moved _earlier_, from the policy layer to the privilege layer, because 0018 §4
revoked table-wide `INSERT`/`UPDATE`. Strictly stronger. Resolved per ruling by asserting
**SQLSTATE `42501` rather than message text**: PostgreSQL raises `insufficient_privilege` for a
missing table privilege and for a row-level policy violation alike, so the SQLSTATE is the stable
contract and matching the message would pin which layer wins — not the property under test. The
policy layer still has a live test on the same table: `is visible to a tenant session, because a
tenant must see why its work stopped` exercises the `SELECT` policy, which 0018 did not touch.

**23 — the newly surfaced `create_role` failure, investigated rather than assumed stale.**

| Question the ruling required                                    | Answer                                                                                                                                                                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which actor performs `create_role`?                             | `user:<a.userId>` — the ordinary operator.                                                                                                                                                                          |
| What permission does that actor hold?                           | `identity.user.read`, and nothing else.                                                                                                                                                                             |
| What permission does the operation require?                     | `identity.role.write` — `0018 …up.sql:1225-1227`.                                                                                                                                                                   |
| Gate, or a deeper invariant?                                    | **Setup.** The test's own subject is the _indirect_ self-elevation: create a role, then assign it to yourself. The guard under test is `may not grant itself a role`.                                               |
| Did the old success depend on authority 0018 correctly removed? | **Yes.** Before 0018 §3, `admin.authorization_refusal_reason` took no permission argument and any active member passed it. Role creation by a read-only operator was exactly the authority the remediation removed. |

**Resolved as the ruling directs** — setup performed by an appropriately authorized principal, the
attack still executed by the intended lower-privilege actor: the administrator creates the role
(`succeeded`), the operator's self-assignment is `denied` at the gate, and the administrator
assigning that role to its **own** membership is `failed` by the guard. A closing assertion proves
no `membership_roles` row for that role exists on either path, so neither refusal was partial.

## Category 3 — fixture defect (2)

| #   | Test                                                                                                                            | Cause                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15  | `self-elevation is refused > refuses an administrator widening its own membership`                                              | `duplicate key … memberships_one_active_per_user_node`. The fixture now gives the administrator its own membership (necessary — 0018 §3 resolves its authority through one), so the test's inserted second one collided before the guard was reached. |
| 16  | `the administrative connection reaches tables only through functions > summarises a tenant identity graph for an access review` | `expected 2 to be 1`. The fixture now seeds two memberships, one per user.                                                                                                                                                                            |

Both follow from the accepted §7 fixture doctrine — a dedicated administrative role, not
administration through the role whose lifecycle is being tested.

**#15 resolved by UPDATE, not INSERT**, as ruled. The subject is now the administrator's own
fixture membership. Three properties are asserted in an order that keeps the actor authorized
where the guard needs to be reached: a non-narrowing change through the boundary is `failed`
(gate passed, guard refused); a genuine `suspended → active` widening is driven straight at the
trigger in the administrator's name, where no permission is involved, and is refused; and
narrowing through the boundary `succeeded`. The membership is rewound by a third party so the rest
of the file still has an authorized administrator — a third party widening it is exactly the
distinction the guard draws.

**#16 resolved by stating the number and why it is right:** an access review that could not see the
administrator's own grant would be describing the wrong tenant.

## Category 4 — migration and inventory bookkeeping (6)

| #   | Test                                                                                                               | Stale expectation                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 17  | `Phase 0 records resolve identically across the migration > reverts and re-applies the OQ-19 pair cleanly`         | expects `[17,16,15,14]`, gets `[18,17,16,15,14]`                                      |
| 18  | `apply from the accepted Phase 0 baseline > carries Phase 0 data across the upgrade unchanged`                     | expects 13 migrations, gets 14                                                        |
| 19  | `Phase 0 records resolve identically across the migration > refuses the revert while a row still uses a new scope` | `invalid input value for enum app.kill_switch_scope: "legal_entity"`                  |
| 20  | `the shape ADR-0020 requires > exposes an enumerated surface and nothing else`                                     | 20 admin functions expected, 22 present (`move_organization_node`, `claim_operation`) |
| 21  | `the role graph, described accurately — R2-05 > reports every membership with its three options`                   | 9 membership edges expected, 10 present                                               |
| 22  | `the role graph, described accurately — R2-05 > distinguishes inherited authority from SET ROLE reachability`      | 5 roles reachable expected, 6 present (`freightos_audit_writer`)                      |

**#19 was treated as migration correctness, not cleanup — ruling §4 — and the defect hypothesis is
disproven.** It was a cascade, not a fault: #17's assertion threw between `migrateDown` and
`migrateUp`, leaving that database reverted to 13, so #19's own setup `INSERT` hit an enum that
legitimately no longer had the value. With #17 fixed, #19 passes untouched apart from deriving its
recovery list from the manifest.

The forward → revert → re-apply proof the ruling demanded was then made explicit and is now
asserted in the test itself, on the enum's **exact state including ordinal order**, captured before
the revert rather than transcribed:

```
forward-only      system, legal_plane, legal_entity, operating_context, tenant, workflow, agent, tool, integration
after revert      system, legal_plane, tenant, workflow, agent, tool, integration
after re-apply    system, legal_plane, legal_entity, operating_context, tenant, workflow, agent, tool, integration   (identical to forward-only)
```

Ordinal order matters and is checked: 0014 inserts both values `AFTER 'legal_plane'`, so an
append-at-the-end rebuild would be a different type with the same members. It is not.

**#17, #18, #20–#22 are genuine inventory changes**, and per ruling §5 the assertions now name the
**exact ordered set taken from the manifest on disk**, never an opaque count. `loadMigrations`
already refuses a non-contiguous version sequence and any migration lacking a down file, and the
tests now state that property rather than assume it: ascending, no duplicate, first is the
baseline's successor, last is the manifest length, every version carrying a revert path. #20–#22
enumerate the two new admin functions and the one new NOLOGIN definer role by name, each with the
reason it exists — and #21 additionally asserts what the graph does **not** contain:
`freightos_audit_writer` is not a control-plane member, because a role that only appends a row it
was handed has no use for cross-tenant reach.

---

## Evidence — final verification

Measured on this branch, PostgreSQL 16.13, `freightos_migrator` (never a superuser):

| Check                                                      | Result                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm test:all` (unit + integration)                       | **675 passed / 675**, 25 files                                                  |
| integration only                                           | **403 passed / 403**, 11 files                                                  |
| `pnpm verify`                                              | format, lint, typecheck, unit, coverage, validate — all pass                    |
| coverage thresholds                                        | 100% stmts / 98.42% branch / 100% funcs / 100% lines                            |
| `validate_handoff.py`                                      | `HANDOFF_VALIDATION=PASS`, `FILES=91`                                           |
| provenance                                                 | `PROVENANCE=PASS`, 42 verbatim, 3 authorized overrides                          |
| scope                                                      | `SCOPE_VALIDATION=PASS`, autonomy ceiling, billing disabled, 7 prohibited paths |
| `sha256sum -c` on the v1.2 handoff package                 | **90 / 90 OK**, zero failures                                                   |
| fresh database, bootstrap → apply → revert-to-0 → re-apply | `1..18` → `18..1` → `1..18`, identical privilege and enum state both times      |

Fresh-cluster privilege state on the four objects 0018 hardened, read from the catalog after the
full round trip:

- `freightos_app` holds **no** `INSERT`/`UPDATE`/`DELETE` on `audit_events` — RC-B closed.
- `freightos_app` holds **no** `INSERT`/`UPDATE` on `kill_switches` — RC-G closed.
- `freightos_app` holds **no** table-wide `UPDATE` on `organization_nodes`; its column grant is
  exactly `external_reference, name, record_version, status, updated_at, updated_by`. **`parent_id`
  is absent** — RC-F closed.
- Every 0018 `SECURITY DEFINER` function is owned by a NOLOGIN definer owner with
  `search_path=pg_catalog, public` pinned; `app.record_audit_event` is owned by
  `freightos_audit_writer`, which is deliberately not a control-plane member.
- `admin` schema `USAGE` is held by neither `PUBLIC` nor `freightos_app`; all 22 `admin.*`
  functions additionally have `EXECUTE` revoked from `PUBLIC`.

`pnpm audit` reports 5 advisories — 1 critical, 1 high, 3 moderate — **all in the development
toolchain** (`vitest`, `vite`, `esbuild`), all reachable only through a running dev server or the
Vitest UI, neither of which ships. All five are present on `main` and predate this branch; this
branch changes no dependency they trace to. They are reported, not claimed fixed.

## What this classification establishes

Every _test failure_ is explained by the security model changing as designed, or by enumeration
that has legitimately moved. **None required weakening a remediated invariant, and none was
evidence of a regression.** Reaching green cost no approved security invariant, and no test was
skipped, weakened or broadly allowlisted to get there.

That is a narrower claim than it first looks, and R-01 is why it has to be stated narrowly. A
classification of failures can only speak about paths something exercised. The one real regression
in this remediation lived on a path nothing exercised, and it took an adversarial pass that called
the new commands directly — rather than a pass that read the diff or watched the suite go green —
to find it. Every control this PR installs as a _replacement_ for a revoked privilege now has a
positive control proving the replacement works, because the absence of one is what let R-01 through.

This document records verification evidence. It is **not** an acceptance, and nothing in it should
be read as a claim that FreightOS is production ready, secure, resilient, complete, or accepted.
