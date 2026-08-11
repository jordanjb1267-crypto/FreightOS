-- 0032 — N5-A. The disclosure-authorization core.
--
-- N3 established CANONICAL NETWORK TRUTH. N4 established that TRANSPORT IS OWED. N5-A establishes
-- WHETHER DISCLOSURE IS AUTHORIZED, and the invariant it exists to enforce is that those three are
-- independent:
--
--     AN ACCEPTED FACT MAY EXIST, AND TRANSPORT MAY BE OWED,
--     WHILE DISCLOSURE REMAINS FORBIDDEN.
--
-- Nothing already in this database confers disclosure authority. Not event existence, not a
-- transport intent, not `network_events.classification`, not a participant relationship, not an
-- alias, not an assurance level, not `organization_id`, not `subject`, not `event_class`, not
-- `source`, not `schema_ref`, and not a NULL `tenant_id`. Disclosure requires a named recipient, a
-- governed purpose, an active effective-dated grant, and an explicit field projection — jointly,
-- with no other route to ALLOW.
--
-- WHAT THIS MIGRATION IS NOT. There is no publisher, no subscription, no destination, no broker,
-- no webhook, no delivery state, and no external egress. N5-A decides authorization; N6 will own
-- delivery. There is also no sensitivity ceiling: that vocabulary is unresolved owner input and is
-- N5-B's, which is why this migration creates six tables rather than eight. N5-A completion does
-- NOT authorize N6 publication — see ADR-N0015 and `docs/governance/DATA_CLASSIFICATION.md`.
--
-- SIX TABLES:
--   1. network_disclosure_purposes            reference, immutable, migration-seeded
--   2. network_disclosure_authority_bases     reference, immutable, migration-seeded
--   3. network_disclosure_projections         reference, immutable, migration-authored
--   4. network_disclosure_projection_fields   reference, immutable, migration-authored
--   5. network_disclosure_grants              runtime, INSERT-only
--   6. network_disclosure_grant_revocations   runtime, INSERT-only, one per grant
--
-- A NOTE ON THE PERMISSION ACTION COLUMN, because it is a real deviation and must not be silent.
--
-- §21 of the implementation brief requires three permission KEYS:
--   network.disclosure_grant.create / .revoke / .read
-- Those keys are seeded exactly, and `app.user_has_permission` resolves on `permissions.key`, so
-- the authorization contract is exactly as specified. But `permissions` also carries a separate
-- descriptive `action` column constrained by
--   permissions_action_check :: CHECK (action = ANY (ARRAY['read','write','engage','release']))
-- which contains neither `create` nor `revoke`. Extending that CHECK would alter an existing
-- surface, which §71 forbids without owner review, and the brief's own instruction elsewhere is not
-- to widen an existing vocabulary merely to fit N5-A. So the two write keys carry action `write`
-- and the read key carries `read`. No existing constraint is altered and no key is renamed.
-- Flagged for owner confirmation.

-- ---------------------------------------------------------------------------
-- §1. Reference vocabularies.
--
-- Reference TABLES, not enums. Three reasons, all load-bearing: `ALTER TYPE … ADD VALUE` cannot be
-- used in the same transaction that references the new value (ADR-0017 §4), so an enum would force
-- a non-transactional migration for every future addition; a table lets a value be added by
-- reviewed migration without rewriting a type; and a foreign key to a table is the mechanism that
-- makes `purpose_code` and `authority_basis_code` provably governed rather than free text — which
-- is the exact failure `network_events.classification` demonstrates.
--
-- Both are IMMUTABLE and ADDITIVE. There is deliberately no `active`, `issuable` or `retired_at`
-- column: a retirement lifecycle nobody has governed would be invented policy, and historical
-- grants must stay resolvable forever. If retirement is ever needed it arrives with its own rules.
-- ---------------------------------------------------------------------------

CREATE TABLE network_disclosure_purposes (
  code        text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  description text NOT NULL CHECK (length(btrim(description)) > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text NOT NULL DEFAULT current_user
);

COMMENT ON TABLE network_disclosure_purposes IS
  'Governed disclosure purposes. Migration-seeded and immutable. Purpose is an INDEPENDENT policy '
  'dimension: it is never inferred from event type, event class, subject, source or schema_ref, '
  'because the same event may be lawfully disclosed to different recipients for different '
  'purposes. A grant states its purpose explicitly or it does not apply.';

INSERT INTO network_disclosure_purposes (code, description, created_by) VALUES
  ('shipment_execution',
   'Disclosure necessary to execute or coordinate an explicitly authorized shipment or logistics '
   'operation between named organizations.',
   'migration:0032');

CREATE TABLE network_disclosure_authority_bases (
  code        text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  description text NOT NULL CHECK (length(btrim(description)) > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text NOT NULL DEFAULT current_user
);

COMMENT ON TABLE network_disclosure_authority_bases IS
  'The basis on which a disclosure is authorized. Exactly one value is seeded — bilateral_grant. '
  'contractual, statutory, regulatory, platform_policy and legitimate_interest are deliberately '
  'ABSENT: no governed legal-basis vocabulary exists anywhere in this repository, and inventing '
  'one would be authoring law. They remain owner and counsel input. The column exists now so that '
  'adding one later is a reviewed migration rather than a schema change.';

INSERT INTO network_disclosure_authority_bases (code, description, created_by) VALUES
  ('bilateral_grant',
   'An explicit, recorded organization-to-organization authorization to disclose the named '
   'projection for the named purpose.',
   'migration:0032');

-- ---------------------------------------------------------------------------
-- §2. Projections — the data-scope model.
--
-- A projection is a NAMED, IMMUTABLE, VERSIONED allowlist of field pointers bound to EXACTLY ONE
-- registered payload contract. It is the only way a grant can express what data may leave; there
-- is deliberately no "whole event" scope and no wildcard, because the default a denylist produces
-- for a field that did not exist when the rule was written is "it leaves", and no amount of test
-- coverage repairs a wrong default.
--
-- PROJECTION IDENTITY is an owner-controlled reverse-DNS code, NOT a URI and NOT a UUID. It is
-- never called `schema_ref`: a schema ref is a JSON Schema identity and this is not one. The
-- version lives inside the identifier so immutability is legible at every call site — `.v2` is a
-- new projection, never an edit of `.v1`.
-- ---------------------------------------------------------------------------

CREATE TABLE network_disclosure_projections (
  projection_ref text PRIMARY KEY
    CHECK (projection_ref ~ '^com\.rigreceipts\.network\.disclosure\.projection\.[a-z0-9_.-]+\.v[0-9]+$'),
  -- Exactly one contract. A new payload schema version has NO projection until one is authored,
  -- which is what makes a new sensitive field fail closed instead of riding in on an old grant.
  durable_schema_ref text NOT NULL REFERENCES network_schema_versions (durable_schema_ref),
  description        text NOT NULL CHECK (length(btrim(description)) > 0),
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         text NOT NULL DEFAULT current_user
);

CREATE INDEX network_disclosure_projections_schema_idx
  ON network_disclosure_projections (durable_schema_ref);

COMMENT ON TABLE network_disclosure_projections IS
  'Named immutable field projections, each bound to exactly one durable payload contract. '
  'Migration-authored only — there is no runtime projection administration path, so every '
  'projection is reviewed before it can authorize anything. projection_ref is an owner-controlled '
  'code, not a URI and not a JSON Schema identity.';

CREATE TABLE network_disclosure_projection_fields (
  projection_ref text NOT NULL
    REFERENCES network_disclosure_projections (projection_ref),
  -- FreightOS projection pointer syntax. JSON-Pointer-like with ONE documented extension: at an
  -- array traversal step, `-` means EVERY ELEMENT. RFC 6901 gives `-` no such meaning (it names
  -- the position after the last element, which never resolves on read); the every-element reading
  -- is FreightOS's, and reusing that token is safe precisely because it can never be a real index.
  --
  -- The CHECK enforces the shape a pointer must have. It cannot enforce the SCHEMA rules — no
  -- numeric index, no object terminal, no object-array terminal, must resolve against the exact
  -- contract — because those need the JSON Schema. Those are enforced by the schema walker in
  -- @freightos/schemas and asserted for every seeded row by `network-disclosure-projection`.
  json_pointer   text NOT NULL
    CHECK (json_pointer ~ '^(/([a-z][a-z0-9_]*|-))+$'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     text NOT NULL DEFAULT current_user,

  -- Identity is the pair. A pointer belongs to exactly one projection and cannot be duplicated
  -- within it.
  PRIMARY KEY (projection_ref, json_pointer)
);

COMMENT ON TABLE network_disclosure_projection_fields IS
  'The explicit field allowlist per projection. No wildcard, no "all fields" sentinel, no '
  'denylist. A pointer absent from this table is absent from every disclosure.';

COMMENT ON COLUMN network_disclosure_projection_fields.json_pointer IS
  'FreightOS projection pointer. `-` at an array step means EVERY ELEMENT — a FreightOS extension '
  'to JSON Pointer semantics, not RFC 6901 behaviour. Numeric indexes are rejected: element '
  'position is not a stable identity and a producer reordering an array would silently change what '
  'is disclosed.';

-- The seeded projection. Deliberately a MINIMIZING one, so that the seed itself demonstrates the
-- property the model exists for: of workflow-state's eleven addressable leaves it authorizes six,
-- and of a subject reference's fields it authorizes the identifier and the alias issuer but not
-- the alias value.
INSERT INTO network_disclosure_projections
  (projection_ref, durable_schema_ref, description, created_by) VALUES
  ('com.rigreceipts.network.disclosure.projection.workflow_state_minimal.v1',
   'https://schemas.rigreceipts.com/network/workflow-state.v1.json',
   'Minimal shipment-execution view of a workflow state: identity, current state, freshness, and '
   'subject identifiers. Excludes participants roster, deadlines, open exceptions and alias '
   'values.',
   'migration:0032');

INSERT INTO network_disclosure_projection_fields (projection_ref, json_pointer, created_by) VALUES
  -- Scalars.
  ('com.rigreceipts.network.disclosure.projection.workflow_state_minimal.v1', '/workflow_id',  'migration:0032'),
  ('com.rigreceipts.network.disclosure.projection.workflow_state_minimal.v1', '/state',        'migration:0032'),
  ('com.rigreceipts.network.disclosure.projection.workflow_state_minimal.v1', '/updated_at',   'migration:0032'),
  -- A whole array of SCALARS — permitted, because a scalar array has no child fields a later
  -- schema version could add.
  ('com.rigreceipts.network.disclosure.projection.workflow_state_minimal.v1', '/participants', 'migration:0032'),
  -- Every-element traversal into an array of OBJECTS. The whole array is NOT addressable; only
  -- named leaves inside its elements are.
  ('com.rigreceipts.network.disclosure.projection.workflow_state_minimal.v1', '/subject_refs/-/network_id', 'migration:0032'),
  -- Nested every-element traversal, two levels deep.
  ('com.rigreceipts.network.disclosure.projection.workflow_state_minimal.v1',
   '/subject_refs/-/external_aliases/-/issuer', 'migration:0032');

-- ---------------------------------------------------------------------------
-- §3. Grants.
--
-- APPEND-ONLY. No `status` column: status is DERIVED from the effective dates and the revocation
-- table, because a stored status is a mutable field on an authorization record and the question
-- "what was authorized at time T" must be answerable from immutable rows.
--
-- No `supersedes_grant_id`: a supersession chain would introduce a second temporal rule for when a
-- predecessor stops contributing authority, and N5-A does not need one. A change in authorization
-- is a new grant; a withdrawal is a revocation.
--
-- No `tenant_id`: tenancy is a property of the GRANTOR PARTICIPANT, not of the grant, and copying
-- it here would create a second answer to a question that already has one.
-- ---------------------------------------------------------------------------

CREATE TABLE network_disclosure_grants (
  grant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WHO IS DISCLOSING, and WHO RECEIVES.
  --
  -- The `_type` columns are GENERATED ALWAYS … STORED, which is stronger than the DEFAULT + CHECK
  -- pattern N3 used for `network_events.organization_type`: a caller cannot supply a value at all
  -- (PostgreSQL raises `cannot insert a non-DEFAULT value into column`), so the composite foreign
  -- keys below prove `participant_type = 'organization'` structurally rather than by constraint
  -- agreement. Recipient types are organization-only in N5-A; N1 has seven participant types and
  -- broadening to any of the others is a governed decision, not a consequence of the enum existing.
  grantor_participant_id   uuid NOT NULL,
  grantor_participant_type app.network_participant_type
    GENERATED ALWAYS AS ('organization'::app.network_participant_type) STORED,
  recipient_participant_id uuid NOT NULL,
  recipient_participant_type app.network_participant_type
    GENERATED ALWAYS AS ('organization'::app.network_participant_type) STORED,

  -- WHAT FOR, and OVER WHAT.
  purpose_code         text NOT NULL REFERENCES network_disclosure_purposes (code),
  projection_ref       text NOT NULL REFERENCES network_disclosure_projections (projection_ref),
  authority_basis_code text NOT NULL REFERENCES network_disclosure_authority_bases (code),

  -- WHEN. effective_from is INCLUSIVE, effective_until is EXCLUSIVE, NULL means indefinite until
  -- revoked. Stated here because a half-open interval left to the reader is how off-by-one
  -- authorization bugs are born.
  effective_from  timestamptz NOT NULL,
  effective_until timestamptz,

  -- PROVENANCE. Defaults are a convenience; the BEFORE INSERT trigger in §5 is the control — a
  -- default applies only when the column is omitted, so a caller who names it explicitly would
  -- otherwise defeat it.
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT current_user CHECK (length(btrim(created_by)) > 0),

  -- CONSENT EVIDENCE. Nullable, because no network terms artifact exists yet and a NOT NULL column
  -- that no path can populate is a column that will be wrong. They become mandatory when the owner
  -- supplies network terms.
  terms_ref  text CHECK (terms_ref IS NULL OR length(btrim(terms_ref)) > 0),
  terms_hash text CHECK (terms_hash IS NULL OR terms_hash ~ '^[0-9a-f]{64}$'),

  CONSTRAINT network_disclosure_grants_grantor_is_organization
    FOREIGN KEY (grantor_participant_id, grantor_participant_type)
    REFERENCES network_participants (id, participant_type),
  CONSTRAINT network_disclosure_grants_recipient_is_organization
    FOREIGN KEY (recipient_participant_id, recipient_participant_type)
    REFERENCES network_participants (id, participant_type),

  CONSTRAINT network_disclosure_grants_effective_window
    CHECK (effective_until IS NULL OR effective_until > effective_from),

  -- An organization disclosing to itself is not a disclosure.
  CONSTRAINT network_disclosure_grants_distinct_parties
    CHECK (grantor_participant_id <> recipient_participant_id)
);

-- The evaluator's access path: everything it filters on, in the order it filters.
CREATE INDEX network_disclosure_grants_lookup_idx
  ON network_disclosure_grants
     (recipient_participant_id, grantor_participant_id, purpose_code, effective_from);
CREATE INDEX network_disclosure_grants_grantor_idx
  ON network_disclosure_grants (grantor_participant_id);
CREATE INDEX network_disclosure_grants_projection_idx
  ON network_disclosure_grants (projection_ref);

COMMENT ON TABLE network_disclosure_grants IS
  'Append-only, effective-dated disclosure authorizations. A grant authorizes DISCLOSURE ONLY: it '
  'confers no database privilege, no command authority, no tenant membership, no participant '
  'delegation, no admin authority and no event-write authority. Status is derived, never stored.';

-- ---------------------------------------------------------------------------
-- §4. Revocations.
--
-- A separate INSERT-only table rather than a mutable column, so the grant table needs no UPDATE
-- path at all — which makes "a grant update erased authorization history" structurally
-- unreachable rather than merely tested for.
--
-- `grant_id` IS the primary key. That enforces at-most-one revocation per grant with no additional
-- constraint and no surrogate identifier to justify. There is no un-revoke: a withdrawn
-- authorization is withdrawn, and a new authorization is a new grant.
-- ---------------------------------------------------------------------------

CREATE TABLE network_disclosure_grant_revocations (
  grant_id   uuid PRIMARY KEY REFERENCES network_disclosure_grants (grant_id),
  revoked_at timestamptz NOT NULL DEFAULT now(),
  revoked_by text NOT NULL DEFAULT current_user CHECK (length(btrim(revoked_by)) > 0),
  reason     text NOT NULL CHECK (length(btrim(reason)) > 0)
);

COMMENT ON TABLE network_disclosure_grant_revocations IS
  'One revocation per grant, enforced by the primary key. Revocation stops FUTURE disclosure. It '
  'does not recall delivered data, does not cancel N4 transport debt (which is not per-recipient), '
  'and does not erase audit or grant history.';

-- ---------------------------------------------------------------------------
-- §5. Trusted provenance.
--
-- SR-2 doctrine: authoritative fields derive from authenticated context and are never caller
-- supplied. These triggers OVERWRITE unconditionally rather than defaulting, because a DEFAULT
-- applies only to an omitted column and a caller who names it explicitly would otherwise win.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.network_disclosure_grant_provenance() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.created_by := coalesce(app.current_actor_id(), current_user);
  NEW.created_at := now();
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION app.network_disclosure_grant_provenance IS
  'Overwrites created_by/created_at from authenticated context on every insert. Invoker rights — '
  'this function needs no privilege the caller lacks, and a definer here would be a cross-tenant '
  'read waiting to be discovered.';

CREATE TRIGGER network_disclosure_grants_provenance
  BEFORE INSERT ON network_disclosure_grants
  FOR EACH ROW EXECUTE FUNCTION app.network_disclosure_grant_provenance();

CREATE FUNCTION app.network_disclosure_revocation_provenance() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.revoked_by := coalesce(app.current_actor_id(), current_user);
  NEW.revoked_at := now();
  RETURN NEW;
END
$$;

CREATE TRIGGER network_disclosure_grant_revocations_provenance
  BEFORE INSERT ON network_disclosure_grant_revocations
  FOR EACH ROW EXECUTE FUNCTION app.network_disclosure_revocation_provenance();

-- ---------------------------------------------------------------------------
-- §6. Audit coupling.
--
-- STRUCTURAL, not application-level. The audit row is written by an AFTER INSERT trigger in the
-- same transaction as the business row, so a grant cannot exist without its ledger entry and a
-- failed audit write fails the grant. This is the N4 coupling pattern.
--
-- It calls the EXISTING hardened `app.record_audit_event` — migration 0031 (SR-AUDIT-ACL-NOOP)
-- left `freightos_app` as its only runtime grantee, and these triggers run with invoker rights as
-- `freightos_app`. NO NEW SECURITY DEFINER. Every authoritative audit field — tenant, actor,
-- actor_type, created_by, operation_class, provenance — is derived inside that function from the
-- verified session, so nothing here can forge attribution.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.network_disclosure_grant_audit() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM app.record_audit_event(
    'rig.freight.network.disclosure_grant.created.v1',
    'network_disclosure_grant',
    NEW.grant_id::text,
    NULL,
    NULL,
    'service_operation',
    jsonb_build_object(
      'grant_id', NEW.grant_id,
      'grantor_participant_id', NEW.grantor_participant_id,
      'recipient_participant_id', NEW.recipient_participant_id,
      'purpose_code', NEW.purpose_code,
      'projection_ref', NEW.projection_ref,
      'authority_basis_code', NEW.authority_basis_code,
      'effective_from', NEW.effective_from,
      'effective_until', NEW.effective_until));
  RETURN NULL;
END
$$;

CREATE TRIGGER network_disclosure_grants_audit
  AFTER INSERT ON network_disclosure_grants
  FOR EACH ROW EXECUTE FUNCTION app.network_disclosure_grant_audit();

CREATE FUNCTION app.network_disclosure_revocation_audit() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM app.record_audit_event(
    'rig.freight.network.disclosure_grant.revoked.v1',
    'network_disclosure_grant',
    NEW.grant_id::text,
    NULL,
    NULL,
    'service_operation',
    jsonb_build_object(
      'grant_id', NEW.grant_id,
      'revoked_at', NEW.revoked_at,
      'reason', NEW.reason));
  RETURN NULL;
END
$$;

CREATE TRIGGER network_disclosure_grant_revocations_audit
  AFTER INSERT ON network_disclosure_grant_revocations
  FOR EACH ROW EXECUTE FUNCTION app.network_disclosure_revocation_audit();

-- ---------------------------------------------------------------------------
-- §7. Append-only guards.
--
-- The N3/N4 convention: a row-level guard for UPDATE and DELETE, and a STATEMENT-level guard for
-- TRUNCATE, because row triggers never fire for TRUNCATE and it would otherwise be an unguarded
-- hole straight through the append-only guarantee. Applied to all six tables — the reference
-- tables included, because migration-authored data that runtime can rewrite is not reference data.
-- ---------------------------------------------------------------------------

CREATE TRIGGER network_disclosure_purposes_no_update
  BEFORE UPDATE ON network_disclosure_purposes
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_purposes_no_delete
  BEFORE DELETE ON network_disclosure_purposes
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_purposes_no_truncate
  BEFORE TRUNCATE ON network_disclosure_purposes
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER network_disclosure_authority_bases_no_update
  BEFORE UPDATE ON network_disclosure_authority_bases
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_authority_bases_no_delete
  BEFORE DELETE ON network_disclosure_authority_bases
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_authority_bases_no_truncate
  BEFORE TRUNCATE ON network_disclosure_authority_bases
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER network_disclosure_projections_no_update
  BEFORE UPDATE ON network_disclosure_projections
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_projections_no_delete
  BEFORE DELETE ON network_disclosure_projections
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_projections_no_truncate
  BEFORE TRUNCATE ON network_disclosure_projections
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER network_disclosure_projection_fields_no_update
  BEFORE UPDATE ON network_disclosure_projection_fields
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_projection_fields_no_delete
  BEFORE DELETE ON network_disclosure_projection_fields
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_projection_fields_no_truncate
  BEFORE TRUNCATE ON network_disclosure_projection_fields
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER network_disclosure_grants_no_update
  BEFORE UPDATE ON network_disclosure_grants
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_grants_no_delete
  BEFORE DELETE ON network_disclosure_grants
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_grants_no_truncate
  BEFORE TRUNCATE ON network_disclosure_grants
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER network_disclosure_grant_revocations_no_update
  BEFORE UPDATE ON network_disclosure_grant_revocations
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_grant_revocations_no_delete
  BEFORE DELETE ON network_disclosure_grant_revocations
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_grant_revocations_no_truncate
  BEFORE TRUNCATE ON network_disclosure_grant_revocations
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

-- ---------------------------------------------------------------------------
-- §8. Row-level security.
--
-- ENABLE and FORCE on all six, so the table owner is subject to policy too.
--
-- Reference tables are readable and NOT writable by anything at runtime: no INSERT, UPDATE or
-- DELETE policy exists for any role, so migration-authored data stays migration-authored. The
-- evaluator needs to read them; nothing needs to write them.
--
-- The grant tables carry exactly the policies the two governed operations require and nothing
-- else. There is no UPDATE policy and no DELETE policy anywhere in this migration.
-- ---------------------------------------------------------------------------

ALTER TABLE network_disclosure_purposes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_purposes            FORCE  ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_authority_bases     ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_authority_bases     FORCE  ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_projections         ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_projections         FORCE  ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_projection_fields   ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_projection_fields   FORCE  ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_grants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_grants              FORCE  ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_grant_revocations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_grant_revocations   FORCE  ROW LEVEL SECURITY;

-- Reference data: a governed vocabulary, not tenant data. Same reasoning as `permissions` and
-- `network_schema_versions` — a tenant learns nothing about another tenant from it.
CREATE POLICY network_disclosure_purposes_read ON network_disclosure_purposes
  FOR SELECT USING (true);
CREATE POLICY network_disclosure_authority_bases_read ON network_disclosure_authority_bases
  FOR SELECT USING (true);
CREATE POLICY network_disclosure_projections_read ON network_disclosure_projections
  FOR SELECT USING (true);
CREATE POLICY network_disclosure_projection_fields_read ON network_disclosure_projection_fields
  FOR SELECT USING (true);

-- THE GRANT WRITE PATH. Six conditions, all required, all derived from trusted context:
--
--   1-3. the grantor is an ACTIVE ORGANIZATION participant;
--   4.   it belongs to a FreightOS tenant — an external NULL-tenant organization may be a
--        RECIPIENT but may not self-create grants until governed delegation exists;
--   5.   that tenant is the caller's VERIFIED tenant, which for `freightos_app` resolves from
--        `app.verified_principal()` and is not settable by the caller;
--   6.   the authenticated user holds the permission IN THAT TENANT.
--
-- The recipient is deliberately NOT constrained by tenancy here: recipient eligibility must never
-- depend on tenant_id, and NULL tenant is not public.
CREATE POLICY network_disclosure_grants_insert ON network_disclosure_grants
  FOR INSERT TO freightos_app
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.network_participants p
       WHERE p.id = grantor_participant_id
         AND p.participant_type = 'organization'
         AND p.status = 'active'
         AND p.tenant_id IS NOT NULL
         AND p.tenant_id = (SELECT app.current_tenant_id())
    )
    AND app.user_has_permission(
          (SELECT app.current_tenant_id()),
          (SELECT app.current_user_id()),
          'network.disclosure_grant.create',
          now())
  );

-- Grantor-side read only, and only with the read permission. A RECIPIENT does not get transparency
-- into grants naming it in N5-A — that is a deliberate later decision, not an oversight, and
-- widening it for convenience would disclose the grantor's policy to its counterparty.
CREATE POLICY network_disclosure_grants_read ON network_disclosure_grants
  FOR SELECT TO freightos_app
  USING (
    EXISTS (
      SELECT 1 FROM public.network_participants p
       WHERE p.id = grantor_participant_id
         AND p.tenant_id IS NOT NULL
         AND p.tenant_id = (SELECT app.current_tenant_id())
    )
    AND app.user_has_permission(
          (SELECT app.current_tenant_id()),
          (SELECT app.current_user_id()),
          'network.disclosure_grant.read',
          now())
  );

-- Revocation: grantor-side only, with the revoke permission. The recipient cannot revoke, and a
-- foreign tenant cannot revoke.
CREATE POLICY network_disclosure_grant_revocations_insert ON network_disclosure_grant_revocations
  FOR INSERT TO freightos_app
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.network_disclosure_grants g
        JOIN public.network_participants p ON p.id = g.grantor_participant_id
       WHERE g.grant_id = network_disclosure_grant_revocations.grant_id
         AND p.tenant_id IS NOT NULL
         AND p.tenant_id = (SELECT app.current_tenant_id())
    )
    AND app.user_has_permission(
          (SELECT app.current_tenant_id()),
          (SELECT app.current_user_id()),
          'network.disclosure_grant.revoke',
          now())
  );

CREATE POLICY network_disclosure_grant_revocations_read ON network_disclosure_grant_revocations
  FOR SELECT TO freightos_app
  USING (
    EXISTS (
      SELECT 1
        FROM public.network_disclosure_grants g
        JOIN public.network_participants p ON p.id = g.grantor_participant_id
       WHERE g.grant_id = network_disclosure_grant_revocations.grant_id
         AND p.tenant_id IS NOT NULL
         AND p.tenant_id = (SELECT app.current_tenant_id())
    )
    AND app.user_has_permission(
          (SELECT app.current_tenant_id()),
          (SELECT app.current_user_id()),
          'network.disclosure_grant.read',
          now())
  );

-- ---------------------------------------------------------------------------
-- §9. Privileges.
--
-- The runtime role gets SELECT on reference data and SELECT+INSERT on the two governed tables —
-- never UPDATE, DELETE or TRUNCATE, on anything. The control plane gets nothing: N5-A has no
-- control-plane operation, and a standing grant "in case" is how a boundary erodes.
-- ---------------------------------------------------------------------------

GRANT SELECT ON network_disclosure_purposes          TO freightos_app;
GRANT SELECT ON network_disclosure_authority_bases   TO freightos_app;
GRANT SELECT ON network_disclosure_projections       TO freightos_app;
GRANT SELECT ON network_disclosure_projection_fields TO freightos_app;
GRANT SELECT, INSERT ON network_disclosure_grants            TO freightos_app;
GRANT SELECT, INSERT ON network_disclosure_grant_revocations TO freightos_app;

REVOKE UPDATE, DELETE, TRUNCATE ON network_disclosure_purposes          FROM freightos_app;
REVOKE UPDATE, DELETE, TRUNCATE ON network_disclosure_authority_bases   FROM freightos_app;
REVOKE UPDATE, DELETE, TRUNCATE ON network_disclosure_projections       FROM freightos_app;
REVOKE UPDATE, DELETE, TRUNCATE ON network_disclosure_projection_fields FROM freightos_app;
REVOKE UPDATE, DELETE, TRUNCATE ON network_disclosure_grants            FROM freightos_app;
REVOKE UPDATE, DELETE, TRUNCATE ON network_disclosure_grant_revocations FROM freightos_app;

REVOKE ALL PRIVILEGES ON network_disclosure_purposes          FROM freightos_control_plane;
REVOKE ALL PRIVILEGES ON network_disclosure_authority_bases   FROM freightos_control_plane;
REVOKE ALL PRIVILEGES ON network_disclosure_projections       FROM freightos_control_plane;
REVOKE ALL PRIVILEGES ON network_disclosure_projection_fields FROM freightos_control_plane;
REVOKE ALL PRIVILEGES ON network_disclosure_grants            FROM freightos_control_plane;
REVOKE ALL PRIVILEGES ON network_disclosure_grant_revocations FROM freightos_control_plane;

REVOKE ALL PRIVILEGES ON network_disclosure_grants            FROM freightos_event_writer;
REVOKE ALL PRIVILEGES ON network_disclosure_grant_revocations FROM freightos_event_writer;

-- ---------------------------------------------------------------------------
-- §10. Permission keys.
--
-- Seeded into the existing catalog and ASSIGNED TO NO ROLE. The migration deliberately creates no
-- `role_permissions` row: a migration that hands a new authority to an existing role has widened
-- human authority as a side effect of shipping a feature, which is exactly what `S-C` exists to
-- catch. Assignment stays with the governed role-administration path.
--
-- THE ROLE LOAN. `permissions` carries `permissions_insert WITH CHECK (app.is_control_plane())`,
-- and `freightos_migrator` is a member of `freightos_control_plane` with INHERIT FALSE and SET
-- FALSE — so it can neither wield nor become the control plane, and its insert is refused by RLS.
-- 0008 seeded before enabling RLS and states plainly that a policy admitting the migrator "would
-- widen the write surface permanently to remove a one-time ordering problem". So this borrows
-- `freightos_admin_owner`, which the migrator administers WITH SET and which inherits the control
-- plane — the same loan pattern 0025 §2 and 0027 use. SET LOCAL, so it reverts at COMMIT.
--
-- ACTION COLUMN: `write`, `write`, `read`. See the header — `permissions_action_check` admits only
-- read/write/engage/release, and the KEYS are what `app.user_has_permission` resolves on.
-- ---------------------------------------------------------------------------

-- IDEMPOTENT ON `key`, defensively. The down migration removes these three rows exactly, so a
-- re-apply should find none — but a migration that would collide if a row somehow survived is a
-- migration that fails at the worst moment, and the cost of the guard is one clause.
--
-- The arbiter is NAMED (`ON CONFLICT (key)`) rather than bare. That form requires SELECT on the
-- table, because inferring an arbiter index is treated as a read — the lesson N4 learned the hard
-- way with `ON CONFLICT DO NOTHING` on a table the writer could not read. `freightos_admin_owner`
-- inherits the control plane, which holds SELECT, so the targeted form is available here and is
-- preferred: it conflicts on the key and nothing else.
SET LOCAL ROLE freightos_admin_owner;

INSERT INTO permissions (tenant_id, key, resource, action, description, created_by, updated_by)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'network.disclosure_grant.create',
   'network_disclosure_grant', 'write',
   'Create a network disclosure grant on behalf of an organization in the caller''s tenant.',
   'migration:0032', 'migration:0032'),
  ('00000000-0000-0000-0000-000000000000', 'network.disclosure_grant.revoke',
   'network_disclosure_grant', 'write',
   'Revoke a network disclosure grant issued by an organization in the caller''s tenant.',
   'migration:0032', 'migration:0032'),
  ('00000000-0000-0000-0000-000000000000', 'network.disclosure_grant.read',
   'network_disclosure_grant', 'read',
   'Read network disclosure grants issued by an organization in the caller''s tenant.',
   'migration:0032', 'migration:0032')
ON CONFLICT (key) DO NOTHING;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- §11. Self-assertions.
--
-- The migration proves its own resulting catalog state, by exact name. Counts alone are not
-- assertions: six tables with the wrong columns is still six tables.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_text text;
  v_int  integer;
  v_bool boolean;
  v_owner text;
BEGIN
  -- (a) Exactly the six tables, by name.
  SELECT string_agg(c.relname, ',' ORDER BY c.relname) INTO v_text
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'network_disclosure%';
  IF v_text IS DISTINCT FROM
     'network_disclosure_authority_bases,network_disclosure_grant_revocations,'
     'network_disclosure_grants,network_disclosure_projection_fields,'
     'network_disclosure_projections,network_disclosure_purposes' THEN
    RAISE EXCEPTION '0032: expected exactly the six N5-A tables, found: %', coalesce(v_text, '(none)');
  END IF;

  -- (b) The grant table's exact column set, in order. This is what stops a status, a tenant_id, a
  -- supersedes_grant_id or a delivery field appearing later without review.
  SELECT string_agg(attname, ',' ORDER BY attnum) INTO v_text
    FROM pg_attribute
   WHERE attrelid = 'public.network_disclosure_grants'::regclass AND attnum > 0 AND NOT attisdropped;
  IF v_text IS DISTINCT FROM
     'grant_id,grantor_participant_id,grantor_participant_type,recipient_participant_id,'
     'recipient_participant_type,purpose_code,projection_ref,authority_basis_code,effective_from,'
     'effective_until,created_at,created_by,terms_ref,terms_hash' THEN
    RAISE EXCEPTION '0032: network_disclosure_grants column set is wrong: %', v_text;
  END IF;

  -- (c) Both organization-type pins are GENERATED ALWAYS STORED, not defaults a caller can supply.
  SELECT count(*) INTO v_int
    FROM pg_attribute
   WHERE attrelid = 'public.network_disclosure_grants'::regclass
     AND attname IN ('grantor_participant_type', 'recipient_participant_type')
     AND attgenerated = 's';
  IF v_int <> 2 THEN
    RAISE EXCEPTION '0032: expected 2 GENERATED STORED participant-type columns, found %', v_int;
  END IF;

  -- (d) Both composite foreign keys reference (id, participant_type).
  SELECT count(*) INTO v_int
    FROM pg_constraint
   WHERE conrelid = 'public.network_disclosure_grants'::regclass
     AND contype = 'f'
     AND confrelid = 'public.network_participants'::regclass
     AND array_length(conkey, 1) = 2;
  IF v_int <> 2 THEN
    RAISE EXCEPTION '0032: expected 2 composite participant foreign keys, found %', v_int;
  END IF;

  -- (e) Revocation cardinality is structural: grant_id is the primary key.
  SELECT pg_get_constraintdef(oid) INTO v_text
    FROM pg_constraint
   WHERE conrelid = 'public.network_disclosure_grant_revocations'::regclass AND contype = 'p';
  IF v_text IS DISTINCT FROM 'PRIMARY KEY (grant_id)' THEN
    RAISE EXCEPTION '0032: revocation primary key must be (grant_id), found %', coalesce(v_text, '(none)');
  END IF;

  -- (f) RLS enabled AND forced on all six.
  SELECT count(*) INTO v_int
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname LIKE 'network_disclosure%'
     AND c.relrowsecurity AND c.relforcerowsecurity;
  IF v_int <> 6 THEN
    RAISE EXCEPTION '0032: expected 6 tables with RLS enabled and forced, found %', v_int;
  END IF;

  -- (g) No UPDATE or DELETE policy exists anywhere in N5-A.
  SELECT count(*) INTO v_int
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname LIKE 'network_disclosure%' AND p.polcmd IN ('w', 'd');
  IF v_int <> 0 THEN
    RAISE EXCEPTION '0032: N5-A must define no UPDATE or DELETE policy, found %', v_int;
  END IF;

  -- (h) The exact policy set, by name.
  SELECT string_agg(p.polname, ',' ORDER BY p.polname) INTO v_text
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname LIKE 'network_disclosure%';
  IF v_text IS DISTINCT FROM
     'network_disclosure_authority_bases_read,network_disclosure_grant_revocations_insert,'
     'network_disclosure_grant_revocations_read,network_disclosure_grants_insert,'
     'network_disclosure_grants_read,network_disclosure_projection_fields_read,'
     'network_disclosure_projections_read,network_disclosure_purposes_read' THEN
    RAISE EXCEPTION '0032: N5-A policy set is wrong: %', coalesce(v_text, '(none)');
  END IF;

  -- (i) Eighteen append-only guards: three on each of six tables.
  SELECT count(*) INTO v_int
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname LIKE 'network_disclosure%' AND NOT t.tgisinternal
     AND t.tgname ~ '_(no_update|no_delete|no_truncate)$';
  IF v_int <> 18 THEN
    RAISE EXCEPTION '0032: expected 18 append-only guards, found %', v_int;
  END IF;

  -- The TRUNCATE guards must actually be statement-level TRUNCATE triggers, not row triggers
  -- wearing the name. tgtype bit 0x20 is TRUNCATE.
  SELECT count(*) INTO v_int
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname LIKE 'network_disclosure%' AND NOT t.tgisinternal
     AND t.tgname ~ '_no_truncate$' AND (t.tgtype & 32) <> 0 AND (t.tgtype & 1) = 0;
  IF v_int <> 6 THEN
    RAISE EXCEPTION '0032: expected 6 statement-level TRUNCATE guards, found %', v_int;
  END IF;

  -- The AUDIT COUPLING and PROVENANCE triggers, by exact name, table, timing and function.
  --
  -- Counting was not enough: the eighteen append-only guards above are matched by a name pattern
  -- these four do not share, so removing or renaming an audit trigger passed every count in this
  -- migration. "A grant cannot exist without its ledger entry" is the claim that matters most in
  -- N5-A, and until this assertion existed nothing here checked the object that makes it true.
  SELECT string_agg(format('%s:%s:%s:%s', c.relname, t.tgname,
                           CASE WHEN (t.tgtype & 2) <> 0 THEN 'BEFORE' ELSE 'AFTER' END,
                           f.proname), ',' ORDER BY t.tgname) INTO v_text
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc f ON f.oid = t.tgfoid
   WHERE c.relname LIKE 'network_disclosure%' AND NOT t.tgisinternal
     AND t.tgname !~ '_(no_update|no_delete|no_truncate)$';
  IF v_text IS DISTINCT FROM
     'network_disclosure_grant_revocations:network_disclosure_grant_revocations_audit:AFTER:'
     'network_disclosure_revocation_audit,'
     'network_disclosure_grant_revocations:network_disclosure_grant_revocations_provenance:BEFORE:'
     'network_disclosure_revocation_provenance,'
     'network_disclosure_grants:network_disclosure_grants_audit:AFTER:'
     'network_disclosure_grant_audit,'
     'network_disclosure_grants:network_disclosure_grants_provenance:BEFORE:'
     'network_disclosure_grant_provenance' THEN
    RAISE EXCEPTION '0032: the audit/provenance trigger set is wrong: %', coalesce(v_text, '(none)');
  END IF;

  -- (j) Runtime privileges: SELECT+INSERT on the two governed tables, SELECT on reference data,
  -- and no UPDATE/DELETE/TRUNCATE anywhere.
  SELECT string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) INTO v_text
    FROM information_schema.role_table_grants
   WHERE grantee = 'freightos_app' AND table_name LIKE 'network_disclosure%';
  IF v_text IS DISTINCT FROM 'INSERT,SELECT' THEN
    RAISE EXCEPTION '0032: freightos_app N5-A privileges must be exactly INSERT,SELECT — found %',
      coalesce(v_text, '(none)');
  END IF;

  SELECT count(*) INTO v_int
    FROM information_schema.role_table_grants
   WHERE table_name LIKE 'network_disclosure%'
     AND grantee IN ('freightos_control_plane', 'freightos_event_writer');
  IF v_int <> 0 THEN
    RAISE EXCEPTION '0032: control plane and event writer must hold nothing on N5-A, found %', v_int;
  END IF;

  -- (k) No new SECURITY DEFINER. The four N5-A functions are all invoker-rights.
  SELECT count(*) INTO v_int
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'app' AND p.proname LIKE 'network_disclosure%' AND p.prosecdef;
  IF v_int <> 0 THEN
    RAISE EXCEPTION '0032: N5-A must add no SECURITY DEFINER, found %', v_int;
  END IF;

  -- (l) Reference seeds, exactly.
  SELECT string_agg(code, ',' ORDER BY code) INTO v_text FROM network_disclosure_purposes;
  IF v_text IS DISTINCT FROM 'shipment_execution' THEN
    RAISE EXCEPTION '0032: purpose seed must be exactly shipment_execution, found %', coalesce(v_text, '(none)');
  END IF;
  SELECT string_agg(code, ',' ORDER BY code) INTO v_text FROM network_disclosure_authority_bases;
  IF v_text IS DISTINCT FROM 'bilateral_grant' THEN
    RAISE EXCEPTION '0032: authority basis seed must be exactly bilateral_grant, found %', coalesce(v_text, '(none)');
  END IF;

  -- (m) Every projection binds a REGISTERED contract, and every field belongs to a projection.
  SELECT count(*) INTO v_int
    FROM network_disclosure_projections p
    LEFT JOIN network_schema_versions s ON s.durable_schema_ref = p.durable_schema_ref
   WHERE s.durable_schema_ref IS NULL;
  IF v_int <> 0 THEN
    RAISE EXCEPTION '0032: % projection(s) reference an unregistered contract', v_int;
  END IF;

  -- (n) No seeded pointer uses a numeric array index. The full schema-resolution rules live in the
  -- walker — SQL cannot read a JSON Schema — but this one is cheap and catches the commonest error
  -- at deployment rather than at authoring.
  SELECT count(*) INTO v_int
    FROM network_disclosure_projection_fields WHERE json_pointer ~ '/[0-9]';
  IF v_int <> 0 THEN
    RAISE EXCEPTION '0032: % projection pointer(s) use a numeric array index', v_int;
  END IF;

  -- (o) The three permission keys exist and are assigned to NO role.
  SELECT string_agg(key, ',' ORDER BY key) INTO v_text
    FROM permissions WHERE key IN ('network.disclosure_grant.create',
                                   'network.disclosure_grant.read',
                                   'network.disclosure_grant.revoke');
  IF v_text IS DISTINCT FROM
     'network.disclosure_grant.create,network.disclosure_grant.read,network.disclosure_grant.revoke' THEN
    RAISE EXCEPTION '0032: expected the three disclosure permission keys, found %', coalesce(v_text, '(none)');
  END IF;

  -- READ AS THE CONTROL PLANE. `role_permissions` and `service_account_permissions` are under
  -- FORCE RLS with `USING (app.is_control_plane() OR tenant_id = app.current_tenant_id())`, and the
  -- migrator satisfies neither disjunct — it holds `freightos_control_plane` with INHERIT FALSE and
  -- carries no tenant. Counted as the migrator these return 0 unconditionally, which would make the
  -- central "this migration hands authority to nobody" claim an assertion that cannot fail.
  SET LOCAL ROLE freightos_admin_owner;

  SELECT count(*) INTO v_int
    FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key IN ('network.disclosure_grant.create',
                   'network.disclosure_grant.read',
                   'network.disclosure_grant.revoke');
  IF v_int <> 0 THEN
    RAISE EXCEPTION
      '0032: the disclosure permissions must be assigned to NO role by this migration, found % '
      'assignment(s). A migration that hands new authority to an existing role has widened human '
      'authority as a side effect of shipping a feature.', v_int;
  END IF;

  SELECT count(*) INTO v_int
    FROM service_account_permissions sap JOIN permissions p ON p.id = sap.permission_id
   WHERE p.key IN ('network.disclosure_grant.create',
                   'network.disclosure_grant.read',
                   'network.disclosure_grant.revoke');
  IF v_int <> 0 THEN
    RAISE EXCEPTION
      '0032: the disclosure permissions must be held by NO service account, found %', v_int;
  END IF;

  RESET ROLE;
  IF current_user <> 'freightos_migrator' THEN
    RAISE EXCEPTION '0032: the control-plane loan was not returned, still %', current_user;
  END IF;

  -- THE OWNER-APPROVED ACTION MAPPING, pinned so a later implementer cannot "fix" it by widening
  -- the existing CHECK. `permissions.action` is the repository's coarse action family; the KEY is
  -- the fine-grained authorization identity and is what `app.user_has_permission` resolves on.
  SELECT string_agg(key || '=' || action, ',' ORDER BY key) INTO v_text
    FROM permissions WHERE key IN ('network.disclosure_grant.create',
                                   'network.disclosure_grant.read',
                                   'network.disclosure_grant.revoke');
  IF v_text IS DISTINCT FROM
     'network.disclosure_grant.create=write,network.disclosure_grant.read=read,'
     'network.disclosure_grant.revoke=write' THEN
    RAISE EXCEPTION '0032: N5-A permission action mapping is wrong: %', coalesce(v_text, '(none)');
  END IF;

  -- And the action vocabulary itself is UNCHANGED from the pre-N5-A base. N5-A adds no action.
  SELECT pg_get_constraintdef(oid) INTO v_text
    FROM pg_constraint
   WHERE conrelid = 'public.permissions'::regclass AND conname = 'permissions_action_check';
  IF v_text IS DISTINCT FROM
     'CHECK ((action = ANY (ARRAY[''read''::text, ''write''::text, ''engage''::text, ''release''::text])))' THEN
    RAISE EXCEPTION
      '0032: permissions_action_check changed. N5-A must not widen the action vocabulary — the '
      'permission KEY is the authorization identity. Found: %', coalesce(v_text, '(none)');
  END IF;

  -- (p) NON-REGRESSION. N3, N4 and the audit ledger are untouched by N5-A.
  SELECT string_agg(attname, ',' ORDER BY attnum) INTO v_text
    FROM pg_attribute
   WHERE attrelid = 'public.network_transport_intents'::regclass AND attnum > 0 AND NOT attisdropped;
  IF v_text IS DISTINCT FROM 'network_event_id,created_at' THEN
    RAISE EXCEPTION '0032: network_transport_intents changed: %', v_text;
  END IF;

  -- Pinned by NAME rather than by count. A count would pass for a rename, and `classification` in
  -- particular must still be present and still be something N5-A never reads.
  SELECT string_agg(attname, ',' ORDER BY attnum) INTO v_text
    FROM pg_attribute
   WHERE attrelid = 'public.network_events'::regclass AND attnum > 0 AND NOT attisdropped;
  IF v_text IS DISTINCT FROM
     'event_id,type,source,subject,occurred_at,organization_id,organization_type,classification,'
     'schema_ref,envelope_schema_ref,data,event_class,correlation_id,causation_id,workflow_id,'
     'trace_id,evidence_refs,recorded_at,accepted_by,tenant_id,event_fingerprint,'
     'corrects_event_id,replacement_event_id' THEN
    RAISE EXCEPTION '0032: network_events column set changed: %', v_text;
  END IF;

  SELECT count(*) INTO v_int
    FROM pg_trigger WHERE tgrelid = 'public.audit_events'::regclass AND NOT tgisinternal;
  IF v_int <> 3 THEN
    RAISE EXCEPTION '0032: audit_events should carry 3 append-only triggers, found %', v_int;
  END IF;

  -- (q) SR-AUDIT-ACL-NOOP non-regression. N5-A calls app.record_audit_event, so it must not have
  -- widened the boundary 0031 established.
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(p.proacl) a
     WHERE n.nspname = 'app' AND p.proname = 'record_audit_event'
       AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') INTO v_bool;
  IF v_bool THEN
    RAISE EXCEPTION '0032: PUBLIC regained EXECUTE on app.record_audit_event — 0031 regressed';
  END IF;

  SELECT string_agg(g.rolname, ',' ORDER BY g.rolname) INTO v_text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(p.proacl) a
    JOIN pg_roles g ON g.oid = a.grantee
   WHERE n.nspname = 'app' AND p.proname = 'record_audit_event' AND a.privilege_type = 'EXECUTE';
  IF v_text IS DISTINCT FROM 'freightos_app,freightos_audit_writer' THEN
    RAISE EXCEPTION '0032: app.record_audit_event grantees changed to %', coalesce(v_text, '(none)');
  END IF;

  -- (r) Zero unqualified authority reads. N5-A adds six RLS-enabled relations, which extends the
  -- catalog-derived protected set 0027 guards; any function body naming one of them without a
  -- schema qualification would be shadowable through pg_temp.
  SELECT count(*) INTO v_int FROM app.unqualified_authority_reads();
  IF v_int <> 0 THEN
    SELECT string_agg(format('%s→%s', signature, relation), ', ') INTO v_text
      FROM app.unqualified_authority_reads();
    RAISE EXCEPTION '0032: unqualified authority reads introduced: %', v_text;
  END IF;

  RAISE NOTICE '0032: N5-A disclosure authorization core installed and asserted';
END
$$;
