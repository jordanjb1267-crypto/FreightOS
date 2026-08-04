-- Down: 0006 — OQ-20 purpose and outcome.
--
-- Recovery note: reverting discards the recorded purpose and outcome of every privileged
-- operation. docs/runbooks/database-migration-recovery.md requires the audit ledger to be
-- exported before this down runs in any environment that has served a privileged call.

CREATE OR REPLACE FUNCTION app.outbox_guard() RETURNS trigger
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

ALTER TABLE outbox_events DROP CONSTRAINT IF EXISTS outbox_events_purpose_vocabulary;
ALTER TABLE outbox_events DROP COLUMN IF EXISTS purpose;

DROP INDEX IF EXISTS audit_events_privileged_idx;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_privileged_actor_is_human_or_system,
  DROP CONSTRAINT IF EXISTS audit_events_privileged_requires_purpose,
  DROP CONSTRAINT IF EXISTS audit_events_privileged_requires_outcome,
  DROP CONSTRAINT IF EXISTS audit_events_outcome_vocabulary,
  DROP CONSTRAINT IF EXISTS audit_events_purpose_vocabulary,
  DROP CONSTRAINT IF EXISTS audit_events_operation_class_shape;

ALTER TABLE audit_events
  DROP COLUMN IF EXISTS outcome,
  DROP COLUMN IF EXISTS purpose,
  DROP COLUMN IF EXISTS operation_class;

DROP FUNCTION IF EXISTS app.is_permitted_outcome(text);
DROP FUNCTION IF EXISTS app.is_privileged_purpose(text);
DROP FUNCTION IF EXISTS app.is_permitted_purpose(text);
