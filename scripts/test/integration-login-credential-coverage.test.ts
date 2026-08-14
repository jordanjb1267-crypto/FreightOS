import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The answer to "what stops the NEXT new LOGIN role from failing only in CI?".
 *
 * `TestDatabase.grantRoles()` provisions integration credentials for a hard-coded list of roles.
 * Under LOCAL trust auth on a unix socket the list barely matters: `connectAs()` sends a password
 * that PostgreSQL ignores, so a role missing from the list connects anyway. Under the PASSWORD auth
 * CI uses, a LOGIN role with no configured password cannot authenticate at all.
 *
 * So the omission of a role is invisible locally and fatal remotely — which is exactly what
 * happened to `freightos_delivery_worker`. It was created by migration 0034, opened by three
 * integration files through `connectAs()`, never added to the list, and passed three consecutive
 * full local runs before failing CI with:
 *
 *     password authentication failed for user "freightos_delivery_worker"
 *
 * The invariant, stated once:
 *
 *   EVERY non-superuser LOGIN identity that an integration test actually opens through the
 *   password-auth harness must be provisioned by that harness.
 *
 * This gate is DERIVED from the sources on every run rather than restating the list, so a new
 * `connectAs('freightos_something')` is covered the moment it is written. It deliberately does NOT
 * provision every `rolcanlogin` role in the cluster: some LOGIN roles exist precisely so that tests
 * can prove they cannot be reached, and handing them working credentials would weaken those tests.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const HARNESS = join(ROOT, 'packages/database/test/integration/harness.ts');
const INTEGRATION_DIR = join(ROOT, 'packages/database/test/integration');

/** Comments stripped — the harness documents role names it does not provision. */
function executableSource(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/**
 * The roles `grantRoles()` provisions, READ OUT of the harness rather than restated here.
 *
 * Restating them would make this file agree with itself and prove nothing about the harness.
 */
function provisionedRoles(): readonly string[] {
  const source = executableSource(readFileSync(HARNESS, 'utf8'));
  const body = source.slice(source.indexOf('private async grantRoles'));
  const list = body.slice(body.indexOf('['), body.indexOf(']'));
  return [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
}

/**
 * Every role an integration test opens as a REAL LOGIN.
 *
 * Two shapes count, and one deliberately does not:
 *
 *   - `db.connectAs('role')` — a genuine authenticated connection.
 *   - `asRole('role', …)` — the local helpers in a few files, which wrap `db.connectAs(role)`.
 *   - `asRole(db, 'role', …)` — sr2-harness, which issues `SET LOCAL ROLE` on an EXISTING migrator
 *     connection. That authenticates as the migrator and never as the named role, so it needs no
 *     credentials and must not be counted. Counting it would broaden the provisioning set beyond
 *     what the harness actually opens.
 */
function rolesOpenedAsLogin(): ReadonlySet<string> {
  const found = new Set<string>();
  for (const entry of readdirSync(INTEGRATION_DIR)) {
    if (!entry.endsWith('.test.ts')) continue;
    const source = executableSource(readFileSync(join(INTEGRATION_DIR, entry), 'utf8'));
    for (const m of source.matchAll(/connectAs\(\s*'([a-z_]+)'\s*\)/g)) found.add(m[1]!);
    // `asRole('role'` — local login wrapper. The `db,` first argument is what separates it from
    // sr2-harness's SET-LOCAL-ROLE helper, so the negative lookahead is load-bearing.
    for (const m of source.matchAll(/asRole\(\s*(?!db\b)'([a-z_]+)'/g)) found.add(m[1]!);
  }
  return found;
}

/**
 * Identities provisioned somewhere OTHER than `grantRoles()`, each with the reason.
 *
 * Named individually rather than pattern-matched: an exemption that grows by accident is how the
 * original defect would come back wearing different clothes.
 */
const PROVISIONED_ELSEWHERE: Readonly<Record<string, string>> = {
  // The superuser authenticates with PGPASSWORD, which CI sets directly.
  postgres: 'SUPERUSER_PASSWORD, straight from PGPASSWORD',
  // `bootstrapMigrator()` sets the migration authority's password before any migration runs.
  freightos_migrator: 'bootstrapMigrator()',
};

describe('every LOGIN identity an integration test opens is provisioned for password auth', () => {
  const provisioned = provisionedRoles();
  const opened = rolesOpenedAsLogin();

  it('reads a non-empty provisioning list out of the harness', () => {
    // Anti-vacuity: if the parse broke, the assertion below would compare against an empty set and
    // report a violation for every role — loud, not silent — but a parse that returned everything
    // would be silent, so the membership is pinned too.
    expect(provisioned.length).toBeGreaterThanOrEqual(4);
    expect(provisioned).toContain('freightos_app');
    expect(provisioned).toContain('freightos_event_writer');
  });

  it('discovers the LOGIN roles the tests actually open', () => {
    // The other half of the anti-vacuity: an extractor that found nothing would make the contract
    // trivially satisfied.
    expect(opened.size).toBeGreaterThanOrEqual(4);
    expect(opened, 'the N6 worker is opened as a real login').toContain(
      'freightos_delivery_worker',
    );
    expect(opened).toContain('freightos_app');
  });

  it('provisions every opened role, or names where else it is provisioned', () => {
    const unprovisioned = [...opened]
      .filter((role) => !(role in PROVISIONED_ELSEWHERE))
      .filter((role) => !provisioned.includes(role))
      .sort();

    expect(
      unprovisioned,
      'these roles are opened as a real LOGIN but receive no integration credentials. Under local ' +
        'trust auth they connect anyway; under CI password auth they fail with "password ' +
        'authentication failed". Add each to grantRoles(), or to PROVISIONED_ELSEWHERE with the ' +
        'mechanism that does provision it.',
    ).toEqual([]);
  });

  it('counts an omitted role as a violation — the detector is live', () => {
    // The control for the assertion above, run against synthetic inputs so it holds whatever the
    // repository currently contains. This is the exact shape of the original defect: a role that
    // tests open, that nothing provisions.
    const syntheticOpened = new Set(['freightos_app', 'freightos_brand_new_worker']);
    const syntheticProvisioned = ['freightos_app'];
    const violations = [...syntheticOpened]
      .filter((role) => !(role in PROVISIONED_ELSEWHERE))
      .filter((role) => !syntheticProvisioned.includes(role));
    expect(violations).toEqual(['freightos_brand_new_worker']);
  });

  it('does not count sr2-harness SET LOCAL ROLE as a login', () => {
    // `asRole(db, 'freightos_control_plane', …)` authenticates as the migrator and switches role
    // inside the transaction. If this were counted, the gate would demand credentials for roles the
    // harness never logs in as — broadening the provisioned set is its own security regression.
    const sample = executableSource(
      `await asRole(db, 'freightos_never_logged_in', async (c) => c.query('SELECT 1'));`,
    );
    const matched = [...sample.matchAll(/asRole\(\s*(?!db\b)'([a-z_]+)'/g)].map((m) => m[1]!);
    expect(matched).toEqual([]);
    // And the login form IS matched, so the exclusion above is a discrimination rather than a
    // blanket failure to match.
    const login = executableSource(`await asRole('freightos_delivery_worker', async (c) => c);`);
    expect([...login.matchAll(/asRole\(\s*(?!db\b)'([a-z_]+)'/g)].map((m) => m[1]!)).toEqual([
      'freightos_delivery_worker',
    ]);
  });
});
