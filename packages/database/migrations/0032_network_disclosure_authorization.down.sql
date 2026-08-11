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
-- §2'. The permission rows are DELIBERATELY LEFT IN PLACE.
--
-- The brief allows removing them "if the migration contract permits". It does not permit.
--
-- `permissions` carries policies for SELECT, INSERT and UPDATE — and NO DELETE POLICY AT ALL.
-- Under FORCE ROW LEVEL SECURITY a DELETE with no matching policy matches zero rows and reports
-- success, so a naive delete here would silently do nothing and the assertion below would be the
-- only thing that noticed. Making it work would mean adding a DELETE policy to `permissions`,
-- which permanently widens an existing security surface in order to tidy up after a revert. That
-- trade is not worth making, and 0008 already refused the analogous one for the migrator.
--
-- LEAVING THEM IS SAFE, and not merely convenient. A permission key confers nothing on its own:
-- `app.user_has_permission` resolves through `role_permissions`, so a key with no assignment
-- authorizes no one. The up migration asserts zero assignments, and this file re-asserts it — if a
-- role ever holds one, the revert stops rather than leaving a live authority behind for a feature
-- that no longer exists.
--
-- The up migration is `ON CONFLICT (key) DO NOTHING` precisely so that a down/up cycle is clean
-- with the rows still present.
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_assigned integer;
BEGIN
  SELECT count(*) INTO v_assigned
    FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key LIKE 'network.disclosure_grant.%';
  IF v_assigned <> 0 THEN
    RAISE EXCEPTION
      '0032 down: % role assignment(s) reference the disclosure permissions. The keys survive a '
      'revert by design, but an ASSIGNED one would leave live authority for a feature that no '
      'longer exists. Revoke it through the governed role-administration path first.', v_assigned;
  END IF;
END
$$;

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

  -- The three permission keys SURVIVE, by design (§2'). Asserted positively so the intent is
  -- unmistakable: this is a decision, not a leak the revert failed to clean up.
  SELECT count(*) INTO v_int FROM permissions WHERE key LIKE 'network.disclosure_grant.%';
  IF v_int <> 3 THEN
    RAISE EXCEPTION
      '0032 down: expected the 3 disclosure permission keys to remain (see §2''), found %', v_int;
  END IF;

  SELECT count(*) INTO v_int
    FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key LIKE 'network.disclosure_grant.%';
  IF v_int <> 0 THEN
    RAISE EXCEPTION '0032 down: % surviving disclosure permission assignment(s)', v_int;
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

  -- The loaned DELETE privilege on permissions was handed back.
  SELECT count(*) INTO v_int
    FROM information_schema.role_table_grants
   WHERE table_name = 'permissions' AND grantee = 'freightos_admin_owner'
     AND privilege_type = 'DELETE';
  IF v_int <> 0 THEN
    RAISE EXCEPTION '0032 down: freightos_admin_owner kept DELETE on permissions';
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
