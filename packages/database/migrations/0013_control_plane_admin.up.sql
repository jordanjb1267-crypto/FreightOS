-- 0013 — ADR-0020: the administrative schema, its roles, and its first privileged functions.
--
-- Phase 0 chose the isolation MECHANISM — an explicit policy branch on app.is_control_plane(),
-- never BYPASSRLS (0001_platform_foundation.up.sql:63-68). ADR-0020 adds the missing half: a
-- narrow, audited function surface that is the only way to USE it.
--
-- BYPASSRLS is granted to nothing here, and a test asserts no role in the cluster holds
-- rolbypassrls. The definer owner reaches across tenants through the same policy branch every
-- other control-plane read uses, which keeps the escape visible in pg_policies rather than hidden
-- in a role attribute.
--
-- WHY DENIALS RETURN RATHER THAN RAISE
--
-- ADR-0020 §8 requires every privileged operation to write an audit record before returning, and
-- OQ-20 requires a missing actor or purpose to fail closed. Those two pull against each other if
-- a refusal raises: PostgreSQL has no autonomous transaction, so RAISE would roll back the very
-- audit row that evidences the refusal, and the ledger would show silence where a denial belongs.
--
-- So a refused call performs NO privileged work — nothing is read, nothing is written, no state
-- changes — writes its `denied` audit row, and returns outcome='denied' with the reason. That is
-- failing closed with evidence rather than failing closed in silence. An execution error is
-- caught in a subtransaction, recorded as `failed`, and returned the same way.
--
-- THE DENIAL ROW IS TRANSACTION-BOUND, NOT DURABLE — F-07.
--
-- It is written in the caller's transaction and survives exactly as far as that transaction does.
-- A caller that wraps this call and rolls back — deliberately, or because a later statement failed
-- — takes the denial record with it. The refusal still happened and still did nothing; what is
-- lost is the evidence that it was attempted. Earlier wording here and in ADR-0026 called the
-- record durable, which it is not.
--
-- The limit is PostgreSQL's, not this schema's: with no autonomous transaction, no in-database
-- write can outlive the transaction that made it. Escaping it needs a component outside the
-- transaction, which is not something to introduce in a migration about identity and organization.
--
-- ADR-0026 §5 records this as TRANSACTION_BOUND_DENIAL_AUDIT and carries the stronger property
-- forward as ROLLBACK_INDEPENDENT_DENIAL_AUDIT, Phase 3. A test asserts the current behaviour
-- exactly, so the limit is a stated property rather than a surprise.
--
-- The one thing that does raise is a missing EXECUTE grant, which PostgreSQL refuses before the
-- function body runs at all.

-- ---------------------------------------------------------------------------
-- Roles.
--
-- freightos_admin_owner  ADR-0020 §4. NOLOGIN, so compromising the administrative connection does
--                        not hand over the definer's rights directly. Member of
--                        freightos_control_plane, which is what carries it through the policy
--                        branch — no BYPASSRLS involved.
-- freightos_admin        ADR-0020 §2 and §6. The administrative CONNECTION role. Holds USAGE on
--                        the admin schema and EXECUTE on the named functions, and nothing else:
--                        no table privileges, no USAGE on public or app. Direct table access is
--                        therefore unavailable to it by construction, not by policy.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_admin_owner') THEN
    CREATE ROLE freightos_admin_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_admin') THEN
    CREATE ROLE freightos_admin NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

-- Deployment-time SET membership on the definer owner — F-04.
--
-- `ALTER ... OWNER TO freightos_admin_owner` requires the current owner to be able to SET ROLE to
-- it. A CREATEROLE role receives ADMIN OPTION on roles it creates but not SET, so assigning
-- ownership fails under the documented migrator without this. Superuser never hit it.
--
-- This is deployment authority, not runtime authority: freightos_admin_owner is NOLOGIN, and the
-- grant lets the migrator hand ownership over during a migration. It does not give any runtime
-- connection a path to the definer — nothing grants freightos_migrator to a runtime role, and the
-- migration suite asserts that in both directions.
--
-- INHERIT FALSE is load-bearing, not decoration. freightos_admin_owner is a member of
-- freightos_control_plane (below), and app.is_control_plane() is `pg_has_role(current_user,
-- 'freightos_control_plane', 'USAGE')` — which follows inherited membership transitively. Granting
-- this without INHERIT FALSE would make every subsequent migration statement, and every ordinary
-- query on the deployment connection, silently pass the control-plane branch of every policy in
-- the schema. SET TRUE alone is what is needed and all that is taken: ownership can be assigned,
-- and reaching the definer's rights takes an explicit SET ROLE that no migration issues.
--
-- The membership is probed with 'SET' rather than 'USAGE' for the same reason: 'USAGE' asks
-- whether the rights are inherited, which is exactly what must stay false, so it would re-grant
-- on every run.
DO $$
BEGIN
  IF NOT pg_has_role(current_user, 'freightos_admin_owner', 'SET') THEN
    EXECUTE format('GRANT freightos_admin_owner TO %I WITH SET TRUE, INHERIT FALSE', current_user);
  END IF;
END
$$;

-- The attributes that matter are ASSERTED, not re-applied — F-04.
--
-- `ALTER ROLE ... NOSUPERUSER NOBYPASSRLS` requires superuser, so re-applying them here made the
-- migration runnable only as a superuser and silently coupled the whole deployment to one. The
-- previous comment said NOBYPASSRLS was "stated rather than assumed"; stating it via ALTER is
-- what forced the superuser dependency this finding is about.
--
-- Asserting is strictly stronger than re-applying. Re-applying would quietly correct a role a
-- superuser had already made privileged; this refuses to proceed and says which attribute is
-- wrong, which is the outcome ADR-0020 actually wants.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolcanlogin
      FROM pg_roles
     WHERE rolname IN ('freightos_admin_owner', 'freightos_admin')
  LOOP
    IF r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole THEN
      RAISE EXCEPTION
        'role % must be NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE (super=% rls_bypass=% createdb=% createrole=%)',
        r.rolname, r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF r.rolname = 'freightos_admin_owner' AND r.rolcanlogin THEN
      RAISE EXCEPTION 'freightos_admin_owner must be NOLOGIN — ADR-0020 §4'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END LOOP;
END
$$;

GRANT freightos_control_plane TO freightos_admin_owner;

-- The deployment connection must not BE the control plane — F-04.
--
-- freightos_admin_owner is now a member of freightos_control_plane, and app.is_control_plane() is
-- transitive over inherited membership. If the migrator inherits the definer owner — a stale grant
-- from an earlier bootstrap, a well-meaning `GRANT ... TO freightos_migrator`, a developer's
-- shortcut — then from this statement onward every policy in the schema takes its control-plane
-- branch for the deployment connection, and every RLS proof in the suite is describing a database
-- nobody runs.
--
-- Asserted here rather than trusted, because the failure is silent by construction: nothing errors,
-- the migrations simply start seeing everything.
DO $$
BEGIN
  IF app.is_control_plane() THEN
    RAISE EXCEPTION
      'deployment authority % inherits control-plane rights; revoke the inherited membership '
      '(GRANT ... WITH INHERIT FALSE is the supported form) before migrating', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Default-deny.
--
-- A future domain table must grant nothing to anybody until its migration says otherwise. PUBLIC
-- holds no table privileges by default, but USAGE on schema public it does hold, and leaving it
-- would give freightos_admin a path to tables it must reach only through functions.
-- ---------------------------------------------------------------------------

REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;

-- 0001 granted these explicitly, and the REVOKE above does not touch them. Restated so the
-- intended reach of each role is readable in one place.
GRANT USAGE ON SCHEMA public TO freightos_app, freightos_control_plane;
GRANT USAGE ON SCHEMA public, app TO freightos_admin_owner;

-- The narrow table grants the definer needs, one table and one verb at a time. ADR-0020 §7 makes
-- "no grant" the default for every Phase 1 domain table; each line below is the named
-- justification that section requires.
GRANT INSERT ON audit_events TO freightos_admin_owner;             -- every privileged call audits
GRANT SELECT ON audit_events TO freightos_admin_owner;             -- admin.export_tenant_audit
GRANT SELECT, INSERT, UPDATE ON tenants TO freightos_admin_owner;  -- provision / set status
GRANT SELECT ON users, memberships, service_accounts TO freightos_admin_owner;
                                                                   -- admin.tenant_identity_summary
-- The read policies on those three tables evaluate app.organization_node_scope_ok, which reads the
-- closure. The definer satisfies that predicate through its control-plane branch, but PostgreSQL
-- still checks the table privilege when the policy expression is planned — so the grant is
-- mechanical rather than an additional reach. SELECT only.
GRANT SELECT ON organization_node_closure TO freightos_admin_owner;
-- Everything else stays ungranted. organization_nodes, legal_entities, operating_authorities,
-- carrier_appointments, roles, role_permissions, membership_roles, service_account_credentials,
-- service_account_permissions and policy_bindings are NOT reachable from the admin schema, which
-- is the ADR-0020 §7 default and is asserted by a test rather than left to review.

-- ---------------------------------------------------------------------------
-- The administrative schema.
-- ---------------------------------------------------------------------------

CREATE SCHEMA admin AUTHORIZATION freightos_admin_owner;

-- Everything in this schema is created BY its owner — F-04.
--
-- The migrator does not own schema admin and holds no CREATE on it, so it cannot author objects
-- here; it previously appeared to only because it inherited freightos_admin_owner, which is the
-- escalation the assertion above now refuses. The supported way to create an object owned by
-- another role is to become that role for the duration, which is exactly what the deployment-time
-- SET membership taken at the top of this file is for.
--
-- Creating as the owner also removes a whole class of mistake: an `ALTER ... OWNER TO` forgotten
-- after a new function leaves a SECURITY DEFINER function running as the DEPLOYMENT role instead
-- of the definer. Here that cannot happen, and the assertion after RESET ROLE proves it did not.
--
-- SET LOCAL, not SET: it is undone by the COMMIT or ROLLBACK that ends this migration regardless
-- of what happens in between, so a failure part-way cannot leave the connection wearing the
-- definer's identity.
SET LOCAL ROLE freightos_admin_owner;

COMMENT ON SCHEMA admin IS
  'ADR-0020 §3. Cross-tenant operations, exposed only as named functions with explicit arguments '
  '— never as ad-hoc SQL.';

REVOKE ALL ON SCHEMA admin FROM PUBLIC;
GRANT USAGE ON SCHEMA admin TO freightos_admin;

CREATE TYPE admin.privileged_result AS (
  outcome        text,
  audit_event_id uuid,
  message        text,
  payload        jsonb
);
COMMENT ON TYPE admin.privileged_result IS
  'outcome is succeeded | denied | failed, matching app.is_permitted_outcome. A denied result '
  'means no privileged work was performed.';


-- ---------------------------------------------------------------------------
-- admin.refusal_reason — the fail-closed gate, in one place.
--
-- Returns the reason a privileged call must be refused, or NULL when it may proceed. Every
-- condition ADR-0020 and the PR 2 scope name is here, and each returns a specific reason so the
-- audit record says which one fired.
-- ---------------------------------------------------------------------------

CREATE FUNCTION admin.refusal_reason(
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_tenant_id uuid,
  p_correlation_id uuid
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
$$;

REVOKE ALL ON FUNCTION admin.refusal_reason(text, text, text, uuid, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- admin.record — the audit write every privileged path goes through.
--
-- ADR-0020's required fields map onto audit_events as: actor -> actor_id/actor_type, request or
-- correlation id -> correlation_id, purpose -> purpose, tenant scope -> tenant_id, legal-entity
-- scope -> legal_entity_id, resource -> resource_type/resource_id, action -> event_type (the
-- versioned action name, which is already mandatory and already constrained), timestamp ->
-- created_at, outcome -> outcome. `action` is repeated in the payload for readability.
--
-- EVERY FIELD ABOVE IS SOMETHING THE CALLER SAID — F-06.
--
-- actor_id, actor_type, purpose, correlation id, resource, tenant: all parameters. The database
-- cannot authenticate the person behind an administrative connection, so it cannot do better than
-- record the claim — but recording ONLY the claim is what makes the ledger forgeable. Any holder
-- of the freightos_admin connection could attribute a tenant suspension to a named colleague, and
-- the audit trail, which Art. II.1 makes authoritative, would agree.
--
-- So every privileged record now also carries provenance the caller does not supply and cannot
-- reach: the authenticated login role, the effective role, the backend that ran it, and the
-- server's own clock. A claimed actor that no connection could have made is now visible as a
-- contradiction in the record itself rather than being indistinguishable from the truth.
--
-- The provenance object is applied LAST in the payload concatenation. jsonb `||` lets the right
-- operand win, so a caller passing its own `connection` key overwrites nothing — which a test
-- asserts, because getting that operand order wrong would restore the forgery in silence.
--
-- This narrows the forgery to "which human was at the authenticated connection", which is the part
-- only the application layer can answer. It does not close it. ADR-0026 records that.
-- ---------------------------------------------------------------------------

CREATE FUNCTION admin.record(
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

REVOKE ALL ON FUNCTION
  admin.record(uuid, uuid, text, text, text, uuid, text, text, text, text, text, jsonb)
  FROM PUBLIC;
-- Not granted to freightos_admin. The audit writer is internal; the administrative connection
-- reaches it only through the four operations below, so no caller can author a free-form record.

CREATE FUNCTION admin.deny(
  p_reason text,
  p_tenant_id uuid,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid,
  p_event_type text,
  p_resource_type text,
  p_resource_id text,
  p_action text
) RETURNS admin.privileged_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
$$;

REVOKE ALL ON FUNCTION admin.deny(text, uuid, text, text, text, uuid, text, text, text, text)
  FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- The four approved operations.
--
-- ADR-0020 §Consequences requires each admin.* function to be justified in a migration and
-- reviewed at every phase exit gate, precisely so this list does not sprawl. Four is the whole
-- surface PR 2 needs: bring a tenant into existence, change its lifecycle state, export its audit
-- trail, and count its identities for an access review.
-- ---------------------------------------------------------------------------

CREATE FUNCTION admin.provision_tenant(
  p_tenant_id uuid,
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
$$;

CREATE FUNCTION admin.set_tenant_status(
  p_tenant_id uuid,
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
$$;

CREATE FUNCTION admin.export_tenant_audit(
  p_tenant_id uuid,
  p_from timestamptz,
  p_to timestamptz,
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
$$;

CREATE FUNCTION admin.tenant_identity_summary(
  p_tenant_id uuid,
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
$$;

-- ---------------------------------------------------------------------------
-- Execute-only grants — ADR-0020 §4 and §6. Ownership needs no statement here: every object above
-- was created by freightos_admin_owner, and the assertion at the end of the file proves it.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION admin.provision_tenant(uuid, text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.set_tenant_status(uuid, text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION
  admin.export_tenant_audit(uuid, timestamptz, timestamptz, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.tenant_identity_summary(uuid, text, text, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION admin.provision_tenant(uuid, text, text, text, text, uuid)
  TO freightos_admin;
GRANT EXECUTE ON FUNCTION admin.set_tenant_status(uuid, text, text, text, text, uuid)
  TO freightos_admin;
GRANT EXECUTE ON FUNCTION
  admin.export_tenant_audit(uuid, timestamptz, timestamptz, text, text, text, uuid)
  TO freightos_admin;
GRANT EXECUTE ON FUNCTION admin.tenant_identity_summary(uuid, text, text, text, uuid)
  TO freightos_admin;

RESET ROLE;

-- ADR-0020 §4 — every admin object belongs to the definer owner, asserted rather than reviewed.
--
-- A SECURITY DEFINER function owned by the deployment role would run with the migrator's rights,
-- which include ownership of every table in the schema and therefore a way past the policies this
-- design exists to enforce. That is a silent outcome of one forgotten statement, so it is checked
-- here instead of at review time.
DO $$
DECLARE
  v_stray text;
BEGIN
  SELECT string_agg(name, ', ' ORDER BY name) INTO v_stray FROM (
    SELECT n.nspname || '.' || p.proname AS name
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'admin' AND p.proowner <> 'freightos_admin_owner'::regrole
    UNION ALL
    SELECT n.nspname || '.' || t.typname
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'admin' AND t.typowner <> 'freightos_admin_owner'::regrole
    UNION ALL
    SELECT 'schema ' || nspname FROM pg_namespace
     WHERE nspname = 'admin' AND nspowner <> 'freightos_admin_owner'::regrole
  ) AS stray;

  IF v_stray IS NOT NULL THEN
    RAISE EXCEPTION 'admin objects not owned by freightos_admin_owner: %', v_stray
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END
$$;
