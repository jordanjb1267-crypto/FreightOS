-- 0019 — SR-2 / SEC-01. Verified actor binding.
--
-- WHAT THIS CLOSES. Before this migration the authoritative FreightOS actor and tenant were
-- whatever a caller wrote into `app.actor_id` and `app.tenant_id`. `assertLegalContext` checked
-- shape only — is-a-uuid, non-empty string — and never consulted the database. Every runtime
-- authorization and provenance decision then read those GUCs. A compromised application session
-- could name any active human of its tenant and have the ledger record that person.
--
-- THE PROPERTY THIS ESTABLISHES. A caller with arbitrary SQL as freightos_app cannot become another
-- principal even knowing that principal's user id, the tenant id, the legacy actor value, another
-- valid binding identifier, or another backend's pid. The resolver reads NO caller-supplied value:
-- it keys on (pg_backend_pid(), pg_current_xact_id_if_assigned()), neither of which any SQL
-- statement can set. `SET pg_backend_pid` is an unrecognized configuration parameter.
--
-- THE BINDING IS NOT A BEARER CREDENTIAL. Its identifier matters exactly once, at install, and
-- installing somebody else's requires holding it inside the short issuance window AND executing on
-- the exact backend it was minted for AND being in a transaction that carries no binding yet. The
-- third condition is enforced in the table, not in procedure. After install the identifier confers
-- nothing: the resolver never looks at it again.
--
-- ARCHITECTURE, AND WHY IT IS SHAPED THIS WAY — the full record is in
-- docs/security-resilience/SR2_BINDING_DESIGN.md. Three corrections were measured out of the
-- original design before any of this was written:
--
--   1. `backend_start` is MASKED inside a SECURITY DEFINER. pg_stat_activity unmasks a row when
--      GetUserId() matches the backend's user; inside a definer GetUserId() is the function owner.
--      Keying on it would have compared NULL to a stored value and refused every install — R-01
--      exactly, a control that looks present and refuses everybody. The transaction id carries the
--      uniqueness instead.
--   2. Routing current_tenant_id() through full revalidation creates an RLS cycle, because
--      users_read and memberships_read call current_tenant_id(), and organization_node_scope_ok()
--      reads organization_node_closure whose policy calls it too. PostgreSQL does NOT report
--      "infinite recursion detected in policy" for this shape; it exhausts the backend stack. The
--      cut therefore has to be structural, and the static check in the test suite is the control.
--   3. Adding a permissive bootstrap policy alongside the authoritative one does not work
--      (CLOSURE_BOOTSTRAP candidate B): permissive policies are OR'd and PostgreSQL evaluates the
--      authoritative disjunct anyway. Measured: stack depth limit exceeded. The policies must be
--      ROLE-DISJOINT (candidate C).
--
-- THE RESULTING GRAPH IS ACYCLIC BECAUSE THE INNER READ RUNS AS A DIFFERENT ROLE. freightos_app
-- reading `users` gets the authoritative policy, which calls current_tenant_id() →
-- app.verified_principal(). That function is a definer owned by freightos_binding_owner, so its own
-- read of `users` is governed by the BOOTSTRAP policy — a different applicable policy set for a
-- different role — which terminates in app.session_binding. Role-disjointness is the cycle cut.
--
--   freightos_app          → users_read (authoritative)  → verified_principal ─┐
--   freightos_binding_owner → users_bootstrap_read       → session_binding    ─┘ terminates
--
-- ISOLATION IS PART OF THE SECURITY MODEL. Revocation is observed because each statement at READ
-- COMMITTED takes a fresh snapshot. Under REPEATABLE READ or SERIALIZABLE a transaction may hold a
-- pre-revocation snapshot until it ends, which would make the revocation property caller-selectable.
-- app.begin_verified_session refuses anything but read committed. That one check covers every
-- origin — BEGIN ISOLATION LEVEL, SET SESSION CHARACTERISTICS, default_transaction_isolation —
-- because current_setting('transaction_isolation') reports the effective level whatever set it.
-- read uncommitted is rejected on contract exactness: PostgreSQL implements it AS read committed
-- but the GUC preserves the requested name, and the check is on the name.

-- ---------------------------------------------------------------------------
-- §1. The binding owner.
--
-- A new NOLOGIN role rather than an existing one. freightos_admin_owner is the control-plane
-- definer owner and already reads six identity tables; giving it a function the RUNTIME ROLE CAN
-- CALL would put control-plane reach behind a runtime-reachable door. freightos_hierarchy_owner
-- owns closure maintenance and, since R-01, users:SELECT — piling session binding onto it repeats
-- the mistake of a role whose grants no longer tell one story.
--
-- Deliberately NOT a member of freightos_control_plane: it needs no cross-tenant reach, and
-- app.is_control_plane() must be false under it or the bootstrap policies would be bypassed by the
-- control-plane disjunct instead of exercised.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_binding_owner') THEN
    CREATE ROLE freightos_binding_owner NOLOGIN;
  END IF;
END
$$;

-- Administered by the migrator so ALTER FUNCTION ... OWNER TO can reach it. INHERIT FALSE so no
-- ordinary migrator statement picks up its rights; SET TRUE so ownership transfer works.
GRANT freightos_binding_owner TO freightos_migrator WITH SET TRUE, INHERIT FALSE;
GRANT USAGE ON SCHEMA app, public TO freightos_binding_owner;

-- ---------------------------------------------------------------------------
-- §2. app.session_binding.
--
-- Ephemeral. One row per issued binding. Carries no authentication secret: the identifier is a
-- handle, and after installation it authorises nothing at all.
-- ---------------------------------------------------------------------------

CREATE TABLE app.session_binding (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  principal_type         text NOT NULL,
  user_id                uuid,
  service_account_id     uuid,

  tenant_id              uuid NOT NULL REFERENCES tenants (id),
  organization_node_id   uuid NOT NULL,
  legal_entity_id        uuid,
  legal_authority_class  app.legal_authority_class NOT NULL,
  operating_context      app.operating_context NOT NULL,

  -- Which backend may install this. Server-observed on the actual application connection, never
  -- supplied by a client — see the design note on target-pid origin.
  target_backend_pid     integer NOT NULL,

  issued_at              timestamptz NOT NULL DEFAULT now(),
  issued_by              text NOT NULL,
  -- The INSTALLATION deadline, not an authorization lifetime. It bounds the window in which a
  -- stolen, still-uninstalled identifier could be replayed onto a recycled pid. It says nothing
  -- about how long authority lasts: that is the transaction, and authority is revalidated on every
  -- consequential resolution regardless.
  installable_until      timestamptz NOT NULL,

  installed_xact_id      xid8,
  installed_backend_pid  integer,
  installed_at           timestamptz,

  CONSTRAINT session_binding_principal_type
    CHECK (principal_type IN ('human', 'service')),
  -- Exactly one principal identity, and it must match the declared type. A service account cannot
  -- be smuggled in as a human by writing 'human' into a text column.
  CONSTRAINT session_binding_principal_identity
    CHECK ((principal_type = 'human'   AND user_id IS NOT NULL AND service_account_id IS NULL)
        OR (principal_type = 'service' AND service_account_id IS NOT NULL AND user_id IS NULL)),
  CONSTRAINT session_binding_installable_window
    CHECK (installable_until > issued_at),
  -- Installation is all-or-nothing: the three columns move together or not at all.
  CONSTRAINT session_binding_installation_complete
    CHECK (num_nonnulls(installed_xact_id, installed_backend_pid, installed_at) IN (0, 3)),
  CONSTRAINT session_binding_installed_on_target
    CHECK (installed_backend_pid IS NULL OR installed_backend_pid = target_backend_pid)
);

ALTER TABLE app.session_binding OWNER TO freightos_binding_owner;

-- One binding per transaction, enforced by the database rather than by procedure. Without this the
-- "already carries a binding" check in begin_verified_session would be a race.
CREATE UNIQUE INDEX session_binding_one_per_transaction
  ON app.session_binding (installed_xact_id)
  WHERE installed_xact_id IS NOT NULL;

-- The resolver's access path.
CREATE INDEX session_binding_resolution
  ON app.session_binding (installed_backend_pid, installed_xact_id)
  WHERE installed_xact_id IS NOT NULL;

-- Cleanup support. Cleanup is NOT security-critical: authority fails from resolver semantics
-- whether or not anything has ever been swept, so no background job is required for correctness.
CREATE INDEX session_binding_installable_until ON app.session_binding (installable_until);

ALTER TABLE app.session_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.session_binding FORCE ROW LEVEL SECURITY;

-- The policy names NO actor, tenant, or hierarchy accessor. That is what makes it the terminal node
-- of the bootstrap graph. pg_has_role's subject is given EXPLICITLY as current_user rather than
-- relying on the two-argument form's implicit subject: inside a SECURITY DEFINER current_user is
-- the function owner, and leaving that implicit would let an omitted argument decide the security
-- model. Here the intent is exactly "only code executing as the binding owner may see these rows".
CREATE POLICY session_binding_owner_only ON app.session_binding
  FOR ALL USING (pg_has_role(current_user, 'freightos_binding_owner', 'USAGE'));

COMMENT ON TABLE app.session_binding IS
  'SR-2. Ephemeral verified session bindings. No grant to any runtime role: freightos_app can '
  'neither enumerate nor mutate this table, so it cannot discover another request''s binding.';

-- ---------------------------------------------------------------------------
-- §3. Layer A and B — the bootstrap graph.
--
-- These read app.session_binding and (for node scope) organization_node_closure, and NOTHING else.
-- They must never call verified_principal() or any authoritative accessor: that edge is what the
-- static graph check in the test suite exists to reject, because the runtime symptom of
-- reintroducing it is a backend stack overflow rather than a diagnosable error.
-- ---------------------------------------------------------------------------

GRANT SELECT ON organization_node_closure TO freightos_binding_owner;

-- pg_current_xact_id_if_assigned(), never pg_current_xact_id(): the resolver runs inside ordinary
-- RLS evaluation, and forcing an xid assignment there would burn a transaction id on every SELECT
-- in the system. Install performs an UPDATE, so an xid always exists by the time anything needs to
-- resolve; a transaction that never installed reports NULL and every accessor fails closed.
CREATE FUNCTION app.verified_binding_context()
RETURNS app.session_binding
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT b.*
    FROM app.session_binding b
   WHERE b.installed_backend_pid = pg_backend_pid()
     AND b.installed_xact_id = pg_current_xact_id_if_assigned()
$$;
ALTER FUNCTION app.verified_binding_context() OWNER TO freightos_binding_owner;

COMMENT ON FUNCTION app.verified_binding_context IS
  'SR-2 Layer A. The installed binding for THIS backend and THIS top-level transaction. Takes no '
  'parameter and reads no GUC, so nothing a caller can set participates in the lookup.';

-- BOOTSTRAP ONLY. This exists solely to cut the revalidation recursion, and its only approved
-- consumers are the three bootstrap RLS policies below. It answers "which tenant is this installed
-- binding scoped to" WITHOUT revalidating the principal — so it must never be used as a general
-- authorization accessor. The static check enforces the consumer allowlist.
CREATE FUNCTION app.verified_binding_tenant_scope() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT b.tenant_id
    FROM app.session_binding b
   WHERE b.installed_backend_pid = pg_backend_pid()
     AND b.installed_xact_id = pg_current_xact_id_if_assigned()
$$;
ALTER FUNCTION app.verified_binding_tenant_scope() OWNER TO freightos_binding_owner;

COMMENT ON FUNCTION app.verified_binding_tenant_scope IS
  'SR-2 Layer B, BOOTSTRAP ONLY. Binding-scoped tenant WITHOUT principal revalidation. Approved '
  'consumers: users_bootstrap_read, memberships_bootstrap_read, '
  'organization_node_closure_bootstrap_read. Not an authorization accessor.';

-- BOOTSTRAP ONLY, same rule. Reads the closure through the binding owner's own role-disjoint
-- policy, so it does not re-enter organization_node_scope_ok() and its authoritative accessors.
CREATE FUNCTION app.verified_binding_node_scope_ok(p_organization_node_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM app.session_binding b
      JOIN organization_node_closure c
        ON c.tenant_id = b.tenant_id
       AND c.ancestor_id = b.organization_node_id
       AND c.descendant_id = p_organization_node_id
     WHERE b.installed_backend_pid = pg_backend_pid()
       AND b.installed_xact_id = pg_current_xact_id_if_assigned())
$$;
ALTER FUNCTION app.verified_binding_node_scope_ok(uuid) OWNER TO freightos_binding_owner;

COMMENT ON FUNCTION app.verified_binding_node_scope_ok IS
  'SR-2 Layer B, BOOTSTRAP ONLY. At or below the bound node, WITHOUT principal revalidation. Same '
  'approved-consumer allowlist as app.verified_binding_tenant_scope.';

-- ---------------------------------------------------------------------------
-- §4. Role-disjoint policies — CLOSURE_BOOTSTRAP=C.
--
-- Measured: adding a permissive bootstrap policy beside the authoritative one (candidate B) does
-- NOT work. Permissive policies are OR'd and PostgreSQL evaluates the authoritative disjunct even
-- when the role-only disjunct is satisfied — stack depth limit exceeded. The authoritative policy
-- must simply not be APPLICABLE to the binding owner, which means narrowing it from TO PUBLIC to
-- the exact roles that legitimately need it, taken from the catalog rather than guessed.
--
-- The same treatment is applied to users and memberships, not only the closure. Making those two
-- bootstrap-only for everybody would have removed revalidation from ordinary reads of the identity
-- tables — the same hole, one table over.
-- ---------------------------------------------------------------------------

DROP POLICY organization_node_closure_read ON organization_node_closure;
CREATE POLICY organization_node_closure_read ON organization_node_closure FOR SELECT
  TO freightos_app, freightos_admin_owner, freightos_hierarchy_owner,
     freightos_identity_guard, freightos_migrator
  USING (app.is_control_plane() OR tenant_id = app.current_tenant_id());
CREATE POLICY organization_node_closure_bootstrap_read ON organization_node_closure FOR SELECT
  TO freightos_binding_owner
  USING (tenant_id = app.verified_binding_tenant_scope());

DROP POLICY users_read ON users;
CREATE POLICY users_read ON users FOR SELECT
  TO freightos_app, freightos_admin_owner, freightos_hierarchy_owner,
     freightos_identity_guard, freightos_migrator
  USING (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.organization_node_scope_ok(organization_node_id));
CREATE POLICY users_bootstrap_read ON users FOR SELECT
  TO freightos_binding_owner
  USING (tenant_id = app.verified_binding_tenant_scope()
         AND app.verified_binding_node_scope_ok(organization_node_id));

DROP POLICY memberships_read ON memberships;
CREATE POLICY memberships_read ON memberships FOR SELECT
  TO freightos_app, freightos_admin_owner, freightos_hierarchy_owner,
     freightos_identity_guard, freightos_migrator
  USING (
    (app.is_control_plane() OR tenant_id = app.current_tenant_id())
    AND app.organization_node_scope_ok(organization_node_id));
CREATE POLICY memberships_bootstrap_read ON memberships FOR SELECT
  TO freightos_binding_owner
  USING (tenant_id = app.verified_binding_tenant_scope()
         AND app.verified_binding_node_scope_ok(organization_node_id));

GRANT SELECT ON users, memberships TO freightos_binding_owner;

-- ---------------------------------------------------------------------------
-- §5. Layer C — the fully revalidated principal.
--
-- Issuance proves the server accepted an authentication result at a moment in time. It does NOT
-- freeze authorization. This function re-reads mutable state on every call, so a membership
-- suspended after issuance stops resolving on the next consequential statement, with no cache to
-- invalidate. The bounded residual is one statement: a statement already executing completes under
-- the snapshot it acquired at statement start.
-- ---------------------------------------------------------------------------

CREATE TYPE app.verified_principal_result AS (
  principal_type        text,
  user_id               uuid,
  service_account_id    uuid,
  tenant_id             uuid,
  organization_node_id  uuid,
  legal_entity_id       uuid,
  actor_id              text
);

CREATE FUNCTION app.verified_principal() RETURNS app.verified_principal_result
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT b.principal_type,
         b.user_id,
         b.service_account_id,
         b.tenant_id,
         b.organization_node_id,
         b.legal_entity_id,
         CASE b.principal_type
           WHEN 'human'   THEN 'user:' || b.user_id::text
           WHEN 'service' THEN 'service_account:' || b.service_account_id::text
         END
    FROM app.session_binding b
   WHERE b.installed_backend_pid = pg_backend_pid()
     AND b.installed_xact_id = pg_current_xact_id_if_assigned()
     AND (
       -- Human: the user must still be an active principal AND still hold an active membership
       -- relating it to the bound tenant. Both are re-read here, not remembered from issuance.
       (b.principal_type = 'human' AND EXISTS (
          SELECT 1
            FROM users u
            JOIN memberships m
              ON m.tenant_id = u.tenant_id
             AND m.user_id = u.id
           WHERE u.id = b.user_id
             AND u.tenant_id = b.tenant_id
             AND u.status = 'active' AND u.revoked_at IS NULL
             AND u.effective_from <= now()
             AND (u.effective_to IS NULL OR u.effective_to > now())
             AND m.organization_node_id = b.organization_node_id
             AND m.status = 'active' AND m.revoked_at IS NULL
             AND m.effective_from <= now()
             AND (m.effective_to IS NULL OR m.effective_to > now())))
       OR
       -- Service: its own path. A service principal never acquires human semantics, and
       -- app.current_user_id() below returns NULL for it by construction.
       (b.principal_type = 'service' AND EXISTS (
          SELECT 1 FROM service_accounts s
           WHERE s.id = b.service_account_id
             AND s.tenant_id = b.tenant_id
             AND s.organization_node_id = b.organization_node_id
             AND s.status = 'active' AND s.revoked_at IS NULL))
     )
$$;
ALTER FUNCTION app.verified_principal() OWNER TO freightos_binding_owner;
GRANT SELECT ON service_accounts TO freightos_binding_owner;

COMMENT ON FUNCTION app.verified_principal IS
  'SR-2 Layer C. The currently authorized principal, re-reading mutable user, membership and '
  'service-account state on every call. Issuance is not a cache: a revocation committed before the '
  'next statement begins is observed by that statement at READ COMMITTED.';

-- ---------------------------------------------------------------------------
-- §6. The six authoritative accessors.
--
-- Each now derives from the FULLY REVALIDATED principal for freightos_app, and falls back to the
-- legacy GUC only for other roles. The carve-out is on session_user, which the runtime role cannot
-- change — SET ROLE is denied to it for every role in the cluster — so this is not a bypass a
-- tenant session can take. It exists because migrations, bootstrap and the admin.* boundary run
-- before any binding can exist and would otherwise acquire a circular dependency.
--
-- There is deliberately NO "verified actor missing -> use app.actor_id" path for freightos_app.
-- Absence fails closed.
--
-- Redefining these six gives all 52 existing RLS policies verified semantics without editing one
-- of them.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT CASE WHEN session_user = 'freightos_app'
              THEN (app.verified_principal()).tenant_id
              ELSE nullif(current_setting('app.tenant_id', true), '')::uuid
         END
$$;

CREATE OR REPLACE FUNCTION app.current_actor_id() RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT CASE WHEN session_user = 'freightos_app'
              THEN (app.verified_principal()).actor_id
              ELSE nullif(current_setting('app.actor_id', true), '')
         END
$$;

CREATE OR REPLACE FUNCTION app.current_organization_node_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT CASE WHEN session_user = 'freightos_app'
              THEN (app.verified_principal()).organization_node_id
              ELSE nullif(current_setting('app.organization_node_id', true), '')::uuid
         END
$$;

CREATE OR REPLACE FUNCTION app.current_legal_entity_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT CASE WHEN session_user = 'freightos_app'
              THEN (app.verified_principal()).legal_entity_id
              ELSE nullif(current_setting('app.legal_entity_id', true), '')::uuid
         END
$$;

-- Human-only by construction: a service principal returns NULL here rather than being treated as
-- a person. That is what stops a service identity acquiring human authorization by principal-type
-- manipulation — the type is an enumerated CHECK on the binding row, not a string in a GUC.
CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT CASE WHEN session_user = 'freightos_app'
              THEN (SELECT p.user_id FROM app.verified_principal() p
                     WHERE p.principal_type = 'human')
              ELSE nullif(
                     substring(coalesce(nullif(current_setting('app.actor_id', true), ''), '')
                       from '^user:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'),
                     '')::uuid
         END
$$;

-- Art. V.1's human reservation, now resting on the verified binding rather than on a parsed GUC.
-- The membership and status revalidation already happened inside app.verified_principal().
CREATE OR REPLACE FUNCTION app.current_human_principal() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT CASE WHEN session_user = 'freightos_app'
              THEN (SELECT p.user_id FROM app.verified_principal() p
                     WHERE p.principal_type = 'human')
              ELSE (SELECT u.id
                      FROM users u
                     WHERE u.tenant_id = app.current_tenant_id()
                       AND u.id = nullif(substring(coalesce(nullif(current_setting('app.actor_id', true), ''), '') from
                             '^user:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'),
                             '')::uuid
                       AND u.status = 'active'
                       AND u.revoked_at IS NULL
                       AND u.effective_from <= now()
                       AND (u.effective_to IS NULL OR u.effective_to > now()))
         END
$$;
ALTER FUNCTION app.current_human_principal() OWNER TO freightos_hierarchy_owner;

-- ---------------------------------------------------------------------------
-- §7. The trusted mint boundary.
--
-- This does NOT authenticate anybody. It records that something already holding control-plane
-- credentials asserted an authentication result — the same trust anchor admin.* already rests on,
-- and the only one available until a production adapter exists. freightos_app has no USAGE on
-- schema admin and cannot name this function.
--
-- What it DOES verify is that the asserted principal is real and currently active, and that the
-- requested tenant and node are justified by an active membership (human) or by the account's own
-- scope (service). A verified Alice plus an arbitrary tenant is refused HERE, at issuance, not
-- later at use.
-- ---------------------------------------------------------------------------

SET LOCAL ROLE freightos_admin_owner;

CREATE FUNCTION admin.issue_session_binding(
  p_principal_type       text,
  p_principal_id         uuid,
  p_tenant_id            uuid,
  p_organization_node_id uuid,
  p_legal_entity_id      uuid,
  p_legal_authority_class text,
  p_operating_context    text,
  p_target_backend_pid   integer,
  p_issued_by            text,
  p_installable_seconds  integer DEFAULT 60
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid;
BEGIN
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
        FROM users u
        JOIN memberships m ON m.tenant_id = u.tenant_id AND m.user_id = u.id
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
      SELECT 1 FROM service_accounts s
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
    p_target_backend_pid, p_issued_by,
    now() + make_interval(secs => p_installable_seconds))
  RETURNING id INTO v_id;

  RETURN v_id;
END
$$;

RESET ROLE;

-- These require ownership of app.session_binding, so they run AS its owner. The migrator
-- administers freightos_binding_owner WITH SET TRUE precisely so this is possible without the
-- migrator itself holding the table.
SET LOCAL ROLE freightos_binding_owner;
GRANT INSERT, SELECT ON app.session_binding TO freightos_admin_owner;
-- The mint boundary must be able to write the row it issues.
CREATE POLICY session_binding_mint ON app.session_binding
  FOR ALL TO freightos_admin_owner USING (true) WITH CHECK (true);
RESET ROLE;

-- ---------------------------------------------------------------------------
-- §8. The runtime installer.
--
-- The ONE function freightos_app may call, and it is not a bypass because everything it validates
-- is something the caller cannot fake: the backend pid it is executing on, the transaction id the
-- database assigns, and the effective isolation level.
--
-- The isolation check comes FIRST and is the primary control. Post-install immutability is
-- defence in depth, not the mechanism: PostgreSQL refuses SET TRANSACTION ISOLATION LEVEL after
-- any query, so once this function has run the level cannot change — but relying on that alone
-- would leave a transaction that STARTED at repeatable read perfectly able to install.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.begin_verified_session(p_binding uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_installed integer;
BEGIN
  -- One check for every origin. current_setting('transaction_isolation') reports the effective
  -- level whether it came from BEGIN ISOLATION LEVEL, SET SESSION CHARACTERISTICS or
  -- default_transaction_isolation, so no per-origin control is needed. 'read uncommitted' is
  -- rejected deliberately: PostgreSQL implements it AS read committed but the GUC preserves the
  -- requested name, and this contract is on the name.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'verified session requires read committed isolation'
      USING ERRCODE = 'invalid_transaction_state';
  END IF;

  -- Claimed atomically. Every condition is in the WHERE clause rather than in preceding IF
  -- statements, so two concurrent installs of the same binding cannot both succeed: the row lock
  -- serialises them and the second sees installed_xact_id already set.
  --
  -- One generic refusal for every failure cause — nonexistent, expired, already installed, wrong
  -- backend, transaction already bound. Distinguishing them would make this an oracle for which
  -- binding identifiers exist.
  UPDATE app.session_binding b
     SET installed_backend_pid = pg_backend_pid(),
         installed_xact_id     = pg_current_xact_id(),
         installed_at          = now()
   WHERE b.id = p_binding
     AND b.installed_xact_id IS NULL
     AND b.installable_until > now()
     AND b.target_backend_pid = pg_backend_pid()
     AND NOT EXISTS (SELECT 1 FROM app.session_binding o
                      WHERE o.installed_xact_id = pg_current_xact_id());
  GET DIAGNOSTICS v_installed = ROW_COUNT;

  IF v_installed <> 1 THEN
    RAISE EXCEPTION 'verified session could not be established'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The principal must still be currently authorized, not merely issued. Installing a binding for
  -- somebody revoked between issuance and install must not produce a working session.
  IF (app.verified_principal()).principal_type IS NULL THEN
    RAISE EXCEPTION 'verified session could not be established'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END
$$;
ALTER FUNCTION app.begin_verified_session(uuid) OWNER TO freightos_binding_owner;

COMMENT ON FUNCTION app.begin_verified_session IS
  'SR-2. Installs an issued binding into THIS backend and THIS transaction. Requires read '
  'committed isolation, the binding''s target backend, an unexpired unconsumed binding, and a '
  'transaction not already bound. Returns one generic refusal for every failure so it is not an '
  'enumeration oracle.';

-- ---------------------------------------------------------------------------
-- §9. ACLs, stated and then asserted from the catalog.
--
-- The baseline capture found app.current_human_principal() carrying PUBLIC EXECUTE despite 0018
-- containing both a REVOKE and a GRANT for it — the materialised default, as though neither
-- statement took effect. Rather than assume the same statements work this time, every ACL below is
-- asserted from pg_proc afterwards. Forward hardening here; 0019's down restores the captured
-- pre-0019 truth, PUBLIC EXECUTE included, because rollback fidelity is a separate requirement.
-- ---------------------------------------------------------------------------

SET LOCAL ROLE freightos_binding_owner;
REVOKE ALL ON FUNCTION app.verified_binding_context()            FROM PUBLIC;
REVOKE ALL ON FUNCTION app.verified_binding_tenant_scope()       FROM PUBLIC;
REVOKE ALL ON FUNCTION app.verified_binding_node_scope_ok(uuid)  FROM PUBLIC;
REVOKE ALL ON FUNCTION app.verified_principal()                  FROM PUBLIC;
REVOKE ALL ON FUNCTION app.begin_verified_session(uuid)          FROM PUBLIC;
RESET ROLE;
SET LOCAL ROLE freightos_hierarchy_owner;
REVOKE ALL ON FUNCTION app.current_human_principal()             FROM PUBLIC;

-- The runtime role installs and resolves its own identity; it can learn nothing about anybody
-- else's from any of these, because they take no parameter that could name another principal.
GRANT EXECUTE ON FUNCTION app.begin_verified_session(uuid)       TO freightos_app;
GRANT EXECUTE ON FUNCTION app.verified_principal()               TO freightos_app;
GRANT EXECUTE ON FUNCTION app.current_human_principal()          TO freightos_app;
RESET ROLE;
SET LOCAL ROLE freightos_binding_owner;
-- The bootstrap accessors are executable by the runtime role only because RLS policy evaluation
-- requires it. They reveal the caller's OWN installed binding scope and nothing else.
GRANT EXECUTE ON FUNCTION app.verified_binding_tenant_scope()      TO freightos_app;
GRANT EXECUTE ON FUNCTION app.verified_binding_node_scope_ok(uuid) TO freightos_app;
RESET ROLE;

-- The mint boundary is control-plane only. freightos_app has no USAGE on schema admin and cannot
-- name it, but the grant is stated explicitly rather than left to schema reachability.
SET LOCAL ROLE freightos_admin_owner;
REVOKE ALL ON FUNCTION admin.issue_session_binding(
  text, uuid, uuid, uuid, uuid, text, text, integer, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin.issue_session_binding(
  text, uuid, uuid, uuid, uuid, text, text, integer, text, integer) TO freightos_admin;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- §10. Assertions. A migration that silently failed to establish a control is worse than one that
-- failed loudly — and 0018's ACL discrepancy is the reason these are read from the catalog rather
-- than trusted from the statements above.
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_bad text;
BEGIN
  -- The runtime role holds nothing at all on the binding table.
  SELECT string_agg(privilege_type, ', ') INTO v_bad
    FROM information_schema.role_table_grants
   WHERE table_name = 'session_binding' AND grantee = 'freightos_app';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0019 §2: freightos_app unexpectedly holds % on app.session_binding', v_bad;
  END IF;

  -- No PUBLIC EXECUTE survives on any SR-2 security function. This is the check 0018 lacked.
  SELECT string_agg(n.nspname || '.' || p.proname, ', ') INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE (n.nspname, p.proname) IN (
           ('app','verified_binding_context'), ('app','verified_binding_tenant_scope'),
           ('app','verified_binding_node_scope_ok'), ('app','verified_principal'),
           ('app','begin_verified_session'), ('app','current_human_principal'),
           ('admin','issue_session_binding'))
     AND has_function_privilege('public', p.oid, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0019 §9: PUBLIC still holds EXECUTE on %', v_bad;
  END IF;

  -- Every new definer is owned by a NOLOGIN role with a pinned search_path.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_roles r ON r.oid = p.proowner
   WHERE (n.nspname, p.proname) IN (
           ('app','verified_binding_context'), ('app','verified_binding_tenant_scope'),
           ('app','verified_binding_node_scope_ok'), ('app','verified_principal'),
           ('app','begin_verified_session'), ('admin','issue_session_binding'))
     AND (NOT p.prosecdef OR r.rolcanlogin
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c
                          WHERE c = 'search_path=pg_catalog, public'));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0019 §10: % is not a NOLOGIN-owned definer with a pinned search_path', v_bad;
  END IF;

  -- CLOSURE_BOOTSTRAP=C, asserted structurally. The runtime symptom of losing role-disjointness is
  -- a backend stack overflow, so it is checked here rather than left to be discovered at runtime.
  IF EXISTS (SELECT 1 FROM pg_policy p
              WHERE p.polrelid = 'organization_node_closure'::regclass
                AND p.polname = 'organization_node_closure_read'
                AND (p.polroles IS NULL OR 0 = ANY(p.polroles)
                     OR 'freightos_binding_owner'::regrole = ANY(p.polroles)))
  THEN
    RAISE EXCEPTION
      '0019 §4: the authoritative closure policy is applicable to freightos_binding_owner — '
      'candidate C requires role-disjointness and this reintroduces the recursion';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policy p
              WHERE p.polrelid = 'organization_node_closure'::regclass
                AND p.polname = 'organization_node_closure_bootstrap_read'
                AND (p.polroles IS NULL OR 0 = ANY(p.polroles)
                     OR 'freightos_app'::regrole = ANY(p.polroles)))
  THEN
    RAISE EXCEPTION '0019 §4: the bootstrap closure policy is applicable to freightos_app';
  END IF;

  -- The binding owner must not be control plane, or the bootstrap policies would be satisfied by
  -- the control-plane disjunct of the surviving TO PUBLIC policies rather than by their own path.
  IF pg_has_role('freightos_binding_owner', 'freightos_control_plane', 'USAGE') THEN
    RAISE EXCEPTION '0019 §1: freightos_binding_owner must not be a control-plane member';
  END IF;

  -- Nor a member of any role the authoritative policies name.
  SELECT string_agg(r, ', ') INTO v_bad
    FROM unnest(ARRAY['freightos_app','freightos_admin_owner','freightos_hierarchy_owner',
                      'freightos_identity_guard','freightos_migrator']) r
   WHERE pg_has_role('freightos_binding_owner', r, 'USAGE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0019 §1: freightos_binding_owner is a member of %', v_bad;
  END IF;
END
$$;
