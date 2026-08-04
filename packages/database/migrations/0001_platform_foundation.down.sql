-- Down: 0001 — Platform foundation.
--
-- Roles are cluster-wide objects that may be shared with other databases, so they are NOT
-- dropped here. Dropping them would be a side effect outside this database's blast radius.

DROP FUNCTION IF EXISTS app.reject_mutation();
DROP FUNCTION IF EXISTS app.bump_version();
DROP FUNCTION IF EXISTS app.set_updated_at();
DROP FUNCTION IF EXISTS app.assert_legal_context();
DROP FUNCTION IF EXISTS app.is_control_plane();
DROP FUNCTION IF EXISTS app.current_operating_context();
DROP FUNCTION IF EXISTS app.current_legal_authority_class();
DROP FUNCTION IF EXISTS app.current_actor_id();
DROP FUNCTION IF EXISTS app.current_tenant_id();
DROP FUNCTION IF EXISTS app.is_permitted_legal_pairing(app.legal_authority_class, app.operating_context);

DROP TYPE IF EXISTS app.operating_context;
DROP TYPE IF EXISTS app.legal_authority_class;

REVOKE USAGE ON SCHEMA app FROM freightos_app, freightos_control_plane;

DROP SCHEMA IF EXISTS app;
