-- 0024 down — restore the pre-0024 admin definer bodies exactly.
--
-- This puts the 42 relation references back to their unqualified form, which is the state
-- migration 0023 leaves behind. It is a reduction in defense in depth, not a reopening of the
-- CRITICAL: migration 0019 still holds both of its layers after this runs — no runtime or
-- control-plane role holds TEMPORARY, and every admin definer still pins
-- `search_path = pg_catalog, public, pg_temp`. Neither is touched here, and §2 asserts that.
--
-- Bodies captured from pg_get_functiondef() on a database migrated to exactly 23, so this restores
-- what 0023 actually builds rather than what its text is believed to build.

SET LOCAL ROLE freightos_admin_owner;

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
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.membership_role.assign', p_actor);
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

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.membership_role.assign', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

CREATE OR REPLACE FUNCTION admin.authorization_refusal_reason(p_actor text, p_actor_type text, p_purpose text, p_tenant_id uuid, p_correlation_id uuid, p_required_permission text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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

  -- A platform actor names no user by construction, so it cannot be permission-checked against the
  -- authority tables. It is checked against the closed set instead — RC-E.
  IF p_actor_type = 'system' THEN
    IF p_actor !~ '^system:[a-z0-9._:-]+$' THEN
      RETURN format('system actor %L must be of the form system:<name>', p_actor);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM admin.platform_actor WHERE actor_id = p_actor) THEN
      RETURN format('platform actor %L is not an approved provisioning identity', p_actor);
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

  -- The check that was missing. Being a real, active member of the tenant is not authority.
  IF NOT app.user_has_permission(p_tenant_id, v_user_id, p_required_permission, now()) THEN
    RETURN format('actor %L does not hold %L', p_actor, p_required_permission);
  END IF;

  RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION admin.claim_operation(p_tenant_id uuid, p_correlation_id uuid, p_action text, p_actor text, p_audit_event_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  INSERT INTO admin.privileged_operation
    (tenant_id, correlation_id, action, actor_id, audit_event_id)
  VALUES (p_tenant_id, p_correlation_id, p_action, p_actor, p_audit_event_id)
$function$;

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
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.role.create', p_actor);
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

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.role.create', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

CREATE OR REPLACE FUNCTION admin.deny(p_reason text, p_tenant_id uuid, p_actor text, p_actor_type text, p_purpose text, p_correlation_id uuid, p_event_type text, p_resource_type text, p_resource_id text, p_action text)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_audit uuid;
BEGIN
  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    p_event_type, p_resource_type, p_resource_id, p_action, 'denied',
    jsonb_build_object(
      'reason', p_reason,
      'offered_actor', p_actor,
      'offered_actor_type', p_actor_type,
      'offered_purpose', p_purpose,
      'offered_tenant_id', p_tenant_id));

  RETURN ROW('denied', v_audit, p_reason, '{}'::jsonb)::admin.privileged_result;
END
$function$;

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
    FROM audit_events a
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
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.membership.grant', p_actor);
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

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.membership.grant', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

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
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.role_permission.grant', p_actor);
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

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.role_permission.grant', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

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
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.service_account_permission.grant', p_actor);
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

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.service_account_permission.grant', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

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
        FROM users u
        JOIN memberships m ON m.tenant_id = u.tenant_id AND m.user_id = u.id
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
      SELECT 1 FROM service_accounts s
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
      FROM organization_nodes WHERE tenant_id = p_tenant_id AND id = p_node_id;
    IF NOT FOUND THEN
      v_reason := format('organization node %s is not in tenant %s', p_node_id, p_tenant_id);
    ELSIF p_new_parent_id IS NULL THEN
      -- Detaching a node to root would make it its own governing authority, which is a different
      -- and much larger decision than moving it. It is not offered here.
      v_reason := 'a node may be moved beneath another node, not detached to the root';
    ELSIF NOT EXISTS (SELECT 1 FROM organization_nodes
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
    UPDATE organization_nodes
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

CREATE OR REPLACE FUNCTION admin.prior_success(p_tenant_id uuid, p_correlation_id uuid, p_action text, p_actor text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE r record;
BEGIN
  SELECT audit_event_id, actor_id INTO r
    FROM admin.privileged_operation
   WHERE tenant_id = p_tenant_id
     AND correlation_id = p_correlation_id
     AND action = p_action;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF r.actor_id IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION
      'correlation id % is already claimed by another actor for action %', p_correlation_id, p_action
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;
  RETURN r.audit_event_id;
END
$function$;

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
    INSERT INTO tenants (id, tenant_id, name, created_by, updated_by)
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

CREATE OR REPLACE FUNCTION admin.publish_actor(p_actor text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT set_config('app.actor_id', p_actor, true)
$function$;

CREATE OR REPLACE FUNCTION admin.record(p_tenant_id uuid, p_legal_entity_id uuid, p_actor text, p_actor_type text, p_purpose text, p_correlation_id uuid, p_event_type text, p_resource_type text, p_resource_id text, p_action text, p_outcome text, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_tenant uuid;
BEGIN
  v_tenant := CASE
    WHEN p_tenant_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = p_tenant_id)
    THEN p_tenant_id
    ELSE '00000000-0000-0000-0000-000000000000'::uuid
  END;
  INSERT INTO audit_events (
    tenant_id, legal_entity_id, legal_authority_class, operating_context,
    actor_type, actor_id, event_type, resource_type, resource_id,
    correlation_id, payload, created_by, operation_class, purpose, outcome)
  VALUES (
    -- A refusal for a missing OR UNKNOWN tenant scope still has to be recorded somewhere, and it
    -- is the event most worth recording. 0018 §1 gives audit_events a referential relationship to
    -- tenants, so naming a tenant that does not exist would now make the evidence unwritable — the
    -- control would have destroyed the record rather than protected it. Platform-scope evidence
    -- belongs to the platform tenant, and payload.attempted_tenant_id keeps what was named.
    v_tenant,
    p_legal_entity_id,
    'software_only',
    'system',
    CASE WHEN p_actor_type IN ('human', 'system') THEN p_actor_type ELSE 'system' END,
    coalesce(nullif(btrim(p_actor), ''), 'unknown:actor-not-supplied'),
    p_event_type,
    p_resource_type,
    p_resource_id,
    coalesce(p_correlation_id, gen_random_uuid()),
    p_payload
      || jsonb_build_object('action', p_action)
      || CASE WHEN v_tenant IS DISTINCT FROM p_tenant_id
              THEN jsonb_build_object('attempted_tenant_id', p_tenant_id)
              ELSE '{}'::jsonb END
      -- Non-forgeable, and last so it wins — F-06.
      || jsonb_build_object(
           'connection', jsonb_build_object(
             'authenticated_role', session_user,
             'effective_role', current_user,
             'backend_pid', pg_backend_pid(),
             'recorded_at', statement_timestamp()),
           'claimed_actor', p_actor,
           'claimed_actor_type', p_actor_type),
    coalesce(nullif(btrim(p_actor), ''), 'unknown:actor-not-supplied'),
    'privileged',
    -- Only a valid privileged purpose is stored. An absent or rejected one stays absent, and the
    -- denial payload carries what was offered.
    CASE WHEN p_purpose IS NOT NULL AND app.is_privileged_purpose(p_purpose)
         THEN p_purpose ELSE NULL END,
    p_outcome)
  RETURNING id INTO v_id;

  RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION admin.refusal_reason(p_actor text, p_actor_type text, p_purpose text, p_tenant_id uuid, p_correlation_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_actor IS NULL OR btrim(p_actor) = '' THEN
    RETURN 'actor is required: a privileged operation with no actor cannot be attributed';
  END IF;
  IF p_actor_type IS NULL OR p_actor_type NOT IN ('human', 'system') THEN
    RETURN format(
      'actor_type %L may not perform a privileged operation: control-plane administration is '
      'human or platform, never an agent or a tenant integration',
      coalesce(p_actor_type, 'null'));
  END IF;
  IF p_purpose IS NULL OR btrim(p_purpose) = '' THEN
    RETURN 'purpose is required: OQ-20 forbids defaulting, inferring, or backfilling it';
  END IF;
  IF NOT app.is_privileged_purpose(p_purpose) THEN
    RETURN format('purpose %L is outside the approved privileged vocabulary', p_purpose);
  END IF;
  IF p_tenant_id IS NULL THEN
    RETURN 'tenant scope is required on every privileged operation';
  END IF;
  IF p_correlation_id IS NULL THEN
    RETURN 'correlation id is required so the operation is traceable';
  END IF;
  RETURN NULL;
END
$function$;

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
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.membership.revoke', p_actor);
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

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.membership.revoke', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

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
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.membership_role.revoke', p_actor);
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

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.membership_role.revoke', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

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
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.role_permission.revoke', p_actor);
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

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.role_permission.revoke', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

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
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.service_account_permission.revoke', p_actor);
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

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.service_account_permission.revoke', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

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
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.membership.set_status', p_actor);
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

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.membership.set_status', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

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
    UPDATE tenants SET status = p_status, updated_by = p_actor WHERE id = p_tenant_id;
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
           'users', (SELECT count(*) FROM users WHERE tenant_id = p_tenant_id),
           'active_users',
             (SELECT count(*) FROM users WHERE tenant_id = p_tenant_id AND status = 'active'),
           'memberships', (SELECT count(*) FROM memberships WHERE tenant_id = p_tenant_id),
           'service_accounts',
             (SELECT count(*) FROM service_accounts WHERE tenant_id = p_tenant_id))
    INTO v_summary;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.summarised.v1', 'tenant', p_tenant_id::text, 'identity.summary',
    'succeeded', v_summary);

  RETURN ROW('succeeded', v_audit, NULL, v_summary)::admin.privileged_result;
END
$function$;

RESET ROLE;

-- Reverting body qualification must not disturb what migration 0019 owns.
DO $$
DECLARE
  v_left text;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_left
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.prosecdef AND n.nspname = 'admin'
     AND (pg_get_userbyid(p.proowner) <> 'freightos_admin_owner'
          OR coalesce(substring(p.proconfig::text from 'search_path=([^"}]*)'), '') !~ 'pg_temp\s*$');
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION '0024 down: admin definer lost its owner or its pg_temp pin: %', v_left;
  END IF;

  IF has_database_privilege('freightos_app', current_database(), 'TEMPORARY')
     OR has_database_privilege('freightos_admin', current_database(), 'TEMPORARY') THEN
    RAISE EXCEPTION '0024 down: reverting body qualification re-opened the 0019 TEMPORARY hole';
  END IF;
END
$$;
