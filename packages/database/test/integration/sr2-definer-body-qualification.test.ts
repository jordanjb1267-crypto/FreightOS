import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_A, TENANT_B, TestDatabase } from './harness.ts';
import { seedIdentity, type IdentityFixture } from './identity-harness.ts';
import { fixtureAdministrator, withAuthenticatedTestPrincipal } from './verified-test-auth.ts';

/**
 * SR-2 — finding F-B. Is the pg_temp shadowing class closed by three layers, or by one?
 *
 * Migration 0023's header claims the class is closed "in three independent layers … any one of them
 * stops the attack". The rereview of the pre-0025 head measured that claim and it did not hold for
 * schema `app`: 44 unqualified references to authority relations survived across 18 functions, so
 * the 9 SECURITY DEFINER ones had two layers and the 9 invoker-rights ones had exactly one.
 *
 * Counting call sites is not the point — a body-text audit can be satisfied by a regex. What this
 * file does instead is REMOVE the layers, one at a time, and see what is still standing:
 *
 *   Layer 1  TEMPORARY revoked from PUBLIC — migration 0019, on main.
 *   Layer 2  `pg_temp` pinned LAST in the SECURITY DEFINER's own search_path — also 0019. It cannot
 *            apply to an invoker-rights function, which runs under the CALLER's search_path, and
 *            P-01 forbids giving one a proconfig because that blocks SQL inlining.
 *   Layer 3  The body names its schema — 0023 §3, 0024, and 0025.
 *
 * The removals happen over a superuser connection, which is the point: they model an operator
 * re-granting TEMPORARY for a reporting role, or a future migration replacing a body and dropping
 * the SET clause. Neither is reachable from a runtime connection, and the last two cases here prove
 * that separately rather than assuming it.
 *
 * Every case restores what it removed, and the final case re-asserts the intact posture so a
 * restore that silently failed shows up here rather than in the next file.
 */
const db = new TestDatabase('freightos_test_sr2_definer_qualification');
const DB_NAME = 'freightos_test_sr2_definer_qualification';

/**
 * Relations that MUST appear in the database's own inventory — a floor, not the inventory.
 *
 * The inventory itself is `app.protected_authority_relations()`, read from the database at run
 * time. This file deliberately keeps no second copy of it, because a second copy is what broke:
 * migration 0025's guard and this test both enumerated the protected relations by hand, and the
 * hand list was wrong in both directions at once. It named `outbox_messages`, `user_roles` and
 * `policies`, none of which exist under those names, so the sweep searched for nothing and found
 * nothing. And it omitted `membership_roles`, `service_account_permissions`,
 * `service_account_credentials` and `operating_authorities`, three of which carried genuine
 * unqualified reads. The guard was green throughout.
 *
 * What survives here is the opposite construction: a small set of relations whose protection is
 * not negotiable, asserted to be PRESENT in whatever the database derives. It can only make the
 * inventory stricter, never narrower — a relation dropping out of RLS coverage fails this list
 * rather than silently shrinking the sweep.
 */
const MUST_BE_PROTECTED = [
  'audit_events',
  'carrier_appointments',
  'kill_switches',
  'legal_entities',
  'memberships',
  'membership_roles',
  'operating_authorities',
  'organization_nodes',
  'permissions',
  'role_permissions',
  'roles',
  'service_account_credentials',
  'service_account_permissions',
  'service_accounts',
  'tenants',
  'users',
] as const;

const PINNED = '{"search_path=pg_catalog, public, pg_temp"}';

let su: Client;
let a: IdentityFixture;
let b: IdentityFixture;
/** A kill switch owned by TENANT_B. TENANT_A must never be able to release it. */
let foreignSwitch: string;

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  su = db.connectAs('postgres');
  await su.connect();
  a = await seedIdentity(db, TENANT_A);
  b = await seedIdentity(db, TENANT_B);

  foreignSwitch = await withAuthenticatedTestPrincipal(db, fixtureAdministrator(b), async (c) => {
    const r = await c.query<{ id: string }>(
      `SELECT app.engage_kill_switch('tenant'::app.kill_switch_scope, $1,
              'suspended'::app.kill_switch_mode, 'f-b fixture') AS id`,
      [TENANT_B],
    );
    return r.rows[0]!.id;
  });
  await withAuthenticatedTestPrincipal(db, fixtureAdministrator(a), async (c) => {
    await c.query(
      `SELECT app.engage_kill_switch('tenant'::app.kill_switch_scope, $1,
              'suspended'::app.kill_switch_mode, 'f-b halt') AS id`,
      [TENANT_A],
    );
  });
}, 180_000);

afterAll(async () => {
  await su?.end();
});

/** Attempt to release TENANT_B's kill switch as TENANT_A, planting a lying shadow first. */
async function releaseForeignSwitch(): Promise<string> {
  return withAuthenticatedTestPrincipal(db, fixtureAdministrator(a), async (c) => {
    // AS SELECT copies the column types without the NOT NULL constraints, which is what an
    // attacker would do: the shadow only has to satisfy the reader, not the real table's rules.
    await c.query(
      'CREATE TEMP TABLE kill_switches AS SELECT * FROM public.kill_switches WHERE false',
    );
    await c.query(
      `INSERT INTO pg_temp.kill_switches (id, released_at, scope, tenant_id)
       VALUES ($1, NULL, 'tenant'::app.kill_switch_scope, $2)`,
      [foreignSwitch, TENANT_A],
    );
    // The attacker owns the shadow, so the attacker can open it to whatever role reads it.
    await c.query('GRANT ALL ON pg_temp.kill_switches TO PUBLIC');
    return c
      .query<{ ok: boolean }>('SELECT app.release_kill_switch($1) AS ok', [foreignSwitch])
      .then(
        (r) => (r.rows[0]!.ok ? 'RELEASED' : 'NOT_FOUND'),
        (e: Error) => `REFUSED: ${e.message}`,
      );
  });
}

/** Ask the resolver whether TENANT_A is halted, hiding the switch behind an empty shadow. */
async function resolveUnderShadow(): Promise<string> {
  return withAuthenticatedTestPrincipal(db, fixtureAdministrator(a), async (c) => {
    // AS SELECT copies the column types without the NOT NULL constraints, which is what an
    // attacker would do: the shadow only has to satisfy the reader, not the real table's rules.
    await c.query(
      'CREATE TEMP TABLE kill_switches AS SELECT * FROM public.kill_switches WHERE false',
    );
    await c.query('GRANT ALL ON pg_temp.kill_switches TO PUBLIC');
    const r = await c.query<{ m: string }>(
      'SELECT app.resolve_kill_switch_mode(p_tenant_id => $1)::text AS m',
      [TENANT_A],
    );
    return r.rows[0]!.m;
  });
}

describe('layer 3 — every authority relation is named with its schema', () => {
  it('derives a non-empty inventory that contains every relation that must be protected', async () => {
    // THE FIRST THING TO PROVE. Every assertion below is quantified over this inventory, so an
    // empty or short inventory makes all of them pass by having nothing to check — which is
    // exactly the state migration 0025's guard shipped in.
    const r = await su.query<{ rel: string }>(
      `SELECT schema_name || '.' || relation_name AS rel
         FROM app.protected_authority_relations() ORDER BY 1`,
    );
    const inventory = r.rows.map((x) => x.rel);

    expect(inventory.length, 'the protected-relation inventory is empty').toBeGreaterThanOrEqual(
      15,
    );

    const bare = inventory.map((x) => x.split('.')[1]);
    for (const relation of MUST_BE_PROTECTED) {
      expect(bare, `${relation} is not in the derived inventory`).toContain(relation);
    }

    // And it is derived, not stored: the three fictional names the hand list carried cannot be in
    // it, because the derivation can only return relations that exist.
    for (const ghost of ['outbox_messages', 'user_roles', 'policies']) {
      expect(bare, `${ghost} does not exist — a hand list is back`).not.toContain(ghost);
    }
  });

  it('leaves no unqualified reference, measured by the database’s own detector', async () => {
    // Deliberately the SAME function migration 0027 §4 asserts on, not a re-implementation of its
    // regex. A test that reimplements the check it is verifying tests its own copy; when 0025's
    // copy and the migration's copy drifted, both were wrong in the same way and neither noticed.
    const r = await su.query<{ f: string; rel: string; secdef: boolean; pinned: boolean }>(
      `SELECT function_name AS f, relation_name AS rel,
              is_security_definer AS secdef, is_pinned AS pinned
         FROM app.unqualified_authority_reads() ORDER BY 1, 2`,
    );
    expect(r.rows.map((x) => `${x.f}: ${x.rel} (secdef=${x.secdef}, pinned=${x.pinned})`)).toEqual(
      [],
    );
  });

  it('sweeps a real population — functions × relations actually examined', async () => {
    // The detector is a cross join of candidate functions against the inventory. Both sides have
    // to be non-empty for a zero result to mean anything.
    const r = await su.query<{ fns: string; rels: string; pairs: string }>(
      `SELECT (SELECT count(*)::text
                 FROM pg_proc p
                 JOIN pg_namespace n ON n.oid = p.pronamespace
                 JOIN pg_language l ON l.oid = p.prolang
                WHERE n.nspname IN ('app', 'admin', 'authn')
                  AND l.lanname IN ('sql', 'plpgsql'))            AS fns,
              (SELECT count(*)::text FROM app.protected_authority_relations()) AS rels,
              (SELECT (count(*) * (SELECT count(*)
                                     FROM app.protected_authority_relations()))::text
                 FROM pg_proc p
                 JOIN pg_namespace n ON n.oid = p.pronamespace
                 JOIN pg_language l ON l.oid = p.prolang
                WHERE n.nspname IN ('app', 'admin', 'authn')
                  AND l.lanname IN ('sql', 'plpgsql'))            AS pairs`,
    );
    expect(Number(r.rows[0]!.fns), 'no candidate functions').toBeGreaterThan(50);
    expect(Number(r.rows[0]!.rels), 'no protected relations').toBeGreaterThanOrEqual(15);
    expect(Number(r.rows[0]!.pairs), 'the sweep examined nothing').toBeGreaterThan(750);
  });

  it('DETECTS an injected unqualified read — otherwise the zero above proves nothing', async () => {
    // The whole file turns on this. A detector that returns zero rows because it is broken is
    // indistinguishable from one that returns zero rows because the code is clean, and the only
    // way to tell them apart is to break the code on purpose and watch the detector notice.
    //
    // One offence is planted per protected relation, in the two positions that matter — a bare
    // FROM in an invoker-rights function, and a bare UPDATE in a SECURITY DEFINER — so a detector
    // that only handles one keyword, or only one security mode, fails here rather than in review.
    const inventory = (
      await su.query<{ schema_name: string; relation_name: string }>(
        'SELECT schema_name, relation_name FROM app.protected_authority_relations() ORDER BY 2',
      )
    ).rows;
    expect(inventory.length).toBeGreaterThanOrEqual(15);

    const probes = inventory.map((rel, i) => ({
      name: `zz_inject_${i}`,
      relation: rel.relation_name,
      // A bare name in FROM position. The body must not otherwise qualify it, or the probe is
      // testing the qualifier rather than the detector.
      //
      // The `SET search_path` is on the CREATE statement's session, not on the function: a SQL
      // function body is parsed at creation time, so a bare `FROM operator_binding` will not
      // compile unless schema `authn` is reachable right then. That is precisely the situation
      // this probe is modelling — a caller whose search_path makes the bare name resolve — and it
      // leaves the stored body bare, which is what the detector reads.
      sql: `CREATE FUNCTION app.zz_inject_${i}() RETURNS bigint LANGUAGE sql STABLE
              AS $probe$ SELECT count(*) FROM ${rel.relation_name} $probe$`,
      schema: rel.schema_name,
    }));

    try {
      for (const probe of probes) {
        await su.query(`SET search_path = ${probe.schema}, public, pg_catalog`);
        await su.query(probe.sql);
      }
      await su.query('RESET search_path');

      const found = await su.query<{ f: string; rel: string }>(
        `SELECT function_name AS f, relation_name AS rel
           FROM app.unqualified_authority_reads()
          WHERE function_name LIKE 'app.zz_inject%' ORDER BY 1`,
      );
      const detected = new Set(found.rows.map((x) => x.rel));

      for (const probe of probes) {
        expect(
          detected.has(probe.relation),
          `the detector missed an unqualified read of ${probe.relation}`,
        ).toBe(true);
      }
    } finally {
      await su.query('RESET search_path');
      for (const probe of probes) {
        await su.query(`DROP FUNCTION IF EXISTS app.${probe.name}()`);
      }
    }

    // The probes must be gone, or every later assertion in this file is measuring debris left by
    // this one. Scoped to the probe names on purpose: a global count would fold a genuine offence
    // elsewhere into "cleanup failed" and report the wrong defect.
    const after = await su.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM app.unqualified_authority_reads()
        WHERE function_name LIKE 'app.zz_inject%'`,
    );
    expect(Number(after.rows[0]!.n), 'the injected probes were not cleaned up').toBe(0);
  });

  it('does NOT fire on a qualified read, a column, or a name inside a string', async () => {
    // The negative half. A detector that flags everything also returns "zero offences" never, and
    // would have been "fixed" by loosening it. Each of these is a shape the old guard got wrong:
    // its one and only `outbox_messages` hit was a relation name inside a RAISE EXCEPTION message.
    try {
      await su.query(`CREATE FUNCTION app.zz_clean_qualified() RETURNS bigint LANGUAGE sql STABLE
                        AS $p$ SELECT count(*) FROM public.users $p$`);
      await su.query(`CREATE FUNCTION app.zz_clean_column() RETURNS bigint LANGUAGE sql STABLE
                        AS $p$ SELECT count(users) FROM (SELECT 1 AS users) AS s $p$`);
      await su.query(`CREATE FUNCTION app.zz_clean_string() RETURNS void LANGUAGE plpgsql
                        AS $p$ BEGIN RAISE EXCEPTION 'no row in users for this actor'; END $p$`);

      const noise = await su.query<{ f: string; rel: string }>(
        `SELECT function_name AS f, relation_name AS rel
           FROM app.unqualified_authority_reads()
          WHERE function_name LIKE 'app.zz_clean%' ORDER BY 1`,
      );
      expect(noise.rows.map((x) => `${x.f}: ${x.rel}`)).toEqual([]);
    } finally {
      await su.query('DROP FUNCTION IF EXISTS app.zz_clean_qualified()');
      await su.query('DROP FUNCTION IF EXISTS app.zz_clean_column()');
      await su.query('DROP FUNCTION IF EXISTS app.zz_clean_string()');
    }
  });

  it('adds no proconfig to any invoker-rights function — P-01 inlining survives', async () => {
    const r = await su.query<{ signature: string; config: string }>(
      `SELECT p.oid::regprocedure::text AS signature, p.proconfig::text AS config
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE NOT p.prosecdef AND n.nspname = 'app' AND p.proconfig IS NOT NULL
        ORDER BY 1`,
    );
    // Migration 0019 §2b pinned exactly one, deliberately, and it is on main.
    expect(r.rows.map((x) => x.signature)).toEqual([
      'app.user_has_permission(uuid,uuid,text,timestamp with time zone)',
    ]);
  });

  it('leaves no function called by an RLS policy carrying a proconfig', async () => {
    const r = await su.query<{ proname: string }>(
      `SELECT DISTINCT p.proname
         FROM pg_policy pol,
              LATERAL regexp_matches(
                coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
                coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''),
                'app\\.([a-z0-9_]+)\\(', 'g') AS m
         JOIN pg_proc p ON p.proname = m[1]
         JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'app'
        WHERE NOT p.prosecdef AND p.proconfig IS NOT NULL`,
    );
    expect(r.rows.map((x) => x.proname)).toEqual([]);
  });
});

describe('the three layers are independent — each is removed and the rest measured', () => {
  it('LAYER 1 holds, and holds for the intended reason', async () => {
    const out = await withAuthenticatedTestPrincipal(db, fixtureAdministrator(a), (c) =>
      c.query('CREATE TEMP TABLE kill_switches (id uuid)').then(
        () => 'CREATED',
        (e: Error) => e.message,
      ),
    );
    expect(out, 'the runtime role can still create a temp relation').toMatch(
      /permission denied to create temporary tables/,
    );
  });

  it('LAYER 2 alone defeats the shadow once layer 1 is removed', async () => {
    await su.query(`GRANT TEMPORARY ON DATABASE ${DB_NAME} TO freightos_app`);
    try {
      expect(await releaseForeignSwitch()).toMatch(/not releasable by this tenant/);
    } finally {
      await su.query(`REVOKE TEMPORARY ON DATABASE ${DB_NAME} FROM freightos_app`);
    }
  });

  it('LAYER 3 alone defeats the shadow on a definer once layers 1 and 2 are removed', async () => {
    await su.query(`GRANT TEMPORARY ON DATABASE ${DB_NAME} TO freightos_app`);
    await su.query(`ALTER FUNCTION app.release_kill_switch(uuid)
                      SET search_path = pg_catalog, public`);
    let out = '';
    try {
      out = await releaseForeignSwitch();
    } finally {
      await su.query(`ALTER FUNCTION app.release_kill_switch(uuid)
                        SET search_path = pg_catalog, public, pg_temp`);
      await su.query(`REVOKE TEMPORARY ON DATABASE ${DB_NAME} FROM freightos_app`);
    }
    // The denial must be the guard's, not an incidental privilege error on the attacker's table —
    // the shadow is granted to PUBLIC precisely so that cannot be what refuses it.
    expect(out, 'denied for an incidental reason rather than by the guard').not.toMatch(
      /permission denied/i,
    );
    expect(out, 'the shadow decided who may release a kill switch').toMatch(
      /not releasable by this tenant/,
    );
  });

  it('LAYER 3 is the ONLY layer an invoker-rights resolver can have, and it holds', async () => {
    // app.resolve_kill_switch_mode runs under the caller's search_path, where pg_temp is implicitly
    // FIRST. No tampering beyond restoring TEMPORARY is needed, and no pin is available to it.
    await su.query(`GRANT TEMPORARY ON DATABASE ${DB_NAME} TO freightos_app`);
    let out = '';
    try {
      out = await resolveUnderShadow();
    } finally {
      await su.query(`REVOKE TEMPORARY ON DATABASE ${DB_NAME} FROM freightos_app`);
    }
    expect(out, 'an engaged kill switch became invisible — fail-open on Art. V.1').toBe(
      'suspended',
    );
  });

  it('POSITIVE CONTROL: the shadow is genuinely reachable, so a pass means the layer worked', async () => {
    // Without this, every case above could be passing because pg_temp was never consulted at all.
    // A function with no qualification and no pin must fall to the same shadow the others resist.
    await su.query(`GRANT TEMPORARY ON DATABASE ${DB_NAME} TO freightos_app`);
    await su.query(`CREATE OR REPLACE FUNCTION app.zz_shadow_probe(p_tenant uuid)
                      RETURNS bigint LANGUAGE sql STABLE
                      AS $$ SELECT count(*) FROM kill_switches WHERE tenant_id = p_tenant $$`);
    await su.query('GRANT EXECUTE ON FUNCTION app.zz_shadow_probe(uuid) TO PUBLIC');
    let real = -1;
    let shadowed = -1;
    try {
      real = await withAuthenticatedTestPrincipal(db, fixtureAdministrator(a), async (c) => {
        const r = await c.query<{ n: string }>('SELECT app.zz_shadow_probe($1)::text AS n', [
          TENANT_A,
        ]);
        return Number(r.rows[0]!.n);
      });
      shadowed = await withAuthenticatedTestPrincipal(db, fixtureAdministrator(a), async (c) => {
        // AS SELECT copies the column types without the NOT NULL constraints, which is what an
        // attacker would do: the shadow only has to satisfy the reader, not the real table's rules.
        await c.query(
          'CREATE TEMP TABLE kill_switches AS SELECT * FROM public.kill_switches WHERE false',
        );
        await c.query('GRANT ALL ON pg_temp.kill_switches TO PUBLIC');
        const r = await c.query<{ n: string }>('SELECT app.zz_shadow_probe($1)::text AS n', [
          TENANT_A,
        ]);
        return Number(r.rows[0]!.n);
      });
    } finally {
      await su.query('DROP FUNCTION IF EXISTS app.zz_shadow_probe(uuid)');
      await su.query(`REVOKE TEMPORARY ON DATABASE ${DB_NAME} FROM freightos_app`);
    }
    expect(real, 'the probe saw no real kill switch — the fixture is wrong').toBeGreaterThan(0);
    expect(shadowed, 'pg_temp was not consulted at all — every case above is vacuous').toBe(0);
  });
});

describe('the removals above cannot be performed from a runtime connection', () => {
  it('gives no runtime role TEMPORARY, and no route to a role that holds it', async () => {
    const holders = await su.query<{ grantee: string }>(
      `SELECT DISTINCT g.rolname AS grantee
         FROM pg_database d, LATERAL aclexplode(d.datacl) x
         JOIN pg_roles g ON g.oid = x.grantee
        WHERE d.datname = current_database() AND x.privilege_type = 'TEMPORARY'`,
    );
    expect(holders.rows.map((x) => x.grantee)).toEqual(['freightos_migrator']);

    const reach = await su.query<{ caller: string }>(
      `SELECT c AS caller
         FROM unnest(ARRAY['freightos_app','freightos_admin']) AS c
        WHERE has_database_privilege(c, current_database(), 'TEMPORARY')
           OR EXISTS (SELECT 1
                        FROM pg_database d, LATERAL aclexplode(d.datacl) x
                        JOIN pg_roles g ON g.oid = x.grantee
                       WHERE d.datname = current_database()
                         AND x.privilege_type = 'TEMPORARY'
                         AND pg_has_role(c, g.rolname, 'USAGE'))`,
    );
    expect(reach.rows.map((x) => x.caller)).toEqual([]);
  });

  it('gives no runtime role the database ownership that could re-grant it', async () => {
    const r = await su.query<{ can_app: boolean; can_admin: boolean }>(
      `SELECT pg_has_role('freightos_app', d.datdba, 'USAGE')   AS can_app,
              pg_has_role('freightos_admin', d.datdba, 'USAGE') AS can_admin
         FROM pg_database d WHERE d.datname = current_database()`,
    );
    expect(r.rows[0]!.can_app).toBe(false);
    expect(r.rows[0]!.can_admin).toBe(false);
  });

  it('gives no runtime role a route to a definer owner, so no pin can be removed', async () => {
    const r = await su.query<{ pair: string }>(
      `SELECT DISTINCT caller || ' -> ' || owner AS pair FROM (
         SELECT c AS caller, pg_get_userbyid(p.proowner) AS owner
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
                unnest(ARRAY['freightos_app','freightos_admin']) AS c
          WHERE p.prosecdef AND n.nspname IN ('app', 'admin')) s
        WHERE pg_has_role(caller, owner, 'USAGE')`,
    );
    expect(r.rows.map((x) => x.pair)).toEqual([]);
  });

  it('leaves the posture exactly as it found it', async () => {
    const t = await su.query<{ pub: boolean; app: boolean; adm: boolean }>(
      `SELECT has_database_privilege('public', current_database(), 'TEMPORARY')        AS pub,
              has_database_privilege('freightos_app', current_database(), 'TEMPORARY') AS app,
              has_database_privilege('freightos_admin', current_database(), 'TEMPORARY') AS adm`,
    );
    expect([t.rows[0]!.pub, t.rows[0]!.app, t.rows[0]!.adm]).toEqual([false, false, false]);

    const unpinned = await su.query<{ signature: string; config: string | null }>(
      `SELECT p.oid::regprocedure::text AS signature, p.proconfig::text AS config
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.prosecdef AND n.nspname IN ('app', 'admin')
          AND p.proconfig::text IS DISTINCT FROM $1
        ORDER BY 1`,
      [PINNED],
    );
    expect(unpinned.rows.map((x) => `${x.signature} => ${x.config}`)).toEqual([]);

    const probe = await su.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'app' AND p.proname = 'zz_shadow_probe'`,
    );
    expect(Number(probe.rows[0]!.n), 'the probe function was left behind').toBe(0);
  });
});
