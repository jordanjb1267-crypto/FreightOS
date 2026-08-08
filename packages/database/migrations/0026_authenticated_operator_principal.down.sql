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

-- THE ROLE IS NOT DROPPED, and that is deliberate.
--
-- 0020's down migration records the same conclusion: it was the only migration that attempted a
-- DROP ROLE, and it was wrong to. A role is a cluster-wide catalog row that other databases in the
-- same cluster may reference, and its privileges are held by several grantors across several
-- schemas — DROP ROLE reports only "privileges for schema public" without saying which grant, so
-- unwinding it by hand is how a down migration ends up almost right.
--
-- What reverting must actually guarantee is that the role has no REACH, not that its catalog row
-- is gone. After the drops above it owns nothing and its schema does not exist; what follows
-- removes everything else, and the postcondition at the end of this file measures the result along
-- every dimension a role can hold reach rather than trusting this list to be complete.

-- Explicit REVOKEs by the grantor. DROP OWNED BY was tried first and did nothing; the assertion
-- at the end of this file caught that rather than letting the revert claim success.
--
-- WHY DROP OWNED BY CANNOT DO THIS JOB, reproduced minimally (three roles, one schema, one grant):
-- the statement carries two different authorization requirements and only surfaces one of them.
--
--   * To RUN at all, the current user must have the privileges OF the target role. A grantor that
--     is not a member of it gets `ERROR: permission denied to drop objects`.
--   * To actually REVOKE a grant the target role holds, the current user must be able to revoke
--     that grant — i.e. be its grantor, or hold the grantor's privileges. When it cannot,
--     PostgreSQL emits `WARNING: no privileges could be revoked for "<object>"` and the statement
--     STILL REPORTS SUCCESS.
--
-- Run as the registry owner itself, requirement one is trivially satisfied and requirement two
-- fails for every grant issued by another owner — so it warned, dropped nothing, and reported
-- success into a migration log nobody reads line by line. Only a role holding BOTH sets of
-- privileges with INHERIT — or a superuser — satisfies both at once, and the migrator holds every
-- owner role WITH INHERIT FALSE, so SET ROLE gives it one of the two at a time and never both.
-- Explicit REVOKEs issued by each grantor are the only construction that is correct here.
REVOKE SELECT ON public.users FROM freightos_operator_registry_owner;
REVOKE USAGE ON SCHEMA public, app FROM freightos_operator_registry_owner;

-- Restore the built-in function default for both owner roles, undoing §6c. GRANT ... TO PUBLIC
-- returns the entry to PostgreSQL's own default, at which point the server DELETES the
-- pg_default_acl row entirely rather than storing a redundant one — so this leaves no residue,
-- which is exactly what the postcondition below asserts.
SET LOCAL ROLE freightos_admin_owner;
ALTER DEFAULT PRIVILEGES FOR ROLE freightos_admin_owner GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
RESET ROLE;
SET LOCAL ROLE freightos_operator_registry_owner;
ALTER DEFAULT PRIVILEGES FOR ROLE freightos_operator_registry_owner
  GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
RESET ROLE;

-- LAST, because it is what makes SET LOCAL ROLE above stop working: nobody may assume the residual
-- role. This is the membership 0026 §1 granted, revoked by the role that granted it.
--
-- The separate ADMIN OPTION row that PostgreSQL 16 creates automatically when a CREATEROLE role
-- runs CREATE ROLE is deliberately LEFT. It carries SET FALSE and INHERIT FALSE, so it confers no
-- ability to become the role or to hold anything through it — and it is the only thing that lets
-- the migrator re-grant on re-application. Revoking it would make reverting a one-way door for a
-- non-superuser migrator, because GRANT needs ADMIN OPTION and the automatic row is not
-- reissuable without one. The postcondition below therefore asserts the property that matters —
-- no membership is assumable or inheritable in either direction — rather than an empty table.
REVOKE freightos_operator_registry_owner FROM freightos_migrator GRANTED BY freightos_migrator;

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
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'users'
                AND policyname = 'users_operator_registry_read') THEN
    RAISE EXCEPTION '0026 down: the registry read door survived the revert';
  END IF;

  -- -------------------------------------------------------------------------
  -- RESIDUAL-ROLE INERTNESS. The role's catalog row is left behind on purpose (see above), so
  -- "inert" is the entire justification for leaving it — and a justification that is asserted in
  -- prose only is a justification that decays. Every dimension along which a role can hold reach
  -- is checked, not just the one that failed last time.
  --
  -- Not checked, and deliberately so: CONNECT on the current database, which every role holds via
  -- PUBLIC on every PostgreSQL database and which 0026 neither granted nor could revoke without
  -- changing something it does not own. It is unreachable regardless — the role is NOLOGIN, and
  -- the assertion below is what keeps it that way.
  -- -------------------------------------------------------------------------

  -- 1. It cannot log in.
  IF EXISTS (SELECT 1 FROM pg_roles
              WHERE rolname = 'freightos_operator_registry_owner'
                AND (rolcanlogin OR rolsuper OR rolcreaterole OR rolcreatedb
                     OR rolbypassrls OR rolreplication)) THEN
    RAISE EXCEPTION
      '0026 down: the residual registry owner holds rolcanlogin or a cluster-wide role attribute';
  END IF;

  -- 2. No schema privilege, by any route — including one inherited from PUBLIC, which is why this
  --    uses has_schema_privilege rather than reading nspacl.
  SELECT string_agg(nspname || ':' ||
           concat_ws('+',
             CASE WHEN has_schema_privilege('freightos_operator_registry_owner', oid, 'USAGE')
                  THEN 'USAGE' END,
             CASE WHEN has_schema_privilege('freightos_operator_registry_owner', oid, 'CREATE')
                  THEN 'CREATE' END), ', ') INTO v_bad
    FROM pg_namespace
   WHERE nspname NOT IN ('pg_catalog', 'information_schema')
     AND (has_schema_privilege('freightos_operator_registry_owner', oid, 'USAGE')
          OR has_schema_privilege('freightos_operator_registry_owner', oid, 'CREATE'));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0026 down: the registry owner still holds schema privileges — %', v_bad;
  END IF;

  -- 3. No explicit grant of any kind survives anywhere in the database. Read from the ACLs rather
  --    than from has_*_privilege because types and languages grant to PUBLIC by default, and a
  --    PUBLIC privilege is not a privilege this migration handed out or may revoke.
  SELECT string_agg(kind || ' ' || obj || ':' || privilege_type, ', ') INTO v_bad
    FROM (
      SELECT 'schema' AS kind, nspname AS obj, nspacl AS acl FROM pg_namespace
      UNION ALL SELECT 'relation', c.relname, c.relacl FROM pg_class c
      UNION ALL SELECT 'function', p.oid::regprocedure::text, p.proacl FROM pg_proc p
      UNION ALL SELECT 'type', t.typname, t.typacl FROM pg_type t
      UNION ALL SELECT 'sequence-or-column', a.attname, a.attacl FROM pg_attribute a
    ) o
    CROSS JOIN LATERAL aclexplode(o.acl) x
   WHERE x.grantee = 'freightos_operator_registry_owner'::regrole;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0026 down: the registry owner still holds explicit grants — %', v_bad;
  END IF;

  -- 4. It owns nothing.
  SELECT string_agg(kind || ' ' || obj, ', ') INTO v_bad
    FROM (
      SELECT 'relation' AS kind, c.relname AS obj FROM pg_class c
       WHERE c.relowner = 'freightos_operator_registry_owner'::regrole
      UNION ALL SELECT 'function', p.oid::regprocedure::text FROM pg_proc p
       WHERE p.proowner = 'freightos_operator_registry_owner'::regrole
      UNION ALL SELECT 'schema', n.nspname FROM pg_namespace n
       WHERE n.nspowner = 'freightos_operator_registry_owner'::regrole
      UNION ALL SELECT 'type', t.typname FROM pg_type t
       WHERE t.typowner = 'freightos_operator_registry_owner'::regrole
    ) o;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0026 down: the registry owner still owns % ', v_bad;
  END IF;

  -- 5. The role is a member of NOTHING, and 0026's own grant of it is gone.
  --
  --    THE TWO DIRECTIONS ARE NOT THE SAME PROPERTY, and asserting them symmetrically was wrong.
  --
  --    "The registry owner is a member of X" is reach the ROLE HOLDS: anything it inherits or can
  --    become is authority that survives the revert. That must be empty, and is asserted as such.
  --
  --    "X is a member of the registry owner" is reach INTO the role by a principal that already
  --    has more of it than the role does. The migrator created this role and must be able to
  --    re-grant on re-application; more importantly, a cluster superuser may hold or issue such a
  --    grant, and 0026 neither created that nor may remove it. Unwinding another authority's grant
  --    is the exact mistake the DROP OWNED BY investigation above documents. What 0026 owes is the
  --    removal of ITS OWN grant, which is asserted by grantor, plus the fact that being able to
  --    assume the role is worth nothing — checks 1 to 4 and 6 leave it holding no privilege, owning
  --    no object, and unable to log in. A role with nothing is inert regardless of who can become
  --    it.
  SELECT string_agg(format('member of %s (inherit=%s,set=%s)',
                           r.rolname, am.inherit_option, am.set_option), ', ') INTO v_bad
    FROM pg_auth_members am
    JOIN pg_roles r  ON r.oid  = am.roleid
    JOIN pg_roles mm ON mm.oid = am.member
   WHERE mm.rolname = 'freightos_operator_registry_owner';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      '0026 down: the residual registry owner still holds authority through membership — %', v_bad;
  END IF;

  SELECT string_agg(format('%s(inherit=%s,set=%s)',
                           mm.rolname, am.inherit_option, am.set_option), ', ') INTO v_bad
    FROM pg_auth_members am
    JOIN pg_roles r  ON r.oid  = am.roleid
    JOIN pg_roles mm ON mm.oid = am.member
    JOIN pg_roles g  ON g.oid  = am.grantor
   WHERE r.rolname = 'freightos_operator_registry_owner'
     AND g.rolname = 'freightos_migrator';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      '0026 down: §1''s own grant of the registry owner survived the revert — %', v_bad;
  END IF;

  -- 6. No default privilege entry survives for either owner role. §6c's global entries are
  --    returned to PostgreSQL's own default above, which deletes the row rather than storing it.
  SELECT string_agg(format('%s(ns=%s,type=%s)', pg_get_userbyid(d.defaclrole),
                           d.defaclnamespace, d.defaclobjtype), ', ') INTO v_bad
    FROM pg_default_acl d
   WHERE d.defaclrole IN ('freightos_admin_owner'::regrole,
                          'freightos_operator_registry_owner'::regrole);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0026 down: §6c default privileges survived the revert — %', v_bad;
  END IF;
END
$assert$;
