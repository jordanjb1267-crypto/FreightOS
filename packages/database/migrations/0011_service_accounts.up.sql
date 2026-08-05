-- 0011 — Service accounts, credential references, and service-account permissions.
--
-- 02_...:58 and DATA_CLASSIFICATION class SECRET both prohibit storing a credential here. This
-- schema has no column a secret could go in: a credential is represented by an opaque external
-- reference, or by an algorithm-prefixed digest, or by a provider-issued subject. The CHECK
-- constraints below enforce that shape rather than trusting a reviewer to spot a pasted token.
--
-- Service accounts are always non-human actors. Specification 1 fixes audit_events.actor_type for
-- them at `integration` or `system`, and actor_type is stored on the account so the audit record
-- cannot claim otherwise.

CREATE TABLE service_accounts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  organization_node_id   uuid NOT NULL,
  legal_entity_id        uuid NOT NULL,

  key                    text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  name                   text NOT NULL CHECK (length(btrim(name)) > 0),
  description            text NOT NULL DEFAULT '',
  actor_type             text NOT NULL CHECK (actor_type IN ('system', 'integration')),

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

  CONSTRAINT service_accounts_status_shape
    CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
  CONSTRAINT service_accounts_effective_window
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT service_accounts_revocation_consistency
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT service_accounts_revoked_status
    CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),

  CONSTRAINT service_accounts_key_unique UNIQUE (tenant_id, key),
  CONSTRAINT service_accounts_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT service_accounts_node_fk
    FOREIGN KEY (tenant_id, organization_node_id) REFERENCES organization_nodes (tenant_id, id),
  CONSTRAINT service_accounts_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES legal_entities (tenant_id, id)
);

COMMENT ON TABLE service_accounts IS
  'Non-human actors. Bound to one tenant, one organization node and one legal entity, and unable '
  'to act outside them — the RLS predicate and service_account_permissions are the whole of what '
  'a service account may do.';

CREATE TRIGGER service_accounts_assert_governing_legal_entity
  BEFORE INSERT OR UPDATE ON service_accounts
  FOR EACH ROW EXECUTE FUNCTION app.assert_governing_legal_entity();
CREATE TRIGGER service_accounts_set_updated_at
  BEFORE UPDATE ON service_accounts FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER service_accounts_set_created_row_actor
  BEFORE INSERT ON service_accounts FOR EACH ROW EXECUTE FUNCTION app.set_created_row_actor();
CREATE TRIGGER service_accounts_set_updated_by
  BEFORE UPDATE ON service_accounts FOR EACH ROW EXECUTE FUNCTION app.set_updated_by();
CREATE TRIGGER service_accounts_bump_version
  BEFORE UPDATE ON service_accounts FOR EACH ROW EXECUTE FUNCTION app.bump_version();

-- ---------------------------------------------------------------------------
-- service_account_credentials.
--
-- ADR-0021 registered exception, category 4: tenant, organization node and legal entity are
-- inherited from the single parent account and enforced by the composite foreign key.
--
-- Rotation is why this is a table rather than a column: a new credential is a new row, the old one
-- is revoked, and both are visible at once during the overlap.
-- ---------------------------------------------------------------------------

CREATE TABLE service_account_credentials (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  service_account_id     uuid NOT NULL,

  credential_type        text NOT NULL
    CHECK (credential_type IN ('provider_subject', 'hash_reference', 'external_secret_reference')),
  -- A locator, never the thing located. Required to be a URI so a bare secret cannot be pasted in.
  credential_reference   text NOT NULL,
  -- Algorithm-prefixed lowercase hex, e.g. sha256:<64 hex>. A raw secret cannot satisfy this.
  credential_hash        text,
  -- Short non-secret identifier for operational correlation.
  fingerprint            text,

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

  -- An ALLOWLIST of schemes, not merely a URI shape — F-10.
  --
  -- The shape check alone accepted any scheme at all, so it let through the values it exists to
  -- refuse: `data:;base64,...` is a URI, `basic:dXNlcjpwYXNzd29yZA==` is a URI, and
  -- `postgres://user:hunter2@db` is a URI carrying a live password. The marker check below caught
  -- none of those, because a denylist only catches the shapes somebody thought to name.
  --
  -- Every scheme here locates a secret held somewhere else, which is the whole property this
  -- column exists to have. A scheme that can carry the secret inline is not on the list, and adding
  -- one has to be a deliberate schema change with a reviewer.
  -- The allowlist is per credential type, because the three types reference different things: a
  -- secret store, an identity provider, and a digest. One combined list would let an
  -- external_secret_reference name an OIDC subject and vice versa, which is exactly the confusion
  -- the type column exists to prevent.
  CONSTRAINT service_account_credentials_reference_scheme
    CHECK (
      CASE credential_type
        WHEN 'external_secret_reference' THEN
          credential_reference ~
            '^(vault|secretsmanager|gcpsecretmanager|azurekeyvault|k8ssecret|env):[^[:space:]]+$'
        WHEN 'provider_subject' THEN
          credential_reference ~ '^(oidc|saml|oauth2|ldap):[^[:space:]]+$'
        WHEN 'hash_reference' THEN
          credential_reference ~ '^hash:[^[:space:]]+$'
      END
    ),

  -- No userinfo, ever. `scheme://user:secret@host/path` is the oldest way to smuggle a credential
  -- into something that looks like a location, and it passes any scheme allowlist by construction.
  CONSTRAINT service_account_credentials_reference_has_no_userinfo
    CHECK (credential_reference !~ '^[a-z][a-z0-9+.-]*://[^/@[:space:]]*@'),

  -- Belt as well as braces: even an allowed scheme must not carry a recognisable secret.
  CONSTRAINT service_account_credentials_reference_is_not_a_secret
    CHECK (credential_reference !~* '(bearer |-----begin |sk_live|pk_live|ghp_|xox[abps]-)'),
  CONSTRAINT service_account_credentials_hash_shape
    CHECK (credential_hash IS NULL OR credential_hash ~ '^[a-z0-9-]+:[0-9a-f]{32,128}$'),
  -- Only the hash_reference type carries a digest; the other two would have nothing to digest.
  CONSTRAINT service_account_credentials_hash_matches_type
    CHECK ((credential_type = 'hash_reference') = (credential_hash IS NOT NULL)),
  CONSTRAINT service_account_credentials_fingerprint_shape
    CHECK (fingerprint IS NULL OR fingerprint ~ '^[0-9a-f]{8,64}$'),

  CONSTRAINT service_account_credentials_status_shape
    CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
  CONSTRAINT service_account_credentials_effective_window
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT service_account_credentials_revocation_consistency
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT service_account_credentials_revoked_status
    CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),

  CONSTRAINT service_account_credentials_account_fk
    FOREIGN KEY (tenant_id, service_account_id) REFERENCES service_accounts (tenant_id, id)
);

COMMENT ON TABLE service_account_credentials IS
  'Credential REFERENCES only. The scheme allowlist admits only URI schemes that LOCATE a secret '
  'held elsewhere, so a value able to carry one inline is unrepresentable rather than merely '
  'discouraged — F-10.';

CREATE UNIQUE INDEX service_account_credentials_reference_unique
  ON service_account_credentials (tenant_id, credential_reference)
  WHERE revoked_at IS NULL;

CREATE TRIGGER service_account_credentials_set_updated_at
  BEFORE UPDATE ON service_account_credentials
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER service_account_credentials_set_created_row_actor
  BEFORE INSERT ON service_account_credentials
  FOR EACH ROW EXECUTE FUNCTION app.set_created_row_actor();
CREATE TRIGGER service_account_credentials_set_updated_by
  BEFORE UPDATE ON service_account_credentials
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_by();
CREATE TRIGGER service_account_credentials_bump_version
  BEFORE UPDATE ON service_account_credentials
  FOR EACH ROW EXECUTE FUNCTION app.bump_version();

-- ---------------------------------------------------------------------------
-- service_account_permissions.
--
-- ADR-0021 registered exception, category 4. A service account is granted permissions directly
-- rather than through roles: roles carry human organizational meaning, and giving a machine actor
-- a human role is how a machine quietly acquires everything that role accumulates later.
-- ---------------------------------------------------------------------------

CREATE TABLE service_account_permissions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  service_account_id     uuid NOT NULL,
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

  CONSTRAINT service_account_permissions_effective_window
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT service_account_permissions_revocation_consistency
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT service_account_permissions_account_fk
    FOREIGN KEY (tenant_id, service_account_id) REFERENCES service_accounts (tenant_id, id)
);

COMMENT ON TABLE service_account_permissions IS
  'ADR-0021 registered exception, category 4. Direct grants, never role membership.';

CREATE UNIQUE INDEX service_account_permissions_one_active_per_pair
  ON service_account_permissions (tenant_id, service_account_id, permission_id)
  WHERE revoked_at IS NULL;

CREATE TRIGGER service_account_permissions_set_updated_at
  BEFORE UPDATE ON service_account_permissions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER service_account_permissions_set_created_row_actor
  BEFORE INSERT ON service_account_permissions
  FOR EACH ROW EXECUTE FUNCTION app.set_created_row_actor();
CREATE TRIGGER service_account_permissions_set_updated_by
  BEFORE UPDATE ON service_account_permissions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_by();
CREATE TRIGGER service_account_permissions_bump_version
  BEFORE UPDATE ON service_account_permissions
  FOR EACH ROW EXECUTE FUNCTION app.bump_version();

-- ---------------------------------------------------------------------------
-- Effective service-account authorization.
--
-- The account, the credential and the grant must all be live at the same instant. Revoking the
-- credential ends the authorization even though the grant survives — which is what makes rotation
-- and emergency revocation two different, independently usable controls.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.service_account_has_permission(
  p_tenant_id uuid,
  p_service_account_id uuid,
  p_permission_key text,
  p_as_of timestamptz
) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM service_accounts sa
      JOIN service_account_permissions sap
        ON sap.tenant_id = sa.tenant_id AND sap.service_account_id = sa.id
      JOIN permissions p ON p.id = sap.permission_id
     WHERE sa.tenant_id = p_tenant_id
       AND sa.id = p_service_account_id
       AND p.key = p_permission_key

       AND sa.status = 'active' AND sa.revoked_at IS NULL
       AND sa.effective_from <= p_as_of
       AND (sa.effective_to IS NULL OR sa.effective_to > p_as_of)

       AND sap.revoked_at IS NULL
       AND sap.effective_from <= p_as_of
       AND (sap.effective_to IS NULL OR sap.effective_to > p_as_of)

       AND EXISTS (
         SELECT 1 FROM service_account_credentials sac
          WHERE sac.tenant_id = sa.tenant_id
            AND sac.service_account_id = sa.id
            AND sac.status = 'active' AND sac.revoked_at IS NULL
            AND sac.effective_from <= p_as_of
            AND (sac.effective_to IS NULL OR sac.effective_to > p_as_of)
       )
  )
$$;
COMMENT ON FUNCTION app.service_account_has_permission IS
  'A service account with no live credential authorizes nothing, even where the permission grant '
  'itself is still open.';

-- ---------------------------------------------------------------------------
-- Row-level security.
-- ---------------------------------------------------------------------------

ALTER TABLE service_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY service_accounts_read ON service_accounts FOR SELECT
  USING (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.organization_node_scope_ok(organization_node_id));
CREATE POLICY service_accounts_insert ON service_accounts FOR INSERT
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(legal_entity_id)
    AND app.organization_node_scope_ok(organization_node_id));
CREATE POLICY service_accounts_update ON service_accounts FOR UPDATE
  USING (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.organization_node_scope_ok(organization_node_id))
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.legal_entity_scope_ok(legal_entity_id)
    AND app.organization_node_scope_ok(organization_node_id));
GRANT SELECT, INSERT, UPDATE ON service_accounts TO freightos_app;
REVOKE DELETE, TRUNCATE ON service_accounts FROM freightos_app;

ALTER TABLE service_account_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_account_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY service_account_credentials_read ON service_account_credentials FOR SELECT
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY service_account_credentials_insert ON service_account_credentials FOR INSERT
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY service_account_credentials_update ON service_account_credentials FOR UPDATE
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());
GRANT SELECT, INSERT, UPDATE ON service_account_credentials TO freightos_app;
REVOKE DELETE, TRUNCATE ON service_account_credentials FROM freightos_app;

ALTER TABLE service_account_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_account_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY service_account_permissions_read ON service_account_permissions FOR SELECT
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY service_account_permissions_insert ON service_account_permissions FOR INSERT
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY service_account_permissions_update ON service_account_permissions FOR UPDATE
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());
GRANT SELECT, INSERT, UPDATE ON service_account_permissions TO freightos_app;
REVOKE DELETE, TRUNCATE ON service_account_permissions FROM freightos_app;

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

CREATE INDEX service_accounts_node_fk_idx ON service_accounts (tenant_id, organization_node_id);
CREATE INDEX service_accounts_legal_entity_fk_idx ON service_accounts (tenant_id, legal_entity_id);
CREATE INDEX service_account_credentials_account_fk_idx ON service_account_credentials (tenant_id, service_account_id);
