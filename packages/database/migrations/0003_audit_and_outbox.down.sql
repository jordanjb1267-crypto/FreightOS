-- Down: 0003 — Audit ledger and transactional outbox.
DROP TABLE IF EXISTS outbox_events;
DROP FUNCTION IF EXISTS app.outbox_guard();
DROP TYPE IF EXISTS app.outbox_status;
DROP TABLE IF EXISTS audit_events;
