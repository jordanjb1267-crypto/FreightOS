-- Down: 0008 — Permission catalog, roles, and role-permission assignment.
--
-- Reverting discards every tenant role and every permission grant. The catalog seed is recreated
-- verbatim by the up migration, so no export is needed for it; the tenant rows are not
-- recoverable and docs/runbooks/database-migration-recovery.md says so.

DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS permissions;
