-- Down: 0011 — Service accounts, credential references, and service-account permissions.
--
-- Reverting removes every credential reference. The referenced secrets live outside this database
-- and are NOT removed by this migration; docs/runbooks/control-plane-access.md records that
-- revoking them in the external store is a separate, manual step.

DROP FUNCTION IF EXISTS app.service_account_has_permission(uuid, uuid, text, timestamptz);
DROP TABLE IF EXISTS service_account_permissions;
DROP TABLE IF EXISTS service_account_credentials;
DROP TABLE IF EXISTS service_accounts;
