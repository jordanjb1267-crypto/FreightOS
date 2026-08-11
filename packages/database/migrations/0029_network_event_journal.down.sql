-- Revert 0029 — remove the network event journal and its schema projection, and strip the writer
-- role's reach in this database.
--
-- N3 is additive: it created two tables, one enum, one function, six triggers, five indexes, one
-- additive N1 constraint, one N1 policy, one PostgreSQL role, and nothing else. So the revert is a
-- removal and must restore the N2 state exactly.
--
-- NO CASCADE. Every object is dropped by name, dependants first, so a dependency that should not
-- exist raises instead of being swept away silently.
--
-- THE ROLE IS THE DELICATE PART, AND IT IS NOT DROPPED. A role is a cluster-wide catalog row; a
-- migration is per-database. 0020 and 0026 both reached this conclusion from measurement, and every
-- role this repository provisions in a migration is created idempotently on the way up and left in
-- place on the way down. What the revert guarantees instead — and it is the stronger property — is
-- that `freightos_event_writer` HAS NO REACH IN THIS DATABASE, measured in §5 along every dimension
-- a role can hold reach rather than inferred from the list of REVOKEs above it. §4 carries the full
-- reasoning, including why a LOGIN role makes "inert" something to establish rather than assume.

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

-- A ROLE IS CLUSTER-GLOBAL; A MIGRATION IS PER-DATABASE. That asymmetry decides everything below,
-- and this repository has already decided it twice, from measurement.
--
-- THE ROLE IS NOT DROPPED. 0020's down migration records the conclusion verbatim — "0020 was the
-- only migration attempting a DROP ROLE, and it was wrong to" — and 0026 re-derived it
-- independently: "what reverting must actually guarantee is that the role has no REACH, not that
-- its catalog row is gone". Every other role this repository provisions in a migration follows it:
-- 0007's freightos_hierarchy_owner, 0010's freightos_identity_guard, 0013's freightos_admin_owner,
-- 0018's freightos_audit_writer and 0020's freightos_binding_owner are all created idempotently on
-- the way up and left in place on the way down. N3 is not the exception.
--
-- The reason is not tidiness. `DROP ROLE` consults `pg_shdepend` across EVERY database in the
-- cluster, and PostgreSQL offers no way to revoke a privilege in a database you are not connected
-- to. A second FreightOS database still at N3 — a staging copy, a clone, a parallel test database —
-- makes the drop fail no matter how complete this database's revert is. That is not a recoverable
-- condition for a down migration: the objects it names are in a database this connection cannot
-- reach, and there is nothing correct for it to do about them. `DROP OWNED` and `DROP ROLE CASCADE`
-- are worse still — they reach into that other database and strip privileges its running system
-- depends on — and neither appears anywhere in this file.
--
-- WHAT THE REVERT DOES GUARANTEE, and it is the stronger property: after this file runs,
-- `freightos_event_writer` HAS NO REACH IN THIS DATABASE, along every dimension a role can hold
-- reach. §5 measures that rather than asserting it, because "we revoked the grants we remembered"
-- is exactly how a revert ends up almost right.
--
-- ONE DIFFERENCE FROM THE FIVE ROLES ABOVE, AND IT IS THE ONE THAT MATTERS. All of them are
-- NOLOGIN, so a surviving catalog row is inert by construction. `freightos_event_writer` is a LOGIN
-- service credential, so "inert" has to be established: it may still authenticate, and what makes
-- the surviving row harmless here is that it holds no schema USAGE, no table or column privilege
-- and no policy in this database — a session that connects can do nothing at all. `ALTER ROLE …
-- NOLOGIN` is deliberately NOT used: that too is cluster-global, and it would disable the writer
-- for every other database still at N3, which is the same error as dropping it.
--
-- THE MIGRATOR'S ADMIN MEMBERSHIP IS ALSO RETAINED, for 0020's reason: a plain REVOKE would remove
-- the implicit ADMIN row PostgreSQL 16 creates for a role's creator, leaving a later re-apply
-- unable to grant the role at all.
DO $$
DECLARE
  v_owned integer;
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
