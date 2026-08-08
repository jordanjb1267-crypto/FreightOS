# SR-2 · SEC-01 — trust-boundary analysis of the current actor/tenant path

Required before implementation by the SR-2 instruction, §"FIRST TASK — TRACE THE REAL
AUTHENTICATION BOUNDARY". Written against merged `main` @ `37f5b673cba1589b8a754fd36caef05472854052`.

This document is the **current state**, not the proposal. It exists so the design that follows can
be checked against what is actually there rather than against what one might assume is there.

---

## 0. The finding in one sentence

There is no authentication boundary. `LegalContext.actorId` is a caller-supplied string that
`applyLegalContext` writes into the `app.actor_id` GUC with no verification of any kind, and every
runtime authorization and provenance decision downstream reads that GUC.

---

## 1. What exists, and what does not

| Layer                          | Present?  | Where                                                                                   |
| ------------------------------ | --------- | --------------------------------------------------------------------------------------- |
| HTTP transport                 | **No**    | no `apps/`, no `services/`, no Fastify/Express                                          |
| Request authentication         | **No**    | nothing verifies a credential anywhere in the repo                                      |
| JWT / session / token handling | **No**    | no `jsonwebtoken`, no `jose`, no key material                                           |
| API middleware                 | **No**    | —                                                                                       |
| Connection acquisition         | Partial   | callers construct their own `pg` `Client`                                               |
| Transaction boundary           | Yes       | `withLegalContext` — `BEGIN` … `COMMIT`/`ROLLBACK`                                      |
| Tenant context installation    | Yes       | `applyLegalContext` → six `set_config(..., true)`                                       |
| Actor context installation     | Yes       | same call, `app.actor_id`                                                               |
| Authorization helpers          | Yes       | `app.user_has_permission`, the three 0010 guards                                        |
| Audit attribution              | Yes       | `app.record_audit_event`, `app.set_created_row_actor`                                   |
| Service-account execution      | Data only | `service_accounts` tables + `app.service_account_has_permission`; **no execution path** |
| Agent execution                | **No**    | not represented at runtime at all                                                       |
| Control-plane execution        | Yes       | `freightos_admin` connection → `admin.*`                                                |
| Database role selection        | Yes       | caller picks the connection role                                                        |

**Consequence for SR-2's shape.** There is no production IdP to integrate and none may be
fabricated. SR-2 must therefore define a _narrow verified-principal interface_ that can only accept
a server-verified authentication result, and make the database refuse to treat anything else as
authoritative. The eventual IdP adapter plugs into that interface; it is not this PR's job.

---

## 2. The actual data flow today

```
  caller (any TypeScript code)
      │
      │  constructs a plain object, entirely of its own choosing:
      │      { tenantId, actorId: "user:<any uuid>", legalAuthorityClass,
      │        operatingContext, legalEntityId?, organizationNodeId? }
      ▼
  assertLegalContext()                       packages/context/src/legal.ts:162
      │  checks SHAPE only:
      │    · tenantId parses as a uuid
      │    · actorId is a non-empty string          ← no verification of WHO
      │    · organizationNodeId parses as a uuid
      │    · class/context pairing is permitted     (ADR-0015 rule 5)
      │    · legalEntityId present unless system scope
      │    · carrier_agent carries carrierId + appointment
      │    · brokerage refused while the gate is unsigned
      │  NOTHING here consults the database. NOTHING checks the actor exists.
      ▼
  applyLegalContext()                        packages/database/src/session.ts:24
      │  BEGIN; then
      │  set_config('app.tenant_id',            $1, true)
      │  set_config('app.actor_id',             $2, true)   ← the caller's string, verbatim
      │  set_config('app.legal_authority_class',$3, true)
      │  set_config('app.operating_context',    $4, true)
      │  set_config('app.legal_entity_id',      $5, true)
      │  set_config('app.organization_node_id', $6, true)
      ▼
  app.current_actor_id()                     0001_platform_foundation.up.sql:103
      │  SELECT nullif(current_setting('app.actor_id', true), '')
      ▼
  app.current_user_id()                      0009_users_and_memberships.up.sql:88
      │  regex-extracts the uuid out of 'user:<uuid>'
      ▼
  ┌─ authorization ─────────────────┬─ provenance ──────────────────────────┐
  │ app.reject_membership_self_…    │ app.record_audit_event      (0018:138) │
  │ app.reject_membership_role_…    │ app.set_created_row_actor   (0001:143) │
  │ app.reject_role_permission_…    │ app.set_updated_by          (0005:129) │
  │ app.current_human_principal()   │ kill-switch engaged_by/released_by     │
  │   → app.engage_kill_switch      │                                        │
  │   → app.release_kill_switch     │                                        │
  └─────────────────────────────────┴────────────────────────────────────────┘
```

### 2.1 Where each value originates, and whether anything verifies it

| Value                       | Origin                     | Verified?                                                                                                                                          |
| --------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.tenant_id`             | caller                     | **No.** Shape only (is-a-uuid). RLS then _scopes to_ it, so a caller that names another tenant is isolated _into_ that tenant rather than refused. |
| `app.actor_id`              | caller                     | **No.** Non-empty string. This is SEC-01.                                                                                                          |
| `app.legal_authority_class` | caller                     | Pairing only (ADR-0015 rule 5). Not tied to any credential.                                                                                        |
| `app.operating_context`     | caller                     | Pairing only.                                                                                                                                      |
| `app.legal_entity_id`       | caller                     | Not shape-checked at all; the DB triggers check _consistency_ with the node, not authority.                                                        |
| `app.organization_node_id`  | caller                     | Shape only. Policies then bound visibility to its subtree — so a caller naming a wider node **widens its own read scope**.                         |
| connection role             | caller (connection string) | This is the **only real trust anchor** in the system today.                                                                                        |

### 2.2 The one thing that is genuinely trusted

`session_user` / role membership. It cannot be set by SQL from within a session:

- `app.is_control_plane()` is `pg_has_role(current_user, 'freightos_control_plane', 'USAGE')` —
  role membership, not a GUC. Verified: `freightos_app` cannot `SET ROLE` to any of the eight roles.
- `app.is_verified_platform_actor()` (0018 §3a) requires `session_user = 'freightos_admin'` **and**
  membership of the `admin.platform_actor` allowlist. `session_user` survives `SECURITY DEFINER`,
  so this one is unforgeable — it is the existing model of what a real binding looks like.
- The `admin.*` boundary rests on holding a `freightos_admin` connection.

**Everything trustworthy in FreightOS today is trustworthy because of a database role.** Nothing is
trustworthy because of a session variable. SR-2 has to extend the first category, not the second.

---

## 3. Every consumer of the actor chain, classified

Enumerated from the migrations, not from test names.

### 3.1 Authorization — MUST migrate

| Site                                                    | Reads                | What it decides                            |
| ------------------------------------------------------- | -------------------- | ------------------------------------------ |
| `app.reject_membership_self_elevation` (0018:1699)      | `current_user_id()`  | is this membership row about me?           |
| `app.reject_membership_role_self_elevation` (0018:1742) | `current_user_id()`  | is this role assignment about me?          |
| `app.reject_role_permission_self_elevation` (0018:1799) | `current_user_id()`  | do I hold the role being widened?          |
| `app.current_human_principal()` (0018:502)              | `current_actor_id()` | is a human behind this session? (Art. V.1) |
| `app.engage_kill_switch` (0018:531)                     | ↑                    | may this session engage a halt             |
| `app.release_kill_switch` (0018:565)                    | ↑                    | may this session release a halt            |

Note the self-elevation guards are _inverted_ consumers: naming somebody else makes the guard
**pass**. So a caller that names a colleague does not gain the colleague's authority — it evades
its own guard. That is a distinct, real weakness of the same root cause.

### 3.2 Provenance / audit — MUST migrate

| Site                                   | Reads                | Writes                                        |
| -------------------------------------- | -------------------- | --------------------------------------------- |
| `app.record_audit_event` (0018:138)    | `current_actor_id()` | `audit_events.actor_id`, `actor_type`, tenant |
| `app.engage_kill_switch` (0018:541)    | verified human       | `kill_switches.engaged_by`                    |
| `app.release_kill_switch` (0018:586)   | verified human       | `kill_switches.released_by`                   |
| `app.set_created_row_actor` (0001:143) | `current_actor_id()` | `created_by` on every table                   |
| `app.set_updated_by` (0005:129)        | `current_actor_id()` | `updated_by` on every table                   |

This is the residual risk the owner named: engage/release correctly require _an_ active human, and
then record whichever active human the caller named.

### 3.3 Already role-anchored — MUST NOT weaken

| Site                                 | Anchor                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `app.is_control_plane()`             | `pg_has_role(...)`                                                                                                             |
| `app.is_verified_platform_actor()`   | `session_user = 'freightos_admin'` + closed allowlist                                                                          |
| `admin.authorization_refusal_reason` | `p_actor` **parameter** over a `freightos_admin` connection, independently checked against `users` + `app.user_has_permission` |

The `admin.*` path is materially stronger than the runtime path: the actor is a parameter checked
against real state, and reaching the function at all requires the control-plane connection. SR-2
must not regress it, and should not need to touch it.

### 3.4 Non-security consumers — may stay

- `packages/identity/src/*` — pure functions over rows passed in; no context reads.
- Test harnesses and migration/bootstrap paths, which run as `postgres` / `freightos_migrator`.

---

## 4. Threats this enables today

| #   | Threat                                                                                                                                                                                                                                                                                                 | Enabled by                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| T1  | **Provenance substitution.** A compromised app session engages a kill switch naming a colleague.                                                                                                                                                                                                       | `app.actor_id` unverified             |
| T2  | **Audit forgery by attribution.** Any `app.record_audit_event` row names whoever the caller says.                                                                                                                                                                                                      | same                                  |
| T3  | **Self-elevation guard evasion.** Name a colleague; the guard concludes "not about me" and permits the write. Mitigated in practice by PR #5 removing runtime DML on authority tables — the guards are now only reachable through `admin.*`, where the actor is a checked parameter. Latent, not live. | same                                  |
| T4  | **Read-scope widening.** Naming a higher `organizationNodeId` widens what the subtree policies expose, with no membership check.                                                                                                                                                                       | `app.organization_node_id` unverified |
| T5  | **Tenant selection.** Naming another tenant scopes the session into it. RLS confines the blast radius to that tenant's data — which is exactly the wrong direction if the caller is not entitled to it.                                                                                                | `app.tenant_id` unverified            |

T3 is worth stating precisely so the SR-2 design is not over-scoped: PR #5 already removed the
runtime role's DML on all five authority tables, so the guards cannot currently be reached from a
tenant session at all. SR-2 closes the root cause; it is not re-closing T3.

---

## 5. What a real fix has to satisfy

Derived from the above, and from the explicit prohibitions in the instruction:

1. **Renaming the GUC is not a fix.** Any value the runtime role can `set_config` is, by
   construction, caller-controlled.
2. **The proof must be something the runtime role cannot produce.** The existing model —
   `session_user` plus a closed allowlist — is the shape to copy: authority from provenance of the
   _connection_, not from the content of a _variable_.
3. **Actor and tenant must be bound together**, established by one act, so that a verified Alice
   cannot be recombined with an arbitrary tenant id.
4. **Freshness at consequential time.** Revocation between establishing context and acting must
   deny. That argues against any cached authorization snapshot.
5. **Transaction-scoped.** `SET LOCAL` semantics already prevent pool leakage; the replacement must
   not regress to session scope.
6. **Legacy paths must keep working** for the migrator, the control plane, and bootstrap — none of
   which have a human principal at all — without those paths becoming a bypass for the runtime role.
7. **Service principals need their own path.** A service account must not be representable as a
   human, and `app.current_user_id()`'s `user:<uuid>` convention currently makes that the only way
   to be anybody.

---

## 6. Design direction this analysis points to

Recorded here as the conclusion of the analysis; the design itself is ADR material.

The only unforgeable things available are (a) database role identity and (b) a secret the runtime
role cannot read. Since the application's request connections must be `freightos_app`, and
`freightos_app` must be able to _install_ context, the installer cannot be protected by role alone
— so the binding must carry a secret the runtime role cannot obtain for anybody but itself.

That points to an **opaque server-issued session binding**:

- a binding row minted on a **privileged** connection by the authentication layer, after it has
  verified the principal, recording principal type, principal id, tenant, organization scope, and a
  short expiry;
- an opaque high-entropy id returned to the request;
- resolution performed **server-side inside a definer** whose owner can read the binding table and
  whose caller cannot;
- the existing accessors (`app.current_actor_id()`, `app.current_tenant_id()`) redefined to prefer
  the binding when one is installed and to **fail closed for `freightos_app` when one is not** —
  which converts all 52 existing RLS policies to verified-tenant semantics without editing one of
  them;
- authorization state (`users`, `memberships`, effective dates, revocation) re-checked at
  resolution time, so revocation is immediate and no cache exists to invalidate.

Holding the binding id _is_ the proof, and an attacker with arbitrary SQL as `freightos_app` cannot
read another request's binding id because the table carries no grant to that role. Presenting your
own binding id yields your own identity, which is the correct outcome rather than a bypass.

**Open question for the design, flagged rather than assumed:** making the runtime role fail closed
without a binding changes the semantics of every existing integration test that installs a context
directly. That is the intended direction — the tests should exercise the production path — but it
is a large blast radius and is called out here before any code is written.
