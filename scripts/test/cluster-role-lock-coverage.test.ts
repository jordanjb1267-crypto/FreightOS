import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The answer to "what stops the SIXTH migration-driving test file from recreating the race?".
 *
 * PostgreSQL ROLES and `pg_auth_members` are cluster-wide, not per-database, so the per-file
 * database every integration test gets provides no isolation whatsoever for the state migrations
 * mutate: 0001, 0007, 0010, 0013, 0018, 0020 and 0026 all CREATE ROLE, and their down paths DROP
 * it again. Measured against pg_stat_activity, two migrator backends were ACTIVE in different
 * databases in 27 of 131 samples of a full run. `fileParallelism: false` narrows that window; it
 * does not close it, because the overlap happens AT file boundaries, and the race was observed
 * with it already set. The advisory lock is the isolation boundary — not the runner setting.
 *
 * Five files currently drive `migrateUp`/`migrateDown` themselves and therefore take the lock for
 * their whole duration. Nothing but this test stops a sixth from being written without it, and a
 * sixth without it reintroduces the defect silently: it would pass locally, pass in CI most of the
 * time, and fail as an unattributable "permission denied to set role" somewhere else entirely.
 * A comment saying "take the lock" is not a control; a failing test is.
 *
 * The rule is DERIVED, not listed. The driver set is read out of the sources on every run, so a
 * new driver is covered the moment it exists — enumerating the five by hand here is the same
 * construction that produced PR #9 finding B-1 and is deliberately avoided.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Comments only — string literals are deliberately left alone.
 *
 * Stripping strings too would need a full tokeniser to survive the SQL template literals these
 * files are mostly made of, and the failure mode it guards against (a call spelled inside a
 * string) is not reachable code anyway. Comments DO have to go: every one of the five drivers
 * carries a header comment naming `migrateUp`/`migrateDown`, so a comment-blind matcher would
 * classify correctly today and for the wrong reason.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/** Imported under any alias, or called outright. Either one makes the file a driver. */
function drivesMigrations(code: string): boolean {
  const imported =
    /import[\s\S]*?\{[\s\S]*?\bmigrate(?:Up|Down)\b[\s\S]*?\}[\s\S]*?from\s*['"][^'"]*migrator[^'"]*['"]/.test(
      code,
    );
  return imported || /\bmigrate(?:Up|Down)\s*\(/.test(code);
}

/**
 * Raw cluster-role DDL issued by a test file directly, rather than through the harness.
 *
 * Driving migrations is not the only way to mutate cluster-global role state, and the audit that
 * added this file found a file doing exactly that: `control-plane.test.ts` issued
 * `ALTER ROLE freightos_admin LOGIN` on a superuser connection outside the lock. Detecting only
 * `migrateUp`/`migrateDown` would have kept missing it, and would miss the next one.
 *
 * The three shapes below are cluster-wide. Per-DATABASE privilege statements are deliberately NOT:
 * `GRANT CONNECT ON DATABASE`, `REVOKE TEMPORARY ON DATABASE` and `GRANT SELECT ON <table>` all
 * write a per-database ACL on a per-file database and race nothing. The `ON` keyword is what
 * separates them — a role-membership grant names a role and then `TO`, with no `ON` in between —
 * so the patterns require that adjacency rather than matching GRANT/REVOKE at large.
 *
 * CASE-SENSITIVE, and that is load-bearing rather than an oversight. Matched case-insensitively,
 * `GRANT \w+ TO \w+` also matches ordinary English: the test name "still lets an administrator
 * grant authority to somebody else" flagged identity-lifecycle.test.ts, which issues no role DDL at
 * all. String literals cannot be stripped to avoid that, because every real statement here lives in
 * one. SQL keywords are uppercase throughout this repository, prose is not, and a rule that fires on
 * prose is a rule that gets deleted rather than fixed — R2-03.
 */
function mutatesClusterRoles(code: string): boolean {
  return (
    /\b(?:CREATE|DROP|ALTER) ROLE\b/.test(code) ||
    /\bGRANT\s+[\w$\\{}]+\s+TO\s+[\w$\\{}]+/.test(code) ||
    /\bREVOKE\s+(?:(?:SET|ADMIN|INHERIT) OPTION FOR\s+)?[\w$\\{}]+\s+FROM\s+[\w$\\{}]+/.test(code)
  );
}

function takesClusterRoleLock(code: string): boolean {
  return /\bacquireClusterRoleLock\s*\(/.test(code);
}

function integrationTestFiles(): string[] {
  const packagesDir = join(ROOT, 'packages');
  const found: string[] = [];
  for (const pkg of readdirSync(packagesDir)) {
    const dir = join(packagesDir, pkg, 'test', 'integration');
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const entry of readdirSync(dir)) {
      if (entry.endsWith('.test.ts')) found.push(join(dir, entry));
    }
  }
  return found.sort();
}

interface Classified {
  path: string;
  drives: boolean;
  mutates: boolean;
  locked: boolean;
}

function classify(): Classified[] {
  return integrationTestFiles().map((path) => {
    const code = stripComments(readFileSync(path, 'utf8'));
    return {
      path: relative(ROOT, path),
      drives: drivesMigrations(code),
      mutates: mutatesClusterRoles(code),
      locked: takesClusterRoleLock(code),
    };
  });
}

describe('every migration-driving integration file serialises cluster role mutation', () => {
  it('classifies a driver that omits the lock as unprotected — the detector works', () => {
    // A POSITIVE CONTROL ON THE DETECTOR ITSELF, independent of what the repository contains.
    // Without it, a stripper bug that blanked every file would leave the real assertion below
    // passing over an empty set and reporting "0 unprotected" for the worst possible reason.
    const unlocked = stripComments(`
      import { migrateUp } from '../../src/migrator.ts';
      it('x', async () => { await migrateUp(client, migrations); });
    `);
    expect(drivesMigrations(unlocked), 'driver not detected').toBe(true);
    expect(takesClusterRoleLock(unlocked), 'lock falsely detected').toBe(false);

    // And the same source WITH the hook is not flagged.
    const locked = stripComments(`
      import { migrateUp } from '../../src/migrator.ts';
      beforeAll(async () => { await acquireClusterRoleLock(); });
      it('x', async () => { await migrateUp(client, migrations); });
    `);
    expect(takesClusterRoleLock(locked), 'lock not detected').toBe(true);

    // A comment naming the functions must NOT make a file a driver — the five real drivers all
    // carry exactly such a comment, so this is the difference between the rule holding and the
    // rule appearing to hold.
    expect(
      drivesMigrations(stripComments('// this file drives migrateUp(x) and migrateDown(y)\n')),
      'comment classified as a call site',
    ).toBe(false);
  });

  it('leaves no driver without the lock', () => {
    const files = classify();
    const drivers = files.filter((f) => f.drives);

    // Non-vacuity, both directions: there really are drivers to check, and the predicate is not
    // simply true of every file.
    expect(
      drivers.length,
      'no migration-driving integration files found at all',
    ).toBeGreaterThanOrEqual(5);
    expect(
      files.filter((f) => !f.drives).length,
      'every integration file classified as a driver — the predicate is too loose',
    ).toBeGreaterThan(0);

    expect(
      drivers.filter((f) => !f.locked).map((f) => f.path),
      'file drives migrateUp/migrateDown without acquireClusterRoleLock — cluster role state is ' +
        'cluster-wide, so this races every other migration-driving file',
    ).toEqual([]);
  });

  it('leaves no direct cluster-role mutator without the lock either', () => {
    // The second way in. `control-plane.test.ts` mutated pg_authid with a bare ALTER ROLE and drove
    // no migration at all, so the driver rule above would never have caught it; the file that
    // empties the role namespace to prove the fresh-install contract is the same shape.
    const files = classify();
    const mutators = files.filter((f) => f.mutates);

    // NO FLOOR ON `mutators.length`, deliberately, and this is the one place where "the set may be
    // empty" is the right rule rather than a vacuity hole. Zero direct mutators is the CORRECT
    // steady state — the harness owns every role mutation, and the audit that added this file
    // removed the last exception. Demanding at least one would mean demanding that somebody keep
    // bypassing the harness. What proves the detector still works is the synthetic control below,
    // which does not depend on the repository containing an offender.
    expect(
      files.filter((f) => !f.mutates).length,
      'every integration file classified as a mutator — the predicate is too loose',
    ).toBeGreaterThan(0);

    expect(
      mutators.filter((f) => !f.locked).map((f) => f.path),
      'file issues CREATE/DROP/ALTER ROLE or a role-membership GRANT/REVOKE without ' +
        'acquireClusterRoleLock — pg_authid and pg_auth_members are cluster-wide',
    ).toEqual([]);
  });

  it('does not mistake per-database privilege statements for cluster-role mutation', () => {
    // The control on the mutator predicate. These are the statements the integration files issue
    // constantly against their own per-file database; treating any of them as cluster-role mutation
    // would force the whole suite behind one lock and prove nothing.
    for (const benign of [
      'await c.query(`GRANT CONNECT ON DATABASE ${db.name} TO freightos_app`);',
      'await c.query(`REVOKE TEMPORARY ON DATABASE ${DB_NAME} FROM freightos_app`);',
      "await c.query('GRANT SELECT ON app.session_binding TO freightos_admin');",
      "await c.query('SET ROLE freightos_admin_owner');",
      // Prose, not SQL — the exact string that produced the first false positive.
      "it('still lets an administrator grant authority to somebody else', async () => {",
    ]) {
      expect(mutatesClusterRoles(benign), benign).toBe(false);
    }
    for (const real of [
      'await c.query(`CREATE ROLE ${role} LOGIN`);',
      "await c.query('ALTER ROLE freightos_admin LOGIN');",
      'await c.query(`GRANT freightos_admin TO ${role} WITH INHERIT TRUE, SET FALSE`);',
      'await c.query(`REVOKE SET OPTION FOR freightos_admin FROM freightos_migrator`);',
    ]) {
      expect(mutatesClusterRoles(real), real).toBe(true);
    }
  });
});

/**
 * The gate above proves every role mutator TAKES the lock. This one proves they all take the SAME
 * lock.
 *
 * They are different failures. A mutator and an observer that each faithfully call
 * `pg_advisory_lock` on different keys both look correct in review, both pass the coverage rule
 * above, and serialise against nothing — the observer reads a half-provisioned role set and fails
 * somewhere unrelated, intermittently. PostgreSQL advisory locks are a bare integer namespace with
 * no registry and no type, so nothing but a test can hold that namespace to one value.
 *
 * The key is restated here rather than imported. Importing it would make this gate agree with the
 * harness by construction and assert nothing; a change now has to be made in two places, which is
 * the point.
 */
const EXPECTED_ROLE_SETUP_LOCK = 8_140_267;
const LOCK_OWNER = 'packages/database/test/integration/harness.ts';

/**
 * This file scans itself out of the corpus, and that is not a convenience.
 *
 * The detector self-test below contains, as string literals, exactly the shapes the rules forbid:
 * a second `ROLE_SETUP_LOCK = 9_999_999`, an advisory call given `OTHER_LOCK`, a hard-coded key.
 * They have to be here — anti-vacuity is the reason this gate can be trusted at all — and scanning
 * them would make the gate report its own fixtures as violations, which is what happened on the
 * first run.
 *
 * It is not a hiding place. This file contains no database connection and executes no SQL; a real
 * advisory lock written here would take no lock. The exclusion is one exact path, asserted below.
 */
const SELF = 'scripts/test/cluster-role-lock-coverage.test.ts';

/** Every TypeScript source in the repository, excluding dependencies and build output. */
function repositorySources(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.ts') && relative(ROOT, full) !== SELF) found.push(full);
    }
  };
  for (const top of ['packages', 'scripts']) walk(join(ROOT, top));
  return found.sort();
}

/** Session-scoped advisory calls — the cluster-role mechanism. Comments stripped first. */
function sessionAdvisoryCallSites(): { path: string; call: string }[] {
  const sites: { path: string; call: string }[] = [];
  for (const path of repositorySources()) {
    const code = stripComments(readFileSync(path, 'utf8'));
    for (const match of code.matchAll(/pg_advisory_(?:unlock|lock)\s*\(\s*\$\d+\s*\)/g)) {
      sites.push({ path: relative(ROOT, path), call: match[0] });
    }
  }
  return sites;
}

describe('the cluster-role advisory namespace has exactly one key', () => {
  it('declares ROLE_SETUP_LOCK exactly once, in the harness, at the pinned value', () => {
    const declarations: { path: string; value: number }[] = [];
    for (const path of repositorySources()) {
      const code = stripComments(readFileSync(path, 'utf8'));
      for (const match of code.matchAll(/\bROLE_SETUP_LOCK\s*=\s*([\d_]+)/g)) {
        declarations.push({
          path: relative(ROOT, path),
          value: Number(match[1]!.replaceAll('_', '')),
        });
      }
    }

    expect(
      declarations.map((d) => d.path),
      'the cluster-role lock key must be declared exactly once — two declarations are two ' +
        'namespaces the moment one of them is edited',
    ).toEqual([LOCK_OWNER]);

    expect(declarations[0]!.value, 'ROLE_SETUP_LOCK changed value').toBe(EXPECTED_ROLE_SETUP_LOCK);
  });

  it('routes every session advisory lock in the repository through the harness', () => {
    const sites = sessionAdvisoryCallSites();

    // Non-vacuity: there are real call sites to check. A regex that matched nothing would make the
    // assertion below pass over an empty set and report perfect coverage.
    expect(sites.length, 'no session advisory-lock call sites found at all').toBeGreaterThanOrEqual(
      4,
    );

    expect(
      [...new Set(sites.filter((s) => s.path !== LOCK_OWNER).map((s) => s.path))],
      'session advisory lock taken outside the harness — a second call site is a second ' +
        'namespace unless it provably uses ROLE_SETUP_LOCK, and nothing enforces that but this',
    ).toEqual([]);
  });

  it('passes ROLE_SETUP_LOCK, not a literal, at every harness call site', () => {
    const code = stripComments(readFileSync(join(ROOT, LOCK_OWNER), 'utf8'));
    const parameterised = [
      ...code.matchAll(/pg_advisory_(?:unlock|lock)\s*\(\s*\$\d+\s*\)['"`]\s*,\s*\[([^\]]*)\]/g),
    ].map((m) => m[1]!.trim());

    expect(parameterised.length, 'no parameterised advisory calls found').toBeGreaterThanOrEqual(4);
    expect(
      [...new Set(parameterised)],
      'a harness advisory call was given something other than ROLE_SETUP_LOCK',
    ).toEqual(['ROLE_SETUP_LOCK']);
  });

  it('leaves no other advisory key in the test infrastructure', () => {
    // A second integer used with an advisory function anywhere in test code is a second cluster
    // namespace by definition. Migrations are handled separately below.
    const offenders: string[] = [];
    for (const path of repositorySources()) {
      const code = stripComments(readFileSync(path, 'utf8'));
      for (const match of code.matchAll(/pg_advisory_\w*lock\s*\(\s*([\d_]+)\s*\)/g)) {
        offenders.push(`${relative(ROOT, path)}: ${match[0]}`);
      }
    }
    expect(offenders, 'advisory lock taken on a hard-coded key in TypeScript').toEqual([]);
  });

  it('does not claim the cluster-role key for an unrelated migration lock', () => {
    // Migration 0007 takes `pg_advisory_xact_lock` for hierarchy serialisation. That is a DIFFERENT
    // domain and a different scope (transaction, not session), and prohibiting it would be
    // prohibiting a legitimate control — §21. What must not happen is a migration reusing the
    // cluster-role key, which would silently couple two unrelated serialisation domains.
    const migrations = join(ROOT, 'packages/database/migrations');
    const offenders: string[] = [];
    for (const entry of readdirSync(migrations)) {
      if (!entry.endsWith('.sql')) continue;
      const sql = readFileSync(join(migrations, entry), 'utf8');
      for (const match of sql.matchAll(/pg_advisory_\w*lock\s*\(\s*([\d_']+)/g)) {
        if (Number(match[1]!.replaceAll('_', '')) === EXPECTED_ROLE_SETUP_LOCK) {
          offenders.push(`${entry}: ${match[0]}`);
        }
      }
    }
    expect(offenders, 'a migration took the cluster-role advisory key').toEqual([]);
  });

  it('excludes exactly one file from the scan, and that file exists', () => {
    // The exclusion is the one soft spot in the rules above, so it is pinned rather than trusted:
    // exactly one path, spelled correctly, and present on disk.
    expect(existsSync(join(ROOT, SELF)), 'the self-exclusion path does not exist').toBe(true);
    expect(
      repositorySources().filter((p) => relative(ROOT, p) === SELF),
      'the self-exclusion matched more than its own file',
    ).toEqual([]);
    expect(repositorySources().length, 'the scan corpus collapsed').toBeGreaterThan(50);
  });

  it('detects a diverted key, a stray call site and a changed constant — detector self-test', () => {
    // Anti-vacuity for all four rules above, independent of what the repository currently contains.
    const declarationsIn = (source: string): number[] =>
      [...stripComments(source).matchAll(/\bROLE_SETUP_LOCK\s*=\s*([\d_]+)/g)].map((m) =>
        Number(m[1]!.replaceAll('_', '')),
      );

    // L-C shape: the constant changes value.
    expect(declarationsIn('const ROLE_SETUP_LOCK = 9_999_999;')).toEqual([9999999]);
    expect(declarationsIn('const ROLE_SETUP_LOCK = 8_140_267;')).toEqual([
      EXPECTED_ROLE_SETUP_LOCK,
    ]);

    // L-A shape: a call given some other key.
    const diverted = stripComments("await c.query('SELECT pg_advisory_lock($1)', [OTHER_LOCK]);");
    const args = [
      ...diverted.matchAll(
        /pg_advisory_(?:unlock|lock)\s*\(\s*\$\d+\s*\)['"`]\s*,\s*\[([^\]]*)\]/g,
      ),
    ].map((m) => m[1]!.trim());
    expect(args).toEqual(['OTHER_LOCK']);

    // L-B shape: a raw call site, and a hard-coded key.
    expect(
      /pg_advisory_(?:unlock|lock)\s*\(\s*\$\d+\s*\)/.test(
        stripComments("query('SELECT pg_advisory_lock($1)', [8140267])"),
      ),
    ).toBe(true);
    expect(
      /pg_advisory_\w*lock\s*\(\s*([\d_]+)\s*\)/.test(
        stripComments('query(`SELECT pg_advisory_lock(8140267)`)'),
      ),
    ).toBe(true);

    // And a comment naming the function must not count as a call site — the harness header does.
    expect(
      /pg_advisory_(?:unlock|lock)\s*\(\s*\$\d+\s*\)/.test(
        stripComments('// a second pg_advisory_lock($1) would deadlock\n'),
      ),
    ).toBe(false);
  });
});
