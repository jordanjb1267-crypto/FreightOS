-- 0016 — ADR-0019: the standing autonomous_mobility suspension.
--
-- ADR-0019 §Implementation obligations assigns "standing autonomous_mobility suspension recorded
-- as a kill switch" to PR 2, and ADR-0019 §autonomous_mobility explains why it is a switch rather
-- than a runbook note: the enum value already exists in app.operating_context
-- (0001_platform_foundation.up.sql:31-38), so a code path can reach it. A standing switch makes an
-- accidental path fail closed rather than merely fail review.
--
-- The row uses a fixed id so the down migration can remove exactly this row and nothing else.
--
-- Engaged by `system` rather than `human` because no human engaged it — the platform ships with it
-- on. engaged_by_type still refuses an agent, which is the Art. V.1 guarantee. Releasing it is a
-- human act under docs/runbooks/kill-switch.md, and would additionally require the Autonomous
-- Vehicle Activation Gate, which is unsigned and Horizon 3 at the earliest.

INSERT INTO kill_switches (
  id, scope, scope_ref, tenant_id, mode, reason,
  engaged_by_type, engaged_by, created_by)
VALUES (
  'f0000000-0000-4000-8000-00000000a119',
  'operating_context',
  'autonomous_mobility',
  NULL,
  'suspended',
  'ADR-0019: autonomous_mobility is interface, schema, fixture and simulation only in Phase 1. '
  'Held at a standing fail-closed suspension. Release requires a signed '
  'checklists/AUTONOMOUS_VEHICLE_ACTIVATION_GATE.md.',
  'system',
  'system:adr-0019',
  'migration:0016');
