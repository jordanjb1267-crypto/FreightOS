-- 0025 — the app authorization surface names its schema. Finding F-B.
--
-- WHAT THE REREVIEW FOUND. Migration 0023 §3 qualified the four invoker-rights scope functions and
-- the authorization core; 0024 qualified the admin boundary. Neither covered the rest of schema
-- `app`, and a catalog sweep at that head still found 44 unqualified references to authority
-- relations across 18 functions — 9 SECURITY DEFINER and 9 invoker-rights.
--
-- 0023's header claims the class is closed "in three independent layers … any one of them stops
-- the attack". Measured against that head, that claim was not true of these 18:
--
--   §1  TEMPORARY revoked from PUBLIC (migration 0019, on main).       Applied to everything.
--   §2  `pg_temp` pinned LAST in the definer's search_path (0019).     Applied to the 9 definers.
--                                                                     NOT applicable to the 9
--                                                                     invoker-rights functions:
--                                                                     they run under the CALLER's
--                                                                     search_path, and P-01 forbids
--                                                                     giving a SQL scope function a
--                                                                     proconfig because that blocks
--                                                                     inlining.
--   §3  Schema-qualified bodies.                                       Applied to NEITHER group.
--
-- So the invoker-rights half was protected by exactly ONE control, which is the thing 0023's own
-- rationale rejects: "this is an authority boundary and one control is not a boundary."
--
-- MEASURED, on a fresh PostgreSQL 16 cluster at the pre-0025 head, with a genuine verified binding
-- and NO search_path tampering of any kind — `pg_temp` is searched FIRST for relations whenever the
-- caller's path does not list it, and the caller's path is what an invoker-rights function uses:
--
--   Restore TEMPORARY to freightos_app — the PostgreSQL default for every database — then create an
--   empty `pg_temp.kill_switches`. `app.resolve_kill_switch_mode()` went from `suspended` to
--   `enabled`. An engaged kill switch became invisible to the resolver that decides whether work is
--   halted. Fail-open, on the Art. V.1 human override.
--
--   The same removal against `app.release_kill_switch()` — a SECURITY DEFINER, so it also needed
--   its §2 pin removed — released another tenant's kill switch outright.
--
--   The same removal against `admin.move_organization_node()`, which 0024 HAD qualified, still
--   answered `is not a user of tenant`. That is the control difference, isolated.
--
-- NOT EXPLOITABLE AT THE PRE-0025 HEAD, and this migration is not an incident response. §1 holds:
-- only `freightos_migrator` holds TEMPORARY, neither runtime role can reach it or become the
-- database owner, and neither can SET ROLE to any definer owner to unpin a search_path — all four
-- asserted below and in the regression suite. What was wrong was the claim, and the fact that a
-- single database-level GRANT stood between an engaged kill switch and a fail-open resolver.
-- Re-granting TEMPORARY is an ordinary-looking act — it is PostgreSQL's own default, and a
-- reporting or ETL role is the usual reason someone does it.
--
-- WHAT THIS CHANGES. Bodies only. Every predicate, volatility, security mode, owner, ACL and
-- search_path setting is preserved exactly; the sole textual delta in all 44 sites is a `public.`
-- prefix, asserted by a body-digest diff that strips the prefix and requires byte equality. In
-- particular no invoker-rights function gains a proconfig, so P-01 inlining is untouched — §2(c)
-- asserts it rather than leaving it to review.
--
-- WHY NOT ALSO PIN THE INVOKER-RIGHTS FUNCTIONS. Because P-01 measured the cost: a proconfig
-- blocks SQL function inlining, and the RLS policies resolve scope functions per statement on that
-- basis. Qualification buys the same correctness with no plan change. Migration 0019 §2b did pin
-- `app.user_has_permission` — that pin is preserved here untouched, since it is on main.

-- ---------------------------------------------------------------------------
-- §1. The bodies. Generated from pg_get_functiondef() at the pre-0025 head and qualified
-- mechanically, so no predicate is retyped by hand. 18 functions, 44 sites.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- Owner: freightos_audit_writer (1 function)
-- --------------------------------------------------------------------------

GRANT CREATE ON SCHEMA app TO freightos_audit_writer;

SET LOCAL ROLE freightos_audit_writer;

-- app.record_audit_event(text,text,text,uuid,uuid,text,jsonb)

CREATE OR REPLACE FUNCTION app.record_audit_event(p_event_type text, p_resource_type text, p_resource_id text, p_correlation_id uuid, p_causation_id uuid, p_purpose text, p_described jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant uuid   := app.current_tenant_id();
  v_actor  text   := app.current_actor_id();
  v_actor_type text;
  v_id uuid;
BEGIN
  -- Tenant comes from the session context the application established, never from an argument.
  -- A caller cannot name a tenant at all, so it cannot name one it does not hold or one that does
  -- not exist.
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'an audit event requires tenant context'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;
  IF v_actor IS NULL OR btrim(v_actor) = '' THEN
    RAISE EXCEPTION 'an audit event requires an actor'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  -- Actor type is DERIVED from the form of the actor id, not asserted alongside it. An agent
  -- cannot become a human by claiming to be one, here or anywhere else this pattern is used.
  v_actor_type := CASE
    WHEN v_actor ~ '^user:[0-9a-fA-F-]{36}$' THEN 'human'
    WHEN v_actor ~ '^system:'                THEN 'system'
    WHEN v_actor ~ '^service_account:'       THEN 'integration'
    WHEN v_actor ~ '^(agent|model):'         THEN 'agent'
    ELSE NULL
  END;
  IF v_actor_type IS NULL THEN
    RAISE EXCEPTION 'actor % is not of a recognised principal form', quote_literal(v_actor)
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  INSERT INTO public.audit_events (
    tenant_id, legal_entity_id, legal_authority_class, operating_context,
    actor_type, actor_id, event_type, resource_type, resource_id,
    correlation_id, causation_id, payload, created_by, purpose,
    -- Authoritative, and not parameters of this function:
    --   created_at   the column default, now(), so the timeline cannot be backdated;
    --   outcome      NULL, because a domain event asserts no authorization result;
    --   operation_class 'domain', hardcoded — this path can never mint a privileged claim.
    operation_class
  ) VALUES (
    v_tenant,
    app.current_legal_entity_id(),
    app.current_legal_authority_class(),
    app.current_operating_context(),
    v_actor_type, v_actor, p_event_type, p_resource_type, p_resource_id,
    coalesce(p_correlation_id, gen_random_uuid()), p_causation_id,
    jsonb_build_object(
      -- What the caller says the event is about. Nonauthoritative by construction, and nested so
      -- that it is explicitly distinguishable from provenance — ruling 3.
      'described', coalesce(p_described, '{}'::jsonb),
      -- What the boundary observed. Every value here is read from the connection, so a caller
      -- supplying 'connection' or 'session_user' in p_described cannot reach it.
      'provenance', jsonb_build_object(
        'session_user', session_user,
        'current_user', current_user,
        'client_addr',  coalesce(host(inet_client_addr()), 'local'),
        'backend_start', (SELECT backend_start FROM pg_stat_activity WHERE pid = pg_backend_pid())
      )
    ),
    v_actor, p_purpose, 'domain'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END
$function$;

RESET ROLE;

REVOKE CREATE ON SCHEMA app FROM freightos_audit_writer;



-- --------------------------------------------------------------------------
-- Owner: freightos_hierarchy_owner (6 functions)
-- --------------------------------------------------------------------------

GRANT CREATE ON SCHEMA app TO freightos_hierarchy_owner;

SET LOCAL ROLE freightos_hierarchy_owner;

-- app.engage_kill_switch(app.kill_switch_scope,text,app.kill_switch_mode,text)

CREATE OR REPLACE FUNCTION app.engage_kill_switch(p_scope app.kill_switch_scope, p_scope_ref text, p_mode app.kill_switch_mode, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant uuid := app.current_tenant_id();
  v_human uuid  := app.current_human_principal();
  v_id uuid;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'engaging a kill switch requires tenant context'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;
  -- Art. V.1 — engaging and releasing are both reserved to humans. Derived, not asserted.
  IF v_human IS NULL THEN
    RAISE EXCEPTION 'only an active human principal may engage a kill switch'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;
  -- System and legal-plane halts are the control plane's, not a tenant's.
  IF p_scope IN ('system', 'legal_plane') THEN
    RAISE EXCEPTION 'scope % may only be engaged by the control plane', p_scope
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.kill_switches
    (tenant_id, scope, scope_ref, mode, reason, engaged_by, engaged_by_type, created_by)
  VALUES (v_tenant, p_scope, p_scope_ref, p_mode, p_reason,
          'user:' || v_human, 'human', 'user:' || v_human)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$function$;

-- app.kill_switch_before_write()

CREATE OR REPLACE FUNCTION app.kill_switch_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_owner uuid;
BEGIN
  IF NEW.scope <> 'legal_entity' THEN
    RETURN NEW;
  END IF;

  -- Shape first, and by returning rather than raising. A BEFORE trigger runs ahead of the CHECK
  -- constraints, so casting a malformed scope_ref here would replace kill_switches_scope_ref_type's
  -- specific complaint with "invalid input syntax for type uuid". The constraint is the better
  -- error; this steps out of its way.
  IF NEW.scope_ref !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     OR NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id INTO v_owner
    FROM public.legal_entities WHERE id = NEW.scope_ref::uuid;

  -- A switch naming an entity that does not exist halts nothing and harms only the tenant that
  -- recorded it, and kill_switches carries no foreign key to legal_entities — the table predates
  -- them and is deliberately cross-tenant. Adding one is a schema change beyond this finding, so
  -- the unknown case passes and the CROSS-TENANT case, which is the defect, does not.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_owner IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION
      'kill switch names legal entity %, which belongs to tenant % and not to %',
      NEW.scope_ref, v_owner, NEW.tenant_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END
$function$;

-- app.organization_node_after_insert()

CREATE OR REPLACE FUNCTION app.organization_node_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  -- Already held, as above — F-03.
  PERFORM app.lock_organization_hierarchy(NEW.tenant_id);

  INSERT INTO public.organization_node_closure
    (tenant_id, ancestor_id, descendant_id, depth, created_by, updated_by)
  VALUES (NEW.tenant_id, NEW.id, NEW.id, 0, NEW.created_by, NEW.updated_by);

  IF NEW.parent_id IS NOT NULL THEN
    INSERT INTO public.organization_node_closure
      (tenant_id, ancestor_id, descendant_id, depth, created_by, updated_by)
    SELECT NEW.tenant_id, c.ancestor_id, NEW.id, c.depth + 1, NEW.created_by, NEW.updated_by
      FROM public.organization_node_closure c
     WHERE c.tenant_id = NEW.tenant_id
       AND c.descendant_id = NEW.parent_id;
  END IF;

  RETURN NULL;
END
$function$;

-- app.organization_node_after_move()

CREATE OR REPLACE FUNCTION app.organization_node_after_move()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_level integer;
BEGIN
  -- Already held: the BEFORE trigger on this same row took it in this same transaction, and an
  -- advisory lock is re-entrant within a transaction. Restated because this function's correctness
  -- depends on it and the dependency is otherwise invisible from here — F-03.
  PERFORM app.lock_organization_hierarchy(NEW.tenant_id);

  -- Detach: drop every closure row linking the moving subtree to an ancestor outside it.
  DELETE FROM public.organization_node_closure
   WHERE tenant_id = NEW.tenant_id
     AND descendant_id IN (
       SELECT descendant_id FROM public.organization_node_closure
        WHERE tenant_id = NEW.tenant_id AND ancestor_id = NEW.id)
     AND ancestor_id NOT IN (
       SELECT descendant_id FROM public.organization_node_closure
        WHERE tenant_id = NEW.tenant_id AND ancestor_id = NEW.id);

  -- Reattach: every ancestor of the new parent, crossed with every node of the moving subtree.
  IF NEW.parent_id IS NOT NULL THEN
    INSERT INTO public.organization_node_closure
      (tenant_id, ancestor_id, descendant_id, depth, created_by, updated_by)
    SELECT NEW.tenant_id, sup.ancestor_id, sub.descendant_id, sup.depth + sub.depth + 1,
           NEW.updated_by, NEW.updated_by
      FROM public.organization_node_closure sup
      JOIN public.organization_node_closure sub ON sub.tenant_id = sup.tenant_id
     WHERE sup.tenant_id = NEW.tenant_id
       AND sup.descendant_id = NEW.parent_id
       AND sub.ancestor_id = NEW.id;
  END IF;

  -- Re-depth the descendants breadth-first, so each level's parent is already correct when the
  -- BEFORE trigger recomputes the child from it.
  FOR v_level IN 1 .. 16 LOOP
    UPDATE public.organization_nodes n
       SET depth = NEW.depth + c.depth,
           updated_by = NEW.updated_by
      FROM public.organization_node_closure c
     WHERE c.tenant_id = NEW.tenant_id
       AND c.ancestor_id = NEW.id
       AND c.depth = v_level
       AND c.descendant_id = n.id
       AND n.tenant_id = NEW.tenant_id;
    EXIT WHEN NOT FOUND;
  END LOOP;

  RETURN NULL;
END
$function$;

-- app.organization_node_before_write()

CREATE OR REPLACE FUNCTION app.organization_node_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_parent_type  app.organization_node_type;
  v_parent_depth integer;
  v_parent_tenant uuid;
  v_subtree_height integer;
BEGIN
  -- Before anything is read. A root insert takes it too: one_root_per_tenant is the same
  -- read-then-write shape, and serialising it turns a race into a queue.
  PERFORM app.lock_organization_hierarchy(NEW.tenant_id);

  -- Archiving is refused while the subtree below is still live — F-13, R2-02.
  --
  -- Evaluated before any node-type branch, so it applies to every organization node type there is:
  -- enterprise root, legal entity, business unit, region, terminal, fleet, cost centre, and
  -- anything a later migration adds. There is no node the rule steps around.
  --
  -- Nothing stopped a node being archived with active descendants under it, and the result is a
  -- subtree that is live by its own status and orphaned by its parent's. Every scope predicate in
  -- the schema resolves through the closure, which is a structural relation and carries no status
  -- at all, so the descendants kept their authority while the node that governs them no longer
  -- claimed to exist. Reading the tree afterwards says one thing; asking the closure says another.
  --
  -- REFUSE_ARCHIVE_WHILE_ACTIVE_DESCENDANTS_EXIST, per the owner decision. The alternative —
  -- cascading the archive down the subtree — is a single statement that silently changes the
  -- authority of rows the caller did not name, and it is not built here. The operator archives
  -- from the leaves up, which is the same order they would have to reason about anyway.
  IF TG_OP = 'UPDATE' AND NEW.status = 'archived' AND OLD.status <> 'archived' THEN
    DECLARE
      v_live integer;
    BEGIN
      SELECT count(*) INTO v_live
        FROM public.organization_node_closure c
        JOIN public.organization_nodes n
          ON n.tenant_id = c.tenant_id AND n.id = c.descendant_id
       WHERE c.tenant_id = NEW.tenant_id
         AND c.ancestor_id = NEW.id
         AND c.depth > 0
         AND n.status <> 'archived';

      IF v_live > 0 THEN
        RAISE EXCEPTION
          'organization node % may not be archived: % descendant node(s) below it are still '
          'active. Archive from the leaves up — a node''s authority reaches its subtree through '
          'the closure, which carries no status of its own.',
          NEW.id, v_live
          USING ERRCODE = 'integrity_constraint_violation';
      END IF;
    END;
  END IF;


  -- The root early return comes AFTER the archive check, not before it — R2-02.
  --
  -- It used to come first, and a root has no parent, so an enterprise root took this return before
  -- anything looked below it. Archiving the root of a tenant therefore always succeeded, whatever
  -- was underneath: the legal entities, regions and terminals stayed active while the node that
  -- governs them stopped claiming to exist. That is the exact state F-13 exists to prevent, reached
  -- by the one node where it matters most — and it was reachable only at the root, which is why a
  -- test on a region passed while the invariant did not hold.
  --
  -- Nothing below this line concerns a root: depth is 0, there is no parent to type-check against,
  -- and there is no move to test for a cycle.
  IF NEW.parent_id IS NULL THEN
    NEW.depth := 0;
    RETURN NEW;
  END IF;

  SELECT node_type, depth, tenant_id
    INTO v_parent_type, v_parent_depth, v_parent_tenant
    FROM public.organization_nodes
   WHERE id = NEW.parent_id;

  -- This trigger is a definer, so every tenant IS visible to it and a cross-tenant parent reaches
  -- the explicit comparison below rather than being reported as a row that does not exist. That is
  -- the honest answer, and it was always the comparison that mattered: the control-plane path came
  -- through here too, and row-level security never refused it.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization node parent % does not exist', NEW.parent_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_parent_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'organization node parent % belongs to a different tenant', NEW.parent_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NOT app.is_permitted_node_parent(NEW.node_type, v_parent_type) THEN
    RAISE EXCEPTION 'organization node type % may not be a child of %',
      NEW.node_type, v_parent_type
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- Cycle prevention. A move is a cycle exactly when the proposed parent already sits inside the
  -- moving node's own subtree, which the closure answers in one lookup.
  IF TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1 FROM public.organization_node_closure
     WHERE tenant_id = NEW.tenant_id
       AND ancestor_id = NEW.id
       AND descendant_id = NEW.parent_id
  ) THEN
    RAISE EXCEPTION 'organization hierarchy cycle rejected: % already sits below %',
      NEW.parent_id, NEW.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  NEW.depth := v_parent_depth + 1;

  -- The bound is on the tree, not on this row: moving a tall subtree under a deep parent must be
  -- refused even though the moved node itself would still be within bounds.
  SELECT coalesce(max(depth), 0) INTO v_subtree_height
    FROM public.organization_node_closure
   WHERE tenant_id = NEW.tenant_id AND ancestor_id = NEW.id;

  IF NEW.depth + v_subtree_height > 16 THEN
    RAISE EXCEPTION
      'organization hierarchy depth bound of 16 exceeded: node would sit at depth % with a '
      'subtree % deep', NEW.depth, v_subtree_height
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END
$function$;

-- app.release_kill_switch(uuid)

CREATE OR REPLACE FUNCTION app.release_kill_switch(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant uuid := app.current_tenant_id();
  v_human uuid  := app.current_human_principal();
  v_scope app.kill_switch_scope;
  v_owner uuid;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'releasing a kill switch requires tenant context'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;
  IF v_human IS NULL THEN
    RAISE EXCEPTION 'only an active human principal may release a kill switch'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  SELECT scope, tenant_id INTO v_scope, v_owner
    FROM public.kill_switches WHERE id = p_id AND released_at IS NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- A tenant may not release a halt aimed at it by anyone else. System and legal-plane switches
  -- carry no tenant at all and are the control plane's exclusively; a tenant-scoped switch is
  -- releasable only by the tenant that owns it, and only if that tenant is the caller's.
  IF v_scope IN ('system', 'legal_plane') OR v_owner IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'kill switch % is not releasable by this tenant', p_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.kill_switches
     SET released_at = now(), released_by = 'user:' || v_human, released_by_type = 'human'
   WHERE id = p_id;
  RETURN true;
END
$function$;

RESET ROLE;

REVOKE CREATE ON SCHEMA app FROM freightos_hierarchy_owner;



-- --------------------------------------------------------------------------
-- Owner: freightos_identity_guard (2 functions)
-- --------------------------------------------------------------------------

GRANT CREATE ON SCHEMA app TO freightos_identity_guard;

SET LOCAL ROLE freightos_identity_guard;

-- app.reject_membership_role_self_elevation()

CREATE OR REPLACE FUNCTION app.reject_membership_role_self_elevation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := app.current_user_id();
  v_user_id uuid;
  v_found boolean;
BEGIN
  -- A verified platform actor is provisioning, not elevating: it holds no membership, so it has
  -- no authority to widen. Verification is the connection's own identity plus the closed
  -- allowlist — neither of which a session can assert. Everything else still names a person.
  IF v_actor IS NULL THEN
    IF app.is_verified_platform_actor() THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'identity change refused: actor "%" is not a user, and a change to who holds authority '
      'must name the person making it — Constitution Art. I.5',
      coalesce(app.current_actor_id(), 'null')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Read as the definer, so the answer does not depend on what the caller can see.
  SELECT user_id, true INTO v_user_id, v_found
    FROM public.memberships WHERE tenant_id = NEW.tenant_id AND id = NEW.membership_id;

  -- No membership means the row points at nothing. The foreign key will say so in a moment; until
  -- then this guard has no evidence either way and refuses rather than assuming innocence.
  IF NOT coalesce(v_found, false) THEN
    RAISE EXCEPTION
      'identity change refused: membership % is not present in tenant %',
      NEW.membership_id, NEW.tenant_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_user_id IS DISTINCT FROM v_actor THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'self-elevation refused: actor % may not grant itself a role',
      app.current_actor_id()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'self-elevation refused: actor % may only revoke its own role assignment',
      app.current_actor_id()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END
$function$;

-- app.reject_role_permission_self_elevation()

CREATE OR REPLACE FUNCTION app.reject_role_permission_self_elevation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := app.current_user_id();
BEGIN
  -- A verified platform actor is provisioning, not elevating: it holds no membership, so it has
  -- no authority to widen. Verification is the connection's own identity plus the closed
  -- allowlist — neither of which a session can assert. Everything else still names a person.
  IF v_actor IS NULL THEN
    IF app.is_verified_platform_actor() THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'identity change refused: actor "%" is not a user, and a change to who holds authority '
      'must name the person making it — Constitution Art. I.5',
      coalesce(app.current_actor_id(), 'null')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Any membership at all, live or revoked. Widening a role you once held and could hold again is
  -- the same manoeuvre one step removed.
  --
  -- Read as the definer. This is the query that used to be filtered for the caller, and the reason
  -- a caller standing at a narrow organization node could add a permission to a role it holds:
  -- its own membership was out of node scope, so this EXISTS was false and the guard stood down.
  IF NOT EXISTS (
    SELECT 1
      FROM public.memberships m
      JOIN membership_roles mr ON mr.tenant_id = m.tenant_id AND mr.membership_id = m.id
     WHERE m.tenant_id = NEW.tenant_id
       AND m.user_id = v_actor
       AND mr.role_id = NEW.role_id
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION
      'self-elevation refused: actor % may not add a permission to a role it holds',
      app.current_actor_id()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL) THEN
    RAISE EXCEPTION
      'self-elevation refused: actor % may only revoke a permission on a role it holds',
      app.current_actor_id()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END
$function$;

RESET ROLE;

REVOKE CREATE ON SCHEMA app FROM freightos_identity_guard;



-- --------------------------------------------------------------------------
-- Owner: freightos_migrator (9 functions)
-- --------------------------------------------------------------------------

-- app.governing_legal_entity_id(uuid,uuid)

CREATE OR REPLACE FUNCTION app.governing_legal_entity_id(p_tenant_id uuid, p_organization_node_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT le.id
    FROM public.organization_node_closure c
    JOIN public.legal_entities le
      ON le.tenant_id = c.tenant_id
     AND le.organization_node_id = c.ancestor_id
   WHERE c.tenant_id = p_tenant_id
     AND c.descendant_id = p_organization_node_id
   ORDER BY c.depth ASC
   LIMIT 1
$function$;

-- app.has_active_carrier_appointment(uuid,uuid,text,timestamp with time zone)

CREATE OR REPLACE FUNCTION app.has_active_carrier_appointment(p_tenant_id uuid, p_legal_entity_id uuid, p_carrier_reference text, p_as_of timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.carrier_appointments
     WHERE tenant_id = p_tenant_id
       AND legal_entity_id = p_legal_entity_id
       AND carrier_reference = p_carrier_reference
       AND status = 'active'
       AND revoked_at IS NULL
       AND effective_from <= p_as_of
       AND (effective_to IS NULL OR effective_to > p_as_of)
  )
$function$;

-- app.legal_entity_before_write()

CREATE OR REPLACE FUNCTION app.legal_entity_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_node_type app.organization_node_type;
BEGIN
  SELECT node_type INTO v_node_type
    FROM public.organization_nodes
   WHERE tenant_id = NEW.tenant_id AND id = NEW.organization_node_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization node % does not exist in tenant %',
      NEW.organization_node_id, NEW.tenant_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_node_type <> 'legal_entity' THEN
    RAISE EXCEPTION 'a legal entity must attach to a legal_entity node, not a % node', v_node_type
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$function$;

-- app.membership_role_before_write()

CREATE OR REPLACE FUNCTION app.membership_role_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_membership_node uuid;
  v_role_node uuid;
BEGIN
  SELECT organization_node_id INTO v_membership_node
    FROM public.memberships WHERE tenant_id = NEW.tenant_id AND id = NEW.membership_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership % does not exist in tenant %', NEW.membership_id, NEW.tenant_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT organization_node_id INTO v_role_node
    FROM public.roles WHERE tenant_id = NEW.tenant_id AND id = NEW.role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'role % does not exist in tenant %', NEW.role_id, NEW.tenant_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_node_closure
     WHERE tenant_id = NEW.tenant_id
       AND ancestor_id = v_role_node
       AND descendant_id = v_membership_node
  ) THEN
    RAISE EXCEPTION
      'role scoped to node % does not govern membership node %', v_role_node, v_membership_node
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END
$function$;

-- app.policy_binding_before_write()

CREATE OR REPLACE FUNCTION app.policy_binding_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_governing uuid;
  v_inherited_category app.protected_control_category;
  v_stricter_ancestor record;
BEGIN
  v_governing := app.governing_legal_entity_id(NEW.tenant_id, NEW.organization_node_id);

  -- IS DISTINCT FROM, not <>: NULL must equal NULL here. Above the legal-entity boundary the
  -- column is required to be NULL, and below it is required to match exactly. There is no third
  -- case, which is what keeps the exception from widening into "nullable when convenient".
  IF NEW.legal_entity_id IS DISTINCT FROM v_governing THEN
    RAISE EXCEPTION
      'policy binding legal_entity_id % does not match the legal entity governing node % (%)',
      NEW.legal_entity_id, NEW.organization_node_id, v_governing
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- Protectedness is inherited, not asserted — F-08.
  --
  -- The weakening guard below fired only when the incoming row said protected_category IS NOT
  -- NULL, and that column is supplied by the same caller the guard exists to constrain. Writing a
  -- child binding with the category left NULL therefore skipped the check entirely and weakened a
  -- protected control freely — no error, no trace, and the resolved policy afterwards is simply
  -- looser than the ancestor set. The one thing a caller had to do to escape a control it may not
  -- weaken was decline to mention that it may not weaken it.
  --
  -- So the category is taken from the hierarchy. If any strict ancestor has declared this control
  -- protected, the incoming row must name that same category, and a mismatch — including an
  -- absence — is refused rather than corrected, so the attempt is visible in the same way every
  -- other refusal here is. A node may still be the first to declare a control protected; what it
  -- may not do is be the first to stop.
  --
  -- The lookup is not visibility-dependent: policy_bindings_read is scoped by tenant alone, with no
  -- organization-node term, so a caller at any node sees every binding in its own tenant including
  -- its ancestors'. A node-scoped read policy here would make this guard fail open the way the
  -- self-elevation guards did before F-01, and a test asserts the read policy stays as it is.
  IF NEW.revoked_at IS NULL THEN
    SELECT pb.protected_category INTO v_inherited_category
      FROM public.policy_bindings pb
      JOIN public.organization_node_closure c
        ON c.tenant_id = pb.tenant_id
       AND c.ancestor_id = pb.organization_node_id
     WHERE pb.tenant_id = NEW.tenant_id
       AND c.descendant_id = NEW.organization_node_id
       AND c.depth > 0
       AND pb.policy_key = NEW.policy_key
       AND pb.control_key = NEW.control_key
       AND pb.revoked_at IS NULL
       AND pb.status = 'active'
       AND pb.protected_category IS NOT NULL
     ORDER BY c.depth ASC
     LIMIT 1;

    IF v_inherited_category IS NOT NULL
       AND NEW.protected_category IS DISTINCT FROM v_inherited_category THEN
      RAISE EXCEPTION
        'protected control "%" is declared % by an ancestor binding; this binding names % and may '
        'not change or omit it',
        NEW.control_key, v_inherited_category,
        coalesce(NEW.protected_category::text, 'no category')
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- A child may tighten a protected control. It may not loosen one. Rejected at write time, so
  -- the attempt is visible and refused, rather than filtered out silently at read time.
  IF NEW.protected_category IS NOT NULL AND NEW.revoked_at IS NULL THEN
    SELECT pb.organization_node_id, pb.restrictiveness, pb.control_value
      INTO v_stricter_ancestor
      FROM public.policy_bindings pb
      JOIN public.organization_node_closure c
        ON c.tenant_id = pb.tenant_id
       AND c.ancestor_id = pb.organization_node_id
     WHERE pb.tenant_id = NEW.tenant_id
       AND c.descendant_id = NEW.organization_node_id
       AND c.depth > 0                       -- strict ancestors only
       AND pb.policy_key = NEW.policy_key
       AND pb.control_key = NEW.control_key
       AND pb.revoked_at IS NULL
       AND pb.status = 'active'
       AND pb.restrictiveness > NEW.restrictiveness
     ORDER BY pb.restrictiveness DESC
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION
        'protected control "%" may not be weakened: node % inherits restrictiveness % from node '
        '% and this binding proposes %',
        NEW.control_key, NEW.organization_node_id, v_stricter_ancestor.restrictiveness,
        v_stricter_ancestor.organization_node_id, NEW.restrictiveness
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END
$function$;

-- app.resolve_effective_policy(uuid,uuid,timestamp with time zone)

CREATE OR REPLACE FUNCTION app.resolve_effective_policy(p_tenant_id uuid, p_organization_node_id uuid, p_as_of timestamp with time zone)
 RETURNS TABLE(policy_key text, control_key text, control_value text, restrictiveness integer, source_node_id uuid, source_depth integer, direction app.policy_binding_direction, protected_category app.protected_control_category)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT DISTINCT ON (pb.policy_key, pb.control_key)
         pb.policy_key,
         pb.control_key,
         pb.control_value,
         pb.restrictiveness,
         pb.organization_node_id,
         c.depth,
         pb.direction,
         pb.protected_category
    FROM public.policy_bindings pb
    JOIN public.organization_node_closure c
      ON c.tenant_id = pb.tenant_id
     AND c.ancestor_id = pb.organization_node_id
   WHERE pb.tenant_id = p_tenant_id
     AND c.descendant_id = p_organization_node_id
     AND pb.status = 'active'
     AND pb.revoked_at IS NULL
     AND pb.effective_from <= p_as_of
     AND (pb.effective_to IS NULL OR pb.effective_to > p_as_of)
   -- Most restrictive wins. A tie goes to the nearest node, so an equally strict local override
   -- is reported as the source rather than a distant ancestor that happens to agree.
   ORDER BY pb.policy_key, pb.control_key, pb.restrictiveness DESC, c.depth ASC
$function$;

-- app.resolve_kill_switch_mode(uuid,text,text,text,text,text,uuid,app.operating_context)

CREATE OR REPLACE FUNCTION app.resolve_kill_switch_mode(p_tenant_id uuid DEFAULT NULL::uuid, p_legal_plane text DEFAULT NULL::text, p_workflow_id text DEFAULT NULL::text, p_agent_id text DEFAULT NULL::text, p_tool_id text DEFAULT NULL::text, p_integration_id text DEFAULT NULL::text, p_legal_entity_id uuid DEFAULT NULL::uuid, p_operating_context app.operating_context DEFAULT NULL::app.operating_context)
 RETURNS app.kill_switch_mode
 LANGUAGE sql
 STABLE
AS $function$
  SELECT coalesce(
    (
      SELECT mode
      FROM public.kill_switches
      WHERE released_at IS NULL
        AND (
          -- Global by design: a network-wide or plane-wide halt belongs to no tenant.
          scope = 'system'
          OR (scope = 'legal_plane'       AND scope_ref = p_legal_plane)
          OR (scope = 'operating_context' AND scope_ref = p_operating_context::text)
          -- Everything else is a tenant's own subject, and the tenant is part of the match rather
          -- than merely of the row — RC-H. Matching scope_ref alone made tenant_id decorative:
          -- an identifier chosen by one tenant halted another's identically-named subject.
          OR (p_tenant_id IS NOT NULL AND tenant_id = p_tenant_id AND (
                 (scope = 'tenant'       AND scope_ref = p_tenant_id::text)
              OR (scope = 'workflow'     AND scope_ref = p_workflow_id)
              OR (scope = 'agent'        AND scope_ref = p_agent_id)
              OR (scope = 'tool'         AND scope_ref = p_tool_id)
              OR (scope = 'integration'  AND scope_ref = p_integration_id)
              OR (scope = 'legal_entity' AND scope_ref = p_legal_entity_id::text)
          ))
        )
      -- Enum declaration order is restrictiveness order, so DESC is "most restrictive wins".
      ORDER BY mode DESC
      LIMIT 1
    ),
    'enabled'::app.kill_switch_mode)
$function$;

-- app.service_account_has_permission(uuid,uuid,text,timestamp with time zone)

CREATE OR REPLACE FUNCTION app.service_account_has_permission(p_tenant_id uuid, p_service_account_id uuid, p_permission_key text, p_as_of timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.service_accounts sa
      JOIN service_account_permissions sap
        ON sap.tenant_id = sa.tenant_id AND sap.service_account_id = sa.id
      JOIN public.permissions p ON p.id = sap.permission_id
     WHERE sa.tenant_id = p_tenant_id
       AND sa.id = p_service_account_id
       AND p.key = p_permission_key

       AND sa.status = 'active' AND sa.revoked_at IS NULL
       AND sa.effective_from <= p_as_of
       AND (sa.effective_to IS NULL OR sa.effective_to > p_as_of)

       AND sap.revoked_at IS NULL
       AND sap.effective_from <= p_as_of
       AND (sap.effective_to IS NULL OR sap.effective_to > p_as_of)

       AND EXISTS (
         SELECT 1 FROM service_account_credentials sac
          WHERE sac.tenant_id = sa.tenant_id
            AND sac.service_account_id = sa.id
            AND sac.status = 'active' AND sac.revoked_at IS NULL
            AND sac.effective_from <= p_as_of
            AND (sac.effective_to IS NULL OR sac.effective_to > p_as_of)
       )
  )
$function$;

-- app.user_has_permission(uuid,uuid,text,timestamp with time zone)

CREATE OR REPLACE FUNCTION app.user_has_permission(p_tenant_id uuid, p_user_id uuid, p_permission_key text, p_as_of timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.memberships m
      JOIN membership_roles mr
        ON mr.tenant_id = m.tenant_id AND mr.membership_id = m.id
      JOIN public.roles r
        ON r.tenant_id = mr.tenant_id AND r.id = mr.role_id
      JOIN public.role_permissions rp
        ON rp.tenant_id = r.tenant_id AND rp.role_id = r.id
      JOIN public.permissions p
        ON p.id = rp.permission_id
      JOIN public.users u
        ON u.tenant_id = m.tenant_id AND u.id = m.user_id
     WHERE m.tenant_id = p_tenant_id
       AND m.user_id = p_user_id
       AND p.key = p_permission_key

       AND u.status = 'active' AND u.revoked_at IS NULL
       AND u.effective_from <= p_as_of
       AND (u.effective_to IS NULL OR u.effective_to > p_as_of)

       AND m.status = 'active' AND m.revoked_at IS NULL
       AND m.effective_from <= p_as_of
       AND (m.effective_to IS NULL OR m.effective_to > p_as_of)

       AND mr.revoked_at IS NULL
       AND mr.effective_from <= p_as_of
       AND (mr.effective_to IS NULL OR mr.effective_to > p_as_of)

       AND r.status = 'active' AND r.revoked_at IS NULL
       AND r.effective_from <= p_as_of
       AND (r.effective_to IS NULL OR r.effective_to > p_as_of)

       AND rp.revoked_at IS NULL
       AND rp.effective_from <= p_as_of
       AND (rp.effective_to IS NULL OR rp.effective_to > p_as_of)
  )
$function$;


-- ---------------------------------------------------------------------------
-- §2. Assertions. Measured from the catalog after the fact, not from this file's own text.
-- ---------------------------------------------------------------------------

DO $assert$
DECLARE
  v_bad text;
  v_n integer;
BEGIN
  -- (a) No function in app or admin references an authority relation unqualified any more.
  SELECT string_agg(DISTINCT f, ', ') INTO v_bad
    FROM (
      SELECT n.nspname || '.' || p.proname AS f
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace,
             LATERAL unnest(ARRAY['users','memberships','role_permissions','user_roles','roles',
                                  'permissions','tenants','organization_nodes',
                                  'organization_node_closure','legal_entities','service_accounts',
                                  'kill_switches','policy_bindings','policies',
                                  'carrier_appointments','audit_events','outbox_messages']) AS r(rel)
       WHERE n.nspname IN ('app', 'admin')
         AND p.prosrc ~* ('(?<![.[:alnum:]_])(FROM|JOIN|INTO|UPDATE)[[:space:]]+' || r.rel || '\M')
    ) s;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0025 §2(a): unqualified authority-relation references remain in %', v_bad;
  END IF;

  -- (b) Every SECURITY DEFINER in app and admin still pins pg_temp LAST. A CREATE OR REPLACE that
  --     dropped the SET clause would silently undo 0019 §2 for the whole surface.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.prosecdef AND n.nspname IN ('app', 'admin')
     AND p.proconfig::text IS DISTINCT FROM '{"search_path=pg_catalog, public, pg_temp"}';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0025 §2(b): definer % lost the pg_temp-last pin', v_bad;
  END IF;

  -- (c) P-01 survives: no invoker-rights function in app gained a proconfig, except the one
  --     migration 0019 §2b deliberately pinned on main. A proconfig blocks SQL function inlining,
  --     which is what the per-statement scope resolution in the RLS policies depends on.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE NOT p.prosecdef AND n.nspname = 'app' AND p.proconfig IS NOT NULL
     AND p.proname <> 'user_has_permission';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0025 §2(c): invoker-rights function % gained a proconfig — P-01', v_bad;
  END IF;

  -- (d) No function called by an RLS policy carries a proconfig, stated over the policies
  --     themselves rather than over a list this migration maintains.
  SELECT string_agg(DISTINCT p.proname, ', ') INTO v_bad
    FROM pg_policy pol,
         LATERAL regexp_matches(
           coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
           coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''),
           'app\.([a-z0-9_]+)\(', 'g') AS m
    JOIN pg_proc p ON p.proname = m[1]
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'app'
   WHERE NOT p.prosecdef AND p.proconfig IS NOT NULL;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0025 §2(d): RLS policy function % carries a proconfig — P-01', v_bad;
  END IF;

  -- (e) Ownership is unchanged: the borrowed CREATE on schema app was handed back.
  SELECT string_agg(g, ', ') INTO v_bad
    FROM unnest(ARRAY['freightos_hierarchy_owner','freightos_identity_guard',
                      'freightos_audit_writer']) AS g
   WHERE has_schema_privilege(g, 'app', 'CREATE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0025 §2(e): % still holds CREATE on schema app', v_bad;
  END IF;

  -- (f) Layer 1 is still standing, and is still out of reach. This migration adds a layer; it must
  --     not have cost one. Asserted for the reason the rereview exists: a denial has to be denied
  --     for the intended reason, and "PUBLIC cannot create a temp table" is that reason.
  IF has_database_privilege('public', current_database(), 'TEMPORARY') THEN
    RAISE EXCEPTION '0025 §2(f): PUBLIC holds TEMPORARY on the database';
  END IF;
  SELECT string_agg(c, ', ') INTO v_bad
    FROM unnest(ARRAY['freightos_app','freightos_admin']) AS c
   WHERE has_database_privilege(c, current_database(), 'TEMPORARY');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0025 §2(f): runtime role % holds TEMPORARY on the database', v_bad;
  END IF;

  -- (g) No runtime connection role can reach a definer owner and unpin a search_path.
  SELECT string_agg(DISTINCT c || ' -> ' || o, ', ') INTO v_bad
    FROM (
      SELECT c, pg_get_userbyid(p.proowner) AS o
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
             unnest(ARRAY['freightos_app','freightos_admin']) AS c
       WHERE p.prosecdef AND n.nspname IN ('app', 'admin')
    ) s
   WHERE pg_has_role(c, o, 'USAGE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '0025 §2(g): % can become a definer owner', v_bad;
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'app' AND p.prosrc ~ 'public\.';
  RAISE NOTICE '0025: % functions in schema app now name their schema', v_n;
END
$assert$;
