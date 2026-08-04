-- Down: 0014 — OQ-19, part 1.
--
-- PostgreSQL has no ALTER TYPE ... DROP VALUE, so the enum is rebuilt without the two values and
-- the column is re-typed onto it. That is a real, tested revert rather than a
-- documented-recovery placeholder.
--
-- It REFUSES rather than rewrites when any row still holds one of the new values. A kill switch is
-- incident evidence; silently remapping it to a different scope would falsify the record of what
-- was halted and why. The recovery path for a database that has such rows is in
-- docs/runbooks/database-migration-recovery.md §"Reverting the kill-switch scope expansion" —
-- export, release, and re-engage under a scope that survives the revert.
--
-- Everything that references the `scope` column has to come off before the type changes and go
-- back on after: PostgreSQL refuses to retype a column a policy references, and it stores each
-- CHECK expression with the enum's OID baked into its literals, so a surviving constraint would
-- compare the rebuilt type against the old one. Every definition recreated below is the Phase 0
-- original from 0004_kill_switches.up.sql — 0015's down has already restored the policies and the
-- tenant-shape constraint to those same definitions by the time this runs.
--
-- 0015 must already have been reverted, since it is what uses the new values. The runner unwinds
-- in reverse order, so that ordering is automatic.

DO $$
DECLARE
  v_blocking integer;
BEGIN
  SELECT count(*) INTO v_blocking
    FROM kill_switches
   WHERE scope::text IN ('legal_entity', 'operating_context');

  IF v_blocking > 0 THEN
    RAISE EXCEPTION
      'cannot revert the kill-switch scope expansion: % row(s) still use the legal_entity or '
      'operating_context scope. See docs/runbooks/database-migration-recovery.md '
      '"Reverting the kill-switch scope expansion".', v_blocking
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
END
$$;

DROP POLICY kill_switches_release ON kill_switches;
DROP POLICY kill_switches_write ON kill_switches;
DROP POLICY kill_switches_read ON kill_switches;

DROP INDEX IF EXISTS kill_switches_one_active_per_subject;
DROP INDEX IF EXISTS kill_switches_active_idx;

ALTER TABLE kill_switches
  DROP CONSTRAINT IF EXISTS kill_switches_scope_ref_shape,
  DROP CONSTRAINT IF EXISTS kill_switches_tenant_shape;

CREATE TYPE app.kill_switch_scope__rebuilt AS ENUM (
  'system',
  'legal_plane',
  'tenant',
  'workflow',
  'agent',
  'tool',
  'integration'
);

ALTER TABLE kill_switches
  ALTER COLUMN scope TYPE app.kill_switch_scope__rebuilt
  USING scope::text::app.kill_switch_scope__rebuilt;

DROP TYPE app.kill_switch_scope;
ALTER TYPE app.kill_switch_scope__rebuilt RENAME TO kill_switch_scope;

ALTER TABLE kill_switches
  ADD CONSTRAINT kill_switches_scope_ref_shape
    CHECK ((scope = 'system') = (scope_ref IS NULL)),
  ADD CONSTRAINT kill_switches_tenant_shape
    CHECK (
      CASE
        WHEN scope IN ('system', 'legal_plane') THEN tenant_id IS NULL
        ELSE tenant_id IS NOT NULL
      END
    );

CREATE UNIQUE INDEX kill_switches_one_active_per_subject
  ON kill_switches (scope, coalesce(scope_ref, ''))
  WHERE released_at IS NULL;

CREATE INDEX kill_switches_active_idx
  ON kill_switches (scope, scope_ref)
  WHERE released_at IS NULL;

CREATE POLICY kill_switches_read ON kill_switches
  FOR SELECT
  USING (
    app.is_control_plane()
    OR scope IN ('system', 'legal_plane')
    OR tenant_id = app.current_tenant_id()
  );

CREATE POLICY kill_switches_write ON kill_switches
  FOR INSERT
  WITH CHECK (
    app.is_control_plane()
    OR (scope NOT IN ('system', 'legal_plane') AND tenant_id = app.current_tenant_id())
  );

CREATE POLICY kill_switches_release ON kill_switches
  FOR UPDATE
  USING (
    app.is_control_plane()
    OR (scope NOT IN ('system', 'legal_plane') AND tenant_id = app.current_tenant_id())
  )
  WITH CHECK (
    app.is_control_plane()
    OR (scope NOT IN ('system', 'legal_plane') AND tenant_id = app.current_tenant_id())
  );
