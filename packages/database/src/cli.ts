#!/usr/bin/env node
/**
 * Migration CLI — `pnpm db:up`, `pnpm db:down`, `pnpm db:status`.
 *
 * Connects as the migrator role (`DATABASE_MIGRATOR_URL`), never as the application role. The
 * application connection is RLS-subject by design and has no business owning schema.
 */

import { Client } from 'pg';
import {
  appliedMigrations,
  ensureMigrationTable,
  loadMigrations,
  migrateDown,
  migrateUp,
  verifyChecksums,
} from './migrator.ts';
import { MIGRATIONS_DIR } from './paths.ts';

const command = process.argv[2] ?? 'status';
const connectionString = process.env['DATABASE_MIGRATOR_URL'];

if (!connectionString) {
  console.error('DATABASE_MIGRATOR_URL is not set. Copy .env.example to .env first.');
  process.exit(2);
}

const migrations = loadMigrations(MIGRATIONS_DIR);
const client = new Client({ connectionString });
await client.connect();

try {
  switch (command) {
    case 'up': {
      const result = await migrateUp(client, migrations);
      if (result.applied.length === 0) console.log('already up to date');
      else console.log(`applied: ${result.applied.join(', ')}`);
      break;
    }

    case 'down': {
      // Default to one step. Unwinding everything must be deliberate, not a typo.
      const target = process.argv[3] === 'all' ? 0 : Math.max(0, migrations.length - 1);
      const result = await migrateDown(client, migrations, target);
      if (result.reverted.length === 0) console.log('nothing to revert');
      else console.log(`reverted: ${result.reverted.join(', ')}`);
      break;
    }

    case 'status': {
      await ensureMigrationTable(client);
      const applied = new Set((await appliedMigrations(client)).map((m) => m.version));
      const problems = await verifyChecksums(client, migrations);

      for (const migration of migrations) {
        const mark = applied.has(migration.version) ? 'applied' : 'pending';
        console.log(`  ${String(migration.version).padStart(4, '0')} ${migration.name} — ${mark}`);
      }

      if (problems.length > 0) {
        console.error('\nchecksum problems:');
        for (const problem of problems) console.error(`  - ${problem}`);
        process.exit(1);
      }
      break;
    }

    default:
      console.error(`unknown command "${command}". Use up, down [all], or status.`);
      process.exit(2);
  }
} finally {
  await client.end();
}
