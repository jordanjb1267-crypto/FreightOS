-- ---------------------------------------------------------------------------
-- Revert N7-A — external transport foundation.
--
-- N7-A holds no delivered history: it performs no external transport, so nothing here records that
-- something irreversibly left. What it DOES hold is routing configuration a recipient authored, and
-- obligations recording that transport was owed — so the same acknowledgement doctrine 0034 uses
-- applies, for a smaller reason: an accidental downgrade should not silently erase a tenant's
-- destination registry.
--
-- The rollback contract:
--
--   * A downgrade to 0034 DESTROYS N7 configuration and obligations. There is no 0034-shaped place
--     to keep them.
--   * It does NOT alter what was authorized. N5-A grants, N5-B assignments, the N3 journal and every
--     N6 relation are untouched.
--   * It removes the one constraint 0035 added to an N6 table, and nothing else N6 owns.
--   * §2 refuses to run when N7 obligations exist unless the operator sets
--     `freightos.n7_destructive_revert` — the deliberate acknowledgement shape this repository uses.
--
-- Everything else is an exact one-step revert: five tables, three enums, one function, one role,
-- three permission keys, one borrowed N6 constraint, and nothing that belongs to N1-N6.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- §1. Capture the pre-revert state, so §6 can prove the revert was complete AND bounded.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  PERFORM set_config('freightos.n7_before_policies',
    (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public'), true);
  PERFORM set_config('freightos.n7_before_force',
    (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity), true);
  -- EXACT NAMES, cluster-global, and kept distinct from the per-database dependency inventory §6
  -- uses. A count cannot tell "the transport worker went" from "it stayed and something else went".
  PERFORM set_config('freightos.n7_before_role_names',
    (SELECT coalesce(string_agg(rolname, ',' ORDER BY rolname), '')
       FROM pg_roles WHERE rolname LIKE 'freightos%'), true);
  PERFORM set_config('freightos.n7_before_definers',
    (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('app', 'admin', 'authn') AND p.prosecdef), true);
  -- The N6 surface must come back exactly. Column set of every N6 relation, hashed.
  PERFORM set_config('freightos.n7_before_n6_cols',
    (SELECT md5(string_agg(c.relname || '.' || a.attname, ',' ORDER BY c.relname, a.attnum))
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname IN ('network_disclosure_subscriptions',
                          'network_disclosure_subscription_revocations',
                          'network_disclosure_routing_resolutions',
                          'network_disclosure_artifacts', 'network_disclosure_deliveries',
                          'network_delivery_attempts', 'network_disclosure_inbox')
        AND a.attnum > 0 AND NOT a.attisdropped), true);
END
$$;

-- ---------------------------------------------------------------------------
-- §2. Refuse to silently destroy transport configuration and obligations.
--
-- The guard has to be able to SEE what it protects. All five N7 relations are FORCE ROW LEVEL
-- SECURITY, and FORCE binds the table OWNER too — which is the migration authority running this
-- file. Their read policies name the two workers and the recipient application; none names the
-- migrator. A bare count therefore returns ZERO however much configuration exists, and returns it
-- without error: the guard would wave every downgrade through.
--
-- That is R-06 exactly — a guard blind to its own rows, failing OPEN. Same remedy: a temporary,
-- exactly-scoped policy that exists only for the statement that needs it.
-- ---------------------------------------------------------------------------

CREATE POLICY network_external_transports_n7_down_count ON public.network_external_transports
  FOR SELECT TO freightos_migrator USING (true);
CREATE POLICY network_transport_destinations_n7_down_count ON public.network_transport_destinations
  FOR SELECT TO freightos_migrator USING (true);

DO $$
DECLARE v_transports bigint; v_destinations bigint; v_ack text;
BEGIN
  SELECT count(*) INTO v_transports   FROM public.network_external_transports;
  SELECT count(*) INTO v_destinations FROM public.network_transport_destinations;
  v_ack := current_setting('freightos.n7_destructive_revert', true);
  IF (v_transports > 0 OR v_destinations > 0) AND coalesce(v_ack, '') <> 'acknowledged' THEN
    RAISE EXCEPTION
      'reverting 0035 would destroy % external transport obligation(s) and % destination(s); '
      'set freightos.n7_destructive_revert = ''acknowledged'' to proceed deliberately',
      v_transports, v_destinations;
  END IF;
END
$$;

DROP POLICY network_external_transports_n7_down_count ON public.network_external_transports;
DROP POLICY network_transport_destinations_n7_down_count ON public.network_transport_destinations;

-- ---------------------------------------------------------------------------
-- §3. Drop the policies 0035 placed on tables it does NOT own.
--
-- Named explicitly because those tables survive the revert: N6 and N1 are not ours to drop, only
-- the policies we put on them. A CASCADE would take whatever else happened to point there.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS network_disclosure_artifacts_transport_worker_read ON network_disclosure_artifacts;
DROP POLICY IF EXISTS network_disclosure_inbox_transport_worker_read     ON network_disclosure_inbox;
DROP POLICY IF EXISTS network_participants_transport_worker_read         ON network_participants;

-- ---------------------------------------------------------------------------
-- §4. Drop N7 tables, child before parent. No CASCADE.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS network_external_transport_attempts;
DROP TABLE IF EXISTS network_external_transport_permits;
DROP TABLE IF EXISTS network_external_transports;
DROP TABLE IF EXISTS network_transport_destination_revocations;
DROP TABLE IF EXISTS network_transport_destinations;

-- ---------------------------------------------------------------------------
-- §5. Drop the transition guard, the enums, and the constraint borrowed from N6.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS app.network_external_transport_transition();

DROP TYPE IF EXISTS app.network_external_transport_attempt_outcome;
DROP TYPE IF EXISTS app.network_external_transport_state;
DROP TYPE IF EXISTS app.network_transport_destination_kind;

-- The one N6 change 0035 made, removed exactly. `artifact_id` is the primary key, so this
-- constraint never added uniqueness — dropping it restores 0034's constraint set precisely.
ALTER TABLE network_disclosure_artifacts
  DROP CONSTRAINT IF EXISTS network_disclosure_artifacts_id_digest_key;

-- ---------------------------------------------------------------------------
-- §6. Remove the transport identity and its permission keys.
--
-- THE ROLE IS CLUSTER-GLOBAL, and this follows 0029's doctrine exactly — the doctrine 0034 proved
-- across four databases before it was trusted.
--
-- `DROP ROLE` consults `pg_shdepend` across EVERY database, and PostgreSQL offers no way to revoke
-- a privilege in a database you are not connected to. An unconditional drop is therefore not a
-- clean revert; it is a revert that fails on any cluster holding a staging copy or a parallel test
-- database. So: revoke everything IN THIS DATABASE, then ask whether anything anywhere else still
-- references the role. If it does, RETAIN and say so. The role is dropped by whichever database
-- releases it last. `DROP OWNED` and `CASCADE` appear nowhere.
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_elsewhere integer; v_holders text; v_owned integer;
  v_self oid := (SELECT oid FROM pg_database WHERE datname = current_database());
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_transport_worker') THEN
    RETURN;
  END IF;

  -- STEP A. Release everything this database granted.
  REVOKE ALL PRIVILEGES ON network_disclosure_artifacts FROM freightos_transport_worker;
  REVOKE ALL PRIVILEGES ON network_disclosure_inbox     FROM freightos_transport_worker;
  REVOKE ALL PRIVILEGES ON network_participants         FROM freightos_transport_worker;
  REVOKE ALL PRIVILEGES ON SCHEMA public, app           FROM freightos_transport_worker;
  EXECUTE format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM freightos_transport_worker',
                 current_database());

  -- STEP B. Owned relations are a deliberate stop: reassigning them silently would move objects
  -- this migration never created.
  SELECT count(*) INTO v_owned
    FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
   WHERE r.rolname = 'freightos_transport_worker';
  IF v_owned <> 0 THEN
    RAISE EXCEPTION
      '0035 down: freightos_transport_worker owns % relation(s). Reassign or drop them deliberately.',
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
   WHERE r.rolname = 'freightos_transport_worker'
     AND NOT (s.dbid = v_self
              OR (s.classid = 'pg_database'::regclass AND s.objid = v_self));

  -- STEP D. Retained, and said out loud. This is not a partial revert: this database is done.
  IF v_elsewhere <> 0 THEN
    RAISE NOTICE
      '0035 down: database % is fully reverted. freightos_transport_worker is RETAINED because % '
      'reference(s) remain in: %. The role is dropped by whichever database releases it last.',
      current_database(), v_elsewhere, v_holders;
    RETURN;
  END IF;

  EXECUTE 'DROP ROLE freightos_transport_worker';
END
$$;

-- The permission rows need the same temporary, exactly-scoped cleanup 0032/0034 use. `permissions`
-- is FORCE-RLS and the migrator holds no DELETE policy, so the delete would otherwise remove zero
-- rows and report success.
--
-- First refuse to strand a reference: a key still assigned must fail loudly rather than be deleted
-- out from under whoever holds it. `role_permissions` and `service_account_permissions` are
-- themselves FORCE-RLS with tenant-predicated policies, so the guards need their own scoped read or
-- they count zero and never fire — U-10's lesson, applied on the way down as well as up.
CREATE POLICY role_permissions_n7_down_scan ON public.role_permissions
  FOR SELECT TO freightos_migrator
  USING (permission_id IN (SELECT id FROM public.permissions
                            WHERE key IN ('network.transport_destination.create',
                                          'network.transport_destination.revoke',
                                          'network.transport_destination.read')));
CREATE POLICY service_account_permissions_n7_down_scan ON public.service_account_permissions
  FOR SELECT TO freightos_migrator
  USING (permission_id IN (SELECT id FROM public.permissions
                            WHERE key IN ('network.transport_destination.create',
                                          'network.transport_destination.revoke',
                                          'network.transport_destination.read')));

DO $$
DECLARE v_role integer; v_svc integer;
BEGIN
  SELECT count(*) INTO v_role
    FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key LIKE 'network.transport_destination.%';
  IF v_role <> 0 THEN
    RAISE EXCEPTION '0035 down: % role_permissions row(s) reference the N7 destination keys', v_role;
  END IF;

  SELECT count(*) INTO v_svc
    FROM service_account_permissions sp JOIN permissions p ON p.id = sp.permission_id
   WHERE p.key LIKE 'network.transport_destination.%';
  IF v_svc <> 0 THEN
    RAISE EXCEPTION
      '0035 down: % service_account_permissions row(s) reference the N7 destination keys', v_svc;
  END IF;
END
$$;

DROP POLICY role_permissions_n7_down_scan ON public.role_permissions;
DROP POLICY service_account_permissions_n7_down_scan ON public.service_account_permissions;

CREATE POLICY permissions_n7_down_cleanup ON public.permissions
  FOR DELETE TO freightos_migrator
  USING (
    key IN (
      'network.transport_destination.create',
      'network.transport_destination.revoke',
      'network.transport_destination.read'
    )
  );

DO $$
DECLARE v_deleted integer;
BEGIN
  -- Exact keys, never a LIKE: a broad predicate that matched something else would delete it, and
  -- the policy above would not stop it because the policy is a ceiling, not the intent.
  DELETE FROM permissions
   WHERE key IN (
     'network.transport_destination.create',
     'network.transport_destination.revoke',
     'network.transport_destination.read'
   );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 3 THEN
    RAISE EXCEPTION
      '0035 down: expected to delete exactly 3 N7 permission rows, deleted %. Aborting rather than '
      'leaving the catalog in a state nobody predicted.', v_deleted;
  END IF;
END
$$;

DROP POLICY permissions_n7_down_cleanup ON public.permissions;

-- ---------------------------------------------------------------------------
-- §7. Prove the revert is COMPLETE and BOUNDED.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_left text; v_types text; v_role int; v_keys int; v_now int; v_before int;
  v_names text; v_before_names text; v_removed text; v_added text;
BEGIN
  SELECT string_agg(c.relname, ',' ORDER BY c.relname) INTO v_left
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relname IN ('network_transport_destinations',
                       'network_transport_destination_revocations',
                       'network_external_transports',
                       'network_external_transport_permits',
                       'network_external_transport_attempts');
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'N7 revert incomplete, tables remain: %', v_left;
  END IF;

  SELECT string_agg(t.typname, ',' ORDER BY t.typname) INTO v_types
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'app'
     AND t.typname IN ('network_transport_destination_kind',
                       'network_external_transport_state',
                       'network_external_transport_attempt_outcome');
  IF v_types IS NOT NULL THEN
    RAISE EXCEPTION 'N7 revert incomplete, types remain: %', v_types;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'app' AND p.proname = 'network_external_transport_transition') THEN
    RAISE EXCEPTION 'N7 revert incomplete: app.network_external_transport_transition() remains';
  END IF;

  -- The one N6 constraint 0035 borrowed must be gone, so 0034's surface is restored exactly.
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname = 'network_disclosure_artifacts_id_digest_key') THEN
    RAISE EXCEPTION 'N7 revert incomplete: the borrowed N6 digest key remains';
  END IF;

  -- The role may legitimately REMAIN when another database references it. What must always be true
  -- is that THIS database holds nothing for it — BOTH pg_shdepend arms, matching step C.
  SELECT count(*) INTO v_role
    FROM pg_shdepend s JOIN pg_roles r ON r.oid = s.refobjid
   WHERE r.rolname = 'freightos_transport_worker'
     AND (s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
          OR (s.classid = 'pg_database'::regclass
              AND s.objid = (SELECT oid FROM pg_database WHERE datname = current_database())));
  IF v_role <> 0 THEN
    RAISE EXCEPTION
      'N7 revert incomplete: % reference(s) to freightos_transport_worker remain in this database',
      v_role;
  END IF;

  SELECT count(*) INTO v_keys FROM permissions WHERE key LIKE 'network.transport_destination.%';
  IF v_keys <> 0 THEN
    RAISE EXCEPTION 'N7 revert incomplete: % destination permission keys remain', v_keys;
  END IF;

  -- Bounded: exactly the policies 0035 created went — SEVENTEEN on the five N7 tables, plus the
  -- THREE it placed on relations it does not own (the artifact and inbox least-privilege reads and
  -- the narrowed participant registry read).
  v_before := current_setting('freightos.n7_before_policies')::int;
  SELECT count(*) INTO v_now FROM pg_policies WHERE schemaname = 'public';
  IF v_now <> v_before - 20 THEN
    RAISE EXCEPTION 'N7 revert removed % policies, expected exactly 20', v_before - v_now;
  END IF;

  v_before := current_setting('freightos.n7_before_force')::int;
  SELECT count(*) INTO v_now
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity;
  IF v_now <> v_before - 5 THEN
    RAISE EXCEPTION 'N7 revert changed FORCE-RLS tables by %, expected exactly 5', v_before - v_now;
  END IF;

  -- Exactly one role went, and it was ours — BY NAME, not by count. A count admits "one dropped
  -- while another appeared" and "some other freightos role went while ours was retained".
  SELECT coalesce(string_agg(rolname, ',' ORDER BY rolname), '') INTO v_names
    FROM pg_roles WHERE rolname LIKE 'freightos%';
  v_before_names := current_setting('freightos.n7_before_role_names');

  SELECT coalesce(string_agg(x, ','), '') INTO v_removed
    FROM (SELECT unnest(string_to_array(v_before_names, ',')) AS x
          EXCEPT SELECT unnest(string_to_array(v_names, ','))) removed;
  SELECT coalesce(string_agg(x, ','), '') INTO v_added
    FROM (SELECT unnest(string_to_array(v_names, ',')) AS x
          EXCEPT SELECT unnest(string_to_array(v_before_names, ','))) added;

  IF v_added <> '' THEN
    RAISE EXCEPTION 'N7 revert ADDED freightos role(s): %', v_added;
  END IF;
  IF v_removed NOT IN ('', 'freightos_transport_worker') THEN
    RAISE EXCEPTION
      'N7 revert removed freightos role(s) it did not create: % (only freightos_transport_worker may go)',
      v_removed;
  END IF;

  -- Nothing else moved.
  v_before := current_setting('freightos.n7_before_definers')::int;
  SELECT count(*) INTO v_now FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('app', 'admin', 'authn') AND p.prosecdef;
  IF v_now <> v_before THEN
    RAISE EXCEPTION 'N7 revert changed the SECURITY DEFINER inventory: % -> %', v_before, v_now;
  END IF;

  IF (SELECT md5(string_agg(c.relname || '.' || a.attname, ',' ORDER BY c.relname, a.attnum))
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND c.relname IN ('network_disclosure_subscriptions',
                           'network_disclosure_subscription_revocations',
                           'network_disclosure_routing_resolutions',
                           'network_disclosure_artifacts', 'network_disclosure_deliveries',
                           'network_delivery_attempts', 'network_disclosure_inbox')
         AND a.attnum > 0 AND NOT a.attisdropped)
     IS DISTINCT FROM current_setting('freightos.n7_before_n6_cols') THEN
    RAISE EXCEPTION 'N7 revert altered the N6 column set';
  END IF;
END
$$;
