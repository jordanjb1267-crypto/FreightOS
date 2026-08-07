# Runbook — Database migration recovery

**Required by:** ACCEPTANCE_THRESHOLDS §4 · ADR-0017 · Constitution Art. VIII.2
**Covers:** applying, reverting and recovering the reviewed migrations in
`packages/database/migrations/`
**Status:** written at Phase 1 PR 2, when the first migration needing a documented recovery path
landed

## Trigger

A migration failed part-way, a deployment must be rolled back, or a revert was refused.

## Severity

Medium in Phase 1: there is no production deployment and no customer data. It stops being medium
the moment Phase 1 data reaches a real tenant, and the plan's §14 says the rollback strategy must be
revisited at the Horizon 1 production release gate.

## Who is authorized to act

A human operator connected as the migrator role. Not the application connection: `freightos_app` is
RLS-subject by design and has no business owning schema.

## Before the first migration, once per cluster

The migrator role must exist and own the database before anything below will run. That is the only
step in the whole lifecycle that needs a superuser:

```bash
psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
     -v migrator_password="'<from your secret manager>'" \
     -v db_name=freightos \
     -f scripts/bootstrap-migration-authority.sql
```

It creates `freightos_migrator` with `LOGIN CREATEROLE`, makes it the database owner, and gives it
admin option on any runtime role a Phase 0 cluster already carries. It refuses to finish if the
result would hold `SUPERUSER` or `BYPASSRLS`.

**Do not run migrations as a superuser, even once, even to unstick a deployment.** A superuser
bypasses row-level security outright, so a migration that cannot write through its own policies
succeeds anyway and the fault surfaces later, on somebody else's cluster. Four migrations in this
set were broken that way and looked green: the 0005 `updated_by` backfill, the 0008 permissions
seed, the 0013 admin schema, and the 0016 kill-switch seed and its revert. If a migration fails
under `freightos_migrator`, that is the finding — fix the migration.

## The rules that make recovery possible

1. **Every migration ships a down file.** The runner rejects a migration without one at load time,
   so a migration that cannot be rolled back never reaches a database.
2. **Every migration is checksummed.** Editing one that has already been applied fails loudly
   rather than drifting.
3. **Each migration runs in its own transaction**, unless it declares
   `-- freightos:no-transaction` on its first line. A failure inside a transactional migration
   leaves nothing behind.
4. **Reverts run in reverse order and stop at the first failure.** Everything after the failure is
   already off; everything at and before it is still on.

## Normal operation

```bash
pnpm db:status          # what is applied, and whether any applied file has been edited
pnpm db:up              # apply everything outstanding
pnpm db:down            # revert one step
pnpm db:down all        # revert everything — deliberate, never a typo
```

## Recovering a failed apply

1. `pnpm db:status`. The failed migration is `pending`; everything before it is `applied`.
2. Read the error. A transactional migration left nothing behind, so the database is consistent at
   the previous version.
3. Fix the migration file **only if it has never been applied anywhere**. If it has, write a new
   migration instead — editing an applied one fails the checksum check for everybody else.
4. `pnpm db:up`.

If the failure was in `0014_kill_switch_scope_values` — the one non-transactional migration — check
whether the enum values were added before the failure:

```sql
SELECT unnest(enum_range(NULL::app.kill_switch_scope));
```

Both statements are idempotent (`ADD VALUE IF NOT EXISTS`), so re-running is safe.

## Recovering a failed revert

`pnpm db:down all` stops at the first down migration that fails. `pnpm db:status` shows exactly
where it stopped. Fix the cause, then re-run — the migrations already reverted are not revisited.

## Reverting the kill-switch scope expansion

**This is the one revert that refuses rather than proceeding, and it does so on purpose.**

`0014_kill_switch_scope_values` rebuilds `app.kill_switch_scope` without `legal_entity` and
`operating_context`. PostgreSQL has no `ALTER TYPE … DROP VALUE`, so the type is recreated and the
column re-typed onto it — and that cannot happen while any row still holds one of the two values.

The down migration checks first and raises:

```
cannot revert the kill-switch scope expansion: N row(s) still use the legal_entity or
operating_context scope.
```

It refuses rather than remapping because a kill switch is incident evidence. Silently moving one to
a surviving scope would falsify the record of what was halted and why.

**Recovery procedure.**

1. Identify the rows:

   ```sql
   SELECT id, scope, scope_ref, tenant_id, mode, reason, engaged_at, released_at
     FROM kill_switches
    WHERE scope::text IN ('legal_entity', 'operating_context');
   ```

2. **Export them.** They are evidence, and step 4 destroys them.

   ```sql
   \copy (SELECT * FROM kill_switches WHERE scope::text IN ('legal_entity','operating_context'))
     TO 'kill-switches-oq19.csv' CSV HEADER
   ```

3. **Re-engage anything still in force under a surviving scope**, before removing it. A
   `legal_entity` switch usually maps to `tenant` scope; an `operating_context` switch usually maps
   to `system` or `legal_plane`. This is a judgement call and belongs to the operator, not to the
   migration — which is why the migration does not attempt it.

4. **Remove the rows.** `kill_switches` is append-only for every role, so this needs table
   ownership and must be recorded as an incident action:

   ```sql
   BEGIN;
   ALTER TABLE kill_switches DISABLE TRIGGER kill_switches_no_delete;
   DELETE FROM kill_switches WHERE scope::text IN ('legal_entity', 'operating_context');
   ALTER TABLE kill_switches ENABLE TRIGGER kill_switches_no_delete;
   COMMIT;
   ```

5. `pnpm db:down all` (or to the target version) now proceeds.

`0016_autonomous_mobility_standing_suspension` removes the standing suspension seed the same way,
scoped to that one fixed id, and the runner reverts it before `0014` — so a database carrying only
the seed needs none of the above.

## Reverting the ADR-0021 common-field alignment

`0005_common_field_alignment` renames `tenants.version` to `record_version` and adds `updated_by`.
Its down restores both. Two ordering facts matter, and both are already handled in the files:

- The **up** replaces `app.bump_version()` _before_ backfilling `updated_by`, because the backfill
  is an `UPDATE` that fires the trigger. A function still naming the old column would pass on an
  empty database and fail on one holding a tenant row.
- The **down** restores the Phase 0 function body _before_ renaming the column back, for the same
  reason in reverse.

The backfill runs with the table's user triggers disabled: adding a column is a schema change, not
a business mutation, and letting it bump `record_version` would record a migration as an edit
somebody made.

## Reverting OQ-20 purpose and outcome

`0006_audit_purpose_and_outcome` reverts cleanly, and **discards the recorded purpose and outcome
of every privileged operation**. Export the audit ledger first in any environment that has served a
privileged call:

```sql
\copy (SELECT * FROM audit_events WHERE operation_class = 'privileged')
  TO 'privileged-audit.csv' CSV HEADER
```

## Ordering constraint

PR 2's migrations reference only Phase 0 tables and each other, so reverting them is clean today.
From PR 3 onward it is not: later PRs' tables reference PR 2's, so rolling back PR _n_ requires
rolling back PRs _n+1_ … _10_ first. The runner enforces reverse order; the operator must still
plan for what that unwinds.

## Data loss

Reverting a Phase 1 migration drops its tables and their data. Acceptable in Phase 1 — no
production deployment, no customer data, no external system holding a reference. **This stops being
true the moment Phase 1 data reaches a real tenant.**

Reverting `0009_users_and_memberships` discards `PERSONAL` data. Export under the retention rules
first (retention periods are an owner deliverable, OQ-12).

Reverting `0011_service_accounts` removes credential _references_. The referenced secrets live
outside this database and are **not** removed. Revoking them in the external store is a separate,
manual step, and skipping it leaves live credentials pointing at nothing.

## Verification

After any recovery:

```bash
pnpm db:status          # every migration applied, no checksum problem
pnpm test:integration   # 248 assertions, including apply/revert/re-apply from empty and from the
                        # accepted Phase 0 baseline
```

## Evidence to capture

`pnpm db:status` before and after, the exact error, any export taken in step 2, the rows removed in
step 4, and the passing integration run.
