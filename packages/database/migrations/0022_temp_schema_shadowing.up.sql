-- 0022 — close relation shadowing through pg_temp. F-01 (CRITICAL) and F-02 (HIGH).
--
-- THE DEFECT. Every authorization function in this schema referenced its tables by unqualified
-- name. PostgreSQL searches the session's temporary schema FIRST for relations whenever `pg_temp`
-- is not explicitly listed in `search_path` — and it does so even inside a SECURITY DEFINER
-- function with a pinned path, because pinning `pg_catalog, public` does not exclude the implicit
-- `pg_temp`. `freightos_app` held TEMPORARY on the database through PostgreSQL's default PUBLIC
-- grant, so a runtime session could create a table that shadowed the one the resolver reads.
--
-- MEASURED, on a session holding a genuine verified binding:
--
--   F-01  CRITICAL. Shadow `users` and `memberships`; the control plane then revokes the real
--         membership and commits. app.current_tenant_id() still returned the tenant on the NEXT
--         statement of the same open transaction, where it must return NULL. A committed
--         revocation was not observed — fail-open, and precisely the property gate K and gate V
--         case 4 exist to prove.
--
--   F-02  HIGH. Shadow `organization_node_closure`. app.verified_scope_node_ids() went from 1 node
--         to 4, and a principal bound at the TERMINAL node read a user row on the legal-entity node
--         above it. Node scope became caller-determined. Verified PRE-EXISTING: the identical
--         attack succeeds against migrations 1..19, so 0020 carried the pattern forward rather than
--         creating it.
--
-- SCOPE IS WIDER THAN THE TWO FINDINGS. A catalog sweep found 46 functions referencing protected
-- relations unqualified — 31 SECURITY DEFINER, 15 invoker-rights with no search_path at all. The
-- reachable ones include the self-elevation guards and the kill-switch write trigger, both of which
-- fire in the caller's own session. Fixing only the two reported symptoms would have left the class
-- open, so this closes the class.
--
-- THE FIX, IN THREE INDEPENDENT LAYERS. Any one of them stops the attack; all three are applied
-- because this is an authority boundary and one control is not a boundary.
--
--   §1  The runtime role loses TEMPORARY. It already holds CREATE on no schema — measured — so
--       pg_temp was its only route to introducing a relation at all. This closes the class for
--       every function, present and future, and cannot be bypassed by direct SQL because it is a
--       database-level privilege rather than a property of any function.
--   §2  Every SR-2 SECURITY DEFINER lists `pg_temp` LAST in its search_path. Listing it explicitly
--       is what demotes it; the position is the whole point.
--   §3  The authorization core schema-qualifies its relation references, so it is correct under any
--       search_path a caller could arrange, including one this migration did not anticipate.
--
-- WHY NOT ONLY §3. Schema-qualification is per-function and 46 functions is a moving target; a new
-- one added later would reopen the hole silently. §1 makes the vector unavailable, §4 asserts it,
-- and the regression tests assert the property rather than the mechanism.
--
-- WHY THE DATABASE AND NOT THE APPLICATION. The attack is available to anyone holding a
-- `freightos_app` connection and needs no application code at all. A TypeScript control would be
-- decoration.

-- ---------------------------------------------------------------------------
-- §1. The runtime role may not create temporary relations.
--
-- PostgreSQL grants TEMPORARY on every database to PUBLIC by default, and nothing in this
-- repository creates a temporary table — verified by sweep before revoking. The revoke names the
-- current database because a migration cannot know the deployment's database name.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
END
$$;

-- ---------------------------------------------------------------------------
-- §2. pg_temp is searched LAST, not first, wherever SR-2 pins a path.
--
-- Grouped by owner: ALTER FUNCTION requires owning the function, and the migrator administers each
-- owner role WITH INHERIT FALSE, so it becomes each one for the duration. No schema CREATE is
-- needed — ALTER FUNCTION ... SET does not recreate the object.
-- ---------------------------------------------------------------------------

-- DRIVEN FROM THE CATALOG, NOT FROM A LIST. The first draft of this section enumerated the
-- functions by reading the migrations that created them: it named twenty-four, and measurement
-- against pg_proc found three wrong signatures, app.is_verified_platform_actor() missing, and the
-- whole of schema `admin` — twenty-three more — omitted. A hand list of forty-eight entries is
-- complete by luck, and this is a boundary where being one entry short is the entire defect.
--
-- SCHEMA `admin` IS IN SCOPE, and it is not a formality. Those functions ARE the authorization
-- mutation boundary — admin.grant_membership, admin.assign_membership_role,
-- admin.grant_role_permission, admin.issue_session_binding — and every one of them verifies its
-- request against `users`, `memberships`, `roles` and `permissions` before writing. `freightos_app`
-- cannot name schema admin, but `freightos_admin` can, and a control-plane operator session that
-- shadowed those tables would defeat the mint's own verification: admin.issue_session_binding would
-- confirm a membership that exists only in the caller's temporary schema and hand back a binding
-- for a principal who holds nothing. The mint is the trust anchor the entire binding chain hangs
-- from, so it gets the same treatment as the accessors it feeds.
--
-- ALTER FUNCTION requires owning the function, and the migrator administers each owner role WITH
-- INHERIT FALSE — so the loop becomes each owner in turn and resets in between, because a NOLOGIN
-- definer owner cannot itself SET ROLE to the next one. No schema CREATE is needed: ALTER FUNCTION
-- ... SET does not recreate the object.

DO $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS signature, pg_get_userbyid(p.proowner) AS owner
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('app', 'admin') AND p.prosecdef
     ORDER BY 2, 1
  LOOP
    EXECUTE format('SET LOCAL ROLE %I', r.owner);
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public, pg_temp', r.signature);
    RESET ROLE;
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE '0022: pinned pg_temp last on % SECURITY DEFINER functions', v_count;
END
$$;

-- ---------------------------------------------------------------------------
-- §3. The authorization core names its schema.
--
-- These are the functions that DECIDE authority in an untrusted session. Bodies are otherwise
-- unchanged — same predicates, same volatility, same security mode, same hoisting 0020 established,
-- so plan shapes and the P-01 property are untouched.
-- ---------------------------------------------------------------------------

GRANT CREATE ON SCHEMA app TO freightos_binding_owner;
SET LOCAL ROLE freightos_binding_owner;

CREATE OR REPLACE FUNCTION app.verified_principal() RETURNS app.verified_principal_result
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT b.principal_type,
         b.user_id,
         b.service_account_id,
         b.tenant_id,
         b.organization_node_id,
         b.legal_entity_id,
         CASE b.principal_type
           WHEN 'human'   THEN 'user:' || b.user_id::text
           WHEN 'service' THEN 'service_account:' || b.service_account_id::text
         END
    FROM app.session_binding b
   WHERE b.installed_backend_pid = pg_backend_pid()
     AND b.installed_xact_id = pg_current_xact_id_if_assigned()
     AND (
       -- Human: the user must still be an active principal AND still hold an active membership
       -- relating it to the bound tenant. Both are re-read here, not remembered from issuance.
       (b.principal_type = 'human' AND EXISTS (
          SELECT 1
            FROM public.users u
            JOIN public.memberships m
              ON m.tenant_id = u.tenant_id
             AND m.user_id = u.id
           WHERE u.id = b.user_id
             AND u.tenant_id = b.tenant_id
             AND u.status = 'active' AND u.revoked_at IS NULL
             AND u.effective_from <= now()
             AND (u.effective_to IS NULL OR u.effective_to > now())
             AND m.organization_node_id = b.organization_node_id
             AND m.status = 'active' AND m.revoked_at IS NULL
             AND m.effective_from <= now()
             AND (m.effective_to IS NULL OR m.effective_to > now())))
       OR
       -- Service: its own path. A service principal never acquires human semantics, and
       -- app.current_user_id() below returns NULL for it by construction.
       (b.principal_type = 'service' AND EXISTS (
          SELECT 1 FROM public.service_accounts s
           WHERE s.id = b.service_account_id
             AND s.tenant_id = b.tenant_id
             AND s.organization_node_id = b.organization_node_id
             AND s.status = 'active' AND s.revoked_at IS NULL))
     )
$$;

CREATE OR REPLACE FUNCTION app.verified_binding_node_scope_ok(p_organization_node_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM app.session_binding b
      JOIN public.organization_node_closure c
        ON c.tenant_id = b.tenant_id
       AND c.ancestor_id = b.organization_node_id
       AND c.descendant_id = p_organization_node_id
     WHERE b.installed_backend_pid = pg_backend_pid()
       AND b.installed_xact_id = pg_current_xact_id_if_assigned())
$$;

CREATE OR REPLACE FUNCTION app.verified_binding_scope_node_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT c.descendant_id
    FROM app.session_binding b
    JOIN public.organization_node_closure c
      ON c.tenant_id = b.tenant_id
     AND c.ancestor_id = b.organization_node_id
   WHERE b.installed_backend_pid = pg_backend_pid()
     AND b.installed_xact_id = pg_current_xact_id_if_assigned()
$$;

RESET ROLE;
REVOKE CREATE ON SCHEMA app FROM freightos_binding_owner;

-- The invoker-rights sets and predicates. No SET clause is added: a proconfig would block SQL
-- function inlining, and 0020's measured plan shapes depend on the planner's freedom here.
-- Schema-qualification costs nothing and is what makes them correct under any search_path.

CREATE OR REPLACE FUNCTION app.verified_scope_node_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE
AS $$
  SELECT c.descendant_id
    FROM public.organization_node_closure c
   WHERE c.tenant_id   = (SELECT app.current_tenant_id())
     AND c.ancestor_id = (SELECT app.current_organization_node_id())
$$;

CREATE OR REPLACE FUNCTION app.verified_scope_service_account_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE
AS $$
  SELECT sa.id
    FROM public.service_accounts sa
   WHERE (app.is_control_plane() OR sa.tenant_id = (SELECT app.current_tenant_id()))
     AND (app.is_control_plane()
          OR sa.organization_node_id IN (SELECT app.verified_scope_node_ids()))
$$;

CREATE OR REPLACE FUNCTION app.organization_node_scope_ok(p_organization_node_id uuid)
RETURNS boolean LANGUAGE sql STABLE
AS $$
  SELECT app.is_control_plane()
      OR ((SELECT app.current_organization_node_id()) IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.organization_node_closure c
             WHERE c.tenant_id     = (SELECT app.current_tenant_id())
               AND c.ancestor_id   = (SELECT app.current_organization_node_id())
               AND c.descendant_id = p_organization_node_id))
$$;

CREATE OR REPLACE FUNCTION app.service_account_scope_ok(p_service_account_id uuid)
RETURNS boolean LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.service_accounts sa
     WHERE sa.id = p_service_account_id
       AND (app.is_control_plane() OR sa.tenant_id = (SELECT app.current_tenant_id()))
       AND (app.is_control_plane()
            OR sa.organization_node_id IN (SELECT app.verified_scope_node_ids())))
$$;

-- app.current_human_principal() belongs to the hierarchy owner, which needs the schema privilege
-- back for the duration exactly as 0018 and 0019's down do.
GRANT CREATE ON SCHEMA app TO freightos_hierarchy_owner;
SET LOCAL ROLE freightos_hierarchy_owner;
CREATE OR REPLACE FUNCTION app.current_human_principal() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT CASE WHEN session_user = 'freightos_app'
              THEN app.current_user_id()
              ELSE (SELECT u.id
                      FROM public.users u
                     WHERE u.tenant_id = app.current_tenant_id()
                       AND u.id = nullif(substring(coalesce(nullif(current_setting('app.actor_id', true), ''), '') from
                             '^user:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'),
                             '')::uuid
                       AND u.status = 'active'
                       AND u.revoked_at IS NULL
                       AND u.effective_from <= now()
                       AND (u.effective_to IS NULL OR u.effective_to > now()))
         END
$$;
RESET ROLE;
REVOKE CREATE ON SCHEMA app FROM freightos_hierarchy_owner;

-- ---------------------------------------------------------------------------
-- §4. Asserted from the catalog.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_left text;
BEGIN
  -- (a) No role may create a temporary relation through the PUBLIC grant. Checked for the runtime
  -- role specifically, because that is the one an attacker holds.
  IF has_database_privilege('freightos_app', current_database(), 'TEMPORARY') THEN
    RAISE EXCEPTION 'F-01: freightos_app can still create temporary relations';
  END IF;

  -- (b) …and it has no other route to introducing a relation: CREATE on no schema at all.
  SELECT string_agg(n.nspname, ', ' ORDER BY n.nspname) INTO v_left
    FROM pg_namespace n
   WHERE n.nspname NOT LIKE 'pg\_%' AND n.nspname <> 'information_schema'
     AND has_schema_privilege('freightos_app', n.nspname, 'CREATE');
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'F-01: freightos_app holds CREATE on %', v_left;
  END IF;

  -- (c) Every SECURITY DEFINER in app AND admin pins a search_path that ENDS with pg_temp. Listing
  -- it is what demotes it; a path without it is a path where pg_temp is searched first, and a path
  -- that lists it anywhere but last is worse than either.
  SELECT string_agg(n.nspname || '.' || p.proname, ', ' ORDER BY n.nspname, p.proname) INTO v_left
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('app', 'admin') AND p.prosecdef
     AND coalesce(substring(p.proconfig::text from 'search_path=([^"}]*)'), '') !~ 'pg_temp\s*$';
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'F-01: definers whose search_path does not end with pg_temp: %', v_left;
  END IF;

  -- (d) The authorization core names its schema on every protected relation it reads.
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_left
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'app'
     AND p.proname IN ('verified_principal', 'verified_binding_node_scope_ok',
                       'verified_binding_scope_node_ids', 'verified_scope_node_ids',
                       'verified_scope_service_account_ids', 'organization_node_scope_ok',
                       'service_account_scope_ok', 'current_human_principal')
     AND p.prosrc ~ ('(^|[^.[:alnum:]_])(users|memberships|service_accounts'
                     || '|organization_node_closure)([^[:alnum:]_]|$)');
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'F-02: authorization core still reads an unqualified relation: %', v_left;
  END IF;

  -- (e) 0020's property survives: the invoker-rights sets gained no proconfig, which would have
  -- blocked inlining and changed the plan shapes P-01 depends on.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'app'
       AND p.proname IN ('verified_scope_node_ids', 'verified_scope_service_account_ids',
                         'organization_node_scope_ok', 'service_account_scope_ok')
       AND (p.proconfig IS NOT NULL OR p.prosecdef))
  THEN
    RAISE EXCEPTION 'P-01: an invoker-rights scope function gained a proconfig or became a definer';
  END IF;
END
$$;
