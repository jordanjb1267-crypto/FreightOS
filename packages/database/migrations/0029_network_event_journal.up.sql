-- N3 — the universal network event journal.
--
-- The canonical, append-only record of accepted network/domain facts. It answers: what happened,
-- to what, who produced the fact, under which governed schema, when it occurred, when FreightOS
-- observed and recorded it, what caused it, and what it corrects.
--
-- THE CENTRAL SECURITY INVARIANT (ADR-N0003 lineage, restated for events):
--
--   AN EVENT CAN ASSERT A FACT. AN EVENT CANNOT GRANT PERMISSION MERELY BY EXISTING.
--
-- No authorization path reads this table. `organization_id`, `source`, `subject`, `classification`,
-- `event_class`, `schema_ref` and `data` are domain evidence, never authority inputs. The N1
-- participant invariant and the N2 object-reference invariant are inherited unchanged.
--
-- WHAT THIS TABLE IS NOT — ADR-N0008 keeps four artifacts apart and this migration touches none of
-- the others. It is not the security audit ledger (`audit_events` is untouched), not the transport
-- outbox (`outbox_events` is untouched), not a delivery queue, subscriber store, workflow state,
-- command table, marketplace or settlement ledger. No delivery attempt, lease, retry, dead-letter
-- or status column exists here, and none may be added: a mutable field on an immutable journal is
-- how event truth gets contaminated by transport concerns.
--
-- WHY A DEDICATED WRITER ROLE EXISTS. PostgreSQL cannot validate JSON Schema 2020-12, so payload
-- conformance can only be established in the TypeScript acceptance component. If `freightos_app`
-- could INSERT here it would bypass envelope validation, payload validation, exact schema
-- resolution, trusted `recorded_at` and derived `accepted_by` — and because the journal is
-- permanently immutable, a schema-invalid row would be uncorrectable corruption rather than a
-- fixable bug. `freightos_event_writer` is therefore a genuinely new capability, not a convenience.

-- ---------------------------------------------------------------------------
-- §1. The dedicated journal writer.
--
-- Created before anything it must be granted on. Attributes are asserted rather than assumed,
-- because a role that silently acquired LOGIN+SUPERUSER somewhere else in the cluster would make
-- every grant below meaningless.
--
-- NOTE ON MIGRATION AUTHORITY. This migration grants the migrator NO membership of the writer.
-- Migration 0018 needed `GRANT ... TO current_user WITH SET TRUE` only because
-- `freightos_audit_writer` OWNS a definer function and the migrator had to become it to create one.
-- Nothing here is owned by the writer, so the migrator never needs to become it, and the
-- migration-authority convergence contract is left exactly as it was.
--
-- PostgreSQL nonetheless creates one implicitly, and pretending otherwise would be the more
-- dangerous documentation. A CREATEROLE non-superuser that creates a role receives
-- `ADMIN TRUE, INHERIT FALSE, SET FALSE` over it — the behaviour
-- `scripts/converge-migration-authority.sql` already records. ADMIN is what lets the revert drop
-- the role at all. INHERIT is the one that would matter: an inheriting migrator would silently hold
-- the writer's INSERT on an immutable journal, which is the whole boundary this role exists to
-- draw. So the implicit edge is asserted to carry neither INHERIT nor SET rather than assumed to.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_event_writer') THEN
    CREATE ROLE freightos_event_writer
      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
  END IF;
END
$$;

DO $$
DECLARE r record;
BEGIN
  SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication, rolcanlogin
    INTO r FROM pg_roles WHERE rolname = 'freightos_event_writer';
  IF r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication THEN
    RAISE EXCEPTION
      -- Reported under the CATALOG COLUMN names. The migration-text audit in
      -- `identity-migrations.test.ts` forbids a standalone BYPASSRLS/SUPERUSER token anywhere in
      -- migration SQL, comments excluded — correctly, since a text scan cannot tell a message
      -- string from a grant. `rolbypassrls` is what this block actually reads, so naming the
      -- column is both more accurate and outside the keyword the audit reserves.
      'freightos_event_writer must hold no elevated attribute (rolsuper=% rolbypassrls=% '
      'rolcreatedb=% rolcreaterole=% rolreplication=%)',
      r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole, r.rolreplication;
  END IF;
  IF NOT r.rolcanlogin THEN
    RAISE EXCEPTION 'freightos_event_writer must be LOGIN: it is a service credential, not a definer owner';
  END IF;
END
$$;

-- THE WRITER BOUNDARY, asserted at deploy time. The whole point of a narrow writer is lost if it
-- can become a broad identity, or if a broad identity can become it.
DO $$
DECLARE v_detail text;
BEGIN
  SELECT string_agg(format('%s<->%s', m.rolname, r.rolname), ', ')
    INTO v_detail
    FROM pg_auth_members am
    JOIN pg_roles m ON m.oid = am.member
    JOIN pg_roles r ON r.oid = am.roleid
   WHERE (m.rolname = 'freightos_event_writer'
          AND r.rolname IN ('freightos_app', 'freightos_control_plane', 'freightos_admin',
                            'freightos_admin_owner', 'freightos_audit_writer'))
      OR (r.rolname = 'freightos_event_writer'
          AND m.rolname IN ('freightos_app', 'freightos_control_plane', 'freightos_admin'));
  IF v_detail IS NOT NULL THEN
    RAISE EXCEPTION '0029: forbidden membership edge on freightos_event_writer — %', v_detail;
  END IF;
END
$$;

-- The implicit CREATEROLE edge, pinned. Not forbidden — ADMIN is how the revert drops the role —
-- but no membership of the writer, from ANY role, may confer INHERIT or SET. Either would hand a
-- broader identity the writer's INSERT on a permanently immutable table, which is the exact
-- boundary the role was created to draw.
DO $$
DECLARE v_detail text;
BEGIN
  SELECT string_agg(format('%s (admin=%s inherit=%s set=%s)',
                           m.rolname, am.admin_option, am.inherit_option, am.set_option), ', ')
    INTO v_detail
    FROM pg_auth_members am
    JOIN pg_roles m ON m.oid = am.member
    JOIN pg_roles r ON r.oid = am.roleid
   WHERE r.rolname = 'freightos_event_writer'
     AND (am.inherit_option OR am.set_option);
  IF v_detail IS NOT NULL THEN
    RAISE EXCEPTION
      '0029: a membership of freightos_event_writer confers INHERIT or SET — %. '
      'Administering the writer is permitted; becoming it is not.', v_detail;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA app TO freightos_event_writer;
GRANT USAGE ON SCHEMA public TO freightos_event_writer;

-- ---------------------------------------------------------------------------
-- §2. Governed vocabulary.
--
-- Closed and complete from birth. The eight values are the v1.4 contract's own `event_class` enum
-- verbatim — this is adoption, not invention, which is why an enum is safe here where N2 refused
-- one for `object_type`. `ALTER TYPE ... ADD VALUE` cannot run in a transaction, so a partial
-- vocabulary now would guarantee a non-transactional migration later for a change already known.
-- ---------------------------------------------------------------------------

CREATE TYPE app.network_event_class AS ENUM (
  'observed', 'asserted', 'verified', 'derived', 'predicted',
  'command_result', 'correction', 'dispute'
);

-- ---------------------------------------------------------------------------
-- §3. The durable schema projection.
--
-- A DERIVED projection of the canonical `@freightos/schemas` registry — never a second governance
-- source. It exists so a permanently immutable journal row can prove, as a database fact, that its
-- schema reference names a governed contract.
--
-- WHAT THE FOREIGN KEY PROVES, EXACTLY: that the referenced schema identity was governed at
-- acceptance time and stays resolvable forever. WHAT IT DOES NOT PROVE: that the payload conforms
-- to that schema. PostgreSQL cannot evaluate JSON Schema; conformance is established in the
-- TypeScript acceptance path and nowhere else. Any claim otherwise overstates the guarantee.
--
-- The rows are seeded below, BEFORE row-level security is enabled — the 0008 ordering, required
-- because FORCE ROW LEVEL SECURITY binds the owner too and there is deliberately no write policy.
-- ---------------------------------------------------------------------------

CREATE TABLE network_schema_versions (
  durable_schema_ref text PRIMARY KEY,
  registry_schema_id text NOT NULL,
  version            integer NOT NULL CHECK (version >= 1),
  artifact_class     text NOT NULL CHECK (length(btrim(artifact_class)) > 0),
  content_hash       text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  status             text NOT NULL CHECK (status IN ('active', 'deprecated')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT network_schema_versions_identity UNIQUE (registry_schema_id, version),
  -- A durable reference is production-namespaced or is the contract's own canonical id. It is
  -- never a filesystem path and never a floating alias.
  CONSTRAINT network_schema_versions_ref_shape CHECK (durable_schema_ref ~ '^https://')
);

COMMENT ON TABLE network_schema_versions IS
  'Derived projection of the canonical @freightos/schemas registry. Migration-seeded; runtime '
  'INSERT/UPDATE/DELETE are revoked AND no write policy exists. A foreign key to this table proves '
  'the referenced schema identity is governed. It does NOT prove payload conformance — PostgreSQL '
  'cannot evaluate JSON Schema, and conformance is established only in the acceptance component.';

-- The durable-ref → canonical-contract mapping. Immutable: a durable reference may never be
-- repointed at different content. A semantic schema change requires a NEW durable reference.
-- Kept byte-for-byte in step with the package registry by `network-schema-projection-parity`.
INSERT INTO network_schema_versions
  (durable_schema_ref, registry_schema_id, version, artifact_class, content_hash, status) VALUES
  ('https://schemas.rigreceipts.com/network/event-envelope.v1.json',
   'https://schemas.freightos.example/network/event-envelope.v1.json', 1, 'event-envelope',
   'bd704380c2357e3d5a4df01a694384331fef7517c8fe4a6eb4a0b980904c537a', 'active'),
  ('https://schemas.rigreceipts.com/network/command-envelope.v1.json',
   'https://schemas.freightos.example/network/command-envelope.v1.json', 1, 'command-envelope',
   'a9f3d16cf149b35a7190c116e44d3f56fc67432a6db80c7616bc7ae5e7876b96', 'active'),
  ('https://schemas.rigreceipts.com/network/logistics-object-reference.v1.json',
   'https://schemas.freightos.example/network/logistics-object-reference.v1.json', 1,
   'object-reference',
   'eb5cb021cfdf93ff6402ce6959c0de832e2ae5333fba33ed911ec7f69e0cdff9', 'active'),
  ('https://schemas.rigreceipts.com/network/participant-identity.v1.json',
   'https://schemas.freightos.example/network/participant-identity.v1.json', 1,
   'participant-identity',
   'c403cf99be06a2e3f74c171e16c8081c7338038dfc1b129f9778ca5d368e5531', 'active'),
  ('https://schemas.rigreceipts.com/network/capability-advertisement.v1.json',
   'https://schemas.freightos.example/network/capability-advertisement.v1.json', 1,
   'capability-advertisement',
   '76b89dac0e733e221f8ddd651427d536546fef56b29873c86a1914574f42a3b6', 'active'),
  ('https://schemas.rigreceipts.com/network/consent-grant.v1.json',
   'https://schemas.freightos.example/network/consent-grant.v1.json', 1, 'consent-grant',
   'bfe04dd1e0222d9d73cc43252140641fcec9a890532938aa596d81e2da9b7377', 'active'),
  ('https://schemas.rigreceipts.com/network/evidence-envelope.v1.json',
   'https://schemas.freightos.example/network/evidence-envelope.v1.json', 1, 'evidence-envelope',
   'a78903548e297c35986e86a8001622aceb893e0746aa6ff23a2f13fa0c95bd88', 'active'),
  ('https://schemas.rigreceipts.com/network/workflow-state.v1.json',
   'https://schemas.freightos.example/network/workflow-state.v1.json', 1, 'workflow-state',
   'b3baae8a704b7e30ab924fe19c2a5f49bb7d3230fc8b258171a2687e54d5491a', 'active'),
  -- The N3 correction contract is authored under the production namespace, so its canonical id and
  -- its durable reference are the same string. Nothing in the protected tree was edited for it.
  ('https://schemas.rigreceipts.com/network/event-correction.v1.json',
   'https://schemas.rigreceipts.com/network/event-correction.v1.json', 1, 'event-correction',
   '75381aa0971b34bdce58e1d6d01c020d23234e4ae82f535d363efc16c3001f0e', 'active');

-- ---------------------------------------------------------------------------
-- §4. Additive N1 integrity, for the composite organization foreign key.
--
-- `id` is already the primary key, so this UNIQUE is satisfied by every existing row and adds no
-- semantic constraint whatsoever — it exists solely so `(organization_id, organization_type)` can
-- reference `(id, participant_type)`. It grants nothing, changes no policy and changes no ACL. It
-- is one of exactly three approved N1 touches and is named as such in review.
-- ---------------------------------------------------------------------------

ALTER TABLE network_participants
  ADD CONSTRAINT network_participants_id_type_key UNIQUE (id, participant_type);

-- ---------------------------------------------------------------------------
-- §5. The journal.
--
-- Column groups are deliberate and must stay separate:
--   ENVELOPE          — the governed v1.4 contract, stored without semantic widening. CLAIMED.
--   TRUSTED           — established by FreightOS at acceptance. Never caller-supplied.
--   GOVERNED LINEAGE  — extracted only from a schema-validated correction payload.
--
-- The claimed/trusted split is built in before external ingestion exists, so a future external
-- producer cannot spoof internal provenance simply by sending the equivalent fields.
-- ---------------------------------------------------------------------------

CREATE TABLE network_events (
  -- ENVELOPE ----------------------------------------------------------------
  event_id            uuid PRIMARY KEY,
  -- The type namespace is owner-controlled reverse-DNS. The CHECK is what stops a v1.2
  -- `rig.freight.*` type from entering the journal as a native network event: the two vocabularies
  -- are independently versioned (ADR-N0007) and re-typing belongs to an explicit adapter, not to
  -- an accident.
  type                text NOT NULL
    CHECK (type ~ '^com\.rigreceipts\.network\.[a-z0-9_.-]+\.v[0-9]+$'),
  source              text NOT NULL CHECK (length(btrim(source)) > 0),
  -- N2 logistics object references. At least one, per the governed contract.
  subject             jsonb NOT NULL
    CHECK (jsonb_typeof(subject) = 'array' AND jsonb_array_length(subject) >= 1),
  -- The v1.4 envelope's `time`: when the underlying logistics fact occurred. Renamed here because
  -- `time` is a SQL type name and because three timestamps in one row must not be confusable.
  occurred_at         timestamptz NOT NULL,
  organization_id     uuid NOT NULL,
  -- Pinned so the composite foreign key can prove the participant is an ORGANIZATION. Carrying the
  -- type as a column is what makes that provable in the database rather than in a trigger that a
  -- future writer could be granted around.
  organization_type   app.network_participant_type NOT NULL DEFAULT 'organization'
    CHECK (organization_type = 'organization'),
  -- SYNTACTIC ONLY IN N3. No governed vocabulary exists, so this is a non-blank string and nothing
  -- more. Nothing in this database may branch on it — not RLS, not authorization, not disclosure,
  -- not retention, not delivery. `network event authority neutrality` proves that structurally.
  classification      text NOT NULL CHECK (length(btrim(classification)) > 0),
  -- The durable production identity of the PAYLOAD contract governing `data`.
  schema_ref          text NOT NULL REFERENCES network_schema_versions (durable_schema_ref),
  -- The durable production identity of the UNIVERSAL ENVELOPE contract. Distinct from the payload
  -- contract and never conflated with it.
  envelope_schema_ref text NOT NULL REFERENCES network_schema_versions (durable_schema_ref),
  data                jsonb NOT NULL,
  event_class         app.network_event_class,
  correlation_id      uuid,
  -- No foreign key, deliberately: a cause may later be an event, a command, or an externally
  -- accepted artifact, and only the first would ever be resolvable here. The one cheap cycle is
  -- rejected; full traversal is not attempted.
  causation_id        uuid CHECK (causation_id IS DISTINCT FROM event_id),
  workflow_id         text,
  trace_id            text,
  evidence_refs       jsonb CHECK (evidence_refs IS NULL OR jsonb_typeof(evidence_refs) = 'array'),

  -- TRUSTED ACCEPTANCE ------------------------------------------------------
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  accepted_by         text NOT NULL CHECK (length(btrim(accepted_by)) > 0),
  -- Storage/RLS metadata only. NOT part of the governed external envelope, and never producer
  -- supplied — derived from the organization participant's own binding. NULL means the asserting
  -- organization is external (no FreightOS tenant); NULL NEVER MEANS PUBLIC.
  tenant_id           uuid REFERENCES tenants (id),
  -- Identity of the semantic event, for duplicate resolution. NOT the event identity: `event_id`
  -- alone is that. Two different ids with identical content remain two facts.
  event_fingerprint   text NOT NULL CHECK (event_fingerprint ~ '^[0-9a-f]{64}$'),

  -- GOVERNED LINEAGE --------------------------------------------------------
  -- Bare columns. The references are declared at table level below, because BOTH of them are
  -- COMPOSITE — they carry `organization_id` with them.
  corrects_event_id     uuid,
  replacement_event_id  uuid,

  CONSTRAINT network_events_organization_is_participant
    FOREIGN KEY (organization_id, organization_type)
    REFERENCES network_participants (id, participant_type),

  -- The referenced side of the two lineage keys below.
  --
  -- `event_id` REMAINS THE PRIMARY KEY AND THE SOLE EVENT IDENTITY. This is an additional unique
  -- constraint, not a redefinition: `event_id` is already unique, so `(event_id, organization_id)`
  -- is unique for free and adds no semantic constraint whatsoever. It exists only because
  -- PostgreSQL requires a foreign key's referenced columns to carry a unique constraint, and the
  -- lineage keys must reference the PAIR.
  CONSTRAINT network_events_id_organization_key UNIQUE (event_id, organization_id),

  -- Lineage is present exactly when the event is a correction, and both halves travel together.
  -- `IS NOT DISTINCT FROM` rather than `=` because a NULL event_class would make `=` yield NULL,
  -- which a CHECK treats as satisfied — the quiet way this constraint would stop constraining.
  CONSTRAINT network_events_correction_lineage CHECK (
    (event_class IS NOT DISTINCT FROM 'correction'::app.network_event_class)
      = (corrects_event_id IS NOT NULL)
    AND (corrects_event_id IS NULL) = (replacement_event_id IS NULL)
  ),
  CONSTRAINT network_events_correction_targets CHECK (
    corrects_event_id IS NULL
    OR (corrects_event_id <> event_id
        AND replacement_event_id <> event_id
        AND corrects_event_id <> replacement_event_id)
  ),

  -- THE CORRECTION ORGANIZATION INVARIANT.
  --
  --   A correction may correct and replace only events belonging to the SAME canonical
  --   organization as the correction itself.
  --
  -- One organization challenging another organization's fact is a `dispute`, which is a governed
  -- event class in its own right. It is NOT a correction, and N3 implements no cross-organization
  -- correction or delegation semantics.
  --
  -- ENFORCED AS REFERENTIAL INTEGRITY, NOT AS A READ. The alternative — have the acceptance
  -- component SELECT each target's `organization_id` and compare — would require giving
  -- `freightos_event_writer` a global read of journal organization metadata, which is exactly the
  -- privilege N3 spent its column-level design avoiding. Referential-integrity checks run as the
  -- REFERENCED table's owner and are not subject to row-level security or to the inserting role's
  -- privileges, so the database can prove this about rows the writer cannot see at all.
  --
  -- MATCH SIMPLE, WHICH IS THE DEFAULT AND IS LOAD-BEARING. Under MATCH SIMPLE a composite key with
  -- ANY column NULL is satisfied without a lookup. `organization_id` is NOT NULL always, so the key
  -- is checked exactly when `corrects_event_id`/`replacement_event_id` is present — which is
  -- exactly when the event is a correction. MATCH FULL would reject every ordinary event, because
  -- (NULL, organization) is neither all-null nor all-non-null.
  --
  -- IT IS ALSO WHAT CLOSES THE EXISTENCE ORACLE. The key is the PAIR, so `(foreign_event, my_org)`
  -- is absent whether or not `foreign_event` exists under some other organization. A correction can
  -- therefore never be used to confirm that another organization's event id is real: both cases
  -- fail identically, with the same constraint and the same detail.
  CONSTRAINT network_events_corrects_same_organization
    FOREIGN KEY (corrects_event_id, organization_id)
    REFERENCES network_events (event_id, organization_id),
  CONSTRAINT network_events_replacement_same_organization
    FOREIGN KEY (replacement_event_id, organization_id)
    REFERENCES network_events (event_id, organization_id)
);

COMMENT ON TABLE network_events IS
  'Canonical append-only journal of accepted network/domain facts — ADR-N0008. Not the audit '
  'ledger, not the outbox, not a delivery queue. An event asserts a fact; it grants no authority. '
  'Corrections are new events carrying lineage; nothing here is ever updated.';

-- ---------------------------------------------------------------------------
-- §6. Trusted acceptance metadata, derived in the database.
--
-- Whatever the caller supplied for `recorded_at`, `accepted_by` and `tenant_id` is DISCARDED. The
-- acceptance component already omits them, so this is defence in depth against a future writer
-- that forgets — the same posture N1 took with provenance, and the reason a spoofed provenance
-- test can be written at all.
--
-- INVOKER RIGHTS, DELIBERATELY. A SECURITY DEFINER here would read past the participant policy to
-- resolve the tenant, which is adding privileged code to work around row-level security. Instead
-- the writer holds a narrow, explicit participant SELECT policy and this function sees exactly what
-- the writer sees. Reads are schema-qualified because both relations are RLS-enabled and therefore
-- protected under migration 0027's guard.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.network_event_acceptance() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant uuid;
  v_seen   boolean := false;
BEGIN
  SELECT p.tenant_id, true INTO v_tenant, v_seen
    FROM public.network_participants p
   WHERE p.id = NEW.organization_id
     AND p.participant_type = 'organization';

  -- The composite foreign key already proves the participant exists and is an organization, and
  -- referential checks are not subject to row-level security. This lookup can therefore only fail
  -- because the WRITER cannot see the row — a policy misconfiguration, not a bad event. Raising a
  -- distinct error keeps the two causes from being confused during an incident.
  IF NOT v_seen THEN
    RAISE EXCEPTION
      'network event acceptance cannot resolve organization %: the writer holds no visibility of it',
      NEW.organization_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  NEW.tenant_id   := v_tenant;
  NEW.recorded_at := now();
  NEW.accepted_by := coalesce(app.current_actor_id(), session_user);
  RETURN NEW;
END
$$;

CREATE TRIGGER network_events_acceptance
  BEFORE INSERT ON network_events
  FOR EACH ROW EXECUTE FUNCTION app.network_event_acceptance();

-- Append-only, using the established shared rejector. Two layers: this trigger, and the revoked
-- privileges in §8. Neither is sufficient alone — the trigger is bypassed by TRUNCATE, and ACLs
-- have been granted around before.
CREATE TRIGGER network_events_no_update
  BEFORE UPDATE ON network_events
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER network_events_no_delete
  BEFORE DELETE ON network_events
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER network_schema_versions_no_update
  BEFORE UPDATE ON network_schema_versions
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER network_schema_versions_no_delete
  BEFORE DELETE ON network_schema_versions
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

-- ---------------------------------------------------------------------------
-- §7. Indexes — only what core access and integrity semantics justify.
-- ---------------------------------------------------------------------------

-- Tenant-scoped recency: the shape every RLS-filtered read takes.
CREATE INDEX network_events_tenant_recorded_idx ON network_events (tenant_id, recorded_at DESC);
-- Interaction reconstruction (ADR-N0009): correlation is how a business interaction is reassembled.
CREATE INDEX network_events_correlation_idx ON network_events (correlation_id)
  WHERE correlation_id IS NOT NULL;
-- Lineage walks, both directions — AND the referencing side of the two organization-scoped lineage
-- foreign keys.
--
-- NOT PARTIAL, and the column order is not cosmetic. F-20 requires a foreign key's columns to be a
-- PREFIX of some non-partial index, in `conkey` order. A `WHERE corrects_event_id IS NOT NULL`
-- index would read as sufficient — most lineage rows are NULL — but the planner cannot prove a
-- referential check falls inside that predicate, so it would leave every key check scanning the
-- whole journal. That is R2-04's lesson, applied before it becomes an incident rather than after.
CREATE INDEX network_events_corrects_idx
  ON network_events (corrects_event_id, organization_id);
CREATE INDEX network_events_replacement_idx
  ON network_events (replacement_event_id, organization_id);
-- Schema-impact queries: "which accepted events reference this governed contract".
CREATE INDEX network_events_schema_ref_idx ON network_events (schema_ref);
-- F-20: the REFERENCING side of the composite organization foreign key. Without it, PostgreSQL
-- must sequentially scan the entire journal to enforce the key whenever a participant row is
-- deleted or its key columns change — on the highest-write append-only table in the system, and
-- while holding a lock on the registry. The column order matches `conkey` so the key's columns are
-- a prefix of the index, which is what makes it usable for the check.
CREATE INDEX network_events_organization_idx
  ON network_events (organization_id, organization_type);

-- ---------------------------------------------------------------------------
-- §8. Row-level security and privileges.
--
-- JOURNAL READ MODEL, inherited from N1: control plane sees everything; a tenant sees its own
-- rows; a foreign tenant sees nothing; NULL-tenant rows (externally asserted facts) are
-- control-plane only. `tenant_id IS NOT NULL` is stated explicitly even though `NULL = anything` is
-- already unknown, so that a later "fix" to `IS NOT DISTINCT FROM` is visibly wrong.
--
-- Classification NEVER appears in a policy. `organization_id` NEVER substitutes for tenant
-- authorization. Both are asserted structurally in the test suite.
--
-- THE WRITER'S READ IS DELIBERATELY SPLIT FROM ITS POLICY. The policy lets it see every row; the
-- COLUMN privileges let it read only `event_id` and `event_fingerprint`. Duplicate resolution needs
-- global identity visibility and nothing else, and column-level ACL is what turns "needs to compare
-- fingerprints" into "cannot read anyone's payload".
-- ---------------------------------------------------------------------------

ALTER TABLE network_schema_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_schema_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE network_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_events FORCE ROW LEVEL SECURITY;

-- Governance reference data: globally readable, and — because FORCE binds the owner and NO write
-- policy exists — writable by nobody at all, including the migrator, once this migration ends.
-- That is a second, independent layer behind the revoked privileges below, and it is why this
-- table does not mechanically copy the tenant RLS shape: it has no tenant dimension to copy.
CREATE POLICY network_schema_versions_read ON network_schema_versions FOR SELECT USING (true);

CREATE POLICY network_events_read ON network_events FOR SELECT
  TO freightos_app, freightos_control_plane, freightos_admin_owner, freightos_migrator
  USING (
    app.is_control_plane()
    OR (tenant_id IS NOT NULL AND tenant_id = (SELECT app.current_tenant_id()))
  );

-- Identity-only global read, for duplicate resolution. Paired with column privileges below.
CREATE POLICY network_events_writer_identity_read ON network_events FOR SELECT
  TO freightos_event_writer
  USING (true);

-- The insert path. Row validity is established by the acceptance component (schema conformance),
-- by the constraints and foreign keys above, and by the acceptance trigger — not by a policy
-- predicate, which cannot evaluate any of them.
CREATE POLICY network_events_writer_insert ON network_events FOR INSERT
  TO freightos_event_writer
  WITH CHECK (true);

-- No UPDATE policy. No DELETE policy. Anywhere. Correction is another event.

-- Reference data is readable by the runtime; it is governance metadata, not a secret.
GRANT SELECT ON network_schema_versions TO freightos_app;
GRANT SELECT ON network_schema_versions TO freightos_control_plane;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_schema_versions FROM freightos_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_schema_versions FROM freightos_control_plane;

-- THE WRITER GETS NOTHING HERE, and the omission is load-bearing rather than an oversight.
--
-- The obvious assumption is that it needs SELECT for `network_events.schema_ref`'s foreign key to
-- resolve. It does not: PostgreSQL enforces referential integrity through internal triggers that
-- run as the REFERENCED table's owner, so the key is checked — and an unknown `schema_ref` is still
-- rejected — with the inserting role holding no privilege on this table at all. That was verified
-- against PostgreSQL 16 rather than assumed, and `the schema projection` asserts both halves.
--
-- The writer also never reads this table in code: `acceptNetworkEvent` resolves contracts from the
-- canonical package registry, because a projection cannot validate JSON Schema. A grant issued for
-- a read that never happens is privilege with no purpose to lose.
REVOKE ALL PRIVILEGES ON network_schema_versions FROM freightos_event_writer;

-- Journal reads for the runtime, under the tenant policy above.
GRANT SELECT ON network_events TO freightos_app;
GRANT SELECT ON network_events TO freightos_control_plane;
-- NO INSERT for freightos_app. This is the primary N3 security boundary: the application runtime
-- cannot place a row in the canonical journal without passing through the acceptance component.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_events FROM freightos_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_events FROM freightos_control_plane;

-- The writer: insert, plus COLUMN-LEVEL select on exactly two columns.
GRANT INSERT ON network_events TO freightos_event_writer;
GRANT SELECT (event_id, event_fingerprint) ON network_events TO freightos_event_writer;
REVOKE UPDATE, DELETE, TRUNCATE ON network_events FROM freightos_event_writer;

-- The narrowest participant visibility that tenant derivation requires — three columns, one
-- policy, organizations only. Not the alias table, not the relationship table, not display
-- metadata, not directory browsing. This is an explicit governed N1 touch.
GRANT SELECT (id, participant_type, tenant_id) ON network_participants TO freightos_event_writer;

CREATE POLICY network_participants_event_writer_read ON network_participants FOR SELECT
  TO freightos_event_writer
  USING (participant_type = 'organization');

-- ---------------------------------------------------------------------------
-- §9. Assert the additions did not weaken anything.
-- ---------------------------------------------------------------------------

DO $assert$
DECLARE
  v_n integer;
  v_detail text;
BEGIN
  -- Migration 0027's catalog-derived guard now covers two more RLS-enabled relations. An
  -- unqualified read of either from app/admin/authn would be resolvable through pg_temp.
  SELECT count(*), coalesce(string_agg(format('%s reads %s', function_name, relation_name), '; '), '')
    INTO v_n, v_detail FROM app.unqualified_authority_reads();
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0029: % unqualified read(s) of a protected relation — %', v_n, v_detail;
  END IF;

  -- N3 adds no privileged code.
  SELECT count(*) INTO v_n
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'app' AND p.proname LIKE 'network\_event%' AND p.prosecdef;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0029: % SECURITY DEFINER function(s) in the event journal', v_n;
  END IF;

  -- Both new tables carry ENABLE + FORCE.
  SELECT count(*), coalesce(string_agg(c.relname, ', '), '') INTO v_n, v_detail
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relname IN ('network_events', 'network_schema_versions')
     AND NOT (c.relrowsecurity AND c.relforcerowsecurity);
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0029: % table(s) without ENABLE+FORCE RLS: %', v_n, v_detail;
  END IF;

  -- freightos_app must hold no write on the journal, by any route.
  IF has_table_privilege('freightos_app', 'network_events', 'INSERT') THEN
    RAISE EXCEPTION '0029: freightos_app holds INSERT on network_events — the acceptance boundary is open';
  END IF;

  -- The projection must be write-sealed for every runtime identity.
  SELECT count(*), coalesce(string_agg(format('%s:%s', who, priv), ', '), '') INTO v_n, v_detail
    FROM unnest(ARRAY['freightos_app', 'freightos_control_plane', 'freightos_event_writer']) AS who
    CROSS JOIN unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) AS priv
   WHERE has_table_privilege(who, 'network_schema_versions', priv);
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0029: network_schema_versions is runtime-writable — %', v_detail;
  END IF;

  -- THE CORRECTION ORGANIZATION INVARIANT, asserted structurally.
  --
  -- Read from `pg_constraint` rather than trusted from the DDL above, because the failure mode this
  -- guards is a LATER change: a single-column lineage key still enforces "points at a real event"
  -- and every existing correction test would keep passing, while cross-organization corrections
  -- silently became possible. Both keys must carry `organization_id` and both must reference the
  -- pair.
  SELECT count(*), coalesce(string_agg(format('%s(%s)', conname,
           (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
              FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum)), '; '), '')
    INTO v_n, v_detail
    FROM pg_catalog.pg_constraint c
   WHERE c.conrelid = 'network_events'::regclass
     AND c.contype = 'f'
     AND c.confrelid = 'network_events'::regclass
     AND array_length(c.conkey, 1) = 2
     AND (SELECT a.attname FROM pg_attribute a
           WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[2]) = 'organization_id'
     AND (SELECT a.attname FROM pg_attribute a
           WHERE a.attrelid = c.confrelid AND a.attnum = c.confkey[2]) = 'organization_id';
  IF v_n <> 2 THEN
    RAISE EXCEPTION
      '0029: expected 2 organization-scoped self-referencing lineage keys on network_events, '
      'found % (%). A correction may only correct and replace facts of its OWN organization; '
      'cross-organization challenge is the `dispute` event class, not a correction.', v_n, v_detail;
  END IF;
END
$assert$;
