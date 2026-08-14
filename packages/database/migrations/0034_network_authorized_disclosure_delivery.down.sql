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

-- The guard has to be able to SEE the history it is protecting.
--
-- `network_disclosure_inbox` and `network_disclosure_deliveries` are FORCE ROW LEVEL SECURITY, and
-- FORCE binds the table OWNER too — which is the migration authority running this file. Their read
-- policies name the delivery worker and the recipient application; neither names the migrator. So
-- a bare `count(*)` here returns ZERO however much history exists, and returns it without error:
-- the guard would wave every downgrade through and destroy exactly what it was written to protect.
-- That is the same FORCE-RLS hazard N6 already met on the read path, arriving here with the
-- opposite polarity — there it failed closed, here it would fail OPEN.
--
-- The remedy is the one 0032's revert established and §5 below reuses for `permissions`: a
-- temporary, exactly-scoped policy that exists only for the statement that needs it and is dropped
-- before anything else runs. It is not a permanent widening — the migrator does not gain the
-- ability to read delivery history, it gains it for the length of one count.
CREATE POLICY network_disclosure_inbox_n6_down_count ON public.network_disclosure_inbox
  FOR SELECT TO freightos_migrator USING (true);
CREATE POLICY network_disclosure_deliveries_n6_down_count ON public.network_disclosure_deliveries
  FOR SELECT TO freightos_migrator USING (true);

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

DROP POLICY network_disclosure_inbox_n6_down_count ON public.network_disclosure_inbox;
DROP POLICY network_disclosure_deliveries_n6_down_count ON public.network_disclosure_deliveries;

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

-- The read policies 0034 added to tables it does not own. Dropped explicitly here because those
-- tables survive the revert: N4, N3, N1 and N5-A are not ours to drop, only the policies we put on
-- them. Every one is named — a CASCADE would take whatever else happened to point at the table.
DROP POLICY IF EXISTS network_transport_intents_delivery_worker_read ON network_transport_intents;
DROP POLICY IF EXISTS network_events_delivery_worker_read ON network_events;
DROP POLICY IF EXISTS network_participants_delivery_worker_read ON network_participants;
DROP POLICY IF EXISTS network_disclosure_grants_delivery_worker_read ON network_disclosure_grants;
DROP POLICY IF EXISTS network_disclosure_grant_revocations_delivery_worker_read
  ON network_disclosure_grant_revocations;

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

-- THE ROLE IS CLUSTER-GLOBAL, AND THIS FOLLOWS 0029's DOCTRINE EXACTLY.
--
-- `DROP ROLE` consults `pg_shdepend` across EVERY database, and PostgreSQL offers no way to revoke
-- a privilege in a database you are not connected to. An unconditional drop here is therefore not a
-- clean revert — it is a revert that fails on any cluster holding a staging copy, a clone or a
-- parallel test database. 0029 measured that failure mode and recorded it: nine unrelated gates
-- went down at once. This migration reproduced it exactly before the doctrine was applied.
--
-- So: revoke everything IN THIS DATABASE, then ask whether anything anywhere else still references
-- the role. If it does, RETAIN the role and say so — this database is fully reverted either way,
-- and a database must not be held hostage by its neighbours. The role is dropped by whichever
-- database releases it last. `DROP OWNED` and `CASCADE` appear nowhere: either would reach into
-- another database and strip privileges its running system depends on.
--
-- The migrator's implicit ADMIN edge is never revoked by hand — it is what authorises the drop, and
-- 0020 records that a plain REVOKE of it leaves a later re-apply unable to grant the role at all.
DO $$
DECLARE v_elsewhere integer; v_holders text; v_owned integer;
  v_self oid := (SELECT oid FROM pg_database WHERE datname = current_database());
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_delivery_worker') THEN
    RETURN;
  END IF;

  -- STEP A. Release everything this database granted.
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
  REVOKE ALL PRIVILEGES ON SCHEMA public, app                   FROM freightos_delivery_worker;
  EXECUTE format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM freightos_delivery_worker',
                 current_database());

  -- STEP B. Owned relations are a deliberate stop: reassigning them silently would move objects
  -- this migration never created.
  SELECT count(*) INTO v_owned
    FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
   WHERE r.rolname = 'freightos_delivery_worker';
  IF v_owned <> 0 THEN
    RAISE EXCEPTION
      '0034 down: freightos_delivery_worker owns % relation(s). Reassign or drop them deliberately.',
      v_owned;
  END IF;

  -- STEP C. Ask PostgreSQL the same question DROP ROLE will ask, excluding this database — whose
  -- rows step A has already removed. Database-level grants carry `dbid = 0` with the database in
  -- `objid`, so that arm is matched separately or a lingering CONNECT here counts as somebody else's.
  SELECT count(*),
         coalesce(string_agg(DISTINCT coalesce(
           d.datname,
           (SELECT dd.datname FROM pg_database dd
             WHERE dd.oid = s.objid AND s.classid = 'pg_database'::regclass),
           '(cluster-wide)'), ', '), '')
    INTO v_elsewhere, v_holders
    FROM pg_shdepend s
    LEFT JOIN pg_database d ON d.oid = s.dbid
    JOIN pg_roles r ON r.oid = s.refobjid
   WHERE r.rolname = 'freightos_delivery_worker'
     AND NOT (s.dbid = v_self
              OR (s.classid = 'pg_database'::regclass AND s.objid = v_self));

  -- STEP D. Retained, and said out loud. This is not a partial revert: this database is done.
  IF v_elsewhere <> 0 THEN
    RAISE NOTICE
      '0034 down: database % is fully reverted. freightos_delivery_worker is RETAINED because % '
      'reference(s) remain in: %. The role is dropped by whichever database releases it last.',
      current_database(), v_elsewhere, v_holders;
    RETURN;
  END IF;

  EXECUTE 'DROP ROLE freightos_delivery_worker';
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
-- Same FORCE-RLS problem, same remedy, narrower scope.
--
-- `role_permissions` and `service_account_permissions` are FORCE-RLS and their read policies are
-- predicated on `app.current_tenant_id()`, which a deployment session does not have. Counted bare,
-- both come back zero and the two guards below never fire. Their failure is less severe than the
-- history guard's — `permission_id` carries ON DELETE NO ACTION, so a stranded reference still
-- stops the DELETE with a foreign-key violation — but the difference between "this revert refuses
-- and tells you which rows are in the way" and "this revert dies on a constraint" is the whole
-- reason the guards were written.
--
-- Scoped to the three N6 keys and nothing else: a temporary policy admitting the migrator to the
-- whole identity surface would be a far larger loan than the one this needs.
CREATE POLICY role_permissions_n6_down_scan ON public.role_permissions
  FOR SELECT TO freightos_migrator
  USING (permission_id IN (SELECT id FROM public.permissions
                            WHERE key IN ('network.disclosure_subscription.create',
                                          'network.disclosure_subscription.revoke',
                                          'network.disclosure_subscription.read')));
CREATE POLICY service_account_permissions_n6_down_scan ON public.service_account_permissions
  FOR SELECT TO freightos_migrator
  USING (permission_id IN (SELECT id FROM public.permissions
                            WHERE key IN ('network.disclosure_subscription.create',
                                          'network.disclosure_subscription.revoke',
                                          'network.disclosure_subscription.read')));

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

DROP POLICY role_permissions_n6_down_scan ON public.role_permissions;
DROP POLICY service_account_permissions_n6_down_scan ON public.service_account_permissions;

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

  -- The role may legitimately REMAIN when another database still references it — see §5 step D.
  -- What must always be true is that THIS database holds nothing for it any more.
  SELECT count(*) INTO v_role
    FROM pg_shdepend s JOIN pg_roles r ON r.oid = s.refobjid
   WHERE r.rolname = 'freightos_delivery_worker'
     AND s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database());
  IF v_role <> 0 THEN
    RAISE EXCEPTION
      'N6 revert incomplete: % reference(s) to freightos_delivery_worker remain in this database',
      v_role;
  END IF;

  SELECT count(*) INTO v_keys FROM permissions WHERE key LIKE 'network.disclosure_subscription.%';
  IF v_keys <> 0 THEN
    RAISE EXCEPTION 'N6 revert incomplete: % subscription permission keys remain', v_keys;
  END IF;

  -- Bounded: exactly the twenty-four policies 0034 created went — nineteen on the seven N6 tables,
  -- plus the five read policies it placed on tables it does not own (N4, N3, N1 and N5-A's grants
  -- and revocations) — and exactly the seven FORCE-RLS tables.
  v_before := current_setting('freightos.n6_before_policies')::int;
  SELECT count(*) INTO v_now FROM pg_policies WHERE schemaname = 'public';
  IF v_now <> v_before - 24 THEN
    RAISE EXCEPTION 'N6 revert removed % policies, expected exactly 24', v_before - v_now;
  END IF;

  v_before := current_setting('freightos.n6_before_force')::int;
  SELECT count(*) INTO v_now
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity;
  IF v_now <> v_before - 7 THEN
    RAISE EXCEPTION 'N6 revert changed FORCE-RLS tables by %, expected exactly 7', v_before - v_now;
  END IF;

  -- Exactly one role went, and it was ours.
  -- Zero when the role was retained for a neighbouring database, one when this database was the
  -- last holder. Never more than one, and never a role this migration did not create.
  v_before := current_setting('freightos.n6_before_roles')::int;
  SELECT count(*) INTO v_now FROM pg_roles WHERE rolname LIKE 'freightos%';
  IF v_before - v_now NOT IN (0, 1) THEN
    RAISE EXCEPTION 'N6 revert changed the freightos role count by %, expected 0 or 1',
      v_before - v_now;
  END IF;
  IF v_before - v_now = 1
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_delivery_worker') THEN
    RAISE EXCEPTION 'N6 revert dropped a role that was not freightos_delivery_worker';
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
