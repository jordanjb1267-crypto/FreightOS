# SR-2 — migration 0019 database security gate

Evidence for `MIGRATION_0019_DATABASE_GATE`. Every measurement below was taken on
PostgreSQL 16.13 (`PostgreSQL 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1) on x86_64-pc-linux-gnu`),
driven as `freightos_migrator` or as one of the runtime roles. Nothing in this document was
produced by a superuser session, and nothing was inferred from the migration text.

The gate has since also run unchanged on CI's PostgreSQL **16.14**
(`starting PostgreSQL 16.14 on x86_64-pc-linux-musl`, `postgres:16-alpine`) — see §4. The two
minor versions agree on every case, which matters because three of the properties here turn on
version-specific behaviour: expression-initialisation ACL checks, `pg_shdepend` cross-database role
dependencies, and `CREATE OR REPLACE` resetting `prosecdef` and `proconfig`.

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

Full suite locally at the gate commit:

```
 Test Files  9 failed | 18 passed (27)
      Tests  12 failed | 473 passed | 295 skipped (780)
```

### CI on the exact head `aa7ce0d`

`format:check`, `lint`, `typecheck`, `validate:handoff`, `validate:provenance` and `validate:scope`
all pass. Unit and coverage:

```
 Test Files  14 passed (14)
      Tests  272 passed (272)
```

with coverage `All files | 100 | 98.42 | 100 | 100`, above every configured threshold.

Integration:

```
 Test Files  9 failed | 4 passed (13)
      Tests  12 failed | 201 passed | 295 skipped (508)
```

**Both gate files pass in CI, with zero skips, on a different minor version:**

```
 ✓ |integration| packages/database/test/integration/sr2-binding-structure.test.ts (32 tests) 3916ms
 ✓ |integration| packages/database/test/integration/sr2-binding-runtime.test.ts (68 tests) 7812ms
```

`migrations.test.ts` 20/20 and `kill-switch-scopes.test.ts` 33/33 pass there too.

The three defects are gone from CI, confirmed by absence rather than by assertion: across the whole
job log there are **zero** occurrences of `stack depth limit exceeded`, `permission denied for
function verified_principal`, and `cannot be dropped because some objects depend on it`, and zero
occurrences of `25P02`. The one `permission denied for schema admin` in the PostgreSQL server log is
gate B's negative control — `freightos_app` attempting `admin.issue_session_binding` — and is the
refusal that case asserts.

The local and CI failure sets are identical, case for case: the same 12 named tests and the same six
suites. Nothing is flaky and nothing is environment-specific.

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

## 6. Harness migration — the finding behind the largest remaining block

39 of the 76 remaining integration failures are in `organization-hierarchy.test.ts`, and 49 of its
53 context establishments go through one helper:

```ts
function adminContext() {
  return systemContextAt(TENANT_A, a.enterpriseNodeId, a.legalEntityId, `user:${a.adminUserId}`);
}
```

That context claims the **enterprise** node. The administrator's membership, as
`identity-harness.ts` provisions it, is at the **legal-entity** node — one level below — and the
fixture says so in its own comment: _"The legal-entity node, not the enterprise above it: a
membership must name a node the legal entity actually governs, and the root sits above that
boundary."_

Before SR-2 nothing reconciled the two. `app.current_organization_node_id()` returned whatever the
session wrote into the GUC, so the fixture asserted a node its membership did not justify and the
database believed it. `admin.issue_session_binding` refuses exactly that pairing:

```
no active membership justifies this principal, tenant and node
```

So this is not a test that needs rewriting to keep working. It is a test whose setup depended on
caller-asserted scope, and the refusal is the control operating correctly. The migration has two
honest resolutions and they are not equivalent:

1. **Provision the authority the tests assume.** If a tenant administrator legitimately administers
   from the enterprise root, the fixture should grant a membership that says so, and the binding
   will then justify the node. The authority becomes something the hierarchy grants rather than
   something the session asserts — which is the same correction F-05 already applied once.
2. **Accept the narrower scope and update the expectations**, recording for each changed assertion
   why the old one represented invalid production semantics.

**Measured: resolution (1) is impossible, so (2) is forced.** The database refuses the grant
outright.

```
freightos_admin=> SELECT outcome, message FROM admin.grant_membership(
                    <tenant A>, <administrator>, <enterprise node>, <legal entity>, ...);
denied | legal entity 3dd07250-... does not govern organization node ee4a8053-...
```

`memberships` carries an `assert_governing_legal_entity` trigger, and the enterprise root sits
above the legal-entity boundary by construction. There is no membership that would justify the node
the fixture was claiming — which is a stronger statement than "the fixture claimed too much". It
claimed something the identity model has never permitted anyone to hold, and only the caller-set GUC
made it appear to work.

So the administrator's authority is genuinely narrower than 49 context establishments assumed, and
the expectations must move. Each changed assertion owes the same sentence: the old expectation
rested on reach no membership conferred, which is invalid production semantics rather than a
tightening introduced by SR-2.

This is not a matter of loosening the database, and it has not been applied yet. `identity-rls`
(16), `identity-lifecycle` (13) and `authority-remediation` (7) are expected to share this root
cause, since they use the same fixture and the same enterprise-node context.

## 7. Category A is an implementation contradiction, not an unresolved product question

I was asked to record `TENANT_WIDE_RUNTIME_ADMIN_AUTHORITY=UNRESOLVED` unless an authoritative
handoff already answers it, and to cite the requirement and follow it if one does. One does:
`docs/production-handoff/v1.2/04_ENTERPRISE_SCALE_AND_TENANCY.md`.

Its hierarchy lists `Enterprise` as the top node type, and line 16 states:

> Drivers, equipment, **users**, policies, contracts, and reports **can be scoped to any valid node**.

Its **Enterprise capabilities** (line 63 and around) include:

> - SAML/OIDC federation
> - SCIM provisioning
> - **Delegated administration**
> - **Multiple authorities/currencies/accounting entities**

with `Enterprise-wide policy updates` among the mega-carrier targets.

So the product requires a human user scoped at the Enterprise node, administering across multiple
legal entities. It is listed as a customer-side enterprise capability beside SAML/OIDC and SCIM —
not platform administration — and nothing in the handoff assigns it to the control plane.

**The schema forbids what the handoff requires.** `assert_governing_legal_entity` refuses a
membership at the Enterprise node, and `users` carries the same rule. Both stated by the database
itself:

```
users requires an organization node governed by a legal entity;
node <uuid> sits above the legal-entity boundary
```

```
denied | legal entity <uuid> does not govern organization node <enterprise node>
```

The Enterprise root sits above the legal-entity boundary by construction, so no node assignment
satisfies both the trigger and the requirement.

### What this changes

The 39 organization-hierarchy failures and roughly 7 of the identity-rls failures are **Category E —
a confirmed implementation defect** — not Category A. The old tests encoded the handoff's
requirement correctly. What was wrong is that nothing enforced the contradiction: before SR-2,
`app.current_organization_node_id()` returned the caller's GUC, so a session could assert
enterprise-node scope that no membership could ever have carried, and the tests passed for the wrong
reason. SR-2 did not break these tests; it revealed that the authority they exercise has no
representable grant behind it.

### What I have NOT done

I have not changed `assert_governing_legal_entity`, `users`, `memberships`, or any part of the
identity model. That rule is PR #5 / migrations 0007–0010 work, merged and independently accepted,
and correcting it changes the authorization model rather than SR-2's actor binding — the "invent new
authority inside SR-2" the brief forbids.

I have also not narrowed the 39 tests to legal-entity scope. That would encode the schema's current
limitation as though it were the product requirement and silently delete coverage of a mandated
capability — "do not fake green by pretending legal-entity scope equals tenant-wide scope".

### Status

`TENANT_WIDE_RUNTIME_ADMIN_AUTHORITY=REQUIRED_BY_HANDOFF_AND_UNIMPLEMENTED`

Not `UNRESOLVED`: the product question is answered by `04_ENTERPRISE_SCALE_AND_TENANCY.md`. What is
open is an implementation gap between that requirement and the identity schema, needing an owner
decision on where the fix belongs — a follow-on identity migration, or an amendment to the
governance rule — because it is outside SR-2's stated scope and touches controls PR #5 already
gated.

`PROVISIONING_TRUST_BOUNDARY=UNRESOLVED` is unchanged and remains genuinely open. The two are
distinct and are not conflated here.

### Correction: Category B is not independent of the enterprise-node question

I reported that Category B (identity-lifecycle 13, authority-remediation 4, identity-rls 2) could be
migrated in parallel with the Category A ruling. That was wrong, and the correction matters because
it was offered as work that could proceed without a decision.

Every remaining failing suite routes its administrator context through the enterprise node:

```
identity-lifecycle      enterpriseNodeId x3
identity-rls            enterpriseNodeId x11
authority-remediation   enterpriseNodeId x11
authorization-boundary  enterpriseNodeId x6
organization-hierarchy  enterpriseNodeId x24
```

`identity-lifecycle`'s helper is representative:

```ts
return systemContextAt(
  TENANT_A,
  a.enterpriseNodeId,
  a.legalEntityId,
  actorId ?? `user:${a.adminUserId}`,
);
```

Its 12 `expected false to be true` failures are permission-chain reads through that context, so they
share the root cause rather than being a separate missing-tenant-context family. There is no subset
of the 76 that can be migrated without first deciding whether narrowing to the legal-entity node is
a legitimate fixture correction or a silent removal of mandated coverage.

Some of these are likely A1 in the owner's taxonomy — a permission chain attached to a membership at
the legal-entity node does not need enterprise reach to be exercised — but which ones are A1 and
which are A2 cannot be settled before the ruling, because A2's disposition depends on whether the
capability is deferrable at all.

## 8. Classification of the remaining 27, and a second confirmed requirement

### The two-step experiment that reclassified organization-hierarchy

Worth preserving, because fixture names were not sufficient to classify authority semantics.

**Step 1 — scope correction alone.** `adminContext()` changed from the enterprise root to the
administrator's valid legal-entity-governed node. Result: **39 failures → 39 failures.** The
enterprise-node claim was not the dominant cause.

**Step 2 — real verified-session routing**, on the same file. Result: **39 → 14.** So 25 of the 39
were missing verified runtime identity, not authority scope.

Most of organization-hierarchy is H1/H3. `four-level traversal`, `hierarchy invariants`,
`moving a subtree`, `F-13` archival and most of `F-03` are green with no assertion changed.

The same lesson repeated in identity-rls: `shows a tenant only its own organization nodes` — which I
had flagged as tenant-wide read because it expects all four nodes of the tenant tree — **passes**
under the verified administrator. It was R1 all along. Two suspected tenant-wide requirements
dissolved on measurement; neither survived contact with a real session.

### CONFIRMED P2 — Enterprise-root policy declaration

```
it('binds a control at the enterprise root with a null legal entity', ...)
  → bind(c, a.enterpriseNodeId, null, 'data_residency', 'eu_only', 5, 'residency')
  → new row violates row-level security policy for table "policy_bindings"
```

A verified legal-entity-scoped administrator cannot write a `policy_bindings` row at the enterprise
root, because the root is above its node scope.

**The handoff requires the capability**, and this is a different capability from the one already
recorded. `04_ENTERPRISE_SCALE_AND_TENANCY.md`:

> line 20: Policies inherit downward. A child may tighten a restriction but cannot weaken legal,
> safety, **enterprise-minimum**, security, residency, or approval controls.
>
> line 22: Every effective policy records inherited source and local override.
>
> line 53 (mega-carrier targets): **Enterprise-wide policy updates**

An "enterprise-minimum" control that inherits downward has to be declared somewhere above the legal
entities it constrains, and "every effective policy records inherited source" is exactly what the
dependent test asserts — that the terminal names the root as its source.

`TENANT_ROOT_POLICY_AUTHORITY=REQUIRED_BY_HANDOFF_AND_UNIMPLEMENTED`

### Why this is NOT the same marker as the administrator one

The owner's distinction holds and the evidence supports keeping them apart:

- **Capability A** — `TENANT_WIDE_RUNTIME_ADMIN_AUTHORITY` — asks _who may administer across legal
  entities_. It is about the human's membership scope.
- **Capability B** — `TENANT_ROOT_POLICY_AUTHORITY` — asks _where a policy may apply_. A control
  bound at the root could legitimately be created through a control-plane or command path without
  any human holding enterprise-wide membership.

They may share an authority architecture eventually. SR-2 must not assume it, and does not.

### Status of the remaining 27 at this commit

Classification is partially complete and is NOT being asserted as final:

| Suite                  | Remaining | Reading so far                                                                                                                                                                      |
| ---------------------- | --------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| organization-hierarchy |        14 | 8 are `policy_bindings` RLS write refusals — the root declaration above plus dependents; 6 unread (F-02 ×1, F-03 ×2, and 3 downstream assertions)                                   |
| identity-rls           |        13 | tests _about_ scope, which build their own narrower contexts deliberately; F-05's "operating context is not a credential" group must keep proving a system context confers no reach |

Confirmed counts so far: **H1/H3 ≈ 25 migrated green · R1 ≈ 12 migrated green · P2 = 1 confirmed ·
Class 2 (administrator authority) = 0.** No test has been narrowed, no assertion weakened, and no
skip introduced.

## 9. Final exact classification of the 26, and the integration migration complete

Section 8's counts were approximations and were labelled as such. These are not. Every one of the
26 cases outstanding at the owner's recorded baseline was read individually — no sweeps — and
carries exactly one primary category.

**All counts below come from the test runner's final `Tests` summary line.**

### The trajectory

```
88 → 83 → 82 → 76 → 62 → 54 → 29 → 27 → 26 → 21 → 13 → 0
```

The last three steps are this session: F-08 (5), organization-hierarchy's policy inheritance and
F-03 (8), identity-rls (13).

### Final state

| Gate                      | Result                                                        |
| ------------------------- | ------------------------------------------------------------- |
| Integration               | **519 passed (519)**, 14 of 14 files, 0 failed, **0 skipped** |
| Unit                      | **285 passed (285)**, 15 of 15 files                          |
| Static fences             | **14 passed (14)** — one added this session, see below        |
| Database security gate    | 100 / 100                                                     |
| format / lint / typecheck | clean                                                         |

### The exact table — 26 rows

#### organization-hierarchy — 13

| #   | Test                                                                                                 | Category | Disposition                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | F-08 › refuses a descendant binding that omits the inherited category                                | **P1**   | F8-E. Root control by privileged fixture; refusal asserted under the verified administrator on `/may not change or omit it/i`.                                                                                              |
| 2   | F-08 › refuses a descendant binding that relabels the category                                       | **P1**   | F8-E, same shape.                                                                                                                                                                                                           |
| 3   | F-08 › still refuses the weakening when the category IS named                                        | **P1**   | F8-E, same shape.                                                                                                                                                                                                           |
| 4   | F-08 › permits a descendant that names the category and tightens                                     | **P1**   | F8-E positive peer.                                                                                                                                                                                                         |
| 5   | F-08 › leaves an unprotected control weakenable                                                      | **P1**   | F8-E positive peer.                                                                                                                                                                                                         |
| 6   | policy inheritance › binds a control at the enterprise root with a null legal entity                 | **P2**   | F8-P. The assertion WAS the declaration. Extracted to Section C; replaced by an explicit refusal assertion plus the control-plane fixture.                                                                                  |
| 7   | policy inheritance › inherits the root binding down to the terminal and names the root as its source | **P2**   | Root inheritance and source provenance — handoff lines 20 and 22. Executable today via the privileged declaration fixture; declaration authority remains unimplemented.                                                     |
| 8   | policy inheritance › refuses a child binding that weakens a protected control                        | **P1**   | Downstream of 6. Legal-entity-local refusal, on `/may not be weakened/`.                                                                                                                                                    |
| 9   | policy inheritance › refuses the weakening for all six protected categories                          | **P1**   | Downstream of 6, six times.                                                                                                                                                                                                 |
| 10  | policy inheritance › permits weakening an unprotected control                                        | **P1**   | Downstream of 6. Positive peer.                                                                                                                                                                                             |
| 11  | policy inheritance › ignores a revoked binding                                                       | **P1**   | Downstream of 6. `rowCount` on the revoking UPDATE now asserted.                                                                                                                                                            |
| 12  | F-03 › lets only one of two concurrent roots exist for a tenant                                      | **H4**   | Identity was raw GUCs on `freightos_app`. Both actors now hold real verified sessions; both fail on `one_root_per_tenant`, which is evaluated after the RLS `WITH CHECK` and therefore proves the sessions were legitimate. |
| 13  | F-03 › does not let two tenants block each other                                                     | **H3**   | Tenant B has no identity to bind. Modelled explicitly as migrator provisioning — Section D.                                                                                                                                 |

#### identity-rls — 13

| #   | Test                                                                                                    | Category | Disposition                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14  | cross-tenant isolation › cannot update another tenant row                                               | **R3**   | Read-back now runs as tenant B's own verified administrator instead of a claimed tenant-B context.                                                                  |
| 15  | missing context fails closed › refuses to write a role when the caller administers no organization node | **R4**   | "Administers no node" was a claim. Restated as the unbound session, with `current_tenant_id()`/`current_actor_id()` asserted NULL and both refusal paths evidenced. |
| 16  | organization-node scope › shows users at or below the node the caller administers                       | **R1**   | Region member. Named identities rather than a count, both directions.                                                                                               |
| 17  | organization-node scope › hides a user that sits above the node the caller administers                  | **R1**   | Terminal member; every node above it checked one level at a time.                                                                                                   |
| 18  | legal-entity scope › refuses a write naming a legal entity the session does not hold                    | **R1**   | Second legal entity in the SAME tenant, so cross-tenant isolation is not what denies it. Predicate asserted directly beside the write.                              |
| 19  | legal-entity scope › permits the write when the session holds the named entity                          | **R1**   | Positive peer.                                                                                                                                                      |
| 20  | node and legal entity must agree › rejects a user naming a node governed by a different legal entity    | **R1**   | Second entity became a privileged fixture; the governing-entity trigger is still the assertion.                                                                     |
| 21  | capability matrix › gives a facility_operator session no identity write                                 | **R4**   | Confirmed contradiction. The refusal was node scope, never the context. See the addendum in `SR2_FOLLOW_ON_REQUIREMENTS.md`.                                        |
| 22  | carrier appointment › stops reporting an appointment once revoked                                       | **R1**   | Entity-node member performs the revocation; `rowCount` asserted.                                                                                                    |
| 23  | F-05 › does not let a system session reach another legal entity in its own tenant                       | **R1**   | Node half moved to an in-scope node, because the enterprise-root claim it relied on is not representable. Sibling branch asserted out of node scope separately.     |
| 24  | F-05 › refuses a write above the caller subtree even under system scope                                 | **R1**   | Terminal member under the widest context, writing one level up.                                                                                                     |
| 25  | F-05 › still permits the same write inside the caller subtree                                           | **R1**   | Region member, same statement, same target. Only the membership differs.                                                                                            |
| 26  | F-05 › gives every operating context the identical scope                                                | **R1**   | One identity, one membership, three authentication results. Nothing varies but the pair.                                                                            |

### Counts — every category stated, including the zeroes

| Category | Meaning                                                              |  Count |
| -------- | -------------------------------------------------------------------- | -----: |
| **H1**   | legal-entity-local hierarchy behaviour                               |  **0** |
| **H2**   | genuine tenant-wide human administrator behaviour                    |  **0** |
| **H3**   | privileged topology setup only                                       |  **1** |
| **H4**   | invalid old claimed-context assumption                               |  **1** |
| **P1**   | legal-entity policy behaviour                                        |  **9** |
| **P2**   | genuine Enterprise/root policy declaration or inheritance capability |  **2** |
| **P3**   | policy fixture/setup only                                            |  **0** |
| **P4**   | claimed policy-scope artifact                                        |  **0** |
| **R1**   | current legitimate visibility/scope                                  | **10** |
| **R2**   | genuine tenant-wide human read requirement                           |  **0** |
| **R3**   | cross-tenant isolation                                               |  **1** |
| **R4**   | claimed context/credential artifact                                  |  **2** |
|          | **Total**                                                            | **26** |

H1 is 0 because the H1 population was already migrated green before this baseline — approximately
25 cases, recorded in section 8 — and none of them remained outstanding. **Executable H2 evidence is
0**, which is the number Section B of the follow-on requirements records.

### What changed in the static fences

**13 → 14.** The new check is _keeps raw identity-GUC writes in test code to the reviewed
allowlist_. It fixes the SET of test files permitted to contain a raw `app.*` GUC write in either
spelling, so a new call site cannot arrive without the review that classifies it. The per-file
reasoning is `SR2_RAW_GUC_ALLOWLIST.md`; forbidden uses found: **0**.

Two inert GUC writes were deleted rather than allowlisted, in `kill-switch-scopes.test.ts`. Both
wrote `app.tenant_id` on a `freightos_app` connection to make the session "a tenant session", and
neither assertion depended on it: 0015's read policy admits `scope IN ('system', 'legal_plane',
'operating_context')` before the tenant comparison is reached, and 0018 §4 revoked INSERT and UPDATE
on `kill_switches` from `freightos_app` outright. Leaving them would have put two lines on the
allowlist that looked like identity and were not.

### Three properties asserted across the whole migration

- **No assertion was weakened to obtain a pass.** Where an assertion changed, it became more
  specific: named identities instead of counts, `rowCount` on UPDATEs that RLS narrows silently, and
  refusals matched on the message of the gate that must produce them.
- **No skip was introduced.** 0 skipped, measured, at every step.
- **No database or security SQL was changed to make an old test green.** The only migration edits
  this PR carries are the three defects and the §6 completion recorded in section 1, all of which
  predate the harness migration.

## 10. Performance — measured, and the measurement fails

PostgreSQL 16.13 local, `N` shown per row, medians. The comparison is the same statement under a
verified session on `freightos_app` against the legacy GUC path on the migrator, in a tenant with a
four-node tree and ten closure rows.

### Session establishment — the cost SR-2 adds that has no legacy counterpart

| Step                                                           |  median |     p95 |   n |
| -------------------------------------------------------------- | ------: | ------: | --: |
| mint — `admin.issue_session_binding`, control-plane round trip | 1.37 ms | 1.94 ms | 200 |
| `BEGIN` + isolation + install + `COMMIT`                       | 3.59 ms | 4.81 ms | 200 |
| baseline `SELECT 1` on the same connection                     | 0.11 ms | 0.22 ms | 200 |

**Acceptable.** About 5 ms of fixed cost per verified transaction, most of it two extra round trips.

### Resolution — the cost that is not acceptable

| Predicate                            |      verified |   legacy |                 ratio |
| ------------------------------------ | ------------: | -------: | --------------------: |
| `app.is_control_plane()`             |      0.260 ms |        — | role check, unchanged |
| `app.verified_principal()`           |      2.543 ms |      n/a |                     — |
| `app.current_tenant_id()`            |      2.592 ms | 0.220 ms |               **12×** |
| `app.current_organization_node_id()` |      2.620 ms |        — |                     — |
| `app.legal_entity_scope_ok()`        |      4.804 ms |        — |     ≈ two resolutions |
| `app.organization_node_scope_ok()`   | **28.201 ms** | 0.744 ms |               **38×** |

n = 30 each, inside one already-established session, so no mint or install cost is included.

### The arithmetic, which is exact

The tenant has **10 closure rows**. `app.organization_node_scope_ok` resolves the principal once for
its own `app.current_organization_node_id()`, and then the closure's own read policy evaluates
`tenant_id = app.current_tenant_id()` **once per closure row**:

```
2.6 ms  +  10 × 2.6 ms  =  28.6 ms          measured: 28.2 ms
```

That is the whole defect. `app.verified_principal()` costs ~2.5 ms because it re-reads the binding
and revalidates the user and membership — correct, and the property SR-2 exists for — and the scope
predicates call it once per row of every table they touch, including the closure.

### What it does to an ordinary query

`SELECT id FROM users`, whole transaction, verified against legacy:

| users in tenant |                  verified (median) | legacy (median) |
| --------------: | ---------------------------------: | --------------: |
|               2 |                              43 ms |         1.45 ms |
|              10 |                             463 ms |         2.47 ms |
|              50 |                1,047 ms – 8,587 ms |         13.3 ms |
|             200 | 3,556 ms median, **55,348 ms p95** |         24.3 ms |

`EXPLAIN (ANALYZE, BUFFERS)` on the 50-user case: `Seq Scan on public.users … actual time
16.004..1005.367 rows=50`, `Buffers: shared hit=23028` — about 460 buffer hits per returned row,
for a table of fifty.

The 50-row spread and the 200-row p95 are not measurement noise to be averaged away; the cost is
plan- and statistics-dependent as well as large, which makes it erratic under load.

### A remedy that was tried and does NOT work

The documented PostgreSQL RLS idiom — wrap the accessor in a scalar subquery so the planner hoists
it into an InitPlan evaluated once per statement — was applied experimentally to `users_read` in a
scratch database. **1,047 ms → 987 ms.** It cannot work here: `app.organization_node_scope_ok`
takes a per-row argument, so `(SELECT app.organization_node_scope_ok(organization_node_id))` is a
correlated subquery and is still evaluated per row. The hoist has to happen INSIDE the function, on
the zero-argument accessors in its body, where the closure scan re-resolves the principal ten times.

### Disposition

**SR-2 is NOT ready to emit `SR_2_VERIFIED_ACTOR_BINDING=READY_FOR_FINAL_REREVIEW`.** Performance
was required to be measured; it was measured, and it fails. A second of latency on a fifty-row read
is not a cost line in an ADR.

**The fix is not being made inside PR #9, and this is a deliberate refusal rather than an omission.**
The predicates involved — `app.organization_node_scope_ok`, `app.legal_entity_scope_ok`,
`app.verified_principal` — are the shared authorization primitives every policy in the schema
resolves through. Any memoisation of the principal trades directly against the property SR-2 proved
and gates on: a principal revoked mid-transaction loses authority inside that transaction, visible
at READ COMMITTED. Statement-scoped hoisting preserves that granularity and transaction-scoped
caching destroys it, and the difference is exactly the kind of thing that has to be established by
its own gate and its own adversarial review rather than asserted at the end of a PR.

The direction is specific enough to hand over intact:

1. Hoist the zero-argument accessors **inside** `app.organization_node_scope_ok` and
   `app.legal_entity_scope_ok`, so the closure predicate resolves the principal once per call rather
   than once per closure row. That alone should remove the factor of ten measured above, and it is
   statement-scoped, so revocation visibility is untouched.
2. Reduce `app.verified_principal()`'s own 2.5 ms. Its cost is the binding lookup plus a
   users ⋈ memberships revalidation whose own policies re-enter the bootstrap graph.
3. Re-run this measurement, the full database gate, and the same-transaction revocation tests
   together. The third is not optional: it is what the change risks.

Everything else in this document stands. The security properties are established and measured; the
resolution cost of establishing them is not yet fit to ship.

## 11. Exact-head CI, green

Run [31219733765](https://github.com/jordanjb1267-crypto/FreightOS/actions/runs/31219733765), job
`verify`, head `b8010d7b383d680a24cd6e0cee10b1cd46dc29c0`. Conclusion **success**, 21:21:53Z →
21:23:20Z. PostgreSQL 16-alpine service container (16.14) against 16.13 locally.

Every number below is the runner's own `Tests` summary line, copied from the CI log rather than
counted from anything.

```
pnpm format:check      pass
pnpm lint              pass
pnpm typecheck         pass
sha256sum -c SHA256SUMS.txt          pass
HANDOFF_VALIDATION=PASS  SEQUENCING_DOCTRINE=PASS  HORIZON_1_STOP_RULE=PASS
DEFERRED_PRODUCTS_DISABLED=PASS  SAFETY_BOUNDARY=PASS
PROVENANCE=PASS
SCOPE_VALIDATION=PASS  HORIZON_1_ONLY=PASS  DEFERRED_MODULES_DISABLED=PASS
AUTONOMY_CEILING=PASS  SAFETY_BOUNDARY=PASS  BILLING_DISABLED=PASS  PACKAGE_LAYERING=PASS

pnpm test           Test Files  15 passed (15)      Tests  286 passed (286)
pnpm test:coverage  Test Files  15 passed (15)      Tests  286 passed (286)
                    All files   100 % stmts | 98.42 % branch | 100 % funcs | 100 % lines
pnpm test:integration
                    Test Files  14 passed (14)      Tests  519 passed (519)
                    Duration    32.76s (tests 90.27s)
```

Zero failed, zero skipped, in both projects, on the exact head. The previous CI state recorded in
§4 — 76 integration failures across five suites — is superseded; those were the enterprise-node
contradiction, and §9 records how each of the 26 that remained at the recorded baseline was
resolved.

### Gate ledger

| Gate                             | State                                                    |
| -------------------------------- | -------------------------------------------------------- |
| integration green, 0 skips       | **met**                                                  |
| follow-on requirements complete  | **met** — `SR2_FOLLOW_ON_REQUIREMENTS.md`, four sections |
| raw-GUC allowlist green          | **met** — `SR2_RAW_GUC_ALLOWLIST.md`, forbidden uses 0   |
| static fences final              | **met** — 14, up from 13                                 |
| ADR final                        | **met** — `adr/0027-verified-actor-binding.md`           |
| full local gate green            | **met** — `pnpm verify` end to end                       |
| final database gate green        | **met** — 100/100                                        |
| exact-head CI green              | **met** — this section                                   |
| **performance measured**         | **met, and it FAILS** — §10                              |
| independent adversarial rereview | **not done**                                             |

`SR_2_VERIFIED_ACTOR_BINDING=READY_FOR_FINAL_REREVIEW` is **not** emitted. Two of the ten are
outstanding and one of them is a measured failure, not a missing artefact.

## 12. P-01 — the performance failure, and its remediation

### 12.1 The measurement that failed

Recorded in §10 and unchanged. Session establishment was fine at ~5 ms per verified transaction.
Resolution was not.

| Predicate                          |      verified |   legacy |   ratio |
| ---------------------------------- | ------------: | -------: | ------: |
| `app.verified_principal()`         |      2.543 ms |      n/a |       — |
| `app.current_tenant_id()`          |      2.592 ms | 0.220 ms |     12× |
| `app.organization_node_scope_ok()` | **28.201 ms** | 0.744 ms | **38×** |

### 12.2 The call shape, derived and then confirmed

Ten closure rows in the fixture tenant. `app.organization_node_scope_ok` resolves the principal once
for its own `app.current_organization_node_id()`, and the closure's read policy then evaluates
`tenant_id = app.current_tenant_id()` **once per closure row**:

```
2.6 ms  +  10 × 2.6 ms  =  28.6 ms          measured: 28.2 ms
```

The prediction matching the measurement to 1.4% is what made this a call-shape fault rather than
generic overhead.

| users in tenant |                    verified median | legacy median |
| --------------: | ---------------------------------: | ------------: |
|               2 |                              43 ms |       1.45 ms |
|              10 |                             463 ms |       2.47 ms |
|              50 |                   1,047 – 8,587 ms |       13.3 ms |
|             200 | 3,556 ms median, **55,348 ms p95** |       24.3 ms |

`EXPLAIN (ANALYZE, BUFFERS)` at fifty users: `Buffers: shared hit=23028` to return fifty rows.

### 12.3 The rejected experiment, preserved

The documented PostgreSQL RLS idiom — wrap the accessor in a scalar subquery so the planner hoists
it into an InitPlan — applied to `users_read` in a scratch database: **1,047 ms → 987 ms**.

It cannot work, and the reason is structural. `app.organization_node_scope_ok` takes a ROW argument,
so `(SELECT app.organization_node_scope_ok(organization_node_id))` is correlated and still runs per
row. Hoisting INSIDE the function fails too: PostgreSQL's `inline_function()` refuses any SQL
function whose parse tree has `hasSubLinks`, so the body gets its own plan per call and its
InitPlans are per-call InitPlans. Both halves are visible in one EXPLAIN — `app.is_control_plane()`
has no sublink and inlines to `pg_has_role(...)`, while `app.organization_node_scope_ok` appears as a
function call.

**Variant A**, hoisting inside the three predicates: **1,047 ms → 525 ms**, still linear in rows.
Rejected on the acceptance standard's own terms.

### 12.4 The remediation — migration 0020

The sublink moves out of the row-argument predicate and into the policy, where the planner can see
it is uncorrelated:

```
app.organization_node_scope_ok(x) → app.is_control_plane() OR x IN (SELECT app.verified_scope_node_ids())
app.service_account_scope_ok(x)   → x IN (SELECT app.verified_scope_service_account_ids())
app.legal_entity_scope_ok(x)      → app.is_control_plane() OR x = (SELECT app.current_legal_entity_id())
app.current_tenant_id()           → (SELECT app.current_tenant_id())
```

Thirty-eight of fifty-eight policies change. Every one is a mechanical transformation of a
`pg_get_expr()` capture from a database migrated 1..19 — `sr2-baseline/pre-0020-policies.txt` — and
the down migration restores that capture. Verified: up, down, re-capture, diff — **byte-identical,
all fifty-eight**.

All three new functions **take no argument**. A helper accepting an already-resolved context as a
parameter would make a caller-supplied value an authority primitive, which is the mistake SR-2
exists to remove. They resolve their own context from the binding, are invoker-rights so every
policy on every table they read still applies, and return only ids the caller can already enumerate.

### 12.5 A second instance, found by the gate

`app.verified_principal()` reads `users` and `memberships` as `freightos_binding_owner` under
0019's role-disjoint bootstrap policies — and those called `app.verified_binding_node_scope_ok()`
**once per row of the table being scanned**. Measured: one `app.current_tenant_id()` cost **3,166
shared buffers** once `users` held 152 rows and the planner chose a sequential scan, because each of
those rows re-entered `session_binding` and the closure.

`app.verified_binding_scope_node_ids()` is the Layer B answer: bootstrap-only, deliberately
non-revalidating like the helper it replaces, owned by the binding owner, and already covered by the
production fence forbidding `verified_binding_*` in application code.

The gate found this, not the benchmark. That is what the gate is for.

### 12.6 Final benchmark, on the shipped migration

Medians and p95 over nine runs per size; whole verified transaction including mint and install.

| users | verified median | verified p95 | legacy median | max buffers | plan exec |
| ----: | --------------: | -----------: | ------------: | ----------: | --------: |
|     2 |         13.1 ms |      46.6 ms |        1.3 ms |         134 |   8.15 ms |
|    10 |         12.8 ms |      15.5 ms |        1.5 ms |          90 |   6.69 ms |
|    50 |         12.1 ms |      15.4 ms |        1.9 ms |          87 |   6.47 ms |
|   200 |     **11.4 ms** |  **17.9 ms** |        1.7 ms |         130 |   7.00 ms |

Closure widened from 10 to 130 rows: buffers **130 → 132**, exec **7.25 → 7.74 ms**.

`EXPLAIN` at every size shows `InitPlan 1 (returns $0)` at `loops=1` and `hashed SubPlan` at
`loops=1`. The ~10 ms that remains over legacy is the **fixed** security cost of about four
principal resolutions per statement, and it does not grow with rows or with closure size.

Against the acceptance standard: no per-row principal revalidation, no per-closure-row
revalidation, multiplicative blow-up eliminated, and the 200-row local read is 11.4 ms median
against the 100 ms guard — from 3,556 ms median and 55,348 ms p95.

### 12.7 Revocation after the optimization

Statement scope is the only granularity that is safe here, and it is the granularity 0019 §5 already
documents. Gate V's fourth case keeps the proof beside the optimization: with Alice's session open
and one statement already served, a control-plane connection revokes her membership and commits;
the **next statement in the same transaction** returns zero rows and
`app.current_tenant_id()` returns NULL. Gate K's full revocation matrix — membership revoked,
user revoked, effective window closed, node moved, and the positive control that reverses each —
is unchanged and green.

### 12.8 What the gate now asserts

Four new cases, database gate **100 → 104**:

| Case                                                                       | Property                                                                                                                    |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| resolves the principal outside the per-row filter                          | no authoritative accessor or scope predicate survives in a `Filter`, and an InitPlan exists so the resolution still happens |
| does not grow the resolver work when the answer grows                      | 150 extra rows must not multiply buffers                                                                                    |
| does not grow the resolver work when the closure grows                     | 30 extra nodes must not multiply buffers                                                                                    |
| still loses authority on the next statement when the membership is revoked | statement-local, not transaction-local                                                                                      |

Migration 0020 §4 additionally asserts from `pg_policy`, not from its own text: no policy may call a
per-row scope predicate; none may resolve an accessor outside a subquery; the scope sets must be
zero-argument invoker-rights STABLE set functions; the bootstrap policy set must still be four.

---

## 13. C-01 — the context capability matrix, audited and enforced

### 13.1 The false positive, and why it survived four migrations

`identity-rls > the capability matrix agrees with the database > gives a facility_operator session
no identity write` claimed ADR-0019's matrix cell _Identity and organization ·
`software_only`/`facility_operator` → `R (own)`_. It passed.

It passed because the context it built named the **terminal** node and the row it wrote named the
**legal-entity node above it**. Ordinary node scope produced the denial. The operating context was
never consulted.

### 13.2 The real reproduction

A real verified `software_only`/`facility_operator` principal, writing `service_accounts` **inside
its own node scope**, with `app.organization_node_scope_ok` and `app.legal_entity_scope_ok` both
asserted true first:

```
INSERTED 6b3fa82f-3620-4b05-819b-dd323468e596
```

`service_accounts_insert` was tenant AND legal-entity scope AND node scope, with no
legal-authority-class or operating-context term. **Zero of the fifteen identity tables carried one**,
and nothing else in the schema did either.

### 13.3 The generalised audit — the whole matrix, not one cell

ADR-0019's matrix has twelve resource-group rows. Three have tables in this schema.

| Resource group                                                                                                                                                                | ADR requirement                                                                                | Current enforcement                                                                                                                    | Positive control                    | Negative control                                                      | Gap                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Identity and organization** — write                                                                                                                                         | `software_only`/`system` only                                                                  | none — no policy carried a context term                                                                                                | gate W: system writes               | gate W: carrier, facility, shipper, autonomous, brokerage all refused | **CLOSED by 0021**                                                                                                                      |
| **Identity and organization** — read                                                                                                                                          | system, shipper_owned, facility_operator, carrier R; autonomous_mobility and brokerage nothing | none                                                                                                                                   | gate W: four contexts keep the read | gate W: autonomous_mobility and brokerage read zero                   | **CLOSED by 0021**                                                                                                                      |
| **Audit**                                                                                                                                                                     | R (own)                                                                                        | `freightos_app` holds SELECT and NOT INSERT/UPDATE; writes go through the trusted recorder; `reject_mutation` blocks UPDATE and DELETE | ledger tests                        | append-only tests                                                     | none — compliant                                                                                                                        |
| **Kill switches**                                                                                                                                                             | system R/W, carrier tenant-scope W, others R                                                   | `freightos_app` holds SELECT and neither INSERT nor UPDATE — **stricter than the matrix**                                              | kill-switch read tests              | `is not writable by a tenant session`                                 | none — the Phase 3 deferral Phase 0 carry-forward item 1 records                                                                        |
| Parties and locations, carrier and fleet, cost profiles, freight core, facility primitives, custody events, load opportunities, assignments and dispatch, autonomous mobility | various                                                                                        | **no tables exist yet**                                                                                                                | —                                   | —                                                                     | belongs to the migrations that create them; ADR-0019 already records it as "context-conditional RLS predicates, PR 2 onward, per table" |

`outbox_events` is runtime-writable and is deliberately outside this audit: it is event
infrastructure, not one of the matrix's resource groups.

### 13.4 The missing control, and where it now lives — migration 0021

```sql
app.identity_write_context_ok()  -- software_only/system, or the control plane
app.identity_read_context_ok()   -- + shipper_owned, facility_operator, carrier_agent/carrier
```

Both read `app.current_legal_authority_class()` and `app.current_operating_context()` — which 0019
§6 made binding-derived, fully revalidated and fail-closed for `freightos_app`. **Not the legacy
GUCs.** Both take no argument, so every policy calls them as `(SELECT ...)` and 0020's statement-
scoped property is preserved; §3(d) re-asserts it.

Thirty-nine identity policies gain the matching term. The bootstrap policies deliberately do not:
they run as `freightos_binding_owner` and resolve the principal, so a context term there would route
the resolver back through the accessors that depend on it. §3(b) asserts their absence rather than
leaving it to reviewer memory. `organization_node_closure` is excluded as derived structure that
feeds the scope machinery, and `permissions` as the global catalog that is deliberately not tenant
data — both stated in the migration.

### 13.5 Positive and negative controls, and the denial reason

Gate W, seven cases, every one writing **strictly in scope** so that node scope, legal-entity scope
and tenant isolation all permit the row and only the capability term can refuse it:

- `software_only`/`system` writes — the positive control.
- `carrier_agent`/`carrier`, `software_only`/`facility_operator`, `software_only`/`shipper_owned`
  are refused, **on `row-level security`**, which is the capability term and nothing else.
- `software_only`/`autonomous_mobility` and `brokerage`/`brokerage` are refused twice over: with
  the read denied, `assert_governing_legal_entity` cannot resolve the entity it can no longer see
  and speaks first. Over-determined is still closed, and the case asserts the refusal rather than
  pretending to know which gate produced it.
- Every context the matrix grants READ keeps it, and the two it does not read zero rows. Without
  this the denials above would be indistinguishable from a predicate that refuses everybody — the
  R-01 failure, which passed every negative test that existed at the time.
- A forged `app.operating_context`, a forged `app.legal_authority_class`, and forged actor, node,
  entity and tenant claims layered on a live binding move nothing; the accessor still answers the
  binding.
- A service principal under `facility_operator` is refused the same write, and
  `app.current_user_id()` is still NULL for it.

Three existing cases moved from `carrier_agent`/`carrier` to `software_only`/`system`, because after
0021 a carrier session is refused every identity write and that would have masked the legal-entity
scope those cases exist to prove. That is the same denial-reason discipline R-01 and the Category D
migration already recorded.

### 13.6 Scope decision

ADR-0019 is Accepted and is not superseded by any later ADR or by the handoff, so this was treated
as an SR-2 identity security blocker and implemented here rather than deferred.
`CONTEXT_CAPABILITY_MATRIX_RLS` is therefore **CLOSED for every resource group that has tables**,
and the remaining nine rows stay where ADR-0019 already put them: with the migrations that will
create those tables.
