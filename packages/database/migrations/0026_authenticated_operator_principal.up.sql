-- 0026 — the administrative boundary authenticates the human. F-A path 1, SEC-01.
--
-- THE DEFECT. Every `admin.*` function took the acting human as a text argument, `p_actor`, and
-- derived authorization, mutation and audit provenance from it. A holder of the shared
-- `freightos_admin` connection could therefore name any real, permissioned administrator and act
-- as them. Measured at d455929: `admin.grant_role_permission` granted a permission to a role while
-- naming a human who did nothing, and the ledger recorded that human as the actor.
--
-- WHY IT WAS NOT REPAIRABLE BY ADDING A CHECK. There was nothing to check against.
-- `session_user` on every administrative connection was `freightos_admin`; the SR-2 binding could
-- not serve as the anchor because the same role mints it; no human credential existed anywhere in
-- the schema. Owner ruling SEC01_RUNTIME_ONLY_SCOPE=REJECTED, design A selected. The full analysis
-- is docs/security-resilience/SEC01_ADMIN_BINDING_ARCHITECTURE.md.
--
-- THE NEW TRUST CHAIN, in the order the database walks it:
--
--   PostgreSQL authentication  the operator connects as their OWN login role. The server sets
--                              session_user; no SQL statement can change it. SET ROLE moves
--                              current_user and leaves session_user alone, which is exactly why
--                              session_user is the anchor and current_user is not — inside a
--                              SECURITY DEFINER current_user is already the function owner.
--   authn.operator_binding     maps that authenticated role to exactly one FreightOS user. Owned
--                              by a role outside the authority it protects, writable by nobody in
--                              the administrative path.
--   users / memberships        the mapped principal must still exist, be active, and hold the
--                              exact permission the operation requires.
--   mutation                   only then.
--   audit provenance           derived from the same resolved principal. There is no longer any
--                              argument from which a different identity could be recorded.
--
-- `p_actor` and `p_actor_type` are REMOVED from every signature rather than kept as ignored
-- compatibility arguments. An argument that still exists is an argument somebody will pass, and a
-- reviewer would have to prove it is inert every time. Removing it makes the property structural:
-- fabricating a human identity is not refused, it is unsayable.
--
-- WHAT REMAINS DELIBERATELY NON-HUMAN. `admin.platform_actor` is the existing closed allowlist of
-- provisioning identities (`system:tenant-provisioning`). Tenant provisioning is performed by a
-- service, not a person, and the audit model already carries `actor_type='system'` for it. A
-- service login therefore resolves to ITS system identity and never to a human — which is the
-- point of requirement 7: a shared service credential may not become `actor_type='human'` merely
-- because somebody passed a user id.

-- ---------------------------------------------------------------------------
-- §1. The registry owner, and its schema.
--
-- A NEW NOLOGIN role, deliberately not freightos_admin_owner. The registry decides who the
-- administrative definers believe they are talking to; owning it with the same role that owns
-- those definers would put the answer inside the authority it is meant to constrain. Its own
-- schema for the same reason: a table in schema `admin` is reachable by that schema's owner.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'freightos_operator_registry_owner') THEN
    CREATE ROLE freightos_operator_registry_owner NOLOGIN;
  END IF;
END
$$;

-- INHERIT FALSE so no ordinary migrator statement picks up its rights; SET TRUE so the migrator
-- can become it to create and own objects. The same shape 0020 uses for freightos_binding_owner.
GRANT freightos_operator_registry_owner TO freightos_migrator WITH SET TRUE, INHERIT FALSE;

CREATE SCHEMA IF NOT EXISTS authn AUTHORIZATION freightos_operator_registry_owner;

-- USAGE only, and only for the role that owns the administrative definers: those definers must be
-- able to CALL the resolver. Nobody gets USAGE who does not need to resolve a principal, and no
-- role at all gets CREATE.
-- USAGE on app for the app.identity_status type the registry uses. Schema admin is owned by
-- freightos_admin_owner, so its grants must be issued by that role rather than by the migrator.
GRANT USAGE ON SCHEMA public, app TO freightos_operator_registry_owner;
GRANT SELECT ON public.users TO freightos_operator_registry_owner;

-- Issued BY the schema owner: the migrator does not inherit that role (INHERIT FALSE) and so holds
-- no privilege on schema authn at all — which is the arrangement we want, and is why every
-- statement touching an authn object below runs inside SET LOCAL ROLE.
SET LOCAL ROLE freightos_operator_registry_owner;
-- freightos_admin_owner so the administrative definers can call the resolver; freightos_migrator
-- because provisioning an operator is a deployment act and the migrator is the authority the
-- runbooks already name. USAGE on the schema only — neither gets a single privilege on the table,
-- so the migrator provisions THROUGH the functions in §4 and cannot write a binding by hand.
GRANT USAGE ON SCHEMA authn TO freightos_admin_owner, freightos_migrator;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- §2. authn.operator_binding — the protected mapping.
--
-- ROLE IDENTITY IS THE OID, NOT THE NAME. A role name is reusable: DROP ROLE operator_alice
-- followed by CREATE ROLE operator_alice produces a different principal wearing the same label,
-- and a name-keyed binding would hand Alice's authority to whoever holds the new password. The
-- binding therefore records the OID that was authenticated at provisioning time and the name it
-- carried, and resolution requires BOTH to still agree. A recreated role has a new OID and
-- resolves to nothing.
-- ---------------------------------------------------------------------------

SET LOCAL ROLE freightos_operator_registry_owner;

CREATE TABLE authn.operator_binding (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- oid rather than regrole: regrole resolves by NAME on every read, which would defeat the whole
  -- point of pinning identity. The raw oid is compared to pg_roles.oid at resolution time.
  role_oid          oid  NOT NULL,
  role_name         name NOT NULL,
  principal_kind    text NOT NULL CHECK (principal_kind IN ('human', 'system')),
  tenant_id         uuid,
  user_id           uuid,
  system_actor_id   text,
  status            app.identity_status NOT NULL DEFAULT 'active',
  effective_from    timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz,
  revoked_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        text NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        text NOT NULL,
  CONSTRAINT operator_binding_shape CHECK (
    (principal_kind = 'human'
       AND user_id IS NOT NULL AND tenant_id IS NOT NULL AND system_actor_id IS NULL)
    OR
    (principal_kind = 'system'
       AND system_actor_id IS NOT NULL AND user_id IS NULL AND tenant_id IS NULL)
  )
);

-- One live binding per authenticated role, and one per name, so a provisioning mistake cannot
-- leave two humans behind one login or one human behind a name that now means something else.
CREATE UNIQUE INDEX operator_binding_one_active_per_role
  ON authn.operator_binding (role_oid) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX operator_binding_one_active_per_name
  ON authn.operator_binding (role_name) WHERE revoked_at IS NULL;

COMMENT ON TABLE authn.operator_binding IS
  'Authenticated PostgreSQL login role -> FreightOS principal. The only source of human identity '
  'inside the administrative boundary. Not writable by freightos_admin, freightos_app, any '
  'operator login, or any tenant role — SEC-01 / F-A path 1.';

-- RLS on with no policy at all. The owner is exempt (the table is not FORCEd), so the resolver
-- below can read it while running as this role; every other role sees nothing even if a future
-- migration grants SELECT by accident. Defence in depth over the absence of grants, not instead
-- of it.
ALTER TABLE authn.operator_binding ENABLE ROW LEVEL SECURITY;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- §3. The resolver.
--
-- The single point at which the database decides who is acting. Returns NULL rather than raising,
-- so each caller can fail closed in its own idiom; every caller in §6 does exactly that.
-- ---------------------------------------------------------------------------

SET LOCAL ROLE freightos_operator_registry_owner;

CREATE OR REPLACE FUNCTION authn.authenticated_principal(
  OUT actor_id text, OUT actor_type text, OUT tenant_id uuid, OUT user_id uuid)
RETURNS record
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_session name := session_user;
  v_oid     oid;
  b         record;
  u         record;
BEGIN
  actor_id := NULL; actor_type := NULL; tenant_id := NULL; user_id := NULL;

  -- session_user, never current_user. Inside a SECURITY DEFINER current_user is the function
  -- owner, so reading it here would make every operator resolve to freightos_admin_owner.
  SELECT r.oid INTO v_oid FROM pg_catalog.pg_roles r WHERE r.rolname = v_session;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- BOTH must match. role_oid alone would survive a rename; role_name alone would survive a
  -- drop-and-recreate, which is the attack this pins down.
  SELECT * INTO b
    FROM authn.operator_binding
   WHERE role_oid = v_oid
     AND role_name = v_session
     AND revoked_at IS NULL
     AND status = 'active'
     AND effective_from <= now();
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF b.principal_kind = 'system' THEN
    -- Deliberately NOT checked against admin.platform_actor here. That table is the closed
    -- allowlist of identities `admin.refusal_reason` accepts for identity administration, and a
    -- system binding is not automatically one of them. Resolving a service login says who it is;
    -- whether it may change the authorization graph is still the allowlist's answer, and for the
    -- shared connection that answer is no.
    actor_id := b.system_actor_id;
    actor_type := 'system';
    RETURN;
  END IF;

  -- A binding is not authority. The mapped human must still exist and still be active, so that
  -- deactivating a person ends their administrative reach without touching the registry.
  SELECT status, revoked_at, effective_from, effective_to INTO u
    FROM public.users WHERE tenant_id = b.tenant_id AND id = b.user_id;
  IF NOT FOUND
     OR u.status <> 'active'
     OR u.revoked_at IS NOT NULL
     OR u.effective_from > now()
     OR (u.effective_to IS NOT NULL AND u.effective_to <= now()) THEN
    RETURN;
  END IF;

  actor_id := 'user:' || b.user_id::text;
  actor_type := 'human';
  tenant_id := b.tenant_id;
  user_id := b.user_id;
END
$fn$;

REVOKE ALL ON FUNCTION authn.authenticated_principal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION authn.authenticated_principal() TO freightos_admin_owner;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- §4. Provisioning and revocation — the migrator's, and nobody else's.
--
-- The caller names a ROLE, never an OID: the function reads the OID from the catalog itself, so a
-- caller cannot bind a name it does not control to an OID it does. EXECUTE is granted only to
-- freightos_migrator, the deployment authority the runbooks already name. No administrative role,
-- no application role and no operator login can provision, alter or revoke a binding — including
-- its own.
-- ---------------------------------------------------------------------------

SET LOCAL ROLE freightos_operator_registry_owner;

CREATE OR REPLACE FUNCTION authn.provision_operator(
  p_role_name name, p_tenant_id uuid, p_user_id uuid, p_provisioned_by text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_oid oid;
  v_login boolean;
  v_id uuid;
BEGIN
  SELECT r.oid, r.rolcanlogin INTO v_oid, v_login
    FROM pg_catalog.pg_roles r WHERE r.rolname = p_role_name;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'role % does not exist', quote_ident(p_role_name)
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF NOT v_login THEN
    RAISE EXCEPTION 'role % cannot log in, so it can never be authenticated', quote_ident(p_role_name)
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Binding a role that is itself an administrative or application identity would reintroduce the
  -- shared-credential defect this migration exists to remove.
  IF p_role_name IN ('freightos_admin', 'freightos_app', 'freightos_control_plane',
                     'freightos_migrator', 'postgres') THEN
    RAISE EXCEPTION 'role % is a shared credential and may not carry a human identity',
      quote_ident(p_role_name)
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users
                  WHERE tenant_id = p_tenant_id AND id = p_user_id
                    AND status = 'active' AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'user % is not an active user of tenant %', p_user_id, p_tenant_id
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO authn.operator_binding
    (role_oid, role_name, principal_kind, tenant_id, user_id, created_by, updated_by)
  VALUES (v_oid, p_role_name, 'human', p_tenant_id, p_user_id, p_provisioned_by, p_provisioned_by)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$fn$;

CREATE OR REPLACE FUNCTION authn.provision_service_login(
  p_role_name name, p_system_actor_id text, p_provisioned_by text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_oid oid;
  v_id uuid;
BEGIN
  SELECT r.oid INTO v_oid FROM pg_catalog.pg_roles r
   WHERE r.rolname = p_role_name AND r.rolcanlogin;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'role % does not exist or cannot log in', quote_ident(p_role_name)
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM admin.platform_actor pa WHERE pa.actor_id = p_system_actor_id) THEN
    RAISE EXCEPTION 'platform actor %L is not an approved provisioning identity', p_system_actor_id
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO authn.operator_binding
    (role_oid, role_name, principal_kind, system_actor_id, created_by, updated_by)
  VALUES (v_oid, p_role_name, 'system', p_system_actor_id, p_provisioned_by, p_provisioned_by)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$fn$;

CREATE OR REPLACE FUNCTION authn.revoke_operator(p_role_name name, p_revoked_by text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_n integer;
BEGIN
  UPDATE authn.operator_binding
     SET revoked_at = now(), revoked_by = p_revoked_by,
         updated_at = now(), updated_by = p_revoked_by
   WHERE role_name = p_role_name AND revoked_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$fn$;

REVOKE ALL ON FUNCTION authn.provision_operator(name, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION authn.provision_service_login(name, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION authn.revoke_operator(name, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION authn.provision_operator(name, uuid, uuid, text) TO freightos_migrator;
GRANT EXECUTE ON FUNCTION authn.provision_service_login(name, text, text) TO freightos_migrator;
GRANT EXECUTE ON FUNCTION authn.revoke_operator(name, text) TO freightos_migrator;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- §5. Classifying the one real application call site — requirement 7.
--
-- `admin.issue_session_binding` is the only one of the sixteen with an application caller
-- (packages/database/src/verified-session.ts). It is the control plane minting a runtime binding
-- for an application session: a SERVICE act, not a human one. Its `p_issued_by` argument is
-- removed like every other caller-supplied identity, and the value it records is now the resolved
-- service principal.
--
-- The shared `freightos_admin` connection is bound here as a SERVICE, so it keeps exactly the one
-- capability the application needs and loses the ability to speak as a person. Because
-- `system:session-binding-issuer` is NOT in `admin.platform_actor`, that binding confers no
-- identity-administration authority: `admin.refusal_reason` refuses it as "not an approved
-- provisioning identity". Minting a runtime binding and rewriting the authorization graph are now
-- different capabilities held by different principals, which is the separation the shared
-- credential previously collapsed.

SET LOCAL ROLE freightos_operator_registry_owner;
INSERT INTO authn.operator_binding
  (role_oid, role_name, principal_kind, system_actor_id, created_by, updated_by)
SELECT r.oid, r.rolname, 'system', 'system:session-binding-issuer', 'migration:0026', 'migration:0026'
  FROM pg_catalog.pg_roles r
 WHERE r.rolname = 'freightos_admin'
   AND NOT EXISTS (SELECT 1 FROM authn.operator_binding b
                    WHERE b.role_name = 'freightos_admin' AND b.revoked_at IS NULL);
RESET ROLE;
-- ---------------------------------------------------------------------------
-- §6. The sixteen entry points, rewritten.
--
-- Generated from pg_get_functiondef() at the pre-0026 head and transformed mechanically, so no
-- predicate is retyped by hand. Per function: the caller-supplied identity arguments are removed
-- from the SIGNATURE, a prologue resolves the principal from the authenticated connection, and
-- every remaining reference to the removed argument becomes that resolved value. Nothing else in
-- any body changes — asserted by the digest diff in §7 and by the regression suite.
--
-- The internal helpers (admin.deny, admin.record, admin.prior_success, admin.claim_operation,
-- admin.publish_actor, admin.refusal_reason, admin.authorization_refusal_reason) keep their actor
-- parameters and are NOT rewritten. They are not reachable by freightos_admin — measured — so the
-- only thing that can reach them is a definer above, which now passes a resolved identity. Their
-- signatures are the internal calling convention, not a caller-controlled surface.
-- ---------------------------------------------------------------------------

-- No GRANT CREATE here: schema admin is OWNED by freightos_admin_owner, which therefore already
-- holds CREATE on it. The migrator holds no privilege on that schema and could not grant one.
SET LOCAL ROLE freightos_admin_owner;

-- DROPPED, NOT REPLACED. Removing a parameter changes the signature, so CREATE OR REPLACE would
-- have left the old vulnerable function in place as an overload and every existing caller would
-- have kept working — silently, against the version that still trusts p_actor. Dropping first
-- makes the old surface unreachable and turns every stale call site into a compile-time error
-- rather than a security regression nobody notices.
DROP FUNCTION admin.assign_membership_role(uuid,uuid,uuid,text,text,text,uuid);
DROP FUNCTION admin.create_role(uuid,uuid,uuid,text,text,text,text,text,uuid);
DROP FUNCTION admin.export_tenant_audit(uuid,timestamp with time zone,timestamp with time zone,text,text,text,uuid);
DROP FUNCTION admin.grant_membership(uuid,uuid,uuid,uuid,text,text,text,uuid);
DROP FUNCTION admin.grant_role_permission(uuid,uuid,text,text,text,text,uuid);
DROP FUNCTION admin.grant_service_account_permission(uuid,uuid,text,text,text,text,uuid);
DROP FUNCTION admin.issue_session_binding(text,uuid,uuid,uuid,uuid,text,text,integer,text,integer);
DROP FUNCTION admin.move_organization_node(uuid,uuid,uuid,text,text,text,uuid);
DROP FUNCTION admin.provision_tenant(uuid,text,text,text,text,uuid);
DROP FUNCTION admin.revoke_membership(uuid,uuid,text,text,text,uuid);
DROP FUNCTION admin.revoke_membership_role(uuid,uuid,text,text,text,uuid);
DROP FUNCTION admin.revoke_role_permission(uuid,uuid,text,text,text,uuid);
DROP FUNCTION admin.revoke_service_account_permission(uuid,uuid,text,text,text,uuid);
DROP FUNCTION admin.set_membership_status(uuid,uuid,text,text,text,text,uuid);
DROP FUNCTION admin.set_tenant_status(uuid,text,text,text,text,uuid);
DROP FUNCTION admin.tenant_identity_summary(uuid,text,text,text,uuid);

-- admin.assign_membership_role(uuid,uuid,uuid,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.assign_membership_role(p_tenant_id uuid, p_membership_id uuid, p_role_id uuid, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor text;
  v_actor_type text;
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  -- SEC-01. Identity comes from the authenticated PostgreSQL login and from nowhere else. There is
  -- no argument to disagree with, and no fallback: an unbound connection cannot act, and cannot
  -- leave a human's name in the ledger for having tried.
  SELECT a.actor_id, a.actor_type INTO v_actor, v_actor_type
    FROM authn.authenticated_principal() a;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'administrative call refused: connection %L is bound to no FreightOS principal', session_user
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_reason := admin.authorization_refusal_reason(
    v_actor, v_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.membership.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.memberships
                    WHERE tenant_id = p_tenant_id AND id = p_membership_id) THEN
      v_reason := format('membership %s is not in tenant %s', p_membership_id, p_tenant_id);
    ELSIF NOT EXISTS (SELECT 1 FROM public.roles WHERE tenant_id = p_tenant_id AND id = p_role_id) THEN
      v_reason := format('role %s is not in tenant %s', p_role_id, p_tenant_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, v_actor, v_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.membership_role_assigned.v1', 'membership_role', p_membership_id::text, 'identity.membership_role.assign');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.membership_role.assign', v_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(v_actor);

  BEGIN
    INSERT INTO public.membership_roles (tenant_id, membership_id, role_id, created_by)
    VALUES (p_tenant_id, p_membership_id, p_role_id, v_actor)
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('membership_role_id', v_id, 'role_id', p_role_id);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.membership_role_assigned.v1', 'membership_role', p_membership_id::text, 'identity.membership_role.assign', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.membership_role_assigned.v1', 'membership_role', p_membership_id::text, 'identity.membership_role.assign', 'succeeded', v_result);

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.membership_role.assign', v_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.create_role(uuid,uuid,uuid,text,text,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.create_role(p_tenant_id uuid, p_organization_node_id uuid, p_legal_entity_id uuid, p_key text, p_name text, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor text;
  v_actor_type text;
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  -- SEC-01. Identity comes from the authenticated PostgreSQL login and from nowhere else. There is
  -- no argument to disagree with, and no fallback: an unbound connection cannot act, and cannot
  -- leave a human's name in the ledger for having tried.
  SELECT a.actor_id, a.actor_type INTO v_actor, v_actor_type
    FROM authn.authenticated_principal() a;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'administrative call refused: connection %L is bound to no FreightOS principal', session_user
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_reason := admin.authorization_refusal_reason(
    v_actor, v_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.role.write');

  IF v_reason IS NULL THEN
    IF p_key IS NULL OR btrim(p_key) = '' OR p_name IS NULL OR btrim(p_name) = '' THEN
      v_reason := 'a role needs a key and a name';
    ELSIF NOT EXISTS (SELECT 1 FROM public.organization_nodes
                       WHERE tenant_id = p_tenant_id AND id = p_organization_node_id) THEN
      v_reason := format('organization node %s is not in tenant %s',
                         p_organization_node_id, p_tenant_id);
    ELSIF app.governing_legal_entity_id(p_tenant_id, p_organization_node_id)
          IS DISTINCT FROM p_legal_entity_id THEN
      v_reason := format('legal entity %s does not govern organization node %s',
                         p_legal_entity_id, p_organization_node_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, v_actor, v_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.role_created.v1', 'role', p_key, 'identity.role.create');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.role.create', v_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(v_actor);

  BEGIN
    INSERT INTO public.roles
      (tenant_id, organization_node_id, legal_entity_id, key, name, created_by)
    VALUES (p_tenant_id, p_organization_node_id, p_legal_entity_id, p_key, p_name, v_actor)
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('role_id', v_id, 'key', p_key);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, p_legal_entity_id, v_actor, v_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.role_created.v1', 'role', p_key, 'identity.role.create', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, p_legal_entity_id, v_actor, v_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.role_created.v1', 'role', p_key, 'identity.role.create', 'succeeded', v_result);

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.role.create', v_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.export_tenant_audit(uuid,timestamp with time zone,timestamp with time zone,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.export_tenant_audit(p_tenant_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor text;
  v_actor_type text;
  v_reason text;
  v_audit uuid;
  v_rows jsonb;
BEGIN
  -- SEC-01. Identity comes from the authenticated PostgreSQL login and from nowhere else. There is
  -- no argument to disagree with, and no fallback: an unbound connection cannot act, and cannot
  -- leave a human's name in the ledger for having tried.
  SELECT a.actor_id, a.actor_type INTO v_actor, v_actor_type
    FROM authn.authenticated_principal() a;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'administrative call refused: connection %L is bound to no FreightOS principal', session_user
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_reason := admin.refusal_reason(v_actor, v_actor_type, p_purpose, p_tenant_id, p_correlation_id);
  IF v_reason IS NULL
     AND p_purpose NOT IN ('audit_export', 'regulatory_request', 'security_investigation',
                           'incident_response') THEN
    v_reason := format('purpose %L does not authorise an audit export', p_purpose);
  END IF;
  IF v_reason IS NULL AND (p_from IS NULL OR p_to IS NULL OR p_to <= p_from) THEN
    v_reason := 'an audit export requires a bounded window';
  END IF;
  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, v_actor, v_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.audit.exported.v1', 'audit_event', NULL, 'audit.export');
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at), '[]'::jsonb)
    INTO v_rows
    FROM public.audit_events a
   WHERE a.tenant_id = p_tenant_id
     AND a.created_at >= p_from
     AND a.created_at < p_to;

  v_audit := admin.record(
    p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
    'rig.freight.audit.exported.v1', 'audit_event', NULL, 'audit.export',
    'succeeded',
    jsonb_build_object('from', p_from, 'to', p_to, 'row_count', jsonb_array_length(v_rows)));

  RETURN ROW('succeeded', v_audit, NULL,
             jsonb_build_object('events', v_rows))::admin.privileged_result;
END
$function$;

-- admin.grant_membership(uuid,uuid,uuid,uuid,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.grant_membership(p_tenant_id uuid, p_user_id uuid, p_organization_node_id uuid, p_legal_entity_id uuid, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor text;
  v_actor_type text;
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  -- SEC-01. Identity comes from the authenticated PostgreSQL login and from nowhere else. There is
  -- no argument to disagree with, and no fallback: an unbound connection cannot act, and cannot
  -- leave a human's name in the ledger for having tried.
  SELECT a.actor_id, a.actor_type INTO v_actor, v_actor_type
    FROM authn.authenticated_principal() a;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'administrative call refused: connection %L is bound to no FreightOS principal', session_user
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_reason := admin.authorization_refusal_reason(
    v_actor, v_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.membership.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE tenant_id = p_tenant_id AND id = p_user_id) THEN
      v_reason := format('user %s is not a user of tenant %s', p_user_id, p_tenant_id);
    ELSIF NOT EXISTS (SELECT 1 FROM public.organization_nodes
                       WHERE tenant_id = p_tenant_id AND id = p_organization_node_id) THEN
      v_reason := format('organization node %s is not in tenant %s',
                         p_organization_node_id, p_tenant_id);
    ELSIF app.governing_legal_entity_id(p_tenant_id, p_organization_node_id)
          IS DISTINCT FROM p_legal_entity_id THEN
      v_reason := format(
        'legal entity %s does not govern organization node %s',
        p_legal_entity_id, p_organization_node_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, v_actor, v_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.membership_granted.v1', 'membership', p_user_id::text, 'identity.membership.grant');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.membership.grant', v_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(v_actor);

  BEGIN
    INSERT INTO public.memberships
      (tenant_id, organization_node_id, legal_entity_id, user_id, status, created_by)
    VALUES (p_tenant_id, p_organization_node_id, p_legal_entity_id, p_user_id, 'active', v_actor)
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('membership_id', v_id, 'user_id', p_user_id);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, p_legal_entity_id, v_actor, v_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.membership_granted.v1', 'membership', p_user_id::text, 'identity.membership.grant', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, p_legal_entity_id, v_actor, v_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.membership_granted.v1', 'membership', p_user_id::text, 'identity.membership.grant', 'succeeded', v_result);

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.membership.grant', v_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.grant_role_permission(uuid,uuid,text,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.grant_role_permission(p_tenant_id uuid, p_role_id uuid, p_permission_key text, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor text;
  v_actor_type text;
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  -- SEC-01. Identity comes from the authenticated PostgreSQL login and from nowhere else. There is
  -- no argument to disagree with, and no fallback: an unbound connection cannot act, and cannot
  -- leave a human's name in the ledger for having tried.
  SELECT a.actor_id, a.actor_type INTO v_actor, v_actor_type
    FROM authn.authenticated_principal() a;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'administrative call refused: connection %L is bound to no FreightOS principal', session_user
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_reason := admin.authorization_refusal_reason(
    v_actor, v_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.role.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.roles WHERE tenant_id = p_tenant_id AND id = p_role_id) THEN
      v_reason := format('role %s is not in tenant %s', p_role_id, p_tenant_id);
    ELSIF NOT EXISTS (SELECT 1 FROM public.permissions WHERE key = p_permission_key) THEN
      v_reason := format('permission %L is not in the catalog', p_permission_key);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, v_actor, v_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.role_permission_granted.v1', 'role_permission', p_role_id::text, 'identity.role_permission.grant');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.role_permission.grant', v_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(v_actor);

  BEGIN
    INSERT INTO public.role_permissions (tenant_id, role_id, permission_id, created_by)
    SELECT p_tenant_id, p_role_id, id, v_actor FROM public.permissions WHERE key = p_permission_key
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('role_permission_id', v_id, 'permission', p_permission_key);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.role_permission_granted.v1', 'role_permission', p_role_id::text, 'identity.role_permission.grant', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.role_permission_granted.v1', 'role_permission', p_role_id::text, 'identity.role_permission.grant', 'succeeded', v_result);

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.role_permission.grant', v_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.grant_service_account_permission(uuid,uuid,text,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.grant_service_account_permission(p_tenant_id uuid, p_service_account_id uuid, p_permission_key text, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor text;
  v_actor_type text;
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  -- SEC-01. Identity comes from the authenticated PostgreSQL login and from nowhere else. There is
  -- no argument to disagree with, and no fallback: an unbound connection cannot act, and cannot
  -- leave a human's name in the ledger for having tried.
  SELECT a.actor_id, a.actor_type INTO v_actor, v_actor_type
    FROM authn.authenticated_principal() a;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'administrative call refused: connection %L is bound to no FreightOS principal', session_user
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_reason := admin.authorization_refusal_reason(
    v_actor, v_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.service_account.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.service_accounts
                    WHERE tenant_id = p_tenant_id AND id = p_service_account_id) THEN
      v_reason := format('service account %s is not in tenant %s',
                         p_service_account_id, p_tenant_id);
    ELSIF NOT EXISTS (SELECT 1 FROM public.permissions WHERE key = p_permission_key) THEN
      v_reason := format('permission %L is not in the catalog', p_permission_key);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, v_actor, v_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.service_account_permission_granted.v1', 'service_account_permission', p_service_account_id::text, 'identity.service_account_permission.grant');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.service_account_permission.grant', v_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(v_actor);

  BEGIN
    INSERT INTO public.service_account_permissions
      (tenant_id, service_account_id, permission_id, created_by)
    SELECT p_tenant_id, p_service_account_id, id, v_actor
      FROM public.permissions WHERE key = p_permission_key
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('service_account_permission_id', v_id,
                                   'permission', p_permission_key);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.service_account_permission_granted.v1', 'service_account_permission', p_service_account_id::text, 'identity.service_account_permission.grant', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.service_account_permission_granted.v1', 'service_account_permission', p_service_account_id::text, 'identity.service_account_permission.grant', 'succeeded', v_result);

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.service_account_permission.grant', v_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.issue_session_binding(text,uuid,uuid,uuid,uuid,text,text,integer,text,integer)
CREATE OR REPLACE FUNCTION admin.issue_session_binding(p_principal_type text, p_principal_id uuid, p_tenant_id uuid, p_organization_node_id uuid, p_legal_entity_id uuid, p_legal_authority_class text, p_operating_context text, p_target_backend_pid integer, p_installable_seconds integer DEFAULT 60)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor text;
  v_actor_type text;
  v_id uuid;
BEGIN
  -- SEC-01 / requirement 7. Minting a runtime binding is a SERVICE act. The identity recorded is
  -- the resolved service principal; a human may not issue one, and a shared credential may not
  -- become a human by naming one.
  SELECT a.actor_id, a.actor_type INTO v_actor, v_actor_type
    FROM authn.authenticated_principal() a;
  IF v_actor IS NULL OR v_actor_type <> 'system' THEN
    RAISE EXCEPTION
      'session binding issuance refused: connection %L is not a bound service identity', session_user
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  IF p_principal_type NOT IN ('human', 'service') THEN
    RAISE EXCEPTION 'unknown principal type %', quote_literal(p_principal_type)
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_installable_seconds < 1 OR p_installable_seconds > 300 THEN
    RAISE EXCEPTION 'installable window must be between 1 and 300 seconds'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_principal_type = 'human' THEN
    -- Real, active, and actually a member at the requested node of the requested tenant.
    IF NOT EXISTS (
      SELECT 1
        FROM public.users u
        JOIN public.memberships m ON m.tenant_id = u.tenant_id AND m.user_id = u.id
       WHERE u.id = p_principal_id
         AND u.tenant_id = p_tenant_id
         AND u.status = 'active' AND u.revoked_at IS NULL
         AND u.effective_from <= now()
         AND (u.effective_to IS NULL OR u.effective_to > now())
         AND m.organization_node_id = p_organization_node_id
         AND m.status = 'active' AND m.revoked_at IS NULL
         AND m.effective_from <= now()
         AND (m.effective_to IS NULL OR m.effective_to > now()))
    THEN
      RAISE EXCEPTION 'no active membership justifies this principal, tenant and node'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.service_accounts s
       WHERE s.id = p_principal_id
         AND s.tenant_id = p_tenant_id
         AND s.organization_node_id = p_organization_node_id
         AND s.status = 'active' AND s.revoked_at IS NULL)
    THEN
      RAISE EXCEPTION 'no active service account justifies this principal, tenant and node'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  INSERT INTO app.session_binding (
    principal_type, user_id, service_account_id, tenant_id, organization_node_id,
    legal_entity_id, legal_authority_class, operating_context, target_backend_pid,
    issued_by, installable_until)
  VALUES (
    p_principal_type,
    CASE WHEN p_principal_type = 'human'   THEN p_principal_id END,
    CASE WHEN p_principal_type = 'service' THEN p_principal_id END,
    p_tenant_id, p_organization_node_id, p_legal_entity_id,
    p_legal_authority_class::app.legal_authority_class,
    p_operating_context::app.operating_context,
    p_target_backend_pid, v_actor,
    now() + make_interval(secs => p_installable_seconds))
  RETURNING id INTO v_id;

  RETURN v_id;
END
$function$;

-- admin.move_organization_node(uuid,uuid,uuid,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.move_organization_node(p_tenant_id uuid, p_node_id uuid, p_new_parent_id uuid, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor text;
  v_actor_type text;
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_old_parent uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  -- SEC-01. Identity comes from the authenticated PostgreSQL login and from nowhere else. There is
  -- no argument to disagree with, and no fallback: an unbound connection cannot act, and cannot
  -- leave a human's name in the ledger for having tried.
  SELECT a.actor_id, a.actor_type INTO v_actor, v_actor_type
    FROM authn.authenticated_principal() a;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'administrative call refused: connection %L is bound to no FreightOS principal', session_user
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_reason := admin.authorization_refusal_reason(
    v_actor, v_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.organization_node.write');

  IF v_reason IS NULL THEN
    SELECT parent_id INTO v_old_parent
      FROM public.organization_nodes WHERE tenant_id = p_tenant_id AND id = p_node_id;
    IF NOT FOUND THEN
      v_reason := format('organization node %s is not in tenant %s', p_node_id, p_tenant_id);
    ELSIF p_new_parent_id IS NULL THEN
      -- Detaching a node to root would make it its own governing authority, which is a different
      -- and much larger decision than moving it. It is not offered here.
      v_reason := 'a node may be moved beneath another node, not detached to the root';
    ELSIF NOT EXISTS (SELECT 1 FROM public.organization_nodes
                       WHERE tenant_id = p_tenant_id AND id = p_new_parent_id) THEN
      v_reason := format('proposed parent %s is not in tenant %s', p_new_parent_id, p_tenant_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, v_actor, v_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.organization_node_moved.v1', 'organization_node',
                      p_node_id::text, 'identity.organization_node.move');
  END IF;

  v_prior := admin.prior_success(
    p_tenant_id, p_correlation_id, 'identity.organization_node.move', v_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  PERFORM admin.publish_actor(v_actor);

  BEGIN
    -- 0007's triggers still own the structural invariants: permitted parenthood, cycle rejection
    -- through the closure, the depth bound over the whole subtree, and the serialising advisory
    -- lock. This boundary adds the authority question they never asked.
    UPDATE public.organization_nodes
       SET parent_id = p_new_parent_id, updated_by = v_actor, updated_at = now()
     WHERE tenant_id = p_tenant_id AND id = p_node_id;
    v_result := jsonb_build_object(
      'organization_node_id', p_node_id,
      'previous_parent_id', v_old_parent,
      'new_parent_id', p_new_parent_id);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.organization_node_moved.v1', 'organization_node', p_node_id::text,
      'identity.organization_node.move', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.organization_node_moved.v1', 'organization_node', p_node_id::text,
    'identity.organization_node.move', 'succeeded', v_result);

  PERFORM admin.claim_operation(
    p_tenant_id, p_correlation_id, 'identity.organization_node.move', v_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.provision_tenant(uuid,text,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.provision_tenant(p_tenant_id uuid, p_name text, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor text;
  v_actor_type text;
  v_reason text;
  v_audit uuid;
BEGIN
  -- SEC-01. Identity comes from the authenticated PostgreSQL login and from nowhere else. There is
  -- no argument to disagree with, and no fallback: an unbound connection cannot act, and cannot
  -- leave a human's name in the ledger for having tried.
  SELECT a.actor_id, a.actor_type INTO v_actor, v_actor_type
    FROM authn.authenticated_principal() a;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'administrative call refused: connection %L is bound to no FreightOS principal', session_user
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_reason := admin.refusal_reason(v_actor, v_actor_type, p_purpose, p_tenant_id, p_correlation_id);
  IF v_reason IS NULL AND p_purpose <> 'tenant_provisioning' THEN
    v_reason := format('purpose %L does not authorise tenant provisioning', p_purpose);
  END IF;
  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, v_actor, v_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.tenant.provisioned.v1', 'tenant', p_tenant_id::text,
                      'tenant.provision');
  END IF;

  BEGIN
    INSERT INTO public.tenants (id, tenant_id, name, created_by, updated_by)
    VALUES (p_tenant_id, p_tenant_id, p_name, v_actor, v_actor);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
      'rig.freight.tenant.provisioned.v1', 'tenant', p_tenant_id::text, 'tenant.provision',
      'failed', jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
    'rig.freight.tenant.provisioned.v1', 'tenant', p_tenant_id::text, 'tenant.provision',
    'succeeded', jsonb_build_object('name', p_name));

  RETURN ROW('succeeded', v_audit, NULL,
             jsonb_build_object('tenant_id', p_tenant_id))::admin.privileged_result;
END
$function$;

-- admin.revoke_membership(uuid,uuid,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.revoke_membership(p_tenant_id uuid, p_membership_id uuid, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor text;
  v_actor_type text;
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  -- SEC-01. Identity comes from the authenticated PostgreSQL login and from nowhere else. There is
  -- no argument to disagree with, and no fallback: an unbound connection cannot act, and cannot
  -- leave a human's name in the ledger for having tried.
  SELECT a.actor_id, a.actor_type INTO v_actor, v_actor_type
    FROM authn.authenticated_principal() a;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'administrative call refused: connection %L is bound to no FreightOS principal', session_user
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_reason := admin.authorization_refusal_reason(
    v_actor, v_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.membership.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.memberships
                    WHERE tenant_id = p_tenant_id AND id = p_membership_id
                      AND revoked_at IS NULL) THEN
      v_reason := format('membership %s is not an unrevoked membership of tenant %s',
                         p_membership_id, p_tenant_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, v_actor, v_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.membership_revoked.v1', 'membership', p_membership_id::text, 'identity.membership.revoke');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.membership.revoke', v_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(v_actor);

  BEGIN
    UPDATE public.memberships
       SET revoked_at = now(), revoked_by = v_actor, status = 'revoked'
     WHERE tenant_id = p_tenant_id AND id = p_membership_id
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('membership_id', v_id);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.membership_revoked.v1', 'membership', p_membership_id::text, 'identity.membership.revoke', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.membership_revoked.v1', 'membership', p_membership_id::text, 'identity.membership.revoke', 'succeeded', v_result);

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.membership.revoke', v_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.revoke_membership_role(uuid,uuid,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.revoke_membership_role(p_tenant_id uuid, p_membership_role_id uuid, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor text;
  v_actor_type text;
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  -- SEC-01. Identity comes from the authenticated PostgreSQL login and from nowhere else. There is
  -- no argument to disagree with, and no fallback: an unbound connection cannot act, and cannot
  -- leave a human's name in the ledger for having tried.
  SELECT a.actor_id, a.actor_type INTO v_actor, v_actor_type
    FROM authn.authenticated_principal() a;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'administrative call refused: connection %L is bound to no FreightOS principal', session_user
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_reason := admin.authorization_refusal_reason(
    v_actor, v_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.membership.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.membership_roles
                    WHERE tenant_id = p_tenant_id AND id = p_membership_role_id
                      AND revoked_at IS NULL) THEN
      v_reason := format('membership role %s is not an unrevoked assignment of tenant %s',
                         p_membership_role_id, p_tenant_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, v_actor, v_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.membership_role_revoked.v1', 'membership_role', p_membership_role_id::text, 'identity.membership_role.revoke');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.membership_role.revoke', v_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(v_actor);

  BEGIN
    UPDATE public.membership_roles SET revoked_at = now(), revoked_by = v_actor
     WHERE tenant_id = p_tenant_id AND id = p_membership_role_id
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('membership_role_id', v_id);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.membership_role_revoked.v1', 'membership_role', p_membership_role_id::text, 'identity.membership_role.revoke', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.membership_role_revoked.v1', 'membership_role', p_membership_role_id::text, 'identity.membership_role.revoke', 'succeeded', v_result);

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.membership_role.revoke', v_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.revoke_role_permission(uuid,uuid,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.revoke_role_permission(p_tenant_id uuid, p_role_permission_id uuid, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor text;
  v_actor_type text;
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  -- SEC-01. Identity comes from the authenticated PostgreSQL login and from nowhere else. There is
  -- no argument to disagree with, and no fallback: an unbound connection cannot act, and cannot
  -- leave a human's name in the ledger for having tried.
  SELECT a.actor_id, a.actor_type INTO v_actor, v_actor_type
    FROM authn.authenticated_principal() a;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'administrative call refused: connection %L is bound to no FreightOS principal', session_user
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_reason := admin.authorization_refusal_reason(
    v_actor, v_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.role.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.role_permissions
                    WHERE tenant_id = p_tenant_id AND id = p_role_permission_id
                      AND revoked_at IS NULL) THEN
      v_reason := format('role permission %s is not an unrevoked grant of tenant %s',
                         p_role_permission_id, p_tenant_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, v_actor, v_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.role_permission_revoked.v1', 'role_permission', p_role_permission_id::text, 'identity.role_permission.revoke');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.role_permission.revoke', v_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(v_actor);

  BEGIN
    UPDATE public.role_permissions SET revoked_at = now(), revoked_by = v_actor
     WHERE tenant_id = p_tenant_id AND id = p_role_permission_id
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('role_permission_id', v_id);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.role_permission_revoked.v1', 'role_permission', p_role_permission_id::text, 'identity.role_permission.revoke', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.role_permission_revoked.v1', 'role_permission', p_role_permission_id::text, 'identity.role_permission.revoke', 'succeeded', v_result);

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.role_permission.revoke', v_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.revoke_service_account_permission(uuid,uuid,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.revoke_service_account_permission(p_tenant_id uuid, p_service_account_permission_id uuid, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor text;
  v_actor_type text;
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  -- SEC-01. Identity comes from the authenticated PostgreSQL login and from nowhere else. There is
  -- no argument to disagree with, and no fallback: an unbound connection cannot act, and cannot
  -- leave a human's name in the ledger for having tried.
  SELECT a.actor_id, a.actor_type INTO v_actor, v_actor_type
    FROM authn.authenticated_principal() a;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'administrative call refused: connection %L is bound to no FreightOS principal', session_user
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_reason := admin.authorization_refusal_reason(
    v_actor, v_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.service_account.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.service_account_permissions
                    WHERE tenant_id = p_tenant_id AND id = p_service_account_permission_id
                      AND revoked_at IS NULL) THEN
      v_reason := format('service account permission %s is not an unrevoked grant of tenant %s',
                         p_service_account_permission_id, p_tenant_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, v_actor, v_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.service_account_permission_revoked.v1', 'service_account_permission', p_service_account_permission_id::text, 'identity.service_account_permission.revoke');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.service_account_permission.revoke', v_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(v_actor);

  BEGIN
    UPDATE public.service_account_permissions SET revoked_at = now(), revoked_by = v_actor
     WHERE tenant_id = p_tenant_id AND id = p_service_account_permission_id
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('service_account_permission_id', v_id);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.service_account_permission_revoked.v1', 'service_account_permission', p_service_account_permission_id::text, 'identity.service_account_permission.revoke', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.service_account_permission_revoked.v1', 'service_account_permission', p_service_account_permission_id::text, 'identity.service_account_permission.revoke', 'succeeded', v_result);

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.service_account_permission.revoke', v_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.set_membership_status(uuid,uuid,text,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.set_membership_status(p_tenant_id uuid, p_membership_id uuid, p_status text, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor text;
  v_actor_type text;
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  -- SEC-01. Identity comes from the authenticated PostgreSQL login and from nowhere else. There is
  -- no argument to disagree with, and no fallback: an unbound connection cannot act, and cannot
  -- leave a human's name in the ledger for having tried.
  SELECT a.actor_id, a.actor_type INTO v_actor, v_actor_type
    FROM authn.authenticated_principal() a;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'administrative call refused: connection %L is bound to no FreightOS principal', session_user
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_reason := admin.authorization_refusal_reason(
    v_actor, v_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.membership.write');

  IF v_reason IS NULL THEN
    IF p_status NOT IN ('active', 'suspended') THEN
      v_reason := format('membership status %L is not settable here; revoke uses its own operation',
                         p_status);
    ELSIF NOT EXISTS (SELECT 1 FROM public.memberships
                       WHERE tenant_id = p_tenant_id AND id = p_membership_id) THEN
      v_reason := format('membership %s is not in tenant %s', p_membership_id, p_tenant_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, v_actor, v_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.membership_status_set.v1', 'membership', p_membership_id::text, 'identity.membership.set_status');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.membership.set_status', v_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(v_actor);

  BEGIN
    UPDATE public.memberships SET status = p_status::app.identity_status
     WHERE tenant_id = p_tenant_id AND id = p_membership_id
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('membership_id', v_id, 'status', p_status);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.membership_status_set.v1', 'membership', p_membership_id::text, 'identity.membership.set_status', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.membership_status_set.v1', 'membership', p_membership_id::text, 'identity.membership.set_status', 'succeeded', v_result);

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.membership.set_status', v_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$function$;

-- admin.set_tenant_status(uuid,text,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.set_tenant_status(p_tenant_id uuid, p_status text, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor text;
  v_actor_type text;
  v_reason text;
  v_audit uuid;
  v_rows integer;
BEGIN
  -- SEC-01. Identity comes from the authenticated PostgreSQL login and from nowhere else. There is
  -- no argument to disagree with, and no fallback: an unbound connection cannot act, and cannot
  -- leave a human's name in the ledger for having tried.
  SELECT a.actor_id, a.actor_type INTO v_actor, v_actor_type
    FROM authn.authenticated_principal() a;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'administrative call refused: connection %L is bound to no FreightOS principal', session_user
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_reason := admin.refusal_reason(v_actor, v_actor_type, p_purpose, p_tenant_id, p_correlation_id);
  IF v_reason IS NULL AND p_purpose NOT IN ('tenant_lifecycle', 'incident_response') THEN
    v_reason := format('purpose %L does not authorise a tenant lifecycle change', p_purpose);
  END IF;
  IF v_reason IS NULL AND p_status NOT IN ('active', 'suspended', 'closed') THEN
    v_reason := format('status %L is not a tenant lifecycle state', p_status);
  END IF;
  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, v_actor, v_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.tenant.status_changed.v1', 'tenant', p_tenant_id::text,
                      'tenant.set_status');
  END IF;

  BEGIN
    UPDATE public.tenants SET status = p_status, updated_by = v_actor WHERE id = p_tenant_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
      'rig.freight.tenant.status_changed.v1', 'tenant', p_tenant_id::text, 'tenant.set_status',
      'failed', jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  IF v_rows = 0 THEN
    v_audit := admin.record(
      p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
      'rig.freight.tenant.status_changed.v1', 'tenant', p_tenant_id::text, 'tenant.set_status',
      'failed', jsonb_build_object('error', 'tenant not found'));
    RETURN ROW('failed', v_audit, 'tenant not found', '{}'::jsonb)::admin.privileged_result;
  END IF;

  v_audit := admin.record(
    p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
    'rig.freight.tenant.status_changed.v1', 'tenant', p_tenant_id::text, 'tenant.set_status',
    'succeeded', jsonb_build_object('status', p_status));

  RETURN ROW('succeeded', v_audit, NULL,
             jsonb_build_object('status', p_status))::admin.privileged_result;
END
$function$;

-- admin.tenant_identity_summary(uuid,text,text,text,uuid)
CREATE OR REPLACE FUNCTION admin.tenant_identity_summary(p_tenant_id uuid, p_purpose text, p_correlation_id uuid)
 RETURNS admin.privileged_result
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor text;
  v_actor_type text;
  v_reason text;
  v_audit uuid;
  v_summary jsonb;
BEGIN
  -- SEC-01. Identity comes from the authenticated PostgreSQL login and from nowhere else. There is
  -- no argument to disagree with, and no fallback: an unbound connection cannot act, and cannot
  -- leave a human's name in the ledger for having tried.
  SELECT a.actor_id, a.actor_type INTO v_actor, v_actor_type
    FROM authn.authenticated_principal() a;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'administrative call refused: connection %L is bound to no FreightOS principal', session_user
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  v_reason := admin.refusal_reason(v_actor, v_actor_type, p_purpose, p_tenant_id, p_correlation_id);
  IF v_reason IS NULL
     AND p_purpose NOT IN ('access_review', 'identity_administration', 'security_investigation',
                           'platform_operations') THEN
    v_reason := format('purpose %L does not authorise an identity summary', p_purpose);
  END IF;
  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, v_actor, v_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.summarised.v1', 'tenant', p_tenant_id::text,
                      'identity.summary');
  END IF;

  SELECT jsonb_build_object(
           'users', (SELECT count(*) FROM public.users WHERE tenant_id = p_tenant_id),
           'active_users',
             (SELECT count(*) FROM public.users WHERE tenant_id = p_tenant_id AND status = 'active'),
           'memberships', (SELECT count(*) FROM public.memberships WHERE tenant_id = p_tenant_id),
           'service_accounts',
             (SELECT count(*) FROM public.service_accounts WHERE tenant_id = p_tenant_id))
    INTO v_summary;

  v_audit := admin.record(
    p_tenant_id, NULL, v_actor, v_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.summarised.v1', 'tenant', p_tenant_id::text, 'identity.summary',
    'succeeded', v_summary);

  RETURN ROW('succeeded', v_audit, NULL, v_summary)::admin.privileged_result;
END
$function$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- §7. Assertions. Measured from the catalog after the fact, not from this file's own text.
-- ---------------------------------------------------------------------------

DO $assert$
DECLARE
  v_bad text;
BEGIN
  -- (a) No administrative entry point still accepts a caller-supplied human identity. This is the
  --     whole point of the migration and it is asserted over EVERY function freightos_admin can
  --     reach, not over the sixteen this file happens to name.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'admin'
     AND has_function_privilege('freightos_admin', p.oid, 'EXECUTE')
     AND pg_get_function_arguments(p.oid) ~ '(p_actor|p_actor_type|p_issued_by)';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0026 §7(a): % still accepts a caller-supplied identity', v_bad;
  END IF;

  -- (b) The old signatures are GONE, not shadowed by an overload. A leftover overload would keep
  --     every existing caller working against the vulnerable version.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'admin'
     AND p.proname IN ('assign_membership_role','create_role','export_tenant_audit',
                       'grant_membership','grant_role_permission','grant_service_account_permission',
                       'issue_session_binding','move_organization_node','provision_tenant',
                       'revoke_membership','revoke_membership_role','revoke_role_permission',
                       'revoke_service_account_permission','set_membership_status',
                       'set_tenant_status','tenant_identity_summary')
     AND pg_get_function_arguments(p.oid) ~ '(p_actor|p_issued_by)';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0026 §7(b): a pre-0026 overload survives: %', v_bad;
  END IF;

  -- (c) The registry is writable by nobody in the administrative path — requirement 2.
  SELECT string_agg(g || ':' || pr, ', ') INTO v_bad
    FROM unnest(ARRAY['freightos_admin','freightos_app','freightos_control_plane',
                      'freightos_admin_owner','freightos_migrator']) AS g,
         unnest(ARRAY['INSERT','UPDATE','DELETE','SELECT','TRUNCATE']) AS pr
   WHERE has_table_privilege(g, 'authn.operator_binding', pr);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0026 §7(c): % holds a privilege on the operator registry', v_bad;
  END IF;

  -- (d) Nor may they provision or revoke one.
  SELECT string_agg(g || ' -> ' || f, ', ') INTO v_bad
    FROM unnest(ARRAY['freightos_admin','freightos_app','freightos_control_plane',
                      'freightos_admin_owner']) AS g,
         unnest(ARRAY['authn.provision_operator(name,uuid,uuid,text)',
                      'authn.provision_service_login(name,text,text)',
                      'authn.revoke_operator(name,text)']) AS f
   WHERE has_function_privilege(g, f, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0026 §7(d): % can provision or revoke an operator binding', v_bad;
  END IF;

  -- (e) No role in this boundary holds an attribute that would defeat it — requirement 4.
  SELECT string_agg(rolname, ', ') INTO v_bad
    FROM pg_roles
   WHERE rolname IN ('freightos_admin','freightos_admin_owner','freightos_app',
                     'freightos_operator_registry_owner')
     AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0026 §7(e): % holds SUPERUSER, BYPASSRLS, CREATEROLE or CREATEDB', v_bad;
  END IF;

  -- (f) The definer owners remain NOLOGIN, so ownership is not a connection path.
  SELECT string_agg(rolname, ', ') INTO v_bad
    FROM pg_roles
   WHERE rolname IN ('freightos_admin_owner','freightos_operator_registry_owner') AND rolcanlogin;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0026 §7(f): definer owner % can log in', v_bad;
  END IF;

  -- (g) F-B invariant survives: every definer in app, admin and authn still pins pg_temp LAST.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.prosecdef AND n.nspname IN ('app', 'admin', 'authn')
     AND p.proconfig::text IS DISTINCT FROM '{"search_path=pg_catalog, public, pg_temp"}';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0026 §7(g): definer % is not pinned pg_temp-last', v_bad;
  END IF;

  -- (h) Nobody but the registry owner may create objects in its schema.
  SELECT string_agg(g, ', ') INTO v_bad
    FROM unnest(ARRAY['freightos_admin','freightos_app','freightos_admin_owner',
                      'freightos_control_plane','public']) AS g
   WHERE has_schema_privilege(g, 'authn', 'CREATE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0026 §7(h): % holds CREATE on schema authn', v_bad;
  END IF;

  RAISE NOTICE '0026: administrative identity now resolves from session_user only';
END
$assert$;
