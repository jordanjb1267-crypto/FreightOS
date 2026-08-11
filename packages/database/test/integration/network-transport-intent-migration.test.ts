import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadMigrations, migrateDown, migrateUp } from '../../src/migrator.ts';
import { acceptNetworkEvent } from '../../src/network-events.ts';
import { MIGRATIONS_DIR } from '../../src/paths.ts';
import { acquireClusterRoleLock, releaseClusterRoleLock } from './harness.ts';

/**
 * N4 MIGRATION ROUND TRIP — N3 tip → up → down → up — ON A PRIVATE CLUSTER.
 *
 * THE OBLIGATION N4 ADDS THAT N3 DID NOT HAVE: activation must be prospective. A migration that
 * installs transport intent must not, by installing, create publication debt for every event
 * already in the journal. That cannot be tested on a database already at the tip, because the
 * question is precisely what happens to rows written BEFORE the migration ran — so this file drives
 * the sequence itself, writes real events at N3, and then applies N4 over them.
 *
 * WHY A PRIVATE CLUSTER even though N4 creates no role. Two reasons, one of them the point of the
 * file. First, the parity comparison includes the role and membership dimensions, and on the shared
 * cluster those carry whatever sibling files have minted; the N4 claim is that both are EMPTY of
 * change, and an assertion of emptiness graded against shared state proves nothing. Second, the
 * fresh-install proof needs a cluster that has never seen a FreightOS role.
 *
 * The comparison is by SET DIFFERENCE, printed both ways, because "N4 down left something behind"
 * and "N4 down took something with it" are different defects and a length check distinguishes
 * neither.
 */
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const PG_OWNER = process.env['FREIGHTOS_PGOWNER'] ?? 'postgres';
const DB_NAME = 'freightos_transport_parity';

function serverBinDir(): string {
  const candidates = [
    process.env['PGBIN'],
    ...['16', '17', '15'].map((v) => `/usr/lib/postgresql/${v}/bin`),
    '/usr/pgsql-16/bin',
    '/usr/local/pgsql/bin',
  ].filter((x): x is string => typeof x === 'string');
  for (const dir of candidates) {
    if (existsSync(join(dir, 'initdb')) && existsSync(join(dir, 'pg_ctl'))) return dir;
  }
  throw new Error(
    `PostgreSQL server binaries (initdb, pg_ctl) not found in: ${candidates.join(', ')}. ` +
      'The N4 activation proof needs its own cluster; set PGBIN.',
  );
}

interface Cluster {
  root: string;
  dataDir: string;
  sockDir: string;
  port: number;
}

let bin = '';
let cluster: Cluster;

function pg(exe: string, args: string[]): string {
  const command = [join(bin, exe), ...args.map((a) => `'${a.replace(/'/g, `'\\''`)}'`)].join(' ');
  if (process.getuid?.() === 0) {
    return execFileSync('su', [PG_OWNER, '-s', '/bin/bash', '-c', command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  return execFileSync(join(bin, exe), args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function startCluster(port: number): Cluster {
  const root = mkdtempSync(join(tmpdir(), 'freightos-transport-parity-'));
  const c: Cluster = { root, dataDir: join(root, 'data'), sockDir: join(root, 'sock'), port };
  execFileSync('mkdir', ['-p', c.sockDir]);
  if (process.getuid?.() === 0) {
    execFileSync('chown', ['-R', PG_OWNER, root]);
    execFileSync('chmod', ['700', root]);
  }
  pg('initdb', ['-D', c.dataDir, '-U', 'postgres', '--auth=trust', '--encoding=UTF8']);
  pg('pg_ctl', [
    '-D',
    c.dataDir,
    '-o',
    `-p ${port} -k ${c.sockDir} -c listen_addresses=`,
    '-l',
    join(root, 'server.log'),
    '-w',
    'start',
  ]);
  return c;
}

function psql(args: string[], database = 'postgres'): string {
  return execFileSync(
    join(bin, 'psql'),
    [
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      cluster.sockDir,
      '-p',
      String(cluster.port),
      '-U',
      'postgres',
      '-d',
      database,
      ...args,
    ],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

function connect(database: string, user = 'postgres'): Client {
  return new Client({ host: cluster.sockDir, port: cluster.port, user, database });
}

beforeAll(async () => {
  await acquireClusterRoleLock();
  bin = serverBinDir();
  cluster = startCluster(56_100 + (process.pid % 90));
  const su = connect('postgres');
  await su.connect();
  try {
    await su.query(`CREATE DATABASE ${DB_NAME}`);
  } finally {
    await su.end();
  }
  psql(['-v', `db_name=${DB_NAME}`, '-f', 'scripts/bootstrap-migration-authority.sql']);
}, 600_000);

afterAll(async () => {
  await releaseClusterRoleLock();
  if (cluster) {
    try {
      pg('pg_ctl', ['-D', cluster.dataDir, '-m', 'immediate', '-w', 'stop']);
    } catch {
      // Already down; removing the directory is what matters.
    }
    rmSync(cluster.root, { recursive: true, force: true });
  }
});

const migrations = loadMigrations(MIGRATIONS_DIR);
/** The version this migration introduces transport intent at. */
const N4 = 30;
const N3 = N4 - 1;

const ACL = (column: string) =>
  `coalesce((SELECT '{' || string_agg(a::text, ',' ORDER BY a::text) || '}'
               FROM unnest(${column}) AS a), '-')`;

const DIMENSIONS: Readonly<Record<string, string>> = {
  relations: `SELECT format('%s.%s kind=%s owner=%s rls=%s force=%s acl=%s',
                     n.nspname, c.relname, c.relkind, pg_get_userbyid(c.relowner),
                     c.relrowsecurity, c.relforcerowsecurity, ${ACL('c.relacl')}) AS line
                FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relkind IN ('r', 'v', 'm', 'S', 'p')
                 AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                 AND n.nspname NOT LIKE 'pg_toast%' ORDER BY 1`,

  columnAcls: `SELECT format('%s.%s.%s %s', n.nspname, c.relname, a.attname, ${ACL('a.attacl')})
                      AS line
                 FROM pg_attribute a
                 JOIN pg_class c ON c.oid = a.attrelid
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
                  AND n.nspname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1`,

  types: `SELECT format('%s.%s [%s]', n.nspname, t.typname,
                  coalesce((SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
                              FROM pg_enum e WHERE e.enumtypid = t.oid), '-')) AS line
            FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE t.typtype = 'e'
             AND n.nspname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1`,

  functions: `SELECT format('%s.%s(%s) owner=%s secdef=%s vol=%s cfg=%s acl=%s body=%s',
                      n.nspname, p.proname, oidvectortypes(p.proargtypes),
                      pg_get_userbyid(p.proowner), p.prosecdef, p.provolatile,
                      coalesce(p.proconfig::text, '-'), ${ACL('p.proacl')},
                      md5(p.prosrc)) AS line
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1`,

  policies: `SELECT format('%s.%s %s cmd=%s roles=%s using=%s check=%s',
                     schemaname, tablename, policyname, cmd, roles::text,
                     coalesce(qual, '-'), coalesce(with_check, '-')) AS line
               FROM pg_policies ORDER BY 1`,

  triggers: `SELECT format('%s.%s %s -> %s.%s enabled=%s', n.nspname, c.relname, t.tgname,
                     fn.nspname, f.proname, t.tgenabled) AS line
               FROM pg_trigger t
               JOIN pg_class c ON c.oid = t.tgrelid
               JOIN pg_namespace n ON n.oid = c.relnamespace
               JOIN pg_proc f ON f.oid = t.tgfoid
               JOIN pg_namespace fn ON fn.oid = f.pronamespace
              WHERE NOT t.tgisinternal ORDER BY 1`,

  indexes: `SELECT format('%s.%s %s', schemaname, tablename, indexdef) AS line
              FROM pg_indexes
             WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1`,

  constraints: `SELECT format('%s.%s %s %s', n.nspname, c.relname, con.conname,
                        pg_get_constraintdef(con.oid)) AS line
                  FROM pg_constraint con
                  JOIN pg_class c ON c.oid = con.conrelid
                  JOIN pg_namespace n ON n.oid = con.connamespace
                 WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1`,

  columns: `SELECT format('%s.%s.%s %s notnull=%s default=%s', n.nspname, c.relname, a.attname,
                    format_type(a.atttypid, a.atttypmod), a.attnotnull,
                    coalesce(pg_get_expr(d.adbin, d.adrelid), '-')) AS line
              FROM pg_attribute a
              JOIN pg_class c ON c.oid = a.attrelid
              JOIN pg_namespace n ON n.oid = c.relnamespace
              LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
             WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relkind = 'r'
               AND n.nspname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1`,

  schemas: `SELECT format('%s owner=%s acl=%s', nspname, pg_get_userbyid(nspowner),
                    ${ACL('nspacl')}) AS line
              FROM pg_namespace
             WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema' ORDER BY 1`,

  databaseAcls: `SELECT format('%s %s', datname, ${ACL('datacl')}) AS line
                   FROM pg_database WHERE datname = current_database()`,

  defaultAcls: `SELECT format('%s %s %s %s', pg_get_userbyid(d.defaclrole),
                        coalesce(n.nspname, '-'), d.defaclobjtype, d.defaclacl::text) AS line
                  FROM pg_default_acl d
                  LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace ORDER BY 1`,

  // THE TWO DIMENSIONS N4 CLAIMS ARE UNCHANGED. `::text` on every flag — `format('%s', boolean)`
  // renders `t`/`f`, which reads as a typo next to a spelled-out expectation.
  roles: `SELECT format('%s login=%s super=%s bypassrls=%s createrole=%s createdb=%s inherit=%s',
                  rolname, rolcanlogin::text, rolsuper::text, rolbypassrls::text,
                  rolcreaterole::text, rolcreatedb::text, rolinherit::text) AS line
            FROM pg_roles WHERE rolname LIKE 'freightos%' ORDER BY 1`,

  memberships: `SELECT format('%s in %s admin=%s inherit=%s set=%s', m.rolname, r.rolname,
                        am.admin_option::text, am.inherit_option::text, am.set_option::text) AS line
                  FROM pg_auth_members am
                  JOIN pg_roles m ON m.oid = am.member
                  JOIN pg_roles r ON r.oid = am.roleid
                 WHERE m.rolname LIKE 'freightos%' OR r.rolname LIKE 'freightos%' ORDER BY 1`,
};

type Snapshot = Record<string, string[]>;

async function snapshot(client: Client): Promise<Snapshot> {
  const out: Snapshot = {};
  for (const [name, sql] of Object.entries(DIMENSIONS)) {
    out[name] = (await client.query<{ line: string }>(sql)).rows.map((r) => r.line);
  }
  return out;
}

function differences(a: Snapshot, b: Snapshot): string[] {
  const problems: string[] = [];
  for (const key of Object.keys(a)) {
    const inA = new Set(a[key]!);
    const inB = new Set(b[key]!);
    for (const line of a[key]!.filter((x) => !inB.has(x))) problems.push(`${key} -${line}`);
    for (const line of b[key]!.filter((x) => !inA.has(x))) problems.push(`${key} +${line}`);
  }
  return problems;
}

/**
 * Only what `a` had and `b` does not — the "N4 took something away" half.
 *
 * Computed directly rather than by filtering `differences`, because a rendered line may itself
 * contain the marker the filter would look for, and a subset check that silently matches the wrong
 * half is worse than no subset check.
 */
function removals(a: Snapshot, b: Snapshot): string[] {
  const gone: string[] = [];
  for (const key of Object.keys(a)) {
    const inB = new Set(b[key]!);
    for (const line of a[key]!.filter((x) => !inB.has(x))) gone.push(`${key} -${line}`);
  }
  return gone;
}

async function driveTo(version: number): Promise<void> {
  const client = connect(DB_NAME, 'freightos_migrator');
  await client.connect();
  try {
    const applied = (
      await client.query<{ n: string }>(
        `SELECT coalesce(max(version), 0)::text AS n FROM schema_migrations`,
      )
    ).rows[0]!.n;
    if (Number(applied) > version) await migrateDown(client, migrations, version);
    else
      await migrateUp(
        client,
        migrations.filter((m) => m.version <= version),
      );
  } catch (error) {
    if (!/schema_migrations/.test(String(error))) throw error;
    await migrateUp(
      client,
      migrations.filter((m) => m.version <= version),
    );
  } finally {
    await client.end();
  }
}

async function withAdmin<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = connect(DB_NAME);
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** Register an external organization — NULL tenant, so no `tenants` row is needed. */
async function registerOrganization(label: string): Promise<string> {
  return withAdmin(async (admin) => {
    const r = await admin.query<{ id: string }>(
      `INSERT INTO network_participants
         (participant_type, display_name, tenant_id, status, source_system, created_by, updated_by)
       VALUES ('organization', $1, NULL, 'active', 'test:n4-parity', 'x', 'x') RETURNING id`,
      [label],
    );
    return r.rows[0]!.id;
  });
}

/** Accept one event through the REAL trusted path, as the writer. */
async function acceptOneEvent(organizationId: string): Promise<string> {
  const writer = connect(DB_NAME, 'freightos_event_writer');
  await writer.connect();
  try {
    await writer.query('BEGIN');
    const accepted = await acceptNetworkEvent(writer, {
      type: 'com.rigreceipts.network.example.recorded.v1',
      source: 'urn:freightos:test:n4-parity',
      subject: [{ network_id: 'obj-00000001', object_type: 'example-only' }],
      time: new Date().toISOString(),
      organization_id: organizationId,
      classification: 'internal',
      schema_ref: 'https://schemas.rigreceipts.com/network/logistics-object-reference.v1.json',
      data: { network_id: 'obj-00000001', object_type: 'example-only' },
    });
    await writer.query('COMMIT');
    expect(accepted.inserted).toBe(true);
    return accepted.event_id;
  } finally {
    await writer.end();
  }
}

const intentsFor = (eventIds: readonly string[]): Promise<number> =>
  withAdmin(async (admin) => {
    const r = await admin.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM network_transport_intents WHERE network_event_id = ANY($1)',
      [[...eventIds]],
    );
    return Number(r.rows[0]!.n);
  });

describe('activation is prospective — no historical backfill', () => {
  it('gives pre-existing events no transport intent, and the next event exactly one', async () => {
    // ── At N3, with no transport layer installed at all.
    await driveTo(N3);
    const org = await registerOrganization('backfill-probe');
    const historical = [
      await acceptOneEvent(org),
      await acceptOneEvent(org),
      await acceptOneEvent(org),
    ];

    await withAdmin(async (admin) => {
      const present = await admin.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'network_transport_intents'`,
      );
      expect(present.rows[0]!.n, 'the intent table must not exist at N3').toBe('0');
    });

    // ── Install N4 over a journal that already holds facts.
    await driveTo(N4);

    // THE ACTIVATION RULING. Installing the transport layer must not manufacture publication debt
    // for events accepted before it existed — that would be a migration deciding, on its own
    // authority, that three historical facts are owed to the network.
    expect(await intentsFor(historical), 'historical events were backfilled').toBe(0);
    await withAdmin(async (admin) => {
      const total = await admin.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM network_transport_intents',
      );
      expect(total.rows[0]!.n, 'the intent table must be empty right after installation').toBe('0');
    });

    // ── And the very next event does create one, so "no backfill" is not "nothing works".
    const fresh = await acceptOneEvent(org);
    expect(await intentsFor([fresh])).toBe(1);
    expect(await intentsFor(historical)).toBe(0);
  }, 300_000);
});

describe('the round trip', () => {
  it('reverts to N3 exactly and re-applies to the same N4', async () => {
    await driveTo(N3);
    const atN3 = await withAdmin(snapshot);

    await driveTo(N4);
    const firstUp = await withAdmin(snapshot);

    // N4 is additive: everything present at N3 must still be present at N4.
    expect(removals(atN3, firstUp), 'applying N4 removed something that existed at N3').toEqual([]);

    await driveTo(N3);
    const afterDown = await withAdmin(snapshot);

    // THE PARITY GATE. Set difference in both directions: "left something behind" and "took
    // something with it" are different defects.
    expect(differences(atN3, afterDown)).toEqual([]);

    await driveTo(N4);
    const secondUp = await withAdmin(snapshot);
    expect(differences(firstUp, secondUp)).toEqual([]);
  }, 300_000);

  it('adds nothing cluster-global — no role, no membership', async () => {
    // The N3 revert had to reason about a cluster-wide role. N4 deliberately has nothing of the
    // kind, and that is asserted against a real before/after rather than claimed in prose.
    await driveTo(N3);
    const before = await withAdmin(snapshot);
    await driveTo(N4);
    const after = await withAdmin(snapshot);

    expect(after['roles']).toEqual(before['roles']);
    expect(after['memberships']).toEqual(before['memberships']);

    // And the roster is the N3 one, unchanged — no publisher role appeared under any name.
    const roleNames = await withAdmin(async (admin) => {
      const r = await admin.query<{ rolname: string }>(
        `SELECT rolname FROM pg_roles WHERE rolname LIKE 'freightos%' ORDER BY 1`,
      );
      return r.rows.map((x) => x.rolname);
    });
    for (const suspicious of ['publisher', 'transport', 'worker', 'delivery', 'broker']) {
      expect(roleNames.filter((n) => n.includes(suspicious))).toEqual([]);
    }
  }, 300_000);
});

describe('one step down', () => {
  it('leaves N3 fully functional, creating no intent, then restores N4 exactly', async () => {
    await driveTo(N4);
    const atN4 = await withAdmin(snapshot);
    const org = await registerOrganization('one-step-down');

    // ── Revert only 0030.
    await driveTo(N3);

    await withAdmin(async (admin) => {
      const gone = await admin.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'network_transport_intents'`,
      );
      expect(gone.rows[0]!.n).toBe('0');
      const trigger = await admin.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
          WHERE c.relname = 'network_events' AND t.tgname = 'network_events_transport_intent'`,
      );
      expect(trigger.rows[0]!.n, 'the coupling trigger survived the revert').toBe('0');
    });

    // N3 STILL WORKS. "The objects are gone" is not the same claim as "acceptance still works",
    // and after a revert it is the second one that matters — the coupling trigger was attached to
    // a table N4 does not own, so removing it badly would break the journal itself.
    const duringN3 = await acceptOneEvent(org);
    expect(duringN3).toBeTruthy();

    // ── Back up.
    await driveTo(N4);
    expect(differences(atN4, await withAdmin(snapshot))).toEqual([]);

    // The event accepted while N4 was absent stays absent from the debt ledger — re-applying the
    // migration is not a backfill either.
    expect(await intentsFor([duringN3])).toBe(0);

    // And acceptance resumes creating debt immediately.
    const afterReapply = await acceptOneEvent(org);
    expect(await intentsFor([afterReapply])).toBe(1);
  }, 300_000);
});

describe('fresh install', () => {
  it('reaches N4 from an empty cluster with the intent surface created exactly once', async () => {
    await driveTo(N4);

    const counts = await withAdmin(async (admin) => {
      const r = await admin.query<{
        tables: string;
        functions: string;
        triggers: string;
        policies: string;
        indexes: string;
        secdef: string;
      }>(
        `SELECT
           (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'network_transport_intents') AS tables,
           (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'app' AND p.proname = 'network_event_transport_intent') AS functions,
           (SELECT count(*)::text FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
             WHERE c.relname = 'network_events'
               AND t.tgname = 'network_events_transport_intent') AS triggers,
           (SELECT count(*)::text FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
             WHERE c.relname = 'network_transport_intents') AS policies,
           (SELECT count(*)::text FROM pg_indexes
             WHERE tablename = 'network_transport_intents') AS indexes,
           (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'app' AND p.proname = 'network_event_transport_intent'
               AND p.prosecdef) AS secdef`,
      );
      return r.rows[0]!;
    });

    expect(counts.tables).toBe('1');
    expect(counts.functions).toBe('1');
    expect(counts.triggers).toBe('1');
    expect(counts.policies).toBe('1');
    expect(counts.indexes).toBe('1');
    expect(counts.secdef).toBe('0');

    // The writer's additive grant, and nothing more.
    const privs = await withAdmin(async (admin) => {
      const r = await admin.query<{ line: string }>(
        `SELECT format('%s=%s', grantee, privilege_type) AS line
           FROM information_schema.table_privileges
          WHERE table_name = 'network_transport_intents' AND grantee <> 'freightos_migrator'
          ORDER BY 1`,
      );
      return r.rows.map((x) => x.line);
    });
    expect(privs).toEqual(['freightos_event_writer=INSERT']);

    // End to end on a cluster that has never held any other state.
    const org = await registerOrganization('fresh-install');
    const eventId = await acceptOneEvent(org);
    expect(await intentsFor([eventId])).toBe(1);
  }, 300_000);
});
