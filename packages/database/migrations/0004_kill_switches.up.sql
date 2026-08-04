-- 0004 — Kill switches.
--
-- Closes G8. The handoff names seven scopes and seven modes in five lines
-- (09_AUTONOMY_POLICY_AND_AUTHORITY:35-39) and supplies no table, semantics, precedence rule, or
-- authority model. Precedence and per-mode capabilities live in packages/context/src/kill-switch.ts;
-- this is the durable record.
--
-- Constitution Art. V.1: "Humans retain kill-switch and override authority."
-- Art. V.2: "Policy or audit failure blocks autonomous execution."

CREATE TYPE app.kill_switch_scope AS ENUM (
  'system',
  'legal_plane',
  'tenant',
  'workflow',
  'agent',
  'tool',
  'integration'
);

-- Ordered most to least permissive. Resolution takes the most restrictive across all applicable
-- scopes, so a narrow switch can only ever tighten.
CREATE TYPE app.kill_switch_mode AS ENUM (
  'enabled',
  'approval_only',
  'autonomous_disabled',
  'communications_disabled',
  'financial_disabled',
  'read_only',
  'suspended'
);

CREATE TABLE kill_switches (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                 app.kill_switch_scope NOT NULL,
  -- NULL only for system scope, which by definition has no narrower subject.
  scope_ref             text,
  -- NULL for system and legal_plane scope; those are deliberately cross-tenant.
  tenant_id             uuid,
  mode                  app.kill_switch_mode NOT NULL,
  reason                text NOT NULL CHECK (length(btrim(reason)) > 0),

  -- Constitution Art. V.1 reserves this to humans, and Art. X.6 forbids an agent changing its own
  -- autonomy ceiling. An agent actor is rejected outright rather than merely discouraged.
  engaged_by_type       text NOT NULL CHECK (engaged_by_type IN ('human', 'system')),
  engaged_by            text NOT NULL CHECK (length(btrim(engaged_by)) > 0),
  engaged_at            timestamptz NOT NULL DEFAULT now(),
  released_by           text,
  released_at           timestamptz,

  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            text NOT NULL,

  CONSTRAINT kill_switches_scope_ref_shape
    CHECK ((scope = 'system') = (scope_ref IS NULL)),
  CONSTRAINT kill_switches_tenant_shape
    CHECK (
      CASE
        WHEN scope IN ('system', 'legal_plane') THEN tenant_id IS NULL
        ELSE tenant_id IS NOT NULL
      END
    ),
  CONSTRAINT kill_switches_release_consistency
    CHECK ((released_at IS NULL) = (released_by IS NULL))
);

COMMENT ON TABLE kill_switches IS
  'Active switch = released_at IS NULL. Releases are recorded, not deleted, so the incident '
  'record survives — 00_MASTER_HANDOFF requires tested kill switches and restores.';

-- At most one active switch per subject. Without this, two conflicting rows for the same agent
-- make "which one is in force" a question the data cannot answer.
CREATE UNIQUE INDEX kill_switches_one_active_per_subject
  ON kill_switches (scope, coalesce(scope_ref, ''))
  WHERE released_at IS NULL;

CREATE INDEX kill_switches_active_idx
  ON kill_switches (scope, scope_ref)
  WHERE released_at IS NULL;

CREATE TRIGGER kill_switches_no_delete
  BEFORE DELETE ON kill_switches
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER kill_switches_no_truncate
  BEFORE TRUNCATE ON kill_switches
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

ALTER TABLE kill_switches ENABLE ROW LEVEL SECURITY;
ALTER TABLE kill_switches FORCE ROW LEVEL SECURITY;

-- System and legal-plane switches are visible to every tenant on purpose: a tenant must be able
-- to see that a global halt is why its work stopped. They remain writable only by the control
-- plane.
CREATE POLICY kill_switches_read ON kill_switches
  FOR SELECT
  USING (
    app.is_control_plane()
    OR scope IN ('system', 'legal_plane')
    OR tenant_id = app.current_tenant_id()
  );

CREATE POLICY kill_switches_write ON kill_switches
  FOR INSERT
  WITH CHECK (
    app.is_control_plane()
    OR (scope NOT IN ('system', 'legal_plane') AND tenant_id = app.current_tenant_id())
  );

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

GRANT SELECT, INSERT, UPDATE ON kill_switches TO freightos_app;
GRANT SELECT, INSERT, UPDATE ON kill_switches TO freightos_control_plane;
REVOKE DELETE, TRUNCATE ON kill_switches FROM freightos_app, freightos_control_plane;

-- Resolution in SQL, mirroring resolveKillSwitch() in packages/context. Having it on both sides
-- means a policy decision and a database query cannot disagree about what is in force.
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
      -- Enum declaration order is restrictiveness order, so DESC is "most restrictive wins".
      ORDER BY mode DESC
      LIMIT 1
    ),
    'enabled'::app.kill_switch_mode
  )
$$;
