-- 0003 — Append-only audit ledger and the transactional outbox.
--
-- Closes G3 (no outbox anywhere in the package) and G7 (nothing enforced append-only audit).
--
-- Constitution Art. II.1: "PostgreSQL domain records and append-only audit events are
-- authoritative."  Art. II.6: "Every material state change emits a versioned event."
--
-- Neither table carries updated_at or version. A row that must never change has no use for a
-- mutation counter, and carrying one would imply it may be mutated.

-- ---------------------------------------------------------------------------
-- Audit ledger.
-- ---------------------------------------------------------------------------

CREATE TABLE audit_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  legal_entity_id       uuid,
  legal_authority_class app.legal_authority_class NOT NULL,
  operating_context     app.operating_context NOT NULL,
  actor_type            text NOT NULL CHECK (actor_type IN ('human', 'agent', 'system', 'integration')),
  actor_id              text NOT NULL CHECK (length(btrim(actor_id)) > 0),
  event_type            text NOT NULL CHECK (event_type ~ '^rig\.freight\.[a-z0-9_.-]+\.v[0-9]+$'),
  resource_type         text NOT NULL,
  resource_id           text,
  correlation_id        uuid NOT NULL,
  causation_id          uuid,
  policy_version        text,
  payload               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            text NOT NULL,

  CONSTRAINT audit_events_legal_pairing
    CHECK (app.is_permitted_legal_pairing(legal_authority_class, operating_context)),

  -- ADR-0015 rule 4: legal_entity_id may be omitted ONLY under explicit system scope with an
  -- authorized actor. Anywhere else it is mandatory. This is the constraint that stops
  -- "nullable everywhere" from quietly becoming the norm.
  CONSTRAINT audit_events_legal_entity_required
    CHECK (
      legal_entity_id IS NOT NULL
      OR (operating_context = 'system' AND actor_type IN ('system', 'human'))
    )
);

COMMENT ON TABLE audit_events IS
  'Append-only. UPDATE, DELETE and TRUNCATE are rejected by trigger and by revoked privilege.';

CREATE INDEX audit_events_tenant_created_idx ON audit_events (tenant_id, created_at DESC);
CREATE INDEX audit_events_correlation_idx ON audit_events (correlation_id);
CREATE INDEX audit_events_resource_idx ON audit_events (tenant_id, resource_type, resource_id);

CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER audit_events_no_delete
  BEFORE DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

-- Row-level triggers never fire for TRUNCATE, so it needs its own statement-level trigger.
-- Without this, TRUNCATE is an unguarded hole straight through the append-only guarantee.
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_events_isolation ON audit_events
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());

GRANT SELECT, INSERT ON audit_events TO freightos_app;
GRANT SELECT, INSERT ON audit_events TO freightos_control_plane;
-- Belt as well as braces: the trigger raises, and the privilege is not granted in the first
-- place. Neither alone is sufficient — a superuser bypasses privileges, a trigger can be
-- disabled by the owner.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM freightos_app, freightos_control_plane;

-- ---------------------------------------------------------------------------
-- Transactional outbox.
--
-- Written in the same transaction as the state change it describes, so an event cannot be
-- published for a change that rolled back, and a committed change cannot lose its event.
-- ---------------------------------------------------------------------------

CREATE TYPE app.outbox_status AS ENUM ('pending', 'in_flight', 'published', 'dead_letter');

CREATE TABLE outbox_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  legal_entity_id       uuid,
  legal_authority_class app.legal_authority_class NOT NULL,
  operating_context     app.operating_context NOT NULL,

  -- CloudEvents 1.0 envelope fields (00_MASTER_HANDOFF: CloudEvents-compatible envelopes).
  event_id              uuid NOT NULL UNIQUE,
  event_type            text NOT NULL CHECK (event_type ~ '^rig\.freight\.[a-z0-9_.-]+\.v[0-9]+$'),
  event_source          text NOT NULL,
  event_subject         text,
  event_time            timestamptz NOT NULL,
  actor_id              text NOT NULL,
  correlation_id        uuid NOT NULL,
  causation_id          uuid,
  payload               jsonb NOT NULL,

  status                app.outbox_status NOT NULL DEFAULT 'pending',
  attempts              integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  -- Lease, so a crashed publisher's claim expires instead of stranding the event forever.
  claimed_at            timestamptz,
  claim_expires_at      timestamptz,
  published_at          timestamptz,
  last_error            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            text NOT NULL,

  CONSTRAINT outbox_events_legal_pairing
    CHECK (app.is_permitted_legal_pairing(legal_authority_class, operating_context)),
  CONSTRAINT outbox_events_legal_entity_required
    CHECK (legal_entity_id IS NOT NULL OR operating_context = 'system'),
  CONSTRAINT outbox_events_published_consistency
    CHECK ((status = 'published') = (published_at IS NOT NULL)),
  CONSTRAINT outbox_events_claim_consistency
    CHECK ((claimed_at IS NULL) = (claim_expires_at IS NULL))
);

COMMENT ON TABLE outbox_events IS
  'Transactional outbox. event_id is UNIQUE so a redelivered event is idempotent downstream — '
  'Constitution Art. II.5, every external action uses an idempotency key.';

-- Partial index: the publisher only ever scans work that is actually outstanding.
CREATE INDEX outbox_events_pending_idx
  ON outbox_events (created_at)
  WHERE status IN ('pending', 'in_flight');

CREATE INDEX outbox_events_tenant_idx ON outbox_events (tenant_id, created_at DESC);

-- The payload and envelope are immutable once written; only delivery bookkeeping may change.
CREATE FUNCTION app.outbox_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_id  IS DISTINCT FROM OLD.event_id
     OR NEW.event_type IS DISTINCT FROM OLD.event_type
     OR NEW.payload   IS DISTINCT FROM OLD.payload
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id THEN
    RAISE EXCEPTION 'outbox_events envelope and payload are immutable once written'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER outbox_events_immutable_envelope
  BEFORE UPDATE ON outbox_events
  FOR EACH ROW EXECUTE FUNCTION app.outbox_guard();

CREATE TRIGGER outbox_events_no_truncate
  BEFORE TRUNCATE ON outbox_events
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;

CREATE POLICY outbox_events_isolation ON outbox_events
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_control_plane() OR tenant_id = app.current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON outbox_events TO freightos_app;
GRANT SELECT, INSERT, UPDATE ON outbox_events TO freightos_control_plane;
REVOKE DELETE, TRUNCATE ON outbox_events FROM freightos_app, freightos_control_plane;
