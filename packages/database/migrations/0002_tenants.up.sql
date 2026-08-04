-- 0002 — Tenants, and the canonical RLS pattern every later tenant-owned table copies.
--
-- Closes G1 (zero policies) and G2 (missing common fields). ADR-0017 defines the common-field
-- contract; this is its first application.

CREATE TABLE tenants (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A tenant row IS the tenant, so tenant_id is a self-reference. Carrying the column anyway
  -- keeps one RLS predicate shape across every table instead of a special case here.
  tenant_id              uuid NOT NULL,
  name                   text NOT NULL CHECK (length(btrim(name)) > 0),
  status                 text NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'suspended', 'closed')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             text NOT NULL,
  version                bigint NOT NULL DEFAULT 1,

  CONSTRAINT tenants_self_reference CHECK (tenant_id = id)
);

COMMENT ON TABLE tenants IS
  'Root of tenant isolation. created_by closes audit finding G2 — 07_DATA_MODEL mandates it on '
  'every record and no handoff reference table carried it.';

CREATE TRIGGER tenants_set_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER tenants_bump_version
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION app.bump_version();

-- ---------------------------------------------------------------------------
-- Row-level security.
--
-- FORCE is applied so the table owner is subject too. Without it, a migration or a maintenance
-- session running as the owner silently sees every tenant, which is exactly the cross-tenant
-- admin shortcut 02_GOVERNANCE prohibits.
--
-- The control-plane branch is a role check, not a session variable, so a tenant-scoped caller
-- cannot set its way across the boundary.
-- ---------------------------------------------------------------------------

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

CREATE POLICY tenants_isolation ON tenants
  USING (app.is_control_plane() OR id = app.current_tenant_id())
  WITH CHECK (app.is_control_plane() OR id = app.current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON tenants TO freightos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenants TO freightos_control_plane;

-- Tenant lifecycle is a control-plane operation. The application may not delete a tenant.
REVOKE DELETE ON tenants FROM freightos_app;
