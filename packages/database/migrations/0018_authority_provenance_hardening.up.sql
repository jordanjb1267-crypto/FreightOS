-- 0018 — Authority provenance hardening.
--
-- Closes the seven critical and high findings the independent adversarial rereview reproduced
-- against fb851b9. Each section names the finding it closes and why the previous shape was wrong.
--
-- The theme running through all seven: a control that constrains the SHAPE of a claim is not the
-- same as a control that constrains WHO MAY MAKE IT. Every defect here was a well-formed claim,
-- accepted because nothing asked whether the caller was entitled to make it.
--
--   RC-B  forged privileged audit provenance                     §1  CRITICAL
--   RC-A  idempotency inferred from forgeable audit evidence      §2  CRITICAL
--   RC-C  borrowed-colleague self-elevation                       §3  HIGH
--   RC-G  unauthorized kill-switch release                        §4  HIGH
--   RC-H  cross-tenant kill-switch resolution                     §5  HIGH
--   RC-I  cross-tenant denial through the uniqueness index        §5  HIGH
--   RC-F  privilege amplification by hierarchy reparenting        §6  HIGH
--   RC-J  credential lifecycle outside the subject node scope     §7  HIGH
--
-- Scope discipline: this migration does not build the Tier A / Tier B audit architecture. That is
-- a later roadmap item. It makes the existing Tier A evidence non-forgeable within its intended
-- authority boundary, and nothing more.

-- ---------------------------------------------------------------------------
-- §0. The platform tenant.
--
-- 0008 seeds global permissions under the reserved tenant 00000000-…-000000000000, but no such
-- row ever existed in `tenants`. That made the reserved id a convention rather than a modelled
-- thing, which is why §1's referential constraint has nowhere to point without it.
--
-- Ruling 3: model system/platform events explicitly rather than reaching for a nullable-FK
-- workaround. So the platform is a tenant row, marked as such, and the FK is unconditional.
-- ---------------------------------------------------------------------------

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_platform boolean NOT NULL DEFAULT false;

ALTER TABLE tenants NO FORCE ROW LEVEL SECURITY;
INSERT INTO tenants (id, tenant_id, name, status, created_by, is_platform)
VALUES ('00000000-0000-0000-0000-000000000000',
        '00000000-0000-0000-0000-000000000000',
        'FreightOS platform', 'active', 'migration:0018', true)
ON CONFLICT (id) DO NOTHING;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

-- Exactly one platform tenant, and its id is fixed. A second one would make "is this a platform
-- event" a question with two answers.
CREATE UNIQUE INDEX tenants_single_platform ON tenants ((true)) WHERE is_platform;
ALTER TABLE tenants ADD CONSTRAINT tenants_platform_is_the_reserved_id
  CHECK (NOT is_platform OR id = '00000000-0000-0000-0000-000000000000'::uuid);

COMMENT ON COLUMN tenants.is_platform IS
  'The single reserved platform tenant. Global permissions and platform-scope audit events belong '
  'to it, so a consequential event never names a tenant that does not exist — 0018 §0.';

-- ---------------------------------------------------------------------------
-- §1. RC-B — audit provenance. CRITICAL.
--
-- WHAT WAS WRONG. 0003 granted INSERT on audit_events to freightos_app. 0006 added
-- operation_class with CHECK constraints that constrain its shape and never its author. There is
-- no BEFORE INSERT trigger. So the runtime role could compose a `privileged` / `succeeded` ledger
-- record naming any human, at any timestamp, with any connection provenance, for any tenant — and
-- admin.export_tenant_audit returned it as authoritative.
--
-- Append-only was never the failure. UPDATE, DELETE and TRUNCATE were refused throughout, by both
-- trigger and revoked privilege, and still are. Append-only stops a record being changed after the
-- fact. It says nothing about whether the record was true when written. The model
-- "append-only == trustworthy" is rejected.
--
-- WHAT REPLACES IT. The runtime role loses INSERT entirely and gains one function that constructs
-- every authoritative field from trusted execution context. The caller supplies what an event is
-- ABOUT; the boundary supplies what it PROVES. Those two are stored in separate keys so a reader
-- can tell them apart, which is the distinction ruling 3 requires.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_audit_writer') THEN
    CREATE ROLE freightos_audit_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

DO $$
DECLARE r record;
BEGIN
  SELECT rolcanlogin, rolsuper, rolbypassrls INTO r
    FROM pg_roles WHERE rolname = 'freightos_audit_writer';
  IF r.rolcanlogin OR r.rolsuper OR r.rolbypassrls THEN
    RAISE EXCEPTION
      'freightos_audit_writer must be NOLOGIN NOSUPERUSER NOBYPASSRLS (login=% super=% rls=%)',
      r.rolcanlogin, r.rolsuper, r.rolbypassrls;
  END IF;
END
$$;

-- Deliberately NOT a member of freightos_control_plane. The writer needs to insert its own
-- tenant's rows, which the existing isolation policy already allows; making it control-plane
-- would hand every audit write an RLS bypass it has no use for. Ruling 11: do not answer a
-- finding by widening a standing bypass.
GRANT INSERT, SELECT ON audit_events TO freightos_audit_writer;
GRANT USAGE, CREATE ON SCHEMA app TO freightos_audit_writer;
-- audit_events lives in public, and a definer resolves its own search_path as its own role.
GRANT USAGE ON SCHEMA public TO freightos_audit_writer;

-- The migrator must be able to SET ROLE to the writer in order to create objects owned by it.
--
-- `SET TRUE, INHERIT FALSE` is the distinction 0013 §4 had to make and this repeats deliberately:
-- with INHERIT the migrator would silently acquire the writer's INSERT on audit_events for the
-- rest of every session, which is the very privilege §1 exists to withhold. Administering a role
-- and becoming one are different things.
DO $$
BEGIN
  EXECUTE format(
    'GRANT freightos_audit_writer TO %I WITH SET TRUE, INHERIT FALSE', current_user);
END
$$;

-- The runtime roles lose the ability to compose a record at all.
REVOKE INSERT ON audit_events FROM freightos_app;
REVOKE INSERT ON audit_events FROM freightos_control_plane;

SET LOCAL ROLE freightos_audit_writer;

CREATE FUNCTION app.record_audit_event(
  p_event_type    text,
  p_resource_type text,
  p_resource_id   text,
  p_correlation_id uuid,
  p_causation_id  uuid,
  p_purpose       text,
  p_described     jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid   := app.current_tenant_id();
  v_actor  text   := app.current_actor_id();
  v_actor_type text;
  v_id uuid;
BEGIN
  -- Tenant comes from the session context the application established, never from an argument.
  -- A caller cannot name a tenant at all, so it cannot name one it does not hold or one that does
  -- not exist.
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'an audit event requires tenant context'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;
  IF v_actor IS NULL OR btrim(v_actor) = '' THEN
    RAISE EXCEPTION 'an audit event requires an actor'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  -- Actor type is DERIVED from the form of the actor id, not asserted alongside it. An agent
  -- cannot become a human by claiming to be one, here or anywhere else this pattern is used.
  v_actor_type := CASE
    WHEN v_actor ~ '^user:[0-9a-fA-F-]{36}$' THEN 'human'
    WHEN v_actor ~ '^system:'                THEN 'system'
    WHEN v_actor ~ '^service_account:'       THEN 'integration'
    WHEN v_actor ~ '^(agent|model):'         THEN 'agent'
    ELSE NULL
  END;
  IF v_actor_type IS NULL THEN
    RAISE EXCEPTION 'actor %L is not of a recognised principal form', v_actor
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  INSERT INTO audit_events (
    tenant_id, legal_entity_id, legal_authority_class, operating_context,
    actor_type, actor_id, event_type, resource_type, resource_id,
    correlation_id, causation_id, payload, created_by, purpose,
    -- Authoritative, and not parameters of this function:
    --   created_at   the column default, now(), so the timeline cannot be backdated;
    --   outcome      NULL, because a domain event asserts no authorization result;
    --   operation_class 'domain', hardcoded — this path can never mint a privileged claim.
    operation_class
  ) VALUES (
    v_tenant,
    app.current_legal_entity_id(),
    app.current_legal_authority_class(),
    app.current_operating_context(),
    v_actor_type, v_actor, p_event_type, p_resource_type, p_resource_id,
    coalesce(p_correlation_id, gen_random_uuid()), p_causation_id,
    jsonb_build_object(
      -- What the caller says the event is about. Nonauthoritative by construction, and nested so
      -- that it is explicitly distinguishable from provenance — ruling 3.
      'described', coalesce(p_described, '{}'::jsonb),
      -- What the boundary observed. Every value here is read from the connection, so a caller
      -- supplying 'connection' or 'session_user' in p_described cannot reach it.
      'provenance', jsonb_build_object(
        'session_user', session_user,
        'current_user', current_user,
        'client_addr',  coalesce(host(inet_client_addr()), 'local'),
        'backend_start', (SELECT backend_start FROM pg_stat_activity WHERE pid = pg_backend_pid())
      )
    ),
    v_actor, p_purpose, 'domain'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END
$$;

RESET ROLE;

REVOKE ALL ON FUNCTION app.record_audit_event(text, text, text, uuid, uuid, text, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_audit_event(text, text, text, uuid, uuid, text, jsonb)
  TO freightos_app, freightos_control_plane;
-- USAGE stays so the definer can resolve app.current_*; CREATE does not.
REVOKE CREATE ON SCHEMA app FROM freightos_audit_writer;

-- Referential integrity. A consequential event may not claim a tenant that does not exist —
-- ruling 3. Platform events name the platform tenant modelled in §0, so this needs no exemption.
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES tenants (id);

COMMENT ON TABLE audit_events IS
  'Append-only AND non-forgeable. UPDATE, DELETE and TRUNCATE are rejected by trigger and by '
  'revoked privilege; INSERT is available only through app.record_audit_event (domain events) and '
  'admin.record (privileged events), both of which derive every authoritative field from trusted '
  'execution context — 0018 §1.';

-- ---------------------------------------------------------------------------
-- §2. RC-A — idempotency. CRITICAL.
--
-- WHAT WAS WRONG. admin.prior_success read the audit ledger, filtering on correlation id,
-- operation class, outcome and the action string — and on nothing else. Not tenant, not actor.
-- Combined with §1 that made retry suppression writable by the caller: pre-register a forged
-- `succeeded` row and the real privileged operation returns the forgery's id having done nothing.
--
-- §1 alone closes the demonstrated route. The MODEL is still wrong, and ruling 4 is explicit that
-- the root model is what must change: a security decision may not be inferred from evidence whose
-- provenance is not itself authoritative, and audit must not be the sole source of truth for a
-- security-sensitive idempotency decision.
--
-- WHAT REPLACES IT. An authoritative operation record in the admin schema, written by the same
-- trusted boundary that performs the mutation, in the same transaction. freightos_app has no
-- USAGE on schema admin, so it cannot read it, let alone write it. The primary key is
-- (tenant_id, correlation_id, action), so a correlation id is scoped to its tenant and concurrent
-- attempts resolve to exactly one authoritative outcome.
-- ---------------------------------------------------------------------------

SET LOCAL ROLE freightos_admin_owner;

CREATE TABLE admin.privileged_operation (
  tenant_id      uuid NOT NULL,
  correlation_id uuid NOT NULL,
  action         text NOT NULL,
  actor_id       text NOT NULL,
  audit_event_id uuid NOT NULL,
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, correlation_id, action)
);

COMMENT ON TABLE admin.privileged_operation IS
  'Authoritative record that a privileged operation succeeded. Written only by the admin boundary, '
  'in the same transaction as the mutation it describes. The idempotency decision reads this, not '
  'the audit ledger — 0018 §2, owner ruling 4.';

-- The caller may not reuse another actor's idempotency identity: a correlation id already claimed
-- by a different actor is a conflict, not a replay, and is refused rather than silently honoured.
CREATE OR REPLACE FUNCTION admin.prior_success(
  p_tenant_id uuid,
  p_correlation_id uuid,
  p_action text,
  p_actor text
) RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE r record;
BEGIN
  SELECT audit_event_id, actor_id INTO r
    FROM admin.privileged_operation
   WHERE tenant_id = p_tenant_id
     AND correlation_id = p_correlation_id
     AND action = p_action;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF r.actor_id IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION
      'correlation id % is already claimed by another actor for action %', p_correlation_id, p_action
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;
  RETURN r.audit_event_id;
END
$$;

CREATE FUNCTION admin.claim_operation(
  p_tenant_id uuid,
  p_correlation_id uuid,
  p_action text,
  p_actor text,
  p_audit_event_id uuid
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  INSERT INTO admin.privileged_operation
    (tenant_id, correlation_id, action, actor_id, audit_event_id)
  VALUES (p_tenant_id, p_correlation_id, p_action, p_actor, p_audit_event_id)
$$;

REVOKE ALL ON FUNCTION admin.prior_success(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin.claim_operation(uuid, uuid, text, text, uuid) FROM PUBLIC;

-- The old two-argument form read the forgeable ledger. Dropping it means no call site can keep
-- using it by accident.
DROP FUNCTION admin.prior_success(uuid, text);

-- Still acting as the owner: the migrator holds no USAGE on schema admin — ADR-0020 §7 — so a
-- REVOKE or DROP issued after RESET ROLE could not even name these functions.
RESET ROLE;

-- ---------------------------------------------------------------------------
-- §3. RC-C — borrowed-colleague self-elevation. HIGH.
--
-- WHAT WAS WRONG. admin.authorization_refusal_reason validated that the NAMED actor is a plausible
-- principal of the tenant: real, active, unrevoked, in window. It never asked whether that actor
-- holds the administrative capability the operation requires. The 0010 self-elevation guards
-- compare the published actor against the target row, so naming any other real, active,
-- same-tenant user flipped every one of them from refused to applied. An ordinary colleague with
-- no administrative permission at all was enough.
--
-- WHAT REPLACES IT. The named actor must independently hold the exact permission the operation
-- needs, evaluated against the authority tables through app.user_has_permission. Ordinary
-- colleagues stop working entirely.
--
-- WHAT THIS DOES NOT CLOSE, stated plainly rather than implied. At the database boundary there is
-- still no cryptographic binding between the connection and the named human. ADR-0026 §2 says so
-- and it remains true: a caller over the freightos_admin connection who names a colleague who
-- genuinely holds identity.role.write is still accepted. What changes is the size of that set —
-- from "every active user in the tenant" to "users who already hold the administrative
-- permission". Closing the remainder needs an authenticated principal binding, which is SR-2, and
-- it is tracked there rather than pretended away here.
--
-- Also closed: RC-E. actor_type='system' returned NULL from the gate with no lookup at all, so any
-- string matching ^system:[a-z0-9._:-]+$ authorised a change to the authorization graph. Platform
-- actors are now an explicit allowlist.
-- ---------------------------------------------------------------------------

SET LOCAL ROLE freightos_admin_owner;

CREATE TABLE admin.platform_actor (
  actor_id   text PRIMARY KEY CHECK (actor_id ~ '^system:[a-z0-9._:-]+$'),
  purpose    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL
);

COMMENT ON TABLE admin.platform_actor IS
  'The closed set of platform actors that may authorise a change to the authorization graph. '
  'Before 0018 any well-formed system: string could — a shape check standing in for an authority '
  'check. Adding a row here is a deliberate schema change with a reviewer.';

INSERT INTO admin.platform_actor (actor_id, purpose, created_by) VALUES
  ('system:tenant-provisioning',
   'Bootstraps a new tenant''s first administrator, before any human principal exists.',
   'migration:0018');

CREATE OR REPLACE FUNCTION admin.authorization_refusal_reason(
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_tenant_id uuid,
  p_correlation_id uuid,
  p_required_permission text
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_user_id uuid;
  v_principal record;
BEGIN
  v_reason := admin.refusal_reason(p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id);
  IF v_reason IS NOT NULL THEN
    RETURN v_reason;
  END IF;

  IF p_purpose <> 'identity_administration' THEN
    RETURN format(
      'purpose %L does not authorise a change to the authorization graph; identity_administration '
      'is the only purpose that does', p_purpose);
  END IF;

  -- A platform actor names no user by construction, so it cannot be permission-checked against the
  -- authority tables. It is checked against the closed set instead — RC-E.
  IF p_actor_type = 'system' THEN
    IF p_actor !~ '^system:[a-z0-9._:-]+$' THEN
      RETURN format('system actor %L must be of the form system:<name>', p_actor);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM admin.platform_actor WHERE actor_id = p_actor) THEN
      RETURN format('platform actor %L is not an approved provisioning identity', p_actor);
    END IF;
    RETURN NULL;
  END IF;

  v_user_id := nullif(substring(p_actor from
    '^user:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'), '')::uuid;
  IF v_user_id IS NULL THEN
    RETURN format(
      'human actor %L must be of the form user:<uuid> and name a user of this tenant', p_actor);
  END IF;

  SELECT status, revoked_at, effective_from, effective_to
    INTO v_principal
    FROM users WHERE tenant_id = p_tenant_id AND id = v_user_id;

  -- Deliberately one reason for "not in this tenant" and "does not exist": distinguishing them
  -- would turn this into an oracle for which user ids exist in which tenant.
  IF NOT FOUND THEN
    RETURN format('actor %L is not a user of tenant %s', p_actor, p_tenant_id);
  END IF;
  IF v_principal.status <> 'active'
     OR v_principal.revoked_at IS NOT NULL
     OR v_principal.effective_from > now()
     OR (v_principal.effective_to IS NOT NULL AND v_principal.effective_to <= now()) THEN
    RETURN format('actor %L is not an active principal and may not authorise a change', p_actor);
  END IF;

  -- The check that was missing. Being a real, active member of the tenant is not authority.
  IF NOT app.user_has_permission(p_tenant_id, v_user_id, p_required_permission, now()) THEN
    RETURN format('actor %L does not hold %L', p_actor, p_required_permission);
  END IF;

  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION admin.authorization_refusal_reason(text, text, text, uuid, uuid, text)
  FROM PUBLIC;

-- The five-argument form is the one that accepted any active member as authority. §9 moves every
-- call site to the six-argument form, so dropping it here means no call site can keep using the
-- permissive gate by accident — and the down migration re-creates it, so this stays reversible.
DROP FUNCTION admin.authorization_refusal_reason(text, text, text, uuid, uuid);

RESET ROLE;

-- ---------------------------------------------------------------------------
-- §4. RC-G — kill-switch authority is command-scoped. HIGH.
--
-- WHAT WAS WRONG. kill_switches_release was a bare FOR UPDATE policy with no column restriction,
-- freightos_app held table-wide UPDATE, and no BEFORE UPDATE guard existed. So a tenant could
-- release a control-plane halt aimed at it, and rewrite an active switch's mode and reason in
-- place. Separately engaged_by_type and released_by_type were unbound string CHECKs, so an
-- agent-driven session engaged and released by typing 'human'.
--
-- Ruling 6: a security-sensitive transition is a command, not a row update. Do not protect an
-- authority-bearing table by saying the caller may UPDATE it.
--
-- WHAT REPLACES IT. INSERT and UPDATE are revoked from the runtime role. Two named commands
-- replace them, each deriving tenant and actor from trusted context, each refusing a non-human
-- actor by DERIVING the type from the actor id rather than accepting an assertion of it.
-- ---------------------------------------------------------------------------

REVOKE INSERT, UPDATE ON kill_switches FROM freightos_app;

DROP POLICY kill_switches_release ON kill_switches;
DROP POLICY kill_switches_write ON kill_switches;

-- Only the control plane and the definer below reach these paths now; the policies exist so the
-- control plane keeps working and so a future grant cannot silently reopen the table.
CREATE POLICY kill_switches_write ON kill_switches
  FOR INSERT WITH CHECK (app.is_control_plane());
CREATE POLICY kill_switches_release ON kill_switches
  FOR UPDATE USING (app.is_control_plane()) WITH CHECK (app.is_control_plane());

-- Created by the migrator and transferred, which is how every other app-schema definer in
-- this repository is built (0007 §, 0010 §, 0015 §). CREATE is taken back immediately: a
-- standing CREATE on schema app is a privilege the definer has no further use for.
GRANT CREATE ON SCHEMA app TO freightos_hierarchy_owner;

/**
 * The human principal behind the current session, or NULL if there is not one.
 *
 * Derives the answer from the form of the actor id and confirms the user is a real active
 * principal of the current tenant. An agent, a model or a service account resolves to NULL here
 * however it types itself, which is what makes Art. V.1's human-only reservation an enforced
 * property rather than a string literal.
 */
CREATE FUNCTION app.current_human_principal() RETURNS uuid
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.id
    FROM users u
   WHERE u.tenant_id = app.current_tenant_id()
     AND u.id = nullif(substring(app.current_actor_id() from
           '^user:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'),
           '')::uuid
     AND u.status = 'active'
     AND u.revoked_at IS NULL
     AND u.effective_from <= now()
     AND (u.effective_to IS NULL OR u.effective_to > now())
$$;

CREATE FUNCTION app.engage_kill_switch(
  p_scope app.kill_switch_scope,
  p_scope_ref text,
  p_mode app.kill_switch_mode,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := app.current_tenant_id();
  v_human uuid  := app.current_human_principal();
  v_id uuid;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'engaging a kill switch requires tenant context'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;
  -- Art. V.1 — engaging and releasing are both reserved to humans. Derived, not asserted.
  IF v_human IS NULL THEN
    RAISE EXCEPTION 'only an active human principal may engage a kill switch'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;
  -- System and legal-plane halts are the control plane's, not a tenant's.
  IF p_scope IN ('system', 'legal_plane') THEN
    RAISE EXCEPTION 'scope % may only be engaged by the control plane', p_scope
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO kill_switches
    (tenant_id, scope, scope_ref, mode, reason, engaged_by, engaged_by_type, created_by)
  VALUES (v_tenant, p_scope, p_scope_ref, p_mode, p_reason,
          'user:' || v_human, 'human', 'user:' || v_human)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

CREATE FUNCTION app.release_kill_switch(p_id uuid) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant uuid := app.current_tenant_id();
  v_human uuid  := app.current_human_principal();
  v_scope app.kill_switch_scope;
  v_owner uuid;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'releasing a kill switch requires tenant context'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;
  IF v_human IS NULL THEN
    RAISE EXCEPTION 'only an active human principal may release a kill switch'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  SELECT scope, tenant_id INTO v_scope, v_owner
    FROM kill_switches WHERE id = p_id AND released_at IS NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- A tenant may not release a halt aimed at it by anyone else. System and legal-plane switches
  -- carry no tenant at all and are the control plane's exclusively; a tenant-scoped switch is
  -- releasable only by the tenant that owns it, and only if that tenant is the caller's.
  IF v_scope IN ('system', 'legal_plane') OR v_owner IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'kill switch % is not releasable by this tenant', p_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE kill_switches
     SET released_at = now(), released_by = 'user:' || v_human, released_by_type = 'human'
   WHERE id = p_id;
  RETURN true;
END
$$;

ALTER FUNCTION app.current_human_principal() OWNER TO freightos_hierarchy_owner;
ALTER FUNCTION app.engage_kill_switch(app.kill_switch_scope, text, app.kill_switch_mode, text)
  OWNER TO freightos_hierarchy_owner;
ALTER FUNCTION app.release_kill_switch(uuid) OWNER TO freightos_hierarchy_owner;
REVOKE CREATE ON SCHEMA app FROM freightos_hierarchy_owner;

REVOKE ALL ON FUNCTION app.current_human_principal() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.engage_kill_switch(
  app.kill_switch_scope, text, app.kill_switch_mode, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.release_kill_switch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_human_principal() TO freightos_app;
GRANT EXECUTE ON FUNCTION app.engage_kill_switch(
  app.kill_switch_scope, text, app.kill_switch_mode, text) TO freightos_app;
GRANT EXECUTE ON FUNCTION app.release_kill_switch(uuid) TO freightos_app;

-- ---------------------------------------------------------------------------
-- §5. RC-H and RC-I — kill-switch tenancy. HIGH.
--
-- RC-H. app.resolve_kill_switch_mode matched scope_ref alone for tenant, workflow, agent, tool and
-- integration. F-12 added the tenant predicate to the legal_entity branch only, so a row written
-- under tenant A halted an identically-named workflow resolved under tenant B. Row-level security
-- hid that from the victim's own session — which is why nobody saw it, not a reason it was safe.
-- The control plane resolves without RLS, so the damaging shape is a halt the control plane
-- honours and the victim can neither see nor release.
--
-- RC-I. kill_switches_one_active_per_subject was UNIQUE (scope, coalesce(scope_ref,'')) with no
-- tenant column. Unique indexes are not RLS-filtered, so tenant A squatting a scope_ref made
-- tenant B's own INSERT fail 23505 with nothing visible to explain it.
--
-- system and legal_plane stay deliberately global: a network-wide halt is not a tenant's.
-- operating_context likewise describes a plane rather than a tenant.
-- ---------------------------------------------------------------------------

DROP INDEX kill_switches_one_active_per_subject;
CREATE UNIQUE INDEX kill_switches_one_active_per_subject
  ON kill_switches (scope, coalesce(tenant_id::text, ''), coalesce(scope_ref, ''))
  WHERE released_at IS NULL;

CREATE OR REPLACE FUNCTION app.resolve_kill_switch_mode(
  p_tenant_id uuid DEFAULT NULL,
  p_legal_plane text DEFAULT NULL,
  p_workflow_id text DEFAULT NULL,
  p_agent_id text DEFAULT NULL,
  p_tool_id text DEFAULT NULL,
  p_integration_id text DEFAULT NULL,
  p_legal_entity_id uuid DEFAULT NULL,
  p_operating_context app.operating_context DEFAULT NULL
) RETURNS app.kill_switch_mode
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    (
      SELECT mode
      FROM kill_switches
      WHERE released_at IS NULL
        AND (
          -- Global by design: a network-wide or plane-wide halt belongs to no tenant.
          scope = 'system'
          OR (scope = 'legal_plane'       AND scope_ref = p_legal_plane)
          OR (scope = 'operating_context' AND scope_ref = p_operating_context::text)
          -- Everything else is a tenant's own subject, and the tenant is part of the match rather
          -- than merely of the row — RC-H. Matching scope_ref alone made tenant_id decorative:
          -- an identifier chosen by one tenant halted another's identically-named subject.
          OR (p_tenant_id IS NOT NULL AND tenant_id = p_tenant_id AND (
                 (scope = 'tenant'       AND scope_ref = p_tenant_id::text)
              OR (scope = 'workflow'     AND scope_ref = p_workflow_id)
              OR (scope = 'agent'        AND scope_ref = p_agent_id)
              OR (scope = 'tool'         AND scope_ref = p_tool_id)
              OR (scope = 'integration'  AND scope_ref = p_integration_id)
              OR (scope = 'legal_entity' AND scope_ref = p_legal_entity_id::text)
          ))
        )
      -- Enum declaration order is restrictiveness order, so DESC is "most restrictive wins".
      ORDER BY mode DESC
      LIMIT 1
    ),
    'enabled'::app.kill_switch_mode)
$$;

-- ---------------------------------------------------------------------------
-- §6. RC-F — reparenting is an authority mutation. HIGH.
--
-- WHAT WAS WRONG. organization_nodes RLS is tenant-only while every sub-resource enforces
-- app.organization_node_scope_ok, and freightos_app held table-wide UPDATE. So a caller scoped to
-- one region could reparent another region's terminal underneath its own node and acquire scope
-- over every resource beneath it. No permission row was added; effective authority grew anyway.
--
-- Ruling 7: a graph can be structurally valid — acyclic, inside its depth bound, inside its
-- tenant — and still be an escalation. Cycle checking is not authority checking.
--
-- WHAT REPLACES IT. Column-level UPDATE. The runtime role keeps the columns that describe a node
-- and loses the one that positions it. Ruling 6 names column-level privileges as an acceptable
-- narrow mechanism, and it is the narrowest one here: no new function, no new bypass, and a
-- reparent attempt fails at the privilege layer before any trigger runs.
-- ---------------------------------------------------------------------------

REVOKE UPDATE ON organization_nodes FROM freightos_app;
GRANT UPDATE (name, external_reference, status, updated_at, updated_by, record_version)
  ON organization_nodes TO freightos_app;

COMMENT ON COLUMN organization_nodes.parent_id IS
  'Position in the hierarchy, and therefore an authority-bearing value: the closure derived from '
  'it decides which resources a scoped caller reaches. The runtime role holds no UPDATE privilege '
  'on this column — 0018 §6.';

-- ---------------------------------------------------------------------------
-- §7. RC-J — credential lifecycle. HIGH.
--
-- WHAT WAS WRONG. service_accounts is tenant AND organization-node scoped.
-- service_account_credentials was tenant-scoped only, and the runtime role held SELECT, INSERT and
-- UPDATE on it. So a caller scoped to a node that cannot see a service account could still read,
-- revoke and replace that account's credentials — lifecycle authority over a subject it has no
-- scope over. Revocation is not issuance authority, and possession of a credential id is not
-- lifecycle authority.
--
-- WHAT REPLACES IT. The credential inherits its subject's scope, by joining to it. A credential
-- is not an independent object; it is an attribute of an account, and it should never have been
-- reachable from outside the account's scope.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.service_account_scope_ok(p_service_account_id uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM service_accounts sa
     WHERE sa.id = p_service_account_id
       AND (app.is_control_plane() OR sa.tenant_id = app.current_tenant_id())
       AND app.organization_node_scope_ok(sa.organization_node_id))
$$;

COMMENT ON FUNCTION app.service_account_scope_ok(uuid) IS
  'A credential is an attribute of its service account, so it carries the account''s scope rather '
  'than a weaker one of its own — 0018 §7.';

DROP POLICY service_account_credentials_read ON service_account_credentials;
DROP POLICY service_account_credentials_insert ON service_account_credentials;
DROP POLICY service_account_credentials_update ON service_account_credentials;

CREATE POLICY service_account_credentials_read ON service_account_credentials FOR SELECT
  USING (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.service_account_scope_ok(service_account_id));
CREATE POLICY service_account_credentials_insert ON service_account_credentials FOR INSERT
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.service_account_scope_ok(service_account_id));
CREATE POLICY service_account_credentials_update ON service_account_credentials FOR UPDATE
  USING (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.service_account_scope_ok(service_account_id))
  WITH CHECK (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.service_account_scope_ok(service_account_id));

-- ---------------------------------------------------------------------------
-- §8. Assertions. A migration that silently failed to close a hole is worse than one that failed
-- loudly, so each closure is asserted rather than assumed.
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_bad text;
BEGIN
  -- §1: the runtime roles hold no INSERT on the ledger.
  SELECT string_agg(grantee, ', ') INTO v_bad
    FROM information_schema.role_table_grants
   WHERE table_name = 'audit_events' AND privilege_type = 'INSERT'
     AND grantee IN ('freightos_app', 'freightos_control_plane');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0018 §1: % still holds INSERT on audit_events', v_bad;
  END IF;

  -- §4: the runtime role holds no INSERT or UPDATE on kill_switches.
  SELECT string_agg(privilege_type, ', ') INTO v_bad
    FROM information_schema.role_table_grants
   WHERE table_name = 'kill_switches' AND grantee = 'freightos_app'
     AND privilege_type IN ('INSERT', 'UPDATE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0018 §4: freightos_app still holds % on kill_switches', v_bad;
  END IF;

  -- §6: the runtime role holds no UPDATE on organization_nodes.parent_id.
  IF EXISTS (
    SELECT 1 FROM information_schema.column_privileges
     WHERE table_name = 'organization_nodes' AND column_name = 'parent_id'
       AND privilege_type = 'UPDATE' AND grantee = 'freightos_app')
  THEN
    RAISE EXCEPTION '0018 §6: freightos_app still holds UPDATE on organization_nodes.parent_id';
  END IF;

  -- Every function introduced here is a definer with a pinned search_path — ruling 11.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_bad
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proname IN ('record_audit_event', 'engage_kill_switch', 'release_kill_switch',
                       'current_human_principal', 'prior_success', 'claim_operation',
                       'authorization_refusal_reason')
     AND n.nspname IN ('app', 'admin')
     AND (NOT p.prosecdef
          OR p.proconfig IS NULL
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0018 §8: % is not SECURITY DEFINER with a pinned search_path', v_bad;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- §9. The ten privileged operations, moved onto the repaired primitives.
--
-- Every one is replaced rather than patched in place, so the pre-fix candidate stays visible in
-- 0017 and the change is reviewable as a diff of whole functions. Three things change in each,
-- and nothing else does:
--
--   1. the authorization gate now names the administrative permission the operation requires, so
--      being an active member of the tenant is no longer sufficient — §3, RC-C;
--   2. idempotency reads admin.privileged_operation, scoped to tenant and actor, instead of the
--      forgeable ledger — §2, RC-A;
--   3. the same transaction that performs the mutation writes that authoritative record.
--
-- The operation bodies, their validation, their error handling and their audit calls are
-- unchanged. This is deliberately not an opportunity to refactor them.
-- ---------------------------------------------------------------------------

SET LOCAL ROLE freightos_admin_owner;

CREATE OR REPLACE FUNCTION admin.grant_membership(
  p_tenant_id uuid,
  p_user_id uuid,
  p_organization_node_id uuid,
  p_legal_entity_id uuid,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid
) RETURNS admin.privileged_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.membership.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM users WHERE tenant_id = p_tenant_id AND id = p_user_id) THEN
      v_reason := format('user %s is not a user of tenant %s', p_user_id, p_tenant_id);
    ELSIF NOT EXISTS (SELECT 1 FROM organization_nodes
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
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.membership_granted.v1', 'membership', p_user_id::text, 'identity.membership.grant');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.membership.grant', p_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    INSERT INTO memberships
      (tenant_id, organization_node_id, legal_entity_id, user_id, status, created_by)
    VALUES (p_tenant_id, p_organization_node_id, p_legal_entity_id, p_user_id, 'active', p_actor)
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('membership_id', v_id, 'user_id', p_user_id);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, p_legal_entity_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.membership_granted.v1', 'membership', p_user_id::text, 'identity.membership.grant', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, p_legal_entity_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.membership_granted.v1', 'membership', p_user_id::text, 'identity.membership.grant', 'succeeded', v_result);

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.membership.grant', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$$;

CREATE OR REPLACE FUNCTION admin.set_membership_status(
  p_tenant_id uuid,
  p_membership_id uuid,
  p_status text,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid
) RETURNS admin.privileged_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.membership.write');

  IF v_reason IS NULL THEN
    IF p_status NOT IN ('active', 'suspended') THEN
      v_reason := format('membership status %L is not settable here; revoke uses its own operation',
                         p_status);
    ELSIF NOT EXISTS (SELECT 1 FROM memberships
                       WHERE tenant_id = p_tenant_id AND id = p_membership_id) THEN
      v_reason := format('membership %s is not in tenant %s', p_membership_id, p_tenant_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.membership_status_set.v1', 'membership', p_membership_id::text, 'identity.membership.set_status');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.membership.set_status', p_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    UPDATE memberships SET status = p_status::app.identity_status
     WHERE tenant_id = p_tenant_id AND id = p_membership_id
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('membership_id', v_id, 'status', p_status);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.membership_status_set.v1', 'membership', p_membership_id::text, 'identity.membership.set_status', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.membership_status_set.v1', 'membership', p_membership_id::text, 'identity.membership.set_status', 'succeeded', v_result);

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.membership.set_status', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$$;

CREATE OR REPLACE FUNCTION admin.revoke_membership(
  p_tenant_id uuid,
  p_membership_id uuid,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid
) RETURNS admin.privileged_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.membership.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM memberships
                    WHERE tenant_id = p_tenant_id AND id = p_membership_id
                      AND revoked_at IS NULL) THEN
      v_reason := format('membership %s is not an unrevoked membership of tenant %s',
                         p_membership_id, p_tenant_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.membership_revoked.v1', 'membership', p_membership_id::text, 'identity.membership.revoke');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.membership.revoke', p_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    UPDATE memberships
       SET revoked_at = now(), revoked_by = p_actor, status = 'revoked'
     WHERE tenant_id = p_tenant_id AND id = p_membership_id
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('membership_id', v_id);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.membership_revoked.v1', 'membership', p_membership_id::text, 'identity.membership.revoke', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.membership_revoked.v1', 'membership', p_membership_id::text, 'identity.membership.revoke', 'succeeded', v_result);

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.membership.revoke', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$$;

CREATE OR REPLACE FUNCTION admin.assign_membership_role(
  p_tenant_id uuid,
  p_membership_id uuid,
  p_role_id uuid,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid
) RETURNS admin.privileged_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.membership.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM memberships
                    WHERE tenant_id = p_tenant_id AND id = p_membership_id) THEN
      v_reason := format('membership %s is not in tenant %s', p_membership_id, p_tenant_id);
    ELSIF NOT EXISTS (SELECT 1 FROM roles WHERE tenant_id = p_tenant_id AND id = p_role_id) THEN
      v_reason := format('role %s is not in tenant %s', p_role_id, p_tenant_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.membership_role_assigned.v1', 'membership_role', p_membership_id::text, 'identity.membership_role.assign');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.membership_role.assign', p_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    INSERT INTO membership_roles (tenant_id, membership_id, role_id, created_by)
    VALUES (p_tenant_id, p_membership_id, p_role_id, p_actor)
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('membership_role_id', v_id, 'role_id', p_role_id);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.membership_role_assigned.v1', 'membership_role', p_membership_id::text, 'identity.membership_role.assign', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.membership_role_assigned.v1', 'membership_role', p_membership_id::text, 'identity.membership_role.assign', 'succeeded', v_result);

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.membership_role.assign', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$$;

CREATE OR REPLACE FUNCTION admin.revoke_membership_role(
  p_tenant_id uuid,
  p_membership_role_id uuid,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid
) RETURNS admin.privileged_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.membership.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM membership_roles
                    WHERE tenant_id = p_tenant_id AND id = p_membership_role_id
                      AND revoked_at IS NULL) THEN
      v_reason := format('membership role %s is not an unrevoked assignment of tenant %s',
                         p_membership_role_id, p_tenant_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.membership_role_revoked.v1', 'membership_role', p_membership_role_id::text, 'identity.membership_role.revoke');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.membership_role.revoke', p_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    UPDATE membership_roles SET revoked_at = now(), revoked_by = p_actor
     WHERE tenant_id = p_tenant_id AND id = p_membership_role_id
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('membership_role_id', v_id);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.membership_role_revoked.v1', 'membership_role', p_membership_role_id::text, 'identity.membership_role.revoke', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.membership_role_revoked.v1', 'membership_role', p_membership_role_id::text, 'identity.membership_role.revoke', 'succeeded', v_result);

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.membership_role.revoke', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$$;

CREATE OR REPLACE FUNCTION admin.create_role(
  p_tenant_id uuid,
  p_organization_node_id uuid,
  p_legal_entity_id uuid,
  p_key text,
  p_name text,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid
) RETURNS admin.privileged_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.role.write');

  IF v_reason IS NULL THEN
    IF p_key IS NULL OR btrim(p_key) = '' OR p_name IS NULL OR btrim(p_name) = '' THEN
      v_reason := 'a role needs a key and a name';
    ELSIF NOT EXISTS (SELECT 1 FROM organization_nodes
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
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.role_created.v1', 'role', p_key, 'identity.role.create');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.role.create', p_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    INSERT INTO roles
      (tenant_id, organization_node_id, legal_entity_id, key, name, created_by)
    VALUES (p_tenant_id, p_organization_node_id, p_legal_entity_id, p_key, p_name, p_actor)
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('role_id', v_id, 'key', p_key);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, p_legal_entity_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.role_created.v1', 'role', p_key, 'identity.role.create', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, p_legal_entity_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.role_created.v1', 'role', p_key, 'identity.role.create', 'succeeded', v_result);

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.role.create', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$$;

CREATE OR REPLACE FUNCTION admin.grant_role_permission(
  p_tenant_id uuid,
  p_role_id uuid,
  p_permission_key text,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid
) RETURNS admin.privileged_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.role.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM roles WHERE tenant_id = p_tenant_id AND id = p_role_id) THEN
      v_reason := format('role %s is not in tenant %s', p_role_id, p_tenant_id);
    ELSIF NOT EXISTS (SELECT 1 FROM permissions WHERE key = p_permission_key) THEN
      v_reason := format('permission %L is not in the catalog', p_permission_key);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.role_permission_granted.v1', 'role_permission', p_role_id::text, 'identity.role_permission.grant');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.role_permission.grant', p_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    INSERT INTO role_permissions (tenant_id, role_id, permission_id, created_by)
    SELECT p_tenant_id, p_role_id, id, p_actor FROM permissions WHERE key = p_permission_key
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('role_permission_id', v_id, 'permission', p_permission_key);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.role_permission_granted.v1', 'role_permission', p_role_id::text, 'identity.role_permission.grant', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.role_permission_granted.v1', 'role_permission', p_role_id::text, 'identity.role_permission.grant', 'succeeded', v_result);

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.role_permission.grant', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$$;

CREATE OR REPLACE FUNCTION admin.revoke_role_permission(
  p_tenant_id uuid,
  p_role_permission_id uuid,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid
) RETURNS admin.privileged_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.role.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM role_permissions
                    WHERE tenant_id = p_tenant_id AND id = p_role_permission_id
                      AND revoked_at IS NULL) THEN
      v_reason := format('role permission %s is not an unrevoked grant of tenant %s',
                         p_role_permission_id, p_tenant_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.role_permission_revoked.v1', 'role_permission', p_role_permission_id::text, 'identity.role_permission.revoke');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.role_permission.revoke', p_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    UPDATE role_permissions SET revoked_at = now(), revoked_by = p_actor
     WHERE tenant_id = p_tenant_id AND id = p_role_permission_id
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('role_permission_id', v_id);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.role_permission_revoked.v1', 'role_permission', p_role_permission_id::text, 'identity.role_permission.revoke', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.role_permission_revoked.v1', 'role_permission', p_role_permission_id::text, 'identity.role_permission.revoke', 'succeeded', v_result);

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.role_permission.revoke', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$$;

CREATE OR REPLACE FUNCTION admin.grant_service_account_permission(
  p_tenant_id uuid,
  p_service_account_id uuid,
  p_permission_key text,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid
) RETURNS admin.privileged_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.service_account.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM service_accounts
                    WHERE tenant_id = p_tenant_id AND id = p_service_account_id) THEN
      v_reason := format('service account %s is not in tenant %s',
                         p_service_account_id, p_tenant_id);
    ELSIF NOT EXISTS (SELECT 1 FROM permissions WHERE key = p_permission_key) THEN
      v_reason := format('permission %L is not in the catalog', p_permission_key);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.service_account_permission_granted.v1', 'service_account_permission', p_service_account_id::text, 'identity.service_account_permission.grant');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.service_account_permission.grant', p_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    INSERT INTO service_account_permissions
      (tenant_id, service_account_id, permission_id, created_by)
    SELECT p_tenant_id, p_service_account_id, id, p_actor
      FROM permissions WHERE key = p_permission_key
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('service_account_permission_id', v_id,
                                   'permission', p_permission_key);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.service_account_permission_granted.v1', 'service_account_permission', p_service_account_id::text, 'identity.service_account_permission.grant', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.service_account_permission_granted.v1', 'service_account_permission', p_service_account_id::text, 'identity.service_account_permission.grant', 'succeeded', v_result);

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.service_account_permission.grant', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$$;

CREATE OR REPLACE FUNCTION admin.revoke_service_account_permission(
  p_tenant_id uuid,
  p_service_account_permission_id uuid,
  p_actor text,
  p_actor_type text,
  p_purpose text,
  p_correlation_id uuid
) RETURNS admin.privileged_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reason text;
  v_audit uuid;
  v_prior uuid;
  v_id uuid;
  v_result jsonb := '{}'::jsonb;
BEGIN
  v_reason := admin.authorization_refusal_reason(
    p_actor, p_actor_type, p_purpose, p_tenant_id, p_correlation_id,
    'identity.service_account.write');

  IF v_reason IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM service_account_permissions
                    WHERE tenant_id = p_tenant_id AND id = p_service_account_permission_id
                      AND revoked_at IS NULL) THEN
      v_reason := format('service account permission %s is not an unrevoked grant of tenant %s',
                         p_service_account_permission_id, p_tenant_id);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    RETURN admin.deny(v_reason, p_tenant_id, p_actor, p_actor_type, p_purpose, p_correlation_id,
                      'rig.freight.identity.service_account_permission_revoked.v1', 'service_account_permission', p_service_account_permission_id::text, 'identity.service_account_permission.revoke');
  END IF;

  -- A retry under the same correlation id returns the original record rather than applying the
  -- change twice. The ledger is the idempotency store: no second table to disagree with it.
  v_prior := admin.prior_success(p_tenant_id, p_correlation_id, 'identity.service_account_permission.revoke', p_actor);
  IF v_prior IS NOT NULL THEN
    RETURN ROW('succeeded', v_prior, 'already applied under this correlation id',
               jsonb_build_object('idempotent_replay', true))::admin.privileged_result;
  END IF;

  -- The verified actor, published for 0010's self-elevation guards. They still refuse a change
  -- that would widen the actor's own authority, and now cannot be laundered through a third party.
  PERFORM admin.publish_actor(p_actor);

  BEGIN
    UPDATE service_account_permissions SET revoked_at = now(), revoked_by = p_actor
     WHERE tenant_id = p_tenant_id AND id = p_service_account_permission_id
    RETURNING id INTO v_id;
    v_result := jsonb_build_object('service_account_permission_id', v_id);
  EXCEPTION WHEN others THEN
    v_audit := admin.record(
      p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
      'rig.freight.identity.service_account_permission_revoked.v1', 'service_account_permission', p_service_account_permission_id::text, 'identity.service_account_permission.revoke', 'failed',
      jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE));
    RETURN ROW('failed', v_audit, SQLERRM, '{}'::jsonb)::admin.privileged_result;
  END;

  v_audit := admin.record(
    p_tenant_id, NULL, p_actor, p_actor_type, p_purpose, p_correlation_id,
    'rig.freight.identity.service_account_permission_revoked.v1', 'service_account_permission', p_service_account_permission_id::text, 'identity.service_account_permission.revoke', 'succeeded', v_result);

  -- The authoritative idempotency record, written by the boundary that did the work and
  -- in the same transaction as it — owner ruling 4. The ledger records the result; it is
  -- no longer the source of truth for whether the work already happened.
  PERFORM admin.claim_operation(p_tenant_id, p_correlation_id, 'identity.service_account_permission.revoke', p_actor, v_audit);

  RETURN ROW('succeeded', v_audit, NULL, v_result)::admin.privileged_result;
END
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- §3a. The provisioning path, which never actually worked.
--
-- 0017 §2 documents `actor_type = 'system'` as "the provisioning path". It was not one. The three
-- 0010 self-elevation guards refuse any actor that is not a user at all:
--
--   'identity change refused: actor "%" is not a user, and a change to who holds authority must
--    name the person making it — Constitution Art. I.5'
--
-- So a platform actor passed the gate and was then refused by the trigger. The branch was dead
-- code, and the only bootstrap that ever worked was naming a human who was already a member of the
-- tenant — a human who needed no permission whatsoever, which is RC-C exactly. Adding the
-- permission requirement in §3 turns that dead code into a hard circularity: a tenant's first
-- administrator cannot hold identity.role.write, because the role that would carry it is the thing
-- being created.
--
-- The resolution is not to relax Art. I.5. It is to notice what the guards were really protecting
-- against — an actor widening its OWN authority — and that a platform actor holds no membership,
-- so it has no authority to widen. What it must not be is FORGEABLE, and that is the property
-- R2-01 was built to establish.
--
-- The guards therefore admit a platform actor on two conditions that a session cannot manufacture:
--
--   1. `session_user` is the administrative connection. SECURITY DEFINER changes `current_user`
--      and leaves `session_user` alone, so this is the identity of the connection that actually
--      authenticated. An application session is freightos_app and can no more set this than it can
--      set its own password. This is the same principle 0017's header states — authority comes
--      from the ROLE, which a session cannot set — applied where it was missing.
--   2. the actor is on admin.platform_actor, the closed allowlist from §3.
--
-- A freightos_app session naming `system:tenant-provisioning` still fails condition 1 and is
-- refused exactly as before.
-- ---------------------------------------------------------------------------

GRANT CREATE ON SCHEMA app TO freightos_admin_owner;

-- Created AS the admin owner, not merely transferred to it. A LANGUAGE sql body is parsed and
-- permission-checked at creation time, and the migrator holds no USAGE on schema admin — so the
-- create-then-transfer pattern used elsewhere in this file cannot work for this one function.
SET LOCAL ROLE freightos_admin_owner;

CREATE FUNCTION app.is_verified_platform_actor() RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT session_user = 'freightos_admin'
     AND EXISTS (SELECT 1 FROM admin.platform_actor p WHERE p.actor_id = app.current_actor_id())
$$;

-- Still the owner: only the owner may set privileges on its own function.
COMMENT ON FUNCTION app.is_verified_platform_actor() IS
  'True only for an approved platform actor arriving over the administrative connection. '
  'session_user survives SECURITY DEFINER, so it names the role that authenticated rather than one '
  'a session declared — 0018 §3a.';

REVOKE ALL ON FUNCTION app.is_verified_platform_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_verified_platform_actor() TO freightos_identity_guard;

RESET ROLE;

REVOKE CREATE ON SCHEMA app FROM freightos_admin_owner;


-- CREATE OR REPLACE needs both ownership of the existing function and CREATE on the schema.
-- 0010 took this back after building the guards; it is lent again for the rewrite and taken
-- back immediately below.
GRANT CREATE ON SCHEMA app TO freightos_identity_guard;

SET LOCAL ROLE freightos_identity_guard;

CREATE OR REPLACE FUNCTION app.reject_membership_self_elevation() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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

  IF NEW.user_id <> v_actor THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'self-elevation refused: actor % may not grant itself a membership',
      app.current_actor_id()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT app.is_narrowing_identity_change(
           OLD.status, NEW.status, OLD.revoked_at, NEW.revoked_at) THEN
    RAISE EXCEPTION 'self-elevation refused: actor % may only narrow its own membership',
      app.current_actor_id()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION app.reject_membership_role_self_elevation() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := app.current_user_id();
  v_user_id uuid;
  v_found boolean;
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

  -- Read as the definer, so the answer does not depend on what the caller can see.
  SELECT user_id, true INTO v_user_id, v_found
    FROM memberships WHERE tenant_id = NEW.tenant_id AND id = NEW.membership_id;

  -- No membership means the row points at nothing. The foreign key will say so in a moment; until
  -- then this guard has no evidence either way and refuses rather than assuming innocence.
  IF NOT coalesce(v_found, false) THEN
    RAISE EXCEPTION
      'identity change refused: membership % is not present in tenant %',
      NEW.membership_id, NEW.tenant_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_user_id IS DISTINCT FROM v_actor THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'self-elevation refused: actor % may not grant itself a role',
      app.current_actor_id()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'self-elevation refused: actor % may only revoke its own role assignment',
      app.current_actor_id()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION app.reject_role_permission_self_elevation() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
      FROM memberships m
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
$$;

RESET ROLE;

REVOKE CREATE ON SCHEMA app FROM freightos_identity_guard;
