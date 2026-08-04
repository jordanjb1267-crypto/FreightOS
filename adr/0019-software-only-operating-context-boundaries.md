# ADR-0019 — Software-only operating-context boundaries

**Status:** Accepted (owner ruling A, Phase 1)
**Date:** 2026-08-04
**Depends on:** ADR-0015 (legal authority class and operating context)
**Closes:** the semantic gap ADR-0015 left open for `shipper_owned`, `facility_operator`, and
`autonomous_mobility`

## Context

ADR-0015 split the overloaded `authority_mode` column into two dimensions and enumerated the
permitted pairings. It did not define what the three non-carrier operating contexts under
`legal_authority_class = software_only` may actually do. Its own Context section says so:

> `09_AUTONOMY_POLICY_AND_AUTHORITY.md:41-47` defines boundary rules for exactly two of the five.
> `shipper_owned`, `facility_operator`, and `autonomous_mobility` have no legal semantics at all.

Phase 0 never exercised them — it created four platform tables and no domain surface. Phase 1 is
the first phase that writes under them: every minimum facility primitive is a `facility_operator`
write, and every shipper-side collaboration record is a `shipper_owned` write.

Without a boundary, `software_only` is the residual class, and a residual class with no ceiling is
a permission wildcard. Constitution Art. I.2 requires that missing or inconsistent legal context
fails closed, and Art. I.5 forbids an agent granting itself authority. Neither is decidable for
these three contexts today.

## Decision

Adopt a fail-closed capability matrix. The three contexts remain legal operating contexts under
`legal_authority_class = software_only`. **None of them conveys carrier-agent authority, brokerage
authority, or physical-control authority.**

### `shipper_owned`

**Permitted.**

- Read and maintain the tenant's own party, location, shipment-request, cargo-requirement,
  document-reference, and visibility data, where explicitly authorized.
- Read transport status that has been lawfully shared with the shipper.
- Create planning records that do not award, broker, dispatch, or execute transportation.

**Prohibited.**

- Acting for a carrier
- Selecting or binding a carrier for a third party
- Accepting or counteroffering a load
- Dispatching a driver
- Changing carrier assignments
- Exercising brokerage authority
- Initiating financial settlement

**Phase 1 treatment.** Contract and data-model support only. No Shipper Control Tower application
— it is `PROMOTION_GATED` at `config/scope/module_states.yaml`. No operational shipper execution
workflow.

### `facility_operator`

**Permitted.**

- Read and update minimum facility primitives for facilities the legal entity is authorized to
  operate.
- Maintain facility hours, restrictions, appointments, readiness, visits, gate/staging/dock
  references, loading events, seals, custody evidence, detention evidence, goods receipts, and
  discrepancies.

**Prohibited.**

- Dispatching a carrier
- Reassigning equipment or drivers
- Accepting freight on behalf of a carrier
- Brokering transportation
- Issuing motion, robotics, PLC, gate-controller, or autonomous-equipment commands
- Overriding carrier compliance or maintenance restrictions

**Every facility write must prove facility operatorship or an explicit facility authorization
relationship.** This is a predicate over data, not a claim in a session variable — see §RLS below.

### `autonomous_mobility`

**Phase 1 status: interface, schema, fixture, and simulation only.**

- Standing fail-closed suspended state
- No operational writes
- No live missions
- No vehicle-control commands
- No route execution
- No dispatch acceptance
- No physical-control authority

Synthetic test records must be clearly marked non-authoritative and non-operational.

Defining the context now rather than leaving it unreachable-but-unbounded is deliberate: the enum
value already exists in `app.operating_context`
(`packages/database/migrations/0001_platform_foundation.up.sql:31-38`), so a code path can reach
it. A standing kill switch makes an accidental path fail closed rather than merely fail review.

### Common authority requirements

For all three contexts:

1. `legal_entity_id` is **required** for tenant-owned operational records.
2. Legal authority and operating context remain separate dimensions. Operating context never
   widens permission (ADR-0015 rule 5).
3. Carrier appointment is **not implied** and must not be asserted.
   `packages/context/src/legal.ts:124-126` already rejects `carrierId` outside `carrier_agent`.
4. Brokerage remains disabled and fail-closed.
5. Every write produces an append-only audit record.
6. Every event envelope carries tenant, actor, authority class, operating context, **and purpose**.
7. Kill switches may target tenant, legal entity, context, workflow, agent, tool, or integration.
8. Missing or inconsistent authority context fails closed.

### The complete matrix

Rows are resource groups; columns are `(legal_authority_class, operating_context)` pairs. `R` =
read, `W` = write, `—` = no access, `DENIED` = refused before any predicate is evaluated.

| Resource group | `software_only`/`system` | `software_only`/`shipper_owned` | `software_only`/`facility_operator` | `software_only`/`autonomous_mobility` | `carrier_agent`/`carrier` | `brokerage`/`brokerage` |
| --- | --- | --- | --- | --- | --- | --- |
| Identity and organization | R/W | R (own) | R (own) | — | R | `DENIED` |
| Parties and locations | R | R/W (own) | R/W (facilities operated) | — | R/W | `DENIED` |
| Carrier and fleet | R | — | — | — | R/W | `DENIED` |
| Cost profiles, profitability | — | — | — | — | R/W | `DENIED` |
| Freight core | R | R + planning-record W | R (in-scope shipments) | — | R/W | `DENIED` |
| Facility primitives | R | R + readiness and appointment-request W | R/W | — | R + visit-side W | `DENIED` |
| Custody events | R | W (release side) | W (facility side) | — | W (carrier side) | `DENIED` |
| Load opportunities | R | — | — | — | R/W | `DENIED` |
| Assignments and dispatch | R | — | — | — | R/W | `DENIED` |
| Autonomous mobility | R | — | — | **suspended** | — | `DENIED` |
| Kill switches | R/W | R | R | R | R + tenant-scope W | `DENIED` |
| Audit | R (control plane) | R (own) | R (own) | R (own) | R (own) | `DENIED` |

`brokerage` is `DENIED` throughout and is refused three independent ways, all already in place:
`packages/context/src/legal.ts:129-134` rejects the context, `app.is_permitted_legal_pairing`
(`0001_platform_foundation.up.sql:43-55`) rejects the pairing in the database, and
`BROKERAGE_EXECUTION_ENABLED` is a mandatory-false default asserted by
`scripts/validate-scope.mjs`.

### RLS consequences

The base predicate follows the Phase 0 pattern. `tenants` is the one variation — its policy
compares `id` rather than `tenant_id`, because the tenant row **is** the tenant
(`0002_tenants.up.sql:48-50`, self-reference `CHECK` at `0002_tenants.up.sql:19`). Every Phase 1
tenant-owned table uses the general form:

```sql
USING      (app.is_control_plane() OR tenant_id = app.current_tenant_id())
WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id())
```

This matrix adds **context-conditional predicates on top of** — never instead of — tenant
isolation:

| Table group | Additional predicate |
| --- | --- |
| Freight core reachable under `shipper_owned` | `AND EXISTS (a party role binding the session's legal entity to the shipment)` |
| Facility primitives under `facility_operator` | `AND EXISTS (a facility-operatorship or explicit facility-authorization row for the session's legal entity)` |
| Carrier and fleet | `AND app.current_operating_context() = 'carrier'` |
| Cost profiles and profitability | `AND app.current_operating_context() = 'carrier'` plus an economics permission — Art. III.2 names customer economics as the leakage prohibition, so it gets a second gate |
| Autonomous mobility (when tables exist) | `AND false` in Phase 1 — structurally unwritable |

Four properties follow, and all four must be tested:

1. **Operatorship is data, not a claim.** A session asserting `facility_operator` with no
   operatorship row sees and writes nothing. There is no session variable that grants it.
2. **Context cannot widen.** No predicate in this matrix is disjunctive with the tenant predicate.
   Every one is an `AND`.
3. **Absence fails closed.** `app.current_operating_context()` returns `NULL` when unset
   (`0001_platform_foundation.up.sql:115-119`), and `NULL = 'carrier'` is `NULL`, never true.
4. **The pairing is enforced twice.** Application (`validateLegalContext`) and database
   (`is_permitted_legal_pairing` CHECK) must agree, and a test asserts the full 3 × 6
   cross-product.

### Implementation obligations this ADR creates

Two of these cannot land in PR 1, which is documentation only. Both are recorded here so they are
not lost.

| Obligation | Artifact | Target PR |
| --- | --- | --- |
| Context capability matrix as executable code | `packages/identity` or `packages/context` | PR 2 |
| Context-conditional RLS predicates | Phase 1 migrations | PR 2 onward, per table |
| **Kill-switch scope extension (OQ-19).** Requirement 7 names `legal entity` and `context` as targets. `app.kill_switch_scope` (`0004_kill_switches.up.sql:11-19`) has `system, legal_plane, tenant, workflow, agent, tool, integration` — neither exists. Reviewed `ALTER TYPE` migration declaring `-- freightos:no-transaction`, extended precedence in SQL and TypeScript, and a regression test proving Phase 0 records resolve identically | `packages/database/migrations/` | **PR 2** |
| **Event-envelope `purpose` attribute (OQ-20).** Requirement 6 names `purpose`. `schemas/event-envelope.schema.json` has `additionalProperties: false` and no `purpose`, so an enveloped event carrying one is currently invalid. `purpose` is supplied by the trusted command or control-plane context from a closed vocabulary, never by model output. Requires a declared override and its `handoff-provenance.json` entry | `schemas/event-envelope.schema.json` | **PR 2** — the first PR that emits domain events |
| Standing `autonomous_mobility` suspension recorded as a kill switch | seed or runbook | PR 2 |
| **Custody contract (OQ-21).** `custody-event.schema.json` still carries the pre-ADR-0015 `authority_mode` enum with five values and is a verbatim copy with no declared override, so a Phase 1 custody event cannot express this model. Replace with `legal_authority_class` + `operating_context`, version the contract, and add negative tests | `schemas/custody-event.schema.json` + `handoff-provenance.json` | **PR 6** — the event-contract PR, one ahead of PR 7 where `custody_events` is created |

Full specifications for OQ-19, OQ-20, and OQ-21 — required migration, schema, precedence, audit,
compatibility, tests, exit evidence, and owner-decision status — are in
`docs/governance/OPEN_QUESTIONS.md` §"Accepted implementation obligations".

## Consequences

**Good.** Article I.2 becomes decidable for all six operating contexts rather than two. Facility
writes stop being indistinguishable from carrier writes in the audit ledger. `software_only`
acquires a ceiling instead of being the residual class. Facility operatorship becomes provable
rather than asserted, which is the same correction ADR-0015 made for carrier appointment.

**Cost.** Two additional predicates on hot read paths. At the 100,000-powered-unit target
(`04_ENTERPRISE_SCALE_AND_TENANCY.md:45-56`) a per-query recomputation of party membership would
be a performance problem, so membership and operatorship must be materialized as indexed
association tables rather than derived. Broadening a context later is an ADR plus a migration;
that friction is intended, because narrowing after operations depend on a permission is far harder
than starting narrow.

**Deferred.** The `autonomous_mobility` capability set beyond "suspended" is not decided here. It
belongs to the Autonomous Vehicle Activation Gate (`checklists/AUTONOMOUS_VEHICLE_ACTIVATION_GATE.md`),
which is unsigned and is Horizon 3 at the earliest.
