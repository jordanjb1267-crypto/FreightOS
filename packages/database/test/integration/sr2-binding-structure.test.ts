import { beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { loadMigrations, migrateDown, migrateUp } from '../../src/migrator.ts';
import { MIGRATIONS_DIR } from '../../src/paths.ts';
import { TestDatabase } from './harness.ts';

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

/** Every function migration 0019 owns, by exact signature. */
const SR2_FUNCTIONS = [
  'app.verified_binding_context()',
  'app.verified_binding_tenant_scope()',
  'app.verified_binding_node_scope_ok(uuid)',
  'app.verified_principal()',
  'app.begin_verified_session(uuid)',
  'admin.issue_session_binding(text,uuid,uuid,uuid,uuid,text,text,integer,text,integer)',
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
      'admin.issue_session_binding(text,uuid,uuid,uuid,uuid,text,text,integer,text,integer)':
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
      'admin.issue_session_binding(text,uuid,uuid,uuid,uuid,text,text,integer,text,integer)':
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
// GATE T — 18 -> 19 -> 18 restores the captured pre-0019 state.
// ---------------------------------------------------------------------------

describe('gate T — down migration restores 0018 exactly', () => {
  /** The six accessors as `docs/security-resilience/sr2-baseline/pre-0019-accessors.sql` captured. */
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
          expect(fn.proconfig).toEqual(['search_path=pg_catalog, public']);
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
      roles: await one(
        `SELECT format('%s super=%s login=%s bypassrls=%s createdb=%s createrole=%s inherit=%s',
                       rolname, rolsuper, rolcanlogin, rolbypassrls, rolcreatedb, rolcreaterole,
                       rolinherit) AS line
           FROM pg_roles WHERE rolname LIKE 'freightos%' ORDER BY rolname`,
      ),
      memberships: await one(
        `SELECT format('%s->%s admin=%s inherit=%s set=%s',
                       role.rolname, member.rolname, am.admin_option, am.inherit_option,
                       am.set_option) AS line
           FROM pg_auth_members am
           JOIN pg_roles role ON role.oid = am.roleid
           JOIN pg_roles member ON member.oid = am.member
          WHERE role.rolname LIKE 'freightos%' ORDER BY 1`,
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
    } finally {
      await client.end();
    }
  }, 300_000);
});

/**
 * Gate X — the Layer B primitives 0020 added, and who may reach them.
 *
 * The adversarial rereview found `app.verified_binding_scope_node_ids()` shipping with the PUBLIC
 * EXECUTE a new function gets by default, while 0019 §9 had revoked PUBLIC from every one of its
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
 * The durable half of migration 0022.
 *
 * §4 of that migration asserts the same property, but it asserts it ONCE, at the moment 0022 runs.
 * A definer added by migration 0023 would carry PostgreSQL's ordinary `pg_catalog, public` pin,
 * reopen the class, and pass every check in the suite — which is exactly how F-01 survived four
 * migrations. This is the check that does not expire.
 *
 * It is deliberately a WHOLE-SCHEMA sweep with no allowlist. An exemption list is the mechanism by
 * which this defect returns: the first draft of 0022's own remediation enumerated the functions by
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
   * 24 -> 23 -> 24, at full fidelity over everything the SR-2 migrations touch.
   *
   * Gate T already proves 22 -> 18 -> 22 for the six accessors. This is the narrower, stricter
   * one: every SECURITY DEFINER in both schemas, compared on body, owner, security mode,
   * volatility, search_path and ACL together, plus the database-level TEMPORARY grant that §1
   * revokes. A down migration that "works" while leaving a function with no pinned path at all —
   * the failure mode of writing RESET instead of SET — would pass a looser comparison and is
   * exactly what this catches.
   */
  it('restores the pre-0024 database on the way down and the fixed one on the way back', async () => {
    const rt = new TestDatabase('freightos_test_sr2_roundtrip_24');
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

      /** The four invoker-rights scope functions 0022 §3 also rewrites. */
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

      const at22 = await definers();
      const scope22 = await scopeFns();
      expect(at22.length, 'no definers found, so the comparison is empty').toBeGreaterThan(40);
      expect(scope22).toHaveLength(4);
      expect(await publicTemp(), '0019 did not revoke TEMPORARY from PUBLIC').toBe(false);

      // Down one step. Reverting 0023 removes only what 0023 added — the schema-qualified bodies.
      // It must NOT re-grant TEMPORARY or unpin pg_temp: those belong to migration 0019 on main and
      // are still applied, so rolling SR-2 back cannot silently reopen the CRITICAL 0019 closed.
      expect((await migrateDown(client, migrations, 23)).reverted).toEqual([24]);
      const at21 = await definers();
      expect(at21.length, 'the revert dropped definers it should only have altered').toBe(
        at22.length,
      );
      for (const fn of at21) {
        expect(fn.proconfig, `${fn.signature} lost pg_temp on the way down`).toEqual([
          'search_path=pg_catalog, public, pg_temp',
        ]);
      }
      expect(await publicTemp(), 'reverting SR-2 reopened the 0019 TEMPORARY hole').toBe(false);
      // The bodies really are the unqualified ones again.
      // At 23 the AUTHORIZATION CORE is still schema-qualified — 0023 §3 owns that and is still
      // applied. What 0024's down reverts is the ADMIN bodies, so that is what is checked here.
      const core23 = at21.find((f) => f.signature === 'app.verified_principal()')!;
      expect(core23.body, 'reverting 0024 unqualified the authorization core').toContain(
        'public.users',
      );
      const adminBody = at21.find((f) =>
        f.signature.startsWith('admin.authorization_refusal_reason('),
      )!;
      expect(adminBody.body, '0024 down did not restore the unqualified admin body').toMatch(
        /\n\s*FROM users\b/,
      );

      // And back up. Everything 0022 touches matches where it started, field for field.
      expect((await migrateUp(client, migrations)).applied).toEqual([24]);
      expect(await definers()).toEqual(at22);
      expect(await scopeFns()).toEqual(scope22);
      expect(await publicTemp()).toBe(false);
    } finally {
      await client.end();
    }
  }, 300_000);
});
