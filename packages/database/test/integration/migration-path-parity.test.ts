import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
 * MIGRATION PATH PARITY — a logical version reached two ways must be the same database.
 *
 * Every defect this file exists to catch was invisible to the checks that came before it, and all
 * three failed the same way: the migration RAN, exited zero, and left a database that was wrong.
 *
 *   C-1  — 0020's down restored `app.current_human_principal()` with the search_path 0018 gave it,
 *          silently reverting migration 0019's still-applied pg_temp hardening. Version 19 reached
 *          by rollback had one definer 0019's own assertion says cannot exist.
 *   SR-2 — 0026's down re-created the sixteen entry points from `pg_get_functiondef()`, which emits
 *          no GRANT, so version 25 reached by rollback had freightos_admin able to execute NOTHING
 *          where version 25 reached forward gives it sixteen. It also left three `app.*` accessors
 *          pointing at schema `authn` after dropping that schema, so they raised on every call.
 *
 * Both were reachable by anyone who rolled back, and neither was a security hole — they fail
 * closed. What they broke is the repository's contract that a migration has a tested down path.
 *
 * WHY "IT APPLIED WITHOUT ERROR" IS NOT THE TEST. A down migration's job is to reproduce a state,
 * not to complete. So each case below builds the SAME logical version twice — once forward from
 * empty, once by rolling back from a later version — and compares the security-relevant catalog
 * state field by field. Anything a rollback fails to restore shows up as a difference.
 *
 * The comparison is canonicalised (definition text, owner, security mode, volatility, search_path,
 * ACL) rather than counted: two databases with sixteen functions each can still disagree about who
 * may execute them, which is precisely what the SR-2 defect did.
 */
const direct = new TestDatabase('freightos_test_parity_direct');
const reverted = new TestDatabase('freightos_test_parity_reverted');

const migrations = loadMigrations(MIGRATIONS_DIR);
const TIP = Math.max(...migrations.map((m) => m.version));

/** The sixteen administrative entry points, by name. The seven internal helpers are not these. */
const ENTRY_POINTS = [
  'assign_membership_role',
  'create_role',
  'export_tenant_audit',
  'grant_membership',
  'grant_role_permission',
  'grant_service_account_permission',
  'issue_session_binding',
  'move_organization_node',
  'provision_tenant',
  'revoke_membership',
  'revoke_membership_role',
  'revoke_role_permission',
  'revoke_service_account_permission',
  'set_membership_status',
  'set_tenant_status',
  'tenant_identity_summary',
] as const;

/** The three accessors 0026 §8 rewrites onto `authn` and its down migration must put back. */
const REWRITTEN_ACCESSORS = [
  'current_actor_id',
  'current_human_principal',
  'is_verified_platform_actor',
] as const;

interface Snapshot {
  functions: string[];
  adminGrants: string[];
  adminExec: string[];
  publicExec: string[];
  runtimeExec: string[];
  schemaAcls: string[];
  policies: string[];
  roles: string[];
  authnObjects: string[];
}

/**
 * An `aclitem[]` rendered order-independently.
 *
 * PostgreSQL stores an ACL as an array in the order grants were made, not in any canonical order,
 * so `{=X/owner,owner=X/owner}` and `{owner=X/owner,=X/owner}` are the SAME privilege set written
 * two ways. The forward path and the rollback path issue CREATE and GRANT in different orders and
 * legitimately land on different array orders — comparing the raw text would report a difference
 * on every definer and drown the real ones. Sorting the elements compares the SET, which is the
 * property that actually matters.
 */
const ACL = (column: string) =>
  `coalesce((SELECT '{' || string_agg(a::text, ',' ORDER BY a::text) || '}'
               FROM unnest(${column}) AS a), '-')`;

/**
 * Read the security-relevant catalog state.
 *
 * `proacl` is included because it is the field the SR-2 defect lost, and `has_function_privilege`
 * for each interesting role is included separately because an ACL of `{owner=X/owner}` and an ACL
 * of `{owner=X/owner, freightos_admin=X/owner}` differ in exactly one grant that a count would
 * never show. Owner EXECUTE is NOT the same as freightos_admin EXECUTE.
 */
async function snapshot(client: Client): Promise<Snapshot> {
  const rows = async (sql: string): Promise<string[]> =>
    (await client.query<{ line: string }>(sql)).rows.map((r) => r.line);

  return {
    functions: await rows(
      `SELECT format('%s.%s(%s) owner=%s secdef=%s vol=%s cfg=%s acl=%s body=%s',
                     n.nspname, p.proname, oidvectortypes(p.proargtypes),
                     pg_get_userbyid(p.proowner), p.prosecdef, p.provolatile,
                     coalesce(p.proconfig::text, '-'), ${ACL('p.proacl')},
                     md5(p.prosrc)) AS line
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('app', 'admin', 'authn') ORDER BY 1`,
    ),
    // The EXPLICIT grants — an aclitem naming freightos_admin. This is the dimension the SR-2
    // defect emptied, and it is not the same question as `adminExec` below: at v25 nothing has
    // revoked the built-in PUBLIC EXECUTE yet, so freightos_admin can *reach* sixty-odd functions
    // through PUBLIC while holding a grant of its own on only sixteen. Reverting 0026 destroyed
    // the sixteen and left the sixty-odd intact, so a reachability count alone stays green.
    adminGrants: await rows(
      `SELECT format('%s %s', p.oid::regprocedure::text, a.privilege_type) AS line
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         CROSS JOIN LATERAL aclexplode(p.proacl) a
         JOIN pg_roles g ON g.oid = a.grantee
        WHERE n.nspname IN ('app', 'admin', 'authn')
          AND g.rolname = 'freightos_admin' ORDER BY 1`,
    ),
    adminExec: await rows(
      `SELECT p.oid::regprocedure::text AS line
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('app', 'admin', 'authn')
          AND has_function_privilege('freightos_admin', p.oid, 'EXECUTE') ORDER BY 1`,
    ),
    publicExec: await rows(
      `SELECT p.oid::regprocedure::text AS line
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('app', 'admin', 'authn')
          AND has_function_privilege('public', p.oid, 'EXECUTE') ORDER BY 1`,
    ),
    runtimeExec: await rows(
      `SELECT p.oid::regprocedure::text AS line
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('app', 'admin', 'authn')
          AND has_function_privilege('freightos_app', p.oid, 'EXECUTE') ORDER BY 1`,
    ),
    schemaAcls: await rows(
      `SELECT format('%s %s', nspname, ${ACL('nspacl')}) AS line
         FROM pg_namespace WHERE nspname IN ('public', 'app', 'admin', 'authn') ORDER BY 1`,
    ),
    policies: await rows(
      `SELECT format('%s.%s %s cmd=%s roles=%s using=%s check=%s',
                     schemaname, tablename, policyname, cmd, roles::text,
                     coalesce(qual, '-'), coalesce(with_check, '-')) AS line
         FROM pg_policies ORDER BY 1`,
    ),
    roles: await rows(
      `SELECT format('%s login=%s super=%s bypassrls=%s createrole=%s',
                     rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreaterole) AS line
         FROM pg_roles WHERE rolname LIKE 'freightos%' ORDER BY 1`,
    ),
    authnObjects: await rows(
      `SELECT format('%s.%s', n.nspname, c.relname) AS line
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'authn'
        UNION ALL
       SELECT format('schema.%s', nspname) FROM pg_namespace WHERE nspname = 'authn'
        ORDER BY 1`,
    ),
  };
}

/**
 * Build `db` at `version`, either straight forward or by overshooting to the tip and reverting.
 *
 * Both paths start from `resetToEmpty()` — a database with no migration applied — so the forward
 * path is a genuine forward path and not a rollback wearing one's clothes.
 */
async function buildAt(
  db: TestDatabase,
  version: number,
  via: 'forward' | 'revert',
): Promise<void> {
  await db.resetToEmpty();
  const client = db.connectAsMigrator();
  await client.connect();
  try {
    if (via === 'forward') {
      await migrateUp(
        client,
        migrations.filter((m) => m.version <= version),
      );
    } else {
      await migrateUp(client, migrations);
      await migrateDown(client, migrations, version);
    }
  } finally {
    await client.end();
  }
}

/** Build both paths at `version` and read each one, leaving the reverted connection open. */
async function bothPaths(
  version: number,
): Promise<{ forward: Snapshot; rolled: Snapshot; b: Client }> {
  await buildAt(direct, version, 'forward');
  await buildAt(reverted, version, 'revert');

  const a = direct.connectAs('postgres');
  await a.connect();
  const b = reverted.connectAs('postgres');
  await b.connect();
  try {
    return { forward: await snapshot(a), rolled: await snapshot(b), b };
  } finally {
    await a.end();
  }
}

describe('logical v25 — forward vs reverted from the tip', () => {
  let forward: Snapshot;
  let rolled: Snapshot;
  let b: Client;

  beforeAll(async () => {
    ({ forward, rolled, b } = await bothPaths(25));
  }, 600_000);

  afterAll(async () => {
    await b?.end();
  });

  it('is a non-empty comparison — otherwise every assertion below is vacuous', () => {
    expect(forward.functions.length, 'forward v25 has no functions').toBeGreaterThan(50);
    expect(forward.policies.length, 'forward v25 has no policies').toBeGreaterThan(40);
    expect(forward.adminGrants.length, 'forward v25 grants freightos_admin nothing').toBe(16);
  });

  it('gives freightos_admin the same sixteen entry points on both paths', () => {
    // THE SR-2 DEFECT, as a test. Reverting 0026 used to leave this list EMPTY: DROP FUNCTION
    // discards the ACL, and re-creating from pg_get_functiondef() emits no GRANT. A count of
    // functions would not have caught it, because all sixteen functions existed — nobody held a
    // grant on them.
    expect(rolled.adminGrants).toEqual(forward.adminGrants);

    const names = rolled.adminGrants.map((s) => s.replace(/^admin\./, '').replace(/\(.*$/, ''));
    for (const entry of ENTRY_POINTS) {
      expect(names, `freightos_admin holds no grant on ${entry} at reverted v25`).toContain(entry);
    }
  });

  it('restores the three §8 accessors identically, and they do not name schema authn', async () => {
    for (const accessor of REWRITTEN_ACCESSORS) {
      const f = (s: Snapshot) => s.functions.filter((x) => x.startsWith(`app.${accessor}(`));
      expect(f(rolled), accessor).toEqual(f(forward));
    }

    // And the stronger property: they RUN. A body referencing a dropped schema parses fine and
    // raises on call, which is how this shipped.
    const naming = await b.query<{ proname: string }>(
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'app' AND p.proname = ANY($1) AND p.prosrc ~ 'authn\\.'`,
      [[...REWRITTEN_ACCESSORS]],
    );
    expect(naming.rows.map((r) => r.proname)).toEqual([]);

    for (const accessor of REWRITTEN_ACCESSORS) {
      await expect(
        b.query(`SELECT app.${accessor}()`),
        `app.${accessor}() raises at reverted v25`,
      ).resolves.toBeDefined();
    }
  });

  it('has no authn objects on either path', () => {
    expect(forward.authnObjects, 'forward v25 should never have had schema authn').toEqual([]);
    expect(rolled.authnObjects, 'reverting 0026 left authn objects behind').toEqual([]);
  });

  it('matches on every other security-relevant dimension', () => {
    expect(rolled.functions).toEqual(forward.functions);
    expect(rolled.adminExec).toEqual(forward.adminExec);
    expect(rolled.publicExec).toEqual(forward.publicExec);
    expect(rolled.runtimeExec).toEqual(forward.runtimeExec);
    expect(rolled.schemaAcls).toEqual(forward.schemaAcls);
    expect(rolled.policies).toEqual(forward.policies);
    expect(rolled.roles).toEqual(forward.roles);
  });
});

describe('logical v19 — forward vs reverted from the tip', () => {
  let forward: Snapshot;
  let rolled: Snapshot;
  let b: Client;

  beforeAll(async () => {
    ({ forward, rolled, b } = await bothPaths(19));
  }, 600_000);

  afterAll(async () => {
    await b?.end();
  });

  it('is a non-empty comparison', () => {
    expect(forward.functions.length).toBeGreaterThan(30);
    expect(
      forward.adminGrants.length,
      'forward v19 grants freightos_admin nothing',
    ).toBeGreaterThan(0);
  });

  it('keeps every definer pinned pg_temp-last on both paths — C-1', () => {
    // 0020's down used to restore app.current_human_principal() with the search_path 0018 gave it,
    // undoing migration 0019's sweep. 0019 is STILL APPLIED at version 19, so its own assertion
    // became false in a database it was supposed to protect.
    //
    // `secdef=t`, not `secdef=true` — `format('%s', boolean)` renders PostgreSQL's output form. The
    // first draft of this matched on `true`, so `definers()` was empty on both sides and the whole
    // assertion was vacuous: it passed against a database that HAD the C-1 defect. Hence the
    // non-emptiness check, which is the only thing standing between this test and that state.
    const definers = (s: Snapshot) => s.functions.filter((x) => x.includes(' secdef=t '));
    const unpinned = (s: Snapshot) => definers(s).filter((x) => !x.includes('pg_temp'));

    expect(definers(forward).length, 'v19 has no definers to check').toBeGreaterThan(5);
    expect(definers(rolled).length, 'reverted v19 has no definers to check').toBeGreaterThan(5);
    expect(unpinned(forward), 'forward v19 has an unpinned definer').toEqual([]);
    expect(unpinned(rolled), 'reverting to v19 unpinned a definer that 0019 had pinned').toEqual(
      [],
    );
  });

  it('matches on every security-relevant dimension', () => {
    expect(rolled.functions).toEqual(forward.functions);
    expect(rolled.adminGrants).toEqual(forward.adminGrants);
    expect(rolled.adminExec).toEqual(forward.adminExec);
    expect(rolled.publicExec).toEqual(forward.publicExec);
    expect(rolled.runtimeExec).toEqual(forward.runtimeExec);
    expect(rolled.schemaAcls).toEqual(forward.schemaAcls);
    expect(rolled.policies).toEqual(forward.policies);
    expect(rolled.roles).toEqual(forward.roles);
  });
});

describe('the tip is reachable from both directions', () => {
  it(`re-applies to ${TIP} after a full rollback and reproduces the forward inventory`, async () => {
    await buildAt(direct, TIP, 'forward');
    const fresh = direct.connectAs('postgres');
    await fresh.connect();
    const before = await snapshot(fresh);
    await fresh.end();

    const client = direct.connectAsMigrator();
    await client.connect();
    try {
      await migrateDown(client, migrations, 0);
      await migrateUp(client, migrations);
    } finally {
      await client.end();
    }

    const after = direct.connectAs('postgres');
    await after.connect();
    const round = await snapshot(after);
    await after.end();

    expect(before.functions.length).toBeGreaterThan(50);
    expect(before.adminGrants.length).toBeGreaterThan(0);
    expect(before.policies.length).toBeGreaterThan(40);

    expect(round.functions).toEqual(before.functions);
    expect(round.adminGrants).toEqual(before.adminGrants);
    expect(round.adminExec).toEqual(before.adminExec);
    expect(round.publicExec).toEqual(before.publicExec);
    expect(round.runtimeExec).toEqual(before.runtimeExec);
    expect(round.schemaAcls).toEqual(before.schemaAcls);
    expect(round.policies).toEqual(before.policies);
    expect(round.roles).toEqual(before.roles);
  }, 600_000);
});
