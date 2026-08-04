# Provenance — reference DDL

Generated from **FreightOS Production Handoff v1.2** (`docs/production-handoff/v1.2/db/`), which
is immutable and byte-pinned by `SHA256SUMS.txt`.

## This SQL is never executed

Owner ruling 2 and ADR-0017: the handoff SQL is **reference DDL**, not migration SQL. It documents
intent and preserves future architecture that Constitution Art. X.7 forbids deleting. It is
deliberately placed at a path no migration runner scans.

Reviewed implementation migrations live in **`packages/database/migrations/`**.

## Why it cannot be run as-is

- **No down migrations exist**, while Art. VIII.2 requires rollback on every release and
  `00_MASTER_HANDOFF:269` requires that migrations recover.
- **No version table, runner, checksum, or ordering metadata** beyond filenames.
- **Zero `CREATE POLICY` statements.** `0003` and `0004` enable RLS on no tables at all, leaving
  `policy_decisions`, `approvals`, `audit_events`, `billing_accounts`, `meter_events` and
  `invoices` unprotected. `invoice_lines` has no `tenant_id` to protect.
- **No table has `created_by`**, which `07_DATA_MODEL:5` mandates on every record.
- **No outbox table**, despite it being among the most-repeated requirements in the package.
- `0005` bundles 10 Horizon 1 `FOUNDATION_ONLY` facility tables with 6
  `PARTNER_AND_SAFETY_GATED` autonomous-vehicle tables. Applying it wholesale would materialise
  deferred-module schema.
- `0005:1-2` uses `ALTER TYPE … ADD VALUE`, which PostgreSQL cannot use in the same transaction
  that adds it — a live hazard for any runner that wraps files in a transaction, documented
  nowhere in the handoff. The implementation runner honours a
  `-- freightos:no-transaction` directive so this cannot be reproduced by accident.

An integration test asserts that none of these files appear in the migration set and that the
deferred AV tables are absent from the database.
