-- Converge and attest the freightos_migrator membership contract — the authority phase.
--
-- THIS FILE IS THE ONE SOURCE OF TRUTH FOR THE MANAGED-ROLE CONTRACT, and it exists as its own
-- file because it has to run at TWO points in a deployment, not one.
--
-- The convergence can only converge a role that already exists — the loop skips anything absent,
-- and on a genuinely fresh cluster that is every managed role: freightos_app and
-- freightos_control_plane arrive with migration 0001, freightos_admin and freightos_admin_owner
-- with 0013. Run only before the migrations, it therefore establishes nothing, and each role keeps
-- whatever its creation produced. For three of the four that is already the wanted profile.
-- freightos_admin is the exception: it owns no object, so no migration needs to become it and none
-- grants SET, leaving only PostgreSQL's implicit `ADMIN TRUE, INHERIT FALSE, SET FALSE` creator
-- row — while the bootstrap script's own ROLE SEPARATION section attests that the migrator CAN
-- SET ROLE to freightos_admin. On a fresh install that attestation was false until some later
-- convergence happened to run. Measured on a fresh cluster: violated at the migration tip,
-- repaired by the next convergence pass.
--
-- So the deployment lifecycle is four phases, not three:
--
--   1. bootstrap prerequisites   scripts/bootstrap-migration-authority.sql   (superuser, once)
--   2. migrations                pnpm db:up                                  (freightos_migrator)
--   3. authority convergence     THIS FILE                                   (after the roles exist)
--   4. contract attestation      THIS FILE, with -v require_complete=1
--
-- Phase 1 includes this file too, which is correct and not redundant: on an upgrade of a cluster
-- that already carries the Phase 0 baseline the managed roles DO exist beforehand, and converging
-- them before the migrations run is what keeps migration 0013 from refusing to proceed.
--
-- Usage, after migrations:
--   psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
--        -v require_complete=1 \
--        -f scripts/converge-migration-authority.sql
--
-- IDEMPOTENT. An existing membership is CONVERGED, not simply re-granted. A GRANT never narrows a
-- membership that is already there: `GRANT x TO y WITH INHERIT FALSE` issued over a membership
-- that already carries INHERIT TRUE leaves the inheriting one in place. That is how a migrator
-- ends up inheriting freightos_control_plane through freightos_admin_owner and quietly passing the
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
-- privileges exist" — which is what re-running the bootstrap against an already-migrated cluster
-- did, so the idempotence claimed there did not hold.
--
-- A membership is therefore revoked only when it confers something forbidden, and then by its own
-- grantor: INHERIT on any of these roles, or SET on a role the migrator must be able to administer
-- without ever becoming. What survives must still supply ADMIN OPTION, and SET where the role is
-- an ownership target; the corrective GRANT below adds whatever is missing, and re-granting from
-- the same grantor updates that row in place rather than adding a second one.

-- ---------------------------------------------------------------------------
-- A. Converge.
-- ---------------------------------------------------------------------------

DO $converge$
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
  --
  -- freightos_admin carries SET TRUE for a DIFFERENT reason, and it is the reason this file has to
  -- run after the migrations. It owns no catalog object, so the derived "every migration-created
  -- owner must be SET-able" rule does not reach it; its SET contract is an explicit capability
  -- decision recorded here and attested in the bootstrap script's ROLE SEPARATION section. Owning
  -- nothing is not a reason to drop it from the contract.
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
$converge$;

-- ---------------------------------------------------------------------------
-- B. Attest, for every managed role that exists.
--
-- Stated over the EFFECTIVE profile — pg_has_role, not a chosen catalog row — because the wanted
-- profile is carried by the memberships taken together and no single row holds all of it. This is
-- the check the bootstrap's own §4 never made: §4 attests the migrator's ATTRIBUTES, which is why
-- a fresh install could satisfy it while the membership contract was still wrong.
-- ---------------------------------------------------------------------------

DO $converge$
DECLARE
  spec record;
  eff record;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('freightos_app',           false),
      ('freightos_control_plane', false),
      ('freightos_admin_owner',   true),
      ('freightos_admin',         true)
    ) AS t(role_name, set_option)
  LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = spec.role_name);

    -- DIRECT options for admin/inherit/set, and pg_has_role only for USAGE.
    --
    -- `pg_has_role(..., 'SET')` is TRANSITIVE, and transitive SET reachability is expected here
    -- rather than forbidden: the ROLE SEPARATION section of the bootstrap states that the migrator
    -- reaches freightos_control_plane through freightos_admin_owner, which is a member of it.
    -- Asserting the contract with pg_has_role therefore fails on a correctly converged cluster —
    -- measured, on the first run of this attestation. What the convergence actually controls, and
    -- what `set_option = false` means, is the DIRECT grant. Inheritance is the opposite case: there
    -- the security property IS the effective one, because authority acquired transitively is
    -- acquired all the same, so USAGE is asserted through pg_has_role.
    SELECT bool_or(am.admin_option)            AS admin,
           bool_or(am.inherit_option)          AS inherit,
           bool_or(am.set_option)              AS can_set,
           pg_has_role('freightos_migrator', spec.role_name, 'USAGE') AS inherits
      INTO eff
      FROM pg_auth_members am
      JOIN pg_roles r ON r.oid = am.roleid
      JOIN pg_roles m ON m.oid = am.member
     WHERE r.rolname = spec.role_name AND m.rolname = 'freightos_migrator';

    IF eff IS NULL OR NOT eff.admin THEN
      RAISE EXCEPTION
        'authority convergence failed: freightos_migrator holds no ADMIN OPTION on %', spec.role_name;
    END IF;
    IF eff.inherit OR eff.inherits THEN
      RAISE EXCEPTION
        'authority convergence failed: freightos_migrator INHERITS % — administer, do not become',
        spec.role_name;
    END IF;
    IF coalesce(eff.can_set, false) <> spec.set_option THEN
      RAISE EXCEPTION
        'authority convergence failed: freightos_migrator direct SET on % is %, contract requires %',
        spec.role_name, coalesce(eff.can_set, false), spec.set_option;
    END IF;
  END LOOP;

  RAISE NOTICE 'migration-authority contract holds for every managed role present';
END
$converge$;

-- ---------------------------------------------------------------------------
-- C. Completeness. Only meaningful AFTER the migrations have run, so it is opt-in: phase 1 runs
--    this file on a cluster where the roles legitimately do not exist yet, and phase 3/4 runs it
--    with -v require_complete=1, where a missing managed role means the install is not finished.
--    Without this, section B passes vacuously on an empty cluster.
-- ---------------------------------------------------------------------------

\if :{?require_complete}
DO $converge$
DECLARE
  missing text[];
BEGIN
  SELECT array_agg(role_name ORDER BY role_name) INTO missing
    FROM (VALUES
      ('freightos_app'), ('freightos_control_plane'),
      ('freightos_admin_owner'), ('freightos_admin')
    ) AS t(role_name)
   WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = t.role_name);

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION
      'authority convergence incomplete: managed roles absent after migration: %', missing;
  END IF;
  RAISE NOTICE 'migration-authority contract complete: all four managed roles present and correct';
END
$converge$;
\endif
