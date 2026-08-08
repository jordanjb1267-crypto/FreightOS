-- 0020 down — restore the exact pre-SR-2 state.
--
-- ROLLBACK FIDELITY IS NOT FORWARD SECURITY POSTURE. 0020's up hardens
-- app.current_human_principal()'s ACL, which the baseline capture found carrying PUBLIC EXECUTE
-- despite 0018's apparent intent. This down restores the CAPTURED TRUTH, PUBLIC EXECUTE included,
-- because reverting to 0018 must reproduce the database 0018 actually built — not the one its text
-- describes. The two requirements are deliberately separate.
--
-- Source of truth for every function body, owner, volatility, security mode, search_path and ACL
-- below: docs/security-resilience/sr2-baseline/pre-0020-accessors.sql, captured with
-- pg_get_functiondef() from a database migrated 1..18 as freightos_migrator. Not reconstructed
-- from memory.
--
-- Order matters: the accessors are restored to their GUC-reading forms BEFORE anything they depend
-- on is dropped, so no policy evaluates against a missing function mid-revert.

-- §6 reversed — the six accessors, exactly as 1..18 leaves them.
--
-- 0020's up hands these five to freightos_binding_owner so the accessor itself can carry the
-- EXECUTE privilege for app.verified_principal(). Reversing that needs a second temporary loan
-- beside the schema CREATE one below, for a reason PostgreSQL makes exact:
--
--   * CREATE OR REPLACE requires OWNERSHIP of the existing function, and ownership is decided by
--     has_privs_of_role() — which is INHERIT-sensitive. The migrator administers the binding owner
--     WITH INHERIT FALSE, so as things stand it is refused: `must be owner of function
--     current_tenant_id`, measured.
--   * ALTER FUNCTION ... OWNER TO additionally requires being able to SET ROLE to the NEW owner.
--     Running the transfer as the binding owner therefore cannot work either — it is not a member
--     of freightos_migrator.
--
-- So INHERIT is lent for the duration of the five replacements and returned immediately, by
-- re-granting the membership in its 0020 form. Re-granting from the same grantor updates that row
-- in place rather than adding a second one, and the membership is NOT revoked outright: a plain
-- REVOKE would also take the implicit ADMIN row the migrator holds from creating the role, and a
-- later re-apply could then no longer grant it at all.
--
-- Everything here is inside the migration's single transaction, so a failure anywhere between the
-- loan and its return commits neither.

GRANT freightos_binding_owner TO freightos_migrator WITH SET TRUE, INHERIT TRUE;

CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;
ALTER FUNCTION app.current_tenant_id() OWNER TO freightos_migrator;

CREATE OR REPLACE FUNCTION app.current_actor_id() RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.actor_id', true), '')
$$;
ALTER FUNCTION app.current_actor_id() OWNER TO freightos_migrator;

CREATE OR REPLACE FUNCTION app.current_organization_node_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.organization_node_id', true), '')::uuid
$$;
ALTER FUNCTION app.current_organization_node_id() OWNER TO freightos_migrator;

CREATE OR REPLACE FUNCTION app.current_legal_entity_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.legal_entity_id', true), '')::uuid
$$;
ALTER FUNCTION app.current_legal_entity_id() OWNER TO freightos_migrator;

CREATE OR REPLACE FUNCTION app.current_legal_authority_class() RETURNS app.legal_authority_class
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.legal_authority_class', true), '')::app.legal_authority_class
$$;
ALTER FUNCTION app.current_legal_authority_class() OWNER TO freightos_migrator;

CREATE OR REPLACE FUNCTION app.current_operating_context() RETURNS app.operating_context
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.operating_context', true), '')::app.operating_context
$$;
ALTER FUNCTION app.current_operating_context() OWNER TO freightos_migrator;

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(
    substring(coalesce(app.current_actor_id(), '')
              from '^user:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'),
    '')::uuid
$$;
ALTER FUNCTION app.current_user_id() OWNER TO freightos_migrator;

-- Loan returned. CREATE OR REPLACE without SECURITY DEFINER or SET clauses resets prosecdef to
-- false and proconfig to NULL, and leaves proacl untouched at NULL — measured, so the five are back
-- to their captured 1..18 shape in body, security mode, search_path, owner and ACL alike.
GRANT freightos_binding_owner TO freightos_migrator WITH SET TRUE, INHERIT FALSE;

-- Replaced AS its owner, and with CREATE on the schema lent for the duration: 0018 hands this
-- function to freightos_hierarchy_owner and then takes the schema privilege back, so both are
-- required and both are returned immediately afterwards.
GRANT CREATE ON SCHEMA app TO freightos_hierarchy_owner;
SET LOCAL ROLE freightos_hierarchy_owner;
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
-- The captured ACL is {=X/freightos_hierarchy_owner, freightos_hierarchy_owner=X/...}: PUBLIC
-- holds EXECUTE and freightos_app holds no explicit grant. Restored as captured, because reverting
-- to 0018 must reproduce the database 0018 actually built rather than the one its text describes.
REVOKE ALL ON FUNCTION app.current_human_principal() FROM freightos_app;
GRANT EXECUTE ON FUNCTION app.current_human_principal() TO PUBLIC;
RESET ROLE;
REVOKE CREATE ON SCHEMA app FROM freightos_hierarchy_owner;

-- §4 reversed — the four policies return to TO PUBLIC with their original predicates.

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

-- Restored exactly as 0011 created it: TO PUBLIC, same predicate.
DROP POLICY service_accounts_bootstrap_read ON service_accounts;
DROP POLICY service_accounts_read ON service_accounts;
CREATE POLICY service_accounts_read ON service_accounts FOR SELECT
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

-- §1 reversed, as far as a per-database migration legitimately can.
--
-- THE ROLE IS NOT DROPPED, AND THE MEMBERSHIP IS NOT REVOKED. Roles are cluster-wide, so
-- `DROP ROLE freightos_binding_owner` fails whenever ANY OTHER database in the same cluster still
-- has 0020 applied — which is the normal state of both CI and any deployment with more than one
-- FreightOS database. Measured, with the count PostgreSQL reports:
--
--   ERROR:  role "freightos_binding_owner" cannot be dropped because some objects depend on it
--   DETAIL:  owner of function app.verified_binding_tenant_scope()
--            ...
--            15 objects in database freightos_0019_dbg2
--
-- That is not a recoverable condition for a down migration: the objects it names are in a database
-- this connection cannot reach, and there is nothing correct for it to do about them. Every other
-- NOLOGIN owner role in this repository is handled the same way — 0007's freightos_hierarchy_owner,
-- 0010's freightos_identity_guard, 0013's freightos_admin_owner and 0018's freightos_audit_writer
-- are all created idempotently on the way up and left in place on the way down, for exactly this
-- reason. 0020 was the only migration attempting a DROP ROLE, and it was wrong to.
--
-- What the down DOES remove is every privilege the role holds in THIS database, which is the whole
-- of its reach here: after this statement it owns nothing, can read nothing, and cannot log in.
-- The surviving catalog row is inert, and §10's assertions on a re-applied database prove the
-- re-grant path still converges.
--
-- The migrator's administer-only membership is likewise retained. A plain REVOKE would also drop
-- the implicit ADMIN row PostgreSQL 16 creates for the role's creator, leaving a later re-apply
-- unable to grant the role at all.

REVOKE SELECT ON users, memberships, service_accounts, organization_node_closure
  FROM freightos_binding_owner;
REVOKE USAGE ON SCHEMA app, public FROM freightos_binding_owner;
