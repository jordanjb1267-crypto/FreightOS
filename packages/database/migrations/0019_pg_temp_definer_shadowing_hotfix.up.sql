-- 0019 — EMERGENCY SECURITY HOTFIX. Close pg_temp relation shadowing in SECURITY DEFINER
-- authorization paths. CRITICAL, live on merged main at migrations 1..18.
--
-- THE DEFECT. Every authorization function in schemas app and admin references its tables by
-- unqualified name, and each SECURITY DEFINER pins `search_path = pg_catalog, public`.
-- PostgreSQL searches the session's temporary schema FIRST for relations whenever `pg_temp` is not
-- explicitly listed — and it does so even inside a SECURITY DEFINER with a pinned path, because
-- pinning two schemas does not exclude the implicit `pg_temp`. PostgreSQL also grants TEMPORARY on
-- every database to PUBLIC by default, so any connectable freightos role could create a table that
-- shadows the one an authorization function reads.
--
-- REPRODUCED on a fresh database migrated from exact main (1..18), before this fix, two paths:
--
--   Path 1 — role freightos_admin. Shadow users, memberships, membership_roles, roles,
--   role_permissions, permissions in pg_temp; GRANT SELECT to PUBLIC; call
--   admin.move_organization_node with an actor id that names NO real user. The chain
--   admin.authorization_refusal_reason -> app.user_has_permission read the shadow, authorized the
--   fabricated actor, MUTATED the real organization_node_closure (a region node was reparented out
--   from under its governing legal entity), and wrote a `succeeded` audit row attributing the
--   change to the fabricated actor. Real hierarchy mutation + forged provenance.
--
--   Path 2 — role freightos_app (the ORDINARY runtime role). Shadow users so
--   app.current_human_principal resolves a fabricated human; app.engage_kill_switch, which reserves
--   the act to humans (Constitution Art. V.1), then engaged a real tenant kill switch recording
--   engaged_by = the fabricated human. Human-only reservation bypassed by the runtime role.
--
-- THE FIX, IN LAYERS. This is the minimal main-compatible equivalent of the closure proven on the
-- unmerged SR-2 branch. It deliberately does NOT rewrite the definer bodies to schema-qualify their
-- relation references: §1 makes the shadow object impossible to create for every runtime and
-- control-plane role, and §2 demotes pg_temp inside every definer. Full body qualification is
-- carried as an explicit defense-in-depth follow-up, so the emergency patch stays narrow and
-- high-confidence. The one exception is app.user_has_permission — the invoker-rights link in the
-- exploited admin chain, which had no pinned path at all — pinned here (§2b).
--
--   §1  REVOKE TEMPORARY ON DATABASE FROM PUBLIC. Measured safe first: every connectable runtime
--       and control-plane role holds CREATE on NO schema, held TEMPORARY only through the PUBLIC
--       default, and nothing in the repository creates a temporary table at runtime. After this,
--       only freightos_migrator retains TEMPORARY, through database ownership (see the security
--       evidence note; not a new boundary crossing — it already owns and can rewrite every object
--       a shadow could impersonate). This alone closes the class for every attacker role.
--   §2  Every SECURITY DEFINER in app and admin lists `pg_temp` LAST. Listing it is what demotes
--       it; the position is the whole point. Driven from pg_proc, not a hand list.
--   §2b app.user_has_permission — invoker-rights, no path — pinned the same way.
--   §3  Asserted from the catalog (§4 block): PUBLIC/runtime roles cannot create temporary
--       relations, no runtime role can CREATE in a schema searched ahead of pg_temp, and every
--       definer plus user_has_permission ends its search_path with pg_temp.
--
-- Fully transactional: no ALTER TYPE, no concurrent index, nothing that forbids a transaction.

-- ---------------------------------------------------------------------------
-- §1. PUBLIC may no longer create temporary relations.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
END
$$;

-- ---------------------------------------------------------------------------
-- §2. pg_temp is searched LAST in every SECURITY DEFINER, not first.
--
-- ALTER FUNCTION requires owning the function, and the migrator administers each owner role WITH
-- INHERIT FALSE, so the loop becomes each owner in turn. Enumerated from pg_proc so a definer added
-- to main later by a backport is still covered by re-running an equivalent, and so this cannot be
-- one entry short — the failure mode that let the class survive in the first place.
-- ---------------------------------------------------------------------------

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
  RAISE NOTICE '0019: pinned pg_temp last on % SECURITY DEFINER functions', v_count;
END
$$;

-- §2b. app.user_has_permission is invoker-rights, owned by the migrator, and shipped with NO pinned
-- path — the specific link the rereview flagged inside the exploited admin authorization chain. It
-- is used by no RLS policy, so a proconfig costs no per-row inlining. Pinned to the same safe form.
ALTER FUNCTION app.user_has_permission(uuid, uuid, text, timestamptz)
  SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------------
-- §4. Asserted from the catalog. A hotfix for an authority boundary asserts its own postcondition.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_left text;
BEGIN
  -- (a) The runtime and control-plane roles can no longer create a temporary relation. Checked for
  -- each connectable attacker role by name, because those are the ones an attacker holds.
  SELECT string_agg(rolname, ', ' ORDER BY rolname) INTO v_left
    FROM (VALUES ('freightos_app'), ('freightos_admin'), ('freightos_control_plane')) AS r(rolname)
   WHERE has_database_privilege(rolname, current_database(), 'TEMPORARY');
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'HOTFIX: these roles can still create temporary relations: %', v_left;
  END IF;

  -- (b) …and no runtime/control-plane role can CREATE in a schema that a definer searches ahead of
  -- pg_temp. The pinned path is pg_catalog, public, pg_temp: pg_catalog is system, so `public` is
  -- the only writable-in-principle schema ahead of pg_temp. A safe search_path is not safe if the
  -- attacker can create objects in an earlier schema.
  SELECT string_agg(rolname || ':' || nsp, ', ' ORDER BY rolname, nsp) INTO v_left
    FROM (VALUES ('freightos_app'), ('freightos_admin'), ('freightos_control_plane')) AS r(rolname)
    CROSS JOIN (VALUES ('public'), ('app'), ('admin')) AS s(nsp)
   WHERE has_schema_privilege(rolname, nsp, 'CREATE');
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'HOTFIX: a runtime role holds CREATE on a trusted schema: %', v_left;
  END IF;

  -- (c) Every app/admin SECURITY DEFINER pins a search_path that ENDS with pg_temp.
  SELECT string_agg(n.nspname || '.' || p.proname, ', ' ORDER BY 1) INTO v_left
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('app', 'admin') AND p.prosecdef
     AND coalesce(substring(p.proconfig::text from 'search_path=([^"}]*)'), '') !~ 'pg_temp\s*$';
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'HOTFIX: definers whose search_path does not end with pg_temp: %', v_left;
  END IF;

  -- (d) …and the one named invoker-rights function does too.
  IF coalesce((SELECT substring(p.proconfig::text from 'search_path=([^"}]*)')
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'app' AND p.proname = 'user_has_permission'), '') !~ 'pg_temp\s*$'
  THEN
    RAISE EXCEPTION 'HOTFIX: app.user_has_permission search_path does not end with pg_temp';
  END IF;
END
$$;
