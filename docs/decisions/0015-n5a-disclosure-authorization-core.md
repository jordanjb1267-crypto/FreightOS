# ADR-N0015 — N5-A disclosure authorization core

- **ADR ID:** N0015
- **Title:** Whether disclosure is authorized — grants, projections, and the evaluator
- **Status:** Proposed — N5-A implementation, awaiting external rereview
- **Date:** 2026-08-11
- **Migration:** `0032_network_disclosure_authorization`
- **Related:** ADR-N0013 (N3 journal), ADR-N0014 (N4 transport intent), v1.4.0 `08_DATA_SOVEREIGNTY_CONSENT_AND_DISCLOSURE.md`, `24_ACCEPTANCE_GATES_EVIDENCE_MATRIX.md` NA-07

## Context

N3 established canonical network truth. N4 established that transport is owed. Neither says anything
about whether a fact may be shown to anyone. The invariant N5-A exists to enforce is that the three
are independent:

> An accepted fact may exist, and transport may be owed, while disclosure remains forbidden.

Nothing already in the database confers disclosure authority, and the design goal was to keep it
that way — not by convention, but by making the alternative unreachable.

## Decisions

### Default deny — structural

No applicable grant means DENY. There is exactly one code path in `evaluateDisclosure` that returns
ALLOW, and reaching it requires every predicate to have held for at least one grant. There is no
fallback on same tenant, same organization, known participant, existing transport intent,
relationship, alias, assurance level, classification or NULL tenant — no code path consults any of
them.

### The grantor→event binding is the critical predicate

Every applicable grant must satisfy `grant.grantor_participant_id = event.organization_id`,
evaluated **before** the grant contributes a single field. Without it, a grant naming a schema would
authorize any organization's event under that schema, and a shared contract would silently bridge
two organizations. A foreign grant contributes **zero** fields — not a reduced set, which would
itself leak that the grant exists.

This was missing from the first architecture draft and was the finding that external review caught.

### Organization-only recipients, active at decision time

Recipients are `participant_type = 'organization'`, pinned structurally by composite foreign keys
over `GENERATED ALWAYS ... STORED` type columns — a caller cannot supply the discriminator at all.
N1 has seven participant types; broadening is a governed decision, not a consequence of the enum
existing.

Both grantor and recipient must be `status = 'active'` at `decided_at`. An inactive grantor does not
continue authorizing; an inactive recipient cannot receive.

### Tenancy is not eligibility

`tenant_id` is storage metadata. It does not appear in the recipient predicate, and the evaluator's
input type carries no tenant field at all — a predicate cannot branch on what it was never given.
An external organization with `tenant_id IS NULL` is a first-class recipient. NULL tenant is not
public.

The **write** path is different and deliberately asymmetric: creating a grant requires the grantor
organization to have a tenant that equals the caller's verified tenant. An external organization may
be a recipient but may not self-create grants until governed network delegation exists (ADR-N0003
layer C, unbuilt).

### `shipment_execution` and `bilateral_grant`

One purpose and one authority basis are seeded, both migration-authored and immutable.

`contractual`, `statutory`, `regulatory`, `platform_policy` and `legitimate_interest` are
deliberately **absent**: no governed legal-basis vocabulary exists anywhere in this repository, and
inventing one would be authoring law. The column exists so adding one later is a reviewed migration
rather than a schema change.

Purpose is an independent dimension — never inferred from event type, class, subject, source or
schema — and requires exact equality. No prefix matching, no hierarchy, no fallback.

### Static grants, exact-schema binding, allowlist only

Recipients are named explicitly. Dynamic relationship-derived entitlement is deferred: it needs a
governed canonical domain model that does not exist.

A projection binds to exactly one `durable_schema_ref`. A new payload version has no projection
until one is authored, so a newly added sensitive field fails closed rather than riding in on an old
grant. There is no compatible-version fallback.

Data scope is an explicit pointer allowlist. There is no "whole event" scope, no wildcard, and no
denylist — under a denylist a field that did not exist when the rule was written leaves by default,
and no amount of test coverage repairs a wrong default.

### Projection identity

`com.rigreceipts.network.disclosure.projection.<name>.v<N>`, pinned by CHECK. Owner-controlled,
versioned, immutable once issued. Not a UUID, not a URI, and never called `schema_ref` — a schema
ref is a JSON Schema identity and this is not one.

### The FreightOS `-` array extension

At an array traversal step, `-` means **every element**. This is a FreightOS extension to JSON
Pointer semantics and is documented as one: RFC 6901 defines `-` as the position after the last
element, and it is JSON Patch that gives that token operational meaning. Reusing it is safe because
it can never be a real index.

Numeric indexes are rejected (element position is not a stable identity). A whole array of scalars
is permitted; a whole array of objects and a whole object are rejected. That closure rule is what
makes "unknown fields cannot leave" true by construction: if no pointer can name an object, no
pointer can transitively carry a future child of one.

The `additionalProperties: false` exception — where a whole-object pointer would in fact be safe —
is deliberately not taken. It makes safety conditional on a schema keyword.

### Unknown fields never leave, and absence is absence

Unauthorized fields are **absent** from the projected output — never `null`, never masked, never a
placeholder. A null would itself disclose that the field exists. An authorized pointer that does not
resolve in a particular payload contributes nothing and is not an error.

### Multi-grant union, with per-field attribution

Grants that independently satisfy every predicate union their fields. Not intersection: under
intersection a second, narrower grant would _reduce_ what a recipient may receive, so granting more
permission would take permission away. A grant that fails any predicate contributes nothing.

Every permitted pointer carries the grant, projection and basis that authorized it. When two grants
authorize the same pointer, **both** authorizers are preserved — discarding one would make the
evidence trail depend on iteration order.

### Runtime grant authority

Writer is `freightos_app`; no new PostgreSQL role. The INSERT policy requires, jointly: the grantor
is an active organization participant, its `tenant_id` is not null and equals the caller's verified
tenant, and the authenticated user holds `network.disclosure_grant.create` in that tenant. Verified
context comes from `app.verified_principal()` and is not settable by the caller.

`created_by`/`created_at` and `revoked_by`/`revoked_at` are overwritten unconditionally by BEFORE
INSERT triggers, not merely defaulted — a default applies only to an omitted column, so a caller who
names it explicitly would otherwise win.

Recipients do not get grant transparency in N5-A. Read requires grantor-side tenancy plus
`network.disclosure_grant.read`.

### Append-only grants, separate revocations, no supersession

Grants are INSERT-only with no `status` column: status is derived from effective dates and the
revocation table, because "what was authorized at time T" must be answerable from immutable rows.

Revocation is a separate INSERT-only table whose primary key **is** `grant_id`, so at most one
revocation per grant is structural rather than constrained. There is no un-revoke.

`supersedes_grant_id` is deliberately absent: a supersession chain introduces a second temporal rule
for when a predecessor stops contributing authority, and N5-A does not need one.

`effective_from` is inclusive, `effective_until` exclusive, revocation effective at `revoked_at`
inclusive.

### Audit coupling is structural

Grant and revocation inserts each fire an AFTER INSERT trigger calling the existing hardened
`app.record_audit_event` in the same transaction. A grant cannot exist without its ledger entry, and
a failed audit write fails the grant. No application-level best-effort auditing, and **no new
SECURITY DEFINER** — the triggers run with invoker rights as `freightos_app`, which migration 0031
(SR-AUDIT-ACL-NOOP) left as that function's only runtime grantee.

Event types `rig.freight.network.disclosure_grant.created.v1` and `.revoked.v1` satisfy the existing
`audit_events` namespace constraint unchanged; purpose is `service_operation`.

### Historical classification is inert

`network_events.classification` is **never read**. Not by a policy, not by a predicate, not by a
migration mapping. N3 froze it as an ungoverned string that nothing may branch on, and the way that
is guaranteed here is that the field is not in the evaluator's input type at all.

The consequence is the one that matters: a historical event storing `classification = 'public'`
confers **zero** authority, with no migration of immutable rows and no legacy branch.

### N5-A / N5-B split, and N6 remains blocked

N5-A ships the authorization core. It contains **no** sensitivity ceiling: that vocabulary, its
ordering, and its per-contract assignments are unresolved owner input.

> **NETWORK_N5A_COMPLETE DOES NOT AUTHORIZE NETWORK_N6_PUBLICATION.**

Before N6, N5-B must establish the network sensitivity vocabulary, its ordering, per-schema
assignments, the hard disclosure ceiling, and the classification register's network disclosure axis.
No placeholder is implemented now — a placeholder ceiling that permits everything is worse than an
absent one, because it looks like a control.

N5-A is safe standing alone because default deny, an explicit named grant, exact-schema projection
binding and the field allowlist are each independently fail-closed. What it lacks is a _prohibition_
a grantor cannot override, which is exactly what a ceiling is for.

## Alternatives considered

**Reusing the v1.2 audit purpose vocabulary.** Rejected: its ten values describe why a FreightOS
operator touched a record, not why a counterparty receives freight data.

**Sensitivity tables now, seeded empty.** Rejected: an unpopulated ceiling authorizes nothing and
proves nothing, and shipping the tables would make the N5-B deferral invisible.

**An external policy engine (OPA/Cedar/Rego).** Rejected: one rule shape, zero external disclosure
today, and an engine adds a second policy language, a second audit surface, and a component the N4
egress gate would have to classify.

**A `SECURITY DEFINER` evaluator in the database.** Rejected: it would need elevated rights to cross
RLS, and PL/pgSQL cannot validate JSON Schema. The evaluator is a pure TypeScript function over
loaded state and needs only `SELECT`.

**Intersection semantics for multiple grants.** Rejected as incoherent — see above.

## Consequences

Payload schema evolution becomes an operational event with a disclosure-review step: a new contract
version requires new projections and new grants. That cost is the safety property, not a defect, and
it is stated plainly so nobody is surprised by it later.

A recipient authorized for an original event is **not** automatically authorized for its correction,
replacement or dispute — each is a separate event and receives a fresh decision. This permits a
recipient to hold a fact that has since been corrected; the mitigation belongs to N6 and is recorded
in the risk register rather than solved by auto-propagating data under no grant.

Evidence references may be projected like any other field; evidence **content** authorization is out
of scope and needs its own model.

## Known deviation

`permissions.action` is constrained to `read|write|engage|release`, which contains neither `create`
nor `revoke`. The three permission **keys** are seeded exactly as specified — and
`app.user_has_permission` resolves on `key` — so the authorization contract is unaffected; the two
write keys carry action `write`. Extending that CHECK would alter an existing surface, and the CHECK
is therefore left unchanged and pinned by assertion in both directions of the migration. Flagged for
owner confirmation.

## Migration and rollback

`0032_network_disclosure_authorization`, fully transactional, six tables, no `ALTER TYPE`, no
`CASCADE`, no `DROP OWNED`. The down migration removes every N5-A object and asserts that N1–N4 and
migration 0031's hardened audit ACL survive intact — reverting a feature must never reopen a
security control belonging to something else.

The rollback is an **exact logical rollback**, including the three permission rows. Removing them
takes a temporary, migration-only DELETE path, because `permissions` is under `FORCE ROW LEVEL
SECURITY` with policies for SELECT, INSERT and UPDATE and none for DELETE — and under FORCE RLS a
DELETE with no applicable policy silently matches zero rows even for the table owner.

No privilege is granted to open that path. `freightos_migrator` owns the table and its ACL already
carries `d`; what is missing is a policy, not a privilege. The down migration therefore creates a
DELETE policy scoped to `freightos_migrator` and to the three exact keys, deletes exactly those keys
by name, requires an affected row count of exactly **3**, and drops the policy before commit. There
is no `LIKE`, no key prefix, and no automatic deletion of `role_permissions`: the migration first
refuses to run at all if any of the three keys is assigned to a role or a service account, so a
rollback can never silently strip authority a tenant is relying on.

What is asserted afterwards is parity, not intent: the `permissions` ACL is compared byte-for-byte
against the value captured before the migration touched the table, DELETE on `permissions` is proved
by `aclexplode` to be held by the owner and nobody else, the policy inventory is required to equal
`permissions_insert`/`permissions_read`/`permissions_update` exactly with no surviving DELETE policy,
and `ENABLE`/`FORCE ROW LEVEL SECURITY` are required to still be on.

## Open decisions

Network sensitivity vocabulary and assignments (N5-B, blocks N6) · legal-basis vocabulary beyond
`bilateral_grant` · data controller/originator/custodian semantics · additional disclosure purposes ·
data residency · retention periods · right-to-delete versus immutable evidence · public exposure
rules · network terms artifact (`terms_ref`/`terms_hash` becoming mandatory) · network
delegation/representation for external self-service grant creation · recipient grant transparency ·
downstream sharing.
