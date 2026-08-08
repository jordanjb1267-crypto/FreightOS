import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { Pool, type Client, type PoolClient } from 'pg';
import {
  verifiedHumanPrincipal,
  verifiedServicePrincipal,
} from '@freightos/context/authentication-boundary';
import type { VerifiedPrincipal } from '@freightos/context';
import {
  VerifiedSessionError,
  backendPid,
  controlPlaneIssuer,
  withVerifiedPoolTransaction,
  withVerifiedTransaction,
  type BindingIssuer,
} from '../../src/verified-session.ts';
import type { Queryable } from '../../src/session.ts';
import { TestDatabase, TENANT_A, TENANT_B } from './harness.ts';
import type { IdentityFixture } from './identity-harness.ts';
import { forgeLegacyClaims, seedVerifiedFixture } from './sr2-harness.ts';

/**
 * SR-2 — the application seam.
 *
 * The database gate proved the primitives. This proves the TypeScript service that consumes them
 * preserves the properties end to end, and in particular the one property that lives entirely in
 * application code: CONNECTION AFFINITY.
 *
 * `app.begin_verified_session` refuses a binding whose `target_backend_pid` is not the executing
 * backend. That check protects nothing if a pool hands the pid read and the install to different
 * physical connections — the install would simply fail, which is safe, but a pool that swapped
 * connections between the install and the business work would run application statements on a
 * connection carrying no binding at all. So the pid is probed at all three points and compared.
 */

const db = new TestDatabase('freightos_test_sr2_session');

let fixture: IdentityFixture;
let fixtureB: IdentityFixture;

/**
 * Stand in for the authentication adapter SR-2 deliberately does not ship.
 *
 * This is the test's licence to say "Alice has authenticated". It constructs a verified principal
 * through the real trusted constructor and then does nothing else privileged: every step after this
 * is the production service against the production database functions.
 */
function authenticateAlice(): VerifiedPrincipal {
  return verifiedHumanPrincipal({
    userId: fixture.userId,
    tenantId: TENANT_A,
    organizationNodeId: fixture.terminalNodeId,
    legalEntityId: fixture.legalEntityId,
    legalAuthorityClass: 'carrier_agent',
    operatingContext: 'carrier',
    assertedBy: 'test:adapter',
  });
}

function authenticateBob(): VerifiedPrincipal {
  return verifiedHumanPrincipal({
    userId: fixtureB.adminUserId,
    tenantId: TENANT_B,
    organizationNodeId: fixtureB.legalEntityNodeId,
    legalEntityId: fixtureB.legalEntityId,
    legalAuthorityClass: 'carrier_agent',
    operatingContext: 'carrier',
    assertedBy: 'test:adapter',
  });
}

function authenticateBillingSync(): VerifiedPrincipal {
  return verifiedServicePrincipal({
    serviceAccountId: fixture.serviceAccountId,
    tenantId: TENANT_A,
    organizationNodeId: fixture.regionNodeId,
    legalEntityId: fixture.legalEntityId,
    legalAuthorityClass: 'carrier_agent',
    operatingContext: 'carrier',
    assertedBy: 'test:adapter',
  });
}

/** Open a control-plane connection and build the production issuer over it. */
async function withIssuer<T>(
  work: (issuer: BindingIssuer, admin: Client) => Promise<T>,
): Promise<T> {
  const admin = db.connectAs('freightos_admin');
  await admin.connect();
  try {
    return await work(controlPlaneIssuer(admin), admin);
  } finally {
    await admin.end();
  }
}

/** A pool of `freightos_app` connections, deliberately capped at one so reuse is guaranteed. */
function runtimePool(max = 1): Pool {
  const socket = process.env['FREIGHTOS_PGSOCK'] ?? '/var/tmp/freightos-pg/sock';
  const password =
    process.env['PGPASSWORD'] === undefined
      ? {}
      : { password: process.env['FREIGHTOS_TEST_ROLE_PASSWORD'] ?? 'devonly' };
  return new Pool({
    host: socket,
    port: Number(process.env['FREIGHTOS_PGPORT'] ?? 55432),
    user: 'freightos_app',
    database: db.name,
    max,
    ...password,
  });
}

async function resolvedTenant(client: Queryable): Promise<string | null> {
  const r = await client.query<{ tenant: string | null }>(
    'SELECT app.current_tenant_id()::text AS tenant',
  );
  return r.rows[0]!.tenant;
}

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  fixture = await seedVerifiedFixture(db, TENANT_A);
  fixtureB = await seedVerifiedFixture(db, TENANT_B);
}, 180_000);

describe('verified transaction — the production path', () => {
  it('resolves the authenticated principal inside the callback', async () => {
    const pool = runtimePool();
    try {
      await withIssuer(async (issuer) => {
        const seen = await withVerifiedPoolTransaction(
          pool,
          issuer,
          authenticateAlice(),
          async (client) => {
            const r = await client.query<{ tenant: string; actor: string; user_id: string }>(
              `SELECT app.current_tenant_id()::text AS tenant,
                      app.current_actor_id() AS actor,
                      app.current_user_id()::text AS user_id`,
            );
            return r.rows[0]!;
          },
        );
        expect(seen.tenant).toBe(TENANT_A);
        expect(seen.actor).toBe(`user:${fixture.userId}`);
        expect(seen.user_id).toBe(fixture.userId);
      });
    } finally {
      await pool.end();
    }
  });

  it('carries a service principal through as a service principal', async () => {
    const pool = runtimePool();
    try {
      await withIssuer(async (issuer) => {
        const seen = await withVerifiedPoolTransaction(
          pool,
          issuer,
          authenticateBillingSync(),
          async (client) => {
            const r = await client.query<{ actor: string; user_id: string | null }>(
              `SELECT app.current_actor_id() AS actor, app.current_user_id()::text AS user_id`,
            );
            return r.rows[0]!;
          },
        );
        expect(seen.actor).toBe(`service_account:${fixture.serviceAccountId}`);
        // A service identity never acquires human semantics through the application layer either.
        expect(seen.user_id).toBeNull();
      });
    } finally {
      await pool.end();
    }
  });

  it('commits the work it wrapped', async () => {
    const pool = runtimePool();
    try {
      await withIssuer(async (issuer) => {
        const name = `sr2-committed-${randomUUID()}`;
        await withVerifiedPoolTransaction(pool, issuer, authenticateAlice(), async (client) => {
          await client.query('UPDATE tenants SET name = $1 WHERE id = $2', [name, TENANT_A]);
        });
        const after = await withVerifiedPoolTransaction(
          pool,
          issuer,
          authenticateAlice(),
          async (client) => {
            const r = await client.query<{ name: string }>(
              'SELECT name FROM tenants WHERE id = $1',
              [TENANT_A],
            );
            return r.rows[0]!.name;
          },
        );
        expect(after).toBe(name);
      });
    } finally {
      await pool.end();
    }
  });
});

describe('connection affinity', () => {
  it('uses one physical backend for the pid read, the install and the callback', async () => {
    const pool = runtimePool();
    try {
      await withIssuer(async (issuer) => {
        // The pid is probed three times: before the service runs, inside the install path, and
        // inside the business callback. A pool that silently swapped connections between any two of
        // them is a security defect, and the only way to see it is to ask the server each time.
        const leased: PoolClient = await pool.connect();
        try {
          const beforeMint = await backendPid(leased);

          const insideCallback = await withVerifiedTransaction(
            leased,
            issuer,
            authenticateAlice(),
            async (client) => {
              const r = await client.query<{ pid: number; installed: string }>(
                `SELECT pg_backend_pid() AS pid,
                        app.current_tenant_id()::text AS installed`,
              );
              // The binding resolved here, which is only possible if the install ran on this pid.
              expect(r.rows[0]!.installed).toBe(TENANT_A);
              return r.rows[0]!.pid;
            },
          );

          const afterCommit = await backendPid(leased);
          expect(insideCallback).toBe(beforeMint);
          expect(afterCommit).toBe(beforeMint);
        } finally {
          leased.release();
        }
      });
    } finally {
      await pool.end();
    }
  });

  it('refuses when a binding minted for one connection is installed on another', async () => {
    const pool = runtimePool(2);
    try {
      await withIssuer(async (issuer) => {
        const a = await pool.connect();
        const b = await pool.connect();
        try {
          expect(await backendPid(a)).not.toBe(await backendPid(b));

          // Mint against A's pid, then hand the issuer to a transaction on B by pinning the pid.
          // This is the mistake the service exists to prevent, staged deliberately.
          const aPid = await backendPid(a);
          const pinned: BindingIssuer = {
            issue: (principal) => issuer.issue(principal, aPid),
          };

          let ran = false;
          await expect(
            withVerifiedTransaction(b, pinned, authenticateAlice(), async () => {
              ran = true;
            }),
          ).rejects.toThrow(VerifiedSessionError);
          expect(ran).toBe(false);
        } finally {
          a.release();
          b.release();
        }
      });
    } finally {
      await pool.end();
    }
  });
});

describe('pool isolation', () => {
  it('leaves no identity behind on a reused connection', async () => {
    const pool = runtimePool(1);
    try {
      await withIssuer(async (issuer) => {
        const first = await pool.connect();
        const pid = await backendPid(first);
        await withVerifiedTransaction(first, issuer, authenticateAlice(), async (client) => {
          expect(await resolvedTenant(client)).toBe(TENANT_A);
        });
        first.release();

        // Same physical connection, no verified session. It must resolve to nothing.
        const second = await pool.connect();
        try {
          expect(await backendPid(second)).toBe(pid);
          await second.query('BEGIN');
          expect(await resolvedTenant(second)).toBeNull();
          await second.query('ROLLBACK');
        } finally {
          second.release();
        }
      });
    } finally {
      await pool.end();
    }
  });

  it('does not leak Alice into Bob on a reused connection', async () => {
    const pool = runtimePool(1);
    try {
      await withIssuer(async (issuer) => {
        const seenA = await withVerifiedPoolTransaction(
          pool,
          issuer,
          authenticateAlice(),
          async (client) => resolvedTenant(client),
        );
        expect(seenA).toBe(TENANT_A);

        const seenB = await withVerifiedPoolTransaction(
          pool,
          issuer,
          authenticateBob(),
          async (client) => {
            const r = await client.query<{ tenant: string; actor: string }>(
              `SELECT app.current_tenant_id()::text AS tenant, app.current_actor_id() AS actor`,
            );
            return r.rows[0]!;
          },
        );
        expect(seenB.tenant).toBe(TENANT_B);
        expect(seenB.actor).toBe(`user:${fixtureB.adminUserId}`);
        // No residue of the previous borrower.
        expect(seenB.actor).not.toContain(fixture.userId);
      });
    } finally {
      await pool.end();
    }
  });

  it('rolls back on a throw and leaves the next borrower unverified', async () => {
    const pool = runtimePool(1);
    try {
      await withIssuer(async (issuer) => {
        const name = `sr2-rolled-back-${randomUUID()}`;
        await expect(
          withVerifiedPoolTransaction(pool, issuer, authenticateAlice(), async (client) => {
            await client.query('UPDATE tenants SET name = $1 WHERE id = $2', [name, TENANT_A]);
            throw new Error('domain failure');
          }),
        ).rejects.toThrow('domain failure');

        const after = await withVerifiedPoolTransaction(
          pool,
          issuer,
          authenticateAlice(),
          async (client) => {
            expect(await resolvedTenant(client)).toBe(TENANT_A);
            const r = await client.query<{ name: string }>(
              'SELECT name FROM tenants WHERE id = $1',
              [TENANT_A],
            );
            return r.rows[0]!.name;
          },
        );
        expect(after).not.toBe(name);

        // And the connection came back usable rather than stuck in a failed transaction.
        const next = await pool.connect();
        try {
          await next.query('BEGIN');
          expect(await resolvedTenant(next)).toBeNull();
          await next.query('ROLLBACK');
        } finally {
          next.release();
        }
      });
    } finally {
      await pool.end();
    }
  });
});

describe('fail closed', () => {
  it('does not run the callback when the mint is refused', async () => {
    const pool = runtimePool();
    try {
      await withIssuer(async (issuer) => {
        // A real principal paired with a tenant no membership justifies. The refusal happens at
        // issuance, before any transaction is opened.
        const wrongTenant = verifiedHumanPrincipal({
          userId: fixture.userId,
          tenantId: TENANT_B,
          organizationNodeId: fixtureB.legalEntityNodeId,
          legalEntityId: fixtureB.legalEntityId,
          legalAuthorityClass: 'carrier_agent',
          operatingContext: 'carrier',
          assertedBy: 'test:adapter',
        });

        let ran = false;
        const error = await withVerifiedPoolTransaction(pool, issuer, wrongTenant, async () => {
          ran = true;
        }).catch((e: unknown) => e as VerifiedSessionError);

        expect(error).toBeInstanceOf(VerifiedSessionError);
        expect((error as VerifiedSessionError).failure).toBe('mint_rejected');
        // The message names the principal type and tenant and nothing more — no user id, no
        // binding id, and not the database's reason for refusing.
        expect((error as VerifiedSessionError).message).not.toContain(fixture.userId);
        expect(ran).toBe(false);
      });
    } finally {
      await pool.end();
    }
  });

  it('does not run the callback when the install is refused', async () => {
    const pool = runtimePool();
    try {
      await withIssuer(async (issuer, admin) => {
        // Issue normally, then expire it before the service can install it. The service's own
        // ordering makes this the only way to stage an install failure without reaching past the
        // production API, which is the point.
        const expiring: BindingIssuer = {
          async issue(principal, pid) {
            const binding = await issuer.issue(principal, pid);
            await admin.query(
              `SELECT admin.issue_session_binding($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
              [
                'human',
                fixture.userId,
                TENANT_A,
                fixture.terminalNodeId,
                fixture.legalEntityId,
                'carrier_agent',
                'carrier',
                pid,
                'test:adapter',
                1,
              ],
            );
            // Return an identifier that was never issued. Indistinguishable, to the installer, from
            // an expired or already-consumed one — the database gives one refusal for all of them.
            void binding;
            return randomUUID();
          },
        };

        let ran = false;
        const error = await withVerifiedPoolTransaction(
          pool,
          expiring,
          authenticateAlice(),
          async () => {
            ran = true;
          },
        ).catch((e: unknown) => e as VerifiedSessionError);

        expect(error).toBeInstanceOf(VerifiedSessionError);
        expect((error as VerifiedSessionError).failure).toBe('install_rejected');
        expect(ran).toBe(false);

        // The connection is returned in a usable state, not stuck in an aborted transaction.
        const next = await pool.connect();
        try {
          expect(await resolvedTenant(next)).toBeNull();
        } finally {
          next.release();
        }
      });
    } finally {
      await pool.end();
    }
  });
});

describe('provenance through the application path', () => {
  it('records the verified principal when request metadata claims somebody else', async () => {
    const pool = runtimePool();
    try {
      await withIssuer(async (issuer) => {
        const scopeRef = `sr2-app-${randomUUID()}`;
        const engaged = await withVerifiedPoolTransaction(
          pool,
          issuer,
          authenticateAlice(),
          async (client) => {
            // Request metadata arriving alongside the call, claiming the tenant administrator.
            // Before SR-2 this decided who the ledger recorded.
            await forgeLegacyClaims(client as Client, {
              'app.actor_id': `user:${fixture.adminUserId}`,
              'app.tenant_id': TENANT_B,
            });

            const r = await client.query<{ id: string }>(
              "SELECT app.engage_kill_switch('workflow', $1, 'suspended', 'sr2 app path') AS id",
              [scopeRef],
            );
            const id = r.rows[0]!.id;

            const recorded = await client.query<{
              engaged_by: string;
              engaged_by_type: string;
              tenant_id: string;
            }>(
              'SELECT engaged_by, engaged_by_type, tenant_id::text FROM kill_switches WHERE id = $1',
              [id],
            );
            return recorded.rows[0]!;
          },
        );

        // Alice was legitimately permitted, so the operation succeeded — and it is Alice who is
        // recorded, in Alice's tenant.
        expect(engaged.engaged_by).toBe(`user:${fixture.userId}`);
        expect(engaged.engaged_by_type).toBe('human');
        expect(engaged.tenant_id).toBe(TENANT_A);
        expect(engaged.engaged_by).not.toContain(fixture.adminUserId);
      });
    } finally {
      await pool.end();
    }
  });
});
