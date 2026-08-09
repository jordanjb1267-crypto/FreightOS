import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestDatabase } from './harness.ts';

/**
 * THE PRIVILEGED SCHEMA SEARCH-PATH INVARIANT.
 *
 *   A security-owner schema must not appear on the search_path of any application or
 *   SECURITY DEFINER function, and nothing outside a function may put one there either.
 *
 * WHY THIS FILE EXISTS. The B-1 remediation (migration 0027) derives its protected-relation
 * inventory from RLS, and that inventory deliberately does not classify every security-sensitive
 * relation: `admin.platform_actor` and `admin.privileged_operation` carry the platform-actor
 * allowlist and the privileged-operation ledger, and RLS is enabled on neither. The external
 * rereview accepted that on the strength of three structural facts:
 *
 *   1. every current reference to them is written `admin.<name>`;
 *   2. no application or definer search_path contains schema `admin`;
 *   3. `freightos_app` holds no USAGE on schema `admin`.
 *
 * Facts 1 and 3 are already asserted — 1 by `app.unqualified_authority_reads()` via 0027 §4(c) and
 * `sr2-definer-body-qualification.test.ts`, 3 by `hotfix-pg-temp-shadowing.test.ts`. Fact 2 was a
 * REVIEWED STRUCTURAL FACT AND NOTHING MORE. This file makes it executable, which is the whole
 * point: a safety argument that lives only in a review comment decays the first time somebody adds
 * a `SET search_path` without reading it.
 *
 * WHY THE INVENTORY IS DERIVED AND NOT LISTED. Twice now a hand-written security inventory in this
 * repository has been wrong in both directions at once — 0025's protected-relation list named three
 * relations that do not exist while omitting four that do, and every search_path sweep in the suite
 * hardcodes `nspname IN ('app','admin')`, which silently exempted schema `authn` from the moment
 * 0026 created it. So the protected set is computed: a SECURITY-OWNER SCHEMA is a non-system schema
 * owned by a NOLOGIN, non-system role. Today that yields exactly {admin, authn}, and a future
 * privileged schema created under a NOLOGIN owner joins it with no edit here.
 *
 * WHY `app` AND `public` ARE NOT IN IT, THOUGH BOTH HOLD PRIVILEGED OBJECTS. This is the crux, and
 * getting it wrong makes the invariant unsatisfiable rather than merely weak.
 *
 *   `public` holds nineteen of the twenty-one relations 0027 derives as protected — roles,
 *   permissions, memberships, users, service_account_credentials, kill_switches, audit_events. By
 *   content it is the most privileged schema in the database. It is also the SECOND ENTRY of the
 *   pinned path of all fifty-two definers, and it has to be: those definers exist to read exactly
 *   those relations. `app` holds `app.session_binding`, which is definer-only binding state.
 *
 * So "may not appear on a search_path" and "contains privileged objects" are different questions,
 * and only conflating them makes this look impossible. The boundary that actually holds is
 * ownership: `admin` and `authn` are owned by NOLOGIN roles that exist to own them and nothing else,
 * no runtime role can resolve a name in them, and every reference to them is qualified. `app` and
 * `public` are the runtime call surface and the data schema; their privileged OBJECTS are defended
 * by ACL (four relations are unreachable by every runtime and deploy role) and by layer-3
 * qualification, not by keeping their schema off the path.
 *
 * WHAT THIS FILE DOES NOT DO. It does not widen 0027's detector, and it does not restate the
 * exact-equality pin that `sr2-definer-body-qualification.test.ts` already asserts. The walls stay
 * independent: ACL reachability, layer-3 qualification, pg_temp ordering, and — added here — name
 * resolution.
 */
const db = new TestDatabase('freightos_test_privileged_search_path');

let su: Client;

beforeAll(async () => {
  await db.reset();
  su = db.connectAs('postgres');
  await su.connect();
}, 180_000);

afterAll(async () => {
  await su?.end();
});

/**
 * The derivation, as one SQL fragment, used by every assertion below.
 *
 * `r.rolname NOT LIKE 'pg\_%'` is load-bearing rather than decoration: schema `public` is owned by
 * `pg_database_owner`, which is itself a NOLOGIN role, so without that filter the derivation
 * returns `public` and the invariant becomes unsatisfiable on its own terms.
 */
const SECURITY_OWNER_SCHEMAS = `
  SELECT n.nspname AS schema_name, r.rolname AS owner
    FROM pg_namespace n
    JOIN pg_roles r ON r.oid = n.nspowner
   WHERE n.nspname NOT LIKE 'pg\\_%'
     AND n.nspname <> 'information_schema'
     AND NOT r.rolcanlogin
     AND r.rolname NOT LIKE 'pg\\_%'`;

/**
 * Every FreightOS routine, by OID, with its search_path element parsed into schema tokens.
 *
 * Three details carry the entire result, and each was measured against a live server rather than
 * assumed:
 *
 *   THE ELEMENT, NOT `proconfig::text`. proconfig is a GUC array. Matching against its rendering
 *   reports a violation for `{role=freightos_admin_owner,"search_path=..."}` on a perfectly clean
 *   path — and this repository has roles named `freightos_admin` and `freightos_admin_owner`, so
 *   that is not hypothetical.
 *
 *   TOKENS, NOT SUBSTRINGS. `path ~ 'admin'` is wrong in both directions: it fires on
 *   `administration` and `my_admin`, and it MISSES `ADMIN`, which PostgreSQL folds to schema admin.
 *   The quoted branch of the tokenizer absorbs leading whitespace on purpose — without it the
 *   alternation loses the race on ` "a,admin,b"` and splits one quoted identifier into three
 *   tokens, reintroducing the false positive it was written to remove.
 *
 *   `parse_ident`, NOT `lower()`. PostgreSQL's own identifier parser folds unquoted case and strips
 *   quotes with the exact rules the server uses: `ADMIN` and `"admin"` both become schema `admin`,
 *   while `"ADMIN"` is a different (and here nonexistent) schema and must not be flagged.
 */
const PARSED_PATHS = `
  WITH relevant AS (
    SELECT p.oid,
           p.oid::regprocedure::text AS signature,
           n.nspname AS schema_name,
           p.prosecdef,
           (SELECT substring(c FROM 'search_path=(.*)$')
              FROM unnest(coalesce(p.proconfig, '{}')) c
             WHERE c LIKE 'search\\_path=%') AS path
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
     WHERE n.nspname NOT LIKE 'pg\\_%'
       AND n.nspname <> 'information_schema'
       AND l.lanname IN ('sql', 'plpgsql')
  )
  SELECT r.signature, r.schema_name, r.prosecdef, r.path, t.ord,
         CASE WHEN btrim(t.m[1]) IN ('"$user"', '$user')
              THEN '$user'
              ELSE (pg_catalog.parse_ident(btrim(t.m[1])))[1]
         END AS element
    FROM relevant r
    CROSS JOIN LATERAL regexp_matches(r.path, '[[:space:]]*"(?:[^"]|"")*"|[^,]+', 'g')
              WITH ORDINALITY AS t(m, ord)
   WHERE r.path IS NOT NULL`;

describe('the security-owner schema inventory is derived from the catalog, never listed', () => {
  it('derives a non-empty set, and it is exactly the NOLOGIN-owned schemas', async () => {
    const r = await su.query<{ schema_name: string; owner: string }>(
      `${SECURITY_OWNER_SCHEMAS} ORDER BY 1`,
    );
    const schemas = r.rows.map((x) => x.schema_name);

    // Non-emptiness first. Every assertion in this file is quantified over this set, so an empty
    // one would make all of them pass by having nothing to check.
    expect(schemas.length, 'the security-owner schema set is empty').toBeGreaterThan(0);
    expect(schemas).toEqual(['admin', 'authn']);
    expect(r.rows.map((x) => `${x.schema_name} owned by ${x.owner}`)).toEqual([
      'admin owned by freightos_admin_owner',
      'authn owned by freightos_operator_registry_owner',
    ]);
  });

  it('excludes app and public, and records why — they must stay resolvable', async () => {
    const r = await su.query<{ schema_name: string }>(`${SECURITY_OWNER_SCHEMAS}`);
    const schemas = r.rows.map((x) => x.schema_name);

    // Not an oversight. `public` is the second entry of every pinned path and holds nineteen of the
    // twenty-one protected relations; `app` is the runtime call surface. Classifying either as a
    // security-owner schema would make this file's own invariant unsatisfiable — see the header.
    expect(
      schemas,
      'public was classified security-owner; the invariant is now unsatisfiable',
    ).not.toContain('public');
    expect(
      schemas,
      'app was classified security-owner; the invariant is now unsatisfiable',
    ).not.toContain('app');

    // And the reason they are excluded is ownership by a LOGIN or system role, which is the rule —
    // not a carve-out written next to it.
    const owners = await su.query<{ schema_name: string; owner: string; canlogin: boolean }>(
      `SELECT n.nspname AS schema_name, r.rolname AS owner, r.rolcanlogin AS canlogin
         FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner
        WHERE n.nspname IN ('app', 'public') ORDER BY 1`,
    );
    expect(owners.rows.map((x) => `${x.schema_name}:${x.owner}:${x.canlogin}`)).toEqual([
      'app:freightos_migrator:true',
      'public:pg_database_owner:false',
    ]);
  });

  it('holds the two relations the RLS-derived detector does not classify', async () => {
    // The concrete reason this invariant matters. These two are security-sensitive and outside
    // app.protected_authority_relations() on BOTH of its criteria — RLS is off, and `admin` is not
    // in its schema list — so layer 3 would not catch an unqualified read of either. Keeping
    // schema `admin` off every search_path is what makes an unqualified read unable to resolve.
    const r = await su.query<{ rel: string; rls: boolean }>(
      `SELECT n.nspname || '.' || c.relname AS rel, c.relrowsecurity AS rls
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN (SELECT schema_name FROM (${SECURITY_OWNER_SCHEMAS}) s)
          AND c.relkind = 'r' ORDER BY 1`,
    );
    expect(r.rows.map((x) => x.rel)).toEqual([
      'admin.platform_actor',
      'admin.privileged_operation',
      'authn.operator_binding',
    ]);
    // Two of the three have no RLS at all — which is exactly why they are outside 0027's detector.
    expect(r.rows.filter((x) => !x.rls).map((x) => x.rel)).toEqual([
      'admin.platform_actor',
      'admin.privileged_operation',
    ]);
  });
});

describe('no FreightOS routine admits a security-owner schema to its search_path', () => {
  it('sweeps a real population — otherwise the zero below means nothing', async () => {
    const r = await su.query<{ total: string; pinned: string; definers: string }>(
      `SELECT count(*)::text AS total,
              count(*) FILTER (WHERE p.proconfig IS NOT NULL)::text AS pinned,
              count(*) FILTER (WHERE p.prosecdef)::text AS definers
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         JOIN pg_language l ON l.oid = p.prolang
        WHERE n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema'
          AND l.lanname IN ('sql', 'plpgsql')`,
    );
    expect(Number(r.rows[0]!.total), 'no FreightOS routines found').toBeGreaterThanOrEqual(87);
    expect(Number(r.rows[0]!.definers), 'no SECURITY DEFINERs found').toBeGreaterThanOrEqual(52);
    expect(Number(r.rows[0]!.pinned), 'no function carries a search_path').toBeGreaterThanOrEqual(
      53,
    );
  });

  it('finds no security-owner schema on any function search_path', async () => {
    const r = await su.query<{ signature: string; path: string; element: string }>(
      `SELECT signature, path, element FROM (${PARSED_PATHS}) parsed
        WHERE element IN (SELECT schema_name FROM (${SECURITY_OWNER_SCHEMAS}) s)
        ORDER BY 1, ord`,
    );
    expect(
      r.rows.map((x) => `${x.signature} => ${x.path} (names ${x.element})`),
      'a function can resolve a bare name inside a security-owner schema',
    ).toEqual([]);
  });

  it('finds no $user on any function search_path', async () => {
    // `$user` is not a literal. It resolves against CURRENT_USER when the path is computed, so a
    // path containing it cannot be audited by reading the catalog: inside a SECURITY DEFINER it
    // resolves to the OWNER, and a login role named after a schema resolves to that schema. It is
    // banned outright rather than parsed.
    const r = await su.query<{ signature: string; path: string }>(
      `SELECT signature, path FROM (${PARSED_PATHS}) parsed WHERE element = '$user' ORDER BY 1`,
    );
    expect(
      r.rows.map((x) => `${x.signature} => ${x.path}`),
      'a function search_path defers to the session role, which cannot be audited statically',
    ).toEqual([]);
  });

  it('DETECTS an injected violation — three shapes, each of which has to fire', async () => {
    // The assertion above is worthless unless it can fail. Each probe is a shape a real regression
    // would take, and `ADMIN` and `"admin"` are here because PostgreSQL folds both to schema admin
    // while a substring or case-sensitive rule would miss one or the other.
    const probes: Array<[string, string]> = [
      ['zz_sp_definer', `SECURITY DEFINER SET search_path = pg_catalog, admin, public, pg_temp`],
      ['zz_sp_invoker', `SET search_path = authn`],
      ['zz_sp_upper', `SECURITY DEFINER SET search_path = pg_catalog, ADMIN, pg_temp`],
      ['zz_sp_quoted', `SECURITY DEFINER SET search_path = pg_catalog, "admin", pg_temp`],
      ['zz_sp_user', `SECURITY DEFINER SET search_path = "$user", public`],
    ];
    try {
      for (const [name, clause] of probes) {
        await su.query(
          `CREATE FUNCTION app.${name}() RETURNS int LANGUAGE sql STABLE ${clause}
             AS $probe$ SELECT 1 $probe$`,
        );
      }

      const violations = await su.query<{ signature: string; element: string }>(
        `SELECT signature, element FROM (${PARSED_PATHS}) parsed
          WHERE signature LIKE 'app.zz\\_sp%'
            AND (element IN (SELECT schema_name FROM (${SECURITY_OWNER_SCHEMAS}) s)
                 OR element = '$user')
          ORDER BY 1`,
      );
      const caught = new Set(violations.rows.map((x) => x.signature.replace(/\(.*$/, '')));
      for (const [name] of probes) {
        expect(caught, `the gate missed app.${name}`).toContain(`app.${name}`);
      }
    } finally {
      for (const [name] of probes) {
        await su.query(`DROP FUNCTION IF EXISTS app.${name}()`);
      }
    }

    const after = await su.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM (${PARSED_PATHS}) parsed
        WHERE signature LIKE 'app.zz\\_sp%'`,
    );
    expect(Number(after.rows[0]!.n), 'the probes were not cleaned up').toBe(0);
  });

  it('does NOT fire on a schema name that merely contains a protected one', async () => {
    // The other half. A rule that flags everything reports zero real violations for the rest of
    // time, and would be "fixed" by loosening it. `"ADMIN"` is included deliberately: quoted, it is
    // a DIFFERENT schema from `admin`, and flagging it would be wrong.
    const clean: Array<[string, string]> = [
      ['zz_ok_plain', `SET search_path = pg_catalog, public, pg_temp`],
      ['zz_ok_substring', `SET search_path = pg_catalog, public, pg_temp`],
      ['zz_ok_upper_quoted', `SET search_path = pg_catalog, "ADMIN", public`],
    ];
    try {
      for (const [name, clause] of clean) {
        await su.query(
          `CREATE FUNCTION app.${name}() RETURNS int LANGUAGE sql STABLE ${clause}
             AS $probe$ SELECT 1 $probe$`,
        );
      }
      const fired = await su.query<{ signature: string; element: string }>(
        `SELECT signature, element FROM (${PARSED_PATHS}) parsed
          WHERE signature LIKE 'app.zz\\_ok%'
            AND (element IN (SELECT schema_name FROM (${SECURITY_OWNER_SCHEMAS}) s)
                 OR element = '$user')`,
      );
      expect(
        fired.rows.map((x) => `${x.signature} flagged for ${x.element}`),
        'the gate fires on a name that is not a security-owner schema',
      ).toEqual([]);

      // …and prove the tokenizer actually saw those paths, so the pass above is not "no rows".
      const seen = await su.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM (${PARSED_PATHS}) parsed
          WHERE signature LIKE 'app.zz\\_ok%'`,
      );
      expect(
        Number(seen.rows[0]!.n),
        'the tokenizer produced no elements for the clean probes',
      ).toBeGreaterThanOrEqual(clean.length * 3);
    } finally {
      for (const [name] of clean) {
        await su.query(`DROP FUNCTION IF EXISTS app.${name}()`);
      }
    }
  });
});

describe('nothing outside a function can put a security-owner schema on the path', () => {
  it('has no role, database or role-in-database search_path setting at all', async () => {
    // pg_db_role_setting carries all three levels; which one a row belongs to is decided by which
    // of setrole/setdatabase is zero. Reporting the whole row rather than grepping for
    // 'search_path' is deliberate: `ALTER ROLE freightos_app SET default_transaction_isolation`
    // lands in this same catalog and would break the verified-session mechanism, so an unexpected
    // row of ANY kind is worth failing on.
    const r = await su.query<{ level: string; role: string; db: string; setting: string }>(
      `SELECT CASE WHEN s.setrole <> 0 AND s.setdatabase <> 0 THEN 'role-in-database'
                   WHEN s.setrole <> 0                        THEN 'role'
                   ELSE                                            'database' END AS level,
              coalesce(r.rolname, '(all roles)')     AS role,
              coalesce(d.datname, '(all databases)') AS db,
              s.setconfig::text                      AS setting
         FROM pg_db_role_setting s
         LEFT JOIN pg_roles r ON r.oid = s.setrole
         LEFT JOIN pg_database d ON d.oid = s.setdatabase
        ORDER BY 1, 2, 3`,
    );
    expect(
      r.rows.map((x) => `${x.level} ${x.role}@${x.db} => ${x.setting}`),
      'a role or database setting exists; check whether it reaches a security-owner schema',
    ).toEqual([]);
  });

  it('has no role whose NAME is a security-owner schema — the $user route', async () => {
    // The cleanest evasion of a catalog-only rule, and it needs no SET clause anywhere. The
    // built-in default path is `"$user", public`; `$user` resolves to the session role name, so a
    // LOGIN role named `admin` gets schema admin at the front of its own path — and schema admin
    // grants USAGE to freightos_admin, so it would resolve. Operator role names are issued out of
    // band (SEC01_OPERATOR_LIFECYCLE §2), which is precisely why this is asserted here.
    const r = await su.query<{ rolname: string }>(
      `SELECT r.rolname FROM pg_roles r
        WHERE r.rolname IN (SELECT schema_name FROM (${SECURITY_OWNER_SCHEMAS}) s) ORDER BY 1`,
    );
    expect(
      r.rows.map((x) => x.rolname),
      'a role is named after a security-owner schema, so "$user" resolves to it',
    ).toEqual([]);
  });

  it('leaves the cluster default path free of security-owner schemas', async () => {
    // The floor every unpinned invoker-rights function runs on. P-01 forbids giving those a
    // proconfig — a SET clause blocks SQL inlining, which the RLS predicates depend on — so this
    // default IS their search_path and no function-level assertion can cover them.
    const r = await su.query<{ setting: string; source: string }>(
      `SELECT setting, source FROM pg_settings WHERE name = 'search_path'`,
    );
    const setting = r.rows[0]!.setting;
    expect(setting).toBe('"$user", public');

    const named = await su.query<{ element: string }>(
      `SELECT CASE WHEN btrim(t.m[1]) IN ('"$user"', '$user') THEN '$user'
                   ELSE (pg_catalog.parse_ident(btrim(t.m[1])))[1] END AS element
         FROM regexp_matches($1, '[[:space:]]*"(?:[^"]|"")*"|[^,]+', 'g')
              WITH ORDINALITY AS t(m, ord)`,
      [setting],
    );
    const elements = named.rows.map((x) => x.element);
    expect(elements.length, 'the default path parsed to nothing').toBeGreaterThan(0);
    expect(elements.filter((e) => e === 'admin' || e === 'authn')).toEqual([]);
  });

  it('gives no runtime role USAGE on a security-owner schema, so a name there cannot resolve', async () => {
    // The backstop that makes the whole argument hold even if a path did name one: resolution
    // requires USAGE. Asserted here rather than assumed, and scoped to the roles a request can
    // actually arrive on.
    const r = await su.query<{ role: string; schema_name: string }>(
      `SELECT c AS role, s.schema_name
         FROM unnest(ARRAY['freightos_app', 'freightos_control_plane']) AS c,
              (${SECURITY_OWNER_SCHEMAS}) s
        WHERE has_schema_privilege(c, s.schema_name, 'USAGE')
        ORDER BY 1, 2`,
    );
    expect(
      r.rows.map((x) => `${x.role} has USAGE on ${x.schema_name}`),
      'a runtime role can resolve names inside a security-owner schema',
    ).toEqual([]);
  });
});
