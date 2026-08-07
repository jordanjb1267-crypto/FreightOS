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
-- A legal_entity switch must name a legal entity of its own tenant — F-12.
--
-- The shape constraint above checks that scope_ref parses as a uuid and stops there, so any uuid
-- was accepted, including another tenant's legal entity. A tenant could record a halt naming an
-- entity it does not own, and the record would say so permanently — kill_switches is append-only,
-- and Art. II.1 makes it incident evidence.
--
-- A CHECK constraint cannot express this: it would have to read another table. A trigger can, and
-- it is a definer so the answer does not depend on what the caller can see. Under row-level
-- security a caller cannot see another tenant's legal entity at all, so a caller-run check would
-- read "no such entity" for the cross-tenant case and for the genuinely-missing case alike, and
-- would have to conflate them. The definer tells them apart and says which is wrong.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.kill_switch_before_write() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF NEW.scope <> 'legal_entity' THEN
    RETURN NEW;
  END IF;

  -- Shape first, and by returning rather than raising. A BEFORE trigger runs ahead of the CHECK
  -- constraints, so casting a malformed scope_ref here would replace kill_switches_scope_ref_type's
  -- specific complaint with "invalid input syntax for type uuid". The constraint is the better
  -- error; this steps out of its way.
  IF NEW.scope_ref !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     OR NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id INTO v_owner
    FROM legal_entities WHERE id = NEW.scope_ref::uuid;

  -- A switch naming an entity that does not exist halts nothing and harms only the tenant that
  -- recorded it, and kill_switches carries no foreign key to legal_entities — the table predates
  -- them and is deliberately cross-tenant. Adding one is a schema change beyond this finding, so
  -- the unknown case passes and the CROSS-TENANT case, which is the defect, does not.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_owner IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION
      'kill switch names legal entity %, which belongs to tenant % and not to %',
      NEW.scope_ref, v_owner, NEW.tenant_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END
$$;

-- The definer owner is the hierarchy maintainer from 0007: already NOLOGIN, already a member of
-- freightos_control_plane, and this is one more read of a tenant-owned table by trusted code. A
-- third definer role for one lookup would be ceremony rather than isolation.
GRANT CREATE ON SCHEMA app TO freightos_hierarchy_owner;
ALTER FUNCTION app.kill_switch_before_write() OWNER TO freightos_hierarchy_owner;
REVOKE CREATE ON SCHEMA app FROM freightos_hierarchy_owner;
REVOKE ALL ON FUNCTION app.kill_switch_before_write() FROM PUBLIC;
GRANT SELECT ON legal_entities TO freightos_hierarchy_owner;

CREATE TRIGGER kill_switches_before_write
  BEFORE INSERT OR UPDATE ON kill_switches
  FOR EACH ROW EXECUTE FUNCTION app.kill_switch_before_write();

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
          -- The tenant is part of the match, not merely of the row — F-12. A legal entity belongs
          -- to exactly one tenant, so a legal_entity switch is only ever about that tenant's
          -- entity. Matching on scope_ref alone made the row's own tenant_id decorative here: a
          -- switch recorded under one tenant would halt an identically-numbered entity resolved
          -- under another. Row-level security hid that from an application session, which is a
          -- reason it was never seen rather than a reason it was safe — the control plane sees
          -- every row, and resolution is exactly what the control plane does.
          OR (scope = 'legal_entity'      AND scope_ref = p_legal_entity_id::text
                                          AND tenant_id = p_tenant_id)
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
