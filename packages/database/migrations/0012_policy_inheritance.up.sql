-- 0012 — Organization-node policy inheritance.
--
-- 04_ENTERPRISE_SCALE_AND_TENANCY:18-22: policies inherit downward; a child may tighten but may
-- never weaken legal, safety, enterprise-minimum, security, residency or approval controls; every
-- effective policy records its inherited source and any local override.
--
-- Resolution mirrors the kill-switch rule in 0004: most restrictive wins across every applicable
-- scope. Using the same direction in both places is deliberate — two precedence rules pointing
-- opposite ways is how a system ends up with a global control a local setting can switch off.
--
-- PR 2 builds the MECHANISM. The control vocabulary and the ordinal each value carries belong to
-- a policy pack, and POLICY_REGISTRY.md gap 1 records that no such pack exists yet: base_policy
-- contains vocabularies, not rules. Phase 2 supplies them. Inventing them here would be authoring
-- policy the owner has not ruled on.

CREATE TYPE app.policy_binding_direction AS ENUM ('inherited', 'local_override');
COMMENT ON TYPE app.policy_binding_direction IS
  '04_...:22 requires every effective policy to record whether it came down the tree or was set '
  'locally.';

-- The six categories 04_...:20 names as un-weakenable by a child.
CREATE TYPE app.protected_control_category AS ENUM (
  'legal',
  'safety',
  'enterprise_minimum',
  'security',
  'residency',
  'approval'
);

CREATE TABLE policy_bindings (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  organization_node_id   uuid NOT NULL,
  -- ADR-0021 registered exception, category 5. A binding on the enterprise root, or on any node
  -- above a legal-entity node, has no governing legal entity to name. The trigger below makes the
  -- column exactly as null as the hierarchy says it must be — never merely permitted to be.
  legal_entity_id        uuid,

  policy_key             text NOT NULL CHECK (length(btrim(policy_key)) > 0),
  policy_version         text NOT NULL CHECK (length(btrim(policy_version)) > 0),
  control_key            text NOT NULL CHECK (length(btrim(control_key)) > 0),
  control_value          text NOT NULL,
  -- Higher is stricter. The ordinal is supplied by the policy pack, which owns the meaning of the
  -- values; this table owns only the comparison.
  restrictiveness        integer NOT NULL CHECK (restrictiveness >= 0),
  direction              app.policy_binding_direction NOT NULL,
  -- NULL for an ordinary control. Set for one of the six a child may not weaken.
  --
  -- Declared once and inherited thereafter — F-08. The trigger below refuses a descendant binding
  -- that names a different category, or none, for a control an ancestor has already declared
  -- protected. Protectedness is a property of the CONTROL; leaving it a per-row option meant the
  -- guard that reads it could be switched off by the row it was guarding.
  protected_category     app.protected_control_category,

  status                 app.identity_status NOT NULL DEFAULT 'active',
  effective_from         timestamptz NOT NULL DEFAULT now(),
  effective_to           timestamptz,
  revoked_at             timestamptz,
  revoked_by             text,

  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             text NOT NULL CHECK (length(btrim(created_by)) > 0),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             text NOT NULL CHECK (length(btrim(updated_by)) > 0),
  record_version         bigint NOT NULL DEFAULT 1,

  CONSTRAINT policy_bindings_status_shape
    CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
  CONSTRAINT policy_bindings_effective_window
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT policy_bindings_revocation_consistency
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT policy_bindings_revoked_status
    CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),

  CONSTRAINT policy_bindings_node_fk
    FOREIGN KEY (tenant_id, organization_node_id) REFERENCES organization_nodes (tenant_id, id),
  CONSTRAINT policy_bindings_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities (tenant_id, id)
);

COMMENT ON TABLE policy_bindings IS
  'One row per control per node. Resolution is most-restrictive-wins over the ancestor chain, '
  'with the source node reported alongside the value.';

CREATE UNIQUE INDEX policy_bindings_one_active_per_control
  ON policy_bindings (tenant_id, organization_node_id, policy_key, control_key)
  WHERE revoked_at IS NULL;

CREATE INDEX policy_bindings_node_idx
  ON policy_bindings (tenant_id, organization_node_id, control_key);

-- ---------------------------------------------------------------------------
-- The category-5 legal-entity rule, and the un-weakenable protected controls.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.policy_binding_before_write() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_governing uuid;
  v_inherited_category app.protected_control_category;
  v_stricter_ancestor record;
BEGIN
  v_governing := app.governing_legal_entity_id(NEW.tenant_id, NEW.organization_node_id);

  -- IS DISTINCT FROM, not <>: NULL must equal NULL here. Above the legal-entity boundary the
  -- column is required to be NULL, and below it is required to match exactly. There is no third
  -- case, which is what keeps the exception from widening into "nullable when convenient".
  IF NEW.legal_entity_id IS DISTINCT FROM v_governing THEN
    RAISE EXCEPTION
      'policy binding legal_entity_id % does not match the legal entity governing node % (%)',
      NEW.legal_entity_id, NEW.organization_node_id, v_governing
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- Protectedness is inherited, not asserted — F-08.
  --
  -- The weakening guard below fired only when the incoming row said protected_category IS NOT
  -- NULL, and that column is supplied by the same caller the guard exists to constrain. Writing a
  -- child binding with the category left NULL therefore skipped the check entirely and weakened a
  -- protected control freely — no error, no trace, and the resolved policy afterwards is simply
  -- looser than the ancestor set. The one thing a caller had to do to escape a control it may not
  -- weaken was decline to mention that it may not weaken it.
  --
  -- So the category is taken from the hierarchy. If any strict ancestor has declared this control
  -- protected, the incoming row must name that same category, and a mismatch — including an
  -- absence — is refused rather than corrected, so the attempt is visible in the same way every
  -- other refusal here is. A node may still be the first to declare a control protected; what it
  -- may not do is be the first to stop.
  --
  -- The lookup is not visibility-dependent: policy_bindings_read is scoped by tenant alone, with no
  -- organization-node term, so a caller at any node sees every binding in its own tenant including
  -- its ancestors'. A node-scoped read policy here would make this guard fail open the way the
  -- self-elevation guards did before F-01, and a test asserts the read policy stays as it is.
  IF NEW.revoked_at IS NULL THEN
    SELECT pb.protected_category INTO v_inherited_category
      FROM policy_bindings pb
      JOIN organization_node_closure c
        ON c.tenant_id = pb.tenant_id
       AND c.ancestor_id = pb.organization_node_id
     WHERE pb.tenant_id = NEW.tenant_id
       AND c.descendant_id = NEW.organization_node_id
       AND c.depth > 0
       AND pb.policy_key = NEW.policy_key
       AND pb.control_key = NEW.control_key
       AND pb.revoked_at IS NULL
       AND pb.status = 'active'
       AND pb.protected_category IS NOT NULL
     ORDER BY c.depth ASC
     LIMIT 1;

    IF v_inherited_category IS NOT NULL
       AND NEW.protected_category IS DISTINCT FROM v_inherited_category THEN
      RAISE EXCEPTION
        'protected control "%" is declared % by an ancestor binding; this binding names % and may '
        'not change or omit it',
        NEW.control_key, v_inherited_category,
        coalesce(NEW.protected_category::text, 'no category')
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- A child may tighten a protected control. It may not loosen one. Rejected at write time, so
  -- the attempt is visible and refused, rather than filtered out silently at read time.
  IF NEW.protected_category IS NOT NULL AND NEW.revoked_at IS NULL THEN
    SELECT pb.organization_node_id, pb.restrictiveness, pb.control_value
      INTO v_stricter_ancestor
      FROM policy_bindings pb
      JOIN organization_node_closure c
        ON c.tenant_id = pb.tenant_id
       AND c.ancestor_id = pb.organization_node_id
     WHERE pb.tenant_id = NEW.tenant_id
       AND c.descendant_id = NEW.organization_node_id
       AND c.depth > 0                       -- strict ancestors only
       AND pb.policy_key = NEW.policy_key
       AND pb.control_key = NEW.control_key
       AND pb.revoked_at IS NULL
       AND pb.status = 'active'
       AND pb.restrictiveness > NEW.restrictiveness
     ORDER BY pb.restrictiveness DESC
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION
        'protected control "%" may not be weakened: node % inherits restrictiveness % from node '
        '% and this binding proposes %',
        NEW.control_key, NEW.organization_node_id, v_stricter_ancestor.restrictiveness,
        v_stricter_ancestor.organization_node_id, NEW.restrictiveness
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER policy_bindings_before_write
  BEFORE INSERT OR UPDATE ON policy_bindings
  FOR EACH ROW EXECUTE FUNCTION app.policy_binding_before_write();
CREATE TRIGGER policy_bindings_set_updated_at
  BEFORE UPDATE ON policy_bindings FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER policy_bindings_set_created_row_actor
  BEFORE INSERT ON policy_bindings FOR EACH ROW EXECUTE FUNCTION app.set_created_row_actor();
CREATE TRIGGER policy_bindings_set_updated_by
  BEFORE UPDATE ON policy_bindings FOR EACH ROW EXECUTE FUNCTION app.set_updated_by();
CREATE TRIGGER policy_bindings_bump_version
  BEFORE UPDATE ON policy_bindings FOR EACH ROW EXECUTE FUNCTION app.bump_version();

-- ---------------------------------------------------------------------------
-- Effective policy resolution.
--
-- Returns one row per control, carrying the value AND the node it came from — 04_...:22 requires
-- the source, and a resolution that reports only the winning value cannot answer "why".
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.resolve_effective_policy(
  p_tenant_id uuid,
  p_organization_node_id uuid,
  p_as_of timestamptz
) RETURNS TABLE (
  policy_key text,
  control_key text,
  control_value text,
  restrictiveness integer,
  source_node_id uuid,
  source_depth integer,
  direction app.policy_binding_direction,
  protected_category app.protected_control_category
)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT ON (pb.policy_key, pb.control_key)
         pb.policy_key,
         pb.control_key,
         pb.control_value,
         pb.restrictiveness,
         pb.organization_node_id,
         c.depth,
         pb.direction,
         pb.protected_category
    FROM policy_bindings pb
    JOIN organization_node_closure c
      ON c.tenant_id = pb.tenant_id
     AND c.ancestor_id = pb.organization_node_id
   WHERE pb.tenant_id = p_tenant_id
     AND c.descendant_id = p_organization_node_id
     AND pb.status = 'active'
     AND pb.revoked_at IS NULL
     AND pb.effective_from <= p_as_of
     AND (pb.effective_to IS NULL OR pb.effective_to > p_as_of)
   -- Most restrictive wins. A tie goes to the nearest node, so an equally strict local override
   -- is reported as the source rather than a distant ancestor that happens to agree.
   ORDER BY pb.policy_key, pb.control_key, pb.restrictiveness DESC, c.depth ASC
$$;
COMMENT ON FUNCTION app.resolve_effective_policy IS
  'Mirrored by resolveEffectivePolicy() in packages/identity/src/policy-inheritance.ts. Explicit '
  'as-of — P-20.';

-- ---------------------------------------------------------------------------
-- Row-level security.
-- ---------------------------------------------------------------------------

ALTER TABLE policy_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_bindings FORCE ROW LEVEL SECURITY;
CREATE POLICY policy_bindings_read ON policy_bindings FOR SELECT
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY policy_bindings_insert ON policy_bindings FOR INSERT
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.organization_node_scope_ok(organization_node_id)
    -- Above the legal-entity boundary legal_entity_id is NULL and the legal-entity term drops out,
    -- so a root-level binding is gated on node scope alone: the caller must hold the enterprise
    -- root it is binding. That is the intended reading of ADR-0019's matrix — enterprise-wide
    -- policy is tenant administration — now that operating context confers no scope of its own
    -- (F-05). It previously read "writable only under system scope", which described the
    -- short-circuit rather than the rule.
    AND (legal_entity_id IS NULL OR app.legal_entity_scope_ok(legal_entity_id)));
CREATE POLICY policy_bindings_update ON policy_bindings FOR UPDATE
  USING (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.organization_node_scope_ok(organization_node_id))
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.organization_node_scope_ok(organization_node_id)
    AND (legal_entity_id IS NULL OR app.legal_entity_scope_ok(legal_entity_id)));
GRANT SELECT, INSERT, UPDATE ON policy_bindings TO freightos_app;
REVOKE DELETE, TRUNCATE ON policy_bindings FROM freightos_app;

-- Referencing-side indexes for every composite foreign key — F-20.
--
-- PostgreSQL indexes the REFERENCED side automatically, because that side is a primary key or a
-- unique constraint. It indexes the referencing side not at all, and two things then go wrong
-- quietly: a referential check on delete or update of the parent scans the child table, and every
-- join along the key does the same.
--
-- The miss is easy to make here because every composite key is `(tenant_id, something_id)`. A
-- single-column index on tenant_id looks like coverage and is not, and an index on
-- `(something_id, tenant_id)` cannot answer a leading-column lookup on tenant_id either. The key's
-- columns have to be a PREFIX of some index, in order, and identity-rls.test.ts asserts exactly
-- that for the whole schema so a later table arrives with the requirement rather than the oversight.

CREATE INDEX policy_bindings_legal_entity_fk_idx ON policy_bindings (tenant_id, legal_entity_id);
