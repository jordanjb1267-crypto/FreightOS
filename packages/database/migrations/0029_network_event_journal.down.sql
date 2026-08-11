-- Revert 0029 — remove the network event journal and its schema projection, strip the writer role's
-- reach in this database, and drop the role itself once no database needs it.
--
-- N3 is additive: it created two tables, one enum, one function, eight triggers, five indexes, one
-- additive N1 constraint, one N1 policy, one PostgreSQL role, and nothing else. So the revert is a
-- removal and must restore the N2 state exactly.
--
-- NO CASCADE. Every object is dropped by name, dependants first, so a dependency that should not
-- exist raises instead of being swept away silently.
--
-- THE ROLE IS THE DELICATE PART, and it is DEPENDENCY-AWARE rather than unconditional in either
-- direction. A role is a cluster-wide catalog row; a migration is per-database. So the revert first
-- makes the writer's reach in THIS database nil, then asks the cluster whether anyone else still
-- depends on it: if nobody does the role is dropped and the cluster returns to its pre-N3 role
-- inventory; if somebody does the role stays and this database's revert still SUCCEEDS. §4 carries
-- the full reasoning, including why a LOGIN service credential is treated differently from the five
-- NOLOGIN owner roles the other migrations leave in place.

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

-- A ROLE IS CLUSTER-GLOBAL; A MIGRATION IS PER-DATABASE. That asymmetry is what this section
-- resolves, and it resolves it in four ordered steps rather than by picking one horn:
--
--   A. Strip every N3 privilege, policy, grant and schema reach the writer holds IN THIS DATABASE.
--      That happens above; by the time control arrives here the writer's reach here is nil.
--   B. Ask the CLUSTER — not this database — whether anything still depends on the role.
--   C. Nothing does  → DROP the role. The cluster is back to its pre-N3 role inventory.
--   D. Something does → LEAVE the role, and STILL SUCCEED. This database is fully reverted; another
--      database legitimately remaining at N3 is not a failure of this one's rollback.
--
-- WHY NOT SIMPLY NEVER DROP, as 0007/0010/0013/0018/0020 do for their roles. Every one of those is
-- NOLOGIN, so a surviving catalog row is inert by construction and leaving it costs nothing.
-- `freightos_event_writer` is a LOGIN service credential. A genuinely standalone cluster that has
-- rolled back to N2 should not be left holding an authenticatable identity that nothing uses, so
-- when this database is the last one that needed it, the honest end state is for it to be gone.
--
-- WHY NOT SIMPLY ALWAYS DROP, OR FAIL WHEN WE CANNOT. `DROP ROLE` consults `pg_shdepend` across
-- EVERY database, and PostgreSQL offers no way to revoke a privilege in a database you are not
-- connected to. Failing here would make 0029 un-revertable on any cluster with a staging copy, a
-- clone or a parallel test database — measured: it took nine unrelated gates down at once, each
-- reporting hundreds of surviving references. A database cannot be held hostage by its neighbours.
--
-- WHY NOT `ALTER ROLE … NOLOGIN` AS A MIDDLE PATH. It is equally cluster-global. Applied while
-- another database is still at N3 it breaks that database's acceptance component, which is the same
-- error as dropping the role, reached more quietly.
--
-- `DROP OWNED` and `CASCADE` appear NOWHERE in this file. Either would reach into the other
-- database and strip privileges its running system depends on.
--
-- THE MIGRATOR'S ADMIN EDGE IS NEVER REVOKED BY HAND. It is what authorises the drop below, and
-- 0020 records what happens if it is removed instead: a plain REVOKE takes the implicit ADMIN row
-- PostgreSQL creates for a role's creator, leaving a later re-apply unable to grant the role at
-- all. When step C succeeds, `DROP ROLE` removes the membership rows itself.
DO $$
DECLARE
  v_owned   integer;
  v_elsewhere integer;
  v_holders text;
  v_self    oid := (SELECT oid FROM pg_database WHERE datname = current_database());
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_event_writer') THEN
    RETURN;
  END IF;

  -- Ownership is the one form of reach a REVOKE cannot remove, so it is raised rather than papered
  -- over. 0029 never gives the writer anything to own; if it owns something, that came from outside
  -- this migration and a revert is not entitled to decide its fate.
  SELECT count(*) INTO v_owned
    FROM pg_class c
    JOIN pg_roles r ON r.oid = c.relowner
   WHERE r.rolname = 'freightos_event_writer';
  IF v_owned <> 0 THEN
    RAISE EXCEPTION
      '0029 down: freightos_event_writer owns % relation(s). Reassign or drop them deliberately — '
      'this revert will not use DROP OWNED.', v_owned;
  END IF;

  -- STEP B. THE DETECTOR IS `pg_shdepend`, because that is the catalog `DROP ROLE` itself consults —
  -- privileges, column privileges, policies, default ACLs, ownership and database-level grants all
  -- land there, in every database. Asking it is asking PostgreSQL the same question it will ask.
  --
  -- Rows for THIS database are excluded: step A has already removed them, and §5 asserts that
  -- independently. What remains after that exclusion is, by definition, another database's.
  -- Database-level grants are recorded with `dbid = 0` and the database in `objid`, so that arm is
  -- matched separately — otherwise a lingering CONNECT here would be counted as somebody else's.
  SELECT count(*),
         coalesce(string_agg(DISTINCT coalesce(
           d.datname,
           (SELECT dd.datname FROM pg_database dd
             WHERE dd.oid = s.objid AND s.classid = 'pg_database'::regclass),
           '(cluster-wide)'), ', '), '')
    INTO v_elsewhere, v_holders
    FROM pg_shdepend s
    LEFT JOIN pg_database d ON d.oid = s.dbid
    JOIN pg_roles r ON r.oid = s.refobjid
   WHERE r.rolname = 'freightos_event_writer'
     AND NOT (s.dbid = v_self
              OR (s.classid = 'pg_database'::regclass AND s.objid = v_self));

  -- STEP D. Retained, and said out loud. This is not a partial revert: this database is done.
  IF v_elsewhere <> 0 THEN
    RAISE NOTICE
      '0029 down: database % is fully reverted. freightos_event_writer is RETAINED because % '
      'reference(s) remain in: %. The role is dropped by whichever database releases it last.',
      current_database(), v_elsewhere, v_holders;
    RETURN;
  END IF;

  -- STEP C. Nothing anywhere depends on it. Dropped through the migrator's ADMIN edge, which is the
  -- authorised path — `DROP ROLE` clears the membership rows as part of the drop.
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

  -- THE WRITER'S REACH IN THIS DATABASE IS ZERO — measured along every dimension a role can hold
  -- reach, not inferred from the REVOKEs above. 0026's postcondition makes the case: a list of
  -- revocations proves only that those revocations ran, and "the ones we remembered" is how a
  -- revert ends up almost right. Ownership is checked in §4, before anything else.
  --
  -- `pg_shdepend` is the same catalog `DROP ROLE` consults, so this asks PostgreSQL the identical
  -- question it would ask — scoped to THIS database, which is the whole of what a per-database
  -- migration is responsible for.
  SELECT count(*),
         coalesce(string_agg(DISTINCT format('%s#%s', s.classid::regclass::text, s.objid), ', '), '')
    INTO v_n, v_detail
    FROM pg_shdepend s
    JOIN pg_roles r ON r.oid = s.refobjid
   WHERE r.rolname = 'freightos_event_writer'
     AND (s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
          OR (s.classid = 'pg_database'::regclass
              AND s.objid = (SELECT oid FROM pg_database WHERE datname = current_database())));
  IF v_n <> 0 THEN
    RAISE EXCEPTION
      '0029 down: freightos_event_writer still holds % reference(s) in database %: %',
      v_n, current_database(), v_detail;
  END IF;

  -- And the same question asked the other way, because `pg_shdepend` records grants but a policy
  -- naming a role and a default ACL are worth naming explicitly rather than trusting to a catalog
  -- join nobody re-reads.
  SELECT count(*), coalesce(string_agg(format('%s on %s', policyname, tablename), ', '), '')
    INTO v_n, v_detail
    FROM pg_policies WHERE 'freightos_event_writer' = ANY (roles);
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0029 down: % policy/policies still name the writer: %', v_n, v_detail;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_default_acl
              WHERE defaclacl::text LIKE '%freightos\_event\_writer=%') THEN
    RAISE EXCEPTION '0029 down: a default ACL still names freightos_event_writer';
  END IF;

  -- THE ROLE'S FATE IS A BICONDITIONAL, and asserting it as one is what makes §4's branch honest.
  -- The role must be gone IF AND ONLY IF nothing anywhere in the cluster still depends on it. A
  -- surviving role with no cluster dependencies means the drop was SKIPPED, not deferred; a missing
  -- role while another database still holds grants would mean the drop was FORCED. Both are
  -- failures, and neither would be visible from a one-sided check.
  SELECT count(*) INTO v_n
    FROM pg_shdepend s JOIN pg_roles r ON r.oid = s.refobjid
   WHERE r.rolname = 'freightos_event_writer';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_event_writer') THEN
    IF v_n = 0 THEN
      RAISE EXCEPTION
        '0029 down: freightos_event_writer survived with NO remaining cluster dependency — '
        'the drop was skipped, not deferred';
    END IF;
  ELSIF v_n <> 0 THEN
    RAISE EXCEPTION
      '0029 down: freightos_event_writer was dropped while % cluster dependency/dependencies '
      'remained — another database was stripped', v_n;
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
