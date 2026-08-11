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
 * SR-AUDIT-ACL-NOOP — THE TWO CLUSTER PROOFS, ON A PRIVATE CLUSTER.
 *
 * The shared test cluster cannot answer either question in this file. Roles are cluster-global, and
 * `app.record_audit_event`'s ACL lives on a function whose owner is a cluster-global role, so a
 * neighbouring file that has already applied 0031 would make a "fresh install" here indistinguishable
 * from an upgraded one. This file therefore runs `initdb` and owns everything it observes.
 *
 * TWO CLUSTER STATES ARE PROVEN.
 *
 *   FRESH   — bootstrap from zero straight through 0031. Every property of the hardened ACL holds
 *             on a database that never carried the defect.
 *
 *   UPGRADE — bootstrap to 0030 ONLY. Assert the database really does carry the broken 0018 ACL
 *             (PUBLIC EXECUTE present — if this assertion ever fails, 0018 has been edited and this
 *             whole hotfix has lost its premise), then apply 0031 and assert the defect is closed.
 *
 * The upgrade case is the decisive one. A fix that only works on a fresh install repairs nothing:
 * every cluster that has ever run this system is in the broken state, and 0018 is applied history
 * that cannot be edited.
 */

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const PG_OWNER = process.env['FREIGHTOS_PGOWNER'] ?? 'postgres';
const FRESH_DB = 'freightos_audit_acl_fresh';
const UPGRADE_DB = 'freightos_audit_acl_upgrade';
const SUPERUSER_DB = 'freightos_audit_acl_superuser';

/** The version that introduces the hotfix, and the tip it repairs. */
const HOTFIX = 31;
const BEFORE_HOTFIX = HOTFIX - 1;
/**
 * The repository tip. Distinct from HOTFIX because a fresh bootstrap applies everything, while the
 * hotfix cases below deliberately stop at 0031 — conflating the two made "the hotfix is last" and
 * "the migration set is complete" the same assertion, and only the second one moves when a
 * migration lands.
 */
const TIP = 32;

const FN = 'app.record_audit_event(text,text,text,uuid,uuid,text,jsonb)';

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
      'The SR-AUDIT-ACL-NOOP cluster proofs need their own cluster; set PGBIN.',
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
  const root = mkdtempSync(join(tmpdir(), 'freightos-audit-acl-'));
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

const migrations = loadMigrations(MIGRATIONS_DIR);

/** Migrations up to and including `version`. `migrateUp` has no target parameter. */
const upTo = (version: number) => migrations.filter((m) => m.version <= version);

interface AclFacts {
  publicExec: boolean;
  appExec: boolean;
  grantees: string[];
  forbidden: string[];
}

async function aclFacts(client: Client): Promise<AclFacts> {
  const pub = await client.query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         CROSS JOIN LATERAL aclexplode(p.proacl) a
        WHERE n.nspname = 'app' AND p.proname = 'record_audit_event'
          AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS present`,
  );
  const grantees = await client.query<{ grantee: string }>(
    `SELECT g.rolname AS grantee
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       CROSS JOIN LATERAL aclexplode(p.proacl) a
       JOIN pg_roles g ON g.oid = a.grantee
      WHERE n.nspname = 'app' AND p.proname = 'record_audit_event'
        AND a.privilege_type = 'EXECUTE' ORDER BY 1`,
  );
  const reach = await client.query<{ rolname: string; ok: boolean }>(
    `SELECT rolname, has_function_privilege(rolname, $1, 'EXECUTE') AS ok
       FROM pg_roles WHERE rolname LIKE 'freightos%' ORDER BY 1`,
    [FN],
  );
  return {
    publicExec: pub.rows[0]!.present,
    appExec: reach.rows.find((r) => r.rolname === 'freightos_app')?.ok ?? false,
    grantees: grantees.rows.map((r) => r.grantee),
    forbidden: reach.rows
      .filter(
        (r) => r.ok && r.rolname !== 'freightos_app' && r.rolname !== 'freightos_audit_writer',
      )
      .map((r) => r.rolname),
  };
}

beforeAll(async () => {
  await acquireClusterRoleLock();
  bin = serverBinDir();
  cluster = startCluster(56_200 + (process.pid % 90));
  const su = connect('postgres');
  await su.connect();
  try {
    await su.query(`CREATE DATABASE ${FRESH_DB}`);
    await su.query(`CREATE DATABASE ${UPGRADE_DB}`);
    await su.query(`CREATE DATABASE ${SUPERUSER_DB}`);
  } finally {
    await su.end();
  }
  psql(['-v', `db_name=${FRESH_DB}`, '-f', 'scripts/bootstrap-migration-authority.sql']);
  psql(['-v', `db_name=${UPGRADE_DB}`, '-f', 'scripts/bootstrap-migration-authority.sql']);
  psql(['-v', `db_name=${SUPERUSER_DB}`, '-f', 'scripts/bootstrap-migration-authority.sql']);
}, 900_000);

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

describe('SR-AUDIT-ACL-NOOP — fresh cluster', () => {
  let facts: AclFacts;

  beforeAll(async () => {
    const client = connect(FRESH_DB, 'freightos_migrator');
    await client.connect();
    try {
      const result = await migrateUp(client, migrations);
      // Bootstrapped from zero: every migration applied here, in one pass.
      expect(result.applied).toEqual(migrations.map((m) => m.version));
      expect(result.applied.at(-1)).toBe(TIP);
      facts = await aclFacts(client);
    } finally {
      await client.end();
    }
  }, 900_000);

  it('does not give PUBLIC execute on the audit function', () => {
    expect(facts.publicExec).toBe(false);
  });

  it('gives freightos_app an explicit grant', () => {
    expect(facts.appExec).toBe(true);
    expect(facts.grantees).toEqual(['freightos_app', 'freightos_audit_writer']);
  });

  it('gives no other role execute', () => {
    expect(facts.forbidden).toEqual([]);
  });

  it('leaves every prior migration applied and the ledger structure intact', async () => {
    const client = connect(FRESH_DB);
    await client.connect();
    try {
      const applied = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM schema_migrations`,
      );
      expect(Number(applied.rows[0]!.count)).toBe(migrations.length);

      // The ledger's own protections are untouched by an ACL-only migration.
      const structure = await client.query<{ triggers: string; rls: boolean }>(
        `SELECT (SELECT count(*)::text FROM pg_trigger
                  WHERE tgrelid = 'public.audit_events'::regclass AND NOT tgisinternal) AS triggers,
                (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
                  WHERE oid = 'public.audit_events'::regclass) AS rls`,
      );
      expect(structure.rows[0]!.triggers).toBe('3');
      expect(structure.rows[0]!.rls).toBe(true);
    } finally {
      await client.end();
    }
  });
});

describe('SR-AUDIT-ACL-NOOP — upgrade from a cluster carrying the broken 0018 ACL', () => {
  let before: AclFacts;
  let after: AclFacts;

  beforeAll(async () => {
    const client = connect(UPGRADE_DB, 'freightos_migrator');
    await client.connect();
    try {
      // Stop at 0030 — the real state of every cluster that has run this system.
      const first = await migrateUp(client, upTo(BEFORE_HOTFIX));
      expect(first.applied.at(-1)).toBe(BEFORE_HOTFIX);
      before = await aclFacts(client);

      const second = await migrateUp(client, migrations);
      // The hotfix and everything after it. Enumerated from the loaded set rather than written out,
      // so a later migration joining the tail does not require an edit here — what this case is
      // about is the ACL the hotfix converges, not the length of the tail behind it.
      expect(second.applied).toEqual(
        migrations.filter((m) => m.version >= HOTFIX).map((m) => m.version),
      );
      after = await aclFacts(client);
    } finally {
      await client.end();
    }
  }, 900_000);

  it('confirms the pre-upgrade database really is vulnerable', () => {
    // THE PREMISE OF THE WHOLE HOTFIX, asserted rather than assumed. If this ever goes false,
    // either 0018 has been edited — which it must not be — or the defect was fixed elsewhere and
    // 0031 is repairing nothing. Either way the finding needs re-examining, not the test relaxing.
    expect(before.publicExec, 'the 0030 database does not carry the 0018 defect').toBe(true);
    // And the defect's exact shape: freightos_app reached the function ONLY through PUBLIC.
    expect(before.grantees).toEqual(['freightos_audit_writer']);
    expect(before.appExec).toBe(true);
    // Every other runtime role could reach it too — this is the exploit surface.
    expect(before.forbidden.length).toBeGreaterThan(0);
  });

  it('closes it', () => {
    expect(after.publicExec).toBe(false);
    expect(after.appExec).toBe(true);
    expect(after.grantees).toEqual(['freightos_app', 'freightos_audit_writer']);
    expect(after.forbidden).toEqual([]);
  });

  it('names the roles that lost reachability', () => {
    const lost = before.forbidden.filter((r) => !after.forbidden.includes(r)).sort();
    // The reproduction role is the headline, and the assertion says so by name rather than by count.
    expect(lost).toContain('freightos_event_writer');
    expect(lost).toContain('freightos_control_plane');
    expect(lost).toContain('freightos_migrator');
  });

  it('keeps the hardening when 0031 is reverted — the deliberate asymmetry', async () => {
    // 0031's down migration does not restore PUBLIC EXECUTE. Reverting a security control whose
    // entire content IS that control would reopen ledger forgery, so it refuses. This asserts the
    // documented behaviour rather than assuming it, and asserts the runtime path survives too.
    const client = connect(UPGRADE_DB, 'freightos_migrator');
    await client.connect();
    try {
      const down = await migrateDown(client, migrations, BEFORE_HOTFIX);
      // Newest first, so the hotfix is reverted LAST — everything stacked above it comes off first.
      // Derived from the loaded set for the same reason as above: this case is about what 0031's
      // down does to one function ACL, not about how many migrations sit on top of it.
      expect(down.reverted).toEqual(
        migrations
          .filter((m) => m.version >= HOTFIX)
          .map((m) => m.version)
          .reverse(),
      );

      const reverted = await aclFacts(client);
      expect(reverted.publicExec, 'reverting 0031 reopened PUBLIC ledger forgery').toBe(false);
      expect(reverted.appExec, 'reverting 0031 took the audit path from the runtime role').toBe(
        true,
      );
      expect(reverted.forbidden).toEqual([]);

      // And it re-applies cleanly on top of the state its own down migration left.
      const again = await migrateUp(client, migrations);
      expect(again.applied).toEqual(
        migrations.filter((m) => m.version >= HOTFIX).map((m) => m.version),
      );
      expect(await aclFacts(client)).toEqual(after);
    } finally {
      await client.end();
    }
  }, 300_000);

  it('is idempotent — a second pass changes nothing', async () => {
    const client = connect(UPGRADE_DB, 'freightos_migrator');
    await client.connect();
    try {
      const noop = await migrateUp(client, migrations);
      expect(noop.applied).toEqual([]);
      expect(await aclFacts(client)).toEqual(after);
    } finally {
      await client.end();
    }
  }, 300_000);
});

/**
 * THE THIRD CLUSTER STATE — a database whose migrations were run by a SUPERUSER.
 *
 * The defect is conditional on the deployment identity, which is not obvious and was not obvious to
 * this hotfix's first draft: it aborted here. 0018's `REVOKE … FROM PUBLIC` and
 * `GRANT … TO freightos_app, freightos_control_plane` fail silently for `freightos_migrator`, which
 * is not the function's owner — but a superuser may grant on any object, so the same statements
 * SUCCEED when migrations run as `postgres`. Such a cluster came out of 0018 with PUBLIC already
 * revoked and TWO explicit grantees.
 *
 * That state is not the defect, but it is not the ruled target either: `freightos_control_plane`
 * holds EXECUTE that no caller anywhere exercises, and 0018 §1 had already taken that role off the
 * ledger's write path by revoking its direct INSERT. 0031 must therefore converge this state too,
 * by revoking rather than by aborting.
 *
 * `kill-switch-scopes.test.ts` migrates as `postgres` and hits this path incidentally — that is how
 * the case was found, when this hotfix's first draft aborted there. It is proven here on purpose,
 * because a property that only one unrelated suite happens to cover is a property that will break
 * silently when that suite changes.
 *
 * HOW THE STATE IS BUILT, STATED PLAINLY. Migration 0013 refuses to deploy under a role that
 * inherits control-plane rights, so `postgres` cannot drive `migrateUp` on a freshly bootstrapped
 * database here. The pre-state is therefore CONSTRUCTED: migrate to 0030 as the migrator, then have
 * the superuser apply 0018's intended ACL by hand — the same two statements, succeeding for the
 * same reason they succeed for a superuser anywhere. What is asserted afterwards is convergence
 * from that ACL, which is the property under test; the route to it is scaffolding.
 */
describe('SR-AUDIT-ACL-NOOP — a superuser-migrated cluster, where 0018 actually worked', () => {
  let before: AclFacts;
  let after: AclFacts;

  beforeAll(async () => {
    const migrator = connect(SUPERUSER_DB, 'freightos_migrator');
    await migrator.connect();
    try {
      const first = await migrateUp(migrator, upTo(BEFORE_HOTFIX));
      expect(first.applied.at(-1)).toBe(BEFORE_HOTFIX);
    } finally {
      await migrator.end();
    }

    // 0018 lines 207–210, verbatim, executed by an identity PostgreSQL accepts — which is exactly
    // what happens when a cluster's migrations are run as `postgres`.
    const su = connect(SUPERUSER_DB, 'postgres');
    await su.connect();
    try {
      await su.query(`REVOKE ALL ON FUNCTION ${FN} FROM PUBLIC`);
      await su.query(`GRANT EXECUTE ON FUNCTION ${FN} TO freightos_app, freightos_control_plane`);
    } finally {
      await su.end();
    }

    const client = connect(SUPERUSER_DB, 'freightos_migrator');
    await client.connect();
    try {
      before = await aclFacts(client);
      const second = await migrateUp(client, migrations);
      expect(second.applied).toEqual(
        migrations.filter((m) => m.version >= HOTFIX).map((m) => m.version),
      );
      after = await aclFacts(client);
    } finally {
      await client.end();
    }
  }, 900_000);

  it('never had the defect — 0018 succeeded for a superuser', () => {
    expect(
      before.publicExec,
      'a superuser-migrated cluster should not carry the PUBLIC grant',
    ).toBe(false);
    // Both grantees 0018 named, which is the evidence its statements took effect here.
    expect(before.grantees).toEqual([
      'freightos_app',
      'freightos_audit_writer',
      'freightos_control_plane',
    ]);
  });

  it('is still wider than the ruled target before the hotfix — and wider than one role', () => {
    // The single `GRANT … TO freightos_control_plane` reaches FOUR roles, not one.
    // `freightos_admin_owner`, `freightos_hierarchy_owner` and `freightos_identity_guard` are all
    // members of `freightos_control_plane` WITH INHERIT, so each picks the EXECUTE up transitively
    // — and all three are SECURITY DEFINER owner roles, which is a poor set to hand a write path
    // into the audit ledger.
    //
    // This is why §10's target is stated as an explicit grantee SET rather than as "revoke the
    // control plane": reasoning about one named role would have missed three.
    expect(before.forbidden).toEqual([
      'freightos_admin_owner',
      'freightos_control_plane',
      'freightos_hierarchy_owner',
      'freightos_identity_guard',
    ]);
  });

  it('converges to the same ACL as every other path', () => {
    expect(after.publicExec).toBe(false);
    expect(after.appExec).toBe(true);
    expect(after.grantees).toEqual(['freightos_app', 'freightos_audit_writer']);
    expect(after.forbidden).toEqual([]);
  });

  it('refuses to converge a grant nobody reviewed', async () => {
    // The §1 guard, exercised. A grantee outside the three known pre-states must STOP the
    // migration rather than be normalised away — otherwise 0031 would quietly launder an
    // out-of-band grant into a clean ACL and report success.
    const client = connect(SUPERUSER_DB, 'postgres');
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query(`GRANT EXECUTE ON FUNCTION ${FN} TO freightos_event_writer`);
      await client.query(`DELETE FROM schema_migrations WHERE version = ${HOTFIX}`);
      await expect(migrateUp(client, migrations)).rejects.toThrow(
        /unexplained explicit grant: freightos_event_writer/,
      );
    } finally {
      // The migration's own transaction rolled back; this undoes the setup around it.
      await client.query('ROLLBACK').catch(() => undefined);
      await client.end();
    }

    // And the database is untouched by the refusal.
    const check = connect(SUPERUSER_DB, 'postgres');
    await check.connect();
    try {
      expect(await aclFacts(check)).toEqual(after);
    } finally {
      await check.end();
    }
  }, 300_000);
});
