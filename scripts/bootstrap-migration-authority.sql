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
-- ROLE SEPARATION
--
--   Runtime roles (freightos_app, freightos_control_plane, freightos_admin) are NOT granted to
--   freightos_migrator in a usable form, and freightos_migrator is NOT granted to any runtime
--   role. A runtime connection therefore cannot SET ROLE its way to deployment authority.
--
--   Where a runtime role already exists — a cluster carrying the Phase 0 baseline — the migrator
--   needs ADMIN OPTION on it to manage its grants. It is granted WITH INHERIT FALSE, SET FALSE,
--   so the migrator may administer the role without acquiring its privileges and without being
--   able to SET ROLE to it. Administering a role and being able to act as it are different
--   powers, and only the first is needed here.
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
-- INHERIT FALSE, SET FALSE is the point: administer, do not become.
-- ---------------------------------------------------------------------------

-- An existing membership is CONVERGED, not simply re-granted. A GRANT never narrows a membership
-- that is already there: `GRANT x TO y WITH INHERIT FALSE` issued over a membership that already
-- carries INHERIT TRUE leaves the inheriting one in place. That is how a migrator ends up
-- inheriting freightos_control_plane through freightos_admin_owner and quietly passing the
-- control-plane branch of every policy in the schema. Migration 0013 refuses to proceed if it
-- finds that state, so a cluster this file failed to converge fails the deployment rather than
-- silently weakening it.
--
-- Only a wrong membership is revoked, and each by its own grantor. A blanket revoke would take
-- down correct grants the migrator has since used to grant onward, which PostgreSQL rejects with
-- "dependent privileges exist".

DO $bootstrap$
DECLARE
  spec record;
  held record;
BEGIN
  -- Runtime roles: administer, never become. SET FALSE means the migrator cannot SET ROLE to a
  -- runtime role even though it may manage that role's grants.
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
      IF held.admin_option AND NOT held.inherit_option AND held.set_option = spec.set_option THEN
        CONTINUE;
      END IF;
      EXECUTE format('REVOKE %I FROM freightos_migrator GRANTED BY %I',
                     spec.role_name, held.grantor);
    END LOOP;

    IF NOT EXISTS (
      SELECT 1
        FROM pg_auth_members am
        JOIN pg_roles r ON r.oid = am.roleid
        JOIN pg_roles m ON m.oid = am.member
       WHERE r.rolname = spec.role_name AND m.rolname = 'freightos_migrator'
         AND am.admin_option AND NOT am.inherit_option AND am.set_option = spec.set_option
    ) THEN
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
