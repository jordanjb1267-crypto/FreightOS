-- Down: 0013 — ADR-0020 administrative schema.
--
-- Roles are cluster-wide objects that may be shared with other databases, so they are NOT dropped
-- here — the same reasoning 0001's down records for the Phase 0 roles. Their grants inside this
-- database go with the schema and the tables.

-- Dropped BY the owner — F-04.
--
-- Schema admin belongs to freightos_admin_owner, and DROP requires ownership. The migrator holds
-- SET membership on the definer owner without inheriting it, which is deliberate: deployment may
-- become the owner on purpose, and never does so by accident. Rolling back is one of the two
-- moments that purpose applies.
--
-- SET LOCAL is undone by the transaction that ends this migration either way, so a failure part
-- way through cannot leave the connection wearing the definer's identity. The grants below are on
-- public-schema tables the migrator owns, so they are issued after RESET ROLE, not before.
SET LOCAL ROLE freightos_admin_owner;
DROP SCHEMA IF EXISTS admin CASCADE;
RESET ROLE;

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
