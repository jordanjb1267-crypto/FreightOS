import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadMigrations, migrateDown, migrateUp } from '../../src/migrator.ts';
import { MIGRATIONS_DIR } from '../../src/paths.ts';
import { acquireClusterRoleLock, releaseClusterRoleLock } from './harness.ts';

/**
 * REGRESSION #4 — the cluster-global delivery-worker teardown, proven across databases.
 *
 * WHAT WENT WRONG. 0034's first revert ran `DROP ROLE freightos_delivery_worker` unconditionally.
 * A PostgreSQL role is a CLUSTER object: it is one catalog row shared by every database, and
 * `DROP ROLE` consults `pg_shdepend` across all of them. A revert in one database therefore tried
 * to remove a role that a neighbouring database was still using, and PostgreSQL cannot revoke
 * privileges in a database you are not connected to — so the revert either failed outright or,
 * worse, would have stranded the neighbour. 0029 states the doctrine: revoke locally, refuse on
 * owned relations, consult `pg_shdepend` excluding self, retain with a NOTICE when somebody else
 * still holds the role, and drop only as the last holder.
 *
 * WHY THIS FILE OWNS A CLUSTER. The proof needs a LAST-HOLDER case, and "last holder" is a
 * property of the whole cluster. The shared development cluster carries forty-odd test databases
 * that sit at tip 0034 between runs, so a revert there is permanently in the RETAIN branch and the
 * DROP branch could never be reached — a proof run against it would assert retention twice and
 * call it done. So this file initialises a disposable PostgreSQL 16 cluster of its own, on its own
 * socket and port, and tears it down afterwards. Nothing here touches the shared cluster.
 *
 * The four databases:
 *   DB_A — applies 0034, reverts FIRST while DB_B still holds the role
 *   DB_B — applies 0034, reverts LAST and must therefore be the one that drops the role
 *   DB_C — NEVER applies 0034. The negative control: its existence must not affect any decision
 *   DB_D — a separate 0034 database used only for the owned-relation refusal
 */

const PGVERSION = process.env['PGVERSION'] ?? '16';
const PGBIN = process.env['PGBIN'] ?? `/usr/lib/postgresql/${PGVERSION}/bin`;
const PROOF_ROOT = '/var/tmp/freightos-n6-teardown';
const PROOF_SOCK = `${PROOF_ROOT}/sock`;
const PROOF_PORT = 55444;

const DB_A = 'freightos_test_n6_teardown_a';
const DB_B = 'freightos_test_n6_teardown_b';
const DB_C = 'freightos_test_n6_teardown_c';
const DB_D = 'freightos_test_n6_teardown_d';

const WORKER = 'freightos_delivery_worker';
const MIGRATOR = 'freightos_migrator';
const N5B = 33;

const migrations = loadMigrations(MIGRATIONS_DIR);
const DOWN_SQL = readFileSync(
  join(MIGRATIONS_DIR, '0034_network_authorized_disclosure_delivery.down.sql'),
  'utf8',
);

let maintenance: Client;

function connect(database: string, user = MIGRATOR): Client {
  return new Client({ host: PROOF_SOCK, port: PROOF_PORT, user, database });
}

async function withClient<T>(
  database: string,
  work: (client: Client, notices: string[]) => Promise<T>,
  user = MIGRATOR,
): Promise<T> {
  const client = connect(database, user);
  const notices: string[] = [];
  client.on('notice', (n) => {
    if (n.message !== undefined) notices.push(n.message);
  });
  await client.connect();
  try {
    return await work(client, notices);
  } finally {
    await client.end();
  }
}

/** One scalar, from the proof cluster's maintenance connection. */
const scalar = async (sql: string, params: unknown[] = []): Promise<string> =>
  String((await maintenance.query<{ v: string }>(sql, params)).rows[0]?.v ?? '(null)');

/**
 * How many `pg_shdepend` rows in `database` reference the worker.
 *
 * This is the exact question the migration's STEP C asks, asked from the outside so the test is
 * not simply re-running the code it is grading. Database-level grants are recorded with `dbid = 0`
 * and the database in `objid`, so that arm is matched separately — otherwise a lingering CONNECT
 * would be invisible here while still blocking the DROP.
 */
async function referencesIn(database: string): Promise<number> {
  return Number(
    await scalar(
      `SELECT count(*)::text AS v
         FROM pg_shdepend s JOIN pg_roles r ON r.oid = s.refobjid
        WHERE r.rolname = $1
          AND (s.dbid = (SELECT oid FROM pg_database WHERE datname = $2)
            OR (s.classid = 'pg_database'::regclass
                AND s.objid = (SELECT oid FROM pg_database WHERE datname = $2)))`,
      [WORKER, database],
    ),
  );
}

const roleExists = async (): Promise<boolean> =>
  (await scalar('SELECT count(*)::text AS v FROM pg_roles WHERE rolname = $1', [WORKER])) !== '0';

/** Every database in the cluster with at least one reference to the worker. */
async function holders(): Promise<string[]> {
  const r = await maintenance.query<{ datname: string }>(
    `SELECT DISTINCT coalesce(d.datname,
              (SELECT dd.datname FROM pg_database dd
                WHERE dd.oid = s.objid AND s.classid = 'pg_database'::regclass)) AS datname
       FROM pg_shdepend s
       LEFT JOIN pg_database d ON d.oid = s.dbid
       JOIN pg_roles r ON r.oid = s.refobjid
      WHERE r.rolname = $1 ORDER BY 1`,
    [WORKER],
  );
  return r.rows.map((x) => x.datname).filter((x): x is string => x !== null);
}

/**
 * N6's tip is 34, and this file is about N6's worker role.
 *
 * `null` means "up to N6's tip", not "up to whatever the newest migration happens to be". Once N7-A
 * added 0035 — which creates a SECOND cluster-global role — an unbounded `migrateUp` would drag a
 * later phase's role into a proof about this one, and the role-count assertions would be measuring
 * two lifecycles at once. Pinning the ceiling keeps this test's subject exactly what its title says.
 */
const N6_TIP = 34;

async function driveTo(database: string, version: number | null): Promise<string[]> {
  return withClient(database, async (client, notices) => {
    if (version === null)
      await migrateUp(
        client,
        migrations.filter((m) => m.version <= N6_TIP),
      );
    else await migrateDown(client, migrations, version);
    return notices;
  });
}

beforeAll(async () => {
  // The shared cluster's role lock, taken even though every role this file touches lives in its
  // OWN cluster and cannot contend with anything. `cluster-role-lock-coverage` requires it of
  // every migration-driving integration file, and the right answer to "this one is different" is
  // to satisfy the rule rather than to teach the rule about exceptions: an exemption is a thing a
  // later file can quietly qualify for, and the cost here is a few seconds of serialisation.
  await acquireClusterRoleLock();

  // A cluster of this file's own. `--auth=trust` and an empty `listen_addresses` mean it is
  // reachable only through its own unix socket, exactly like the development cluster.
  rmSync(PROOF_ROOT, { recursive: true, force: true });
  execFileSync('bash', [join(process.cwd(), 'scripts/dev-postgres.sh'), 'start'], {
    env: {
      ...process.env,
      FREIGHTOS_PGROOT: PROOF_ROOT,
      FREIGHTOS_PGPORT: String(PROOF_PORT),
      FREIGHTOS_PGDATABASE: 'postgres',
    },
    stdio: 'pipe',
  });

  maintenance = new Client({
    host: PROOF_SOCK,
    port: PROOF_PORT,
    user: 'postgres',
    database: 'postgres',
  });
  await maintenance.connect();

  // The migration authority, as `scripts/bootstrap-migration-authority.sql` provisions it. On a
  // genuinely empty cluster nothing else needs granting: migration 0001 creates the remaining
  // roles, and creating them under CREATEROLE mints the admin edges by itself.
  await maintenance.query(
    `CREATE ROLE ${MIGRATOR} LOGIN CREATEROLE NOSUPERUSER NOBYPASSRLS NOCREATEDB`,
  );
  for (const name of [DB_A, DB_B, DB_C, DB_D]) {
    await maintenance.query(`CREATE DATABASE ${name}`);
    await maintenance.query(`ALTER DATABASE ${name} OWNER TO ${MIGRATOR}`);
  }
}, 600_000);

afterAll(async () => {
  await maintenance?.end().catch(() => undefined);
  try {
    execFileSync('bash', [join(process.cwd(), 'scripts/dev-postgres.sh'), 'stop'], {
      env: {
        ...process.env,
        FREIGHTOS_PGROOT: PROOF_ROOT,
        FREIGHTOS_PGPORT: String(PROOF_PORT),
      },
      stdio: 'pipe',
    });
  } catch {
    execFileSync(`${PGBIN}/pg_ctl`, ['-D', `${PROOF_ROOT}/data`, '-m', 'immediate', 'stop'], {
      stdio: 'pipe',
    }).toString();
  }
  rmSync(PROOF_ROOT, { recursive: true, force: true });
  await releaseClusterRoleLock();
});

describe('the cluster starts clean — the precondition every claim below rests on', () => {
  it('has no delivery worker before any database applies 0034', async () => {
    expect(await roleExists()).toBe(false);
    expect(await holders()).toEqual([]);
  });
});

describe('DB_A and DB_B apply 0034 independently', () => {
  it('reaches tip 34 in DB_A and creates the role once', async () => {
    await driveTo(DB_A, null);
    // `scalar` runs on the maintenance database, so the tip is read from DB_A itself.
    const tip = await withClient(DB_A, async (c) =>
      String(
        (await c.query<{ v: string }>('SELECT max(version)::text AS v FROM schema_migrations'))
          .rows[0]!.v,
      ),
    );
    expect(tip).toBe('34');
    expect(await roleExists()).toBe(true);
    expect(await referencesIn(DB_A)).toBeGreaterThan(0);
    expect(await holders()).toEqual([DB_A]);
  }, 600_000);

  it('reaches tip 34 in DB_B and REUSES the same cluster role rather than duplicating it', async () => {
    await driveTo(DB_B, null);
    // One catalog row, not two. A role is cluster-global: the second database found it already
    // present and 0034's guarded CREATE converged on it instead of failing or shadowing it.
    expect(
      await scalar('SELECT count(*)::text AS v FROM pg_roles WHERE rolname = $1', [WORKER]),
    ).toBe('1');
    expect(await referencesIn(DB_A)).toBeGreaterThan(0);
    expect(await referencesIn(DB_B)).toBeGreaterThan(0);
    expect(await holders()).toEqual([DB_A, DB_B]);
  }, 600_000);

  it('carries the role attributes and the migrator edge 0029 requires', async () => {
    const attrs = await scalar(
      `SELECT format('login=%s super=%s createdb=%s createrole=%s bypassrls=%s replication=%s',
                rolcanlogin::text, rolsuper::text, rolcreatedb::text, rolcreaterole::text,
                rolbypassrls::text, rolreplication::text) AS v
         FROM pg_roles WHERE rolname = $1`,
      [WORKER],
    );
    expect(attrs).toBe(
      'login=true super=false createdb=false createrole=false bypassrls=false replication=false',
    );

    // §36 — the edge the migrator holds over the worker, snapshot BEFORE any revert. ADMIN so the
    // migrator can drop it; never INHERIT and never SET, so holding the administration right can
    // never become the ability to act as the worker.
    expect(await migratorEdge()).toBe('admin=true inherit=false set=false');
  });
});

/** The migrator's membership over the worker, in the one form all three options are visible. */
async function migratorEdge(): Promise<string> {
  return scalar(
    `SELECT coalesce(string_agg(format('admin=%s inherit=%s set=%s',
              am.admin_option::text, am.inherit_option::text, am.set_option::text),
              ', ' ORDER BY 1), '(none)') AS v
       FROM pg_auth_members am
       JOIN pg_roles r ON r.oid = am.roleid
       JOIN pg_roles m ON m.oid = am.member
      WHERE r.rolname = $1 AND m.rolname = $2`,
    [WORKER, MIGRATOR],
  );
}

describe('DB_C is the negative control', () => {
  it('never applied 0034 and holds no reference at all', async () => {
    const tip = await withClient(DB_C, async (c) => {
      const r = await c.query<{ v: string | null }>(
        `SELECT to_regclass('public.schema_migrations')::text AS v`,
      );
      return r.rows[0]!.v;
    });
    expect(tip, 'DB_C must never have been migrated').toBeNull();
    expect(await referencesIn(DB_C)).toBe(0);
    expect(await holders()).not.toContain(DB_C);
  }, 120_000);
});

describe('DB_A reverts first — the retention branch', () => {
  let notices: string[] = [];

  it('reverts DB_A to 0033 and RETAINS the role, saying so out loud', async () => {
    notices = await driveTo(DB_A, N5B);

    // DB_A is fully reverted.
    const left = await withClient(DB_A, async (c) => {
      const r = await c.query<{ v: string }>(
        `SELECT format('tip=%s n6tables=%s n4policy=%s keys=%s',
                  (SELECT max(version) FROM schema_migrations),
                  (SELECT count(*) FROM pg_class c2 JOIN pg_namespace n ON n.oid = c2.relnamespace
                    WHERE n.nspname='public' AND c2.relkind='r'
                      AND c2.relname IN ('network_disclosure_subscriptions',
                        'network_disclosure_subscription_revocations',
                        'network_disclosure_routing_resolutions','network_disclosure_artifacts',
                        'network_disclosure_deliveries','network_delivery_attempts',
                        'network_disclosure_inbox')),
                  (SELECT count(*) FROM pg_policies WHERE schemaname='public'
                    AND policyname LIKE '%delivery_worker%'),
                  (SELECT count(*) FROM permissions
                    WHERE key LIKE 'network.disclosure_subscription.%')) AS v`,
      );
      return r.rows[0]!.v;
    });
    expect(left).toBe('tip=33 n6tables=0 n4policy=0 keys=0');

    // The role survives, because DB_B still needs it.
    expect(await roleExists()).toBe(true);
    expect(await referencesIn(DB_A)).toBe(0);
    expect(await referencesIn(DB_B)).toBeGreaterThan(0);

    // And the revert SAID so. A silent retention is indistinguishable from a revert that forgot.
    const retention = notices.filter((n) => n.includes('RETAINED'));
    expect(retention).toHaveLength(1);
    expect(retention[0]).toContain(WORKER);
    expect(retention[0]).toContain(DB_B);
    expect(retention[0]).toContain('dropped by whichever database releases it last');
  }, 600_000);

  it('retained it because DB_B DEPENDS on it, not because another database merely exists', async () => {
    // The distinction that makes the retention correct rather than lucky. DB_C exists, is a
    // perfectly good database, and contributes nothing: the decision is made of dependencies.
    expect(await referencesIn(DB_A)).toBe(0);
    expect(await referencesIn(DB_B)).toBeGreaterThan(0);
    expect(await referencesIn(DB_C)).toBe(0);
    expect(await holders()).toEqual([DB_B]);
  });

  it('left DB_B completely untouched', async () => {
    const b = await withClient(DB_B, async (c) => {
      const r = await c.query<{ v: string }>(
        `SELECT format('tip=%s n6tables=%s keys=%s', (SELECT max(version) FROM schema_migrations),
                  (SELECT count(*) FROM pg_class c2 JOIN pg_namespace n ON n.oid = c2.relnamespace
                    WHERE n.nspname='public' AND c2.relkind='r'
                      AND c2.relname IN ('network_disclosure_subscriptions',
                        'network_disclosure_subscription_revocations',
                        'network_disclosure_routing_resolutions','network_disclosure_artifacts',
                        'network_disclosure_deliveries','network_delivery_attempts',
                        'network_disclosure_inbox')),
                  (SELECT count(*) FROM permissions
                    WHERE key LIKE 'network.disclosure_subscription.%')) AS v`,
      );
      return r.rows[0]!.v;
    });
    expect(b).toBe('tip=34 n6tables=7 keys=3');
    expect(await migratorEdge()).toBe('admin=true inherit=false set=false');
  }, 120_000);
});

describe('the owned-relation refusal — STEP B', () => {
  it('refuses to revert while the worker owns a relation, and tears nothing down', async () => {
    await driveTo(DB_D, null);
    // Handing ownership over needs SET ROLE on the target, and the migrator deliberately does not
    // have it — that separation is the point of `admin=true set=false`. So the superuser plays the
    // part of whoever, in production, would have created an object as this role.
    await withClient(
      DB_D,
      async (client) => {
        await client.query('CREATE TABLE n6_worker_owned_probe (id uuid PRIMARY KEY)');
        await client.query(`ALTER TABLE n6_worker_owned_probe OWNER TO ${WORKER}`);
      },
      'postgres',
    );

    const error = await withClient(DB_D, async (client) =>
      migrateDown(client, migrations, N5B).then(
        () => null,
        (e: { message?: string }) => e,
      ),
    );
    expect(
      error,
      'the revert must refuse rather than reassign somebody else’s object',
    ).not.toBeNull();
    // TWO relations for one table, and that is 0029's arithmetic rather than a miscount: a primary
    // key is its own `pg_class` row with the same owner, and STEP B counts `pg_class` exactly as
    // 0029's event-writer teardown does. The number is not the assertion — the refusal is — but it
    // is pinned so a future change to the counting rule has to be deliberate in both migrations.
    expect((error as { message?: string }).message).toMatch(
      /0034 down: freightos_delivery_worker owns 2 relation\(s\)\. Reassign or drop them deliberately\./,
    );
    const owned = await maintenance.query<{ v: string }>(
      `SELECT count(*)::text AS v FROM pg_database WHERE datname = $1`,
      [DB_D],
    );
    expect(owned.rows[0]!.v).toBe('1');

    // NO PARTIAL TEARDOWN. The refusal is raised inside the migration transaction, so DB_D must
    // still be a complete 0034 database — a revert that got halfway and then refused would be
    // worse than one that never ran.
    const after = await withClient(DB_D, async (c) => {
      const r = await c.query<{ v: string }>(
        `SELECT format('tip=%s n6tables=%s keys=%s',
                  (SELECT max(version) FROM schema_migrations),
                  (SELECT count(*) FROM pg_class c2 JOIN pg_namespace n ON n.oid = c2.relnamespace
                    WHERE n.nspname='public' AND c2.relkind='r'
                      AND c2.relname IN ('network_disclosure_subscriptions',
                        'network_disclosure_subscription_revocations',
                        'network_disclosure_routing_resolutions','network_disclosure_artifacts',
                        'network_disclosure_deliveries','network_delivery_attempts',
                        'network_disclosure_inbox')),
                  (SELECT count(*) FROM permissions
                    WHERE key LIKE 'network.disclosure_subscription.%')) AS v`,
      );
      return r.rows[0]!.v;
    });
    expect(after).toBe('tip=34 n6tables=7 keys=3');
    expect(await roleExists()).toBe(true);

    // Clean up the probe DELIBERATELY — which is exactly what the migration told us to do — then
    // let DB_D go back to 0033 so it stops holding the role for the last-holder proof below.
    await withClient(
      DB_D,
      async (client) => {
        await client.query('DROP TABLE n6_worker_owned_probe');
      },
      'postgres',
    );
    await driveTo(DB_D, N5B);
    expect(await referencesIn(DB_D)).toBe(0);
  }, 900_000);
});

describe('DB_B reverts last — the drop branch', () => {
  it('drops the role once the final reference goes, with DB_C still present', async () => {
    // The precondition, measured rather than assumed: DB_B is genuinely the last holder.
    expect(await holders()).toEqual([DB_B]);

    const notices = await driveTo(DB_B, N5B);

    expect(await referencesIn(DB_A)).toBe(0);
    expect(await referencesIn(DB_B)).toBe(0);
    expect(await referencesIn(DB_C)).toBe(0);
    expect(await referencesIn(DB_D)).toBe(0);

    // THE LAST-HOLDER PROOF. If the role survived here, regression #4 would not be fixed — it
    // would merely have been converted from "drops too eagerly" into "never drops at all".
    expect(await roleExists()).toBe(false);
    expect(await holders()).toEqual([]);

    // And this revert did NOT claim retention.
    expect(notices.filter((n) => n.includes('RETAINED'))).toEqual([]);
  }, 600_000);

  it('proves DB_C did not prevent the drop — the false-retention control', async () => {
    // DB_C is still there, still a database, still contributing zero references. Without this
    // control, an implementation that retained whenever ANY other database existed would have
    // passed the retention test above and failed nothing.
    const present = await scalar('SELECT count(*)::text AS v FROM pg_database WHERE datname = $1', [
      DB_C,
    ]);
    expect(present).toBe('1');
    expect(await roleExists()).toBe(false);
  });

  it('is re-appliable — the role comes back cleanly for whoever needs it next', async () => {
    // A teardown that cannot be undone is not a teardown, it is a one-way door. Re-applying in
    // DB_B recreates the role from nothing, which also proves the DROP really removed it.
    await driveTo(DB_B, null);
    expect(await roleExists()).toBe(true);
    expect(await holders()).toEqual([DB_B]);
    expect(await migratorEdge()).toBe('admin=true inherit=false set=false');
  }, 600_000);
});

describe('the revert source itself — no destructive shortcut', () => {
  it('uses neither DROP OWNED nor CASCADE anywhere in the role cleanup path', () => {
    // Both would "work". `DROP OWNED BY` would silently delete objects and privileges this
    // migration never created, in this database only, leaving every other database's grants in
    // place — the opposite of what is needed. `DROP ROLE ... CASCADE` is not even valid SQL, and
    // reaching for a CASCADE elsewhere in the teardown would dissolve dependencies unnamed.
    //
    // Graded against the EXECUTABLE text, with `--` comments stripped: the file discusses both
    // words at length, precisely because deciding not to use them is the interesting part of the
    // teardown, and a check that counted prose would force the reasoning to be deleted to stay
    // green. What must contain neither is the SQL that runs.
    const executable = DOWN_SQL.split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
    expect(executable).not.toMatch(/DROP\s+OWNED\s+BY/i);
    expect(executable.match(/CASCADE/gi) ?? []).toEqual([]);
    // The prose really is where they live, so the strip above removed something rather than
    // silently matching nothing.
    expect(DOWN_SQL.match(/CASCADE/gi)?.length ?? 0).toBeGreaterThan(0);

    // Positive control: the file really does contain the teardown being graded, so the two
    // absences above are statements about the role cleanup rather than about an unread file.
    expect(DOWN_SQL).toContain(`DROP ROLE ${WORKER}`);
    expect(DOWN_SQL).toContain('pg_shdepend');
    expect(DOWN_SQL).toMatch(/RETAINED/);
  });
});
