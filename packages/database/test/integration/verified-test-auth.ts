import type { Client } from 'pg';
import {
  verifiedHumanPrincipal,
  verifiedServicePrincipal,
} from '@freightos/context/authentication-boundary';
import type { LegalAuthorityClass, OperatingContext, VerifiedPrincipal } from '@freightos/context';
import { controlPlaneIssuer, withVerifiedTransaction } from '../../src/verified-session.ts';
import type { Queryable } from '../../src/session.ts';
import type { TestDatabase } from './harness.ts';
import type { IdentityFixture } from './identity-harness.ts';

/**
 * The test-only trusted authentication boundary — SR-2 Part 3.
 *
 * THIS FILE MODELS THE PRODUCTION AUTHENTICATION ADAPTER THAT SR-2 DELIBERATELY DOES NOT SHIP.
 * Its entire privilege is the sentence "Alice has authenticated". Everything after that sentence is
 * the production path: the production `controlPlaneIssuer` calling the real
 * `admin.issue_session_binding` over a real `freightos_admin` connection, and the production
 * `withVerifiedTransaction` calling the real `app.begin_verified_session` on a real
 * `freightos_app` connection at real READ COMMITTED.
 *
 * WHAT IT DOES NOT DO, AND MUST NEVER DO. It does not insert into `app.session_binding`, set any
 * internal GUC, fabricate an xid, become `freightos_binding_owner`, bypass RLS, or write
 * `app.actor_id` to impersonate anybody. A helper that did any of those would be testing a database
 * nobody deploys — the exact failure the PR #5 fixture work already had to correct once.
 *
 * WHY IT IS SAFE THAT THIS EXISTS. It is not reachable from production code: it lives under
 * `test/`, it is exported from no package barrel, and `scripts/test/sr2-production-boundaries.test.ts`
 * asserts both. There is deliberately no `NODE_ENV === 'test'` switch anywhere — no production code
 * path becomes privileged because an environment variable says so. The privilege here comes from
 * being a file the production build never resolves, not from a runtime condition.
 *
 * FIXTURE CREATION IS A DIFFERENT LAYER. `sr2-harness.ts` seeds tenants, users and memberships over
 * the migrator connection, because a binding needs a principal that already exists. That is
 * provisioning. This file is authentication. Keeping them in separate modules is what stops the
 * fixture path from quietly becoming the application's way in.
 */

/** Which already-authenticated principal a test is acting as. */
export interface TestPrincipal {
  readonly kind: 'human' | 'service';
  /** `users.id` for a human, `service_accounts.id` for a service. Must already exist. */
  readonly principalId: string;
  readonly tenantId: string;
  readonly organizationNodeId: string;
  readonly legalEntityId: string | null;
  readonly legalAuthorityClass?: LegalAuthorityClass;
  readonly operatingContext?: OperatingContext;
}

/** The operator user of a seeded fixture — the ordinary authenticated person of that tenant. */
export function fixtureOperator(fixture: IdentityFixture): TestPrincipal {
  return {
    kind: 'human',
    principalId: fixture.userId,
    tenantId: fixture.tenantId,
    organizationNodeId: fixture.terminalNodeId,
    legalEntityId: fixture.legalEntityId,
  };
}

/** The tenant administrator of a seeded fixture, whose membership sits higher in the tree. */
export function fixtureAdministrator(fixture: IdentityFixture): TestPrincipal {
  return {
    kind: 'human',
    principalId: fixture.adminUserId,
    tenantId: fixture.tenantId,
    organizationNodeId: fixture.legalEntityNodeId,
    legalEntityId: fixture.legalEntityId,
    legalAuthorityClass: 'software_only',
    operatingContext: 'system',
  };
}

/** The service account of a seeded fixture. */
export function fixtureServiceAccount(fixture: IdentityFixture): TestPrincipal {
  return {
    kind: 'service',
    principalId: fixture.serviceAccountId,
    tenantId: fixture.tenantId,
    organizationNodeId: fixture.regionNodeId,
    legalEntityId: fixture.legalEntityId,
  };
}

/**
 * The one privileged act: assert an authentication result.
 *
 * A real adapter would reach this line after verifying a credential against an identity provider.
 * There is no provider, so the test says it directly — and says nothing else. Every check that
 * follows is the database's: the mint refuses a principal that is not active, a tenant no
 * membership justifies, or a node outside that membership's scope.
 */
export function authenticateTestPrincipal(principal: TestPrincipal): VerifiedPrincipal {
  const common = {
    tenantId: principal.tenantId,
    organizationNodeId: principal.organizationNodeId,
    legalEntityId: principal.legalEntityId,
    legalAuthorityClass: principal.legalAuthorityClass ?? ('carrier_agent' as LegalAuthorityClass),
    operatingContext: principal.operatingContext ?? ('carrier' as OperatingContext),
    assertedBy: 'test:authentication-boundary',
  };

  return principal.kind === 'human'
    ? verifiedHumanPrincipal({ ...common, userId: principal.principalId })
    : verifiedServicePrincipal({ ...common, serviceAccountId: principal.principalId });
}

/**
 * Run `work` inside a verified transaction as `principal`.
 *
 * The shape existing tests want: a callback receiving the ordinary runtime client, with the
 * binding orchestration invisible. The body never learns the binding identifier, which after
 * installation authorises nothing anyway.
 *
 * Connections are opened and closed per call. That is slower than sharing one, and it is what makes
 * each case independent — a leaked verified session would otherwise show up as a mysterious pass in
 * the next test rather than as a failure in this one.
 */
export async function withAuthenticatedTestPrincipal<T>(
  db: TestDatabase,
  principal: TestPrincipal,
  work: (client: Queryable) => Promise<T>,
): Promise<T> {
  const runtime = db.connectAs('freightos_app');
  await runtime.connect();
  const admin = db.connectAs('freightos_admin');
  await admin.connect();
  try {
    return await withVerifiedTransaction(
      runtime,
      controlPlaneIssuer(admin),
      authenticateTestPrincipal(principal),
      work,
    );
  } finally {
    await runtime.end();
    await admin.end();
  }
}

/**
 * A leased runtime connection plus the ability to mint for it — the lower-level primitive.
 *
 * Some cases turn on which transaction is open, at what isolation level, and how it was opened.
 * Forcing those through `withAuthenticatedTestPrincipal` would hide the very thing they test. So
 * this hands back the client and a `mint`, and the caller drives BEGIN, install, COMMIT and
 * ROLLBACK itself.
 *
 * Minting stays encapsulated: the caller can obtain a binding for THIS connection and cannot reach
 * the control-plane connection to ask for anything else.
 */
export interface TestRuntimeLease {
  readonly client: Client;
  /** Issue a binding targeted at this leased connection's backend. */
  mint(principal: TestPrincipal): Promise<string>;
  /** Issue a binding targeted at some other backend — for the negative pid cases. */
  mintFor(principal: TestPrincipal, targetBackendPid: number): Promise<string>;
}

export async function withLeasedRuntime<T>(
  db: TestDatabase,
  work: (lease: TestRuntimeLease) => Promise<T>,
): Promise<T> {
  const runtime = db.connectAs('freightos_app');
  await runtime.connect();
  const admin = db.connectAs('freightos_admin');
  await admin.connect();
  const issuer = controlPlaneIssuer(admin);
  try {
    const pid = (await runtime.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!
      .pid;
    return await work({
      client: runtime,
      mint: (principal) => issuer.issue(authenticateTestPrincipal(principal), pid),
      mintFor: (principal, target) => issuer.issue(authenticateTestPrincipal(principal), target),
    });
  } finally {
    await runtime.end();
    await admin.end();
  }
}
