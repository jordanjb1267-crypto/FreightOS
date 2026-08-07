# SR-2 · SEC-01 — verified actor binding: security design

Required by the SR-2 design gate, before migration 0019 exists. Companion to
`SR2_TRUST_BOUNDARY_ANALYSIS.md`, which is the current-state trace this design answers.

Branch `claude/sr-2-verified-actor-binding`, base `37f5b673cba1589b8a754fd36caef05472854052`.

---

## 0. The question this design has to answer

> **What prevents a caller with arbitrary SQL execution as `freightos_app` from assuming another
> valid user's binding?**

**Because the resolver never reads a caller-supplied value.** It keys on
`(pg_backend_pid(), pg_current_xact_id())` — two properties of the execution context that no SQL
statement can set. There is no parameter, no GUC, and no token to present. Possession of another
user's binding identifier is therefore not merely insufficient, it is _irrelevant_ once that
binding has been installed.

The identifier matters exactly once, at install, and installing somebody else's binding requires
all of the following simultaneously:

1. obtaining the identifier inside the sub-second window between mint and the legitimate install;
2. executing on the **exact backend pid and backend start time** the binding was minted for —
   `freightos_app` can read its _own_ `pg_stat_activity` row but sees `backend_start` as NULL for
   every other backend, so it cannot even discover another connection's identity, let alone occupy it;
3. doing so in a transaction that does not already carry a binding.

Satisfying (2) means being on the victim's connection inside the victim's transaction, which _is_
the victim's request. **The binding is not a bearer credential. It is a one-time, backend-targeted,
transaction-consumed handle**, and after installation it confers nothing on anyone who holds a copy.

The design correction that produced this: the first sketch had `app.verified_binding` as a GUC the
resolver read. That is a bearer credential with extra steps — it fails the owner's attacks #11
(copied from logs) and #12 (copied from an error). Removing the GUC entirely, and keying resolution
on unforgeable execution-context properties instead, is what closes it.

---

## 1. Trust anchors available, and the one chosen

`freightos_app` with arbitrary SQL can set any GUC and call anything it holds `EXECUTE` on. What it
provably cannot do, measured on this cluster:

| Primitive                           | Forgeable by `freightos_app`? | Evidence                                                                  |
| ----------------------------------- | ----------------------------- | ------------------------------------------------------------------------- |
| `session_user` / `current_user`     | No                            | `SET ROLE` denied to all eight roles                                      |
| `pg_has_role(...)`                  | No                            | derives from the above; `app.is_control_plane()` rests on it              |
| `pg_backend_pid()`                  | No                            | not a GUC — `SET pg_backend_pid` → _unrecognized configuration parameter_ |
| own `backend_start`                 | No (readable, not settable)   | visible for own row **only outside a definer** — see §1.1                 |
| **other** backends' `backend_start` | Not even readable             | 5 other rows visible, **0** with `backend_start`                          |
| `pg_current_xact_id()`              | No                            | distinct per transaction on the same connection (103469 → 103470)         |
| any `app.*` GUC                     | **Yes**                       | this is SEC-01                                                            |

The design uses the four unforgeable rows and none of the forgeable one.

### 1.1 Correction — `backend_start` is unusable inside a `SECURITY DEFINER`

The first version of this design keyed both the mint target and the install stamp on
`(pg_backend_pid(), backend_start)`, on the assumption that a session can always see its own
`pg_stat_activity` row. **That assumption is false inside a `SECURITY DEFINER`**, and it was
measured rather than reasoned about:

| Call site                                                     | `backend_start` for the caller's own backend |
| ------------------------------------------------------------- | -------------------------------------------- |
| direct `SELECT` as `freightos_app`                            | `2026-08-07 16:22:56.425106+00`              |
| the identical `SELECT` inside a definer owned by another role | **NULL — masked**                            |

`pg_stat_activity` unmasks a row when `GetUserId()` matches the backend's user or holds
`pg_read_all_stats`. Inside a definer `GetUserId()` is the _function owner_, not the session user,
so the caller's own row is masked from the very function that needs it.

Had this shipped, `target_backend_start = v_backend_start` would have compared NULL to a stored
value and refused every install — R-01 exactly: a control that looks present and refuses everybody.
Or, written as `IS NOT DISTINCT FROM`, it would have matched NULL to NULL and checked nothing.

**The corrected design drops `backend_start` entirely** and takes its uniqueness guarantee from the
transaction id instead:

- `pg_current_xact_id()` is globally unique and monotonic, so `installed_xact_id` identifies exactly
  one transaction cluster-wide, forever. A recycled pid in a different transaction carries a
  different xid and cannot resolve. This is _stronger_ than the pid+start pair for the resolve step.
- The mint target is `target_backend_pid` alone. Its residual — a pid recycled inside the 60-second
  expiry window, onto an attacker's connection, while that attacker also holds the identifier — is
  stated in §10 rather than papered over.

`pg_backend_pid()` and `pg_current_xact_id_if_assigned()` both work correctly inside a definer;
only `pg_stat_activity` is masked.

### 1.2 `pg_current_xact_id_if_assigned()`, not `pg_current_xact_id()`

Measured: a read-only transaction reports **NULL**, and a transaction that has written reports its
xid (`103476`). The resolver therefore uses the `_if_assigned` variant so that ordinary read queries
do not force an xid assignment merely to evaluate an RLS predicate — which would burn transaction
ids on every `SELECT` in the system. Install performs an `UPDATE`, so an xid always exists by the
time anything needs to resolve, and a transaction that never installed resolves to NULL and fails
closed.

---

## 2. The ten required proofs

| #   | Property                                     | How                                                                                                                                                                                                                                                        |
| --- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Minted**                                   | Only through `admin.issue_session_binding(...)`, reachable only over a `freightos_admin` control-plane connection. `freightos_app` holds no `USAGE` on `admin` and cannot name the function.                                                               |
| 2   | **Bound to a verified principal**            | Mint re-derives the principal from `users` / `service_accounts` and refuses anything not currently active. The _caller_ of mint is the authentication adapter, which must already hold control-plane credentials — that possession is the trust statement. |
| 3   | **Bound to an authorized organization**      | Mint refuses unless an active, in-effect membership (human) or the account's own node scope (service) justifies the requested tenant and node. A verified Alice plus an arbitrary tenant is refused **at mint**, not at use.                               |
| 4   | **Installed**                                | `app.begin_verified_session(id)` — the only function `freightos_app` may call. It claims the row atomically, stamping `pg_backend_pid()`, that backend's `backend_start`, and `pg_current_xact_id()`.                                                      |
| 5   | **Scoped**                                   | To one backend, one transaction, one principal, one tenant, one node. Not to a session, not to a connection's lifetime.                                                                                                                                    |
| 6   | **Resolved**                                 | `app.verified_principal()` — no parameters — looks up by `(pg_backend_pid(), pg_current_xact_id())` and then **re-reads live authorization state**.                                                                                                        |
| 7   | **Revoked / invalidated**                    | Resolution re-checks user status, revocation, effective window, and membership state on every call. A binding minted while a membership was active resolves to NULL the moment it is suspended. No cache exists to invalidate.                             |
| 8   | **Destroyed**                                | `installed_xact_id` is set once. A second install is refused. When the transaction ends the xid never recurs, so the row is permanently unresolvable.                                                                                                      |
| 9   | **Enumeration-resistant**                    | The table carries **no grant** to `freightos_app` — not `SELECT`, not anything. `begin_verified_session` returns one generic refusal for every failure mode, so it is not an oracle for existence, expiry, consumption, or ownership.                      |
| 10  | **Not reusable across requests/connections** | `installed_xact_id` differs in every transaction and `installed_backend_pid` differs on every connection. A binding installed in transaction A cannot resolve in transaction B on the same connection, nor on any other connection.                        |

---

## 3. The flow, step by step

Each row states executing role, function owner, whether the runtime role can invoke it, and scope.

### Step 1 — authenticate (outside FreightOS)

The future adapter verifies a credential by whatever means its IdP requires. **SR-2 does not
implement this and must not fabricate it.** SR-2's contract is: whatever performs this step must
hold control-plane credentials to assert its result.

### Step 2 — learn the target backend

|                    |                                                                           |
| ------------------ | ------------------------------------------------------------------------- |
| Executing role     | `freightos_app` (the request's own connection)                            |
| Statement          | `SELECT app.backend_identity()` → `(pid, backend_start)`                  |
| Owner / definer    | none — plain `STABLE`, reads only the caller's own `pg_stat_activity` row |
| Runtime may invoke | **yes**, deliberately: it reveals only what the caller already is         |
| Scope              | session                                                                   |
| Trust source       | n/a — this is an address, not a credential                                |

### Step 3 — mint

|                    |                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Executing role     | `freightos_admin` (**LOGIN**, control plane)                                                                                                                               |
| Function           | `admin.issue_session_binding(principal_type, principal_id, tenant_id, organization_node_id, legal_entity_id, class, context, target_backend_pid, purpose, correlation_id)` |
| Owner              | `freightos_admin_owner` (**NOLOGIN**) — `SECURITY DEFINER`, pinned `search_path`                                                                                           |
| Caller             | the authentication adapter                                                                                                                                                 |
| Reads              | `users`, `memberships`, `membership_roles`, `service_accounts`, `organization_node_closure`                                                                                |
| Writes             | `INSERT` into `app.session_binding`                                                                                                                                        |
| Runtime may invoke | **no** — `freightos_app` has no `USAGE` on schema `admin`                                                                                                                  |
| Scope              | one row, `expires_at = now() + 60s`                                                                                                                                        |
| Trust source       | **the control-plane connection**, the same anchor `admin.*` already rests on                                                                                               |

Mint refuses, with a reason, when: the principal does not exist, is not active, is revoked, is
outside its effective window, has no active membership justifying the tenant/node (human), or the
node lies outside the service account's own scope (service).

### Step 4 — install

|                    |                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| Executing role     | `freightos_app`                                                                                               |
| Function           | `app.begin_verified_session(p_binding uuid) RETURNS void`                                                     |
| Owner              | `freightos_binding_owner` (**NOLOGIN**, new) — `SECURITY DEFINER`, pinned `search_path`                       |
| Runtime may invoke | **yes** — this is the one door, and it is not a bypass because it validates properties the caller cannot fake |
| Scope              | **transaction-local by construction**                                                                         |
| Trust source       | `pg_backend_pid()` + `backend_start` + `pg_current_xact_id()`                                                 |

```sql
UPDATE app.session_binding
   SET installed_backend_pid = pg_backend_pid(),
       installed_xact_id     = pg_current_xact_id(),
       installed_at          = now()
 WHERE id = p_binding
   AND installed_xact_id IS NULL                      -- one-time
   AND expires_at > now()                             -- short-lived
   AND target_backend_pid = pg_backend_pid()          -- minted FOR this backend
   AND NOT EXISTS (SELECT 1 FROM app.session_binding b
                    WHERE b.installed_xact_id = pg_current_xact_id());  -- one per transaction
```

Zero rows updated → a single generic exception. Not a different message per cause.

### Step 5 — resolve

|                    |                                                                                |
| ------------------ | ------------------------------------------------------------------------------ |
| Executing role     | whoever is running the query                                                   |
| Function           | `app.verified_principal()` — **no parameters**                                 |
| Owner              | `freightos_binding_owner` — `SECURITY DEFINER`, `STABLE`, pinned `search_path` |
| Reads              | `app.session_binding`, `users`, `memberships`, `service_accounts`              |
| Runtime may invoke | yes — it can only ever return the caller's own verified identity               |
| Scope              | the current transaction on the current backend                                 |

```sql
SELECT ...
  FROM app.session_binding b
 WHERE b.installed_backend_pid   = pg_backend_pid()
   AND b.installed_xact_id       = pg_current_xact_id_if_assigned()
   AND <live authorization state still valid>
```

**No parameter. No GUC. Nothing the caller supplies participates in the lookup.**

### Step 6 — consume

The accessors (§5) read the resolved principal. Business SQL is unchanged.

---

## 4. The 24 attacks on the binding itself

| #   | Attack                                             | Why it fails                                                                                                                                                                                                                    |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Random binding UUID                                | No row; generic refusal. 122 bits of entropy and no oracle to search against.                                                                                                                                                   |
| 2   | Fabricated syntactically valid UUID                | Same. Shape is not existence.                                                                                                                                                                                                   |
| 3   | Binding belonging to another user                  | `target_backend_pid` is not this backend → refused. Even if it were, install is one-time.                                                                                                                                       |
| 4   | Binding belonging to another tenant                | Same mechanism; and the row's tenant is used, never the caller's claim.                                                                                                                                                         |
| 5   | Binding belonging to a service principal           | Installs as _that service_, not as a human — `verified_principal().principal_type = 'service'`, and the human path refuses it. Requires the same impossible backend match anyway.                                               |
| 6   | Expired binding                                    | `expires_at > now()` fails → refused.                                                                                                                                                                                           |
| 7   | Revoked principal                                  | Install may succeed; **resolution** re-checks live state and returns NULL. Fail-closed at use.                                                                                                                                  |
| 8   | Already-consumed binding                           | `installed_xact_id IS NULL` fails → refused.                                                                                                                                                                                    |
| 9   | Reused in a later transaction                      | `installed_xact_id` ≠ the new `pg_current_xact_id()` → resolver finds nothing.                                                                                                                                                  |
| 10  | Reused on a different pooled connection            | `installed_backend_pid` ≠ `pg_backend_pid()` → resolver finds nothing.                                                                                                                                                          |
| 11  | Copied from application logs                       | Post-install it is inert. Pre-install it is useless off the target backend.                                                                                                                                                     |
| 12  | Copied from an error message                       | Same, and refusals carry no identifier.                                                                                                                                                                                         |
| 13  | Discovered by reading the table                    | No grant of any kind to `freightos_app`; RLS `ENABLE`+`FORCE` behind it.                                                                                                                                                        |
| 14  | Discovered by enumerating function results         | One generic refusal for every failure cause — no oracle.                                                                                                                                                                        |
| 15  | Installed with raw `SET`                           | There is nothing to set. The resolver reads no GUC.                                                                                                                                                                             |
| 16  | Installed when a legitimate context already exists | The `NOT EXISTS ... installed_xact_id = pg_current_xact_id()` clause refuses a second install per transaction.                                                                                                                  |
| 17  | Swapped midway through a transaction               | Same clause. The first install wins for the whole transaction.                                                                                                                                                                  |
| 18  | Cleared midway through a transaction               | Nothing to clear. Even so, clearing would only deny the caller its own identity — self-denial, not escalation.                                                                                                                  |
| 19  | Tenant GUC changed after binding                   | Accessors prefer the binding; the GUC is ignored while one is installed.                                                                                                                                                        |
| 20  | Actor GUC changed after binding                    | Same.                                                                                                                                                                                                                           |
| 21  | Direct resolver invocation                         | Permitted and harmless — returns only the caller's own identity.                                                                                                                                                                |
| 22  | Direct mint invocation                             | `freightos_app` has no `USAGE` on `admin` and cannot name the function.                                                                                                                                                         |
| 23  | Direct installer invocation                        | Permitted by design; it validates what the caller cannot fake.                                                                                                                                                                  |
| 24  | Race: resolve vs. membership revocation            | Resolution re-reads membership state inside the consequential statement's snapshot. A revocation committed before the statement is seen. This is a bounded race of one statement, not a cached window — documented, and tested. |

**Honest residual (stated, not hidden).** SQL injected into Alice's own transaction on Alice's own
connection resolves as Alice. That is correct: the database cannot distinguish Alice's intended
statement from an injected one. SR-2's guarantee is that such an attacker cannot become **Bob**.

---

## 5. Accessor semantics

| Accessor                             | Trusts now                 | Trusts after SR-2                                                                                                   |
| ------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `app.current_actor_id()`             | `app.actor_id` GUC         | verified principal → canonical actor string; **NULL** for unbound `freightos_app`; legacy GUC for non-runtime roles |
| `app.current_tenant_id()`            | `app.tenant_id` GUC        | verified principal's tenant, same fallback rule                                                                     |
| `app.current_organization_node_id()` | GUC                        | verified principal's node, same fallback rule                                                                       |
| `app.current_legal_entity_id()`      | GUC                        | verified principal's legal entity, same fallback rule                                                               |
| `app.current_user_id()`              | parses the actor GUC       | verified principal, and **only** when `principal_type = 'human'`                                                    |
| `app.current_human_principal()`      | parses the actor GUC       | verified human principal                                                                                            |
| `app.is_control_plane()`             | `pg_has_role`              | **unchanged** — already role-anchored                                                                               |
| `app.is_verified_platform_actor()`   | `session_user` + allowlist | **unchanged** — already role-anchored                                                                               |

**No-binding behaviour is fail-closed for `freightos_app` and only for `freightos_app`.** The
carve-out is by `session_user`, which the runtime role cannot change. Migrator, control plane and
`postgres` keep legacy semantics so migrations, bootstrap and the `admin.*` boundary do not acquire
a circular dependency on a binding that cannot exist during schema creation.

Redefining these six functions gives all 52 existing RLS policies verified-tenant semantics without
editing one policy. That is the leverage — and also the risk, which is why the migration asserts the
resulting behaviour rather than assuming it.

---

## 6. Role design

**One new role: `freightos_binding_owner`.**

| Question                                        | Answer                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Why not an existing role?                       | `freightos_admin_owner` is the control-plane definer owner and already reads six identity tables; giving it the installer would let a function the _runtime role can call_ run with control-plane reach. `freightos_hierarchy_owner` owns closure maintenance and now `users:SELECT` — piling session binding on it repeats the R-01 mistake of a role whose grants no longer match one story. |
| LOGIN or NOLOGIN?                               | **NOLOGIN.** No session ever connects as it.                                                                                                                                                                                                                                                                                                                                                   |
| Who may `SET ROLE` to it?                       | `freightos_migrator` only, `WITH SET TRUE, INHERIT FALSE`, so `ALTER FUNCTION … OWNER TO` works and nothing inherits it.                                                                                                                                                                                                                                                                       |
| Who receives membership?                        | Nobody else. Deliberately **not** a `freightos_control_plane` member — it needs no cross-tenant reach.                                                                                                                                                                                                                                                                                         |
| Exact privileges                                | `SELECT, INSERT, UPDATE` on `app.session_binding`; `SELECT` on `users`, `memberships`, `membership_roles`, `service_accounts`, `organization_node_closure`. No `DELETE` anywhere.                                                                                                                                                                                                              |
| Participates in RLS?                            | Yes — the table is `ENABLE`+`FORCE` with a single policy admitting only this role.                                                                                                                                                                                                                                                                                                             |
| Why is compromise not general database control? | It cannot log in, cannot be `SET ROLE`d to by any runtime or control-plane role, owns three functions with fixed bodies, and holds read-only access to five tables plus write access to one that contains no business data.                                                                                                                                                                    |

**Minting stays on `freightos_admin`** — an existing LOGIN role with an existing, reviewed trust
story. No new LOGIN role is introduced.

The runtime role remains unable to: write authority tables, write `audit_events`, write
`kill_switches`, bypass RLS, own any table, become hierarchy owner, become migrator, become the
control plane, or mint an arbitrary verified actor.

---

## 7. Table `app.session_binding`

| Property                                          | Decision                                                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner                                             | `freightos_binding_owner`                                                                                                                  |
| RLS / FORCE                                       | `ENABLE` + `FORCE`, one policy: `pg_has_role(current_user, 'freightos_binding_owner', 'USAGE')`                                            |
| Runtime `SELECT` / `INSERT` / `UPDATE` / `DELETE` | **none, none, none, none**                                                                                                                 |
| Contains a secret?                                | **No.** The id is a handle, not a credential; after install it authorises nothing.                                                         |
| Uniqueness                                        | PK `id`; partial unique on `installed_xact_id` where not null — belt and braces on one-per-transaction                                     |
| Foreign keys                                      | `tenant_id`, `user_id`, `service_account_id`, `organization_node_id`, composite `(tenant_id, …)` per ADR-0021                              |
| Indexes                                           | `(installed_backend_pid, installed_xact_id)` for the resolver; `(expires_at)` for cleanup                                                  |
| Expiry                                            | 60 s from mint; enforced at install **and** re-checked at resolve                                                                          |
| Retention / cleanup                               | rows retained for post-incident analysis; a bounded `admin.*` sweep deletes rows expired more than 24 h ago. Not a background job in SR-2. |
| Historical bindings                               | retained; they are inert                                                                                                                   |

---

## 8. What this design does **not** do

Explicitly, against the stop conditions:

- no `SUPERUSER`, no `BYPASSRLS`, no runtime table ownership;
- no broad runtime access to binding storage — the runtime role holds _zero_ privileges on it;
- **no static shared secret** anywhere: no key in a GUC, config, SQL source, fixture, function body,
  or environment field. The design uses no cryptography at all, because database role identity and
  execution-context properties already produce the required property with less to get wrong;
- no trusting arbitrary binding-UUID possession — §0;
- no weakening of any PR #5 control;
- no fake IdP;
- no Phase 1 PR 3 work, no SR-10/SR-11 dependency changes.

---

## 9. Rejected alternatives

| Rejected                                         | Why                                                                                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep trusting `app.actor_id`                     | This is SEC-01.                                                                                                                                    |
| Rename it `verified_actor_id`                    | A caller-settable GUC by another name.                                                                                                             |
| Caller-supplied signed-looking token, unverified | Security theatre; nothing checks the signature.                                                                                                    |
| Opaque UUID as a standalone bearer credential    | The owner's correction. Fails "copied from logs" and "copied from an error". Fixed by keying resolution on execution context instead.              |
| HMAC token with a shared key                     | Introduces key storage, rotation, comparison and leakage surfaces to obtain a property that role identity plus backend/xid already gives for free. |
| Runtime `SELECT` on the binding table            | Turns the table into the enumeration oracle §2.9 exists to prevent.                                                                                |
| Long-lived pooled-session identity               | Would leak identity between requests and defeat revocation. Transaction scope is the point.                                                        |
| Fake production IdP inside SR-2                  | Prohibited, and would encode a fiction as an interface.                                                                                            |

---

## 10. Open items carried into implementation

1. **Blast radius.** Fail-closed for unbound `freightos_app` changes every integration test that
   installs context directly. Tests migrate to a privileged **test-only** helper that models the
   authentication boundary by minting over the control-plane connection — the same path production
   will use — and that helper must not be reachable from production code.
2. **Performance.** `app.current_tenant_id()` gains a lookup. It is `STABLE` with no arguments, so
   PostgreSQL evaluates it once per query rather than once per row; to be measured, not assumed.
3. **Consumption is transactional.** A rolled-back install un-consumes the binding, because
   PostgreSQL has no autonomous transaction — the same constraint ADR-0026 §5 records for denial
   audit. Security still holds (target-bound, 60 s), and both COMMIT and ROLLBACK cases are tested.
4. **Pid recycling.** The mint target is now `target_backend_pid` alone, because `backend_start`
   is unreadable inside a definer (§1.1). The residual: a backend exits, its pid is recycled onto an
   attacker's connection inside the 60-second expiry window, and the attacker separately holds the
   uninstalled identifier. All three must coincide. Mitigated by the short expiry, one-time
   consumption, and the identifier never leaving the server between mint and install — stated here
   rather than hidden, and to be re-examined if the expiry is ever lengthened.
5. **`app.actor_id` disposition.** Becomes non-authoritative compatibility metadata for non-runtime
   roles; no security-sensitive consumer reads it once a binding is installed. A static checker will
   enforce that no security-sensitive function reads the raw GUC.

---

## 11. Correction 2 — the resolver must be split in two, or RLS recurses

Found while capturing rollback truth, before any of 0019 was written.

`users_read` and `memberships_read` are both:

```
(app.is_control_plane() OR tenant_id = app.current_tenant_id())
AND app.organization_node_scope_ok(organization_node_id)
```

The accepted design had **one** resolver: `app.verified_principal()` reads `app.session_binding`
_and_ revalidates against `users`/`memberships`, and `app.current_tenant_id()` calls it.

That is a cycle:

```
app.current_tenant_id()
  → app.verified_principal()
      → SELECT FROM users
          → users_read policy
              → app.current_tenant_id()          ← recursion
```

PostgreSQL would either raise _infinite recursion detected in policy for relation "users"_ or, worse
under some plans, evaluate to something unhelpful. Either way it is a control that does not work,
discovered before it shipped rather than after.

**Corrected inventory: two layers, and the split is load-bearing rather than cosmetic.**

| Function                         | Reads                                                             | Called by                                                                                          | Recursion risk                                                                                            |
| -------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `app.verified_binding_context()` | **`app.session_binding` only**                                    | `current_tenant_id`, `current_organization_node_id`, `current_legal_entity_id`, `current_actor_id` | none — `session_binding`'s policy is `pg_has_role(...)` and calls no accessor                             |
| `app.verified_principal()`       | binding context **+** `users`/`memberships` for live revalidation | `current_user_id`, `current_human_principal`, provenance and authorization consumers               | none — the tables it reads re-enter only `current_tenant_id()`, which now terminates in `session_binding` |

Reading `users` therefore re-enters `app.current_tenant_id()` exactly once, which resolves from
`session_binding` and returns. The cycle is cut at the only place it could have formed.

A useful consequence: because `current_tenant_id()` and `current_organization_node_id()` now return
the _bound_ tenant and node, the revalidation inside `app.verified_principal()` reads `users` and
`memberships` through RLS **already scoped to the verified binding**. The revalidation cannot see
outside the scope it is revalidating.

### 11.1 Pre-existing observation on merged `main` — not an SR-2 blocker

While capturing the baseline, `app.current_human_principal()` was found to carry
`{=X/freightos_hierarchy_owner, freightos_hierarchy_owner=X/...}` — that is, **`PUBLIC` holds
`EXECUTE` and `freightos_app` holds no explicit grant**, despite 0018 containing both
`REVOKE ALL ON FUNCTION app.current_human_principal() FROM PUBLIC` and a `GRANT ... TO
freightos_app`. The ACL is the materialised default, as though neither statement took effect.

**Not exploitable, and not being fixed here:** `has_schema_privilege('public', 'app', 'USAGE')` is
**false**, so no role can name the function through the `PUBLIC` grant. `freightos_app` reaches it
because it holds schema `USAGE` and `PUBLIC` holds `EXECUTE` — the function works, which is why
R-01's positive control passes.

Recorded because it means 0018's intended least-privilege posture on that one function is not the
posture the database actually has, and because SR-2 adds functions in the same style and must not
copy the pattern. SR-2's own grants will be asserted from the catalog rather than assumed from the
statements that were written. Raising it as a separate finding against `main` rather than widening
this PR.
