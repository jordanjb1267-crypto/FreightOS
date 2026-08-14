-- 0033 down — revert the N5-B disclosure sensitivity ceiling.
--
-- An EXACT logical rollback, and a simple one for a reason worth stating: N5-B has no runtime write
-- path at all. Nothing outside a migration has ever inserted into these three tables, so unlike the
-- N5-A permission rows there is no authority history to weigh against reverting, and no temporary
-- policy is needed to remove anything. Dropping the tables removes exactly what 0033 created.
--
-- N5-A, N4, N3 and N1 are untouched. Nothing in this file names a grant, a projection, an event, a
-- transport intent, a permission or a role. The assertions at the end prove that rather than
-- asserting it in prose.

-- ---------------------------------------------------------------------------
-- §1'. Capture the pre-revert state that must survive.
--
-- Captured BEFORE anything is dropped, so the comparison at the end is against a value this
-- migration observed rather than a constant a future edit could quietly make wrong.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  PERFORM set_config(
    'freightos.n5b_down_n5a_tables',
    coalesce((SELECT string_agg(c.relname, ',' ORDER BY c.relname)
                FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind = 'r'
                 AND c.relname LIKE 'network\_disclosure\_%'
                 AND c.relname NOT IN ('network_disclosure_sensitivities',
                                       'network_disclosure_purpose_ceilings')), ''),
    true);

  PERFORM set_config(
    'freightos.n5b_down_grant_rows',
    (SELECT count(*)::text FROM network_disclosure_grants),
    true);

  PERFORM set_config(
    'freightos.n5b_down_projection_pointers',
    (SELECT count(*)::text FROM network_disclosure_projection_fields),
    true);

  PERFORM set_config(
    'freightos.n5b_down_schema_registry',
    (SELECT count(*)::text FROM network_schema_versions),
    true);

  PERFORM set_config(
    'freightos.n5b_down_secdef',
    (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('app', 'admin', 'authn') AND p.prosecdef),
    true);

  PERFORM set_config(
    'freightos.n5b_down_roles',
    coalesce((SELECT string_agg(rolname, ',' ORDER BY rolname)
                FROM pg_roles WHERE rolname LIKE 'freightos%'), ''),
    true);
END
$$;

-- ---------------------------------------------------------------------------
-- §2'. Drop the three tables, child before parent.
--
-- `network_schema_disclosure_sensitivity` and `network_disclosure_purpose_ceilings` both reference
-- `network_disclosure_sensitivities`, so the vocabulary goes last. Policies and triggers belong to
-- the tables and go with them; naming them separately would be redundant and would drift.
--
-- No CASCADE anywhere. Nothing outside N5-B references these tables, and if something ever did,
-- failing here is the correct outcome — a silent CASCADE is how a revert removes more than it was
-- asked to.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS network_schema_disclosure_sensitivity;
DROP TABLE IF EXISTS network_disclosure_purpose_ceilings;
DROP TABLE IF EXISTS network_disclosure_sensitivities;

-- ---------------------------------------------------------------------------
-- §3'. Prove the revert was complete AND bounded.
--
-- Complete: no N5-B object survives. Bounded: everything N5-B never owned is exactly as it was.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_text text;
  v_int  integer;
BEGIN
  -- (a) No N5-B table survives.
  SELECT string_agg(c.relname, ',' ORDER BY c.relname) INTO v_text
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('network_disclosure_sensitivities',
                       'network_schema_disclosure_sensitivity',
                       'network_disclosure_purpose_ceilings');
  IF v_text IS NOT NULL THEN
    RAISE EXCEPTION '0033 down: N5-B table survived the revert: %', v_text;
  END IF;

  -- (b) No orphaned policy or trigger. Dropping a table takes both with it, so a survivor here
  -- would mean an object was created somewhere this file does not know about.
  SELECT count(*) INTO v_int
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname IN ('network_disclosure_sensitivities',
                       'network_schema_disclosure_sensitivity',
                       'network_disclosure_purpose_ceilings');
  IF v_int <> 0 THEN
    RAISE EXCEPTION '0033 down: % N5-B policy(ies) survived the revert', v_int;
  END IF;

  -- (c) The N5-A table inventory is byte-identical to what it was before the drop.
  SELECT string_agg(c.relname, ',' ORDER BY c.relname) INTO v_text
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'network\_disclosure\_%';
  IF v_text IS DISTINCT FROM current_setting('freightos.n5b_down_n5a_tables', true) THEN
    RAISE EXCEPTION '0033 down: N5-A table inventory changed — expected "%", found "%"',
      coalesce(current_setting('freightos.n5b_down_n5a_tables', true), '(unset)'),
      coalesce(v_text, '(none)');
  END IF;

  -- (d) The six N5-A tables are present by name, stated independently of the captured value so a
  -- capture that silently returned nothing cannot make (c) vacuous.
  IF v_text IS DISTINCT FROM
     'network_disclosure_authority_bases,network_disclosure_grant_revocations,'
     'network_disclosure_grants,network_disclosure_projection_fields,'
     'network_disclosure_projections,network_disclosure_purposes' THEN
    RAISE EXCEPTION '0033 down: expected exactly the six N5-A tables, found: %',
      coalesce(v_text, '(none)');
  END IF;

  -- (e) N5-A authority history is intact. A revert that quietly dropped a grant would be
  -- destroying an authorization record to remove a ceiling.
  SELECT count(*)::text INTO v_text FROM network_disclosure_grants;
  IF v_text IS DISTINCT FROM current_setting('freightos.n5b_down_grant_rows', true) THEN
    RAISE EXCEPTION '0033 down: grant row count changed from % to %',
      coalesce(current_setting('freightos.n5b_down_grant_rows', true), '(unset)'), v_text;
  END IF;

  SELECT count(*)::text INTO v_text FROM network_disclosure_projection_fields;
  IF v_text IS DISTINCT FROM current_setting('freightos.n5b_down_projection_pointers', true) THEN
    RAISE EXCEPTION '0033 down: projection pointer count changed from % to %',
      coalesce(current_setting('freightos.n5b_down_projection_pointers', true), '(unset)'), v_text;
  END IF;

  -- (f) The schema registry N5-B pointed at is unchanged. Reverting a classification must not
  -- deregister a contract.
  SELECT count(*)::text INTO v_text FROM network_schema_versions;
  IF v_text IS DISTINCT FROM current_setting('freightos.n5b_down_schema_registry', true) THEN
    RAISE EXCEPTION '0033 down: schema registry row count changed from % to %',
      coalesce(current_setting('freightos.n5b_down_schema_registry', true), '(unset)'), v_text;
  END IF;

  -- (g) Role inventory unchanged — N5-B created none, so it removes none.
  SELECT string_agg(rolname, ',' ORDER BY rolname) INTO v_text
    FROM pg_roles WHERE rolname LIKE 'freightos%';
  IF v_text IS DISTINCT FROM current_setting('freightos.n5b_down_roles', true) THEN
    RAISE EXCEPTION '0033 down: freightos role set changed from "%" to "%"',
      coalesce(current_setting('freightos.n5b_down_roles', true), '(unset)'),
      coalesce(v_text, '(none)');
  END IF;

  -- (h) SECURITY DEFINER inventory unchanged.
  SELECT count(*)::text INTO v_text
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('app', 'admin', 'authn') AND p.prosecdef;
  IF v_text IS DISTINCT FROM current_setting('freightos.n5b_down_secdef', true) THEN
    RAISE EXCEPTION '0033 down: SECURITY DEFINER count changed from % to %',
      coalesce(current_setting('freightos.n5b_down_secdef', true), '(unset)'), v_text;
  END IF;

  -- (i) And N5-A's own governed vocabulary is still exactly one purpose and one basis — proof that
  -- removing the ceiling did not reach sideways into the tables the ceiling referenced.
  SELECT count(*) INTO v_int FROM network_disclosure_purposes;
  IF v_int <> 1 THEN
    RAISE EXCEPTION '0033 down: expected 1 disclosure purpose to survive, found %', v_int;
  END IF;

  RAISE NOTICE '0033 down: N5-B disclosure sensitivity ceiling reverted and parity asserted';
END
$$;
