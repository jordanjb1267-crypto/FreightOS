-- 0017 — R2-01: the authorization graph is mutated through a governed boundary, never directly.
--
-- WHAT WAS WRONG
--
-- The self-elevation guards in 0010 ask app.current_user_id() who is acting, and that parses
-- `user:<uuid>` out of app.actor_id — a session variable the caller sets. F-01 closed the case
-- where a caller declined to name a user at all. It did not close the case where a caller names
-- one it is not.
--
-- A regex-valid uuid is not an authenticated identity. A freightos_app session could therefore:
--
--   SET LOCAL app.actor_id = 'user:<any uuid at all>';
--
-- and from there create a role, grant that role a permission, and assign the role to its own
-- membership — because every guard compares the row against the actor the session declared, and
-- the declared actor was somebody else. Self-elevation laundered through a fabricated third party
-- is still self-elevation, and impersonating a real colleague worked identically.
--
-- THE RULE, PER THE OWNER RULING
--
-- Ordinary tenant sessions may READ the authorization graph they are already authorized to see.
-- They may not mutate it. Every change that can increase a principal's effective authority goes
-- through a named admin.* function reached over the freightos_admin connection, and authority
-- comes from that ROLE — which a session cannot set — rather than from any parameter or GUC.
--
-- app.actor_id survives as offered metadata on the audit record. It establishes nothing.
--
-- This is a fail-closed Phase 1 rule and not a deferred feature. Until a trusted application
-- authentication boundary exists there is no way for the database to know which human is behind a
-- tenant session, so the honest position is that a tenant session cannot make an authority
-- -changing decision at all. No end-user application or authentication provider is added here.
--
-- WHAT THE FUNCTIONS STILL CHECK
--
-- The boundary does not replace the guards; it feeds them. Each function validates its actor and
-- then publishes it as app.actor_id for the duration of the transaction, so 0010's self-elevation
-- triggers see the TRUSTED actor rather than a declared one. An administrator adding a permission
-- to a role that administrator holds is still refused, and now cannot be laundered.

-- ---------------------------------------------------------------------------
-- 1. Direct mutation is removed.
--
-- Read stays exactly as it was: ADR-0019's matrix gives tenant sessions read over identity, the
-- read policies are unchanged, and nothing here narrows what a tenant can see.
--
-- The write policies become control-plane-only, which in practice means the definer below —
-- freightos_control_plane holds no privilege on any of these tables (ADR-0020 §7) and
-- freightos_app holds SELECT alone. Two independent refusals therefore stand in front of every
-- one of these tables, and removing either on its own changes nothing.
-- ---------------------------------------------------------------------------

DROP POLICY roles_insert ON roles;
DROP POLICY roles_update ON roles;
CREATE POLICY roles_insert ON roles FOR INSERT WITH CHECK (app.is_control_plane());
CREATE POLICY roles_update ON roles FOR UPDATE
  USING (app.is_control_plane()) WITH CHECK (app.is_control_plane());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON roles FROM freightos_app;

DROP POLICY role_permissions_insert ON role_permissions;
DROP POLICY role_permissions_update ON role_permissions;
CREATE POLICY role_permissions_insert ON role_permissions FOR INSERT
  WITH CHECK (app.is_control_plane());
CREATE POLICY role_permissions_update ON role_permissions FOR UPDATE
  USING (app.is_control_plane()) WITH CHECK (app.is_control_plane());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON role_permissions FROM freightos_app;

DROP POLICY memberships_insert ON memberships;
DROP POLICY memberships_update ON memberships;
CREATE POLICY memberships_insert ON memberships FOR INSERT WITH CHECK (app.is_control_plane());
CREATE POLICY memberships_update ON memberships FOR UPDATE
  USING (app.is_control_plane()) WITH CHECK (app.is_control_plane());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON memberships FROM freightos_app;

DROP POLICY membership_roles_insert ON membership_roles;
DROP POLICY membership_roles_update ON membership_roles;
CREATE POLICY membership_roles_insert ON membership_roles FOR INSERT
  WITH CHECK (app.is_control_plane());
CREATE POLICY membership_roles_update ON membership_roles FOR UPDATE
  USING (app.is_control_plane()) WITH CHECK (app.is_control_plane());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON membership_roles FROM freightos_app;

DROP POLICY service_account_permissions_insert ON service_account_permissions;
DROP POLICY service_account_permissions_update ON service_account_permissions;
CREATE POLICY service_account_permissions_insert ON service_account_permissions FOR INSERT
  WITH CHECK (app.is_control_plane());
CREATE POLICY service_account_permissions_update ON service_account_permissions FOR UPDATE
  USING (app.is_control_plane()) WITH CHECK (app.is_control_plane());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON service_account_permissions FROM freightos_app;

-- The definer's reach, one table and one verb at a time — ADR-0020 §7. UPDATE rather than DELETE
-- throughout: these tables are effective-dated and revoked, never deleted, and there is no DELETE
-- policy for the grant to pair with.
GRANT SELECT, INSERT, UPDATE ON roles TO freightos_admin_owner;
GRANT SELECT, INSERT, UPDATE ON role_permissions TO freightos_admin_owner;
GRANT INSERT, UPDATE ON memberships TO freightos_admin_owner;
GRANT SELECT, INSERT, UPDATE ON membership_roles TO freightos_admin_owner;
GRANT SELECT, INSERT, UPDATE ON service_account_permissions TO freightos_admin_owner;
GRANT SELECT ON permissions, legal_entities, organization_nodes TO freightos_admin_owner;

-- Everything from here to RESET ROLE is created BY the definer owner, the same device 0013 uses.
-- The migrator does not own schema admin and holds no CREATE on it, so it cannot author objects
-- there; becoming the owner for the duration is the supported way to create an object owned by
-- another role, and it removes the whole class of mistake where an ownership transfer is forgotten
-- after a new function and a SECURITY DEFINER ends up running as the deployment role.
--
-- SET LOCAL, so the COMMIT or ROLLBACK that ends this migration undoes it either way.
SET LOCAL ROLE freightos_admin_owner;

-- ---------------------------------------------------------------------------
-- 2. The trusted gate.
--
-- admin.refusal_reason already covers actor, actor_type, purpose, tenant and correlation id. This
-- adds what an AUTHORIZATION mutation additionally requires: the actor has to be a principal that
-- exists, is active, and belongs to the tenant whose authority is being changed.
--
-- That is not identity binding and is not offered as such. The authority to call at all comes from
-- the freightos_admin role; this refuses a call that names a principal who could not have made it,
-- so an audit record can never attribute a change to somebody who was revoked, who belongs to a
-- different tenant, or who does not exist. A service account cannot be named at all: a
-- non-human principal may not authorize a change to who may do what — Constitution Art. I.5.
-- ---------------------------------------------------------------------------

CREATE FUNCTION admin.authorization_refusal_reason(
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_tenant_id uuid,
  p_correlation_id uuid
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_user_id uuid;
  v_principal record;
BEGIN
  v_reason := admin.refusal_reason(p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id);
  IF v_reason IS NOT NULL THEN
    RETURN v_reason;
  END IF;

  IF p_purpose <> 'identity_administration' THEN
    RETURN format(
      'purpose %L does not authorise a change to the authorization graph; identity_administration '
      'is the only purpose that does', p_purpose);
  END IF;

  -- A platform actor is the provisioning path and names no user by construction.
  IF p_actor_type = 'system' THEN
    IF p_actor !~ '^system:[a-z0-9._:-]+$' THEN
      RETURN format('system actor %L must be of the form system:<name>', p_actor);
    END IF;
    RETURN NULL;
  END IF;

  v_user_id := nullif(substring(p_actor from
    '^user:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'), '')::uuid;
  IF v_user_id IS NULL THEN
    RETURN format(
      'human actor %L must be of the form user:<uuid> and name a user of this tenant', p_actor);
  END IF;

  SELECT status, revoked_at, effective_from, effective_to
    INTO v_principal
    FROM users WHERE tenant_id = p_tenant_id AND id = v_user_id;

  -- Deliberately one reason for "not in this tenant" and "does not exist": distinguishing them
  -- would turn this into an oracle for which user ids exist in which tenant.
  IF NOT FOUND THEN
    RETURN format('actor %L is not a user of tenant %s', p_actor, p_tenant_id);
  END IF;
  IF v_principal.status <> 'active'
     OR v_principal.revoked_at IS NOT NULL
     OR v_principal.effective_from > now()
     OR (v_principal.effective_to IS NOT NULL AND v_principal.effective_to <= now()) THEN
    RETURN format('actor %L is not an active principal and may not authorise a change', p_actor);
  END IF;

  RETURN NULL;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Idempotency.
--
-- A retry under the same correlation id must not apply a change twice. The audit ledger already
-- records every succeeded mutation with its correlation id and action, so it is the idempotency
-- store: no second table, and no state that can disagree with the record of what happened.
-- ---------------------------------------------------------------------------

CREATE FUNCTION admin.prior_success(p_correlation_id uuid, p_action text) RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT id FROM audit_events
   WHERE correlation_id = p_correlation_id
     AND operation_class = 'privileged'
     AND outcome = 'succeeded'
     AND payload ->> 'action' = p_action
   ORDER BY created_at
   LIMIT 1
$$;

-- ---------------------------------------------------------------------------
-- 4. Publish the trusted actor to the guards.
--
-- 0010's self-elevation triggers read app.actor_id. Setting it here — transaction-locally, after
-- validation — is what makes them evaluate against the actor this boundary VERIFIED rather than
-- one a session declared. It is the reason an administrator still cannot add a permission to a
-- role that administrator holds, and cannot launder it through a fabricated third party either.
-- ---------------------------------------------------------------------------

CREATE FUNCTION admin.publish_actor(p_actor text) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT set_config('app.actor_id', p_actor, true)
$$;

-- ---------------------------------------------------------------------------
-- 5. The approved authorization mutations.
--
-- Ten, one per thing that can change effective authority, each with the same shape: gate, deny with
-- a reason, replay an identical correlation id rather than repeating the change, publish the
-- verified actor, mutate inside a subtransaction, record the outcome. ADR-0020 §Consequences
-- requires each admin.* function to be justified in a migration and reviewed at every phase exit
-- gate, which is why the list is enumerated rather than generalised into one do-anything entry
-- point taking a table name.
--
-- The audit write and the mutation share this transaction, so a successful change is audited
-- atomically with itself. A denial is transaction-bound, which is TRANSACTION_BOUND_DENIAL_AUDIT
-- and is stated in ADR-0026 §5.
-- ---------------------------------------------------------------------------

CREATE FUNCTION admin.grant_membership(
  p_tenant_id uuid,
  p_user_id uuid,
  p_organization_node_id uuid,
  p_legal_entity_id uuid,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid
) RETURNS admin.privileged_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id);

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM users WHERE tenant_id = p_tenant_id AND id = p_user_id) THEN
      v_reason := format('user %s is not a user of tenant %s', p_user_id, p_tenant_id);
    ELSIF NOT EXISTS (SELECT 1 FROM organization_nodes
                       WHERE tenant_id = p_tenant_id AND id = p_organization_node_id) THEN
      v_reason := format('organization node %s is not in tenant %s',
                         p_organization_node_id, p_tenant_id);
    ELSIF app.governing_legal_entity_id(p_tenant_id, p_organization_node_id)
          IS DISTINCT FROM p_legal_entity_id THEN
      v_reason := format(
        'legal entity %s does not govern organization node %s',
        p_legal_entity_id, p_organization_node_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.membership_granted.v1', 'membership', p_user_id::text, 'identity.membership.grant');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_correlation_id, 'identity.membership.grant');
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    INSERT INTO memberships
      (tenant_id, organization_node_id, legal_entity_id, user_id, status, created_by)
    VALUES (p_tenant_id, p_organization_node_id, p_legal_entity_id, p_user_id, 'active', p_actor)
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('membership_id', v_id, 'user_id', p_user_id);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, p_legal_entity_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.membership_granted.v1', 'membership', p_user_id::text, 'identity.membership.grant', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, p_legal_entity_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.membership_granted.v1', 'membership', p_user_id::text, 'identity.membership.grant', 'succeeded', v_result);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$$;

CREATE FUNCTION admin.set_membership_status(
  p_tenant_id uuid,
  p_membership_id uuid,
  p_status text,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid
) RETURNS admin.privileged_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id);

  IF v_reason IS NULL THEN
    IF p_status NOT IN ('active', 'suspended') THEN
      v_reason := format('membership status %L is not settable here; revoke uses its own operation',
                         p_status);
    ELSIF NOT EXISTS (SELECT 1 FROM memberships
                       WHERE tenant_id = p_tenant_id AND id = p_membership_id) THEN
      v_reason := format('membership %s is not in tenant %s', p_membership_id, p_tenant_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.membership_status_set.v1', 'membership', p_membership_id::text, 'identity.membership.set_status');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_correlation_id, 'identity.membership.set_status');
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    UPDATE memberships SET status = p_status::app.identity_status
     WHERE tenant_id = p_tenant_id AND id = p_membership_id
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('membership_id', v_id, 'status', p_status);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.membership_status_set.v1', 'membership', p_membership_id::text, 'identity.membership.set_status', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.membership_status_set.v1', 'membership', p_membership_id::text, 'identity.membership.set_status', 'succeeded', v_result);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$$;

CREATE FUNCTION admin.revoke_membership(
  p_tenant_id uuid,
  p_membership_id uuid,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid
) RETURNS admin.privileged_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id);

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM memberships
                    WHERE tenant_id = p_tenant_id AND id = p_membership_id
                      AND revoked_at IS NULL) THEN
      v_reason := format('membership %s is not an unrevoked membership of tenant %s',
                         p_membership_id, p_tenant_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.membership_revoked.v1', 'membership', p_membership_id::text, 'identity.membership.revoke');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_correlation_id, 'identity.membership.revoke');
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    UPDATE memberships
       SET revoked_at = now(), revoked_by = p_actor, status = 'revoked'
     WHERE tenant_id = p_tenant_id AND id = p_membership_id
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('membership_id', v_id);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.membership_revoked.v1', 'membership', p_membership_id::text, 'identity.membership.revoke', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.membership_revoked.v1', 'membership', p_membership_id::text, 'identity.membership.revoke', 'succeeded', v_result);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$$;

CREATE FUNCTION admin.assign_membership_role(
  p_tenant_id uuid,
  p_membership_id uuid,
  p_role_id uuid,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid
) RETURNS admin.privileged_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id);

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM memberships
                    WHERE tenant_id = p_tenant_id AND id = p_membership_id) THEN
      v_reason := format('membership %s is not in tenant %s', p_membership_id, p_tenant_id);
    ELSIF NOT EXISTS (SELECT 1 FROM roles WHERE tenant_id = p_tenant_id AND id = p_role_id) THEN
      v_reason := format('role %s is not in tenant %s', p_role_id, p_tenant_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.membership_role_assigned.v1', 'membership_role', p_membership_id::text, 'identity.membership_role.assign');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_correlation_id, 'identity.membership_role.assign');
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    INSERT INTO membership_roles (tenant_id, membership_id, role_id, created_by)
    VALUES (p_tenant_id, p_membership_id, p_role_id, p_actor)
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('membership_role_id', v_id, 'role_id', p_role_id);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.membership_role_assigned.v1', 'membership_role', p_membership_id::text, 'identity.membership_role.assign', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.membership_role_assigned.v1', 'membership_role', p_membership_id::text, 'identity.membership_role.assign', 'succeeded', v_result);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$$;

CREATE FUNCTION admin.revoke_membership_role(
  p_tenant_id uuid,
  p_membership_role_id uuid,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid
) RETURNS admin.privileged_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id);

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM membership_roles
                    WHERE tenant_id = p_tenant_id AND id = p_membership_role_id
                      AND revoked_at IS NULL) THEN
      v_reason := format('membership role %s is not an unrevoked assignment of tenant %s',
                         p_membership_role_id, p_tenant_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.membership_role_revoked.v1', 'membership_role', p_membership_role_id::text, 'identity.membership_role.revoke');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_correlation_id, 'identity.membership_role.revoke');
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    UPDATE membership_roles SET revoked_at = now(), revoked_by = p_actor
     WHERE tenant_id = p_tenant_id AND id = p_membership_role_id
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('membership_role_id', v_id);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.membership_role_revoked.v1', 'membership_role', p_membership_role_id::text, 'identity.membership_role.revoke', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.membership_role_revoked.v1', 'membership_role', p_membership_role_id::text, 'identity.membership_role.revoke', 'succeeded', v_result);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$$;

CREATE FUNCTION admin.create_role(
  p_tenant_id uuid,
  p_organization_node_id uuid,
  p_legal_entity_id uuid,
  p_key text,
  p_name text,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid
) RETURNS admin.privileged_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id);

  IF v_reason IS NULL THEN
    IF p_key IS NULL OR btrim(p_key) = '' OR p_name IS NULL OR btrim(p_name) = '' THEN
      v_reason := 'a role needs a key and a name';
    ELSIF NOT EXISTS (SELECT 1 FROM organization_nodes
                       WHERE tenant_id = p_tenant_id AND id = p_organization_node_id) THEN
      v_reason := format('organization node %s is not in tenant %s',
                         p_organization_node_id, p_tenant_id);
    ELSIF app.governing_legal_entity_id(p_tenant_id, p_organization_node_id)
          IS DISTINCT FROM p_legal_entity_id THEN
      v_reason := format('legal entity %s does not govern organization node %s',
                         p_legal_entity_id, p_organization_node_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.role_created.v1', 'role', p_key, 'identity.role.create');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_correlation_id, 'identity.role.create');
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    INSERT INTO roles
      (tenant_id, organization_node_id, legal_entity_id, key, name, created_by)
    VALUES (p_tenant_id, p_organization_node_id, p_legal_entity_id, p_key, p_name, p_actor)
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('role_id', v_id, 'key', p_key);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, p_legal_entity_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.role_created.v1', 'role', p_key, 'identity.role.create', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, p_legal_entity_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.role_created.v1', 'role', p_key, 'identity.role.create', 'succeeded', v_result);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$$;

CREATE FUNCTION admin.grant_role_permission(
  p_tenant_id uuid,
  p_role_id uuid,
  p_permission_key text,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid
) RETURNS admin.privileged_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id);

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM roles WHERE tenant_id = p_tenant_id AND id = p_role_id) THEN
      v_reason := format('role %s is not in tenant %s', p_role_id, p_tenant_id);
    ELSIF NOT EXISTS (SELECT 1 FROM permissions WHERE key = p_permission_key) THEN
      v_reason := format('permission %L is not in the catalog', p_permission_key);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.role_permission_granted.v1', 'role_permission', p_role_id::text, 'identity.role_permission.grant');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_correlation_id, 'identity.role_permission.grant');
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    INSERT INTO role_permissions (tenant_id, role_id, permission_id, created_by)
    SELECT p_tenant_id, p_role_id, id, p_actor FROM permissions WHERE key = p_permission_key
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('role_permission_id', v_id, 'permission', p_permission_key);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.role_permission_granted.v1', 'role_permission', p_role_id::text, 'identity.role_permission.grant', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.role_permission_granted.v1', 'role_permission', p_role_id::text, 'identity.role_permission.grant', 'succeeded', v_result);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$$;

CREATE FUNCTION admin.revoke_role_permission(
  p_tenant_id uuid,
  p_role_permission_id uuid,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid
) RETURNS admin.privileged_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id);

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM role_permissions
                    WHERE tenant_id = p_tenant_id AND id = p_role_permission_id
                      AND revoked_at IS NULL) THEN
      v_reason := format('role permission %s is not an unrevoked grant of tenant %s',
                         p_role_permission_id, p_tenant_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.role_permission_revoked.v1', 'role_permission', p_role_permission_id::text, 'identity.role_permission.revoke');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_correlation_id, 'identity.role_permission.revoke');
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    UPDATE role_permissions SET revoked_at = now(), revoked_by = p_actor
     WHERE tenant_id = p_tenant_id AND id = p_role_permission_id
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('role_permission_id', v_id);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.role_permission_revoked.v1', 'role_permission', p_role_permission_id::text, 'identity.role_permission.revoke', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.role_permission_revoked.v1', 'role_permission', p_role_permission_id::text, 'identity.role_permission.revoke', 'succeeded', v_result);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$$;

CREATE FUNCTION admin.grant_service_account_permission(
  p_tenant_id uuid,
  p_service_account_id uuid,
  p_permission_key text,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid
) RETURNS admin.privileged_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id);

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM service_accounts
                    WHERE tenant_id = p_tenant_id AND id = p_service_account_id) THEN
      v_reason := format('service account %s is not in tenant %s',
                         p_service_account_id, p_tenant_id);
    ELSIF NOT EXISTS (SELECT 1 FROM permissions WHERE key = p_permission_key) THEN
      v_reason := format('permission %L is not in the catalog', p_permission_key);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.service_account_permission_granted.v1', 'service_account_permission', p_service_account_id::text, 'identity.service_account_permission.grant');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_correlation_id, 'identity.service_account_permission.grant');
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    INSERT INTO service_account_permissions
      (tenant_id, service_account_id, permission_id, created_by)
    SELECT p_tenant_id, p_service_account_id, id, p_actor
      FROM permissions WHERE key = p_permission_key
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('service_account_permission_id', v_id,
                                   'permission', p_permission_key);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.service_account_permission_granted.v1', 'service_account_permission', p_service_account_id::text, 'identity.service_account_permission.grant', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.service_account_permission_granted.v1', 'service_account_permission', p_service_account_id::text, 'identity.service_account_permission.grant', 'succeeded', v_result);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$$;

CREATE FUNCTION admin.revoke_service_account_permission(
  p_tenant_id uuid,
  p_service_account_permission_id uuid,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid
) RETURNS admin.privileged_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id);

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM service_account_permissions
                    WHERE tenant_id = p_tenant_id AND id = p_service_account_permission_id
                      AND revoked_at IS NULL) THEN
      v_reason := format('service account permission %s is not an unrevoked grant of tenant %s',
                         p_service_account_permission_id, p_tenant_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.service_account_permission_revoked.v1', 'service_account_permission', p_service_account_permission_id::text, 'identity.service_account_permission.revoke');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_correlation_id, 'identity.service_account_permission.revoke');
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    UPDATE service_account_permissions SET revoked_at = now(), revoked_by = p_actor
     WHERE tenant_id = p_tenant_id AND id = p_service_account_permission_id
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('service_account_permission_id', v_id);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.service_account_permission_revoked.v1', 'service_account_permission', p_service_account_permission_id::text, 'identity.service_account_permission.revoke', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.service_account_permission_revoked.v1', 'service_account_permission', p_service_account_permission_id::text, 'identity.service_account_permission.revoke', 'succeeded', v_result);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$$;

-- ---------------------------------------------------------------------------
-- 6. Execute-only grants — ADR-0020 §4 and §6. Ownership needs no statement: everything above was
-- created by freightos_admin_owner, and the assertion after RESET ROLE proves it.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION admin.authorization_refusal_reason(text, text, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.prior_success(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.publish_actor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.grant_membership(uuid, uuid, uuid, uuid, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.set_membership_status(uuid, uuid, text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.revoke_membership(uuid, uuid, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.assign_membership_role(uuid, uuid, uuid, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.revoke_membership_role(uuid, uuid, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.create_role(uuid, uuid, uuid, text, text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.grant_role_permission(uuid, uuid, text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.revoke_role_permission(uuid, uuid, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.grant_service_account_permission(uuid, uuid, text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.revoke_service_account_permission(uuid, uuid, text, text, text, uuid) FROM PUBLIC;

-- Only the administrative connection may call them. The three helpers are internal and are granted
-- to nobody, so no caller can reach the actor-publishing step or the gate on its own.
GRANT EXECUTE ON FUNCTION admin.grant_membership(uuid, uuid, uuid, uuid, text, text, text, uuid) TO freightos_admin;
GRANT EXECUTE ON FUNCTION admin.set_membership_status(uuid, uuid, text, text, text, text, uuid) TO freightos_admin;
GRANT EXECUTE ON FUNCTION admin.revoke_membership(uuid, uuid, text, text, text, uuid) TO freightos_admin;
GRANT EXECUTE ON FUNCTION admin.assign_membership_role(uuid, uuid, uuid, text, text, text, uuid) TO freightos_admin;
GRANT EXECUTE ON FUNCTION admin.revoke_membership_role(uuid, uuid, text, text, text, uuid) TO freightos_admin;
GRANT EXECUTE ON FUNCTION admin.create_role(uuid, uuid, uuid, text, text, text, text, text, uuid) TO freightos_admin;
GRANT EXECUTE ON FUNCTION admin.grant_role_permission(uuid, uuid, text, text, text, text, uuid) TO freightos_admin;
GRANT EXECUTE ON FUNCTION admin.revoke_role_permission(uuid, uuid, text, text, text, uuid) TO freightos_admin;
GRANT EXECUTE ON FUNCTION admin.grant_service_account_permission(uuid, uuid, text, text, text, text, uuid) TO freightos_admin;
GRANT EXECUTE ON FUNCTION admin.revoke_service_account_permission(uuid, uuid, text, text, text, uuid) TO freightos_admin;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 7. Assert the shape rather than review it.
--
-- A function here that lost SECURITY DEFINER, changed owner, or lost its pinned search_path would
-- keep working and stop being trusted, and nothing else about the database would look different.
-- ---------------------------------------------------------------------------

DO $assert$
DECLARE
  v_wrong text;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_wrong
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'admin'
     AND (NOT p.prosecdef
          OR p.proowner <> 'freightos_admin_owner'::regrole
          OR p.proconfig IS NULL
          OR NOT (p.proconfig @> ARRAY['search_path=pg_catalog, public']));

  IF v_wrong IS NOT NULL THEN
    RAISE EXCEPTION
      'admin functions must be SECURITY DEFINER, owned by freightos_admin_owner, with a pinned '
      'search_path: %', v_wrong
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END
$assert$;

DO $assert$
DECLARE
  v_writable text;
BEGIN
  -- The application role holds no write on any authorization-graph table. Asserted here so the
  -- boundary cannot be reopened by a later GRANT without this migration's own check noticing.
  SELECT string_agg(format('%s:%s', table_name, privilege_type), ', ' ORDER BY table_name)
    INTO v_writable
    FROM information_schema.table_privileges
   WHERE grantee = 'freightos_app'
     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
     AND table_name IN ('roles', 'role_permissions', 'memberships', 'membership_roles',
                        'service_account_permissions');

  IF v_writable IS NOT NULL THEN
    RAISE EXCEPTION 'freightos_app still holds write privilege on the authorization graph: %',
      v_writable
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END
$assert$;
