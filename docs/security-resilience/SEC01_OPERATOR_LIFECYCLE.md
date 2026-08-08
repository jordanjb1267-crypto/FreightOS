# SEC-01 — operator lifecycle and connection pooling

Design A binds a FreightOS principal to a **PostgreSQL login role**. That makes the login the trust
anchor, and it makes the login's lifecycle a security control rather than an administrative
convenience. This document is the operational half of migration 0026: what has to happen when an
operator joins, changes, or leaves, and what a connection pool may and may not do in front of it.

Requirements 12 and 13 of the SR-2 architecture ruling. Everything here is implemented at the
database layer today; the application layer has no operator-facing surface yet, and where that is
true this document says so rather than describing something that does not exist.

---

## 1. The chain, and where each link is enforced

| Link | Enforced by | Fails how |
| --- | --- | --- |
| The operator authenticates to PostgreSQL as their own role | the server, before any SQL runs | connection refused |
| `session_user` is immutable for the life of the connection | PostgreSQL — no statement can change it | n/a |
| The role maps to exactly one FreightOS principal | `authn.operator_binding`, on `role_oid` **and** `role_name` | resolves to nothing → the call raises |
| The mapped user is active | `authn.authenticated_principal()` re-reads `public.users` on every call | resolves to nothing → the call raises |
| The principal holds the required permission | `admin.authorization_refusal_reason` | `denied`, with an audit row |
| Provenance | derived from the same resolved principal | there is no other source |

`SET ROLE` moves `current_user` and leaves `session_user` alone. That is why `session_user` is the
anchor: inside a `SECURITY DEFINER`, `current_user` is already the function owner, so a definer that
trusted `current_user` would be trusting itself.

---

## 2. Joining — provisioning an operator

Provisioning is a **deployment act**, performed by the migrator (`freightos_migrator`) and by
nothing else. `authn.provision_operator`, `authn.provision_service_login` and
`authn.revoke_operator` carry `EXECUTE` for the migrator alone; no administrative entry point, no
runtime role, and not `freightos_admin_owner` can call them. A role that could provision could bind
itself to any human in any tenant, which is the finding this migration exists to close.

```
-- 1. The cluster administrator creates the login. Credentials are issued out of band and never
--    appear in this repository, in a migration, or in a fixture.
CREATE ROLE ops_jane LOGIN;
GRANT CONNECT ON DATABASE freightos TO ops_jane;

-- 2. The login is granted the administrative CAPABILITY, without the ability to become it.
--    INHERIT TRUE so its own statements carry the EXECUTE grants; SET FALSE so it can never
--    `SET ROLE freightos_admin` and shed its own identity.
GRANT freightos_admin TO ops_jane WITH INHERIT TRUE, SET FALSE;

-- 3. The deployment authority binds it to a FreightOS user.
SELECT authn.provision_operator('ops_jane', :tenant_id, :user_id, 'ticket REQ-1234');
```

Step 2 is the shape that makes `freightos_admin` a **capability rather than an identity**. Holding
it grants EXECUTE on the sixteen entry points and nothing more; who the caller *is* comes from
step 3. `SET FALSE` is the load-bearing half — with `SET TRUE`, an operator could become
`freightos_admin` and `session_user` would still be `ops_jane`, but nothing else in the chain would
change, so the property survives either way. It is set to FALSE because there is no reason for an
operator to need it and every reason not to hand out an unnecessary role transition.

`authn.provision_operator` reads the role's OID from the catalog itself; the caller names a role,
not an OID, and cannot supply one. It refuses:

- a role that does not exist;
- a **shared credential** — `freightos_admin`, `freightos_app`, `freightos_control_plane`,
  `freightos_migrator`, `postgres` — as a human binding, unconditionally;
- a user that is not an active user of the named tenant;
- a role already bound to a **different** principal (re-pointing is not an update; revoke first).

Provisioning the same role to the same principal twice is idempotent.

### Service logins

`authn.provision_service_login(role, system_actor_id, reason)` binds a role to a SERVICE identity —
`actor_type = 'system'`. A service principal can never produce human provenance, which is
requirement 7: a shared service credential may not become a person because somebody passed a user
id. 0026 §5 binds `freightos_admin` itself this way, to `system:session-binding-issuer`, and
deliberately leaves that identity **off** `admin.platform_actor` so that minting a session binding
confers no identity-administration authority.

---

## 3. Changing — what requires a re-bind

| Change | Action |
| --- | --- |
| The person's name, contact details, display name | nothing — the binding is on `user_id` |
| The person's memberships, roles, permissions | nothing — authorization is resolved per call |
| The person's tenant | revoke and re-provision; a binding names exactly one tenant |
| The login role is dropped and recreated under the same name | **revoke and re-provision** — see below |
| The person leaves | revoke (§4) |

### Why drop-and-recreate needs a re-bind

`authn.operator_binding` stores **both** `role_oid` and `role_name`, and
`authn.authenticated_principal()` matches on both. Dropping `ops_jane` and creating a new role of
the same name produces a **new OID**, so the old binding no longer matches and the new login
resolves to nothing until it is provisioned again.

That is deliberate and is requirement 6. A binding keyed on the name alone would let a cluster
administrator hand a departed operator's identity to a new person by recreating the role; a binding
keyed on the OID alone would silently survive a rename. Matching both means a change to either is a
change that must be re-authorised. Case J of `sr2-authenticated-principal-matrix.test.ts` is the
permanent regression.

---

## 4. Leaving — revocation

```
SELECT authn.revoke_operator('ops_jane', 'offboarded, ticket REQ-5678');
REVOKE freightos_admin FROM ops_jane;
ALTER ROLE ops_jane NOLOGIN;   -- or DROP ROLE, once nothing references it
```

`authn.revoke_operator` sets `revoked_at`; the row is retained, not deleted, so the record of who
was bound to what and when survives. The partial unique indexes are `WHERE revoked_at IS NULL`, so a
revoked binding does not block a later one.

**Revocation takes effect on the next call, including on connections that are already open.**
`authn.authenticated_principal()` resolves per call and reads the binding each time; it does not
cache, and there is no session-level state to invalidate. An operator holding an open connection
when it is revoked cannot perform another administrative operation. Case I of the matrix asserts
exactly this, on a connection opened before the revocation.

The same holds for the user underneath the binding: suspending or revoking the `users` row makes the
principal resolve to nothing on the next call, without touching the binding at all
(`sr2-principal-resolution-regressions.test.ts`, "the human branch reads the CURRENT user row").

### Order matters on the way out

Revoke the binding **before** dropping the role. `DROP ROLE` fails while the role owns objects or
holds privileges, and a binding row that references a dropped role's OID would resolve to nothing
anyway — but leaving it behind means the registry no longer describes the cluster. Revoking first
keeps the two in agreement.

---

## 5. Connection pooling

This is the constraint Design A places on the application tier, and it is not optional.

> **A pooled connection may be shared only among callers that resolve to the same principal.**

A pool that hands one physical connection to requests from different operators would make
`session_user` a property of the pool rather than of the person, and the whole chain would resolve
to whoever happened to open the socket. That is the defect this migration closes, reintroduced one
layer up.

Three arrangements are sound:

1. **Per-operator pool.** One small pool per authenticated login. Correct, and the simplest to
   reason about. The cost is a connection floor proportional to the number of concurrently active
   operators, which for an administrative surface is a small number.
2. **No pool.** Open a connection per administrative operation and close it. Administrative
   operations are rare and not latency-critical; this is a legitimate choice and is what the
   integration suite does.
3. **Session-level pooling with a reset.** A pooler in *session* mode may reuse a connection for the
   same login role. It must not multiplex different logins onto one backend, and it must issue
   `DISCARD ALL` between leases so no `SET`/`SET LOCAL` state crosses a boundary.

Two are **not**:

- **Transaction-mode or statement-mode pooling across different logins.** PgBouncer in `transaction`
  or `statement` mode multiplexes many clients onto one server connection; `session_user` on that
  backend is whatever the pooler authenticated as, not the caller. Under Design A that is a
  privilege-escalation path, not a performance tuning choice.
- **A single shared administrative connection with the operator's identity supplied per request.**
  That is `p_actor` again, wearing a connection-pool costume.

### What the runtime path does instead

None of this applies to `freightos_app`. The runtime role is a shared pooled connection by design
and obtains its identity from the SR-2 verified session binding — minted by the control plane for a
specific backend PID and installed per transaction. Requirement K: the application's only call into
the administrative surface is `admin.issue_session_binding`, from
`packages/database/src/verified-session.ts`, and 0026 removed its `p_issued_by` argument. There is no
application code that supplies an operator identity, because there is no application surface that
could authenticate one.

---

## 6. What is deliberately not built

- **No credential material anywhere in this repository.** No passwords, no sample real password, no
  reusable secret. Test logins use a development-only value from the environment, and the harness
  says so.
- **No self-service provisioning.** An operator cannot bind themselves; only the deployment
  authority can. A temporary inability to perform an administrative action is preferable to false
  human provenance.
- **No detached signing authority.** Design B — an external signer whose assertions the database
  verifies — was analysed and explicitly not selected at this stage
  (`SEC01_ADMIN_BINDING_ARCHITECTURE.md` §4). Nothing here anticipates it.
- **No authentication provider.** The database authenticates the login; who is behind that login is
  the cluster administrator's provisioning decision, recorded in `authn.operator_binding` with the
  reason string the deployment supplied.
