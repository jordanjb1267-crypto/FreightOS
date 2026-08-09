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

## Dependency posture — NOT clean

Unchanged by any of the above and by the remediation branch: **1 critical, 1 high, 3 moderate**, all
inherited through Vite / Vitest / esbuild, deferred to SR-10 / SR-11. The withdrawn SR-2 acceptance
token did not accept, fix or waive them, and nothing here does either.
