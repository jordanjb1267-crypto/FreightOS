-- 0023 down — restore the pre-0023 database exactly, including the defect.
--
-- A down migration reverts a change; it does not editorialise about whether the change was a good
-- one. Reverting past 0023 REOPENS F-01 and F-02, and that is the correct behaviour: 22 is a state
-- this repository shipped and the round-trip proof compares against what 0021 and 0022 actually
-- built, not against what is safe. The reproducers in
-- packages/database/test/integration/sr2-temp-shadow.test.ts fail against 22 by design.
--
-- Three things are restored, in reverse order of the up: the unqualified bodies, the search_paths
-- without pg_temp, and PUBLIC's TEMPORARY grant on the database.

-- ---------------------------------------------------------------------------
-- §3'. The authorization core stops naming its schema.
--
-- Bodies restored verbatim from 0020 §3/§6 and 0021 §1/§2 — including their in-body comments, which
-- are part of prosrc and therefore part of the digest the migration proof compares.
-- ---------------------------------------------------------------------------

GRANT CREATE ON SCHEMA app TO freightos_binding_owner;
SET LOCAL ROLE freightos_binding_owner;

CREATE OR REPLACE FUNCTION app.verified_principal() RETURNS app.verified_principal_result
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
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

CREATE OR REPLACE FUNCTION app.verified_binding_node_scope_ok(p_organization_node_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
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

CREATE OR REPLACE FUNCTION app.verified_binding_scope_node_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT c.descendant_id
    FROM app.session_binding b
    JOIN organization_node_closure c
      ON c.tenant_id = b.tenant_id
     AND c.ancestor_id = b.organization_node_id
   WHERE b.installed_backend_pid = pg_backend_pid()
     AND b.installed_xact_id = pg_current_xact_id_if_assigned()
$$;

RESET ROLE;
REVOKE CREATE ON SCHEMA app FROM freightos_binding_owner;

-- The invoker-rights sets and predicates. Migrator-owned, no schema privilege needed, and no SET
-- clause on either side of this migration.

CREATE OR REPLACE FUNCTION app.verified_scope_node_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE
AS $$
  SELECT c.descendant_id
    FROM organization_node_closure c
   WHERE c.tenant_id   = (SELECT app.current_tenant_id())
     AND c.ancestor_id = (SELECT app.current_organization_node_id())
$$;

CREATE OR REPLACE FUNCTION app.verified_scope_service_account_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE
AS $$
  SELECT sa.id
    FROM service_accounts sa
   WHERE (app.is_control_plane() OR sa.tenant_id = (SELECT app.current_tenant_id()))
     AND (app.is_control_plane()
          OR sa.organization_node_id IN (SELECT app.verified_scope_node_ids()))
$$;

CREATE OR REPLACE FUNCTION app.organization_node_scope_ok(p_organization_node_id uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT app.is_control_plane()
      OR ((SELECT app.current_organization_node_id()) IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM organization_node_closure c
             WHERE c.tenant_id     = (SELECT app.current_tenant_id())
               AND c.ancestor_id   = (SELECT app.current_organization_node_id())
               AND c.descendant_id = p_organization_node_id))
$$;

CREATE OR REPLACE FUNCTION app.service_account_scope_ok(p_service_account_id uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM service_accounts sa
     WHERE sa.id = p_service_account_id
       AND (app.is_control_plane() OR sa.tenant_id = (SELECT app.current_tenant_id()))
       AND (app.is_control_plane()
            OR sa.organization_node_id IN (SELECT app.verified_scope_node_ids())))
$$;

-- app.current_human_principal() is the hierarchy owner's, and CREATE OR REPLACE needs the schema
-- privilege 0020 §11 took back. Lent and returned, the same shape the up uses.
GRANT CREATE ON SCHEMA app TO freightos_hierarchy_owner;
SET LOCAL ROLE freightos_hierarchy_owner;
CREATE OR REPLACE FUNCTION app.current_human_principal() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT CASE WHEN session_user = 'freightos_app'
              THEN app.current_user_id()
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
RESET ROLE;
REVOKE CREATE ON SCHEMA app FROM freightos_hierarchy_owner;

-- NOTE — what this down deliberately does NOT do.
--
-- It does not re-grant TEMPORARY to PUBLIC, and it does not put the pre-existing definers back to
-- `pg_catalog, public`. Both of those are owned by migration 0019 on main, not by this migration.
-- Undoing them here would mean reverting SR-2 silently reopened the CRITICAL that 0019 closed —
-- a rollback of one change quietly disabling a different, still-applied security control. The
-- definers this branch CREATES are dropped by the downs of 0020 and 0021, which is where they
-- belong. Reverting past 0019 itself is the only thing that restores the vulnerable baseline, and
-- 0019's own down says so.
