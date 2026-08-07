-- freightos:no-transaction
-- 0014 — OQ-19, part 1: add `legal_entity` and `operating_context` to app.kill_switch_scope.
--
-- ADR-0019 requirement 7 names legal entity and operating context as kill-switch targets, and
-- 0004_kill_switches.up.sql:11-19 enumerates seven scopes that include neither. Ruling A is
-- unenforceable at runtime until the values exist.
--
-- WHY THIS IS ITS OWN MIGRATION
--
-- PostgreSQL refuses to USE a value added by ALTER TYPE ... ADD VALUE inside the transaction that
-- added it (SQLSTATE 55P04). The no-transaction marker above stops the runner wrapping this file,
-- but it is not sufficient on its own: a multi-statement simple query is still an implicit
-- transaction, so adding a value and referencing it in one file would fail either way. Splitting
-- the addition from every use of it — 0015 — is what actually makes this safe, and ADR-0017 §4
-- requires the marker regardless.
--
-- These two statements only ADD values. Nothing here references them.
--
-- Placed AFTER their nearest broader neighbour so the enum keeps reading broadest to narrowest.
-- Ordering carries no behaviour for scopes — restrictiveness ordering lives on
-- app.kill_switch_mode, and resolution is most-restrictive-wins across whichever scopes apply.

ALTER TYPE app.kill_switch_scope ADD VALUE IF NOT EXISTS 'legal_entity' AFTER 'legal_plane';
ALTER TYPE app.kill_switch_scope ADD VALUE IF NOT EXISTS 'operating_context' AFTER 'legal_entity';
