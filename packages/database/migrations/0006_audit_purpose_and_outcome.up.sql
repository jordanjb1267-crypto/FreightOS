-- 0006 — OQ-20: purpose and outcome on the audit ledger and the outbox envelope.
--
-- ADR-0020 §"Required audit fields on every privileged operation" lists purpose and outcome as
-- mandatory and then records that neither has a column. This migration creates them, and it lands
-- BEFORE 0012 creates the `admin` schema: shipping a privileged function first would make ADR-0020
-- claim an audit trail that does not exist (docs/governance/OPEN_QUESTIONS.md, OQ-20).
--
-- Backward compatibility is mandatory. Every Phase 0 audit row must stay valid and readable:
--   * `purpose` and `outcome` are nullable at the column level.
--   * `operation_class` defaults to 'domain', which is what every pre-existing row is.
--   * The NOT NULL requirement is a CHECK conditioned on operation_class = 'privileged', exactly
--     as OQ-20 specifies, rather than a global mandate that would invalidate history.
--
-- The outbox is treated differently on purpose. It carries the CloudEvents envelope, and ADR-0019
-- requirement 6 makes `purpose` part of the envelope, so it is NOT NULL there. Existing rows are
-- backfilled with `service_operation` before the constraint is applied.

-- ---------------------------------------------------------------------------
-- The closed vocabularies.
--
-- Functions rather than enums: OQ-20 specifies `outcome` as a CHECK over a closed set, and a
-- function keeps purpose and outcome extensible by a reviewed transactional migration instead of
-- a non-transactional ALTER TYPE. IMMUTABLE so both are usable inside a CHECK constraint.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.is_permitted_purpose(p_purpose text) RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_purpose IN (
    'service_operation',
    'tenant_provisioning',
    'tenant_lifecycle',
    'identity_administration',
    'access_review',
    'audit_export',
    'incident_response',
    'security_investigation',
    'regulatory_request',
    'platform_operations'
  )
$$;
COMMENT ON FUNCTION app.is_permitted_purpose IS
  'OQ-20 closed purpose vocabulary. Mirrored by PURPOSES in packages/identity/src/purpose.ts. '
  'Purpose is supplied by the trusted command or control-plane boundary and is never authored, '
  'widened, or selected by model output.';

CREATE FUNCTION app.is_privileged_purpose(p_purpose text) RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT app.is_permitted_purpose(p_purpose) AND p_purpose <> 'service_operation'
$$;
COMMENT ON FUNCTION app.is_privileged_purpose IS
  'The subset a cross-tenant control-plane operation may declare. `service_operation` is the '
  'ordinary tenant-scoped purpose and is deliberately excluded: a privileged call may not hide '
  'behind the routine purpose.';

CREATE FUNCTION app.is_permitted_outcome(p_outcome text) RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_outcome IN ('succeeded', 'denied', 'failed')
$$;
COMMENT ON FUNCTION app.is_permitted_outcome IS
  'OQ-20 closed outcome vocabulary.';

-- ---------------------------------------------------------------------------
-- audit_events.
-- ---------------------------------------------------------------------------

ALTER TABLE audit_events
  ADD COLUMN operation_class text NOT NULL DEFAULT 'domain',
  ADD COLUMN purpose text,
  ADD COLUMN outcome text;

ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_operation_class_shape
    CHECK (operation_class IN ('domain', 'privileged')),

  ADD CONSTRAINT audit_events_purpose_vocabulary
    CHECK (purpose IS NULL OR app.is_permitted_purpose(purpose)),

  ADD CONSTRAINT audit_events_outcome_vocabulary
    CHECK (outcome IS NULL OR app.is_permitted_outcome(outcome)),

  -- Every privileged operation records how it ended, including the ones that were refused.
  ADD CONSTRAINT audit_events_privileged_requires_outcome
    CHECK (operation_class <> 'privileged' OR outcome IS NOT NULL),

  -- The fail-closed rule. A privileged row that succeeded or failed must carry a valid privileged
  -- purpose, so a privileged function cannot record a half-formed trail even if its own
  -- validation were bypassed.
  --
  -- A DENIED row is exempt, and deliberately so: the commonest reason to deny is that no purpose
  -- was supplied or the one supplied was outside the vocabulary. Requiring a purpose on the
  -- refusal record would force the ledger to invent one, and OQ-20 states plainly that absence is
  -- never defaulted, inferred, or backfilled. The refusal is recorded with the purpose absent —
  -- which is the fact.
  ADD CONSTRAINT audit_events_privileged_requires_purpose
    CHECK (
      operation_class <> 'privileged'
      OR outcome = 'denied'
      OR (purpose IS NOT NULL AND app.is_privileged_purpose(purpose))
    ),

  -- Constitution Art. I.5 and the OQ-20 trust boundary: model output cannot establish privileged
  -- purpose. A privileged operation is performed by a person or by the platform — never by an
  -- agent, and never by a tenant integration. What an agent actually offered is recorded in the
  -- denial payload, so the attempt is evidenced without the ledger asserting it was authorised.
  ADD CONSTRAINT audit_events_privileged_actor_is_human_or_system
    CHECK (
      operation_class <> 'privileged'
      OR actor_type IN ('human', 'system')
    );

COMMENT ON COLUMN audit_events.operation_class IS
  'OQ-20 compatibility strategy. Pre-existing rows default to `domain` and stay valid; only '
  '`privileged` rows carry the mandatory purpose and outcome.';
COMMENT ON COLUMN audit_events.purpose IS
  'Why the actor performed the operation. Closed vocabulary — app.is_permitted_purpose.';
COMMENT ON COLUMN audit_events.outcome IS
  'succeeded | denied | failed. Recorded for privileged operations including refusals, so a '
  'denial leaves evidence rather than silence.';

CREATE INDEX audit_events_privileged_idx
  ON audit_events (tenant_id, created_at DESC)
  WHERE operation_class = 'privileged';

-- ---------------------------------------------------------------------------
-- outbox_events — the event envelope (ADR-0019 requirement 6).
-- ---------------------------------------------------------------------------

ALTER TABLE outbox_events ADD COLUMN purpose text;
UPDATE outbox_events SET purpose = 'service_operation' WHERE purpose IS NULL;
ALTER TABLE outbox_events ALTER COLUMN purpose SET NOT NULL;

ALTER TABLE outbox_events
  ADD CONSTRAINT outbox_events_purpose_vocabulary
    CHECK (app.is_permitted_purpose(purpose));

COMMENT ON COLUMN outbox_events.purpose IS
  'Envelope attribute, mandatory. Mirrors `purpose` in schemas/event-envelope.schema.json, which '
  'is a declared override authorised by ADR-0015 and ADR-0019.';

-- The envelope is immutable once written, so purpose joins the frozen set rather than the
-- delivery-bookkeeping set.
CREATE OR REPLACE FUNCTION app.outbox_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_id  IS DISTINCT FROM OLD.event_id
     OR NEW.event_type IS DISTINCT FROM OLD.event_type
     OR NEW.payload   IS DISTINCT FROM OLD.payload
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
     OR NEW.purpose IS DISTINCT FROM OLD.purpose THEN
    RAISE EXCEPTION 'outbox_events envelope and payload are immutable once written'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;
