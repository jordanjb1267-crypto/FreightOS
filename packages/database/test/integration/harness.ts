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

  /** Drop and recreate the database, migrate it, and make the test roles connectable. */
  async reset(): Promise<void> {
    const maintenance = new Client({
      host: SOCKET_DIR,
      port: PORT,
      user: 'postgres',
      database: 'postgres',
      ...(NEEDS_PASSWORD ? { password: SUPERUSER_PASSWORD } : {}),
    });
    await maintenance.connect();
    try {
      await maintenance.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
         WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [this.name],
      );
      // DROP/CREATE DATABASE cannot run inside a transaction, so these come first.
      await maintenance.query(`DROP DATABASE IF EXISTS ${this.name}`);
      await maintenance.query(`CREATE DATABASE ${this.name}`);

      // Roles are cluster-wide catalog rows shared by every test database. Two files racing on
      // them — migration 0001's CREATE ROLE, or the ALTER ROLE below — produce "tuple
      // concurrently updated".
      //
      // The lock is taken on the shared `postgres` database, not on the per-file one:
      // PostgreSQL advisory lock tags include the database OID, so a lock taken inside each
      // file's own database would never conflict and would serialise nothing. It is
      // session-scoped rather than transaction-scoped because it has to span the migration run,
      // which happens on a different connection.
      await maintenance.query('SELECT pg_advisory_lock($1)', [ROLE_SETUP_LOCK]);
      try {
        const admin = this.connectAs('postgres');
        await admin.connect();
        try {
          await migrateUp(admin, loadMigrations(MIGRATIONS_DIR));
        } finally {
          await admin.end();
        }

        // The migrations create these roles without LOGIN; production grants credentials out of
        // band. The local test cluster uses trust auth over a unix socket, CI uses a password.
        for (const role of ['freightos_app', 'freightos_control_plane']) {
          await maintenance.query(
            NEEDS_PASSWORD
              ? `ALTER ROLE ${role} LOGIN PASSWORD '${ROLE_PASSWORD}'`
              : `ALTER ROLE ${role} LOGIN`,
          );
          await maintenance.query(`GRANT CONNECT ON DATABASE ${this.name} TO ${role}`);
        }
      } finally {
        await maintenance.query('SELECT pg_advisory_unlock($1)', [ROLE_SETUP_LOCK]);
      }
    } finally {
      await maintenance.end();
    }
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
