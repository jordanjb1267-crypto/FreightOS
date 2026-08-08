# SR-2 — raw identity-GUC allowlist

Every place in the repository that writes an `app.*` identity GUC directly, with the exact file and
line, and why it is allowed to.

**The rule this enforces.** A raw GUC may be an ATTACK layered on top of a session that already
holds a legitimate verified identity, and may never be the way a session obtains authority in the
first place. Legitimate authority derives from a real principal, a real membership, a real
role or permission, and a verified binding.

**Forbidden uses found: 0.**

A "forbidden use" is a raw GUC write that establishes actor, tenant, node, legal or operating
authority for a `freightos_app` session — that is, a write the database would read as identity.
After migration 0020 there is no such write anywhere, and there cannot be: the seven authoritative
accessors take the verified branch for `session_user = 'freightos_app'` and never consult a GUC.
`scripts/test/sr2-production-boundaries.test.ts` fences both halves of that — the production writer
set, and the test files permitted to contain a raw write at all.

**Method.** `set_config('app.…')` in either the literal or the parameterised spelling, plus
`SET LOCAL app.…`, across `packages/` and `scripts/`, excluding `node_modules`. Comments and prose
are excluded — the enumeration below is code. Three prose matches were checked and discarded:
`packages/database/migrations/0007_organization_hierarchy.up.sql:976`,
`packages/database/test/integration/authorization-boundary.test.ts:22` and the F-05 block comment in
`identity-rls.test.ts`, each quoting the escalation it describes.

Line numbers were recomputed against the current head after migrations 0021 and 0022 moved the test
bodies; the fence in `sr2-production-boundaries.test.ts` fixes the FILE set, which is what cannot
drift.

---

## 1. Production code — 6 sites, 1 file

| File                               | Lines                  | Disposition                                                         |
| ---------------------------------- | ---------------------- | ------------------------------------------------------------------- |
| `packages/database/src/session.ts` | 32, 33, 34, 35, 36, 37 | **PERMITTED — legacy path, non-authoritative for the runtime role** |

The six writes inside `applyLegalContext`: tenant, actor, legal authority class, operating context,
legal entity, organization node. Retained for the bootstrap, migration and control-plane routes,
which run as roles the 0019 accessors deliberately still serve from the GUC branch. For
`freightos_app` none of these GUCs is read at all, so nothing this module writes is authoritative
for a runtime session — which is the property that closes SEC-01.

Fenced by `sr2-production-boundaries.test.ts` → _writes the legacy identity GUCs from exactly one
module, and not as authentication_. That check names this file as the only permitted production
writer and covers all six GUC names, so a seventh accessor gaining a GUC writer elsewhere fails.

## 2. Migrations — 1 site

| File                                                                       | Line | Disposition                                                 |
| -------------------------------------------------------------------------- | ---- | ----------------------------------------------------------- |
| `packages/database/migrations/0017_authorization_mutation_boundary.up.sql` | 223  | **PERMITTED — database-internal, inside a trusted definer** |

`admin.set_boundary_actor(p_actor)`, called by the authorization-mutation boundary to record the
actor it has already authorised. It is not reachable by `freightos_app` and it does not decide
authority — it publishes a decision already made.

## 3. Test code — 4 files

Fenced by `sr2-production-boundaries.test.ts` → _keeps raw identity-GUC writes in test code to the
reviewed allowlist_. The check fixes the SET of files, so a new call site cannot appear without the
review that classifies it.

### 3a. The adversarial primitive

| File                                                | Lines    | Disposition                                             |
| --------------------------------------------------- | -------- | ------------------------------------------------------- |
| `packages/database/test/integration/sr2-harness.ts` | 134, 274 | **PERMITTED — attack input, and privileged-role setup** |

Line 134 is `forgeLegacyClaims`, used only by `sr2-binding-runtime.test.ts` and only on a connection
that already holds an installed binding. Line 274 is inside `commitIdentityChange`, which runs over
`asRole` — a migrator connection deliberately becoming a NOLOGIN owner role, which is not
`freightos_app` and for which the GUC branch is the intended path.

### 3b. Forged claims over the runtime role, each asserting the claim confers nothing

| File                                                               | Lines                                                                                     | Disposition                                                 |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `packages/database/test/integration/authority-remediation.test.ts` | 138–141, 152–155, 191–194, 205–208, 243–246, 447–450, 468–471, 496, 533, 592–595, 709–713 | **PERMITTED — every one is the attack, never the identity** |

The forged-claim matrix. Each site builds a claimed context on `freightos_app` and the assertion is
that it produces no authority — a role check, a refusal, or a NULL. None of these tests passes
BECAUSE of the GUC; they pass because the GUC is not read.

Recorded limitation, stated rather than left implicit: these sites layer a claim over a session with
no verified identity underneath, so each denial is a denial from an unbound session. The layered-on-
live-identity form of the same property is `sr2-binding-runtime.test.ts`, which forges the identical
claims over installed bindings and asserts the binding wins. The two are complementary and the
second is the load-bearing one.

### 3c. Control-plane admission claimed by a session

| File                                                       | Line | Disposition                                            |
| ---------------------------------------------------------- | ---- | ------------------------------------------------------ |
| `packages/database/test/integration/control-plane.test.ts` | 259  | **PERMITTED — attack; there is no legitimate reading** |
| `packages/database/test/integration/rls.test.ts`           | 184  | **PERMITTED — attack; there is no legitimate reading** |

`SELECT set_config('app.is_control_plane', 'true', true)` followed by an assertion that
`app.is_control_plane()` is still false. Control-plane admission is membership of
`freightos_control_plane`, decided when the connection authenticates, so a session cannot confer it
on itself and this write can only ever be the attack.

### 3d. Claims layered on live verified sessions, with in-scope positive peers

| File                                                            | Lines                              | Disposition                                                             |
| --------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| `packages/database/test/integration/identity-rls.test.ts`       | 402, 540, 541, 995, 996, 997, 1000 | **PERMITTED — attack over a real binding, or privileged setup**         |
| `packages/database/test/integration/identity-lifecycle.test.ts` | 466, 477                           | **PERMITTED — attack over a real binding, and over an unbound session** |

- `identity-rls.test.ts:402` is an actor name on a **`postgres`** connection, so that the F-01
  self-elevation guard is satisfied and the foreign key is what has to hold. Not a runtime session.
- `identity-rls.test.ts:540–541` claim a foreign tenant and a foreign node on top of the terminal
  member's live binding, and assert the resolved node and tenant are unchanged.
- `identity-rls.test.ts:995–1000` claim system context, `software_only`, an ancestor node and a
  sibling branch's legal entity on top of the same live binding. The assertion includes
  `own_node_ok = true` in the same statement, so the three falses are refusals rather than silence.
- `identity-lifecycle.test.ts:466` claims a different user's actor id over the administrator's
  binding and asserts `app.current_user_id()` returns the administrator.
- `identity-lifecycle.test.ts:477` claims three actor strings over an unbound session and asserts
  every one resolves to NULL.

### 3e. Forged claims through the harness, not open-coded

`sr2-binding-runtime.test.ts` layers forged operating-context, legal-authority, actor, node, entity
and tenant claims on live bindings throughout gates G, H, O and W, and appears nowhere above. It
reaches them through `forgeLegacyClaims` in `sr2-harness.ts`, which is already on the list at 3a.
That is the pattern a new adversarial case should follow: the attack primitive is reviewed once.

## 4. What is deliberately absent

`sr2-temp-shadow.test.ts` is the F-01/F-02 reproducer and contains no raw GUC write at all. It is
worth naming here because it is adversarial and new: the attack it mounts is DDL rather than a
claim, and it reaches its verified sessions through `controlPlaneIssuer` and `installBinding` —
the legitimate mint-and-install path — so the identity underneath every one of its assertions is
real. An attack that had to forge a claim to set itself up would be proving something weaker.

`identity-harness.ts` and `organization-hierarchy.test.ts` both establish privileged legal contexts
— provisioning over the migrator, and control-plane fixture writes over `postgres` — and neither
appears above. They reach the same GUCs through `withLegalContext` in
`packages/database/src/session.ts`, the one production module the fence already names. Routing the
privileged paths through the reviewed module rather than open-coding `set_config` is what keeps this
allowlist as short as it is, and is the pattern any new privileged fixture should follow.
