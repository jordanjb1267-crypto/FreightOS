-- ---------------------------------------------------------------------------
-- Revert N6 — authorized disclosure delivery.
--
-- N6 is the first network phase with genuine runtime business history: an inbox row is a delivery
-- that HAPPENED, and dropping the table destroys the proof of it. That is acceptable in the
-- lifecycle this repository tests — a downgrade returns the schema to 0033, where the concept does
-- not exist, so there is nowhere for the history to live — but it is not acceptable silently.
--
-- The rollback contract, stated rather than implied:
--
--   * A downgrade to 0033 DESTROYS delivery history: inbox rows, artifacts, attempts, routing
--     resolutions, deliveries and subscriptions all go. There is no 0033-shaped place to keep them.
--   * It does NOT alter what was authorized. N5-A grants, N5-B assignments and the N3 journal are
--     untouched, so the authority record survives even though the delivery record does not.
--   * It does NOT un-deliver anything. A recipient that read an artifact before the downgrade read
--     it; reverting the schema is not a recall.
--   * §5 below refuses to run when delivery history exists unless the operator sets
--     `freightos.n6_destructive_revert` — the same shape of deliberate acknowledgement the earlier
--     destructive reverts in this repository use, so an accidental downgrade in an environment
--     with real deliveries fails loudly instead of erasing them.
--
-- Everything else is an exact one-step revert: seven tables, three enums, one function, one role,
-- three permission keys, and nothing that belongs to N1-N5.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- §1. Capture the pre-revert state, so §6 can prove the revert was complete AND bounded.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  PERFORM set_config('freightos.n6_before_policies',
    (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public'), true);
  PERFORM set_config('freightos.n6_before_force',
    (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity), true);
  PERFORM set_config('freightos.n6_before_roles',
    (SELECT count(*)::text FROM pg_roles WHERE rolname LIKE 'freightos%'), true);
  PERFORM set_config('freightos.n6_before_definers',
    (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('app', 'admin', 'authn') AND p.prosecdef), true);
  PERFORM set_config('freightos.n6_before_n5a_cols',
    (SELECT md5(string_agg(c.relname || '.' || a.attname, ',' ORDER BY c.relname, a.attnum))
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname IN ('network_disclosure_purposes', 'network_disclosure_authority_bases',
                          'network_disclosure_projections', 'network_disclosure_projection_fields',
                          'network_disclosure_grants', 'network_disclosure_grant_revocations')
        AND a.attnum > 0 AND NOT a.attisdropped), true);
END
$$;

-- ---------------------------------------------------------------------------
-- §2. Refuse to silently destroy delivery history.
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_inbox bigint; v_deliveries bigint; v_ack text;
BEGIN
  SELECT count(*) INTO v_inbox      FROM public.network_disclosure_inbox;
  SELECT count(*) INTO v_deliveries FROM public.network_disclosure_deliveries;
  v_ack := current_setting('freightos.n6_destructive_revert', true);
  IF (v_inbox > 0 OR v_deliveries > 0) AND coalesce(v_ack, '') <> 'acknowledged' THEN
    RAISE EXCEPTION
      'reverting 0034 would destroy % delivered inbox rows and % delivery records; '
      'set freightos.n6_destructive_revert = ''acknowledged'' to proceed deliberately',
      v_inbox, v_deliveries;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- §3. Drop N6 tables, child before parent. No CASCADE.
--
-- No CASCADE anywhere: if something outside N6 has come to depend on an N6 relation, this must
-- fail rather than quietly remove that dependency too.
--
-- One dependency has to be named before the tables can go, and it is the interesting one. The
-- artifacts recipient-read policy is defined in terms of `network_disclosure_inbox` — that is the
-- whole mechanism by which an undelivered artifact stays invisible — so the inbox table cannot be
-- dropped while the policy exists. Dropping the policy explicitly says which dependency is being
-- removed; a CASCADE would remove it silently along with anything else that happened to point here.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS network_disclosure_artifacts_recipient_read ON network_disclosure_artifacts;

DROP TABLE IF EXISTS network_disclosure_inbox;
DROP TABLE IF EXISTS network_delivery_attempts;
DROP TABLE IF EXISTS network_disclosure_deliveries;
DROP TABLE IF EXISTS network_disclosure_artifacts;
DROP TABLE IF EXISTS network_disclosure_routing_resolutions;
DROP TABLE IF EXISTS network_disclosure_subscription_revocations;
DROP TABLE IF EXISTS network_disclosure_subscriptions;

-- ---------------------------------------------------------------------------
-- §4. Drop the transition guard and the three enums.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS app.network_delivery_transition();

DROP TYPE IF EXISTS app.network_delivery_attempt_outcome;
DROP TYPE IF EXISTS app.network_delivery_state;
DROP TYPE IF EXISTS app.network_delivery_destination_kind;

-- ---------------------------------------------------------------------------
-- §5. Remove the delivery identity and its permission keys.
--
-- Privileges the role held on N1-N5 relations are revoked explicitly before the role is dropped:
-- PostgreSQL refuses to drop a role that still owns grants, and relying on the DROP to surface
-- that would turn a bounded revert into an error whose cause is a list of object names.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_delivery_worker') THEN
    REVOKE ALL PRIVILEGES ON network_transport_intents            FROM freightos_delivery_worker;
    REVOKE ALL PRIVILEGES ON network_events                       FROM freightos_delivery_worker;
    REVOKE ALL PRIVILEGES ON network_participants                 FROM freightos_delivery_worker;
    REVOKE ALL PRIVILEGES ON network_schema_versions              FROM freightos_delivery_worker;
    REVOKE ALL PRIVILEGES ON network_disclosure_purposes          FROM freightos_delivery_worker;
    REVOKE ALL PRIVILEGES ON network_disclosure_authority_bases   FROM freightos_delivery_worker;
    REVOKE ALL PRIVILEGES ON network_disclosure_projections       FROM freightos_delivery_worker;
    REVOKE ALL PRIVILEGES ON network_disclosure_projection_fields FROM freightos_delivery_worker;
    REVOKE ALL PRIVILEGES ON network_disclosure_grants            FROM freightos_delivery_worker;
    REVOKE ALL PRIVILEGES ON network_disclosure_grant_revocations FROM freightos_delivery_worker;
    REVOKE ALL PRIVILEGES ON network_disclosure_sensitivities     FROM freightos_delivery_worker;
    REVOKE ALL PRIVILEGES ON network_schema_disclosure_sensitivity FROM freightos_delivery_worker;
    REVOKE ALL PRIVILEGES ON network_disclosure_purpose_ceilings  FROM freightos_delivery_worker;
    REVOKE USAGE ON SCHEMA public FROM freightos_delivery_worker;
    REVOKE USAGE ON SCHEMA app    FROM freightos_delivery_worker;
    DROP ROLE freightos_delivery_worker;
  END IF;
END
$$;

-- The permission rows need the same temporary, exactly-scoped cleanup policy 0032's revert uses.
-- `permissions` is FORCE-RLS and the migrator holds no DELETE policy on it, so the delete would
-- otherwise remove zero rows and report success. The policy names the three keys and nothing else,
-- admits only the migration principal, and is dropped before commit — so nothing this revert did to
-- `permissions` outlives the transaction except the absence of the three rows.
--
-- First refuse to strand a reference: a key still assigned to a role or a service account must fail
-- loudly rather than be deleted out from under it.
DO $$
DECLARE v_role integer; v_svc integer;
BEGIN
  SELECT count(*) INTO v_role
    FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key LIKE 'network.disclosure_subscription.%';
  IF v_role <> 0 THEN
    RAISE EXCEPTION '0034 down: % role_permissions row(s) reference the N6 subscription keys', v_role;
  END IF;

  SELECT count(*) INTO v_svc
    FROM service_account_permissions sp JOIN permissions p ON p.id = sp.permission_id
   WHERE p.key LIKE 'network.disclosure_subscription.%';
  IF v_svc <> 0 THEN
    RAISE EXCEPTION
      '0034 down: % service_account_permissions row(s) reference the N6 subscription keys', v_svc;
  END IF;
END
$$;

CREATE POLICY permissions_n6_down_cleanup ON public.permissions
  FOR DELETE TO freightos_migrator
  USING (
    key IN (
      'network.disclosure_subscription.create',
      'network.disclosure_subscription.revoke',
      'network.disclosure_subscription.read'
    )
  );

DO $$
DECLARE v_deleted integer;
BEGIN
  -- Exact keys, never a LIKE: a broad predicate that matched something else would delete it, and
  -- the policy above would not stop it because the policy is a ceiling, not the intent.
  DELETE FROM permissions
   WHERE key IN (
     'network.disclosure_subscription.create',
     'network.disclosure_subscription.revoke',
     'network.disclosure_subscription.read'
   );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 3 THEN
    RAISE EXCEPTION
      '0034 down: expected to delete exactly 3 N6 permission rows, deleted %. Aborting rather than '
      'leaving the catalog in a state nobody predicted.', v_deleted;
  END IF;
END
$$;

DROP POLICY permissions_n6_down_cleanup ON public.permissions;

-- ---------------------------------------------------------------------------
-- §6. Prove the revert is COMPLETE and BOUNDED.
--
-- Complete: nothing N6 built survives. Bounded: nothing outside N6 moved. The second half is the
-- one that catches a revert which removed a policy or a role it did not create.
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_left text; v_types text; v_role int; v_keys int; v_now int; v_before int;
BEGIN
  SELECT string_agg(c.relname, ',' ORDER BY c.relname) INTO v_left
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relname IN ('network_disclosure_subscriptions',
                       'network_disclosure_subscription_revocations',
                       'network_disclosure_routing_resolutions',
                       'network_disclosure_artifacts',
                       'network_disclosure_deliveries',
                       'network_delivery_attempts',
                       'network_disclosure_inbox');
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'N6 revert incomplete, tables remain: %', v_left;
  END IF;

  SELECT string_agg(t.typname, ',' ORDER BY t.typname) INTO v_types
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'app'
     AND t.typname IN ('network_delivery_state', 'network_delivery_attempt_outcome',
                       'network_delivery_destination_kind');
  IF v_types IS NOT NULL THEN
    RAISE EXCEPTION 'N6 revert incomplete, types remain: %', v_types;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'app' AND p.proname = 'network_delivery_transition') THEN
    RAISE EXCEPTION 'N6 revert incomplete: app.network_delivery_transition() remains';
  END IF;

  SELECT count(*) INTO v_role FROM pg_roles WHERE rolname = 'freightos_delivery_worker';
  IF v_role <> 0 THEN
    RAISE EXCEPTION 'N6 revert incomplete: freightos_delivery_worker remains';
  END IF;

  SELECT count(*) INTO v_keys FROM permissions WHERE key LIKE 'network.disclosure_subscription.%';
  IF v_keys <> 0 THEN
    RAISE EXCEPTION 'N6 revert incomplete: % subscription permission keys remain', v_keys;
  END IF;

  -- Bounded: exactly the nineteen N6 policies went, and exactly the seven FORCE-RLS tables.
  v_before := current_setting('freightos.n6_before_policies')::int;
  SELECT count(*) INTO v_now FROM pg_policies WHERE schemaname = 'public';
  IF v_now <> v_before - 19 THEN
    RAISE EXCEPTION 'N6 revert removed % policies, expected exactly 19', v_before - v_now;
  END IF;

  v_before := current_setting('freightos.n6_before_force')::int;
  SELECT count(*) INTO v_now
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity;
  IF v_now <> v_before - 7 THEN
    RAISE EXCEPTION 'N6 revert changed FORCE-RLS tables by %, expected exactly 7', v_before - v_now;
  END IF;

  -- Exactly one role went, and it was ours.
  v_before := current_setting('freightos.n6_before_roles')::int;
  SELECT count(*) INTO v_now FROM pg_roles WHERE rolname LIKE 'freightos%';
  IF v_now <> v_before - 1 THEN
    RAISE EXCEPTION 'N6 revert changed the freightos role count by %, expected exactly 1',
      v_before - v_now;
  END IF;

  -- Nothing else moved.
  v_before := current_setting('freightos.n6_before_definers')::int;
  SELECT count(*) INTO v_now FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('app', 'admin', 'authn') AND p.prosecdef;
  IF v_now <> v_before THEN
    RAISE EXCEPTION 'N6 revert changed the SECURITY DEFINER inventory: % -> %', v_before, v_now;
  END IF;

  IF (SELECT md5(string_agg(c.relname || '.' || a.attname, ',' ORDER BY c.relname, a.attnum))
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND c.relname IN ('network_disclosure_purposes', 'network_disclosure_authority_bases',
                           'network_disclosure_projections', 'network_disclosure_projection_fields',
                           'network_disclosure_grants', 'network_disclosure_grant_revocations')
         AND a.attnum > 0 AND NOT a.attisdropped)
     IS DISTINCT FROM current_setting('freightos.n6_before_n5a_cols') THEN
    RAISE EXCEPTION 'N6 revert altered the N5-A column set';
  END IF;
END
$$;
