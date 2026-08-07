import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withLegalContext } from '../../src/session.ts';
import { fixtureAdministrator, withAuthenticatedTestPrincipal } from './verified-test-auth.ts';
import { TENANT_A, TENANT_B, TestDatabase } from './harness.ts';
import { seedIdentity, systemContextAt, type IdentityFixture } from './identity-harness.ts';

/**
 * Second remediation — the seven critical and high findings the independent adversarial rereview
 * reproduced against `fb851b9`.
 *
 * Every test here is an EXPLOIT that succeeded against that commit. Each one asserts the exploit is
 * now refused, so each one fails on the pre-fix version for the right reason: not because a schema
 * string changed, but because the database allowed the attack.
 *
 * The rereview's own methodological rule applies throughout and is the reason these tests are
 * worth anything: a PostgreSQL superuser bypasses row-level security unconditionally, so an attack
 * mounted as `postgres` proves nothing. Every attack below runs as `freightos_app` or over the
 * `freightos_admin` connection, and `assertRuntimeRole` proves which — a test that quietly
 * connected as the superuser would report a clean bill of health for a database with no controls
 * at all.
 *
 * The seven findings, and where each is exercised:
 *
 *   RC-B  forged privileged audit provenance                    §1  (CRITICAL)
 *   RC-A  idempotency inferred from forgeable audit evidence     §2  (CRITICAL)
 *   RC-C  borrowed-colleague self-elevation                      §3  (HIGH)
 *   RC-G  unauthorized kill-switch release                       §4  (HIGH)
 *   RC-H  cross-tenant kill-switch injection                     §4  (HIGH)
 *   RC-F  privilege amplification by hierarchy reparenting       §5  (HIGH)
 *   RC-J  credential revoke-and-re-mint outside node scope       §6  (HIGH)
 *
 * §7 holds the positive controls. A test suite that only proves things are refused cannot tell the
 * difference between a working boundary and a broken database, so every section that closes a door
 * also proves the legitimate path through it still opens.
 */
const db = new TestDatabase('freightos_test_authority_remediation');

let app: Client;
let adminConn: Client;
let fixtureConn: Client;
let a: IdentityFixture;
let b: IdentityFixture;

const AS_ADMIN = ['human', 'identity_administration'] as const;

/**
 * Prove the connection under test is the runtime role and holds none of the powers that would make
 * the result meaningless. Called at the head of every attacking suite.
 */
async function assertRuntimeRole(client: Client, expected: string): Promise<void> {
  const r = await client.query<{
    who: string;
    is_super: boolean;
    bypassrls: boolean;
    control_plane: boolean;
  }>(
    `SELECT current_user AS who,
            (SELECT rolsuper      FROM pg_roles WHERE rolname = current_user) AS is_super,
            (SELECT rolbypassrls  FROM pg_roles WHERE rolname = current_user) AS bypassrls,
            app.is_control_plane() AS control_plane`,
  );
  const row = r.rows[0]!;
  expect(row.who).toBe(expected);
  expect(row.is_super).toBe(false);
  expect(row.bypassrls).toBe(false);
  if (expected === 'freightos_app') expect(row.control_plane).toBe(false);
}

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  app = db.connectAs('freightos_app');
  await app.connect();
  adminConn = db.connectAs('freightos_admin');
  await adminConn.connect();
  fixtureConn = db.connectAs('postgres');
  await fixtureConn.connect();
  a = await seedIdentity(db, TENANT_A);
  b = await seedIdentity(db, TENANT_B);
}, 120_000);

afterAll(async () => {
  await app?.end();
  await adminConn?.end();
  await fixtureConn?.end();
});

// ---------------------------------------------------------------------------
// §1 — RC-B. Audit provenance. CRITICAL.
//
// `0003` granted INSERT on audit_events to freightos_app, there is no BEFORE INSERT trigger, and
// `0006`'s operation_class constraints are shape-only CHECKs that never constrain the writing
// role. So the runtime role could compose a `privileged` / `succeeded` ledger record naming
// anybody, at any time, with any connection provenance, for any tenant — including one that does
// not exist, because audit_events had no referential relationship to tenants.
//
// Append-only was real and is not the property that failed. UPDATE, DELETE and TRUNCATE were
// correctly refused throughout. Append-only stops a record being changed after the fact; it says
// nothing about whether the record was true when it was written.
// ---------------------------------------------------------------------------
describe('§1 audit provenance cannot be forged by the runtime role — RC-B', () => {
  const forge = async (overrides: Record<string, unknown>) => {
    const row = {
      tenant_id: TENANT_A,
      legal_entity_id: null,
      legal_authority_class: 'software_only',
      operating_context: 'system',
      actor_type: 'human',
      actor_id: `user:${a.adminUserId}`,
      event_type: 'rig.freight.identity.membership_granted.v1',
      resource_type: 'membership',
      resource_id: 'forged',
      correlation_id: randomUUID(),
      policy_version: 'v-forged',
      payload: JSON.stringify({ action: 'grant_membership' }),
      created_by: `user:${a.adminUserId}`,
      purpose: 'identity_administration',
      outcome: 'succeeded',
      operation_class: 'privileged',
      // `created_at` is deliberately absent so the column default applies. Supplying it as NULL
      // would make every case fail on NOT NULL instead of on the control under test.
      ...overrides,
    };
    const cols = Object.keys(row);
    const vals = Object.values(row);
    return app.query(
      `INSERT INTO audit_events (${cols.join(', ')})
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
      vals,
    );
  };

  it('runs as the runtime role, with no superuser, bypassrls or control-plane power', async () => {
    await app.query('BEGIN');
    await app.query(
      `SELECT set_config('app.tenant_id', $1, true),
              set_config('app.actor_id', 'user:' || $2, true),
              set_config('app.legal_authority_class', 'software_only', true),
              set_config('app.operating_context', 'system', true)`,
      [TENANT_A, a.adminUserId],
    );
    await assertRuntimeRole(app, 'freightos_app');
    await app.query('ROLLBACK');
  });

  const attack = (name: string, overrides: Record<string, unknown>) =>
    it(name, async () => {
      await app.query('BEGIN');
      await app.query(
        `SELECT set_config('app.tenant_id', $1, true),
                set_config('app.actor_id', 'user:' || $2, true),
                set_config('app.legal_authority_class', 'software_only', true),
                set_config('app.operating_context', 'system', true)`,
        [TENANT_A, a.adminUserId],
      );
      await expect(forge(overrides)).rejects.toThrow();
      await app.query('ROLLBACK');
    });

  // Ruling 2, item 1.
  attack('refuses a forged privileged/succeeded record', {});

  // Ruling 2, item 2. Thirty days in the past — the timeline is authoritative or it is decorative.
  attack('refuses a backdated authoritative timestamp', {
    created_at: new Date(Date.now() - 30 * 24 * 3600_000).toISOString(),
  });

  // Ruling 2, item 3.
  attack('refuses attribution to a fabricated actor', {
    actor_id: 'user:00000000-0000-4000-8000-00000000dead',
    created_by: 'user:00000000-0000-4000-8000-00000000dead',
  });

  // Ruling 2, item 4. The provenance stamp is what a reader would use to decide the record came
  // from an administrative connection. A caller that can write it can write that conclusion.
  attack('refuses caller-supplied connection provenance', {
    payload: JSON.stringify({
      action: 'grant_membership',
      connection: { session_user: 'freightos_admin', client_addr: '10.0.0.1' },
    }),
  });

  // Ruling 2, item 5. The session tenant is set to the fabricated one too — otherwise RLS
  // refuses the row for tenancy reasons and the referential control under test is never reached.
  it('refuses attribution to a tenant that does not exist', async () => {
    const ghost = '99999999-9999-4999-8999-999999999999';
    await app.query('BEGIN');
    await app.query(
      `SELECT set_config('app.tenant_id', $1, true),
              set_config('app.actor_id', 'user:' || $2, true),
              set_config('app.legal_authority_class', 'software_only', true),
              set_config('app.operating_context', 'system', true)`,
      [ghost, a.adminUserId],
    );
    await assertRuntimeRole(app, 'freightos_app');
    await expect(forge({ tenant_id: ghost })).rejects.toThrow();
    await app.query('ROLLBACK');
  });

  it('still refuses UPDATE, DELETE and TRUNCATE — the property that never failed', async () => {
    await app.query('BEGIN');
    await app.query(
      `SELECT set_config('app.tenant_id', $1, true),
              set_config('app.actor_id', 'user:' || $2, true),
              set_config('app.legal_authority_class', 'software_only', true),
              set_config('app.operating_context', 'system', true)`,
      [TENANT_A, a.adminUserId],
    );
    for (const sql of [
      'UPDATE audit_events SET outcome = $1',
      'DELETE FROM audit_events',
      'TRUNCATE audit_events',
    ]) {
      await expect(app.query(sql, sql.includes('$1') ? ['succeeded'] : [])).rejects.toThrow();
      await app.query('ROLLBACK');
      await app.query('BEGIN');
    }
    await app.query('ROLLBACK');
  });
});

// ---------------------------------------------------------------------------
// §2 — RC-A. Idempotency. CRITICAL.
//
// `admin.prior_success` read the audit ledger, filtering on correlation id, operation class,
// outcome and the action string — and on nothing else. Combined with §1 that made retry
// suppression writable by the caller: pre-register a forged `succeeded` row under a correlation
// id, and the real privileged call for that correlation id returns the forgery's id and performs
// no work. A revocation aimed at the caller is silently vetoed.
//
// Fixing §1 alone would close the demonstrated route. The model is still wrong: a security
// decision may not be inferred from evidence whose provenance is not itself authoritative.
// ---------------------------------------------------------------------------
describe('§2 retry suppression cannot be manufactured — RC-A', () => {
  it('a forged prior success does not suppress a real privileged operation', async () => {
    const correlation = randomUUID();
    const victimUser = randomUUID();

    await app.query('BEGIN');
    await app.query(
      `SELECT set_config('app.tenant_id', $1, true),
              set_config('app.actor_id', 'user:' || $2, true),
              set_config('app.legal_authority_class', 'software_only', true),
              set_config('app.operating_context', 'system', true)`,
      [TENANT_A, a.adminUserId],
    );
    await assertRuntimeRole(app, 'freightos_app');
    // Pre-register the veto. Must be refused outright after the §1 fix.
    await expect(
      app.query(
        `INSERT INTO audit_events
           (tenant_id, legal_authority_class, operating_context, actor_type, actor_id,
            event_type, resource_type, resource_id, correlation_id, payload, created_by,
            purpose, outcome, operation_class)
         VALUES ($1, 'software_only', 'system', 'human', 'user:' || $2,
            'rig.freight.identity.membership_revoked.v1', 'membership', $3, $4,
            $5::jsonb, 'user:' || $2, 'identity_administration', 'succeeded', 'privileged')`,
        [
          TENANT_A,
          a.adminUserId,
          victimUser,
          correlation,
          JSON.stringify({ action: 'revoke_membership' }),
        ],
      ),
    ).rejects.toThrow();
    await app.query('ROLLBACK');

    // And the authoritative operation under that correlation id still performs real work.
    const created = await adminConn.query<{ outcome: string; payload: Record<string, unknown> }>(
      `SELECT * FROM admin.grant_membership($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        TENANT_A,
        a.userId,
        a.regionNodeId,
        a.legalEntityId,
        `user:${a.adminUserId}`,
        ...AS_ADMIN,
        correlation,
      ],
    );
    expect(created.rows[0]!.outcome).not.toBe('denied');
  });

  it('a correlation id is scoped to its tenant, so one tenant cannot pre-empt another', async () => {
    // The same correlation id, used by both tenants for the same action. Before 0018 the
    // idempotency lookup filtered on correlation id and action alone, so whichever tenant went
    // first silently vetoed the other. The authoritative record is keyed on the tenant too.
    const correlation = randomUUID();
    const first = await adminConn.query<{ outcome: string; message: string | null }>(
      `SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        TENANT_A,
        a.regionNodeId,
        a.legalEntityId,
        `shared_corr_${randomUUID().replace(/-/g, '').slice(0, 8)}`,
        'Tenant A role',
        `user:${a.adminUserId}`,
        ...AS_ADMIN,
        correlation,
      ],
    );
    expect(first.rows[0]!.outcome).toBe('succeeded');

    const second = await adminConn.query<{ outcome: string; message: string | null }>(
      `SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        TENANT_B,
        b.regionNodeId,
        b.legalEntityId,
        `shared_corr_${randomUUID().replace(/-/g, '').slice(0, 8)}`,
        'Tenant B role',
        `user:${b.adminUserId}`,
        ...AS_ADMIN,
        correlation,
      ],
    );
    expect(second.rows[0]!.outcome).toBe('succeeded');
  });
});

// ---------------------------------------------------------------------------
// §3 — RC-C. Borrowed-colleague self-elevation. HIGH.
//
// `admin.authorization_refusal_reason` validated that the NAMED actor is a plausible principal of
// the tenant — real, active, unrevoked, in window. It never asked whether that actor holds the
// administrative capability the operation requires. The 0010 self-elevation guards compare the
// published actor against the target row, so naming any other real, active, same-tenant user
// flipped every one of them from refused to applied.
//
// The residual limitation is stated rather than papered over: at the database boundary there is
// still no cryptographic binding between the connection and the named human, and ADR-0026 §2 says
// so. What must not survive is the far larger hole — that an ORDINARY colleague, holding no
// administrative permission at all, is enough.
// ---------------------------------------------------------------------------
describe('§3 naming another principal does not confer their authority — RC-C', () => {
  let ordinaryUser: string;

  beforeAll(async () => {
    ordinaryUser = randomUUID();
    await withAuthenticatedTestPrincipal(db, fixtureAdministrator(a), async (c) => {
      await c.query(
        `INSERT INTO users (id, tenant_id, organization_node_id, legal_entity_id,
                              authentication_provider, authentication_subject, display_name,
                              status, created_by, updated_by)
           VALUES ($1, $2, $3, $4, 'test-idp', $5, 'Ordinary Colleague',
                   'active', 'test:seed', 'test:seed')`,
        [ordinaryUser, TENANT_A, a.legalEntityNodeId, a.legalEntityId, `ordinary-${ordinaryUser}`],
      );
    });
  });

  /** Every row of ruling 5's matrix, run through the same authority-bearing mutation. */
  const cases: ReadonlyArray<readonly [string, () => string]> = [
    ['a fabricated actor', () => `user:${randomUUID()}`],
    ['an ordinary colleague holding no administrative permission', () => `user:${ordinaryUser}`],
    ['a service account', () => `service_account:${a.serviceAccountId}`],
    ['an unlisted platform actor', () => 'system:not-an-approved-provisioner'],
    ['a target in another tenant', () => `user:${b.adminUserId}`],
    ['a malformed principal', () => 'user:not-a-uuid'],
  ];

  for (const [name, actor] of cases) {
    it(`refuses role creation authorised by ${name}`, async () => {
      const r = await adminConn.query<{ outcome: string; message: string | null }>(
        `SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          TENANT_A,
          a.regionNodeId,
          a.legalEntityId,
          `borrowed_${randomUUID().replace(/-/g, '').slice(0, 10)}`,
          'Borrowed authority',
          actor(),
          ...AS_ADMIN,
          randomUUID(),
        ],
      );
      expect(r.rows[0]!.outcome).toBe('denied');
    });
  }

  it('refuses a revoked principal even though it holds the permission', async () => {
    const revoked = randomUUID();
    await withAuthenticatedTestPrincipal(db, fixtureAdministrator(a), async (c) => {
      await c.query(
        `INSERT INTO users (id, tenant_id, organization_node_id, legal_entity_id,
                              authentication_provider, authentication_subject, display_name,
                              status, revoked_at, revoked_by, created_by, updated_by)
           VALUES ($1, $2, $3, $4, 'test-idp', $5, 'Revoked',
                   'revoked', now(), 'test:seed', 'test:seed', 'test:seed')`,
        [revoked, TENANT_A, a.legalEntityNodeId, a.legalEntityId, `revoked-${revoked}`],
      );
    });
    const r = await adminConn.query<{ outcome: string }>(
      `SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        TENANT_A,
        a.regionNodeId,
        a.legalEntityId,
        `revoked_${randomUUID().replace(/-/g, '').slice(0, 10)}`,
        'Revoked authority',
        `user:${revoked}`,
        ...AS_ADMIN,
        randomUUID(),
      ],
    );
    expect(r.rows[0]!.outcome).toBe('denied');
  });
});

// ---------------------------------------------------------------------------
// §4 — RC-G and RC-H. Kill switches. HIGH.
//
// `kill_switches_release` was a bare FOR UPDATE policy with no column restriction, freightos_app
// held table-wide UPDATE, and there was no BEFORE UPDATE guard. So a tenant could release a halt
// aimed at it, and rewrite an active switch in place.
//
// Separately, `app.resolve_kill_switch_mode` matched `scope_ref` alone for tenant, workflow, agent,
// tool and integration — the F-12 tenant predicate went into the `legal_entity` branch only. A row
// written under tenant A resolved against tenant B. Row-level security hid it from the victim's
// own session, which is why it was never noticed and not a reason it was safe: the control plane
// resolves without RLS and sees every row.
// ---------------------------------------------------------------------------
describe('§4 kill-switch authority is command-scoped and tenant-bound — RC-G, RC-H', () => {
  it('a tenant cannot release a control-plane halt aimed at it', async () => {
    const cp = db.connectAs('freightos_control_plane');
    await cp.connect();
    let switchId: string;
    try {
      const r = await cp.query<{ id: string }>(
        `INSERT INTO kill_switches
           (tenant_id, scope, scope_ref, mode, reason, engaged_by, engaged_by_type, created_by)
         VALUES ($1::uuid, 'tenant', $1::text, 'suspended', 'incident',
                 'user:' || $2, 'human', 'test')
         RETURNING id`,
        [TENANT_A, a.adminUserId],
      );
      switchId = r.rows[0]!.id;
    } finally {
      await cp.end();
    }

    await app.query('BEGIN');
    await app.query(
      `SELECT set_config('app.tenant_id', $1, true),
              set_config('app.actor_id', 'user:' || $2, true),
              set_config('app.legal_authority_class', 'software_only', true),
              set_config('app.operating_context', 'system', true)`,
      [TENANT_A, a.adminUserId],
    );
    await assertRuntimeRole(app, 'freightos_app');
    await expect(
      app.query(
        `UPDATE kill_switches
            SET released_at = now(), released_by = 'user:' || $2, released_by_type = 'human'
          WHERE id = $1`,
        [switchId, a.adminUserId],
      ),
    ).rejects.toThrow();
    await app.query('ROLLBACK');
  });

  it('a tenant cannot rewrite an active switch in place', async () => {
    await app.query('BEGIN');
    await app.query(
      `SELECT set_config('app.tenant_id', $1, true),
              set_config('app.actor_id', 'user:' || $2, true),
              set_config('app.legal_authority_class', 'software_only', true),
              set_config('app.operating_context', 'system', true)`,
      [TENANT_A, a.adminUserId],
    );
    await expect(
      app.query(`UPDATE kill_switches SET mode = 'enabled', reason = 'rewritten'`),
    ).rejects.toThrow();
    await app.query('ROLLBACK');
  });

  /**
   * The command path, not the table path.
   *
   * Every other test in this section attacks `kill_switches` directly, which is why all of them
   * kept passing while `app.engage_kill_switch` and `app.release_kill_switch` were refusing
   * everybody for an unrelated reason. A control installed as a replacement has to be attacked
   * where it lives.
   */
  it('the command derives the human rather than accepting a claimed one', async () => {
    // SR-2 — the attack moved, because the claim did. Before 0019 the actor id WAS the session's
    // identity, so setting it was the whole attack. Now it is a caller-supplied string the
    // database ignores, so the attack is: hold a legitimate verified session and forge the claim
    // on top of it. Without the session the command refuses for want of tenant context, which
    // would be a refusal for the wrong reason and no evidence about Article V.1 at all.
    const attempt = (actor: string) =>
      withAuthenticatedTestPrincipal(db, fixtureAdministrator(a), async (c) => {
        await c.query('SELECT set_config($1, $2, true)', ['app.actor_id', actor]);
        return c.query(`SELECT app.engage_kill_switch('workflow', $1, 'suspended', 'probe')`, [
          `claimed-${randomUUID()}`,
        ]);
      }).then(
        () => 'ENGAGED',
        (e: { message: string }) => e.message,
      );

    // SR-2 — SAME PROPERTY, STRONGER EVIDENCE, INVERTED SHAPE.
    //
    // The title still describes what is proven: the command derives the human rather than
    // accepting a claimed one. What changed is how that shows up. Before 0019 the claim WAS the
    // identity, so a non-human claim produced a refusal, and the refusal was the proof. Now the
    // claim is a string the database does not read: the command proceeds as the VERIFIED human and
    // records them. Asserting a refusal here would be asserting that the forgery still reaches the
    // decision — the opposite of the fix.
    //
    // Article V.1's human reservation has not lost coverage. It is enforced on the binding's
    // enumerated principal_type and proved in sr2-binding-runtime.test.ts, gate O, where a verified
    // SERVICE principal claiming `user:<alice>` is refused outright with "only an active human
    // principal may engage a kill switch". That is the case that can still legitimately fail; this
    // one no longer can, because there is no longer a door for the claim to knock on.
    for (const actor of [
      'agent:dispatch-copilot',
      'model:extraction',
      `service_account:${a.serviceAccountId}`,
      `user:${randomUUID()}`,
    ]) {
      expect(await attempt(actor), actor).toBe('ENGAGED');
    }

    // And the engagement is attributed to the verified administrator, never to the claim.
    const attributed = await withAuthenticatedTestPrincipal(
      db,
      fixtureAdministrator(a),
      async (c) => {
        await c.query('SELECT set_config($1, $2, true)', [
          'app.actor_id',
          'agent:dispatch-copilot',
        ]);
        const scopeRef = `claimed-attribution-${randomUUID()}`;
        await c.query(`SELECT app.engage_kill_switch('workflow', $1, 'suspended', 'probe')`, [
          scopeRef,
        ]);
        const r = await c.query<{ engaged_by: string; engaged_by_type: string }>(
          'SELECT engaged_by, engaged_by_type FROM kill_switches WHERE scope_ref = $1',
          [scopeRef],
        );
        return r.rows[0]!;
      },
    );
    expect(attributed.engaged_by).toBe(`user:${a.adminUserId}`);
    expect(attributed.engaged_by_type).toBe('human');
    expect(attributed.engaged_by).not.toContain('dispatch-copilot');
  });

  it('a tenant session cannot engage a scope reserved to the control plane', async () => {
    for (const scope of ['system', 'legal_plane']) {
      const r = await withAuthenticatedTestPrincipal(db, fixtureAdministrator(a), (c) =>
        c.query(`SELECT app.engage_kill_switch($1, NULL, 'suspended', 'probe')`, [scope]),
      ).then(
        () => 'ENGAGED',
        (e: { message: string }) => e.message,
      );
      expect(r, scope).toMatch(/may only be engaged by the control plane/);
    }
  });

  it('the command refuses a release of a switch belonging to another tenant', async () => {
    const foreign = await fixtureConn.query<{ id: string }>(
      `INSERT INTO kill_switches (tenant_id, scope, scope_ref, mode, reason,
         engaged_by, engaged_by_type, created_by)
       VALUES ($1::uuid, 'workflow', $2::text, 'suspended', 'B only',
               'user:' || $3, 'human', 'test')
       RETURNING id`,
      [TENANT_B, `foreign-${randomUUID()}`, b.adminUserId],
    );
    const id = foreign.rows[0]!.id;
    const r = await withAuthenticatedTestPrincipal(db, fixtureAdministrator(a), (c) =>
      c.query(`SELECT app.release_kill_switch($1)`, [id]),
    ).then(
      () => 'RELEASED',
      (e: { message: string }) => e.message,
    );
    expect(r).toMatch(/is not releasable by this tenant/);
    const still = await fixtureConn.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM kill_switches WHERE id = $1 AND released_at IS NULL`,
      [id],
    );
    expect(Number(still.rows[0]!.n)).toBe(1);
  });

  it('an agent-driven session cannot engage a switch by typing human', async () => {
    await app.query('BEGIN');
    await app.query(
      `SELECT set_config('app.tenant_id', $1, true),
              set_config('app.actor_id', 'agent:dispatch-copilot', true),
              set_config('app.legal_authority_class', 'software_only', true),
              set_config('app.operating_context', 'system', true)`,
      [TENANT_A],
    );
    await expect(
      app.query(
        `INSERT INTO kill_switches
           (tenant_id, scope, scope_ref, mode, reason, engaged_by, engaged_by_type, created_by)
         VALUES ($1, 'workflow', 'wf-1', 'suspended', 'by an agent',
                 'agent:dispatch-copilot', 'human', 'agent:dispatch-copilot')`,
        [TENANT_A],
      ),
    ).rejects.toThrow();
    await app.query('ROLLBACK');
  });

  it('a switch written under one tenant does not resolve against another — RC-H', async () => {
    const cp = db.connectAs('freightos_control_plane');
    await cp.connect();
    try {
      await cp.query(
        `INSERT INTO kill_switches
           (tenant_id, scope, scope_ref, mode, reason, engaged_by, engaged_by_type, created_by)
         VALUES ($1, 'workflow', 'shared-workflow-id', 'suspended', 'A only',
                 'user:' || $2, 'human', 'test')`,
        [TENANT_A, a.adminUserId],
      );
      // Resolved without RLS, exactly as the control plane does it.
      const r = await cp.query<{ mode: string }>(
        `SELECT app.resolve_kill_switch_mode($1, NULL, 'shared-workflow-id')::text AS mode`,
        [TENANT_B],
      );
      expect(r.rows[0]!.mode).toBe('enabled');
    } finally {
      await cp.end();
    }
  });

  it('one tenant cannot deny another the ability to engage its own switch — RC-I', async () => {
    const cp = db.connectAs('freightos_control_plane');
    await cp.connect();
    try {
      await cp.query(
        `INSERT INTO kill_switches
           (tenant_id, scope, scope_ref, mode, reason, engaged_by, engaged_by_type, created_by)
         VALUES ($1, 'agent', 'squatted-agent', 'suspended', 'A', 'user:' || $2, 'human', 'test')`,
        [TENANT_A, a.adminUserId],
      );
      await expect(
        cp.query(
          `INSERT INTO kill_switches
             (tenant_id, scope, scope_ref, mode, reason, engaged_by, engaged_by_type, created_by)
           VALUES ($1, 'agent', 'squatted-agent', 'suspended', 'B', 'user:' || $2, 'human', 'test')`,
          [TENANT_B, b.adminUserId],
        ),
      ).resolves.toBeDefined();
    } finally {
      await cp.end();
    }
  });
});

// ---------------------------------------------------------------------------
// §5 — RC-F. Hierarchy reparenting. HIGH.
//
// `organization_nodes` RLS is tenant-only while every sub-resource enforces
// `app.organization_node_scope_ok`, and freightos_app held table-wide UPDATE. So a caller scoped to
// a terminal could reparent its own node up the tree and acquire scope over its siblings'
// resources — no permission row added, effective authority increased. A graph can stay acyclic,
// stay inside its depth bound, stay inside its tenant, and still be an escalation.
// ---------------------------------------------------------------------------
describe('§5 reparenting is an authority mutation — RC-F', () => {
  // A second region with its own terminal. A caller scoped to the fixture's region cannot see
  // anything under this one — which is exactly the boundary the reparent crosses.
  let foreignRegion: string;
  let foreignTerminal: string;

  beforeAll(async () => {
    foreignRegion = randomUUID();
    foreignTerminal = randomUUID();
    await withAuthenticatedTestPrincipal(db, fixtureAdministrator(a), async (c) => {
      for (const [id, parent, type, name] of [
        [foreignRegion, a.legalEntityNodeId, 'region', 'East'],
        [foreignTerminal, foreignRegion, 'terminal', 'East Terminal'],
      ] as const) {
        await c.query(
          `INSERT INTO organization_nodes
               (id, tenant_id, organization_node_id, parent_id, node_type, name, created_by)
             VALUES ($1, $2, $1, $3, $4, $5, 'test:seed')`,
          [id, TENANT_A, parent, type, name],
        );
      }
    });
  });

  it('a caller scoped to one region cannot see the other region subtree', async () => {
    await withLegalContext(
      app,
      systemContextAt(TENANT_A, a.regionNodeId, a.legalEntityId, `user:${a.adminUserId}`),
      async (c) => {
        const r = await c.query(
          'SELECT 1 FROM organization_node_closure WHERE ancestor_id = $1 AND descendant_id = $2',
          [a.regionNodeId, foreignTerminal],
        );
        expect(r.rowCount).toBe(0);
      },
    );
  });

  it('the runtime role cannot reparent a node into its own scope', async () => {
    // Type-legal in every respect: a terminal may sit under a region, the tenant does not change,
    // no cycle is formed and the depth bound is not exceeded. The graph stays valid and the
    // caller's effective authority grows — which is why structural validation is not enough.
    await app.query('BEGIN');
    await app.query(
      `SELECT set_config('app.tenant_id', $1, true),
              set_config('app.actor_id', 'user:' || $2, true),
              set_config('app.legal_authority_class', 'software_only', true),
              set_config('app.operating_context', 'system', true),
              set_config('app.organization_node_id', $3, true)`,
      [TENANT_A, a.adminUserId, a.regionNodeId],
    );
    await assertRuntimeRole(app, 'freightos_app');
    await expect(
      app.query('UPDATE organization_nodes SET parent_id = $1 WHERE id = $2', [
        a.regionNodeId,
        foreignTerminal,
      ]),
    ).rejects.toThrow();
    await app.query('ROLLBACK');
  });

  it('the runtime role can still rename a node it legitimately holds', async () => {
    await withAuthenticatedTestPrincipal(db, fixtureAdministrator(a), async (c) => {
      const r = await c.query('UPDATE organization_nodes SET name = $1 WHERE id = $2', [
        'Renamed Terminal',
        a.terminalNodeId,
      ]);
      expect(r.rowCount).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// §6 — RC-J. Credential lifecycle. HIGH.
//
// `service_accounts` is tenant AND organization-node scoped; `service_account_credentials` was
// tenant-scoped only, and freightos_app held SELECT/INSERT/UPDATE on it. So a caller scoped to a
// node that cannot see a service account could still revoke that account's credential and mint a
// replacement — acquiring lifecycle authority over a subject it has no scope over.
// ---------------------------------------------------------------------------
describe('§6 credential lifecycle is bound to the subject scope — RC-J', () => {
  it('a caller outside the account node scope cannot see its credential', async () => {
    await withLegalContext(
      app,
      systemContextAt(TENANT_A, a.terminalNodeId, a.legalEntityId, `user:${a.adminUserId}`),
      async (c) => {
        const r = await c.query('SELECT id FROM service_account_credentials WHERE id = $1', [
          a.serviceAccountCredentialId,
        ]);
        expect(r.rowCount).toBe(0);
      },
    );
  });

  it('a caller outside the account node scope cannot revoke its credential', async () => {
    await withLegalContext(
      app,
      systemContextAt(TENANT_A, a.terminalNodeId, a.legalEntityId, `user:${a.adminUserId}`),
      async (c) => {
        const r = await c.query(
          `UPDATE service_account_credentials
              SET status = 'revoked', revoked_at = now(), revoked_by = 'attacker'
            WHERE id = $1`,
          [a.serviceAccountCredentialId],
        );
        expect(r.rowCount).toBe(0);
      },
    );
  });

  it('a caller outside the account node scope cannot mint a replacement', async () => {
    await withLegalContext(
      app,
      systemContextAt(TENANT_A, a.terminalNodeId, a.legalEntityId, `user:${a.adminUserId}`),
      async (c) => {
        await expect(
          c.query(
            `INSERT INTO service_account_credentials
               (tenant_id, service_account_id, credential_type, credential_reference,
                fingerprint, created_by, updated_by)
             VALUES ($1, $2, 'external_secret_reference', 'vault:freightos/reminted', $3,
                     'attacker', 'attacker')`,
            [TENANT_A, a.serviceAccountId, `fp-${randomUUID()}`],
          ),
        ).rejects.toThrow();
      },
    );
  });
});

// ---------------------------------------------------------------------------
// §7 — Positive controls.
//
// Every section above closes a door. These prove the legitimate path through each one still opens,
// so a database that refused everything could not pass this file.
// ---------------------------------------------------------------------------
describe('§7 legitimate operations still succeed', () => {
  /**
   * The control that was missing, and the omission that let a real regression ship.
   *
   * §4 revoked table-wide INSERT and UPDATE on kill_switches from freightos_app and installed
   * `app.engage_kill_switch` / `app.release_kill_switch` as the only remaining way for a tenant to
   * work one. Nothing in this file — or anywhere else — ever called either command. Both consult
   * `app.current_human_principal()` first, that function is a definer owned by
   * freightos_hierarchy_owner, and the owner had no SELECT on `users`, so both raised
   * `permission denied for table users` for every caller. The hole was closed and no door was
   * left, and every §4 test still passed because each one exercises the direct-table path.
   *
   * A suite that only proves refusals cannot tell a working boundary from a broken database. This
   * is the positive control that says which one it is.
   */
  it('a tenant can engage and release its own kill switch through the command', async () => {
    // Its own workflow scope_ref, so this neither shadows nor is shadowed by the switches §4
    // leaves engaged — precedence between scopes is resolve_kill_switch_mode's subject, not this
    // test's, and entangling the two would make a failure here ambiguous.
    // Tenant B, whose only switch in this file is agent-scoped: resolution here is about the
    // workflow row this test writes, not about which of several engaged switches wins.
    const workflow = `legitimate-${randomUUID()}`;

    const id = await withAuthenticatedTestPrincipal(db, fixtureAdministrator(b), async (c) => {
      await assertRuntimeRole(c as Client, 'freightos_app');
      const r = await c.query<{ id: string }>(
        `SELECT app.engage_kill_switch('workflow', $1, 'read_only', 'legitimate halt') AS id`,
        [workflow],
      );
      return r.rows[0]!.id;
    });
    expect(id).toBeTruthy();

    // Engaged, and with provenance derived from the session rather than supplied by the caller.
    const engaged = await fixtureConn.query<{
      tenant_id: string;
      mode: string;
      engaged_by: string;
      engaged_by_type: string;
      released_at: string | null;
    }>(
      `SELECT tenant_id::text, mode::text, engaged_by, engaged_by_type, released_at
         FROM kill_switches WHERE id = $1`,
      [id],
    );
    expect(engaged.rows[0]).toEqual({
      tenant_id: TENANT_B,
      mode: 'read_only',
      engaged_by: `user:${b.adminUserId}`,
      engaged_by_type: 'human',
      released_at: null,
    });

    // It is real rather than merely recorded: it resolves for the workflow it names.
    const resolved = await fixtureConn.query<{ mode: string }>(
      `SELECT app.resolve_kill_switch_mode($1, NULL, $2, NULL, NULL, NULL, NULL, NULL) AS mode`,
      [TENANT_B, workflow],
    );
    expect(resolved.rows[0]!.mode).toBe('read_only');

    const released = await withAuthenticatedTestPrincipal(
      db,
      fixtureAdministrator(b),
      async (c) => {
        const r = await c.query<{ ok: boolean }>(`SELECT app.release_kill_switch($1) AS ok`, [id]);
        return r.rows[0]!.ok;
      },
    );
    expect(released).toBe(true);

    const after = await fixtureConn.query<{ released_by: string; released_by_type: string }>(
      `SELECT released_by, released_by_type FROM kill_switches
        WHERE id = $1 AND released_at IS NOT NULL`,
      [id],
    );
    expect(after.rows[0]).toEqual({
      released_by: `user:${b.adminUserId}`,
      released_by_type: 'human',
    });
    const afterResolve = await fixtureConn.query<{ mode: string }>(
      `SELECT app.resolve_kill_switch_mode($1, NULL, $2, NULL, NULL, NULL, NULL, NULL) AS mode`,
      [TENANT_B, workflow],
    );
    expect(afterResolve.rows[0]!.mode).toBe('enabled');
  });

  it('the human-principal predicate the two commands rest on can read what it must', async () => {
    // Stated as a privilege fact as well as a behavioural one, because the behavioural version
    // above is the one that broke and a grant is the thing that fixes it.
    const r = await fixtureConn.query<{ ok: boolean }>(
      `SELECT has_table_privilege('freightos_hierarchy_owner', 'users', 'SELECT') AS ok`,
    );
    expect(r.rows[0]!.ok).toBe(true);

    // And nothing wider on that table came with it — read only, no write of any kind. Its other
    // grants belong to 0007, for the closure triggers it owns, and are not 0018's business.
    const onUsers = await fixtureConn.query<{ p: string }>(
      `SELECT privilege_type AS p FROM information_schema.table_privileges
        WHERE grantee = 'freightos_hierarchy_owner' AND table_name = 'users'
        ORDER BY privilege_type`,
    );
    expect(onUsers.rows.map((x) => x.p)).toEqual(['SELECT']);
  });

  it('a domain audit event is still recordable by the runtime role', async () => {
    await withAuthenticatedTestPrincipal(db, fixtureAdministrator(a), async (c) => {
      const r = await c.query<{ id: string }>(
        `SELECT app.record_audit_event(
             'rig.freight.identity.user_viewed.v1', 'user', $1, $2, NULL,
             'identity_administration', $3::jsonb) AS id`,
        [a.userId, randomUUID(), JSON.stringify({ note: 'legitimate domain event' })],
      );
      expect(r.rows[0]!.id).toBeTruthy();
    });
  });

  it('the recorded event carries derived, not supplied, provenance', async () => {
    const correlation = randomUUID();
    await withAuthenticatedTestPrincipal(db, fixtureAdministrator(a), async (c) => {
      await c.query(
        `SELECT app.record_audit_event(
             'rig.freight.identity.user_viewed.v1', 'user', $1, $2, NULL,
             'identity_administration',
             $3::jsonb)`,
        [
          a.userId,
          correlation,
          JSON.stringify({
            // A caller trying to smuggle authoritative fields through the descriptive channel.
            connection: { session_user: 'freightos_admin' },
            operation_class: 'privileged',
            outcome: 'succeeded',
          }),
        ],
      );
    });
    const r = await fixtureConn.query<{
      operation_class: string;
      actor_id: string;
      tenant_id: string;
      session_user: string | null;
    }>(
      `SELECT operation_class, actor_id, tenant_id::text,
              payload -> 'provenance' ->> 'session_user' AS session_user
         FROM audit_events WHERE correlation_id = $1`,
      [correlation],
    );
    const row = r.rows[0]!;
    expect(row.operation_class).toBe('domain');
    expect(row.actor_id).toBe(`user:${a.adminUserId}`);
    expect(row.tenant_id).toBe(TENANT_A);
    // Derived from the real connection, not from the caller's payload.
    expect(row.session_user).toBe('freightos_app');
  });

  it('an administrator holding the permission can still create a role', async () => {
    const r = await adminConn.query<{ outcome: string; message: string | null }>(
      `SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        TENANT_A,
        a.regionNodeId,
        a.legalEntityId,
        `legit_${randomUUID().replace(/-/g, '').slice(0, 10)}`,
        'Legitimate role',
        `user:${a.adminUserId}`,
        ...AS_ADMIN,
        randomUUID(),
      ],
    );
    expect(r.rows[0]!.outcome).toBe('succeeded');
  });

  it('a caller inside the account node scope can still read its credential', async () => {
    await withAuthenticatedTestPrincipal(db, fixtureAdministrator(a), async (c) => {
      const r = await c.query('SELECT id FROM service_account_credentials WHERE id = $1', [
        a.serviceAccountCredentialId,
      ]);
      expect(r.rowCount).toBe(1);
    });
  });
});
