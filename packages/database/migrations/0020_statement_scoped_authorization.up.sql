-- 0020 — statement-scoped authorization resolution. P-01.
--
-- THIS MIGRATION CHANGES NO AUTHORIZATION SEMANTICS. It changes how often the database asks the
-- same question, and nothing about the answer.
--
-- THE DEFECT, MEASURED. 0019 made app.verified_principal() re-read the user, the membership and the
-- service account on every call, deliberately: issuance is not a cache, and a principal revoked
-- before the next statement must lose authority on that statement. That costs ~2.5 ms per call, and
-- the policies called it once per ROW of every protected table — and, inside
-- app.organization_node_scope_ok, once more per row of organization_node_closure. With ten closure
-- rows the arithmetic was exact:
--
--   2.6 ms + 10 × 2.6 ms = 28.6 ms predicted, 28.2 ms measured, against 0.74 ms on the legacy path
--
-- `SELECT id FROM users` over fifty users took 1.0–8.6 s, with 23,028 shared buffer hits for fifty
-- returned rows. That is an algorithmic fault, not SECURITY DEFINER overhead.
--
-- WHY THE OBVIOUS FIX DOES NOT WORK. The documented PostgreSQL RLS idiom is to wrap the accessor in
-- a scalar subquery so the planner hoists it into an InitPlan. Applied to the consuming policy
-- alone it moved 1,047 ms to 987 ms — measured — because app.organization_node_scope_ok takes a ROW
-- argument, so a subquery around it is correlated and still runs per row. Hoisting INSIDE that
-- function does not work either: its body contains a sublink, and PostgreSQL's inline_function()
-- refuses to inline any SQL function whose parse tree has hasSubLinks, so the body gets its own
-- plan per call and its InitPlans are per-call InitPlans. Both facts are measured, not assumed:
-- app.is_control_plane() has no sublink and DOES inline, appearing in EXPLAIN as pg_has_role(),
-- while app.organization_node_scope_ok appears as a function call. Variant A — hoisting inside the
-- functions — took 1,047 ms to 525 ms and remained linear in rows, which is the failure the owner's
-- acceptance standard names explicitly.
--
-- WHAT THIS DOES. The sublink moves OUT of the row-argument function and INTO the policy, where the
-- planner can see it is uncorrelated. Each policy term becomes either an uncorrelated set
-- membership or an uncorrelated scalar comparison:
--
--   app.organization_node_scope_ok(x)  →  app.is_control_plane() OR x IN (SELECT app.verified_scope_node_ids())
--   app.service_account_scope_ok(x)    →  x IN (SELECT app.verified_scope_service_account_ids())
--   app.legal_entity_scope_ok(x)       →  app.is_control_plane() OR x = (SELECT app.current_legal_entity_id())
--   app.current_tenant_id()            →  (SELECT app.current_tenant_id())
--
-- Measured on the same fifty-user query: 1,047 ms → 15.2 ms, buffers 23,028 → 155, and EXPLAIN
-- shows `InitPlan 1 (returns $0)` and `hashed SubPlan` each at loops=1. Four principal resolutions
-- per statement, independent of returned rows and of closure cardinality.
--
-- WHY THIS IS SAFE, AND WHERE THE LINE IS. An InitPlan is evaluated once per STATEMENT EXECUTION.
-- The next statement is a new execution and resolves again. That is exactly the granularity 0019
-- §5 already documents — "a statement already executing completes under the snapshot it acquired at
-- statement start" — so same-transaction revocation visibility is unchanged and is re-proven by the
-- gate. What this migration must never become is transaction-scoped or session-scoped memoisation,
-- which would reintroduce the hole SR-2 closed. §4 asserts the statement-local property structurally
-- and the runtime gate asserts it behaviourally.
--
-- THE TWO NEW FUNCTIONS TAKE NO ARGUMENTS, and that is the point. A helper accepting an
-- already-resolved context as a parameter would make a caller-supplied value an authority primitive
-- — the exact mistake SR-2 exists to remove. These resolve their own context from the binding, are
-- invoker-rights so every policy on every table they read still applies, and return only ids the
-- caller can already enumerate through organization_node_closure and service_accounts. There is
-- nothing a caller can pass them and nothing they reveal that the caller could not already read.
--
-- SOURCE OF TRUTH FOR EVERY POLICY BELOW: docs/security-resilience/sr2-baseline/pre-0020-policies.txt,
-- captured with pg_get_expr() from a database migrated 1..19. The statements are a mechanical
-- transformation of that capture, not a retyping of the migration sources, and §4 asserts the
-- result from the catalog afterwards.

-- ---------------------------------------------------------------------------
-- §1. The two statement-level scope sets.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.verified_scope_node_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE
AS $$
  SELECT c.descendant_id
    FROM organization_node_closure c
   WHERE c.tenant_id   = (SELECT app.current_tenant_id())
     AND c.ancestor_id = (SELECT app.current_organization_node_id())
$$;
COMMENT ON FUNCTION app.verified_scope_node_ids IS
  'SR-2 P-01. Every organization node at or below the caller''s own verified node, resolved ONCE '
  'per statement when called from an uncorrelated subquery. Takes no argument, so no caller-supplied '
  'value participates. Invoker rights, so organization_node_closure''s own policy still applies.';

CREATE FUNCTION app.verified_scope_service_account_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE
AS $$
  SELECT sa.id
    FROM service_accounts sa
   WHERE (app.is_control_plane() OR sa.tenant_id = (SELECT app.current_tenant_id()))
     AND (app.is_control_plane()
          OR sa.organization_node_id IN (SELECT app.verified_scope_node_ids()))
$$;
COMMENT ON FUNCTION app.verified_scope_service_account_ids IS
  'SR-2 P-01. The set app.service_account_scope_ok() answered one row at a time, resolved ONCE per '
  'statement. Same predicate, same control-plane behaviour, no argument.';

-- The bootstrap graph had the same defect one level down, and the gate is what found it.
-- app.verified_principal() reads users and memberships as freightos_binding_owner, under the
-- role-disjoint bootstrap policies 0019 §4 created — and those policies called
-- app.verified_binding_node_scope_ok() once per row of the table being scanned. Measured: a single
-- app.current_tenant_id() cost 3,166 shared buffers once `users` held 152 rows and the planner
-- chose a sequential scan, because each of those rows re-entered session_binding and the closure.
--
-- LAYER B, NOT LAYER C. This deliberately does NOT revalidate the principal, exactly as
-- app.verified_binding_node_scope_ok does not: it is the cut that stops the bootstrap graph
-- recursing into the accessors that depend on it. It is bootstrap-only, it is owned by the binding
-- owner, and scripts/test/sr2-production-boundaries.test.ts already forbids production code from
-- naming anything matching verified_binding_*.
-- ALTER ... OWNER TO requires the NEW owner to hold CREATE on the schema, and 0019 §11 took that
-- back once its own transfers were done. Lent for the one statement and returned immediately, the
-- same shape 0019 §1 uses. Both are inside this migration's single transaction.
GRANT CREATE ON SCHEMA app TO freightos_binding_owner;

CREATE FUNCTION app.verified_binding_scope_node_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT c.descendant_id
    FROM app.session_binding b
    JOIN organization_node_closure c
      ON c.tenant_id = b.tenant_id
     AND c.ancestor_id = b.organization_node_id
   WHERE b.installed_backend_pid = pg_backend_pid()
     AND b.installed_xact_id = pg_current_xact_id_if_assigned()
$$;
COMMENT ON FUNCTION app.verified_binding_scope_node_ids IS
  'SR-2 Layer B, BOOTSTRAP ONLY. The set app.verified_binding_node_scope_ok() answered one row at a '
  'time, WITHOUT principal revalidation. Same approved-consumer allowlist: users_bootstrap_read, '
  'memberships_bootstrap_read, service_accounts_bootstrap_read. Not an authorization accessor.';
ALTER FUNCTION app.verified_binding_scope_node_ids() OWNER TO freightos_binding_owner;
REVOKE CREATE ON SCHEMA app FROM freightos_binding_owner;
-- The bootstrap set resolves the caller's own binding and takes no argument, so the runtime role
-- may execute it for the same reason it may execute the other two Layer B helpers: RLS policy
-- evaluation requires it, and there is nothing to pass it.
GRANT EXECUTE ON FUNCTION app.verified_binding_scope_node_ids() TO freightos_app;

-- ---------------------------------------------------------------------------
-- §2. The row-argument predicates keep working, and stop re-resolving internally.
--
-- Nothing in this repository calls them outside a policy any more, but they are public API and a
-- future caller must not inherit the per-call resolution cost. Their SEMANTICS are unchanged; the
-- accessors inside them are hoisted so each CALL resolves the principal once rather than once per
-- closure row. That does not make them O(1) per statement — only the policy rewrite does that —
-- and §4 asserts no policy still uses them.
-- ---------------------------------------------------------------------------

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

CREATE OR REPLACE FUNCTION app.legal_entity_scope_ok(p_legal_entity_id uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT app.is_control_plane()
      OR ((SELECT app.current_legal_entity_id()) IS NOT NULL
          AND p_legal_entity_id = (SELECT app.current_legal_entity_id()))
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

-- ---------------------------------------------------------------------------
-- §3. The policies. Thirty-eight of the fifty-eight change; the other twenty name no authoritative
-- accessor and are left exactly as they are.
-- ---------------------------------------------------------------------------

DROP POLICY audit_events_isolation ON audit_events;
CREATE POLICY audit_events_isolation ON audit_events FOR ALL
  USING ((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))))
  WITH CHECK ((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))));

DROP POLICY carrier_appointments_insert ON carrier_appointments;
CREATE POLICY carrier_appointments_insert ON carrier_appointments FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (app.is_control_plane() OR (legal_entity_id) = (SELECT app.current_legal_entity_id())) AND (app.is_control_plane() OR (organization_node_id) IN (SELECT app.verified_scope_node_ids()))));

DROP POLICY carrier_appointments_read ON carrier_appointments;
CREATE POLICY carrier_appointments_read ON carrier_appointments FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))));

DROP POLICY carrier_appointments_update ON carrier_appointments;
CREATE POLICY carrier_appointments_update ON carrier_appointments FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (app.is_control_plane() OR (legal_entity_id) = (SELECT app.current_legal_entity_id()))))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (app.is_control_plane() OR (legal_entity_id) = (SELECT app.current_legal_entity_id())) AND (app.is_control_plane() OR (organization_node_id) IN (SELECT app.verified_scope_node_ids()))));

DROP POLICY kill_switches_read ON kill_switches;
CREATE POLICY kill_switches_read ON kill_switches FOR SELECT
  USING ((app.is_control_plane() OR (scope = ANY (ARRAY['system'::app.kill_switch_scope, 'legal_plane'::app.kill_switch_scope, 'operating_context'::app.kill_switch_scope])) OR (tenant_id = (SELECT app.current_tenant_id()))));

DROP POLICY legal_entities_insert ON legal_entities;
CREATE POLICY legal_entities_insert ON legal_entities FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (app.is_control_plane() OR (organization_node_id) IN (SELECT app.verified_scope_node_ids()))));

DROP POLICY legal_entities_read ON legal_entities;
CREATE POLICY legal_entities_read ON legal_entities FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))));

DROP POLICY legal_entities_update ON legal_entities;
CREATE POLICY legal_entities_update ON legal_entities FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (app.is_control_plane() OR (id) = (SELECT app.current_legal_entity_id()))))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (app.is_control_plane() OR (id) = (SELECT app.current_legal_entity_id())) AND (app.is_control_plane() OR (organization_node_id) IN (SELECT app.verified_scope_node_ids()))));

DROP POLICY membership_roles_read ON membership_roles;
CREATE POLICY membership_roles_read ON membership_roles FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))));

DROP POLICY memberships_bootstrap_read ON memberships;
CREATE POLICY memberships_bootstrap_read ON memberships FOR SELECT
  TO freightos_binding_owner
  USING (((tenant_id = (SELECT app.verified_binding_tenant_scope())) AND (organization_node_id) IN (SELECT app.verified_binding_scope_node_ids())));

DROP POLICY memberships_read ON memberships;
CREATE POLICY memberships_read ON memberships FOR SELECT
  TO freightos_admin_owner, freightos_app, freightos_hierarchy_owner, freightos_identity_guard, freightos_migrator
  USING (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (app.is_control_plane() OR (organization_node_id) IN (SELECT app.verified_scope_node_ids()))));

DROP POLICY operating_authorities_insert ON operating_authorities;
CREATE POLICY operating_authorities_insert ON operating_authorities FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (app.is_control_plane() OR (legal_entity_id) = (SELECT app.current_legal_entity_id())) AND (app.is_control_plane() OR (organization_node_id) IN (SELECT app.verified_scope_node_ids()))));

DROP POLICY operating_authorities_read ON operating_authorities;
CREATE POLICY operating_authorities_read ON operating_authorities FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))));

DROP POLICY operating_authorities_update ON operating_authorities;
CREATE POLICY operating_authorities_update ON operating_authorities FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (app.is_control_plane() OR (legal_entity_id) = (SELECT app.current_legal_entity_id()))))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (app.is_control_plane() OR (legal_entity_id) = (SELECT app.current_legal_entity_id())) AND (app.is_control_plane() OR (organization_node_id) IN (SELECT app.verified_scope_node_ids()))));

DROP POLICY organization_node_closure_bootstrap_read ON organization_node_closure;
CREATE POLICY organization_node_closure_bootstrap_read ON organization_node_closure FOR SELECT
  TO freightos_binding_owner
  USING ((tenant_id = (SELECT app.verified_binding_tenant_scope())));

DROP POLICY organization_node_closure_read ON organization_node_closure;
CREATE POLICY organization_node_closure_read ON organization_node_closure FOR SELECT
  TO freightos_admin_owner, freightos_app, freightos_hierarchy_owner, freightos_identity_guard, freightos_migrator
  USING ((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))));

DROP POLICY organization_nodes_insert ON organization_nodes;
CREATE POLICY organization_nodes_insert ON organization_nodes FOR INSERT
  WITH CHECK ((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))));

DROP POLICY organization_nodes_read ON organization_nodes;
CREATE POLICY organization_nodes_read ON organization_nodes FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))));

DROP POLICY organization_nodes_update ON organization_nodes;
CREATE POLICY organization_nodes_update ON organization_nodes FOR UPDATE
  USING ((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))))
  WITH CHECK ((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))));

DROP POLICY outbox_events_isolation ON outbox_events;
CREATE POLICY outbox_events_isolation ON outbox_events FOR ALL
  USING ((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))))
  WITH CHECK ((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))));

DROP POLICY policy_bindings_insert ON policy_bindings;
CREATE POLICY policy_bindings_insert ON policy_bindings FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (app.is_control_plane() OR (organization_node_id) IN (SELECT app.verified_scope_node_ids())) AND ((legal_entity_id IS NULL) OR (app.is_control_plane() OR (legal_entity_id) = (SELECT app.current_legal_entity_id())))));

DROP POLICY policy_bindings_read ON policy_bindings;
CREATE POLICY policy_bindings_read ON policy_bindings FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))));

DROP POLICY policy_bindings_update ON policy_bindings;
CREATE POLICY policy_bindings_update ON policy_bindings FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (app.is_control_plane() OR (organization_node_id) IN (SELECT app.verified_scope_node_ids()))))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (app.is_control_plane() OR (organization_node_id) IN (SELECT app.verified_scope_node_ids())) AND ((legal_entity_id IS NULL) OR (app.is_control_plane() OR (legal_entity_id) = (SELECT app.current_legal_entity_id())))));

DROP POLICY role_permissions_read ON role_permissions;
CREATE POLICY role_permissions_read ON role_permissions FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))));

DROP POLICY roles_read ON roles;
CREATE POLICY roles_read ON roles FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))));

DROP POLICY service_account_credentials_insert ON service_account_credentials;
CREATE POLICY service_account_credentials_insert ON service_account_credentials FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (service_account_id) IN (SELECT app.verified_scope_service_account_ids())));

DROP POLICY service_account_credentials_read ON service_account_credentials;
CREATE POLICY service_account_credentials_read ON service_account_credentials FOR SELECT
  USING (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (service_account_id) IN (SELECT app.verified_scope_service_account_ids())));

DROP POLICY service_account_credentials_update ON service_account_credentials;
CREATE POLICY service_account_credentials_update ON service_account_credentials FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (service_account_id) IN (SELECT app.verified_scope_service_account_ids())))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (service_account_id) IN (SELECT app.verified_scope_service_account_ids())));

DROP POLICY service_account_permissions_read ON service_account_permissions;
CREATE POLICY service_account_permissions_read ON service_account_permissions FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))));

DROP POLICY service_accounts_bootstrap_read ON service_accounts;
CREATE POLICY service_accounts_bootstrap_read ON service_accounts FOR SELECT
  TO freightos_binding_owner
  USING (((tenant_id = (SELECT app.verified_binding_tenant_scope())) AND (organization_node_id) IN (SELECT app.verified_binding_scope_node_ids())));

DROP POLICY service_accounts_insert ON service_accounts;
CREATE POLICY service_accounts_insert ON service_accounts FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (app.is_control_plane() OR (legal_entity_id) = (SELECT app.current_legal_entity_id())) AND (app.is_control_plane() OR (organization_node_id) IN (SELECT app.verified_scope_node_ids()))));

DROP POLICY service_accounts_read ON service_accounts;
CREATE POLICY service_accounts_read ON service_accounts FOR SELECT
  TO freightos_admin_owner, freightos_app, freightos_hierarchy_owner, freightos_identity_guard, freightos_migrator
  USING (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (app.is_control_plane() OR (organization_node_id) IN (SELECT app.verified_scope_node_ids()))));

DROP POLICY service_accounts_update ON service_accounts;
CREATE POLICY service_accounts_update ON service_accounts FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (app.is_control_plane() OR (organization_node_id) IN (SELECT app.verified_scope_node_ids()))))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (app.is_control_plane() OR (legal_entity_id) = (SELECT app.current_legal_entity_id())) AND (app.is_control_plane() OR (organization_node_id) IN (SELECT app.verified_scope_node_ids()))));

DROP POLICY tenants_isolation ON tenants;
CREATE POLICY tenants_isolation ON tenants FOR ALL
  USING ((app.is_control_plane() OR (id = (SELECT app.current_tenant_id()))))
  WITH CHECK ((app.is_control_plane() OR (id = (SELECT app.current_tenant_id()))));

DROP POLICY users_bootstrap_read ON users;
CREATE POLICY users_bootstrap_read ON users FOR SELECT
  TO freightos_binding_owner
  USING (((tenant_id = (SELECT app.verified_binding_tenant_scope())) AND (organization_node_id) IN (SELECT app.verified_binding_scope_node_ids())));

DROP POLICY users_insert ON users;
CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (app.is_control_plane() OR (legal_entity_id) = (SELECT app.current_legal_entity_id())) AND (app.is_control_plane() OR (organization_node_id) IN (SELECT app.verified_scope_node_ids()))));

DROP POLICY users_read ON users;
CREATE POLICY users_read ON users FOR SELECT
  TO freightos_admin_owner, freightos_app, freightos_hierarchy_owner, freightos_identity_guard, freightos_migrator
  USING (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (app.is_control_plane() OR (organization_node_id) IN (SELECT app.verified_scope_node_ids()))));

DROP POLICY users_update ON users;
CREATE POLICY users_update ON users FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (app.is_control_plane() OR (organization_node_id) IN (SELECT app.verified_scope_node_ids()))))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = (SELECT app.current_tenant_id()))) AND (app.is_control_plane() OR (legal_entity_id) = (SELECT app.current_legal_entity_id())) AND (app.is_control_plane() OR (organization_node_id) IN (SELECT app.verified_scope_node_ids()))));

-- ---------------------------------------------------------------------------
-- §4. Asserted from the catalog, not from the text above.
--
-- The transformation was mechanical, so the way it fails is a term left behind rather than a term
-- written wrongly. These read pg_policy after the fact and refuse the migration if one survived.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_left text;
BEGIN
  -- (a) No policy may still call a row-argument scope predicate. Each of these resolves the
  -- principal inside itself and cannot be hoisted, which is the whole defect.
  SELECT string_agg(c.relname || '.' || p.polname, ', ' ORDER BY c.relname, p.polname)
    INTO v_left
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE coalesce(pg_get_expr(p.polqual, p.polrelid), '')
      || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
       ~ ('app\.(organization_node_scope_ok|legal_entity_scope_ok|service_account_scope_ok'
          || '|verified_binding_node_scope_ok)\(');
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'P-01: policies still call a per-row scope predicate: %', v_left;
  END IF;

  -- (b) No policy may call an authoritative accessor OUTSIDE a subquery. pg_get_expr deparses a
  -- hoisted call as `( SELECT app.current_tenant_id() AS current_tenant_id)`, so a bare call is one
  -- whose name is not preceded by `( SELECT `.
  SELECT string_agg(c.relname || '.' || p.polname, ', ' ORDER BY c.relname, p.polname)
    INTO v_left
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE regexp_replace(
           coalesce(pg_get_expr(p.polqual, p.polrelid), '')
        || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''),
           '\( SELECT app\.[a-z_]+\(\)', '', 'g')
       ~ ('app\.(current_tenant_id|current_actor_id|current_organization_node_id'
          || '|current_legal_entity_id|current_user_id|current_human_principal'
          || '|current_legal_authority_class|current_operating_context'
          || '|verified_binding_tenant_scope)\(');
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'P-01: policies still resolve an accessor per row: %', v_left;
  END IF;

  -- (c) The two scope sets are invoker-rights. A definer here would read past the policies of the
  -- tables it scans, which is a different trust model from the one it replaces.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'app'
       AND p.proname IN ('verified_scope_node_ids', 'verified_scope_service_account_ids')
       AND (p.prosecdef OR p.provolatile <> 's' OR NOT p.proretset))
  THEN
    RAISE EXCEPTION 'P-01: a scope-set function is not an invoker-rights STABLE set function';
  END IF;

  -- (d) Neither takes an argument. A parameter would make a caller-supplied value an authority
  -- primitive, which is the one thing SR-2 exists to prevent.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'app'
       AND p.proname IN ('verified_scope_node_ids', 'verified_scope_service_account_ids',
                         'verified_binding_scope_node_ids')
       AND p.pronargs <> 0)
  THEN
    RAISE EXCEPTION 'P-01: a scope-set function takes an argument';
  END IF;

  -- (e) The bootstrap graph is untouched: the four role-disjoint policies 0019 §4 created must
  -- still name freightos_binding_owner alone and must still use only the non-revalidating helpers.
  IF (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
       WHERE p.polname LIKE '%\_bootstrap\_read') <> 4 THEN
    RAISE EXCEPTION 'P-01: the bootstrap policy set is no longer four policies';
  END IF;
END
$$;
