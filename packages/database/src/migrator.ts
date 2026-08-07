/**
 * SQL-first migration runner — ADR-0017.
 *
 * Deliberately small. It does four things the handoff reference DDL cannot do: it records what
 * has been applied, it verifies that applied migrations have not been edited, it runs each
 * migration in its own transaction, and it can go back down.
 *
 * `-- freightos:no-transaction` on the first line opts a migration out of the wrapping
 * transaction. That exists because PostgreSQL cannot use a value added by `ALTER TYPE ... ADD
 * VALUE` in the same transaction that adds it — the exact hazard sitting in the handoff's
 * db/0005, undocumented.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Client } from 'pg';

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly upPath: string;
  readonly downPath: string;
  readonly upSql: string;
  readonly downSql: string;
  readonly checksum: string;
  readonly transactional: boolean;
}

const FILE_RE = /^(\d{4})_([a-z0-9_]+)\.up\.sql$/;
const NO_TRANSACTION = '-- freightos:no-transaction';

export function loadMigrations(directory: string): readonly Migration[] {
  const migrations: Migration[] = [];

  for (const entry of readdirSync(directory).sort()) {
    const match = FILE_RE.exec(entry);
    if (!match) continue;

    const [, versionText, name] = match;
    const upPath = join(directory, entry);
    const downPath = join(directory, `${versionText}_${name}.down.sql`);

    let downSql: string;
    try {
      downSql = readFileSync(downPath, 'utf8');
    } catch {
      // Constitution Art. VIII.2 requires rollback on every release. A migration without a down
      // path is a migration that cannot be rolled back, so it is rejected at load time rather
      // than discovered during an incident.
      throw new Error(`migration ${entry} has no matching down migration at ${downPath}`);
    }

    const upSql = readFileSync(upPath, 'utf8');

    migrations.push({
      version: Number(versionText),
      name: name!,
      upPath,
      downPath,
      upSql,
      downSql,
      checksum: createHash('sha256').update(upSql).digest('hex'),
      transactional: !upSql.startsWith(NO_TRANSACTION),
    });
  }

  for (let i = 0; i < migrations.length; i += 1) {
    if (migrations[i]!.version !== i + 1) {
      throw new Error(
        `migration versions must be contiguous from 0001; found ${migrations[i]!.version} at position ${i + 1}`,
      );
    }
  }

  return migrations;
}

export async function ensureMigrationTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     integer PRIMARY KEY,
      name        text NOT NULL,
      checksum    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export interface AppliedMigration {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
}

export async function appliedMigrations(client: Client): Promise<readonly AppliedMigration[]> {
  const result = await client.query<AppliedMigration>(
    'SELECT version, name, checksum FROM schema_migrations ORDER BY version',
  );
  return result.rows;
}

/**
 * An applied migration whose file has since changed means the database and the repository
 * disagree about what the schema is. Failing loudly here is the whole point of the checksum.
 */
export async function verifyChecksums(
  client: Client,
  migrations: readonly Migration[],
): Promise<readonly string[]> {
  const problems: string[] = [];
  const applied = await appliedMigrations(client);

  for (const record of applied) {
    const migration = migrations.find((m) => m.version === record.version);
    if (!migration) {
      problems.push(`applied migration ${record.version}_${record.name} is missing from disk`);
      continue;
    }
    if (migration.checksum !== record.checksum) {
      problems.push(
        `migration ${record.version}_${record.name} was edited after being applied ` +
          `(recorded ${record.checksum.slice(0, 12)}, on disk ${migration.checksum.slice(0, 12)})`,
      );
    }
  }

  return problems;
}

export interface RunResult {
  readonly applied: readonly number[];
  readonly reverted: readonly number[];
}

export async function migrateUp(
  client: Client,
  migrations: readonly Migration[],
): Promise<RunResult> {
  await ensureMigrationTable(client);

  const problems = await verifyChecksums(client, migrations);
  if (problems.length > 0) {
    throw new Error(`migration checksum verification failed:\n  ${problems.join('\n  ')}`);
  }

  const applied = new Set((await appliedMigrations(client)).map((m) => m.version));
  const runNow: number[] = [];

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;

    if (migration.transactional) await client.query('BEGIN');
    try {
      await client.query(migration.upSql);
      await client.query(
        'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
        [migration.version, migration.name, migration.checksum],
      );
      if (migration.transactional) await client.query('COMMIT');
    } catch (error) {
      if (migration.transactional) await client.query('ROLLBACK');
      throw new Error(
        `migration ${migration.version}_${migration.name} failed: ${(error as Error).message}`,
      );
    }
    runNow.push(migration.version);
  }

  return { applied: runNow, reverted: [] };
}

/**
 * The version a single-step revert should stop at: one below the highest APPLIED migration.
 *
 * Relative to what is applied, never to how many files are on disk. Deriving it from the file
 * count made the second consecutive single-step revert a no-op — the target came out as the
 * version that had just been reverted to — so the runbook's documented way of unwinding a
 * deployment one migration at a time stopped after one step and reported "nothing to revert".
 */
export async function oneStepDownTarget(client: Client): Promise<number> {
  await ensureMigrationTable(client);
  const applied = await appliedMigrations(client);
  if (applied.length === 0) return 0;
  return Math.max(0, Math.max(...applied.map((m) => m.version)) - 1);
}

/** Revert in reverse order. `toVersion` is the version to stop AT (0 unwinds everything). */
export async function migrateDown(
  client: Client,
  migrations: readonly Migration[],
  toVersion = 0,
): Promise<RunResult> {
  await ensureMigrationTable(client);

  const applied = [...(await appliedMigrations(client))].sort((a, b) => b.version - a.version);
  const reverted: number[] = [];

  for (const record of applied) {
    if (record.version <= toVersion) break;

    const migration = migrations.find((m) => m.version === record.version);
    if (!migration) {
      throw new Error(
        `cannot revert version ${record.version}: its migration file is missing from disk`,
      );
    }

    if (migration.transactional) await client.query('BEGIN');
    try {
      await client.query(migration.downSql);
      await client.query('DELETE FROM schema_migrations WHERE version = $1', [migration.version]);
      if (migration.transactional) await client.query('COMMIT');
    } catch (error) {
      if (migration.transactional) await client.query('ROLLBACK');
      throw new Error(
        `down migration ${migration.version}_${migration.name} failed: ${(error as Error).message}`,
      );
    }
    reverted.push(migration.version);
  }

  return { applied: [], reverted };
}
