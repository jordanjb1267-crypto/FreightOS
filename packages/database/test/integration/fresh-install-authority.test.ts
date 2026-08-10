import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { loadMigrations, migrateUp } from '../../src/migrator.ts';
import { MIGRATIONS_DIR } from '../../src/paths.ts';
import { acquireClusterRoleLock, releaseClusterRoleLock } from './harness.ts';

// CLUSTER-GLOBAL EXCLUSION. This file drives migrateUp against clusters it provisions itself, so it
// mutates no shared role state and in principle needs no exclusion at all. It takes the lock anyway:
// the coverage guard's rule is "every file that drives migrations holds the lock", and a rule with
// an exemption clause is a rule with a way around it. The cost is that this file queues behind the
// other migration drivers for a few seconds; the benefit is that the guard stays absolute.
//
// No deadlock against the child process below: advisory lock tags are scoped to a DATABASE OID, and
// the child takes its lock on its own ephemeral cluster, not this one.
beforeAll(async () => {
  await acquireClusterRoleLock();
}, 300_000);

afterAll(async () => {
  await releaseClusterRoleLock();
});

/**
 * FRESH-FIRST-RUN MIGRATION AUTHORITY — the contract must hold after ONE lifecycle, not two.
 *
 * The convergence — `bootstrapMigrator` in the harness, `converge-migration-authority.sql` in
 * production — can only converge a role that already exists; both skip what is absent. On a cluster
 * carrying no FreightOS role that is every managed role, because migrations 0001 and 0013 are what
 * create them. A convergence that runs only BEFORE the migrations therefore establishes nothing,
 * and each role keeps whatever its creation produced.
 *
 * For three of the four that is already correct. `freightos_admin` is the exception and the reason
 * this file exists: it owns no catalog object, so no migration needs to become it and none grants
 * SET, leaving only PostgreSQL's implicit `ADMIN TRUE, INHERIT FALSE, SET FALSE` creator row —
 * while the bootstrap script's ROLE SEPARATION section attests that the migrator CAN SET ROLE to
 * it. The contract was satisfied only from the SECOND convergence onwards, and
 * `identity-migrations.test.ts > migration authority` failed on 10 of 20 genuinely fresh clusters,
 * deterministically whenever it was the first file to touch one.
 *
 * ITS OWN CLUSTER, FOR A REASON THAT WAS MEASURED. The precondition is an empty FreightOS role
 * namespace, and roles are cluster-wide — so producing it on the SHARED test cluster means dropping
 * every FreightOS role and, to release their dependencies, every FreightOS database. Tried: it took
 * `authority-remediation.test.ts` down with 15 "database does not exist" failures, because
 * `fileParallelism: false` does not stop a neighbouring file's work from overlapping at a file
 * boundary — the same overlap this branch's advisory lock exists to serialise, and one that a
 * non-migration-driving file does not hold the lock against. So this file provisions a private
 * PostgreSQL cluster with initdb, proves it holds no FreightOS role, and runs both lifecycles
 * there. It mutates no shared state at all.
 */

/** The managed-role contract: direct ADMIN, never INHERIT, direct SET only where named. */
const CONTRACT: Record<string, boolean> = {
  freightos_app: false,
  freightos_control_plane: false,
  freightos_admin_owner: true,
  freightos_admin: true,
};

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const VITE_NODE = join(
  ROOT,
  'node_modules/.pnpm/vite-node@3.2.4_@types+node@22.20.1_yaml@2.9.0/node_modules/vite-node/vite-node.mjs',
);
const FIXTURE = fileURLToPath(new URL('./fixtures/first-run-reset.mts', import.meta.url));

/**
 * The PostgreSQL server binaries.
 *
 * Not the client: initdb and pg_ctl ship with the server package and a psql-only host has neither.
 * Absence is raised rather than skipped — a regression that quietly does not run is the failure
 * mode this whole investigation was about.
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
      'The fresh-install authority regression needs its own cluster; set PGBIN.',
  );
}

const PG_OWNER = process.env['FREIGHTOS_PGOWNER'] ?? 'postgres';

/**
 * One private cluster. TWO are provisioned, because each lifecycle needs a cluster that has never
 * seen a FreightOS role and the first lifecycle to run would otherwise converge the second one's
 * starting state — measured: the production-parity check found freightos_admin already SET-able
 * because the harness lifecycle had already run on that cluster, which is exactly the "second
 * convergence repairs it" behaviour under test.
 */
interface Cluster {
  root: string;
  dataDir: string;
  sockDir: string;
  port: number;
}

let bin = '';
const clusters: Cluster[] = [];

/** Run a server binary, as an unprivileged owner when this process is root. */
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
  const root = mkdtempSync(join(tmpdir(), 'freightos-freshinstall-'));
  const c: Cluster = { root, dataDir: join(root, 'data'), sockDir: join(root, 'sock'), port };
  execFileSync('mkdir', ['-p', c.sockDir]);
  // The server process runs as PG_OWNER when this process is root, so it must own the tree.
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
  clusters.push(c);
  return c;
}

/** psql against a given cluster, from the repository root so `-f scripts/...` resolves. */
function psql(c: Cluster, args: string[]): string {
  return execFileSync(
    join(bin, 'psql'),
    [
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      c.sockDir,
      '-p',
      String(c.port),
      '-U',
      'postgres',
      '-d',
      'postgres',
      ...args,
    ],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

function connect(c: Cluster, database: string, user = 'postgres'): Client {
  return new Client({ host: c.sockDir, port: c.port, user, database });
}

/** The cluster the HARNESS lifecycle runs on, and the one the PRODUCTION lifecycle runs on. */
let harnessCluster: Cluster;
let productionCluster: Cluster;

beforeAll(() => {
  bin = serverBinDir();
  const base = 55_600 + (process.pid % 200) * 2;
  harnessCluster = startCluster(base);
  productionCluster = startCluster(base + 1);
}, 300_000);

afterAll(() => {
  for (const c of clusters) {
    try {
      pg('pg_ctl', ['-D', c.dataDir, '-m', 'immediate', '-w', 'stop']);
    } catch {
      // Already down; removing the directory is what matters.
    }
    rmSync(c.root, { recursive: true, force: true });
  }
});

async function census(
  su: Client,
): Promise<{ roles: number; operators: number; defaultAcls: number }> {
  const r = await su.query<{ roles: string; operators: string; default_acls: string }>(
    `SELECT (SELECT count(*) FROM pg_roles WHERE rolname LIKE 'freightos%')::text AS roles,
            (SELECT count(*) FROM pg_roles WHERE rolname LIKE 'op\\_%')::text     AS operators,
            (SELECT count(*) FROM pg_default_acl)::text                           AS default_acls`,
  );
  const row = r.rows[0]!;
  return {
    roles: Number(row.roles),
    operators: Number(row.operators),
    defaultAcls: Number(row.default_acls),
  };
}

interface ContractRow {
  role: string;
  admin: boolean;
  inherit: boolean;
  direct_set: boolean;
  inherits: boolean;
}

/** The union profile, read the way the contract is stated: direct options, effective inheritance. */
async function authorityContract(su: Client): Promise<ContractRow[]> {
  const r = await su.query<ContractRow>(
    `SELECT r.rolname AS role,
            bool_or(am.admin_option)   AS admin,
            bool_or(am.inherit_option) AS inherit,
            bool_or(am.set_option)     AS direct_set,
            pg_has_role('freightos_migrator', r.rolname, 'USAGE') AS inherits
       FROM pg_auth_members am
       JOIN pg_roles r ON r.oid = am.roleid
       JOIN pg_roles m ON m.oid = am.member
      WHERE m.rolname = 'freightos_migrator' AND r.rolname = ANY($1)
      GROUP BY r.rolname ORDER BY 1`,
    [Object.keys(CONTRACT)],
  );
  return r.rows;
}

function expectContractHolds(rows: ContractRow[]): void {
  expect(rows.map((x) => x.role).sort(), 'a managed role has no membership at all').toEqual(
    Object.keys(CONTRACT).sort(),
  );
  for (const row of rows) {
    expect([row.role, row.admin], `${row.role} ADMIN OPTION`).toEqual([row.role, true]);
    // Inheritance is asserted EFFECTIVELY: authority acquired transitively is acquired all the same.
    expect([row.role, row.inherit], `${row.role} direct INHERIT`).toEqual([row.role, false]);
    expect([row.role, row.inherits], `${row.role} effective USAGE`).toEqual([row.role, false]);
    // SET is asserted DIRECTLY. `pg_has_role(...,'SET')` is transitive, and the migrator legitimately
    // reaches freightos_control_plane through freightos_admin_owner, so the effective form fails on
    // a correctly converged cluster — measured, the first time this attestation was written that
    // way. What the convergence controls, and what `set_option = false` means, is the direct grant.
    expect([row.role, row.direct_set], `${row.role} direct SET`).toEqual([
      row.role,
      CONTRACT[row.role],
    ]);
  }
}

describe('fresh install authority', () => {
  it('starts from a cluster proven to hold no FreightOS role at all', async () => {
    const su = connect(productionCluster, 'postgres');
    await su.connect();
    try {
      expect(await census(su), 'the ephemeral cluster is not actually fresh').toEqual({
        roles: 0,
        operators: 0,
        defaultAcls: 0,
      });
    } finally {
      await su.end();
    }
  }, 120_000);

  it('satisfies the whole contract after ONE harness lifecycle', async () => {
    // The REAL TestDatabase.reset(), run in a child process so harness.ts binds to this cluster.
    execFileSync('node', ['--no-warnings', VITE_NODE, FIXTURE, 'freightos_first_run'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FREIGHTOS_PGSOCK: harnessCluster.sockDir,
        FREIGHTOS_PGPORT: String(harnessCluster.port),
        PGPASSWORD: undefined,
      },
    });

    const su = connect(harnessCluster, 'postgres');
    await su.connect();
    try {
      expectContractHolds(await authorityContract(su));
    } finally {
      await su.end();
    }
  }, 300_000);

  it('reaches the same contract through the PRODUCTION bootstrap + migrate + converge lifecycle', async () => {
    // Parity, so the harness cannot become correct while scripts/*.sql stay wrong. This is the real
    // deployment path, on a cluster that has never seen a FreightOS role: psql bootstrap as
    // superuser, migrations as freightos_migrator, then the convergence file with require_complete.
    const su = connect(productionCluster, 'postgres');
    await su.connect();
    try {
      await su.query('CREATE DATABASE freightos_prod_parity');

      psql(productionCluster, [
        '-v',
        'db_name=freightos_prod_parity',
        '-f',
        'scripts/bootstrap-migration-authority.sql',
      ]);

      const migrator = connect(productionCluster, 'freightos_prod_parity', 'freightos_migrator');
      await migrator.connect();
      try {
        await migrateUp(migrator, loadMigrations(MIGRATIONS_DIR));
      } finally {
        await migrator.end();
      }

      // The contract is still WRONG at this point — that is the whole finding. Asserting it here
      // keeps the next line from being mistaken for a no-op.
      const beforeConvergence = await authorityContract(su);
      expect(
        beforeConvergence.find((x) => x.role === 'freightos_admin')?.direct_set,
        'phase 3 would be a no-op — the defect this file guards is not reproducible here',
      ).toBe(false);

      psql(productionCluster, [
        '-v',
        'require_complete=1',
        '-f',
        'scripts/converge-migration-authority.sql',
      ]);
      expectContractHolds(await authorityContract(su));
    } finally {
      await su.end();
    }
  }, 300_000);

  it('is idempotent — converging an already-correct cluster changes nothing', async () => {
    const su = connect(productionCluster, 'postgres');
    await su.connect();
    try {
      const before = await authorityContract(su);
      psql(productionCluster, [
        '-v',
        'require_complete=1',
        '-f',
        'scripts/converge-migration-authority.sql',
      ]);
      psql(productionCluster, [
        '-v',
        'require_complete=1',
        '-f',
        'scripts/converge-migration-authority.sql',
      ]);
      const after = await authorityContract(su);
      expect(after, 'a further convergence changed the effective contract').toEqual(before);
      expectContractHolds(after);
    } finally {
      await su.end();
    }
  }, 300_000);

  it('keeps freightos_admin in the contract even though it owns nothing', async () => {
    // The distinction that makes both halves of the contract necessary. The DERIVED rule — every
    // migration-created owner must be SET-able — cannot reach freightos_admin, because it owns no
    // catalog object. If the explicit half were dropped "because it owns nothing", the exact defect
    // this file guards would return silently. Proving it owns nothing is what makes that concrete.
    const migrator = connect(productionCluster, 'freightos_prod_parity', 'freightos_migrator');
    await migrator.connect();
    try {
      const owned = await migrator.query<{ n: string }>(
        `SELECT count(*)::text AS n
           FROM (
             SELECT p.proowner AS oid FROM pg_proc p
               JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname IN ('app', 'admin', 'authn')
             UNION ALL
             SELECT c.relowner FROM pg_class c
               JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname IN ('app', 'admin', 'authn')
             UNION ALL
             SELECT n.nspowner FROM pg_namespace n WHERE n.nspname IN ('app', 'admin', 'authn')
           ) owned
           JOIN pg_roles o ON o.oid = owned.oid
          WHERE o.rolname = 'freightos_admin'`,
      );
      expect(Number(owned.rows[0]!.n), 'freightos_admin now owns objects').toBe(0);

      // And the derived half still holds on this same first-run cluster.
      const owners = await migrator.query<{ owner: string; can_set: boolean }>(
        `SELECT DISTINCT o.rolname AS owner,
                pg_has_role('freightos_migrator', o.oid, 'SET') AS can_set
           FROM (
             SELECT p.proowner AS oid FROM pg_proc p
               JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname IN ('app', 'admin', 'authn')
             UNION
             SELECT c.relowner FROM pg_class c
               JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname IN ('app', 'admin', 'authn') AND c.relkind = 'r'
             UNION
             SELECT n.nspowner FROM pg_namespace n WHERE n.nspname IN ('app', 'admin', 'authn')
           ) owned
           JOIN pg_roles o ON o.oid = owned.oid
          WHERE o.rolname LIKE 'freightos%'
          ORDER BY 1`,
      );
      expect(owners.rows.length, 'no FreightOS object owners found').toBeGreaterThanOrEqual(5);
      expect(
        owners.rows.filter((x) => !x.can_set).map((x) => x.owner),
        'a role owns migration-created objects but the migrator cannot SET ROLE to it',
      ).toEqual([]);
    } finally {
      await migrator.end();
    }
  }, 300_000);
});
