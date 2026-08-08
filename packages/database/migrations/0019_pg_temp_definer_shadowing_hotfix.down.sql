-- 0019 down — restore the exact pre-hotfix baseline, including the vulnerability.
--
-- A down migration reverts a change; it does not editorialise. Reverting past 0019 REOPENS the
-- CRITICAL pg_temp shadowing class:
--   * PUBLIC regains TEMPORARY on the database, so any connectable role can create shadow relations;
--   * every SECURITY DEFINER goes back to `pg_catalog, public` (pg_temp searched first);
--   * app.user_has_permission goes back to having no pinned path at all.
--
-- SECURITY-SENSITIVE ROLLBACK. Rolling a production database back past this migration reintroduces
-- an exploitable authority-crossing and provenance-forgery defect. This down path exists for
-- round-trip correctness and disaster recovery, not as a routine operation. Do not roll production
-- back past 0019 without a compensating control.

-- §2b'. app.user_has_permission had NO proconfig before the hotfix — RESET removes the one we added.
ALTER FUNCTION app.user_has_permission(uuid, uuid, text, timestamptz) RESET search_path;

-- §2'. Every SECURITY DEFINER goes back to the exact prior pin, `pg_catalog, public`. SET (not
-- RESET): these functions were created WITH a pinned path, so RESET would drop the proconfig
-- entirely and leave a definer with no path — a different, worse state than the one being restored.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS signature, pg_get_userbyid(p.proowner) AS owner
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('app', 'admin') AND p.prosecdef
     ORDER BY 2, 1
  LOOP
    EXECUTE format('SET LOCAL ROLE %I', r.owner);
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public', r.signature);
    RESET ROLE;
  END LOOP;
END
$$;

-- §1'. PUBLIC regains TEMPORARY — PostgreSQL's own default, and the state every migration up to
-- 0018 ran under.
DO $$
BEGIN
  EXECUTE format('GRANT TEMPORARY ON DATABASE %I TO PUBLIC', current_database());
END
$$;
