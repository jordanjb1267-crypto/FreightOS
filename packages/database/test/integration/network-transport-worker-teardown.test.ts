import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadMigrations, migrateDown, migrateUp } from '../../src/migrator.ts';
import { MIGRATIONS_DIR } from '../../src/paths.ts';
import { acquireClusterRoleLock, releaseClusterRoleLock } from './harness.ts';

/**
 * N7-A §47 — the cluster-global transport-worker teardown, proven across databases.
 *
 * 0035 creates the SECOND cluster-global role in the network band. A PostgreSQL role is one
 * catalog row shared by every database in the cluster, and `DROP ROLE` consults `pg_shdepend`
 * across all of them — so a revert in one database can try to remove a role a neighbour is still
 * using, and PostgreSQL cannot revoke privileges in a database you are not connected to. That is
 * regression #4, found on 0034, and 0029 states the doctrine that fixes it: revoke locally, refuse
 * on owned relations, consult BOTH `pg_shdepend` arms excluding self, retain with a NOTICE while
 * somebody else still holds the role, and drop only as the last holder.
 *
 * This file proves 0035 inherited the doctrine rather than merely being written after it. The
 * argument is not "0034 does this correctly, so 0035 does too" — the two teardowns are separate
 * blocks of SQL and only one of them has ever been executed against a real multi-database cluster.
 *
 * WHAT IS DIFFERENT HERE, and why it needs its own proof rather than a parameter on N6's:
 * reverting 0035 tears down the TRANSPORT worker while the DELIVERY worker stays, because 0034 is
 * still applied underneath. A teardown that reached one role name too far — or that revoked from
 * the wrong role, which is a single-token mistake in a block full of near-identical REVOKE lines —
 * would strand every database in the cluster at N6. So the delivery worker's survival is asserted
 * at every step, not assumed.
 *
 * WHY THIS FILE OWNS A CLUSTER. The proof needs a LAST-HOLDER case, and "last holder" is a property
 * of the whole cluster. The shared development cluster carries forty-odd databases sitting at tip
 * 35 between runs, so a revert there is permanently in the RETAIN branch and the DROP branch could
 * never be reached — a proof run against it would assert retention twice and call it done. So this
 * file initialises a disposable PostgreSQL 16 cluster of its own, on its own socket and port, and
 * tears it down afterwards. Nothing here touches the shared cluster.
 *
 * The four databases:
 *   DB_A — applies 0035, reverts FIRST while DB_B still holds the role
 *   DB_B — applies 0035, reverts LAST and must therefore be the one that drops the role
 *   DB_C — NEVER applies anything. The negative control: its existence must not affect a decision
 *   DB_D — a separate 0035 database used only for the owned-relation refusal
 */

const PGVERSION = process.env['PGVERSION'] ?? '16';
const PGBIN = process.env['PGBIN'] ?? `/usr/lib/postgresql/${PGVERSION}/bin`;
const PROOF_ROOT = '/var/tmp/freightos-n7-teardown';
const PROOF_SOCK = `${PROOF_ROOT}/sock`;
const PROOF_PORT = 55445;

const DB_A = 'freightos_test_n7_teardown_a';
const DB_B = 'freightos_test_n7_teardown_b';
const DB_C = 'freightos_test_n7_teardown_c';
const DB_D = 'freightos_test_n7_teardown_d';

const WORKER = 'freightos_transport_worker';
/** The role that must SURVIVE every revert below. N6 is still applied underneath. */
const DELIVERY_WORKER = 'freightos_delivery_worker';
const MIGRATOR = 'freightos_migrator';
const N6_TIP = 34;
const N7_TIP = 35;

const migrations = loadMigrations(MIGRATIONS_DIR);
const DOWN_SQL = readFileSync(
  join(MIGRATIONS_DIR, '0035_network_external_transport_foundation.down.sql'),
  'utf8',
);

/**
 * NOTE ON THE ACKNOWLEDGEMENT GUARD, which this file deliberately does not exercise.
 *
 * 0035 down refuses an unacknowledged revert only when destinations or obligations actually exist —
 * a downgrade that destroys nothing needs no ceremony. Every database here is structurally
 * migrated and carries no N7 rows, so the guard is correctly silent throughout. Proving it fires
 * needs a POPULATED database, which is the migration-lifecycle proof's job; asserting it here
 * against empty tables would credit a control that never ran.
 */
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

const scalar = async (sql: string, params: unknown[] = []): Promise<string> =>
  String((await maintenance.query<{ v: string }>(sql, params)).rows[0]?.v ?? '(null)');

/**
 * How many `pg_shdepend` rows in `database` reference `role`.
 *
 * The exact question the migration's STEP C asks, asked from the outside so the test is not simply
 * re-running the code it is grading. Database-level grants are recorded with `dbid = 0` and the
 * database in `objid`, so that arm is matched separately — otherwise a lingering CONNECT would be
 * invisible here while still blocking the DROP.
 */
async function referencesIn(database: string, role = WORKER): Promise<number> {
  return Number(
    await scalar(
      `SELECT count(*)::text AS v
         FROM pg_shdepend s JOIN pg_roles r ON r.oid = s.refobjid
        WHERE r.rolname = $1
          AND (s.dbid = (SELECT oid FROM pg_database WHERE datname = $2)
            OR (s.classid = 'pg_database'::regclass
                AND s.objid = (SELECT oid FROM pg_database WHERE datname = $2)))`,
      [role, database],
    ),
  );
}

const roleExists = async (role = WORKER): Promise<boolean> =>
  (await scalar('SELECT count(*)::text AS v FROM pg_roles WHERE rolname = $1', [role])) !== '0';

/** Every database in the cluster with at least one reference to `role`. */
async function holders(role = WORKER): Promise<string[]> {
  const r = await maintenance.query<{ datname: string }>(
    `SELECT DISTINCT coalesce(d.datname,
              (SELECT dd.datname FROM pg_database dd
                WHERE dd.oid = s.objid AND s.classid = 'pg_database'::regclass)) AS datname
       FROM pg_shdepend s
       LEFT JOIN pg_database d ON d.oid = s.dbid
       JOIN pg_roles r ON r.oid = s.refobjid
      WHERE r.rolname = $1 ORDER BY 1`,
    [role],
  );
  return r.rows.map((x) => x.datname).filter((x): x is string => x !== null);
}

/** The migrator's membership over a role, in the one form all three options are visible. */
async function migratorEdge(role = WORKER): Promise<string> {
  return scalar(
    `SELECT coalesce(string_agg(format('admin=%s inherit=%s set=%s',
              am.admin_option::text, am.inherit_option::text, am.set_option::text),
              ', ' ORDER BY 1), '(none)') AS v
       FROM pg_auth_members am
       JOIN pg_roles r ON r.oid = am.roleid
       JOIN pg_roles m ON m.oid = am.member
      WHERE r.rolname = $1 AND m.rolname = $2`,
    [role, MIGRATOR],
  );
}

async function driveTo(database: string, version: number | null): Promise<string[]> {
  return withClient(database, async (client, notices) => {
    if (version === null) {
      await migrateUp(
        client,
        migrations.filter((m) => m.version <= N7_TIP),
      );
    } else {
      await migrateDown(client, migrations, version);
    }
    return notices;
  });
}

/** The N7 surface in one line, so a partial revert is a diff rather than a guess. */
const N7_STATE = `SELECT format('tip=%s tables=%s policies=%s keys=%s',
    (SELECT max(version) FROM schema_migrations),
    (SELECT count(*) FROM pg_class c2 JOIN pg_namespace n ON n.oid = c2.relnamespace
      WHERE n.nspname='public' AND c2.relkind='r'
        AND (c2.relname LIKE 'network\\_external\\_transport%'
             OR c2.relname LIKE 'network\\_transport\\_destination%')),
    (SELECT count(*) FROM pg_policies WHERE schemaname='public'
      AND policyname LIKE '%transport_worker%'),
    (SELECT count(*) FROM permissions
      WHERE key LIKE 'network.transport_destination.%')) AS v`;

const n7State = async (database: string): Promise<string> =>
  withClient(database, async (c) => (await c.query<{ v: string }>(N7_STATE)).rows[0]!.v);

beforeAll(async () => {
  // The shared cluster's role lock, taken even though every role this file touches lives in its
  // OWN cluster and cannot contend with anything. `cluster-role-lock-coverage` requires it of every
  // migration-driving integration file, and the right answer to "this one is different" is to
  // satisfy the rule rather than to teach the rule about exceptions.
  await acquireClusterRoleLock();

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

  await maintenance.query(
    `CREATE ROLE ${MIGRATOR} LOGIN CREATEROLE NOSUPERUSER NOBYPASSRLS NOCREATEDB`,
  );
  for (const name of [DB_A, DB_B, DB_C, DB_D]) {
    await maintenance.query(`CREATE DATABASE ${name}`);
    await maintenance.query(`ALTER DATABASE ${name} OWNER TO ${MIGRATOR}`);
  }
}, 900_000);

afterAll(async () => {
  await maintenance?.end().catch(() => undefined);
  try {
    execFileSync('bash', [join(process.cwd(), 'scripts/dev-postgres.sh'), 'stop'], {
      env: { ...process.env, FREIGHTOS_PGROOT: PROOF_ROOT, FREIGHTOS_PGPORT: String(PROOF_PORT) },
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
  it('has neither worker role before any database applies a migration', async () => {
    expect(await roleExists(WORKER)).toBe(false);
    expect(await roleExists(DELIVERY_WORKER)).toBe(false);
    expect(await holders()).toEqual([]);
  });
});

describe('DB_A and DB_B apply 0035 independently', () => {
  it('reaches tip 35 in DB_A and creates the transport worker once', async () => {
    await driveTo(DB_A, null);
    expect(await n7State(DB_A)).toBe('tip=35 tables=5 policies=10 keys=3');
    expect(await roleExists()).toBe(true);
    expect(await referencesIn(DB_A)).toBeGreaterThan(0);
    expect(await holders()).toEqual([DB_A]);
  }, 900_000);

  it('reaches tip 35 in DB_B and REUSES the same cluster role rather than duplicating it', async () => {
    await driveTo(DB_B, null);
    // One catalog row, not two. The second database found the role already present and 0035's
    // guarded CREATE converged on it instead of failing or shadowing it.
    expect(
      await scalar('SELECT count(*)::text AS v FROM pg_roles WHERE rolname = $1', [WORKER]),
    ).toBe('1');
    expect(await referencesIn(DB_A)).toBeGreaterThan(0);
    expect(await referencesIn(DB_B)).toBeGreaterThan(0);
    expect(await holders()).toEqual([DB_A, DB_B]);
  }, 900_000);

  it('carries the role attributes and the ADMIN-only migrator edge OR-02 requires', async () => {
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
    // ADMIN so the migrator can drop it; never INHERIT and never SET, so holding the administration
    // right can never become the ability to execute external transport.
    expect(await migratorEdge()).toBe('admin=true inherit=false set=false');

    // AND NO EDGE BETWEEN THE TWO WORKERS, measured in a cluster where both exist. This is the
    // primary security invariant, and a cluster carrying both roles is the only place it can be
    // falsified.
    const between = await scalar(
      `SELECT coalesce(string_agg(format('%s->%s', m.rolname, r.rolname), ', '), '(none)') AS v
         FROM pg_auth_members am
         JOIN pg_roles r ON r.oid = am.roleid
         JOIN pg_roles m ON m.oid = am.member
        WHERE (m.rolname = $1 AND r.rolname = $2) OR (m.rolname = $2 AND r.rolname = $1)`,
      [WORKER, DELIVERY_WORKER],
    );
    expect(between).toBe('(none)');
  });
});

describe('DB_C is the negative control', () => {
  it('never applied anything and holds no reference at all', async () => {
    const tip = await withClient(DB_C, async (c) => {
      const r = await c.query<{ v: string | null }>(
        `SELECT to_regclass('public.schema_migrations')::text AS v`,
      );
      return r.rows[0]!.v;
    });
    expect(tip, 'DB_C must never have been migrated').toBeNull();
    expect(await referencesIn(DB_C)).toBe(0);
    expect(await holders()).not.toContain(DB_C);
  }, 300_000);
});

describe('DB_A reverts first — the retention branch', () => {
  let notices: string[] = [];

  it('reverts DB_A to 0034 and RETAINS the role, saying so out loud', async () => {
    notices = await driveTo(DB_A, N6_TIP);

    // DB_A is fully reverted: no N7 table, no transport-worker policy, no destination key.
    expect(await n7State(DB_A)).toBe('tip=34 tables=0 policies=0 keys=0');

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
  }, 900_000);

  it('retained it because DB_B DEPENDS on it, not because another database merely exists', async () => {
    expect(await referencesIn(DB_A)).toBe(0);
    expect(await referencesIn(DB_B)).toBeGreaterThan(0);
    expect(await referencesIn(DB_C)).toBe(0);
    expect(await holders()).toEqual([DB_B]);
  });

  it('leaves N6 and its delivery worker completely intact in the reverted database', async () => {
    // THE ASSERTION THIS FILE EXISTS FOR THAT N6's DOES NOT. Reverting 0035 must remove the
    // transport worker's grants and nothing else. A single mis-typed role name in the REVOKE block
    // — and there are a dozen near-identical lines — would strip the delivery worker instead, and
    // every N6 database in the cluster would silently stop being able to deliver.
    expect(await roleExists(DELIVERY_WORKER)).toBe(true);
    expect(await referencesIn(DB_A, DELIVERY_WORKER)).toBeGreaterThan(0);
    expect(await migratorEdge(DELIVERY_WORKER)).toBe('admin=true inherit=false set=false');

    // Stated structurally rather than as a grant COUNT. A count would be a number nobody can check
    // and would have to be re-guessed every time an unrelated migration touched the delivery
    // worker; what actually matters is the SHAPE — every N6 table still readable, and nothing N7
    // left behind.
    const n6 = await withClient(DB_A, async (c) => {
      const r = await c.query<{ relname: string }>(
        `SELECT DISTINCT c.relname
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           CROSS JOIN LATERAL aclexplode(c.relacl) a
           JOIN pg_roles g ON g.oid = a.grantee
          WHERE n.nspname = 'public' AND g.rolname = 'freightos_delivery_worker'
          ORDER BY 1`,
      );
      return r.rows.map((x) => x.relname);
    });
    for (const table of [
      'network_disclosure_subscriptions',
      'network_disclosure_subscription_revocations',
      'network_disclosure_routing_resolutions',
      'network_disclosure_artifacts',
      'network_disclosure_deliveries',
      'network_delivery_attempts',
      'network_disclosure_inbox',
    ]) {
      expect(n6, `the 0035 revert stripped the delivery worker's ${table} grant`).toContain(table);
    }
    // And every N7 grant it held is gone, including the two obligation/permit writes the brokered
    // design gave it. Reverting N7 must leave the delivery worker exactly as N6 left it.
    expect(n6.filter((t) => /^network_(external_transport|transport_destination)/.test(t))).toEqual(
      [],
    );

    const n6Surface = await withClient(DB_A, async (c) => {
      const r = await c.query<{ v: string }>(
        `SELECT format('n6tables=%s keys=%s',
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
    expect(n6Surface).toBe('n6tables=7 keys=3');
  }, 300_000);

  it('left DB_B completely untouched', async () => {
    expect(await n7State(DB_B)).toBe('tip=35 tables=5 policies=10 keys=3');
    expect(await migratorEdge()).toBe('admin=true inherit=false set=false');
  }, 300_000);
});

describe('the owned-relation refusal — STEP B', () => {
  it('refuses to revert while the transport worker owns a relation, and tears nothing down', async () => {
    await driveTo(DB_D, null);
    // Handing ownership over needs SET ROLE on the target, and the migrator deliberately does not
    // have it — that separation is the point of `admin=true set=false`. So the superuser plays the
    // part of whoever, in production, would have created an object as this role.
    await withClient(
      DB_D,
      async (client) => {
        await client.query('CREATE TABLE n7_worker_owned_probe (id uuid PRIMARY KEY)');
        await client.query(`ALTER TABLE n7_worker_owned_probe OWNER TO ${WORKER}`);
      },
      'postgres',
    );

    const error = await withClient(DB_D, async (client) =>
      migrateDown(client, migrations, N6_TIP).then(
        () => null,
        (e: { message?: string }) => e,
      ),
    );
    expect(
      error,
      'the revert must refuse rather than reassign somebody else’s object',
    ).not.toBeNull();
    // TWO relations for one table: a primary key is its own `pg_class` row with the same owner, and
    // STEP B counts `pg_class` exactly as 0029's and 0034's teardowns do. The number is not the
    // assertion — the refusal is — but it is pinned so a change to the counting rule has to be
    // deliberate in all three migrations.
    expect((error as { message?: string }).message).toMatch(
      /0035 down: freightos_transport_worker owns 2 relation\(s\)\. Reassign or drop them deliberately\./,
    );

    // NO PARTIAL TEARDOWN. The refusal is raised inside the migration transaction, so DB_D must
    // still be a complete 0035 database — a revert that got halfway and then refused would be
    // worse than one that never ran. And the message above pins it to STEP B specifically: DB_D
    // holds no N7 rows, so the acknowledgement guard is silent here and cannot be what refused.
    // Distinguishing the two matters — a test that reached the guard instead would be crediting
    // the wrong control.
    expect(await n7State(DB_D)).toBe('tip=35 tables=5 policies=10 keys=3');
    expect(await roleExists()).toBe(true);

    // Clean up the probe DELIBERATELY — which is exactly what the migration told us to do — then
    // let DB_D go back to 0034 so it stops holding the role for the last-holder proof below.
    await withClient(
      DB_D,
      async (client) => {
        await client.query('DROP TABLE n7_worker_owned_probe');
      },
      'postgres',
    );
    await driveTo(DB_D, N6_TIP);
    expect(await referencesIn(DB_D)).toBe(0);
  }, 1_200_000);
});

describe('DB_B reverts last — the drop branch', () => {
  it('drops the transport worker once the final reference goes, with DB_C still present', async () => {
    // The precondition, measured rather than assumed: DB_B is genuinely the last holder.
    expect(await holders()).toEqual([DB_B]);

    const notices = await driveTo(DB_B, N6_TIP);

    for (const database of [DB_A, DB_B, DB_C, DB_D]) {
      expect(await referencesIn(database)).toBe(0);
    }

    // THE LAST-HOLDER PROOF. If the role survived here, the doctrine would not be implemented — it
    // would merely have been converted from "drops too eagerly" into "never drops at all".
    expect(await roleExists()).toBe(false);
    expect(await holders()).toEqual([]);
    expect(notices.filter((n) => n.includes('RETAINED'))).toEqual([]);

    // And the delivery worker is STILL THERE, in a cluster where every database is now at N6. The
    // transport worker's teardown removed exactly one role.
    expect(await roleExists(DELIVERY_WORKER)).toBe(true);
    expect(await holders(DELIVERY_WORKER)).toEqual([DB_A, DB_B, DB_D]);
  }, 900_000);

  it('proves DB_C did not prevent the drop — the false-retention control', async () => {
    // DB_C is still there, still a database, still contributing zero references. Without this
    // control, an implementation that retained whenever ANY other database existed would have
    // passed the retention test above and failed nothing.
    expect(
      await scalar('SELECT count(*)::text AS v FROM pg_database WHERE datname = $1', [DB_C]),
    ).toBe('1');
    expect(await roleExists()).toBe(false);
  });

  it('is re-appliable — the role comes back cleanly for whoever needs it next', async () => {
    // A teardown that cannot be undone is not a teardown, it is a one-way door. Re-applying in DB_B
    // recreates the role from nothing, which also proves the DROP really removed it.
    await driveTo(DB_B, null);
    expect(await roleExists()).toBe(true);
    expect(await holders()).toEqual([DB_B]);
    expect(await migratorEdge()).toBe('admin=true inherit=false set=false');
    expect(await n7State(DB_B)).toBe('tip=35 tables=5 policies=10 keys=3');
  }, 900_000);
});

describe('the revert source itself — no destructive shortcut', () => {
  it('uses neither DROP OWNED nor CASCADE anywhere in the role cleanup path', () => {
    // Both would "work". `DROP OWNED BY` would silently delete objects and privileges this
    // migration never created, in this database only, leaving every other database's grants in
    // place — the opposite of what is needed. `DROP ROLE ... CASCADE` is not even valid SQL.
    //
    // Graded against the EXECUTABLE text, with `--` comments stripped: the file discusses both
    // words at length, precisely because deciding not to use them is the interesting part of the
    // teardown, and a check that counted prose would force the reasoning to be deleted to stay
    // green.
    const executable = DOWN_SQL.split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
    expect(executable).not.toMatch(/DROP\s+OWNED\s+BY/i);
    expect(executable.match(/CASCADE/gi) ?? []).toEqual([]);
    // The prose really is where they live, so the strip above removed something rather than
    // silently matching nothing.
    expect(DOWN_SQL.match(/CASCADE/gi)?.length ?? 0).toBeGreaterThan(0);

    // Positive controls: the file really does contain the teardown being graded.
    expect(DOWN_SQL).toContain(`DROP ROLE ${WORKER}`);
    expect(DOWN_SQL).toContain('pg_shdepend');
    expect(DOWN_SQL).toMatch(/RETAINED/);

    // AND IT NEVER DROPS THE DELIVERY WORKER. 0035 did not create that role, so removing it here
    // would be a teardown reaching outside its own migration — the exact failure the N6 revert was
    // fixed for, in the other direction.
    expect(executable).not.toMatch(/DROP\s+ROLE\s+freightos_delivery_worker/i);
  });
});
