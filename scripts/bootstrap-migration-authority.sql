-- Bootstrap the FreightOS migration authority — F-04.
--
-- RUN BY A CLUSTER SUPERUSER OR DBA, BEFORE THE FIRST MIGRATION.
-- This is the only step in the deployment that needs superuser. Everything after it — every
-- migration, up and down, including non-transactional enum evolution, role provisioning, RLS
-- enablement and reference seeding — runs as `freightos_migrator`.
--
-- IT IS NOT THE WHOLE LIFECYCLE, and treating it as such is what left a fresh install with a
-- contract this file attests to but does not establish. Section 2's convergence can only converge
-- a role that already exists, and on a fresh cluster none of the managed roles do — they arrive
-- with migrations 0001 and 0013. The full installation is four phases:
--
--   1. prerequisites   THIS FILE                                    superuser, before migrations
--   2. migrations      pnpm db:up                                   as freightos_migrator
--   3. convergence     scripts/converge-migration-authority.sql     after the roles exist
--   4. attestation     the same file, with -v require_complete=1
--
-- Phases 3 and 4 are the same file as section 2 includes, invoked again — one implementation, two
-- lifecycle points. `fresh install authority` in the integration suite runs exactly this sequence
-- against a cluster proven to hold no FreightOS role, and fails if phase 3 is skipped.
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
-- 2. The migration-authority membership contract.
--
-- Factored into scripts/converge-migration-authority.sql because it has to run TWICE in a
-- deployment and must not exist as two copies that can drift. Here it converges any managed role
-- that already exists — which on an upgrade of a Phase 0 baseline cluster is all of them, and on a
-- genuinely fresh cluster is none of them, since migrations 0001 and 0013 have not run yet.
--
-- THAT SECOND CASE IS WHY PHASE 3 EXISTS. Running this file only here leaves freightos_admin
-- without the SET edge the ROLE SEPARATION section above attests to, because nothing else grants
-- it: freightos_admin owns no object, so no migration needs to become it. After the migrations
-- have created the managed roles, run:
--
--   psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
--        -v require_complete=1 \
--        -f scripts/converge-migration-authority.sql
--
-- \ir resolves relative to THIS file, so the include works from any working directory.
-- ---------------------------------------------------------------------------

\ir converge-migration-authority.sql

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
