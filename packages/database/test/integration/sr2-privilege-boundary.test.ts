import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestDatabase } from './harness.ts';

/**
 * SR-2 — the EXECUTE privilege boundary on the administrative surface.
 *
 * There are three separate questions here and they fail independently, so this file keeps them
 * apart rather than collapsing them into one "the ACLs are fine" assertion:
 *
 *   1. CURRENT OBJECT ACL     — what the functions that exist right now are reachable by.
 *   2. DEFAULT CREATION ACL   — what pg_default_acl says the NEXT function will be reachable by.
 *   3. CREATION-PATH REGRESSION — what a function created through the real creation path actually
 *                                 comes out with.
 *
 * (1) passing says nothing about (2): a default privilege changes no object that already exists.
 * (2) passing says nothing about (3): an entry can exist and still be scoped so that it cannot
 * subtract from the built-in default. Only (3) closes the loop, and only (3) fails if someone
 * later removes 0026 §6c.
 *
 * WHY THIS FILE EXISTS AT ALL. Migration 0026 §6 drops and recreates sixteen functions to remove
 * `p_actor`. `DROP FUNCTION` discards the ACL; `CREATE` then applies PostgreSQL's default, which
 * is EXECUTE TO PUBLIC. That regression shipped, made every administrative entry point
 * world-executable including the session-binding mint, and was caught by an unrelated role
 * inventory rather than by anything aimed at it. §6b repairs the sixteen. §6c stops the
 * seventeenth. This file is what notices if either is removed.
 *
 * A NOTE ON MEASURING PUBLIC. `proacl IS NULL` does not mean "no privileges" — it means "the
 * built-in default", which for functions INCLUDES PUBLIC EXECUTE. Reading the ACL text and
 * looking for `=X/` therefore passes vacuously on exactly the functions that are most exposed.
 * Every check below either goes through `has_function_privilege('public', ...)` or expands
 * `COALESCE(proacl, acldefault('f', proowner))`, both of which resolve the default correctly.
 */
const db = new TestDatabase('freightos_test_sr2_privilege_boundary');

/** The two roles that own SECURITY DEFINER functions created by 0026, and their default entries. */
const DEFINER_OWNERS = ['freightos_admin_owner', 'freightos_operator_registry_owner'] as const;

let su: Client;

beforeAll(async () => {
  await db.reset();
  su = db.connectAs('postgres');
  await su.connect();
}, 180_000);

afterAll(async () => {
  await su?.end();
});

describe('layer 1 — current object ACL', () => {
  it('no function in admin or authn is world-executable', async () => {
    const r = await su.query<{ f: string; acl: string | null }>(
      `SELECT p.oid::regprocedure::text AS f, p.proacl::text AS acl
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('admin', 'authn')
          AND has_function_privilege('public', p.oid, 'EXECUTE')`,
    );
    expect(r.rows.map((x) => `${x.f} ${x.acl ?? '(default)'}`)).toEqual([]);
  });

  it('the runtime role cannot reach the administrative surface', async () => {
    // freightos_app is the RLS-subject connection the application actually uses. It held nothing
    // in admin before 0026 and must hold nothing after it.
    const r = await su.query<{ f: string }>(
      `SELECT p.oid::regprocedure::text AS f
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('admin', 'authn')
          AND has_function_privilege('freightos_app', p.oid, 'EXECUTE')`,
    );
    expect(r.rows.map((x) => x.f)).toEqual([]);
  });

  it('the shared administrative credential reaches the entry points and nothing deeper', async () => {
    // A positive control for the two cases above: they would also pass on an empty schema. The
    // sixteen entry points must be reachable — a denial elsewhere in the suite has to be a
    // decision, not an absent privilege — while the internal helpers must not be.
    const reachable = await su.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'admin' AND has_function_privilege('freightos_admin', p.oid, 'EXECUTE')`,
    );
    expect(Number(reachable.rows[0]!.n)).toBe(16);

    const helpers = await su.query<{ f: string }>(
      `SELECT p.oid::regprocedure::text AS f
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'admin'
          AND p.proname IN ('deny', 'record', 'prior_success', 'claim_operation',
                            'publish_actor', 'refusal_reason', 'authorization_refusal_reason')
          AND has_function_privilege('freightos_admin', p.oid, 'EXECUTE')`,
    );
    expect(helpers.rows.map((x) => x.f)).toEqual([]);
  });

  it('the provisioning surface is reachable only by the deployment authority', async () => {
    const r = await su.query<{ f: string; role: string }>(
      `SELECT p.oid::regprocedure::text AS f, g.rolname AS role
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         CROSS JOIN (VALUES ('freightos_admin'), ('freightos_app'),
                            ('freightos_control_plane'), ('freightos_admin_owner')) AS v(rolname)
         JOIN pg_roles g ON g.rolname = v.rolname
        WHERE n.nspname = 'authn' AND p.proname LIKE 'provision%'
          AND has_function_privilege(g.rolname, p.oid, 'EXECUTE')`,
    );
    expect(r.rows.map((x) => `${x.role} -> ${x.f}`)).toEqual([]);

    const migrator = await su.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'authn' AND p.proname LIKE 'provision%'
          AND has_function_privilege('freightos_migrator', p.oid, 'EXECUTE')`,
    );
    expect(Number(migrator.rows[0]!.n), 'the deployment authority cannot provision').toBe(2);
  });
});

describe('layer 2 — default creation ACL', () => {
  it.each(DEFINER_OWNERS)('%s carries a GLOBAL default function privilege entry', async (role) => {
    // GLOBAL — defaclnamespace = 0 — is the whole point. PostgreSQL's EXECUTE-to-PUBLIC default
    // for functions is built in and global; an `IN SCHEMA` entry can only subtract from a
    // schema-scoped default, of which there is none, so the schema-scoped form writes no row and
    // protects nothing while reading exactly like protection.
    const r = await su.query<{ ns: number; acl: string }>(
      `SELECT d.defaclnamespace AS ns, d.defaclacl::text AS acl
         FROM pg_default_acl d
        WHERE d.defaclrole = $1::regrole AND d.defaclobjtype = 'f'`,
      [role],
    );
    expect(r.rowCount, `${role} has no default function privilege entry at all`).toBe(1);
    expect(r.rows[0]!.ns, 'the entry is schema-scoped, which cannot remove the global default').toBe(
      0,
    );
  });

  it.each(DEFINER_OWNERS)('PUBLIC holds nothing in %s default function privileges', async (role) => {
    const r = await su.query<{ priv: string }>(
      `SELECT a.privilege_type AS priv
         FROM pg_default_acl d
         CROSS JOIN LATERAL aclexplode(d.defaclacl) a
        WHERE d.defaclrole = $1::regrole AND d.defaclobjtype = 'f' AND a.grantee = 0`,
      [role],
    );
    expect(r.rows.map((x) => x.priv)).toEqual([]);
  });

  it('the default grants EXECUTE to nobody but the owner', async () => {
    // 0026 §6c deliberately does NOT pair the revoke with a default grant to freightos_admin: a
    // default grant would hand the shared runtime credential EXECUTE on every future
    // administrative function automatically, including one written to be unreachable from the
    // application. If someone adds one later, this fails and they have to argue for it.
    const r = await su.query<{ role: string; grantee: string; priv: string }>(
      `SELECT pg_get_userbyid(d.defaclrole) AS role,
              pg_get_userbyid(a.grantee) AS grantee, a.privilege_type AS priv
         FROM pg_default_acl d
         CROSS JOIN LATERAL aclexplode(d.defaclacl) a
        WHERE d.defaclobjtype = 'f' AND a.grantee <> d.defaclrole AND a.grantee <> 0`,
    );
    expect(r.rows.map((x) => `${x.role}: ${x.grantee} ${x.priv}`)).toEqual([]);
  });
});

describe('layer 3 — creation-path regression', () => {
  // This is the one that fails if 0026 §6c is removed. The two above would both still pass on a
  // database where the default had been dropped after the functions were created.
  const probes: { owner: string; schema: string; name: string }[] = [
    { owner: 'freightos_admin_owner', schema: 'admin', name: 'zz_creation_path_probe' },
    { owner: 'freightos_operator_registry_owner', schema: 'authn', name: 'zz_creation_path_probe' },
  ];

  /**
   * Create a function through the real migration creation path and report how it comes out.
   *
   * Everything happens on ONE connection inside ONE transaction that is always rolled back: the
   * function never exists for any other session and never survives the test. Reading the ACL from
   * a second connection would see nothing at all, which is how the first version of this test
   * managed to fail for a reason that had nothing to do with privileges.
   *
   * `undoHardening` runs immediately before the CREATE, in the same transaction, as the owner
   * role. It is how the positive control removes §6c and nothing else.
   */
  async function createAndMeasure(
    owner: string,
    schema: string,
    name: string,
    undoHardening = false,
  ): Promise<{ owner: string; publicExecute: boolean; appExecute: boolean; expanded: string[] }> {
    const migrator = db.connectAsMigrator();
    await migrator.connect();
    try {
      await migrator.query('BEGIN');
      await migrator.query(`SET LOCAL ROLE ${owner}`);
      if (undoHardening) {
        await migrator.query(
          `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} GRANT EXECUTE ON FUNCTIONS TO PUBLIC`,
        );
      }
      // No GRANT and no REVOKE. The question is what PostgreSQL does when the migration is
      // silent — which is exactly the situation that produced the regression §6b repairs.
      await migrator.query(
        `CREATE FUNCTION ${schema}.${name}() RETURNS int LANGUAGE sql AS 'SELECT 1'`,
      );
      await migrator.query('RESET ROLE');

      const acl = await migrator.query<{
        owner: string;
        public_execute: boolean;
        app_execute: boolean;
      }>(
        `SELECT pg_get_userbyid(p.proowner) AS owner,
                has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute,
                has_function_privilege('freightos_app', p.oid, 'EXECUTE') AS app_execute
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = $1 AND p.proname = $2`,
        [schema, name],
      );
      expect(acl.rowCount, 'the probe function was not created').toBe(1);

      // The same fact read the other way, through the expansion that resolves a NULL ACL to
      // PostgreSQL's default rather than mistaking it for "no grants". Grantee 0 is PUBLIC.
      const expanded = await migrator.query<{ grantee: string; priv: string }>(
        `SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
                a.privilege_type AS priv
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
          WHERE n.nspname = $1 AND p.proname = $2
          ORDER BY 1, 2`,
        [schema, name],
      );
      return {
        owner: acl.rows[0]!.owner,
        publicExecute: acl.rows[0]!.public_execute,
        appExecute: acl.rows[0]!.app_execute,
        expanded: expanded.rows.map((x) => `${x.grantee} ${x.priv}`),
      };
    } finally {
      await migrator.query('ROLLBACK').catch(() => undefined);
      await migrator.end();
    }
  }

  it.each(probes)(
    'a function created as $owner is not world-executable',
    async ({ owner, schema, name }) => {
      const r = await createAndMeasure(owner, schema, name);
      expect(r.owner).toBe(owner);
      expect(r.publicExecute, `a new ${owner} function is world-executable`).toBe(false);
      expect(r.appExecute, `a new ${owner} function is reachable by the runtime role`).toBe(false);
      expect(r.expanded).toEqual([`${owner} EXECUTE`]);
    },
  );

  it.each(probes)(
    'and IS world-executable as $owner with §6c undone — the control',
    async ({ owner, schema, name }) => {
      // The positive control, and the reason the assertion above is evidence rather than a
      // coincidence. Same role, same schema, same creation path, same transaction — the only
      // difference is that §6c's default privilege is reversed first. If this ever stops producing
      // a world-executable function, then something other than §6c is carrying the property and
      // the test above no longer proves what it claims.
      const r = await createAndMeasure(owner, schema, `${name}_control`, true);
      expect(r.publicExecute, 'undoing §6c did not restore PUBLIC EXECUTE').toBe(true);
      expect(r.expanded).toContain('PUBLIC EXECUTE');
    },
  );
});

/**
 * SEC-01 / 0026 — the role and grant boundary, as a whole.
 *
 * The layers above are about EXECUTE on functions. This block is the surrounding question the owner
 * ruling asks: what does the new role graph let anybody reach that it did not before, and can any
 * principal in the administrative path reach the registry that decides who it is?
 *
 * Everything here is read from the catalog. A boundary described in prose and asserted nowhere is
 * how the ACL regression in §6b survived a review in the first place.
 */
describe('the role and grant boundary — SEC-01', () => {
  /** Every role that participates in the administrative path, and the registry owner itself. */
  const BOUNDARY_ROLES = [
    'freightos_admin',
    'freightos_admin_owner',
    'freightos_app',
    'freightos_control_plane',
    'freightos_migrator',
    'freightos_operator_registry_owner',
  ] as const;

  it('gives no boundary role a cluster attribute that would defeat it', async () => {
    const r = await su.query<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      rolreplication: boolean;
    }>(
      `SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication
         FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname`,
      [[...BOUNDARY_ROLES]],
    );
    expect(r.rows.map((x) => x.rolname)).toEqual([...BOUNDARY_ROLES].sort());
    for (const role of r.rows) {
      // The migrator is the deployment authority and legitimately holds CREATEROLE — it provisions
      // operators. It must hold neither of the two that would make every RLS proof vacuous.
      expect(role.rolsuper, `${role.rolname} rolsuper`).toBe(false);
      expect(role.rolbypassrls, `${role.rolname} rolbypassrls`).toBe(false);
      expect(role.rolreplication, `${role.rolname} rolreplication`).toBe(false);
      if (role.rolname !== 'freightos_migrator') {
        expect(role.rolcreaterole, `${role.rolname} rolcreaterole`).toBe(false);
        expect(role.rolcreatedb, `${role.rolname} rolcreatedb`).toBe(false);
      }
    }
  });

  it('lets nothing in the administrative path reach the operator registry', async () => {
    // The registry decides who each administrative definer believes it is talking to. If any role
    // in that path could write it, the whole chain would be circular — which is precisely why the
    // registry is owned by a role that is not freightos_admin_owner.
    const reachers: string[] = [];
    for (const role of ['freightos_admin', 'freightos_app', 'freightos_control_plane',
                        'freightos_admin_owner']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REFERENCES', 'TRIGGER']) {
        const r = await su.query<{ ok: boolean }>(
          `SELECT has_table_privilege($1, 'authn.operator_binding', $2) AS ok`,
          [role, privilege],
        );
        if (r.rows[0]!.ok) reachers.push(`${role}:${privilege}`);
      }
      const usage = await su.query<{ ok: boolean }>(
        `SELECT has_schema_privilege($1, 'authn', 'USAGE') AS ok`,
        [role],
      );
      // freightos_admin_owner legitimately holds USAGE — its definers call the resolver. USAGE on
      // the schema is not privilege on the table, which is the distinction the row above measures.
      if (usage.rows[0]!.ok && role !== 'freightos_admin_owner') reachers.push(`${role}:USAGE`);
    }
    expect(reachers).toEqual([]);
  });

  it('gives no role CREATE on schema authn, including its own owner path', async () => {
    const r = await su.query<{ rolname: string }>(
      `SELECT rolname FROM pg_roles
        WHERE rolname LIKE 'freightos%'
          AND rolname <> 'freightos_operator_registry_owner'
          AND has_schema_privilege(rolname, 'authn', 'CREATE')`,
    );
    expect(r.rows.map((x) => x.rolname)).toEqual([]);
  });

  it('keeps the registry read door role-disjoint from every other policy', async () => {
    // 0026 §2b adds a SELECT policy on public.users for the registry owner. A PERMISSIVE policy
    // only applies to the roles it names, so this widens nothing for anybody else — but that is an
    // argument, and the thing to assert is that the role appears in exactly one policy in the whole
    // database and that no other policy gained it.
    const r = await su.query<{ schemaname: string; tablename: string; policyname: string }>(
      `SELECT schemaname, tablename, policyname FROM pg_policies
        WHERE 'freightos_operator_registry_owner' = ANY(roles) ORDER BY 1, 2, 3`,
    );
    expect(r.rows.map((x) => `${x.schemaname}.${x.tablename}:${x.policyname}`)).toEqual([
      'public.users:users_operator_registry_read',
    ]);

    // And that policy names it alone — a policy listing it beside another role would give that
    // other role the registry owner's reach.
    const roles = await su.query<{ roles: string }>(
      `SELECT roles::text AS roles FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'users'
          AND policyname = 'users_operator_registry_read'`,
    );
    expect(roles.rows[0]!.roles).toBe('{freightos_operator_registry_owner}');
  });

  it('grants the provisioning surface to the deployment authority and to nobody else', async () => {
    const r = await su.query<{ f: string; grantee: string }>(
      `SELECT p.oid::regprocedure::text AS f, pg_get_userbyid(acl.grantee) AS grantee
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
        WHERE n.nspname = 'authn' AND acl.privilege_type = 'EXECUTE'
          AND acl.grantee <> p.proowner
        ORDER BY 1, 2`,
    );
    // Enumerated exactly rather than filtered by rule, so a new grantee has to be added here
    // deliberately. The split is the property:
    //
    //   * the RESOLVER is callable by the three definer owners whose functions have to resolve a
    //     principal — freightos_admin_owner for the sixteen administrative entry points, and
    //     freightos_binding_owner and freightos_hierarchy_owner for the accessors 0026 §8 rewrote
    //     to prefer the authenticated principal over the raw GUC. Reading a principal is not
    //     authority over the registry, which is what the table-privilege test above measures.
    //   * PROVISIONING is callable by the deployment authority and by nothing else. Any role that
    //     could call it could bind itself to any human in any tenant, which is the whole finding.
    expect(r.rows.map((x) => `${x.grantee} -> ${x.f}`)).toEqual([
      'freightos_admin_owner -> authn.authenticated_principal()',
      'freightos_binding_owner -> authn.authenticated_principal()',
      'freightos_hierarchy_owner -> authn.authenticated_principal()',
      'freightos_migrator -> authn.provision_operator(name,uuid,uuid,text)',
      'freightos_migrator -> authn.provision_service_login(name,text,text)',
      'freightos_migrator -> authn.revoke_operator(name,text)',
    ]);

    // And nothing in the administrative path can provision, said as its own assertion because it is
    // the one that matters most: an entry point that could mint a binding could mint its own.
    const provisioners = r.rows.filter((x) => !x.f.startsWith('authn.authenticated_principal'));
    expect([...new Set(provisioners.map((x) => x.grantee))]).toEqual(['freightos_migrator']);
  });

  it('keeps the definer owners unable to log in', async () => {
    const r = await su.query<{ rolname: string }>(
      `SELECT DISTINCT o.rolname
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         JOIN pg_roles o ON o.oid = p.proowner
        WHERE n.nspname IN ('admin', 'authn') AND p.prosecdef AND o.rolcanlogin
        ORDER BY 1`,
    );
    expect(r.rows.map((x) => x.rolname)).toEqual([]);
  });
});
