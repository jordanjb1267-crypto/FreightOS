-- 0027 — the layer-3 qualification guard, rebuilt from the catalog, and the reads it never saw.
--
-- THE DEFECT (PR #9 retrospective finding B-1). Migration 0025 added "layer 3" — schema
-- qualification of every authority-bearing relation reference — so that `pg_temp` relation
-- shadowing is defeated by three independent controls rather than one. Its §2(a) self-check, and
-- the permanent test that mirrors it, enumerated the protected relations BY HAND. That list was
-- wrong in three separate ways:
--
--   OMITTED, and real:   membership_roles, service_account_permissions,
--                        service_account_credentials, operating_authorities
--   NAMED, and fictional: outbox_messages (the table is outbox_events), user_roles, policies
--
-- So the guard swept for relations that do not exist, found nothing, and reported success — while
-- three genuine unqualified authority reads sat open and `sr2-definer-body-qualification.test.ts`
-- stayed green. A control that cannot fail is not a control.
--
-- WHY THOSE THREE WERE UNPROTECTED. All three live in INVOKER-RIGHTS functions with no `proconfig`:
--
--   app.service_account_has_permission   -> service_account_permissions, service_account_credentials
--   app.carrier_appointment_before_write -> operating_authorities
--
-- Layer 1 (no runtime role holds TEMPORARY) still covered them, which is why this was never live.
-- Layer 2 cannot cover them and MUST NOT: a `proconfig` blocks SQL function inlining, which is the
-- property P-01 depends on. Layer 3 is the only layer available to an invoker-rights function, and
-- it was the one missing. Reproduced end to end before this fix: planting
-- `pg_temp.service_account_permissions` and `pg_temp.service_account_credentials` made
-- `app.service_account_has_permission()` return TRUE for a service account with zero real grants
-- and zero real credentials.
--
-- WHAT THIS MIGRATION DOES NOT DO. It does not rewrite 0025's already-applied forward behaviour to
-- hide the defect, and it does not convert any affected function to SECURITY DEFINER — that would
-- change the privilege model to work around a missing qualifier. It qualifies the reads, and it
-- replaces the hand-written inventory with one derived from the catalog.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- §1. THE SOURCE OF TRUTH for what "authority-bearing" means.
--
-- Not a list. A DERIVATION: a relation is protected if ROW-LEVEL SECURITY IS ENABLED ON IT.
--
-- That is the right definition rather than a convenient one. RLS is enabled on exactly those
-- relations whose visibility is an access-control decision, so an unqualified read of one inside a
-- function is precisely the case where a shadow changes an answer somebody is trusting. It is
-- also self-maintaining in both directions a hand list failed: a new access-controlled table is
-- protected the moment it gets RLS, and a relation that does not exist can never appear — which is
-- how `outbox_messages`, `user_roles` and `policies` got onto the old list and stayed there.
--
-- Deliberately EXCLUDED by the same rule: `public.schema_migrations` (RLS off — migrator
-- bookkeeping, not an authority input). Deliberately INCLUDED beyond schema `public`:
-- `app.session_binding` and `authn.operator_binding`, both RLS-enabled and both authority inputs.
--
-- This function is the single source of truth. §2's detector reads it, §4's assertion reads it,
-- and `sr2-definer-body-qualification.test.ts` reads it from the database rather than keeping a
-- second copy. There is no other list.
-- ---------------------------------------------------------------------------

-- NO `SET search_path` HERE, DELIBERATELY -- P-01. A proconfig makes a function ineligible for SQL
-- inlining, and the repository's standing invariant is that exactly ONE invoker-rights function in
-- schema `app` carries one (app.user_has_permission, pinned by 0019 §2b for a stated reason). These
-- two helpers do not need the pin: every relation and every function they name is already schema-
-- qualified, which is layer 3 applied to layer 3's own detector. Adding the clause instead of
-- qualifying the bodies would have bought nothing and spent a P-01 exception, and exceptions
-- justified only in prose decay. Enforced by `adds no proconfig to any invoker-rights function` in
-- sr2-definer-body-qualification.test.ts, which caught this the first time it was written the other
-- way round.
CREATE OR REPLACE FUNCTION app.protected_authority_relations()
RETURNS TABLE (schema_name name, relation_name name)
LANGUAGE sql STABLE
AS $$
  SELECT n.nspname, c.relname
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'r'
     AND c.relrowsecurity
     AND n.nspname IN ('public', 'app', 'authn')
   ORDER BY 1, 2
$$;

COMMENT ON FUNCTION app.protected_authority_relations() IS
  'Canonical protected-relation inventory: every RLS-enabled relation in public/app/authn. '
  'Derived from the catalog, never hand-maintained. Read by 0027 §4 and by '
  'sr2-definer-body-qualification.test.ts, which keeps no second copy.';

-- ---------------------------------------------------------------------------
-- §2. THE DETECTOR, also shared.
--
-- Finds a bare relation name in a position that RESOLVES A RELATION — after FROM, JOIN, UPDATE or
-- INTO — and not already schema-qualified. Restricting to those keywords is what keeps a column
-- called `users`, a variable, or a relation name inside a string literal from registering: the old
-- guard's `outbox_messages` "hit" was a name inside a RAISE EXCEPTION message.
--
-- Returns one row per (function, relation, keyword) offence. Zero rows is the contract.
-- ---------------------------------------------------------------------------

-- No `SET search_path` here either, for the reason given on §1's function.
CREATE OR REPLACE FUNCTION app.unqualified_authority_reads()
RETURNS TABLE (function_name text, relation_name name, is_security_definer boolean, is_pinned boolean)
LANGUAGE sql STABLE
AS $$
  SELECT n.nspname || '.' || p.proname, pr.relation_name, p.prosecdef, (p.proconfig IS NOT NULL)
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_language l ON l.oid = p.prolang
   CROSS JOIN app.protected_authority_relations() pr
   WHERE n.nspname IN ('app', 'admin', 'authn')
     AND l.lanname IN ('sql', 'plpgsql')
     AND p.prosrc ~ ('(?n)(?<![.[:alnum:]_])(FROM|JOIN|UPDATE|INTO)[[:space:]]+'
                     || pr.relation_name || '(?![[:alnum:]_.])')
   ORDER BY 1, 2
$$;

COMMENT ON FUNCTION app.unqualified_authority_reads() IS
  'Every unqualified read of a protected authority relation in app/admin/authn. The contract is '
  'zero rows. Shared by 0027 §4 and sr2-definer-body-qualification.test.ts.';

-- ---------------------------------------------------------------------------
-- §3. The reads themselves, qualified.
--
-- Generated from pg_get_functiondef() and transformed mechanically: only bare relation references
-- in FROM/JOIN/UPDATE/INTO position gain a schema prefix, and the prefix is the relation's REAL
-- schema rather than an assumed `public.` — `app.session_binding` and `authn.operator_binding` are
-- protected too, and hardcoding `public` would have produced a migration that does not run.
--
-- Nothing else in any body changes: same signature, same language, same volatility, same security
-- mode, same `proconfig`, same owner. CREATE OR REPLACE preserves the ACL. Asserted in §4.
--
-- Five references across four functions. Three were the unprotected sites (invoker-rights, no
-- proconfig); the other two already had layer 2 and are qualified anyway, so the guard's contract
-- can be a clean ZERO rather than a list of two tolerated exceptions — which is how the previous
-- hand-maintained list started.
-- ---------------------------------------------------------------------------

-- Owned by freightos_migrator, which owns schema app — no role change and no loan needed.

-- app.carrier_appointment_before_write()
CREATE OR REPLACE FUNCTION app.carrier_appointment_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_class app.legal_authority_class;
  v_context app.operating_context;
  v_authority_legal_entity uuid;
BEGIN
  SELECT legal_authority_class, operating_context, legal_entity_id
    INTO v_class, v_context, v_authority_legal_entity
    FROM public.operating_authorities
   WHERE tenant_id = NEW.tenant_id AND id = NEW.operating_authority_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'operating authority % does not exist in tenant %',
      NEW.operating_authority_id, NEW.tenant_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_class <> 'carrier_agent' OR v_context <> 'carrier' THEN
    RAISE EXCEPTION
      'a carrier appointment requires a carrier_agent/carrier operating authority, not %/%',
      v_class, v_context
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  -- ADR-0021 category-4 style parent agreement: where the parents disagree the write is rejected,
  -- not silently resolved in favour of either side.
  IF v_authority_legal_entity <> NEW.legal_entity_id THEN
    RAISE EXCEPTION
      'carrier appointment legal entity % disagrees with its operating authority legal entity %',
      NEW.legal_entity_id, v_authority_legal_entity
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$function$;

-- app.service_account_has_permission(uuid,uuid,text,timestamp with time zone)
CREATE OR REPLACE FUNCTION app.service_account_has_permission(p_tenant_id uuid, p_service_account_id uuid, p_permission_key text, p_as_of timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.service_accounts sa
      JOIN public.service_account_permissions sap
        ON sap.tenant_id = sa.tenant_id AND sap.service_account_id = sa.id
      JOIN public.permissions p ON p.id = sap.permission_id
     WHERE sa.tenant_id = p_tenant_id
       AND sa.id = p_service_account_id
       AND p.key = p_permission_key

       AND sa.status = 'active' AND sa.revoked_at IS NULL
       AND sa.effective_from <= p_as_of
       AND (sa.effective_to IS NULL OR sa.effective_to > p_as_of)

       AND sap.revoked_at IS NULL
       AND sap.effective_from <= p_as_of
       AND (sap.effective_to IS NULL OR sap.effective_to > p_as_of)

       AND EXISTS (
         SELECT 1 FROM public.service_account_credentials sac
          WHERE sac.tenant_id = sa.tenant_id
            AND sac.service_account_id = sa.id
            AND sac.status = 'active' AND sac.revoked_at IS NULL
            AND sac.effective_from <= p_as_of
            AND (sac.effective_to IS NULL OR sac.effective_to > p_as_of)
       )
  )
$function$;

-- app.user_has_permission(uuid,uuid,text,timestamp with time zone)
CREATE OR REPLACE FUNCTION app.user_has_permission(p_tenant_id uuid, p_user_id uuid, p_permission_key text, p_as_of timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.memberships m
      JOIN public.membership_roles mr
        ON mr.tenant_id = m.tenant_id AND mr.membership_id = m.id
      JOIN public.roles r
        ON r.tenant_id = mr.tenant_id AND r.id = mr.role_id
      JOIN public.role_permissions rp
        ON rp.tenant_id = r.tenant_id AND rp.role_id = r.id
      JOIN public.permissions p
        ON p.id = rp.permission_id
      JOIN public.users u
        ON u.tenant_id = m.tenant_id AND u.id = m.user_id
     WHERE m.tenant_id = p_tenant_id
       AND m.user_id = p_user_id
       AND p.key = p_permission_key

       AND u.status = 'active' AND u.revoked_at IS NULL
       AND u.effective_from <= p_as_of
       AND (u.effective_to IS NULL OR u.effective_to > p_as_of)

       AND m.status = 'active' AND m.revoked_at IS NULL
       AND m.effective_from <= p_as_of
       AND (m.effective_to IS NULL OR m.effective_to > p_as_of)

       AND mr.revoked_at IS NULL
       AND mr.effective_from <= p_as_of
       AND (mr.effective_to IS NULL OR mr.effective_to > p_as_of)

       AND r.status = 'active' AND r.revoked_at IS NULL
       AND r.effective_from <= p_as_of
       AND (r.effective_to IS NULL OR r.effective_to > p_as_of)

       AND rp.revoked_at IS NULL
       AND rp.effective_from <= p_as_of
       AND (rp.effective_to IS NULL OR rp.effective_to > p_as_of)
  )
$function$;

-- Owned by freightos_identity_guard, which holds USAGE on schema app but not CREATE. 0025 §2 established the
-- loan pattern for exactly this: grant CREATE for the statement, become the owner, replace, hand
-- the privilege straight back. The loan is revoked in the same transaction, so a failure anywhere
-- after it rolls the grant back too.
GRANT CREATE ON SCHEMA app TO freightos_identity_guard;
SET LOCAL ROLE freightos_identity_guard;

-- app.reject_role_permission_self_elevation()
CREATE OR REPLACE FUNCTION app.reject_role_permission_self_elevation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := app.current_user_id();
BEGIN
  -- A verified platform actor is provisioning, not elevating: it holds no membership, so it has
  -- no authority to widen. Verification is the connection's own identity plus the closed
  -- allowlist — neither of which a session can assert. Everything else still names a person.
  IF v_actor IS NULL THEN
    IF app.is_verified_platform_actor() THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'identity change refused: actor "%" is not a user, and a change to who holds authority '
      'must name the person making it — Constitution Art. I.5',
      coalesce(app.current_actor_id(), 'null')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Any membership at all, live or revoked. Widening a role you once held and could hold again is
  -- the same manoeuvre one step removed.
  --
  -- Read as the definer. This is the query that used to be filtered for the caller, and the reason
  -- a caller standing at a narrow organization node could add a permission to a role it holds:
  -- its own membership was out of node scope, so this EXISTS was false and the guard stood down.
  IF NOT EXISTS (
    SELECT 1
      FROM public.memberships m
      JOIN public.membership_roles mr ON mr.tenant_id = m.tenant_id AND mr.membership_id = m.id
     WHERE m.tenant_id = NEW.tenant_id
       AND m.user_id = v_actor
       AND mr.role_id = NEW.role_id
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION
      'self-elevation refused: actor % may not add a permission to a role it holds',
      app.current_actor_id()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL) THEN
    RAISE EXCEPTION
      'self-elevation refused: actor % may only revoke a permission on a role it holds',
      app.current_actor_id()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END
$function$;

RESET ROLE;
REVOKE CREATE ON SCHEMA app FROM freightos_identity_guard;

-- ---------------------------------------------------------------------------
-- §4. Assertions. Positive AND negative — a negative assertion over a set nobody proved non-empty
-- is exactly the false-green this migration exists to repair.
-- ---------------------------------------------------------------------------

DO $assert$
DECLARE
  v_bad text;
  v_n integer;
BEGIN
  -- (a) The inventory is NON-EMPTY and contains the relations the old list omitted. A guard whose
  --     inventory silently emptied would report zero offences forever.
  SELECT count(*) INTO v_n FROM app.protected_authority_relations();
  IF v_n < 15 THEN
    RAISE EXCEPTION
      '0027 §4(a): protected-relation inventory is % rows — too small to be the real authority set',
      v_n;
  END IF;

  SELECT string_agg(r, ', ') INTO v_bad
    FROM unnest(ARRAY['users','memberships','membership_roles','roles','role_permissions',
                      'permissions','service_accounts','service_account_permissions',
                      'service_account_credentials','operating_authorities',
                      'organization_nodes','organization_node_closure','audit_events']) AS r
   WHERE NOT EXISTS (SELECT 1 FROM app.protected_authority_relations() p
                      WHERE p.relation_name = r);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      '0027 §4(a): the canonical authority relations % are absent from the inventory', v_bad;
  END IF;

  -- (b) The population the detector inspects is non-empty. Same reasoning one level up: a sweep
  --     over zero functions also finds zero offences.
  SELECT count(*) INTO v_n
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_language l ON l.oid = p.prolang
   WHERE n.nspname IN ('app', 'admin', 'authn') AND l.lanname IN ('sql', 'plpgsql');
  IF v_n < 50 THEN
    RAISE EXCEPTION '0027 §4(b): only % inspectable functions — the sweep population is wrong', v_n;
  END IF;

  -- (c) THE CONTRACT: zero unqualified reads of a protected relation, anywhere.
  SELECT string_agg(format('%s -> %s (secdef=%s, pinned=%s)',
                           function_name, relation_name, is_security_definer, is_pinned), '; ')
    INTO v_bad
    FROM app.unqualified_authority_reads();
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0027 §4(c): unqualified authority reads survive: %', v_bad;
  END IF;

  -- (d) P-01 is preserved: the four invoker-rights scope functions still carry NO proconfig, since
  --     one would block SQL inlining. Qualification is the layer that costs no plan shape, which is
  --     why it is the correct fix for an invoker-rights function.
  SELECT string_agg(p.proname, ', ') INTO v_bad
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'app'
     AND p.proname IN ('verified_scope_node_ids', 'verified_scope_service_account_ids',
                       'organization_node_scope_ok', 'service_account_scope_ok')
     AND p.proconfig IS NOT NULL;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0027 §4(d): P-01 broken — % gained a proconfig', v_bad;
  END IF;

  -- (e) The four rewritten functions kept their security mode. Converting one to SECURITY DEFINER
  --     would have "fixed" the shadow by changing the privilege model, which is not a fix.
  SELECT string_agg(p.proname, ', ') INTO v_bad
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'app'
     AND p.proname IN ('service_account_has_permission', 'carrier_appointment_before_write',
                       'user_has_permission')
     AND p.prosecdef;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0027 §4(e): % became SECURITY DEFINER — the privilege model changed', v_bad;
  END IF;

  RAISE NOTICE '0027: authority relation qualification complete; inventory is catalog-derived';
END
$assert$;
