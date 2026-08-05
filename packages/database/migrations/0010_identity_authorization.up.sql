-- 0010 — Effective permission resolution, and the self-elevation guards.
--
-- Separated from 0008 and 0009 because it depends on both: role permissions come from 0008,
-- memberships from 0009, and the guard on role_permissions has to know who holds the role.
--
-- Constitution Art. I.5: no agent grants itself authority. The same rule has to hold for a human
-- actor, or the identity model has a hole a person can walk through.

-- ---------------------------------------------------------------------------
-- Effective permission resolution.
--
-- Every link in the chain must be live at the same instant: the membership, the membership-role
-- assignment, the role, and the role-permission grant. Revoking any one of them ends the
-- authorization, which is what "revoked memberships, roles, permissions and service accounts
-- cease authorizing access" means in practice.
--
-- p_as_of is required, not defaulted. P-20: an implicit now() makes an effective-dated read
-- irreproducible, and a permission check that cannot be replayed cannot be audited.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.user_has_permission(
  p_tenant_id uuid,
  p_user_id uuid,
  p_permission_key text,
  p_as_of timestamptz
) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM memberships m
      JOIN membership_roles mr
        ON mr.tenant_id = m.tenant_id AND mr.membership_id = m.id
      JOIN roles r
        ON r.tenant_id = mr.tenant_id AND r.id = mr.role_id
      JOIN role_permissions rp
        ON rp.tenant_id = r.tenant_id AND rp.role_id = r.id
      JOIN permissions p
        ON p.id = rp.permission_id
      JOIN users u
        ON u.tenant_id = m.tenant_id AND u.id = m.user_id
     WHERE m.tenant_id = p_tenant_id
       AND m.user_id = p_user_id
       AND p.key = p_permission_key

       AND u.status = 'active' AND u.revoked_at IS NULL
       AND u.effective_from <= p_as_of
       AND (u.effective_to IS NULL OR u.effective_to > p_as_of)

       AND m.status = 'active' AND m.revoked_at IS NULL
       AND m.effective_from <= p_as_of
       AND (m.effective_to IS NULL OR m.effective_to > p_as_of)

       AND mr.revoked_at IS NULL
       AND mr.effective_from <= p_as_of
       AND (mr.effective_to IS NULL OR mr.effective_to > p_as_of)

       AND r.status = 'active' AND r.revoked_at IS NULL
       AND r.effective_from <= p_as_of
       AND (r.effective_to IS NULL OR r.effective_to > p_as_of)

       AND rp.revoked_at IS NULL
       AND rp.effective_from <= p_as_of
       AND (rp.effective_to IS NULL OR rp.effective_to > p_as_of)
  )
$$;
COMMENT ON FUNCTION app.user_has_permission IS
  'Mirrored by resolveUserPermissions() in packages/identity/src/permissions.ts. Explicit as-of, '
  'never an implicit now() — P-20.';

-- ---------------------------------------------------------------------------
-- Self-elevation guards.
--
-- Narrowing your own access is always allowed: a person removing their own membership is a safe
-- act, and blocking it would be an obstacle with no security value. Widening it is not, and that
-- is the whole distinction these three triggers draw.
--
-- THE GUARDS ARE TRUSTED CODE, AND HAVE TO BE — F-01.
--
-- They were ordinary plpgsql running as the caller, and they decided "is this row about me?" by
-- querying `memberships` and `membership_roles` — two tables row-level security filters for that
-- same caller. When the evidence was invisible the query returned nothing and the guard read
-- nothing as "not about me" and allowed the write. A control that fails open on absence of
-- evidence is not a control; it is a control that can be turned off by standing somewhere else.
--
-- The path was not theoretical. `role_permissions_insert` is scoped by tenant alone, while
-- `memberships_read` additionally requires organization-node scope. A caller holding a narrow
-- node could therefore write a role_permissions row for a role it holds, while its own membership
-- — sitting at a different node — was invisible to it. The guard saw no membership, concluded the
-- role was somebody else's, and let the caller add a permission to a role it holds. Every
-- combination of legal authority class and operating context reached it, because none of them
-- widens the node scope that hid the evidence.
--
-- So the evidence is now read by a definer that always sees all of it. Each guard is SECURITY
-- DEFINER owned by freightos_identity_guard: NOLOGIN, so it is not a connection anyone can make;
-- a member of freightos_control_plane, so the policies admit its reads; and granted SELECT on
-- exactly two tables and nothing else, so what it can do with that standing is bounded by the
-- grant rather than by the function body. search_path is pinned, because an unpinned SECURITY
-- DEFINER function is a privilege escalation waiting for a schema the caller controls.
--
-- ACTOR TYPE IS NOT A WAY OUT — F-01.
--
-- These guards used to begin `IF app.current_user_id() IS NULL THEN RETURN NEW`, on the reasoning
-- that a system, integration or agent actor is not a user and so cannot be granting itself
-- anything. app.current_user_id() parses `user:<uuid>` out of app.actor_id, which is a session
-- variable the caller sets. A person who did not wish to be governed by these triggers had only
-- to call themselves `system:me` and all three stopped applying.
--
-- The three tables below are the authorization graph, and freightos_app is the only role holding
-- any write privilege on them — the control plane is granted none by ADR-0020 §7, and the admin
-- definer holds SELECT alone. Every writer is therefore an untrusted session, and every write is
-- now required to name the person making it. An integration or an agent changing who may do what
-- is outside Horizon 1 in any case: Constitution Art. I.5, no agent grants itself authority.
-- ---------------------------------------------------------------------------

-- The definer owner.
--
-- Created here rather than reused from 0013, which runs later and whose freightos_admin_owner
-- carries table grants of its own. A guard should hold the narrowest standing that lets it see
-- what it must judge, and nothing that would matter if the function body were ever wrong.
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_identity_guard') THEN
    CREATE ROLE freightos_identity_guard NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$guard$;

DO $guard$
DECLARE
  r record;
BEGIN
  SELECT rolsuper, rolbypassrls, rolcanlogin INTO r
    FROM pg_roles WHERE rolname = 'freightos_identity_guard';
  IF r.rolsuper OR r.rolbypassrls OR r.rolcanlogin THEN
    RAISE EXCEPTION
      'freightos_identity_guard must be NOLOGIN NOSUPERUSER NOBYPASSRLS (login=% super=% rls=%)',
      r.rolcanlogin, r.rolsuper, r.rolbypassrls
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END
$guard$;

-- Deployment-time SET membership, exactly as 0013 takes on its own definer owner and for the same
-- reason: `ALTER FUNCTION ... OWNER TO` requires the assigning role to be able to SET ROLE to the
-- target. INHERIT FALSE is load-bearing — the guard is about to become a member of
-- freightos_control_plane, and a migrator that inherited it would satisfy app.is_control_plane()
-- and take the control-plane branch of every policy in the schema for the rest of the deployment.
DO $guard$
BEGIN
  IF NOT pg_has_role(current_user, 'freightos_identity_guard', 'SET') THEN
    EXECUTE format('GRANT freightos_identity_guard TO %I WITH SET TRUE, INHERIT FALSE',
                   current_user);
  END IF;
END
$guard$;

-- Membership in the control plane is what carries the definer through the policy branch, the same
-- device 0013 uses for its admin definer: the escape stays visible in pg_policies rather than
-- hidden in a role attribute, and BYPASSRLS is granted to nothing.
GRANT freightos_control_plane TO freightos_identity_guard;
GRANT USAGE ON SCHEMA app, public TO freightos_identity_guard;

-- The whole of its reach. Three tables, SELECT only. It writes nothing and reads nothing else.
GRANT SELECT ON memberships TO freightos_identity_guard;
GRANT SELECT ON membership_roles TO freightos_identity_guard;
-- The closure is mechanical rather than an additional reach, and 0013 grants it to the admin
-- definer for the same reason: `memberships_read` evaluates app.organization_node_scope_ok, which
-- reads the closure, and PostgreSQL checks the table privilege when the policy expression is
-- planned even though the definer satisfies the predicate through its control-plane branch and
-- never reaches the subquery.
GRANT SELECT ON organization_node_closure TO freightos_identity_guard;

-- True when the row is moving toward less access rather than more.
CREATE FUNCTION app.is_narrowing_identity_change(
  p_old_status app.identity_status,
  p_new_status app.identity_status,
  p_old_revoked_at timestamptz,
  p_new_revoked_at timestamptz
) RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT (p_new_revoked_at IS NOT NULL AND p_old_revoked_at IS NULL)
      OR (p_new_status IN ('suspended', 'revoked')
          AND p_old_status NOT IN ('suspended', 'revoked'))
$$;

CREATE FUNCTION app.reject_membership_self_elevation() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := app.current_user_id();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'identity change refused: actor "%" is not a user, and a change to who holds authority '
      'must name the person making it — Constitution Art. I.5',
      coalesce(app.current_actor_id(), 'null')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.user_id <> v_actor THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'self-elevation refused: actor % may not grant itself a membership',
      app.current_actor_id()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT app.is_narrowing_identity_change(
           OLD.status, NEW.status, OLD.revoked_at, NEW.revoked_at) THEN
    RAISE EXCEPTION 'self-elevation refused: actor % may only narrow its own membership',
      app.current_actor_id()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END
$$;

CREATE FUNCTION app.reject_membership_role_self_elevation() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := app.current_user_id();
  v_user_id uuid;
  v_found boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'identity change refused: actor "%" is not a user, and a change to who holds authority '
      'must name the person making it — Constitution Art. I.5',
      coalesce(app.current_actor_id(), 'null')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Read as the definer, so the answer does not depend on what the caller can see.
  SELECT user_id, true INTO v_user_id, v_found
    FROM memberships WHERE tenant_id = NEW.tenant_id AND id = NEW.membership_id;

  -- No membership means the row points at nothing. The foreign key will say so in a moment; until
  -- then this guard has no evidence either way and refuses rather than assuming innocence.
  IF NOT coalesce(v_found, false) THEN
    RAISE EXCEPTION
      'identity change refused: membership % is not present in tenant %',
      NEW.membership_id, NEW.tenant_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_user_id IS DISTINCT FROM v_actor THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'self-elevation refused: actor % may not grant itself a role',
      app.current_actor_id()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'self-elevation refused: actor % may only revoke its own role assignment',
      app.current_actor_id()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END
$$;

CREATE FUNCTION app.reject_role_permission_self_elevation() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := app.current_user_id();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'identity change refused: actor "%" is not a user, and a change to who holds authority '
      'must name the person making it — Constitution Art. I.5',
      coalesce(app.current_actor_id(), 'null')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Any membership at all, live or revoked. Widening a role you once held and could hold again is
  -- the same manoeuvre one step removed.
  --
  -- Read as the definer. This is the query that used to be filtered for the caller, and the reason
  -- a caller standing at a narrow organization node could add a permission to a role it holds:
  -- its own membership was out of node scope, so this EXISTS was false and the guard stood down.
  IF NOT EXISTS (
    SELECT 1
      FROM memberships m
      JOIN membership_roles mr ON mr.tenant_id = m.tenant_id AND mr.membership_id = m.id
     WHERE m.tenant_id = NEW.tenant_id
       AND m.user_id = v_actor
       AND mr.role_id = NEW.role_id
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION
      'self-elevation refused: actor % may not add a permission to a role it holds',
      app.current_actor_id()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL) THEN
    RAISE EXCEPTION
      'self-elevation refused: actor % may only revoke a permission on a role it holds',
      app.current_actor_id()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END
$$;

-- Ownership, and the standing that goes with it.
--
-- CREATE on schema app is granted for the transfer and taken straight back: `ALTER FUNCTION ...
-- OWNER TO` requires the incoming owner to hold CREATE on the function's schema, and leaving it
-- would let a role whose entire purpose is to read two tables add objects to the schema every
-- policy in the database resolves through.
GRANT CREATE ON SCHEMA app TO freightos_identity_guard;

ALTER FUNCTION app.reject_membership_self_elevation() OWNER TO freightos_identity_guard;
ALTER FUNCTION app.reject_membership_role_self_elevation() OWNER TO freightos_identity_guard;
ALTER FUNCTION app.reject_role_permission_self_elevation() OWNER TO freightos_identity_guard;

REVOKE CREATE ON SCHEMA app FROM freightos_identity_guard;

-- A SECURITY DEFINER function is executable by PUBLIC unless told otherwise, and these three are
-- reachable only as triggers. Nothing may call them directly.
REVOKE ALL ON FUNCTION app.reject_membership_self_elevation() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reject_membership_role_self_elevation() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reject_role_permission_self_elevation() FROM PUBLIC;

-- Asserted rather than assumed. A guard that silently reverted to running as its caller would
-- restore the exact fail-open this migration exists to close, and nothing else would change.
DO $guard$
DECLARE
  v_wrong text;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_wrong
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'app'
     AND p.proname IN ('reject_membership_self_elevation',
                       'reject_membership_role_self_elevation',
                       'reject_role_permission_self_elevation')
     AND (NOT p.prosecdef
          OR p.proowner <> 'freightos_identity_guard'::regrole
          OR p.proconfig IS NULL
          OR NOT (p.proconfig @> ARRAY['search_path=pg_catalog, public']));

  IF v_wrong IS NOT NULL THEN
    RAISE EXCEPTION
      'self-elevation guards must be SECURITY DEFINER, owned by freightos_identity_guard, with a '
      'pinned search_path: %', v_wrong
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END
$guard$;

CREATE TRIGGER memberships_reject_self_elevation
  BEFORE INSERT OR UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION app.reject_membership_self_elevation();

CREATE TRIGGER membership_roles_reject_self_elevation
  BEFORE INSERT OR UPDATE ON membership_roles
  FOR EACH ROW EXECUTE FUNCTION app.reject_membership_role_self_elevation();

CREATE TRIGGER role_permissions_reject_self_elevation
  BEFORE INSERT OR UPDATE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION app.reject_role_permission_self_elevation();
