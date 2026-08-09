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
 * Roles the migrator administers without inheriting, split by whether it also needs SET ROLE.
 *
 * Neither list is inherited — that is the property that keeps a deployment session from picking up
 * privileges it did not ask for. The second list additionally carries SET, because
 * `ALTER ... OWNER TO` requires the assigning role to be able to become the target, and the
 * migrations hand objects to NOLOGIN definer owners. "Administer", "inherit" and "can become" are
 * three different powers — R2-05. Both lists mirror
 * `scripts/bootstrap-migration-authority.sql` §2.
 */
const ADMINISTERED_ROLES = ['freightos_app', 'freightos_control_plane'] as const;
const OWNERSHIP_TARGET_ROLES = ['freightos_admin_owner', 'freightos_admin'] as const;

/** One `pg_auth_members` row: a single grant of a role to the migrator, by one grantor. */
interface Membership {
  admin_option: boolean;
  inherit_option: boolean;
  set_option: boolean;
  grantor: string;
}

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
    // Convergence is judged on the memberships TAKEN TOGETHER, never on any single catalog row.
    // PostgreSQL 16 splits them in two: creating a role as a CREATEROLE user leaves an implicit
    // `ADMIN TRUE, INHERIT FALSE, SET FALSE` membership whose grantor is the bootstrap superuser,
    // and migration 0013 then takes its own `SET TRUE, INHERIT FALSE` on top so that
    // `ALTER FUNCTION ... OWNER TO` can run. Neither row carries the whole profile; their union is
    // exactly the wanted one. Demanding that one row carry all three revoked the implicit grant
    // that the second row had been made under, and PostgreSQL rightly rejected it with "dependent
    // privileges exist" — the dependency was real, the revoke was not warranted.
    //
    // So a membership is revoked only when it confers something forbidden, and then by its own
    // grantor: INHERIT on any of these roles, or SET on a role the migrator must be able to
    // administer without needing to become. Inheriting freightos_admin_owner makes the migrator a
    // member of freightos_control_plane, which makes app.is_control_plane() true for the
    // deployment connection — migration 0013 refuses to run in that state, and this is what keeps
    // a cluster from drifting into it between runs.
    //
    // What survives must then still supply ADMIN OPTION, and SET where the role is an ownership
    // target. One corrective GRANT adds whatever is missing; re-granting from the same grantor
    // updates that row in place rather than adding a second one.
    //
    // The effective form of this invariant is asserted by `migration authority` in
    // identity-migrations.test.ts, which reads pg_has_role rather than pg_auth_members: USAGE
    // false, SET true, app.is_control_plane() false.
    for (const [roles, setWanted] of [
      [ADMINISTERED_ROLES, false],
      [OWNERSHIP_TARGET_ROLES, true],
    ] as const) {
      for (const role of roles) {
        const present = await maintenance.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [
          role,
        ]);
        if (present.rowCount === 0) continue;

        const held = await maintenance.query<Membership>(
          `SELECT am.admin_option, am.inherit_option, am.set_option, g.rolname AS grantor
             FROM pg_auth_members am
             JOIN pg_roles r ON r.oid = am.roleid
             JOIN pg_roles m ON m.oid = am.member
             JOIN pg_roles g ON g.oid = am.grantor
            WHERE r.rolname = $1 AND m.rolname = $2`,
          [role, MIGRATOR],
        );
        const forbidden = (m: Membership) => m.inherit_option || (m.set_option && !setWanted);

        for (const membership of held.rows.filter(forbidden)) {
          await maintenance.query(
            `REVOKE ${role} FROM ${MIGRATOR} GRANTED BY ${membership.grantor}`,
          );
        }
        const kept = held.rows.filter((m) => !forbidden(m));
        if (!kept.some((m) => m.admin_option) || (setWanted && !kept.some((m) => m.set_option))) {
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
    // freightos_admin joins the list because R2-01 routes every authorization mutation through the
    // admin boundary, so the fixture needs that connection too. Without a password here it works
    // under local trust auth and fails only under the password auth CI uses.
    for (const role of ['freightos_app', 'freightos_control_plane', 'freightos_admin']) {
      await client.query(
        NEEDS_PASSWORD
          ? `ALTER ROLE ${role} LOGIN PASSWORD '${ROLE_PASSWORD}'`
          : `ALTER ROLE ${role} LOGIN`,
      );
      await client.query(`GRANT CONNECT ON DATABASE ${this.name} TO ${role}`);
    }
  }

  /**
   * Provision a real PostgreSQL LOGIN role bound to a FreightOS human — Design A, SEC-01.
   *
   * NOT `SET ROLE` from freightos_admin. `SET ROLE` moves `current_user` and leaves `session_user`
   * untouched, so a harness built on it would authenticate nothing and would prove nothing: every
   * operator would still resolve to the shared credential. The whole point of Design A is that
   * `session_user` is set by PostgreSQL authentication and no statement can change it, so the test
   * has to log in for real.
   *
   * Role names are cluster-wide while databases are per file, so the name is derived from the
   * database to keep concurrent files from colliding on the same catalog row.
   *
   * Returns the role name. Provisioning runs under the cluster role lock and through
   * `authn.provision_operator` — the migrator cannot write the binding table directly, which is
   * the property §7(c) of migration 0026 asserts.
   */
  async provisionOperator(label: string, tenantId: string, userId: string): Promise<string> {
    const role = this.operatorRoleName(label);
    await this.withRoleLock(async (maintenance) => {
      await maintenance.query(
        `DO $$
         BEGIN
           IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
             CREATE ROLE ${role} LOGIN;
           END IF;
         END
         $$`,
      );
      if (NEEDS_PASSWORD) {
        await maintenance.query(`ALTER ROLE ${role} LOGIN PASSWORD '${ROLE_PASSWORD}'`);
      }
      await maintenance.query(`GRANT CONNECT ON DATABASE ${this.name} TO ${role}`);
      // The capability, not the identity: freightos_admin carries EXECUTE on the administrative
      // functions. INHERIT so an ordinary statement picks it up without SET ROLE, and no
      // ADMIN OPTION, so one operator cannot grant itself into another.
      await maintenance.query(`GRANT freightos_admin TO ${role} WITH INHERIT TRUE, SET FALSE`);
    });

    const migrator = this.connectAs(MIGRATOR);
    await migrator.connect();
    try {
      await migrator.query('SELECT authn.provision_operator($1, $2, $3, $4)', [
        role,
        tenantId,
        userId,
        'test:provision',
      ]);
    } finally {
      await migrator.end();
    }
    return role;
  }

  /**
   * Create a LOGIN role bound to a SERVICE identity — the provisioning path.
   *
   * Tenant bootstrap is performed by `system:tenant-provisioning`, an approved platform actor, and
   * always was: the first administrator of a tenant cannot authorise their own creation. After
   * 0026 that actor needs a login to be resolved FROM, rather than a string to be asserted AS.
   */
  async provisionSystemLogin(label: string, systemActorId: string): Promise<string> {
    const role = this.operatorRoleName(label);
    await this.withRoleLock(async (maintenance) => {
      await maintenance.query(
        `DO $$
         BEGIN
           IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
             CREATE ROLE ${role} LOGIN;
           END IF;
         END
         $$`,
      );
      if (NEEDS_PASSWORD) {
        await maintenance.query(`ALTER ROLE ${role} LOGIN PASSWORD '${ROLE_PASSWORD}'`);
      }
      await maintenance.query(`GRANT CONNECT ON DATABASE ${this.name} TO ${role}`);
      await maintenance.query(`GRANT freightos_admin TO ${role} WITH INHERIT TRUE, SET FALSE`);
    });
    await this.provisionServiceLogin(role, systemActorId);
    return role;
  }

  /** Bind an existing LOGIN role to a service identity rather than a human. */
  async provisionServiceLogin(role: string, systemActorId: string): Promise<void> {
    const migrator = this.connectAs(MIGRATOR);
    await migrator.connect();
    try {
      await migrator.query('SELECT authn.provision_service_login($1, $2, $3)', [
        role,
        systemActorId,
        'test:provision',
      ]);
    } finally {
      await migrator.end();
    }
  }

  /** Revoke every live binding for a role, leaving the PostgreSQL role itself alone. */
  async revokeOperator(role: string): Promise<number> {
    const migrator = this.connectAs(MIGRATOR);
    await migrator.connect();
    try {
      const r = await migrator.query<{ n: number }>('SELECT authn.revoke_operator($1, $2) AS n', [
        role,
        'test:revoke',
      ]);
      return Number(r.rows[0]!.n);
    } finally {
      await migrator.end();
    }
  }

  /**
   * Create a LOGIN role with the administrative capability and NO binding.
   *
   * The negative control the whole design turns on: authenticated, capable of calling the
   * functions, and mapped to nobody.
   */
  async provisionUnboundLogin(label: string): Promise<string> {
    const role = this.operatorRoleName(label);
    await this.withRoleLock(async (maintenance) => {
      await maintenance.query(
        `DO $$
         BEGIN
           IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
             CREATE ROLE ${role} LOGIN;
           END IF;
         END
         $$`,
      );
      if (NEEDS_PASSWORD) {
        await maintenance.query(`ALTER ROLE ${role} LOGIN PASSWORD '${ROLE_PASSWORD}'`);
      }
      await maintenance.query(`GRANT CONNECT ON DATABASE ${this.name} TO ${role}`);
      await maintenance.query(`GRANT freightos_admin TO ${role} WITH INHERIT TRUE, SET FALSE`);
    });
    return role;
  }

  /** Drop a PostgreSQL login role outright — for the role-replacement regression. */
  async dropLogin(role: string): Promise<void> {
    await this.withRoleLock(async (maintenance) => {
      await maintenance.query(`REVOKE ALL ON DATABASE ${this.name} FROM ${role}`);
      await maintenance.query(`DROP ROLE IF EXISTS ${role}`);
    });
  }

  /**
   * A stable, collision-free role name for this database.
   *
   * Database names run long, and PostgreSQL truncates identifiers at 63 bytes, so the name is
   * built from a short digest of the database rather than from the database name itself.
   */
  operatorRoleName(label: string): string {
    let h = 5381;
    for (const ch of this.name) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
    return `op_${h.toString(36)}_${label}`.slice(0, 63);
  }

  /** Connect as a provisioned operator — a real authenticated login. */
  connectAsOperator(role: string): Client {
    return this.connectAs(role);
  }

  /** Drop and recreate the database. Leaves it empty — no migration has run. */
  private async recreateDatabase(): Promise<void> {
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
  }

  /** Drop and recreate the database, migrate it, and make the test roles connectable. */
  async reset(): Promise<void> {
    await this.recreateDatabase();

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
   * Drop and recreate the database and provision the migration authority, applying NO migration.
   *
   * `reset()` always lands on the tip, which is the wrong starting point for anything that has to
   * drive the migration sequence itself. The path-parity gate needs to reach one logical version
   * two different ways — straight forward from empty, and by overshooting and rolling back — and
   * neither is expressible once the tip has already been applied.
   *
   * `grantRoles` is deliberately not called: `freightos_app` and friends are created by migration
   * 0001, so there is nothing to grant CONNECT to yet. A caller that migrates far enough to want
   * those logins calls `grantTestRoleLogin()` afterwards.
   */
  async resetToEmpty(): Promise<void> {
    await this.recreateDatabase();
    await this.withRoleLock((m) => this.bootstrapMigrator(m));
  }

  /**
   * Re-run the migration-authority convergence on its own, touching no database.
   *
   * Exposed for the idempotence regression in identity-migrations.test.ts. Convergence has to be
   * safe against a cluster that has ALREADY been migrated — the state every test file after the
   * first one meets, and the state a re-run of `scripts/bootstrap-migration-authority.sql` meets
   * on a deployed cluster. It takes the role lock, so it serialises against any concurrent
   * `reset()`, and on a healthy cluster it revokes nothing.
   */
  async convergeMigrationAuthority(): Promise<void> {
    await this.withRoleLock((m) => this.bootstrapMigrator(m));
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
