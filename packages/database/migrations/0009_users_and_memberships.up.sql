-- 0009 — Users, memberships, and membership-role assignment.
--
-- PR 2 models identity, not authentication. There is no password, no session, no token and no
-- login flow here: `13_IMPLEMENTATION_ROADMAP` puts authentication in the application layer, and
-- the plan's PR 2 entry excludes "authentication or session management — that is an application
-- concern, not a Phase 1 domain concern".
--
-- What PR 2 does own is the AUTHENTICATION-SUBJECT REFERENCE: the opaque identifier an external
-- identity provider issues for a person. It is a reference, never a credential
-- (DATA_CLASSIFICATION class SECRET, 02_...:58).

CREATE TABLE users (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  organization_node_id   uuid NOT NULL,
  legal_entity_id        uuid NOT NULL,

  -- Provider-qualified so two identity providers cannot collide on a bare subject string.
  authentication_provider text NOT NULL CHECK (length(btrim(authentication_provider)) > 0),
  authentication_subject  text NOT NULL CHECK (length(btrim(authentication_subject)) > 0),
  display_name           text NOT NULL CHECK (length(btrim(display_name)) > 0),

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

  CONSTRAINT users_status_shape
    CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
  CONSTRAINT users_effective_window
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT users_revocation_consistency
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT users_revoked_status
    CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),
  -- A credential must never be stored here. The subject is an identifier issued by the provider;
  -- anything shaped like a bearer token, key or PEM block is refused at the storage layer rather
  -- than relying on reviewers to notice.
  CONSTRAINT users_subject_is_not_a_credential
    CHECK (authentication_subject !~* '(bearer |-----begin |^sk_|^pk_|^ghp_|^xox[abps]-)'),

  CONSTRAINT users_subject_unique
    UNIQUE (tenant_id, authentication_provider, authentication_subject),
  CONSTRAINT users_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT users_node_fk
    FOREIGN KEY (tenant_id, organization_node_id) REFERENCES organization_nodes (tenant_id, id),
  CONSTRAINT users_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities (tenant_id, id)
);

COMMENT ON TABLE users IS
  'Human identities. DATA_CLASSIFICATION class PERSONAL. Carries an authentication-subject '
  'reference, never a credential.';
COMMENT ON COLUMN users.authentication_subject IS
  'Opaque subject issued by authentication_provider. A reference, not a secret.';

CREATE TRIGGER users_assert_governing_legal_entity
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION app.assert_governing_legal_entity();
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER users_set_created_row_actor
  BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION app.set_created_row_actor();
CREATE TRIGGER users_set_updated_by
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION app.set_updated_by();
CREATE TRIGGER users_bump_version
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION app.bump_version();

-- ---------------------------------------------------------------------------
-- The session's own user identity.
--
-- Needed by the self-elevation guards in 0010. The actor id is already carried on every session
-- (app.actor_id, set by packages/database/src/session.ts); this reads a user id out of it when
-- the actor is a person, and NULL otherwise. NULL is correct for a system, integration or
-- control-plane actor: none of them is a user, so none of them can self-elevate as one.
--
-- The regex is the guard. A malformed actor id yields NULL rather than an error, because a raise
-- inside a policy predicate is evaluated in contexts where the error is unhelpful.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(
    substring(coalesce(app.current_actor_id(), '')
              from '^user:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'),
    '')::uuid
$$;
COMMENT ON FUNCTION app.current_user_id IS
  'The acting user, parsed from the `user:<uuid>` actor-id convention. NULL for system, '
  'integration, agent and control-plane actors.';

-- ---------------------------------------------------------------------------
-- memberships — a user's attachment to an organization node.
--
-- Roles hang off the membership rather than being folded into it, so one attachment can carry
-- several roles and each can be revoked on its own schedule.
-- ---------------------------------------------------------------------------

CREATE TABLE memberships (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  organization_node_id   uuid NOT NULL,
  legal_entity_id        uuid NOT NULL,
  user_id                uuid NOT NULL,

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

  CONSTRAINT memberships_status_shape
    CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
  CONSTRAINT memberships_effective_window
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT memberships_revocation_consistency
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT memberships_revoked_status
    CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),

  CONSTRAINT memberships_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT memberships_user_fk
    FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id),
  CONSTRAINT memberships_node_fk
    FOREIGN KEY (tenant_id, organization_node_id) REFERENCES organization_nodes (tenant_id, id),
  CONSTRAINT memberships_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities (tenant_id, id)
);

COMMENT ON TABLE memberships IS
  'User x organization node. Revoked, never deleted.';

CREATE UNIQUE INDEX memberships_one_active_per_user_node
  ON memberships (tenant_id, user_id, organization_node_id)
  WHERE revoked_at IS NULL;

CREATE INDEX memberships_user_idx ON memberships (tenant_id, user_id, status);

CREATE TRIGGER memberships_assert_governing_legal_entity
  BEFORE INSERT OR UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION app.assert_governing_legal_entity();
CREATE TRIGGER memberships_set_updated_at
  BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER memberships_set_created_row_actor
  BEFORE INSERT ON memberships FOR EACH ROW EXECUTE FUNCTION app.set_created_row_actor();
CREATE TRIGGER memberships_set_updated_by
  BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION app.set_updated_by();
CREATE TRIGGER memberships_bump_version
  BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION app.bump_version();

-- ---------------------------------------------------------------------------
-- membership_roles.
--
-- ADR-0021 registered exception, category 4: both parents carry tenant, organization node and
-- legal entity, and the composite foreign keys prove they agree. Where they disagree the write is
-- rejected — the trigger below does not resolve it in favour of either side and does not fall
-- back to the session context.
-- ---------------------------------------------------------------------------

CREATE TABLE membership_roles (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  membership_id          uuid NOT NULL,
  role_id                uuid NOT NULL,

  effective_from         timestamptz NOT NULL DEFAULT now(),
  effective_to           timestamptz,
  revoked_at             timestamptz,
  revoked_by             text,

  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             text NOT NULL CHECK (length(btrim(created_by)) > 0),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             text NOT NULL CHECK (length(btrim(updated_by)) > 0),
  record_version         bigint NOT NULL DEFAULT 1,

  CONSTRAINT membership_roles_effective_window
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT membership_roles_revocation_consistency
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT membership_roles_membership_fk
    FOREIGN KEY (tenant_id, membership_id) REFERENCES memberships (tenant_id, id),
  CONSTRAINT membership_roles_role_fk
    FOREIGN KEY (tenant_id, role_id) REFERENCES roles (tenant_id, id)
);

COMMENT ON TABLE membership_roles IS
  'ADR-0021 registered exception, category 4. Parent agreement is proved, not assumed.';

CREATE UNIQUE INDEX membership_roles_one_active_per_pair
  ON membership_roles (tenant_id, membership_id, role_id)
  WHERE revoked_at IS NULL;

-- A role granted at a node the membership does not sit under would let an attachment low in the
-- tree pick up authority defined elsewhere in it. The role must govern the membership's node.
CREATE FUNCTION app.membership_role_before_write() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_membership_node uuid;
  v_role_node uuid;
BEGIN
  SELECT organization_node_id INTO v_membership_node
    FROM memberships WHERE tenant_id = NEW.tenant_id AND id = NEW.membership_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership % does not exist in tenant %', NEW.membership_id, NEW.tenant_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT organization_node_id INTO v_role_node
    FROM roles WHERE tenant_id = NEW.tenant_id AND id = NEW.role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'role % does not exist in tenant %', NEW.role_id, NEW.tenant_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM organization_node_closure
     WHERE tenant_id = NEW.tenant_id
       AND ancestor_id = v_role_node
       AND descendant_id = v_membership_node
  ) THEN
    RAISE EXCEPTION
      'role scoped to node % does not govern membership node %', v_role_node, v_membership_node
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER membership_roles_before_write
  BEFORE INSERT OR UPDATE ON membership_roles
  FOR EACH ROW EXECUTE FUNCTION app.membership_role_before_write();
CREATE TRIGGER membership_roles_set_updated_at
  BEFORE UPDATE ON membership_roles FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER membership_roles_set_created_row_actor
  BEFORE INSERT ON membership_roles FOR EACH ROW EXECUTE FUNCTION app.set_created_row_actor();
CREATE TRIGGER membership_roles_set_updated_by
  BEFORE UPDATE ON membership_roles FOR EACH ROW EXECUTE FUNCTION app.set_updated_by();
CREATE TRIGGER membership_roles_bump_version
  BEFORE UPDATE ON membership_roles FOR EACH ROW EXECUTE FUNCTION app.bump_version();

-- ---------------------------------------------------------------------------
-- Row-level security.
--
-- These three carry the node-visibility predicate from plan §9.2 on READ as well as on write: a
-- caller sees users, memberships and role assignments at or below the node it administers, and
-- nothing when it administers none. Missing context narrows, never broadens.
-- ---------------------------------------------------------------------------

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_read ON users FOR SELECT
  USING (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.organization_node_scope_ok(organization_node_id));
CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(legal_entity_id)
    AND app.organization_node_scope_ok(organization_node_id));
CREATE POLICY users_update ON users FOR UPDATE
  USING (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.organization_node_scope_ok(organization_node_id))
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(legal_entity_id)
    AND app.organization_node_scope_ok(organization_node_id));
GRANT SELECT, INSERT, UPDATE ON users TO freightos_app;
REVOKE DELETE, TRUNCATE ON users FROM freightos_app;

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memberships_read ON memberships FOR SELECT
  USING (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.organization_node_scope_ok(organization_node_id));
CREATE POLICY memberships_insert ON memberships FOR INSERT
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(legal_entity_id)
    AND app.organization_node_scope_ok(organization_node_id));
CREATE POLICY memberships_update ON memberships FOR UPDATE
  USING (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.organization_node_scope_ok(organization_node_id))
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(legal_entity_id)
    AND app.organization_node_scope_ok(organization_node_id));
GRANT SELECT, INSERT, UPDATE ON memberships TO freightos_app;
REVOKE DELETE, TRUNCATE ON memberships FROM freightos_app;

ALTER TABLE membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_roles_read ON membership_roles FOR SELECT
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY membership_roles_insert ON membership_roles FOR INSERT
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY membership_roles_update ON membership_roles FOR UPDATE
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());
GRANT SELECT, INSERT, UPDATE ON membership_roles TO freightos_app;
REVOKE DELETE, TRUNCATE ON membership_roles FROM freightos_app;

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

CREATE INDEX users_node_fk_idx ON users (tenant_id, organization_node_id);
CREATE INDEX users_legal_entity_fk_idx ON users (tenant_id, legal_entity_id);
CREATE INDEX memberships_node_fk_idx ON memberships (tenant_id, organization_node_id);
CREATE INDEX memberships_legal_entity_fk_idx ON memberships (tenant_id, legal_entity_id);
CREATE INDEX membership_roles_role_fk_idx ON membership_roles (tenant_id, role_id);
