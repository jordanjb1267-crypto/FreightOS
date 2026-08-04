-- Down: 0007 — Organization hierarchy.
--
-- Dropping these tables discards the tenant organization tree, its legal entities, its operating
-- authorities and its carrier appointments. Nothing in PR 2 or earlier references them from
-- outside this migration, so the revert is clean; from PR 3 onward it is not, and
-- docs/runbooks/database-migration-recovery.md records the ordering constraint.
--
-- Tables go first. The scope predicates below are referenced by the policies on those tables, so
-- dropping a function ahead of its policy fails with a dependency error.

DROP TABLE IF EXISTS carrier_appointments;
DROP TABLE IF EXISTS operating_authorities;
DROP TABLE IF EXISTS legal_entities;
DROP TABLE IF EXISTS organization_node_closure;
DROP TABLE IF EXISTS organization_nodes;

DROP FUNCTION IF EXISTS app.organization_node_scope_ok(uuid);
DROP FUNCTION IF EXISTS app.legal_entity_scope_ok(uuid);
DROP FUNCTION IF EXISTS app.has_active_carrier_appointment(uuid, uuid, text, timestamptz);
DROP FUNCTION IF EXISTS app.carrier_appointment_before_write();
DROP FUNCTION IF EXISTS app.assert_governing_legal_entity();
DROP FUNCTION IF EXISTS app.governing_legal_entity_id(uuid, uuid);
DROP FUNCTION IF EXISTS app.legal_entity_before_write();
DROP FUNCTION IF EXISTS app.organization_node_after_move();
DROP FUNCTION IF EXISTS app.organization_node_after_insert();
DROP FUNCTION IF EXISTS app.organization_node_before_write();
DROP FUNCTION IF EXISTS app.is_permitted_node_parent(
  app.organization_node_type, app.organization_node_type);

DROP TYPE IF EXISTS app.identity_status;
DROP TYPE IF EXISTS app.organization_node_type;
