-- Bootstrap the FreightOS migration authority — F-04.
--
-- ONE-TIME, RUN BY A CLUSTER SUPERUSER OR DBA, BEFORE THE FIRST MIGRATION.
-- This is the only step in the deployment that needs superuser. Everything after it — every
-- migration, up and down, including non-transactional enum evolution, role provisioning, RLS
-- enablement and reference seeding — runs as `freightos_migrator`.
--
-- Why this file exists: the migration lifecycle was previously proved only under a superuser
-- connection, which bypasses RLS entirely. That hid four migrations that could not run under the
-- documented migration authority at all — 0005, 0008, 0013 and 0016 — one of which failed only
-- when a populated database was reverted and reapplied, which is the case a recovery path is for.
-- Superuser success is not migration evidence.
--
-- WHAT freightos_migrator GETS, AND WHY EACH IS THE NARROWEST THING THAT WORKS
--
--   LOGIN        it is a connection role for deployment.
--   CREATEROLE   migrations 0001 and 0013 provision the runtime and administrative roles and
--                manage their grants. This is the privilege that allows exactly that.
--   DB OWNER     it must create schemas, tables and types, and only a table's owner (or a
--                superuser) may ENABLE/FORCE row-level security and CREATE POLICY on it.
--
-- WHAT IT DOES NOT GET, AND MUST NEVER GET
--
--   SUPERUSER    would make every RLS proof in the suite vacuous.
--   BYPASSRLS    same, more narrowly. Asserted absent by the migration suite and by CI.
--
-- ROLE SEPARATION, STATED AS IT ACTUALLY IS — R2-05
--
--   Three different things get conflated when this is described loosely, so they are separated
--   here and each is claimed only as far as it holds.
--
--   INHERITED AUTHORITY. freightos_migrator inherits nothing. Every membership it holds is
--   INHERIT FALSE, so no ordinary statement on a deployment connection picks up any of these
--   roles' privileges. `app.is_control_plane()` is false in a migrator session and migration 0013
--   refuses to proceed if it is not.
--
--   SET ROLE REACHABILITY is a different question with a different answer, and saying "cannot
--   SET ROLE" where only "does not inherit" was proved is what R2-05 found. The migrator CAN
--   SET ROLE to freightos_admin, freightos_admin_owner, freightos_hierarchy_owner and
--   freightos_identity_guard directly, and to freightos_control_plane TRANSITIVELY through
--   freightos_admin_owner, which is a member of it. It cannot reach freightos_app at all.
--
--   That reachability is required, not incidental: `ALTER ... OWNER TO` demands that the
--   assigning role be able to SET ROLE to the target, and migrations 0007, 0010, 0013 and 0017
--   each hand objects to a NOLOGIN definer owner. Removing it would mean giving up definer-owned
--   trusted code or handing ownership assignment back to a superuser at deploy time.
--
--   RUNTIME-TO-DEPLOYMENT. freightos_migrator is NOT granted to any runtime role, so no
--   application, tenant or routine control-plane connection can reach deployment authority or any
--   definer owner — by inheritance or by SET ROLE. This is the direction that would be an
--   escalation, and it is the one that is closed. A test asserts it as an empty set.
--
--   So: the migrator may administer a runtime role without acquiring its privileges, and may
--   deliberately become the definer owners it hands objects to. Administering, inheriting, and
--   being able to become are three powers, and this file takes the first everywhere, the second
--   nowhere, and the third only where object ownership requires it.
--
-- Usage:
--   psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
--        -v migrator_password="'<from your secret manager>'" \
--        -v db_name=freightos \
--        -f scripts/bootstrap-migration-authority.sql
--
-- The password is supplied by the operator from a secret manager. It is never stored here, and
-- `.env.example` carries a development-only placeholder.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 1. The migration authority.
-- ---------------------------------------------------------------------------

DO $bootstrap$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_migrator') THEN
    CREATE ROLE freightos_migrator LOGIN CREATEROLE NOSUPERUSER NOBYPASSRLS NOCREATEDB;
  ELSE
    -- Converge an existing role onto the required attribute set. Superuser is running this file,
    -- so the privileged clauses are available here and only here.
    ALTER ROLE freightos_migrator LOGIN CREATEROLE NOSUPERUSER NOBYPASSRLS NOCREATEDB;
  END IF;
END
$bootstrap$;

\if :{?migrator_password}
ALTER ROLE freightos_migrator PASSWORD :migrator_password;
\endif

-- ---------------------------------------------------------------------------
-- 2. Admin option on any pre-existing runtime role.
--
-- On a fresh cluster this loop does nothing: migration 0001 creates the runtime roles, and a role
-- creator holds admin option on what it created. It matters when migrating a cluster that already
-- carries the Phase 0 baseline, where those roles were created by someone else.
--
-- INHERIT FALSE is the point on every role: administer without inheriting. SET FALSE additionally
-- withholds SET ROLE on the two runtime roles, where nothing needs it — see ROLE SEPARATION above
-- for what remains reachable and why.
-- ---------------------------------------------------------------------------

-- An existing membership is CONVERGED, not simply re-granted. A GRANT never narrows a membership
-- that is already there: `GRANT x TO y WITH INHERIT FALSE` issued over a membership that already
-- carries INHERIT TRUE leaves the inheriting one in place. That is how a migrator ends up
-- inheriting freightos_control_plane through freightos_admin_owner and quietly passing the
-- control-plane branch of every policy in the schema. Migration 0013 refuses to proceed if it
-- finds that state, so a cluster this file failed to converge fails the deployment rather than
-- silently weakening it.
--
-- Convergence is judged on the memberships TAKEN TOGETHER, never on any single catalog row.
-- PostgreSQL 16 splits them in two: creating a role as a CREATEROLE user leaves an implicit
-- `ADMIN TRUE, INHERIT FALSE, SET FALSE` membership whose grantor is the bootstrap superuser, and
-- migration 0013 then takes its own `SET TRUE, INHERIT FALSE` on top so that
-- `ALTER FUNCTION ... OWNER TO` can run. Neither row carries the whole profile; their union is
-- exactly the wanted one. Demanding that one row carry all three revoked the implicit grant that
-- the second row had been made under, and PostgreSQL rightly rejected it with "dependent
-- privileges exist" — which is what re-running this script against an already-migrated cluster
-- did, so the idempotence claimed above did not hold.
--
-- A membership is therefore revoked only when it confers something forbidden, and then by its own
-- grantor: INHERIT on any of these roles, or SET on a role the migrator must be able to administer
-- without ever becoming. What survives must still supply ADMIN OPTION, and SET where the role is
-- an ownership target; the corrective GRANT below adds whatever is missing, and re-granting from
-- the same grantor updates that row in place rather than adding a second one.

DO $bootstrap$
DECLARE
  spec record;
  held record;
BEGIN
  -- Runtime roles: administer without inheriting, and without SET ROLE either. SET FALSE is
  -- available here because nothing in the deployment needs to become freightos_app or
  -- freightos_control_plane — unlike the definer owners below, where object ownership requires it.
  --
  -- The definer owner is different, and deliberately so. `ALTER FUNCTION ... OWNER TO` requires
  -- the assigning role to be able to SET ROLE to the target, so migration 0013 cannot hand the
  -- admin functions to their definer owner without it. SET TRUE is therefore required there and
  -- is deployment-time only: freightos_admin_owner is NOLOGIN, so this opens no connection path,
  -- and INHERIT FALSE is what keeps the migrator from acquiring its rights in ordinary queries.
  FOR spec IN
    SELECT * FROM (VALUES
      ('freightos_app',           false),
      ('freightos_control_plane', false),
      ('freightos_admin_owner',   true),
      ('freightos_admin',         true)
    ) AS t(role_name, set_option)
  LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = spec.role_name);

    FOR held IN
      SELECT am.admin_option, am.inherit_option, am.set_option, g.rolname AS grantor
        FROM pg_auth_members am
        JOIN pg_roles r ON r.oid = am.roleid
        JOIN pg_roles m ON m.oid = am.member
        JOIN pg_roles g ON g.oid = am.grantor
       WHERE r.rolname = spec.role_name AND m.rolname = 'freightos_migrator'
    LOOP
      CONTINUE WHEN NOT held.inherit_option
                AND NOT (held.set_option AND NOT spec.set_option);
      EXECUTE format('REVOKE %I FROM freightos_migrator GRANTED BY %I',
                     spec.role_name, held.grantor);
    END LOOP;

    -- Re-read: the revocations above have already run, so this sees only what survived.
    IF NOT EXISTS (
      SELECT 1
        FROM pg_auth_members am
        JOIN pg_roles r ON r.oid = am.roleid
        JOIN pg_roles m ON m.oid = am.member
       WHERE r.rolname = spec.role_name AND m.rolname = 'freightos_migrator'
         AND am.admin_option AND NOT am.inherit_option
    ) OR (spec.set_option AND NOT EXISTS (
      SELECT 1
        FROM pg_auth_members am
        JOIN pg_roles r ON r.oid = am.roleid
        JOIN pg_roles m ON m.oid = am.member
       WHERE r.rolname = spec.role_name AND m.rolname = 'freightos_migrator'
         AND am.set_option AND NOT am.inherit_option
    )) THEN
      EXECUTE format(
        'GRANT %I TO freightos_migrator WITH ADMIN OPTION, INHERIT FALSE, SET %s',
        spec.role_name, CASE WHEN spec.set_option THEN 'TRUE' ELSE 'FALSE' END);
    END IF;
  END LOOP;
END
$bootstrap$;

-- ---------------------------------------------------------------------------
-- 3. Database ownership.
-- ---------------------------------------------------------------------------

\if :{?db_name}
DO $bootstrap$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_database WHERE datname = current_setting('freightos.bootstrap_db', true)) THEN
    NULL;
  END IF;
END
$bootstrap$;
\endif

-- Ownership is set outside a DO block because ALTER DATABASE cannot run inside one.
-- Supply -v db_name=<database>; the operator runs this connected to any database.
\if :{?db_name}
ALTER DATABASE :db_name OWNER TO freightos_migrator;
\endif

-- ---------------------------------------------------------------------------
-- 4. Assert the outcome. A bootstrap that silently produced a superuser migrator would defeat
--    every isolation proof downstream, so this refuses rather than reports.
-- ---------------------------------------------------------------------------

DO $bootstrap$
DECLARE
  m record;
BEGIN
  SELECT rolsuper, rolbypassrls, rolcreaterole, rolcanlogin
    INTO m FROM pg_roles WHERE rolname = 'freightos_migrator';

  IF m IS NULL THEN
    RAISE EXCEPTION 'bootstrap failed: freightos_migrator does not exist';
  END IF;
  IF m.rolsuper OR m.rolbypassrls THEN
    RAISE EXCEPTION
      'bootstrap refused: freightos_migrator must hold neither SUPERUSER nor BYPASSRLS (super=% bypassrls=%)',
      m.rolsuper, m.rolbypassrls;
  END IF;
  IF NOT m.rolcreaterole OR NOT m.rolcanlogin THEN
    RAISE EXCEPTION
      'bootstrap incomplete: freightos_migrator needs LOGIN and CREATEROLE (login=% createrole=%)',
      m.rolcanlogin, m.rolcreaterole;
  END IF;

  RAISE NOTICE 'freightos_migrator ready: LOGIN CREATEROLE, no SUPERUSER, no BYPASSRLS';
END
$bootstrap$;
