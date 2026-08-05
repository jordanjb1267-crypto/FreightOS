-- Down: 0017 — the authorization mutation boundary.
--
-- Reverting restores DIRECT tenant mutation of the authorization graph, which is the state R2-01
-- describes. It is only safe on a database being unwound entirely, and the migration-recovery
-- runbook says so.
--
-- Dropped BY the owner: schema admin belongs to freightos_admin_owner, and dropping an object in it
-- requires being that role. The grants and policies below are on public-schema tables the migrator
-- owns, so they are issued after RESET ROLE.
SET LOCAL ROLE freightos_admin_owner;
DROP FUNCTION IF EXISTS admin.revoke_service_account_permission(uuid, uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS admin.grant_service_account_permission(uuid, uuid, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS admin.revoke_role_permission(uuid, uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS admin.grant_role_permission(uuid, uuid, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS admin.create_role(uuid, uuid, uuid, text, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS admin.revoke_membership_role(uuid, uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS admin.assign_membership_role(uuid, uuid, uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS admin.revoke_membership(uuid, uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS admin.set_membership_status(uuid, uuid, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS admin.grant_membership(uuid, uuid, uuid, uuid, text, text, text, uuid);
DROP FUNCTION IF EXISTS admin.publish_actor(text);
DROP FUNCTION IF EXISTS admin.prior_success(uuid, text);
DROP FUNCTION IF EXISTS admin.authorization_refusal_reason(text, text, text, uuid, uuid);

RESET ROLE;

REVOKE ALL ON roles FROM freightos_admin_owner;
REVOKE ALL ON role_permissions FROM freightos_admin_owner;
REVOKE ALL ON memberships FROM freightos_admin_owner;
REVOKE ALL ON membership_roles FROM freightos_admin_owner;
REVOKE ALL ON service_account_permissions FROM freightos_admin_owner;
REVOKE ALL ON permissions, legal_entities, organization_nodes FROM freightos_admin_owner;

-- 0013 granted these and 0017 did not touch them, so they are restored rather than left revoked.
GRANT SELECT ON users, memberships, service_accounts TO freightos_admin_owner;
GRANT SELECT ON organization_node_closure TO freightos_admin_owner;
GRANT INSERT, SELECT ON audit_events TO freightos_admin_owner;
GRANT SELECT, INSERT, UPDATE ON tenants TO freightos_admin_owner;

DROP POLICY service_account_permissions_update ON service_account_permissions;
DROP POLICY service_account_permissions_insert ON service_account_permissions;
CREATE POLICY service_account_permissions_insert ON service_account_permissions FOR INSERT
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY service_account_permissions_update ON service_account_permissions FOR UPDATE
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());
GRANT SELECT, INSERT, UPDATE ON service_account_permissions TO freightos_app;

DROP POLICY membership_roles_update ON membership_roles;
DROP POLICY membership_roles_insert ON membership_roles;
CREATE POLICY membership_roles_insert ON membership_roles FOR INSERT
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY membership_roles_update ON membership_roles FOR UPDATE
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());
GRANT SELECT, INSERT, UPDATE ON membership_roles TO freightos_app;

DROP POLICY memberships_update ON memberships;
DROP POLICY memberships_insert ON memberships;
CREATE POLICY memberships_insert ON memberships FOR INSERT
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(legal_entity_id)
    AND app.organization_node_scope_ok(organization_node_id));
CREATE POLICY memberships_update ON memberships FOR UPDATE
  USING (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.organization_node_scope_ok(organization_node_id))
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(legal_entity_id)
    AND app.organization_node_scope_ok(organization_node_id));
GRANT SELECT, INSERT, UPDATE ON memberships TO freightos_app;

DROP POLICY role_permissions_update ON role_permissions;
DROP POLICY role_permissions_insert ON role_permissions;
CREATE POLICY role_permissions_insert ON role_permissions FOR INSERT
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY role_permissions_update ON role_permissions FOR UPDATE
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());
GRANT SELECT, INSERT, UPDATE ON role_permissions TO freightos_app;

DROP POLICY roles_update ON roles;
DROP POLICY roles_insert ON roles;
CREATE POLICY roles_insert ON roles FOR INSERT
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(legal_entity_id)
    AND app.organization_node_scope_ok(organization_node_id));
CREATE POLICY roles_update ON roles FOR UPDATE
  USING (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(legal_entity_id))
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(legal_entity_id)
    AND app.organization_node_scope_ok(organization_node_id));
GRANT SELECT, INSERT, UPDATE ON roles TO freightos_app;
