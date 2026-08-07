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

-- FORCE RLS is lifted for this one statement — F-04.
--
-- The row is scope='operating_context' with no tenant, which `kill_switches_write` admits only for
-- the control plane. A migration connection is not the control plane and must not be: granting the
-- deployment role that authority to place one seed row would hand it every cross-tenant policy
-- branch in the schema permanently. The seed is a schema fact, so it is written the way schema
-- facts are written.
--
-- This only ever succeeded because migrations ran as a superuser, which bypasses row-level
-- security outright. It is the same defect as the 0008 permissions seed, and the mirror image of
-- the one in this migration's own down file.
--
-- The window is one statement wide, the row count is asserted so a future silent no-op fails
-- loudly, and enforcement is restored before anything else runs.
ALTER TABLE kill_switches NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_inserted integer;
BEGIN
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

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted <> 1 THEN
    RAISE EXCEPTION 'the standing autonomous_mobility suspension was not recorded (rows=%)',
      v_inserted;
  END IF;
END
$$;

ALTER TABLE kill_switches FORCE ROW LEVEL SECURITY;

-- The suspension must be in force when this migration commits, not merely inserted.
DO $$
BEGIN
  IF app.resolve_kill_switch_mode(
       p_operating_context => 'autonomous_mobility'::app.operating_context) <> 'suspended' THEN
    RAISE EXCEPTION
      'ADR-0019 requires autonomous_mobility to resolve to suspended after this migration';
  END IF;
END
$$;
