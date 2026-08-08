# SEC-01 — the administrative trust anchor

`SEC01_ADMIN_BINDING_ARCHITECTURE_BLOCKED`

Owner ruling `SEC01_RUNTIME_ONLY_SCOPE=REJECTED` requires that a holder of the `freightos_admin`
connection must not be able to select a permissioned human through `p_actor`, use that identity for
authorization, mutate consequential state, or record fabricated human provenance.

That property cannot be implemented at this head, and the reason is architectural rather than a
missing check. This document records what was measured, why the existing SR-2 binding cannot carry
the administrative path, and the two smallest designs that would close it. Everything below was
measured on a freshly initialised PostgreSQL 16.13 cluster with zero pre-existing `freightos%`
roles, at `d455929`.

Migration 0026 is **not** proposed here. Writing one before this is decided would produce exactly
the cosmetic fix the ruling forbids: a renamed caller-controlled value.

---

## 1. The exploit, reproduced

Preserved as `packages/database/test/integration/sr2-admin-actor-authenticity.test.ts`. The five
cases marked `it.fails` are exploits that currently succeed; each asserts the property the ruling
requires, so the file breaks the moment the hole closes and forces its own retirement.

Measured, over an ordinary `freightos_admin` connection, naming a real administrator the connection
never authenticated:

| Attempt                                                 | Result                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `admin.move_organization_node` naming a real admin      | `succeeded` — the node moved                                       |
| `admin.grant_role_permission` naming a real admin       | `succeeded` — **a permission was granted to a role**               |
| ledger row for that grant                               | `actor_type=human`, `actor_id=user:<the borrowed administrator>`   |
| `admin.move_organization_node` naming a fabricated uuid | `denied` — and the ledger still recorded `human:user:<fabricated>` |

The authority-grant case is the worst of these: granting a permission to a role is how authority
spreads, so every later authorization decision inherits the lie, and the ledger names a person who
did nothing.

Three earlier attempts at that case were refused for reasons that had nothing to do with identity —
a permission key absent from the catalog, the self-elevation guard, and the one-active-per-pair
constraint. The test now chooses its `(role, permission)` pair so none of those can fire, and
asserts explicitly that the refusal message is not one of them. A denial for an incidental reason
is not a closure.

---

## 2. Inventory — authority-bearing functions reachable by `freightos_admin`

Every one is `SECURITY DEFINER`, owned by `freightos_admin_owner`, with `EXECUTE` granted to
`freightos_admin` and to nobody else. Every one takes `p_actor text` and derives authorization from
it. Every one writes it to `audit_events.actor_id` with `actor_type='human'`.

| Function                                  | Required permission (authorization source) | Audit action                                 | Mutates                       |
| ----------------------------------------- | ------------------------------------------ | -------------------------------------------- | ----------------------------- |
| `admin.assign_membership_role`            | `identity.membership.write`                | `identity.membership_role.assign`            | `membership_roles`            |
| `admin.create_role`                       | `identity.role.write`                      | `identity.role.create`                       | `roles`                       |
| `admin.grant_membership`                  | `identity.membership.write`                | `identity.membership.grant`                  | `memberships`                 |
| `admin.grant_role_permission`             | `identity.role.write`                      | `identity.role_permission.grant`             | `role_permissions`            |
| `admin.grant_service_account_permission`  | `identity.service_account.write`           | `identity.service_account_permission.grant`  | `service_account_permissions` |
| `admin.move_organization_node`            | `identity.organization_node.write`         | `identity.organization_node.move`            | `organization_nodes`          |
| `admin.revoke_membership`                 | `identity.membership.write`                | `identity.membership.revoke`                 | `memberships`                 |
| `admin.revoke_membership_role`            | `identity.membership.write`                | `identity.membership_role.revoke`            | `membership_roles`            |
| `admin.revoke_role_permission`            | `identity.role.write`                      | `identity.role_permission.revoke`            | `role_permissions`            |
| `admin.revoke_service_account_permission` | `identity.service_account.write`           | `identity.service_account_permission.revoke` | `service_account_permissions` |
| `admin.set_membership_status`             | `identity.membership.write`                | `identity.membership.set_status`             | `memberships`                 |
| `admin.export_tenant_audit`               | `governance.audit.read`                    | `audit.export`                               | — (reads)                     |
| `admin.tenant_identity_summary`           | `identity.*.read`                          | `identity.summary`                           | — (reads)                     |
| `admin.provision_tenant`                  | none — control-plane lifecycle             | `tenant.provision`                           | `tenants`                     |
| `admin.set_tenant_status`                 | none — control-plane lifecycle             | `tenant.set_status`                          | `tenants`                     |
| `admin.issue_session_binding`             | none — see §3                              | —                                            | `app.session_binding`         |

The permission column is the key checked against the catalog; the action column is the string
written to the ledger. They are deliberately different vocabularies and were read separately from
each body rather than assumed to match — `identity.organization_node.move`, for instance, is an
action and is **not** a permission in the catalog.

Also reachable and identity-bearing: `app.user_has_permission(p_tenant_id, p_user_id, …)`, which
takes the subject as an argument and is the shared permission oracle every function above consults.

**Call sites.** A sweep of `packages/*/src` and `scripts/` finds exactly one application call site
across the whole boundary: `admin.issue_session_binding`, from
`packages/database/src/verified-session.ts`. The other fifteen have **no production caller yet** —
they are exercised only by the integration suite. Two consequences follow, and both matter to the
decision below: changing their signatures now costs almost nothing in application code, and no
component exists today that could supply an operator identity even if the database demanded one.

---

## 3. Why the existing SR-2 binding cannot be the anchor

The runtime path works because the two capabilities are split across two roles that cannot reach
each other:

- `freightos_admin` may **mint** (`admin.issue_session_binding`) and may not install.
- `freightos_app` may **install** (`app.begin_verified_session`) and may not mint.

That split is what closes F-A path 2: a runtime session cannot name itself, because the value it
would have to forge is issued by a role it cannot become. Measured: neither runtime role can
`SET ROLE` to any definer owner, neither is a member of a role holding `TEMPORARY`, and neither can
become the database owner.

It does not close path 1, for a reason visible in the mint's own body. Its guards are:

```
principal type is 'human' or 'service'
installable window is 1..300 seconds
an active membership justifies this principal, tenant and node
```

Every one of those asks whether the **named principal** is real and in scope. **Not one asks
whether the caller may speak as that principal.** The mint authenticates the subject's existence,
never the caller's right to assert it. So:

- Verifying `p_actor` against a binding would be circular — `freightos_admin` mints the binding.
- There is not even a binding on the administrative connection to verify against:
  `app.begin_verified_session` is `freightos_app`-only, measured.

Nothing else in the database distinguishes one operator from another:

- `session_user` and `current_user` on every administrative connection are `freightos_admin`.
- No table holds human key material, certificates, or credentials.
  `public.service_account_credentials` records credential _metadata_ (`credential_type`,
  `credential_reference`, `credential_hash`, `fingerprint`) for **service accounts only**, and no
  function anywhere verifies possession of anything in it — measured by searching every `app` and
  `admin` body for `credential_hash`, `crypt(`, and `digest(`: zero matches.

**A shared service credential cannot authenticate a human.** Any fix that stays inside the current
trust boundary can only rename `p_actor`. That is why this is blocked rather than pending.

One capability that _is_ already present: **`pgcrypto` is installed**, so in-database signature
verification is available without a new extension. That is what makes Design B implementable on the
database side as soon as a signer exists.

---

## 4. The two smallest viable designs

Both satisfy the ruling's §5 conditions. They differ in where the human credential lives.

### Design A — per-operator PostgreSQL login roles

Each human operator connects as their own login role (`op_<slug>`), authenticated by PostgreSQL
itself (SCRAM or client certificate). `admin.*` derives the actor from `session_user` and either
drops `p_actor` or treats it purely as an assertion that must equal the resolved principal.

|                         |                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Trust boundary**      | PostgreSQL authentication at connect time. `session_user` is set by the server and cannot be changed to another operator's role without an explicit `GRANT`, which `admin.*` asserts absent.                                                                                                                                                     |
| **Roles / credentials** | One `LOGIN NOINHERIT` role per operator, member of `freightos_admin`; a mapping table `admin.operator_role (role_name → user_id, tenant_id, status)` owned by `freightos_admin_owner` and writable only through a control-plane function. Per-operator passwords or certificates.                                                                |
| **Migration impact**    | Additive. New mapping table + its RLS; `admin.*` bodies resolve the actor from `session_user` and reject a `p_actor` that disagrees. Signatures can keep `p_actor` for one release to stay backward compatible, ignored for the decision. Fifteen of sixteen functions have no application caller, so the blast radius is the integration suite. |
| **Revocation**          | `REVOKE freightos_admin FROM op_x` or `ALTER ROLE op_x NOLOGIN`; effective on the next statement for `pg_has_role` checks and on the next connection for authentication. Mapping row carries `revoked_at`, so authority ends even if the role lingers.                                                                                           |
| **Replay protection**   | Not applicable — the anchor is the live connection's authenticated identity, not a token. There is nothing to capture and resend.                                                                                                                                                                                                                |
| **Operational cost**    | Highest cost is connection pooling: a shared pool cannot be reused across operators, so either one pool per operator or a short-lived connection per administrative command. Role provisioning joins the operator lifecycle. No new services, no key management, no new failure modes at runtime.                                                |
| **Residual**            | A stolen operator password is that operator. Same exposure as any per-user credential, and unlike today it is attributable and individually revocable.                                                                                                                                                                                           |

### Design B — detached signing authority, verified in-database

An authenticator outside the database signs a short-lived assertion
`(user_id, tenant_id, node_id, purpose, nonce, expires_at)`. The administrative connection presents
the assertion; `admin.*` verifies the signature with a **public** key held in the database and
resolves the actor from the verified payload.

|                         |                                                                                                                                                                                                                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Trust boundary**      | Possession of the private key, which lives in the authenticator and never in the database or the administrative connection. `freightos_admin` can present an assertion and cannot produce one. Public keys in the database are public by construction, so read access to them grants nothing.             |
| **Roles / credentials** | A signing service with the private key; `admin.signing_key (kid, public_key, algorithm, effective_from, revoked_at)` owned by `freightos_admin_owner`, readable by the definers, writable only by the control plane. `pgcrypto` is already installed.                                                     |
| **Migration impact**    | Additive. New key table, a verification function, and a nonce table for replay. `admin.*` gains an assertion parameter and resolves the actor from it. Same near-zero application blast radius.                                                                                                           |
| **Revocation**          | Per key via `revoked_at` (kills every assertion under that `kid` immediately); per operator by the authenticator refusing to sign; per assertion by expiry. Revocation of a _human_ is not immediate unless the authenticator is consulted, which is the weakness relative to Design A.                   |
| **Replay protection**   | Required and explicit: `expires_at` bounded to a small window, plus a `admin.consumed_assertion (nonce, expires_at)` table with a unique constraint, so a captured assertion is single-use. Without both, a captured assertion is a bearer token — the exact failure the SR-2 binding was built to avoid. |
| **Operational cost**    | A new service to build, deploy, key-manage and rotate. Clock skew becomes a correctness concern. Highest total cost of the two, and the only one that preserves a single pooled administrative connection.                                                                                                |
| **Residual**            | The authenticator becomes the single highest-value target: compromising it forges any human. Design A has no equivalent single point.                                                                                                                                                                     |

### Recommendation

**Design A**, unless pooled administrative connections are a hard requirement. It introduces no new
service, no key rotation, no clock dependency and no replay surface, and it makes revocation a
database operation. Its cost is concentrated in connection management, which is an operational
change rather than a new trust boundary. Design B is the right answer only if a real identity
provider is already committed for other reasons — in which case the database work here becomes its
verification half rather than a bespoke mechanism.

Both are real work and neither is a migration I should write unprompted: Design A changes how
operators connect, and Design B requires a component that does not exist. That decision is the
owner's.

---

## 5. What is NOT proposed, and why

- **Verifying `p_actor` against a binding.** Circular — §3.
- **Deriving the actor from a GUC, request field, or header.** Caller-controlled by definition; the
  SR-2 invariant forbids it.
- **Treating `session_user = freightos_admin` as human identity.** The ruling names this explicitly,
  and it is the defect, not the fix.
- **A test-only signer standing in for an authentication provider.** That is fabricating a provider.
  The harness holding a private key would prove the SQL parses, not that anybody is authenticated.
- **Narrowing `admin.*` grants.** Reachability is not the issue; the boundary is reachable by design.
  Every one of these functions already refuses a caller without the permission, and that check is
  the thing being fed a borrowed identity.

## 5b. Correction — `ALTER DEFAULT PRIVILEGES` DOES work here

An earlier revision of migration 0026 §6c, and the commit message at `61f6297`, recorded the
conclusion **"`ALTER DEFAULT PRIVILEGES` does not work here"** and declined to ship it. That
conclusion was **wrong**, and it is corrected here rather than quietly dropped, because a false
"this control is unavailable" is more expensive than a missing control: it argues future
implementers out of reaching for the right tool.

**What was actually measured.** Both attempts used the per-schema form:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE freightos_admin_owner IN SCHEMA admin
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;   -- succeeds, writes no row, protects nothing
```

That form cannot work, and its failure says nothing about the feature. PostgreSQL's
EXECUTE-to-PUBLIC default for functions is a **global, built-in** default. `IN SCHEMA` creates a
_schema-scoped_ default entry, and a schema-scoped `REVOKE` can only subtract from a schema-scoped
default — of which there is none. `pg_default_acl` gains no row and the built-in global default
still applies.

**The form that works** is global — no `IN SCHEMA` clause:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE freightos_admin_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
```

Measured on the same server (PostgreSQL 16.13): `pg_default_acl` gains a row with
`defaclnamespace = 0` and `defaclacl = {freightos_admin_owner=X/freightos_admin_owner}`, and a
function created afterwards under that role comes out with `proacl {owner=X/owner}`,
`has_function_privilege('public', …, 'EXECUTE') = false`.

**Two further facts, both load-bearing:**

- **Default privileges attach to the role that is CURRENT when the object is created** — not the
  session role, and not a role the creator merely belongs to. The migrator is the session role on
  every migration but never the creator; attaching a default to it would have looked right and done
  nothing.
- **`ALTER DEFAULT PRIVILEGES … FOR ROLE x` requires the privileges OF `x`**, not merely the ability
  to `SET ROLE` to it. The migrator administers every owner role `WITH INHERIT FALSE`, so issuing it
  as the migrator fails with `permission denied to change default privileges`. It must be issued
  under `SET LOCAL ROLE`.

Shipped in 0026 §6c for both definer owners, asserted by §7(k), and regression-tested in three
separate layers by `sr2-privilege-boundary.test.ts`. Removing §6c — or downgrading it to the
per-schema form — fails the migration.

### Related: `DROP OWNED BY` is not a revocation primitive here

The same commit recorded that `DROP OWNED BY` "does NOT remove privileges granted TO a role by
somebody else". That observation was correct but unexplained. Reproduced minimally (three roles, one
schema, one grant), the mechanism is that the statement carries **two** authorization requirements
and only surfaces one:

- To **run at all**, the current user must hold the privileges _of_ the target role. Otherwise:
  `ERROR: permission denied to drop objects`.
- To **actually revoke** a grant the target role holds, the current user must be able to revoke that
  grant — be its grantor, or hold the grantor's privileges. When it cannot, PostgreSQL emits
  `WARNING: no privileges could be revoked for "<object>"` **and the statement still reports
  success**.

Run as the registry owner itself, the first requirement is trivially met and the second fails for
every grant issued by another owner. Only a role holding both sets of privileges _with INHERIT_ — or
a superuser — satisfies both at once; the migrator holds every owner role `WITH INHERIT FALSE`, so
`SET ROLE` gives it one at a time and never both. **Explicit `REVOKE`s issued by each grantor are the
only correct construction**, which is what 0026's down migration does.

## 5c. Operations

The lifecycle and connection-pooling consequences of Design A — provisioning an operator, what
requires a re-bind, revocation taking effect on already-open connections, and the pooling
arrangements that are and are not sound in front of a per-operator login — are in
[`SEC01_OPERATOR_LIFECYCLE.md`](SEC01_OPERATOR_LIFECYCLE.md).

## 6. Status

`SEC01_ADMIN_BINDING_ARCHITECTURE_BLOCKED`. F-A path 1 remains an **open CRITICAL**. SR-2 is not
accepted, no acceptance token is emitted, and PR #9 is not merged.

Dependency posture is unchanged and is **not clean**: 1 critical, 1 high, 3 moderate, all inherited
Vite/Vitest/esbuild, deferred to SR-10/SR-11.
