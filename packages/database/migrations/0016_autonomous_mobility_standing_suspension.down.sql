-- Down: 0016 — the standing autonomous_mobility suspension.
--
-- kill_switches is append-only: a row-level trigger rejects DELETE and a statement-level trigger
-- rejects TRUNCATE, which is exactly the protection Art. II.1 requires of incident evidence.
--
-- Removing a seed row the up migration created is the one legitimate exception, and it is made
-- narrow on purpose: the trigger is disabled only for this statement, the DELETE names the seed's
-- fixed id and nothing else, and the trigger is restored immediately. The revert is a schema
-- operation on a row that never recorded a real incident.
--
-- Disabling the trigger requires table ownership, which the migrator has and neither
-- freightos_app nor freightos_control_plane does. The append-only guarantee for every other role
-- and every other row is untouched.

ALTER TABLE kill_switches DISABLE TRIGGER kill_switches_no_delete;

DELETE FROM kill_switches WHERE id = 'f0000000-0000-4000-8000-00000000a119';

ALTER TABLE kill_switches ENABLE TRIGGER kill_switches_no_delete;
