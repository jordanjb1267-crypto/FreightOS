import { Client } from 'pg';
import { loadMigrations, migrateUp } from '../../src/migrator.ts';
import { MIGRATIONS_DIR } from '../../src/paths.ts';

/**
 * Connection settings for the local test cluster.
 *
 * RLS is only meaningful for a non-superuser: PostgreSQL superusers bypass row-level security
 * unconditionally, so a test that connects as `postgres` and "passes" proves nothing. Every
 * isolation assertion runs as `freightos_app`.
 *
 * Each test file owns its own database. Sharing one and resetting per file made files interfere
 * whenever the runner overlapped them, and a shared mutable database is a poor way to prove
 * isolation properties anyway.
 */
/**
 * `host` is a unix socket directory locally (trust auth, nothing on the network) and a hostname
 * in CI (TCP, password auth). node-postgres accepts either in the same field; the password is
 * simply absent locally.
 */
const SOCKET_DIR = process.env['FREIGHTOS_PGSOCK'] ?? '/var/tmp/freightos-pg/sock';
const PORT = Number(process.env['FREIGHTOS_PGPORT'] ?? 55432);
const SUPERUSER_PASSWORD = process.env['PGPASSWORD'];
/** Development-only. Real deployments issue credentials out of band; nothing here is a secret. */
const ROLE_PASSWORD = process.env['FREIGHTOS_TEST_ROLE_PASSWORD'] ?? 'devonly';
const NEEDS_PASSWORD = SUPERUSER_PASSWORD !== undefined;
/** Arbitrary fixed key; only this harness takes it. */
const ROLE_SETUP_LOCK = 8_140_267;

/**
 * The deployment authority — F-04.
 *
 * Migrations used to run here as `postgres`. A superuser bypasses row-level security outright, so
 * every migration that wrote through a FORCE-RLS table succeeded for a reason production would not
 * have. Four did, and all four were broken under the role the runbooks actually name: the 0005
 * `updated_by` backfill (a silent no-op, which surfaced as "contains null values" only when a
 * populated database was reverted and reapplied), the 0008 permissions seed, the 0013 admin schema,
 * and the 0016 kill-switch seed and its revert. Superuser success is not migration evidence.
 *
 * `bootstrapMigrator` is the harness counterpart of `scripts/bootstrap-migration-authority.sql`:
 * the same role attributes, the same administer-but-do-not-become grants, the same database
 * ownership. The script is the production path and cannot be executed here because it is a psql
 * program — it carries `\set` and `\if` meta-commands node-postgres does not speak — so the two
 * are kept honest by `migration authority` in identity-migrations.test.ts, which asserts the
 * attribute profile both must produce.
 */
const MIGRATOR = 'freightos_migrator';

/**
 * Runtime roles the migrator may administer but must never become, and administrative roles it
 * must additionally be able to SET ROLE to because `ALTER ... OWNER TO` requires it. Both lists
 * mirror `scripts/bootstrap-migration-authority.sql` §2.
 */
const ADMINISTERED_ROLES = ['freightos_app', 'freightos_control_plane'] as const;
const OWNERSHIP_TARGET_ROLES = ['freightos_admin_owner', 'freightos_admin'] as const;

export const TENANT_A = '11111111-1111-4111-8111-111111111111';
export const TENANT_B = '22222222-2222-4222-8222-222222222222';
export const LEGAL_ENTITY = '33333333-3333-4333-8333-333333333333';

export class TestDatabase {
  constructor(readonly name: string) {}

  connectAs(user: string): Client {
    const password = user === 'postgres' ? SUPERUSER_PASSWORD : ROLE_PASSWORD;
    return new Client({
      host: SOCKET_DIR,
      port: PORT,
      user,
      database: this.name,
      ...(NEEDS_PASSWORD ? { password } : {}),
    });
  }

  private maintenanceClient(): Client {
    return new Client({
      host: SOCKET_DIR,
      port: PORT,
      user: 'postgres',
      database: 'postgres',
      ...(NEEDS_PASSWORD ? { password: SUPERUSER_PASSWORD } : {}),
    });
  }

  /**
   * Run `work` while holding the cluster-wide role lock.
   *
   * Roles are shared catalog rows, so two test files touching them concurrently — via migration
   * 0001's CREATE ROLE or an ALTER ROLE — produce "tuple concurrently updated".
   *
   * The lock is taken on the shared `postgres` database, never on a per-file one: PostgreSQL
   * advisory lock tags include the database OID, so a lock taken inside each file's own database
   * would never conflict and would serialise nothing. It is session-scoped rather than
   * transaction-scoped because it has to span work on other connections.
   */
  private async withRoleLock<T>(work: (maintenance: Client) => Promise<T>): Promise<T> {
    const maintenance = this.maintenanceClient();
    await maintenance.connect();
    try {
      await maintenance.query('SELECT pg_advisory_lock($1)', [ROLE_SETUP_LOCK]);
      try {
        return await work(maintenance);
      } finally {
        await maintenance.query('SELECT pg_advisory_unlock($1)', [ROLE_SETUP_LOCK]);
      }
    } finally {
      await maintenance.end();
    }
  }

  /**
   * Provision the migration authority, then hand it the database.
   *
   * Runs on the maintenance (superuser) connection, which is the one legitimate use of superuser
   * in the whole lifecycle and matches the production bootstrap: a DBA runs the script once,
   * before the first migration, and nothing afterwards needs superuser again.
   *
   * Must be called under the role lock — it mutates shared catalog rows.
   */
  private async bootstrapMigrator(maintenance: Client): Promise<void> {
    const attributes = 'LOGIN CREATEROLE NOSUPERUSER NOBYPASSRLS NOCREATEDB';
    const exists = await maintenance.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [MIGRATOR]);
    await maintenance.query(
      exists.rowCount === 0
        ? `CREATE ROLE ${MIGRATOR} ${attributes}`
        : `ALTER ROLE ${MIGRATOR} ${attributes}`,
    );
    if (NEEDS_PASSWORD) {
      await maintenance.query(`ALTER ROLE ${MIGRATOR} PASSWORD '${ROLE_PASSWORD}'`);
    }

    // Roles are cluster-wide and outlive any one test database, so by the second test file these
    // already exist and were created by someone else. That is the same situation a cluster
    // carrying the Phase 0 baseline is in, and the reason the production script has this loop.
    //
    // A membership that is already there is CONVERGED, not re-granted. A GRANT never narrows an
    // existing membership, so `GRANT ... WITH INHERIT FALSE` issued over an INHERIT TRUE grant
    // leaves the inheriting one in place — and inheriting freightos_admin_owner makes the migrator
    // a member of freightos_control_plane, which makes app.is_control_plane() true for the
    // deployment connection. Migration 0013 refuses to run in that state; this is what keeps a
    // cluster from drifting into it between runs.
    //
    // Only wrong memberships are revoked, and each by its own grantor. A blanket revoke would take
    // down correct grants the migrator has since used to grant onward, which PostgreSQL rejects
    // with "dependent privileges exist".
    for (const [roles, setWanted] of [
      [ADMINISTERED_ROLES, false],
      [OWNERSHIP_TARGET_ROLES, true],
    ] as const) {
      for (const role of roles) {
        const present = await maintenance.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [
          role,
        ]);
        if (present.rowCount === 0) continue;

        const held = await maintenance.query<{
          admin_option: boolean;
          inherit_option: boolean;
          set_option: boolean;
          grantor: string;
        }>(
          `SELECT am.admin_option, am.inherit_option, am.set_option, g.rolname AS grantor
             FROM pg_auth_members am
             JOIN pg_roles r ON r.oid = am.roleid
             JOIN pg_roles m ON m.oid = am.member
             JOIN pg_roles g ON g.oid = am.grantor
            WHERE r.rolname = $1 AND m.rolname = $2`,
          [role, MIGRATOR],
        );
        const wanted = (m: {
          admin_option: boolean;
          inherit_option: boolean;
          set_option: boolean;
        }) => m.admin_option && !m.inherit_option && m.set_option === setWanted;

        for (const membership of held.rows.filter((m) => !wanted(m))) {
          await maintenance.query(
            `REVOKE ${role} FROM ${MIGRATOR} GRANTED BY ${membership.grantor}`,
          );
        }
        if (!held.rows.some(wanted)) {
          await maintenance.query(
            `GRANT ${role} TO ${MIGRATOR}
               WITH ADMIN OPTION, INHERIT FALSE, SET ${setWanted ? 'TRUE' : 'FALSE'}`,
          );
        }
      }
    }

    // Only an object's owner may ENABLE/FORCE row-level security on it or attach a policy, and in
    // PostgreSQL 15 onward the database owner is what carries ownership of schema public.
    await maintenance.query(`ALTER DATABASE ${this.name} OWNER TO ${MIGRATOR}`);
  }

  private async grantRoles(client: Client): Promise<void> {
    for (const role of ['freightos_app', 'freightos_control_plane']) {
      await client.query(
        NEEDS_PASSWORD
          ? `ALTER ROLE ${role} LOGIN PASSWORD '${ROLE_PASSWORD}'`
          : `ALTER ROLE ${role} LOGIN`,
      );
      await client.query(`GRANT CONNECT ON DATABASE ${this.name} TO ${role}`);
    }
  }

  /** Drop and recreate the database, migrate it, and make the test roles connectable. */
  async reset(): Promise<void> {
    const maintenance = this.maintenanceClient();
    await maintenance.connect();
    try {
      await maintenance.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
         WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [this.name],
      );
      // DROP/CREATE DATABASE cannot run inside a transaction, and must not hold the role lock.
      await maintenance.query(`DROP DATABASE IF EXISTS ${this.name}`);
      await maintenance.query(`CREATE DATABASE ${this.name}`);
    } finally {
      await maintenance.end();
    }

    await this.withRoleLock(async (m) => {
      await this.bootstrapMigrator(m);

      const migrator = this.connectAs(MIGRATOR);
      await migrator.connect();
      try {
        await migrateUp(migrator, loadMigrations(MIGRATIONS_DIR));
      } finally {
        await migrator.end();
      }
      await this.grantRoles(m);
    });
  }

  /**
   * A connection as the migration authority — the role the runbooks name, not a superuser.
   *
   * Every lifecycle assertion (apply, revert, reapply, checksum, baseline) must go through this.
   * A test that drives migrations as `postgres` proves the SQL parses, not that it can run.
   */
  connectAsMigrator(): Client {
    return this.connectAs(MIGRATOR);
  }

  /**
   * Re-grant login to the test roles. Needed after a test reverts migration 0001, which drops the
   * grants along with the schema.
   *
   * Always go through here rather than issuing ALTER ROLE directly, for two reasons. A hand-rolled
   * `ALTER ROLE ... LOGIN` omits the password — harmless under trust auth, and it silently strips
   * the credential under the password auth CI uses, so it passes locally and fails only in CI. And
   * it would run outside the cluster-wide role lock, racing other test files.
   */
  async grantTestRoleLogin(): Promise<void> {
    await this.withRoleLock((m) => this.grantRoles(m));
  }

  /** Seed two tenants via the control plane, the only role permitted to create them. */
  async seedTenants(): Promise<void> {
    const client = this.connectAs('freightos_control_plane');
    await client.connect();
    try {
      for (const [id, name] of [
        [TENANT_A, 'Tenant A'],
        [TENANT_B, 'Tenant B'],
      ] as const) {
        await client.query(
          'INSERT INTO tenants (id, tenant_id, name, created_by) VALUES ($1, $1, $2, $3)',
          [id, name, 'test:seed'],
        );
      }
    } finally {
      await client.end();
    }
  }
}

export function carrierContext(tenantId: string) {
  return {
    tenantId,
    legalAuthorityClass: 'carrier_agent' as const,
    operatingContext: 'carrier' as const,
    actorId: 'test:actor',
    legalEntityId: LEGAL_ENTITY,
    carrierId: 'carrier-1',
    carrierAppointmentId: 'appointment-1',
  };
}
