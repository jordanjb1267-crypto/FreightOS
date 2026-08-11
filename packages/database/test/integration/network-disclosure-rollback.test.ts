import { randomUUID } from 'node:crypto';
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
