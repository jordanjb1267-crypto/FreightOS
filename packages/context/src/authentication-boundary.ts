/**
 * The trusted authentication boundary — SR-2 / SEC-01.
 *
 * THIS MODULE IS NOT PART OF `@freightos/context`'s ordinary surface. It is reachable only as
 * `@freightos/context/authentication-boundary`, and the only production consumer is the runtime
 * binding service in `@freightos/database`. Ordinary domain code imports `@freightos/context`,
 * receives the `VerifiedPrincipal` TYPES, and has no way to construct one — the brand is a
 * `unique symbol` this module holds and no other module can name.
 *
 * THERE IS NO PRODUCTION AUTHENTICATION ADAPTER, AND SR-2 DOES NOT ADD ONE.
 *
 * The repository has no HTTP layer, no token handling, no credential storage and no external
 * identity provider. Inventing one here would be worse than leaving the gap: a fabricated verifier
 * is a real bypass wearing the shape of a control. So this file defines the PORT — what a future
 * adapter must produce — and ships no provider for it. `AuthenticationAdapter` has no production
 * implementation anywhere in the workspace, deliberately, and a static check asserts that stays
 * true.
 *
 * The chain SR-2 establishes, and where each link lives:
 *
 *   external principal            -> a future adapter, not in this repository
 *   verified authentication       -> AuthenticationAdapter.authenticate, port only
 *   canonical internal principal  -> verifiedHumanPrincipal / verifiedServicePrincipal, here
 *   principal type               -> the discriminated union, here and as a CHECK in 0019 §2
 *   tenant/org relationship      -> re-verified by admin.issue_session_binding, database
 *   current authorization state  -> re-verified by app.verified_principal(), database, per call
 *   effective actor context      -> app.begin_verified_session, database
 *   authorization decision       -> the 52 RLS policies, database
 *   truthful attribution         -> app.current_actor_id(), database
 *
 * Everything from "tenant/org relationship" down is the database's answer and cannot be influenced
 * from here. What this module contributes is the first three links and a type that makes the fourth
 * explicit.
 */

import type { LegalAuthorityClass, OperatingContext } from './legal.ts';
import type {
  VerifiedHumanPrincipal,
  VerifiedPrincipal,
  VerifiedServicePrincipal,
} from './principal.ts';

/**
 * What an adapter has established about a principal before FreightOS trusts it.
 *
 * Every field is something the adapter RESOLVED, not something a caller sent. `userId` in
 * particular is the canonical internal `users.id` the adapter looked up from the external subject —
 * never the external subject itself, and never a value that arrived with the request.
 */
export interface HumanAuthenticationResult {
  readonly userId: string;
  readonly tenantId: string;
  readonly organizationNodeId: string;
  readonly legalEntityId: string | null;
  readonly legalAuthorityClass: LegalAuthorityClass;
  readonly operatingContext: OperatingContext;
  /** Identifies the adapter, for the issuance record. Provenance, never authority. */
  readonly assertedBy: string;
}

export interface ServiceAuthenticationResult {
  readonly serviceAccountId: string;
  readonly tenantId: string;
  readonly organizationNodeId: string;
  readonly legalEntityId: string | null;
  readonly legalAuthorityClass: LegalAuthorityClass;
  readonly operatingContext: OperatingContext;
  readonly assertedBy: string;
}

export class AuthenticationBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationBoundaryError';
  }
}

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Shape checks, and only shape checks.
 *
 * These catch a malformed adapter, not a malicious caller — the database refuses a principal that
 * does not exist, a tenant no membership justifies and a node outside the membership's scope, and
 * it does so at issuance rather than at use. Duplicating those rules here would create a second
 * place to keep in sync and a second place to get wrong. What is worth catching early is an empty
 * string or a non-uuid reaching the mint, because that produces a database error rather than a
 * clear one.
 */
function assertResolved(field: string, value: string): void {
  if (!UUID.test(value)) {
    throw new AuthenticationBoundaryError(
      `${field} must be a canonical uuid resolved by the adapter`,
    );
  }
}

function assertAsserter(assertedBy: string): void {
  if (assertedBy.trim() === '') {
    throw new AuthenticationBoundaryError('assertedBy must name the adapter that authenticated');
  }
}

/**
 * Mint a `VerifiedHumanPrincipal` from an adapter's result.
 *
 * The cast is the one place the brand is applied, and it is why this module is not on the public
 * export surface. It asserts nothing about the world; it records that the value came through the
 * boundary rather than out of a request body.
 */
export function verifiedHumanPrincipal(result: HumanAuthenticationResult): VerifiedHumanPrincipal {
  assertResolved('userId', result.userId);
  assertResolved('tenantId', result.tenantId);
  assertResolved('organizationNodeId', result.organizationNodeId);
  if (result.legalEntityId !== null) assertResolved('legalEntityId', result.legalEntityId);
  assertAsserter(result.assertedBy);

  return {
    principalType: 'human',
    userId: result.userId,
    tenantId: result.tenantId,
    organizationNodeId: result.organizationNodeId,
    legalEntityId: result.legalEntityId,
    legalAuthorityClass: result.legalAuthorityClass,
    operatingContext: result.operatingContext,
    assertedBy: result.assertedBy,
  } as VerifiedHumanPrincipal;
}

/** As above, for a service account. A service principal never acquires human semantics. */
export function verifiedServicePrincipal(
  result: ServiceAuthenticationResult,
): VerifiedServicePrincipal {
  assertResolved('serviceAccountId', result.serviceAccountId);
  assertResolved('tenantId', result.tenantId);
  assertResolved('organizationNodeId', result.organizationNodeId);
  if (result.legalEntityId !== null) assertResolved('legalEntityId', result.legalEntityId);
  assertAsserter(result.assertedBy);

  return {
    principalType: 'service',
    serviceAccountId: result.serviceAccountId,
    tenantId: result.tenantId,
    organizationNodeId: result.organizationNodeId,
    legalEntityId: result.legalEntityId,
    legalAuthorityClass: result.legalAuthorityClass,
    operatingContext: result.operatingContext,
    assertedBy: result.assertedBy,
  } as VerifiedServicePrincipal;
}

/**
 * The port a future authentication adapter implements.
 *
 * `credential` is deliberately `unknown`: the shape belongs to whatever protocol the adapter
 * speaks, and naming a shape here would be the first step towards pretending to verify one. An
 * adapter returns a `VerifiedPrincipal` or throws; there is no "unauthenticated but proceed"
 * outcome, because the database has no such state either.
 *
 * NO PROVIDER SHIPS WITH SR-2. Deliberately. See the module note.
 */
export interface AuthenticationAdapter {
  readonly name: string;
  authenticate(credential: unknown): Promise<VerifiedPrincipal>;
}
