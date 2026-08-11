-- Revert 0030 — remove the transport-intent table and the coupling that creates it.
--
-- N4 is additive and entirely database-local: it created one table, three append-only triggers, one
-- policy, one function, one trigger on `network_events`, and one additive grant to an existing
-- role. It created NO PostgreSQL role, so unlike 0029 this revert has no cluster-global object to
-- reason about — nothing here is shared with another database, and the whole removal is local.
--
-- NO CASCADE. NO DROP OWNED. Every object is dropped by name, dependants first, so a dependency
-- that should not exist raises instead of being swept away silently.
--
-- The additive INSERT grant needs no explicit REVOKE: it is an ACL entry on the table, and it
-- ceases to exist with the table. Revoking it separately would be a no-op that reads as though the
-- role kept something it does not.

-- ---------------------------------------------------------------------------
-- §1. The coupling, removed first.
--
-- The trigger goes before the function it calls, and both go before the table the function writes,
-- so that at no point does a live trigger reference a missing object. After this statement an
-- accepted network event creates no transport debt, which is precisely what reverting N4 means.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS network_events_transport_intent ON network_events;

DROP FUNCTION IF EXISTS app.network_event_transport_intent();

-- ---------------------------------------------------------------------------
-- §2. The table. Its policy, its three append-only triggers, its primary key, its foreign key and
--     its ACL all belong to it and go with it.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS network_transport_intents;

-- ---------------------------------------------------------------------------
-- §3. Assert the revert restored N3 exactly.
-- ---------------------------------------------------------------------------

-- Nothing N4 created may survive, including the trigger on a table N4 did not own.
DO $$
DECLARE v_detail text;
BEGIN
  SELECT string_agg(what, ', ') INTO v_detail FROM (
    SELECT 'table network_transport_intents' AS what
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = 'network_transport_intents' AND n.nspname = 'public'
    UNION ALL
    SELECT 'function app.network_event_transport_intent'
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.proname = 'network_event_transport_intent' AND n.nspname = 'app'
    UNION ALL
    SELECT 'trigger network_events_transport_intent'
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'network_events' AND t.tgname = 'network_events_transport_intent'
  ) s;
  IF v_detail IS NOT NULL THEN
    RAISE EXCEPTION '0030 down: N4 objects survived the revert — %', v_detail;
  END IF;
END
$$;

-- No reference to the dropped table may remain in any ACL, policy or default ACL. A stale grant is
-- how a revert leaves a role holding something on an object nobody can see any more.
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM information_schema.table_privileges
   WHERE table_name = 'network_transport_intents';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0030 down: % privilege entr(ies) still name network_transport_intents', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
   WHERE array_to_string(d.defaclacl, ',') LIKE '%freightos_event_writer%'
     AND n.nspname = 'public' AND d.defaclobjtype = 'r';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0030 down: a default ACL still names freightos_event_writer';
  END IF;
END
$$;

-- N3 is intact and functional. The journal keeps its columns, its policies, its own triggers and
-- the writer keeps exactly the reach 0029 gave it — reverting transport must not disturb truth.
DO $$
DECLARE v_cols text; v_triggers text; v_privs text;
BEGIN
  SELECT string_agg(a.attname, ',' ORDER BY a.attnum) INTO v_cols
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
   WHERE c.relname = 'network_events' AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_cols IS DISTINCT FROM
     'event_id,type,source,subject,occurred_at,organization_id,organization_type,classification,'
     'schema_ref,envelope_schema_ref,data,event_class,correlation_id,causation_id,workflow_id,'
     'trace_id,evidence_refs,recorded_at,accepted_by,tenant_id,event_fingerprint,'
     'corrects_event_id,replacement_event_id' THEN
    RAISE EXCEPTION '0030 down: network_events columns changed — %', v_cols;
  END IF;

  SELECT string_agg(t.tgname, ',' ORDER BY t.tgname) INTO v_triggers
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'network_events' AND NOT t.tgisinternal;
  IF v_triggers IS DISTINCT FROM
     'network_events_acceptance,network_events_no_delete,network_events_no_truncate,'
     'network_events_no_update' THEN
    RAISE EXCEPTION '0030 down: network_events triggers are not the N3 set — %', v_triggers;
  END IF;

  SELECT string_agg(format('%s=%s', grantee, privilege_type), ', ' ORDER BY grantee, privilege_type)
    INTO v_privs
    FROM information_schema.table_privileges
   WHERE table_name = 'network_events' AND grantee = 'freightos_event_writer';
  IF v_privs IS DISTINCT FROM 'freightos_event_writer=INSERT' THEN
    RAISE EXCEPTION '0030 down: the writer''s journal privileges changed — %',
      coalesce(v_privs, '(none)');
  END IF;
END
$$;

-- The role inventory is exactly what it was. N4 created no role, so the revert must drop none —
-- the failure this guards against is a revert that helpfully tidies away a role another migration
-- owns. Stated as a biconditional over the one role N4 touched at all.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freightos_event_writer') THEN
    RAISE EXCEPTION '0030 down: freightos_event_writer was dropped — N4 does not own that role';
  END IF;
END
$$;
