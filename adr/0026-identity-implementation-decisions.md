# ADR-0026 — Identity and organization implementation decisions

**Status:** Accepted (engineering, Phase 1 PR 2)
**Date:** 2026-08-04
**Subordinate to:** ADR-0015, ADR-0017, ADR-0019, ADR-0020, ADR-0021, ADR-0024, and the owner
rulings in `docs/decisions/0002-phase-1-owner-rulings.md`
**Changes no owner ruling.**

## Context

`docs/plans/phase-1-definition-and-owner-decisions.md` §13 asks for an implementation decision
record when a material engineering choice is not already resolved by the accepted ADRs. Seven such
choices arose in PR 2. Each is recorded here with the alternative that was rejected, so a reviewer
can disagree with the reasoning rather than reverse-engineer it from the SQL.

## Decisions

### 1. Fifteen tables, not twelve

The plan's §7 allocates **12** tables to PR 2. The authorized PR 2 scope enumerates
*membership-role assignments*, *service-account credentials or credential references*, and
*service-account permissions* as distinct concepts, and each is a many-to-many that needs its own
table. The plan itself anticipates this — "possibly split by aggregate".

Added beyond the twelve: `membership_roles`, `service_account_credentials`,
`service_account_permissions`.

**Rejected:** folding roles into `memberships` and a credential into `service_accounts`, as the
plan's prose implies. It makes a second role on one attachment unrepresentable, and it makes
credential rotation an in-place overwrite of the value being rotated away from — so the overlap
window during which both the old and new credential are live cannot be modelled at all.

### 2. Permitted parenthood is a function, not a table

The plan recommends "a small permitted-parent table". `app.is_permitted_node_parent(child, parent)`
is an `IMMUTABLE` SQL function instead, matching `app.is_permitted_legal_pairing` from Phase 0 —
the same shape of rule, expressed the same way.

The plan's actual constraint is that parenthood must **not** be a rigid ladder: `04_…:16` scopes
records "to any valid node". The function returns a *set* of permitted parents per type, so a
region may sit under an enterprise, a legal entity, an operating authority, a business unit, or
another region. That constraint is met.

**Rejected:** a table. It would be a thirteenth table holding eight rows that change only by
migration, it would need its own RLS policy and grants, and being data rather than code it would
not be diffable in review. The function is mirrored by `PERMITTED_NODE_PARENTS` in
`packages/identity/src/organization.ts`, and a test asserts the two agree over the full 8 × 8
cross-product.

### 3. `organization_nodes` and `legal_entities` self-reference their own dimension

`organization_nodes.organization_node_id = id` and `legal_entities.legal_entity_id = id`, enforced
by `CHECK`. This is the device `tenants.tenant_id` already uses
(`0002_tenants.up.sql:19`): one predicate shape across every table beats a special case on three.

The consequence is that `legal_entities` needs **no** ADR-0021 exception at all, and
`organization_nodes` needs one only for `legal_entity_id` — which is the category-5 case ADR-0021
now registers.

### 4. The governing legal entity is derived, not stored on the node

`app.governing_legal_entity_id(tenant, node)` walks the closure to the nearest ancestor-or-self node
with a legal entity attached. `organization_nodes` carries no `legal_entity_id` column.

**Rejected:** storing it on the node. `legal_entities.organization_node_id` already points the other
way, so a stored column is a second copy of the same fact that a subtree move can silently
invalidate — and it would need its own reconciliation trigger to stay true.

A shared trigger, `app.assert_governing_legal_entity`, then makes the two ADR-0021 columns agree on
every table that carries both: the stored `legal_entity_id` must be the entity that actually governs
the stored node. Two independent `NOT NULL` columns can still disagree, and this is what stops them.

### 5. A privileged denial returns; it does not raise

ADR-0020 §8 requires every privileged operation to write an audit record before returning. OQ-20
requires a missing actor or purpose to fail closed. Those two pull against each other if a refusal
raises: PostgreSQL has no autonomous transaction, so `RAISE` rolls back the very audit row that
evidences the refusal, and the ledger shows silence where a denial belongs.

So `admin.*` functions return `admin.privileged_result` with `outcome = 'denied'`. A refused call
performs **no** privileged work — nothing read, nothing written, no state changed — and its refusal
is durably recorded. That is failing closed *with evidence* rather than failing closed in silence.

An execution error is caught in a subtransaction, recorded as `failed`, and returned the same way.
The one thing that still raises is a missing `EXECUTE` grant, which PostgreSQL refuses before the
function body runs.

**Rejected:** raising `insufficient_privilege`. It satisfies "fails closed" and defeats "is
audited", and ADR-0020 requires both.

### 6. A denied privileged audit row may carry no purpose

`audit_events_privileged_requires_purpose` exempts `outcome = 'denied'`. The commonest reason to
deny is that no purpose was supplied or the one supplied was outside the vocabulary; requiring a
purpose on the refusal record would force the ledger to invent one, and OQ-20 states that absence
is never defaulted, inferred, or backfilled. The refusal is recorded with the purpose absent, which
is the fact. What was *offered* is in the denial payload.

`audit_events_privileged_actor_is_human_or_system` takes no such exemption: a privileged row may
never claim an agent actor, denied or not. An agent's attempt is recorded with the platform as the
recording actor and `payload.offered_actor_type = 'agent'`, so the attempt is evidenced without the
ledger asserting it was authorised.

### 7. `carrier_appointments.carrier_reference` is opaque text, not a foreign key

`carrier_profiles` is PR 4 and PR 2 may not create it. The column is `text NOT NULL` with a
uniqueness constraint on the active appointment per legal entity and carrier. PR 4 adds the
referential constraint when the table it would reference exists.

**Rejected:** creating a stub `carrier_profiles` table in PR 2 to hang the key off. That is a later
PR's table arriving early under a different justification, which is precisely what
`21_SEQUENCING_DOCTRINE` exists to prevent.

## Consequences

**Good.** Every deviation from the plan's prose is written down with its reason, and none of them
touches an owner ruling. The two that a reviewer is most likely to challenge — the table count and
the returning denial — are the two with the most explicit rationale.

**Cost.** Decision 5 means a caller that ignores the returned `outcome` sees a successful-looking
call that did nothing. Mitigated by the outcome being the first field of the result type and by
`privilegedRefusalReason` in `packages/identity/src/purpose.ts`, which lets a caller check before
the round trip; not eliminated. A future application layer should treat a non-`succeeded` outcome
as an error at its own boundary.

**Deferred.** Decision 7's foreign key lands in PR 4. Until then, a carrier reference naming no
carrier is representable — and a test asserts the *appointment* side is still provable, which is
what `carrier_agent` context actually depends on.
