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
      const admin = this.connectAs('postgres');
      await admin.connect();
      try {
        await migrateUp(admin, loadMigrations(MIGRATIONS_DIR));
      } finally {
        await admin.end();
      }
      await this.grantRoles(m);
    });
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
