-- 0031 down — DELIBERATELY ASYMMETRIC. The hardening is not reverted.
--
-- READ THIS BEFORE CHANGING IT.
--
-- The only thing 0031 up did was close a security boundary: it revoked PUBLIC EXECUTE on
-- `app.record_audit_event` and gave `freightos_app` an explicit grant in its place. A symmetric
-- down migration therefore has exactly one meaning — RE-GRANT EXECUTE TO PUBLIC — and that single
-- statement would hand audit-ledger forgery back to every role that can log in, including
-- `freightos_event_writer`, with which the exploit was reproduced.
--
-- This down migration does not do that. It asserts the hardened state and leaves it in place.
--
-- WHY THIS DEPARTS FROM REPOSITORY PRECEDENT, EXPLICITLY.
--
-- `0019_pg_temp_definer_shadowing_hotfix.down.sql` is the closest precedent, and it does the
-- opposite: it restores its vulnerability in full, under a `SECURITY-SENSITIVE ROLLBACK` banner,
-- on the reasoning that "a down migration reverts a change; it does not editorialise."
--
-- That reasoning is sound where the down path has a legitimate non-security purpose. 0019 reverted
-- a large migration with structural content — schema pins, definer configuration, a database-level
-- grant — where restoring the prior state was the only way for a rollback to reach a coherent
-- earlier system. Rolling past it reopened a defect as a CONSEQUENCE of reverting real work.
--
-- 0031 has no such content. Its entire diff IS the security control. Reverting it is not a
-- side effect of restoring an earlier system; it is the deliberate reintroduction of ledger
-- forgery and nothing else. The two are different situations and they get different answers.
--
-- The controlling rule is `NETWORK_SECURITY_NON_REGRESSION_CHECKLIST.md` §Rules 4: "A network
-- requirement never justifies weakening a security control. If a network capability appears to
-- require it, the design is wrong — escalate rather than relax." A round-trip parity assumption is
-- not a stronger claim on this ACL than the Constitution Art. II.1 guarantee that the audit ledger
-- is authoritative.
--
-- WHAT A ROLLBACK PAST 0031 ACTUALLY LEAVES.
--
-- `freightos_app` keeps its explicit EXECUTE grant, so the governed audit path keeps working at
-- migration 0030 exactly as it did at 0031 — there is no functional regression to roll back to.
-- What does not come back is PUBLIC's ability to reach the definer. A cluster reverted to 0030 by
-- this file is a 0030 cluster that is SAFER than a 0030 cluster has ever been, and is functionally
-- identical in every respect a caller can observe.
--
-- THE KNOWN CONSEQUENCE, STATED RATHER THAN HIDDEN.
--
-- `migration-path-parity.test.ts` compares a database migrated FORWARD to a logical version against
-- one migrated to the tip and then rolled BACK to it, and asserts the two agree on `publicExec`
-- among other dimensions. Those two paths now legitimately disagree on exactly one entry — PUBLIC's
-- EXECUTE on this function — because only the rolled-back path has ever run 0031.
--
-- That gate is NOT weakened to accommodate this. It is narrowed to exclude this one named function
-- and then asserts, positively, that the rolled-back path is the safer of the two. A silent
-- exclusion would be indistinguishable from the defect this migration exists to fix.
--
-- No CASCADE. No DROP OWNED. Nothing is dropped at all.

-- ---------------------------------------------------------------------------
-- §1'. Assert the hardened ACL is intact, and leave it intact.
--
-- This block is the whole down migration. It is an assertion rather than a mutation on purpose: a
-- down path for a security fix should be able to state what it guarantees, and be tested on it.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_public_exec boolean;
  v_app_exec    boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(p.proacl) a
     WHERE n.nspname = 'app'
       AND p.proname = 'record_audit_event'
       AND oidvectortypes(p.proargtypes) = 'text, text, text, uuid, uuid, text, jsonb'
       AND a.grantee = 0
       AND a.privilege_type = 'EXECUTE'
  ) INTO v_public_exec;

  IF v_public_exec THEN
    RAISE EXCEPTION
      '0031 down: PUBLIC holds EXECUTE on app.record_audit_event. This down migration guarantees '
      'that reverting 0031 does not reopen audit-ledger forgery, and it cannot make that '
      'guarantee from this state.';
  END IF;

  SELECT has_function_privilege(
           'freightos_app',
           'app.record_audit_event(text,text,text,uuid,uuid,text,jsonb)',
           'EXECUTE')
    INTO v_app_exec;

  IF NOT v_app_exec THEN
    RAISE EXCEPTION
      '0031 down: freightos_app cannot execute app.record_audit_event. Reverting must not take '
      'the governed audit path away from the runtime role.';
  END IF;

  RAISE NOTICE
    '0031 down: reverted to 0030 with the audit ACL left hardened — PUBLIC revoked, '
    'freightos_app explicitly granted. This asymmetry is intentional; see the header.';
END
$$;
