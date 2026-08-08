-- Canonical pre-0020 definitions of every accessor migration 0020 replaces.
-- Captured with pg_get_functiondef() from a database migrated 1..18 as freightos_migrator,
-- at merged main 37f5b673cba1589b8a754fd36caef05472854052. This file is the ROLLBACK TRUTH
-- for 0020's down migration: it is not reconstructed from memory.
--
-- Numbered 0019 when it was captured. SR-2 was renumbered 0019-0022 -> 0020-0023 when the
-- pg_temp emergency hotfix took 0019 on main; the capture is unchanged, only its name is.

-- ============================================================
-- app.current_actor_id | owner=freightos_migrator | volatile=s | secdef=false | search_path=(none) | acl=DEFAULT
CREATE OR REPLACE FUNCTION app.current_actor_id()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  SELECT nullif(current_setting('app.actor_id', true), '')
$function$
;

-- ============================================================
-- app.current_tenant_id | owner=freightos_migrator | volatile=s | secdef=false | search_path=(none) | acl=DEFAULT
CREATE OR REPLACE FUNCTION app.current_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$function$
;

-- ============================================================
-- app.current_organization_node_id | owner=freightos_migrator | volatile=s | secdef=false | search_path=(none) | acl=DEFAULT
CREATE OR REPLACE FUNCTION app.current_organization_node_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT nullif(current_setting('app.organization_node_id', true), '')::uuid
$function$
;

-- ============================================================
-- app.current_legal_entity_id | owner=freightos_migrator | volatile=s | secdef=false | search_path=(none) | acl=DEFAULT
CREATE OR REPLACE FUNCTION app.current_legal_entity_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT nullif(current_setting('app.legal_entity_id', true), '')::uuid
$function$
;

-- ============================================================
-- app.current_user_id | owner=freightos_migrator | volatile=s | secdef=false | search_path=(none) | acl=DEFAULT
CREATE OR REPLACE FUNCTION app.current_user_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT nullif(
    substring(coalesce(app.current_actor_id(), '')
              from '^user:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'),
    '')::uuid
$function$
;

-- ============================================================
-- app.current_human_principal | owner=freightos_hierarchy_owner | volatile=s | secdef=true | search_path=search_path=pg_catalog, public | acl={=X/freightos_hierarchy_owner,freightos_hierarchy_owner=X/freightos_hierarchy_owner}
CREATE OR REPLACE FUNCTION app.current_human_principal()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$
;

