-- Down: 0016 — the standing autonomous_mobility suspension.
--
-- kill_switches is append-only: a row-level trigger rejects DELETE and a statement-level trigger
-- rejects TRUNCATE, which is exactly the protection Art. II.1 requires of incident evidence.
--
-- Removing a seed row the up migration created is the one legitimate exception, and it is made
-- narrow on purpose: the trigger is disabled only for this statement, the DELETE names the seed's
-- fixed id and nothing else, and the trigger is restored immediately. The revert is a schema
-- operation on a row that never recorded a real incident.
--
-- Disabling the trigger requires table ownership, which the migrator has and neither
-- freightos_app nor freightos_control_plane does. The append-only guarantee for every other role
-- and every other row is untouched.

-- FORCE RLS must also be lifted for the duration — F-04.
--
-- `FORCE ROW LEVEL SECURITY` binds the table owner, and kill_switches has no DELETE policy by
-- design. Disabling the trigger alone therefore left the DELETE matching zero rows under the
-- documented migrator: silently a no-op, no error, seed row still present. 0015's down then failed
-- restoring the Phase 0 `kill_switches_tenant_shape` constraint, because the row it was meant to
-- remove was still there.
--
-- This never showed up while migrations ran as a superuser, because a superuser bypasses RLS
-- outright. It is the same defect as the 0008 seed, one migration later and in the delete
-- direction.
--
-- Both protections are lifted only for this statement and restored immediately, and the row count
-- is asserted below so a future silent no-op fails loudly instead of corrupting the rollback.

ALTER TABLE kill_switches DISABLE TRIGGER kill_switches_no_delete;
ALTER TABLE kill_switches NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM kill_switches WHERE id = 'f0000000-0000-4000-8000-00000000a119';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- 0 is legitimate only when the seed was never applied — a partially reverted database. 1 is the
  -- normal revert. Anything else means the fixed id is no longer unique, which must not pass.
  IF v_deleted > 1 THEN
    RAISE EXCEPTION 'rollback refused: expected at most one seed kill switch, removed %', v_deleted;
  END IF;
END
$$;

ALTER TABLE kill_switches FORCE ROW LEVEL SECURITY;
ALTER TABLE kill_switches ENABLE TRIGGER kill_switches_no_delete;

-- The seed must be gone before 0015's down restores the narrower Phase 0 constraint.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM kill_switches WHERE id = 'f0000000-0000-4000-8000-00000000a119') THEN
    RAISE EXCEPTION
      'rollback refused: the standing autonomous_mobility suspension is still present; '
      '0015 down would fail restoring kill_switches_tenant_shape';
  END IF;
END
$$;
