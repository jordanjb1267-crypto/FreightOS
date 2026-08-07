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

`scripts/test/sr2-production-boundaries.test.ts` enforces this and sixteen other properties from the
catalog and the file tree, including which single module may brand a principal, mint, install, or
write a legacy identity GUC; which test files may contain a raw GUC write at all; that the
statement-scoped policy primitives and the capability predicates stay out of application code; and
that no production module installs a principal cache.

## Alternatives rejected

| Alternative | Why not |
| --- | --- |
| Sign the claim and verify the signature | Moves the trust to key distribution and still lets whoever holds the key mint any actor. It answers "was this claim tampered with", not "is this the actor". |
| Check that the actor UUID exists in `users` | Existence is not authentication. Every real user's id would be a valid credential for every other session. |
| Trust an application-supplied JWT claim | The same claim with more syntax, unless the server verifies it against an issuer — which is the provider SR-2 deliberately does not fabricate. |
| Accept actor id and organization id independently | Lets a real actor be paired with a scope it does not hold. The binding carries them together and the mint refuses the pair no membership justifies. |
| Rename `app.actor_id` to something authoritative-sounding | Explicitly prohibited by the owner, and correctly: it changes nothing about who decides. |
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
