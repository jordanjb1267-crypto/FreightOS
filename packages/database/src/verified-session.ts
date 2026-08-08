/**
 * The runtime verified-session service — SR-2 / SEC-01.
 *
 * This is the production counterpart of the topology the database gate proved: lease a runtime
 * connection, observe ITS backend pid, mint a binding for that pid over the trusted control-plane
 * connection, then open a read-committed transaction on THE SAME physical connection and install
 * the binding there.
 *
 * CONNECTION AFFINITY IS THE SECURITY PROPERTY, NOT AN IMPLEMENTATION DETAIL.
 *
 * `app.begin_verified_session` refuses a binding whose `target_backend_pid` is not
 * `pg_backend_pid()`. That check is worth nothing if the pid is read on one pooled connection and
 * the install runs on another — the install simply fails, which is fail-closed and therefore safe,
 * but a pool that swapped connections BETWEEN the install and the business work would leave a
 * transaction running on a connection with no binding at all. So the service never takes a pool and
 * reaches into it per statement. It leases one client, holds it for the whole lifecycle, and returns
 * it once. `withVerifiedTransaction` is the only supported entry point for exactly this reason.
 *
 * WHY THE CALLBACK RECEIVES A CLIENT AND NOT A BINDING ID. After installation the binding
 * identifier authorises nothing: the session's authority lives in
 * `(pg_backend_pid(), pg_current_xact_id_if_assigned())`, which no SQL statement can set. Handing
 * the id to business code would give it something to log, pass around and leak, in exchange for
 * nothing it can use.
 */

import type { Client, Pool, PoolClient } from 'pg';
import { describePrincipal, isHumanPrincipal, type VerifiedPrincipal } from '@freightos/context';
import type { Queryable } from './session.ts';

/**
 * Why a verified session could not be established.
 *
 * Coarse on purpose. The database gives ONE refusal for every install failure — nonexistent,
 * expired, already installed, wrong backend, transaction already bound — because distinguishing
 * them would make the installer an oracle for which binding identifiers exist. Re-deriving the
 * distinction in TypeScript from timing or from a second query would hand back exactly what the
 * database declined to say.
 */
export type VerifiedSessionFailure =
  'mint_rejected' | 'install_rejected' | 'isolation_rejected' | 'transaction_failed';

export class VerifiedSessionError extends Error {
  constructor(
    readonly failure: VerifiedSessionFailure,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'VerifiedSessionError';
  }
}

/**
 * The trusted issuance boundary.
 *
 * Backed by a connection holding control-plane credentials — `freightos_admin`, the only role
 * granted EXECUTE on `admin.issue_session_binding`. It is a SEPARATE connection from the runtime one
 * by necessity: `freightos_app` has no USAGE on schema admin and could not name the function, which
 * is the point.
 *
 * `targetBackendPid` is supplied by the caller and must be server-observed. It is never a value that
 * arrived with a request; `withVerifiedTransaction` reads it with `pg_backend_pid()` on the leased
 * runtime connection and nowhere else.
 */
export interface BindingIssuer {
  issue(principal: VerifiedPrincipal, targetBackendPid: number): Promise<string>;
}

/** How long a freshly minted binding may remain installable. Bounds replay onto a recycled pid. */
const DEFAULT_INSTALLABLE_SECONDS = 30;

/**
 * A `BindingIssuer` over a control-plane client.
 *
 * The client must be authenticated as `freightos_admin`. Nothing here checks that, because nothing
 * here could: the database refuses the call otherwise, and a TypeScript assertion about which role a
 * connection holds would be a comment with a runtime cost.
 */
export function controlPlaneIssuer(
  admin: Queryable,
  options: { readonly installableSeconds?: number } = {},
): BindingIssuer {
  const installableSeconds = options.installableSeconds ?? DEFAULT_INSTALLABLE_SECONDS;

  return {
    async issue(principal: VerifiedPrincipal, targetBackendPid: number): Promise<string> {
      try {
        const result = await admin.query<{ binding: string }>(
          // SEC-01 / migration 0026. `p_issued_by` is gone. Minting a runtime binding is a SERVICE
          // act, and the issuing identity is now RESOLVED from the authenticated control-plane
          // login rather than asserted by this caller. `principal.assertedBy` therefore no longer
          // travels to the database — it would have been a caller-supplied provenance string, and
          // that is the whole class of defect F-A path 1 closed.
          `SELECT admin.issue_session_binding($1, $2, $3, $4, $5, $6, $7, $8, $9) AS binding`,
          [
            principal.principalType,
            isHumanPrincipal(principal) ? principal.userId : principal.serviceAccountId,
            principal.tenantId,
            principal.organizationNodeId,
            principal.legalEntityId,
            principal.legalAuthorityClass,
            principal.operatingContext,
            targetBackendPid,
            installableSeconds,
          ],
        );
        return result.rows[0]!.binding;
      } catch (cause) {
        // The reason is deliberately not forwarded. Issuance refusals name whether a principal,
        // tenant or node was unjustified, which is useful to an operator reading server logs and is
        // not something to hand back through an application error.
        throw new VerifiedSessionError(
          'mint_rejected',
          `no binding could be issued for the ${describePrincipal(principal)}`,
          cause,
        );
      }
    },
  };
}

/** The backend pid of a specific connection. Server-observed; there is no client-side equivalent. */
export async function backendPid(client: Queryable): Promise<number> {
  const result = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
  return result.rows[0]!.pid;
}

/**
 * Establish a verified session on `runtime` and run `work` inside it.
 *
 * `runtime` must be a LEASED connection the caller holds for the duration — a `PoolClient` from
 * `pool.connect()`, or a dedicated `Client`. Passing a `Pool` is a type error, and that is
 * intentional: `Pool.query` picks an arbitrary connection per statement, which would break the pid
 * binding silently.
 *
 * The order is fixed and each step is load-bearing:
 *
 *   1. read the pid of THIS connection
 *   2. mint a binding targeting that pid, over the trusted connection
 *   3. BEGIN on this connection — read committed, which is the connection default and is what
 *      `app.begin_verified_session` requires
 *   4. install
 *   5. run the callback
 *   6. COMMIT, or ROLLBACK on any throw
 *
 * The callback runs only after step 4 succeeds. There is no path in which a mint or install failure
 * falls back to legacy context and proceeds; a failure at any step leaves the transaction rolled
 * back and the callback un-run.
 */
export async function withVerifiedTransaction<T>(
  runtime: Client | PoolClient,
  issuer: BindingIssuer,
  principal: VerifiedPrincipal,
  work: (client: Queryable) => Promise<T>,
): Promise<T> {
  // Step 1 and 2 happen before BEGIN so that a mint refusal costs no transaction at all.
  const pid = await backendPid(runtime);
  const binding = await issuer.issue(principal, pid);

  await runtime.query('BEGIN');
  try {
    // Read committed is the connection default, but a session that has had
    // `default_transaction_isolation` or SET SESSION CHARACTERISTICS changed under it would open at
    // something else. Rather than trust the default, ask for it explicitly and let the database's
    // own check be the one that decides — `app.begin_verified_session` refuses anything else, and
    // that refusal is the control.
    await runtime.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await runtime.query('SELECT app.begin_verified_session($1)', [binding]);
  } catch (cause) {
    await runtime.query('ROLLBACK');
    const isolation = (cause as { code?: string }).code === '25000';
    throw new VerifiedSessionError(
      isolation ? 'isolation_rejected' : 'install_rejected',
      isolation
        ? 'a verified session requires read committed isolation'
        : 'the issued binding could not be installed on this connection',
      cause,
    );
  }

  let result: T;
  try {
    result = await work(runtime);
  } catch (cause) {
    await runtime.query('ROLLBACK');
    throw cause;
  }

  try {
    await runtime.query('COMMIT');
  } catch (cause) {
    await runtime.query('ROLLBACK');
    throw new VerifiedSessionError(
      'transaction_failed',
      'the verified transaction could not be committed',
      cause,
    );
  }
  return result;
}

/**
 * Lease a connection from `pool`, run a verified transaction on it, and release it.
 *
 * The lease is what guarantees affinity: `pool.connect()` hands out one physical connection, every
 * statement below goes to that client, and `release()` runs in a `finally` so a throw cannot leak
 * it. Nothing in this function consults the pool again between the pid read and the commit.
 */
export async function withVerifiedPoolTransaction<T>(
  pool: Pool,
  issuer: BindingIssuer,
  principal: VerifiedPrincipal,
  work: (client: Queryable) => Promise<T>,
): Promise<T> {
  const runtime = await pool.connect();
  try {
    return await withVerifiedTransaction(runtime, issuer, principal, work);
  } finally {
    runtime.release();
  }
}
