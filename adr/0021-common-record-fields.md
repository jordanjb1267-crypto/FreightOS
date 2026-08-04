# ADR-0021 — Common record fields

**Status:** Accepted (owner ruling F, Phase 1)
**Date:** 2026-08-04
**Amends:** ADR-0017 §"The common-field contract". ADR-0017 remains in force in every other
respect — reference DDL is still never executed, migrations still ship tested down paths.

## Context

ADR-0017 defined a common-field contract and applied it to the four Phase 0 platform tables. Two
gaps became visible once Phase 1 was specified.

**It omits the isolation columns the handoff mandates.** `04_ENTERPRISE_SCALE_AND_TENANCY.md:26-31`
states that tenant-owned records include `tenant_id`, `organization_node_id`, `legal_entity_id`,
and authority mode. `07_DATA_MODEL_AND_STATE_MACHINES.md:5` repeats it. ADR-0017's contract lists
neither `organization_node_id` nor `legal_entity_id`, so the isolation predicate those documents
presume could not be written. Phase 0 did not notice because none of its four tables is a
business-domain record.

**It has no mutation attribution.** `created_by` is mandatory, and closing that gap was audit
finding G2. But nothing records *who* performed an update. An append-only audit ledger reconstructs
it, and reconstruction is not the same as the row carrying it — every query that shows a record's
current state would otherwise have to join the ledger to answer "who last touched this".

## Decision

### Every persisted mutable record

| Column | Notes |
| --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` |
| `tenant_id` | `uuid NOT NULL` — the RLS discriminator |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` |
| `created_by` | `NOT NULL`, sourced from session context |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()`, maintained by trigger |
| `updated_by` | `NOT NULL`, sourced from session context |
| `record_version` | `bigint NOT NULL DEFAULT 1`, owned by the database, for optimistic concurrency |

### Every tenant-owned operational or business-domain record, additionally

| Column | Notes |
| --- | --- |
| `organization_node_id` | `uuid NOT NULL` — `04_…:29` |
| `legal_entity_id` | `uuid NOT NULL` — `04_…:30` |

ADR-0015's requirement is retained unchanged and is **not** superseded here: records carrying legal
posture also carry `legal_authority_class` and `operating_context`, both `NOT NULL`, with a `CHECK`
on `app.is_permitted_legal_pairing`.

### The four permitted nullable categories

`organization_node_id` and `legal_entity_id` may be nullable **only** for:

1. **System-scope control-plane records** — records whose scope is the platform, not a tenant.
2. **Global reference data** — catalogs and vocabularies that are not tenant-owned.
3. **Immutable schema or migration metadata** — `schema_migrations` and equivalents.
4. **Relationship tables whose tenant, organization node, and legal entity are deterministically
   inherited and enforced from both parents.**

Every exception must:

- be listed in this ADR,
- have an explicit reason,
- have an RLS rule,
- have a test,
- **fail closed when parent context is inconsistent.**

**No broad generic exception exists.** A table is not exempt because carrying the columns is
inconvenient, because the values are "obvious", or because a join can recover them. Adding an
exception means amending this ADR.

Category 4 deserves its constraint stated plainly, because it is the one an implementer will reach
for most often. A relationship table may omit the two columns only when **both** parents carry
them, **and** a `CHECK` or trigger proves the parents agree. Where the parents disagree, the write
is rejected — it is not silently resolved in favour of either side, and it does not fall back to
the session context.

### Registered exceptions at Phase 1 PR 1

| Table | Category | Reason | RLS rule | Test obligation |
| --- | --- | --- | --- | --- |
| `schema_migrations` | 3 | Migration metadata; not tenant data, not RLS-subject | No RLS; not reachable by `freightos_app` | Assert the application role cannot write it |
| `tenants` | 1 | The tenant row **is** the tenant; `tenant_id` self-references (`0002_tenants.up.sql:19`) | Existing `tenants_isolation` policy | Already covered by `rls.test.ts` |
| `kill_switches` | 1 | System and legal-plane switches are deliberately cross-tenant (`0004_kill_switches.up.sql:38-39`) | Existing three-policy set | Already covered |
| `permissions` (Phase 1) | 2 | Global permission catalog, control-plane owned | Control-plane write, tenant read | PR 2 |
| `equipment_capabilities` (Phase 1) | 2 | Capability registry vocabulary — `05_…:41` makes profiles registry data | Control-plane write, tenant read | PR 4 |

`audit_events` and `outbox_events` are **not** exceptions: they are append-only, and the contract
above governs *mutable* records. Following ADR-0017 §59-60, append-only tables deliberately omit
`updated_at`, `updated_by`, and `record_version` — a row that must never change has no use for a
mutation counter or a mutation author, and carrying either would imply it may be mutated.

### Consistency obligations against Phase 0

This contract renames and extends what Phase 0 shipped. Two names for one concept across
sixty-two tables is exactly the drift this ADR exists to prevent, so the Phase 0 tables are
brought into line rather than grandfathered.

| Change | Affects | Target PR |
| --- | --- | --- |
| `version` → `record_version` | `tenants`, and `app.bump_version()` (`0001_platform_foundation.up.sql:173-184`) | PR 2 |
| Add `updated_by` | `tenants` | PR 2 |
| Add `purpose`, `outcome` | `audit_events` — required by ADR-0020, recorded there | PR 2 |

Each is a reviewed migration with a tested down path, and the existing 49 integration tests must
pass unchanged in behaviour afterwards.

## Consequences

**Good.** The isolation predicate `04_…:26-31` presumes becomes writable. Mutation attribution is
on the row rather than reconstructed. The nullable cases are four enumerated categories with
per-table justification, tests, and fail-closed parent checks — not a generic escape hatch that
grows quietly.

**Cost.** Two extra `NOT NULL uuid` columns and one extra `text` column on sixty-two
tables, plus the index maintenance that follows. Three Phase 0 migrations must be amended rather
than left alone, which touches tested code. The category-4 parent-agreement check is genuinely
fiddly to write correctly and will need its own test per relationship table.

**Rejected alternative.** Making `organization_node_id` broadly nullable and enforcing it in
application code. That is how the handoff's reference DDL arrived at a state where "no table has
`created_by`" (ADR-0017 §Context) — a mandate with no enforcement point degrades to a convention,
and a convention is not an isolation control.
