-- Down: 0004 — Kill switches.
DROP FUNCTION IF EXISTS app.resolve_kill_switch_mode(uuid, text, text, text, text, text);
DROP TABLE IF EXISTS kill_switches;
DROP TYPE IF EXISTS app.kill_switch_mode;
DROP TYPE IF EXISTS app.kill_switch_scope;
