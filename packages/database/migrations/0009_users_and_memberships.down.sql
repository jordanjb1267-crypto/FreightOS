-- Down: 0009 — Users, memberships, and membership-role assignment.
--
-- Reverting discards PERSONAL data. docs/runbooks/database-migration-recovery.md requires the
-- users table to be exported under the retention rules before this runs anywhere that holds real
-- identities.

DROP TABLE IF EXISTS membership_roles;
DROP FUNCTION IF EXISTS app.membership_role_before_write();
DROP TABLE IF EXISTS memberships;
DROP FUNCTION IF EXISTS app.current_user_id();
DROP TABLE IF EXISTS users;
