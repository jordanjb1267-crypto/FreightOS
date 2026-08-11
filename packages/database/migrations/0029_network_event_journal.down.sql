-- Revert 0029 — remove the network event journal, its schema projection and its writer role.
--
-- N3 is additive: it created two tables, one enum, one function, six triggers, four indexes, one
-- additive N1 constraint, one N1 policy, one PostgreSQL role, and nothing else. So the revert is a
-- removal and must restore the N2 state exactly.
--
-- NO CASCADE. Every object is dropped by name, dependants first, so a dependency that should not
-- exist raises instead of being swept away silently.
--
-- THE ROLE IS THE DELICATE PART. `freightos_event_writer` is CLUSTER-GLOBAL, so dropping it is not
-- a per-database act: PostgreSQL refuses to drop a role while any privilege anywhere still names
-- it. Every grant this migration made — table, column, schema and database — is revoked first, and
-- the drop is attempted only after. If the role turns out to own objects (which 0029 never gives
-- it), the drop is left undone with a loud error rather than forced with DROP OWNED, because
-- destroying an unrelated role's property to make a revert tidy is worse than a failed revert.
-- And if ANOTHER database in the cluster is still at N3, the role is retained with a warning rather
-- than dropped: a shared role may only be dropped by the last database that references it. §4
-- carries the full reasoning.

-- ---------------------------------------------------------------------------
-- §1. The N1 touches, reversed first — they are the only things 0029 changed
--     outside its own objects.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS network_participants_event_writer_read ON network_participants;
REVOKE SELECT (id, participant_type, tenant_id) ON network_participants FROM freightos_event_writer;

-- ---------------------------------------------------------------------------
-- §2. Tables, dependants first. Policies, triggers, indexes, constraints, ACLs
--     and seed rows all belong to the tables and go with them.
--
-- `network_events` references `network_schema_versions`, `network_participants` and `tenants`, and
-- references itself for correction lineage; it therefore drops first. `tenants` and the N1 registry
-- are untouched — 0029 only pointed at them.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS network_events;
DROP TABLE IF EXISTS network_schema_versions;

-- The additive N1 unique constraint that existed only to support the composite organization
-- foreign key. `id` remains the primary key, so removing this restores N1 exactly.
ALTER TABLE network_participants DROP CONSTRAINT IF EXISTS network_participants_id_type_key;

-- ---------------------------------------------------------------------------
-- §3. Function and type.
--
-- `app.reject_mutation` is a PRE-EXISTING shared helper that 0029 only attached triggers to;
-- dropping it would break the audit ledger, the outbox and the kill-switch table.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS app.network_event_acceptance();
DROP TYPE IF EXISTS app.network_event_class;

-- ---------------------------------------------------------------------------
-- §4. The writer role.
-- ---------------------------------------------------------------------------

DO $$
DECLARE r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_event_writer') THEN
    RETURN;
  END IF;

  -- Schema and database privileges outlive the tables and would each block the drop on their own.
  EXECUTE 'REVOKE ALL PRIVILEGES ON SCHEMA app, public FROM freightos_event_writer';
  EXECUTE format(
    'REVOKE ALL PRIVILEGES ON DATABASE %I FROM freightos_event_writer', current_database());

  -- TARGETED, CATALOG-DRIVEN, never blanket. `REVOKE ... ON ALL TABLES IN SCHEMA public` would
  -- reach every table in the schema, and touching a table with no explicit ACL MATERIALISES one:
  -- `schema_migrations` would go from `acl=-` to a spelled-out owner ACL, so a revert that changed
  -- nothing semantically would still leave the catalog different from where it started. Revoking
  -- only where the writer is actually named keeps the revert to the objects 0029 granted on, and
  -- catches anything a harness granted directly on the surviving N1 tables at the same time.
  FOR r IN SELECT n.nspname, c.relname
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relacl::text LIKE '%freightos\_event\_writer=%'
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON %I.%I FROM freightos_event_writer', r.nspname, r.relname);
  END LOOP;

  -- Column privileges are NOT removed by a table-level REVOKE, and N3's least-privilege design is
  -- built out of them, so they get their own sweep.
  FOR r IN SELECT n.nspname, c.relname, a.attname
             FROM pg_attribute a
             JOIN pg_class c ON c.oid = a.attrelid
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE a.attacl::text LIKE '%freightos\_event\_writer=%'
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON %I.%I FROM freightos_event_writer',
                   r.attname, r.nspname, r.relname);
  END LOOP;
END
$$;

-- A ROLE IS CLUSTER-GLOBAL; A MIGRATION IS PER-DATABASE. That asymmetry decides everything below.
--
-- `DROP ROLE` consults `pg_shdepend` across EVERY database in the cluster, and PostgreSQL offers no
-- way to revoke a privilege in a database you are not connected to. So a second FreightOS database
-- still at N3 — a staging copy, a clone, a parallel test database — makes the drop fail here no
-- matter how complete this database's revert is.
--
-- Two wrong answers were available. Failing the revert would make a correct, complete rollback of
-- THIS database report failure because of an unrelated database. `DROP OWNED`/`DROP ROLE CASCADE`
-- would reach into that other database and strip the privileges its running system depends on.
--
-- The right answer is the one the object model actually implies: a shared role may only be dropped
-- by the LAST database that references it. This migration therefore asserts hard on what it does
-- control — zero remaining references in this database — and drops the role only when no reference
-- survives anywhere. Otherwise the role is retained, loudly, naming who still holds it.
DO $$
DECLARE
  v_owned     integer;
  v_local     integer;
  v_detail    text;
  v_remaining integer;
  v_holders   text;
  v_self      oid := (SELECT oid FROM pg_database WHERE datname = current_database());
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_event_writer') THEN
    RETURN;
  END IF;

  -- Fail safely rather than destroying property. If the writer owns anything, something outside
  -- this migration gave it to them and a revert is not entitled to decide its fate.
  SELECT count(*) INTO v_owned
    FROM pg_class c
    JOIN pg_roles r ON r.oid = c.relowner
   WHERE r.rolname = 'freightos_event_writer';
  IF v_owned <> 0 THEN
    RAISE EXCEPTION
      '0029 down: freightos_event_writer owns % relation(s); refusing to drop it. '
      'Reassign or drop them deliberately — this revert will not use DROP OWNED.', v_owned;
  END IF;

  -- THE HARD GATE. Every privilege, policy and grant this migration made in THIS database must be
  -- gone. This is 0029 down's actual contract, it is fully within its control, and a leftover here
  -- is a defect in the revert rather than a fact about the cluster.
  SELECT count(*),
         coalesce(string_agg(DISTINCT format('%s#%s', s.classid::regclass::text, s.objid), ', '), '')
    INTO v_local, v_detail
    FROM pg_shdepend s
    JOIN pg_roles r ON r.oid = s.refobjid
   WHERE r.rolname = 'freightos_event_writer'
     AND (s.dbid = v_self
          OR (s.classid = 'pg_database'::regclass AND s.objid = v_self));
  IF v_local <> 0 THEN
    RAISE EXCEPTION
      '0029 down: % privilege reference(s) to freightos_event_writer remain in database %: %',
      v_local, current_database(), v_detail;
  END IF;

  -- The soft gate: anything left belongs to another database, and is not ours to remove.
  SELECT count(*),
         coalesce(string_agg(DISTINCT coalesce(
           d.datname,
           (SELECT dd.datname FROM pg_database dd
             WHERE dd.oid = s.objid AND s.classid = 'pg_database'::regclass),
           '(cluster-wide)'), ', '), '')
    INTO v_remaining, v_holders
    FROM pg_shdepend s
    LEFT JOIN pg_database d ON d.oid = s.dbid
    JOIN pg_roles r ON r.oid = s.refobjid
   WHERE r.rolname = 'freightos_event_writer';

  IF v_remaining <> 0 THEN
    RAISE WARNING
      '0029 down: database % is fully reverted, but freightos_event_writer is RETAINED because '
      '% reference(s) survive in: %. A cluster-global role may only be dropped by the last '
      'database that uses it; revert those and the drop completes there.',
      current_database(), v_remaining, v_holders;
    RETURN;
  END IF;

  EXECUTE 'DROP ROLE freightos_event_writer';
END
$$;

-- ---------------------------------------------------------------------------
-- §5. Prove the revert is total.
--
-- "The revert ran without error" is not the test. Each class of N3 artifact is asserted absent by
-- catalog lookup, and the shared helpers N3 borrowed are asserted still present — a revert that
-- took `app.reject_mutation` with it would also complete cleanly and break four other tables.
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
   WHERE c.relname IN ('network_events', 'network_schema_versions')
     AND n.nspname NOT IN ('pg_catalog', 'information_schema');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0029 down: % journal relation(s) survived the revert: %', v_n, v_detail;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
             JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'app' AND p.proname = 'network_event_acceptance') THEN
    RAISE EXCEPTION '0029 down: app.network_event_acceptance() survived the revert';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_type t
             JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = 'app' AND t.typname = 'network_event_class') THEN
    RAISE EXCEPTION '0029 down: app.network_event_class survived the revert';
  END IF;

  -- The role may legitimately survive — but ONLY because another database still references it, and
  -- only with nothing left pointing at it from here. Both halves are checked: a surviving role with
  -- no cluster-wide references means the drop was skipped for the wrong reason.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_event_writer') THEN
    SELECT count(*) INTO v_n
      FROM pg_shdepend s JOIN pg_roles r ON r.oid = s.refobjid
     WHERE r.rolname = 'freightos_event_writer'
       AND (s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
            OR (s.classid = 'pg_database'::regclass
                AND s.objid = (SELECT oid FROM pg_database WHERE datname = current_database())));
    IF v_n <> 0 THEN
      RAISE EXCEPTION
        '0029 down: freightos_event_writer survived AND still holds % reference(s) in %',
        v_n, current_database();
    END IF;

    SELECT count(*) INTO v_n
      FROM pg_shdepend s JOIN pg_roles r ON r.oid = s.refobjid
     WHERE r.rolname = 'freightos_event_writer';
    IF v_n = 0 THEN
      RAISE EXCEPTION
        '0029 down: freightos_event_writer survived the revert with no remaining cluster '
        'references — the drop was skipped, not deferred';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
              WHERE conname = 'network_participants_id_type_key') THEN
    RAISE EXCEPTION '0029 down: the additive N1 unique constraint survived the revert';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_policies
              WHERE policyname = 'network_participants_event_writer_read') THEN
    RAISE EXCEPTION '0029 down: the N1 event-writer participant policy survived the revert';
  END IF;

  -- The N1 registry itself must be intact: five tables, still RLS-forced.
  SELECT count(*) INTO v_n
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'network\_%'
     AND c.relrowsecurity AND c.relforcerowsecurity;
  IF v_n <> 5 THEN
    RAISE EXCEPTION
      '0029 down: expected the five N1 registry tables to survive RLS-forced, found %', v_n;
  END IF;

  -- Shared helpers N3 borrowed are NOT N3 artifacts.
  SELECT count(*) INTO v_n
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'app' AND p.proname IN ('reject_mutation', 'current_actor_id',
                                             'is_control_plane', 'current_tenant_id');
  IF v_n <> 4 THEN
    RAISE EXCEPTION '0029 down: reverting took a shared helper with it — % of 4 present', v_n;
  END IF;
END
$assert$;
