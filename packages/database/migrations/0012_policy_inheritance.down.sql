-- Down: 0012 — Organization-node policy inheritance.

DROP FUNCTION IF EXISTS app.resolve_effective_policy(uuid, uuid, timestamptz);
DROP TABLE IF EXISTS policy_bindings;
DROP FUNCTION IF EXISTS app.policy_binding_before_write();
DROP TYPE IF EXISTS app.protected_control_category;
DROP TYPE IF EXISTS app.policy_binding_direction;
