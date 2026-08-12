import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadMigrations, migrateDown, migrateUp } from '../../src/migrator.ts';
import { MIGRATIONS_DIR } from '../../src/paths.ts';
import {
  TENANT_A,
  TestDatabase,
  acquireClusterRoleLock,
  releaseClusterRoleLock,
} from './harness.ts';
import type { IdentityFixture } from './identity-harness.ts';
import { connectAsFixtureAdministrator } from './identity-harness.ts';
import { seedVerifiedFixture } from './sr2-harness.ts';

/**
 * N5-A ROLLBACK — the three permission rows come out again, and nothing else does.
 *
 * 0032 seeds three rows into `permissions`, a table under FORCE ROW LEVEL SECURITY with policies
 * for SELECT, INSERT and UPDATE and none for DELETE. Under FORCE RLS a DELETE with no applicable
 * policy matches zero rows and reports success — so an ordinary down migration would leave the
 * vocabulary behind while claiming to have reverted.
 *
 * The down migration therefore opens a DELETE policy scoped to the migration principal and to the
 * three exact keys, uses it, and drops it before commit. That is a temporary hole in an existing
 * authorization surface, and this file is what makes it accountable:
 *
 *   - it deletes THOSE THREE ROWS and no others, proven against decoys chosen to defeat a prefix
 *     match rather than by counting;
 *   - it refuses to run at all while any of the three is assigned to a role, rather than silently
 *     stripping authority a tenant is relying on;
 *   - nothing it opened survives the transaction: ACL, policy inventory and FORCE RLS all come out
 *     equal to their 0031 values, compared as values and not asserted in prose.
 *
 * Its own database. `migrateDown` here would otherwise revert the surface out from under any
 * sibling file sharing one.
 */

const db = new TestDatabase('freightos_test_n5a_rollback');
const migrations = loadMigrations(MIGRATIONS_DIR);

/** The version N5-A is introduced at, and the one immediately beneath it. */
const N5A = 32;
const N4 = N5A - 1;

const N5A_KEYS = [
  'network.disclosure_grant.create',
  'network.disclosure_grant.read',
  'network.disclosure_grant.revoke',
] as const;

/**
 * Keys that a careless cleanup would take with it.
 *
 * `network.disclosure_grant.export` shares the whole dotted prefix, so a `LIKE 'network.%'` or a
 * prefix `IN` built by string concatenation removes it. `network.disclosure_grants.read` is the
 * plural. `network.disclosurexgrant.read` is the one that matters most: `_` is a LIKE WILDCARD, so
 * this key MATCHES the pattern `network.disclosure_grant.%` that reads like a literal — the `_`
 * matches the `x`. A guard or a delete written that way sees a key it does not own.
 */
const DECOYS = [
  'network.disclosure_grant.export',
  'network.disclosure_grants.read',
  'network.disclosurexgrant.read',
] as const;

let owner: Client;
let adminA: Client;
let fixtureA: IdentityFixture;

async function asMigrator<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = db.connectAs('freightos_migrator');
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

const driveTo = (version: number): Promise<void> =>
  asMigrator(async (client) => {
    const applied = Number(
      (
        await client.query<{ n: string }>(
          'SELECT coalesce(max(version), 0)::text AS n FROM schema_migrations',
        )
      ).rows[0]!.n,
    );
    if (applied > version) await migrateDown(client, migrations, version);
    else if (applied < version)
      await migrateUp(
        client,
        migrations.filter((m) => m.version <= version),
      );
  });

/** Read the whole `permissions` surface as values — rows, ACL, policies, RLS flags. */
async function permissionsSurface(): Promise<Record<string, string>> {
  const r = await owner.query<Record<string, string>>(
    `SELECT
       (SELECT coalesce(string_agg(key || '=' || action, ',' ORDER BY key), '(none)')
          FROM permissions)                                                          AS rows,
       (SELECT coalesce(relacl::text, '(default)')
          FROM pg_class WHERE oid = 'public.permissions'::regclass)                  AS acl,
       (SELECT coalesce(string_agg(polname || ':' || polcmd::text || ':' || polroles::text,
                                   ',' ORDER BY polname), '(none)')
          FROM pg_policy WHERE polrelid = 'public.permissions'::regclass)            AS policies,
       (SELECT relrowsecurity::text || '/' || relforcerowsecurity::text
          FROM pg_class WHERE oid = 'public.permissions'::regclass)                  AS rls,
       (SELECT count(*)::text FROM role_permissions)                                 AS role_permissions,
       (SELECT coalesce(string_agg(g.who, ',' ORDER BY g.who), '(nobody)') FROM (
          SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS who
            FROM pg_class c
                 CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
           WHERE c.oid = 'public.permissions'::regclass AND a.privilege_type = 'DELETE') g)
                                                                                     AS delete_holders`,
  );
  return r.rows[0]!;
}

const presentKeys = async (keys: readonly string[]): Promise<string[]> =>
  (
    await owner.query<{ key: string }>(
      'SELECT key FROM permissions WHERE key = ANY($1) ORDER BY key',
      [[...keys]],
    )
  ).rows.map((x) => x.key);

const n5aTableCount = async (): Promise<number> =>
  Number(
    (
      await owner.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r'
            AND c.relname LIKE 'network\\_disclosure%'`,
      )
    ).rows[0]!.n,
  );

/**
 * Seed the decoys through the control plane — the same policy path 0032's own seed takes.
 *
 * `freightos_admin_owner` inherits `freightos_control_plane`, which is what `app.is_control_plane()`
 * in `permissions_insert` requires. Inserting as the superuser would bypass the policy and prove
 * the rows can exist in a shape the catalog does not actually accept.
 */
async function seedDecoys(): Promise<void> {
  const client = db.connectAs('freightos_migrator');
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE freightos_admin_owner');
    for (const key of DECOYS) {
      await client.query(
        `INSERT INTO permissions (tenant_id, key, resource, action, description, created_by)
         VALUES ('00000000-0000-0000-0000-000000000000', $1, 'network_disclosure_grant', 'read',
                 'Decoy for the N5-A rollback scoping control.', 'test:n5a-rollback')
         ON CONFLICT (key) DO NOTHING`,
        [key],
      );
    }
    await client.query('COMMIT');
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  // This file drives migrateUp/migrateDown itself. Migrations mutate cluster-wide catalog state, so
  // the lock is held for the whole file rather than per call — a revert landing between two `it`
  // blocks is the same race as one landing inside one. Re-entrant, so `reset()` below is free.
  await acquireClusterRoleLock();
  await db.reset();
  await db.seedTenants();
  fixtureA = await seedVerifiedFixture(db, TENANT_A);
  owner = db.connectAs('postgres');
  await owner.connect();
  adminA = await connectAsFixtureAdministrator(db, fixtureA);
  await seedDecoys();
}, 300_000);

afterAll(async () => {
  await owner?.end();
  await adminA?.end();
  await releaseClusterRoleLock();
});

describe('the three rows come out — and only those three', () => {
  it('reverts every N5-A object and every N5-A permission key', async () => {
    await driveTo(N5A);
    expect(await presentKeys(N5A_KEYS)).toEqual([...N5A_KEYS]);
    expect(await n5aTableCount()).toBe(6);

    await driveTo(N4);

    // THE OWNER RULING: exact logical rollback. Not "the keys are harmless because no role holds
    // them" — they are gone.
    expect(await presentKeys(N5A_KEYS)).toEqual([]);
    expect(await n5aTableCount()).toBe(0);

    await driveTo(N5A);
    expect(await presentKeys(N5A_KEYS)).toEqual([...N5A_KEYS]);
  }, 300_000);

  it('leaves neighbouring permission keys untouched, including the LIKE-wildcard trap', async () => {
    await driveTo(N5A);
    expect(
      await presentKeys(DECOYS),
      'the decoys must exist before the revert can prove anything',
    ).toEqual([...DECOYS].sort());

    await driveTo(N4);

    // The delete names three keys. A prefix match, a `LIKE`, or a hand-built key list would take
    // one of these with it — `network.disclosureXgrant.read` in particular, because `_` in
    // `network.disclosure_grant.%` is a single-character wildcard and matches the `X`.
    expect(await presentKeys(DECOYS)).toEqual([...DECOYS].sort());
    expect(await presentKeys(N5A_KEYS)).toEqual([]);

    await driveTo(N5A);
  }, 300_000);

  it('restores the permissions surface to its 0031 value exactly', async () => {
    await driveTo(N4);
    const before = await permissionsSurface();

    await driveTo(N5A);
    const atN5A = await permissionsSurface();
    expect(atN5A['rows']).not.toBe(before['rows']);

    await driveTo(N4);
    const after = await permissionsSurface();

    // Every dimension the temporary policy could have disturbed, compared as a value.
    expect(after).toEqual(before);

    // Spelled out, so a future reader sees which properties this is actually about.
    expect(after['acl']).toBe(before['acl']);
    expect(after['policies']).toBe(before['policies']);
    expect(after['policies']).not.toMatch(/n5a_down_cleanup/);
    expect(after['policies']).not.toMatch(/:d:/);
    expect(after['rls']).toBe('true/true');
    expect(after['delete_holders']).toBe('freightos_migrator');

    await driveTo(N5A);
  }, 300_000);
});

describe('the rollback refuses rather than strip authority', () => {
  it('aborts while an N5-A key is assigned, stays aborted after a governed revoke, changes nothing', async () => {
    await driveTo(N5A);

    const granted = await adminA.query<{ outcome: string; reason: string | null }>(
      'SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5)',
      [
        fixtureA.tenantId,
        fixtureA.roleId,
        'network.disclosure_grant.read',
        'identity_administration',
        randomUUID(),
      ],
    );
    expect(granted.rows[0]!.outcome, granted.rows[0]!.reason ?? '').toBe('succeeded');

    const assignmentId = (
      await owner.query<{ id: string }>(
        `SELECT rp.id FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
          WHERE p.key = 'network.disclosure_grant.read' AND rp.revoked_at IS NULL`,
      )
    ).rows[0]!.id;

    // THE REFUSAL. §14: a rollback may not delete role_permissions on the operator's behalf, so it
    // declines to run at all and says what has to be resolved first.
    await expect(driveTo(N4)).rejects.toThrow(/role_permissions row\(s\) reference the N5-A/i);

    // And it declined atomically: the down migration is one transaction, so a refusal in the first
    // guard must leave the tables, the keys and the assignment exactly as they were.
    expect(await n5aTableCount()).toBe(6);
    expect(await presentKeys(N5A_KEYS)).toEqual([...N5A_KEYS]);
    const stillLive = await owner.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
        WHERE p.key = ANY($1) AND rp.revoked_at IS NULL`,
      [[...N5A_KEYS]],
    );
    expect(stillLive.rows[0]!.n).toBe('1');

    // ── Revoking through the governed path is NOT enough, and that is the intended behaviour.
    //
    // `admin.revoke_role_permission` marks the row revoked and keeps it — an authorization ledger
    // does not forget that authority was once held. The foreign key still binds the permission row,
    // so the guard still fires. A rollback that treated a revoked row as absent would be deleting
    // the evidence that the grant ever existed.
    const revoked = await adminA.query<{ outcome: string; reason: string | null }>(
      'SELECT * FROM admin.revoke_role_permission($1, $2, $3, $4)',
      [fixtureA.tenantId, assignmentId, 'identity_administration', randomUUID()],
    );
    expect(revoked.rows[0]!.outcome, revoked.rows[0]!.reason ?? '').toBe('succeeded');

    const nowRevoked = await owner.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM role_permissions WHERE id = $1 AND revoked_at IS NOT NULL',
      [assignmentId],
    );
    expect(nowRevoked.rows[0]!.n).toBe('1');

    await expect(driveTo(N4)).rejects.toThrow(/role_permissions row\(s\) reference the N5-A/i);
    expect(await presentKeys(N5A_KEYS)).toEqual([...N5A_KEYS]);

    // ── Fixture cleanup, NOT a demonstration of a supported path. Resolving the ledger row is a
    // human decision taken outside the migration, which is exactly what the guard is there to
    // force; the superuser here only restores the fixture so the assertion below can show that the
    // guard was the sole thing blocking the revert.
    await owner.query('DELETE FROM role_permissions WHERE id = $1', [assignmentId]);

    await driveTo(N4);
    expect(await presentKeys(N5A_KEYS)).toEqual([]);
    expect(await n5aTableCount()).toBe(0);
    expect(await presentKeys(DECOYS)).toEqual([...DECOYS].sort());

    await driveTo(N5A);
  }, 300_000);
});

/**
 * THE MIGRATION'S OWN ZERO-ASSIGNMENT ASSERTION — §14 to §16.
 *
 * 0032 claims it "assigns the new permission keys to no role". The S-C mutation aimed at that
 * assertion and never reached it: 0010/0027's `reject_role_permission_self_elevation` refuses a
 * migration-authored `role_permissions` row outright, because a migration has no human actor. That
 * proves the earlier boundary works; it proves nothing about 0032's own detector.
 *
 * So these two cases isolate it, from opposite directions.
 *
 * THE ASSERTION IS NOT RETYPED HERE. It is extracted verbatim from the shipped migration and
 * executed, so the test cannot drift from what actually runs — a copy would keep passing after
 * someone edited the migration.
 */
describe("0032's zero-assignment assertion is live — §14 to §16", () => {
  const GUARD = 'app.reject_role_permission_self_elevation';

  /** The shipped §11 block, from `SET LOCAL ROLE` through `RESET ROLE`, wrapped to run alone. */
  function shippedAssertion(): string {
    const sql = readFileSync(
      join(MIGRATIONS_DIR, '0032_network_disclosure_authorization.up.sql'),
      'utf8',
    );
    const from = sql.indexOf(
      '  SET LOCAL ROLE freightos_admin_owner;\n\n  SELECT count(*) INTO v_int\n    FROM role_permissions',
    );
    expect(
      from,
      'the shipped neutrality assertion moved — this test must follow it',
    ).toBeGreaterThan(0);
    const to = sql.indexOf('  RESET ROLE;', from);
    expect(to).toBeGreaterThan(from);
    return `DO $probe$\nDECLARE v_int integer;\nBEGIN\n${sql.slice(from, to)}  RESET ROLE;\nEND\n$probe$;`;
  }

  const runShippedAssertion = (): Promise<string> =>
    asMigrator(async (client) => {
      try {
        await client.query(shippedAssertion());
        return 'passed';
      } catch (error) {
        return (error as Error).message;
      }
    });

  it('fires on a MIGRATION-AUTHORED assignment once the earlier guard is out of the way — S-C refined', async () => {
    await driveTo(N5A);

    // The earlier detector is neutralised for exactly as long as it takes the bad row to reach the
    // N5-A assertion, and its definition is captured first so the restoration is the original and
    // not a retyped approximation. Production semantics are unchanged by the end of this case.
    const original = (
      await owner.query<{ def: string }>(
        `SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'app' AND p.proname = 'reject_role_permission_self_elevation'`,
      )
    ).rows[0]!.def;
    expect(original).toContain('identity change refused');

    const roleId = fixtureA.roleId;
    let outcome = '';
    try {
      await owner.query(
        `CREATE OR REPLACE FUNCTION ${GUARD}() RETURNS trigger
         LANGUAGE plpgsql AS $mut$ BEGIN RETURN NEW; END $mut$`,
      );

      // Exactly what a careless 0032 would do: assign a key to an existing role, as the migration,
      // with no human actor anywhere.
      await owner.query(
        `INSERT INTO role_permissions (tenant_id, role_id, permission_id, created_by, updated_by)
         SELECT $1, $2, p.id, 'migration:0032', 'migration:0032'
           FROM permissions p WHERE p.key = 'network.disclosure_grant.read'`,
        [fixtureA.tenantId, roleId],
      );

      outcome = await runShippedAssertion();
    } finally {
      await owner.query(original);
      await owner.query(
        `DELETE FROM role_permissions rp USING permissions p
          WHERE p.id = rp.permission_id AND p.key LIKE 'network.disclosure_grant.%'`,
      );
    }

    // THE INTENDED DETECTOR, and nothing else.
    expect(outcome).toMatch(/must be assigned to NO role by this migration, found 1 assignment/);

    // The earlier guard is back, byte for byte, and still refuses.
    const restored = (
      await owner.query<{ def: string }>(
        `SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'app' AND p.proname = 'reject_role_permission_self_elevation'`,
      )
    ).rows[0]!.def;
    expect(restored).toBe(original);
    expect(await runShippedAssertion()).toBe('passed');
  }, 300_000);

  it('fires on a GOVERNED assignment too, and keeps firing after a governed revoke — §16', async () => {
    await driveTo(N5A);
    expect(await runShippedAssertion(), 'the assertion is dirty before this case starts').toBe(
      'passed',
    );

    const granted = await adminA.query<{ outcome: string; reason: string | null }>(
      'SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5)',
      [
        fixtureA.tenantId,
        fixtureA.roleId,
        'network.disclosure_grant.create',
        'identity_administration',
        randomUUID(),
      ],
    );
    expect(granted.rows[0]!.outcome, granted.rows[0]!.reason ?? '').toBe('succeeded');

    // LIVE. Real authority, created the way a tenant would create it, and the shipped assertion
    // sees it — which is what makes the zero it reports on a clean database mean something.
    expect(await runShippedAssertion()).toMatch(/must be assigned to NO role by this migration/);

    const assignmentId = (
      await owner.query<{ id: string }>(
        `SELECT rp.id FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
          WHERE p.key = 'network.disclosure_grant.create' AND rp.revoked_at IS NULL`,
      )
    ).rows[0]!.id;
    const revoked = await adminA.query<{ outcome: string; reason: string | null }>(
      'SELECT * FROM admin.revoke_role_permission($1, $2, $3, $4)',
      [fixtureA.tenantId, assignmentId, 'identity_administration', randomUUID()],
    );
    expect(revoked.rows[0]!.outcome, revoked.rows[0]!.reason ?? '').toBe('succeeded');

    // STILL FIRES, and that is the accepted behaviour rather than a defect — §19. The governed
    // path marks the row revoked and keeps it, because an authorization ledger does not forget
    // that authority was once held, and the assertion counts rows rather than live grants for the
    // same reason the down migration does: the foreign key does not distinguish them either.
    expect(await runShippedAssertion()).toMatch(/must be assigned to NO role by this migration/);

    // Only physically removing the ledger row clears it — a decision taken outside the migration,
    // which is exactly what the guard exists to force. Fixture cleanup, not a supported path.
    await owner.query('DELETE FROM role_permissions WHERE id = $1', [assignmentId]);
    expect(await runShippedAssertion()).toBe('passed');
  }, 300_000);
});
