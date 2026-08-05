-- 0008 — Permission catalog, tenant roles, and role-permission assignment.
--
-- OQ-16 records that no canonical action vocabulary exists: config/agents/registry.yaml uses ~27
-- action strings that do not appear in config/policy/base_policy.yaml, and two collide under
-- different names. Resolving that collision is a Phase 2 policy-engine deliverable. PR 2 defines
-- ONLY the Phase 1 subset — the actions PR 2's own tables support — and says so in the seed
-- comment rather than implying a complete registry exists.

-- ---------------------------------------------------------------------------
-- permissions — global catalog.
--
-- ADR-0021 registered exception, category 2 (global reference data): organization_node_id and
-- legal_entity_id are NULL because the catalog is not tenant-owned and is not scoped to a node or
-- an entity. tenant_id is NOT NULL regardless — the contract has no exception for it — and holds
-- the designated system tenant, which packages/context/src/legal.ts:38 already defines and
-- schemas/event-envelope.schema.json already references.
--
-- No foreign key to `tenants`: Phase 0 established that tenant_id is the RLS discriminator rather
-- than a referential one (audit_events, outbox_events and kill_switches all carry it unreferenced),
-- and a foreign key here would require seeding a system tenant row that no tenant should see.
-- ---------------------------------------------------------------------------

CREATE TABLE permissions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  organization_node_id   uuid,
  legal_entity_id        uuid,

  key                    text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  resource               text NOT NULL CHECK (length(btrim(resource)) > 0),
  action                 text NOT NULL CHECK (action IN ('read', 'write', 'engage', 'release')),
  description            text NOT NULL CHECK (length(btrim(description)) > 0),

  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             text NOT NULL CHECK (length(btrim(created_by)) > 0),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             text NOT NULL CHECK (length(btrim(updated_by)) > 0),
  record_version         bigint NOT NULL DEFAULT 1,

  CONSTRAINT permissions_system_tenant
    CHECK (tenant_id = '00000000-0000-0000-0000-000000000000'::uuid),
  -- The exception is registered, so it is also enforced: these columns are not merely allowed to
  -- be NULL here, they are required to be. That keeps a later migration from quietly turning the
  -- catalog into a tenant-scoped table without amending ADR-0021.
  CONSTRAINT permissions_global_reference_data
    CHECK (organization_node_id IS NULL AND legal_entity_id IS NULL),
  CONSTRAINT permissions_key_unique UNIQUE (key)
);

COMMENT ON TABLE permissions IS
  'Global permission catalog. ADR-0021 registered exception, category 2. ADR-0020: this is one of '
  'only two justified control-plane grants in PR 2 — every tenant reads it, only the control '
  'plane writes it.';

CREATE TRIGGER permissions_set_updated_at
  BEFORE UPDATE ON permissions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER permissions_set_created_row_actor
  BEFORE INSERT ON permissions
  FOR EACH ROW EXECUTE FUNCTION app.set_created_row_actor();
CREATE TRIGGER permissions_set_updated_by
  BEFORE UPDATE ON permissions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_by();
CREATE TRIGGER permissions_bump_version
  BEFORE UPDATE ON permissions
  FOR EACH ROW EXECUTE FUNCTION app.bump_version();

-- ---------------------------------------------------------------------------
-- The Phase 1 permission vocabulary.
--
-- Exactly the actions PR 2's tables support, and nothing forward-looking. A permission naming a
-- resource that does not exist would be a placeholder implying a capability that has not been
-- built, which 21_SEQUENCING_DOCTRINE forbids. Phase 2 extends this set — OQ-16.
--
-- SEEDED BEFORE RLS IS ENABLED — F-04.
--
-- `FORCE ROW LEVEL SECURITY` binds the table owner too, and the migrator owns this table. The
-- write policy is `app.is_control_plane()`, which a migration connection is not and must not be.
-- Seeding after FORCE therefore only ever succeeded because the migration ran as a superuser,
-- which bypasses RLS entirely — so superuser success was hiding a migration that could not run
-- under the documented `freightos_migrator` authority.
--
-- Seeding first is the fix rather than granting the migrator a policy exemption: reference data
-- belongs to the schema, and a policy that admits the migrator at runtime would widen the write
-- surface permanently to remove a one-time ordering problem.
-- ---------------------------------------------------------------------------

INSERT INTO permissions (tenant_id, key, resource, action, description, created_by)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'identity.organization_node.read',
   'organization_node', 'read', 'Read organization nodes and their hierarchy.', 'migration:0008'),
  ('00000000-0000-0000-0000-000000000000', 'identity.organization_node.write',
   'organization_node', 'write', 'Create, move, or archive organization nodes.', 'migration:0008'),
  ('00000000-0000-0000-0000-000000000000', 'identity.legal_entity.read',
   'legal_entity', 'read', 'Read legal entities.', 'migration:0008'),
  ('00000000-0000-0000-0000-000000000000', 'identity.legal_entity.write',
   'legal_entity', 'write', 'Create or amend legal entities.', 'migration:0008'),
  ('00000000-0000-0000-0000-000000000000', 'identity.operating_authority.read',
   'operating_authority', 'read', 'Read operating authorities.', 'migration:0008'),
  ('00000000-0000-0000-0000-000000000000', 'identity.operating_authority.write',
   'operating_authority', 'write', 'Create, amend, or revoke operating authorities.',
   'migration:0008'),
  ('00000000-0000-0000-0000-000000000000', 'identity.carrier_appointment.read',
   'carrier_appointment', 'read', 'Read carrier appointment evidence.', 'migration:0008'),
  ('00000000-0000-0000-0000-000000000000', 'identity.carrier_appointment.write',
   'carrier_appointment', 'write', 'Record or revoke a carrier appointment.', 'migration:0008'),
  ('00000000-0000-0000-0000-000000000000', 'identity.user.read',
   'user', 'read', 'Read users.', 'migration:0008'),
  ('00000000-0000-0000-0000-000000000000', 'identity.user.write',
   'user', 'write', 'Create, amend, suspend, or revoke users.', 'migration:0008'),
  ('00000000-0000-0000-0000-000000000000', 'identity.membership.read',
   'membership', 'read', 'Read memberships and their role assignments.', 'migration:0008'),
  ('00000000-0000-0000-0000-000000000000', 'identity.membership.write',
   'membership', 'write', 'Grant or revoke memberships and membership roles.', 'migration:0008'),
  ('00000000-0000-0000-0000-000000000000', 'identity.role.read',
   'role', 'read', 'Read roles and their permissions.', 'migration:0008'),
  ('00000000-0000-0000-0000-000000000000', 'identity.role.write',
   'role', 'write', 'Create or amend roles and their permission assignments.', 'migration:0008'),
  ('00000000-0000-0000-0000-000000000000', 'identity.service_account.read',
   'service_account', 'read', 'Read service accounts and credential references.', 'migration:0008'),
  ('00000000-0000-0000-0000-000000000000', 'identity.service_account.write',
   'service_account', 'write', 'Create, rotate, or revoke service accounts.', 'migration:0008'),
  ('00000000-0000-0000-0000-000000000000', 'identity.policy_binding.read',
   'policy_binding', 'read', 'Read organization-node policy bindings.', 'migration:0008'),
  ('00000000-0000-0000-0000-000000000000', 'identity.policy_binding.write',
   'policy_binding', 'write', 'Bind or override a policy control on a node.', 'migration:0008'),
  ('00000000-0000-0000-0000-000000000000', 'governance.kill_switch.read',
   'kill_switch', 'read', 'Read kill switches in force.', 'migration:0008'),
  ('00000000-0000-0000-0000-000000000000', 'governance.kill_switch.engage',
   'kill_switch', 'engage', 'Engage a kill switch. Constitution Art. V.1 reserves this to humans.',
   'migration:0008'),
  ('00000000-0000-0000-0000-000000000000', 'governance.kill_switch.release',
   'kill_switch', 'release',
   'Release a kill switch. Constitution Art. V.1 reserves this to humans.', 'migration:0008'),
  ('00000000-0000-0000-0000-000000000000', 'governance.audit.read',
   'audit_event', 'read', 'Read the tenant''s own audit ledger.', 'migration:0008');

-- Enforcement is established immediately after the seed and before any other statement, so the
-- window in which the table is unprotected does not outlive this migration.
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;

-- Read is unconditional because the catalog is a vocabulary, not tenant data: a tenant cannot
-- learn anything about another tenant from it. Write is control-plane only, which is what keeps a
-- tenant from inventing a permission and then granting it to itself.
CREATE POLICY permissions_read ON permissions FOR SELECT
  USING (true);
CREATE POLICY permissions_insert ON permissions FOR INSERT
  WITH CHECK (app.is_control_plane());
CREATE POLICY permissions_update ON permissions FOR UPDATE
  USING (app.is_control_plane())
  WITH CHECK (app.is_control_plane());

GRANT SELECT ON permissions TO freightos_app;
GRANT SELECT, INSERT, UPDATE ON permissions TO freightos_control_plane;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON permissions FROM freightos_app;
REVOKE DELETE, TRUNCATE ON permissions FROM freightos_control_plane;

-- ---------------------------------------------------------------------------
-- roles — tenant-owned.
-- ---------------------------------------------------------------------------

CREATE TABLE roles (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  organization_node_id   uuid NOT NULL,
  legal_entity_id        uuid NOT NULL,

  key                    text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  name                   text NOT NULL CHECK (length(btrim(name)) > 0),
  description            text NOT NULL DEFAULT '',
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

  CONSTRAINT roles_status_shape
    CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
  CONSTRAINT roles_effective_window
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT roles_revocation_consistency
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT roles_revoked_status
    CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),

  CONSTRAINT roles_key_unique UNIQUE (tenant_id, key),
  CONSTRAINT roles_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT roles_node_fk
    FOREIGN KEY (tenant_id, organization_node_id) REFERENCES organization_nodes (tenant_id, id),
  CONSTRAINT roles_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities (tenant_id, id)
);

COMMENT ON TABLE roles IS
  'Named permission grouping scoped to an organization node. Roles are revoked, never deleted, so '
  'a past authorization stays reconstructable from the ledger.';

CREATE TRIGGER roles_assert_governing_legal_entity
  BEFORE INSERT OR UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION app.assert_governing_legal_entity();
CREATE TRIGGER roles_set_updated_at
  BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER roles_set_created_row_actor
  BEFORE INSERT ON roles FOR EACH ROW EXECUTE FUNCTION app.set_created_row_actor();
CREATE TRIGGER roles_set_updated_by
  BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION app.set_updated_by();
CREATE TRIGGER roles_bump_version
  BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION app.bump_version();

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
CREATE POLICY roles_read ON roles FOR SELECT
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY roles_insert ON roles FOR INSERT
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(legal_entity_id)
    AND app.organization_node_scope_ok(organization_node_id));
CREATE POLICY roles_update ON roles FOR UPDATE
  USING (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(legal_entity_id))
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(legal_entity_id)
    AND app.organization_node_scope_ok(organization_node_id));
GRANT SELECT, INSERT, UPDATE ON roles TO freightos_app;
REVOKE DELETE, TRUNCATE ON roles FROM freightos_app;

-- ---------------------------------------------------------------------------
-- role_permissions.
--
-- ADR-0021 registered exception, category 4. Tenant, organization node and legal entity are all
-- inherited from `roles`; `permissions` is global. The composite foreign key on
-- (tenant_id, role_id) is the enforcement, and it is what makes a cross-tenant grant
-- unrepresentable rather than merely rejected by a policy.
-- ---------------------------------------------------------------------------

CREATE TABLE role_permissions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  role_id                uuid NOT NULL,
  permission_id          uuid NOT NULL REFERENCES permissions (id),

  effective_from         timestamptz NOT NULL DEFAULT now(),
  effective_to           timestamptz,
  revoked_at             timestamptz,
  revoked_by             text,

  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             text NOT NULL CHECK (length(btrim(created_by)) > 0),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             text NOT NULL CHECK (length(btrim(updated_by)) > 0),
  record_version         bigint NOT NULL DEFAULT 1,

  CONSTRAINT role_permissions_effective_window
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT role_permissions_revocation_consistency
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT role_permissions_role_fk
    FOREIGN KEY (tenant_id, role_id) REFERENCES roles (tenant_id, id)
);

COMMENT ON TABLE role_permissions IS
  'ADR-0021 registered exception, category 4. Revocation is recorded, never deleted.';

CREATE UNIQUE INDEX role_permissions_one_active_per_pair
  ON role_permissions (tenant_id, role_id, permission_id)
  WHERE revoked_at IS NULL;

CREATE TRIGGER role_permissions_set_updated_at
  BEFORE UPDATE ON role_permissions FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER role_permissions_set_created_row_actor
  BEFORE INSERT ON role_permissions FOR EACH ROW EXECUTE FUNCTION app.set_created_row_actor();
CREATE TRIGGER role_permissions_set_updated_by
  BEFORE UPDATE ON role_permissions FOR EACH ROW EXECUTE FUNCTION app.set_updated_by();
CREATE TRIGGER role_permissions_bump_version
  BEFORE UPDATE ON role_permissions FOR EACH ROW EXECUTE FUNCTION app.bump_version();

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY role_permissions_read ON role_permissions FOR SELECT
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY role_permissions_insert ON role_permissions FOR INSERT
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY role_permissions_update ON role_permissions FOR UPDATE
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());
GRANT SELECT, INSERT, UPDATE ON role_permissions TO freightos_app;
REVOKE DELETE, TRUNCATE ON role_permissions FROM freightos_app;
