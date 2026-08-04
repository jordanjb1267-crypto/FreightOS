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
-- app.current_user_id() is NULL for a system, integration, agent or control-plane actor. None of
-- them is a user, so none of them matches a user_id and none of them is caught here — the
-- privileged path is governed by the ADR-0020 function boundary in 0013 instead.
-- ---------------------------------------------------------------------------

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
AS $$
BEGIN
  IF app.current_user_id() IS NULL OR NEW.user_id <> app.current_user_id() THEN
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
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF app.current_user_id() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_user_id
    FROM memberships WHERE tenant_id = NEW.tenant_id AND id = NEW.membership_id;

  IF v_user_id IS DISTINCT FROM app.current_user_id() THEN
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
AS $$
BEGIN
  IF app.current_user_id() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Any membership at all, live or revoked. Widening a role you once held and could hold again is
  -- the same manoeuvre one step removed.
  IF NOT EXISTS (
    SELECT 1
      FROM memberships m
      JOIN membership_roles mr ON mr.tenant_id = m.tenant_id AND mr.membership_id = m.id
     WHERE m.tenant_id = NEW.tenant_id
       AND m.user_id = app.current_user_id()
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

CREATE TRIGGER memberships_reject_self_elevation
  BEFORE INSERT OR UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION app.reject_membership_self_elevation();

CREATE TRIGGER membership_roles_reject_self_elevation
  BEFORE INSERT OR UPDATE ON membership_roles
  FOR EACH ROW EXECUTE FUNCTION app.reject_membership_role_self_elevation();

CREATE TRIGGER role_permissions_reject_self_elevation
  BEFORE INSERT OR UPDATE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION app.reject_role_permission_self_elevation();
