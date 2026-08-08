-- ---------------------------------------------------------------------------
-- Restore the pre-0026 entry points verbatim, captured with pg_get_functiondef() from a
-- database migrated 1..25 and nothing else.
--
-- Reverting reopens F-A path 1. That is what reverting this migration MEANS, and a down
-- migration reverts rather than editorialises. What it must not do is take anything else with
-- it: the registry, its owner role and its schema are dropped here because 0026 created them,
-- and nothing else is touched.
-- ---------------------------------------------------------------------------

SET LOCAL ROLE freightos_admin_owner;
DROP FUNCTION admin.assign_membership_role(p_tenant_id uuid,p_membership_id uuid,p_role_id uuid,p_purpose text,p_correlation_id uuid);
DROP FUNCTION admin.create_role(p_tenant_id uuid,p_organization_node_id uuid,p_legal_entity_id uuid,p_key text,p_name text,p_purpose text,p_correlation_id uuid);
DROP FUNCTION admin.export_tenant_audit(p_tenant_id uuid,p_from timestamp with time zone,p_to timestamp with time zone,p_purpose text,p_correlation_id uuid);
DROP FUNCTION admin.grant_membership(p_tenant_id uuid,p_user_id uuid,p_organization_node_id uuid,p_legal_entity_id uuid,p_purpose text,p_correlation_id uuid);
DROP FUNCTION admin.grant_role_permission(p_tenant_id uuid,p_role_id uuid,p_permission_key text,p_purpose text,p_correlation_id uuid);
DROP FUNCTION admin.grant_service_account_permission(p_tenant_id uuid,p_service_account_id uuid,p_permission_key text,p_purpose text,p_correlation_id uuid);
DROP FUNCTION admin.issue_session_binding(p_principal_type text,p_principal_id uuid,p_tenant_id uuid,p_organization_node_id uuid,p_legal_entity_id uuid,p_legal_authority_class text,p_operating_context text,p_target_backend_pid integer,p_installable_seconds integer);
DROP FUNCTION admin.move_organization_node(p_tenant_id uuid,p_node_id uuid,p_new_parent_id uuid,p_purpose text,p_correlation_id uuid);
DROP FUNCTION admin.provision_tenant(p_tenant_id uuid,p_name text,p_purpose text,p_correlation_id uuid);
DROP FUNCTION admin.revoke_membership(p_tenant_id uuid,p_membership_id uuid,p_purpose text,p_correlation_id uuid);
DROP FUNCTION admin.revoke_membership_role(p_tenant_id uuid,p_membership_role_id uuid,p_purpose text,p_correlation_id uuid);
DROP FUNCTION admin.revoke_role_permission(p_tenant_id uuid,p_role_permission_id uuid,p_purpose text,p_correlation_id uuid);
DROP FUNCTION admin.revoke_service_account_permission(p_tenant_id uuid,p_service_account_permission_id uuid,p_purpose text,p_correlation_id uuid);
DROP FUNCTION admin.set_membership_status(p_tenant_id uuid,p_membership_id uuid,p_status text,p_purpose text,p_correlation_id uuid);
DROP FUNCTION admin.set_tenant_status(p_tenant_id uuid,p_status text,p_purpose text,p_correlation_id uuid);
DROP FUNCTION admin.tenant_identity_summary(p_tenant_id uuid,p_purpose text,p_correlation_id uuid);

-- admin.assign_membership_role(uuid,uuid,uuid,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.assign_membership_role(p_tenant_id uuid, p_membership_id uuid, p_role_id uuid, p_actor text, p_actor_type text, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.membership.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.memberships
                    WHERE tenant_id = p_tenant_id AND id = p_membership_id) THEN
      v_reason := format('membership %s is not in tenant %s', p_membership_id, p_tenant_id);
    ELSIF NOT EXISTS (SELECT 1 FROM public.roles WHERE tenant_id = p_tenant_id AND id = p_role_id) THEN
      v_reason := format('role %s is not in tenant %s', p_role_id, p_tenant_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.membership_role_assigned.v1', 'membership_role', p_membership_id::text, 'identity.membership_role.assign');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.membership_role.assign', p_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    INSERT INTO public.membership_roles (tenant_id, membership_id, role_id, created_by)
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

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.membership_role.assign', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.create_role(uuid,uuid,uuid,text,text,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.create_role(p_tenant_id uuid, p_organization_node_id uuid, p_legal_entity_id uuid, p_key text, p_name text, p_actor text, p_actor_type text, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.role.write');

  IF v_reason IS NULL THEN
    IF p_key IS NULL OR btrim(p_key) = '' OR p_name IS NULL OR btrim(p_name) = '' THEN
      v_reason := 'a role needs a key and a name';
    ELSIF NOT EXISTS (SELECT 1 FROM public.organization_nodes
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
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.role.create', p_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    INSERT INTO public.roles
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

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.role.create', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.export_tenant_audit(uuid,timestamp with time zone,timestamp with time zone,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.export_tenant_audit(p_tenant_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_actor text, p_actor_type text, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text;
  v_audit uuid;
  v_rows jsonb;
BEGIN
  v_reason := admin.refusal_reason(p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id);
  IF v_reason IS NULL
     AND p_purpose NOT IN ('audit_export', 'regulatory_request', 'security_investigation',
                           'incident_response') THEN
    v_reason := format('purpose %L does not authorise an audit export', p_purpose);
  END IF;
  IF v_reason IS NULL AND (p_from IS NULL OR p_to IS NULL OR p_to <= p_from) THEN
    v_reason := 'an audit export requires a bounded window';
  END IF;
  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.audit.exported.v1', 'audit_event', NULL, 'audit.export');
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at), '[]'::jsonb)
    INTO v_rows
    FROM public.audit_events a
   WHERE a.tenant_id = p_tenant_id
     AND a.created_at >= p_from
     AND a.created_at < p_to;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.audit.exported.v1', 'audit_event', NULL, 'audit.export',
    'succeeded',
    jsonb_build_object('from', p_from, 'to', p_to, 'row_count', jsonb_array_length(v_rows)));

  RETURN ROW('succeeded', v_audit, NULL,
             jsonb_build_object('events', v_rows))::admin.privileged_result;
END
$function$;

-- admin.grant_membership(uuid,uuid,uuid,uuid,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.grant_membership(p_tenant_id uuid, p_user_id uuid, p_organization_node_id uuid, p_legal_entity_id uuid, p_actor text, p_actor_type text, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.membership.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE tenant_id = p_tenant_id AND id = p_user_id) THEN
      v_reason := format('user %s is not a user of tenant %s', p_user_id, p_tenant_id);
    ELSIF NOT EXISTS (SELECT 1 FROM public.organization_nodes
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
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.membership.grant', p_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    INSERT INTO public.memberships
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

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.membership.grant', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.grant_role_permission(uuid,uuid,text,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.grant_role_permission(p_tenant_id uuid, p_role_id uuid, p_permission_key text, p_actor text, p_actor_type text, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.role.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.roles WHERE tenant_id = p_tenant_id AND id = p_role_id) THEN
      v_reason := format('role %s is not in tenant %s', p_role_id, p_tenant_id);
    ELSIF NOT EXISTS (SELECT 1 FROM public.permissions WHERE key = p_permission_key) THEN
      v_reason := format('permission %L is not in the catalog', p_permission_key);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.role_permission_granted.v1', 'role_permission', p_role_id::text, 'identity.role_permission.grant');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.role_permission.grant', p_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    INSERT INTO public.role_permissions (tenant_id, role_id, permission_id, created_by)
    SELECT p_tenant_id, p_role_id, id, p_actor FROM public.permissions WHERE key = p_permission_key
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

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.role_permission.grant', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.grant_service_account_permission(uuid,uuid,text,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.grant_service_account_permission(p_tenant_id uuid, p_service_account_id uuid, p_permission_key text, p_actor text, p_actor_type text, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.service_account.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.service_accounts
                    WHERE tenant_id = p_tenant_id AND id = p_service_account_id) THEN
      v_reason := format('service account %s is not in tenant %s',
                         p_service_account_id, p_tenant_id);
    ELSIF NOT EXISTS (SELECT 1 FROM public.permissions WHERE key = p_permission_key) THEN
      v_reason := format('permission %L is not in the catalog', p_permission_key);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.service_account_permission_granted.v1', 'service_account_permission', p_service_account_id::text, 'identity.service_account_permission.grant');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.service_account_permission.grant', p_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    INSERT INTO public.service_account_permissions
      (tenant_id, service_account_id, permission_id, created_by)
    SELECT p_tenant_id, p_service_account_id, id, p_actor
      FROM public.permissions WHERE key = p_permission_key
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

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.service_account_permission.grant', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.issue_session_binding(text,uuid,uuid,uuid,uuid,text,text,integer,text,integer)
CREATE OR REPLACE FUNCTION admin.issue_session_binding(p_principal_type text, p_principal_id uuid, p_tenant_id uuid, p_organization_node_id uuid, p_legal_entity_id uuid, p_legal_authority_class text, p_operating_context text, p_target_backend_pid integer, p_issued_by text, p_installable_seconds integer DEFAULT 60)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_principal_type NOT IN ('human', 'service') THEN
    RAISE EXCEPTION 'unknown principal type %', quote_literal(p_principal_type)
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_installable_seconds < 1 OR p_installable_seconds > 300 THEN
    RAISE EXCEPTION 'installable window must be between 1 and 300 seconds'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_principal_type = 'human' THEN
    -- Real, active, and actually a member at the requested node of the requested tenant.
    IF NOT EXISTS (
      SELECT 1
        FROM public.users u
        JOIN public.memberships m ON m.tenant_id = u.tenant_id AND m.user_id = u.id
       WHERE u.id = p_principal_id
         AND u.tenant_id = p_tenant_id
         AND u.status = 'active' AND u.revoked_at IS NULL
         AND u.effective_from <= now()
         AND (u.effective_to IS NULL OR u.effective_to > now())
         AND m.organization_node_id = p_organization_node_id
         AND m.status = 'active' AND m.revoked_at IS NULL
         AND m.effective_from <= now()
         AND (m.effective_to IS NULL OR m.effective_to > now()))
    THEN
      RAISE EXCEPTION 'no active membership justifies this principal, tenant and node'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.service_accounts s
       WHERE s.id = p_principal_id
         AND s.tenant_id = p_tenant_id
         AND s.organization_node_id = p_organization_node_id
         AND s.status = 'active' AND s.revoked_at IS NULL)
    THEN
      RAISE EXCEPTION 'no active service account justifies this principal, tenant and node'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  INSERT INTO app.session_binding (
    principal_type, user_id, service_account_id, tenant_id, organization_node_id,
    legal_entity_id, legal_authority_class, operating_context, target_backend_pid,
    issued_by, installable_until)
  VALUES (
    p_principal_type,
    CASE WHEN p_principal_type = 'human'   THEN p_principal_id END,
    CASE WHEN p_principal_type = 'service' THEN p_principal_id END,
    p_tenant_id, p_organization_node_id, p_legal_entity_id,
    p_legal_authority_class::app.legal_authority_class,
    p_operating_context::app.operating_context,
    p_target_backend_pid, p_issued_by,
    now() + make_interval(secs => p_installable_seconds))
  RETURNING id INTO v_id;

  RETURN v_id;
END
$function$;

-- admin.move_organization_node(uuid,uuid,uuid,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.move_organization_node(p_tenant_id uuid, p_node_id uuid, p_new_parent_id uuid, p_actor text, p_actor_type text, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_old_parent uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.organization_node.write');

  IF v_reason IS NULL THEN
    SELECT parent_id INTO v_old_parent
      FROM public.organization_nodes WHERE tenant_id = p_tenant_id AND id = p_node_id;
    IF NOT FOUND THEN
      v_reason := format('organization node %s is not in tenant %s', p_node_id, p_tenant_id);
    ELSIF p_new_parent_id IS NULL THEN
      -- Detaching a node to root would make it its own governing authority, which is a different
      -- and much larger decision than moving it. It is not offered here.
      v_reason := 'a node may be moved beneath another node, not detached to the root';
    ELSIF NOT EXISTS (SELECT 1 FROM public.organization_nodes
                       WHERE tenant_id = p_tenant_id AND id = p_new_parent_id) THEN
      v_reason := format('proposed parent %s is not in tenant %s', p_new_parent_id, p_tenant_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.organization_node_moved.v1', 'organization_node',
                      p_node_id::text, 'identity.organization_node.move');
  END IF;

  v_prior := admin.prior_success(
    p_tenant_id, p_correlation_id, 'identity.organization_node.move', p_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  PERFORM admin.publish_actor(p_actor);

  BEGIN
    -- 0007's triggers still own the structural invariants: permitted parenthood, cycle rejection
    -- through the closure, the depth bound over the whole subtree, and the serialising advisory
    -- lock. This boundary adds the authority question they never asked.
    UPDATE public.organization_nodes
       SET parent_id = p_new_parent_id, updated_by = p_actor, updated_at = now()
     WHERE tenant_id = p_tenant_id AND id = p_node_id;
    v_result := jsonb_build_object(
      'organization_node_id', p_node_id,
      'previous_parent_id', v_old_parent,
      'new_parent_id', p_new_parent_id);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.organization_node_moved.v1', 'organization_node', p_node_id::text,
      'identity.organization_node.move', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.organization_node_moved.v1', 'organization_node', p_node_id::text,
    'identity.organization_node.move', 'succeeded', v_result);

  PERFORM admin.claim_operation(
    p_tenant_id, p_correlation_id, 'identity.organization_node.move', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.provision_tenant(uuid,text,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.provision_tenant(p_tenant_id uuid, p_name text, p_actor text, p_actor_type text, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text;
  v_audit uuid;
BEGIN
  v_reason := admin.refusal_reason(p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id);
  IF v_reason IS NULL AND p_purpose <> 'tenant_provisioning' THEN
    v_reason := format('purpose %L does not authorise tenant provisioning', p_purpose);
  END IF;
  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.tenant.provisioned.v1', 'tenant', p_tenant_id::text,
                      'tenant.provision');
  END IF;

  BEGIN
    INSERT INTO public.tenants (id, tenant_id, name, created_by, updated_by)
    VALUES (p_tenant_id, p_tenant_id, p_name, p_actor, p_actor);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.tenant.provisioned.v1', 'tenant', p_tenant_id::text, 'tenant.provision',
      'failed', jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.tenant.provisioned.v1', 'tenant', p_tenant_id::text, 'tenant.provision',
    'succeeded', jsonb_build_object('name', p_name));

  RETURN ROW('succeeded', v_audit, NULL,
             jsonb_build_object('tenant_id', p_tenant_id))::admin.privileged_result;
END
$function$;

-- admin.revoke_membership(uuid,uuid,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.revoke_membership(p_tenant_id uuid, p_membership_id uuid, p_actor text, p_actor_type text, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.membership.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.memberships
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
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.membership.revoke', p_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    UPDATE public.memberships
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

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.membership.revoke', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.revoke_membership_role(uuid,uuid,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.revoke_membership_role(p_tenant_id uuid, p_membership_role_id uuid, p_actor text, p_actor_type text, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.membership.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.membership_roles
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
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.membership_role.revoke', p_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    UPDATE public.membership_roles SET revoked_at = now(), revoked_by = p_actor
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

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.membership_role.revoke', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.revoke_role_permission(uuid,uuid,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.revoke_role_permission(p_tenant_id uuid, p_role_permission_id uuid, p_actor text, p_actor_type text, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.role.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.role_permissions
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
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.role_permission.revoke', p_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    UPDATE public.role_permissions SET revoked_at = now(), revoked_by = p_actor
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

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.role_permission.revoke', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.revoke_service_account_permission(uuid,uuid,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.revoke_service_account_permission(p_tenant_id uuid, p_service_account_permission_id uuid, p_actor text, p_actor_type text, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.service_account.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.service_account_permissions
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
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.service_account_permission.revoke', p_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    UPDATE public.service_account_permissions SET revoked_at = now(), revoked_by = p_actor
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

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.service_account_permission.revoke', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.set_membership_status(uuid,uuid,text,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.set_membership_status(p_tenant_id uuid, p_membership_id uuid, p_status text, p_actor text, p_actor_type text, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.membership.write');

  IF v_reason IS NULL THEN
    IF p_status NOT IN ('active', 'suspended') THEN
      v_reason := format('membership status %L is not settable here; revoke uses its own operation',
                         p_status);
    ELSIF NOT EXISTS (SELECT 1 FROM public.memberships
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
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.membership.set_status', p_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    UPDATE public.memberships SET status = p_status::app.identity_status
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

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.membership.set_status', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.set_tenant_status(uuid,text,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.set_tenant_status(p_tenant_id uuid, p_status text, p_actor text, p_actor_type text, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text;
  v_audit uuid;
  v_rows integer;
BEGIN
  v_reason := admin.refusal_reason(p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id);
  IF v_reason IS NULL AND p_purpose NOT IN ('tenant_lifecycle', 'incident_response') THEN
    v_reason := format('purpose %L does not authorise a tenant lifecycle change', p_purpose);
  END IF;
  IF v_reason IS NULL AND p_status NOT IN ('active', 'suspended', 'closed') THEN
    v_reason := format('status %L is not a tenant lifecycle state', p_status);
  END IF;
  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.tenant.status_changed.v1', 'tenant', p_tenant_id::text,
                      'tenant.set_status');
  END IF;

  BEGIN
    UPDATE public.tenants SET status = p_status, updated_by = p_actor WHERE id = p_tenant_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.tenant.status_changed.v1', 'tenant', p_tenant_id::text, 'tenant.set_status',
      'failed', jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  IF v_rows = 0 THEN
    v_audit := admin.record(
      p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.tenant.status_changed.v1', 'tenant', p_tenant_id::text, 'tenant.set_status',
      'failed', jsonb_build_object('error', 'tenant not found'));
    RETURN ROW('failed', v_audit, 'tenant not found', '{}'::jsonb)::admin.privileged_result;
  END IF;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.tenant.status_changed.v1', 'tenant', p_tenant_id::text, 'tenant.set_status',
    'succeeded', jsonb_build_object('status', p_status));

  RETURN ROW('succeeded', v_audit, NULL,
             jsonb_build_object('status', p_status))::admin.privileged_result;
END
$function$;

-- admin.tenant_identity_summary(uuid,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.tenant_identity_summary(p_tenant_id uuid, p_actor text, p_actor_type text, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_reason text;
  v_audit uuid;
  v_summary jsonb;
BEGIN
  v_reason := admin.refusal_reason(p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id);
  IF v_reason IS NULL
     AND p_purpose NOT IN ('access_review', 'identity_administration', 'security_investigation',
                           'platform_operations') THEN
    v_reason := format('purpose %L does not authorise an identity summary', p_purpose);
  END IF;
  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.summarised.v1', 'tenant', p_tenant_id::text,
                      'identity.summary');
  END IF;

  SELECT jsonb_build_object(
           'users', (SELECT count(*) FROM public.users WHERE tenant_id = p_tenant_id),
           'active_users',
             (SELECT count(*) FROM public.users WHERE tenant_id = p_tenant_id AND status = 'active'),
           'memberships', (SELECT count(*) FROM public.memberships WHERE tenant_id = p_tenant_id),
           'service_accounts',
             (SELECT count(*) FROM public.service_accounts WHERE tenant_id = p_tenant_id))
    INTO v_summary;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.summarised.v1', 'tenant', p_tenant_id::text, 'identity.summary',
    'succeeded', v_summary);

  RETURN ROW('succeeded', v_audit, NULL, v_summary)::admin.privileged_result;
END
$function$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- Remove the registry, its provisioning surface, its schema and its owner role — in dependency
-- order, and only what 0026 created.
-- ---------------------------------------------------------------------------

-- The §2b read door goes first: it names the registry owner, so the role cannot be dropped while
-- it exists. Dropping the policy also removes the only widening 0026 made to public.users.
DROP POLICY IF EXISTS users_operator_registry_read ON public.users;

-- As the owner: the migrator holds USAGE on schema authn and nothing else, by design.
SET LOCAL ROLE freightos_operator_registry_owner;
DROP FUNCTION IF EXISTS authn.provision_operator(name, uuid, uuid, text);
DROP FUNCTION IF EXISTS authn.provision_service_login(name, text, text);
DROP FUNCTION IF EXISTS authn.revoke_operator(name, text);
DROP FUNCTION IF EXISTS authn.authenticated_principal();
DROP TABLE IF EXISTS authn.operator_binding;
DROP SCHEMA IF EXISTS authn;
RESET ROLE;

-- DROP OWNED BY rather than a list of REVOKEs. The role holds grants issued by more than one
-- grantor across more than one schema, and DROP ROLE reports only "privileges for schema public"
-- without saying which — enumerating them by hand is how a down migration ends up almost right.
-- The role owns no objects at this point (its schema and functions were dropped above), so this
-- removes privileges and nothing else.
-- THE ROLE IS NOT DROPPED, and that is deliberate.
--
-- 0020's down migration records the same conclusion in almost the same words: it was the only
-- migration that attempted a DROP ROLE, and it was wrong to. A role is a cluster-wide catalog row
-- that other databases in the same cluster may reference, and its privileges are held by several
-- grantors across several schemas — DROP ROLE reports only "privileges for schema public" without
-- saying which grant, so unwinding it by hand is how a down migration ends up almost right.
-- Measured here: REVOKE by enumeration and DROP OWNED BY both left the dependency standing.
--
-- What reverting must actually guarantee is that the role has no reach, not that its catalog row
-- is gone. After the drops above it owns nothing, its schema does not exist, and its read door on
-- public.users is gone. A NOLOGIN role with no privileges and no objects is inert.

-- Explicit REVOKEs by the grantor. DROP OWNED BY was tried first and does NOT remove privileges
-- granted TO a role by somebody else — run as the role it dropped nothing, and the assertion at
-- the end of this file caught that rather than letting the revert claim success.
REVOKE SELECT ON public.users FROM freightos_operator_registry_owner;
REVOKE USAGE ON SCHEMA public, app FROM freightos_operator_registry_owner;

-- The platform actor added by 0026 §5 goes with it. `system:tenant-provisioning` predates this
-- migration and stays. Issued as the schema owner: the migrator holds no privilege on schema
-- admin, which is why every statement here that touches an admin object borrows that role.
SET LOCAL ROLE freightos_admin_owner;
DELETE FROM admin.platform_actor WHERE actor_id = 'system:session-binding-issuer';
RESET ROLE;

DO $assert$
DECLARE
  v_bad text;
BEGIN
  -- Reverting must not weaken anything 0026 did not own. The pg_temp pin belongs to main's 0019
  -- and to 0024/0025; the TEMPORARY revocation belongs to 0019.
  IF has_database_privilege('public', current_database(), 'TEMPORARY') THEN
    RAISE EXCEPTION '0026 down: reverting re-granted TEMPORARY to PUBLIC';
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.prosecdef AND n.nspname IN ('app', 'admin')
     AND p.proconfig::text IS DISTINCT FROM '{"search_path=pg_catalog, public, pg_temp"}';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0026 down: reverting unpinned pg_temp on %', v_bad;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'authn') THEN
    RAISE EXCEPTION '0026 down: schema authn survived the revert';
  END IF;
  -- The role may remain; its REACH may not. Asserted rather than assumed, because "inert" is the
  -- entire justification for leaving the catalog row in place.
  SELECT string_agg(nspname, ', ') INTO v_bad
    FROM pg_namespace
   WHERE has_schema_privilege('freightos_operator_registry_owner', oid, 'USAGE')
     AND nspname NOT IN ('pg_catalog', 'information_schema');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0026 down: the registry owner still holds USAGE on %', v_bad;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'users'
                AND policyname = 'users_operator_registry_read') THEN
    RAISE EXCEPTION '0026 down: the registry read door survived the revert';
  END IF;
END
$assert$;
