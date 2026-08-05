-- Down: 0010 — Effective permission resolution and self-elevation guards.
--
-- Reverting removes a security control. It is only safe on a database that is being unwound
-- entirely; docs/runbooks/database-migration-recovery.md records that reverting past 0010 while
-- 0009 stays applied leaves memberships self-grantable.

DROP TRIGGER IF EXISTS role_permissions_reject_self_elevation ON role_permissions;
DROP TRIGGER IF EXISTS membership_roles_reject_self_elevation ON membership_roles;
DROP TRIGGER IF EXISTS memberships_reject_self_elevation ON memberships;

DROP FUNCTION IF EXISTS app.reject_role_permission_self_elevation();
DROP FUNCTION IF EXISTS app.reject_membership_role_self_elevation();
DROP FUNCTION IF EXISTS app.reject_membership_self_elevation();
DROP FUNCTION IF EXISTS app.is_narrowing_identity_change(
  app.identity_status, app.identity_status, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS app.user_has_permission(uuid, uuid, text, timestamptz);

-- The guard definer's standing goes with its functions — F-01.
--
-- The role itself is NOT dropped, for the reason 0001's down gives for the Phase 0 roles: roles are
-- cluster-wide and may be shared with another database. Its privileges inside THIS database are
-- what 0010 created and what 0010 removes, so reverting leaves a role that can reach nothing here.
REVOKE SELECT ON organization_node_closure FROM freightos_identity_guard;
REVOKE SELECT ON membership_roles FROM freightos_identity_guard;
REVOKE SELECT ON memberships FROM freightos_identity_guard;
REVOKE ALL ON SCHEMA app FROM freightos_identity_guard;
REVOKE USAGE ON SCHEMA public FROM freightos_identity_guard;
REVOKE freightos_control_plane FROM freightos_identity_guard;
