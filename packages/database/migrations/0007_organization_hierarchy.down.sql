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

-- The hierarchy definer's standing inside THIS database goes with the objects it owned — F-02.
--
-- Neither the role nor its control-plane membership is removed, for the reason 0001's down gives
-- for the Phase 0 roles: both are cluster-wide, and another database may be relying on them. A
-- revert here that reached outside this database would take the hierarchy triggers of every other
-- FreightOS database in the cluster down with it — which is not hypothetical, it is what the test
-- suite does, one database per file, concurrently.
--
-- Schema access is per-database and is removed. The table privileges went with the tables above,
-- so what is left afterwards is a role that can reach nothing here.
REVOKE ALL ON SCHEMA app FROM freightos_hierarchy_owner;
REVOKE USAGE ON SCHEMA public FROM freightos_hierarchy_owner;
