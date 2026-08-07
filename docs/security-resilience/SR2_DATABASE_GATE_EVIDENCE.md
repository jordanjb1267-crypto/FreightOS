# SR-2 — migration 0019 database security gate

Evidence for `MIGRATION_0019_DATABASE_GATE`. Every measurement below was taken on
PostgreSQL 16.13 (`PostgreSQL 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1) on x86_64-pc-linux-gnu`),
driven as `freightos_migrator` or as one of the runtime roles. Nothing in this document was
produced by a superuser session, and nothing was inferred from the migration text.

## 1. Three defects found before the gate could start

The prior report said 0019 "applies, reverts and re-applies cleanly". That was true and
insufficient: the proof had run one database at a time, as one role, without ever exercising the
runtime role. CI on `0ee718f` was red for two of these, and hid the third behind the first.

### D-01 — every role except `freightos_app` lost the six accessors

```
freightos_control_plane=> SELECT app.current_tenant_id();
ERROR:  permission denied for function verified_principal
```

**Intended boundary.** `session_user = 'freightos_app'` selects the verified branch; every other
role reads its legacy GUC and needs no privilege on the resolver.

**Observed boundary.** PostgreSQL performs the `EXECUTE` privilege check at
expression-initialisation time, for every function node in the tree — **including the arm of a
`CASE` that will not be taken**. The carve-out never spared non-runtime callers. The control plane
broke outright: `seedTenants`, which inserts as `freightos_control_plane`, failed in `beforeAll`
across eleven integration files.

**Root cause.** The five accessors were invoker-rights SQL functions naming a definer the caller had
no grant on.

**Remediation.** `packages/database/migrations/0019_verified_actor_binding.up.sql` §6 — the five
accessors are now `SECURITY DEFINER SET search_path = pg_catalog, public`, owned by
`freightos_binding_owner`. The accessor carries the privilege; the caller needs none. This is the
idiom `app.current_human_principal()` has used since 0018. `SECURITY DEFINER` changes `current_user`
and never `session_user`, so the carve-out is unaffected.

The alternative — widening `EXECUTE` on `app.verified_principal()` to a hand-maintained list of
every role in the cluster — was rejected because the list goes stale at the next migration that adds
a role, and because it would have had to include effectively every role, which is `PUBLIC` under
another name.

**Recorded residual (performance, not security).** A `SECURITY DEFINER` function is not inlinable,
so the accessors now cost a function invocation per RLS predicate evaluation instead of being folded
into the qual. The dominant cost was already `app.verified_principal()`, which is a definer and was
never inlinable. Not addressed in SR-2.

**Regression test.** `gate A — structure > leaves the accessors reachable by every caller`, which
asserts `has_function_privilege` for `public` and seven named roles on each of the five.

### D-02 — the down migration could not drop a cluster-wide role

```
ERROR:  role "freightos_binding_owner" cannot be dropped because some objects depend on it
DETAIL:  owner of function app.verified_binding_tenant_scope()
         owner of function app.verified_binding_node_scope_ok(uuid)
         target of policy organization_node_closure_bootstrap_read on table organization_node_closure
         target of policy users_bootstrap_read on table users
         target of policy memberships_bootstrap_read on table memberships
         owner of function app.verified_principal()
         owner of function app.begin_verified_session(uuid)
         15 objects in database freightos_0019_dbg2
```

**Intended boundary.** A down migration removes what its up migration created.

**Observed boundary.** Roles are cluster-wide. `DROP ROLE` fails whenever _any other database in the
same cluster_ still has 0019 applied — the normal state of CI, where eleven test databases migrate
in parallel, and of any deployment with more than one FreightOS database. The isolated proof passed
because only one database was at 19 at the time.

**Root cause.** 0019 was the only migration in the repository attempting `DROP ROLE`. Every other
NOLOGIN owner role — 0007's `freightos_hierarchy_owner`, 0010's `freightos_identity_guard`, 0013's
`freightos_admin_owner`, 0018's `freightos_audit_writer` — is created idempotently on the way up and
left in place on the way down, for exactly this reason.

**Remediation.** The down migration revokes every privilege the role holds _in this database_ and
leaves the catalog row. The migrator's administer-only membership is retained as well: a plain
`REVOKE` would also take the implicit `ADMIN` row PostgreSQL 16 creates for a role's creator, and a
later re-apply could then not grant the role at all.

**Regression test.** `gate T` asserts that after `19 → 18` the role holds zero table privileges and
neither `USAGE` nor `CREATE` on schema `app`. `gate U` proves a complete `zero → 19 → zero → 19`
round trip reproduces the same inventory.

### Cycle 5 — the runtime role was recursive, and nothing had reached it

Measured on the committed migration, once the control-plane failure stopped masking it:

```
freightos_app=> SELECT app.current_tenant_id();
ERROR:  stack depth limit exceeded
CONTEXT:  SQL function "verified_binding_tenant_scope" during startup
          SQL function "verified_principal" during startup
          SQL function "verified_principal" during startup
          ... (repeating)
```

**The cycle.**

```
freightos_app SELECT
  -> app.current_tenant_id()          session_user = freightos_app -> verified branch
  -> app.verified_principal()         SECURITY DEFINER -> freightos_binding_owner
  -> plans its body, which reads service_accounts
  -> service_accounts_read            TO PUBLIC, so it APPLIES to the binding owner
  -> app.current_tenant_id()          session_user is STILL freightos_app -> verified branch
  -> app.verified_principal()
  -> ...
```

**Root cause.** `app.verified_principal()` reads **four** tables — `users`, `memberships`,
`service_accounts` and `app.session_binding`. `CLOSURE_BOOTSTRAP=C` had been applied to three.
`service_accounts_read` was still `TO PUBLIC` and still consumed `app.current_tenant_id()`.

**Remediation.** §4 now applies the same narrow-plus-bootstrap treatment to `service_accounts`.
§10 no longer names tables one at a time: it asserts, over every table the bootstrap graph reaches,
that no read-applicable policy is both applicable to the binding owner and dependent on an
authoritative accessor; that each has a binding-owner-only door; and that no bootstrap door is open
to `freightos_app`.

**Why a structural check and not a runtime one.** PostgreSQL never emitted a recursion diagnostic.
It exhausted the backend stack. A runtime smoke test can only find such a cycle by falling into it,
and this one was reachable solely through the runtime role, which no existing test could drive after 0019.

**Regression test.** `gate J — lets no read policy be both applicable to the binding owner and
dependent on an authoritative accessor`, plus the four checks in `gate S`.

## 2. The gate

Two files, 100 cases, all passing.

| File                            | Cases | Covers                                         |
| ------------------------------- | ----: | ---------------------------------------------- |
| `sr2-binding-structure.test.ts` |    32 | gates A, J, Q, R, S, T, U                      |
| `sr2-binding-runtime.test.ts`   |    68 | gates B, C, D, E, F, G, H, I, K, L, M, N, O, P |

```
 ✓ |integration| packages/database/test/integration/sr2-binding-structure.test.ts (32 tests) 2101ms
 ✓ |integration| packages/database/test/integration/sr2-binding-runtime.test.ts (68 tests) 4646ms
```

Zero skips in either file. Every skip in the wider suite is accounted for in §4.

### Test discipline

Every negative case runs in its own transaction, and most in their own connection. PostgreSQL
answers a poisoned transaction with `25P02`, so a case that reused one would record a refusal it did
not cause. Where a case must observe state after a refusal it rolls back first and re-reads on a
clean transaction — `gate F`'s post-install isolation case does exactly this, because the
`SET TRANSACTION ISOLATION LEVEL` rejection aborts the transaction it was testing.

Every denial family carries a positive control. R-01 was a control that refused everybody, and it
passed every negative test that existed at the time.

## 3. Measured results by gate

**Gate B — mint.** Issues for Alice and for a service principal, storing exactly the justified
identity and scope with nothing installed. Refuses: a real principal with a tenant no membership
justifies (`42501`), a node the membership does not cover, a nonexistent principal, a service
account id presented as human, an unknown principal type (`22023`), and an installation window
outside 1–300 seconds. Executable by exactly `{freightos_admin, freightos_admin_owner}` — asserted
by OID over every `freightos%` role. `freightos_app` cannot name it and cannot `SET ROLE` into any
role that can (`permission denied to set role`, for all five).

**Gate C — storage.** `SELECT`, `SELECT` by known id, `SELECT` by random id, `COUNT`, `INSERT`,
`UPDATE` and `DELETE` all refused to `freightos_app` with `permission denied for table
session_binding`. Positive control: the mint definer inserts and the installer definer updates, end
to end. Catalog: the table's ACL contains exactly `freightos_admin_owner` (INSERT/SELECT/UPDATE) and
`freightos_binding_owner`; `PUBLIC`, `freightos_app`, `freightos_control_plane` and
`freightos_migrator` appear nowhere. `ENABLE` and `FORCE` row-level security both true.

**Gate D — target backend.** Installs on the connection it was issued for. Refuses the same valid
identifier on a different backend, a binding targeted at another backend, a fabricated pid, an
identifier never issued, and an expired binding. All five produce the identical message `verified
session could not be established` with `SQLSTATE 42501`, and no live identifier appears in any
refusal text — asserted by collecting the message set and checking it has exactly one member.

**Gate E — transaction.** `pg_current_xact_id_if_assigned()` is `NULL` before install and stays
`NULL` after exercising the full resolver path and an ordinary read, so RLS evaluation burns no
transaction ids. Installation assigns a top-level xid; the stored `installed_xact_id` equals
`pg_current_xact_id()` and the stored pid equals `pg_backend_pid()`. After `COMMIT`, a new
transaction on the same physical connection resolves to `NULL` and the binding cannot be
reinstalled. After `ROLLBACK` the identity is gone **and the binding is installable again** — the
installation `UPDATE` rolls back with its transaction, so consumption does not persist. That is
asserted as the truth rather than the tidier story: the deadline, not the rollback, is what bounds a
retry. A savepoint, a failed statement inside it, `ROLLBACK TO SAVEPOINT` and `RELEASE` all leave the
principal identical, and a subtransaction cannot install a different one.

**Gate F — isolation.** Driven as separate protocol executions throughout; batching them into one
simple query is what produced a wrong measurement during design.

| Route                                               | Probe reports      | Install          |
| --------------------------------------------------- | ------------------ | ---------------- |
| connection default                                  | `read committed`   | succeeds         |
| `SET TRANSACTION ISOLATION LEVEL READ COMMITTED`    | `read committed`   | succeeds         |
| `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`   | `repeatable read`  | refused, `25000` |
| `BEGIN ISOLATION LEVEL REPEATABLE READ`             | `repeatable read`  | refused          |
| `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`      | `serializable`     | refused          |
| `BEGIN ISOLATION LEVEL SERIALIZABLE`                | `serializable`     | refused          |
| `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED`  | `read uncommitted` | refused          |
| `BEGIN ISOLATION LEVEL READ UNCOMMITTED`            | `read uncommitted` | refused          |
| `SET SESSION CHARACTERISTICS ... REPEATABLE READ`   | `repeatable read`  | refused          |
| `default_transaction_isolation = 'repeatable read'` | `repeatable read`  | refused          |

`read uncommitted` is **not** normalised. PostgreSQL implements it as read committed, but the GUC
preserves the requested name and the contract is on the name. After every refusal the binding is
still uninstalled and the session still resolves to `NULL`. Changing isolation after an install is
rejected by PostgreSQL itself with `25001`, `SET TRANSACTION ISOLATION LEVEL must be called before
any query`; the identity is then re-established on a clean transaction rather than read through
`25P02`.

**Gate G — actor forgery.** With verified Alice installed, `app.actor_id` set to each of: a valid
colleague, a foreign-tenant administrator, a fabricated uuid, a service-shaped identifier, an
agent-shaped identifier, a platform-shaped identifier, an empty claim, a malformed claim, and an
injection-shaped claim. In every case `app.current_actor_id()`, `app.current_user_id()` and
`app.current_human_principal()` all resolve to Alice. A service principal claiming
`user:<Alice>` keeps `service_account:<id>` and returns `NULL` from both human accessors. With no
binding installed, all six accessors return `NULL` regardless of what the GUCs say.

**Gate H — tenant and scope forgery.** Tenant, node and legal entity stay bound under forged GUCs;
`SELECT id FROM tenants` returns only tenant A; `users` shows only tenant A. A principal cannot
switch tenant by any caller-controlled route — the mint refuses Alice for tenant B, and tenant B's
own administrator gets a tenant B binding on the same connection, which proves the refusal is about
justification rather than about tenant B being unreachable.

**Gate I — bootstrap chain.** `verified_binding_tenant_scope()` resolves to tenant A;
`verified_binding_node_scope_ok()` is true for the bound node, **false for its ancestor** (authority
runs downward, not upward) and false for a foreign tenant's node; `verified_principal()` returns
`(human, <Alice>)`; `current_tenant_id()` resolves; ordinary RLS returns rows. No stack exhaustion,
no recursion error, no permission error masking the path. The service principal resolves too.

**Gates K and M — revocation.** Two physical connections, Alice installed at read committed on the
first, the change committed by the second **without ending Alice's transaction**. Eight independent
cases: membership revoked, suspended, expired, not yet effective, moved to another node; user
revoked, returned to pending, expired. In every one, the next statement on the open transaction sees
`verified_principal()` return `NULL`, `current_tenant_id()` become `NULL`, `tenants` return zero
rows, and `users` and `organization_node_closure` return zero rows. Each case restores Alice
afterwards, so the cases are independent. A binding minted before a revocation and installed after
it is refused.

**Gate L — bounded race contract.** What the architecture provides, and no more: a statement that
has already acquired its read-committed snapshot completes under it; a revocation committed before
the next statement begins is observed by that statement; no application cache extends the window.
The eight cases above demonstrate the statement boundary directly. No timing-dependent concurrency
test was added — deterministic synchronisation is available for the statement-boundary property and
is what the cases use, and a sleep-based race would be brittle in CI without proving more.

**Gate N — theft and replay.** A second connection knowing the identifier is refused, and refused
again when it pairs the identifier with forged tenant and actor GUCs. A consumed binding is refused
in a later transaction on its own connection. Bob installed on a connection and then claimed as
Alice stays Bob, and stays in tenant A. Every outcome is attributable to a named invariant: target
pid, deadline, installation state, xid, or current principal state.

**Gate O — provenance, the concrete PR #5 residual.** Before SR-2, Alice could legitimately engage
the kill switch and set `app.actor_id` to Bob, and `engaged_by` recorded Bob. On the 0019 database,
with verified Alice installed and the claim set to each of a real colleague, a foreign administrator,
a fabricated user, a cleared claim and a malformed claim:

- the operation **succeeds** — the legitimate door stays open, which is the half R-01 got wrong;
- `engaged_by` is `user:<Alice>` and `engaged_by_type` is `human`;
- the substituted identifier appears nowhere in the record.

Release records verified provenance the same way. A service principal claiming to be a human is
refused outright with `only an active human principal may engage a kill switch` — Article V.1's
reservation now rests on the binding's enumerated principal type rather than on a parsed string.

**Gate P — self-elevation guards.** `app.current_human_principal()`, which every guard resolves the
caller with, returns Alice under a forged claim naming the administrator.

**Gate Q — ACLs.** No `PUBLIC` `EXECUTE` on any of the six SR-2 security functions. Exactly four are
callable by `freightos_app`: `begin_verified_session`, `verified_principal`,
`verified_binding_tenant_scope`, `verified_binding_node_scope_ok`. The mint boundary is callable by
`freightos_admin` and its owner and by nobody else — not the runtime role, not the storage owner, not
the deployment authority, not the control-plane role. `verified_binding_context()` is reachable only
by its owner. The full `proacl` of each function is asserted verbatim, so an unexpected grant is a
diff rather than a judgement call.

**Gate R — owner/body audit.** Every table each definer's body reads is readable by that definer's
owner — the general form of R-01. The two writing definers hold exactly the writes their bodies
perform (`freightos_admin_owner` INSERT and UPDATE, not DELETE; `freightos_binding_owner` UPDATE).
`freightos_binding_owner` holds exactly four privileges in the whole database: `SELECT` on
`users`, `memberships`, `service_accounts` and `organization_node_closure`. No LOGIN role owns any
SR-2 definer or any of the five accessors.

**Gate S — static recursion graph.** Zero findings on all four checks: no bootstrap helper calls an
authoritative accessor or the resolver; no `session_binding` policy consumes an actor, tenant or
hierarchy accessor; no ordinary policy outside the bootstrap set consumes binding-only scope; the
binding owner is a member of no authoritative role, directly or transitively, and is not control
plane.

**Gate T — privilege lending and `18 → 19 → 18`.** After the up migration, `CREATE` on schema `app`
is false for `freightos_hierarchy_owner`, `freightos_binding_owner`, `freightos_admin_owner`,
`freightos_app`, `freightos_identity_guard` and `freightos_control_plane`, and true for
`freightos_migrator` — the positive control, without which no later migration could run. The
binding-owner membership carries `SET` and `ADMIN` and **no** `INHERIT` on any grant row.

The positive control for the replacement itself: all six accessors are asserted to be the 0019
versions, not merely for the loan to be gone. A migration that returns the privilege but fails to
replace the function would fail `gate A`.

`18 → 19 → 18` restores bodies (no accessor still names `verified_principal`), owners
(`freightos_migrator` for five, `freightos_hierarchy_owner` for `current_human_principal`), security
mode, volatility (`s`), `search_path` and ACL — including the captured `PUBLIC EXECUTE` on
`current_human_principal`, because rollback fidelity is a separate requirement from forward posture.
All four bootstrap tables return to `TO PUBLIC` with no bootstrap policy left behind. Every SR-2
function, the table and the composite type are gone. Both loans are absent afterwards.

**Gate U — `zero → 19 → zero → 19`.** Run on a fresh database as `freightos_migrator`. Inventory
captured at both ends over: roles and six attributes each; role memberships with admin/inherit/set;
table ownership and FORCE RLS; table ACLs; column ACLs; every policy with roles, command, `USING`
and `WITH CHECK`; every function with owner, security mode, volatility, `search_path`, ACL and body
digest; constraints; indexes; enum labels with ordinals. Inventories A and B are equal. The
comparison is guarded against passing vacuously: it asserts more than 50 policies, more than 30
functions and more than 20 tables were compared. At zero, exactly one relation survives —
`schema_migrations`, the migrator's own bookkeeping, which no migration creates or drops.

### Transactional safety of the temporary loans

The migrator applies each migration inside a single transaction — `packages/database/src/migrator.ts`
wraps `BEGIN`/`COMMIT` around the file and the `schema_migrations` write. Both loans (schema `CREATE`
to `freightos_hierarchy_owner` in §6, `INHERIT` on the binding-owner membership in the down
migration) are taken and returned inside that transaction, so a failure anywhere between the loan and
its return commits neither. This was demonstrated directly rather than with failure-injection
machinery: during the fix, 0019 failed at §10 on an assertion that ran _after_ both loans, and
`has_schema_privilege('freightos_hierarchy_owner','app','CREATE')` was false afterwards because the
whole migration had rolled back. No half-lent state has ever been observable.

## 4. Repository and CI state

- Branch: `claude/sr-2-verified-actor-binding`
- Base: `main` @ `37f5b673cba1589b8a754fd36caef05472854052`
- PR #9, draft, unmerged

Full suite at the gate commit:

```
 Test Files  9 failed | 18 passed (27)
      Tests  12 failed | 473 passed | 295 skipped (780)
```

Unit: 272/272. SR-2 gates: 100/100. `migrations.test.ts` 20/20, `kill-switch-scopes.test.ts` 33/33.

**The 12 failures and 295 skips are one cause, declared in advance.** Migration 0019 makes
`freightos_app` fail closed without an installed binding. Every existing integration test installs
raw GUC context on a `freightos_app` connection and expects it to be authoritative, so those tests
now meet exactly the refusal SR-2 exists to produce. Six files skip everything because their
`beforeAll` seeds through that path; `ledger` (7), `rls` (3) and `identity-migrations` (2) fail
individual cases the same way.

This is the blast radius flagged in the first SR-2 design note, before any code was written:

> making the runtime role fail closed without a binding changes the semantics of every existing
> integration test that installs context directly. That is the intended direction — the tests should
> exercise the production path — but it is a large blast radius.

Clearing it is the **integration test migration**, which is step 4 of the owner's post-gate sequence
and is deliberately not attempted here. CI on the exact gate HEAD will stay red until it is done.
No assertion was weakened and no test was modified to conceal a database-design failure — the
existing tests are correct about a database that no longer exists, and they will be migrated onto the
production path rather than adjusted.

## 5. Open items and residuals, stated rather than resolved

**Tenant provisioning has no runtime path.** A binding requires a principal with an active
membership; the first user of a tenant is the row that would justify one. The circularity is real.
The gate fixture provisions over the `freightos_migrator` connection — still fully RLS-subject under
FORCE, so it is refused by exactly the policies a real provisioning path would meet — and says
plainly that this is a deployment path and not a runtime one. What the production answer should be
is an open design question for the ADR, not something the gate may invent.

**The Layer A/B bootstrap accessors do not revalidate.** Measured: after Alice's membership is
revoked, `app.verified_binding_tenant_scope()` still returns her bound tenant and
`app.verified_binding_node_scope_ok()` still returns true for her bound node, on the same open
transaction where every authoritative accessor has already gone to `NULL`. This is by construction —
revalidation is Layer C's job, and putting it in Layer B is what created the recursion the design had
to cut. It confers no authority: the only policies consuming these two are applicable to
`freightos_binding_owner` alone. What a revoked session retains is the ability to read back a tenant
it already supplied and to probe whether a node uuid it already holds is a descendant of its own
bound node. That is information-shaped, not authorization-shaped. It is asserted explicitly in
`gate K` so a future change cannot quietly convert one into the other.

**Rollback makes a binding installable again.** The installation `UPDATE` rolls back with its
transaction, so a rolled-back install does not consume the binding. The deadline bounds the retry
window, not the rollback. Asserted as measured.

**Accessor inlining is lost.** See D-01. Performance, not security; not addressed in SR-2.

**Dependency posture is unchanged and is not clean.** 1 critical, 1 high, 3 moderate — Vite, Vitest
and esbuild, inherited from `main`, deferred to SR-10/SR-11. Recorded here as inherited known risk.
Not remediated in SR-2.
