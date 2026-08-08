-- 0021 down — restore the exact pre-0021 policy set and the three pre-0021 predicate bodies.
--
-- Source of truth for every policy below: docs/security-resilience/sr2-baseline/pre-0021-policies.txt,
-- captured with pg_get_expr() from a database migrated 1..19. Not reconstructed from the migration
-- sources, for the same reason 0020's down capture exists: reverting must reproduce the database
-- 1..19 actually builds, not the one its text describes.
--
-- The two scope-set functions are dropped last, after every policy that references them is gone.

-- §3 reversed — the thirty-eight policies, exactly as captured.

DROP POLICY audit_events_isolation ON audit_events;
CREATE POLICY audit_events_isolation ON audit_events FOR ALL
  USING ((app.is_control_plane() OR (tenant_id = app.current_tenant_id())))
  WITH CHECK ((app.is_control_plane() OR (tenant_id = app.current_tenant_id())));

DROP POLICY carrier_appointments_insert ON carrier_appointments;
CREATE POLICY carrier_appointments_insert ON carrier_appointments FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.legal_entity_scope_ok(legal_entity_id) AND app.organization_node_scope_ok(organization_node_id)));

DROP POLICY carrier_appointments_read ON carrier_appointments;
CREATE POLICY carrier_appointments_read ON carrier_appointments FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = app.current_tenant_id())));

DROP POLICY carrier_appointments_update ON carrier_appointments;
CREATE POLICY carrier_appointments_update ON carrier_appointments FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.legal_entity_scope_ok(legal_entity_id)))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.legal_entity_scope_ok(legal_entity_id) AND app.organization_node_scope_ok(organization_node_id)));

DROP POLICY kill_switches_read ON kill_switches;
CREATE POLICY kill_switches_read ON kill_switches FOR SELECT
  USING ((app.is_control_plane() OR (scope = ANY (ARRAY['system'::app.kill_switch_scope, 'legal_plane'::app.kill_switch_scope, 'operating_context'::app.kill_switch_scope])) OR (tenant_id = app.current_tenant_id())));

DROP POLICY legal_entities_insert ON legal_entities;
CREATE POLICY legal_entities_insert ON legal_entities FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.organization_node_scope_ok(organization_node_id)));

DROP POLICY legal_entities_read ON legal_entities;
CREATE POLICY legal_entities_read ON legal_entities FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = app.current_tenant_id())));

DROP POLICY legal_entities_update ON legal_entities;
CREATE POLICY legal_entities_update ON legal_entities FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.legal_entity_scope_ok(id)))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.legal_entity_scope_ok(id) AND app.organization_node_scope_ok(organization_node_id)));

DROP POLICY membership_roles_read ON membership_roles;
CREATE POLICY membership_roles_read ON membership_roles FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = app.current_tenant_id())));

DROP POLICY memberships_bootstrap_read ON memberships;
CREATE POLICY memberships_bootstrap_read ON memberships FOR SELECT
  TO freightos_binding_owner
  USING (((tenant_id = app.verified_binding_tenant_scope()) AND app.verified_binding_node_scope_ok(organization_node_id)));

DROP POLICY memberships_read ON memberships;
CREATE POLICY memberships_read ON memberships FOR SELECT
  TO freightos_admin_owner, freightos_app, freightos_hierarchy_owner, freightos_identity_guard, freightos_migrator
  USING (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.organization_node_scope_ok(organization_node_id)));

DROP POLICY operating_authorities_insert ON operating_authorities;
CREATE POLICY operating_authorities_insert ON operating_authorities FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.legal_entity_scope_ok(legal_entity_id) AND app.organization_node_scope_ok(organization_node_id)));

DROP POLICY operating_authorities_read ON operating_authorities;
CREATE POLICY operating_authorities_read ON operating_authorities FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = app.current_tenant_id())));

DROP POLICY operating_authorities_update ON operating_authorities;
CREATE POLICY operating_authorities_update ON operating_authorities FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.legal_entity_scope_ok(legal_entity_id)))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.legal_entity_scope_ok(legal_entity_id) AND app.organization_node_scope_ok(organization_node_id)));

DROP POLICY organization_node_closure_bootstrap_read ON organization_node_closure;
CREATE POLICY organization_node_closure_bootstrap_read ON organization_node_closure FOR SELECT
  TO freightos_binding_owner
  USING ((tenant_id = app.verified_binding_tenant_scope()));

DROP POLICY organization_node_closure_read ON organization_node_closure;
CREATE POLICY organization_node_closure_read ON organization_node_closure FOR SELECT
  TO freightos_admin_owner, freightos_app, freightos_hierarchy_owner, freightos_identity_guard, freightos_migrator
  USING ((app.is_control_plane() OR (tenant_id = app.current_tenant_id())));

DROP POLICY organization_nodes_insert ON organization_nodes;
CREATE POLICY organization_nodes_insert ON organization_nodes FOR INSERT
  WITH CHECK ((app.is_control_plane() OR (tenant_id = app.current_tenant_id())));

DROP POLICY organization_nodes_read ON organization_nodes;
CREATE POLICY organization_nodes_read ON organization_nodes FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = app.current_tenant_id())));

DROP POLICY organization_nodes_update ON organization_nodes;
CREATE POLICY organization_nodes_update ON organization_nodes FOR UPDATE
  USING ((app.is_control_plane() OR (tenant_id = app.current_tenant_id())))
  WITH CHECK ((app.is_control_plane() OR (tenant_id = app.current_tenant_id())));

DROP POLICY outbox_events_isolation ON outbox_events;
CREATE POLICY outbox_events_isolation ON outbox_events FOR ALL
  USING ((app.is_control_plane() OR (tenant_id = app.current_tenant_id())))
  WITH CHECK ((app.is_control_plane() OR (tenant_id = app.current_tenant_id())));

DROP POLICY policy_bindings_insert ON policy_bindings;
CREATE POLICY policy_bindings_insert ON policy_bindings FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.organization_node_scope_ok(organization_node_id) AND ((legal_entity_id IS NULL) OR app.legal_entity_scope_ok(legal_entity_id))));

DROP POLICY policy_bindings_read ON policy_bindings;
CREATE POLICY policy_bindings_read ON policy_bindings FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = app.current_tenant_id())));

DROP POLICY policy_bindings_update ON policy_bindings;
CREATE POLICY policy_bindings_update ON policy_bindings FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.organization_node_scope_ok(organization_node_id)))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.organization_node_scope_ok(organization_node_id) AND ((legal_entity_id IS NULL) OR app.legal_entity_scope_ok(legal_entity_id))));

DROP POLICY role_permissions_read ON role_permissions;
CREATE POLICY role_permissions_read ON role_permissions FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = app.current_tenant_id())));

DROP POLICY roles_read ON roles;
CREATE POLICY roles_read ON roles FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = app.current_tenant_id())));

DROP POLICY service_account_credentials_insert ON service_account_credentials;
CREATE POLICY service_account_credentials_insert ON service_account_credentials FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.service_account_scope_ok(service_account_id)));

DROP POLICY service_account_credentials_read ON service_account_credentials;
CREATE POLICY service_account_credentials_read ON service_account_credentials FOR SELECT
  USING (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.service_account_scope_ok(service_account_id)));

DROP POLICY service_account_credentials_update ON service_account_credentials;
CREATE POLICY service_account_credentials_update ON service_account_credentials FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.service_account_scope_ok(service_account_id)))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.service_account_scope_ok(service_account_id)));

DROP POLICY service_account_permissions_read ON service_account_permissions;
CREATE POLICY service_account_permissions_read ON service_account_permissions FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = app.current_tenant_id())));

DROP POLICY service_accounts_bootstrap_read ON service_accounts;
CREATE POLICY service_accounts_bootstrap_read ON service_accounts FOR SELECT
  TO freightos_binding_owner
  USING (((tenant_id = app.verified_binding_tenant_scope()) AND app.verified_binding_node_scope_ok(organization_node_id)));

DROP POLICY service_accounts_insert ON service_accounts;
CREATE POLICY service_accounts_insert ON service_accounts FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.legal_entity_scope_ok(legal_entity_id) AND app.organization_node_scope_ok(organization_node_id)));

DROP POLICY service_accounts_read ON service_accounts;
CREATE POLICY service_accounts_read ON service_accounts FOR SELECT
  TO freightos_admin_owner, freightos_app, freightos_hierarchy_owner, freightos_identity_guard, freightos_migrator
  USING (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.organization_node_scope_ok(organization_node_id)));

DROP POLICY service_accounts_update ON service_accounts;
CREATE POLICY service_accounts_update ON service_accounts FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.organization_node_scope_ok(organization_node_id)))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.legal_entity_scope_ok(legal_entity_id) AND app.organization_node_scope_ok(organization_node_id)));

DROP POLICY tenants_isolation ON tenants;
CREATE POLICY tenants_isolation ON tenants FOR ALL
  USING ((app.is_control_plane() OR (id = app.current_tenant_id())))
  WITH CHECK ((app.is_control_plane() OR (id = app.current_tenant_id())));

DROP POLICY users_bootstrap_read ON users;
CREATE POLICY users_bootstrap_read ON users FOR SELECT
  TO freightos_binding_owner
  USING (((tenant_id = app.verified_binding_tenant_scope()) AND app.verified_binding_node_scope_ok(organization_node_id)));

DROP POLICY users_insert ON users;
CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.legal_entity_scope_ok(legal_entity_id) AND app.organization_node_scope_ok(organization_node_id)));

DROP POLICY users_read ON users;
CREATE POLICY users_read ON users FOR SELECT
  TO freightos_admin_owner, freightos_app, freightos_hierarchy_owner, freightos_identity_guard, freightos_migrator
  USING (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.organization_node_scope_ok(organization_node_id)));

DROP POLICY users_update ON users;
CREATE POLICY users_update ON users FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.organization_node_scope_ok(organization_node_id)))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = app.current_tenant_id())) AND app.legal_entity_scope_ok(legal_entity_id) AND app.organization_node_scope_ok(organization_node_id)));

-- §2 reversed — the three row-argument predicates, exactly as 0007 and 0018 define them.

CREATE OR REPLACE FUNCTION app.legal_entity_scope_ok(p_legal_entity_id uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT app.is_control_plane()
      OR (app.current_legal_entity_id() IS NOT NULL
          AND p_legal_entity_id = app.current_legal_entity_id())
$$;

CREATE OR REPLACE FUNCTION app.organization_node_scope_ok(p_organization_node_id uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT app.is_control_plane()
      OR (app.current_organization_node_id() IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM organization_node_closure c
             WHERE c.tenant_id = app.current_tenant_id()
               AND c.ancestor_id = app.current_organization_node_id()
               AND c.descendant_id = p_organization_node_id))
$$;

CREATE OR REPLACE FUNCTION app.service_account_scope_ok(p_service_account_id uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM service_accounts sa
     WHERE sa.id = p_service_account_id
       AND (app.is_control_plane() OR sa.tenant_id = app.current_tenant_id())
       AND app.organization_node_scope_ok(sa.organization_node_id))
$$;

-- §1 reversed.

DROP FUNCTION IF EXISTS app.verified_binding_scope_node_ids();
DROP FUNCTION IF EXISTS app.verified_scope_service_account_ids();
DROP FUNCTION IF EXISTS app.verified_scope_node_ids();
