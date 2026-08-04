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
