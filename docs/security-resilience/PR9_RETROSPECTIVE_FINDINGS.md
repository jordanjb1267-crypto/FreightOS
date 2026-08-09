# PR #9 retrospective review — findings register

The targeted retrospective rereview of PR #9 (`79257fb..e34def6`, 53 commits, 49 files) produced
eleven findings across categories A–F. Three were remediated on
`claude/sr-2-pr9-retrospective-remediation`; the rest are recorded here for **separate disposition**
and are deliberately NOT fixed there.

**Why they are not fixed there.** The remediation branch was scoped by owner ruling to the confirmed
blocking defect and the two down-path correctness defects. Everything else stays out on purpose:
B-2 introduces a new database CHECK constraint, which carries data-compatibility and rollback
consequences of its own and must not hitchhike inside a security repair; D-1, D-2, D-3 and E-1 are
test-only or cosmetic and would enlarge a security diff for no security gain; F-13 is pre-existing
in migration 0007 and belongs to neither PR.

**Category A (sr2-security-regression): NO FINDINGS.** No PR #9 behaviour exposes a defect in the
SR-2 authenticated-principal model. Live catalog inspection confirms no reachable function retains
`p_actor`, `p_actor_type` or `p_issued_by`. Nothing in the review recommends restoring
caller-supplied identity.

---

## Remediated — see the remediation branch, not this file

| ID  | Severity | Category                  | Summary                                                                                                                                                                                                                                   |
| --- | -------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-1 | MEDIUM   | `B-pr9-functional-defect` | 0025's layer-3 qualification guard used a hand list that was wrong in both directions; three genuine unqualified authority reads survived on layer 1 alone. Closed by migration 0027.                                                     |
| C-1 | LOW      | `C-down-path-defect`      | 0020's down migration restored one definer without `pg_temp`, falsifying 0019's own assertion at logical version 19. Closed in `0020_verified_actor_binding.down.sql`.                                                                    |
| —   | HIGH     | `C-down-path-defect`      | 0026's down migration restored neither the sixteen `freightos_admin` EXECUTE grants nor the three `app.*` accessors it had rewritten onto schema `authn`. PR #11 / SR-2 code. Closed in `0026_authenticated_operator_principal.down.sql`. |

---

## F-13 — TICKET · archived organization node above live descendants

```
F13_ARCHIVE_ANCESTOR_INVARIANT=OPEN_PRE_EXISTING
```

| Field           | Value                                                         |
| --------------- | ------------------------------------------------------------- |
| **Severity**    | MEDIUM                                                        |
| **Category**    | `B-pr9-functional-defect` (functional, not a security bypass) |
| **Origin**      | Migration `0007_organization_hierarchy.up.sql` — pre-existing |
| **In scope of** | Neither PR #9 nor PR #11                                      |
| **Status**      | Open. Reproduced. Not remediated.                             |

### Affected invariant

> No archived organization node is an ancestor of a live descendant.

Stated in `0007_organization_hierarchy.up.sql:321` and `:367` as the reason the archive guard
exists: _"the descendants kept their authority while the node that governs them no longer claimed to
exist. Reading the tree afterwards says one thing; asking the closure says another."_

The invariant matters because **every scope predicate in the schema resolves through
`organization_node_closure`, which is a structural relation and carries no status at all.** A live
node under an archived ancestor keeps its authority while the tree says its governing node is gone.

### The defect

The guard in `app.organization_node_before_write()` is conditioned on the ARCHIVE TRANSITION alone:

```sql
IF TG_OP = 'UPDATE' AND NEW.status = 'archived' AND OLD.status <> 'archived' THEN
  -- refuse if any live descendant exists
```

That is one of three edges into the forbidden state. The other two are unguarded:

- **INSERT** — create a live node whose parent is already archived.
- **MOVE** — reparent a live node (or subtree) under an already-archived node.

Neither is an archive transition, so neither is checked, and neither re-examines the destination
ancestor's status.

### Reproduction

PostgreSQL 16.13, database at migration 27, control-plane session. Both routes accepted:

```
NOTICE:  archived a childless legal_entity: OK
NOTICE:  ROUTE 2 (INSERT live child under archived parent): ACCEPTED
NOTICE:  ROUTE 1 (MOVE live subtree under archived parent): ACCEPTED
NOTICE:  live descendants under an archived ancestor: 2
```

The closing query is the invariant restated, and it returns 2 where the invariant says 0:

```sql
SELECT count(*)
  FROM organization_node_closure c
  JOIN organization_nodes anc ON anc.tenant_id = c.tenant_id AND anc.id = c.ancestor_id
  JOIN organization_nodes des ON des.tenant_id = c.tenant_id AND des.id = c.descendant_id
 WHERE c.depth > 0 AND anc.status = 'archived' AND des.status <> 'archived';
```

### Current test coverage

Six tests in `organization-hierarchy.test.ts` (`a node cannot be archived above live descendants —
F-13`) plus the `R2-02` suite covering every node type including the enterprise root. **All of them
drive the archive transition.** None inserts under an archived parent and none moves under one, so
the suite is green and the invariant is false. This is the same shape as B-1: a control that cannot
fail on the paths that reach the state it forbids.

### Recommended future remediation

The owner decision on the archive edge was `REFUSE_ARCHIVE_WHILE_ACTIVE_DESCENDANTS_EXIST`, with
_"do not automatically archive an entire subtree"_. Extending that rule to the other two edges is the
consistent reading:

1. **INSERT** — refuse a non-archived node whose parent is archived.
2. **MOVE** — refuse reparenting a subtree containing any live node under an archived destination.
3. State the rule once, over the resulting state rather than over the operation, so a fourth edge
   cannot appear later and be missed the same way. The natural form is a check that runs on every
   INSERT and UPDATE of `organization_nodes` and on every closure mutation, asking the invariant
   query above rather than inspecting `TG_OP`.
4. Decide re-activation explicitly: whether a live node may be created under an archived ancestor
   that is about to be re-activated, and in which order.
5. Assert the exact SQLSTATE and domain message, per the standing test doctrine.

Three permanent tests are the minimum: insert-under-archived refused, move-under-archived refused,
and a positive control proving each is still permitted under a live ancestor.

---

## B-2 — `app.session_binding` has no permitted-legal-pairing CHECK

```
B2_SESSION_BINDING_PAIRING_CHECK=OPEN
```

| Field        | Value                                                           |
| ------------ | --------------------------------------------------------------- |
| **Severity** | LOW — defence-in-depth gap; not confirmed material              |
| **Category** | `B-pr9-functional-defect`                                       |
| **Origin**   | PR #9, migration `0020_verified_actor_binding.up.sql` §2 and §7 |
| **Status**   | Open. Deliberately excluded from the remediation branch.        |

Every other relation storing a `(legal_authority_class, operating_context)` pair carries
`CHECK app.is_permitted_legal_pairing(...)` — `audit_events`, `outbox_events`,
`operating_authorities`. `app.session_binding` does not, and `admin.issue_session_binding` does not
call the predicate. An impermissible pairing mints and installs — including `brokerage`/`brokerage`,
which ADR-0019 declares `DENIED` throughout and states is _"rejected in the database"_.

**Why it is not fixed here.** Adding a CHECK constraint to an existing table has data-compatibility
and rollback consequences independent of this security repair, and the owner ruling is explicit that
it must not hitchhike inside it. It warrants its own change with its own backfill analysis: whether
any existing `session_binding` row would violate the constraint, and what the down migration does
with rows written while it was in force.

---

## D-1 — a tautological assertion in gate T

| Field        | Value                                                                      |
| ------------ | -------------------------------------------------------------------------- |
| **Severity** | LOW                                                                        |
| **Category** | `D-test-only-defect`                                                       |
| **Location** | `packages/database/test/integration/sr2-binding-structure.test.ts`, gate T |

```ts
expect(await closureRoles(client)).toEqual(await closureRoles(client));
```

A self-comparison; it always passes. It should compare against a value captured **before** the down
migration — the sibling line `expect(await accessorState(client)).toEqual(at19)` shows the intended
shape. The property it means to assert (closure-role membership surviving a revert and re-apply) is
still owned by gate U's whole-inventory `zero → N → zero` sweep, so nothing is unprotected; the line
is dead weight that reads as coverage.

---

## D-2 — the "no RLS table without a policy" invariant is scoped to `public`

| Field        | Value                                                                         |
| ------------ | ----------------------------------------------------------------------------- |
| **Severity** | LOW                                                                           |
| **Category** | `D-test-only-defect`                                                          |
| **Location** | `identity-rls.test.ts` and `rls.test.ts`, both filtering `nspname = 'public'` |

`authn.operator_binding` has `relrowsecurity = t`, `relforcerowsecurity = f` and **zero** policies.
Both owning tests filter to schema `public`, so neither sees it and both pass.

**The posture itself is correct and fail-closed** — RLS enabled with no policy denies every
non-owner — so this is a test-scope note, not a defect in the database. Widening the two sweeps to
`public`, `app` and `authn` would make the invariant say what it means. Note that doing so requires
deciding whether "RLS on, zero policies" is a permitted terminal state (it is, here, and
deliberately) or something the sweep should reject.

---

## D-3 — `admin.record`'s operand-order property is unreachable, not proven

| Field        | Value                                                         |
| ------------ | ------------------------------------------------------------- |
| **Severity** | LOW                                                           |
| **Category** | `D-test-only-defect`                                          |
| **Location** | `control-plane.test.ts`, the "caller-supplied key loses" case |
| **Origin**   | Pre-existing at `79257fb`                                     |

The case is named for the property that a caller-supplied `jsonb` key cannot displace the
connection stamp, but it supplies no conflicting key — and no admin entry point exposes a `jsonb`
parameter, so the property is not reachable through any current surface. The stamp itself is
verified by inspection of the live body (`connection` is the last `||` operand, which wins).

Either the surface that would make it reachable arrives and the test is completed then, or the case
is renamed to what it actually proves.

---

## E-1 — cosmetic

| Field        | Value            |
| ------------ | ---------------- |
| **Severity** | NONE             |
| **Category** | `E-docs-process` |

- A dead `void before;` line in `hotfix-pg-temp-shadowing.test.ts`.
- A vestigial `payload.offered_actor_type`, now always equal to the resolved type and asserted by
  nothing.

Neither affects behaviour. Recorded so that removing them later is a deliberate act rather than an
unexplained diff.

---

# Search-path hardening follow-ups

Registered when `PRIVILEGED_SCHEMA_SEARCH_PATH_HARDENING` was accepted at
`d0ecf041b990bfd0a82a07f1486c5fa6174a029e`. That change made the privileged-schema search-path
invariant executable — a security-owner schema, derived as a non-system schema owned by a NOLOGIN
non-system role, may not appear on any function's `search_path`, and no role/database setting or
role name may put one there. These two items are what it deliberately did **not** cover. Neither is
implemented, and neither blocks anything.

## SEARCH_PATH_EXECUTOR_CREATE_COMPOSITION

```
SEARCH_PATH_EXECUTOR_CREATE_COMPOSITION=OPEN_NON_BLOCKING
```

| Field        | Value                        |
| ------------ | ---------------------------- |
| **Type**     | Security hardening           |
| **Status**   | OPEN — non-blocking          |
| **Severity** | Hardening; no current defect |

### Invariant

> For a protected function F, no role capable of executing F should also be capable of creating
> objects in a schema that participates in F's effective `search_path`, unless that combination has
> been explicitly security-reviewed and justified.

### Why it is separate

This is the property that actually explains why `public` is safe on every pinned path today, and it
is a **different wall** from the ones already standing. It composes four facts — function EXECUTE,
schema CREATE, role membership, and the function's search_path — where the accepted invariant
composes only schema ownership and schema name. Folding it into the RLS-derived protected-relation
classifier, or into the privileged-schema classifier, would produce one oversized detector whose
failure takes every wall down with it. That is the shape that produced PR #9 finding B-1.

### Motivating example

```sql
GRANT CREATE ON SCHEMA public TO freightos_app;
```

`public` intentionally participates in protected function resolution — it is the second entry of
the pinned path of all fifty-two definers, because those definers exist to read the relations in
it. A CREATE grant there would let a caller introduce a name that a protected function resolves,
undermining otherwise-correct pinning. **No current gate detects this.** Layer 1 covers `pg_temp`
only; the privileged-schema invariant covers schema _names_; the ACL gates assert USAGE, not CREATE,
and only for the schemas they enumerate.

### What a future gate must derive

Independently, and from the catalog rather than a list:

| Column              | Meaning                                     |
| ------------------- | ------------------------------------------- |
| FUNCTION            | the protected function                      |
| EXECUTOR ROLE       | every role that can execute it              |
| SEARCH_PATH SCHEMA  | every schema on its effective path          |
| CREATE PRIVILEGE    | whether that role can create in that schema |
| ALLOWED / FORBIDDEN | the verdict                                 |

It must resolve **effective** privileges — `pg_has_role` and `has_schema_privilege`, which follow
role membership — not direct `GRANT` rows. A direct-grant check would miss reach acquired through
membership, which is exactly how this repository grants most things.

Implementation must include mutation testing proving an unauthorised CREATE grant is detected.

## PRODUCTION_SEARCH_PATH_CONFIGURATION_ATTESTATION

```
PRODUCTION_SEARCH_PATH_CONFIGURATION_ATTESTATION=OPEN_NON_BLOCKING
```

| Field        | Value                          |
| ------------ | ------------------------------ |
| **Type**     | Operational security hardening |
| **Status**   | OPEN — non-blocking            |
| **Severity** | Hardening; no current defect   |

### Invariant

> At deployment and runtime startup, FreightOS database identities must not inherit or receive a
> `search_path` containing a privileged/security-owner schema such as `admin` or `authn`, unless
> explicitly security-reviewed.

### The distinction that matters

**Function-local `search_path`** — a function-level `SET search_path` controls resolution for the
duration of that call and overrides the session path. This is already covered by repository
structural gates: migration 0026 §7(g) at apply time, the exact-equality sweep over every
non-system schema, and the privileged-schema invariant.

**Session / role / database `search_path`** — not covered, and not coverable from inside this
repository. Sources include:

- `ALTER ROLE … SET search_path`
- `ALTER DATABASE … SET search_path`
- `ALTER ROLE … IN DATABASE … SET search_path`
- connection startup options
- `PGOPTIONS`
- driver `options=-c search_path=…`
- runtime `SET search_path` on a pooled session
- server configuration / `ALTER SYSTEM`, where applicable

This surface matters **particularly to invoker-rights functions carrying no function-local pin**.
Thirty-four such functions exist in schema `app`, and P-01 forbids pinning them: a `proconfig`
blocks SQL inlining, which the RLS predicates depend on. Their search_path _is_ the session path.

### Scope limit — state this plainly, do not overstate the existing gate

`sr2-privileged-schema-search-path.test.ts` certifies **repository-controlled catalog state in the
tested cluster**: `pg_proc.proconfig`, `pg_db_role_setting` at all three levels, role names, and the
cluster default as that cluster reports it. It must **not** be represented as attestation of
arbitrary production PostgreSQL configuration outside repository control. A green run is a statement
about the CI cluster, not about a deployed one.

A future operational gate must inspect the **actual deployed cluster and session state** — the path
a real connection resolves, on the real cluster, as the real role.

---

## Dependency posture — NOT clean

Unchanged by any of the above, by the remediation branch, and by the search-path hardening: **1
critical, 1 high, 3 moderate** locally, all inherited through Vite / Vitest / esbuild; GitHub reports
**2 critical**, and the identity of the additional critical remains unresolved. Deferred to
SR-10 / SR-11. The withdrawn SR-2 acceptance token did not accept, fix or waive them; neither does
`PRIVILEGED_SCHEMA_SEARCH_PATH_HARDENING`, and neither do the two follow-ups above.
