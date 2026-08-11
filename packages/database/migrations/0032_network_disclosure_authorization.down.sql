-- 0032 down — remove the N5-A disclosure-authorization core.
--
-- Ordinary structural revert. Unlike 0031's deliberately asymmetric down, this one really does
-- restore the prior state: N5-A ADDS a capability rather than removing one, so reverting it takes
-- authorization away and can never reopen a hole. The security-sensitive asymmetry rule applies to
-- migrations whose entire content is a control; this migration's content is a feature.
--
-- Drop order is dependency order, by name. No CASCADE and no DROP OWNED anywhere: both would let a
-- dependency this migration never created disappear silently, and "it dropped without error" is
-- not evidence that only the intended objects went.
--
-- WHAT MUST SURVIVE: everything N1-N4, the audit ledger, and — specifically — migration 0031's
-- hardened `app.record_audit_event` ACL. N5-A borrowed that function; reverting N5-A must not
-- hand it back to PUBLIC. Asserted at the end.

-- ---------------------------------------------------------------------------
-- §1'. Triggers, then the functions they reference.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS network_disclosure_grants_audit ON network_disclosure_grants;
DROP TRIGGER IF EXISTS network_disclosure_grant_revocations_audit ON network_disclosure_grant_revocations;
DROP TRIGGER IF EXISTS network_disclosure_grants_provenance ON network_disclosure_grants;
DROP TRIGGER IF EXISTS network_disclosure_grant_revocations_provenance ON network_disclosure_grant_revocations;

DROP FUNCTION IF EXISTS app.network_disclosure_grant_audit();
DROP FUNCTION IF EXISTS app.network_disclosure_revocation_audit();
DROP FUNCTION IF EXISTS app.network_disclosure_grant_provenance();
DROP FUNCTION IF EXISTS app.network_disclosure_revocation_provenance();

-- ---------------------------------------------------------------------------
-- §2'. Remove the three N5-A permission rows — exactly those three, and nothing else.
--
-- EXACT LOGICAL ROLLBACK. There is no repository precedent for permission vocabulary surviving a
-- down migration: only 0008 and this migration have ever inserted into `permissions`, no migration
-- has ever deleted a row, and 0008's own down drops the whole table rather than removing rows. So
-- leaving these three behind would invent a parity carve-out, not follow one.
--
-- WHY A TEMPORARY POLICY IS NEEDED, AND WHY NO PRIVILEGE GRANT IS.
--
-- `permissions` is owned by `freightos_migrator` and its ACL already carries `d` for that role
-- (`freightos_migrator=arwdDxt/freightos_migrator`), so the migration principal HAS the DELETE
-- privilege. What stops the delete is FORCE ROW LEVEL SECURITY: the table has policies for SELECT,
-- INSERT and UPDATE and none for DELETE, and FORCE applies to the owner too. Under FORCE RLS a
-- DELETE with no applicable policy matches zero rows and reports success — silently doing nothing.
--
-- So this creates a DELETE policy that exists only inside this transaction, scoped to the three
-- exact keys and to the migration principal, uses it, and drops it before commit. No privilege is
-- granted, no runtime identity can reach it, and nothing survives the rollback. `SET LOCAL` is not
-- available for policies, hence the explicit DROP plus the assertions in §4'.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_int   integer;
  v_text  text;
BEGIN
  -- (0) Capture the `permissions` ACL BEFORE this migration touches the table, so §4' can assert
  -- exact equality against the real pre-state rather than against a string this file believes the
  -- pre-state to be. Transaction-scoped (`set_config(..., is_local => true)`), so it needs no
  -- temporary object, no privilege, and cannot leak into another session.
  PERFORM set_config(
    'freightos.n5a_down_permissions_acl',
    coalesce((SELECT relacl::text FROM pg_class WHERE oid = 'public.permissions'::regclass), ''),
    true);

  -- Every predicate below names the three keys exactly. Not `LIKE 'network.disclosure_grant.%'`,
  -- which is not the literal it reads as: `_` is a LIKE wildcard, so that pattern also matches keys
  -- nobody here owns. It would only ever have caused a spurious abort — the DELETE itself is an
  -- exact IN with a row-count requirement — but a guard that silently means something other than
  -- what it says is not a guard.

  -- (A) Exactly the three expected keys exist as the N5-A seed set.
  SELECT string_agg(key, ',' ORDER BY key) INTO v_text
    FROM permissions WHERE key IN ('network.disclosure_grant.create',
                                   'network.disclosure_grant.read',
                                   'network.disclosure_grant.revoke');
  IF v_text IS DISTINCT FROM
     'network.disclosure_grant.create,network.disclosure_grant.read,network.disclosure_grant.revoke' THEN
    RAISE EXCEPTION
      '0032 down: expected exactly the three N5-A permission keys before cleanup, found %',
      coalesce(v_text, '(none)');
  END IF;

  -- (B) Their action mappings are the owner-approved ones. A key whose action has drifted is not
  -- the row this migration seeded, and deleting it would be deleting someone else's work.
  SELECT string_agg(key || '=' || action, ',' ORDER BY key) INTO v_text
    FROM permissions WHERE key IN ('network.disclosure_grant.create',
                                   'network.disclosure_grant.read',
                                   'network.disclosure_grant.revoke');
  IF v_text IS DISTINCT FROM
     'network.disclosure_grant.create=write,network.disclosure_grant.read=read,'
     'network.disclosure_grant.revoke=write' THEN
    RAISE EXCEPTION '0032 down: N5-A permission action mappings have drifted: %', v_text;
  END IF;

  -- (C) The catalog metadata 0032 introduced is intact — same resource, same seeding provenance.
  SELECT count(*) INTO v_int
    FROM permissions
   WHERE key IN ('network.disclosure_grant.create',
                 'network.disclosure_grant.read',
                 'network.disclosure_grant.revoke')
     AND resource = 'network_disclosure_grant'
     AND created_by = 'migration:0032'
     AND tenant_id = '00000000-0000-0000-0000-000000000000';
  IF v_int <> 3 THEN
    RAISE EXCEPTION
      '0032 down: only % of 3 N5-A permission rows still carry the metadata 0032 seeded', v_int;
  END IF;

  -- (D) NO role_permissions row references these keys — assigned OR revoked.
  --
  -- READ AS THE CONTROL PLANE, OR THIS GUARD IS BLIND. `role_permissions` is under FORCE RLS with
  -- `USING (app.is_control_plane() OR tenant_id = app.current_tenant_id())`. The migrator is
  -- neither: it is a member of `freightos_control_plane` with INHERIT FALSE, and it has no tenant.
  -- Counted as the migrator, this query returns 0 on every database in every state — a guard that
  -- cannot fail. The refusal would then come from the foreign key instead, which is fail-safe but
  -- reports a constraint name rather than the reason, and would leave (E) genuinely vacuous.
  --
  -- So it borrows `freightos_admin_owner` — the same loan the up migration takes to seed, SET LOCAL
  -- and handed straight back.
  SET LOCAL ROLE freightos_admin_owner;
  --
  -- Not `revoked_at IS NULL`. The foreign key `role_permissions.permission_id -> permissions.id` is
  -- unconditional, so a revoked row binds the permission just as firmly as a live one; counting
  -- only live assignments would let the DELETE below fail on a foreign key instead of on a guard
  -- that can explain itself.
  --
  -- The consequence is deliberate and it is the fail-safe direction: once one of these keys has
  -- EVER been assigned, this rollback stops until a human decides what should happen to the
  -- evidence. Revoking through the governed path marks the row revoked and keeps it — that is what
  -- an authorization ledger is for — so revoking is not sufficient to unblock the revert, and this
  -- migration will not delete the record on the operator's behalf either.
  SELECT count(*) INTO v_int
    FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key IN ('network.disclosure_grant.create',
                   'network.disclosure_grant.read',
                   'network.disclosure_grant.revoke');
  IF v_int <> 0 THEN
    RAISE EXCEPTION
      '0032 down: % role_permissions row(s) reference the N5-A permission keys (revoked rows '
      'count: the foreign key does not distinguish them). Reverting would either strip authority a '
      'tenant is relying on or destroy the record that it was ever held. This migration will not '
      'decide that for you — resolve those rows explicitly, then retry the rollback.', v_int;
  END IF;

  -- (E) The same, for service accounts. Same reasoning, same refusal.
  SELECT count(*) INTO v_int
    FROM service_account_permissions sap JOIN permissions p ON p.id = sap.permission_id
   WHERE p.key IN ('network.disclosure_grant.create',
                   'network.disclosure_grant.read',
                   'network.disclosure_grant.revoke');
  IF v_int <> 0 THEN
    RAISE EXCEPTION
      '0032 down: % service_account_permissions row(s) reference the N5-A permission keys', v_int;
  END IF;

  RESET ROLE;

  -- The loan is handed back before anything else happens. The DELETE below runs as the migration
  -- principal, which is the only role the temporary policy admits.
  IF current_user <> 'freightos_migrator' THEN
    RAISE EXCEPTION '0032 down: the control-plane loan was not returned, still %', current_user;
  END IF;
END
$$;

-- The temporary cleanup policy. Exact keys, migration principal only, this transaction only.
CREATE POLICY permissions_n5a_down_cleanup ON public.permissions
  FOR DELETE TO freightos_migrator
  USING (
    key IN (
      'network.disclosure_grant.create',
      'network.disclosure_grant.revoke',
      'network.disclosure_grant.read'
    )
  );

DO $$
DECLARE v_deleted integer;
BEGIN
  -- The statement names the three keys explicitly. Never a LIKE, never a domain prefix: a broad
  -- predicate that happened to match something else would delete it, and the policy above would
  -- not stop it because the policy is a ceiling, not the intent.
  DELETE FROM permissions
   WHERE key IN (
     'network.disclosure_grant.create',
     'network.disclosure_grant.revoke',
     'network.disclosure_grant.read'
   );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted <> 3 THEN
    RAISE EXCEPTION
      '0032 down: expected to delete exactly 3 N5-A permission rows, deleted %. Aborting rather '
      'than leaving the catalog in a state nobody predicted.', v_deleted;
  END IF;
END
$$;

-- Dropped before commit. Nothing this migration did to `permissions` outlives the transaction
-- except the absence of the three rows.
DROP POLICY permissions_n5a_down_cleanup ON public.permissions;

-- ---------------------------------------------------------------------------
-- §3'. Tables, child before parent, by name.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS network_disclosure_grant_revocations;
DROP TABLE IF EXISTS network_disclosure_grants;
DROP TABLE IF EXISTS network_disclosure_projection_fields;
DROP TABLE IF EXISTS network_disclosure_projections;
DROP TABLE IF EXISTS network_disclosure_authority_bases;
DROP TABLE IF EXISTS network_disclosure_purposes;

-- ---------------------------------------------------------------------------
-- §4'. Prove the revert was complete AND bounded.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_int  integer;
  v_text text;
  v_bool boolean;
BEGIN
  -- Nothing N5-A survived.
  SELECT count(*) INTO v_int
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname LIKE 'network_disclosure%';
  IF v_int <> 0 THEN
    RAISE EXCEPTION '0032 down: % N5-A relation(s) survived', v_int;
  END IF;

  SELECT count(*) INTO v_int
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'app' AND p.proname LIKE 'network_disclosure%';
  IF v_int <> 0 THEN
    RAISE EXCEPTION '0032 down: % N5-A function(s) survived', v_int;
  END IF;

  -- The three permission keys are GONE. Exact logical rollback, not a vocabulary carve-out.
  SELECT count(*) INTO v_int FROM permissions WHERE key IN ('network.disclosure_grant.create',
                                                            'network.disclosure_grant.read',
                                                            'network.disclosure_grant.revoke');
  IF v_int <> 0 THEN
    RAISE EXCEPTION '0032 down: % N5-A permission row(s) survived the cleanup', v_int;
  END IF;

  -- The temporary cleanup policy did not survive, and the policy inventory is exactly what it was
  -- at logical version 0031: three policies, for SELECT, INSERT and UPDATE, and no DELETE policy.
  SELECT string_agg(polname || ':' || polcmd::text, ',' ORDER BY polname) INTO v_text
    FROM pg_policy WHERE polrelid = 'public.permissions'::regclass;
  IF v_text IS DISTINCT FROM 'permissions_insert:a,permissions_read:r,permissions_update:w' THEN
    RAISE EXCEPTION
      '0032 down: the permissions policy inventory does not match logical version 0031: %',
      coalesce(v_text, '(none)');
  END IF;

  -- Belt as well as braces: no DELETE policy of any name survives on permissions.
  SELECT count(*) INTO v_int
    FROM pg_policy WHERE polrelid = 'public.permissions'::regclass AND polcmd = 'd';
  IF v_int <> 0 THEN
    RAISE EXCEPTION '0032 down: a DELETE policy survived on permissions';
  END IF;

  -- The ACL is untouched. No privilege was granted for the cleanup — the migration principal owns
  -- the table and already held DELETE — so this must equal the ACL captured at (0), byte for byte.
  -- Exact equality against the captured pre-state, not a `LIKE` over the rendered aclitem list: a
  -- pattern such as '%freightos_app=%d%' matches a `d` belonging to a LATER grantee in the same
  -- string and reports a change that did not happen.
  SELECT coalesce(relacl::text, '') INTO v_text
    FROM pg_class WHERE oid = 'public.permissions'::regclass;
  IF v_text IS DISTINCT FROM current_setting('freightos.n5a_down_permissions_acl', true) THEN
    RAISE EXCEPTION
      '0032 down: the permissions ACL changed. before=% after=%',
      coalesce(nullif(current_setting('freightos.n5a_down_permissions_acl', true), ''), '(default)'),
      coalesce(nullif(v_text, ''), '(default)');
  END IF;

  -- Independent of the baseline: DELETE on `permissions` is held by the table owner and by nobody
  -- else. Per-grantee via aclexplode, so no privilege letter can be attributed to the wrong role.
  SELECT string_agg(g.grantee_name, ',' ORDER BY g.grantee_name) INTO v_text
    FROM (
      SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END
               AS grantee_name
        FROM pg_class c
             CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
       WHERE c.oid = 'public.permissions'::regclass AND a.privilege_type = 'DELETE'
    ) g;
  IF v_text IS DISTINCT FROM 'freightos_migrator' THEN
    RAISE EXCEPTION
      '0032 down: DELETE on permissions is held by % — expected the owner alone',
      coalesce(v_text, '(nobody)');
  END IF;

  -- And FORCE RLS is still on. A cleanup that disabled it would be invisible in a policy count.
  SELECT relrowsecurity AND relforcerowsecurity INTO v_bool
    FROM pg_class WHERE oid = 'public.permissions'::regclass;
  IF NOT v_bool THEN
    RAISE EXCEPTION '0032 down: permissions lost ENABLE/FORCE row level security';
  END IF;

  -- No index, constraint or trigger still names an N5-A relation. Dropping a table takes its
  -- dependent objects with it, so this is a completeness check on the sweep above rather than an
  -- independent risk — but a survivor here would mean a table was renamed rather than dropped.
  SELECT count(*) INTO v_int
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE t.tgname LIKE 'network_disclosure%' AND NOT t.tgisinternal;
  IF v_int <> 0 THEN
    RAISE EXCEPTION '0032 down: % N5-A trigger(s) survived', v_int;
  END IF;

  -- N1/N3/N4 intact.
  SELECT count(*) INTO v_int
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('network_participants', 'network_events', 'network_transport_intents',
                       'network_schema_versions');
  IF v_int <> 4 THEN
    RAISE EXCEPTION '0032 down: the revert damaged N1/N2/N3/N4 — found % of 4 tables', v_int;
  END IF;

  -- No role was created or dropped by N5-A, so none may vanish with it.
  SELECT count(*) INTO v_int FROM pg_roles WHERE rolname = 'freightos_app';
  IF v_int <> 1 THEN
    RAISE EXCEPTION '0032 down: freightos_app was dropped';
  END IF;

  -- SR-AUDIT-ACL-NOOP survives the revert. This is the assertion that matters most here: N5-A
  -- borrowed app.record_audit_event, and giving it back to PUBLIC on the way out would reopen
  -- ledger forgery as a side effect of reverting an unrelated feature.
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(p.proacl) a
     WHERE n.nspname = 'app' AND p.proname = 'record_audit_event'
       AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') INTO v_bool;
  IF v_bool THEN
    RAISE EXCEPTION '0032 down: reverting N5-A restored PUBLIC EXECUTE on app.record_audit_event';
  END IF;

  SELECT string_agg(g.rolname, ',' ORDER BY g.rolname) INTO v_text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(p.proacl) a
    JOIN pg_roles g ON g.oid = a.grantee
   WHERE n.nspname = 'app' AND p.proname = 'record_audit_event' AND a.privilege_type = 'EXECUTE';
  IF v_text IS DISTINCT FROM 'freightos_app,freightos_audit_writer' THEN
    RAISE EXCEPTION '0032 down: app.record_audit_event grantees changed to %', coalesce(v_text, '(none)');
  END IF;

  RAISE NOTICE '0032 down: N5-A removed; N1-N4 and the 0031 audit ACL intact';
END
$$;
