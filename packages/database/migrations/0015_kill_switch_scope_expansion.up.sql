-- 0015 — OQ-19, part 2: constraints, policies and precedence for the two new kill-switch scopes.
--
-- Backward compatibility is the binding requirement here, not a nicety. Every Phase 0 kill-switch
-- record must remain valid and must resolve to exactly the same mode as before:
--
--   * No existing row is rewritten. The only UPDATE below backfills released_by_type on rows that
--     are already released, and that column did not exist to disagree with.
--   * No existing scope changes meaning. `system`, `legal_plane`, `tenant`, `workflow`, `agent`,
--     `tool` and `integration` behave identically.
--   * The new scopes match on parameters that were not previously passed, so a caller that does
--     not supply them cannot match a new-scope row: scope_ref = NULL is NULL, never true.
--   * Most-restrictive-wins is unchanged. Enum declaration order on app.kill_switch_mode is
--     restrictiveness order, ORDER BY mode DESC is still the rule, and a new scope can therefore
--     only ever tighten.
--
-- A regression test captures resolution for a matrix of Phase 0 rows before this migration and
-- replays it after, asserting identity.
--
-- SCOPE OF ENFORCEMENT. This migration records and resolves kill switches. It creates no
-- consequential execution call site, and Phase 1 does not enforce a kill switch at the command
-- point — Phase 0 carry-forward item 1 defers that to Phase 3 (OQ-14, P-17). Nothing here should
-- be read as claiming protection that has not been built.

-- ---------------------------------------------------------------------------
-- Release authority.
--
-- Constitution Art. V.1 reserves kill-switch authority to humans, and 0004 enforced that on
-- ENGAGEMENT only: engaged_by_type rejects an agent, while released_by was an unconstrained text
-- column. An agent that cannot engage a switch but can release one has defeated the control.
-- ---------------------------------------------------------------------------

ALTER TABLE kill_switches ADD COLUMN released_by_type text;

UPDATE kill_switches
   SET released_by_type = 'human'
 WHERE released_at IS NOT NULL AND released_by_type IS NULL;

ALTER TABLE kill_switches
  DROP CONSTRAINT kill_switches_release_consistency;

ALTER TABLE kill_switches
  ADD CONSTRAINT kill_switches_release_consistency
    CHECK ((released_at IS NULL) = (released_by IS NULL)
       AND (released_at IS NULL) = (released_by_type IS NULL)),
  ADD CONSTRAINT kill_switches_released_by_type_shape
    CHECK (released_by_type IS NULL OR released_by_type IN ('human', 'system'));

COMMENT ON COLUMN kill_switches.released_by_type IS
  'Constitution Art. V.1. Symmetric with engaged_by_type: an agent may neither engage nor release '
  'a kill switch.';

-- ---------------------------------------------------------------------------
-- Scope-reference and tenant shape for the new scopes.
--
-- Only the new scopes are constrained. `tenant` scope_ref has always been an unvalidated string
-- and adding a uuid check to it now would be a new restriction on Phase 0 records, which the
-- compatibility requirement forbids.
-- ---------------------------------------------------------------------------

ALTER TABLE kill_switches
  DROP CONSTRAINT kill_switches_tenant_shape;

ALTER TABLE kill_switches
  ADD CONSTRAINT kill_switches_tenant_shape
    CHECK (
      CASE
        -- operating_context joins system and legal_plane as deliberately cross-tenant: a context
        -- is a platform-wide surface, so suspending one suspends it everywhere.
        WHEN scope IN ('system', 'legal_plane', 'operating_context') THEN tenant_id IS NULL
        -- legal_entity is tenant-scoped: a legal entity belongs to exactly one tenant.
        ELSE tenant_id IS NOT NULL
      END
    ),
  ADD CONSTRAINT kill_switches_scope_ref_type
    CHECK (
      CASE scope
        WHEN 'legal_entity' THEN
          scope_ref ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        WHEN 'operating_context' THEN
          scope_ref IN ('system', 'carrier', 'shipper_owned', 'facility_operator',
                        'autonomous_mobility', 'brokerage')
        ELSE true
      END
    );

-- ---------------------------------------------------------------------------
-- Visibility.
--
-- 0004's read policy lets every tenant see system and legal_plane switches, so a tenant can tell
-- that a global halt is why its work stopped. operating_context switches are global in the same
-- way and are added to the same branch. legal_entity switches are tenant data and fall through to
-- the tenant predicate, unchanged.
-- ---------------------------------------------------------------------------

DROP POLICY kill_switches_read ON kill_switches;
CREATE POLICY kill_switches_read ON kill_switches
  FOR SELECT
  USING (
    app.is_control_plane()
    OR scope IN ('system', 'legal_plane', 'operating_context')
    OR tenant_id = app.current_tenant_id()
  );

DROP POLICY kill_switches_write ON kill_switches;
CREATE POLICY kill_switches_write ON kill_switches
  FOR INSERT
  WITH CHECK (
    app.is_control_plane()
    OR (scope NOT IN ('system', 'legal_plane', 'operating_context')
        AND tenant_id = app.current_tenant_id())
  );

DROP POLICY kill_switches_release ON kill_switches;
CREATE POLICY kill_switches_release ON kill_switches
  FOR UPDATE
  USING (
    app.is_control_plane()
    OR (scope NOT IN ('system', 'legal_plane', 'operating_context')
        AND tenant_id = app.current_tenant_id())
  )
  WITH CHECK (
    app.is_control_plane()
    OR (scope NOT IN ('system', 'legal_plane', 'operating_context')
        AND tenant_id = app.current_tenant_id())
  );

-- ---------------------------------------------------------------------------
-- Precedence.
--
-- Dropped and recreated rather than CREATE OR REPLACE: adding parameters produces an OVERLOAD,
-- not a replacement, and the existing one-argument call sites would then be ambiguous. The two
-- new parameters are appended, so every existing positional call resolves unchanged.
-- ---------------------------------------------------------------------------

DROP FUNCTION app.resolve_kill_switch_mode(uuid, text, text, text, text, text);

CREATE FUNCTION app.resolve_kill_switch_mode(
  p_tenant_id uuid DEFAULT NULL,
  p_legal_plane text DEFAULT NULL,
  p_workflow_id text DEFAULT NULL,
  p_agent_id text DEFAULT NULL,
  p_tool_id text DEFAULT NULL,
  p_integration_id text DEFAULT NULL,
  p_legal_entity_id uuid DEFAULT NULL,
  p_operating_context app.operating_context DEFAULT NULL
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
          OR (scope = 'legal_plane'       AND scope_ref = p_legal_plane)
          OR (scope = 'tenant'            AND scope_ref = p_tenant_id::text)
          OR (scope = 'workflow'          AND scope_ref = p_workflow_id)
          OR (scope = 'agent'             AND scope_ref = p_agent_id)
          OR (scope = 'tool'              AND scope_ref = p_tool_id)
          OR (scope = 'integration'       AND scope_ref = p_integration_id)
          OR (scope = 'legal_entity'      AND scope_ref = p_legal_entity_id::text)
          OR (scope = 'operating_context' AND scope_ref = p_operating_context::text)
        )
      -- Enum declaration order is restrictiveness order, so DESC is "most restrictive wins".
      ORDER BY mode DESC
      LIMIT 1
    ),
    'enabled'::app.kill_switch_mode
  )
$$;

COMMENT ON FUNCTION app.resolve_kill_switch_mode IS
  'Mirrors resolveKillSwitch() in packages/context/src/kill-switch.ts. Most restrictive across '
  'every applicable scope wins; a narrower scope can only ever tighten. An unsupplied parameter '
  'is NULL and matches nothing, so a caller cannot accidentally pick up a scope it did not ask '
  'about.';
