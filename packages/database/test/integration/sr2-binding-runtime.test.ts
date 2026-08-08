import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { TestDatabase, TENANT_A, TENANT_B } from './harness.ts';
import type { IdentityFixture } from './identity-harness.ts';
import {
  backendPid,
  commitIdentityChange,
  expireBinding,
  forgeLegacyClaims,
  installBinding,
  mintBinding,
  readBinding,
  resolvedContext,
  seedVerifiedFixture,
} from './sr2-harness.ts';

/**
 * SR-2 — the adversarial half of the verified-actor-binding gate.
 *
 * The question is no longer whether migration 0020 installs. It is whether the model it installs can
 * be forged, replayed, bypassed, made stale, or accidentally closed against legitimate callers.
 *
 * TWO DISCIPLINES RUN THROUGH EVERY CASE HERE.
 *
 * First, a refusal is only evidence if it is the RIGHT refusal. PostgreSQL aborts a transaction on
 * the first error and answers everything afterwards with 25P02, so a test that reused a poisoned
 * transaction would "pass" on a refusal it did not cause. Every negative case therefore gets its own
 * transaction, and most get their own connection; where a case must observe state after a refusal,
 * it rolls back first and re-reads on a clean transaction.
 *
 * Second, every denial family carries a positive control. R-01 was a control that refused everybody
 * — including the people it was supposed to admit — and it passed every negative test that existed
 * at the time. A closed door proves nothing on its own.
 */

const db = new TestDatabase('freightos_test_sr2_runtime');

let fixtureA: IdentityFixture;
let fixtureB: IdentityFixture;

/** Alice — the operator, holding an active membership at the terminal node of tenant A. */
const alice = () => ({
  principalType: 'human' as const,
  principalId: fixtureA.userId,
  tenantId: TENANT_A,
  organizationNodeId: fixtureA.terminalNodeId,
  legalEntityId: fixtureA.legalEntityId,
});

/** Bob — a real, active colleague of Alice's in the same tenant, at a different node. */
const bob = () => ({
  principalType: 'human' as const,
  principalId: fixtureA.adminUserId,
  tenantId: TENANT_A,
  organizationNodeId: fixtureA.legalEntityNodeId,
  legalEntityId: fixtureA.legalEntityId,
});

/** The service principal of tenant A. */
const billingSync = () => ({
  principalType: 'service' as const,
  principalId: fixtureA.serviceAccountId,
  tenantId: TENANT_A,
  organizationNodeId: fixtureA.regionNodeId,
  legalEntityId: fixtureA.legalEntityId,
});

async function connect(role: string): Promise<Client> {
  const client = db.connectAs(role);
  await client.connect();
  return client;
}

/** One app connection and one control-plane connection, both closed however the body ends. */
async function withAppAndAdmin<T>(work: (app: Client, admin: Client) => Promise<T>): Promise<T> {
  const app = await connect('freightos_app');
  const admin = await connect('freightos_admin');
  try {
    return await work(app, admin);
  } finally {
    await app.end();
    await admin.end();
  }
}

interface Refusal {
  readonly message: string;
  readonly code: string | undefined;
}

/**
 * Run `work` and return the refusal it produced.
 *
 * Fails the test if it succeeds, rather than returning a sentinel a later assertion might treat as
 * a denial. `expect.fail` inside the try would be caught by the catch, so success is recorded and
 * asserted after it.
 */
async function refusalFrom(work: () => Promise<unknown>): Promise<Refusal> {
  let succeeded = false;
  try {
    await work();
    succeeded = true;
  } catch (error) {
    const e = error as { message: string; code?: string };
    return { message: e.message, code: e.code };
  }
  if (succeeded) throw new Error('expected a refusal, but the operation succeeded');
  throw new Error('unreachable');
}

/** The generic installer refusal. Every install failure must be indistinguishable from every other. */
const INSTALL_REFUSED = 'verified session could not be established';

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  fixtureA = await seedVerifiedFixture(db, TENANT_A);
  fixtureB = await seedVerifiedFixture(db, TENANT_B);
}, 180_000);

afterAll(async () => {
  // Nothing to tear down: every connection in this file is opened and closed inside its own case.
});

// ---------------------------------------------------------------------------
// GATE B — the trusted mint boundary.
// ---------------------------------------------------------------------------

describe('gate B — trusted mint', () => {
  it('issues a binding for Alice, targeted at the runtime connection', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const pid = await backendPid(app);
      const binding = await mintBinding(admin, { ...alice(), targetBackendPid: pid });
      expect(binding).toMatch(/^[0-9a-f-]{36}$/);

      // The stored row carries exactly the identity and scope that were justified, and nothing is
      // installed yet.
      expect(await readBinding(db, binding)).toEqual({
        principal_type: 'human',
        user_id: fixtureA.userId,
        service_account_id: null,
        tenant_id: TENANT_A,
        organization_node_id: fixtureA.terminalNodeId,
        legal_entity_id: fixtureA.legalEntityId,
        target_backend_pid: pid,
        // SEC-01 / 0026: `p_issued_by` is gone. This was 'test:issuer' — a provenance string the
        // caller chose. It is now the identity the control-plane connection authenticated as.
        issued_by: 'system:session-binding-issuer',
        installed_xact_id: null,
        installed_backend_pid: null,
        installed_at: null,
      });
    });
  });

  it('issues a binding for a service principal, and never as a human', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...billingSync(),
        targetBackendPid: await backendPid(app),
      });
      const stored = (await readBinding(db, binding))!;
      expect(stored.principal_type).toBe('service');
      expect(stored.user_id).toBeNull();
      expect(stored.service_account_id).toBe(fixtureA.serviceAccountId);
    });
  });

  it('refuses a real principal paired with a tenant no membership justifies', async () => {
    await withAppAndAdmin(async (_app, admin) => {
      const refusal = await refusalFrom(() =>
        mintBinding(admin, {
          ...alice(),
          tenantId: TENANT_B,
          targetBackendPid: 0,
        }),
      );
      expect(refusal.message).toMatch(/no active membership justifies/);
      expect(refusal.code).toBe('42501');
    });
  });

  it('refuses a real principal paired with a node the membership does not cover', async () => {
    await withAppAndAdmin(async (_app, admin) => {
      const refusal = await refusalFrom(() =>
        mintBinding(admin, {
          ...alice(),
          organizationNodeId: fixtureA.enterpriseNodeId,
          targetBackendPid: 0,
        }),
      );
      expect(refusal.message).toMatch(/no active membership justifies/);
    });
  });

  it('refuses a principal that does not exist', async () => {
    await withAppAndAdmin(async (_app, admin) => {
      const refusal = await refusalFrom(() =>
        mintBinding(admin, { ...alice(), principalId: randomUUID(), targetBackendPid: 0 }),
      );
      expect(refusal.message).toMatch(/no active membership justifies/);
    });
  });

  it('refuses a service account id presented as a human principal', async () => {
    await withAppAndAdmin(async (_app, admin) => {
      const refusal = await refusalFrom(() =>
        mintBinding(admin, {
          ...alice(),
          principalId: fixtureA.serviceAccountId,
          targetBackendPid: 0,
        }),
      );
      expect(refusal.message).toMatch(/no active membership justifies/);
    });
  });

  it('refuses an unknown principal type', async () => {
    await withAppAndAdmin(async (_app, admin) => {
      const refusal = await refusalFrom(() =>
        mintBinding(admin, {
          ...alice(),
          principalType: 'agent' as 'human',
          targetBackendPid: 0,
        }),
      );
      expect(refusal.message).toMatch(/unknown principal type/);
      expect(refusal.code).toBe('22023');
    });
  });

  it('bounds the installation window a caller may ask for', async () => {
    await withAppAndAdmin(async (_app, admin) => {
      for (const seconds of [0, -1, 301, 86_400]) {
        const refusal = await refusalFrom(() =>
          mintBinding(admin, { ...alice(), targetBackendPid: 0, installableSeconds: seconds }),
        );
        expect(refusal.message).toMatch(/installable window must be between 1 and 300 seconds/);
      }
    });
  });

  it('is not executable by the runtime role', async () => {
    const app = await connect('freightos_app');
    try {
      const refusal = await refusalFrom(() =>
        app.query('SELECT admin.issue_session_binding($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
          'human',
          fixtureA.userId,
          TENANT_A,
          fixtureA.terminalNodeId,
          fixtureA.legalEntityId,
          'carrier_agent',
          'carrier',
          0,
          60,
        ]),
      );
      // Schema reachability is the outer wall; the EXECUTE grant is the inner one. Either refusal is
      // correct, but it must be one of them and not a successful mint.
      expect(refusal.message).toMatch(/permission denied for schema admin|permission denied/);
    } finally {
      await app.end();
    }
  });

  it('cannot be reached by the runtime role through SET ROLE', async () => {
    const app = await connect('freightos_app');
    try {
      for (const role of [
        'freightos_admin',
        'freightos_admin_owner',
        'freightos_binding_owner',
        'freightos_control_plane',
        'freightos_migrator',
      ]) {
        const refusal = await refusalFrom(() => app.query(`SET ROLE ${role}`));
        expect(refusal.message).toMatch(/permission denied to set role/);
      }
    } finally {
      await app.end();
    }
  });

  it('is executable by exactly one role, and it is the control-plane one', async () => {
    // The function is named by OID rather than by a regprocedure literal: resolving
    // `admin.issue_session_binding(...)` in a query requires USAGE on schema admin, which the
    // migrator deliberately does not have, and the resulting `permission denied for schema admin`
    // would be a pass for entirely the wrong reason.
    const migrator = db.connectAsMigrator();
    await migrator.connect();
    try {
      const grants = await migrator.query<{ rolname: string; ok: boolean }>(
        `SELECT r.rolname, has_function_privilege(r.oid, p.oid, 'EXECUTE') AS ok
           FROM pg_roles r
           CROSS JOIN pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'admin' AND p.proname = 'issue_session_binding'
            AND r.rolname LIKE 'freightos%'
          ORDER BY r.rolname`,
      );
      const permitted = grants.rows.filter((r) => r.ok).map((r) => r.rolname);
      // freightos_admin holds the explicit grant; freightos_admin_owner is the owner and reaches it
      // that way. Nothing else may, and in particular neither the runtime role, the binding owner
      // that holds the storage, nor the deployment authority.
      expect(permitted.sort()).toEqual(['freightos_admin', 'freightos_admin_owner']);
      for (const denied of [
        'freightos_app',
        'freightos_binding_owner',
        'freightos_control_plane',
        'freightos_hierarchy_owner',
        'freightos_identity_guard',
        'freightos_migrator',
      ]) {
        expect(permitted, denied).not.toContain(denied);
      }
    } finally {
      await migrator.end();
    }
  });
});

// ---------------------------------------------------------------------------
// GATE C — the binding table itself.
// ---------------------------------------------------------------------------

describe('gate C — binding storage', () => {
  it('is unreachable by the runtime role for every DML verb', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });

      const attempts: ReadonlyArray<readonly [string, string, readonly unknown[]]> = [
        ['SELECT', 'SELECT * FROM app.session_binding', []],
        ['SELECT by id', 'SELECT * FROM app.session_binding WHERE id = $1', [binding]],
        ['SELECT by random id', 'SELECT * FROM app.session_binding WHERE id = $1', [randomUUID()]],
        ['COUNT', 'SELECT count(*) FROM app.session_binding', []],
        [
          'INSERT',
          `INSERT INTO app.session_binding
             (principal_type, user_id, tenant_id, organization_node_id, legal_authority_class,
              operating_context, target_backend_pid, issued_by, installable_until)
           VALUES ('human', $1, $2, $3, 'carrier_agent', 'carrier', pg_backend_pid(), 'attacker',
                   now() + interval '1 minute')`,
          [fixtureA.userId, TENANT_A, fixtureA.terminalNodeId],
        ],
        [
          'UPDATE',
          'UPDATE app.session_binding SET installed_backend_pid = pg_backend_pid() WHERE id = $1',
          [binding],
        ],
        ['DELETE', 'DELETE FROM app.session_binding WHERE id = $1', [binding]],
      ];

      for (const [label, sql, params] of attempts) {
        // Its own transaction: the first refusal would otherwise poison every attempt after it.
        await app.query('BEGIN');
        const refusal = await refusalFrom(() => app.query(sql, [...params]));
        await app.query('ROLLBACK');
        expect(refusal.message, label).toMatch(/permission denied for table session_binding/);
      }
    });
  });

  it('remains writable through the door its own definer needs — positive control', async () => {
    await withAppAndAdmin(async (app, admin) => {
      // The mint definer inserts; the installer definer updates. Both are exercised end to end here,
      // which is what stops "closed to runtime" from being satisfied by a table nobody can use.
      const pid = await backendPid(app);
      const binding = await mintBinding(admin, { ...alice(), targetBackendPid: pid });

      await app.query('BEGIN');
      await installBinding(app, binding);
      const installed = await app.query<{ tenant_id: string }>(
        'SELECT (app.verified_principal()).tenant_id::text AS tenant_id',
      );
      expect(installed.rows[0]!.tenant_id).toBe(TENANT_A);
      await app.query('ROLLBACK');
    });
  });
});

// ---------------------------------------------------------------------------
// GATE D — installation is bound to the target backend.
// ---------------------------------------------------------------------------

describe('gate D — backend pid binding', () => {
  it('installs on the connection the binding was issued for', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await expect(installBinding(app, binding)).resolves.toBeUndefined();
      await app.query('ROLLBACK');
    });
  });

  it('refuses the same valid identifier on a different backend', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      const other = await connect('freightos_app');
      try {
        expect(await backendPid(other)).not.toBe(await backendPid(app));
        await other.query('BEGIN');
        const refusal = await refusalFrom(() => installBinding(other, binding));
        await other.query('ROLLBACK');
        expect(refusal.message).toBe(INSTALL_REFUSED);
        expect(refusal.code).toBe('42501');
      } finally {
        await other.end();
      }
    });
  });

  it('refuses a binding targeted at a backend that is not the caller', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const other = await connect('freightos_app');
      try {
        const binding = await mintBinding(admin, {
          ...alice(),
          targetBackendPid: await backendPid(other),
        });
        await app.query('BEGIN');
        const refusal = await refusalFrom(() => installBinding(app, binding));
        await app.query('ROLLBACK');
        expect(refusal.message).toBe(INSTALL_REFUSED);
      } finally {
        await other.end();
      }
    });
  });

  it('refuses a fabricated pid target that belongs to nobody', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, { ...alice(), targetBackendPid: 2_147_483_647 });
      await app.query('BEGIN');
      const refusal = await refusalFrom(() => installBinding(app, binding));
      await app.query('ROLLBACK');
      expect(refusal.message).toBe(INSTALL_REFUSED);
    });
  });

  it('refuses an identifier that was never issued', async () => {
    await withAppAndAdmin(async (app) => {
      await app.query('BEGIN');
      const refusal = await refusalFrom(() => installBinding(app, randomUUID()));
      await app.query('ROLLBACK');
      expect(refusal.message).toBe(INSTALL_REFUSED);
    });
  });

  it('refuses an expired binding', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
        installableSeconds: 1,
      });
      await expireBinding(db, binding);
      await app.query('BEGIN');
      const refusal = await refusalFrom(() => installBinding(app, binding));
      await app.query('ROLLBACK');
      expect(refusal.message).toBe(INSTALL_REFUSED);
    });
  });

  it('gives one indistinguishable refusal for every cause, so it is not an enumeration oracle', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const pid = await backendPid(app);
      const expired = await mintBinding(admin, { ...alice(), targetBackendPid: pid });
      await expireBinding(db, expired);
      const wrongBackend = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: 2_147_483_647,
      });

      const messages = new Set<string>();
      for (const candidate of [randomUUID(), expired, wrongBackend]) {
        await app.query('BEGIN');
        const refusal = await refusalFrom(() => installBinding(app, candidate));
        await app.query('ROLLBACK');
        messages.add(refusal.message);
        // No live identifier may appear in the text a caller gets back.
        expect(refusal.message).not.toContain(candidate);
      }
      expect([...messages]).toEqual([INSTALL_REFUSED]);
    });
  });
});

// ---------------------------------------------------------------------------
// GATE E — installation is bound to the transaction.
// ---------------------------------------------------------------------------

describe('gate E — transaction binding', () => {
  it('does not burn a transaction id merely by evaluating the accessors', async () => {
    const app = await connect('freightos_app');
    try {
      await app.query('BEGIN');
      const before = await app.query<{ xid: string | null }>(
        'SELECT pg_current_xact_id_if_assigned()::text AS xid',
      );
      expect(before.rows[0]!.xid).toBeNull();

      // Exercise the whole resolver path without installing anything.
      await resolvedContext(app);
      await app.query('SELECT app.verified_principal()');
      await app.query('SELECT count(*) FROM tenants');

      const after = await app.query<{ xid: string | null }>(
        'SELECT pg_current_xact_id_if_assigned()::text AS xid',
      );
      expect(after.rows[0]!.xid).toBeNull();
      await app.query('ROLLBACK');
    } finally {
      await app.end();
    }
  });

  it('assigns a top-level xid on install and records exactly that xid', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await installBinding(app, binding);

      // Installation writes a row, so the transaction now has a real top-level xid where it had
      // none a moment ago.
      const observed = (
        await app.query<{ xid: string; assigned: string | null }>(
          `SELECT pg_current_xact_id()::text AS xid,
                  pg_current_xact_id_if_assigned()::text AS assigned`,
        )
      ).rows[0]!;
      expect(observed.assigned).toBe(observed.xid);

      // The resolver keys on exactly that xid, and the session resolves.
      expect((await resolvedContext(app)).tenantId).toBe(TENANT_A);

      // The stored row is inspected AFTER the commit, and never before: at READ COMMITTED the
      // uncommitted UPDATE is invisible to any other session, so reading it early would observe the
      // pre-install row and prove the opposite of what it appears to.
      await app.query('COMMIT');
      const stored = (await readBinding(db, binding))!;
      expect(stored.installed_xact_id).toBe(observed.xid);
      expect(stored.installed_backend_pid).toBe(await backendPid(app));
      expect(stored.installed_at).not.toBeNull();
    });
  });

  it('does not survive the commit that ends its transaction', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await installBinding(app, binding);
      expect((await resolvedContext(app)).tenantId).toBe(TENANT_A);
      await app.query('COMMIT');

      // Same physical connection, same pid, new transaction. The pid alone must not be enough.
      await app.query('BEGIN');
      expect((await resolvedContext(app)).tenantId).toBeNull();
      // And the consumed binding cannot be reinstalled.
      const refusal = await refusalFrom(() => installBinding(app, binding));
      await app.query('ROLLBACK');
      expect(refusal.message).toBe(INSTALL_REFUSED);
    });
  });

  it('leaves no verified identity behind after a rollback, and the binding becomes installable again', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await installBinding(app, binding);
      await app.query('ROLLBACK');

      await app.query('BEGIN');
      expect((await resolvedContext(app)).tenantId).toBeNull();
      await app.query('ROLLBACK');

      // The installation UPDATE rolled back with its transaction, so consumption did NOT persist.
      // Asserting the truth rather than the tidier story: the deadline, not the rollback, is what
      // bounds a retry, and that is the documented contract.
      expect((await readBinding(db, binding))!.installed_xact_id).toBeNull();

      await app.query('BEGIN');
      await expect(installBinding(app, binding)).resolves.toBeUndefined();
      expect((await resolvedContext(app)).tenantId).toBe(TENANT_A);
      await app.query('ROLLBACK');
    });
  });

  it('refuses a second binding in a transaction that already carries one', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const pid = await backendPid(app);
      const first = await mintBinding(admin, { ...alice(), targetBackendPid: pid });
      const second = await mintBinding(admin, { ...bob(), targetBackendPid: pid });

      await app.query('BEGIN');
      await installBinding(app, first);
      const refusal = await refusalFrom(() => installBinding(app, second));
      await app.query('ROLLBACK');
      expect(refusal.message).toBe(INSTALL_REFUSED);
    });
  });

  it('keeps the same principal across a savepoint and its rollback', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await installBinding(app, binding);
      const before = await resolvedContext(app);
      expect(before.userId).toBe(fixtureA.userId);

      await app.query('SAVEPOINT sp');
      expect(await resolvedContext(app)).toEqual(before);

      // A failed statement inside the subtransaction, then a rollback to the savepoint: neither may
      // change who the session is.
      await refusalFrom(() => app.query('SELECT 1 FROM app.session_binding'));
      await app.query('ROLLBACK TO SAVEPOINT sp');
      expect(await resolvedContext(app)).toEqual(before);

      await app.query('RELEASE SAVEPOINT sp');
      expect(await resolvedContext(app)).toEqual(before);
      await app.query('ROLLBACK');
    });
  });

  it('does not let a subtransaction install a different principal', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const pid = await backendPid(app);
      const aliceBinding = await mintBinding(admin, { ...alice(), targetBackendPid: pid });
      const bobBinding = await mintBinding(admin, { ...bob(), targetBackendPid: pid });

      await app.query('BEGIN');
      await installBinding(app, aliceBinding);
      await app.query('SAVEPOINT sp');
      const refusal = await refusalFrom(() => installBinding(app, bobBinding));
      await app.query('ROLLBACK TO SAVEPOINT sp');
      expect(refusal.message).toBe(INSTALL_REFUSED);
      expect((await resolvedContext(app)).userId).toBe(fixtureA.userId);
      await app.query('ROLLBACK');
    });
  });
});

// ---------------------------------------------------------------------------
// GATE F — the READ COMMITTED contract.
//
// Every transaction-control command below is issued as its OWN protocol execution. Batching them
// into one simple-query string is what produced a wrong measurement during the design work: the
// probe reported the level the batch started at rather than the level in force.
// ---------------------------------------------------------------------------

describe('gate F — isolation contract', () => {
  async function effectiveIsolation(client: Client): Promise<string> {
    const r = await client.query<{ level: string }>(
      "SELECT current_setting('transaction_isolation') AS level",
    );
    return r.rows[0]!.level;
  }

  it('installs at the connection default, which is read committed', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      expect(await effectiveIsolation(app)).toBe('read committed');
      await expect(installBinding(app, binding)).resolves.toBeUndefined();
      await app.query('ROLLBACK');
    });
  });

  it('installs when read committed is requested explicitly', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await app.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      expect(await effectiveIsolation(app)).toBe('read committed');
      await expect(installBinding(app, binding)).resolves.toBeUndefined();
      await app.query('ROLLBACK');
    });
  });

  for (const [level, reported] of [
    ['REPEATABLE READ', 'repeatable read'],
    ['SERIALIZABLE', 'serializable'],
    // Not normalised. PostgreSQL implements read uncommitted AS read committed, but the GUC keeps
    // the requested name and the contract is on the name.
    ['READ UNCOMMITTED', 'read uncommitted'],
  ] as const) {
    it(`refuses to install under ${level}`, async () => {
      await withAppAndAdmin(async (app, admin) => {
        const binding = await mintBinding(admin, {
          ...alice(),
          targetBackendPid: await backendPid(app),
        });
        await app.query('BEGIN');
        await app.query(`SET TRANSACTION ISOLATION LEVEL ${level}`);
        expect(await effectiveIsolation(app)).toBe(reported);

        const refusal = await refusalFrom(() => installBinding(app, binding));
        expect(refusal.message).toMatch(/verified session requires read committed isolation/);
        expect(refusal.code).toBe('25000');
        await app.query('ROLLBACK');

        // Nothing was installed, and the binding was not consumed by the attempt.
        expect((await readBinding(db, binding))!.installed_xact_id).toBeNull();

        await app.query('BEGIN');
        expect((await resolvedContext(app)).tenantId).toBeNull();
        await app.query('ROLLBACK');
      });
    });

    it(`refuses to install when ${level} arrives through BEGIN`, async () => {
      await withAppAndAdmin(async (app, admin) => {
        const binding = await mintBinding(admin, {
          ...alice(),
          targetBackendPid: await backendPid(app),
        });
        await app.query(`BEGIN ISOLATION LEVEL ${level}`);
        expect(await effectiveIsolation(app)).toBe(reported);
        const refusal = await refusalFrom(() => installBinding(app, binding));
        await app.query('ROLLBACK');
        expect(refusal.message).toMatch(/verified session requires read committed isolation/);
      });
    });
  }

  it('refuses when repeatable read arrives from SET SESSION CHARACTERISTICS', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await app.query('BEGIN');
      expect(await effectiveIsolation(app)).toBe('repeatable read');
      const refusal = await refusalFrom(() => installBinding(app, binding));
      await app.query('ROLLBACK');
      expect(refusal.message).toMatch(/verified session requires read committed isolation/);

      // Restore, and prove the same connection installs again once the session default is sane.
      await app.query('SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await app.query('BEGIN');
      expect(await effectiveIsolation(app)).toBe('read committed');
      await expect(installBinding(app, binding)).resolves.toBeUndefined();
      await app.query('ROLLBACK');
    });
  });

  it('refuses when repeatable read arrives from default_transaction_isolation', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query("SET default_transaction_isolation = 'repeatable read'");
      await app.query('BEGIN');
      expect(await effectiveIsolation(app)).toBe('repeatable read');
      const refusal = await refusalFrom(() => installBinding(app, binding));
      await app.query('ROLLBACK');
      expect(refusal.message).toMatch(/verified session requires read committed isolation/);
      await app.query('RESET default_transaction_isolation');
    });
  });

  it('cannot have its isolation changed after a binding is installed', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await installBinding(app, binding);

      const refusal = await refusalFrom(() =>
        app.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'),
      );
      expect(refusal.message).toMatch(
        /SET TRANSACTION ISOLATION LEVEL must be called before any query/,
      );
      expect(refusal.code).toBe('25001');

      // That refusal aborted the transaction, so the identity is re-established on a clean one
      // rather than read through 25P02 — which would have been a refusal for the wrong reason.
      await app.query('ROLLBACK');
      const second = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await installBinding(app, second);
      expect((await resolvedContext(app)).userId).toBe(fixtureA.userId);
      await app.query('ROLLBACK');
    });
  });
});

// ---------------------------------------------------------------------------
// GATE G — actor forgery.
// ---------------------------------------------------------------------------

describe('gate G — actor forgery', () => {
  const substitutes = (): ReadonlyArray<readonly [string, string]> => [
    ['a valid colleague', `user:${fixtureA.adminUserId}`],
    ['a foreign-tenant administrator', `user:${fixtureB.adminUserId}`],
    ['a fabricated uuid', `user:${randomUUID()}`],
    ['a service-like identifier', `service_account:${fixtureA.serviceAccountId}`],
    ['an agent-like identifier', 'agent:dispatch-orchestrator'],
    ['a platform-like identifier', 'system:tenant-provisioning'],
    ['an empty claim', ''],
    ['a malformed claim', 'not-an-actor-at-all'],
    ['an injection-shaped claim', "user:'; DROP TABLE users; --"],
  ];

  it('keeps Alice authoritative whatever the legacy actor claim says', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const pid = await backendPid(app);
      for (const [label, forged] of substitutes()) {
        const binding = await mintBinding(admin, { ...alice(), targetBackendPid: pid });
        await app.query('BEGIN');
        await installBinding(app, binding);
        await forgeLegacyClaims(app, { 'app.actor_id': forged });

        const resolved = await resolvedContext(app);
        expect(resolved.actorId, label).toBe(`user:${fixtureA.userId}`);
        expect(resolved.userId, label).toBe(fixtureA.userId);
        expect(resolved.humanPrincipal, label).toBe(fixtureA.userId);
        expect(resolved.actorId, label).not.toContain(fixtureA.adminUserId);
        expect(resolved.actorId, label).not.toContain(fixtureB.adminUserId);

        await app.query('ROLLBACK');
      }
    });
  });

  it('keeps the service principal a service principal, with no human identity at all', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...billingSync(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await installBinding(app, binding);
      await forgeLegacyClaims(app, { 'app.actor_id': `user:${fixtureA.userId}` });

      const resolved = await resolvedContext(app);
      expect(resolved.actorId).toBe(`service_account:${fixtureA.serviceAccountId}`);
      // A service identity must not acquire human semantics by claiming them.
      expect(resolved.userId).toBeNull();
      expect(resolved.humanPrincipal).toBeNull();
      await app.query('ROLLBACK');
    });
  });

  it('gives the forged claim no authority even when no binding is installed', async () => {
    const app = await connect('freightos_app');
    try {
      await app.query('BEGIN');
      await forgeLegacyClaims(app, {
        'app.tenant_id': TENANT_A,
        'app.actor_id': `user:${fixtureA.adminUserId}`,
        'app.organization_node_id': fixtureA.legalEntityNodeId,
        'app.legal_entity_id': fixtureA.legalEntityId,
      });
      const resolved = await resolvedContext(app);
      expect(resolved).toEqual({
        tenantId: null,
        actorId: null,
        organizationNodeId: null,
        legalEntityId: null,
        userId: null,
        humanPrincipal: null,
      });
      await app.query('ROLLBACK');
    } finally {
      await app.end();
    }
  });
});

// ---------------------------------------------------------------------------
// GATE H — tenant and node forgery.
// ---------------------------------------------------------------------------

describe('gate H — tenant and scope forgery', () => {
  it('keeps tenant, node and legal entity bound whatever the legacy scope claims say', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await installBinding(app, binding);
      await forgeLegacyClaims(app, {
        'app.tenant_id': TENANT_B,
        'app.organization_node_id': fixtureA.enterpriseNodeId,
        'app.legal_entity_id': fixtureB.legalEntityId,
      });

      const resolved = await resolvedContext(app);
      expect(resolved.tenantId).toBe(TENANT_A);
      expect(resolved.organizationNodeId).toBe(fixtureA.terminalNodeId);
      expect(resolved.legalEntityId).toBe(fixtureA.legalEntityId);
      await app.query('ROLLBACK');
    });
  });

  it('keeps ordinary RLS scoped to the bound tenant, with the foreign tenant invisible', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await installBinding(app, binding);
      await forgeLegacyClaims(app, { 'app.tenant_id': TENANT_B });

      const tenants = await app.query<{ id: string }>('SELECT id::text FROM tenants ORDER BY id');
      expect(tenants.rows.map((r) => r.id)).toEqual([TENANT_A]);

      const users = await app.query<{ tenant_id: string }>(
        'SELECT DISTINCT tenant_id::text FROM users',
      );
      expect(users.rows.map((r) => r.tenant_id)).toEqual([TENANT_A]);
      await app.query('ROLLBACK');
    });
  });

  it('does not switch tenant for a principal who legitimately belongs to both', async () => {
    await withAppAndAdmin(async (app, admin) => {
      // A separately issued binding is the ONLY way to change tenant, and it is refused for a
      // tenant this principal has no membership in.
      const refusal = await refusalFrom(() =>
        mintBinding(admin, { ...alice(), tenantId: TENANT_B, targetBackendPid: 0 }),
      );
      expect(refusal.message).toMatch(/no active membership justifies/);

      // Tenant B's own administrator gets a tenant B binding, on its own connection — proving the
      // refusal above is about justification and not about tenant B being unreachable.
      const binding = await mintBinding(admin, {
        principalType: 'human',
        principalId: fixtureB.adminUserId,
        tenantId: TENANT_B,
        organizationNodeId: fixtureB.legalEntityNodeId,
        legalEntityId: fixtureB.legalEntityId,
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await installBinding(app, binding);
      expect((await resolvedContext(app)).tenantId).toBe(TENANT_B);
      await app.query('ROLLBACK');
    });
  });
});

// ---------------------------------------------------------------------------
// GATE I — the positive bootstrap chain, end to end.
// ---------------------------------------------------------------------------

describe('gate I — bootstrap chain resolves without recursion', () => {
  it('resolves every layer, in order, on a live verified session', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await installBinding(app, binding);

      // Layer A/B — the bootstrap accessors the binding-owner policies consume.
      const scope = await app.query<{ tenant: string }>(
        'SELECT app.verified_binding_tenant_scope()::text AS tenant',
      );
      expect(scope.rows[0]!.tenant).toBe(TENANT_A);

      const own = await app.query<{ ok: boolean }>(
        'SELECT app.verified_binding_node_scope_ok($1) AS ok',
        [fixtureA.terminalNodeId],
      );
      expect(own.rows[0]!.ok).toBe(true);

      // An ANCESTOR of the bound node is not in scope: authority runs downward, not upward.
      const ancestor = await app.query<{ ok: boolean }>(
        'SELECT app.verified_binding_node_scope_ok($1) AS ok',
        [fixtureA.regionNodeId],
      );
      expect(ancestor.rows[0]!.ok).toBe(false);

      // Nor is an unrelated node in another tenant.
      const foreign = await app.query<{ ok: boolean }>(
        'SELECT app.verified_binding_node_scope_ok($1) AS ok',
        [fixtureB.terminalNodeId],
      );
      expect(foreign.rows[0]!.ok).toBe(false);

      // Layer C, then the authoritative accessors, then ordinary RLS.
      const principal = await app.query<{ pt: string; uid: string }>(
        'SELECT (app.verified_principal()).principal_type AS pt, (app.verified_principal()).user_id::text AS uid',
      );
      expect(principal.rows[0]).toEqual({ pt: 'human', uid: fixtureA.userId });

      expect((await resolvedContext(app)).tenantId).toBe(TENANT_A);

      const rows = await app.query<{ n: string }>('SELECT count(*)::text AS n FROM users');
      expect(Number(rows.rows[0]!.n)).toBeGreaterThan(0);
      await app.query('ROLLBACK');
    });
  });

  it('resolves for a service principal too', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...billingSync(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await installBinding(app, binding);
      const resolved = await resolvedContext(app);
      expect(resolved.tenantId).toBe(TENANT_A);
      expect(resolved.organizationNodeId).toBe(fixtureA.regionNodeId);
      expect(resolved.actorId).toBe(`service_account:${fixtureA.serviceAccountId}`);
      await app.query('ROLLBACK');
    });
  });
});

// ---------------------------------------------------------------------------
// GATE K / M — revocation is observed inside the open transaction.
// ---------------------------------------------------------------------------

describe('gate K — current revocation visibility', () => {
  /**
   * Mutate Alice's authorization state on a SECOND connection and commit, without ending the
   * transaction that already holds her verified session.
   *
   * The mutation runs as `freightos_admin_owner`, which is the role the `admin.*` boundary already
   * executes as: a member of `freightos_control_plane`, holding UPDATE on the identity tables, so it
   * satisfies the `is_control_plane()` disjunct these policies are written around.
   *
   * An earlier version of this helper ran as the migrator with GUC context and looked like it
   * worked. It did not: `memberships_update` is `USING (app.is_control_plane())`, the migrator is
   * not control plane, and RLS narrowed every UPDATE to zero rows without raising anything. The
   * revocation tests then "passed" by observing a revocation that had never happened. The row count
   * is checked inside commitIdentityChange for exactly that reason.
   */
  async function mutateAndCommit(
    role: string,
    sql: string,
    params: readonly unknown[],
  ): Promise<void> {
    await commitIdentityChange(
      db,
      role,
      {
        tenantId: TENANT_A,
        // The tenant administrator makes the change, not Alice: 0010's self-elevation guards refuse
        // a person changing their own authority, and a revocation that Alice performed on herself
        // would be testing the wrong rule.
        actorUserId: fixtureA.adminUserId,
        organizationNodeId: fixtureA.enterpriseNodeId,
        legalEntityId: fixtureA.legalEntityId,
      },
      sql,
      params,
    );
  }

  /** memberships: UPDATE is the control plane's, through the role the admin boundary runs as. */
  const changeMembership = (sql: string, params: readonly unknown[]) =>
    mutateAndCommit('freightos_admin_owner', sql, params);

  /** users: the admin owner holds only SELECT here, so the deployment authority makes the change. */
  const changeUser = (sql: string, params: readonly unknown[]) =>
    mutateAndCommit('freightos_migrator', sql, params);

  /** Put Alice back exactly as the fixture built her, so the cases stay independent. */
  async function restoreAlice(): Promise<void> {
    await changeMembership(
      `UPDATE memberships
          SET status = 'active', revoked_at = NULL, revoked_by = NULL, effective_to = NULL,
              effective_from = now() - interval '1 day', organization_node_id = $2
        WHERE id = $1`,
      [fixtureA.membershipId, fixtureA.terminalNodeId],
    );
    await changeUser(
      `UPDATE users
          SET status = 'active', revoked_at = NULL, revoked_by = NULL, effective_to = NULL,
              effective_from = now() - interval '1 day'
        WHERE id = $1`,
      [fixtureA.userId],
    );
  }

  const revocations: ReadonlyArray<
    readonly [string, 'membership' | 'user', () => readonly [string, readonly unknown[]]]
  > = [
    [
      'membership revoked',
      'membership',
      () => [
        // revoked_at and revoked_by move together — memberships carries the same revocation
        // consistency CHECK users does.
        "UPDATE memberships SET status = 'revoked', revoked_at = now(), revoked_by = $2 WHERE id = $1",
        [fixtureA.membershipId, 'test:revoker'],
      ],
    ],
    [
      'membership suspended',
      'membership',
      () => ["UPDATE memberships SET status = 'suspended' WHERE id = $1", [fixtureA.membershipId]],
    ],
    [
      'membership expired',
      'membership',
      () => [
        "UPDATE memberships SET effective_to = now() - interval '1 second' WHERE id = $1",
        [fixtureA.membershipId],
      ],
    ],
    [
      'membership not yet effective',
      'membership',
      () => [
        "UPDATE memberships SET effective_from = now() + interval '1 day' WHERE id = $1",
        [fixtureA.membershipId],
      ],
    ],
    [
      'membership moved to another node',
      'membership',
      () => [
        'UPDATE memberships SET organization_node_id = $2 WHERE id = $1',
        [fixtureA.membershipId, fixtureA.regionNodeId],
      ],
    ],
    [
      'user revoked',
      'user',
      () => [
        "UPDATE users SET status = 'revoked', revoked_at = now(), revoked_by = $2 WHERE id = $1",
        [fixtureA.userId, 'test:revoker'],
      ],
    ],
    [
      'user returned to pending',
      'user',
      () => ["UPDATE users SET status = 'pending' WHERE id = $1", [fixtureA.userId]],
    ],
    [
      'user expired',
      'user',
      () => [
        "UPDATE users SET effective_to = now() - interval '1 second' WHERE id = $1",
        [fixtureA.userId],
      ],
    ],
  ];

  for (const [label, target, statement] of revocations) {
    it(`observes ${label} on the next statement of an already-open transaction`, async () => {
      try {
        await withAppAndAdmin(async (app, admin) => {
          const binding = await mintBinding(admin, {
            ...alice(),
            targetBackendPid: await backendPid(app),
          });
          await app.query('BEGIN');
          await app.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
          await installBinding(app, binding);

          // Before: the session resolves and ordinary tenant RLS lets it see its own tenant.
          expect((await resolvedContext(app)).tenantId).toBe(TENANT_A);
          const before = await app.query<{ n: string }>('SELECT count(*)::text AS n FROM tenants');
          expect(Number(before.rows[0]!.n)).toBe(1);

          const [sql, params] = statement();
          await (target === 'membership' ? changeMembership : changeUser)(sql, params);

          // After, WITHOUT ending A's transaction. This is the whole property: no application cache
          // extends the window, and the next statement sees current database state.
          const principal = await app.query<{ pt: string | null }>(
            'SELECT (app.verified_principal()).principal_type AS pt',
          );
          expect(principal.rows[0]!.pt, label).toBeNull();
          expect((await resolvedContext(app)).tenantId, label).toBeNull();

          const after = await app.query<{ n: string }>('SELECT count(*)::text AS n FROM tenants');
          expect(Number(after.rows[0]!.n), label).toBe(0);

          // Node-dependent ordinary access is lost with it: users and memberships are read through
          // the AUTHORITATIVE policies for this role, and those resolve through Layer C.
          const users = await app.query<{ n: string }>('SELECT count(*)::text AS n FROM users');
          expect(Number(users.rows[0]!.n), label).toBe(0);
          const closure = await app.query<{ n: string }>(
            'SELECT count(*)::text AS n FROM organization_node_closure',
          );
          expect(Number(closure.rows[0]!.n), label).toBe(0);

          // MEASURED RESIDUAL, recorded rather than asserted away.
          //
          // The Layer A/B bootstrap accessors still return the scope the binding named. They read
          // the installed row and deliberately do NOT revalidate — revalidation is Layer C's job,
          // and putting it in Layer B is what created the recursion the design had to cut.
          //
          // This confers no authority: the only policies that consume these two are the bootstrap
          // policies, and those are applicable to freightos_binding_owner alone. What a revoked
          // session retains is the ability to read back the tenant it already supplied, and to
          // probe whether a node uuid it already holds is a descendant of its own bound node. That
          // is an information-shaped residual, not an authorization one, and it is stated here so a
          // future change cannot quietly turn it into the latter.
          const staleScope = await app.query<{ tenant: string | null; ok: boolean }>(
            `SELECT app.verified_binding_tenant_scope()::text AS tenant,
                    app.verified_binding_node_scope_ok($1) AS ok`,
            [fixtureA.terminalNodeId],
          );
          expect(staleScope.rows[0]!.tenant, label).toBe(TENANT_A);
          expect(staleScope.rows[0]!.ok, label).toBe(true);

          await app.query('ROLLBACK');
        });
      } finally {
        await restoreAlice();
      }
    });
  }

  it('refuses to install a binding for a principal revoked between issuance and use', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await changeMembership("UPDATE memberships SET status = 'suspended' WHERE id = $1", [
        fixtureA.membershipId,
      ]);
      try {
        await app.query('BEGIN');
        const refusal = await refusalFrom(() => installBinding(app, binding));
        await app.query('ROLLBACK');
        expect(refusal.message).toBe(INSTALL_REFUSED);
      } finally {
        await restoreAlice();
      }
    });
  });

  it('resolves again once the revocation is reversed — positive control', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await installBinding(app, binding);
      expect((await resolvedContext(app)).tenantId).toBe(TENANT_A);
      await app.query('ROLLBACK');
    });
  });
});

// ---------------------------------------------------------------------------
// GATE N — theft and replay.
// ---------------------------------------------------------------------------

describe('gate N — binding theft and replay', () => {
  it('confers nothing on another connection that merely knows the identifier', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      const thief = await connect('freightos_app');
      try {
        await thief.query('BEGIN');
        const refusal = await refusalFrom(() => installBinding(thief, binding));
        expect(refusal.message).toBe(INSTALL_REFUSED);
        await thief.query('ROLLBACK');

        // Knowing it and pairing it with forged legacy claims is no better.
        await thief.query('BEGIN');
        await forgeLegacyClaims(thief, {
          'app.tenant_id': TENANT_A,
          'app.actor_id': `user:${fixtureA.userId}`,
        });
        expect((await resolvedContext(thief)).tenantId).toBeNull();
        await thief.query('ROLLBACK');
      } finally {
        await thief.end();
      }
    });
  });

  it('confers nothing in a later transaction on the same connection once consumed', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await installBinding(app, binding);
      await app.query('COMMIT');

      await app.query('BEGIN');
      const refusal = await refusalFrom(() => installBinding(app, binding));
      await app.query('ROLLBACK');
      expect(refusal.message).toBe(INSTALL_REFUSED);
    });
  });

  it('does not let Bob be installed onto a connection and then claimed as Alice', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...bob(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await installBinding(app, binding);
      await forgeLegacyClaims(app, {
        'app.actor_id': `user:${fixtureA.userId}`,
        'app.tenant_id': TENANT_B,
      });
      const resolved = await resolvedContext(app);
      expect(resolved.userId).toBe(fixtureA.adminUserId);
      expect(resolved.tenantId).toBe(TENANT_A);
      await app.query('ROLLBACK');
    });
  });
});

// ---------------------------------------------------------------------------
// GATE O — provenance. The concrete PR #5 residual.
// ---------------------------------------------------------------------------

describe('gate O — kill-switch provenance', () => {
  /**
   * The residual SEC-01 left behind, stated as a test.
   *
   * Before SR-2, Alice could legitimately engage the tenant kill switch and set `app.actor_id` to
   * Bob, and `engaged_by` would record Bob. Engagement authority was checked against a real active
   * human; WHICH human was taken from the caller's own claim. 0018 closed the "any string" half of
   * that hole. It did not close this half, and could not: nothing in the database could tell Alice's
   * claim to be Bob apart from Bob's own.
   *
   * `app.engage_kill_switch` returns the new switch id and RAISES on refusal — it is not one of the
   * `admin.*` boundary functions that return a denial row — so a refusal here is an exception.
   */
  async function engage(app: Client, scopeRef: string, reason: string): Promise<string> {
    const r = await app.query<{ id: string }>(
      "SELECT app.engage_kill_switch('workflow', $1, 'suspended', $2) AS id",
      [scopeRef, reason],
    );
    return r.rows[0]!.id;
  }

  /**
   * The substitutions are named statically and RESOLVED inside each case. The fixture does not
   * exist at collection time, so a table built at module scope would read undefined and the whole
   * file would fail to collect rather than fail a test.
   */
  const forgeries: ReadonlyArray<
    readonly ['colleague' | 'foreign' | 'fabricated' | 'cleared' | 'malformed', string]
  > = [
    ['colleague', 'a real colleague'],
    ['foreign', 'a foreign administrator'],
    ['fabricated', 'a fabricated user'],
    ['cleared', 'a cleared claim'],
    ['malformed', 'a malformed claim'],
  ];

  function forgery(kind: (typeof forgeries)[number][0]): readonly [string, string | null] {
    switch (kind) {
      case 'colleague':
        return [`user:${fixtureA.adminUserId}`, fixtureA.adminUserId];
      case 'foreign':
        return [`user:${fixtureB.adminUserId}`, fixtureB.adminUserId];
      case 'fabricated':
        return [`user:${randomUUID()}`, null];
      case 'cleared':
        return ['', null];
      case 'malformed':
        return ['nonsense', null];
    }
  }

  for (const [kind, label] of forgeries) {
    it(`records Alice, not ${label}, as the engaging actor`, async () => {
      const [forged, forgedId] = forgery(kind);
      await withAppAndAdmin(async (app, admin) => {
        const binding = await mintBinding(admin, {
          ...alice(),
          targetBackendPid: await backendPid(app),
        });
        await app.query('BEGIN');
        await installBinding(app, binding);
        await forgeLegacyClaims(app, { 'app.actor_id': forged });

        // The legitimate door stays open. Closing the vulnerability by refusing Alice would be a
        // worse failure than the one being fixed — that is what R-01 was.
        const scopeRef = `sr2-${kind}-${randomUUID()}`;
        const id = await engage(app, scopeRef, `sr2 provenance ${label}`);
        expect(id, label).toBeTruthy();

        const recorded = await app.query<{
          engaged_by: string;
          engaged_by_type: string;
          tenant_id: string;
        }>('SELECT engaged_by, engaged_by_type, tenant_id::text FROM kill_switches WHERE id = $1', [
          id,
        ]);
        const row = recorded.rows[0]!;
        expect(row.engaged_by, label).toBe(`user:${fixtureA.userId}`);
        expect(row.engaged_by_type, label).toBe('human');
        expect(row.tenant_id, label).toBe(TENANT_A);
        if (forgedId !== null) expect(row.engaged_by, label).not.toContain(forgedId);

        await app.query('ROLLBACK');
      });
    });
  }

  it('records verified provenance on release as well as engagement', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await installBinding(app, binding);
      const id = await engage(app, `sr2-release-${randomUUID()}`, 'sr2 release provenance');

      await forgeLegacyClaims(app, { 'app.actor_id': `user:${fixtureA.adminUserId}` });
      const released = await app.query<{ ok: boolean }>(
        'SELECT app.release_kill_switch($1) AS ok',
        [id],
      );
      expect(released.rows[0]!.ok).toBe(true);

      const recorded = await app.query<{ released_by: string; released_by_type: string }>(
        `SELECT released_by, released_by_type FROM kill_switches
          WHERE id = $1 AND released_at IS NOT NULL`,
        [id],
      );
      expect(recorded.rows[0]).toEqual({
        released_by: `user:${fixtureA.userId}`,
        released_by_type: 'human',
      });
      await app.query('ROLLBACK');
    });
  });

  it('refuses engagement outright for a service principal, which is not a human', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...billingSync(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await installBinding(app, binding);
      await forgeLegacyClaims(app, { 'app.actor_id': `user:${fixtureA.userId}` });

      // Article V.1 reserves this to a named human. A service identity claiming to be one must not
      // acquire the reservation — and before SR-2 the claim was all there was to check.
      const refusal = await refusalFrom(() =>
        engage(app, `sr2-service-${randomUUID()}`, 'sr2 service principal'),
      );
      expect(refusal.message).toMatch(/only an active human principal may engage a kill switch/);
      await app.query('ROLLBACK');
    });
  });

  it('refuses engagement when no binding is installed at all', async () => {
    const app = await connect('freightos_app');
    try {
      await app.query('BEGIN');
      await forgeLegacyClaims(app, {
        'app.tenant_id': TENANT_A,
        'app.actor_id': `user:${fixtureA.userId}`,
        'app.organization_node_id': fixtureA.terminalNodeId,
        'app.legal_entity_id': fixtureA.legalEntityId,
      });
      const refusal = await refusalFrom(() =>
        app.query("SELECT app.engage_kill_switch('workflow', $1, 'suspended', 'unbound')", [
          `sr2-unbound-${randomUUID()}`,
        ]),
      );
      expect(refusal.message).toMatch(
        /only an active human principal may engage a kill switch|tenant|context/i,
      );
      await app.query('ROLLBACK');
    } finally {
      await app.end();
    }
  });
});

// ---------------------------------------------------------------------------
// GATE P — self-elevation guards read verified identity.
// ---------------------------------------------------------------------------

describe('gate P — self-elevation guards', () => {
  it('sees Alice, not the claimed actor, when the admin boundary identifies the caller', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await installBinding(app, binding);
      await forgeLegacyClaims(app, { 'app.actor_id': `user:${fixtureA.adminUserId}` });

      // app.current_human_principal() is what every self-elevation guard resolves the caller with.
      const seen = await app.query<{ human: string | null }>(
        'SELECT app.current_human_principal()::text AS human',
      );
      expect(seen.rows[0]!.human).toBe(fixtureA.userId);
      expect(seen.rows[0]!.human).not.toBe(fixtureA.adminUserId);
      await app.query('ROLLBACK');
    });
  });
});

/**
 * Gate V — statement-scoped authorization resolution. P-01.
 *
 * 0019 was correct and unusable. `app.verified_principal()` revalidates rather than remembers,
 * which costs ~2.5 ms, and the policies called it once per ROW of every protected table and once
 * more per row of `organization_node_closure` inside `app.organization_node_scope_ok`. A fifty-user
 * read took 1.0–8.6 s and touched 23,028 shared buffers to return fifty rows.
 *
 * 0020 moved the sublink out of the row-argument predicate and into the policy, where the planner
 * can see it is uncorrelated and hoist it. These cases prove the ASYMPTOTIC property rather than a
 * millisecond figure, because a wall-clock threshold on a shared runner measures the runner. What
 * must hold is that the work does not grow with the number of rows returned or with the size of the
 * closure — and that the optimization bought none of it by remembering anything.
 */
describe('gate V — statement-scoped authorization resolution', () => {
  /** Every buffer figure the plan reports, and the loop count of each InitPlan / SubPlan node. */
  function planFacts(text: string): { buffers: number; loops: number[]; perRowResolver: boolean } {
    const buffers = [...text.matchAll(/shared hit=(\d+)/g)].reduce(
      (t, m) => Math.max(t, Number(m[1])),
      0,
    );
    const loops = [...text.matchAll(/loops=(\d+)/g)].map((m) => Number(m[1]));
    // The defect's signature: an authoritative accessor or a row-argument scope predicate sitting
    // in a Filter, which is evaluated once per row by definition.
    const filters = [...text.matchAll(/Filter: (.*)/g)].map((m) => m[1]!).join(' ');
    const perRowResolver =
      /app\.(current_[a-z_]+|verified_principal|organization_node_scope_ok|legal_entity_scope_ok|service_account_scope_ok)\(/.test(
        filters,
      );
    return { buffers, loops, perRowResolver };
  }

  async function scopedReadPlan(app: Client): Promise<string> {
    const r = await app.query<{ 'QUERY PLAN': string }>(
      'EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM users',
    );
    return r.rows.map((x) => x['QUERY PLAN']).join('\n');
  }

  /** Refresh planner statistics, so the comparison measures resolver work and not stale reltuples. */
  async function analyze(): Promise<void> {
    const su = await connect('postgres');
    try {
      await su.query('ANALYZE');
    } finally {
      await su.end();
    }
  }

  /** Add `count` extra users at the terminal node, over the provisioning connection. */
  async function addUsers(count: number): Promise<void> {
    await commitIdentityChange(
      db,
      'freightos_migrator',
      {
        tenantId: TENANT_A,
        actorUserId: fixtureA.adminUserId,
        organizationNodeId: fixtureA.enterpriseNodeId,
        legalEntityId: fixtureA.legalEntityId,
      },
      `INSERT INTO users
         (tenant_id, organization_node_id, legal_entity_id, authentication_provider,
          authentication_subject, display_name, status, created_by)
       SELECT $1, $2, $3, 'oidc:example', 'gatev-' || g::text || '-' || $4, 'Gate V', 'active',
              'test:seed'
         FROM generate_series(1, $5) AS g`,
      [TENANT_A, fixtureA.terminalNodeId, fixtureA.legalEntityId, randomUUID(), count],
      count,
    );
  }

  it('resolves the principal outside the per-row filter', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await app.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await installBinding(app, binding);
      const facts = planFacts(await scopedReadPlan(app));
      // The property, stated as the defect's absence: no authoritative resolution in a Filter.
      expect(facts.perRowResolver, 'an authoritative resolver is still in a per-row filter').toBe(
        false,
      );
      // And the resolution is really happening somewhere — a plan with no InitPlan at all would
      // mean the policy had stopped asking, which is a security regression rather than a win.
      expect(facts.loops.length).toBeGreaterThan(0);
      await app.query('ROLLBACK');
    });
  });

  it('does not grow the resolver work when the answer grows', async () => {
    const small = await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await app.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await installBinding(app, binding);
      const f = planFacts(await scopedReadPlan(app));
      await app.query('ROLLBACK');
      return f;
    });

    await addUsers(150);
    await analyze();

    const large = await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await app.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await installBinding(app, binding);
      const rows = await app.query('SELECT id FROM users');
      const f = planFacts(await scopedReadPlan(app));
      await app.query('ROLLBACK');
      return { ...f, rows: rows.rowCount ?? 0 };
    });

    // The read really did get 150 rows bigger, so the comparison is about something.
    expect(large.rows).toBeGreaterThan(150);
    // Before 0020 this ratio was the whole defect: fifty rows cost 23,028 buffers against a
    // two-row cost of a few hundred. A generous ceiling still catches a return to per-row
    // resolution by two orders of magnitude, without pinning a shared runner to an exact figure.
    expect(
      large.buffers,
      `buffers grew from ${small.buffers} to ${large.buffers} as rows grew by 150`,
    ).toBeLessThan(small.buffers * 3 + 200);
    expect(large.perRowResolver).toBe(false);
  });

  it('does not grow the resolver work when the closure grows', async () => {
    const before = await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await app.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await installBinding(app, binding);
      const f = planFacts(await scopedReadPlan(app));
      await app.query('ROLLBACK');
      return f;
    });

    // Widen the tree well above the ten closure rows the original derivation used.
    for (let i = 0; i < 30; i += 1) {
      const id = randomUUID();
      await commitIdentityChange(
        db,
        'freightos_migrator',
        {
          tenantId: TENANT_A,
          actorUserId: fixtureA.adminUserId,
          organizationNodeId: fixtureA.enterpriseNodeId,
          legalEntityId: fixtureA.legalEntityId,
        },
        `INSERT INTO organization_nodes
           (id, tenant_id, organization_node_id, parent_id, node_type, name, created_by)
         VALUES ($1, $2, $1, $3, 'region', $4, 'test:seed')`,
        [id, TENANT_A, fixtureA.legalEntityNodeId, `Gate V wide ${i}`],
        1,
      );
    }
    await analyze();

    const after = await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await app.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await installBinding(app, binding);
      const f = planFacts(await scopedReadPlan(app));
      await app.query('ROLLBACK');
      return f;
    });

    expect(
      after.buffers,
      `buffers grew from ${before.buffers} to ${after.buffers} as the closure grew by 30 nodes`,
    ).toBeLessThan(before.buffers * 3 + 200);
    expect(after.perRowResolver).toBe(false);
  });

  it('still loses authority on the next statement when the membership is revoked', async () => {
    // The optimization's own safety proof, kept beside it rather than only in gate K. Statement
    // scope is the ONLY granularity that is safe here: anything wider would answer this statement
    // from a value resolved before the revocation committed.
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await app.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await installBinding(app, binding);

      const before = await app.query('SELECT id FROM users');
      expect(before.rowCount, 'Alice must see something before the revocation').toBeGreaterThan(0);

      await commitIdentityChange(
        db,
        'freightos_admin_owner',
        {
          tenantId: TENANT_A,
          actorUserId: fixtureA.adminUserId,
          organizationNodeId: fixtureA.enterpriseNodeId,
          legalEntityId: fixtureA.legalEntityId,
        },
        `UPDATE memberships SET status = 'revoked', revoked_at = now(), revoked_by = 'test:gatev'
          WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'`,
        [TENANT_A, fixtureA.userId],
        1,
      );

      // Same open transaction, next statement. The InitPlan is per statement EXECUTION, so this
      // one resolves again and finds nothing.
      const after = await app.query('SELECT id FROM users');
      expect(after.rowCount, 'the hoisted resolution outlived the revocation').toBe(0);
      const ctx = await app.query<{ tenant: string | null }>(
        'SELECT app.current_tenant_id()::text AS tenant',
      );
      expect(ctx.rows[0]!.tenant).toBeNull();
      await app.query('ROLLBACK');

      await commitIdentityChange(
        db,
        'freightos_admin_owner',
        {
          tenantId: TENANT_A,
          actorUserId: fixtureA.adminUserId,
          organizationNodeId: fixtureA.enterpriseNodeId,
          legalEntityId: fixtureA.legalEntityId,
        },
        `UPDATE memberships SET status = 'active', revoked_at = NULL, revoked_by = NULL
          WHERE tenant_id = $1 AND user_id = $2 AND status = 'revoked'`,
        [TENANT_A, fixtureA.userId],
        1,
      );
    });
  });
});

/**
 * Gate W — the context capability matrix cannot be moved by a claim. C-01.
 *
 * 0022 made ADR-0019's "Identity and organization" row executable: software_only/system writes,
 * software_only/{shipper_owned,facility_operator} and carrier_agent/carrier read, everything else
 * nothing. The cell is decided by app.current_legal_authority_class() and
 * app.current_operating_context(), which 0020 §6 made binding-derived — so the question this gate
 * asks is whether a session can talk its way into a different cell.
 *
 * Every case here writes strictly IN SCOPE. Node scope, legal-entity scope and tenant isolation all
 * permit the row, so the only thing that can refuse it is the capability term, and the only thing
 * that can allow it is the binding.
 */
describe('gate W — capability matrix under forgery', () => {
  /** In-scope for Alice: her own terminal node and her own legal entity. */
  const inScopeInsert = (app: Client, key: string) =>
    app.query(
      `INSERT INTO service_accounts
         (tenant_id, organization_node_id, legal_entity_id, key, name, actor_type, created_by)
       VALUES ($1, $2, $3, $4, 'Gate W', 'integration', 'test')`,
      [TENANT_A, fixtureA.terminalNodeId, fixtureA.legalEntityId, key],
    );

  /** Alice, bound under an explicit class and context, with an optional forged claim on top. */
  async function asContext(
    legalAuthorityClass: string,
    operatingContext: string,
    forge: Readonly<Record<string, string>>,
    key: string,
  ): Promise<{ wrote: boolean; message: string; readable: number; class: string | null }> {
    return withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        legalAuthorityClass,
        operatingContext,
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await app.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await installBinding(app, binding);
      if (Object.keys(forge).length > 0) await forgeLegacyClaims(app, forge);

      const seen = await app.query<{ klass: string | null }>(
        'SELECT app.current_legal_authority_class()::text AS klass',
      );
      const readable = await app.query('SELECT id FROM users');
      const outcome = await inScopeInsert(app, key).then(
        () => ({ wrote: true, message: '' }),
        (e: Error) => ({ wrote: false, message: e.message }),
      );
      await app.query('ROLLBACK');
      return {
        ...outcome,
        readable: readable.rowCount ?? 0,
        class: seen.rows[0]!.klass,
      };
    });
  }

  it('writes identity under software_only/system — the positive control', async () => {
    const r = await asContext(
      'software_only',
      'system',
      {},
      `gatew_system_${randomUUID().replace(/-/g, '')}`,
    );
    expect(r.wrote, r.message).toBe(true);
  });

  it('refuses the identical write under every other permitted pairing', async () => {
    // The three the matrix gives READ to reach row-level security, so the refusal is attributable
    // to the capability term and to nothing else.
    for (const [klass, context] of [
      ['carrier_agent', 'carrier'],
      ['software_only', 'facility_operator'],
      ['software_only', 'shipper_owned'],
    ] as const) {
      const r = await asContext(
        klass,
        context,
        {},
        `gatew_${context}_${randomUUID().replace(/-/g, '')}`,
      );
      expect(r.wrote, `${klass}/${context} wrote an identity row`).toBe(false);
      expect(r.message, `${klass}/${context}`).toMatch(/row-level security/i);
    }
    // The two the matrix gives NOTHING to are refused twice over, and the first refusal wins: with
    // the read denied, assert_governing_legal_entity cannot see the legal entity it must resolve
    // and says so before row-level security is reached. Over-determined is still closed, and this
    // asserts the refusal rather than pretending to know which gate produced it.
    for (const [klass, context] of [
      ['software_only', 'autonomous_mobility'],
      ['brokerage', 'brokerage'],
    ] as const) {
      const r = await asContext(
        klass,
        context,
        {},
        `gatew_${context}_${randomUUID().replace(/-/g, '')}`,
      );
      expect(r.wrote, `${klass}/${context} wrote an identity row`).toBe(false);
      expect(r.message, `${klass}/${context}`).toMatch(
        /row-level security|sits above the legal-entity boundary/i,
      );
    }
  });

  it('keeps the read the matrix grants, and withholds the one it does not', async () => {
    // Without this the case above is indistinguishable from a predicate that refuses everybody —
    // the R-01 failure, which passed every negative test that existed at the time.
    for (const [klass, context] of [
      ['software_only', 'system'],
      ['carrier_agent', 'carrier'],
      ['software_only', 'facility_operator'],
      ['software_only', 'shipper_owned'],
    ] as const) {
      const r = await asContext(klass, context, {}, `gatew_read_${randomUUID().replace(/-/g, '')}`);
      expect(r.readable, `${klass}/${context} lost a read the matrix grants`).toBeGreaterThan(0);
    }
    for (const [klass, context] of [
      ['software_only', 'autonomous_mobility'],
      ['brokerage', 'brokerage'],
    ] as const) {
      const r = await asContext(
        klass,
        context,
        {},
        `gatew_noread_${randomUUID().replace(/-/g, '')}`,
      );
      expect(r.readable, `${klass}/${context} kept a read the matrix denies`).toBe(0);
    }
  });

  it('does not let a forged operating context move the cell', async () => {
    // Bound as facility_operator, claiming system. The claim is the only thing that differs from
    // the positive control above.
    const r = await asContext(
      'software_only',
      'facility_operator',
      { 'app.operating_context': 'system' },
      `gatew_forge_ctx_${randomUUID().replace(/-/g, '')}`,
    );
    expect(r.wrote, 'a raw operating-context claim bought an identity write').toBe(false);
    expect(r.message).toMatch(/row-level security/i);
  });

  it('does not let a forged legal authority class move the cell', async () => {
    const r = await asContext(
      'carrier_agent',
      'carrier',
      { 'app.legal_authority_class': 'software_only', 'app.operating_context': 'system' },
      `gatew_forge_class_${randomUUID().replace(/-/g, '')}`,
    );
    expect(r.wrote, 'a raw legal-authority claim bought an identity write').toBe(false);
    expect(r.class, 'the accessor answered the claim rather than the binding').toBe(
      'carrier_agent',
    );
  });

  it('does not let a forged actor or node move the cell', async () => {
    const r = await asContext(
      'software_only',
      'facility_operator',
      {
        'app.actor_id': `user:${fixtureA.adminUserId}`,
        'app.organization_node_id': fixtureA.enterpriseNodeId,
        'app.legal_entity_id': fixtureA.legalEntityId,
        'app.tenant_id': TENANT_A,
      },
      `gatew_forge_actor_${randomUUID().replace(/-/g, '')}`,
    );
    expect(r.wrote, 'forged actor, node, entity and tenant bought an identity write').toBe(false);
  });

  it('does not let a service principal inherit the human write cell', async () => {
    // The service account of tenant A, bound as software_only/system — the pairing that DOES write.
    // A service principal is a different principal type, and the matrix row is about the context,
    // so this must behave exactly as the human does under the same context: it writes. What it must
    // not do is acquire anything more, which gate M already covers for human semantics.
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        principalType: 'service',
        principalId: fixtureA.serviceAccountId,
        tenantId: TENANT_A,
        organizationNodeId: fixtureA.regionNodeId,
        legalEntityId: fixtureA.legalEntityId,
        legalAuthorityClass: 'software_only',
        operatingContext: 'facility_operator',
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await app.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await installBinding(app, binding);
      // Read BEFORE the refusal: PostgreSQL answers everything after an error in the same
      // transaction with 25P02, so a read afterwards would report the abort rather than the fact.
      const human = await app.query<{ id: string | null }>(
        'SELECT app.current_user_id()::text AS id',
      );
      expect(human.rows[0]!.id, 'a service principal acquired human semantics').toBeNull();

      const refused = await inScopeInsert(
        app,
        `gatew_service_${randomUUID().replace(/-/g, '')}`,
      ).then(
        () => null,
        (e: Error) => e,
      );
      expect(refused, 'a facility_operator service principal wrote identity').not.toBeNull();
      expect(refused!.message).toMatch(/row-level security|sits above the legal-entity boundary/i);
      await app.query('ROLLBACK');
    });
  });
});

/**
 * Gate Y — the post-revocation enumeration the rereview went looking for.
 *
 * Layer B answers from the installed binding without revalidating the principal. That residual is
 * known and documented for `verified_binding_tenant_scope()` and `verified_binding_node_scope_ok()`.
 * 0020 added a third primitive that ENUMERATES rather than tests, so the same residual would have
 * been strictly wider — a caller could have listed its whole former subtree after revocation, while
 * every authoritative accessor had already gone to NULL.
 *
 * It cannot, because nothing but the owner may execute it. This is the runtime half of that proof.
 */
describe('gate Y — Layer B enumeration is unreachable from the runtime role', () => {
  it('refuses the runtime role the bootstrap scope set, before and after revocation', async () => {
    await withAppAndAdmin(async (app, admin) => {
      const binding = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await app.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await installBinding(app, binding);

      // A live, fully authorised session cannot reach it either — the denial is the ACL, not the
      // authorization state, which is what makes it hold after revocation as well.
      const denied = await app.query('SELECT * FROM app.verified_binding_scope_node_ids()').then(
        () => null,
        (e: { code?: string; message: string }) => e,
      );
      expect(denied, 'the runtime role enumerated the bootstrap scope set').not.toBeNull();
      expect(denied!.message).toMatch(/permission denied/i);
      await app.query('ROLLBACK');

      // The authoritative path still works for the same session, so the refusal above is about this
      // one function and not about a session that had lost everything.
      const second = await mintBinding(admin, {
        ...alice(),
        targetBackendPid: await backendPid(app),
      });
      await app.query('BEGIN');
      await app.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await installBinding(app, second);
      const rows = await app.query('SELECT id FROM users');
      expect(rows.rowCount, 'the positive control lost its reach').toBeGreaterThan(0);
      await app.query('ROLLBACK');
    });
  });
});
