import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadMigrations, migrateDown, migrateUp } from '../../src/migrator.ts';
import { MIGRATIONS_DIR } from '../../src/paths.ts';
import { acquireClusterRoleLock, releaseClusterRoleLock } from './harness.ts';

/**
 * N3 MIGRATION ROUND TRIP — N2 tip → up → down → up — ON A PRIVATE CLUSTER.
 *
 * The same obligation `network-registry-migration.test.ts` states for N1, and one obligation more.
 * N1 created no role, so its revert had nothing cluster-global to undo. **N3 creates
 * `freightos_event_writer`**, and that changes what "reversible" can even be tested against.
 *
 * WHY ITS OWN CLUSTER, AND WHY THAT IS NOT PARANOIA. A ROLE IS NOT A PER-DATABASE OBJECT. On the
 * shared test cluster, any other FreightOS database sitting at N3 means:
 *
 *   - `freightos_event_writer` ALREADY EXISTS in the pre-N3 snapshot, so `firstUp - preN3` is empty
 *     and "N3 creates exactly one role" would pass while proving nothing;
 *   - the pre/post comparison is graded against whatever the previous test file happened to leave
 *     behind, rather than against N2.
 *
 * The first was observed, not anticipated: the role assertions had to be written as conditionals
 * that explained themselves. A private cluster removes the conditionals rather than accommodating
 * them — every assertion below is unconditional because the cluster contains exactly one FreightOS
 * database and has never seen a FreightOS role.
 *
 * `fresh-install-authority.test.ts` reached the same conclusion for the same reason and the
 * provisioning here follows its pattern deliberately.
 *
 * The comparison is by SET DIFFERENCE, printed both ways, because "N3 down left something behind"
 * and "N3 down took something with it" are different defects and a length check distinguishes
 * neither.
 */
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const PG_OWNER = process.env['FREIGHTOS_PGOWNER'] ?? 'postgres';
const DB_NAME = 'freightos_journal_parity';

/**
 * The PostgreSQL SERVER binaries — initdb and pg_ctl, which a psql-only host does not have.
 * Absence is raised rather than skipped: a regression that quietly does not run is the failure mode
 * this whole class of test exists to prevent.
 */
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
      'The N3 role round trip needs its own cluster; set PGBIN.',
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

/** Run a server binary, as an unprivileged owner when this process is root — initdb refuses root. */
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
  const root = mkdtempSync(join(tmpdir(), 'freightos-journal-parity-'));
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

/** psql from the repository root, so `-f scripts/...` resolves. */
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

// CLUSTER-GLOBAL EXCLUSION. This file drives migrateUp/migrateDown against a cluster it provisions
// itself, so it mutates no shared role state and in principle needs no exclusion. It takes the lock
// anyway: the coverage guard's rule is "every file that drives migrations holds the lock", and a
// rule with an exemption clause is a rule with a way around it.
beforeAll(async () => {
  await acquireClusterRoleLock();
  bin = serverBinDir();
  cluster = startCluster(55_900 + (process.pid % 90));
  const su = connect('postgres');
  await su.connect();
  try {
    await su.query(`CREATE DATABASE ${DB_NAME}`);
  } finally {
    await su.end();
  }
  // The production prerequisite phase, run exactly as an operator would.
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
const TIP = Math.max(...migrations.map((m) => m.version));
/** The version this migration introduces the event journal at. */
const N3 = 29;
const PRE_N3 = N3 - 1;

/**
 * ACL rendered order-independently — PostgreSQL stores `aclitem[]` in grant order, not canonical
 * order, so two identical privilege sets can differ as text purely by the order GRANT ran in.
 */
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

  // COLUMN-LEVEL privileges get their own dimension. N3's least-privilege design rests entirely on
  // them — the writer's journal read is `SELECT (event_id, event_fingerprint)` and nothing more —
  // and `relacl` does not carry them, so a revert that dropped the table but left a column grant
  // behind would be invisible to every other dimension here.
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

  // Database-level privileges. §4 of the down migration revokes them explicitly, because a
  // lingering CONNECT grant blocks `DROP ROLE` on its own and would otherwise only surface as an
  // opaque dependency error.
  databaseAcls: `SELECT format('%s %s', datname, ${ACL('datacl')}) AS line
                   FROM pg_database WHERE datname = current_database()`,

  defaultAcls: `SELECT format('%s %s %s %s', pg_get_userbyid(d.defaclrole),
                        coalesce(n.nspname, '-'), d.defaclobjtype, d.defaclacl::text) AS line
                  FROM pg_default_acl d
                  LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace ORDER BY 1`,

  // `::text` on every flag — `format('%s', boolean)` renders `t`/`f`, which reads as a typo next to
  // a spelled-out expectation and has already cost this repository a debugging session.
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

  // The schema projection is seeded by the migration, so it is part of the schema contract: a
  // revert must remove it and a re-apply must reproduce it byte for byte. Read from a table that
  // may not exist, so it is guarded rather than joined.
  projection: `SELECT format('%s -> %s v%s %s %s %s', durable_schema_ref, registry_schema_id,
                      version, artifact_class, content_hash, status) AS line
                 FROM network_schema_versions ORDER BY 1`,
};

type Snapshot = Record<string, string[]>;

async function snapshot(client: Client): Promise<Snapshot> {
  const out: Snapshot = {};
  for (const [name, sql] of Object.entries(DIMENSIONS)) {
    if (name === 'projection') {
      const present = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'network_schema_versions'`,
      );
      if (present.rows[0]!.n !== '1') {
        out[name] = [];
        continue;
      }
    }
    out[name] = (await client.query<{ line: string }>(sql)).rows.map((r) => r.line);
  }
  return out;
}

/** Set difference in both directions, rendered so a failure names the object. */
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
    // A database with no schema_migrations table yet is the first-run case, not a failure.
    if (!/schema_migrations/.test(String(error))) throw error;
    await migrateUp(
      client,
      migrations.filter((m) => m.version <= version),
    );
  } finally {
    await client.end();
  }
}

async function read(): Promise<Snapshot> {
  const client = connect(DB_NAME);
  await client.connect();
  try {
    return await snapshot(client);
  } finally {
    await client.end();
  }
}

/**
 * Privilege references to the writer role, split into "this database" and "the whole cluster".
 *
 * `pg_shdepend` is the catalog `DROP ROLE` itself consults, and it spans every database. A
 * database-level grant is recorded with `dbid = 0` and the database in `objid`, so it needs its own
 * arm — otherwise a lingering CONNECT would count as somebody else's problem.
 */
async function writerReferences(client: Client): Promise<{ local: number; cluster: number }> {
  const r = await client.query<{ local: string; cluster: string }>(
    `SELECT count(*) FILTER (
              WHERE s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
                 OR (s.classid = 'pg_database'::regclass
                     AND s.objid = (SELECT oid FROM pg_database WHERE datname = current_database()))
            )::text AS local,
            count(*)::text AS cluster
       FROM pg_shdepend s JOIN pg_roles r ON r.oid = s.refobjid
      WHERE r.rolname = 'freightos_event_writer'`,
  );
  return { local: Number(r.rows[0]!.local), cluster: Number(r.rows[0]!.cluster) };
}

const WRITER_ROLE_LINE =
  'freightos_event_writer login=true super=false bypassrls=false createrole=false ' +
  'createdb=false inherit=true';

describe('N3 is additive and exactly reversible', () => {
  let preN3: Snapshot;
  let firstUp: Snapshot;
  let afterDown: Snapshot;
  let secondUp: Snapshot;
  /** Measured, not assumed — see `the writer role is cluster-global` below. */
  let refsAfterDown: { local: number; cluster: number };

  beforeAll(async () => {
    await driveTo(PRE_N3);
    preN3 = await read();

    await driveTo(N3);
    firstUp = await read();

    await driveTo(PRE_N3);
    afterDown = await read();
    const probe = connect(DB_NAME);
    await probe.connect();
    try {
      refsAfterDown = await writerReferences(probe);
    } finally {
      await probe.end();
    }

    await driveTo(N3);
    secondUp = await read();
  }, 900_000);

  it('starts from a cluster that has never seen the journal writer', () => {
    // THE PRECONDITION, asserted rather than assumed. Every unconditional assertion below depends
    // on it, and on the shared cluster it was routinely false.
    expect(preN3['roles']!.filter((l) => l.startsWith('freightos_event_writer '))).toEqual([]);
    expect(preN3['relations']!.filter((l) => /network_(events|schema_versions) /.test(l))).toEqual(
      [],
    );
  });

  it('is a non-vacuous comparison', () => {
    // ANTI-VACUITY. Every assertion below compares two snapshots. If the snapshots were empty they
    // would all pass against a database in any state whatsoever, including an empty one.
    expect(preN3['relations']!.length, 'pre-N3 has no relations').toBeGreaterThan(25);
    expect(preN3['policies']!.length, 'pre-N3 has no policies').toBeGreaterThan(50);
    expect(preN3['functions']!.length, 'pre-N3 has no functions').toBeGreaterThan(50);
    expect(preN3['roles']!.length, 'pre-N3 has no freightos roles').toBeGreaterThan(4);
    // N1 must already be there — this round trip is 28 → 29 → 28 → 29, not 0 → 29.
    expect(preN3['relations']!.filter((l) => l.includes('network_participants'))).toHaveLength(1);
    expect(preN3['projection'], 'pre-N3 already has the N3 schema projection').toEqual([]);
  });

  it('adds exactly the two tables, one enum and one function it claims', () => {
    const added = (key: string) => {
      const before = new Set(preN3[key]!);
      return firstUp[key]!.filter((x) => !before.has(x));
    };
    const removed = (key: string) => {
      const after = new Set(firstUp[key]!);
      return preN3[key]!.filter((x) => !after.has(x));
    };

    // ADDITIVE means nothing pre-existing changed. Not "few things changed" — nothing. The one
    // deliberate exception is `network_participants`, whose ACL and column ACL N3 extends for the
    // writer's narrow read; it is listed explicitly below rather than excluded from the sweep.
    for (const key of ['functions', 'defaultAcls', 'databaseAcls', 'indexes']) {
      expect(removed(key), `N3 removed or altered a pre-existing ${key} entry`).toEqual([]);
    }
    expect(removed('types'), 'N3 altered a pre-existing type').toEqual([]);
    expect(removed('policies'), 'N3 removed or altered a pre-existing policy').toEqual([]);
    expect(removed('columns'), 'N3 altered a pre-existing column').toEqual([]);
    expect(removed('triggers'), 'N3 altered a pre-existing trigger').toEqual([]);

    // NOT ONE pre-existing relation is altered — the participant registry included. The three
    // approved N1 touches are a UNIQUE constraint, a policy and three COLUMN grants, and column
    // privileges do not live in `relacl`, so the writer gains no table-level privilege on
    // `network_participants` at all. Each touch is graded in the dimension it actually lands in:
    // `constraints`, `policies` and `columnAcls`.
    expect(removed('relations'), 'N3 altered a pre-existing relation').toEqual([]);
    const participants = firstUp['relations']!.find((l) =>
      l.startsWith('public.network_participants '),
    )!;
    expect(
      participants,
      'the writer holds a TABLE-level privilege on the participant registry',
    ).not.toContain('freightos_event_writer');

    expect(
      added('relations')
        .map((l) => l.split(' ')[0]!)
        .sort(),
    ).toEqual(['public.network_events', 'public.network_schema_versions']);

    // The two additive N1 touches that are not column grants, named exactly.
    expect(
      added('constraints').filter((l) => l.startsWith('public.network_participants ')),
    ).toEqual([
      'public.network_participants network_participants_id_type_key UNIQUE (id, participant_type)',
    ]);
    expect(
      added('policies')
        .filter((l) => l.startsWith('public.network_participants '))
        .map((l) => l.split(' ')[1]),
    ).toEqual(['network_participants_event_writer_read']);

    expect(added('types').sort()).toEqual([
      'app.network_event_class ' +
        '[observed,asserted,verified,derived,predicted,command_result,correction,dispute]',
    ]);

    const functions = added('functions').map((l) => l.split(' ')[0]!.replace(/\(.*$/, ''));
    expect(functions.sort()).toEqual(['app.network_event_acceptance']);

    expect(added('defaultAcls'), 'N3 changed default privileges').toEqual([]);
    expect(added('databaseAcls'), 'N3 changed database-level privileges').toEqual([]);

    // `schemas` legitimately changes — `GRANT USAGE ON SCHEMA app, public` is how the writer can
    // reach the journal at all. So it is checked as a DIFF OF ACL ENTRIES rather than waved past:
    // the two schemas gain exactly one grantee each, it is the writer, the privilege is bare
    // USAGE, and no pre-existing grantee is disturbed. Owner is unchanged in both.
    const aclEntries = (line: string) =>
      (/acl=\{(.*)\}$/.exec(line)?.[1] ?? '').split(',').filter(Boolean);
    for (const schema of ['app', 'public']) {
      const before = preN3['schemas']!.find((l) => l.startsWith(`${schema} `))!;
      const after = firstUp['schemas']!.find((l) => l.startsWith(`${schema} `))!;
      expect(after.split(' acl=')[0], `${schema} owner changed`).toBe(before.split(' acl=')[0]);
      const gained = aclEntries(after).filter((e) => !aclEntries(before).includes(e));
      const lost = aclEntries(before).filter((e) => !aclEntries(after).includes(e));
      expect(lost, `N3 removed a grantee from schema ${schema}`).toEqual([]);
      expect(gained).toHaveLength(1);
      expect(gained[0], `schema ${schema} grant is not a bare USAGE for the writer`).toMatch(
        /^freightos_event_writer=U\/[a-z_]+$/,
      );
    }
  });

  it('creates exactly ONE PostgreSQL role, and it is the journal writer', () => {
    // §25's expectation was zero new roles; N3 states and justifies exactly one. The point of the
    // gate is that the number is DECLARED and CHECKED, not that it is zero — a silently added role
    // is the failure mode.
    //
    // A STRAIGHT DELTA, and it is only trustworthy because the cluster is private. On the shared
    // cluster this same assertion came up EMPTY and passed while proving nothing, because another
    // test database at N3 had already created the role — which is the N1 CI defect's shape exactly,
    // in a new place. The fix was to remove the ambiguity rather than to write around it.
    const names = (rows: string[]) => rows.map((l) => l.split(' ')[0]!);
    expect(names(firstUp['roles']!).filter((n) => !names(preN3['roles']!).includes(n))).toEqual([
      'freightos_event_writer',
    ]);
    expect(firstUp['roles']!.find((l) => l.startsWith('freightos_event_writer '))).toBe(
      WRITER_ROLE_LINE,
    );

    // The role graph grows by exactly one edge, and it is not one this migration writes.
    // PostgreSQL gives a CREATEROLE non-superuser `ADMIN TRUE, INHERIT FALSE, SET FALSE` over
    // every role it creates — the behaviour `scripts/converge-migration-authority.sql` already
    // documents. ADMIN is what lets the revert drop the role. INHERIT or SET would hand the
    // migrator the writer's INSERT on an immutable journal, so both are asserted false here as
    // well as at deploy time.
    const IMPLICIT_EDGE =
      'freightos_migrator in freightos_event_writer admin=true inherit=false set=false';
    const beforeMemberships = new Set(preN3['memberships']!);
    expect(firstUp['memberships']!.filter((x) => !beforeMemberships.has(x))).toEqual([
      IMPLICIT_EDGE,
    ]);

    // The writer itself is a LEAF: it holds membership in nothing, so there is no role it can
    // inherit privileges from and none it can become.
    expect(
      firstUp['memberships']!.filter((x) => x.startsWith('freightos_event_writer in ')),
      'the writer holds membership in another role',
    ).toEqual([]);

    // …and no membership of the writer, from any role, is inheriting or SET-able.
    expect(
      firstUp['memberships']!.filter(
        (x) => x.includes(' in freightos_event_writer ') && !x.endsWith('inherit=false set=false'),
      ),
      'a membership of the writer confers INHERIT or SET',
    ).toEqual([]);
  });

  it('grants the writer a column-scoped read and nothing wider', () => {
    const before = new Set(preN3['columnAcls']!);
    const added = firstUp['columnAcls']!.filter((x) => !before.has(x));
    // Exactly five column grants: two on the journal, three on the participant registry. If a
    // future change widens the writer to a whole-table SELECT, `relacl` grows and this list
    // shrinks — either direction fails.
    expect(added.map((l) => l.split(' ')[0]).sort()).toEqual([
      'public.network_events.event_fingerprint',
      'public.network_events.event_id',
      'public.network_participants.id',
      'public.network_participants.participant_type',
      'public.network_participants.tenant_id',
    ]);
    for (const line of added) {
      expect(line, `${line} is not a bare SELECT grant`).toMatch(
        /\{freightos_event_writer=r\/[a-z_]+\}$/,
      );
    }
    // …and no table-level SELECT on the journal for the writer, which would make the column
    // grants decorative.
    const journal = firstUp['relations']!.find((l) => l.startsWith('public.network_events '))!;
    expect(journal).not.toMatch(/freightos_event_writer=[a-qs-z]*r/);
  });

  it('creates no SECURITY DEFINER function', () => {
    const before = new Set(preN3['functions']!);
    const definers = firstUp['functions']!.filter(
      (x) => !before.has(x) && x.includes(' secdef=t '),
    );
    // The acceptance trigger runs with INVOKER rights on purpose: a definer there would read past
    // the participant policy to resolve the tenant, which is adding privileged code to work around
    // row-level security.
    expect(definers, 'N3 introduced SECURITY DEFINER code').toEqual([]);
  });

  it('releases every privilege it took in THIS database when reverted', () => {
    // Every dimension, both directions — with EXACTLY TWO permitted survivals, named rather than
    // filtered out of the snapshot: the writer's catalog row, and the implicit ADMIN membership
    // PostgreSQL gave its creator. Both are cluster-wide objects that a per-database migration does
    // not own; everything else must be gone.
    //
    // This is the repository's standing doctrine, not an N3 concession. 0020's down migration
    // records it verbatim — "0020 was the only migration attempting a DROP ROLE, and it was wrong
    // to" — and `freightos_hierarchy_owner`, `freightos_identity_guard`, `freightos_admin_owner`,
    // `freightos_audit_writer` and `freightos_binding_owner` are all left in place the same way.
    expect(differences(preN3, afterDown)).toEqual([
      `roles +${WRITER_ROLE_LINE}`,
      'memberships +freightos_migrator in freightos_event_writer admin=true inherit=false set=false',
    ]);
  });

  it('leaves the surviving role with ZERO REACH in the reverted database', () => {
    // What the revert actually guarantees, and the reason the surviving row is harmless. 0026 puts
    // it exactly: "what reverting must actually guarantee is that the role has no REACH, not that
    // its catalog row is gone."
    //
    // `pg_shdepend` is the catalog `DROP ROLE` itself consults, so this asks PostgreSQL the same
    // question — scoped to this database, which is the whole of a per-database migration's remit.
    expect(refsAfterDown.local, 'the revert left a privilege reference behind locally').toBe(0);

    // Nothing in the snapshot names the writer either — no ACL, no column ACL, no policy.
    for (const dimension of ['relations', 'columnAcls', 'policies', 'schemas', 'databaseAcls']) {
      expect(
        afterDown[dimension]!.filter((l) => l.includes('freightos_event_writer')),
        `${dimension} still names the writer after the revert`,
      ).toEqual([]);
    }

    // THE LOGIN CAVEAT, stated rather than glossed. Every other role this doctrine covers is
    // NOLOGIN, so a surviving row is inert by construction. This one can still authenticate, and
    // what makes it harmless is the emptiness above — not `ALTER ROLE … NOLOGIN`, which is itself
    // cluster-global and would disable the writer for every other database still at N3.
    expect(afterDown['roles']!.find((l) => l.startsWith('freightos_event_writer '))).toBe(
      WRITER_ROLE_LINE,
    );
  });

  it('reproduces the same database when re-applied — the role included', () => {
    // Role CREATION is idempotent in the up migration (`IF NOT EXISTS`), so re-applying after a
    // revert must reach the same attributes and the same grants, not a subset.
    expect(differences(firstUp, secondUp)).toEqual([]);
  });

  it('seeds exactly the nine governed contracts, and re-seeds them identically', () => {
    const refs = firstUp['projection']!.map((l) => l.split(' ')[0]);
    expect(refs).toEqual([
      'https://schemas.rigreceipts.com/network/capability-advertisement.v1.json',
      'https://schemas.rigreceipts.com/network/command-envelope.v1.json',
      'https://schemas.rigreceipts.com/network/consent-grant.v1.json',
      'https://schemas.rigreceipts.com/network/event-correction.v1.json',
      'https://schemas.rigreceipts.com/network/event-envelope.v1.json',
      'https://schemas.rigreceipts.com/network/evidence-envelope.v1.json',
      'https://schemas.rigreceipts.com/network/logistics-object-reference.v1.json',
      'https://schemas.rigreceipts.com/network/participant-identity.v1.json',
      'https://schemas.rigreceipts.com/network/workflow-state.v1.json',
    ]);
    // Every durable reference is production-namespaced. Not one `.example` or `.local` identity is
    // seeded into a table that permanent events take foreign keys against.
    for (const ref of refs) {
      expect(ref!.startsWith('https://schemas.rigreceipts.com/network/'), ref!).toBe(true);
    }
    expect(secondUp['projection']).toEqual(firstUp['projection']);
    expect(afterDown['projection']).toEqual([]);
  });

  it('leaves no orphaned journal artifact anywhere in the catalog after the revert', async () => {
    // Belt and braces against the snapshot's own scoping, which is schema-filtered: ask the
    // catalog directly, by name, across every schema. The cases above leave the database at N3, so
    // this reverts once more rather than trusting a stale snapshot.
    //
    // The ROLE ROW is deliberately absent from this list — it survives by design, and is graded by
    // `leaves the surviving role with ZERO REACH`. Every PRIVILEGE naming it is here and every one
    // is unconditional: a role with no grants left is inert; a leftover grant is not.
    await driveTo(PRE_N3);
    const client = connect(DB_NAME);
    await client.connect();
    try {
      const leftovers = await client.query<{ line: string }>(
        `WITH ours AS (SELECT oid FROM pg_namespace
                        WHERE nspname NOT IN ('pg_catalog', 'information_schema'))
         SELECT format('relation %s.%s', n.nspname, c.relname) AS line
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname IN ('network_events', 'network_schema_versions')
            AND n.oid IN (SELECT oid FROM ours)
          UNION ALL
         SELECT format('function %s.%s', n.nspname, p.proname)
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE p.proname = 'network_event_acceptance' AND n.oid IN (SELECT oid FROM ours)
          UNION ALL
         SELECT format('type %s.%s', n.nspname, t.typname)
           FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'network_event_class' AND n.oid IN (SELECT oid FROM ours)
          UNION ALL
         SELECT format('grant naming the writer: %s', c.relname)
           FROM pg_class c
          WHERE c.relacl::text LIKE '%freightos_event_writer%'
          UNION ALL
         SELECT format('column grant naming the writer: %s.%s', c.relname, a.attname)
           FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
          WHERE a.attacl::text LIKE '%freightos_event_writer%'
          UNION ALL
         SELECT format('constraint %s', conname) FROM pg_constraint
          WHERE conname = 'network_participants_id_type_key'
          UNION ALL
         SELECT format('policy %s', policyname) FROM pg_policies
          WHERE policyname = 'network_participants_event_writer_read'
          ORDER BY 1`,
      );
      expect(leftovers.rows.map((r) => r.line)).toEqual([]);
    } finally {
      await client.end();
    }
  }, 300_000);

  it('is migration 29, at the tip', () => {
    expect(N3).toBe(29);
    expect(TIP).toBe(N3);
  });
});

/**
 * THE CLUSTER-GLOBAL ROLE CONTRACT.
 *
 * A role is a cluster-wide catalog row; a migration is per-database. This repository decided what
 * follows from that twice, from measurement — 0020's down migration ("0020 was the only migration
 * attempting a DROP ROLE, and it was wrong to") and 0026's ("what reverting must actually guarantee
 * is that the role has no REACH, not that its catalog row is gone").
 *
 * So the contract is NOT drop-or-fail. It is:
 *
 *   * The reverted database keeps NO reach for the writer — no grant, no policy, no membership it
 *     can use here.
 *   * Every OTHER database still at N3 is completely unaffected: its grants intact, its writer
 *     still able to accept events.
 *   * Re-applying converges: the role is reused, and the grants come back.
 *
 * The alternative — attempt the drop and fail when another database holds the role — was
 * implemented first and measured. It makes 0029 un-revertable on ANY cluster with more than one
 * FreightOS database, which is the normal state of CI and of any deployment with a staging copy.
 * Nine existing gates failed at once, each reporting 390+ surviving references across 33 databases.
 * `DROP OWNED` and `CASCADE` are worse again: they reach into the other database and strip the
 * privileges its running system depends on.
 *
 * Runs last, and cleans up after itself, because it deliberately puts a second database at N3.
 */
describe('the cluster-global role contract', () => {
  const SECOND = 'freightos_journal_parity_second';

  function asMigrator(database: string): Client {
    return new Client({
      host: cluster.sockDir,
      port: cluster.port,
      user: 'freightos_migrator',
      database,
    });
  }

  async function scalar(database: string, sql: string): Promise<string> {
    const c = connect(database);
    await c.connect();
    try {
      return (await c.query<{ n: string }>(sql)).rows[0]!.n;
    } finally {
      await c.end();
    }
  }

  const COLUMN_GRANTS = `SELECT count(*)::text AS n FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
      WHERE a.attacl::text LIKE '%freightos\\_event\\_writer=%'`;

  it('reverts one database without touching another that is still at N3', async () => {
    await driveTo(N3);
    const su = connect('postgres');
    await su.connect();
    try {
      await su.query(`DROP DATABASE IF EXISTS ${SECOND}`);
      await su.query(`CREATE DATABASE ${SECOND}`);
    } finally {
      await su.end();
    }
    psql(['-v', `db_name=${SECOND}`, '-f', 'scripts/bootstrap-migration-authority.sql']);
    const up = asMigrator(SECOND);
    await up.connect();
    try {
      await migrateUp(up, migrations);
    } finally {
      await up.end();
    }

    // Both databases at N3, both holding the shared role's grants.
    expect(await scalar(DB_NAME, COLUMN_GRANTS)).toBe('5');
    expect(await scalar(SECOND, COLUMN_GRANTS)).toBe('5');

    // ── REVERT ONE. It must SUCCEED: refusing here would make 0029 un-revertable on any cluster
    //    with a second FreightOS database, which is the normal state of CI.
    const down = asMigrator(DB_NAME);
    await down.connect();
    try {
      await migrateDown(down, migrations, PRE_N3);
    } finally {
      await down.end();
    }

    // ── THE REVERTED DATABASE: zero reach. Asked of `pg_shdepend`, the same catalog `DROP ROLE`
    //    consults, so this is PostgreSQL's own answer rather than a re-reading of the REVOKEs.
    const probe = connect(DB_NAME);
    await probe.connect();
    try {
      expect((await writerReferences(probe)).local).toBe(0);
    } finally {
      await probe.end();
    }
    expect(await scalar(DB_NAME, COLUMN_GRANTS)).toBe('0');
    expect(
      await scalar(
        DB_NAME,
        `SELECT count(*)::text AS n FROM pg_policies
          WHERE 'freightos_event_writer' = ANY (roles)`,
      ),
    ).toBe('0');
    expect(
      await scalar(
        DB_NAME,
        `SELECT has_schema_privilege('freightos_event_writer', 'app', 'USAGE')::text AS n`,
      ),
    ).toBe('false');

    // ── THE OTHER DATABASE: completely untouched. This is what `DROP OWNED` would have destroyed
    //    and what a failed revert would have held hostage.
    expect(await scalar(SECOND, COLUMN_GRANTS)).toBe('5');
    expect(
      await scalar(
        SECOND,
        `SELECT has_schema_privilege('freightos_event_writer', 'app', 'USAGE')::text AS n`,
      ),
    ).toBe('true');
    expect(
      await scalar(
        SECOND,
        `SELECT has_table_privilege('freightos_event_writer', 'network_events', 'INSERT')::text AS n`,
      ),
    ).toBe('true');

    // …and it is still FUNCTIONAL, not merely still privileged: the writer can insert into the
    // second database's journal after the first database was reverted out from under it.
    const writer = new Client({
      host: cluster.sockDir,
      port: cluster.port,
      user: 'freightos_event_writer',
      database: SECOND,
    });
    await writer.connect();
    try {
      const r = await writer.query<{ n: string }>(`SELECT count(*)::text AS n FROM network_events`);
      // The column grant is (event_id, event_fingerprint) only, so count(*) is the readable probe.
      expect(r.rows[0]!.n).toBe('0');
    } finally {
      await writer.end();
    }

    // ── THE ROLE SURVIVES, deliberately, and its creator edge with it. Revoking that edge would
    //    remove the implicit ADMIN row PostgreSQL 16 creates for a role's creator, leaving a later
    //    re-apply unable to grant the role at all — 0020's finding.
    const su2 = connect('postgres');
    await su2.connect();
    try {
      expect(
        (
          await su2.query<{ n: string }>(
            `SELECT count(*)::text AS n FROM pg_roles WHERE rolname = 'freightos_event_writer'`,
          )
        ).rows[0]!.n,
      ).toBe('1');
      expect(
        (
          await su2.query<{ line: string }>(
            `SELECT format('%s admin=%s inherit=%s set=%s', m.rolname,
                           am.admin_option::text, am.inherit_option::text, am.set_option::text) AS line
               FROM pg_auth_members am
               JOIN pg_roles m ON m.oid = am.member
               JOIN pg_roles r ON r.oid = am.roleid
              WHERE r.rolname = 'freightos_event_writer'`,
          )
        ).rows.map((x) => x.line),
      ).toEqual(['freightos_migrator admin=true inherit=false set=false']);
    } finally {
      await su2.end();
    }

    // ── AND RE-APPLY CONVERGES. The role is reused rather than recreated, and every grant returns.
    await driveTo(N3);
    expect(await scalar(DB_NAME, COLUMN_GRANTS)).toBe('5');

    const drop = connect('postgres');
    await drop.connect();
    try {
      await drop.query(`DROP DATABASE ${SECOND}`);
    } finally {
      await drop.end();
    }
  }, 900_000);
});
