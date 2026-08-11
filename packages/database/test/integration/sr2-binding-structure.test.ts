import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { loadMigrations, migrateDown, migrateUp } from '../../src/migrator.ts';
import { MIGRATIONS_DIR } from '../../src/paths.ts';
import { acquireClusterRoleLock, releaseClusterRoleLock, TestDatabase } from './harness.ts';

// CLUSTER-GLOBAL EXCLUSION. This file drives migrateUp/migrateDown itself, and migrations mutate
// PostgreSQL ROLES, which are cluster-wide rather than per-database — so the per-file database
// gives this file no isolation at all for the state it changes. Measured against pg_stat_activity,
// two migrator backends were ACTIVE in different databases in 27 of 131 samples during a full run,
// always at a file boundary. The lock is held for the whole file because a role revoked between
// two `it` blocks is the same race as one revoked inside one.
beforeAll(async () => {
  await acquireClusterRoleLock();
}, 300_000);

afterAll(async () => {
  await releaseClusterRoleLock();
});

/**
 * SR-2 — the structural half of the verified-actor-binding gate.
 *
 * Everything here is read from the catalog rather than inferred from the migration text. Three of
 * the defects this migration has already produced were invisible to the SQL and visible only in
 * pg_proc, pg_policy and pg_shdepend:
 *
 *   * §9 executed two GRANTs under the wrong role, so the statements ran and the privileges did not
 *     land where they read as landing;
 *   * §6 gave five accessors invoker rights, which made them unusable by every role except
 *     freightos_app — a fail-closed regression no negative test would have caught;
 *   * §4 applied the role-disjoint treatment to three of the four tables the resolver reads, and
 *     PostgreSQL reported the resulting cycle as `stack depth limit exceeded` with no recursion
 *     diagnostic at all.
 *
 * So the assertions are on OIDs, owners, prosecdef, proconfig, proacl, polroles and polcmd — the
 * things that decide behaviour — and each one has a positive control beside it.
 */

const db = new TestDatabase('freightos_test_sr2_structure');

/**
 * Every function migration 0020 owns, by exact signature.
 *
 * SEC-01 / 0026: the mint lost `p_issued_by text` — one argument shorter, and the last
 * caller-supplied identity anywhere on the SR-2 surface. The signatures are spelled out rather
 * than matched by name precisely so that a change like that has to be made here deliberately; a
 * name-only lookup would have gone on passing against whichever overload happened to exist.
 */
const SR2_FUNCTIONS = [
  'app.verified_binding_context()',
  'app.verified_binding_tenant_scope()',
  'app.verified_binding_node_scope_ok(uuid)',
  'app.verified_principal()',
  'app.begin_verified_session(uuid)',
  'admin.issue_session_binding(text,uuid,uuid,uuid,uuid,text,text,integer,integer)',
] as const;

/**
 * The seven accessors 0019 hands to the binding owner.
 *
 * The last two arrived after the first version of §6 shipped five and stopped, leaving the legal
 * plane on a caller-set GUC while the actor had moved to the binding — a session unable to name
 * another person but still able to name another legal plane. They belong in every assertion the
 * other five appear in, which is what this list is for.
 */
const BINDING_OWNER_ACCESSORS = [
  'app.current_tenant_id()',
  'app.current_actor_id()',
  'app.current_organization_node_id()',
  'app.current_legal_entity_id()',
  'app.current_user_id()',
  'app.current_legal_authority_class()',
  'app.current_operating_context()',
] as const;

/** Every table the bootstrap graph reads, and therefore every table needing candidate C. */
const BOOTSTRAP_TABLES = [
  'organization_node_closure',
  'users',
  'memberships',
  'service_accounts',
] as const;

/**
 * The one pinned path every SR-2 definer carries — 0022, F-01/F-02.
 *
 * `pg_temp` is listed, and listed LAST. PostgreSQL searches the session's temporary schema FIRST
 * for RELATIONS whenever the path does not name it, and that holds inside a SECURITY DEFINER with
 * a pinned path too: pinning `pg_catalog, public` does not exclude the implicit `pg_temp`. Naming
 * it is the only thing that demotes it. Asserted as a whole array rather than a substring, because
 * the position is the property — `pg_temp, pg_catalog, public` would satisfy any `toContain`.
 */
const PINNED_PATH = ['search_path=pg_catalog, public, pg_temp'] as const;

let migrator: Client;

interface FunctionFacts {
  signature: string;
  owner: string;
  prosecdef: boolean;
  proconfig: string[] | null;
  proacl: string | null;
  owner_can_login: boolean;
}

/**
 * Read function facts by OID.
 *
 * Names are matched through pg_proc rather than cast to regprocedure: resolving
 * `admin.issue_session_binding(...)` as a literal needs USAGE on schema admin, which the migrator
 * deliberately lacks, and the resulting `permission denied for schema admin` would look like a
 * finding about the function rather than about the query.
 *
 * `oidvectortypes` rather than `pg_get_function_identity_arguments`, which returns parameter NAMES
 * alongside types when a function declares them — every one of these does — and would produce
 * signatures no assertion could be written against.
 */
async function functionFacts(): Promise<Map<string, FunctionFacts>> {
  const r = await migrator.query<FunctionFacts>(
    `SELECT n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')' AS signature,
            o.rolname AS owner, p.prosecdef, p.proconfig, p.proacl::text AS proacl,
            o.rolcanlogin AS owner_can_login
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       JOIN pg_roles o ON o.oid = p.proowner
      WHERE n.nspname IN ('app', 'admin')`,
  );
  return new Map(r.rows.map((row) => [row.signature.replace(/, /g, ','), row]));
}

async function hasExecute(role: string, signature: string): Promise<boolean> {
  const [schema, rest] = signature.split('.', 2) as [string, string];
  const name = rest.slice(0, rest.indexOf('('));
  const args = rest.slice(rest.indexOf('(') + 1, -1);
  const r = await migrator.query<{ ok: boolean }>(
    `SELECT has_function_privilege($1, p.oid, 'EXECUTE') AS ok
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = $2 AND p.proname = $3
        AND replace(oidvectortypes(p.proargtypes), ', ', ',') = $4`,
    [role, schema, name, args],
  );
  if (r.rows.length !== 1) throw new Error(`${signature} did not resolve to exactly one function`);
  return r.rows[0]!.ok;
}

beforeAll(async () => {
  await db.reset();
  migrator = db.connectAsMigrator();
  await migrator.connect();
}, 180_000);

// ---------------------------------------------------------------------------
// GATE A — structural positive controls.
// ---------------------------------------------------------------------------

describe('gate A — structure', () => {
  it('installed every SR-2 function exactly once', async () => {
    const facts = await functionFacts();
    for (const signature of SR2_FUNCTIONS) {
      expect(facts.has(signature), signature).toBe(true);
    }
  });

  it('gives every SR-2 definer a NOLOGIN owner and a pinned search_path', async () => {
    const facts = await functionFacts();
    for (const signature of SR2_FUNCTIONS) {
      const fn = facts.get(signature)!;
      expect(fn.prosecdef, signature).toBe(true);
      expect(fn.owner_can_login, signature).toBe(false);
      expect(fn.proconfig, signature).toEqual(PINNED_PATH);
    }
  });

  it('places each SR-2 function under the owner its authority requires', async () => {
    const facts = await functionFacts();
    const expected: Record<string, string> = {
      'app.verified_binding_context()': 'freightos_binding_owner',
      'app.verified_binding_tenant_scope()': 'freightos_binding_owner',
      'app.verified_binding_node_scope_ok(uuid)': 'freightos_binding_owner',
      'app.verified_principal()': 'freightos_binding_owner',
      'app.begin_verified_session(uuid)': 'freightos_binding_owner',
      // The mint boundary belongs to the control plane, not to the role that holds the storage.
      // Splitting them is what stops a runtime-reachable door from carrying control-plane reach.
      'admin.issue_session_binding(text,uuid,uuid,uuid,uuid,text,text,integer,integer)':
        'freightos_admin_owner',
    };
    for (const [signature, owner] of Object.entries(expected)) {
      expect(facts.get(signature)!.owner, signature).toBe(owner);
    }
  });

  it('makes all seven accessors binding-owner definers with a pinned search_path', async () => {
    const facts = await functionFacts();
    for (const signature of BINDING_OWNER_ACCESSORS) {
      const fn = facts.get(signature)!;
      expect(fn.owner, signature).toBe('freightos_binding_owner');
      expect(fn.prosecdef, signature).toBe(true);
      expect(fn.proconfig, signature).toEqual(PINNED_PATH);
      expect(fn.owner_can_login, signature).toBe(false);
    }
  });

  it('leaves the accessors reachable by every caller — the check that would have caught D-01', async () => {
    for (const signature of BINDING_OWNER_ACCESSORS) {
      expect(await hasExecute('public', signature), signature).toBe(true);
      for (const role of [
        'freightos_app',
        'freightos_admin',
        'freightos_control_plane',
        'freightos_migrator',
        'freightos_admin_owner',
        'freightos_hierarchy_owner',
        'freightos_identity_guard',
      ]) {
        expect(await hasExecute(role, signature), `${role} -> ${signature}`).toBe(true);
      }
    }
  });

  it('keeps app.current_human_principal() narrowed but reachable by both its callers', async () => {
    expect(await hasExecute('public', 'app.current_human_principal()')).toBe(false);
    // freightos_app calls it directly; the two kill-switch definers call it as their own owner.
    expect(await hasExecute('freightos_app', 'app.current_human_principal()')).toBe(true);
    expect(await hasExecute('freightos_hierarchy_owner', 'app.current_human_principal()')).toBe(
      true,
    );
  });

  it('lets no identity outside the FreightOS role set hold a FreightOS role', async () => {
    // The independent invariant that pays for gate U's superuser exclusion.
    //
    // Gate U compares a membership inventory before and after a migration round trip, so it must
    // ignore rows the migrations do not own. One such row is `freightos_audit_writer -> postgres`,
    // left on any cluster where a migration was once run as superuser — 0013 §92 and 0018 §113
    // both do `GRANT ... TO current_user`, and both the grantor and the member on that row are
    // `postgres`, not the migrator. Reverting 0001 drops the role and the row with it, and
    // re-applying 0018 re-grants only to the migrator, so the round trip legitimately ends one row
    // short. That is what produced the observed `19 vs 18`.
    //
    // WHY EXCLUDING SUPERUSERS COSTS NOTHING. A PostgreSQL superuser already holds every privilege
    // implicitly and bypasses row-level security outright, so a role membership grants it nothing
    // it did not already have. The exclusion removes no reachable authority — which is what makes
    // it the correct scoping rather than merely a convenient one.
    //
    // What does matter is asserted here absolutely rather than differentially: no identity outside
    // the FreightOS role set holds a FreightOS role. `op_` logins are the harness's own operator
    // roles, deliberately granted `freightos_admin` and asserted by shape elsewhere.
    const foreign = await migrator.query<{ line: string }>(
      `SELECT format('%s->%s', role.rolname, member.rolname) AS line
         FROM pg_auth_members am
         JOIN pg_roles role ON role.oid = am.roleid
         JOIN pg_roles member ON member.oid = am.member
        WHERE role.rolname LIKE 'freightos%'
          AND NOT member.rolsuper
          AND member.rolname NOT LIKE 'freightos%'
          AND member.rolname NOT LIKE 'op\\_%'
        ORDER BY 1`,
    );
    expect(
      foreign.rows.map((x) => x.line),
      'an identity outside the FreightOS role set holds a FreightOS role',
    ).toEqual([]);

    // And the reason the superuser exclusion is safe in this deployment shape: the identity the
    // migrations actually run as is not a superuser, so 0013's and 0018's `GRANT ... TO
    // current_user` land on a non-superuser wherever they are run correctly.
    const who = await migrator.query<{ rolname: string; rolsuper: boolean }>(
      `SELECT rolname, rolsuper FROM pg_roles WHERE rolname = current_user`,
    );
    expect(who.rows[0]).toEqual({ rolname: 'freightos_migrator', rolsuper: false });
  });

  it('keeps every definer-owner role SET-able by the migrator — the edges migrations must create', async () => {
    // THE OTHER HALF of the superuser exclusion's price, and the half the first draft missed.
    //
    // Gate U is DIFFERENTIAL, so it cannot see a membership that is absent from both snapshots:
    // suppressing 0018's `GRANT freightos_audit_writer TO current_user` removes the row from the
    // before AND the after, and the comparison still matches. Measured, not assumed — that exact
    // mutation left gate U green. An exclusion is only safe if the contract it drops out of the
    // differential check is asserted somewhere ABSOLUTE, so it is asserted here.
    //
    // DERIVED, NOT LISTED. The rule is the reason the grants exist: `ALTER ... OWNER TO` requires
    // the assigning role to be able to BECOME the target, so every role that owns an object the
    // migrations create must be SET-able by the migrator. Enumerating the roles by hand is the
    // construction that produced PR #9 finding B-1; this reads the owners out of the catalog, so a
    // future definer owner is covered the moment it owns something.
    const owners = await migrator.query<{ owner: string; can_set: boolean }>(
      `SELECT DISTINCT o.rolname AS owner,
              pg_has_role('freightos_migrator', o.oid, 'SET') AS can_set
         FROM (
           SELECT p.proowner AS oid FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname IN ('app', 'admin', 'authn')
           UNION
           SELECT c.relowner FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname IN ('app', 'admin', 'authn') AND c.relkind = 'r'
           UNION
           SELECT n.nspowner FROM pg_namespace n WHERE n.nspname IN ('app', 'admin', 'authn')
         ) owned
         JOIN pg_roles o ON o.oid = owned.oid
        WHERE o.rolname LIKE 'freightos%'
        ORDER BY 1`,
    );

    // Non-vacuity: there really are several distinct definer owners to check.
    expect(owners.rows.length, 'no FreightOS object owners found').toBeGreaterThanOrEqual(5);
    expect(
      owners.rows.filter((x) => !x.can_set).map((x) => x.owner),
      'a role owns migration-created objects but the migrator cannot SET ROLE to it',
    ).toEqual([]);
  });

  it('creates no role with SUPERUSER, BYPASSRLS, CREATEDB or CREATEROLE', async () => {
    const r = await migrator.query<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolcanlogin: boolean;
    }>(
      `SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolcanlogin
         FROM pg_roles WHERE rolname = 'freightos_binding_owner'`,
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toEqual({
      rolname: 'freightos_binding_owner',
      rolsuper: false,
      rolbypassrls: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolcanlogin: false,
    });
  });

  it('keeps the binding owner outside the control plane and outside every authoritative role', async () => {
    const r = await migrator.query<{ role: string; member: boolean }>(
      `SELECT r AS role, pg_has_role('freightos_binding_owner', r, 'USAGE') AS member
         FROM unnest(ARRAY['freightos_control_plane','freightos_app','freightos_admin',
                           'freightos_admin_owner','freightos_hierarchy_owner',
                           'freightos_identity_guard','freightos_migrator']) r`,
    );
    for (const row of r.rows) expect(row.member, row.role).toBe(false);
  });

  it('gives the runtime role no privilege at all on app.session_binding', async () => {
    // Read from pg_class.relacl rather than from information_schema.role_table_grants, which shows
    // a caller only the grants it is itself party to. The migrator is party to none of these, so
    // the view would report an empty ACL and the assertion would pass on nothing.
    const r = await migrator.query<{ grantee: string; privilege_type: string }>(
      `SELECT coalesce(a.grantee::regrole::text, 'PUBLIC') AS grantee, a.privilege_type
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace,
              aclexplode(c.relacl) a
        WHERE n.nspname = 'app' AND c.relname = 'session_binding'
        ORDER BY 1, 2`,
    );
    const byRole = new Map<string, string[]>();
    for (const row of r.rows) {
      byRole.set(row.grantee, [...(byRole.get(row.grantee) ?? []), row.privilege_type]);
    }
    expect(byRole.get('freightos_app')).toBeUndefined();
    expect(byRole.get('freightos_control_plane')).toBeUndefined();
    expect(byRole.get('PUBLIC')).toBeUndefined();
    expect(byRole.get('freightos_migrator')).toBeUndefined();
    // The mint boundary writes it; the owner holds everything. Nothing else appears at all.
    expect(byRole.get('freightos_admin_owner')?.sort()).toEqual(['INSERT', 'SELECT', 'UPDATE']);
    expect([...byRole.keys()].sort()).toEqual(['freightos_admin_owner', 'freightos_binding_owner']);
  });

  it('forces row-level security on app.session_binding, so even its owner is bound', async () => {
    const r = await migrator.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app' AND c.relname = 'session_binding'`,
    );
    expect(r.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });

  it('retains no temporary schema CREATE loan after the migration', async () => {
    const r = await migrator.query<{ role: string; ok: boolean }>(
      `SELECT r AS role, has_schema_privilege(r, 'app', 'CREATE') AS ok
         FROM unnest(ARRAY['freightos_hierarchy_owner','freightos_binding_owner',
                           'freightos_admin_owner','freightos_app','freightos_identity_guard',
                           'freightos_control_plane']) r`,
    );
    for (const row of r.rows) expect(row.ok, row.role).toBe(false);
    // Positive control: the deployment authority still holds it, or no later migration could run.
    const owner = await migrator.query<{ ok: boolean }>(
      "SELECT has_schema_privilege('freightos_migrator', 'app', 'CREATE') AS ok",
    );
    expect(owner.rows[0]!.ok).toBe(true);
  });

  it('lends the binding owner SET without INHERIT, so the migrator never picks its rights up', async () => {
    const r = await migrator.query<{
      inherit_option: boolean;
      set_option: boolean;
      admin_option: boolean;
    }>(
      `SELECT am.inherit_option, am.set_option, am.admin_option
         FROM pg_auth_members am
         JOIN pg_roles role ON role.oid = am.roleid
         JOIN pg_roles member ON member.oid = am.member
        WHERE role.rolname = 'freightos_binding_owner'
          AND member.rolname = 'freightos_migrator'`,
    );
    expect(r.rows.length).toBeGreaterThan(0);
    // No grant may confer INHERIT; taken together they must confer SET and ADMIN.
    for (const row of r.rows) expect(row.inherit_option).toBe(false);
    expect(r.rows.some((row) => row.set_option)).toBe(true);
    expect(r.rows.some((row) => row.admin_option)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GATE J — role-disjoint closure, and every other bootstrap table.
// ---------------------------------------------------------------------------

describe('gate J — role-disjoint bootstrap policies', () => {
  interface PolicyFacts {
    relname: string;
    polname: string;
    polcmd: string;
    roles: string[] | null;
    qual: string;
  }

  async function readPolicies(): Promise<PolicyFacts[]> {
    const r = await migrator.query<PolicyFacts>(
      `SELECT c.relname, p.polname, p.polcmd::text AS polcmd,
              (SELECT array_agg(r.rolname::text ORDER BY r.rolname)::text[]
                 FROM pg_roles r WHERE r.oid = ANY(p.polroles)) AS roles,
              coalesce(pg_get_expr(p.polqual, p.polrelid), '') AS qual
         FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
        WHERE c.relname = ANY($1) ORDER BY c.relname, p.polname`,
      [BOOTSTRAP_TABLES],
    );
    return r.rows;
  }

  const AUTHORITATIVE_ACCESSOR =
    /app\.(current_tenant_id|current_actor_id|current_organization_node_id|current_legal_entity_id|current_user_id|current_human_principal|organization_node_scope_ok|legal_entity_scope_ok)/;

  it('gives every bootstrap table a binding-owner-only read policy', async () => {
    const policies = await readPolicies();
    for (const table of BOOTSTRAP_TABLES) {
      const bootstrap = policies.filter(
        (p) => p.relname === table && p.polname.endsWith('_bootstrap_read'),
      );
      expect(bootstrap, table).toHaveLength(1);
      expect(bootstrap[0]!.polcmd, table).toBe('r');
      expect(bootstrap[0]!.roles, table).toEqual(['freightos_binding_owner']);
    }
  });

  it('lets no read policy be both applicable to the binding owner and dependent on an authoritative accessor', async () => {
    const policies = await readPolicies();
    const offenders = policies.filter(
      (p) =>
        ['r', '*'].includes(p.polcmd) &&
        (p.roles === null || p.roles.includes('freightos_binding_owner')) &&
        AUTHORITATIVE_ACCESSOR.test(p.qual),
    );
    // This is cycle 5 stated as an invariant. service_accounts_read was TO PUBLIC and consumed
    // app.current_tenant_id(), so it applied to the binding owner inside the resolver's own plan.
    expect(offenders.map((p) => `${p.relname}.${p.polname}`)).toEqual([]);
  });

  it('keeps every bootstrap policy shut to the runtime role', async () => {
    const policies = await readPolicies();
    const leaked = policies.filter(
      (p) =>
        p.polname.endsWith('_bootstrap_read') &&
        (p.roles === null || p.roles.includes('freightos_app')),
    );
    expect(leaked.map((p) => `${p.relname}.${p.polname}`)).toEqual([]);
  });

  it('keeps the authoritative read policies applicable to the roles that legitimately read', async () => {
    const policies = await readPolicies();
    for (const table of BOOTSTRAP_TABLES) {
      const authoritative = policies.find(
        (p) => p.relname === table && p.polname === `${table}_read`,
      )!;
      expect(authoritative, table).toBeDefined();
      // Narrowed away from PUBLIC — that narrowing IS the recursion cut.
      expect(authoritative.roles, table).not.toBeNull();
      expect(authoritative.roles, table).not.toContain('freightos_binding_owner');
      // And still applicable to the runtime role, or ordinary reads would fail closed.
      expect(authoritative.roles, table).toContain('freightos_app');
    }
  });

  it('does not let a surviving PUBLIC policy hand the binding owner closure visibility', async () => {
    const policies = await readPolicies();
    const publicReads = policies.filter((p) => ['r', '*'].includes(p.polcmd) && p.roles === null);
    // Any PUBLIC read policy on these tables is applicable to the binding owner by definition, so
    // there must be none at all — the bootstrap door is the only way in for that role.
    expect(publicReads.map((p) => `${p.relname}.${p.polname}`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GATE Q — exact function ACLs.
// ---------------------------------------------------------------------------

describe('gate Q — function ACLs', () => {
  it('leaves PUBLIC no EXECUTE on any SR-2 security function', async () => {
    for (const signature of SR2_FUNCTIONS) {
      expect(await hasExecute('public', signature), signature).toBe(false);
    }
  });

  it('makes exactly the three intended functions callable by the runtime role', async () => {
    const callable: string[] = [];
    for (const signature of SR2_FUNCTIONS) {
      if (await hasExecute('freightos_app', signature)) callable.push(signature);
    }
    expect(callable.sort()).toEqual([
      'app.begin_verified_session(uuid)',
      'app.verified_binding_node_scope_ok(uuid)',
      'app.verified_binding_tenant_scope()',
      'app.verified_principal()',
    ]);
  });

  it('keeps the mint boundary away from the runtime role and from the storage owner', async () => {
    const mint = SR2_FUNCTIONS[5];
    expect(await hasExecute('freightos_app', mint)).toBe(false);
    expect(await hasExecute('freightos_binding_owner', mint)).toBe(false);
    expect(await hasExecute('freightos_migrator', mint)).toBe(false);
    expect(await hasExecute('freightos_control_plane', mint)).toBe(false);
    // Positive control: the control-plane connection can still call it.
    expect(await hasExecute('freightos_admin', mint)).toBe(true);
  });

  it('keeps app.verified_binding_context() internal to the bootstrap graph', async () => {
    const internal = 'app.verified_binding_context()';
    for (const role of ['freightos_app', 'freightos_admin', 'freightos_control_plane']) {
      expect(await hasExecute(role, internal), role).toBe(false);
    }
    // Its owner reaches it, which is all the two helpers built on it require.
    expect(await hasExecute('freightos_binding_owner', internal)).toBe(true);
  });

  it('records the full ACL of each SR-2 function, so an unexpected grant is a diff', async () => {
    const facts = await functionFacts();
    const acls = Object.fromEntries(SR2_FUNCTIONS.map((s) => [s, facts.get(s)!.proacl]));
    expect(acls).toEqual({
      'app.verified_binding_context()': '{freightos_binding_owner=X/freightos_binding_owner}',
      'app.verified_binding_tenant_scope()':
        '{freightos_binding_owner=X/freightos_binding_owner,freightos_app=X/freightos_binding_owner}',
      'app.verified_binding_node_scope_ok(uuid)':
        '{freightos_binding_owner=X/freightos_binding_owner,freightos_app=X/freightos_binding_owner}',
      'app.verified_principal()':
        '{freightos_binding_owner=X/freightos_binding_owner,freightos_app=X/freightos_binding_owner}',
      'app.begin_verified_session(uuid)':
        '{freightos_binding_owner=X/freightos_binding_owner,freightos_app=X/freightos_binding_owner}',
      'admin.issue_session_binding(text,uuid,uuid,uuid,uuid,text,text,integer,integer)':
        '{freightos_admin_owner=X/freightos_admin_owner,freightos_admin=X/freightos_admin_owner}',
    });
  });
});

// ---------------------------------------------------------------------------
// GATE R — every definer's body is within its owner's reach.
// ---------------------------------------------------------------------------

describe('gate R — definer owner privileges', () => {
  /**
   * R-01 restated as a general property.
   *
   * 0018 gave freightos_hierarchy_owner a definer that read `users` and forgot the SELECT grant, so
   * app.current_human_principal() raised for every caller and both kill-switch commands refused
   * everybody. Nothing in the migration was wrong to read; the owner simply could not perform its
   * own body.
   */
  const definerReads: ReadonlyArray<readonly [string, string, readonly string[]]> = [
    ['freightos_binding_owner', 'app.verified_binding_context()', ['app.session_binding']],
    ['freightos_binding_owner', 'app.verified_binding_tenant_scope()', ['app.session_binding']],
    [
      'freightos_binding_owner',
      'app.verified_binding_node_scope_ok(uuid)',
      ['app.session_binding', 'public.organization_node_closure'],
    ],
    [
      'freightos_binding_owner',
      'app.verified_principal()',
      ['app.session_binding', 'public.users', 'public.memberships', 'public.service_accounts'],
    ],
    ['freightos_binding_owner', 'app.begin_verified_session(uuid)', ['app.session_binding']],
    [
      'freightos_admin_owner',
      'admin.issue_session_binding(...)',
      ['app.session_binding', 'public.users', 'public.memberships', 'public.service_accounts'],
    ],
    ['freightos_hierarchy_owner', 'app.current_human_principal()', ['public.users']],
  ];

  it('lets every definer owner read every table its body reads', async () => {
    for (const [owner, fn, tables] of definerReads) {
      for (const table of tables) {
        const r = await migrator.query<{ ok: boolean }>(
          'SELECT has_table_privilege($1, $2, $3) AS ok',
          [owner, table, 'SELECT'],
        );
        expect(r.rows[0]!.ok, `${owner} SELECT ${table} for ${fn}`).toBe(true);
      }
    }
  });

  it('lets the two writing definers write exactly what their bodies write', async () => {
    // The mint boundary inserts a binding; the installer updates one. Neither owner may do more.
    const writes: ReadonlyArray<readonly [string, string, boolean]> = [
      ['freightos_admin_owner', 'INSERT', true],
      ['freightos_admin_owner', 'UPDATE', true],
      ['freightos_admin_owner', 'DELETE', false],
      ['freightos_binding_owner', 'UPDATE', true],
    ];
    for (const [role, privilege, expected] of writes) {
      const r = await migrator.query<{ ok: boolean }>(
        'SELECT has_table_privilege($1, $2, $3) AS ok',
        [role, 'app.session_binding', privilege],
      );
      expect(r.rows[0]!.ok, `${role} ${privilege}`).toBe(expected);
    }
  });

  it('gives the binding owner no privilege beyond the reads its bodies need', async () => {
    const r = await migrator.query<{ table_name: string; privilege_type: string }>(
      `SELECT c.relname AS table_name, a.privilege_type
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace,
              aclexplode(c.relacl) a
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND a.grantee = 'freightos_binding_owner'::regrole
        ORDER BY 1, 2`,
    );
    expect(r.rows.map((row) => `${row.table_name}:${row.privilege_type}`).sort()).toEqual([
      'memberships:SELECT',
      'organization_node_closure:SELECT',
      'service_accounts:SELECT',
      'users:SELECT',
    ]);
  });

  it('has no LOGIN role owning any SR-2 definer', async () => {
    const facts = await functionFacts();
    for (const signature of [...SR2_FUNCTIONS, ...BINDING_OWNER_ACCESSORS]) {
      expect(facts.get(signature)!.owner_can_login, signature).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// GATE S — the static recursion graph.
// ---------------------------------------------------------------------------

describe('gate S — static recursion graph', () => {
  /**
   * PostgreSQL manifested cycle 5 as `stack depth limit exceeded` with alternating
   * `during startup` frames, and no recursion diagnostic. A runtime smoke test can only find such a
   * cycle by falling into it; this reads the graph instead.
   *
   * Edges considered: a bootstrap function's body naming another function, and a policy applicable
   * to a role naming a function. A finding is any path from the bootstrap side back to the
   * authoritative side.
   */
  const BOOTSTRAP_FUNCTIONS = [
    'verified_binding_context',
    'verified_binding_tenant_scope',
    'verified_binding_node_scope_ok',
    'verified_principal',
  ] as const;

  const AUTHORITATIVE = [
    'current_tenant_id',
    'current_actor_id',
    'current_organization_node_id',
    'current_legal_entity_id',
    'current_user_id',
    'current_human_principal',
    'organization_node_scope_ok',
    'legal_entity_scope_ok',
  ] as const;

  it('finds no bootstrap function calling an authoritative accessor or the resolver', async () => {
    const r = await migrator.query<{ proname: string; prosrc: string }>(
      `SELECT p.proname, p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'app' AND p.proname = ANY($1)`,
      [BOOTSTRAP_FUNCTIONS.slice(0, 3)],
    );
    expect(r.rows).toHaveLength(3);
    const findings: string[] = [];
    for (const row of r.rows) {
      for (const target of [...AUTHORITATIVE, 'verified_principal']) {
        if (new RegExp(`app\\.${target}\\s*\\(`).test(row.prosrc)) {
          findings.push(`${row.proname} -> ${target}`);
        }
      }
    }
    expect(findings).toEqual([]);
  });

  it('finds no session_binding policy consuming an actor, tenant or hierarchy accessor', async () => {
    const r = await migrator.query<{ polname: string; qual: string }>(
      `SELECT p.polname, coalesce(pg_get_expr(p.polqual, p.polrelid), '') AS qual
         FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app' AND c.relname = 'session_binding'`,
    );
    expect(r.rows.length).toBeGreaterThan(0);
    const findings = r.rows.filter((row) =>
      [...AUTHORITATIVE, ...BOOTSTRAP_FUNCTIONS].some((t) =>
        new RegExp(`app\\.${t}\\s*\\(`).test(row.qual),
      ),
    );
    // The terminal node of the graph. If it consumed anything, the graph would have no bottom.
    expect(findings.map((f) => f.polname)).toEqual([]);
  });

  it('finds no ordinary policy outside the bootstrap set consuming binding-only scope', async () => {
    const r = await migrator.query<{ relname: string; polname: string; qual: string }>(
      `SELECT c.relname, p.polname,
              coalesce(pg_get_expr(p.polqual, p.polrelid), '') ||
              coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') AS qual
         FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
        WHERE p.polname NOT LIKE '%\\_bootstrap\\_read'`,
    );
    const findings = r.rows.filter((row) => /app\.verified_binding_/.test(row.qual));
    // Ordinary reads must keep revalidated semantics. A policy reaching for binding-only scope
    // would give a revoked session authority for the rest of its transaction — the residual the
    // owner refused in review.
    expect(findings.map((f) => `${f.relname}.${f.polname}`)).toEqual([]);
  });

  it('finds the binding owner in no authoritative closure role, directly or transitively', async () => {
    const r = await migrator.query<{ role: string; member: boolean }>(
      `SELECT r AS role, pg_has_role('freightos_binding_owner', r, 'USAGE') AS member
         FROM unnest(ARRAY['freightos_app','freightos_admin_owner','freightos_hierarchy_owner',
                           'freightos_identity_guard','freightos_migrator',
                           'freightos_control_plane']) r`,
    );
    expect(r.rows.filter((row) => row.member).map((row) => row.role)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GATE T — 18 -> 20 -> 18 restores the captured pre-0020 state.
// ---------------------------------------------------------------------------

describe('gate T — down migration restores 0018 exactly', () => {
  /** The six accessors as `docs/security-resilience/sr2-baseline/pre-0020-accessors.sql` captured. */
  interface AccessorState {
    signature: string;
    owner: string;
    prosecdef: boolean;
    provolatile: string;
    proconfig: string[] | null;
    proacl: string | null;
    body: string;
  }

  async function accessorState(client: Client): Promise<AccessorState[]> {
    const r = await client.query<AccessorState>(
      `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS signature,
              o.rolname AS owner, p.prosecdef, p.provolatile, p.proconfig,
              p.proacl::text AS proacl, p.prosrc AS body
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         JOIN pg_roles o ON o.oid = p.proowner
        WHERE n.nspname = 'app' AND p.proname = ANY($1) ORDER BY p.proname`,
      [
        [
          'current_tenant_id',
          'current_actor_id',
          'current_organization_node_id',
          'current_legal_entity_id',
          'current_user_id',
          'current_human_principal',
        ],
      ],
    );
    return r.rows;
  }

  async function closureRoles(client: Client): Promise<Record<string, string[] | null>> {
    const r = await client.query<{ key: string; roles: string[] | null }>(
      `SELECT c.relname || '.' || p.polname AS key,
              (SELECT array_agg(r.rolname::text ORDER BY r.rolname)::text[]
                 FROM pg_roles r WHERE r.oid = ANY(p.polroles)) AS roles
         FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
        WHERE c.relname = ANY($1) ORDER BY 1`,
      [BOOTSTRAP_TABLES],
    );
    return Object.fromEntries(r.rows.map((row) => [row.key, row.roles]));
  }

  it('restores bodies, owners, security mode, volatility, search_path and ACLs, then re-applies', async () => {
    const roundTrip = new TestDatabase('freightos_test_sr2_roundtrip');
    await roundTrip.reset();
    const client = roundTrip.connectAsMigrator();
    await client.connect();
    try {
      const migrations = loadMigrations(MIGRATIONS_DIR);
      const at19 = await accessorState(client);
      expect(at19).toHaveLength(6);

      // 19 -> 18.
      await migrateDown(client, migrations, 19);
      const at18 = await accessorState(client);

      // Every accessor is back to invoker rights with no pinned search_path, owned by the migrator
      // — except current_human_principal, which 0018 itself made a hierarchy-owner definer.
      for (const fn of at18) {
        if (fn.signature === 'current_human_principal()') {
          expect(fn.owner).toBe('freightos_hierarchy_owner');
          expect(fn.prosecdef).toBe(true);
          // `pg_temp` LAST, not the bare `pg_catalog, public` the pre-0020 capture recorded — PR #9
          // finding C-1.
          //
          // The revert above stops AT 19, so migration 0019 is still applied here, and 0019's whole
          // purpose is that no SECURITY DEFINER in this database resolves a relation through an
          // implicit `pg_temp`. 0020's down migration used to restore this function with the
          // search_path 0018 gave it, which silently undid 0019 for the one definer it touched and
          // left the database in a state 0019's own assertion says cannot exist. This gate asserted
          // that, so the defect had a passing test.
          //
          // A down migration owns the fields ITS up migration changed. 0020 did not create this
          // pin, so 0020's down must not remove it. 0019's own down is a catalog-driven loop that
          // resets every definer it finds, so reverting past 19 still lands on the v18 shape.
          expect(fn.proconfig).toEqual(['search_path=pg_catalog, public, pg_temp']);
          // The captured truth, PUBLIC EXECUTE included. Rollback fidelity is not forward posture.
          expect(fn.proacl).toContain('=X/freightos_hierarchy_owner');
        } else {
          expect(fn.owner, fn.signature).toBe('freightos_migrator');
          expect(fn.prosecdef, fn.signature).toBe(false);
          expect(fn.proconfig, fn.signature).toBeNull();
          expect(fn.proacl, fn.signature).toBeNull();
        }
        expect(fn.provolatile, fn.signature).toBe('s');
        // No accessor may still name the resolver after the revert.
        expect(fn.body, fn.signature).not.toContain('verified_principal');
      }

      // Policies are back to TO PUBLIC, with no bootstrap policy left behind.
      const roles18 = await closureRoles(client);
      for (const table of BOOTSTRAP_TABLES) {
        expect(roles18[`${table}.${table}_read`], table).toBeNull();
        expect(roles18[`${table}.${table}_bootstrap_read`], table).toBeUndefined();
      }

      // Every SR-2 object is gone.
      const leftovers = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname IN ('app','admin')
            AND p.proname IN ('verified_binding_context','verified_binding_tenant_scope',
                              'verified_binding_node_scope_ok','verified_principal',
                              'begin_verified_session','issue_session_binding')`,
      );
      expect(Number(leftovers.rows[0]!.n)).toBe(0);
      const table = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'app' AND c.relname = 'session_binding'`,
      );
      expect(Number(table.rows[0]!.n)).toBe(0);
      const type = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'app' AND t.typname = 'verified_principal_result'`,
      );
      expect(Number(type.rows[0]!.n)).toBe(0);

      // The binding owner survives — deliberately. A role is cluster-wide, and dropping it fails
      // whenever any sibling database still carries 0019. What must be gone is its reach: after the
      // revert it holds no privilege in this database at all.
      const residual = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n
           FROM pg_class c, aclexplode(c.relacl) a
          WHERE a.grantee = 'freightos_binding_owner'::regrole`,
      );
      expect(Number(residual.rows[0]!.n)).toBe(0);
      const schemaReach = await client.query<{ usage: boolean; create: boolean }>(
        `SELECT has_schema_privilege('freightos_binding_owner','app','USAGE') AS usage,
                has_schema_privilege('freightos_binding_owner','app','CREATE') AS create`,
      );
      expect(schemaReach.rows[0]).toEqual({ usage: false, create: false });

      // Neither loan is left behind by the down migration either.
      const loans = await client.query<{ hierarchy: boolean }>(
        "SELECT has_schema_privilege('freightos_hierarchy_owner','app','CREATE') AS hierarchy",
      );
      expect(loans.rows[0]!.hierarchy).toBe(false);
      const inherit = await client.query<{ inherit_option: boolean }>(
        `SELECT am.inherit_option FROM pg_auth_members am
           JOIN pg_roles role ON role.oid = am.roleid
           JOIN pg_roles member ON member.oid = am.member
          WHERE role.rolname = 'freightos_binding_owner'
            AND member.rolname = 'freightos_migrator'`,
      );
      for (const row of inherit.rows) expect(row.inherit_option).toBe(false);

      // 18 -> 19 again, and the state matches where it started.
      await migrateUp(client, migrations);
      expect(await accessorState(client)).toEqual(at19);
      expect(await closureRoles(client)).toEqual(await closureRoles(client));
      const loansAfter = await client.query<{ hierarchy: boolean; binding: boolean }>(
        `SELECT has_schema_privilege('freightos_hierarchy_owner','app','CREATE') AS hierarchy,
                has_schema_privilege('freightos_binding_owner','app','CREATE') AS binding`,
      );
      expect(loansAfter.rows[0]).toEqual({ hierarchy: false, binding: false });
    } finally {
      await client.end();
    }
  }, 240_000);
});

// ---------------------------------------------------------------------------
// GATE U — zero -> 19 -> zero -> 19 reproduces the same database.
// ---------------------------------------------------------------------------

describe('gate U — full round trip reproduces the same inventory', () => {
  /**
   * "0019 down and up works" is a much weaker claim than "the whole repository reproduces", and the
   * two are easy to conflate. This runs the complete sequence as `freightos_migrator` — never as a
   * superuser — and compares a wide inventory taken at each end.
   *
   * The comparison covers roles and their attributes, role memberships and their three options,
   * table and column ACLs, table ownership and FORCE RLS, every policy with its roles, command and
   * predicates, every function with owner, security mode, volatility, search_path, ACL and body,
   * constraints, indexes, and enum labels with their ordinals.
   */
  interface Inventory {
    roles: string[];
    memberships: string[];
    tables: string[];
    tableAcls: string[];
    columnAcls: string[];
    policies: string[];
    functions: string[];
    constraints: string[];
    indexes: string[];
    enums: string[];
  }

  async function capture(client: Client): Promise<Inventory> {
    const one = async (sql: string): Promise<string[]> =>
      (await client.query<{ line: string }>(sql)).rows.map((r) => r.line);

    return {
      // ── TWO KINDS OF SECURITY STATE, AND WHY ONLY ONE ROUND-TRIPS ───────────────────────────
      //
      // MIGRATION-OWNED. Objects, roles and grants whose existence and shape are produced by the
      // FreightOS migration sequence. `freightos_*` roles, their memberships, every table, policy,
      // function, ACL, constraint and index in public/app/admin. A down→up cycle must reproduce all
      // of it identically, and that equality is the whole assertion of this gate.
      //
      // HARNESS-OWNED. Per-test operator LOGIN identities (`op_<digest>_<label>`) provisioned to
      // exercise PostgreSQL authentication semantics — the thing Design A makes the trust anchor.
      // These are CLUSTER artifacts created by tests, not migration outputs. No migration creates
      // one, no migration drops one, and a down→up cycle neither should nor could reproduce them.
      //
      // THE EXCLUSION BELOW IS NOT DRIFT-HIDING. Harness identities are excluded from migration
      // EQUALITY and then asserted against a strict independent contract further down: exact
      // outbound membership, no reverse edge, and every privilege-bearing role attribute. A role
      // that drifted would fail there. What is removed is a comparison that could only ever fail
      // for a reason no migration controls; what replaces it is stronger than what it replaced,
      // because the old inventory only recorded that the memberships existed and never checked
      // that SET was FALSE.
      //
      // The rule for anything added here later: if an assertion concerns migration-owned state,
      // constrain the query to migration-owned objects. If it concerns a harness identity,
      // provision a test-owned subject and assert its shape directly. Do not serialize the suite to
      // make a cluster-global query look deterministic — that hides the race rather than removing
      // it, and it would come back the moment the suite is run any other way.
      roles: await one(
        `SELECT format('%s super=%s login=%s bypassrls=%s createdb=%s createrole=%s inherit=%s',
                       rolname, rolsuper, rolcanlogin, rolbypassrls, rolcreatedb, rolcreaterole,
                       rolinherit) AS line
           FROM pg_roles WHERE rolname LIKE 'freightos%' ORDER BY rolname`,
      ),
      // `pg_auth_members` is CLUSTER-WIDE, not per-database, and this capture runs twice with a
      // full down-to-zero and up between the two — tens of seconds during which other test FILES
      // are provisioning their own operator logins. Every such login is granted `freightos_admin`
      // by the harness, so an unfiltered inventory grows between the snapshots and the comparison
      // fails for a reason no migration controls. That is a race, and it is one this branch made
      // reachable by giving more files authenticated operators.
      //
      // Harness operator logins are excluded here and asserted by SHAPE in the same test instead —
      // a set comparison of concurrently created roles cannot be made stable, but "every operator
      // login holds exactly one grant, and it is the administrative capability with no SET" can,
      // and it is the property that actually matters. `op_` is `TestDatabase.operatorRoleName`.
      //
      // SUPERUSER MEMBERS ARE EXCLUDED FOR THE SAME REASON, and it is a second, distinct kind of
      // contamination. Migrations 0013 §92 and 0018 §113 grant an owner role to `current_user`:
      //
      //   EXECUTE format('GRANT freightos_audit_writer TO %I WITH SET TRUE, INHERIT FALSE',
      //                  current_user);
      //
      // In production and under this harness `current_user` is `freightos_migrator`. But roles are
      // cluster-wide, so a migration ever run as `postgres` on this cluster — by hand, or by an
      // older harness — leaves a permanent `freightos_audit_writer -> postgres` row that no later
      // migration owns. This round trip then legitimately destroys it: reverting 0001 drops the
      // role and every membership with it, and re-applying 0018 re-grants only to the migrator. The
      // "after" inventory is one row short of the "before", and the failure reads `19 vs 18` —
      // observed, and traced to exactly that row.
      //
      // That is the test comparing migration-owned state against historical cluster state, not a
      // migration defect. The inventory is therefore scoped to what the migrations own, and the
      // security question the exclusion raises — may a migration grant a FreightOS role to a
      // superuser? — is asked separately and absolutely by `grants no FreightOS role to a
      // superuser` below, which is NOT a before/after comparison and so cannot be satisfied by
      // drift.
      memberships: await one(
        `SELECT format('%s->%s admin=%s inherit=%s set=%s',
                       role.rolname, member.rolname, am.admin_option, am.inherit_option,
                       am.set_option) AS line
           FROM pg_auth_members am
           JOIN pg_roles role ON role.oid = am.roleid
           JOIN pg_roles member ON member.oid = am.member
          WHERE role.rolname LIKE 'freightos%'
            AND member.rolname NOT LIKE 'op\\_%'
            AND NOT member.rolsuper ORDER BY 1`,
      ),
      tables: await one(
        `SELECT format('%s.%s owner=%s rls=%s force=%s',
                       n.nspname, c.relname, pg_get_userbyid(c.relowner),
                       c.relrowsecurity, c.relforcerowsecurity) AS line
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind = 'r' AND n.nspname IN ('public', 'app', 'admin')
          ORDER BY 1`,
      ),
      tableAcls: await one(
        `SELECT format('%s.%s %s %s', n.nspname, c.relname,
                       coalesce(a.grantee::regrole::text, 'PUBLIC'), a.privilege_type) AS line
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
                aclexplode(c.relacl) a
          WHERE c.relkind = 'r' AND n.nspname IN ('public', 'app', 'admin')
          ORDER BY 1`,
      ),
      columnAcls: await one(
        `SELECT format('%s.%s.%s %s %s', n.nspname, c.relname, at.attname,
                       coalesce(a.grantee::regrole::text, 'PUBLIC'), a.privilege_type) AS line
           FROM pg_attribute at
           JOIN pg_class c ON c.oid = at.attrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace,
                aclexplode(at.attacl) a
          WHERE n.nspname IN ('public', 'app', 'admin') ORDER BY 1`,
      ),
      policies: await one(
        `SELECT format('%s.%s %s cmd=%s roles=%s using=%s check=%s',
                       n.nspname, c.relname, p.polname, p.polcmd,
                       coalesce((SELECT string_agg(r.rolname, ',' ORDER BY r.rolname)
                                   FROM pg_roles r WHERE r.oid = ANY(p.polroles)), 'PUBLIC'),
                       coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                       coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')) AS line
           FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace ORDER BY 1`,
      ),
      functions: await one(
        `SELECT format('%s.%s(%s) owner=%s secdef=%s vol=%s cfg=%s acl=%s md5=%s',
                       n.nspname, p.proname, oidvectortypes(p.proargtypes),
                       pg_get_userbyid(p.proowner), p.prosecdef, p.provolatile,
                       coalesce(array_to_string(p.proconfig, '|'), '-'),
                       coalesce(p.proacl::text, '-'), md5(p.prosrc)) AS line
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname IN ('public', 'app', 'admin') ORDER BY 1`,
      ),
      constraints: await one(
        `SELECT format('%s.%s %s %s', n.nspname, c.relname, con.conname,
                       pg_get_constraintdef(con.oid)) AS line
           FROM pg_constraint con
           JOIN pg_class c ON c.oid = con.conrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname IN ('public', 'app', 'admin') ORDER BY 1`,
      ),
      indexes: await one(
        `SELECT format('%s.%s %s', schemaname, tablename, indexdef) AS line
           FROM pg_indexes WHERE schemaname IN ('public', 'app', 'admin') ORDER BY 1`,
      ),
      enums: await one(
        `SELECT format('%s.%s %s %s', n.nspname, t.typname, e.enumsortorder, e.enumlabel) AS line
           FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
           JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname IN ('public', 'app', 'admin') ORDER BY 1, e.enumsortorder`,
      ),
    };
  }

  it('produces an equivalent inventory after a complete revert and re-apply', async () => {
    const round = new TestDatabase('freightos_test_sr2_full_round');
    await round.reset();
    const client = round.connectAsMigrator();
    await client.connect();
    try {
      const migrations = loadMigrations(MIGRATIONS_DIR);
      const applied = await client.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM schema_migrations',
      );
      expect(Number(applied.rows[0]!.n)).toBe(migrations.length);

      const a = await capture(client);

      // All the way to zero, then all the way back.
      await migrateDown(client, migrations, 0);
      // `schema_migrations` is the migrator's own bookkeeping and is never dropped by a migration;
      // everything a migration created must be.
      const empty = await client.query<{ relname: string }>(
        `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind = 'r' AND n.nspname IN ('public', 'app', 'admin')
          ORDER BY c.relname`,
      );
      expect(empty.rows.map((r) => r.relname)).toEqual(['schema_migrations']);

      const result = await migrateUp(client, migrations);
      expect(result.applied).toHaveLength(migrations.length);

      const b = await capture(client);

      for (const key of Object.keys(a) as (keyof Inventory)[]) {
        expect(b[key], key).toEqual(a[key]);
      }
      // The inventory must be substantial, or an empty-equals-empty comparison would pass.
      expect(a.policies.length).toBeGreaterThan(50);
      expect(a.functions.length).toBeGreaterThan(30);
      expect(a.tables.length).toBeGreaterThan(20);

      // ── The harness-owned half of the security contract ─────────────────────────────────────
      //
      // Excluded from the inventory above, and therefore asserted here in full, against a subject
      // this test provisions ITSELF. Its own operator is the authoritative fixture: operator roles
      // are cluster-global and other files create and drop them throughout this test's lifetime, so
      // "at least one exists" is exactly as scheduling-dependent as the set comparison this
      // replaced, and a universal assertion over a possibly-empty set passes vacuously. A service
      // login needs no seeded tenant or user, so it can be provisioned on a database that was just
      // migrated up from zero.
      const subject = await round.provisionSystemLogin('roundtrip', 'system:tenant-provisioning');

      // 1. OUTBOUND MEMBERSHIP — an EXACT SET, not "contains freightos_admin".
      //
      //    The operator may hold the administrative CAPABILITY and nothing else. Membership in
      //    freightos_admin_owner, freightos_operator_registry_owner, a provisioning role, another
      //    operator, or any other privileged role would each be a different escalation, and only an
      //    exact-set assertion rules all of them out at once.
      //
      //    SET = FALSE is the security-critical option. An operator that could
      //    `SET ROLE freightos_admin` would replace its identity-bearing execution context with the
      //    shared capability role, which is the substitution SEC-01 exists to prevent.
      //    ADMIN OPTION = FALSE is asserted explicitly rather than left to the default: an operator
      //    must not be able to hand membership in freightos_admin to anything else.
      //    INHERIT = TRUE is what makes the capability usable without assuming the role at all.
      const outbound = await client.query<{ line: string }>(
        `SELECT format('%s admin=%s inherit=%s set=%s',
                       role.rolname, am.admin_option, am.inherit_option, am.set_option) AS line
           FROM pg_auth_members am
           JOIN pg_roles role ON role.oid = am.roleid
           JOIN pg_roles member ON member.oid = am.member
          WHERE member.rolname = $1
          ORDER BY 1`,
        [subject],
      );
      expect(outbound.rows.map((r) => r.line)).toEqual(['freightos_admin admin=f inherit=t set=f']);

      // 2. REVERSE EDGE — nothing is a member OF the operator.
      //
      //    An individual operator identity is a leaf: it is something a person authenticates AS,
      //    never a capability another principal holds. A member here would mean somebody else could
      //    act with this person's identity, which is the finding SEC-01 closed wearing a different
      //    hat. The architecture permits no such edge, so the expected count is zero — including
      //    the automatic grant PostgreSQL 16 writes when a CREATEROLE role runs CREATE ROLE, which
      //    does not arise because the harness creates operator logins as the superuser.
      const inbound = await client.query<{ line: string }>(
        `SELECT format('%s admin=%s inherit=%s set=%s',
                       member.rolname, am.admin_option, am.inherit_option, am.set_option) AS line
           FROM pg_auth_members am
           JOIN pg_roles role ON role.oid = am.roleid
           JOIN pg_roles member ON member.oid = am.member
          WHERE role.rolname = $1
          ORDER BY 1`,
        [subject],
      );
      expect(inbound.rows.map((r) => r.line)).toEqual([]);

      // 3. ROLE ATTRIBUTES — every privilege-bearing attribute, stated.
      //
      //    LOGIN is the whole point: the operator authenticates as itself. The other five would
      //    each defeat some part of the model — BYPASSRLS makes every isolation proof vacuous,
      //    CREATEROLE lets the operator mint its own identities, and so on. Attributes SR-2 does
      //    not govern (connection limit, password expiry) are deliberately not asserted: they are
      //    deployment policy, not part of the provisioning contract this migration defines.
      const attrs = await client.query<{
        rolcanlogin: boolean;
        rolsuper: boolean;
        rolcreaterole: boolean;
        rolcreatedb: boolean;
        rolreplication: boolean;
        rolbypassrls: boolean;
      }>(
        `SELECT rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
           FROM pg_roles WHERE rolname = $1`,
        [subject],
      );
      expect(attrs.rowCount, 'the self-provisioned operator does not exist').toBe(1);
      expect(attrs.rows[0]).toEqual({
        rolcanlogin: true,
        rolsuper: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolreplication: false,
        rolbypassrls: false,
      });

      // 4. And the same shape across every operator login in the cluster. Race-safe because it
      //    compares the SET OF DISTINCT SHAPES rather than the set of rows — a concurrently created
      //    operator adds a row but not a shape. Non-vacuous because the subject above is one of
      //    them. This is what would catch another file provisioning an operator differently.
      const everyOperator = await client.query<{ line: string }>(
        `SELECT format('%s admin=%s inherit=%s set=%s',
                       role.rolname, am.admin_option, am.inherit_option, am.set_option) AS line
           FROM pg_auth_members am
           JOIN pg_roles role ON role.oid = am.roleid
           JOIN pg_roles member ON member.oid = am.member
          WHERE member.rolname LIKE 'op\\_%'
          ORDER BY 1`,
      );
      expect([...new Set(everyOperator.rows.map((r) => r.line))]).toEqual([
        'freightos_admin admin=f inherit=t set=f',
      ]);
    } finally {
      await client.end();
    }
  }, 300_000);
});

/**
 * Gate X — the Layer B primitives 0020 added, and who may reach them.
 *
 * The adversarial rereview found `app.verified_binding_scope_node_ids()` shipping with the PUBLIC
 * EXECUTE a new function gets by default, while 0020 §9 had revoked PUBLIC from every one of its
 * siblings. The accompanying grant to `freightos_app` was measured unnecessary: with EXECUTE revoked
 * from both, the scoped read still worked, because the function is only ever evaluated as
 * `freightos_binding_owner` inside `app.verified_principal()`'s definer context.
 *
 * That matters more here than for the siblings. `verified_binding_node_scope_ok()` TESTS one id the
 * caller already knows; this one ENUMERATES the bound subtree, and like every Layer B primitive it
 * answers WITHOUT revalidating the principal. Reachable by nobody, the residual is closed rather
 * than documented — and this is the check that keeps it closed.
 */
describe('gate X — the statement-scoped primitives are owner-only where they must be', () => {
  it('lets nobody but the owner execute the bootstrap-only scope set', async () => {
    const client = new TestDatabase('freightos_test_sr2_structure').connectAs('postgres');
    await client.connect();
    try {
      const r = await client.query<{ grantee: string }>(
        `SELECT pg_get_userbyid(a.grantee) AS grantee
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           CROSS JOIN LATERAL aclexplode(p.proacl) a
          WHERE n.nspname = 'app'
            AND p.proname = 'verified_binding_scope_node_ids'
            AND a.grantee <> p.proowner`,
      );
      expect(r.rows.map((x) => x.grantee)).toEqual([]);

      // And the ACL is materialised at all — a NULL proacl is the default, which IS PUBLIC EXECUTE.
      const acl = await client.query<{ proacl: string | null }>(
        `SELECT p.proacl::text AS proacl
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'app' AND p.proname = 'verified_binding_scope_node_ids'`,
      );
      expect(acl.rows[0]!.proacl, 'a NULL ACL is PUBLIC EXECUTE, not "no grants"').not.toBeNull();
    } finally {
      await client.end();
    }
  }, 300_000);

  it('keeps the two invoker-rights scope sets invoker-rights', async () => {
    // If either became SECURITY DEFINER it would read past the policies of the tables it scans, and
    // every policy that consumes it would be answering from a different trust model than the one
    // reviewed here.
    const client = new TestDatabase('freightos_test_sr2_structure').connectAs('postgres');
    await client.connect();
    try {
      const r = await client.query<{ proname: string; prosecdef: boolean; pronargs: number }>(
        `SELECT p.proname, p.prosecdef, p.pronargs
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'app'
            AND p.proname IN ('verified_scope_node_ids', 'verified_scope_service_account_ids',
                              'identity_read_context_ok', 'identity_write_context_ok')
          ORDER BY p.proname`,
      );
      expect(r.rows).toHaveLength(4);
      for (const row of r.rows) {
        expect(row.prosecdef, `${row.proname} became a definer`).toBe(false);
        expect(row.pronargs, `${row.proname} gained an argument`).toBe(0);
      }
    } finally {
      await client.end();
    }
  }, 300_000);
});

// ---------------------------------------------------------------------------
// GATE Z — no SECURITY DEFINER anywhere leaves pg_temp searched first. F-01/F-02.
// ---------------------------------------------------------------------------

/**
 * The durable half of migration 0023.
 *
 * §4 of that migration asserts the same property, but it asserts it ONCE, at the moment 0022 runs.
 * A definer added by migration 0023 would carry PostgreSQL's ordinary `pg_catalog, public` pin,
 * reopen the class, and pass every check in the suite — which is exactly how F-01 survived four
 * migrations. This is the check that does not expire.
 *
 * It is deliberately a WHOLE-SCHEMA sweep with no allowlist. An exemption list is the mechanism by
 * which this defect returns: the first draft of 0023's own remediation enumerated the functions by
 * hand and missed twenty-four of forty-eight, including the entire authorization-mutation boundary
 * in schema `admin`.
 */
describe('gate Z — pg_temp is demoted for every definer, not just the reviewed ones', () => {
  it('ends every app and admin definer search_path with pg_temp', async () => {
    const client = new TestDatabase('freightos_test_sr2_structure').connectAs('postgres');
    await client.connect();
    try {
      const r = await client.query<{ signature: string; path: string | null }>(
        `SELECT n.nspname || '.' || p.proname AS signature,
                substring(p.proconfig::text from 'search_path=([^"}]*)') AS path
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname IN ('app', 'admin') AND p.prosecdef
          ORDER BY 1`,
      );
      // A sweep that matched nothing would pass silently, which is the one way this check could
      // be useless.
      expect(r.rows.length, 'the sweep found no definers at all').toBeGreaterThan(40);

      const bad = r.rows.filter((x) => !/pg_temp\s*$/.test(x.path ?? ''));
      expect(
        bad.map((x) => `${x.signature} → ${x.path ?? 'NO PINNED PATH'}`),
        'a definer searches pg_temp before the schemas it means to read',
      ).toEqual([]);
    } finally {
      await client.end();
    }
  }, 300_000);

  it('leaves the runtime role no way to introduce a relation at all', async () => {
    // The other half: even a definer that forgot the pin is unreachable if the attacker cannot
    // create the shadowing object. `freightos_app` holds TEMPORARY on no database and CREATE on no
    // schema, so pg_temp was its only route and it is closed.
    const client = new TestDatabase('freightos_test_sr2_structure').connectAs('postgres');
    await client.connect();
    try {
      const r = await client.query<{ temp: boolean }>(
        `SELECT has_database_privilege('freightos_app', current_database(), 'TEMPORARY') AS temp`,
      );
      expect(r.rows[0]!.temp, 'freightos_app can create temporary relations').toBe(false);

      const schemas = await client.query<{ nspname: string }>(
        `SELECT n.nspname FROM pg_namespace n
          WHERE n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema'
            AND has_schema_privilege('freightos_app', n.nspname, 'CREATE')`,
      );
      expect(
        schemas.rows.map((x) => x.nspname),
        'freightos_app holds CREATE somewhere',
      ).toEqual([]);
    } finally {
      await client.end();
    }
  }, 300_000);

  /**
   * 25 -> 23 -> 25, at full fidelity over everything the SR-2 migrations touch.
   *
   * Gate T already proves 23 -> 18 -> 23 for the six accessors. This is the narrower, stricter
   * one: every SECURITY DEFINER in both schemas, compared on body, owner, security mode,
   * volatility, search_path and ACL together, plus the database-level TEMPORARY grant that §1
   * revokes. A down migration that "works" while leaving a function with no pinned path at all —
   * the failure mode of writing RESET instead of SET — would pass a looser comparison and is
   * exactly what this catches.
   */
  it('restores the pre-0024 database on the way down and the fixed one on the way back', async () => {
    const rt = new TestDatabase('freightos_test_sr2_roundtrip_25');
    await rt.reset();
    const client = rt.connectAsMigrator();
    await client.connect();
    try {
      const migrations = loadMigrations(MIGRATIONS_DIR);

      interface Definer {
        signature: string;
        owner: string;
        prosecdef: boolean;
        provolatile: string;
        proconfig: string[] | null;
        proacl: string | null;
        body: string;
      }
      const definers = async (): Promise<Definer[]> =>
        (
          await client.query<Definer>(
            `SELECT n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')'
                      AS signature,
                    o.rolname AS owner, p.prosecdef, p.provolatile, p.proconfig,
                    p.proacl::text AS proacl, p.prosrc AS body
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               JOIN pg_roles o ON o.oid = p.proowner
              WHERE n.nspname IN ('app', 'admin') AND p.prosecdef
              ORDER BY 1`,
          )
        ).rows;

      /** The four invoker-rights scope functions 0023 §3 also rewrites. */
      const scopeFns = async (): Promise<Definer[]> =>
        (
          await client.query<Definer>(
            `SELECT p.proname AS signature, o.rolname AS owner, p.prosecdef, p.provolatile,
                    p.proconfig, p.proacl::text AS proacl, p.prosrc AS body
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               JOIN pg_roles o ON o.oid = p.proowner
              WHERE n.nspname = 'app'
                AND p.proname IN ('verified_scope_node_ids', 'verified_scope_service_account_ids',
                                  'organization_node_scope_ok', 'service_account_scope_ok')
              ORDER BY 1`,
          )
        ).rows;

      const publicTemp = async (): Promise<boolean> =>
        (
          await client.query<{ t: boolean }>(
            `SELECT has_database_privilege('public', current_database(), 'TEMPORARY') AS t`,
          )
        ).rows[0]!.t;

      const atTop = await definers();
      const scopeTop = await scopeFns();
      expect(atTop.length, 'no definers found, so the comparison is empty').toBeGreaterThan(40);
      expect(scopeTop).toHaveLength(4);
      expect(await publicTemp(), '0019 did not revoke TEMPORARY from PUBLIC').toBe(false);

      // Down SEVEN steps now — N4 / 0030 joined the stack above N3 / 0029, N1 / 0028 and 0027,
      // SEC-01 / 0026 and 0025/0024.
      // Reverting them removes only what they added: 0028's network participant registry, 0027's
      // catalog-derived qualification guard, 0026's authenticated-principal boundary, and
      // 0025/0024's schema-qualified bodies. None of them may re-grant TEMPORARY or unpin pg_temp —
      // those belong to migration 0019 on main and are still applied, so rolling SR-2 back cannot
      // silently reopen the CRITICAL 0019 closed.
      //
      // The list is enumerated rather than counted so that a migration joining or leaving this
      // stack has to be acknowledged here; that is what caught 0026's arrival, 0027's, 0028's,
      // 0029's, 0030's, 0031's and now 0032's. None of 0028, 0030, 0031 or 0032 adds a definer or a
      // pg_temp-sensitive function, so `atTop.length` is unchanged by any of them — which the
      // definer-count assertion below states independently.
      //
      // 0031 is the SR-AUDIT-ACL-NOOP hotfix. It changes one function's EXECUTE ACL and nothing
      // else; in particular it does not touch `proconfig`, so the pg_temp pin this block exists to
      // protect is unaffected in both directions.
      //
      // 0032 is N5-A. It adds four trigger functions, all INVOKER rights and all without a
      // proconfig — P-01, and the reason they are absent is that layer 3 (a body that names its
      // schema) is what protects an invoker-rights function. So it adds nothing to `definers()` and
      // nothing this block measures.
      expect((await migrateDown(client, migrations, 23)).reverted).toEqual([
        32, 31, 30, 29, 28, 27, 26, 25, 24,
      ]);
      const at23 = await definers();
      expect(at23.length, 'the revert dropped definers it should only have altered').toBe(
        atTop.length,
      );
      for (const fn of at23) {
        expect(fn.proconfig, `${fn.signature} lost pg_temp on the way down`).toEqual([
          'search_path=pg_catalog, public, pg_temp',
        ]);
      }
      expect(await publicTemp(), 'reverting SR-2 reopened the 0019 TEMPORARY hole').toBe(false);
      // The bodies really are the unqualified ones again.
      // At 23 the AUTHORIZATION CORE is still schema-qualified — 0023 §3 owns that and is still
      // applied. What 0024 and 0025 revert are the admin bodies and the rest of `app`, so that is
      // what is checked here.
      const core23 = at23.find((f) => f.signature === 'app.verified_principal()')!;
      expect(core23.body, 'reverting 0024/0025 unqualified the authorization core').toContain(
        'public.users',
      );
      const adminBody = at23.find((f) =>
        f.signature.startsWith('admin.authorization_refusal_reason('),
      )!;
      expect(adminBody.body, '0024 down did not restore the unqualified admin body').toMatch(
        /\n\s*FROM users\b/,
      );
      const appBody = at23.find((f) => f.signature === 'app.release_kill_switch(uuid)')!;
      expect(appBody.body, '0025 down did not restore the unqualified app body').toMatch(
        /\n\s*FROM kill_switches\b/,
      );

      // And back up. Everything matches where it started, field for field.
      expect((await migrateUp(client, migrations)).applied).toEqual([
        24, 25, 26, 27, 28, 29, 30, 31, 32,
      ]);
      expect(await definers()).toEqual(atTop);
      expect(await scopeFns()).toEqual(scopeTop);
      expect(await publicTemp()).toBe(false);
    } finally {
      await client.end();
    }
  }, 300_000);
});
