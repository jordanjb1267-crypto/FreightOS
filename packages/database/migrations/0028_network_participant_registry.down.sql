-- Revert 0028 — remove the network participant registry entirely.
--
-- N1 is purely additive: it created five tables, three enums and five functions, and it changed
-- nothing that existed before it. So the revert is a removal and nothing else. This file must not
-- "restore" anything, because nothing was displaced.
--
-- WHY THE ORDER IS EXPLICIT AND WHY THERE IS NO CASCADE. `DROP ... CASCADE` on a table would
-- silently take anything that had come to depend on it, which is exactly the class of accident a
-- down migration must not commit. Each object is dropped by name, dependants first, so a
-- dependency that should not exist raises instead of being swept away.
--
-- Policies, triggers, indexes, constraints, table comments, column comments, seed rows and table
-- ACLs are all owned by the tables and disappear with them. Nothing here revokes a grant on an
-- object that survives, because 0028 granted nothing on an object it did not create.

-- ---------------------------------------------------------------------------
-- §1. Tables, dependants first.
--
-- relationships and aliases reference participants; participants references itself and `tenants`;
-- the two reference tables are referenced BY aliases and relationships, so they go last.
-- `tenants` is untouched: 0028 only pointed at it.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS network_participant_relationships;
DROP TABLE IF EXISTS network_participant_aliases;
DROP TABLE IF EXISTS network_participants;
DROP TABLE IF EXISTS network_relationship_types;
DROP TABLE IF EXISTS network_alias_namespaces;

-- ---------------------------------------------------------------------------
-- §2. Functions.
--
-- All five are new in 0028 and referenced only by triggers on the tables above, which are already
-- gone. `app.set_updated_at` and `app.bump_version` are PRE-EXISTING shared helpers that 0028 only
-- attached triggers to — dropping them here would break every other table in the schema.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS app.network_relationship_endpoints_ok();
DROP FUNCTION IF EXISTS app.network_relationship_immutable();
DROP FUNCTION IF EXISTS app.network_alias_immutable();
DROP FUNCTION IF EXISTS app.network_participant_immutable();
DROP FUNCTION IF EXISTS app.network_set_provenance();

-- ---------------------------------------------------------------------------
-- §3. Enums, last — the tables that used them are gone.
-- ---------------------------------------------------------------------------

DROP TYPE IF EXISTS app.network_alias_verification_status;
DROP TYPE IF EXISTS app.network_participant_status;
DROP TYPE IF EXISTS app.network_participant_type;

-- ---------------------------------------------------------------------------
-- §4. Prove the revert is total.
--
-- "The migration ran without error" is not the test — migration-path-parity exists because three
-- down migrations completed successfully and left the database wrong. This block asserts the
-- absence of every N1 artifact class by catalog lookup, and it asserts the SURVIVAL of the shared
-- helpers 0028 borrowed, because a revert that took `app.set_updated_at` with it would also
-- complete without error and break everything else.
-- ---------------------------------------------------------------------------

DO $assert$
DECLARE
  v_n integer;
  v_detail text;
BEGIN
  SELECT count(*), coalesce(string_agg(format('%s.%s', n.nspname, c.relname), ', '), '')
    INTO v_n, v_detail
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relname LIKE 'network\_%'
     AND n.nspname NOT IN ('pg_catalog', 'information_schema');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0028 down: % network relation(s) survived the revert: %', v_n, v_detail;
  END IF;

  SELECT count(*), coalesce(string_agg(p.proname, ', '), '') INTO v_n, v_detail
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'app' AND p.proname LIKE 'network\_%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0028 down: % network function(s) survived the revert: %', v_n, v_detail;
  END IF;

  SELECT count(*), coalesce(string_agg(t.typname, ', '), '') INTO v_n, v_detail
    FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'app' AND t.typname LIKE 'network\_%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0028 down: % network type(s) survived the revert: %', v_n, v_detail;
  END IF;

  SELECT count(*) INTO v_n FROM pg_catalog.pg_policies WHERE tablename LIKE 'network\_%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0028 down: % network policy/policies survived the revert', v_n;
  END IF;

  -- The shared helpers 0028 attached triggers to are NOT N1 artifacts and must still be here.
  SELECT count(*) INTO v_n
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'app' AND p.proname IN ('set_updated_at', 'bump_version', 'current_actor_id');
  IF v_n <> 3 THEN
    RAISE EXCEPTION
      '0028 down: reverting took a shared helper with it — % of 3 present', v_n;
  END IF;
END
$assert$;
