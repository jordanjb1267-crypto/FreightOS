-- 0005 — ADR-0021 common-field alignment against Phase 0.
--
-- ADR-0021 §"Consistency obligations against Phase 0" assigns three changes to PR 2. Two are here;
-- the third (audit_events.purpose/outcome) is 0006, because it is a different concern and
-- ADR-0017 §2 wants narrow reviewed migrations rather than convenient bundles.
--
--   version -> record_version   `version` collides with policy version, formula version, contract
--                               version and adapter version, all of which Phase 1 also stores.
--   + updated_by                Mutation attribution on the row rather than reconstructed from
--                               the ledger.
--
-- Also adds the two session accessors Phase 1 RLS needs. `app.legal_entity_id` is already set by
-- packages/database/src/session.ts but has had no reader; `app.organization_node_id` is new and is
-- read by the identity policies in 0007 onward. Both return NULL when unset, which is what makes
-- the policies fail closed — ADR-0021 requires an exception to fail closed when parent context is
-- inconsistent, and NULL comparison is never true.

-- ---------------------------------------------------------------------------
-- tenants: rename the concurrency counter and add mutation attribution.
-- ---------------------------------------------------------------------------

ALTER TABLE tenants RENAME COLUMN version TO record_version;

-- The shared trigger function follows the rename immediately, and BEFORE the backfill below: the
-- backfill is an UPDATE, so it fires tenants_bump_version, and a function still referencing the old
-- column name would fail on any database that already holds a tenant row. From-empty would pass and
-- upgrade-from-baseline would not, which is the worst shape a migration bug can take.
CREATE OR REPLACE FUNCTION app.bump_version() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.record_version <> OLD.record_version THEN
    RAISE EXCEPTION 'record_version is managed by the database and cannot be set directly'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  NEW.record_version := OLD.record_version + 1;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION app.bump_version IS
  'ADR-0021. Owns record_version so a client cannot forge it. Every mutable Phase 1 table '
  'attaches this trigger.';

-- Backfilled from created_by rather than a literal: the row's last mutation, absent any better
-- evidence, is its creation. A placeholder such as 'unknown' would put a value in the audit path
-- that names nobody.
--
-- Triggers are disabled across the backfill. Adding a column is a schema change, not a business
-- mutation, and letting it bump record_version and stamp updated_at would misattribute a migration
-- as an edit somebody made. DISABLE TRIGGER USER requires table ownership, which the migrator has
-- and neither freightos_app nor freightos_control_plane does.
ALTER TABLE tenants ADD COLUMN updated_by text;
ALTER TABLE tenants DISABLE TRIGGER USER;
UPDATE tenants SET updated_by = created_by WHERE updated_by IS NULL;
ALTER TABLE tenants ENABLE TRIGGER USER;
ALTER TABLE tenants ALTER COLUMN updated_by SET NOT NULL;

COMMENT ON COLUMN tenants.record_version IS
  'ADR-0021. Database-owned optimistic concurrency counter. Renamed from `version`, which '
  'collides with policy, formula, contract and adapter versions.';
COMMENT ON COLUMN tenants.updated_by IS
  'ADR-0021. Who performed the last mutation, sourced from session context.';

-- ---------------------------------------------------------------------------
-- Session accessors for the two isolation columns ADR-0021 adds.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.current_legal_entity_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.legal_entity_id', true), '')::uuid
$$;
COMMENT ON FUNCTION app.current_legal_entity_id IS
  'NULL when unset. `legal_entity_id = NULL` is NULL, never true, so a policy predicate built on '
  'this fails closed rather than opening up — Constitution Art. I.2.';

CREATE FUNCTION app.current_organization_node_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.organization_node_id', true), '')::uuid
$$;
COMMENT ON FUNCTION app.current_organization_node_id IS
  'NULL when unset, and fails closed for the same reason as app.current_legal_entity_id.';

-- ---------------------------------------------------------------------------
-- Shared triggers for the mutation-attribution column.
--
-- On insert, `updated_by` defaults to `created_by` — a row's first author is also its last, and
-- making every caller repeat the value invites the two to drift.
--
-- On update, an explicitly supplied value wins; otherwise the session actor is taken. The last
-- resort is the previous author, which is what a trigger-driven cascade (an organization-node
-- move re-depthing its descendants, for example) resolves to: the cascade is attributable to the
-- operation that caused it, and that operation's author is already on the row.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.set_created_row_actor() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.updated_by IS NULL THEN
    NEW.updated_by := NEW.created_by;
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION app.set_updated_by() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.updated_by IS NOT DISTINCT FROM OLD.updated_by THEN
    NEW.updated_by := coalesce(app.current_actor_id(), OLD.updated_by);
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER tenants_set_created_row_actor
  BEFORE INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION app.set_created_row_actor();

CREATE TRIGGER tenants_set_updated_by
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_by();
