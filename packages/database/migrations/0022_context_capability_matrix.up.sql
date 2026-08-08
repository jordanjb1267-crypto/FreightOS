-- 0022 — ADR-0019's context capability matrix, enforced. C-01.
--
-- THE CONTRADICTION, MEASURED. ADR-0019's matrix puts "Identity and organization" at R/W for
-- software_only/system, at "R (own)" for software_only/shipper_owned and
-- software_only/facility_operator, at R for carrier_agent/carrier, at nothing at all for
-- software_only/autonomous_mobility, and at DENIED for brokerage/brokerage. Not one identity policy
-- carried a legal-authority-class or operating-context term, and nothing else in the schema carried
-- one either. A real verified software_only/facility_operator principal writing service_accounts
-- INSIDE its own node scope succeeded — measured, under a live binding, not inferred.
--
-- The test that was supposed to catch this passed for four migrations. It named the terminal node in
-- its context and wrote a row at the legal-entity node above it, so ordinary node scope produced the
-- denial and the operating context played no part. That is the same lesson R-01 and the Category D
-- migration already recorded: a denial is only evidence when it is the RIGHT denial.
--
-- WHAT THIS DOES NOT COVER, AND WHY. The matrix has twelve resource-group rows. Three have tables
-- in this schema:
--
--   * Identity and organization — the gap. Enforced here.
--   * Audit — freightos_app holds SELECT and NOT INSERT or UPDATE on audit_events (0003, 0018 §4).
--     Writes go through the trusted recorder. The matrix says R. Already compliant.
--   * Kill switches — freightos_app holds SELECT and neither INSERT nor UPDATE (0018 §4). The matrix
--     permits system R/W and carrier tenant-scope W, so the schema is STRICTER than the matrix, which
--     is the Phase 3 deferral Phase 0 carry-forward item 1 already records. Nothing to enforce.
--
-- The other nine rows — parties and locations, carrier and fleet, cost profiles, freight core,
-- facility primitives, custody events, load opportunities, assignments and dispatch, autonomous
-- mobility — have no tables yet. Their terms belong to the migrations that create them, and
-- ADR-0019 already records that obligation as "context-conditional RLS predicates, PR 2 onward, per
-- table". outbox_events is runtime-writable and is deliberately out of scope: it is event
-- infrastructure, not one of the matrix's resource groups.
--
-- TRUSTED INPUT ONLY. Both predicates read app.current_legal_authority_class() and
-- app.current_operating_context(), which 0020 §6 made binding-derived, fully revalidated and
-- fail-closed for freightos_app. They are NOT the legacy GUCs for the runtime role, and a session
-- that forges either GUC moves neither predicate — asserted in gate W.
--
-- STATEMENT-SCOPED, like everything 0021 established. Both predicates take no argument, so every
-- policy calls them as `(SELECT ...)` and the planner evaluates them once per statement. 0021 §4's
-- assertions still hold afterwards and are re-run below.
--
-- SOURCE OF TRUTH: docs/security-resilience/sr2-baseline/post-0021-policies.txt, captured with
-- pg_get_expr() from a database migrated 1..20. Mechanical transformation, asserted afterwards.

-- ---------------------------------------------------------------------------
-- §1. The two capability predicates.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.identity_write_context_ok() RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT app.is_control_plane()
      OR ((SELECT app.current_legal_authority_class()) = 'software_only'
          AND (SELECT app.current_operating_context()) = 'system')
$$;
COMMENT ON FUNCTION app.identity_write_context_ok IS
  'ADR-0019 matrix, "Identity and organization" write column: software_only/system only. Reads the '
  'binding-derived accessors, never a GUC. NULL context fails closed. Takes no argument, so policies '
  'call it as a scalar subquery and it resolves once per statement.';

CREATE FUNCTION app.identity_read_context_ok() RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT app.is_control_plane()
      OR ((SELECT app.current_legal_authority_class()) = 'software_only'
          AND (SELECT app.current_operating_context())
              IN ('system', 'shipper_owned', 'facility_operator'))
      OR ((SELECT app.current_legal_authority_class()) = 'carrier_agent'
          AND (SELECT app.current_operating_context()) = 'carrier')
$$;
COMMENT ON FUNCTION app.identity_read_context_ok IS
  'ADR-0019 matrix, "Identity and organization" read column. autonomous_mobility gets nothing — the '
  'matrix leaves that cell empty and the context stands suspended. brokerage is DENIED throughout '
  'and is absent here for that reason, which is its fourth independent refusal.';

-- ---------------------------------------------------------------------------
-- §2. The identity policies. Read and write, both columns of the matrix row.
-- ---------------------------------------------------------------------------

DROP POLICY carrier_appointments_insert ON carrier_appointments;
CREATE POLICY carrier_appointments_insert ON carrier_appointments FOR INSERT
  WITH CHECK ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids))))) AND (SELECT app.identity_write_context_ok()));

DROP POLICY carrier_appointments_read ON carrier_appointments;
CREATE POLICY carrier_appointments_read ON carrier_appointments FOR SELECT
  USING (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id)))) AND (SELECT app.identity_read_context_ok()));

DROP POLICY carrier_appointments_update ON carrier_appointments;
CREATE POLICY carrier_appointments_update ON carrier_appointments FOR UPDATE
  USING ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))))) AND (SELECT app.identity_write_context_ok()))
  WITH CHECK ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids))))) AND (SELECT app.identity_write_context_ok()));

DROP POLICY legal_entities_insert ON legal_entities;
CREATE POLICY legal_entities_insert ON legal_entities FOR INSERT
  WITH CHECK ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids))))) AND (SELECT app.identity_write_context_ok()));

DROP POLICY legal_entities_read ON legal_entities;
CREATE POLICY legal_entities_read ON legal_entities FOR SELECT
  USING (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id)))) AND (SELECT app.identity_read_context_ok()));

DROP POLICY legal_entities_update ON legal_entities;
CREATE POLICY legal_entities_update ON legal_entities FOR UPDATE
  USING ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))))) AND (SELECT app.identity_write_context_ok()))
  WITH CHECK ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids))))) AND (SELECT app.identity_write_context_ok()));

DROP POLICY membership_roles_insert ON membership_roles;
CREATE POLICY membership_roles_insert ON membership_roles FOR INSERT
  WITH CHECK ((app.is_control_plane()) AND (SELECT app.identity_write_context_ok()));

DROP POLICY membership_roles_read ON membership_roles;
CREATE POLICY membership_roles_read ON membership_roles FOR SELECT
  USING (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id)))) AND (SELECT app.identity_read_context_ok()));

DROP POLICY membership_roles_update ON membership_roles;
CREATE POLICY membership_roles_update ON membership_roles FOR UPDATE
  USING ((app.is_control_plane()) AND (SELECT app.identity_write_context_ok()))
  WITH CHECK ((app.is_control_plane()) AND (SELECT app.identity_write_context_ok()));

DROP POLICY memberships_insert ON memberships;
CREATE POLICY memberships_insert ON memberships FOR INSERT
  WITH CHECK ((app.is_control_plane()) AND (SELECT app.identity_write_context_ok()));

DROP POLICY memberships_read ON memberships;
CREATE POLICY memberships_read ON memberships FOR SELECT
  TO freightos_admin_owner, freightos_app, freightos_hierarchy_owner, freightos_identity_guard, freightos_migrator
  USING ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids))))) AND (SELECT app.identity_read_context_ok()));

DROP POLICY memberships_update ON memberships;
CREATE POLICY memberships_update ON memberships FOR UPDATE
  USING ((app.is_control_plane()) AND (SELECT app.identity_write_context_ok()))
  WITH CHECK ((app.is_control_plane()) AND (SELECT app.identity_write_context_ok()));

DROP POLICY operating_authorities_insert ON operating_authorities;
CREATE POLICY operating_authorities_insert ON operating_authorities FOR INSERT
  WITH CHECK ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids))))) AND (SELECT app.identity_write_context_ok()));

DROP POLICY operating_authorities_read ON operating_authorities;
CREATE POLICY operating_authorities_read ON operating_authorities FOR SELECT
  USING (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id)))) AND (SELECT app.identity_read_context_ok()));

DROP POLICY operating_authorities_update ON operating_authorities;
CREATE POLICY operating_authorities_update ON operating_authorities FOR UPDATE
  USING ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))))) AND (SELECT app.identity_write_context_ok()))
  WITH CHECK ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids))))) AND (SELECT app.identity_write_context_ok()));

DROP POLICY organization_nodes_insert ON organization_nodes;
CREATE POLICY organization_nodes_insert ON organization_nodes FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id)))) AND (SELECT app.identity_write_context_ok()));

DROP POLICY organization_nodes_read ON organization_nodes;
CREATE POLICY organization_nodes_read ON organization_nodes FOR SELECT
  USING (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id)))) AND (SELECT app.identity_read_context_ok()));

DROP POLICY organization_nodes_update ON organization_nodes;
CREATE POLICY organization_nodes_update ON organization_nodes FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id)))) AND (SELECT app.identity_write_context_ok()))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id)))) AND (SELECT app.identity_write_context_ok()));

DROP POLICY policy_bindings_insert ON policy_bindings;
CREATE POLICY policy_bindings_insert ON policy_bindings FOR INSERT
  WITH CHECK ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids))) AND ((legal_entity_id IS NULL) OR (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id)))))) AND (SELECT app.identity_write_context_ok()));

DROP POLICY policy_bindings_read ON policy_bindings;
CREATE POLICY policy_bindings_read ON policy_bindings FOR SELECT
  USING (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id)))) AND (SELECT app.identity_read_context_ok()));

DROP POLICY policy_bindings_update ON policy_bindings;
CREATE POLICY policy_bindings_update ON policy_bindings FOR UPDATE
  USING ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids))))) AND (SELECT app.identity_write_context_ok()))
  WITH CHECK ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids))) AND ((legal_entity_id IS NULL) OR (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id)))))) AND (SELECT app.identity_write_context_ok()));

DROP POLICY role_permissions_insert ON role_permissions;
CREATE POLICY role_permissions_insert ON role_permissions FOR INSERT
  WITH CHECK ((app.is_control_plane()) AND (SELECT app.identity_write_context_ok()));

DROP POLICY role_permissions_read ON role_permissions;
CREATE POLICY role_permissions_read ON role_permissions FOR SELECT
  USING (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id)))) AND (SELECT app.identity_read_context_ok()));

DROP POLICY role_permissions_update ON role_permissions;
CREATE POLICY role_permissions_update ON role_permissions FOR UPDATE
  USING ((app.is_control_plane()) AND (SELECT app.identity_write_context_ok()))
  WITH CHECK ((app.is_control_plane()) AND (SELECT app.identity_write_context_ok()));

DROP POLICY roles_insert ON roles;
CREATE POLICY roles_insert ON roles FOR INSERT
  WITH CHECK ((app.is_control_plane()) AND (SELECT app.identity_write_context_ok()));

DROP POLICY roles_read ON roles;
CREATE POLICY roles_read ON roles FOR SELECT
  USING (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id)))) AND (SELECT app.identity_read_context_ok()));

DROP POLICY roles_update ON roles;
CREATE POLICY roles_update ON roles FOR UPDATE
  USING ((app.is_control_plane()) AND (SELECT app.identity_write_context_ok()))
  WITH CHECK ((app.is_control_plane()) AND (SELECT app.identity_write_context_ok()));

DROP POLICY service_account_credentials_insert ON service_account_credentials;
CREATE POLICY service_account_credentials_insert ON service_account_credentials FOR INSERT
  WITH CHECK ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (service_account_id IN ( SELECT app.verified_scope_service_account_ids() AS verified_scope_service_account_ids)))) AND (SELECT app.identity_write_context_ok()));

DROP POLICY service_account_credentials_read ON service_account_credentials;
CREATE POLICY service_account_credentials_read ON service_account_credentials FOR SELECT
  USING ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (service_account_id IN ( SELECT app.verified_scope_service_account_ids() AS verified_scope_service_account_ids)))) AND (SELECT app.identity_read_context_ok()));

DROP POLICY service_account_credentials_update ON service_account_credentials;
CREATE POLICY service_account_credentials_update ON service_account_credentials FOR UPDATE
  USING ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (service_account_id IN ( SELECT app.verified_scope_service_account_ids() AS verified_scope_service_account_ids)))) AND (SELECT app.identity_write_context_ok()))
  WITH CHECK ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (service_account_id IN ( SELECT app.verified_scope_service_account_ids() AS verified_scope_service_account_ids)))) AND (SELECT app.identity_write_context_ok()));

DROP POLICY service_account_permissions_insert ON service_account_permissions;
CREATE POLICY service_account_permissions_insert ON service_account_permissions FOR INSERT
  WITH CHECK ((app.is_control_plane()) AND (SELECT app.identity_write_context_ok()));

DROP POLICY service_account_permissions_read ON service_account_permissions;
CREATE POLICY service_account_permissions_read ON service_account_permissions FOR SELECT
  USING (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id)))) AND (SELECT app.identity_read_context_ok()));

DROP POLICY service_account_permissions_update ON service_account_permissions;
CREATE POLICY service_account_permissions_update ON service_account_permissions FOR UPDATE
  USING ((app.is_control_plane()) AND (SELECT app.identity_write_context_ok()))
  WITH CHECK ((app.is_control_plane()) AND (SELECT app.identity_write_context_ok()));

DROP POLICY service_accounts_insert ON service_accounts;
CREATE POLICY service_accounts_insert ON service_accounts FOR INSERT
  WITH CHECK ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids))))) AND (SELECT app.identity_write_context_ok()));

DROP POLICY service_accounts_read ON service_accounts;
CREATE POLICY service_accounts_read ON service_accounts FOR SELECT
  TO freightos_admin_owner, freightos_app, freightos_hierarchy_owner, freightos_identity_guard, freightos_migrator
  USING ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids))))) AND (SELECT app.identity_read_context_ok()));

DROP POLICY service_accounts_update ON service_accounts;
CREATE POLICY service_accounts_update ON service_accounts FOR UPDATE
  USING ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids))))) AND (SELECT app.identity_write_context_ok()))
  WITH CHECK ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids))))) AND (SELECT app.identity_write_context_ok()));

DROP POLICY users_insert ON users;
CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids))))) AND (SELECT app.identity_write_context_ok()));

DROP POLICY users_read ON users;
CREATE POLICY users_read ON users FOR SELECT
  TO freightos_admin_owner, freightos_app, freightos_hierarchy_owner, freightos_identity_guard, freightos_migrator
  USING ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids))))) AND (SELECT app.identity_read_context_ok()));

DROP POLICY users_update ON users;
CREATE POLICY users_update ON users FOR UPDATE
  USING ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids))))) AND (SELECT app.identity_write_context_ok()))
  WITH CHECK ((((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids))))) AND (SELECT app.identity_write_context_ok()));

-- ---------------------------------------------------------------------------
-- §3. Asserted from the catalog.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_left text;
  v_identity text[] := ARRAY[
    'organization_nodes', 'legal_entities', 'operating_authorities', 'carrier_appointments',
    'users', 'memberships', 'membership_roles', 'roles', 'role_permissions',
    'service_accounts', 'service_account_credentials', 'service_account_permissions',
    'policy_bindings'];
BEGIN
  -- (a) Every identity policy that is not a bootstrap policy carries the matching capability term.
  -- A table added to the identity group later without one fails here rather than shipping open.
  SELECT string_agg(c.relname || '.' || p.polname, ', ' ORDER BY c.relname, p.polname)
    INTO v_left
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname = ANY (v_identity)
     AND p.polname NOT LIKE '%\_bootstrap\_read'
     AND coalesce(pg_get_expr(p.polqual, p.polrelid), '')
      || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
      NOT LIKE '%identity_' || CASE WHEN p.polcmd = 'r' THEN 'read' ELSE 'write' END
              || '_context_ok%';
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'C-01: identity policies without a capability term: %', v_left;
  END IF;

  -- (b) The bootstrap policies must NOT have one. They run as freightos_binding_owner and resolve
  -- the principal; a context term there routes the resolver back through its own accessors.
  SELECT string_agg(c.relname || '.' || p.polname, ', ' ORDER BY c.relname, p.polname)
    INTO v_left
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE p.polname LIKE '%\_bootstrap\_read'
     AND coalesce(pg_get_expr(p.polqual, p.polrelid), '') LIKE '%identity_%_context_ok%';
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'C-01: a bootstrap policy gained a capability term: %', v_left;
  END IF;

  -- (c) Both predicates are zero-argument, so no caller-supplied context can reach them, and
  -- invoker-rights, so they confer no reach of their own.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'app'
         AND p.proname IN ('identity_write_context_ok', 'identity_read_context_ok')
         AND p.pronargs = 0 AND NOT p.prosecdef AND p.provolatile = 's') <> 2 THEN
    RAISE EXCEPTION 'C-01: a capability predicate is not a zero-argument invoker-rights STABLE function';
  END IF;

  -- (d) 0021's property survives: no policy resolves an accessor per row.
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
          || '|identity_read_context_ok|identity_write_context_ok'
          || '|verified_binding_tenant_scope)\(');
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'C-01: policies resolve per row again: %', v_left;
  END IF;
END
$$;
