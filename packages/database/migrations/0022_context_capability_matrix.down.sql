-- 0022 down — restore the exact post-0021 policy set.
--
-- Source of truth: docs/security-resilience/sr2-baseline/post-0021-policies.txt, captured with
-- pg_get_expr() from a database migrated 1..20.

DROP POLICY carrier_appointments_insert ON carrier_appointments;
CREATE POLICY carrier_appointments_insert ON carrier_appointments FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids)))));

DROP POLICY carrier_appointments_read ON carrier_appointments;
CREATE POLICY carrier_appointments_read ON carrier_appointments FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))));

DROP POLICY carrier_appointments_update ON carrier_appointments;
CREATE POLICY carrier_appointments_update ON carrier_appointments FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id)))))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids)))));

DROP POLICY legal_entities_insert ON legal_entities;
CREATE POLICY legal_entities_insert ON legal_entities FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids)))));

DROP POLICY legal_entities_read ON legal_entities;
CREATE POLICY legal_entities_read ON legal_entities FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))));

DROP POLICY legal_entities_update ON legal_entities;
CREATE POLICY legal_entities_update ON legal_entities FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id)))))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids)))));

DROP POLICY membership_roles_insert ON membership_roles;
CREATE POLICY membership_roles_insert ON membership_roles FOR INSERT
  WITH CHECK (app.is_control_plane());

DROP POLICY membership_roles_read ON membership_roles;
CREATE POLICY membership_roles_read ON membership_roles FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))));

DROP POLICY membership_roles_update ON membership_roles;
CREATE POLICY membership_roles_update ON membership_roles FOR UPDATE
  USING (app.is_control_plane())
  WITH CHECK (app.is_control_plane());

DROP POLICY memberships_insert ON memberships;
CREATE POLICY memberships_insert ON memberships FOR INSERT
  WITH CHECK (app.is_control_plane());

DROP POLICY memberships_read ON memberships;
CREATE POLICY memberships_read ON memberships FOR SELECT
  TO freightos_admin_owner, freightos_app, freightos_hierarchy_owner, freightos_identity_guard, freightos_migrator
  USING (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids)))));

DROP POLICY memberships_update ON memberships;
CREATE POLICY memberships_update ON memberships FOR UPDATE
  USING (app.is_control_plane())
  WITH CHECK (app.is_control_plane());

DROP POLICY operating_authorities_insert ON operating_authorities;
CREATE POLICY operating_authorities_insert ON operating_authorities FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids)))));

DROP POLICY operating_authorities_read ON operating_authorities;
CREATE POLICY operating_authorities_read ON operating_authorities FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))));

DROP POLICY operating_authorities_update ON operating_authorities;
CREATE POLICY operating_authorities_update ON operating_authorities FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id)))))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids)))));

DROP POLICY organization_nodes_insert ON organization_nodes;
CREATE POLICY organization_nodes_insert ON organization_nodes FOR INSERT
  WITH CHECK ((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))));

DROP POLICY organization_nodes_read ON organization_nodes;
CREATE POLICY organization_nodes_read ON organization_nodes FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))));

DROP POLICY organization_nodes_update ON organization_nodes;
CREATE POLICY organization_nodes_update ON organization_nodes FOR UPDATE
  USING ((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))))
  WITH CHECK ((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))));

DROP POLICY policy_bindings_insert ON policy_bindings;
CREATE POLICY policy_bindings_insert ON policy_bindings FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids))) AND ((legal_entity_id IS NULL) OR (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))))));

DROP POLICY policy_bindings_read ON policy_bindings;
CREATE POLICY policy_bindings_read ON policy_bindings FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))));

DROP POLICY policy_bindings_update ON policy_bindings;
CREATE POLICY policy_bindings_update ON policy_bindings FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids)))))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids))) AND ((legal_entity_id IS NULL) OR (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))))));

DROP POLICY role_permissions_insert ON role_permissions;
CREATE POLICY role_permissions_insert ON role_permissions FOR INSERT
  WITH CHECK (app.is_control_plane());

DROP POLICY role_permissions_read ON role_permissions;
CREATE POLICY role_permissions_read ON role_permissions FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))));

DROP POLICY role_permissions_update ON role_permissions;
CREATE POLICY role_permissions_update ON role_permissions FOR UPDATE
  USING (app.is_control_plane())
  WITH CHECK (app.is_control_plane());

DROP POLICY roles_insert ON roles;
CREATE POLICY roles_insert ON roles FOR INSERT
  WITH CHECK (app.is_control_plane());

DROP POLICY roles_read ON roles;
CREATE POLICY roles_read ON roles FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))));

DROP POLICY roles_update ON roles;
CREATE POLICY roles_update ON roles FOR UPDATE
  USING (app.is_control_plane())
  WITH CHECK (app.is_control_plane());

DROP POLICY service_account_credentials_insert ON service_account_credentials;
CREATE POLICY service_account_credentials_insert ON service_account_credentials FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (service_account_id IN ( SELECT app.verified_scope_service_account_ids() AS verified_scope_service_account_ids))));

DROP POLICY service_account_credentials_read ON service_account_credentials;
CREATE POLICY service_account_credentials_read ON service_account_credentials FOR SELECT
  USING (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (service_account_id IN ( SELECT app.verified_scope_service_account_ids() AS verified_scope_service_account_ids))));

DROP POLICY service_account_credentials_update ON service_account_credentials;
CREATE POLICY service_account_credentials_update ON service_account_credentials FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (service_account_id IN ( SELECT app.verified_scope_service_account_ids() AS verified_scope_service_account_ids))))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (service_account_id IN ( SELECT app.verified_scope_service_account_ids() AS verified_scope_service_account_ids))));

DROP POLICY service_account_permissions_insert ON service_account_permissions;
CREATE POLICY service_account_permissions_insert ON service_account_permissions FOR INSERT
  WITH CHECK (app.is_control_plane());

DROP POLICY service_account_permissions_read ON service_account_permissions;
CREATE POLICY service_account_permissions_read ON service_account_permissions FOR SELECT
  USING ((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))));

DROP POLICY service_account_permissions_update ON service_account_permissions;
CREATE POLICY service_account_permissions_update ON service_account_permissions FOR UPDATE
  USING (app.is_control_plane())
  WITH CHECK (app.is_control_plane());

DROP POLICY service_accounts_insert ON service_accounts;
CREATE POLICY service_accounts_insert ON service_accounts FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids)))));

DROP POLICY service_accounts_read ON service_accounts;
CREATE POLICY service_accounts_read ON service_accounts FOR SELECT
  TO freightos_admin_owner, freightos_app, freightos_hierarchy_owner, freightos_identity_guard, freightos_migrator
  USING (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids)))));

DROP POLICY service_accounts_update ON service_accounts;
CREATE POLICY service_accounts_update ON service_accounts FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids)))))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids)))));

DROP POLICY users_insert ON users;
CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids)))));

DROP POLICY users_read ON users;
CREATE POLICY users_read ON users FOR SELECT
  TO freightos_admin_owner, freightos_app, freightos_hierarchy_owner, freightos_identity_guard, freightos_migrator
  USING (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids)))));

DROP POLICY users_update ON users;
CREATE POLICY users_update ON users FOR UPDATE
  USING (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids)))))
  WITH CHECK (((app.is_control_plane() OR (tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))) AND (app.is_control_plane() OR (legal_entity_id = ( SELECT app.current_legal_entity_id() AS current_legal_entity_id))) AND (app.is_control_plane() OR (organization_node_id IN ( SELECT app.verified_scope_node_ids() AS verified_scope_node_ids)))));
DROP FUNCTION IF EXISTS app.identity_read_context_ok();
DROP FUNCTION IF EXISTS app.identity_write_context_ok();
