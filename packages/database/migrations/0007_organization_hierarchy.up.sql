-- 0007 — Organization hierarchy, legal entities, operating authorities, carrier appointments.
--
-- Specification 1 of docs/plans/phase-1-definition-and-owner-decisions.md, under ADR-0019
-- (operating-context boundaries), ADR-0020 (control-plane access) and ADR-0021 (common fields).
--
-- THE CANONICAL TABLE TEMPLATE. Every later Phase 1 migration copies the shape established here:
--
--   1. Common fields, ADR-0021: id, tenant_id, organization_node_id, legal_entity_id, created_at,
--      created_by, updated_at, updated_by, record_version. Deviations are registered exceptions in
--      adr/0021-common-record-fields.md and nowhere else.
--   2. Composite foreign keys on (tenant_id, <parent>_id) rather than plain ones, so an
--      inconsistent tenant/legal-entity/organization-node combination is unrepresentable rather
--      than merely discouraged.
--   3. ENABLE + FORCE ROW LEVEL SECURITY.
--   4. Four explicit policies per table — read, insert, update, and either a delete policy or
--      none at all. No policy for DELETE means every delete is filtered out; the REVOKE below it
--      means the attempt is refused outright. Deny-delete is stated twice on purpose.
--   5. GRANT to freightos_app only. ADR-0020 §7: the default for a new Phase 1 domain table is
--      NO control-plane grant. `permissions` in 0008 is the single justified exception, and the
--      narrow admin_owner grants in 0012 are named there one table at a time.
--   6. app.set_updated_at, app.set_created_row_actor, app.set_updated_by and app.bump_version
--      triggers on every mutable table.

-- ---------------------------------------------------------------------------
-- Types.
-- ---------------------------------------------------------------------------

-- The eight node types at 04_ENTERPRISE_SCALE_AND_TENANCY:5-14, matching db/reference/0001:4-7.
CREATE TYPE app.organization_node_type AS ENUM (
  'enterprise',
  'legal_entity',
  'operating_authority',
  'business_unit',
  'region',
  'terminal',
  'fleet',
  'cost_center'
);
COMMENT ON TYPE app.organization_node_type IS
  'Organization node kinds. Ordering carries no meaning — permitted parenthood is a relation, not '
  'a ladder (app.is_permitted_node_parent).';

CREATE TYPE app.identity_status AS ENUM (
  'pending',
  'active',
  'suspended',
  'revoked',
  'archived'
);
COMMENT ON TYPE app.identity_status IS
  'Shared identity and authority lifecycle. Each table constrains the subset it may use: an '
  'organization node is archived, never revoked; an appointment is revoked, never archived.';

-- ---------------------------------------------------------------------------
-- Permitted parenthood.
--
-- 04_...:16 says drivers, equipment, users, policies, contracts and reports "can be scoped to any
-- valid node", and 00_...:116-124 presents the canonical nesting as illustrative. So this is a
-- relation over type pairs, not a fixed chain: a region may sit under an enterprise, a legal
-- entity, an operating authority, a business unit, or another region.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.is_permitted_node_parent(
  p_child app.organization_node_type,
  p_parent app.organization_node_type
) RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_child
    -- The enterprise node is the root. It has no parent, which the table CHECK enforces; this
    -- branch exists so that asking the question at all yields false rather than NULL.
    WHEN 'enterprise' THEN false
    WHEN 'legal_entity' THEN
      p_parent IN ('enterprise', 'business_unit', 'region')
    WHEN 'operating_authority' THEN
      p_parent = 'legal_entity'
    WHEN 'business_unit' THEN
      p_parent IN ('enterprise', 'legal_entity', 'operating_authority', 'business_unit', 'region')
    WHEN 'region' THEN
      p_parent IN ('enterprise', 'legal_entity', 'operating_authority', 'business_unit', 'region')
    WHEN 'terminal' THEN
      p_parent IN ('legal_entity', 'operating_authority', 'business_unit', 'region')
    WHEN 'fleet' THEN
      p_parent IN ('legal_entity', 'operating_authority', 'business_unit', 'region', 'terminal')
    WHEN 'cost_center' THEN
      p_parent IN ('enterprise', 'legal_entity', 'operating_authority', 'business_unit',
                   'region', 'terminal', 'fleet')
  END
$$;
COMMENT ON FUNCTION app.is_permitted_node_parent IS
  'Mirrored by PERMITTED_NODE_PARENTS in packages/identity/src/organization.ts. A test asserts '
  'the two agree over the full 8x8 cross-product.';

-- ---------------------------------------------------------------------------
-- organization_nodes.
--
-- ADR-0021 registered exception, category 5: no legal_entity_id column. The enterprise root and
-- every node above a legal-entity node exists before and above any legal entity, so the column
-- could not be NOT NULL and a nullable one would be indistinguishable from an omission. The
-- governing legal entity of a node is derived instead — app.governing_legal_entity_id — from the
-- nearest ancestor-or-self node a legal entity is attached to.
--
-- organization_node_id IS carried, as a self-reference, exactly as tenants.tenant_id is
-- (0002_tenants.up.sql:19). One predicate shape across every table beats a special case.
-- ---------------------------------------------------------------------------

CREATE TABLE organization_nodes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  organization_node_id   uuid NOT NULL,
  parent_id              uuid,
  node_type              app.organization_node_type NOT NULL,
  name                   text NOT NULL CHECK (length(btrim(name)) > 0),
  -- Human-facing references are never the key — Specification 1, "Primary identifiers".
  external_reference     text,
  -- Database-owned. Maintained by trigger from the parent, bounded so that inheritance resolution
  -- cannot become unbounded (P-18).
  depth                  integer NOT NULL DEFAULT 0,
  status                 app.identity_status NOT NULL DEFAULT 'active',

  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             text NOT NULL CHECK (length(btrim(created_by)) > 0),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             text NOT NULL CHECK (length(btrim(updated_by)) > 0),
  record_version         bigint NOT NULL DEFAULT 1,

  CONSTRAINT organization_nodes_self_reference
    CHECK (organization_node_id = id),
  CONSTRAINT organization_nodes_status_shape
    CHECK (status IN ('active', 'suspended', 'archived')),
  -- The root is the enterprise and the enterprise is the root. Both directions.
  CONSTRAINT organization_nodes_root_is_enterprise
    CHECK ((parent_id IS NULL) = (node_type = 'enterprise')),
  CONSTRAINT organization_nodes_not_own_parent
    CHECK (parent_id IS DISTINCT FROM id),
  CONSTRAINT organization_nodes_depth_bound
    CHECK (depth >= 0 AND depth <= 16),
  CONSTRAINT organization_nodes_root_depth
    CHECK ((parent_id IS NULL) = (depth = 0)),

  CONSTRAINT organization_nodes_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT organization_nodes_parent_same_tenant
    FOREIGN KEY (tenant_id, parent_id) REFERENCES organization_nodes (tenant_id, id)
);

COMMENT ON TABLE organization_nodes IS
  'Tenant organization tree. ADR-0021 category-5 exception: legal_entity_id is derived, not '
  'stored — see app.governing_legal_entity_id.';

CREATE UNIQUE INDEX organization_nodes_one_root_per_tenant
  ON organization_nodes (tenant_id)
  WHERE parent_id IS NULL;

CREATE INDEX organization_nodes_parent_idx ON organization_nodes (tenant_id, parent_id);
CREATE INDEX organization_nodes_type_idx ON organization_nodes (tenant_id, node_type);

-- ---------------------------------------------------------------------------
-- organization_node_closure.
--
-- ADR-0021 registered exception, category 4: a relationship table whose tenant is deterministically
-- inherited from both parents and enforced by composite foreign keys against both. There is no
-- single organization node or legal entity to record — the row IS a pair of nodes.
--
-- ADR-0019 §Consequences requires materialised association tables rather than per-query
-- recomputation at the 100,000-unit scale target, and inheritance resolution walks this table.
-- ---------------------------------------------------------------------------

CREATE TABLE organization_node_closure (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  ancestor_id            uuid NOT NULL,
  descendant_id          uuid NOT NULL,
  depth                  integer NOT NULL,

  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             text NOT NULL CHECK (length(btrim(created_by)) > 0),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             text NOT NULL CHECK (length(btrim(updated_by)) > 0),
  record_version         bigint NOT NULL DEFAULT 1,

  CONSTRAINT organization_node_closure_depth_bound
    CHECK (depth >= 0 AND depth <= 16),
  CONSTRAINT organization_node_closure_self_row
    CHECK ((ancestor_id = descendant_id) = (depth = 0)),
  CONSTRAINT organization_node_closure_pair_key UNIQUE (tenant_id, ancestor_id, descendant_id),
  CONSTRAINT organization_node_closure_ancestor_fk
    FOREIGN KEY (tenant_id, ancestor_id) REFERENCES organization_nodes (tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT organization_node_closure_descendant_fk
    FOREIGN KEY (tenant_id, descendant_id) REFERENCES organization_nodes (tenant_id, id)
    ON DELETE CASCADE
);

COMMENT ON TABLE organization_node_closure IS
  'Transitive closure of organization_nodes, maintained by trigger. Derived data: never written '
  'by application code.';

CREATE INDEX organization_node_closure_descendant_idx
  ON organization_node_closure (tenant_id, descendant_id, depth);

-- ---------------------------------------------------------------------------
-- Hierarchy maintenance.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.organization_node_before_write() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent_type  app.organization_node_type;
  v_parent_depth integer;
  v_parent_tenant uuid;
  v_subtree_height integer;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.depth := 0;
    RETURN NEW;
  END IF;

  SELECT node_type, depth, tenant_id
    INTO v_parent_type, v_parent_depth, v_parent_tenant
    FROM organization_nodes
   WHERE id = NEW.parent_id;

  -- Under RLS a cross-tenant parent is simply not visible, so this is also the cross-tenant
  -- refusal for an application session. The explicit tenant comparison below covers the
  -- control-plane path, where every tenant IS visible.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization node parent % does not exist', NEW.parent_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_parent_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'organization node parent % belongs to a different tenant', NEW.parent_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NOT app.is_permitted_node_parent(NEW.node_type, v_parent_type) THEN
    RAISE EXCEPTION 'organization node type % may not be a child of %',
      NEW.node_type, v_parent_type
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- Cycle prevention. A move is a cycle exactly when the proposed parent already sits inside the
  -- moving node's own subtree, which the closure answers in one lookup.
  IF TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1 FROM organization_node_closure
     WHERE tenant_id = NEW.tenant_id
       AND ancestor_id = NEW.id
       AND descendant_id = NEW.parent_id
  ) THEN
    RAISE EXCEPTION 'organization hierarchy cycle rejected: % already sits below %',
      NEW.parent_id, NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  NEW.depth := v_parent_depth + 1;

  -- The bound is on the tree, not on this row: moving a tall subtree under a deep parent must be
  -- refused even though the moved node itself would still be within bounds.
  SELECT coalesce(max(depth), 0) INTO v_subtree_height
    FROM organization_node_closure
   WHERE tenant_id = NEW.tenant_id AND ancestor_id = NEW.id;

  IF NEW.depth + v_subtree_height > 16 THEN
    RAISE EXCEPTION
      'organization hierarchy depth bound of 16 exceeded: node would sit at depth % with a '
      'subtree % deep', NEW.depth, v_subtree_height
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END
$$;

CREATE FUNCTION app.organization_node_after_insert() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO organization_node_closure
    (tenant_id, ancestor_id, descendant_id, depth, created_by, updated_by)
  VALUES (NEW.tenant_id, NEW.id, NEW.id, 0, NEW.created_by, NEW.updated_by);

  IF NEW.parent_id IS NOT NULL THEN
    INSERT INTO organization_node_closure
      (tenant_id, ancestor_id, descendant_id, depth, created_by, updated_by)
    SELECT NEW.tenant_id, c.ancestor_id, NEW.id, c.depth + 1, NEW.created_by, NEW.updated_by
      FROM organization_node_closure c
     WHERE c.tenant_id = NEW.tenant_id
       AND c.descendant_id = NEW.parent_id;
  END IF;

  RETURN NULL;
END
$$;

CREATE FUNCTION app.organization_node_after_move() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_level integer;
BEGIN
  -- Detach: drop every closure row linking the moving subtree to an ancestor outside it.
  DELETE FROM organization_node_closure
   WHERE tenant_id = NEW.tenant_id
     AND descendant_id IN (
       SELECT descendant_id FROM organization_node_closure
        WHERE tenant_id = NEW.tenant_id AND ancestor_id = NEW.id)
     AND ancestor_id NOT IN (
       SELECT descendant_id FROM organization_node_closure
        WHERE tenant_id = NEW.tenant_id AND ancestor_id = NEW.id);

  -- Reattach: every ancestor of the new parent, crossed with every node of the moving subtree.
  IF NEW.parent_id IS NOT NULL THEN
    INSERT INTO organization_node_closure
      (tenant_id, ancestor_id, descendant_id, depth, created_by, updated_by)
    SELECT NEW.tenant_id, sup.ancestor_id, sub.descendant_id, sup.depth + sub.depth + 1,
           NEW.updated_by, NEW.updated_by
      FROM organization_node_closure sup
      JOIN organization_node_closure sub ON sub.tenant_id = sup.tenant_id
     WHERE sup.tenant_id = NEW.tenant_id
       AND sup.descendant_id = NEW.parent_id
       AND sub.ancestor_id = NEW.id;
  END IF;

  -- Re-depth the descendants breadth-first, so each level's parent is already correct when the
  -- BEFORE trigger recomputes the child from it.
  FOR v_level IN 1 .. 16 LOOP
    UPDATE organization_nodes n
       SET depth = NEW.depth + c.depth,
           updated_by = NEW.updated_by
      FROM organization_node_closure c
     WHERE c.tenant_id = NEW.tenant_id
       AND c.ancestor_id = NEW.id
       AND c.depth = v_level
       AND c.descendant_id = n.id
       AND n.tenant_id = NEW.tenant_id;
    EXIT WHEN NOT FOUND;
  END LOOP;

  RETURN NULL;
END
$$;

CREATE TRIGGER organization_nodes_before_write
  BEFORE INSERT OR UPDATE ON organization_nodes
  FOR EACH ROW EXECUTE FUNCTION app.organization_node_before_write();

CREATE TRIGGER organization_nodes_after_insert
  AFTER INSERT ON organization_nodes
  FOR EACH ROW EXECUTE FUNCTION app.organization_node_after_insert();

CREATE TRIGGER organization_nodes_after_move
  AFTER UPDATE OF parent_id ON organization_nodes
  FOR EACH ROW WHEN (OLD.parent_id IS DISTINCT FROM NEW.parent_id)
  EXECUTE FUNCTION app.organization_node_after_move();

CREATE TRIGGER organization_nodes_set_updated_at
  BEFORE UPDATE ON organization_nodes
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER organization_nodes_set_created_row_actor
  BEFORE INSERT ON organization_nodes
  FOR EACH ROW EXECUTE FUNCTION app.set_created_row_actor();
CREATE TRIGGER organization_nodes_set_updated_by
  BEFORE UPDATE ON organization_nodes
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_by();
CREATE TRIGGER organization_nodes_bump_version
  BEFORE UPDATE ON organization_nodes
  FOR EACH ROW EXECUTE FUNCTION app.bump_version();

CREATE TRIGGER organization_node_closure_set_updated_at
  BEFORE UPDATE ON organization_node_closure
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER organization_node_closure_set_created_row_actor
  BEFORE INSERT ON organization_node_closure
  FOR EACH ROW EXECUTE FUNCTION app.set_created_row_actor();
CREATE TRIGGER organization_node_closure_bump_version
  BEFORE UPDATE ON organization_node_closure
  FOR EACH ROW EXECUTE FUNCTION app.bump_version();

-- ---------------------------------------------------------------------------
-- legal_entities.
--
-- legal_entity_id is a self-reference, so the common-field contract is satisfied without an
-- exception — the same device tenants uses.
-- ---------------------------------------------------------------------------

CREATE TABLE legal_entities (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  organization_node_id   uuid NOT NULL,
  legal_entity_id        uuid NOT NULL,

  legal_name             text NOT NULL CHECK (length(btrim(legal_name)) > 0),
  jurisdiction           text NOT NULL CHECK (length(btrim(jurisdiction)) > 0),
  registration_number    text,
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

  CONSTRAINT legal_entities_self_reference CHECK (legal_entity_id = id),
  CONSTRAINT legal_entities_status_shape
    CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
  CONSTRAINT legal_entities_effective_window
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT legal_entities_revocation_consistency
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT legal_entities_revoked_status
    CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),

  CONSTRAINT legal_entities_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT legal_entities_node_fk
    FOREIGN KEY (tenant_id, organization_node_id) REFERENCES organization_nodes (tenant_id, id)
);

COMMENT ON TABLE legal_entities IS
  'The accountable legal person. ADR-0019 makes legal_entity_id required on every tenant-owned '
  'operational record, and this is the table it points at.';

-- One legal entity per legal-entity node: the node is the structural placeholder, the row is the
-- entity, and two entities on one node would make app.governing_legal_entity_id ambiguous.
CREATE UNIQUE INDEX legal_entities_one_per_node
  ON legal_entities (tenant_id, organization_node_id);

CREATE FUNCTION app.legal_entity_before_write() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_node_type app.organization_node_type;
BEGIN
  SELECT node_type INTO v_node_type
    FROM organization_nodes
   WHERE tenant_id = NEW.tenant_id AND id = NEW.organization_node_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization node % does not exist in tenant %',
      NEW.organization_node_id, NEW.tenant_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_node_type <> 'legal_entity' THEN
    RAISE EXCEPTION 'a legal entity must attach to a legal_entity node, not a % node', v_node_type
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER legal_entities_before_write
  BEFORE INSERT OR UPDATE ON legal_entities
  FOR EACH ROW EXECUTE FUNCTION app.legal_entity_before_write();
CREATE TRIGGER legal_entities_set_updated_at
  BEFORE UPDATE ON legal_entities
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER legal_entities_set_created_row_actor
  BEFORE INSERT ON legal_entities
  FOR EACH ROW EXECUTE FUNCTION app.set_created_row_actor();
CREATE TRIGGER legal_entities_set_updated_by
  BEFORE UPDATE ON legal_entities
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_by();
CREATE TRIGGER legal_entities_bump_version
  BEFORE UPDATE ON legal_entities
  FOR EACH ROW EXECUTE FUNCTION app.bump_version();

-- The nearest legal entity at or above a node. NULL above the legal-entity boundary, which is the
-- ADR-0021 category-5 case and is why policy_bindings.legal_entity_id is conditionally nullable.
CREATE FUNCTION app.governing_legal_entity_id(
  p_tenant_id uuid,
  p_organization_node_id uuid
) RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT le.id
    FROM organization_node_closure c
    JOIN legal_entities le
      ON le.tenant_id = c.tenant_id
     AND le.organization_node_id = c.ancestor_id
   WHERE c.tenant_id = p_tenant_id
     AND c.descendant_id = p_organization_node_id
   ORDER BY c.depth ASC
   LIMIT 1
$$;
COMMENT ON FUNCTION app.governing_legal_entity_id IS
  'Nearest ancestor-or-self legal entity. Smallest closure depth wins, so a nested legal entity '
  'governs its own subtree rather than its parent doing so.';

-- ---------------------------------------------------------------------------
-- The organization-node / legal-entity agreement rule.
--
-- ADR-0021 makes both columns NOT NULL on tenant-owned operational records, and two independent
-- NOT NULL columns can still disagree. This is the constraint that stops them: the stored legal
-- entity must be the one that actually governs the stored node. A row naming node N and legal
-- entity L where L does not govern N is rejected — not silently reassigned, and never resolved
-- from the session, which would let a caller launder a mismatch through its own context.
--
-- It is also why every table using it must sit at or below a legal-entity node: above that
-- boundary there is no governing entity, and a NOT NULL column would have nothing truthful to
-- hold. policy_bindings (0012) is the one table that legitimately sits higher, and it is a
-- registered ADR-0021 category-5 exception with its own conditional rule.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.assert_governing_legal_entity() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_governing uuid;
BEGIN
  v_governing := app.governing_legal_entity_id(NEW.tenant_id, NEW.organization_node_id);

  IF v_governing IS NULL THEN
    RAISE EXCEPTION
      '% requires an organization node governed by a legal entity; node % sits above the '
      'legal-entity boundary', TG_TABLE_NAME, NEW.organization_node_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.legal_entity_id <> v_governing THEN
    RAISE EXCEPTION
      '% names legal entity % but organization node % is governed by legal entity %',
      TG_TABLE_NAME, NEW.legal_entity_id, NEW.organization_node_id, v_governing
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END
$$;

-- ---------------------------------------------------------------------------
-- operating_authorities.
--
-- ADR-0015 keeps legal posture in two dimensions and this table stores both. Brokerage is refused
-- here as a fourth independent refusal on top of the three R-05 already records, because an
-- operating authority is the artifact that would make brokerage look conferred.
-- ---------------------------------------------------------------------------

CREATE TABLE operating_authorities (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  organization_node_id   uuid NOT NULL,
  legal_entity_id        uuid NOT NULL,

  legal_authority_class  app.legal_authority_class NOT NULL,
  operating_context      app.operating_context NOT NULL,
  authority_type         text NOT NULL CHECK (length(btrim(authority_type)) > 0),
  authority_number       text,
  status                 app.identity_status NOT NULL DEFAULT 'pending',
  effective_from         timestamptz NOT NULL DEFAULT now(),
  effective_to           timestamptz,
  revoked_at             timestamptz,
  revoked_by             text,

  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             text NOT NULL CHECK (length(btrim(created_by)) > 0),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             text NOT NULL CHECK (length(btrim(updated_by)) > 0),
  record_version         bigint NOT NULL DEFAULT 1,

  CONSTRAINT operating_authorities_legal_pairing
    CHECK (app.is_permitted_legal_pairing(legal_authority_class, operating_context)),
  -- R-05, P-12. BROKERAGE_EXECUTION_ENABLED is a mandatory-false flag and the brokerage legal gate
  -- is unsigned; no authority record may assert the plane in the meantime.
  CONSTRAINT operating_authorities_brokerage_disabled
    CHECK (legal_authority_class <> 'brokerage' AND operating_context <> 'brokerage'),
  -- ADR-0019: autonomous_mobility is interface, schema, fixture and simulation only, held at a
  -- standing suspension. A record may exist; it may not be active.
  CONSTRAINT operating_authorities_autonomous_mobility_not_operational
    CHECK (operating_context <> 'autonomous_mobility' OR status <> 'active'),
  CONSTRAINT operating_authorities_status_shape
    CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
  CONSTRAINT operating_authorities_effective_window
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT operating_authorities_revocation_consistency
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT operating_authorities_revoked_status
    CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),

  CONSTRAINT operating_authorities_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT operating_authorities_node_fk
    FOREIGN KEY (tenant_id, organization_node_id) REFERENCES organization_nodes (tenant_id, id),
  CONSTRAINT operating_authorities_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities (tenant_id, id)
);

COMMENT ON TABLE operating_authorities IS
  'Regulatory posture held by a legal entity. legal_authority_class x operating_context, never a '
  'single collapsed authority_mode — ADR-0015.';

CREATE INDEX operating_authorities_legal_entity_idx
  ON operating_authorities (tenant_id, legal_entity_id, status);

CREATE TRIGGER operating_authorities_assert_governing_legal_entity
  BEFORE INSERT OR UPDATE ON operating_authorities
  FOR EACH ROW EXECUTE FUNCTION app.assert_governing_legal_entity();
CREATE TRIGGER operating_authorities_set_updated_at
  BEFORE UPDATE ON operating_authorities
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER operating_authorities_set_created_row_actor
  BEFORE INSERT ON operating_authorities
  FOR EACH ROW EXECUTE FUNCTION app.set_created_row_actor();
CREATE TRIGGER operating_authorities_set_updated_by
  BEFORE UPDATE ON operating_authorities
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_by();
CREATE TRIGGER operating_authorities_bump_version
  BEFORE UPDATE ON operating_authorities
  FOR EACH ROW EXECUTE FUNCTION app.bump_version();

-- ---------------------------------------------------------------------------
-- carrier_appointments.
--
-- packages/context/src/legal.ts:121-123 requires a carrierAppointmentId for carrier_agent and has
-- had nothing behind it: the string was asserted, never proved. This is the table that makes it
-- provable.
--
-- carrier_reference is deliberately an opaque text reference, NOT a foreign key. carrier_profiles
-- is PR 4, and PR 2 may not create it. PR 4 adds the referential constraint.
-- ---------------------------------------------------------------------------

CREATE TABLE carrier_appointments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  organization_node_id   uuid NOT NULL,
  legal_entity_id        uuid NOT NULL,

  operating_authority_id uuid NOT NULL,
  carrier_reference      text NOT NULL CHECK (length(btrim(carrier_reference)) > 0),
  -- Evidence of the written appointment. A reference to a document, never the document.
  appointment_document_reference text NOT NULL
    CHECK (length(btrim(appointment_document_reference)) > 0),
  status                 app.identity_status NOT NULL DEFAULT 'pending',
  effective_from         timestamptz NOT NULL DEFAULT now(),
  effective_to           timestamptz,
  revoked_at             timestamptz,
  revoked_by             text,

  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             text NOT NULL CHECK (length(btrim(created_by)) > 0),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             text NOT NULL CHECK (length(btrim(updated_by)) > 0),
  record_version         bigint NOT NULL DEFAULT 1,

  CONSTRAINT carrier_appointments_status_shape
    CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
  CONSTRAINT carrier_appointments_effective_window
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT carrier_appointments_revocation_consistency
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT carrier_appointments_revoked_status
    CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),

  CONSTRAINT carrier_appointments_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT carrier_appointments_node_fk
    FOREIGN KEY (tenant_id, organization_node_id) REFERENCES organization_nodes (tenant_id, id),
  CONSTRAINT carrier_appointments_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities (tenant_id, id),
  CONSTRAINT carrier_appointments_authority_fk
    FOREIGN KEY (tenant_id, operating_authority_id)
    REFERENCES operating_authorities (tenant_id, id)
);

COMMENT ON TABLE carrier_appointments IS
  'Written appointment evidence backing carrier_agent authority. carrier_reference is opaque in '
  'PR 2; PR 4 creates carrier_profiles and adds the foreign key.';

CREATE UNIQUE INDEX carrier_appointments_one_active_per_carrier
  ON carrier_appointments (tenant_id, legal_entity_id, carrier_reference)
  WHERE status = 'active';

CREATE FUNCTION app.carrier_appointment_before_write() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_class app.legal_authority_class;
  v_context app.operating_context;
  v_authority_legal_entity uuid;
BEGIN
  SELECT legal_authority_class, operating_context, legal_entity_id
    INTO v_class, v_context, v_authority_legal_entity
    FROM operating_authorities
   WHERE tenant_id = NEW.tenant_id AND id = NEW.operating_authority_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'operating authority % does not exist in tenant %',
      NEW.operating_authority_id, NEW.tenant_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_class <> 'carrier_agent' OR v_context <> 'carrier' THEN
    RAISE EXCEPTION
      'a carrier appointment requires a carrier_agent/carrier operating authority, not %/%',
      v_class, v_context
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  -- ADR-0021 category-4 style parent agreement: where the parents disagree the write is rejected,
  -- not silently resolved in favour of either side.
  IF v_authority_legal_entity <> NEW.legal_entity_id THEN
    RAISE EXCEPTION
      'carrier appointment legal entity % disagrees with its operating authority legal entity %',
      NEW.legal_entity_id, v_authority_legal_entity
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER carrier_appointments_before_write
  BEFORE INSERT OR UPDATE ON carrier_appointments
  FOR EACH ROW EXECUTE FUNCTION app.carrier_appointment_before_write();
CREATE TRIGGER carrier_appointments_assert_governing_legal_entity
  BEFORE INSERT OR UPDATE ON carrier_appointments
  FOR EACH ROW EXECUTE FUNCTION app.assert_governing_legal_entity();
CREATE TRIGGER carrier_appointments_set_updated_at
  BEFORE UPDATE ON carrier_appointments
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER carrier_appointments_set_created_row_actor
  BEFORE INSERT ON carrier_appointments
  FOR EACH ROW EXECUTE FUNCTION app.set_created_row_actor();
CREATE TRIGGER carrier_appointments_set_updated_by
  BEFORE UPDATE ON carrier_appointments
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_by();
CREATE TRIGGER carrier_appointments_bump_version
  BEFORE UPDATE ON carrier_appointments
  FOR EACH ROW EXECUTE FUNCTION app.bump_version();

CREATE FUNCTION app.has_active_carrier_appointment(
  p_tenant_id uuid,
  p_legal_entity_id uuid,
  p_carrier_reference text,
  p_as_of timestamptz
) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM carrier_appointments
     WHERE tenant_id = p_tenant_id
       AND legal_entity_id = p_legal_entity_id
       AND carrier_reference = p_carrier_reference
       AND status = 'active'
       AND revoked_at IS NULL
       AND effective_from <= p_as_of
       AND (effective_to IS NULL OR effective_to > p_as_of)
  )
$$;
COMMENT ON FUNCTION app.has_active_carrier_appointment IS
  'Explicit as-of, never an implicit now() — P-20: an implicit default makes an effective-dated '
  'read irreproducible.';

-- ---------------------------------------------------------------------------
-- Scope predicates shared by every Phase 1 policy.
--
-- Both fail closed on absence: current_*_id() is NULL when unset, and every comparison against
-- NULL is NULL, never true. Neither is disjunctive with the tenant predicate — ADR-0019 property
-- 2, operating context never widens permission.
--
-- The `system` branch is not a loophole: software_only/system is the tenant-administration pair
-- ADR-0019's matrix gives R/W over identity and organization, and it is still confined to the
-- caller's own tenant by the tenant predicate it is ANDed with.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.legal_entity_scope_ok(p_legal_entity_id uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT app.is_control_plane()
      OR app.current_operating_context() = 'system'
      OR (app.current_legal_entity_id() IS NOT NULL
          AND p_legal_entity_id = app.current_legal_entity_id())
$$;
COMMENT ON FUNCTION app.legal_entity_scope_ok IS
  'Fails closed when legal-entity context is required but absent. ADR-0015 rule 4 permits '
  'omitting the legal entity only under system scope, so system scope is the only branch that '
  'does not require one.';

CREATE FUNCTION app.organization_node_scope_ok(p_organization_node_id uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT app.is_control_plane()
      OR app.current_operating_context() = 'system'
      OR (app.current_organization_node_id() IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM organization_node_closure c
             WHERE c.tenant_id = app.current_tenant_id()
               AND c.ancestor_id = app.current_organization_node_id()
               AND c.descendant_id = p_organization_node_id))
$$;
COMMENT ON FUNCTION app.organization_node_scope_ok IS
  'At or below a node the caller administers — plan §9.2. Fails closed when organization-node '
  'context is required but absent.';

-- ---------------------------------------------------------------------------
-- Row-level security.
-- ---------------------------------------------------------------------------

ALTER TABLE organization_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_nodes FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_nodes_read ON organization_nodes FOR SELECT
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY organization_nodes_insert ON organization_nodes FOR INSERT
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY organization_nodes_update ON organization_nodes FOR UPDATE
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());
-- No DELETE policy. Nodes are archived, never deleted, so the history of what was scoped where
-- survives. The REVOKE below makes the attempt an error rather than a silent no-op.
GRANT SELECT, INSERT, UPDATE ON organization_nodes TO freightos_app;
REVOKE DELETE, TRUNCATE ON organization_nodes FROM freightos_app;

ALTER TABLE organization_node_closure ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_node_closure FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_node_closure_read ON organization_node_closure FOR SELECT
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY organization_node_closure_insert ON organization_node_closure FOR INSERT
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY organization_node_closure_update ON organization_node_closure FOR UPDATE
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());
-- Derived rows are removed by the move trigger, which runs as the invoking session, so DELETE has
-- a policy here where the other tables have none.
CREATE POLICY organization_node_closure_delete ON organization_node_closure FOR DELETE
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON organization_node_closure TO freightos_app;
REVOKE TRUNCATE ON organization_node_closure FROM freightos_app;

ALTER TABLE legal_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_entities FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_entities_read ON legal_entities FOR SELECT
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY legal_entities_insert ON legal_entities FOR INSERT
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.organization_node_scope_ok(organization_node_id));
CREATE POLICY legal_entities_update ON legal_entities FOR UPDATE
  USING (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(id))
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(id)
    AND app.organization_node_scope_ok(organization_node_id));
GRANT SELECT, INSERT, UPDATE ON legal_entities TO freightos_app;
REVOKE DELETE, TRUNCATE ON legal_entities FROM freightos_app;

ALTER TABLE operating_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE operating_authorities FORCE ROW LEVEL SECURITY;
CREATE POLICY operating_authorities_read ON operating_authorities FOR SELECT
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY operating_authorities_insert ON operating_authorities FOR INSERT
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(legal_entity_id)
    AND app.organization_node_scope_ok(organization_node_id));
CREATE POLICY operating_authorities_update ON operating_authorities FOR UPDATE
  USING (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(legal_entity_id))
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(legal_entity_id)
    AND app.organization_node_scope_ok(organization_node_id));
GRANT SELECT, INSERT, UPDATE ON operating_authorities TO freightos_app;
REVOKE DELETE, TRUNCATE ON operating_authorities FROM freightos_app;

ALTER TABLE carrier_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_appointments FORCE ROW LEVEL SECURITY;
CREATE POLICY carrier_appointments_read ON carrier_appointments FOR SELECT
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY carrier_appointments_insert ON carrier_appointments FOR INSERT
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(legal_entity_id)
    AND app.organization_node_scope_ok(organization_node_id));
CREATE POLICY carrier_appointments_update ON carrier_appointments FOR UPDATE
  USING (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(legal_entity_id))
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(legal_entity_id)
    AND app.organization_node_scope_ok(organization_node_id));
GRANT SELECT, INSERT, UPDATE ON carrier_appointments TO freightos_app;
REVOKE DELETE, TRUNCATE ON carrier_appointments FROM freightos_app;
