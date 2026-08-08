# ADR-0027 — Verified actor binding

**Status:** Accepted (engineering, SR-2)
**Date:** 2026-08-07
**Subordinate to:** ADR-0015, ADR-0019, ADR-0020, ADR-0021, ADR-0026, and the owner rulings in
`docs/decisions/0002-phase-1-owner-rulings.md`
**Closes:** SEC-01
**Changes no owner ruling.**

## Context

Every authoritative accessor in the database read a session variable the caller wrote:

```sql
SELECT nullif(current_setting('app.actor_id', true), '')
```

`app.actor_id` was the tenant administrator if the session said so. `app.tenant_id` was whichever
tenant the session named. Row-level security, the audit ledger, the authorization-mutation boundary
and every scope predicate resolved through those functions, so the entire authority model rested on
a claim the claimant supplied. Migration 0017 had already recorded the shape of the problem for one
GUC — "a regex-valid uuid is not an authenticated identity" — and closed the specific path by which
it produced role grants. It did not close the identity question underneath.

The invariant SR-2 exists to establish, stated by the owner:

> No caller-controlled UUID, request field, header, GUC, session variable, SQL parameter, or
> arbitrary application claim may independently determine the authoritative FreightOS actor.

## Decision

The authoritative actor of a `freightos_app` session comes from a **session binding**: a row issued
over the control plane, targeted at one backend process, installed into one transaction, and
revalidated against live membership on every consequential resolution.

### 1. What the binding is targeted at cannot be claimed

Three facts decide whether an issued binding may be installed, and a client can assert none of them:

| Fact | Source |
| --- | --- |
| backend process | `pg_backend_pid()`, server-observed on the runtime connection |
| transaction | `pg_current_xact_id()`, assigned by the database |
| isolation level | `current_setting('transaction_isolation')`, the effective level |

`app.begin_verified_session` claims the binding atomically — every condition in the `WHERE` clause
of one `UPDATE`, so two concurrent installs of the same identifier cannot both succeed — and returns
**one generic refusal for every failure cause**, so it is not an oracle for which identifiers exist.

The isolation check comes first and is the primary control. Post-install immutability is defence in
depth: PostgreSQL refuses `SET TRANSACTION ISOLATION LEVEL` after any query, but a transaction that
STARTED at repeatable read would otherwise install perfectly well.

### 2. Authority is revalidated, not remembered

`app.verified_principal()` re-reads the user and the membership on every call. Issuance proves
somebody was authorised then; the accessor proves they are authorised now. A principal revoked
between mint and install gets no session, and a principal revoked mid-transaction loses authority
inside that transaction — visible at READ COMMITTED, which is why READ COMMITTED is a contract
rather than a default.

### 3. Seven accessors, one branch

Each authoritative accessor takes the verified branch for the runtime role and the legacy GUC branch
for every other role:

```sql
SELECT CASE WHEN session_user = 'freightos_app'
            THEN (app.verified_principal()).tenant_id
            ELSE nullif(current_setting('app.tenant_id', true), '')::uuid
       END
```

`app.actor_id` is **not renamed**. Renaming it would have produced a migration that looked like the
fix and changed nothing about who decides identity. The GUC still exists, is still written by
`packages/database/src/session.ts`, and is simply no longer read for the role that matters.

All seven are `SECURITY DEFINER` owned by `freightos_binding_owner` with a pinned `search_path`,
because PostgreSQL checks the EXECUTE ACL of **every function node in an expression tree at
initialisation, including the arm of a `CASE` that will not be taken** — so a non-`app` role
evaluating the legacy branch was still refused for `app.verified_principal()`. That was found by
measurement, not by reading.

### 3a. A pinned `search_path` was not a pinned `search_path`

`pg_catalog, public` reads like a closed path and is not one. **PostgreSQL searches the session's
temporary schema FIRST for relations whenever `pg_temp` is not explicitly listed** — inside a
`SECURITY DEFINER` with a pinned path exactly as anywhere else, because pinning two schemas does not
exclude the implicit third. Naming `pg_temp` is the only thing that demotes it, and `TEMPORARY` is
granted to `PUBLIC` on every database by default, so `freightos_app` held the one privilege the
attack needed.

Findings F-01 (critical) and F-02 (high), both measured against a session holding a **genuine**
verified binding:

| | Attack | Observed before 0022 |
| --- | --- | --- |
| **F-01** | shadow `users` and `memberships`, then let the control plane revoke the real membership and commit | `app.current_tenant_id()` still returned the tenant on the next statement of the same transaction. A committed revocation was not observed — §2 above, failing open |
| **F-02** | shadow `organization_node_closure` | `app.verified_scope_node_ids()` went from 1 node to 4, and a principal bound at the terminal node read a user row on the legal-entity node above it |

Neither is a logging discrepancy. Both are authorization decisions taken from a table the caller
wrote, which is the exact thing SR-2 exists to make impossible. F-02 is **pre-existing**: the
identical attack succeeds against migrations 1..19, so 0020 carried the pattern forward rather than
creating it.

Migration 0022 closes the class in three layers, because a boundary with one control is not a
boundary:

1. **The runtime role loses `TEMPORARY`.** It already held `CREATE` on no schema — measured — so
   `pg_temp` was its only route to introducing a relation at all. This is a database-level
   privilege, so it holds for every function present and future and cannot be undone by any
   statement the session can issue.
2. **Every `SECURITY DEFINER` in `app` and `admin` lists `pg_temp` LAST.** Forty-eight functions,
   enumerated from `pg_proc` rather than from migration text — a hand-written list missed
   twenty-four of them, including the whole authorization-mutation boundary.
3. **The authorization core schema-qualifies its relation references**, so it is correct under any
   `search_path` a caller can arrange.

`admin` is in scope and it is not a formality: `admin.issue_session_binding` verifies the requested
principal against `users` and `memberships` before minting. A control-plane session able to shadow
those tables would get a binding for a principal who holds nothing — and the mint is the anchor the
whole chain hangs from.

The layers are independently effective, which is asserted rather than claimed:
`sr2-temp-shadow.test.ts` grants `TEMPORARY` back for the duration of one case and shows the attack
still fails on layers 2 and 3, and then sets the caller's own `search_path` to `pg_temp, public,
pg_catalog` and shows it still fails on layer 3 alone — which is the only layer protecting the
invoker-rights scope functions, since those deliberately carry no `SET` clause (a `proconfig` blocks
SQL inlining and would undo §Consequences' plan shapes).

**Listing `pg_temp` has a cost, measured rather than assumed.** The implicit rule covers relations
and types only; naming the schema explicitly also makes it visible for functions and operators.
Probed directly: a temporary `pg_backend_pid()` and a temporary `=` operator on `uuid` were both
created and neither changed any resolved value, because `pg_catalog` precedes `pg_temp` in the
pinned path and a definer's `proconfig` overrides the caller's session path outright. The trade is
a severe relation-shadowing hole for a function-resolution surface that measurement shows is not
reachable, and layer 1 removes the ability to create the object at all.

### 4. Role-disjoint bootstrap policies

The binding owner must read `users`, `memberships`, `service_accounts` and
`organization_node_closure` in order to resolve a principal — and those tables' policies call the
accessors, which call the binding owner. The cut is **role disjointness**: the ordinary policies name
the ordinary roles, and a separate `*_bootstrap_read` policy names `freightos_binding_owner` alone
and uses non-revalidating primitives. Policy applicability is decided by `polroles`, so the two
never both apply and the cycle cannot form.

This is asserted structurally, in migration §10, over all four tables. RLS recursion in PostgreSQL
manifests as `stack depth limit exceeded` — not as a recursion diagnostic — so a runtime test is a
poor detector and a catalog assertion is the control.

### 5. The evidence-source rule

**Every count reported for SR-2 comes from the test runner's final `Tests` summary line.**

Not from `grep`. Not from truncated terminal output. Not from a partial log excerpt. Not from
counting failing test names. Three inaccurate reports were produced during SR-2 by deriving counts
from `head`-truncated output and from arithmetic on remembered numbers, and each had to be corrected
afterwards. A number that cannot be pointed at in a runner summary is not evidence, and this rule is
part of the architecture record because the failure mode is a reporting failure, not a code failure.

The same rule applies to claims about behaviour. `gives a facility_operator session no identity
write` passed for four migrations while asserting a matrix cell the database did not implement, on a
row written outside the node its own context named; the only thing that established the truth was
constructing the principal and running the write in scope. Where this PR states what the database
does, it states what was measured — and the same discipline found the performance fault, the second
instance of it inside the bootstrap graph, and the plan-shape evidence for both.

### 6. Plane separation

Three authority questions are kept apart, permanently, because conflating any two of them produces a
capability nobody authorised:

| Plane | Question | SR-2 position |
| --- | --- | --- |
| **A — human administrator authority** | Who may act across legal entities? | Required by the handoff. **Not implemented.** Executable evidence from the migrated suite: 0 cases. |
| **B — policy application scope** | Where may a control apply? | Required by the handoff and independently confirmed. **Not implemented.** Root controls exist in tests only through privileged fixture. |
| **C — provisioning** | Who creates a tenant's first node, user and membership? | **Unresolved.** Runs over the migrator, fully RLS-subject, in a module separate from authentication. |

A policy may legitimately apply at enterprise scope without any human membership living at
enterprise scope. **Policy scope is not actor scope**, and a change that satisfies one by widening
the other is a regression whatever its test results say.

The markers are recorded in `docs/security-resilience/SR2_FOLLOW_ON_REQUIREMENTS.md`:
`TENANT_WIDE_RUNTIME_ADMIN_AUTHORITY`, `TENANT_ROOT_POLICY_AUTHORITY` and
`PROVISIONING_TRUST_BOUNDARY`. A fourth, `CONTEXT_CAPABILITY_MATRIX_RLS`, was found by measurement
during SR-2 and then closed by migration 0021 — it never belonged with the other three, which are
unresolved future design, because an accepted ADR the runtime does not enforce is a contradiction
rather than a question.

### 7. No authentication provider ships

`packages/context/src/authentication-boundary.ts` defines the port and provides no implementation.
SR-2 does not fabricate a production identity provider, and there is deliberately no
`NODE_ENV === 'test'` switch anywhere: no production path becomes privileged because a variable says
so. The test-only boundary is privileged because it is a file the production build never resolves.

`scripts/test/sr2-production-boundaries.test.ts` enforces this and eighteen other properties from the
catalog and the file tree, including which single module may brand a principal, mint, install, or
write a legacy identity GUC; which test files may contain a raw GUC write at all; that the
statement-scoped policy primitives and the capability predicates stay out of application code; that
no production module installs a principal cache; and that no migration from 0022 onward pins a
`search_path` which leaves `pg_temp` searched first.

That last one has a runtime counterpart, `gate Z` in `sr2-binding-structure.test.ts`, which sweeps
every `SECURITY DEFINER` in `app` and `admin` against the live catalog. Both are wanted: the static
check cannot see a function created by a `DO` block, and the catalog check cannot see a migration
nobody has run. §4 of migration 0022 asserts the same property once, at the moment it runs, and that
is the one that expires — a definer added by 0023 would carry the ordinary pin and pass everything
except these two.

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Sign the claim and verify the signature | Moves the trust to key distribution and still lets whoever holds the key mint any actor. It answers "was this claim tampered with", not "is this the actor". |
| Check that the actor UUID exists in `users` | Existence is not authentication. Every real user's id would be a valid credential for every other session. |
| Trust an application-supplied JWT claim | The same claim with more syntax, unless the server verifies it against an issuer — which is the provider SR-2 deliberately does not fabricate. |
| Accept actor id and organization id independently | Lets a real actor be paired with a scope it does not hold. The binding carries them together and the mint refuses the pair no membership justifies. |
| Rename `app.actor_id` to something authoritative-sounding | Explicitly prohibited by the owner, and correctly: it changes nothing about who decides. |
| Fix F-01/F-02 by schema-qualifying the two reported functions | Fixes two symptoms of a class. Forty-six functions referenced protected relations unqualified, including the self-elevation guards and the kill-switch write trigger, all of which fire in the caller's own session. |
| Revoke `TEMPORARY` and stop there | One control is not a boundary, and it is the layer most likely to be undone by a future operator restoring a default. |
| Add `SET search_path` to the invoker-rights scope functions | A `proconfig` blocks SQL function inlining. Measured during P-01: that is what makes `app.is_control_plane()` collapse to `pg_has_role()`, and losing it would return the policies to per-row resolution. Schema-qualification achieves the same safety with no plan cost. |
| Leave `pg_temp` off the path and rely on qualification alone | Per-function and therefore a moving target: a function added later reopens it silently, which is how this survived four migrations. |
| Audit after authorization | Records who claimed what, after the claim has already worked. |
| Session-scoped rather than transaction-scoped binding | Survives a pooled connection's return to the pool. Transaction scope makes connection reuse safe by construction. |

## Consequences

**Good.** SEC-01 closes. No caller-controlled value determines the actor for the runtime role. A
revoked principal loses authority mid-transaction rather than at next connect. Connection pooling is
safe by construction, because a binding cannot outlive its transaction. The audit ledger records an
actor the database resolved rather than one the caller supplied.

**Cost, measured, failed, and fixed.** Session establishment is about 5 ms per verified transaction,
mostly two extra round trips, and that is fine. Resolution was not. `app.verified_principal()` costs
~2.5 ms because it revalidates rather than remembers — which is the point — and the policies called
it once per row of every table they touched, including once per `organization_node_closure` row
inside `app.organization_node_scope_ok`. Measured: 28.2 ms for that one predicate against 0.74 ms on
the legacy path, and `SELECT id FROM users` over fifty users at 1.0–8.6 s against 13 ms.

Migration 0020 moved the sublink out of the row-argument predicate and into the policy, where the
planner hoists it: 200 users now read in **11.4 ms median / 17.9 ms p95** against 3,556 ms median and
55,348 ms p95, with buffers flat as rows and closure grow. Statement scope is the only granularity
that is safe, and it is the granularity §2 above already required. §10 and §12 of
`docs/security-resilience/SR2_DATABASE_GATE_EVIDENCE.md` carry the derivation, the rejected
experiment, the final benchmark and the revocation proof.

The bootstrap policies also add a second policy row to four tables and a permanent structural
obligation: any new policy on those tables must keep the role sets disjoint, which migration §10
asserts.

**ADR-0019's capability matrix is enforced for the resource groups that have tables.** Migration
0021 added `app.identity_write_context_ok()` and `app.identity_read_context_ok()`, both reading the
binding-derived accessors rather than the legacy GUCs, to thirty-nine identity policies. That
obligation predated SR-2 by four migrations and was measured open: a real verified
`facility_operator` principal could write identity in scope. §13 carries the full matrix audit.

**Deferred.** The production authentication adapter, and the three authority planes above. The nine
ADR-0019 matrix rows whose tables do not exist yet stay with the migrations that will create them,
which is where ADR-0019 already put them. None of these is a licence to widen this PR.
