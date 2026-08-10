-- N1 — Network participant registry.
--
-- The first network-kernel implementation. It introduces canonical network identity — participants,
-- their external aliases, and their descriptive relationships — as INERT IDENTITY METADATA.
--
-- THE INVARIANT THIS MIGRATION EXISTS TO UPHOLD (ADR-N0003):
--
--   CREATING, POSSESSING, EDITING, RELATING, OR ALIASING A NETWORK PARTICIPANT RECORD
--   CONFERS ZERO SECURITY AUTHORITY.
--
-- Nothing here is read by any authorization path. No policy elsewhere resolves authority from a
-- participant row, an alias, or a relationship. Authorization continues to derive from the
-- authenticated PostgreSQL principal plus the existing permission graph — `roles`, `permissions`,
-- `role_permissions`, `membership_roles`, `authn.operator_binding`, `app.session_binding`. This
-- migration references none of them, and `network participant registry` in the integration suite
-- proves that structurally as well as behaviourally.
--
-- WHY THE TENANT COLUMN IS NULLABLE — ADR-N0011, and the one deliberate departure from ADR-0021.
-- `tenant_id` is the RLS discriminator, and ADR-0021 requires it NOT NULL on tenant-owned records.
-- A network participant is not a tenant-owned operational record: external organizations that are
-- known to the network but are not FreightOS customers are the normal case. So the column means
-- "this participant is ALSO a FreightOS tenant", not "this row belongs to a tenant", and it is
-- nullable. The alternative — minting a tenant for every external counterparty — dissolves the
-- meaning of tenant and puts non-customers inside the isolation boundary.
--
-- NULL NEVER MEANS PUBLIC. That is the hazard the nullable column creates and the reason the read
-- policy below is written the way it is. `tenant_id = (SELECT app.current_tenant_id())` is already false for
-- a NULL row — SQL three-valued logic makes `NULL = anything` unknown, not true — but the predicate
-- states `tenant_id IS NOT NULL` explicitly anyway, because the failure mode is somebody later
-- "fixing" it to `IS NOT DISTINCT FROM`, which WOULD match NULL to NULL. The explicit clause makes
-- that edit visibly wrong rather than subtly wrong.

-- ---------------------------------------------------------------------------
-- §1. Governed vocabularies.
--
-- Closed enums, complete from the start. `ALTER TYPE ... ADD VALUE` cannot run inside a transaction
-- block — the constraint that shaped migration 0005 — so shipping a partial vocabulary now would
-- guarantee a non-transactional migration later for a change already known. ADR-N0005.
-- ---------------------------------------------------------------------------

CREATE TYPE app.network_participant_type AS ENUM (
  'organization', 'person', 'facility', 'device', 'workload', 'agent', 'asset'
);

CREATE TYPE app.network_participant_status AS ENUM (
  'pending', 'active', 'suspended', 'revoked'
);

CREATE TYPE app.network_alias_verification_status AS ENUM (
  'unverified', 'self_asserted', 'verified', 'suspended'
);

-- ---------------------------------------------------------------------------
-- §2. Governed reference data.
--
-- Namespaces and relationship types are REFERENCE DATA, not enums, and the reason differs per case.
--
-- Namespaces: this CLOSES the open decision ADR-N0006 left ("whether it is a database enum or a
-- reference table — the latter if partner namespaces are expected to grow routinely"). They are,
-- because the governed vocabulary includes partner-specific forms (`partner:sap`) provisioned over
-- time, and a closed enum would need a non-transactional ALTER TYPE per partner. The initial
-- membership is the eight fixed namespaces seeded below.
--
-- Relationship types: reference data keeps the governed set evolvable by review rather than by DDL.
-- It is CLOSED BY GOVERNANCE regardless — `freightos_app` gets SELECT and nothing else, so an
-- application writer cannot introduce a type, and the RLS policies below admit only the control
-- plane. Reference rows are not freely writable merely because they live in a table.
--
-- There is deliberately NO `grants_authority` / `is_delegation` / `authority_bearing` column. Every
-- N1 relationship is authority-inert, and a boolean saying so would imply the opposite is possible.
-- ---------------------------------------------------------------------------

CREATE TABLE network_alias_namespaces (
  code        text PRIMARY KEY,
  kind        text NOT NULL,
  description text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text NOT NULL DEFAULT current_user,
  CONSTRAINT network_alias_namespaces_kind_check CHECK (kind IN ('fixed', 'partner')),
  -- A partner namespace is `partner:<system>`; the bare prefix is not a namespace. Fixed
  -- namespaces are lowercase codes and may not masquerade as partner namespaces.
  CONSTRAINT network_alias_namespaces_code_shape CHECK (
    (kind = 'fixed'   AND code ~ '^[a-z][a-z0-9_]*$')
 OR (kind = 'partner' AND code ~ '^partner:[a-z0-9][a-z0-9-]*$')
  )
);

COMMENT ON TABLE network_alias_namespaces IS
  'Governed alias namespaces — ADR-N0006. Reference data, control-plane writable only. A namespace '
  'is authorization-inert: it says who issued an identifier, never what the holder may do.';

CREATE TABLE network_relationship_types (
  code                  text PRIMARY KEY,
  from_participant_type app.network_participant_type NOT NULL,
  to_participant_type   app.network_participant_type NOT NULL,
  description           text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            text NOT NULL DEFAULT current_user
);

COMMENT ON TABLE network_relationship_types IS
  'Governed relationship vocabulary. Each type declares its allowed endpoint participant types, and '
  'the endpoint trigger enforces them: a governed type is not a generic edge that happens to have '
  'two ends. Every type is descriptive only — no delegation, representation, permission '
  'inheritance, or data-access consequence. ADR-N0003 layer C remains future work.';

INSERT INTO network_alias_namespaces (code, kind, description) VALUES
  ('usdot', 'fixed', 'US DOT number issued by FMCSA'),
  ('mc',    'fixed', 'Motor carrier (MC/MX/FF) docket number issued by FMCSA'),
  ('ein',   'fixed', 'US Employer Identification Number'),
  ('scac',  'fixed', 'Standard Carrier Alpha Code issued by NMFTA'),
  ('duns',  'fixed', 'Dun & Bradstreet D-U-N-S Number'),
  ('gln',   'fixed', 'GS1 Global Location Number'),
  ('lei',   'fixed', 'Legal Entity Identifier (ISO 17442)'),
  ('iata',  'fixed', 'IATA airline or cargo agent code');

INSERT INTO network_relationship_types
  (code, from_participant_type, to_participant_type, description) VALUES
  ('operated_by',   'facility',     'organization',
   'Descriptive: this facility is operated by this organization. Confers no security authority, no '
   'delegated authority, no data ownership, no permission inheritance, no representation authority.'),
  ('subsidiary_of', 'organization', 'organization',
   'Descriptive: corporate or network affiliation between two organizations. Confers no security '
   'authority, no delegation, no permission inheritance, no automatic data access, no execution '
   'authority.');

-- ---------------------------------------------------------------------------
-- §3. Participants.
-- ---------------------------------------------------------------------------

CREATE TABLE network_participants (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_type            app.network_participant_type NOT NULL,
  status                      app.network_participant_status NOT NULL DEFAULT 'pending',
  -- Nullable BY DESIGN. See the header. FK to tenants keeps a non-existent tenant out; it conveys
  -- no authority in either direction.
  tenant_id                   uuid REFERENCES tenants (id),
  represented_organization_id uuid REFERENCES network_participants (id),
  display_name                text NOT NULL,
  -- Descriptive only. Maximum assurance confers zero authority — mutation E.
  assurance_level             text,
  valid_from                  timestamptz NOT NULL DEFAULT now(),
  valid_until                 timestamptz,
  revoked_at                  timestamptz,
  revoked_by                  text,
  source_system               text NOT NULL,
  source_reference            text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  text NOT NULL,
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  text NOT NULL,
  record_version              bigint NOT NULL DEFAULT 1,
  CONSTRAINT network_participants_validity_order CHECK (
    valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT network_participants_no_self_representation CHECK (
    represented_organization_id IS DISTINCT FROM id),
  CONSTRAINT network_participants_display_name_present CHECK (length(btrim(display_name)) > 0),
  -- Deliberately NOT an enum. The controlling documents define no assurance vocabulary, and
  -- inventing one here would make up governed values under cover of a schema change. All this
  -- constraint says is that a present value is not blank.
  CONSTRAINT network_participants_assurance_level_present CHECK (
    assurance_level IS NULL OR length(btrim(assurance_level)) > 0)
);

COMMENT ON COLUMN network_participants.tenant_id IS
  'ADR-N0011: "this participant is ALSO a FreightOS tenant", NOT "this row belongs to a tenant". '
  'NULL means external/unowned and is NEVER a grant of public visibility.';
COMMENT ON COLUMN network_participants.assurance_level IS
  'Descriptive evidence summary. Confers no authority at any value — proven by mutation E.';

CREATE TABLE network_participant_aliases (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id      uuid NOT NULL REFERENCES network_participants (id),
  namespace           text NOT NULL REFERENCES network_alias_namespaces (code),
  value               text NOT NULL,
  verification_status app.network_alias_verification_status NOT NULL DEFAULT 'unverified',
  effective_from      timestamptz NOT NULL DEFAULT now(),
  effective_to        timestamptz,
  revoked_at          timestamptz,
  revoked_by          text,
  source_system       text NOT NULL,
  source_reference    text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          text NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          text NOT NULL,
  record_version      bigint NOT NULL DEFAULT 1,
  CONSTRAINT network_participant_aliases_validity_order CHECK (
    effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT network_participant_aliases_value_present CHECK (length(btrim(value)) > 0),
  -- The same identifier may be asserted for one participant once per namespace; history is kept by
  -- effective dating rather than by additional rows with the same key.
  CONSTRAINT network_participant_aliases_unique UNIQUE (namespace, value, participant_id)
);

COMMENT ON TABLE network_participant_aliases IS
  'External identifiers annotating a canonical identity — ADR-N0006. An alias CORRELATES; it never '
  'authenticates and never authorizes. A verified alias in the most authoritative namespace grants '
  'exactly nothing — proven by mutation B.';

CREATE TABLE network_participant_relationships (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_participant_id uuid NOT NULL REFERENCES network_participants (id),
  relationship_type   text NOT NULL REFERENCES network_relationship_types (code),
  to_participant_id   uuid NOT NULL REFERENCES network_participants (id),
  effective_from      timestamptz NOT NULL DEFAULT now(),
  effective_to        timestamptz,
  revoked_at          timestamptz,
  revoked_by          text,
  source_system       text NOT NULL,
  source_reference    text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          text NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          text NOT NULL,
  record_version      bigint NOT NULL DEFAULT 1,
  CONSTRAINT network_participant_relationships_validity_order CHECK (
    effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT network_participant_relationships_no_self CHECK (
    from_participant_id <> to_participant_id)
);

COMMENT ON TABLE network_participant_relationships IS
  'Descriptive network relationships. A relationship row states that two participants are related. '
  'It grants no PostgreSQL membership, no FreightOS permission, no data access, and no ability to '
  'act for the counterparty — proven by mutation C.';

-- ---------------------------------------------------------------------------
-- §4. Immutability and provenance.
--
-- PROVENANCE IS DERIVED, NOT ACCEPTED. `created_by` and `updated_by` are overwritten from the
-- authenticated context on every write and whatever the caller supplied is discarded. This is
-- deliberately stricter than the older tables, which accept a caller-supplied `created_by`: the
-- authority/provenance spoofing class (SR-2, F-A) came from trusting a caller-named actor, and a
-- brand-new table has no back-compatibility reason to repeat it. `app.current_actor_id()` resolves
-- the verified principal and cannot be overridden by a GUC for `freightos_app`; `session_user` is
-- the fallback for the control plane and the migrator, and is set by PostgreSQL authentication.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.network_set_provenance() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor text := coalesce(app.current_actor_id(), session_user);
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := v_actor;
    NEW.updated_by := v_actor;
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.updated_by := v_actor;
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION app.network_set_provenance IS
  'Derives row provenance from the authenticated principal and discards any caller-supplied value. '
  'On UPDATE it also pins created_at/created_by, so history cannot be rewritten by an update.';

CREATE FUNCTION app.network_participant_immutable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'network participant id is immutable (ADR-N0004)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  -- The type is part of what the participant IS (ADR-N0005), and relationship endpoints were
  -- validated against it. Allowing a facility to become an organization would silently invalidate
  -- every relationship already recorded against it.
  IF NEW.participant_type <> OLD.participant_type THEN
    RAISE EXCEPTION 'network participant type is immutable; retire the participant instead'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.source_system <> OLD.source_system THEN
    RAISE EXCEPTION 'network participant source_system is immutable provenance'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION app.network_alias_immutable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id <> OLD.id
     OR NEW.participant_id <> OLD.participant_id
     OR NEW.namespace <> OLD.namespace
     OR NEW.value <> OLD.value THEN
    RAISE EXCEPTION
      'alias identity is immutable — revoke this alias and assert a new one (ADR-N0006)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION app.network_alias_immutable IS
  'Identity history is not overwritten in place. Correcting an alias means revoking it and '
  'asserting another, so "which identifier referred to which participant, when" stays answerable.';

CREATE FUNCTION app.network_relationship_immutable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id <> OLD.id
     OR NEW.from_participant_id <> OLD.from_participant_id
     OR NEW.to_participant_id <> OLD.to_participant_id
     OR NEW.relationship_type <> OLD.relationship_type THEN
    RAISE EXCEPTION 'relationship identity is immutable — revoke it and assert a new one'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;

-- The governed type declares its endpoints; a relational table that technically accepts any two
-- rows does not make a facility a valid subsidiary.
CREATE FUNCTION app.network_relationship_endpoints_ok() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_from_type app.network_participant_type;
  v_to_type   app.network_participant_type;
  v_spec      record;
BEGIN
  -- SCHEMA-QUALIFIED, and this is load-bearing rather than stylistic — migration 0027 layer 3.
  -- Both relations are RLS-enabled, so `app.protected_authority_relations()` counts them, and this
  -- function is invoker-rights with no pinned `search_path`. PostgreSQL searches `pg_temp` ahead of
  -- everything else for relations, so a bare `network_relationship_types` could be resolved to a
  -- temp table the caller created a moment earlier — which would let that caller declare any
  -- endpoint pair legal and then write the edge into the REAL table. Qualifying closes it, and
  -- `app.unqualified_authority_reads()` fails the build if it is ever unqualified again.
  SELECT from_participant_type, to_participant_type INTO v_spec
    FROM public.network_relationship_types WHERE code = NEW.relationship_type;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown relationship type %', NEW.relationship_type
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT participant_type INTO v_from_type
    FROM public.network_participants WHERE id = NEW.from_participant_id;
  SELECT participant_type INTO v_to_type
    FROM public.network_participants WHERE id = NEW.to_participant_id;

  -- Invoker rights, deliberately: this trigger sees exactly what the writer sees. A caller who
  -- cannot see an endpoint cannot relate to it, which is enforced again by the INSERT policy. The
  -- alternative — SECURITY DEFINER to look past RLS — would be adding definer code to work around
  -- a policy, which is the thing §8 of the N1 ruling forbids.
  IF v_from_type IS NULL OR v_to_type IS NULL THEN
    RAISE EXCEPTION 'relationship endpoints must both be visible participants'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_from_type <> v_spec.from_participant_type OR v_to_type <> v_spec.to_participant_type THEN
    RAISE EXCEPTION
      'relationship % requires %/% endpoints, not %/%',
      NEW.relationship_type, v_spec.from_participant_type, v_spec.to_participant_type,
      v_from_type, v_to_type
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER network_participants_set_provenance
  BEFORE INSERT OR UPDATE ON network_participants
  FOR EACH ROW EXECUTE FUNCTION app.network_set_provenance();
CREATE TRIGGER network_participants_immutable
  BEFORE UPDATE ON network_participants
  FOR EACH ROW EXECUTE FUNCTION app.network_participant_immutable();
CREATE TRIGGER network_participants_set_updated_at
  BEFORE UPDATE ON network_participants
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER network_participants_bump_version
  BEFORE UPDATE ON network_participants
  FOR EACH ROW EXECUTE FUNCTION app.bump_version();

CREATE TRIGGER network_participant_aliases_set_provenance
  BEFORE INSERT OR UPDATE ON network_participant_aliases
  FOR EACH ROW EXECUTE FUNCTION app.network_set_provenance();
CREATE TRIGGER network_participant_aliases_immutable
  BEFORE UPDATE ON network_participant_aliases
  FOR EACH ROW EXECUTE FUNCTION app.network_alias_immutable();
CREATE TRIGGER network_participant_aliases_set_updated_at
  BEFORE UPDATE ON network_participant_aliases
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER network_participant_aliases_bump_version
  BEFORE UPDATE ON network_participant_aliases
  FOR EACH ROW EXECUTE FUNCTION app.bump_version();

-- INSERT ONLY, deliberately. `from_participant_id`, `to_participant_id` and `relationship_type` are
-- immutable, and so is `network_participants.participant_type`, so nothing an UPDATE can do makes a
-- validated edge invalid — re-validating would be dead work. It would also be actively wrong here:
-- PostgreSQL fires BEFORE triggers in NAME order, `..._endpoints` sorts before `..._immutable`, and
-- an attempt to rewrite an endpoint would therefore be refused with a type-mismatch message
-- instead of the immutability one that actually explains it.
CREATE TRIGGER network_participant_relationships_endpoints
  BEFORE INSERT ON network_participant_relationships
  FOR EACH ROW EXECUTE FUNCTION app.network_relationship_endpoints_ok();
CREATE TRIGGER network_participant_relationships_set_provenance
  BEFORE INSERT OR UPDATE ON network_participant_relationships
  FOR EACH ROW EXECUTE FUNCTION app.network_set_provenance();
CREATE TRIGGER network_participant_relationships_immutable
  BEFORE UPDATE ON network_participant_relationships
  FOR EACH ROW EXECUTE FUNCTION app.network_relationship_immutable();
CREATE TRIGGER network_participant_relationships_set_updated_at
  BEFORE UPDATE ON network_participant_relationships
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER network_participant_relationships_bump_version
  BEFORE UPDATE ON network_participant_relationships
  FOR EACH ROW EXECUTE FUNCTION app.bump_version();

-- ---------------------------------------------------------------------------
-- §5. Indexes. Each one supports a stated invariant or read path; none is speculative.
-- ---------------------------------------------------------------------------

-- Tenant-scoped read path, which is the only ordinary read path there is. Partial because NULL
-- tenants are never selected by tenant and would only bloat the index.
CREATE INDEX network_participants_tenant ON network_participants (tenant_id)
  WHERE tenant_id IS NOT NULL;
-- Supports the FK from represented_organization_id back to this table — F-20 referencing-side index.
CREATE INDEX network_participants_represented_organization
  ON network_participants (represented_organization_id)
  WHERE represented_organization_id IS NOT NULL;

CREATE INDEX network_participant_aliases_participant
  ON network_participant_aliases (participant_id);
-- The alias resolution path: namespace + value is the identity, so the lookup is by both.
CREATE INDEX network_participant_aliases_lookup
  ON network_participant_aliases (namespace, value);
-- AT MOST ONE ACTIVE BINDING per (namespace, value) at any instant, while history is retained —
-- ADR-N0006 rule 2. A revoked or expired alias leaves the pair free to be asserted for a different
-- participant, which is what makes reassignment representable without rewriting history.
CREATE UNIQUE INDEX network_participant_aliases_one_active
  ON network_participant_aliases (namespace, value)
  WHERE revoked_at IS NULL AND effective_to IS NULL;

CREATE INDEX network_participant_relationships_from
  ON network_participant_relationships (from_participant_id);
CREATE INDEX network_participant_relationships_to
  ON network_participant_relationships (to_participant_id);
CREATE UNIQUE INDEX network_participant_relationships_one_active
  ON network_participant_relationships (from_participant_id, relationship_type, to_participant_id)
  WHERE revoked_at IS NULL AND effective_to IS NULL;

-- ---------------------------------------------------------------------------
-- §6. Row-level security.
--
-- Seeded above, before RLS is enabled — the ordering migration 0008 uses, because
-- FORCE ROW LEVEL SECURITY binds the table owner too and the migrator is the owner.
--
-- THE READ MODEL, stated plainly:
--
--   own-tenant participant     visible to that tenant's session, and to the control plane
--   foreign-tenant participant NOT visible
--   null-tenant participant    NOT visible to any ordinary tenant session; control plane only
--
-- The control plane is the trusted path, and it is an EXISTING authenticated principal with
-- existing authority — `app.is_control_plane()` tests real role membership. Using it introduces no
-- new authority and creates no discoverability surface: there is no public directory, no search,
-- and no cross-tenant lookup anywhere in this migration.
--
-- Aliases and relationships carry no tenant of their own; they are visible exactly when their
-- participants are. For relationships that means BOTH endpoints must be visible — the conservative
-- choice, and it keeps a cross-tenant edge from disclosing the existence of a counterparty a caller
-- may not see. No recursion: the participant policies do not query aliases or relationships.
-- ---------------------------------------------------------------------------

ALTER TABLE network_alias_namespaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_alias_namespaces FORCE ROW LEVEL SECURITY;
-- Governed vocabulary is readable by any authenticated caller: it is a code list, and validating an
-- alias requires resolving its namespace. It carries no tenant data.
CREATE POLICY network_alias_namespaces_read ON network_alias_namespaces FOR SELECT USING (true);
CREATE POLICY network_alias_namespaces_write ON network_alias_namespaces FOR INSERT
  WITH CHECK (app.is_control_plane());

ALTER TABLE network_relationship_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_relationship_types FORCE ROW LEVEL SECURITY;
CREATE POLICY network_relationship_types_read ON network_relationship_types FOR SELECT USING (true);
CREATE POLICY network_relationship_types_write ON network_relationship_types FOR INSERT
  WITH CHECK (app.is_control_plane());

ALTER TABLE network_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_participants FORCE ROW LEVEL SECURITY;
CREATE POLICY network_participants_read ON network_participants FOR SELECT
  USING (
    app.is_control_plane()
    OR (tenant_id IS NOT NULL AND tenant_id = (SELECT app.current_tenant_id())));
-- An ordinary session may register participants inside its own tenant. Creating an EXTERNAL
-- (null-tenant) participant is a control-plane act: external identity is network-wide state, and
-- letting one tenant mint it would make one customer's assertion everyone's reference data.
CREATE POLICY network_participants_insert ON network_participants FOR INSERT
  WITH CHECK (
    app.is_control_plane()
    OR (tenant_id IS NOT NULL AND tenant_id = (SELECT app.current_tenant_id())));
CREATE POLICY network_participants_update ON network_participants FOR UPDATE
  USING (
    app.is_control_plane()
    OR (tenant_id IS NOT NULL AND tenant_id = (SELECT app.current_tenant_id())))
  WITH CHECK (
    app.is_control_plane()
    OR (tenant_id IS NOT NULL AND tenant_id = (SELECT app.current_tenant_id())));
-- No DELETE policy: revocation is effective dating, never erasure.

ALTER TABLE network_participant_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_participant_aliases FORCE ROW LEVEL SECURITY;
CREATE POLICY network_participant_aliases_read ON network_participant_aliases FOR SELECT
  USING (EXISTS (SELECT 1 FROM network_participants p WHERE p.id = participant_id));
CREATE POLICY network_participant_aliases_insert ON network_participant_aliases FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM network_participants p WHERE p.id = participant_id));
CREATE POLICY network_participant_aliases_update ON network_participant_aliases FOR UPDATE
  USING (EXISTS (SELECT 1 FROM network_participants p WHERE p.id = participant_id))
  WITH CHECK (EXISTS (SELECT 1 FROM network_participants p WHERE p.id = participant_id));

ALTER TABLE network_participant_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_participant_relationships FORCE ROW LEVEL SECURITY;
CREATE POLICY network_participant_relationships_read ON network_participant_relationships FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM network_participants p WHERE p.id = from_participant_id)
    AND EXISTS (SELECT 1 FROM network_participants p WHERE p.id = to_participant_id));
CREATE POLICY network_participant_relationships_insert ON network_participant_relationships
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM network_participants p WHERE p.id = from_participant_id)
    AND EXISTS (SELECT 1 FROM network_participants p WHERE p.id = to_participant_id));
CREATE POLICY network_participant_relationships_update ON network_participant_relationships
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM network_participants p WHERE p.id = from_participant_id)
    AND EXISTS (SELECT 1 FROM network_participants p WHERE p.id = to_participant_id))
  WITH CHECK (
    EXISTS (SELECT 1 FROM network_participants p WHERE p.id = from_participant_id)
    AND EXISTS (SELECT 1 FROM network_participants p WHERE p.id = to_participant_id));

-- ---------------------------------------------------------------------------
-- §7. Privileges.
--
-- No new PostgreSQL role. No existing grant is broadened. DELETE and TRUNCATE are revoked from the
-- runtime role on every table here: identity history is not deletable.
-- ---------------------------------------------------------------------------

GRANT SELECT ON network_alias_namespaces TO freightos_app;
GRANT SELECT ON network_relationship_types TO freightos_app;
GRANT SELECT, INSERT ON network_alias_namespaces TO freightos_control_plane;
GRANT SELECT, INSERT ON network_relationship_types TO freightos_control_plane;

GRANT SELECT, INSERT, UPDATE ON network_participants TO freightos_app;
GRANT SELECT, INSERT, UPDATE ON network_participant_aliases TO freightos_app;
GRANT SELECT, INSERT, UPDATE ON network_participant_relationships TO freightos_app;
REVOKE DELETE, TRUNCATE ON network_participants FROM freightos_app;
REVOKE DELETE, TRUNCATE ON network_participant_aliases FROM freightos_app;
REVOKE DELETE, TRUNCATE ON network_participant_relationships FROM freightos_app;

GRANT SELECT, INSERT, UPDATE ON network_participants TO freightos_control_plane;
GRANT SELECT, INSERT, UPDATE ON network_participant_aliases TO freightos_control_plane;
GRANT SELECT, INSERT, UPDATE ON network_participant_relationships TO freightos_control_plane;

-- ---------------------------------------------------------------------------
-- §8. Assert the additions have not weakened anything.
--
-- Migration 0027 built `app.unqualified_authority_reads()` as a CATALOG-DERIVED guard rather than a
-- hand-maintained list, precisely so that a later migration adding RLS-enabled relations would be
-- covered without anyone remembering to extend it. N1 adds five, so the guard's inventory grows the
-- moment §6 runs — and this block is what makes the growth fail the DEPLOY rather than a test run
-- some time later.
-- ---------------------------------------------------------------------------

DO $assert$
DECLARE
  v_n integer;
  v_detail text;
BEGIN
  SELECT count(*), coalesce(string_agg(format('%s reads %s', function_name, relation_name), '; '), '')
    INTO v_n, v_detail FROM app.unqualified_authority_reads();
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0028: % unqualified read(s) of a protected relation — %', v_n, v_detail;
  END IF;

  -- N1 adds no privileged code. If a definer ever appears here it is a design change, not a detail.
  SELECT count(*) INTO v_n
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'app' AND p.proname LIKE 'network\_%' AND p.prosecdef;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0028: % SECURITY DEFINER function(s) in the network registry', v_n;
  END IF;

  -- Every registry table is RLS-enabled AND forced. FORCE is the half that binds the owner, and the
  -- migrator owns these tables.
  SELECT count(*), coalesce(string_agg(c.relname, ', '), '') INTO v_n, v_detail
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'network\_%'
     AND NOT (c.relrowsecurity AND c.relforcerowsecurity);
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0028: % registry table(s) without ENABLE+FORCE RLS: %', v_n, v_detail;
  END IF;
END
$assert$;
