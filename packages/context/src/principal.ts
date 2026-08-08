/**
 * The verified principal — SR-2 / SEC-01.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT.
 *
 * A `VerifiedPrincipal` represents the statement "authentication has already happened at a trusted
 * adapter boundary, and this is who it produced". It is NOT the act of authenticating. Nothing in
 * this module verifies a credential, and there is no production authentication adapter in the
 * repository yet — see `authentication-boundary.ts` for the port that a future one implements.
 *
 * A TypeScript type is not a security boundary; the database is. `app.verified_principal()` keys on
 * `(pg_backend_pid(), pg_current_xact_id_if_assigned())` and revalidates user, membership and
 * service-account state on every call, and no value in this file can change what it returns. What
 * this type does is make the unsafe thing hard to write by accident: ordinary domain code cannot
 * produce `{ actorId: 'someone', verified: true }` and have it accepted anywhere, because the shape
 * carries a brand whose symbol is not part of any public export.
 *
 * SEPARATION FROM `LegalContext`. `LegalContext.actorId` is a caller-supplied string that
 * `applyLegalContext` writes into `app.actor_id`. After SR-2 the database does not read that GUC for
 * `freightos_app` sessions at all. `LegalContext` therefore survives as request metadata and as the
 * bootstrap/administrative path's context, and it is no longer authentication evidence. The two are
 * deliberately different types so that a function requiring authority cannot be handed the other.
 */

import type { LegalAuthorityClass, OperatingContext } from './legal.ts';

/**
 * The brand.
 *
 * Declared, never exported, and never assigned outside `authentication-boundary.ts`. Structural
 * typing cannot fabricate a property whose key is a `unique symbol` a module has no reference to, so
 * a `VerifiedPrincipal` cannot be produced by writing an object literal in application code — the
 * compiler rejects it with "is missing the following properties", naming a symbol the author cannot
 * name.
 *
 * `declare const` rather than a real value: it exists only in the type system and emits nothing.
 */
declare const VERIFIED_PRINCIPAL: unique symbol;

/** Which kind of principal authenticated. Mirrors the database's enumerated CHECK, not a free string. */
export type PrincipalType = 'human' | 'service';

interface VerifiedPrincipalBase {
  /** Present only on values the trusted constructor produced. Not readable, not writable. */
  readonly [VERIFIED_PRINCIPAL]: true;

  /** The tenant the adapter selected AND the database will independently justify at mint time. */
  readonly tenantId: string;

  /**
   * The organization node the principal's authority is anchored at.
   *
   * Carried because the mint boundary requires it and refuses a node no membership covers. It is
   * the node the binding is issued FOR, not a claim about reach — reach is the closure's answer.
   */
  readonly organizationNodeId: string;

  /** The governing legal entity, where the verified relationship names one. */
  readonly legalEntityId: string | null;

  readonly legalAuthorityClass: LegalAuthorityClass;
  readonly operatingContext: OperatingContext;

  /**
   * Which adapter asserted this authentication result.
   *
   * Provenance for the issuance record, never authority: the database stores it in
   * `session_binding.issued_by` and no policy reads it.
   */
  readonly assertedBy: string;
}

/** A person. `userId` is the canonical internal `users.id`, never an external subject. */
export interface VerifiedHumanPrincipal extends VerifiedPrincipalBase {
  readonly principalType: 'human';
  readonly userId: string;
}

/**
 * A service account.
 *
 * Deliberately NOT expressed as a human with a different id. Article V.1 reserves several
 * operations to a named human, and the database enforces that on the binding row's enumerated
 * `principal_type` — `app.current_user_id()` returns NULL for a service principal by construction.
 * Collapsing the two here would reintroduce, in TypeScript, exactly the ambiguity 0019 removed from
 * the database.
 */
export interface VerifiedServicePrincipal extends VerifiedPrincipalBase {
  readonly principalType: 'service';
  readonly serviceAccountId: string;
}

export type VerifiedPrincipal = VerifiedHumanPrincipal | VerifiedServicePrincipal;

/** Narrow to the human case without reading the discriminator by hand at every call site. */
export function isHumanPrincipal(
  principal: VerifiedPrincipal,
): principal is VerifiedHumanPrincipal {
  return principal.principalType === 'human';
}

export function isServicePrincipal(
  principal: VerifiedPrincipal,
): principal is VerifiedServicePrincipal {
  return principal.principalType === 'service';
}

/** The canonical principal id, whichever kind this is. */
export function principalId(principal: VerifiedPrincipal): string {
  return isHumanPrincipal(principal) ? principal.userId : principal.serviceAccountId;
}

/**
 * The actor string the database will derive for this principal.
 *
 * DIAGNOSTIC AND CORRELATION ONLY. The authoritative value is whatever `app.current_actor_id()`
 * returns, which the database computes from the installed binding and never from anything sent by a
 * caller. This function exists so a log line can say who a request was for without a round trip; it
 * is not an input to any authorization or provenance decision, and writing it into `app.actor_id`
 * would accomplish nothing, because `freightos_app` sessions no longer read that GUC.
 */
export function expectedActorId(principal: VerifiedPrincipal): string {
  return isHumanPrincipal(principal)
    ? `user:${principal.userId}`
    : `service_account:${principal.serviceAccountId}`;
}

/**
 * A description safe to put in a log line.
 *
 * Names the principal type and tenant and nothing else. In particular it never carries a binding
 * identifier: a binding id is short-lived and confers nothing on its own, but it is still an
 * operational secret and logs outlive it.
 */
export function describePrincipal(principal: VerifiedPrincipal): string {
  return `${principal.principalType} principal in tenant ${principal.tenantId}`;
}
