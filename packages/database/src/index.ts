export {
  appliedMigrations,
  ensureMigrationTable,
  loadMigrations,
  migrateDown,
  migrateUp,
  verifyChecksums,
  type AppliedMigration,
  type Migration,
  type RunResult,
} from './migrator.ts';

export {
  HORIZON_1_VALIDATION,
  applyLegalContext,
  currentContext,
  withLegalContext,
  type Queryable,
} from './session.ts';

export { MIGRATIONS_DIR } from './paths.ts';

/**
 * SR-2 verified sessions.
 *
 * `withVerifiedTransaction` is the supported way for production code to obtain runtime authority.
 * The legacy `applyLegalContext` / `withLegalContext` above remain exported because the bootstrap,
 * migration and control-plane paths still use them — but after migration 0019 the GUCs they write
 * are not authoritative for `freightos_app` sessions, and no verified session goes through them.
 */
export {
  VerifiedSessionError,
  backendPid,
  controlPlaneIssuer,
  withVerifiedPoolTransaction,
  withVerifiedTransaction,
  type BindingIssuer,
  type VerifiedSessionFailure,
} from './verified-session.ts';
