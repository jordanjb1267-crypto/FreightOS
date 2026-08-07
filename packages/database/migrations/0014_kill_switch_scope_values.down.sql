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
--
-- EVERY STATEMENT HERE IS RE-RUNNABLE — F-09.
--
-- 0014 carries the no-transaction marker, and the runner honours it in BOTH directions: this file
-- executes with no transaction wrapped around it. A failure part-way therefore commits everything
-- before it and leaves the database in a state no other migration describes — policies dropped,
-- the enum half rebuilt, the column pointing at whichever type the failure interrupted.
--
-- As originally written, re-running was not a recovery: `DROP POLICY` without IF EXISTS failed on
-- the policy the first attempt had already dropped, `CREATE TYPE` failed on the type it had
-- already created, and the operator was left hand-editing a half-reverted schema during whatever
-- incident prompted the rollback. That is the one migration in the set where "just run it again"
-- had to work and did not.
--
-- So each step is conditional on the state it finds rather than on the state it assumes. The enum
-- rebuild in particular is a small state machine: not started, rebuilt type created, column
-- retyped, old type dropped, renamed — and it resumes from any of them. Running this file on an
-- already-reverted database is a no-op, which is the same property the up direction has.

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

DROP POLICY IF EXISTS kill_switches_release ON kill_switches;
DROP POLICY IF EXISTS kill_switches_write ON kill_switches;
DROP POLICY IF EXISTS kill_switches_read ON kill_switches;

DROP INDEX IF EXISTS kill_switches_one_active_per_subject;
DROP INDEX IF EXISTS kill_switches_active_idx;

ALTER TABLE kill_switches
  DROP CONSTRAINT IF EXISTS kill_switches_scope_ref_shape,
  DROP CONSTRAINT IF EXISTS kill_switches_tenant_shape;

-- The enum rebuild, resumable from any point it may have stopped at.
DO $$
DECLARE
  v_column_type text;
  v_rebuilt_exists boolean;
  v_original_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE n.nspname = 'app' AND t.typname = 'kill_switch_scope__rebuilt')
    INTO v_rebuilt_exists;
  SELECT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE n.nspname = 'app' AND t.typname = 'kill_switch_scope')
    INTO v_original_exists;
  SELECT format_type(a.atttypid, NULL) INTO v_column_type
    FROM pg_attribute a
   WHERE a.attrelid = 'kill_switches'::regclass AND a.attname = 'scope' AND NOT a.attisdropped;

  -- Already reverted: the only type is app.kill_switch_scope and it carries the Phase 0 seven.
  IF NOT v_rebuilt_exists AND v_original_exists
     AND (SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
           JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'app' AND t.typname = 'kill_switch_scope') = 7 THEN
    RETURN;
  END IF;

  -- A rebuilt type left over from an attempt that died before retyping the column is scrap.
  -- Dropping and recreating it is safe precisely because nothing references it yet.
  IF v_rebuilt_exists AND v_column_type <> 'app.kill_switch_scope__rebuilt' THEN
    DROP TYPE app.kill_switch_scope__rebuilt;
    v_rebuilt_exists := false;
  END IF;

  IF NOT v_rebuilt_exists THEN
    CREATE TYPE app.kill_switch_scope__rebuilt AS ENUM (
      'system', 'legal_plane', 'tenant', 'workflow', 'agent', 'tool', 'integration');
  END IF;

  IF v_column_type <> 'app.kill_switch_scope__rebuilt' THEN
    ALTER TABLE kill_switches
      ALTER COLUMN scope TYPE app.kill_switch_scope__rebuilt
      USING scope::text::app.kill_switch_scope__rebuilt;
  END IF;

  IF v_original_exists THEN
    DROP TYPE app.kill_switch_scope;
  END IF;

  ALTER TYPE app.kill_switch_scope__rebuilt RENAME TO kill_switch_scope;
END
$$;

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

CREATE UNIQUE INDEX IF NOT EXISTS kill_switches_one_active_per_subject
  ON kill_switches (scope, coalesce(scope_ref, ''))
  WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS kill_switches_active_idx
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
