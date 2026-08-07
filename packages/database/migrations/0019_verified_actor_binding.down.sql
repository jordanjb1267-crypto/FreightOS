-- 0019 down — restore the exact pre-SR-2 state.
--
-- ROLLBACK FIDELITY IS NOT FORWARD SECURITY POSTURE. 0019's up hardens
-- app.current_human_principal()'s ACL, which the baseline capture found carrying PUBLIC EXECUTE
-- despite 0018's apparent intent. This down restores the CAPTURED TRUTH, PUBLIC EXECUTE included,
-- because reverting to 0018 must reproduce the database 0018 actually built — not the one its text
-- describes. The two requirements are deliberately separate.
--
-- Source of truth for every function body, owner, volatility, security mode, search_path and ACL
-- below: docs/security-resilience/sr2-baseline/pre-0019-accessors.sql, captured with
-- pg_get_functiondef() from a database migrated 1..18 as freightos_migrator. Not reconstructed
-- from memory.
--
-- Order matters: the accessors are restored to their GUC-reading forms BEFORE anything they depend
-- on is dropped, so no policy evaluates against a missing function mid-revert.

-- §6 reversed — the six accessors, exactly as 1..18 leaves them.

CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_actor_id() RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.actor_id', true), '')
$$;

CREATE OR REPLACE FUNCTION app.current_organization_node_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.organization_node_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_legal_entity_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.legal_entity_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(
    substring(coalesce(app.current_actor_id(), '')
              from '^user:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'),
    '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_human_principal() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT u.id
    FROM users u
   WHERE u.tenant_id = app.current_tenant_id()
     AND u.id = nullif(substring(app.current_actor_id() from
           '^user:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'),
           '')::uuid
     AND u.status = 'active'
     AND u.revoked_at IS NULL
     AND u.effective_from <= now()
     AND (u.effective_to IS NULL OR u.effective_to > now())
$$;
ALTER FUNCTION app.current_human_principal() OWNER TO freightos_hierarchy_owner;
-- The captured ACL is {=X/freightos_hierarchy_owner, freightos_hierarchy_owner=X/...}: PUBLIC
-- holds EXECUTE and freightos_app holds no explicit grant. Restored as captured.
REVOKE ALL ON FUNCTION app.current_human_principal() FROM freightos_app;
GRANT EXECUTE ON FUNCTION app.current_human_principal() TO PUBLIC;

-- §4 reversed — the three policies return to TO PUBLIC with their original predicates.

DROP POLICY organization_node_closure_bootstrap_read ON organization_node_closure;
DROP POLICY organization_node_closure_read ON organization_node_closure;
CREATE POLICY organization_node_closure_read ON organization_node_closure FOR SELECT
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id());

DROP POLICY users_bootstrap_read ON users;
DROP POLICY users_read ON users;
CREATE POLICY users_read ON users FOR SELECT
  USING (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.organization_node_scope_ok(organization_node_id));

DROP POLICY memberships_bootstrap_read ON memberships;
DROP POLICY memberships_read ON memberships;
CREATE POLICY memberships_read ON memberships FOR SELECT
  USING (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.organization_node_scope_ok(organization_node_id));

-- §7, §8, §5, §3 reversed — the functions, then the type they return.

SET LOCAL ROLE freightos_admin_owner;
DROP FUNCTION IF EXISTS admin.issue_session_binding(
  text, uuid, uuid, uuid, uuid, text, text, integer, text, integer);
RESET ROLE;

DROP FUNCTION IF EXISTS app.begin_verified_session(uuid);
DROP FUNCTION IF EXISTS app.verified_principal();
DROP TYPE IF EXISTS app.verified_principal_result;
DROP FUNCTION IF EXISTS app.verified_binding_node_scope_ok(uuid);
DROP FUNCTION IF EXISTS app.verified_binding_tenant_scope();
DROP FUNCTION IF EXISTS app.verified_binding_context();

-- §2 reversed.

DROP TABLE IF EXISTS app.session_binding;

-- §1 reversed. Grants must go before the role can be dropped.

REVOKE SELECT ON users, memberships, service_accounts, organization_node_closure
  FROM freightos_binding_owner;
REVOKE USAGE ON SCHEMA app, public FROM freightos_binding_owner;
REVOKE freightos_binding_owner FROM freightos_migrator;
DROP ROLE IF EXISTS freightos_binding_owner;
