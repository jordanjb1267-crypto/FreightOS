-- N4 — transactional transport intent.
--
-- One durable row per accepted network event, meaning exactly one thing:
--
--   TRANSPORT IS OWED FOR THIS ACCEPTED EVENT.
--
-- That is the complete N4 state model. There is no status column, no claim, no attempt counter, no
-- retry timestamp, no error field and no published marker, because there is no publisher — and a
-- status enum whose values are all unreachable is a guess frozen into a migration. N6 introduces
-- publisher state when a publisher, claim semantics, a retry policy and an acknowledgement meaning
-- all actually exist to give those values meaning.
--
-- THE ARTIFACTS THIS DOES NOT COLLAPSE (ADR-N0008, restated for N4):
--
--   network_events            canonical immutable network/domain fact
--   network_transport_intents immutable durable promise that the fact must eventually enter the
--                             authorized transport layer
--   outbox_events             legacy v1.2 transport artifact — untouched
--   audit_events              security/governance evidence — untouched
--
-- WHY A NEW TABLE RATHER THAN `outbox_events`. Four database-level facts reject a network event
-- from the legacy outbox outright, and none is a matter of preference: its `event_type` CHECK is
-- `^rig\.freight\.`, so a `com.rigreceipts.network.*` type cannot be stored; its `tenant_id` is
-- NOT NULL while a network event's is nullable, and NULL means the asserting organization is
-- external, which ADR-N0011 calls the normal case; its RLS predicate is `tenant_id =
-- app.current_tenant_id()`, under which a NULL-tenant row is unreachable by any tenant-bound
-- session; and it requires the v1.2 legal quartet (`legal_authority_class`, `operating_context`,
-- `actor_id`, `purpose`, the last SQL-enforced) which a network event does not carry and which
-- cannot be invented without making a false claim in the audit path. A fifth fact is a security
-- one: `freightos_app` holds INSERT and UPDATE on `outbox_events`, and N3 removed exactly that
-- privilege from the journal on purpose.
--
-- N4 PERFORMS NO PUBLICATION. No broker, no queue, no webhook, no HTTP, no egress of any kind, and
-- no publisher role. `TRANSPORT IS OWED` is not `AUTHORIZED FOR EXTERNAL DISCLOSURE`: an intent row
-- says a debt exists, never that the event is public, network-visible, counterparty-visible or
-- consented. N5 owns disclosure governance, and N4 is structurally incapable of pre-empting it.

-- ---------------------------------------------------------------------------
-- §1. The table.
--
-- Two columns, and the shortness is the design. `network_event_id` is BOTH the primary key and the
-- foreign key: with exactly one intent per event, a second opaque identifier would have no
-- lifecycle — it could not be referenced by anything (no subscriber rows exist), could not be
-- reused (one per event), and would create a second candidate identity for one fact. Making the
-- event id the key also makes "one intent per event" a property of the schema rather than of a
-- constraint someone could drop, and makes an orphan intent unrepresentable.
--
-- NO PAYLOAD, and deliberately no copy of anything. The journal is permanently immutable, so a
-- reference can never dangle or drift and duplication buys no consistency it does not already
-- have. Projection and redaction are decided at routing time from the subscriber's policy
-- (v1.4 `11_…` §6), so a snapshot frozen at acceptance would have to be re-projected anyway and
-- would be wrong the moment policy changed. A second copy would also double the sensitive-data
-- surface and create a second retention question while the first is still unanswered.
--
-- NO `tenant_id`. The intent carries no payload and has no tenant-facing read path, so duplicating
-- the isolation discriminator would duplicate the isolation decision without a reader to serve.
-- A future publisher's authorization is governed explicitly by N5/N6, never inferred from metadata
-- copied here for convenience.
-- ---------------------------------------------------------------------------

CREATE TABLE network_transport_intents (
  network_event_id uuid PRIMARY KEY,

  -- Server-owned transport metadata. The caller never supplies it, and it does not stand in for
  -- either event time fact: `occurred_at` is when the world changed and `recorded_at` is when
  -- FreightOS accepted it. This is when the debt was recorded, which is a third thing.
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT network_transport_intents_event_exists
    FOREIGN KEY (network_event_id) REFERENCES network_events (event_id)
);

COMMENT ON TABLE network_transport_intents IS
  'N4 transport intent. Row existence means transport is owed for the referenced accepted network '
  'event, and nothing more. Not a delivery record, not a publication receipt, and not a disclosure '
  'authorization. No publisher exists in N4.';

-- ---------------------------------------------------------------------------
-- §2. Immutable after creation.
--
-- N4 holds no publisher state, so there is nothing here that may legitimately change. Rather than
-- leave the table quietly mutable until N6 arrives to constrain it, it is sealed now with the
-- established shared rejector — the same posture `audit_events` has carried since 0003 and the
-- journal since 0029. Reopening it later is then an explicit, reviewable act.
--
-- TRUNCATE needs its own statement-level trigger: row-level triggers never fire for it, and FORCE
-- ROW LEVEL SECURITY does not apply because there is no TRUNCATE policy type. The §4 revokes reach
-- the runtime roles, but an owner's rights are not held through the ACL and cannot be revoked away,
-- and `freightos_migrator` owns this table because it runs the migrations.
-- ---------------------------------------------------------------------------

CREATE TRIGGER network_transport_intents_no_update
  BEFORE UPDATE ON network_transport_intents
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER network_transport_intents_no_delete
  BEFORE DELETE ON network_transport_intents
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

CREATE TRIGGER network_transport_intents_no_truncate
  BEFORE TRUNCATE ON network_transport_intents
  FOR EACH STATEMENT EXECUTE FUNCTION app.reject_mutation();

-- ---------------------------------------------------------------------------
-- §3. Row-level security, and the one policy the write path actually needs.
--
-- THE POLICY SET IS DERIVED FROM WHO CAN REACH THIS TABLE AT ALL, not from a template. The trigger
-- in §5 runs with INVOKER rights, so it inserts as whichever role inserted the network event — and
-- that set has exactly one member. `network_events` carries FORCE ROW LEVEL SECURITY and its only
-- INSERT policy is `network_events_writer_insert TO freightos_event_writer`, so even
-- `freightos_migrator`, which owns the table and holds the INSERT privilege, is refused by RLS with
-- "new row violates row-level security policy". That was verified against PostgreSQL 16 rather than
-- assumed. No owner or migrator insertion policy is therefore justified here: there is no path by
-- which the trigger can run as the owner, and a policy added for a caller that cannot exist is
-- privilege with nothing to lose.
--
-- NO READ POLICY, ANYWHERE. No publisher exists, so no runtime role needs to see an intent. The
-- read boundary is N6's to open, together with the publisher identity that will be governed to use
-- it. Leaving it closed now means N6 must open it deliberately rather than inherit it.
--
-- NO UPDATE POLICY. NO DELETE POLICY. There is no claim, retry or publish state to change.
-- ---------------------------------------------------------------------------

ALTER TABLE network_transport_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_transport_intents FORCE ROW LEVEL SECURITY;

-- Row validity is established by the primary key, the foreign key and the trigger that is the only
-- thing that writes here — not by a policy predicate, which can evaluate none of them.
CREATE POLICY network_transport_intents_writer_insert ON network_transport_intents FOR INSERT
  TO freightos_event_writer
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- §4. Privileges — exactly one additive capability.
--
-- The writer gains INSERT on this table and nothing else, anywhere. It does not gain SELECT: it
-- never reads an intent, and the conflict-safe insert in §5 needs no read to be idempotent. It
-- gains no publisher capability, and its journal reach is unchanged at two of twenty-three columns.
-- ---------------------------------------------------------------------------

GRANT INSERT ON network_transport_intents TO freightos_event_writer;

-- Belt as well as braces, and targeted rather than schema-wide: the triggers in §2 raise, and the
-- privileges are not granted in the first place. Neither alone is sufficient — a superuser bypasses
-- privileges, and a trigger can be disabled by the owner.
REVOKE SELECT, UPDATE, DELETE, TRUNCATE ON network_transport_intents FROM freightos_event_writer;
REVOKE ALL PRIVILEGES ON network_transport_intents FROM freightos_app;
REVOKE ALL PRIVILEGES ON network_transport_intents FROM freightos_control_plane;

-- ---------------------------------------------------------------------------
-- §5. The atomic coupling.
--
-- This is the central N4 correctness property: an accepted network event and its transport intent
-- commit together or neither commits. Putting it in a trigger rather than in the acceptance
-- component is what makes it a property of the database instead of a property of application
-- discipline — there is no code path, application, maintenance, test or interactive, that can
-- commit an event without recording the debt it creates.
--
-- AFTER INSERT, deliberately. The event row exists by the time this runs, and PostgreSQL does not
-- fire an AFTER ROW trigger for a row suppressed by `ON CONFLICT DO NOTHING` — which is exactly how
-- `acceptNetworkEvent` resolves a retransmission — so re-acceptance creates no second intent
-- without needing to detect that it was a retransmission.
--
-- `ON CONFLICT DO NOTHING` is kept regardless, and it is not redundant decoration: it makes intent
-- creation idempotent on its own terms rather than as a consequence of the trigger's timing, so
-- that a future retiming, a savepoint retry, or a second coupling path cannot silently turn a
-- duplicate into an error. Idempotent acceptance must not become non-idempotent because of a
-- transport concern.
--
-- THE CONFLICT TARGET IS OMITTED DELIBERATELY, and the reason is a privilege boundary rather than
-- a style preference. `ON CONFLICT (network_event_id) DO NOTHING` — naming the arbiter — requires
-- SELECT on the table, because inferring the arbiter index lets the statement read the conflicting
-- row. The bare `ON CONFLICT DO NOTHING` requires only INSERT. Verified against PostgreSQL 16 on
-- this exact table: with INSERT alone the targeted form fails "permission denied for table
-- network_transport_intents" while the untargeted form reaches the foreign key, as it should.
--
-- Granting the writer SELECT to buy the targeted syntax would be widening the acceptance identity's
-- read reach to satisfy a spelling, and the writer's inability to read this table is a designed
-- property: it creates a debt it cannot enumerate. The untargeted form is exact here because the
-- table has exactly ONE unique constraint — the primary key — so "any conflict" and "a conflict on
-- network_event_id" are the same set. That is asserted in §6 rather than assumed, because the
-- equivalence would quietly stop holding if a second unique constraint were ever added.
--
-- INVOKER RIGHTS. A SECURITY DEFINER here would let the definer's authority, not the caller's,
-- decide that transport is owed — and N3 added zero definer functions precisely so that the
-- network path holds no privileged code. N4 adds zero as well. The relation is schema-qualified
-- because it is RLS-enabled and therefore protected under migration 0027's guard.
--
-- IT DOES ONE LOCAL INSERT AND NOTHING ELSE. No network I/O, no HTTP, no broker call, no queue
-- publish, no filesystem effect, no authorization derivation, and no branch on `classification`,
-- `organization_id`, `source`, `subject`, `data` or `event_class`. It copies one canonical
-- identifier. A trigger may create a local durable row; it may never publish externally.
-- ---------------------------------------------------------------------------

CREATE FUNCTION app.network_event_transport_intent() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.network_transport_intents (network_event_id)
  VALUES (NEW.event_id)
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END
$$;

COMMENT ON FUNCTION app.network_event_transport_intent() IS
  'N4 atomic coupling: records that transport is owed for a newly accepted network event, in the '
  'same transaction as the event. Invoker rights. One local INSERT, no external effect of any kind.';

CREATE TRIGGER network_events_transport_intent
  AFTER INSERT ON network_events
  FOR EACH ROW EXECUTE FUNCTION app.network_event_transport_intent();

-- ---------------------------------------------------------------------------
-- §6. Assert the addition did not weaken anything.
-- ---------------------------------------------------------------------------

-- The table shape is the ruling. Any extra column is a future decision smuggled into N4.
DO $$
DECLARE v_cols text;
BEGIN
  SELECT string_agg(a.attname, ',' ORDER BY a.attnum) INTO v_cols
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
   WHERE c.relname = 'network_transport_intents' AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_cols IS DISTINCT FROM 'network_event_id,created_at' THEN
    RAISE EXCEPTION '0030: network_transport_intents must carry exactly two columns, found: %', v_cols;
  END IF;
END
$$;

-- Identity and integrity: the event id is the key, and an intent without an accepted event is
-- unrepresentable. Both halves are asserted because dropping either is the mutation that matters.
DO $$
DECLARE v_pk text; v_fk text;
BEGIN
  SELECT string_agg(a.attname, ',' ORDER BY x.ord) INTO v_pk
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY x(att, ord)
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = x.att
   WHERE c.relname = 'network_transport_intents' AND con.contype = 'p';
  IF v_pk IS DISTINCT FROM 'network_event_id' THEN
    RAISE EXCEPTION '0030: primary key must be exactly (network_event_id), found: %', v_pk;
  END IF;

  SELECT con.conname INTO v_fk
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_class f ON f.oid = con.confrelid
   WHERE c.relname = 'network_transport_intents' AND con.contype = 'f'
     AND f.relname = 'network_events';
  IF v_fk IS NULL THEN
    RAISE EXCEPTION '0030: the intent must reference network_events — no foreign key found';
  END IF;
END
$$;

-- EXACTLY ONE UNIQUE ARBITER. The coupling function omits the conflict target so that it needs no
-- SELECT privilege (§5), which is exact only while the primary key is the sole thing a conflict can
-- arise on. A second unique or exclusion constraint would silently widen "do nothing" to cover a
-- violation that ought to raise, so the equivalence is pinned here rather than trusted.
DO $$
DECLARE v_detail text;
BEGIN
  SELECT string_agg(format('%s(%s)', con.conname, con.contype), ', ' ORDER BY con.conname)
    INTO v_detail
    FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
   WHERE c.relname = 'network_transport_intents' AND con.contype IN ('p', 'u', 'x');
  IF v_detail IS DISTINCT FROM 'network_transport_intents_pkey(p)' THEN
    RAISE EXCEPTION '0030: the intent table must carry exactly one unique arbiter (its primary '
      'key), because the coupling function''s ON CONFLICT names no target — found: %',
      coalesce(v_detail, '(none)');
  END IF;
END
$$;

-- The writer must NOT hold SELECT here. This is the property the untargeted ON CONFLICT exists to
-- preserve: the acceptance identity records a debt it cannot enumerate.
DO $$
BEGIN
  IF has_table_privilege('freightos_event_writer', 'network_transport_intents', 'SELECT') THEN
    RAISE EXCEPTION '0030: freightos_event_writer must not hold SELECT on network_transport_intents';
  END IF;
  IF NOT has_table_privilege('freightos_event_writer', 'network_transport_intents', 'INSERT') THEN
    RAISE EXCEPTION '0030: freightos_event_writer must hold INSERT on network_transport_intents';
  END IF;
END
$$;

-- N4 adds no privileged code. N3 added none either, and the count is asserted rather than assumed
-- because a definer function is the cheapest way to accidentally acquire authority.
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proname = 'network_event_transport_intent' AND p.prosecdef;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0030: the coupling function must run with invoker rights, found % definer', v_n;
  END IF;
END
$$;

-- RLS is on AND forced. Enabled-but-not-forced would exempt the owner, which is the one identity
-- that can already reach the table without a grant.
DO $$
DECLARE r record;
BEGIN
  SELECT relrowsecurity, relforcerowsecurity INTO r
    FROM pg_class WHERE relname = 'network_transport_intents';
  IF NOT r.relrowsecurity OR NOT r.relforcerowsecurity THEN
    RAISE EXCEPTION '0030: network_transport_intents needs ENABLE and FORCE row level security '
      '(enabled=% forced=%)', r.relrowsecurity::text, r.relforcerowsecurity::text;
  END IF;
END
$$;

-- Exactly one policy, and it is an INSERT policy for the writer. A read policy appearing here is
-- N6's boundary opening early; an UPDATE or DELETE policy is a state machine appearing early.
DO $$
DECLARE v_detail text; v_n integer;
BEGIN
  SELECT count(*), string_agg(format('%s(cmd=%s)', p.polname, p.polcmd), ', ' ORDER BY p.polname)
    INTO v_n, v_detail
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname = 'network_transport_intents';
  IF v_n <> 1 OR v_detail IS DISTINCT FROM 'network_transport_intents_writer_insert(cmd=a)' THEN
    RAISE EXCEPTION '0030: expected exactly one INSERT policy on the intent table, found %: %',
      v_n, coalesce(v_detail, '(none)');
  END IF;
END
$$;

-- The writer's reach on this table is INSERT and nothing else, and no other role holds anything.
-- THE OWNER IS EXCLUDED BY LOOKUP, NOT BY NAME. Ownership rights are not held through the ACL and
-- cannot be revoked — which is why §2 seals the table with triggers instead — but the owner is
-- whoever ran the migration, and that is not always `freightos_migrator`: the kill-switch
-- compatibility regression drives the sequence as `postgres`, and hard-coding the deployment role
-- here failed there for a reason that had nothing to do with the property being asserted.
DO $$
DECLARE v_detail text; v_owner text;
BEGIN
  SELECT pg_get_userbyid(c.relowner) INTO v_owner
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'network_transport_intents';

  SELECT string_agg(format('%s=%s', grantee, privilege_type), ', ' ORDER BY grantee, privilege_type)
    INTO v_detail
    FROM information_schema.table_privileges
   WHERE table_name = 'network_transport_intents' AND grantee <> v_owner;
  IF v_detail IS DISTINCT FROM 'freightos_event_writer=INSERT' THEN
    RAISE EXCEPTION '0030: the intent table must grant exactly INSERT to freightos_event_writer '
      '(owner % excluded), found: %', v_owner, coalesce(v_detail, '(none)');
  END IF;
END
$$;

-- The append-only seal, present and correctly shaped. `tgtype & 32` is the TRUNCATE bit and
-- `tgtype & 1` clear means statement level — a row-level trigger would never fire for TRUNCATE.
DO $$
DECLARE v_detail text;
BEGIN
  SELECT string_agg(t.tgname, ',' ORDER BY t.tgname) INTO v_detail
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'network_transport_intents' AND NOT t.tgisinternal;
  IF v_detail IS DISTINCT FROM
     'network_transport_intents_no_delete,network_transport_intents_no_truncate,'
     'network_transport_intents_no_update' THEN
    RAISE EXCEPTION '0030: the intent table must carry exactly the three append-only guards, '
      'found: %', coalesce(v_detail, '(none)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'network_transport_intents'
       AND t.tgname = 'network_transport_intents_no_truncate'
       AND (t.tgtype & 32) <> 0 AND (t.tgtype & 1) = 0
  ) THEN
    RAISE EXCEPTION '0030: the TRUNCATE guard must be a statement-level TRUNCATE trigger';
  END IF;
END
$$;

-- The coupling trigger, present and correctly timed. AFTER + row level is what makes re-acceptance
-- produce no second intent, so the timing is part of the contract rather than a detail.
DO $$
DECLARE t record;
BEGIN
  SELECT tg.tgtype INTO t
    FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
   WHERE c.relname = 'network_events' AND tg.tgname = 'network_events_transport_intent';
  IF t IS NULL THEN
    RAISE EXCEPTION '0030: the transport-intent coupling trigger is missing from network_events';
  END IF;
  -- bit 0 = row level, bit 1 = BEFORE, bit 2 = INSERT.
  IF (t.tgtype & 1) = 0 OR (t.tgtype & 2) <> 0 OR (t.tgtype & 4) = 0 THEN
    RAISE EXCEPTION '0030: the coupling trigger must be AFTER INSERT FOR EACH ROW (tgtype=%)',
      t.tgtype;
  END IF;
END
$$;

-- Migration 0027's guard: this table is RLS-enabled and therefore a protected relation, so an
-- unqualified read or write of it inside an app/admin/authn function would be resolvable through
-- `pg_temp`. Zero rows is the contract.
DO $$
DECLARE v_n integer; v_detail text;
BEGIN
  SELECT count(*), string_agg(format('%s->%s', function_name, relation_name), ', ')
    INTO v_n, v_detail FROM app.unqualified_authority_reads();
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0030: % unqualified read(s) of a protected relation — %', v_n, v_detail;
  END IF;
END
$$;

-- The journal is unchanged. Pinned by NAME rather than count, because any add-plus-remove pair
-- satisfies a count. The only permitted N4 attachment is the coupling trigger itself.
DO $$
DECLARE v_cols text; v_policies text;
BEGIN
  SELECT string_agg(a.attname, ',' ORDER BY a.attnum) INTO v_cols
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
   WHERE c.relname = 'network_events' AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_cols IS DISTINCT FROM
     'event_id,type,source,subject,occurred_at,organization_id,organization_type,classification,'
     'schema_ref,envelope_schema_ref,data,event_class,correlation_id,causation_id,workflow_id,'
     'trace_id,evidence_refs,recorded_at,accepted_by,tenant_id,event_fingerprint,'
     'corrects_event_id,replacement_event_id' THEN
    RAISE EXCEPTION '0030: network_events columns changed — %', v_cols;
  END IF;

  SELECT string_agg(p.polname, ',' ORDER BY p.polname) INTO v_policies
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relname = 'network_events';
  IF v_policies IS DISTINCT FROM
     'network_events_read,network_events_writer_identity_read,network_events_writer_insert' THEN
    RAISE EXCEPTION '0030: network_events policies changed — %', v_policies;
  END IF;
END
$$;

-- The legacy v1.2 outbox and the audit ledger are untouched, pinned the same way. ADR-N0007's
-- non-regression rule: neither may be altered by a network change.
DO $$
DECLARE v_outbox text; v_audit text; v_type_check text;
BEGIN
  SELECT string_agg(a.attname, ',' ORDER BY a.attnum) INTO v_outbox
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
   WHERE c.relname = 'outbox_events' AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_outbox IS DISTINCT FROM
     'id,tenant_id,legal_entity_id,legal_authority_class,operating_context,event_id,event_type,'
     'event_source,event_subject,event_time,actor_id,correlation_id,causation_id,payload,status,'
     'attempts,claimed_at,claim_expires_at,published_at,last_error,created_at,created_by,purpose' THEN
    RAISE EXCEPTION '0030: outbox_events columns changed — %', v_outbox;
  END IF;

  -- The v1.2 namespace boundary specifically: this is what keeps a native network event out of the
  -- legacy outbox, so relaxing it is the convergence mutation N4 must fail on.
  SELECT pg_get_constraintdef(con.oid) INTO v_type_check
    FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
   WHERE c.relname = 'outbox_events' AND con.conname = 'outbox_events_event_type_check';
  IF v_type_check IS NULL OR v_type_check NOT LIKE '%rig\\.freight\\.%' THEN
    RAISE EXCEPTION '0030: the legacy outbox type-namespace CHECK is missing or relaxed — %',
      coalesce(v_type_check, '(absent)');
  END IF;

  -- Pinned by NAME, the same way the outbox is, and for the same reason: a weaker check (does the
  -- table still have a `tenant_id`?) passes through almost any real change, which was demonstrated
  -- rather than supposed — a mutation that relaxed this table's own `event_type` namespace CHECK
  -- went undetected against the looser assertion this replaces.
  SELECT string_agg(a.attname, ',' ORDER BY a.attnum) INTO v_audit
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
   WHERE c.relname = 'audit_events' AND a.attnum > 0 AND NOT a.attisdropped;
  IF v_audit IS DISTINCT FROM
     'id,tenant_id,legal_entity_id,legal_authority_class,operating_context,actor_type,actor_id,'
     'event_type,resource_type,resource_id,correlation_id,causation_id,policy_version,payload,'
     'created_at,created_by,operation_class,purpose,outcome' THEN
    RAISE EXCEPTION '0030: audit_events columns changed — %', coalesce(v_audit, '(absent)');
  END IF;

  -- Its type-namespace CHECK, explicitly. `audit_events` and `outbox_events` carry the same
  -- constraint text, so an edit aimed at one lands on the other unless both are pinned.
  SELECT pg_get_constraintdef(con.oid) INTO v_type_check
    FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
   WHERE c.relname = 'audit_events' AND con.conname = 'audit_events_event_type_check';
  IF v_type_check IS NULL OR v_type_check NOT LIKE '%rig\\.freight\\.%' THEN
    RAISE EXCEPTION '0030: the audit type-namespace CHECK is missing or relaxed — %',
      coalesce(v_type_check, '(absent)');
  END IF;
END
$$;

-- The writer role itself is unchanged. N4's only authorized widening is the table grant in §4;
-- an attribute change or a new membership edge would be a different kind of change entirely.
DO $$
DECLARE r record; v_edges integer;
BEGIN
  SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication, rolcanlogin INTO r
    FROM pg_roles WHERE rolname = 'freightos_event_writer';
  IF r IS NULL THEN
    RAISE EXCEPTION '0030: freightos_event_writer is missing — N3 is not intact';
  END IF;
  IF r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication
     OR NOT r.rolcanlogin THEN
    RAISE EXCEPTION '0030: freightos_event_writer attributes changed (rolsuper=% rolbypassrls=% '
      'rolcreatedb=% rolcreaterole=% rolreplication=% rolcanlogin=%)',
      r.rolsuper::text, r.rolbypassrls::text, r.rolcreatedb::text, r.rolcreaterole::text,
      r.rolreplication::text, r.rolcanlogin::text;
  END IF;

  SELECT count(*) INTO v_edges
    FROM pg_auth_members am
    JOIN pg_roles m ON m.oid = am.member
    JOIN pg_roles rr ON rr.oid = am.roleid
   WHERE rr.rolname = 'freightos_event_writer' OR m.rolname = 'freightos_event_writer';
  IF v_edges <> 1 THEN
    RAISE EXCEPTION '0030: freightos_event_writer must keep exactly its one creator edge, found %',
      v_edges;
  END IF;
END
$$;
