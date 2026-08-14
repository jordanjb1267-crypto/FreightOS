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
import { withLegalContext } from '../../src/session.ts';
import { acquireClusterRoleLock, releaseClusterRoleLock } from './harness.ts';
import { systemContext } from './identity-harness.ts';

/**
 * N5-A CLUSTER PROOFS — fresh install, real 0031 upgrade, one-step down, round trip.
 *
 * ON ITS OWN CLUSTER, and the reason is the claim being made rather than convenience. N5-A asserts
 * that it adds NO PostgreSQL role, NO SECURITY DEFINER and NO membership; on the shared cluster
 * those dimensions carry whatever sibling files have minted, and an assertion of emptiness graded
 * against shared state proves nothing. The fresh-install case additionally needs a cluster that has
 * never seen a FreightOS role.
 *
 * The comparison is by SET DIFFERENCE, printed both ways, because "the revert left something
 * behind" and "the revert took something with it" are different defects and a length check
 * distinguishes neither.
 */
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const PG_OWNER = process.env['FREIGHTOS_PGOWNER'] ?? 'postgres';
const DB_NAME = 'freightos_disclosure_parity';

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
      'The N5-A cluster proofs need their own cluster; set PGBIN.',
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
  const root = mkdtempSync(join(tmpdir(), 'freightos-disclosure-parity-'));
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
  cluster = startCluster(56_300 + (process.pid % 90));
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
/** The version N5-A is introduced at, and the version immediately beneath it. */
const N5A = 32;
const BEFORE = N5A - 1;

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
       VALUES ('organization', $1, NULL, 'active', 'test:n5a-parity', 'x', 'x') RETURNING id`,
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
      source: 'urn:freightos:test:n5a-parity',
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

/** A tenant to carry session context on a cluster that has no identity fixture. */
const TENANT = '55555555-5555-4555-8555-555555555555';

const N5A_TABLES = [
  'network_disclosure_authority_bases',
  'network_disclosure_grant_revocations',
  'network_disclosure_grants',
  'network_disclosure_projection_fields',
  'network_disclosure_projections',
  'network_disclosure_purposes',
] as const;

const N5A_KEYS = [
  'network.disclosure_grant.create',
  'network.disclosure_grant.read',
  'network.disclosure_grant.revoke',
] as const;

/** The audit ACL 0031 hardened, read as a value so it can be compared across versions. */
const auditAcl = (): Promise<string> =>
  withAdmin(async (admin) => {
    const r = await admin.query<{ acl: string }>(
      `SELECT coalesce(p.proacl::text, '(default)') AS acl
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'app' AND p.proname = 'record_audit_event'`,
    );
    return r.rows[0]!.acl;
  });

const n5aInventory = async (): Promise<Record<string, string>> =>
  withAdmin(async (admin) => {
    // The CATALOG half is always safe — it reads pg_class and permissions, both of which exist at
    // every version this file visits.
    const catalog = (
      await admin.query<Record<string, string>>(
        `SELECT
           (SELECT coalesce(string_agg(c.relname, ',' ORDER BY c.relname), '(none)')
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind = 'r'
               AND c.relname LIKE 'network\\_disclosure%')                       AS tables,
           (SELECT coalesce(string_agg(key, ',' ORDER BY key), '(none)')
              FROM permissions WHERE key LIKE 'network.disclosure%')            AS keys,
           (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'app' AND p.proname LIKE 'network_disclosure%'
               AND p.prosecdef)                                                 AS secdef,
           (SELECT count(*)::text FROM pg_roles WHERE rolname LIKE 'freightos%') AS roles`,
      )
    ).rows[0]!;

    // The DATA half only runs when the tables are there. A `to_regclass` guard inside one statement
    // would not help: PostgreSQL resolves every relation in a query at PARSE time, so a CASE around
    // the count still fails at 0031 — and this file's whole point is to read the same inventory on
    // both sides of the migration.
    if (catalog['tables'] === '(none)') {
      return { ...catalog, purposes: '(absent)', bases: '(absent)', pointers: '(absent)' };
    }
    const data = (
      await admin.query<Record<string, string>>(
        `SELECT (SELECT count(*)::text FROM network_disclosure_purposes)          AS purposes,
                (SELECT count(*)::text FROM network_disclosure_authority_bases)   AS bases,
                (SELECT count(*)::text FROM network_disclosure_projection_fields) AS pointers`,
      )
    ).rows[0]!;
    return { ...catalog, ...data };
  });

describe('fresh install — §23', () => {
  it('reaches N5-A from an empty cluster with exactly the declared surface', async () => {
    await driveTo(N5A);

    const applied = await withAdmin(async (admin) => {
      const r = await admin.query<{ n: string; tip: string }>(
        `SELECT count(*)::text AS n, max(version)::text AS tip FROM schema_migrations`,
      );
      return r.rows[0]!;
    });
    // Exact, not "at least": a migration silently skipped is the failure this catches. Counted
    // against the migrations at or below N5-A rather than against every migration that exists,
    // because this file deliberately drives to 32 and later migrations are not expected here.
    expect(Number(applied.n)).toBe(migrations.filter((m) => m.version <= N5A).length);
    expect(applied.tip).toBe(String(N5A));

    const inv = await n5aInventory();
    expect(inv['tables']).toBe(N5A_TABLES.join(','));
    expect(inv['keys']).toBe(N5A_KEYS.join(','));
    expect(inv['secdef'], 'N5-A added a SECURITY DEFINER').toBe('0');
    expect(inv['purposes']).toBe('1');
    expect(inv['bases']).toBe('1');
    expect(Number(inv['pointers'])).toBeGreaterThan(0);

    // ZERO role assignments, read as the control plane. Counted as the migrator, `role_permissions`
    // is invisible under FORCE RLS and this assertion could not fail.
    const assigned = await withAdmin(async (admin) => {
      const r = await admin.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM role_permissions rp
           JOIN permissions p ON p.id = rp.permission_id
          WHERE p.key LIKE 'network.disclosure%'`,
      );
      return r.rows[0]!.n;
    });
    expect(assigned).toBe('0');

    // No role N5-A could have minted, under any name.
    const roleNames = await withAdmin(async (admin) => {
      const r = await admin.query<{ rolname: string }>(
        `SELECT rolname FROM pg_roles WHERE rolname LIKE 'freightos%' ORDER BY 1`,
      );
      return r.rows.map((x) => x.rolname);
    });
    for (const suspicious of ['disclosure', 'grant', 'publisher', 'subscriber', 'recipient']) {
      expect(roleNames.filter((n) => n.includes(suspicious))).toEqual([]);
    }

    // And 0031's hardening is on this cluster too — a fresh install must not be the one path where
    // PUBLIC keeps EXECUTE on the ledger writer.
    expect(await auditAcl()).not.toMatch(/(^|,)=X/);
  }, 600_000);

  it('takes a real grant end to end on a cluster that has held nothing else', async () => {
    await driveTo(N5A);

    // A real tenant row, because the audit ledger's foreign key requires one. Every step of this
    // set-up is the platform refusing a shortcut, which is the reason the case is worth having:
    // context, actor form, legal pairing and tenant existence are all enforced on the way to a
    // single grant insert.
    await withAdmin(async (admin) => {
      await admin.query(
        `INSERT INTO tenants (id, tenant_id, name, created_by, updated_by)
         VALUES ($1, $1, 'n5a-fresh-install', 'test:n5a-parity', 'test:n5a-parity')
         ON CONFLICT (id) DO NOTHING`,
        [TENANT],
      );
    });

    const grantor = await registerOrganization('fresh-grantor');
    const recipient = await registerOrganization('fresh-recipient');

    // Through the migration authority rather than the runtime path: this case is about the schema
    // being usable on a virgin cluster, and the runtime authorization path is proven against the
    // full identity fixture in network-disclosure-authorization.test.ts.
    const grantId = await withAdmin(async (admin) =>
      // The audit coupling is REAL, so the insert needs the session context `record_audit_event`
      // requires: a tenant and a recognised actor form. Established through `withLegalContext`
      // rather than by open-coding `set_config` — SR2_RAW_GUC_ALLOWLIST §4 names that as the
      // pattern for a privileged fixture, and it is what keeps this file off the allowlist.
      withLegalContext(admin, systemContext(TENANT, 'system:n5a-fresh-install'), async (c) => {
        const r = await (c as Client).query<{ grant_id: string }>(
          `INSERT INTO network_disclosure_grants
             (grantor_participant_id, recipient_participant_id, purpose_code, projection_ref,
              authority_basis_code, effective_from)
           SELECT $1, $2, 'shipment_execution', p.projection_ref, 'bilateral_grant',
                  '2026-01-01T00:00:00Z'
             FROM network_disclosure_projections p LIMIT 1
           RETURNING grant_id`,
          [grantor, recipient],
        );
        return r.rows[0]!.grant_id;
      }),
    );
    expect(grantId).toBeTruthy();

    // The audit coupling fired, in the same transaction, with no application help.
    const audited = await withAdmin(async (admin) => {
      const r = await admin.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit_events
          WHERE event_type = 'rig.freight.network.disclosure_grant.created.v1'
            AND resource_id = $1`,
        [grantId],
      );
      return r.rows[0]!.n;
    });
    expect(audited, 'a grant committed with no ledger entry').toBe('1');
  }, 600_000);
});

describe('the real 0031 upgrade path — §24', () => {
  it('adds the N5-A surface and leaves N1, N3, N4 and the audit ACL untouched', async () => {
    await driveTo(BEFORE);

    // Real data at 0031, so "unchanged" is a statement about rows and not only about catalogs.
    const org = await registerOrganization('upgrade-subject');
    const events = [await acceptOneEvent(org), await acceptOneEvent(org)];
    const before = await withAdmin(snapshot);
    const beforeAudit = await auditAcl();
    const beforeCounts = await withAdmin(async (admin) => {
      const r = await admin.query<Record<string, string>>(
        `SELECT (SELECT count(*)::text FROM network_events)             AS events,
                (SELECT count(*)::text FROM network_transport_intents)  AS intents,
                (SELECT count(*)::text FROM network_participants)       AS participants,
                (SELECT count(*)::text FROM outbox_events)              AS outbox,
                (SELECT count(*)::text FROM audit_events)               AS audits`,
      );
      return r.rows[0]!;
    });

    await driveTo(N5A);

    // ADDITIVE: everything present at 0031 is still present.
    expect(removals(before, await withAdmin(snapshot)), '0032 removed something').toEqual([]);

    const afterCounts = await withAdmin(async (admin) => {
      const r = await admin.query<Record<string, string>>(
        `SELECT (SELECT count(*)::text FROM network_events)             AS events,
                (SELECT count(*)::text FROM network_transport_intents)  AS intents,
                (SELECT count(*)::text FROM network_participants)       AS participants,
                (SELECT count(*)::text FROM outbox_events)              AS outbox,
                (SELECT count(*)::text FROM audit_events)               AS audits`,
      );
      return r.rows[0]!;
    });
    // Row-for-row. A migration that backfilled, re-derived or re-audited anything moves one of
    // these, and none of them is N5-A's to move.
    expect(afterCounts).toEqual(beforeCounts);
    expect(events).toHaveLength(2);

    // The 0031 hardening survived the upgrade byte for byte.
    expect(await auditAcl()).toBe(beforeAudit);

    const inv = await n5aInventory();
    expect(inv['tables']).toBe(N5A_TABLES.join(','));
    expect(inv['keys']).toBe(N5A_KEYS.join(','));
    expect(inv['roles']).toBe(
      await withAdmin(
        async (admin) =>
          (
            await admin.query<{ n: string }>(
              `SELECT count(*)::text AS n FROM pg_roles WHERE rolname LIKE 'freightos%'`,
            )
          ).rows[0]!.n,
      ),
    );
  }, 600_000);
});

describe('one step down, and the round trip — §25 and §26', () => {
  it('reverts only 0032, reproduces 0031 exactly, and re-applies to the same N5-A', async () => {
    await driveTo(BEFORE);
    const at31 = await withAdmin(snapshot);
    const audit31 = await auditAcl();

    await driveTo(N5A);
    const firstUp = await withAdmin(snapshot);
    expect(removals(at31, firstUp), 'applying N5-A removed something that existed at 0031').toEqual(
      [],
    );

    await driveTo(BEFORE);
    const afterDown = await withAdmin(snapshot);

    // THE PARITY ORACLE. Both directions, because "left something behind" and "took something with
    // it" are different defects. No N5-A exception is expected after the permission-cleanup ruling:
    // the three permission rows are catalog rows, not schema, so they do not appear in these
    // dimensions at all — network-disclosure-rollback.test.ts is what compares them as values.
    expect(differences(at31, afterDown)).toEqual([]);

    // Named explicitly, because a dimension that silently stopped being collected would also
    // produce an empty difference.
    const inv = await n5aInventory();
    expect(inv['tables']).toBe('(none)');
    expect(inv['keys']).toBe('(none)');

    // Reverting a FEATURE must not reopen a CONTROL that belongs to something else.
    expect(await auditAcl()).toBe(audit31);

    await driveTo(N5A);
    expect(differences(firstUp, await withAdmin(snapshot))).toEqual([]);
  }, 600_000);

  it('adds nothing cluster-global — no role, no membership, no SECURITY DEFINER', async () => {
    await driveTo(BEFORE);
    const before = await withAdmin(snapshot);
    const definersBefore = await withAdmin(
      async (admin) =>
        (
          await admin.query<{ n: string }>(
            `SELECT count(*)::text AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname IN ('app', 'admin', 'authn') AND p.prosecdef`,
          )
        ).rows[0]!.n,
    );

    await driveTo(N5A);
    const after = await withAdmin(snapshot);

    expect(after['roles']).toEqual(before['roles']);
    expect(after['memberships']).toEqual(before['memberships']);

    const definersAfter = await withAdmin(
      async (admin) =>
        (
          await admin.query<{ n: string }>(
            `SELECT count(*)::text AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname IN ('app', 'admin', 'authn') AND p.prosecdef`,
          )
        ).rows[0]!.n,
    );
    expect(definersAfter, 'N5-A added a SECURITY DEFINER').toBe(definersBefore);
  }, 600_000);
});
