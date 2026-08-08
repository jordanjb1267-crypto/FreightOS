import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * SR-2 — machine-enforced boundaries between production code and the verified-identity primitives.
 *
 * Every rule here exists because the corresponding mistake is easy, quiet, and would put authority
 * back where SR-2 took it from. A comment saying "do not import this" is not a control; a failing
 * test is.
 *
 * The checks are deliberately narrow. A rule loose enough to catch every possible spelling is also
 * loose enough to fire on comments and strings, and a security check that cries wolf gets deleted
 * rather than fixed — the lesson R2-03 already recorded for the layering validator.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Every production TypeScript file: `src` of each workspace package, and the scripts themselves. */
function productionSources(): string[] {
  const found: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        // `test` directories are not production, and neither is anything under them.
        if (entry === 'test' || entry === 'tests') continue;
        walk(full);
      } else if (entry.endsWith('.ts') || entry.endsWith('.mjs')) {
        found.push(full);
      }
    }
  };

  walk(join(ROOT, 'packages'));
  walk(join(ROOT, 'scripts'));
  return found.filter((f) => !f.includes(`${join('', 'test')}${join('', '')}`));
}

/**
 * Strip comments before matching.
 *
 * The first version of these rules matched raw file text and fired on five of its own doc comments
 * — every one of which was prose explaining the rule. That is precisely the false-positive mode
 * that gets a security check disabled instead of obeyed, so the rules read CODE and the prose is
 * free to name the things it forbids.
 *
 * Block comments first, then whole-line `//` and continuation `*` lines. A `//` inside a string
 * literal survives, which is the safe direction: it can only cause a match, never hide one.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

const SOURCES = productionSources().map((path) => ({
  path: relative(ROOT, path),
  text: readFileSync(path, 'utf8'),
  code: stripComments(readFileSync(path, 'utf8')),
}));

/** Does any production file CONTAIN this pattern in code — not in the prose describing it. */
function filesContaining(pattern: RegExp): string[] {
  return SOURCES.filter((f) => pattern.test(f.code)).map((f) => f.path);
}

describe('SR-2 production boundaries', () => {
  it('finds production sources at all, so a broken walk cannot pass everything', () => {
    expect(SOURCES.length).toBeGreaterThan(10);
    expect(SOURCES.map((f) => f.path)).toContain('packages/database/src/verified-session.ts');
    expect(SOURCES.map((f) => f.path)).toContain('packages/context/src/authentication-boundary.ts');
    // And nothing from a test directory leaked into the set.
    expect(SOURCES.filter((f) => f.path.includes('/test/'))).toEqual([]);
  });

  it('keeps the verified-principal constructors off the ordinary package surface', () => {
    const index = stripComments(readFileSync(join(ROOT, 'packages/context/src/index.ts'), 'utf8'));
    // Types and readers are exported; the two constructors are not, so ordinary domain code that
    // imports `@freightos/context` can receive a VerifiedPrincipal and cannot invent one.
    expect(index).toContain('isHumanPrincipal');
    expect(index).toContain('type VerifiedPrincipal');
    expect(index).not.toContain('verifiedHumanPrincipal');
    expect(index).not.toContain('verifiedServicePrincipal');
    expect(index).not.toContain('authentication-boundary');
  });

  it('exposes the boundary only through its own subpath', () => {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, 'packages/context/package.json'), 'utf8'),
    ) as { exports: Record<string, string> };
    expect(manifest.exports['.']).toBe('./src/index.ts');
    expect(manifest.exports['./authentication-boundary']).toBe('./src/authentication-boundary.ts');
  });

  it('lets only the runtime binding service import the authentication boundary', () => {
    const importers = filesContaining(/@freightos\/context\/authentication-boundary/);
    // The binding service is the one production consumer. Nothing else should need to construct a
    // verified principal, and anything that thinks it does is the thing to review.
    expect(importers).toEqual([]);
  });

  it('applies the verified brand in exactly one module', () => {
    const branding = filesContaining(/as Verified(Human|Service)Principal/);
    expect(branding).toEqual(['packages/context/src/authentication-boundary.ts']);
  });

  it('calls the mint boundary from exactly one module', () => {
    const minters = filesContaining(/issue_session_binding/);
    expect(minters).toEqual(['packages/database/src/verified-session.ts']);
  });

  it('installs a verified session from exactly one module', () => {
    const installers = filesContaining(/begin_verified_session/);
    expect(installers).toEqual(['packages/database/src/verified-session.ts']);
  });

  it('touches the binding table from no production module at all', () => {
    // Production code has no business naming this table. Even the binding service does not: it
    // goes through admin.issue_session_binding and app.begin_verified_session, which are the only
    // two doors the database opens.
    expect(filesContaining(/session_binding/)).toEqual([
      'packages/database/src/verified-session.ts',
    ]);
    // ... and only as the name of the two functions above, never as a table reference.
    const service = SOURCES.find(
      (f) => f.path === 'packages/database/src/verified-session.ts',
    )!.code;
    expect(service).not.toMatch(/(FROM|INTO|UPDATE|DELETE FROM)\s+app\.session_binding/i);
  });

  it('uses no bootstrap-only scope function as an application authorization API', () => {
    // app.verified_binding_tenant_scope() and app.verified_binding_node_scope_ok() read the
    // installed binding WITHOUT revalidating it. That is correct for the bootstrap graph and wrong
    // for anything else: after a revocation they still answer, while every authoritative accessor
    // has already gone to NULL. They are database-internal primitives.
    expect(
      filesContaining(/verified_binding_(tenant_scope|node_scope_ok|context|scope_node_ids)/),
    ).toEqual([]);
  });

  it('keeps the statement-scoped policy primitives out of application code', () => {
    // P-01. app.verified_scope_node_ids() and app.verified_scope_service_account_ids() exist so a
    // policy can resolve the caller's scope ONCE per statement instead of once per row. They are
    // policy primitives, not an authorization API: calling one from application code would be a
    // module deciding for itself what it may reach, and would bypass the policies that are the
    // only reason the answer is trustworthy.
    expect(filesContaining(/verified_scope_(node_ids|service_account_ids)/)).toEqual([]);
  });

  it('keeps the capability predicates out of application code', () => {
    // C-01. app.identity_read_context_ok() and app.identity_write_context_ok() are ADR-0019's
    // matrix expressed as RLS. Application code asking them and then acting on the answer would be
    // enforcement moved out of the database and into a caller that can decide not to ask.
    expect(filesContaining(/identity_(read|write)_context_ok/)).toEqual([]);
  });

  it('installs no principal cache anywhere in production code', () => {
    // P-01's forbidden remedy, fenced. Statement scope is safe because an InitPlan is re-evaluated
    // by the next statement. Anything that remembers a resolved principal for the transaction or
    // the session reintroduces exactly the revocation hole SR-2 closed, and it would most likely
    // arrive as a well-meaning memo in the binding service.
    const caches = SOURCES.filter((f) =>
      /(verifiedPrincipal|currentPrincipal|resolvedPrincipal|principalCache)[\s\S]{0,60}(cache|memo|Map<|WeakMap)/i.test(
        f.code,
      ),
    ).map((f) => f.path);
    expect(caches).toEqual([]);
  });

  it('writes the legacy identity GUCs from exactly one module, and not as authentication', () => {
    // Covers the legal plane as well as the actor and tenant. After the §6 completion,
    // app.current_legal_authority_class() and app.current_operating_context() resolve from the
    // binding through the fully revalidated principal, so writing their GUCs cannot confer the
    // legal plane on a freightos_app session — but a production module reaching for them would
    // still be a module trying to establish authority by assertion, which is what this catches.
    const writers = filesContaining(
      /set_config\(\s*'app\.(actor_id|tenant_id|legal_authority_class|operating_context|organization_node_id|legal_entity_id)/,
    );
    // src/session.ts is the legacy path. It is retained for the bootstrap, migration and
    // control-plane routes, which run as roles the 0019 accessors deliberately still serve from the
    // GUC branch. For `freightos_app` these GUCs are no longer read at all, so nothing it writes is
    // authoritative — the property that closes SEC-01.
    expect(writers).toEqual(['packages/database/src/session.ts']);
  });

  it('ships no production authentication adapter, and says so', () => {
    // SR-2 defines the port and deliberately provides no provider. An implementation appearing
    // without the surrounding review is the thing this catches.
    const implementers = filesContaining(/implements\s+AuthenticationAdapter/);
    expect(implementers).toEqual([]);
  });

  it('exposes no test-only authentication helper from production code', () => {
    // The privileged test helper models the missing adapter and must never be reachable from a
    // production import graph.
    expect(filesContaining(/sr2-harness|withAuthenticatedTestPrincipal/)).toEqual([]);
  });

  it('keeps raw identity-GUC writes in test code to the reviewed allowlist', () => {
    // The rule SR-2 has to hold on the test side: a raw GUC may be an ATTACK layered on top of a
    // legitimate verified session, and may never be the way a session obtains authority in the
    // first place. That distinction is a judgement about each call site, so this check does not try
    // to make it textually — it fixes the SET of files allowed to contain one, so a new site has to
    // arrive with the review that classifies it. The reasoning per file is recorded in
    // docs/security-resilience/SR2_RAW_GUC_ALLOWLIST.md.
    //
    // Both spellings, because the parameterised form is what the adversarial helper uses and a
    // literal-only pattern would miss it entirely.
    const pattern = /set_config\(\s*('app\.|\$1)|SET\s+LOCAL\s+app\./;
    const testFiles: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.ts')) testFiles.push(full);
      }
    };
    walk(join(ROOT, 'packages/database/test'));

    const writers = testFiles
      .filter((f) => pattern.test(stripComments(readFileSync(f, 'utf8'))))
      .map((f) => relative(ROOT, f))
      .sort();

    expect(writers).toEqual(
      [
        // The adversarial primitive itself. Used only by sr2-binding-runtime, always on a session
        // that already holds a real binding.
        'packages/database/test/integration/sr2-harness.ts',
        // Forged claims over the runtime role, every one asserting that the claim confers nothing.
        'packages/database/test/integration/authority-remediation.test.ts',
        // `app.is_control_plane` claimed by a session; asserted to stay false. Role membership is
        // not reachable from inside a connection, so there is no legitimate reading of this write.
        'packages/database/test/integration/control-plane.test.ts',
        'packages/database/test/integration/rls.test.ts',
        // Node, tenant, entity and operating-context claims layered on top of live verified
        // sessions, each with an in-scope positive peer in the same session.
        'packages/database/test/integration/identity-rls.test.ts',
        // An actor claim over a live binding, asserting the binding wins; and the same claim over an
        // unbound session, asserting it resolves nothing.
        'packages/database/test/integration/identity-lifecycle.test.ts',
        // Migration 0019's regression suite. Its set_config writes are the ATTACK: a runtime
        // session names a fabricated actor and asserts the claim establishes nothing — under SR-2
        // the session has no verified identity at all and is refused before the human check.
        'packages/database/test/integration/hotfix-pg-temp-shadowing.test.ts',
        // F-A. Claims a fabricated actor AND a real permissioned administrator over the runtime
        // role, and asserts both resolve to nothing — no human, no tenant, no actor, no rows, no
        // kill switch. The GUC write is the attack; the verified binding is the positive control.
        'packages/database/test/integration/sr2-actor-authenticity.test.ts',
      ].sort(),
    );
    // The privileged provisioning and control-plane paths are deliberately NOT here. They reach
    // the same GUCs, but through `withLegalContext` in packages/database/src/session.ts — the one
    // module the check above already fences — and over postgres or the migrator, which the 0019
    // accessors still serve from the GUC branch by design. Routing them through the reviewed
    // module rather than open-coding set_config is what keeps this list this short.
  });

  it('has no environment-conditional authentication bypass', () => {
    // No production path may become privileged because a variable says "test".
    const bypasses = SOURCES.filter((f) =>
      /NODE_ENV[\s\S]{0,80}(bypass|skipAuth|unverified|trustCaller)/i.test(f.code),
    ).map((f) => f.path);
    expect(bypasses).toEqual([]);
  });
});

/**
 * SR-2 F-01/F-02 — pg_temp may not be left searched first by a future migration.
 *
 * `gate Z` in sr2-binding-structure.test.ts asserts the same property against the live catalog,
 * which is the authoritative check. This one is cheaper and earlier: it reads the migration TEXT,
 * so a `SECURITY DEFINER` written with the old pin fails before anybody applies it, rather than
 * after. Both are wanted — the catalog check cannot see a migration nobody has run, and this one
 * cannot see a function created by a `DO` block or an `ALTER` in a file it does not parse.
 *
 * Migrations 0001–0021 are excluded BY NUMBER and not by content. They are applied history: their
 * text is checksummed in `schema_migrations`, editing one is a detected corruption, and 0022 is
 * what brings the database they build to the correct state. The floor is the enforcement point.
 */
describe('SR-2 — migrations do not reintroduce pg_temp shadowing', () => {
  /** main's 0019 hotfix establishes the rule, so it is the first that must satisfy it. */
  const FIRST_ENFORCED = 19;

  const MIGRATIONS = join(ROOT, 'packages/database/migrations');

  it('ends every pinned search_path in a new migration with pg_temp', () => {
    const offenders: string[] = [];

    for (const entry of readdirSync(MIGRATIONS).sort()) {
      const version = Number(entry.slice(0, 4));
      if (!Number.isFinite(version) || version < FIRST_ENFORCED) continue;
      // The down migration of an enforced version legitimately restores an earlier state, defect
      // included — reverting is not the same as authoring.
      if (entry.endsWith('.down.sql')) continue;

      const sql = readFileSync(join(MIGRATIONS, entry), 'utf8');
      // Strip SQL line comments so the prose explaining the rule cannot trip it — the same
      // false-positive lesson the TypeScript rules above already learned.
      const code = sql
        .split('\n')
        .filter((line) => !/^\s*--/.test(line))
        .join('\n');

      // Only a real SET clause, and only one whose value is a plain schema list. Requiring the
      // leading SET and an identifier-only value is what keeps this off the two things in 0022
      // that mention the name without pinning anything: the format() template that writes the
      // clause, and the catalog assertion that reads it back out of proconfig. A looser pattern
      // matched both and reported the migration as its own violation.
      for (const m of code.matchAll(/\bSET\s+search_path\s*=\s*([a-z0-9_, "$]+)/gi)) {
        const path = m[1]!.trim();
        if (!/pg_temp$/.test(path)) offenders.push(`${entry}: SET search_path = ${path}`);
      }
    }

    expect(
      offenders,
      'a migration pins a search_path that leaves pg_temp searched first — F-01/F-02',
    ).toEqual([]);
  });

  it('actually examined a migration, so the rule cannot pass by matching nothing', () => {
    const enforced = readdirSync(MIGRATIONS).filter(
      (e) => Number(e.slice(0, 4)) >= FIRST_ENFORCED && e.endsWith('.up.sql'),
    );
    expect(
      enforced.length,
      'no migration is in scope, so the check above proves nothing',
    ).toBeGreaterThan(0);
  });
});
