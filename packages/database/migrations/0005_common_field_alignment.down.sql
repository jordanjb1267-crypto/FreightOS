-- Down: 0005 — ADR-0021 common-field alignment.

DROP TRIGGER IF EXISTS tenants_set_updated_by ON tenants;
DROP TRIGGER IF EXISTS tenants_set_created_row_actor ON tenants;
DROP FUNCTION IF EXISTS app.set_updated_by();
DROP FUNCTION IF EXISTS app.set_created_row_actor();
DROP FUNCTION IF EXISTS app.current_organization_node_id();
DROP FUNCTION IF EXISTS app.current_legal_entity_id();

-- Restore the Phase 0 body before restoring the Phase 0 column name, so the function never
-- references a column that does not exist.
CREATE OR REPLACE FUNCTION app.bump_version() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.version <> OLD.version THEN
    RAISE EXCEPTION 'version is managed by the database and cannot be set directly'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  NEW.version := OLD.version + 1;
  RETURN NEW;
END
$$;

ALTER TABLE tenants DROP COLUMN IF EXISTS updated_by;
ALTER TABLE tenants RENAME COLUMN record_version TO version;
