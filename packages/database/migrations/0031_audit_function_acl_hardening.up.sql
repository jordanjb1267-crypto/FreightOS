-- 0031 — SR-AUDIT-ACL-NOOP. Converge the EXECUTE ACL on app.record_audit_event.
--
-- THE DEFECT. Migration 0018 §1 created `app.record_audit_event` as a SECURITY DEFINER owned by
-- `freightos_audit_writer` — the only role holding INSERT on `audit_events` — so that the ledger
-- could be written by exactly one governed path and by nothing else. It then intended to close the
-- door behind it:
--
--     RESET ROLE;                                              -- 0018:205
--     REVOKE ALL ON FUNCTION app.record_audit_event(...) FROM PUBLIC;      -- 0018:207
--     GRANT EXECUTE ON FUNCTION app.record_audit_event(...) TO freightos_app, ...;  -- 0018:209
--
-- The RESET ROLE on line 205 is the defect. It returned execution to `freightos_migrator`, which
-- administers `freightos_audit_writer` WITH SET TRUE, INHERIT FALSE. Without INHERIT, PostgreSQL
-- does not treat the migrator as the function's owner, so it discarded BOTH statements:
--
--     WARNING:  no privileges could be revoked for "record_audit_event"
--     WARNING:  no privileges were granted for "record_audit_event"
--
-- A warning is not an error. The migration reported success, the driver recorded 0018 as applied,
-- and the function kept its creation-time default ACL — in which PUBLIC holds EXECUTE.
--
-- WHY THAT MATTERS. `freightos_app` reaches the function through PUBLIC, so the intended path
-- worked and nothing looked wrong. But so does every other role that can log in. The impact was
-- reproduced with `freightos_event_writer`, whose entire purpose is N3/N4 event acceptance and
-- which has no business touching the ledger: because its `session_user` is not `freightos_app`,
-- `app.current_tenant_id()` and `app.current_actor_id()` fall through to their legacy GUC branch
-- (0020 §"verified actor binding" hardened the app path and deliberately left the others alone).
-- Supplying `app.tenant_id` and `app.actor_id` itself, the writer inserted an audit row naming a
-- tenant of its choosing and a fabricated HUMAN actor. That is audit-ledger forgery by an
-- unrelated runtime service.
--
-- It is not undetectable forgery — `payload.provenance` still records the true `session_user` and
-- `current_user`, read from the connection inside the definer, so a forged row can be identified
-- by anyone who can read the ledger. Detectability is a mitigation, not a control. Constitution
-- Art. II.1 makes the audit ledger authoritative, and an authoritative record that an unrelated
-- service can write false entries into is not authoritative.
--
-- WHAT THIS MIGRATION DOES. Applies the ACL 0018 intended, under an identity PostgreSQL actually
-- permits to change it, and then PROVES the result from `pg_proc.proacl` rather than trusting that
-- the statements ran. The catalog assertion in §3 is the control that was missing: it is what makes
-- a repeat of this failure mode loud instead of silent.
--
-- 0018 IS NOT EDITED. It is applied history. A cluster that ran it carries the broken ACL, and the
-- repair has to be a new convergent migration that reaches both that cluster and a fresh one.
--
-- AUTHORIZED EXECUTE PRINCIPAL: `freightos_app`, and only `freightos_app`.
--
-- That is not an assumption. Every reference to this function in the repository was inventoried
-- before the ACL was written:
--
--   * no function body anywhere calls it — confirmed against the live catalog with
--     `SELECT ... FROM pg_proc WHERE prosrc LIKE '%record_audit_event%'`, which returns nothing
--     but the function itself, so no SECURITY DEFINER owned by another role needs EXECUTE;
--   * no runtime TypeScript calls it yet;
--   * the two integration call sites — `ledger.test.ts:106` and
--     `authority-remediation.test.ts:1029,1042` — both route through
--     `withAuthenticatedTestPrincipal`, which connects as `freightos_app`
--     (`verified-test-auth.ts:125`). Its second connection, as `freightos_admin`, is the
--     control-plane binding ISSUER and never calls this function.
--
-- `freightos_control_plane` was named as a grantee by 0018 and is deliberately NOT restored here.
-- No caller of any kind exercises it, and 0018's own §1 revoked that role's direct INSERT on
-- `audit_events` precisely to take it off the ledger's write path. Restoring an unused EXECUTE
-- grant because a line of never-effective SQL once named it would widen the boundary on the
-- authority of a statement that never took effect. If a control-plane caller is ever required, it
-- arrives with its caller, its test, and a reviewed decision.

-- ---------------------------------------------------------------------------
-- §1. Observe the pre-state, and refuse to run against an unrecognised one.
--
-- THE DEFECT IS CONDITIONAL ON THE DEPLOYMENT IDENTITY, and this is where that matters.
--
-- 0018's ACL statements fail silently for `freightos_migrator` because it is not the owner. They
-- do NOT fail for a superuser: a superuser is permitted to grant on any object, so a cluster whose
-- migrations were run as `postgres` came out of 0018 with exactly the ACL 0018 intended —
-- `freightos_app` and `freightos_control_plane` explicitly granted, PUBLIC revoked. That is not a
-- hypothetical: `kill-switch-scopes.test.ts` migrates as `postgres` and produces precisely that
-- state, which is how this case was found.
--
-- So there are THREE pre-states in the wild, and all three must converge:
--
--   A. PUBLIC=EXECUTE, no explicit grantee    — production, migrated by freightos_migrator. Broken.
--   B. freightos_app + freightos_control_plane explicitly granted, PUBLIC revoked
--                                             — migrated by a superuser. 0018 worked. Still wider
--                                               than the ruled target, because no caller anywhere
--                                               exercises the control-plane grant.
--   C. freightos_app only, PUBLIC revoked     — already converged by this migration.
--
-- `freightos_control_plane` is therefore an EXPECTED pre-state grantee, not an anomaly, and §2
-- revokes it rather than aborting. Anything outside {owner, freightos_app, freightos_control_plane}
-- is genuinely unexplained: someone granted this function out of band, and a security migration
-- must not quietly normalise a state nobody has reviewed.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_owner    text;
  v_secdef   boolean;
  v_acl      text;
  v_unexpected text;
BEGIN
  SELECT pg_get_userbyid(p.proowner), p.prosecdef, coalesce(p.proacl::text, '(default)')
    INTO v_owner, v_secdef, v_acl
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'app'
     AND p.proname = 'record_audit_event'
     AND oidvectortypes(p.proargtypes) = 'text, text, text, uuid, uuid, text, jsonb';

  IF v_owner IS NULL THEN
    RAISE EXCEPTION
      '0031: app.record_audit_event(text,text,text,uuid,uuid,text,jsonb) does not exist';
  END IF;

  -- The repair depends on this function being the definer 0018 built. If ownership or the definer
  -- bit has moved, the ACL is not the whole story and a human has to look.
  IF v_owner <> 'freightos_audit_writer' THEN
    RAISE EXCEPTION '0031: expected owner freightos_audit_writer, found %', v_owner;
  END IF;
  IF NOT v_secdef THEN
    RAISE EXCEPTION '0031: app.record_audit_event is no longer SECURITY DEFINER';
  END IF;

  -- Any explicit grantee outside the three pre-states above. PUBLIC is excluded from this check
  -- because PUBLIC is precisely what §2 revokes, and `freightos_control_plane` is excluded because
  -- pre-state B is a legitimate history that §2 converges. An unexplained NAMED grantee — an
  -- operator role, `freightos_event_writer`, anything else — is the thing that must stop the
  -- migration rather than be silently normalised.
  SELECT string_agg(format('%s=%s', g.rolname, a.privilege_type), ', ' ORDER BY g.rolname)
    INTO v_unexpected
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(p.proacl) a
    JOIN pg_roles g ON g.oid = a.grantee
   WHERE n.nspname = 'app'
     AND p.proname = 'record_audit_event'
     AND oidvectortypes(p.proargtypes) = 'text, text, text, uuid, uuid, text, jsonb'
     AND g.rolname NOT IN (
       'freightos_audit_writer',   -- the owner
       'freightos_app',            -- the ruled runtime caller
       'freightos_control_plane'   -- pre-state B; revoked by §2
     );

  IF v_unexpected IS NOT NULL THEN
    RAISE EXCEPTION
      '0031: app.record_audit_event carries an unexplained explicit grant: %. '
      'Refusing to converge an ACL that was not established by a reviewed migration.',
      v_unexpected;
  END IF;

  RAISE NOTICE '0031: pre-state acl=%', v_acl;
END
$$;

-- ---------------------------------------------------------------------------
-- §2. Apply the ACL AS THE OWNER.
--
-- This is the whole correction. `freightos_migrator` administers `freightos_audit_writer` with
-- SET TRUE, INHERIT FALSE (0018 §1), so it may BECOME the writer even though it does not carry the
-- writer's rights in an ordinary statement — administering a role and being one are different
-- powers, and the split is deliberate: with INHERIT the migrator would silently hold INSERT on
-- audit_events for the rest of every deployment session.
--
-- SET LOCAL, not SET: the role reverts at COMMIT even if a later statement in this migration
-- raises, so no path leaves a deployment session running as the audit writer.
-- ---------------------------------------------------------------------------

SET LOCAL ROLE freightos_audit_writer;

REVOKE ALL ON FUNCTION app.record_audit_event(text, text, text, uuid, uuid, text, jsonb)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.record_audit_event(text, text, text, uuid, uuid, text, jsonb)
  TO freightos_app;

-- Named explicitly rather than left to the blanket REVOKE above. These are the roles that can log
-- in and were therefore the reachable exploit paths; naming them makes the intent legible and makes
-- a future re-grant of any one a visible diff rather than an absence.
--
-- `freightos_control_plane` is the one that does real work here. On a superuser-migrated cluster
-- (pre-state B in §1) 0018's GRANT succeeded and that role genuinely holds EXECUTE, so this is the
-- statement that converges it to the ruled target. Nothing calls the function as the control plane:
-- no function body, no runtime code, and neither integration call site. 0018 §1 had already revoked
-- that role's direct INSERT on `audit_events` to take it off the ledger's write path, so leaving it
-- an EXECUTE grant would preserve by accident exactly what 0018 removed on purpose.
--
-- The other two are no-ops on every known history, and stay no-ops unless someone adds a grant.
REVOKE ALL ON FUNCTION app.record_audit_event(text, text, text, uuid, uuid, text, jsonb)
  FROM freightos_event_writer, freightos_control_plane, freightos_admin;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- §3. Prove it from the catalog.
--
-- THE CONTROL 0018 DID NOT HAVE. 0018's REVOKE and GRANT "succeeded" as SQL statements while
-- changing nothing, and no assertion looked afterwards. Every statement in §2 could fail the same
-- way — a future refactor could move the RESET ROLE again — and this block is what turns that into
-- a failed deployment instead of a silently reopened hole.
--
-- It reads pg_proc.proacl. It does not trust that the statements above ran.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_public_exec boolean;
  v_app_exec    boolean;
  v_grantees    text;
  v_forbidden   text;
BEGIN
  -- PUBLIC EXECUTE, read as an explicit aclitem with grantee 0. `has_function_privilege('public',
  -- ...)` would answer the same question, but reading the aclitem is what pins the SHAPE of the
  -- ACL rather than one role's reachability through it.
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
      '0031: PUBLIC still holds EXECUTE on app.record_audit_event — the revoke did not take '
      'effect. This is the exact failure mode of migration 0018: an ACL statement issued by a '
      'role PostgreSQL does not accept as the function owner.';
  END IF;

  -- The intended caller must actually be able to call it. A revoke that also removed the runtime
  -- path would be a different outage, not a fix.
  SELECT has_function_privilege(
           'freightos_app',
           'app.record_audit_event(text,text,text,uuid,uuid,text,jsonb)',
           'EXECUTE')
    INTO v_app_exec;

  IF NOT v_app_exec THEN
    RAISE EXCEPTION '0031: freightos_app cannot execute app.record_audit_event after convergence';
  END IF;

  -- And it must hold it in its OWN name. Reachability through PUBLIC is what the broken state
  -- looked like, and a check that only asked "can freightos_app call it?" would have passed
  -- against the defect.
  SELECT string_agg(g.rolname, ', ' ORDER BY g.rolname)
    INTO v_grantees
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(p.proacl) a
    JOIN pg_roles g ON g.oid = a.grantee
   WHERE n.nspname = 'app'
     AND p.proname = 'record_audit_event'
     AND oidvectortypes(p.proargtypes) = 'text, text, text, uuid, uuid, text, jsonb'
     AND a.privilege_type = 'EXECUTE';

  IF v_grantees IS DISTINCT FROM 'freightos_app, freightos_audit_writer' THEN
    RAISE EXCEPTION
      '0031: expected the explicit EXECUTE grantees to be exactly '
      '"freightos_app, freightos_audit_writer", found "%"', coalesce(v_grantees, '(none)');
  END IF;

  -- Belt as well as braces, and the assertion that names the exploit roles by name.
  SELECT string_agg(r, ', ' ORDER BY r)
    INTO v_forbidden
    FROM unnest(ARRAY['freightos_event_writer', 'freightos_control_plane', 'freightos_admin']) AS r
   WHERE has_function_privilege(
           r, 'app.record_audit_event(text,text,text,uuid,uuid,text,jsonb)', 'EXECUTE');

  IF v_forbidden IS NOT NULL THEN
    RAISE EXCEPTION
      '0031: these roles can still execute app.record_audit_event: %', v_forbidden;
  END IF;

  RAISE NOTICE
    '0031: converged — PUBLIC revoked, freightos_app holds an explicit EXECUTE grant';
END
$$;

-- ---------------------------------------------------------------------------
-- §4. Nothing else moves.
--
-- The blast radius of this migration is one aclitem list on one function. audit_events keeps its
-- table ACL, its RLS, its policies and its three append-only triggers; freightos_event_writer keeps
-- every N3/N4 journal privilege it had; no role is created, altered or dropped; no SECURITY DEFINER
-- is added; no search_path is changed. Asserted here so that a future edit to this file which
-- reached further would fail rather than pass quietly.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_audit_insert text;
  v_triggers     integer;
  v_rls          boolean;
BEGIN
  SELECT string_agg(DISTINCT grantee, ', ' ORDER BY grantee)
    INTO v_audit_insert
    FROM information_schema.role_table_grants
   WHERE table_name = 'audit_events' AND privilege_type = 'INSERT';

  IF v_audit_insert IS DISTINCT FROM
     'freightos_admin_owner, freightos_audit_writer, freightos_migrator' THEN
    RAISE EXCEPTION
      '0031: audit_events INSERT holders changed, expected '
      '"freightos_admin_owner, freightos_audit_writer, freightos_migrator", found "%"',
      coalesce(v_audit_insert, '(none)');
  END IF;

  SELECT count(*) INTO v_triggers
    FROM pg_trigger
   WHERE tgrelid = 'public.audit_events'::regclass
     AND NOT tgisinternal;
  IF v_triggers <> 3 THEN
    RAISE EXCEPTION '0031: audit_events should carry 3 append-only triggers, found %', v_triggers;
  END IF;

  SELECT relrowsecurity AND relforcerowsecurity INTO v_rls
    FROM pg_class WHERE oid = 'public.audit_events'::regclass;
  IF NOT v_rls THEN
    RAISE EXCEPTION '0031: audit_events lost ENABLE/FORCE row level security';
  END IF;
END
$$;
