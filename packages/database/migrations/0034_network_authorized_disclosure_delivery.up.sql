-- ---------------------------------------------------------------------------
-- N6 — AUTHORIZED DISCLOSURE DELIVERY.
--
--   TRANSPORT OWED != DISCLOSURE AUTHORIZED != DELIVERY ATTEMPTED != DELIVERY SUCCEEDED
--
-- N4 records that transport is owed. N5-B decides whether that KIND of content may leave at all.
-- N5-A decides which recipient may see which fields for which purpose. N6 is the only thing that
-- may satisfy an N4 debt, and it may do so ONLY through a disclosure both halves of N5 permit.
--
-- Seven tables, and the split between them is the design rather than an accident of normalisation:
--
--   network_disclosure_subscriptions            interest — NARROWING ONLY, grants no field
--   network_disclosure_subscription_revocations withdrawal of interest, append-only
--   network_disclosure_routing_resolutions      enumeration happened, exactly once, per N4 intent
--   network_disclosure_artifacts                the exact authorized bytes, immutable
--   network_disclosure_deliveries               the ONLY mutable relation: lifecycle state
--   network_delivery_attempts                   append-only attempt journal
--   network_disclosure_inbox                    the v1 destination, immutable
--
-- ZERO EXTERNAL EGRESS. The only destination this migration knows is `freightos_inbox`, a table in
-- this database. There is no URL column, no secret column, no endpoint, no verification state and
-- no transport adapter, because there is no transport. That is not a gap: an external destination
-- is an SSRF surface, a secret-storage problem and a signing problem all at once, and N7 owns all
-- three. The consequence here is that DELIVERED means one PostgreSQL transaction committed, which
-- is a fact rather than an opinion about a socket.
--
-- WHAT THIS MIGRATION DOES NOT DO. No publisher, no webhook, no broker, no queue adapter, no
-- delivery worker daemon, no retry job, no subscriber API, no external wire envelope, no replay,
-- no dead-letter table, no destination registry, no field allowlist. N7 will own external
-- transport; nothing here presumes its shape.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- §1. Vocabulary.
--
-- Three enums, all closed. `destination_kind` has exactly one value on purpose: the column exists
-- so N7 can add a value rather than a table, and a single-value enum is a smaller promise than a
-- free-text destination that a caller could fill with a URL.
-- ---------------------------------------------------------------------------

CREATE TYPE app.network_delivery_destination_kind AS ENUM ('freightos_inbox');

-- No `leased` and no `delivering`. Those states exist to describe a window in which an external
-- call is in flight, and N6 makes no external call — the whole delivery is one transaction, so a
-- durable in-flight state would describe a window that cannot be observed.
CREATE TYPE app.network_delivery_state AS ENUM (
  'pending',
  'failed_retryable',
  'delivered',
  'terminated_failed',
  'terminated_unauthorized'
);

-- Deliberately NOT a member of this enum: anything meaning "authorization denied". An attempt row
-- asserts that a delivery was executed and something happened to it. Recording an authorization
-- refusal as an attempt outcome would claim an egress operation occurred when none was even
-- started, and would make the attempt journal useless as evidence of what was actually tried.
CREATE TYPE app.network_delivery_attempt_outcome AS ENUM (
  'delivered',
  'database_transient',
  'database_conflict',
  'internal_error'
);

-- ---------------------------------------------------------------------------
-- §2. The delivery runtime identity.
--
-- One new role. N6 is the first network phase whose runtime needs a privilege set the general
-- application role must not have: it reads the N4 debt table (which `freightos_app` is REVOKEd
-- from entirely, deliberately, since 0030), it writes delivery lifecycle state, and it writes into
-- every recipient's inbox. Handing those three capabilities to `freightos_app` would give every
-- ordinary request path the ability to mint an inbox row for any organization.
--
-- What it may NOT do is the more important half, and it is enforced by privilege rather than by
-- convention: no INSERT/UPDATE/DELETE anywhere in N3, N4, N5-A or N5-B, and no write to
-- subscriptions or their revocations. The worker executes authority; it never creates it.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_delivery_worker') THEN
    CREATE ROLE freightos_delivery_worker
      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
  END IF;
END
$$;

DO $$
DECLARE r record;
BEGIN
  SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication, rolcanlogin
    INTO r FROM pg_roles WHERE rolname = 'freightos_delivery_worker';
  IF r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication THEN
    RAISE EXCEPTION
      'freightos_delivery_worker must hold no elevated attribute (rolsuper=% rolbypassrls=% '
      'rolcreatedb=% rolcreaterole=% rolreplication=%)',
      r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole, r.rolreplication;
  END IF;
  IF NOT r.rolcanlogin THEN
    RAISE EXCEPTION 'freightos_delivery_worker must be LOGIN: it is a service credential';
  END IF;
END
$$;

-- THE WORKER BOUNDARY, asserted at deploy time. A narrow delivery identity is worthless if it can
-- become a broad one, or if a broad one can become it.
DO $$
DECLARE v_detail text;
BEGIN
  SELECT string_agg(format('%s<->%s', m.rolname, r.rolname), ', ')
    INTO v_detail
    FROM pg_auth_members am
    JOIN pg_roles m ON m.oid = am.member
    JOIN pg_roles r ON r.oid = am.roleid
   WHERE (m.rolname = 'freightos_delivery_worker'
          AND r.rolname IN ('freightos_app', 'freightos_control_plane', 'freightos_admin',
                            'freightos_admin_owner', 'freightos_audit_writer',
                            'freightos_event_writer'))
      OR (r.rolname = 'freightos_delivery_worker'
          AND m.rolname IN ('freightos_app', 'freightos_control_plane', 'freightos_admin',
                            'freightos_event_writer'));
  IF v_detail IS NOT NULL THEN
    RAISE EXCEPTION '0034: forbidden membership edge on freightos_delivery_worker — %', v_detail;
  END IF;
END
$$;

-- The implicit CREATEROLE edge, pinned exactly as 0029 pins the event writer's. Not forbidden —
-- ADMIN is how the revert drops the role — but no membership of the worker, from ANY role, may
-- confer INHERIT or SET. Either would hand a broader identity the ability to write every
-- recipient's inbox, which is the exact boundary this role was created to draw.
DO $$
DECLARE v_detail text;
BEGIN
  SELECT string_agg(format('%s (admin=%s inherit=%s set=%s)',
                           m.rolname, am.admin_option, am.inherit_option, am.set_option), ', ')
    INTO v_detail
    FROM pg_auth_members am
    JOIN pg_roles m ON m.oid = am.member
    JOIN pg_roles r ON r.oid = am.roleid
   WHERE r.rolname = 'freightos_delivery_worker'
     AND (am.inherit_option OR am.set_option);
  IF v_detail IS NOT NULL THEN
    RAISE EXCEPTION
      '0034: a membership of freightos_delivery_worker confers INHERIT or SET — %. '
      'ADMIN alone is expected from the creating role; INHERIT or SET is an escalation.',
      v_detail;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- §3. Subscriptions — interest, and nothing else.
--
--   SUBSCRIPTION != AUTHORIZATION.
--
-- N5-A answers "may this recipient see these fields". It does not answer "does this recipient want
-- this event". Those are different questions with different authors: the grantor writes the grant,
-- the recipient writes the subscription. Without the second signal, a grant issued so a
-- counterparty could look something up once would silently become a firehose obligation.
--
-- There is deliberately NO field list, NO projection reference and NO pointer column here. A
-- subscription that named fields would be a second security-critical field enumeration beside
-- `network_disclosure_projection_fields`, free to disagree with it, with nothing forcing agreement
-- — precisely the design N5-B refused for sensitivity. N5 chooses the projection; interest cannot.
--
-- Identity is immutable. There is no `active` column to flip: withdrawal is a row in §4, for the
-- same reason N5-A revocations are separate rows. A boolean that can be set back to true is not a
-- revocation, it is a pause with an audit gap.
-- ---------------------------------------------------------------------------

CREATE TABLE network_disclosure_subscriptions (
  subscription_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  recipient_participant_id   uuid NOT NULL,
  recipient_participant_type app.network_participant_type
    GENERATED ALWAYS AS ('organization'::app.network_participant_type) STORED,

  -- Purpose and contract are BOTH governed references. The worker derives the purpose it presents
  -- to N5-A from this row, so a worker cannot invent a purpose string, and it derives the schema
  -- so a subscription cannot claim interest in a contract that was never registered.
  purpose_code       text NOT NULL REFERENCES network_disclosure_purposes (code),
  durable_schema_ref text NOT NULL REFERENCES network_schema_versions (durable_schema_ref),

  destination_kind app.network_delivery_destination_kind NOT NULL,

  effective_from  timestamptz NOT NULL,
  effective_until timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT current_user CHECK (length(btrim(created_by)) > 0),

  CONSTRAINT network_disclosure_subscriptions_recipient_is_organization
    FOREIGN KEY (recipient_participant_id, recipient_participant_type)
    REFERENCES network_participants (id, participant_type),

  CONSTRAINT network_disclosure_subscriptions_window
    CHECK (effective_until IS NULL OR effective_until > effective_from)
);

-- One live interest per (recipient, purpose, contract, destination). Two identical subscriptions
-- would produce two obligations for one event, which is a duplicate disclosure dressed up as
-- configuration.
CREATE UNIQUE INDEX network_disclosure_subscriptions_unique_interest
  ON network_disclosure_subscriptions
       (recipient_participant_id, purpose_code, durable_schema_ref, destination_kind);

COMMENT ON TABLE network_disclosure_subscriptions IS
  'N6 interest. Narrows routing; grants no field and no authority. Recipient-authored.';

-- ---------------------------------------------------------------------------
-- §4. Subscription revocations — append-only, at most one per subscription.
-- ---------------------------------------------------------------------------

CREATE TABLE network_disclosure_subscription_revocations (
  revocation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- UNIQUE, not just a foreign key: "at most one effective revocation" is the contract, and a
  -- second revocation row would make "when did interest end" ambiguous.
  subscription_id uuid NOT NULL UNIQUE
    REFERENCES network_disclosure_subscriptions (subscription_id),

  revoked_at timestamptz NOT NULL DEFAULT now(),
  revoked_by text NOT NULL DEFAULT current_user CHECK (length(btrim(revoked_by)) > 0),
  reason     text CHECK (reason IS NULL OR length(btrim(reason)) > 0)
);

-- ---------------------------------------------------------------------------
-- §5. Routing resolutions — enumeration happened, exactly once, per N4 INTENT.
--
-- The primary key is `network_event_id` and the foreign key is to `network_transport_intents`, NOT
-- to `network_events`. That is the whole point of this table's shape: N6 consumes the transport
-- debt N4 actually recorded rather than inferring it from the existence of an event. The two
-- happen to coincide today because the N4 mint trigger is unconditional, and a gate in §12 asserts
-- that they still do — but an invariant that holds is not the same as a dependency that is
-- declared, and only the foreign key makes "no debt, no routing" impossible rather than merely
-- true.
--
-- A row here means enumeration COMPLETED. Absence means it has not run. That distinction is why
-- the zero-recipient case gets a row rather than nothing: without it, "no deliveries" and "never
-- enumerated" are the same observation, and a routing bug would be indistinguishable from an event
-- nobody subscribed to.
-- ---------------------------------------------------------------------------

CREATE TABLE network_disclosure_routing_resolutions (
  network_event_id uuid PRIMARY KEY
    REFERENCES network_transport_intents (network_event_id),

  resolved_at timestamptz NOT NULL DEFAULT now(),
  resolved_by text NOT NULL DEFAULT current_user CHECK (length(btrim(resolved_by)) > 0),

  matched_subscription_count integer NOT NULL CHECK (matched_subscription_count >= 0),
  authorized_delivery_count  integer NOT NULL CHECK (authorized_delivery_count >= 0),
  denied_count               integer NOT NULL CHECK (denied_count >= 0),

  -- Every matched subscription is accounted for as either authorized or denied. A resolution that
  -- silently dropped a subscription would look identical to one that considered it and denied.
  CONSTRAINT network_disclosure_routing_resolutions_accounted
    CHECK (authorized_delivery_count + denied_count = matched_subscription_count)
);

-- ---------------------------------------------------------------------------
-- §6. Artifacts — the exact authorized bytes, immutable.
--
-- Materialized once, in the same transaction as the N5 decision that authorized it. Re-projecting
-- per attempt was rejected: projection logic changes, serialization drift and N3 correction
-- interaction would each let "the same delivery" quietly mean different bytes on a later retry,
-- and the digest would still verify because it would have been recomputed too.
--
-- `payload_canonical` is text, not jsonb, and that is deliberate. jsonb normalises key order and
-- numeric representation on the way in, so a digest taken over a jsonb column binds PostgreSQL's
-- rendering rather than the bytes that were authorized. The digest here binds exactly the string
-- stored here.
--
-- `permitted_pointers` is the FROZEN authorized set. Retries compare against it (§10) rather than
-- recomputing a field list, which is what makes "a retry can never widen the disclosure" checkable
-- rather than aspirational.
-- ---------------------------------------------------------------------------

CREATE TABLE network_disclosure_artifacts (
  artifact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  network_event_id uuid NOT NULL REFERENCES network_events (event_id),
  subscription_id  uuid NOT NULL REFERENCES network_disclosure_subscriptions (subscription_id),

  recipient_participant_id uuid NOT NULL,
  purpose_code             text NOT NULL REFERENCES network_disclosure_purposes (code),
  durable_schema_ref       text NOT NULL REFERENCES network_schema_versions (durable_schema_ref),
  sensitivity_code         text NOT NULL REFERENCES network_disclosure_sensitivities (code),

  permitted_pointers text[] NOT NULL
    CHECK (cardinality(permitted_pointers) > 0),

  -- Both digests, because both forensic questions must stay independently answerable: which grants
  -- authorized these fields (N5-A), and which ceiling permitted the content (N5-B composite).
  authorization_digest      text NOT NULL CHECK (authorization_digest ~ '^[0-9a-f]{64}$'),
  composite_decision_digest text NOT NULL CHECK (composite_decision_digest ~ '^[0-9a-f]{64}$'),

  payload_canonical text NOT NULL CHECK (length(payload_canonical) > 0),
  payload_digest    text NOT NULL CHECK (payload_digest ~ '^[0-9a-f]{64}$'),

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT current_user CHECK (length(btrim(created_by)) > 0),

  CONSTRAINT network_disclosure_artifacts_one_per_event_subscription
    UNIQUE (network_event_id, subscription_id)
);

-- ---------------------------------------------------------------------------
-- §7. Deliveries — the ONLY mutable N6 business relation.
--
-- Lifecycle state and nothing else. No payload lives here: the bytes are in §6, bound by a digest,
-- so an operational state change can never be an edit to what was authorized to leave.
--
-- The uniqueness is UNCONDITIONAL, not partial-on-non-terminal. A partial index would let a
-- terminated delivery be silently recreated for the same event and subscription, and re-sending a
-- historical event because a new grant appeared is replay — which N6 does not have and must not
-- acquire by accident through a permissive index.
-- ---------------------------------------------------------------------------

CREATE TABLE network_disclosure_deliveries (
  delivery_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- To the INTENT, again. A delivery cannot exist for an event that owes no transport.
  network_event_id uuid NOT NULL REFERENCES network_transport_intents (network_event_id),
  subscription_id  uuid NOT NULL REFERENCES network_disclosure_subscriptions (subscription_id),
  artifact_id      uuid NOT NULL UNIQUE REFERENCES network_disclosure_artifacts (artifact_id),

  state app.network_delivery_state NOT NULL DEFAULT 'pending',

  attempt_count   integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz,

  terminal_reason           text CHECK (terminal_reason IS NULL OR length(btrim(terminal_reason)) > 0),
  -- Which authorization decision was in force when the delivery terminated. For an authorization
  -- termination this is the decision that refused; for an operational one it may be absent.
  terminal_decision_digest  text
    CHECK (terminal_decision_digest IS NULL OR terminal_decision_digest ~ '^[0-9a-f]{64}$'),

  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),

  created_at    timestamptz NOT NULL DEFAULT now(),
  delivered_at  timestamptz,
  terminated_at timestamptz,

  CONSTRAINT network_disclosure_deliveries_one_per_event_subscription
    UNIQUE (network_event_id, subscription_id),

  -- Terminal states carry their timestamp; non-terminal states must not claim one.
  CONSTRAINT network_disclosure_deliveries_delivered_shape
    CHECK ((state = 'delivered') = (delivered_at IS NOT NULL)),
  CONSTRAINT network_disclosure_deliveries_terminated_shape
    CHECK ((state IN ('terminated_failed', 'terminated_unauthorized')) = (terminated_at IS NOT NULL))
);

CREATE INDEX network_disclosure_deliveries_eligible
  ON network_disclosure_deliveries (state, next_attempt_at)
  WHERE state IN ('pending', 'failed_retryable');

-- ---------------------------------------------------------------------------
-- §8. Attempts — append-only journal.
--
-- One row per execution that actually ran. The attempt-time composite digest is persisted on every
-- row because that is the evidence of WHICH authorization decision allowed this particular send —
-- retries under a changed-but-still-allowing decision legitimately carry different digests, and
-- that difference is the useful part.
--
-- No payload column. The delivery already binds an artifact, and the artifact already binds its
-- digest, so a payload copy here would be a second plaintext copy of sensitive content whose only
-- purpose is debugging.
-- ---------------------------------------------------------------------------

CREATE TABLE network_delivery_attempts (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  delivery_id    uuid NOT NULL REFERENCES network_disclosure_deliveries (delivery_id),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),

  composite_decision_digest text NOT NULL CHECK (composite_decision_digest ~ '^[0-9a-f]{64}$'),

  outcome app.network_delivery_attempt_outcome NOT NULL,

  started_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now(),

  failure_category text CHECK (failure_category IS NULL OR length(btrim(failure_category)) > 0),

  CONSTRAINT network_delivery_attempts_number_unique UNIQUE (delivery_id, attempt_number),
  CONSTRAINT network_delivery_attempts_success_shape
    CHECK ((outcome = 'delivered') = (failure_category IS NULL))
);

-- ---------------------------------------------------------------------------
-- §9. Inbox — the v1 destination, immutable.
--
-- A row here IS delivery. `UNIQUE (delivery_id)` is the second idempotency barrier behind the row
-- lock: even if two workers somehow both reached commit, only one inbox row can exist, so the
-- duplicate fails on the constraint rather than double-delivering.
--
-- It references the artifact rather than copying the payload, so the authorized bytes exist once.
-- ---------------------------------------------------------------------------

CREATE TABLE network_disclosure_inbox (
  inbox_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  delivery_id uuid NOT NULL UNIQUE REFERENCES network_disclosure_deliveries (delivery_id),
  artifact_id uuid NOT NULL REFERENCES network_disclosure_artifacts (artifact_id),

  recipient_participant_id uuid NOT NULL,

  delivered_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX network_disclosure_inbox_recipient
  ON network_disclosure_inbox (recipient_participant_id, delivered_at DESC);

-- ---------------------------------------------------------------------------
-- §10. The delivery state machine, enforced by the database.
--
-- Application discipline is not the mechanism. A worker with UPDATE on this table must not be able
-- to move a delivered row back to pending, resurrect a terminated one, or rewrite a success —
-- those are the transitions that would let delivery history be edited after the fact.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.network_delivery_transition() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Identity and authorization binding are immutable. Only lifecycle columns may move.
  IF NEW.delivery_id      IS DISTINCT FROM OLD.delivery_id
     OR NEW.network_event_id IS DISTINCT FROM OLD.network_event_id
     OR NEW.subscription_id  IS DISTINCT FROM OLD.subscription_id
     OR NEW.artifact_id      IS DISTINCT FROM OLD.artifact_id
     OR NEW.created_at       IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'network_disclosure_deliveries identity is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF OLD.state IN ('delivered', 'terminated_failed', 'terminated_unauthorized') THEN
    RAISE EXCEPTION 'network_disclosure_deliveries % is terminal: no transition out of % is permitted',
      OLD.delivery_id, OLD.state
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NOT (
    (OLD.state = 'pending' AND NEW.state IN
       ('pending', 'delivered', 'failed_retryable', 'terminated_failed', 'terminated_unauthorized'))
    OR (OLD.state = 'failed_retryable' AND NEW.state IN
       ('failed_retryable', 'delivered', 'terminated_failed', 'terminated_unauthorized'))
  ) THEN
    RAISE EXCEPTION 'network_disclosure_deliveries transition % -> % is not permitted',
      OLD.state, NEW.state
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- Optimistic concurrency. Two writers that both read version N cannot both commit N+1.
  IF NEW.record_version <> OLD.record_version + 1 THEN
    RAISE EXCEPTION 'network_disclosure_deliveries record_version must advance by exactly one (% -> %)',
      OLD.record_version, NEW.record_version
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END
$$;

COMMENT ON FUNCTION app.network_delivery_transition() IS
  'N6 delivery lifecycle guard: immutable identity, legal transitions only, no exit from a '
  'terminal state, and monotonic record_version. Invoker rights, no external effect.';

CREATE TRIGGER network_disclosure_deliveries_transition
  BEFORE UPDATE ON network_disclosure_deliveries
  FOR EACH ROW EXECUTE FUNCTION app.network_delivery_transition();

-- ---------------------------------------------------------------------------
-- §11. Immutability everywhere else.
--
-- Six of seven tables are append-only. `network_disclosure_deliveries` is the single exception and
-- it is guarded by §10 instead; it still refuses DELETE and TRUNCATE, because a delivery that
-- can be deleted is a delivery whose history can be erased.
-- ---------------------------------------------------------------------------

CREATE TRIGGER network_disclosure_subscriptions_no_update
  BEFORE UPDATE ON network_disclosure_subscriptions
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_subscriptions_no_delete
  BEFORE DELETE ON network_disclosure_subscriptions
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_subscriptions_no_truncate
  BEFORE TRUNCATE ON network_disclosure_subscriptions
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER network_disclosure_subscription_revocations_no_update
  BEFORE UPDATE ON network_disclosure_subscription_revocations
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_subscription_revocations_no_delete
  BEFORE DELETE ON network_disclosure_subscription_revocations
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_subscription_revocations_no_truncate
  BEFORE TRUNCATE ON network_disclosure_subscription_revocations
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER network_disclosure_routing_resolutions_no_update
  BEFORE UPDATE ON network_disclosure_routing_resolutions
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_routing_resolutions_no_delete
  BEFORE DELETE ON network_disclosure_routing_resolutions
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_routing_resolutions_no_truncate
  BEFORE TRUNCATE ON network_disclosure_routing_resolutions
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER network_disclosure_artifacts_no_update
  BEFORE UPDATE ON network_disclosure_artifacts
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_artifacts_no_delete
  BEFORE DELETE ON network_disclosure_artifacts
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_artifacts_no_truncate
  BEFORE TRUNCATE ON network_disclosure_artifacts
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER network_disclosure_deliveries_no_delete
  BEFORE DELETE ON network_disclosure_deliveries
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_deliveries_no_truncate
  BEFORE TRUNCATE ON network_disclosure_deliveries
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER network_delivery_attempts_no_update
  BEFORE UPDATE ON network_delivery_attempts
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_delivery_attempts_no_delete
  BEFORE DELETE ON network_delivery_attempts
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_delivery_attempts_no_truncate
  BEFORE TRUNCATE ON network_delivery_attempts
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER network_disclosure_inbox_no_update
  BEFORE UPDATE ON network_disclosure_inbox
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_inbox_no_delete
  BEFORE DELETE ON network_disclosure_inbox
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();
CREATE TRIGGER network_disclosure_inbox_no_truncate
  BEFORE TRUNCATE ON network_disclosure_inbox
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

-- ---------------------------------------------------------------------------
-- §12. N3 -> N4 remains 1:1.
--
-- N6 consumes N4 through a foreign key, so this is a NON-REGRESSION invariant rather than the
-- mechanism — but it is asserted here because the routing model assumes every accepted event
-- carries a debt row to key against, and a future change that made the N4 mint trigger conditional
-- would silently make some events unroutable rather than loudly wrong.
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_events bigint; v_intents bigint; v_orphans bigint;
BEGIN
  SELECT count(*) INTO v_events  FROM public.network_events;
  SELECT count(*) INTO v_intents FROM public.network_transport_intents;
  SELECT count(*) INTO v_orphans
    FROM public.network_events e
   WHERE NOT EXISTS (SELECT 1 FROM public.network_transport_intents t
                      WHERE t.network_event_id = e.event_id);
  IF v_events <> v_intents OR v_orphans <> 0 THEN
    RAISE EXCEPTION
      'N3->N4 correspondence broken before N6 is built on it: % events, % intents, % events without an intent',
      v_events, v_intents, v_orphans;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- §13. Row-level security.
--
-- FORCE on all seven, so the table owner is bound too.
-- ---------------------------------------------------------------------------

ALTER TABLE network_disclosure_subscriptions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_subscriptions             FORCE  ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_subscription_revocations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_subscription_revocations  FORCE  ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_routing_resolutions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_routing_resolutions       FORCE  ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_artifacts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_artifacts                 FORCE  ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_deliveries                ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_deliveries                FORCE  ROW LEVEL SECURITY;
ALTER TABLE network_delivery_attempts                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_delivery_attempts                    FORCE  ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_inbox                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_disclosure_inbox                     FORCE  ROW LEVEL SECURITY;

-- --- Subscriptions: recipient-authored, permission-gated. -------------------
--
-- The mirror image of the N5-A grant policy, and the mirroring is the point: there the GRANTOR
-- writes, here the RECIPIENT writes. `recipient_participant_id` is validated against the caller's
-- own tenant, so a caller cannot subscribe on behalf of an organization it does not hold — the
-- recipient is derived from the authenticated principal's tenancy rather than accepted as an
-- argument.
CREATE POLICY network_disclosure_subscriptions_insert ON network_disclosure_subscriptions
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
                  'network.disclosure_subscription.create',
                  now()))
  );

CREATE POLICY network_disclosure_subscriptions_read ON network_disclosure_subscriptions
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
                  'network.disclosure_subscription.read',
                  now()))
  );

-- The worker reads every subscription because routing must consider all of them. It holds no
-- INSERT here and never will: interest is authored by the recipient, not by the machinery that
-- acts on it.
CREATE POLICY network_disclosure_subscriptions_worker_read ON network_disclosure_subscriptions
  FOR SELECT TO freightos_delivery_worker USING (true);

CREATE POLICY network_disclosure_subscription_revocations_insert
  ON network_disclosure_subscription_revocations
  FOR INSERT TO freightos_app
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.network_disclosure_subscriptions s
       JOIN public.network_participants p ON p.id = s.recipient_participant_id
       WHERE s.subscription_id = network_disclosure_subscription_revocations.subscription_id
         AND p.tenant_id IS NOT NULL
         AND p.tenant_id = (SELECT app.current_tenant_id())
    )
    AND (SELECT app.user_has_permission(
                  (SELECT app.current_tenant_id()),
                  (SELECT app.current_user_id()),
                  'network.disclosure_subscription.revoke',
                  now()))
  );

CREATE POLICY network_disclosure_subscription_revocations_read
  ON network_disclosure_subscription_revocations
  FOR SELECT TO freightos_app
  USING (
    EXISTS (
      SELECT 1 FROM public.network_disclosure_subscriptions s
       JOIN public.network_participants p ON p.id = s.recipient_participant_id
       WHERE s.subscription_id = network_disclosure_subscription_revocations.subscription_id
         AND p.tenant_id IS NOT NULL
         AND p.tenant_id = (SELECT app.current_tenant_id())
    )
    AND (SELECT app.user_has_permission(
                  (SELECT app.current_tenant_id()),
                  (SELECT app.current_user_id()),
                  'network.disclosure_subscription.read',
                  now()))
  );

CREATE POLICY network_disclosure_subscription_revocations_worker_read
  ON network_disclosure_subscription_revocations
  FOR SELECT TO freightos_delivery_worker USING (true);

-- --- Routing resolutions, deliveries, attempts: worker-owned operational state. ---
--
-- No `freightos_app` policy at all on any of the three. Operational delivery state is not a
-- product surface in v1, and a recipient learning that an obligation for it was terminated as
-- unauthorized would learn the grantor's policy — the same transparency decision N5-A made when it
-- refused recipients read access to grants naming them.

CREATE POLICY network_disclosure_routing_resolutions_worker_read
  ON network_disclosure_routing_resolutions
  FOR SELECT TO freightos_delivery_worker USING (true);
CREATE POLICY network_disclosure_routing_resolutions_worker_insert
  ON network_disclosure_routing_resolutions
  FOR INSERT TO freightos_delivery_worker WITH CHECK (true);

CREATE POLICY network_disclosure_deliveries_worker_read
  ON network_disclosure_deliveries
  FOR SELECT TO freightos_delivery_worker USING (true);
CREATE POLICY network_disclosure_deliveries_worker_insert
  ON network_disclosure_deliveries
  FOR INSERT TO freightos_delivery_worker WITH CHECK (true);
CREATE POLICY network_disclosure_deliveries_worker_update
  ON network_disclosure_deliveries
  FOR UPDATE TO freightos_delivery_worker USING (true) WITH CHECK (true);

CREATE POLICY network_delivery_attempts_worker_read
  ON network_delivery_attempts
  FOR SELECT TO freightos_delivery_worker USING (true);
CREATE POLICY network_delivery_attempts_worker_insert
  ON network_delivery_attempts
  FOR INSERT TO freightos_delivery_worker WITH CHECK (true);

-- --- Artifacts: worker writes; the recipient reads ONLY what was delivered. ---
--
-- This is the load-bearing visibility rule. An artifact exists from the moment authorization is
-- decided, which is BEFORE delivery — so a policy keyed on the artifact's own recipient column
-- would expose authorized-but-not-yet-delivered content, and would keep exposing it after a
-- delivery terminated unauthorized. The predicate therefore requires a committed INBOX row, which
-- is the only thing that means "this actually left".
CREATE POLICY network_disclosure_artifacts_worker_read
  ON network_disclosure_artifacts
  FOR SELECT TO freightos_delivery_worker USING (true);
CREATE POLICY network_disclosure_artifacts_worker_insert
  ON network_disclosure_artifacts
  FOR INSERT TO freightos_delivery_worker WITH CHECK (true);

CREATE POLICY network_disclosure_artifacts_recipient_read
  ON network_disclosure_artifacts
  FOR SELECT TO freightos_app
  USING (
    EXISTS (
      SELECT 1
        FROM public.network_disclosure_inbox i
        JOIN public.network_participants p ON p.id = i.recipient_participant_id
       WHERE i.artifact_id = network_disclosure_artifacts.artifact_id
         AND p.tenant_id IS NOT NULL
         AND p.tenant_id = (SELECT app.current_tenant_id())
    )
  );

CREATE POLICY network_disclosure_inbox_worker_read
  ON network_disclosure_inbox
  FOR SELECT TO freightos_delivery_worker USING (true);
CREATE POLICY network_disclosure_inbox_worker_insert
  ON network_disclosure_inbox
  FOR INSERT TO freightos_delivery_worker WITH CHECK (true);

CREATE POLICY network_disclosure_inbox_recipient_read
  ON network_disclosure_inbox
  FOR SELECT TO freightos_app
  USING (
    EXISTS (
      SELECT 1 FROM public.network_participants p
       WHERE p.id = network_disclosure_inbox.recipient_participant_id
         AND p.tenant_id IS NOT NULL
         AND p.tenant_id = (SELECT app.current_tenant_id())
    )
  );

-- ---------------------------------------------------------------------------
-- §14. Privileges — exactly what each identity needs, and nothing adjacent.
-- ---------------------------------------------------------------------------

-- The recipient-side application path: author interest, withdraw it, read it, read what arrived.
GRANT SELECT, INSERT ON network_disclosure_subscriptions            TO freightos_app;
GRANT SELECT, INSERT ON network_disclosure_subscription_revocations TO freightos_app;
GRANT SELECT         ON network_disclosure_inbox                    TO freightos_app;
GRANT SELECT         ON network_disclosure_artifacts                TO freightos_app;

REVOKE UPDATE, DELETE, TRUNCATE ON network_disclosure_subscriptions            FROM freightos_app;
REVOKE UPDATE, DELETE, TRUNCATE ON network_disclosure_subscription_revocations FROM freightos_app;
REVOKE ALL PRIVILEGES ON network_disclosure_routing_resolutions FROM freightos_app;
REVOKE ALL PRIVILEGES ON network_disclosure_deliveries          FROM freightos_app;
REVOKE ALL PRIVILEGES ON network_delivery_attempts              FROM freightos_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_disclosure_inbox      FROM freightos_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_disclosure_artifacts  FROM freightos_app;

-- The delivery runtime. It reads the debt, the event, the governed N5 metadata and interest; it
-- writes only N6 operational state and the inbox.
GRANT SELECT ON network_transport_intents TO freightos_delivery_worker;
GRANT SELECT ON network_events            TO freightos_delivery_worker;
GRANT SELECT ON network_participants      TO freightos_delivery_worker;
GRANT SELECT ON network_schema_versions   TO freightos_delivery_worker;

GRANT SELECT ON network_disclosure_purposes             TO freightos_delivery_worker;
GRANT SELECT ON network_disclosure_authority_bases      TO freightos_delivery_worker;
GRANT SELECT ON network_disclosure_projections          TO freightos_delivery_worker;
GRANT SELECT ON network_disclosure_projection_fields    TO freightos_delivery_worker;
GRANT SELECT ON network_disclosure_grants               TO freightos_delivery_worker;
GRANT SELECT ON network_disclosure_grant_revocations    TO freightos_delivery_worker;
GRANT SELECT ON network_disclosure_sensitivities        TO freightos_delivery_worker;
GRANT SELECT ON network_schema_disclosure_sensitivity   TO freightos_delivery_worker;
GRANT SELECT ON network_disclosure_purpose_ceilings     TO freightos_delivery_worker;

GRANT SELECT             ON network_disclosure_subscriptions            TO freightos_delivery_worker;
GRANT SELECT             ON network_disclosure_subscription_revocations TO freightos_delivery_worker;
GRANT SELECT, INSERT     ON network_disclosure_routing_resolutions      TO freightos_delivery_worker;
GRANT SELECT, INSERT     ON network_disclosure_artifacts                TO freightos_delivery_worker;
GRANT SELECT, INSERT, UPDATE ON network_disclosure_deliveries           TO freightos_delivery_worker;
GRANT SELECT, INSERT     ON network_delivery_attempts                   TO freightos_delivery_worker;
GRANT SELECT, INSERT     ON network_disclosure_inbox                    TO freightos_delivery_worker;

-- 0013 revoked ALL on schema `public` from PUBLIC, so schema usage is granted per role rather than
-- inherited. Without this the worker's every query fails as "relation does not exist" — a missing
-- USAGE reads as absence, not as denial, which is a confusing way to discover a privilege gap.
GRANT USAGE ON SCHEMA public TO freightos_delivery_worker;
GRANT USAGE ON SCHEMA app    TO freightos_delivery_worker;

-- The worker executes authority. It never creates it, and these revokes are the statement of that
-- rather than a comment about it.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_events                       FROM freightos_delivery_worker;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_transport_intents            FROM freightos_delivery_worker;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_disclosure_grants            FROM freightos_delivery_worker;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_disclosure_grant_revocations FROM freightos_delivery_worker;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_disclosure_sensitivities     FROM freightos_delivery_worker;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_schema_disclosure_sensitivity FROM freightos_delivery_worker;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_disclosure_purpose_ceilings  FROM freightos_delivery_worker;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_disclosure_subscriptions     FROM freightos_delivery_worker;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON network_disclosure_subscription_revocations
  FROM freightos_delivery_worker;
REVOKE UPDATE, DELETE, TRUNCATE ON network_disclosure_routing_resolutions FROM freightos_delivery_worker;
REVOKE UPDATE, DELETE, TRUNCATE ON network_disclosure_artifacts           FROM freightos_delivery_worker;
REVOKE DELETE, TRUNCATE         ON network_disclosure_deliveries          FROM freightos_delivery_worker;
REVOKE UPDATE, DELETE, TRUNCATE ON network_delivery_attempts              FROM freightos_delivery_worker;
REVOKE UPDATE, DELETE, TRUNCATE ON network_disclosure_inbox               FROM freightos_delivery_worker;

-- The control plane administers participants; it has no business in disclosure delivery at all.
REVOKE ALL PRIVILEGES ON network_disclosure_subscriptions            FROM freightos_control_plane;
REVOKE ALL PRIVILEGES ON network_disclosure_subscription_revocations FROM freightos_control_plane;
REVOKE ALL PRIVILEGES ON network_disclosure_routing_resolutions      FROM freightos_control_plane;
REVOKE ALL PRIVILEGES ON network_disclosure_artifacts                FROM freightos_control_plane;
REVOKE ALL PRIVILEGES ON network_disclosure_deliveries               FROM freightos_control_plane;
REVOKE ALL PRIVILEGES ON network_delivery_attempts                   FROM freightos_control_plane;
REVOKE ALL PRIVILEGES ON network_disclosure_inbox                    FROM freightos_control_plane;

REVOKE ALL PRIVILEGES ON network_disclosure_subscriptions            FROM freightos_event_writer;
REVOKE ALL PRIVILEGES ON network_disclosure_subscription_revocations FROM freightos_event_writer;
REVOKE ALL PRIVILEGES ON network_disclosure_routing_resolutions      FROM freightos_event_writer;
REVOKE ALL PRIVILEGES ON network_disclosure_artifacts                FROM freightos_event_writer;
REVOKE ALL PRIVILEGES ON network_disclosure_deliveries               FROM freightos_event_writer;
REVOKE ALL PRIVILEGES ON network_delivery_attempts                   FROM freightos_event_writer;
REVOKE ALL PRIVILEGES ON network_disclosure_inbox                    FROM freightos_event_writer;

-- ---------------------------------------------------------------------------
-- §15. Subscription permission keys.
--
-- Assigned to NO role by default, exactly as N5-A's grant keys were. A permission that exists is
-- not a permission that is held, and seeding an assignment here would hand every existing
-- administrator a network capability they were never reviewed for.
-- ---------------------------------------------------------------------------

-- THE ROLE LOAN, exactly as 0032 §10 does it. `permissions` carries
-- `permissions_insert WITH CHECK (app.is_control_plane())`, and `freightos_migrator` is a member of
-- `freightos_control_plane` with INHERIT FALSE and SET FALSE — it can neither wield nor become the
-- control plane, so its insert is refused by RLS. Borrowing `freightos_admin_owner`, which the
-- migrator administers WITH SET and which inherits the control plane, is the established pattern;
-- adding a policy that admitted the migrator would widen the write surface permanently to solve a
-- one-time ordering problem. SET LOCAL, so it reverts at COMMIT.
--
-- The arbiter is NAMED, which requires SELECT on the table — `freightos_admin_owner` inherits the
-- control plane and therefore holds it.
SET LOCAL ROLE freightos_admin_owner;

INSERT INTO permissions (tenant_id, key, resource, action, description, created_by, updated_by)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'network.disclosure_subscription.create',
   'network_disclosure_subscription', 'write',
   'Create a network disclosure subscription for an organization in the caller''s tenant. '
   'Expresses interest only; grants no field and no authority.',
   'migration:0034', 'migration:0034'),
  ('00000000-0000-0000-0000-000000000000', 'network.disclosure_subscription.revoke',
   'network_disclosure_subscription', 'write',
   'Revoke a network disclosure subscription held by an organization in the caller''s tenant.',
   'migration:0034', 'migration:0034'),
  ('00000000-0000-0000-0000-000000000000', 'network.disclosure_subscription.read',
   'network_disclosure_subscription', 'read',
   'Read network disclosure subscriptions held by an organization in the caller''s tenant.',
   'migration:0034', 'migration:0034')
ON CONFLICT (key) DO NOTHING;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- §16. Assert what was built, and what was not.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_tables text; v_missing text; v_policies int; v_force int; v_definers int;
  v_keys text; v_worker_writes text; v_state text; v_dest text;
BEGIN
  -- (a) exactly seven N6 tables, named exactly.
  SELECT string_agg(c.relname, ',' ORDER BY c.relname) INTO v_tables
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relname IN ('network_disclosure_subscriptions',
                       'network_disclosure_subscription_revocations',
                       'network_disclosure_routing_resolutions',
                       'network_disclosure_artifacts',
                       'network_disclosure_deliveries',
                       'network_delivery_attempts',
                       'network_disclosure_inbox');
  IF v_tables IS DISTINCT FROM
     'network_delivery_attempts,network_disclosure_artifacts,network_disclosure_deliveries,'
     'network_disclosure_inbox,network_disclosure_routing_resolutions,'
     'network_disclosure_subscription_revocations,network_disclosure_subscriptions' THEN
    RAISE EXCEPTION 'N6 table set is wrong: %', v_tables;
  END IF;

  -- (b) no table this phase refused to build.
  SELECT string_agg(c.relname, ',') INTO v_missing
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND (c.relname LIKE '%destination%' OR c.relname LIKE '%webhook%'
          OR c.relname LIKE '%dead_letter%' OR c.relname LIKE '%replay%'
          OR c.relname LIKE '%subscriber%');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'N6 must not create destination/webhook/dead-letter/replay/subscriber tables: %',
      v_missing;
  END IF;

  -- (c) the routing resolution keys off the N4 INTENT, not off the event journal.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.network_disclosure_routing_resolutions'::regclass
       AND contype = 'f'
       AND confrelid = 'public.network_transport_intents'::regclass
  ) THEN
    RAISE EXCEPTION 'routing resolutions must reference network_transport_intents, not network_events';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.network_disclosure_deliveries'::regclass
       AND contype = 'f'
       AND confrelid = 'public.network_transport_intents'::regclass
  ) THEN
    RAISE EXCEPTION 'deliveries must reference network_transport_intents';
  END IF;

  -- (d) FORCE RLS on all seven.
  SELECT count(*) INTO v_force
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity AND c.relforcerowsecurity
     AND c.relname IN ('network_disclosure_subscriptions',
                       'network_disclosure_subscription_revocations',
                       'network_disclosure_routing_resolutions',
                       'network_disclosure_artifacts',
                       'network_disclosure_deliveries',
                       'network_delivery_attempts',
                       'network_disclosure_inbox');
  IF v_force <> 7 THEN
    RAISE EXCEPTION 'all seven N6 tables must carry RLS and FORCE: only % do', v_force;
  END IF;

  -- (e) zero new SECURITY DEFINER. The transition guard is invoker-rights.
  SELECT count(*) INTO v_definers
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'app' AND p.prosecdef
     AND p.proname IN ('network_delivery_transition');
  IF v_definers <> 0 THEN
    RAISE EXCEPTION 'N6 must add no SECURITY DEFINER function';
  END IF;

  -- (f) the three permission keys exist and are held by nobody.
  SELECT string_agg(key, ',' ORDER BY key) INTO v_keys
    FROM permissions WHERE key LIKE 'network.disclosure_subscription.%';
  IF v_keys IS DISTINCT FROM 'network.disclosure_subscription.create,'
                             'network.disclosure_subscription.read,'
                             'network.disclosure_subscription.revoke' THEN
    RAISE EXCEPTION 'N6 subscription permission keys are wrong: %', v_keys;
  END IF;
  IF EXISTS (
    SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
     WHERE p.key LIKE 'network.disclosure_subscription.%'
  ) THEN
    RAISE EXCEPTION 'N6 subscription permissions must be assigned to no role by this migration';
  END IF;

  -- (g) the worker holds no write anywhere in N3/N4/N5. This is the invariant that keeps delivery
  --     machinery from becoming disclosure authority, so it is checked rather than described.
  SELECT string_agg(format('%s:%s', table_name, privilege_type), ', ' ORDER BY table_name, privilege_type)
    INTO v_worker_writes
    FROM information_schema.table_privileges
   WHERE grantee = 'freightos_delivery_worker'
     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
     AND table_name IN ('network_events', 'network_transport_intents', 'network_participants',
                        'network_schema_versions',
                        'network_disclosure_grants', 'network_disclosure_grant_revocations',
                        'network_disclosure_projections', 'network_disclosure_projection_fields',
                        'network_disclosure_purposes', 'network_disclosure_authority_bases',
                        'network_disclosure_sensitivities', 'network_schema_disclosure_sensitivity',
                        'network_disclosure_purpose_ceilings',
                        'network_disclosure_subscriptions',
                        'network_disclosure_subscription_revocations');
  IF v_worker_writes IS NOT NULL THEN
    RAISE EXCEPTION 'freightos_delivery_worker must hold no write on N3/N4/N5/interest: %',
      v_worker_writes;
  END IF;

  -- (h) the state vocabulary is exactly the five agreed states — no leased, no delivering.
  SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) INTO v_state
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'app' AND t.typname = 'network_delivery_state';
  IF v_state IS DISTINCT FROM
     'pending,failed_retryable,delivered,terminated_failed,terminated_unauthorized' THEN
    RAISE EXCEPTION 'N6 delivery state vocabulary is wrong: %', v_state;
  END IF;

  -- (i) exactly one destination kind, and it is the internal inbox.
  SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) INTO v_dest
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'app' AND t.typname = 'network_delivery_destination_kind';
  IF v_dest IS DISTINCT FROM 'freightos_inbox' THEN
    RAISE EXCEPTION 'N6 v1 has exactly one destination kind, freightos_inbox: %', v_dest;
  END IF;

  -- (j) no N6 table carries a field-allowlist column. A second field enumeration beside
  --     network_disclosure_projection_fields is the thing this phase must not create.
  IF EXISTS (
    SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
       AND c.relname IN ('network_disclosure_subscriptions',
                         'network_disclosure_subscription_revocations')
       AND (a.attname LIKE '%pointer%' OR a.attname LIKE '%field%' OR a.attname LIKE '%projection%')
  ) THEN
    RAISE EXCEPTION 'a subscription must not name fields, pointers or a projection';
  END IF;

  -- (k) policy count on the seven tables, so a later change that drops one is loud.
  SELECT count(*) INTO v_policies FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('network_disclosure_subscriptions',
                       'network_disclosure_subscription_revocations',
                       'network_disclosure_routing_resolutions',
                       'network_disclosure_artifacts',
                       'network_disclosure_deliveries',
                       'network_delivery_attempts',
                       'network_disclosure_inbox');
  IF v_policies <> 19 THEN
    RAISE EXCEPTION 'expected 19 N6 policies, found %', v_policies;
  END IF;
END
$$;
