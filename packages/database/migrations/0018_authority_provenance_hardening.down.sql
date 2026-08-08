-- Revert 0018 — authority provenance hardening.
--
-- This restores the pre-0018 shape, which is the shape the independent rereview defeated. It
-- exists because every migration in this repository has a tested down path and because a
-- reversible change is a reviewable one — not because reverting is ever an acceptable response to
-- the findings 0018 closes. Reverting reopens two CRITICAL and five HIGH defects.
--
-- Sections are undone in reverse order of the up migration.

-- §10 — the governed node move and the platform-tenant fallback in admin.record.
--
-- CORRECTED. This section used to DROP admin.record on the reasoning that "0013 re-creates its own
-- definition when re-applied". It does not, and cannot: reverting 0018 does not revert 0013, so
-- 0013 never runs again and its function simply stays missing at version 17. Two things followed,
-- and 0026 §7(a) is what caught the second:
--
--   1. a database reverted to 17 was left WITHOUT admin.record, although 0013 created it — an
--      intermediate state no migration describes;
--   2. re-applying 0018 turned its `CREATE OR REPLACE` into a plain CREATE, so the function came
--      back with PostgreSQL's default ACL — PUBLIC EXECUTE — instead of the tight one 0013's
--      REVOKE established. The internal audit writer became callable by every role in the cluster,
--      including freightos_admin and freightos_app, on any database that had ever been rolled back
--      past 18 and rolled forward again.
--
-- (2) is the same class of defect as the one 0026 §6b repairs: DROP discards an ACL, CREATE takes
-- the default, and nothing says so out loud. The fix is to restore 0013's definition here rather
-- than drop it, REVOKE included, so reverting lands on the state 0013 actually left behind.
--
-- Verbatim from 0013 §admin.record, including its `SET search_path = pg_catalog, public` — the
-- pg_temp demotion is 0024's and belongs to 0024's own revert, not to this one.
SET LOCAL ROLE freightos_admin_owner;
DROP FUNCTION IF EXISTS admin.move_organization_node(uuid, uuid, uuid, text, text, text, uuid);

CREATE OR REPLACE FUNCTION admin.record(
  p_tenant_id uuid,
  p_legal_entity_id uuid,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid,
  p_event_type text,
  p_resource_type text,
  p_resource_id text,
  p_action text,
  p_outcome text,
  p_payload jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO audit_events (
    tenant_id, legal_entity_id, legal_authority_class, operating_context,
    actor_type, actor_id, event_type, resource_type, resource_id,
    correlation_id, payload, created_by, operation_class, purpose, outcome)
  VALUES (
    -- A refusal for a missing tenant scope still has to be recorded somewhere. The designated
    -- system tenant is where platform-scope evidence lives, and payload.offered_tenant_id keeps
    -- the fact that none was supplied.
    coalesce(p_tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
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
$$;

-- 0013's own REVOKE, restated. CREATE OR REPLACE above preserves an existing ACL, so on the
-- ordinary path this is a no-op; on the path where the function had been dropped it is the thing
-- that keeps the audit writer internal. Issued INSIDE the SET LOCAL ROLE block: a REVOKE has to
-- come from the object's owner, and the migrator holds no privilege on schema admin at all.
REVOKE ALL ON FUNCTION
  admin.record(uuid, uuid, text, text, text, uuid, text, text, text, text, text, jsonb)
  FROM PUBLIC;
RESET ROLE;
REVOKE UPDATE ON organization_nodes FROM freightos_admin_owner;

-- §9 / §3 / §2 — put the ten privileged operations back on the old primitives. The functions are
-- dropped rather than restored: 0017's own definitions are re-created when it is re-applied, and a
-- half-restored function calling a signature that no longer exists would be worse than an absent
-- one.
SET LOCAL ROLE freightos_admin_owner;

DROP FUNCTION IF EXISTS admin.grant_membership(uuid, uuid, uuid, uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS admin.set_membership_status(uuid, uuid, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS admin.revoke_membership(uuid, uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS admin.assign_membership_role(uuid, uuid, uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS admin.revoke_membership_role(uuid, uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS admin.create_role(uuid, uuid, uuid, text, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS admin.grant_role_permission(uuid, uuid, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS admin.revoke_role_permission(uuid, uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS admin.grant_service_account_permission(
  uuid, uuid, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS admin.revoke_service_account_permission(uuid, uuid, text, text, text, uuid);

DROP FUNCTION IF EXISTS admin.authorization_refusal_reason(text, text, text, uuid, uuid, text);
DROP FUNCTION IF EXISTS admin.prior_success(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS admin.claim_operation(uuid, uuid, text, text, uuid);
DROP TABLE IF EXISTS admin.privileged_operation;
DROP TABLE IF EXISTS admin.platform_actor;

-- The forgeable form, restored exactly as 0017 had it.
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

RESET ROLE;

-- §3a — the guards go back to refusing every non-user actor, and the predicate they consulted is
-- removed. Order matters: restore the guards first, because dropping a function three live
-- triggers still call would leave the authority tables unwritable rather than merely unhardened.
GRANT CREATE ON SCHEMA app TO freightos_identity_guard;
SET LOCAL ROLE freightos_identity_guard;

CREATE OR REPLACE FUNCTION app.reject_membership_self_elevation() RETURNS trigger
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

CREATE OR REPLACE FUNCTION app.reject_membership_role_self_elevation() RETURNS trigger
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

CREATE OR REPLACE FUNCTION app.reject_role_permission_self_elevation() RETURNS trigger
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

RESET ROLE;
REVOKE CREATE ON SCHEMA app FROM freightos_identity_guard;

SET LOCAL ROLE freightos_admin_owner;
DROP FUNCTION IF EXISTS app.is_verified_platform_actor();
RESET ROLE;

-- §7 — credentials lose the subject's scope again.
DROP POLICY service_account_credentials_read ON service_account_credentials;
DROP POLICY service_account_credentials_insert ON service_account_credentials;
DROP POLICY service_account_credentials_update ON service_account_credentials;
CREATE POLICY service_account_credentials_read ON service_account_credentials FOR SELECT
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY service_account_credentials_insert ON service_account_credentials FOR INSERT
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY service_account_credentials_update ON service_account_credentials FOR UPDATE
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());
DROP FUNCTION IF EXISTS app.service_account_scope_ok(uuid);

-- §6 — table-wide UPDATE returns, and with it the ability to reparent.
REVOKE UPDATE ON organization_nodes FROM freightos_app;
GRANT UPDATE ON organization_nodes TO freightos_app;
COMMENT ON COLUMN organization_nodes.parent_id IS NULL;

-- §5 — the resolver stops matching on tenant, and the uniqueness index stops carrying it.
CREATE OR REPLACE FUNCTION app.resolve_kill_switch_mode(
  p_tenant_id uuid DEFAULT NULL,
  p_legal_plane text DEFAULT NULL,
  p_workflow_id text DEFAULT NULL,
  p_agent_id text DEFAULT NULL,
  p_tool_id text DEFAULT NULL,
  p_integration_id text DEFAULT NULL,
  p_legal_entity_id uuid DEFAULT NULL,
  p_operating_context app.operating_context DEFAULT NULL
) RETURNS app.kill_switch_mode
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    (
      SELECT mode
      FROM kill_switches
      WHERE released_at IS NULL
        AND (
          scope = 'system'
          OR (scope = 'legal_plane'       AND scope_ref = p_legal_plane)
          OR (scope = 'tenant'            AND scope_ref = p_tenant_id::text)
          OR (scope = 'workflow'          AND scope_ref = p_workflow_id)
          OR (scope = 'agent'             AND scope_ref = p_agent_id)
          OR (scope = 'tool'              AND scope_ref = p_tool_id)
          OR (scope = 'integration'       AND scope_ref = p_integration_id)
          OR (scope = 'legal_entity'      AND scope_ref = p_legal_entity_id::text
                                          AND tenant_id = p_tenant_id)
          OR (scope = 'operating_context' AND scope_ref = p_operating_context::text)
        )
      ORDER BY mode DESC
      LIMIT 1
    ),
    'enabled'::app.kill_switch_mode)
$$;

DROP INDEX kill_switches_one_active_per_subject;
CREATE UNIQUE INDEX kill_switches_one_active_per_subject
  ON kill_switches (scope, coalesce(scope_ref, ''))
  WHERE released_at IS NULL;

-- §4 — the commands go, table-wide INSERT and UPDATE come back.
DROP FUNCTION IF EXISTS app.release_kill_switch(uuid);
DROP FUNCTION IF EXISTS app.engage_kill_switch(
  app.kill_switch_scope, text, app.kill_switch_mode, text);
DROP FUNCTION IF EXISTS app.current_human_principal();

-- The read that function needed goes back with it. Dropped after the function, not before: a
-- revert that removed the grant first would leave a live definer that cannot read what it asks for.
REVOKE SELECT ON users FROM freightos_hierarchy_owner;

DROP POLICY kill_switches_write ON kill_switches;
DROP POLICY kill_switches_release ON kill_switches;
CREATE POLICY kill_switches_write ON kill_switches
  FOR INSERT
  WITH CHECK (
    app.is_control_plane()
    OR (scope NOT IN ('system', 'legal_plane') AND tenant_id = app.current_tenant_id()));
CREATE POLICY kill_switches_release ON kill_switches
  FOR UPDATE
  USING (
    app.is_control_plane()
    OR (scope NOT IN ('system', 'legal_plane') AND tenant_id = app.current_tenant_id()))
  WITH CHECK (
    app.is_control_plane()
    OR (scope NOT IN ('system', 'legal_plane') AND tenant_id = app.current_tenant_id()));
GRANT INSERT, UPDATE ON kill_switches TO freightos_app;

-- §1 — the ledger becomes composable by the runtime role again.
ALTER TABLE audit_events DROP CONSTRAINT audit_events_tenant_fk;
DROP FUNCTION IF EXISTS app.record_audit_event(text, text, text, uuid, uuid, text, jsonb);
GRANT INSERT ON audit_events TO freightos_app;
GRANT INSERT ON audit_events TO freightos_control_plane;
REVOKE ALL ON audit_events FROM freightos_audit_writer;
REVOKE USAGE ON SCHEMA app FROM freightos_audit_writer;
COMMENT ON TABLE audit_events IS
  'Append-only. UPDATE, DELETE and TRUNCATE are rejected by trigger and by revoked privilege.';

-- The role itself is cluster-wide and shared by every concurrently-migrating test database, so it
-- is deliberately left in place — dropping it here would break other databases mid-run. Migration
-- 0001's down path owns cluster-wide role teardown.

-- §0 — the platform tenant.
ALTER TABLE tenants DROP CONSTRAINT tenants_platform_is_the_reserved_id;
DROP INDEX tenants_single_platform;
ALTER TABLE tenants NO FORCE ROW LEVEL SECURITY;
DELETE FROM tenants WHERE id = '00000000-0000-0000-0000-000000000000'::uuid;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE tenants DROP COLUMN is_platform;
