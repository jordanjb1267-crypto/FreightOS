# ADR-0017 — Reference DDL is not migration SQL

**Status:** Accepted (owner ruling, Phase 0)
**Closes:** audit findings G1, G2, G3, G10, G12

## Context

The handoff ships five `.sql` files. Nothing in the package states whether they are runnable
migrations or reference material, and reading them as migrations breaks immediately:

- **No down-migrations exist**, while Constitution Art. VIII.2 requires rollback on every release
  and `00_MASTER_HANDOFF.md:269` requires that migrations recover.
- **No migration-version table, runner, checksum, or ordering metadata** beyond filenames.
- **Zero `CREATE POLICY` statements.** `db/0003` and `db/0004` enable RLS on no tables at all,
  leaving `policy_decisions`, `approvals`, `audit_events`, `billing_accounts`, `meter_events`, and
  `invoices` unprotected. `invoice_lines` has no `tenant_id` to protect.
- **No table has `created_by`**, which `07_DATA_MODEL_AND_STATE_MACHINES.md:5` mandates on every
  record.
- **No outbox table**, despite it being one of the most-repeated requirements in the package.
- `db/0005` bundles 10 Horizon 1 `FOUNDATION_ONLY` facility tables with 6
  `PARTNER_AND_SAFETY_GATED` autonomous-vehicle tables. Applying it wholesale materializes
  deferred-module schema.
- `db/0005:1-2` uses `ALTER TYPE … ADD VALUE`, which in PostgreSQL cannot be used in the same
  transaction that references the new value — a live hazard for any runner that wraps files in a
  transaction, and no runner constraint is documented anywhere.

## Decision

Treat the handoff SQL as **reference DDL** and never execute it.

1. Handoff SQL is copied to `db/reference/`, a path no migration runner scans. It documents intent
   and remains the preserved future architecture that Art. X.7 forbids deleting.
2. Reviewed implementation migrations live in `packages/database/migrations/` as numbered raw SQL
   pairs: `NNNN_name.up.sql` and `NNNN_name.down.sql`. **Every migration has a tested down path.**
3. A `schema_migrations` table records `version`, `name`, `checksum`, and `applied_at`. Checksums
   are verified on every run, so editing an already-applied migration fails loudly instead of
   drifting.
4. Each migration is applied in its own transaction. Migrations that cannot run transactionally
   (such as `ALTER TYPE … ADD VALUE`) must declare `-- freightos:no-transaction` on the first line,
   which the runner honours. This makes the `db/0005` hazard impossible to reproduce by accident.
5. `db/0005` is **not** applied in any form. Its facility half is Phase 1 work and will be authored
   as a reviewed migration then; its AV half stays reference-only until its own gate opens.

### The common-field contract

Defined once here, applied to every table this project creates:

| Column | Type | Rule |
|---|---|---|
| `id` | `uuid` | `PRIMARY KEY DEFAULT gen_random_uuid()` |
| `tenant_id` | `uuid` | `NOT NULL` on every tenant-owned table; the RLS discriminator |
| `legal_authority_class` | enum | `NOT NULL` on records carrying legal posture (ADR-0015) |
| `operating_context` | enum | `NOT NULL` alongside the above |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()`, maintained by trigger |
| `created_by` | `text` | `NOT NULL`, sourced from session context — closes G2 |
| `version` | `bigint` | `NOT NULL DEFAULT 1` for optimistic concurrency (`07_…:61`) |

Append-only tables (audit, outbox) deliberately omit `updated_at` and `version`: a row that must
never change has no use for a mutation counter, and carrying one would imply it may be mutated.

## Consequences

**Good.** Rollback becomes real and tested rather than asserted. The eight gaps above are fixed in
code that actually runs, while the preserved architecture stays intact for later horizons. The
transaction hazard is structurally prevented.

**Cost.** Two sources of schema truth — reference and implementation — which will drift as
implementation outpaces the reference. That drift is intended and is the point of the split; the
reference is a design record, not a build target.
