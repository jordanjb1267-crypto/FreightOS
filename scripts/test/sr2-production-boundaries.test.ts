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
    expect(filesContaining(/verified_binding_(tenant_scope|node_scope_ok|context)/)).toEqual([]);
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

  it('has no environment-conditional authentication bypass', () => {
    // No production path may become privileged because a variable says "test".
    const bypasses = SOURCES.filter((f) =>
      /NODE_ENV[\s\S]{0,80}(bypass|skipAuth|unverified|trustCaller)/i.test(f.code),
    ).map((f) => f.path);
    expect(bypasses).toEqual([]);
  });
});
