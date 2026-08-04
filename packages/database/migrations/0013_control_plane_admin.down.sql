-- Down: 0013 — ADR-0020 administrative schema.
--
-- Roles are cluster-wide objects that may be shared with other databases, so they are NOT dropped
-- here — the same reasoning 0001's down records for the Phase 0 roles. Their grants inside this
-- database go with the schema and the tables.

DROP SCHEMA IF EXISTS admin CASCADE;

REVOKE ALL ON audit_events FROM freightos_admin_owner;
REVOKE ALL ON tenants FROM freightos_admin_owner;
REVOKE ALL ON users, memberships, service_accounts FROM freightos_admin_owner;
REVOKE ALL ON organization_node_closure FROM freightos_admin_owner;
REVOKE USAGE ON SCHEMA public, app FROM freightos_admin_owner;

-- Restore the built-in defaults, and only those. PostgreSQL grants EXECUTE on new functions to
-- PUBLIC and nothing on new tables or sequences, so re-granting EXECUTE is the whole reversal —
-- a GRANT ALL here would leave the database more open than it was before 0013 ran.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

-- PostgreSQL 16 default for schema public: USAGE to PUBLIC, CREATE to the owner only.
GRANT USAGE ON SCHEMA public TO PUBLIC;
