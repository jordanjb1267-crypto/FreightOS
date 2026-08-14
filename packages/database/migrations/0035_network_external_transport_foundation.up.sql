-- ---------------------------------------------------------------------------
-- N7-A — external transport foundation. THE CONTROL PLANE, AND NO NETWORK.
--
-- N6 ends with an artifact in an internal inbox. Everything about WHAT may be disclosed is settled
-- and frozen by then. N7 is the first phase that could cause an irreversible external effect, and
-- this migration builds every part of it EXCEPT that effect: the destination registry, the transport
-- obligation, the brokered permit, the attempt journal, and the identity that will one day open a
-- socket. It opens none.
--
-- THE PRIMARY SECURITY INVARIANT, and the reason the role split below exists:
--
--     authorization role  !=  egress role
--
-- `freightos_delivery_worker` re-runs N6 reauthorization and MINTS PERMITS. It holds no egress.
-- `freightos_transport_worker` will one day execute transport. It holds NO N5 authority: no read of
-- grants, revocations, sensitivities, ceilings or subscriptions, and it cannot mint its own permit.
-- Neither can become the other. That separation is what makes a compromise of the egress-capable
-- process bounded, and it is enforced by privilege rather than by convention.
--
-- WHAT THIS MIGRATION DOES NOT BUILD: no HTTP client, no socket, no DNS, no redirect handling, no
-- credential resolution, no secret, no adapter, no replay. `NETWORK_EGRESS=PASS` and
-- `NETWORK_EGRESS_ALLOWLIST=PASS` (zero approved modules) both hold after it.
--
-- Owner rulings frozen here: OR-02 (dedicated egress worker), OR-03 (prospective obligation),
-- OR-04 (0..N destinations, one obligation each), OR-05 (brokered permit), OR-06 (recipient-side
-- endpoint administration), OR-07 (credential reference only), OR-08 (purpose is routing, never
-- authority), OR-09 (retry constants), OR-10 (no replay), OR-12 (no automatic purge).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- §1. Vocabulary.
--
-- Three enums, all closed. `https_webhook` is the ONLY destination kind and it is NOT implemented —
-- the value exists so the registry can be typed, and the database refuses anything else. A second
-- kind cannot be introduced by writing a string, only by a migration that adds a label and the
-- adapter to go with it.
-- ---------------------------------------------------------------------------

CREATE TYPE app.network_transport_destination_kind AS ENUM ('https_webhook');

-- The obligation's lifecycle. Deliberately NOT N6's vocabulary: `delivered` there means the
-- internal inbox committed, and overloading it to also mean "left the building" would destroy the
-- distinction the whole band exists to preserve.
--
--   TRANSPORT OWED != DISCLOSURE AUTHORIZED != DELIVERY ATTEMPTED
--       != INTERNALLY DELIVERED != EXTERNALLY ACCEPTED
--
-- `accepted` is the strongest state N7-A defines. There is no `processed`: a remote acknowledgement
-- is not evidence a counterparty acted on a disclosure (OR-11).
CREATE TYPE app.network_external_transport_state AS ENUM (
  'pending',
  'failed_retryable',
  'accepted',
  'terminated_failed',
  'terminated_unauthorized',
  'terminated_destination_disabled'
);

-- The closed failure taxonomy. `failed` alone is prohibited: it collapses "we are misconfigured"
-- with "they are down", and those have different operators and different urgency.
--
-- `egress_disabled` and `authorization_withdrawn` are NOT transport failures and are separated
-- deliberately — an operator must be able to tell "we chose not to send" from "we tried and could
-- not". Neither may consume a transport attempt (§9).
CREATE TYPE app.network_external_transport_attempt_outcome AS ENUM (
  'accepted',
  'configuration_invalid',
  'destination_disabled',
  'egress_disabled',
  'authorization_withdrawn',
  'authentication_failed',
  'address_rejected',
  'connection_failed',
  'timeout',
  'rate_limited',
  'remote_rejected_retryable',
  'remote_rejected_terminal',
  'protocol_invalid',
  'internal_error'
);

-- ---------------------------------------------------------------------------
-- §2. The transport runtime identity — OR-02.
--
-- A SECOND worker, and the second one is the point. `freightos_delivery_worker` can read every
-- authorized artifact and the entire governed authorization state; giving that identity the ability
-- to open sockets would mean one process compromise crosses both trust boundaries at once.
--
-- The operational argument is as strong: under reuse, "stop all external transport" and "stop
-- internal delivery" are the same lever, because they are the same role. Separated, an egress kill
-- switch can exist at all.
--
-- INHERIT is left at PostgreSQL's default, matching every other service role in this repository
-- (`freightos_event_writer`, `freightos_delivery_worker`). It is INERT here and asserted to stay so:
-- the role holds no membership of anything, and §2c refuses any membership that would confer
-- INHERIT or SET. A NOINHERIT role with no memberships and an INHERIT role with no memberships have
-- identical authority; what matters is the membership graph, which is what is pinned.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_transport_worker') THEN
    CREATE ROLE freightos_transport_worker
      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
  END IF;
END
$$;

DO $$
DECLARE r record;
BEGIN
  SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication, rolcanlogin
    INTO r FROM pg_roles WHERE rolname = 'freightos_transport_worker';
  IF r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication THEN
    RAISE EXCEPTION
      'freightos_transport_worker must hold no elevated attribute (rolsuper=% rolbypassrls=% '
      'rolcreatedb=% rolcreaterole=% rolreplication=%)',
      r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole, r.rolreplication;
  END IF;
  IF NOT r.rolcanlogin THEN
    RAISE EXCEPTION 'freightos_transport_worker must be LOGIN: it is a service credential';
  END IF;
END
$$;

-- §2b. THE SEPARATION, asserted at deploy time.
--
-- No edge in EITHER direction between the transport worker and any authority-bearing role — and
-- `freightos_delivery_worker` is named explicitly because it is the one the transport worker is
-- most likely to be conflated with. A transport identity that could become the delivery worker
-- would hold N5 read access; a delivery worker that could become the transport identity would hold
-- egress. Both defeat OR-02.
DO $$
DECLARE v_detail text;
BEGIN
  SELECT string_agg(format('%s<->%s', m.rolname, r.rolname), ', ')
    INTO v_detail
    FROM pg_auth_members am
    JOIN pg_roles m ON m.oid = am.member
    JOIN pg_roles r ON r.oid = am.roleid
   WHERE (m.rolname = 'freightos_transport_worker'
          AND r.rolname IN ('freightos_app', 'freightos_control_plane', 'freightos_admin',
                            'freightos_admin_owner', 'freightos_audit_writer',
                            'freightos_event_writer', 'freightos_delivery_worker'))
      OR (r.rolname = 'freightos_transport_worker'
          AND m.rolname IN ('freightos_app', 'freightos_control_plane', 'freightos_admin',
                            'freightos_event_writer', 'freightos_delivery_worker'));
  IF v_detail IS NOT NULL THEN
    RAISE EXCEPTION
      '0035: forbidden membership edge on freightos_transport_worker — %. '
      'authorization role != egress role.', v_detail;
  END IF;
END
$$;

-- §2c. ADMIN alone. The migrator's implicit edge is how the revert drops the role; INHERIT or SET
-- from ANY role would hand a broader identity the ability to execute external transport.
DO $$
DECLARE v_detail text;
BEGIN
  SELECT string_agg(format('%s (admin=%s inherit=%s set=%s)',
                           m.rolname, am.admin_option, am.inherit_option, am.set_option), ', ')
    INTO v_detail
    FROM pg_auth_members am
    JOIN pg_roles m ON m.oid = am.member
    JOIN pg_roles r ON r.oid = am.roleid
   WHERE r.rolname = 'freightos_transport_worker'
     AND (am.inherit_option OR am.set_option);
  IF v_detail IS NOT NULL THEN
    RAISE EXCEPTION
      '0035: a membership of freightos_transport_worker confers INHERIT or SET — %. '
      'ADMIN alone is expected from the creating role; INHERIT or SET is an escalation.',
      v_detail;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- §3. The referenceable key N7 needs from N6.
--
-- The permit binds the artifact digest (§6), and a digest carried in two places with nothing
-- forcing agreement is the R-07 defect. `artifact_id` is already the primary key, so this adds NO
-- uniqueness — it exists solely so a child can name the artifact AND its digest as ONE referential
-- fact. Exactly the shape 0034 introduced for `(artifact_id, recipient_participant_id)`.
--
-- This is the only change 0035 makes to an N6 relation, it is additive, and it alters no N6
-- behaviour: no policy, no privilege, no trigger, no column.
-- ---------------------------------------------------------------------------

ALTER TABLE network_disclosure_artifacts
  ADD CONSTRAINT network_disclosure_artifacts_id_digest_key
  UNIQUE (artifact_id, payload_digest);

-- ---------------------------------------------------------------------------
-- §4. Destinations — governed ROUTING configuration, never disclosure authority.
--
-- A destination answers "should this ALREADY-AUTHORIZED artifact be routed here?". It never answers
-- "may this recipient see these fields?" — N5 is the sole disclosure authority and a destination
-- row can neither widen an artifact nor create one.
--
-- IDENTITY IS IMMUTABLE, ALL OF IT. There is no UPDATE path: an endpoint that could be UPDATEd
-- makes "where did artifact X actually go" unanswerable from the row, which is the question the
-- audit record exists to answer. Changing a destination is create-new + revoke-old (OR-06).
--
-- ELIGIBILITY IS EXACT. `purpose_code` and `durable_schema_ref` are governed references, matched
-- exactly. No prefix, no family, no "v1.x implies v1.y" — mutation D-Q's lesson, carried forward:
-- a new durable schema version is NOT automatically compatible with a destination.
-- ---------------------------------------------------------------------------

CREATE TABLE network_transport_destinations (
  destination_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- PARTICIPANT IDENTITY, NOT A BARE UUID and never a tenant. Same registry doctrine N6 uses on
  -- subscriptions, artifacts and the inbox.
  recipient_participant_id   uuid NOT NULL,
  recipient_participant_type app.network_participant_type
    GENERATED ALWAYS AS ('organization'::app.network_participant_type) STORED,

  destination_kind app.network_transport_destination_kind NOT NULL,

  -- ROUTING eligibility. Both governed, both exact.
  purpose_code       text NOT NULL REFERENCES network_disclosure_purposes (code),
  durable_schema_ref text NOT NULL REFERENCES network_schema_versions (durable_schema_ref),

  -- An opaque configuration reference. NOT dereferenced by anything in this migration and NOT a
  -- runtime argument anywhere: a future adapter resolves it from `destination_id` and from nothing
  -- a caller supplies. The CHECK refuses an inline scheme, which is what a raw URL would look like —
  -- whether endpoints are ultimately stored inline is OR-06's open half, and until it is ruled the
  -- column holds a reference only.
  endpoint_ref text NOT NULL
    CHECK (length(btrim(endpoint_ref)) > 0 AND endpoint_ref !~* '^[a-z][a-z0-9+.-]*://'),

  -- A REFERENCE, never credential material — OR-07. The CHECK mirrors the constraint
  -- `service_account_credentials` already carries: no bearer token, no key, no secret.
  credential_ref text
    CHECK (credential_ref IS NULL
           OR (length(btrim(credential_ref)) > 0
               AND credential_ref !~* '^(bearer|basic|token|secret|key|-----begin)')),

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT current_user CHECK (length(btrim(created_by)) > 0),

  CONSTRAINT network_transport_destinations_recipient_is_organization
    FOREIGN KEY (recipient_participant_id, recipient_participant_type)
    REFERENCES network_participants (id, participant_type),

  -- THE KEY THE OBLIGATION BINDS AGAINST. `destination_id` is already the primary key, so this adds
  -- no uniqueness; it exists so a transport can name the destination AND its recipient as one
  -- referential fact. The mirror of `network_disclosure_artifacts_id_recipient_key`, and the reason
  -- artifact-recipient ≠ destination-recipient is unrepresentable rather than merely refused.
  CONSTRAINT network_transport_destinations_id_recipient_key
    UNIQUE (destination_id, recipient_participant_id)
);

-- F-20 support for the composite participant key.
CREATE INDEX network_transport_destinations_recipient_idx
  ON network_transport_destinations (recipient_participant_id, recipient_participant_type);

-- Routing lookup: which destinations are eligible for this recipient, purpose and contract.
CREATE INDEX network_transport_destinations_eligibility_idx
  ON network_transport_destinations (recipient_participant_id, purpose_code, durable_schema_ref);

COMMENT ON TABLE network_transport_destinations IS
  'N7 routing configuration. Governs WHERE an already-authorized artifact may be transported. '
  'Grants no field and no disclosure authority. Immutable; changed by create-new + revoke-old.';

-- ---------------------------------------------------------------------------
-- §5. Destination revocations — append-only, at most one per destination.
--
-- No `enabled boolean`. A flag that can be set back to true is a pause with an audit gap — N5-A's
-- words about grants, N6's about subscriptions, and they apply unchanged. Eligibility is DERIVED
-- from the absence of a revocation row.
--
-- Revocation stops the FUTURE and rewrites no history: obligations already accepted stay accepted,
-- and re-enabling means a new destination identity, not a resurrection (OR-10 — resurrecting one
-- would be replay through the back door).
-- ---------------------------------------------------------------------------

CREATE TABLE network_transport_destination_revocations (
  revocation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  destination_id uuid NOT NULL UNIQUE
    REFERENCES network_transport_destinations (destination_id),

  reason     text NOT NULL CHECK (length(btrim(reason)) > 0),
  revoked_at timestamptz NOT NULL DEFAULT now(),
  revoked_by text NOT NULL DEFAULT current_user CHECK (length(btrim(revoked_by)) > 0)
);

-- ---------------------------------------------------------------------------
-- §6. External transport obligations — THE LOAD-BEARING TABLE.
--
-- One row per (artifact, destination) that must leave. Created ONLY from a committed N6 inbox row
-- (OR-03): an artifact without an inbox row was authorized but not internally delivered, and N7 has
-- no business with it. `inbox_id` is a foreign key, not a comment, so "no internal delivery, no
-- external obligation" is impossible rather than merely true.
--
-- THE DETAIL THAT DOES THE WORK: `recipient_participant_id` is written ONCE, and BOTH composite
-- foreign keys resolve against it. "The artifact's recipient equals the destination's recipient" is
-- therefore the shape of the row, not a rule anyone has to remember — `artifact for A + destination
-- owned by B` is unrepresentable. This is R-08 and R-11 applied before they can happen again, and
-- it is why the columns are composite rather than three independent `uuid REFERENCES`.
--
-- NO independently supplied event, subscription, payload or digest. All are reachable from
-- `artifact_id`, and every one carried separately would be a fresh instance of the R-07 shape.
-- ---------------------------------------------------------------------------

CREATE TABLE network_external_transports (
  transport_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  artifact_id    uuid NOT NULL,
  destination_id uuid NOT NULL,
  -- WRITTEN ONCE. Both keys below constrain this same column.
  recipient_participant_id uuid NOT NULL,

  -- The obligation's origin fact: internal delivery COMMITTED.
  inbox_id uuid NOT NULL REFERENCES network_disclosure_inbox (inbox_id),

  state app.network_external_transport_state NOT NULL DEFAULT 'pending',

  attempt_count   integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz,

  terminal_reason text CHECK (terminal_reason IS NULL OR length(btrim(terminal_reason)) > 0),

  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),

  created_at    timestamptz NOT NULL DEFAULT now(),
  accepted_at   timestamptz,
  terminated_at timestamptz,

  CONSTRAINT network_external_transports_artifact_binding
    FOREIGN KEY (artifact_id, recipient_participant_id)
    REFERENCES network_disclosure_artifacts (artifact_id, recipient_participant_id),

  CONSTRAINT network_external_transports_destination_binding
    FOREIGN KEY (destination_id, recipient_participant_id)
    REFERENCES network_transport_destinations (destination_id, recipient_participant_id),

  -- ONE artifact + ONE destination = at most ONE automatic obligation, UNCONDITIONALLY.
  -- Not partial-on-non-terminal: a terminated obligation must not be silently recreatable, because
  -- recreating one is replay wearing a retry's clothes. This is the idempotency IDENTITY — it is
  -- not a claim of exactly-once remote delivery, which no sender can make alone.
  CONSTRAINT network_external_transports_one_per_artifact_destination
    UNIQUE (artifact_id, destination_id),

  -- The key the permit binds against, so a permit names the transport AND the pair it is for as one
  -- referential fact.
  CONSTRAINT network_external_transports_identity_key
    UNIQUE (transport_id, artifact_id, destination_id),

  CONSTRAINT network_external_transports_accepted_shape
    CHECK ((state = 'accepted') = (accepted_at IS NOT NULL)),
  CONSTRAINT network_external_transports_terminated_shape
    CHECK ((state IN ('terminated_failed', 'terminated_unauthorized',
                      'terminated_destination_disabled')) = (terminated_at IS NOT NULL))
);

-- F-20 support, on each constraint's exact column list and in its order.
CREATE INDEX network_external_transports_artifact_binding_idx
  ON network_external_transports (artifact_id, recipient_participant_id);
CREATE INDEX network_external_transports_destination_binding_idx
  ON network_external_transports (destination_id, recipient_participant_id);

CREATE INDEX network_external_transports_eligible
  ON network_external_transports (state, next_attempt_at)
  WHERE state IN ('pending', 'failed_retryable');

COMMENT ON TABLE network_external_transports IS
  'N7 external transport obligation. Bound to one N6 artifact and one destination that share a '
  'recipient. Created only from a committed inbox row. Never replayed.';

-- ---------------------------------------------------------------------------
-- §7. Brokered egress permits — OR-05, and the reason the role split is real.
--
-- A permit is a FRESH N6 reauthorization decision authorizing ONE external attempt to send ONE
-- already-frozen artifact to ONE already-bound destination.
--
-- It is NOT a new N5 grant, not a disclosure policy, not a replay token, and not a bearer capability
-- reusable across destinations. It carries no authority of its own: it is evidence that the
-- authorization side said yes, at a moment, for exactly one attempt.
--
-- WHY IT EXISTS. Option A (authorization final at inbox commit) leaves a revoked grant unable to
-- stop a pending send. Option B (fresh N5 on every attempt) forces the egress-capable role to read
-- grants, ceilings and subscriptions — exactly the surface OR-02 withholds from it. The permit is
-- the only shape that keeps both properties: the NON-EGRESS side re-runs reauthorization and mints;
-- the EGRESS side reads a permit and never sees N5 at all.
--
-- ATTEMPT-SCOPED, and bound to the same absolute deadline a future network attempt will enforce.
-- A permit for attempt N cannot authorize attempt N+1 — `UNIQUE (transport_id, attempt_number)` —
-- and cannot outlive `not_after`. There is no separate long-lived TTL to reason about.
-- ---------------------------------------------------------------------------

CREATE TABLE network_external_transport_permits (
  permit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  transport_id   uuid NOT NULL,
  artifact_id    uuid NOT NULL,
  destination_id uuid NOT NULL,

  -- WHICH attempt. Scoping is the whole point: a permit is spent by the attempt it names.
  attempt_number integer NOT NULL CHECK (attempt_number > 0),

  -- The bytes this permit authorizes, bound to the artifact rather than restated beside it.
  artifact_digest text NOT NULL CHECK (artifact_digest ~ '^[0-9a-f]{64}$'),

  -- WHICH N5 decision said yes. The same composite digest N6 records, so a permit is traceable to
  -- the evaluation that produced it.
  composite_decision_digest text NOT NULL CHECK (composite_decision_digest ~ '^[0-9a-f]{64}$'),

  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by text NOT NULL DEFAULT current_user CHECK (length(btrim(issued_by)) > 0),

  -- THE ABSOLUTE ATTEMPT DEADLINE. Not a permit TTL — the same boundary the future attempt enforces.
  not_after timestamptz NOT NULL,

  -- The transport AND the pair it is for, as one referential fact. A permit cannot be replayed
  -- against another obligation because the artifact and destination it names must be that
  -- transport's own.
  CONSTRAINT network_external_transport_permits_transport_binding
    FOREIGN KEY (transport_id, artifact_id, destination_id)
    REFERENCES network_external_transports (transport_id, artifact_id, destination_id),

  -- The digest is the ARTIFACT's, enforced rather than copied. Without this the permit could name
  -- bytes the artifact does not have — R-07, one layer out.
  CONSTRAINT network_external_transport_permits_digest_binding
    FOREIGN KEY (artifact_id, artifact_digest)
    REFERENCES network_disclosure_artifacts (artifact_id, payload_digest),

  CONSTRAINT network_external_transport_permits_one_per_attempt
    UNIQUE (transport_id, attempt_number),

  CONSTRAINT network_external_transport_permits_window
    CHECK (not_after > issued_at)
);

CREATE INDEX network_external_transport_permits_transport_binding_idx
  ON network_external_transport_permits (transport_id, artifact_id, destination_id);
CREATE INDEX network_external_transport_permits_digest_binding_idx
  ON network_external_transport_permits (artifact_id, artifact_digest);

COMMENT ON TABLE network_external_transport_permits IS
  'N7 brokered egress permit. Minted by the authorization side, consumed by the egress side. '
  'Attempt-scoped, deadline-bound, non-transferable. Carries no authority of its own.';

-- ---------------------------------------------------------------------------
-- §8. Attempt journal — append-only, metadata only.
--
-- No payload copy, no canonical bytes, no request headers, no credential, no arbitrary response
-- body. A copy of disclosed content here would be a second copy governed by nothing, and an
-- Authorization header would be a secret in a table — the exact prohibition N6 applied to its own
-- attempts, and DATA_CLASSIFICATION's `SECRET` / logging-Never rule.
--
-- N7-A performs no network call, so response metadata is structurally minimal on purpose. Inventing
-- columns for a future adapter's response shape would be designing storage for data nobody has yet.
-- ---------------------------------------------------------------------------

CREATE TABLE network_external_transport_attempts (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  transport_id   uuid NOT NULL REFERENCES network_external_transports (transport_id),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),

  outcome app.network_external_transport_attempt_outcome NOT NULL,

  started_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now(),

  failure_category text CHECK (failure_category IS NULL OR length(btrim(failure_category)) > 0),

  CONSTRAINT network_external_transport_attempts_number_unique
    UNIQUE (transport_id, attempt_number),
  CONSTRAINT network_external_transport_attempts_success_shape
    CHECK ((outcome = 'accepted') = (failure_category IS NULL))
);

-- ---------------------------------------------------------------------------
-- §9. Immutability.
--
-- Every N7 relation is append-only except the obligation, whose lifecycle columns move and whose
-- identity does not. `app.reject_mutation()` raises SQLSTATE 23000 with a message naming the table
-- and the operation, exactly as it does across N1–N6.
-- ---------------------------------------------------------------------------

CREATE TRIGGER network_transport_destinations_no_update
  BEFORE UPDATE ON network_transport_destinations
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_transport_destinations_no_delete
  BEFORE DELETE ON network_transport_destinations
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_transport_destinations_no_truncate
  BEFORE TRUNCATE ON network_transport_destinations
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER network_transport_destination_revocations_no_update
  BEFORE UPDATE ON network_transport_destination_revocations
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_transport_destination_revocations_no_delete
  BEFORE DELETE ON network_transport_destination_revocations
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_transport_destination_revocations_no_truncate
  BEFORE TRUNCATE ON network_transport_destination_revocations
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

-- PERMITS ARE IMMUTABLE AUTHORITY. No widening, no destination replacement, no artifact
-- replacement, no digest replacement — enforced by refusing UPDATE outright rather than by
-- guarding columns one at a time. Consumption is proven by the uniquely bound attempt row, not by
-- mutating an authority-bearing field.
CREATE TRIGGER network_external_transport_permits_no_update
  BEFORE UPDATE ON network_external_transport_permits
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_external_transport_permits_no_delete
  BEFORE DELETE ON network_external_transport_permits
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_external_transport_permits_no_truncate
  BEFORE TRUNCATE ON network_external_transport_permits
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER network_external_transport_attempts_no_update
  BEFORE UPDATE ON network_external_transport_attempts
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_external_transport_attempts_no_delete
  BEFORE DELETE ON network_external_transport_attempts
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_external_transport_attempts_no_truncate
  BEFORE TRUNCATE ON network_external_transport_attempts
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER network_external_transports_no_delete
  BEFORE DELETE ON network_external_transports
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_external_transports_no_truncate
  BEFORE TRUNCATE ON network_external_transports
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

-- The obligation's identity is immutable; only lifecycle columns move. Same shape as N6's delivery
-- transition guard, and the same reason: a worker with UPDATE must not be able to re-point an
-- obligation at another artifact or another destination after the fact.
CREATE FUNCTION app.network_external_transport_transition() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.transport_id             IS DISTINCT FROM OLD.transport_id
     OR NEW.artifact_id           IS DISTINCT FROM OLD.artifact_id
     OR NEW.destination_id        IS DISTINCT FROM OLD.destination_id
     OR NEW.recipient_participant_id IS DISTINCT FROM OLD.recipient_participant_id
     OR NEW.inbox_id              IS DISTINCT FROM OLD.inbox_id
     OR NEW.created_at            IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'network_external_transports identity is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF OLD.state IN ('accepted', 'terminated_failed', 'terminated_unauthorized',
                   'terminated_destination_disabled') THEN
    RAISE EXCEPTION
      'network_external_transports % is terminal: no transition out of % is permitted',
      OLD.transport_id, OLD.state
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.record_version IS DISTINCT FROM OLD.record_version + 1 THEN
    RAISE EXCEPTION
      'network_external_transports record_version must advance by exactly one (% -> %)',
      OLD.record_version, NEW.record_version
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER network_external_transports_transition
  BEFORE UPDATE ON network_external_transports
  FOR EACH ROW EXECUTE FUNCTION app.network_external_transport_transition();

-- ---------------------------------------------------------------------------
-- §10. Row-level security. FORCE on all five, from birth.
-- ---------------------------------------------------------------------------

ALTER TABLE network_transport_destinations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_transport_destinations            FORCE  ROW LEVEL SECURITY;
ALTER TABLE network_transport_destination_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_transport_destination_revocations FORCE  ROW LEVEL SECURITY;
ALTER TABLE network_external_transports               ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_external_transports               FORCE  ROW LEVEL SECURITY;
ALTER TABLE network_external_transport_permits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_external_transport_permits        FORCE  ROW LEVEL SECURITY;
ALTER TABLE network_external_transport_attempts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_external_transport_attempts       FORCE  ROW LEVEL SECURITY;

-- --- Destinations: recipient-authored, permission-gated — OR-06. ------------
--
-- The recipient is derived from the AUTHENTICATED principal's tenancy, never accepted as an
-- argument. Exactly N6's subscription-insert shape, and for the same reason: a caller must not be
-- able to register a destination on behalf of an organization it does not hold.
CREATE POLICY network_transport_destinations_insert ON network_transport_destinations
  FOR INSERT TO freightos_app
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.network_participants p
       WHERE p.id = recipient_participant_id
         AND p.participant_type = 'organization'
         AND p.status = 'active'
         AND p.tenant_id IS NOT NULL
         AND p.tenant_id = (SELECT app.current_tenant_id())
    )
    AND (SELECT app.user_has_permission(
                  (SELECT app.current_tenant_id()),
                  (SELECT app.current_user_id()),
                  'network.transport_destination.create',
                  now()))
  );

CREATE POLICY network_transport_destinations_read ON network_transport_destinations
  FOR SELECT TO freightos_app
  USING (
    EXISTS (
      SELECT 1 FROM public.network_participants p
       WHERE p.id = recipient_participant_id
         AND p.tenant_id IS NOT NULL
         AND p.tenant_id = (SELECT app.current_tenant_id())
    )
    AND (SELECT app.user_has_permission(
                  (SELECT app.current_tenant_id()),
                  (SELECT app.current_user_id()),
                  'network.transport_destination.read',
                  now()))
  );

CREATE POLICY network_transport_destination_revocations_insert
  ON network_transport_destination_revocations
  FOR INSERT TO freightos_app
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.network_transport_destinations d
       JOIN public.network_participants p ON p.id = d.recipient_participant_id
       WHERE d.destination_id = network_transport_destination_revocations.destination_id
         AND p.tenant_id IS NOT NULL
         AND p.tenant_id = (SELECT app.current_tenant_id())
    )
    AND (SELECT app.user_has_permission(
                  (SELECT app.current_tenant_id()),
                  (SELECT app.current_user_id()),
                  'network.transport_destination.revoke',
                  now()))
  );

CREATE POLICY network_transport_destination_revocations_read
  ON network_transport_destination_revocations
  FOR SELECT TO freightos_app
  USING (
    EXISTS (
      SELECT 1 FROM public.network_transport_destinations d
       JOIN public.network_participants p ON p.id = d.recipient_participant_id
       WHERE d.destination_id = network_transport_destination_revocations.destination_id
         AND p.tenant_id IS NOT NULL
         AND p.tenant_id = (SELECT app.current_tenant_id())
    )
    AND (SELECT app.user_has_permission(
                  (SELECT app.current_tenant_id()),
                  (SELECT app.current_user_id()),
                  'network.transport_destination.read',
                  now()))
  );

-- --- The AUTHORIZATION side: the delivery worker creates obligations and mints permits. ----------
--
-- It is the non-egress role, so it is the only one that may say "this may be sent". It writes no
-- attempt: executing transport is not its job.
CREATE POLICY network_transport_destinations_broker_read ON network_transport_destinations
  FOR SELECT TO freightos_delivery_worker USING (true);
CREATE POLICY network_transport_destination_revocations_broker_read
  ON network_transport_destination_revocations
  FOR SELECT TO freightos_delivery_worker USING (true);

CREATE POLICY network_external_transports_broker_read ON network_external_transports
  FOR SELECT TO freightos_delivery_worker USING (true);
CREATE POLICY network_external_transports_broker_insert ON network_external_transports
  FOR INSERT TO freightos_delivery_worker WITH CHECK (true);

CREATE POLICY network_external_transport_permits_broker_read
  ON network_external_transport_permits
  FOR SELECT TO freightos_delivery_worker USING (true);
CREATE POLICY network_external_transport_permits_broker_insert
  ON network_external_transport_permits
  FOR INSERT TO freightos_delivery_worker WITH CHECK (true);

-- --- The EGRESS side: reads what it must, writes only its own attempts. -----
--
-- No INSERT on permits anywhere below. The transport worker cannot authorize itself, and that is
-- the entire content of OR-05: a role that could mint its own permit would be a role that decides
-- its own authority, which is the thing the brokered design exists to prevent.
CREATE POLICY network_transport_destinations_transport_worker_read
  ON network_transport_destinations
  FOR SELECT TO freightos_transport_worker USING (true);
CREATE POLICY network_transport_destination_revocations_transport_worker_read
  ON network_transport_destination_revocations
  FOR SELECT TO freightos_transport_worker USING (true);

CREATE POLICY network_external_transports_transport_worker_read
  ON network_external_transports
  FOR SELECT TO freightos_transport_worker USING (true);
CREATE POLICY network_external_transports_transport_worker_update
  ON network_external_transports
  FOR UPDATE TO freightos_transport_worker USING (true) WITH CHECK (true);

CREATE POLICY network_external_transport_permits_transport_worker_read
  ON network_external_transport_permits
  FOR SELECT TO freightos_transport_worker USING (true);

CREATE POLICY network_external_transport_attempts_transport_worker_read
  ON network_external_transport_attempts
  FOR SELECT TO freightos_transport_worker USING (true);
CREATE POLICY network_external_transport_attempts_transport_worker_insert
  ON network_external_transport_attempts
  FOR INSERT TO freightos_transport_worker WITH CHECK (true);

-- --- LEAST-PRIVILEGE ARTIFACT READ — the narrow path, not a browse. ---------
--
-- The transport worker may read an artifact only where an obligation for it exists. The same shape
-- as N6's recipient read, which resolves visibility through the inbox — a proven pattern in this
-- schema rather than a new invention. Without an obligation the artifact is invisible, so a
-- compromised egress process cannot enumerate authorized disclosures.
CREATE POLICY network_disclosure_artifacts_transport_worker_read
  ON network_disclosure_artifacts
  FOR SELECT TO freightos_transport_worker
  USING (
    EXISTS (SELECT 1 FROM public.network_external_transports t
             WHERE t.artifact_id = network_disclosure_artifacts.artifact_id)
  );

-- The inbox row is the obligation's origin, and the worker must be able to resolve it.
CREATE POLICY network_disclosure_inbox_transport_worker_read
  ON network_disclosure_inbox
  FOR SELECT TO freightos_transport_worker
  USING (
    EXISTS (SELECT 1 FROM public.network_external_transports t
             WHERE t.inbox_id = network_disclosure_inbox.inbox_id)
  );

-- The participant registry, narrowed to organizations — the shape N3 and N6 already use.
CREATE POLICY network_participants_transport_worker_read ON network_participants
  FOR SELECT TO freightos_transport_worker
  USING (participant_type = 'organization');

-- ---------------------------------------------------------------------------
-- §11. Privileges.
--
-- The transport worker's read set is deliberately TINY, and what is absent is the security
-- property: no N3 journal, no N4 intents, no N5-A grants or revocations, no N5-B sensitivities or
-- ceilings, no subscriptions. It cannot evaluate authorization because it cannot see the inputs.
-- ---------------------------------------------------------------------------

-- Recipient-side destination administration.
GRANT SELECT, INSERT ON network_transport_destinations            TO freightos_app;
GRANT SELECT, INSERT ON network_transport_destination_revocations TO freightos_app;
REVOKE UPDATE, DELETE, TRUNCATE ON network_transport_destinations            FROM freightos_app;
REVOKE UPDATE, DELETE, TRUNCATE ON network_transport_destination_revocations FROM freightos_app;
REVOKE ALL PRIVILEGES ON network_external_transports         FROM freightos_app;
REVOKE ALL PRIVILEGES ON network_external_transport_permits  FROM freightos_app;
REVOKE ALL PRIVILEGES ON network_external_transport_attempts FROM freightos_app;

-- The AUTHORIZATION side. It creates obligations and mints permits; it executes nothing.
GRANT SELECT             ON network_transport_destinations            TO freightos_delivery_worker;
GRANT SELECT             ON network_transport_destination_revocations TO freightos_delivery_worker;
GRANT SELECT, INSERT     ON network_external_transports               TO freightos_delivery_worker;
GRANT SELECT, INSERT     ON network_external_transport_permits        TO freightos_delivery_worker;
REVOKE ALL PRIVILEGES ON network_external_transport_attempts FROM freightos_delivery_worker;
REVOKE UPDATE, DELETE, TRUNCATE ON network_external_transports        FROM freightos_delivery_worker;

-- The EGRESS side.
GRANT SELECT ON network_transport_destinations            TO freightos_transport_worker;
GRANT SELECT ON network_transport_destination_revocations TO freightos_transport_worker;
GRANT SELECT ON network_external_transport_permits        TO freightos_transport_worker;
GRANT SELECT ON network_disclosure_artifacts              TO freightos_transport_worker;
GRANT SELECT ON network_disclosure_inbox                  TO freightos_transport_worker;
GRANT SELECT ON network_participants                      TO freightos_transport_worker;
GRANT SELECT, UPDATE     ON network_external_transports         TO freightos_transport_worker;
GRANT SELECT, INSERT     ON network_external_transport_attempts TO freightos_transport_worker;

GRANT USAGE ON SCHEMA public TO freightos_transport_worker;
GRANT USAGE ON SCHEMA app    TO freightos_transport_worker;

-- THE SEPARATION, as privilege rather than as comment. The transport worker holds no write anywhere
-- it could create authority, and no read anywhere it could evaluate it.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_external_transport_permits FROM freightos_transport_worker;
REVOKE INSERT, DELETE, TRUNCATE         ON network_external_transports        FROM freightos_transport_worker;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_transport_destinations            FROM freightos_transport_worker;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_transport_destination_revocations FROM freightos_transport_worker;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_disclosure_artifacts FROM freightos_transport_worker;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_disclosure_inbox     FROM freightos_transport_worker;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_participants         FROM freightos_transport_worker;

-- ---------------------------------------------------------------------------
-- §12. Destination permission keys — held by nobody.
-- ---------------------------------------------------------------------------

SET LOCAL ROLE freightos_admin_owner;

INSERT INTO permissions (tenant_id, key, resource, action, description, created_by, updated_by)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'network.transport_destination.create',
   'network_transport_destination', 'write',
   'Register an external transport destination for an organization in the caller''s tenant. '
   'Routing configuration only; grants no field and no disclosure authority.',
   'migration:0035', 'migration:0035'),
  ('00000000-0000-0000-0000-000000000000', 'network.transport_destination.revoke',
   'network_transport_destination', 'write',
   'Revoke an external transport destination held by an organization in the caller''s tenant.',
   'migration:0035', 'migration:0035'),
  ('00000000-0000-0000-0000-000000000000', 'network.transport_destination.read',
   'network_transport_destination', 'read',
   'Read external transport destinations held by an organization in the caller''s tenant.',
   'migration:0035', 'migration:0035')
ON CONFLICT (key) DO NOTHING;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- §13. Assert what was built, and what was not.
-- ---------------------------------------------------------------------------

-- The R-06 / U-10 loan: `role_permissions` and `service_account_permissions` are FORCE-RLS with
-- tenant-predicated policies, so a bare count by the migrator returns ZERO whether or not an
-- assignment exists. Scoped to the three N7 keys, dropped before the migration ends.
CREATE POLICY role_permissions_n7_up_scan ON public.role_permissions
  FOR SELECT TO freightos_migrator
  USING (permission_id IN (SELECT id FROM public.permissions
                            WHERE key IN ('network.transport_destination.create',
                                          'network.transport_destination.revoke',
                                          'network.transport_destination.read')));
CREATE POLICY service_account_permissions_n7_up_scan ON public.service_account_permissions
  FOR SELECT TO freightos_migrator
  USING (permission_id IN (SELECT id FROM public.permissions
                            WHERE key IN ('network.transport_destination.create',
                                          'network.transport_destination.revoke',
                                          'network.transport_destination.read')));

DO $$
DECLARE
  v_tables text; v_keys text; v_assigned int; v_chain text; v_triggers text;
  v_reads text; v_writes text; v_definers int; v_force int;
BEGIN
  -- (a) exactly five N7 tables, named exactly.
  SELECT string_agg(c.relname, ',' ORDER BY c.relname) INTO v_tables
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relname IN ('network_transport_destinations',
                       'network_transport_destination_revocations',
                       'network_external_transports',
                       'network_external_transport_permits',
                       'network_external_transport_attempts');
  IF v_tables IS DISTINCT FROM
     'network_external_transport_attempts,network_external_transport_permits,'
     'network_external_transports,network_transport_destination_revocations,'
     'network_transport_destinations' THEN
    RAISE EXCEPTION 'N7 table set is wrong: %', v_tables;
  END IF;

  -- (b) FORCE RLS on all five.
  SELECT count(*) INTO v_force
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity AND c.relforcerowsecurity
     AND c.relname IN ('network_transport_destinations',
                       'network_transport_destination_revocations',
                       'network_external_transports',
                       'network_external_transport_permits',
                       'network_external_transport_attempts');
  IF v_force <> 5 THEN
    RAISE EXCEPTION 'all five N7 tables must carry RLS and FORCE: only % do', v_force;
  END IF;

  -- (c) THE PROVENANCE CHAIN, by exact constraint definition. A count would pass over independent
  --     single-column keys, which is exactly the defect R-07…R-10 were.
  SELECT string_agg(format('%s: %s', c.conname, pg_get_constraintdef(c.oid)), E'\n' ORDER BY c.conname)
    INTO v_chain
    FROM pg_constraint c
   WHERE c.contype = 'f'
     AND c.conname IN ('network_external_transports_artifact_binding',
                       'network_external_transports_destination_binding',
                       'network_external_transport_permits_transport_binding',
                       'network_external_transport_permits_digest_binding');
  IF v_chain IS DISTINCT FROM
       'network_external_transport_permits_digest_binding: FOREIGN KEY (artifact_id, artifact_digest) REFERENCES network_disclosure_artifacts(artifact_id, payload_digest)' || E'\n' ||
       'network_external_transport_permits_transport_binding: FOREIGN KEY (transport_id, artifact_id, destination_id) REFERENCES network_external_transports(transport_id, artifact_id, destination_id)' || E'\n' ||
       'network_external_transports_artifact_binding: FOREIGN KEY (artifact_id, recipient_participant_id) REFERENCES network_disclosure_artifacts(artifact_id, recipient_participant_id)' || E'\n' ||
       'network_external_transports_destination_binding: FOREIGN KEY (destination_id, recipient_participant_id) REFERENCES network_transport_destinations(destination_id, recipient_participant_id)' THEN
    RAISE EXCEPTION 'the N7 provenance chain is not the four keys it must be, found:%',
      E'\n' || coalesce(v_chain, '<none>');
  END IF;

  -- (d) THE SEPARATION, as privilege. The transport worker must hold NO read on any relation that
  --     would let it evaluate authorization for itself.
  SELECT string_agg(format('%s:%s', table_name, privilege_type), ', '
                    ORDER BY table_name, privilege_type)
    INTO v_reads
    FROM information_schema.table_privileges
   WHERE grantee = 'freightos_transport_worker'
     AND table_name IN ('network_events', 'network_transport_intents',
                        'network_disclosure_grants', 'network_disclosure_grant_revocations',
                        'network_disclosure_projections', 'network_disclosure_projection_fields',
                        'network_disclosure_sensitivities', 'network_schema_disclosure_sensitivity',
                        'network_disclosure_purpose_ceilings',
                        'network_disclosure_subscriptions',
                        'network_disclosure_subscription_revocations');
  IF v_reads IS NOT NULL THEN
    RAISE EXCEPTION
      'freightos_transport_worker must hold NO privilege on N3/N4/N5/interest — authorization role '
      '!= egress role. Found: %', v_reads;
  END IF;

  -- (e) AND IT MUST NOT BE ABLE TO AUTHORIZE ITSELF. No write on permits, by any privilege.
  SELECT string_agg(format('%s:%s', table_name, privilege_type), ', '
                    ORDER BY table_name, privilege_type)
    INTO v_writes
    FROM information_schema.table_privileges
   WHERE grantee = 'freightos_transport_worker'
     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
     AND table_name IN ('network_external_transport_permits', 'network_transport_destinations',
                        'network_transport_destination_revocations',
                        'network_disclosure_artifacts', 'network_disclosure_inbox',
                        'network_participants');
  IF v_writes IS NOT NULL THEN
    RAISE EXCEPTION
      'freightos_transport_worker must mint no permit and write no governed row. Found: %', v_writes;
  END IF;

  -- (f) the three permission keys exist and are held by nobody — read through the scoped policies
  --     created above, so the claim is fact rather than blindness.
  SELECT string_agg(key, ',' ORDER BY key) INTO v_keys
    FROM permissions WHERE key LIKE 'network.transport_destination.%';
  IF v_keys IS DISTINCT FROM 'network.transport_destination.create,'
                             'network.transport_destination.read,'
                             'network.transport_destination.revoke' THEN
    RAISE EXCEPTION 'N7 destination permission keys are wrong: %', v_keys;
  END IF;

  SELECT count(*) INTO v_assigned
    FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key LIKE 'network.transport_destination.%';
  IF v_assigned <> 0 THEN
    RAISE EXCEPTION 'N7 destination permissions must be assigned to no role: % assignment(s)',
      v_assigned;
  END IF;

  SELECT count(*) INTO v_assigned
    FROM service_account_permissions sp JOIN permissions p ON p.id = sp.permission_id
   WHERE p.key LIKE 'network.transport_destination.%';
  IF v_assigned <> 0 THEN
    RAISE EXCEPTION 'N7 destination permissions must be assigned to no service account: %',
      v_assigned;
  END IF;

  -- (g) zero new SECURITY DEFINER. The transition guard is invoker-rights, and the least-privilege
  --     artifact read is a policy rather than a definer function — deliberately.
  SELECT count(*) INTO v_definers
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'app' AND p.proname LIKE 'network_external_transport%' AND p.prosecdef;
  IF v_definers <> 0 THEN
    RAISE EXCEPTION 'N7 must add no SECURITY DEFINER function: % found', v_definers;
  END IF;

  -- (h) THE TRIGGER SURFACE, by exact ordered inventory — timing, event, level, function, enabled
  --     state and WHEN presence. F-2's lesson: a disabled trigger is still in pg_trigger, so
  --     presence proves nothing.
  SELECT string_agg(
           format('%s.%s %s %s %s %s/%s when=%s',
                  cl.relname, t.tgname,
                  CASE WHEN (t.tgtype & 2) <> 0 THEN 'BEFORE' ELSE 'AFTER' END,
                  CASE WHEN (t.tgtype & 4) <> 0 THEN 'INSERT'
                       WHEN (t.tgtype & 8) <> 0 THEN 'DELETE'
                       WHEN (t.tgtype & 16) <> 0 THEN 'UPDATE'
                       ELSE 'TRUNCATE' END,
                  CASE WHEN (t.tgtype & 1) <> 0 THEN 'ROW' ELSE 'STATEMENT' END,
                  p.proname, t.tgenabled::text,
                  CASE WHEN t.tgqual IS NULL THEN 'none' ELSE 'present' END),
           E'\n' ORDER BY cl.relname, t.tgname)
    INTO v_triggers
    FROM pg_trigger t
    JOIN pg_class cl ON cl.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal AND n.nspname = 'public'
     AND cl.relname IN ('network_transport_destinations',
                        'network_transport_destination_revocations',
                        'network_external_transports',
                        'network_external_transport_permits',
                        'network_external_transport_attempts');
  IF v_triggers IS DISTINCT FROM
       'network_external_transport_attempts.network_external_transport_attempts_no_delete BEFORE DELETE ROW reject_mutation/O when=none' || E'\n' ||
       'network_external_transport_attempts.network_external_transport_attempts_no_truncate BEFORE TRUNCATE STATEMENT reject_mutation/O when=none' || E'\n' ||
       'network_external_transport_attempts.network_external_transport_attempts_no_update BEFORE UPDATE ROW reject_mutation/O when=none' || E'\n' ||
       'network_external_transport_permits.network_external_transport_permits_no_delete BEFORE DELETE ROW reject_mutation/O when=none' || E'\n' ||
       'network_external_transport_permits.network_external_transport_permits_no_truncate BEFORE TRUNCATE STATEMENT reject_mutation/O when=none' || E'\n' ||
       'network_external_transport_permits.network_external_transport_permits_no_update BEFORE UPDATE ROW reject_mutation/O when=none' || E'\n' ||
       'network_external_transports.network_external_transports_no_delete BEFORE DELETE ROW reject_mutation/O when=none' || E'\n' ||
       'network_external_transports.network_external_transports_no_truncate BEFORE TRUNCATE STATEMENT reject_mutation/O when=none' || E'\n' ||
       'network_external_transports.network_external_transports_transition BEFORE UPDATE ROW network_external_transport_transition/O when=none' || E'\n' ||
       'network_transport_destination_revocations.network_transport_destination_revocations_no_delete BEFORE DELETE ROW reject_mutation/O when=none' || E'\n' ||
       'network_transport_destination_revocations.network_transport_destination_revocations_no_truncate BEFORE TRUNCATE STATEMENT reject_mutation/O when=none' || E'\n' ||
       'network_transport_destination_revocations.network_transport_destination_revocations_no_update BEFORE UPDATE ROW reject_mutation/O when=none' || E'\n' ||
       'network_transport_destinations.network_transport_destinations_no_delete BEFORE DELETE ROW reject_mutation/O when=none' || E'\n' ||
       'network_transport_destinations.network_transport_destinations_no_truncate BEFORE TRUNCATE STATEMENT reject_mutation/O when=none' || E'\n' ||
       'network_transport_destinations.network_transport_destinations_no_update BEFORE UPDATE ROW reject_mutation/O when=none' THEN
    RAISE EXCEPTION 'the N7 trigger surface is not what 0035 built, found:%',
      E'\n' || coalesce(v_triggers, '<none>');
  END IF;

  -- (i) THE PAIRING RULE, recomputed rather than listed — N6 assertion (m), extended to cover BOTH
  --     workers. Every table either worker holds SELECT on must also admit it through a policy: a
  --     GRANT with no applicable policy is not a privilege under FORCE RLS, it is an invisible,
  --     permanently empty read that fails silently.
  SELECT count(*) INTO v_assigned
    FROM information_schema.role_table_grants g
   WHERE g.grantee IN ('freightos_delivery_worker', 'freightos_transport_worker')
     AND g.privilege_type = 'SELECT'
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = g.table_name
          AND p.cmd IN ('SELECT', 'ALL')
          AND (g.grantee = ANY (p.roles) OR 'public' = ANY (p.roles)));
  IF v_assigned <> 0 THEN
    RAISE EXCEPTION
      '% worker SELECT grant(s) have no admitting policy — they would read zero rows silently',
      v_assigned;
  END IF;

  -- (j) N7 builds no adapter, no replay and no destination secret table.
  SELECT string_agg(c.relname, ',' ORDER BY c.relname) INTO v_tables
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
     AND (c.relname LIKE '%replay%' OR c.relname LIKE '%webhook%'
          OR c.relname LIKE '%secret%' OR c.relname LIKE '%credential_value%'
          OR c.relname LIKE '%dead_letter%');
  IF v_tables IS NOT NULL THEN
    RAISE EXCEPTION 'N7-A must build no replay/webhook/secret relation: %', v_tables;
  END IF;
END
$$;

DROP POLICY role_permissions_n7_up_scan ON public.role_permissions;
DROP POLICY service_account_permissions_n7_up_scan ON public.service_account_permissions;
