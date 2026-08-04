-- 0001 — Platform foundation: schema, enums, roles, session context, shared triggers.
--
-- Closes audit findings G1 (no RLS policies) and G15 (legal-authority ambiguity) at the
-- foundation level. ADR-0015, ADR-0016, ADR-0017.
--
-- Nothing here is domain schema. Phase 1 builds shipments, journeys, legs, fleet and facility
-- primitives on top of these primitives.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS app;
COMMENT ON SCHEMA app IS
  'Platform primitives: session context, RLS predicates, and shared triggers. Not domain data.';

-- ---------------------------------------------------------------------------
-- Legal model — ADR-0015.
-- Two dimensions, deliberately separate. The handoff overloaded one `authority_mode` column to
-- carry legal posture, operational surface, RLS discriminator and kill-switch scope at once.
-- ---------------------------------------------------------------------------

CREATE TYPE app.legal_authority_class AS ENUM (
  'software_only',
  'carrier_agent',
  'brokerage'
);
COMMENT ON TYPE app.legal_authority_class IS
  'Regulatory posture FreightOS acts under. carrier_agent requires a specific carrier and a '
  'written appointment. brokerage requires the signed brokerage legal gate and is disabled in '
  'Horizon 1.';

CREATE TYPE app.operating_context AS ENUM (
  'system',
  'carrier',
  'shipper_owned',
  'facility_operator',
  'autonomous_mobility',
  'brokerage'
);
COMMENT ON TYPE app.operating_context IS
  'Operational surface. Never a substitute for legal authority and never widens permission.';

-- ADR-0015 rule 6. Enforced as a function so tables can CHECK it without repeating the table.
CREATE FUNCTION app.is_permitted_legal_pairing(
  p_class app.legal_authority_class,
  p_context app.operating_context
) RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_class
    WHEN 'software_only' THEN
      p_context IN ('system', 'shipper_owned', 'facility_operator', 'autonomous_mobility')
    WHEN 'carrier_agent' THEN p_context = 'carrier'
    WHEN 'brokerage'     THEN p_context = 'brokerage'
  END
$$;
COMMENT ON FUNCTION app.is_permitted_legal_pairing IS
  'ADR-0015 rule 6. carrier_agent + brokerage is unrepresentable, which is what keeps the two '
  'legal planes separate at the storage layer.';

-- ---------------------------------------------------------------------------
-- Roles.
--
-- freightos_migrator     owns the schema and runs migrations. Not the runtime connection.
-- freightos_app          the runtime connection. Subject to RLS.
-- freightos_control_plane the global control plane (04_ENTERPRISE_SCALE_AND_TENANCY:37-39).
--                        Cross-tenant by design, via an explicit policy branch rather than
--                        BYPASSRLS, so the escape is visible in the policy and works without
--                        cluster superuser.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_migrator') THEN
    CREATE ROLE freightos_migrator;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_app') THEN
    CREATE ROLE freightos_app;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_control_plane') THEN
    CREATE ROLE freightos_control_plane;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA app TO freightos_app, freightos_control_plane;
GRANT USAGE ON SCHEMA public TO freightos_app, freightos_control_plane;

-- ---------------------------------------------------------------------------
-- Session context.
--
-- Transaction-scoped: callers use SET LOCAL, so context cannot leak across pooled connections.
-- Every accessor returns NULL rather than raising when unset. NULL is what makes RLS fail closed
-- (`tenant_id = NULL` is NULL, never true), and a raise inside a policy predicate would be
-- evaluated in contexts where the error is unhelpful or order-dependent.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE FUNCTION app.current_actor_id() RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.actor_id', true), '')
$$;

CREATE FUNCTION app.current_legal_authority_class() RETURNS app.legal_authority_class
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.legal_authority_class', true), '')::app.legal_authority_class
$$;

CREATE FUNCTION app.current_operating_context() RETURNS app.operating_context
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.operating_context', true), '')::app.operating_context
$$;

CREATE FUNCTION app.is_control_plane() RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT pg_has_role(current_user, 'freightos_control_plane', 'USAGE')
$$;
COMMENT ON FUNCTION app.is_control_plane IS
  'Role membership, not a session variable. A tenant-scoped caller cannot set its way into the '
  'control plane — Constitution Art. I.5, no agent grants itself authority.';

-- Loud assertion for application code paths that must not proceed without context.
-- Constitution Art. I.2: missing or inconsistent legal context fails closed.
CREATE FUNCTION app.assert_legal_context() RETURNS void
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_class app.legal_authority_class := app.current_legal_authority_class();
  v_context app.operating_context := app.current_operating_context();
BEGIN
  IF app.current_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'legal context missing: app.tenant_id is not set'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF app.current_actor_id() IS NULL THEN
    RAISE EXCEPTION 'legal context missing: app.actor_id is not set'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_class IS NULL OR v_context IS NULL THEN
    RAISE EXCEPTION 'legal context missing: legal_authority_class and operating_context are required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT app.is_permitted_legal_pairing(v_class, v_context) THEN
    RAISE EXCEPTION 'legal context inconsistent: % may not operate in context %', v_class, v_context
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Shared triggers.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.set_updated_at() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- Optimistic concurrency (07_DATA_MODEL:61). Version is owned by the database, so a client
-- cannot forge it, and a stale expected-version update is rejected rather than silently applied.
CREATE FUNCTION app.bump_version() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.version <> OLD.version THEN
    RAISE EXCEPTION 'version is managed by the database and cannot be set directly'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  NEW.version := OLD.version + 1;
  RETURN NEW;
END
$$;

-- Append-only enforcement for audit and outbox. Constitution Art. II.1 makes the audit ledger
-- authoritative; a table that can be updated is not a ledger.
CREATE FUNCTION app.reject_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END
$$;
