# ADR-0020 — Control-plane access is narrow, audited, and never `BYPASSRLS`

**Status:** Accepted (owner ruling D, Phase 1)
**Date:** 2026-08-04
**Builds on:** ADR-0006 (PostgreSQL RLS), and the control-plane role introduced in
`packages/database/migrations/0001_platform_foundation.up.sql`

## Context

`04_ENTERPRISE_SCALE_AND_TENANCY.md:37-39` requires a global control plane holding tenant routing,
identity metadata, product catalog, deployment registry, agent and model registry, global policy
definitions, and the billing catalog. Some of that is inherently cross-tenant.

Against it: `02_GOVERNANCE_AND_NON_REGRESSION.md:57` forbids cross-tenant admin shortcuts,
Constitution Art. III.1 makes tenant isolation a guarantee, Art. III.2 names customer economics as
the leakage prohibition, and `10_SECURITY_COMPLIANCE_AND_LEGAL_GATES.md:5` requires auditing
privileged actions.

Phase 0 made half of this decision and recorded it in the migration itself
(`0001_platform_foundation.up.sql:63-68`):

> `freightos_control_plane` the global control plane. Cross-tenant by design, via an explicit
> policy branch rather than BYPASSRLS, so the escape is visible in the policy and works without
> cluster superuser.

`app.is_control_plane()` (`0001:121-128`) tests **role membership**, not a session variable, so a
tenant-scoped caller cannot set its way across the boundary —
`packages/database/test/integration/rls.test.ts:147` proves it.

What Phase 0 did **not** provide is any record that a privileged access *happened*. The policy
branch makes the escape visible in the source; it does not make a use of it auditable. Across four
platform tables that was tolerable. Phase 1 introduces roughly forty-five domain tables carrying
`TENANT_ECONOMICS` and `PERSONAL` data, and it stops being tolerable.

## Decision

A hybrid design. The Phase 0 policy branch remains the isolation mechanism; a narrow, audited
function surface becomes the only way to use it.

**`BYPASSRLS` is not granted to any normal application role, nor to the routine control-plane
connection.** It is prohibited outright.

1. **Explicit RLS policy branches** for recognized control-plane access. Unchanged from Phase 0:
   `app.is_control_plane() OR tenant_id = app.current_tenant_id()`. The escape stays readable in
   `pg_policies`.
2. **A separate, narrowly scoped administrative connection role.** Distinct database user,
   distinct credential, never borrowed from the application pool.
3. **`SECURITY DEFINER` functions in a dedicated administrative schema.** Cross-tenant operations
   are exposed only as named functions with explicit arguments — never as ad-hoc SQL.
4. **Function ownership by a non-login owner role.** The definer is an owner that cannot log in,
   so compromising the connection role does not yield the definer's rights directly.
5. **Explicit, immutable `search_path` on every such function.** A mutable `search_path` on a
   `SECURITY DEFINER` function is a privilege-escalation vector; pinning it removes the vector.
6. **Execute-only grants to the administrative connection.** `GRANT EXECUTE` on the functions, and
   nothing else.
7. **No direct table grants unless separately approved.** The default for every new Phase 1 domain
   table is **no control-plane grant at all**. A grant requires a named justification in the
   migration and review.
8. **Mandatory privileged-access audit events.** Every privileged operation writes an audit record
   before returning.

### Required audit fields on every privileged operation

- Actor
- Request or correlation ID
- Purpose
- Tenant scope
- Legal-entity scope where applicable
- Resource
- Action
- Timestamp
- Outcome

`audit_events` (`0003_audit_and_outbox.up.sql:15-44`) already carries actor, correlation, resource,
tenant, timestamp, and the legal pair. **`purpose` and `outcome` have no column today**, so this
ADR creates a schema obligation — see §Implementation obligations.

### Session-claim prohibition

Tenant sessions must be unable to claim control-plane status through session variables, headers,
or user input. This is already structurally true — `app.is_control_plane()` reads
`pg_has_role(current_user, 'freightos_control_plane', 'USAGE')` and ignores every session setting —
and it must stay true. Adding a session-variable branch to that function is prohibited.

### Required integration tests

All control-plane paths require tests proving:

- Unauthorized cross-tenant access fails
- Tenant connections cannot invoke privileged functions
- Privileged calls are narrowly scoped
- Audit records are written
- Missing purpose or actor fails closed

Additionally, and following from the design: no role holds `rolbypassrls`; a tenant session cannot
`SET ROLE` into the control plane; every `SECURITY DEFINER` function pins `search_path`; every
tenant-owned table has a policy (extending `rls.test.ts:192` to Phase 1 tables).

### Why not the alternatives

**`BYPASSRLS` alone.** A role attribute with no per-table granularity, no policy text to review,
and no audit trail. `rls.test.ts:168` asserts `FORCE ROW LEVEL SECURITY` so that even the table
owner is subject; granting `BYPASSRLS` would undo that test's intent while leaving it passing.

**Policy branch alone (the Phase 0 state).** Correct isolation, zero auditability. Adequate for
four platform tables, inadequate for forty-five domain tables.

**`SECURITY DEFINER` functions alone.** Without the policy branch, the definer role would itself
need to be RLS-exempt, which reintroduces an invisible escape — exactly what the Phase 0 comment
rejected.

## Consequences

**Good.** Every cross-tenant access becomes a named, argument-bounded, audited operation.
`pg_policies` remains a readable statement of who can see what. No cluster superuser dependency.
The Phase 0 mechanism is preserved rather than replaced, so the fifteen existing RLS tests stay
valid.

**Cost.** Function proliferation is a real risk — one function per operation sprawls quickly.
Mitigated by requiring each `admin.*` function to be justified in a migration and reviewed at each
phase exit gate. Adding a control-plane grant is easy; removing one after operations depend on it
is disruptive, which is the argument for granting nothing by default.

**Timing.** This is the earliest and hardest Phase 1 deadline. The grant-and-policy pattern is set
by the first domain migration and copied by every later one, so deciding after PR 2 would mean
rewriting every policy block.

### Implementation obligations

| Obligation | Artifact | Target PR |
| --- | --- | --- |
| `admin` schema, non-login owner role, first privileged functions | `packages/database/migrations/` | PR 2 |
| **`audit_events` lacks `purpose` and `outcome` columns**, both mandatory above. Requires a reviewed migration adding them, with `purpose` `NOT NULL` for privileged operations | `packages/database/migrations/` | PR 2 |
| CI assertion that no role holds `rolbypassrls` | `packages/database/test/integration/` | PR 2 |
| CI assertion that every `SECURITY DEFINER` function pins `search_path` | `packages/database/test/integration/` | PR 2 |
| Per-table control-plane grant decision recorded in each migration | every Phase 1 migration | PR 2 onward |
| Control-plane access runbook | `docs/runbooks/` | PR 2 |
