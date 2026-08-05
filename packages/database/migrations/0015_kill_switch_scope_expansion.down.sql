-- F-12 additions come off first: the trigger and the definer's read on legal_entities.
DROP TRIGGER IF EXISTS kill_switches_before_write ON kill_switches;
DROP FUNCTION IF EXISTS app.kill_switch_before_write();
REVOKE SELECT ON legal_entities FROM freightos_hierarchy_owner;

-- Down: 0015 — OQ-19, part 2.
--
-- Restores the Phase 0 constraints, policies and precedence function exactly. 0014's down then
-- removes the enum values themselves, and refuses if any row still uses one.

DROP FUNCTION IF EXISTS
  app.resolve_kill_switch_mode(uuid, text, text, text, text, text, uuid, app.operating_context);

CREATE FUNCTION app.resolve_kill_switch_mode(
  p_tenant_id uuid DEFAULT NULL,
  p_legal_plane text DEFAULT NULL,
  p_workflow_id text DEFAULT NULL,
  p_agent_id text DEFAULT NULL,
  p_tool_id text DEFAULT NULL,
  p_integration_id text DEFAULT NULL
) RETURNS app.kill_switch_mode
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    (
      SELECT mode
      FROM kill_switches
      WHERE released_at IS NULL
        AND (
          scope = 'system'
          OR (scope = 'legal_plane' AND scope_ref = p_legal_plane)
          OR (scope = 'tenant'      AND scope_ref = p_tenant_id::text)
          OR (scope = 'workflow'    AND scope_ref = p_workflow_id)
          OR (scope = 'agent'       AND scope_ref = p_agent_id)
          OR (scope = 'tool'        AND scope_ref = p_tool_id)
          OR (scope = 'integration' AND scope_ref = p_integration_id)
        )
      ORDER BY mode DESC
      LIMIT 1
    ),
    'enabled'::app.kill_switch_mode
  )
$$;

DROP POLICY kill_switches_release ON kill_switches;
CREATE POLICY kill_switches_release ON kill_switches
  FOR UPDATE
  USING (
    app.is_control_plane()
    OR (scope NOT IN ('system', 'legal_plane') AND tenant_id = app.current_tenant_id())
  )
  WITH CHECK (
    app.is_control_plane()
    OR (scope NOT IN ('system', 'legal_plane') AND tenant_id = app.current_tenant_id())
  );

DROP POLICY kill_switches_write ON kill_switches;
CREATE POLICY kill_switches_write ON kill_switches
  FOR INSERT
  WITH CHECK (
    app.is_control_plane()
    OR (scope NOT IN ('system', 'legal_plane') AND tenant_id = app.current_tenant_id())
  );

DROP POLICY kill_switches_read ON kill_switches;
CREATE POLICY kill_switches_read ON kill_switches
  FOR SELECT
  USING (
    app.is_control_plane()
    OR scope IN ('system', 'legal_plane')
    OR tenant_id = app.current_tenant_id()
  );

ALTER TABLE kill_switches
  DROP CONSTRAINT IF EXISTS kill_switches_scope_ref_type,
  DROP CONSTRAINT IF EXISTS kill_switches_tenant_shape,
  DROP CONSTRAINT IF EXISTS kill_switches_released_by_type_shape,
  DROP CONSTRAINT IF EXISTS kill_switches_release_consistency;

ALTER TABLE kill_switches
  ADD CONSTRAINT kill_switches_tenant_shape
    CHECK (
      CASE
        WHEN scope IN ('system', 'legal_plane') THEN tenant_id IS NULL
        ELSE tenant_id IS NOT NULL
      END
    ),
  ADD CONSTRAINT kill_switches_release_consistency
    CHECK ((released_at IS NULL) = (released_by IS NULL));

ALTER TABLE kill_switches DROP COLUMN IF EXISTS released_by_type;
