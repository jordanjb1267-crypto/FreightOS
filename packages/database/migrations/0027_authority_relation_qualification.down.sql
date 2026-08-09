-- Revert 0027 — restore the pre-0027 function bodies verbatim and drop the shared guard.
--
-- Reverting reopens B-1: three authority reads go back to being unqualified and protected by
-- layer 1 alone. That is what reverting this migration MEANS, and a down migration reverts rather
-- than editorialises.
--
-- What it must not do is take anything else with it. The bodies below are captured with
-- pg_get_functiondef() from a database migrated 1..26 and nothing else, so owner, security mode,
-- volatility, proconfig and ACL all return exactly as they were. CREATE OR REPLACE preserves the
-- ACL rather than discarding it — the DROP+CREATE trap this branch also repairs in 0026's down.
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
    FROM operating_authorities
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
      JOIN service_account_permissions sap
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
         SELECT 1 FROM service_account_credentials sac
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
      JOIN membership_roles mr
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
      JOIN membership_roles mr ON mr.tenant_id = m.tenant_id AND mr.membership_id = m.id
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

-- The shared guard goes last: §4's assertions are gone with the migration, and leaving the
-- detector behind would leave a function whose contract nothing enforces.
DROP FUNCTION IF EXISTS app.unqualified_authority_reads();
DROP FUNCTION IF EXISTS app.protected_authority_relations();

DO $assert$
DECLARE
  v_n integer;
BEGIN
  -- Reverting restores the pre-0027 shape; it must not weaken anything 0027 did not own.
  -- P-01 in particular: the four scope functions still carry no proconfig.
  SELECT count(*) INTO v_n
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'app'
     AND p.proname IN ('verified_scope_node_ids', 'verified_scope_service_account_ids',
                       'organization_node_scope_ok', 'service_account_scope_ok')
     AND p.proconfig IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0027 down: P-01 broken on revert — % scope functions gained a proconfig', v_n;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
             JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'app'
              AND p.proname IN ('protected_authority_relations', 'unqualified_authority_reads')) THEN
    RAISE EXCEPTION '0027 down: the shared guard survived the revert';
  END IF;
END
$assert$;
