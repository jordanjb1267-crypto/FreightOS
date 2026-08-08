import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_A, TENANT_B, TestDatabase } from './harness.ts';
import { seedIdentity, type IdentityFixture } from './identity-harness.ts';
import { fixtureAdministrator, withAuthenticatedTestPrincipal } from './verified-test-auth.ts';

/**
 * SR-2 — finding F-A. Can a holder of a legitimate connection role name somebody else as the
 * authoritative actor?
 *
 * There are two inputs that could carry a claimed identity, and SR-2 answers them differently. This
 * file states both answers precisely, because the honest result is a split one and a suite that
 * blurred it would be claiming a closure that does not exist.
 *
 *   PATH 2 — `set_config('app.actor_id', …)` on the runtime role. CLOSED. The verified binding is
 *   the only identity a `freightos_app` session has; a raw GUC establishes nothing, so the session
 *   cannot borrow a real privileged human, cannot reach a consequential command, and cannot write
 *   provenance naming somebody else.
 *
 *   PATH 1 — the `p_actor` argument on the `admin.*` boundary. NOT closed, and not closable inside
 *   SR-2. Migration 0020 §7 records why: the mint "does NOT authenticate anybody… the same trust
 *   anchor admin.* already rests on, and the only one available until a production adapter exists",
 *   and ADR-0027 §7 records that no authentication provider ships. Making `admin.*` verify p_actor
 *   against a binding is circular, because minting a binding needs the same control-plane
 *   credential. Recorded as CONTROL_PLANE_ACTOR_AUTHENTICITY=UNRESOLVED, Section E of
 *   docs/security-resilience/SR2_FOLLOW_ON_REQUIREMENTS.md.
 *
 * So for path 1 this file asserts the BOUNDED properties that are actually true — the permission
 * check bites, and the boundary does not reach across tenants — and deliberately does NOT assert
 * that a privileged human cannot be borrowed. That would be a false green, and the whole point of
 * F-A is that somebody believed a denial meant more than it did.
 *
 * Every negative case has a positive control, because a boundary that refuses everything is not a
 * boundary.
 */
const db = new TestDatabase('freightos_test_sr2_actor_authenticity');

let app: Client;
let admin: Client;
let su: Client;
let a: IdentityFixture;

/** A uuid that is no user anywhere, in any tenant. */
const FABRICATED = '00000000-0000-4000-8000-0000000000fa';

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  app = db.connectAs('freightos_app');
  await app.connect();
  admin = db.connectAs('freightos_admin');
  await admin.connect();
  su = db.connectAs('postgres');
  await su.connect();
  a = await seedIdentity(db, TENANT_A);
}, 120_000);

afterAll(async () => {
  await app?.end();
  await admin?.end();
  await su?.end();
});

/** Claim every identity GUC the legacy path ever read, as the runtime role. */
async function claimIdentity(actorId: string): Promise<void> {
  for (const [k, v] of [
    ['app.tenant_id', TENANT_A],
    ['app.actor_id', actorId],
    ['app.organization_node_id', a.legalEntityNodeId],
    ['app.legal_entity_id', a.legalEntityId],
    ['app.legal_authority_class', 'software_only'],
    ['app.operating_context', 'system'],
  ] as const) {
    await app.query('SELECT set_config($1, $2, false)', [k, v]);
  }
}

async function clearClaims(): Promise<void> {
  for (const k of [
    'app.tenant_id',
    'app.actor_id',
    'app.organization_node_id',
    'app.legal_entity_id',
    'app.legal_authority_class',
    'app.operating_context',
  ]) {
    await app.query('SELECT set_config($1, NULL, false)', [k]);
  }
}

async function regionAncestors(): Promise<string[]> {
  const r = await su.query<{ ancestor_id: string }>(
    `SELECT ancestor_id FROM organization_node_closure WHERE descendant_id = $1 ORDER BY depth`,
    [a.regionNodeId],
  );
  return r.rows.map((x) => x.ancestor_id);
}

describe('F-A path 2 — app.actor_id establishes no authoritative identity', () => {
  it('resolves nothing from a claimed identity, fabricated or real', async () => {
    for (const [label, actor] of [
      ['fabricated', `user:${FABRICATED}`],
      // Borrowing a REAL, privileged human is the stronger case: the uuid exists and holds the
      // permission, so only the binding requirement can be what refuses it.
      ['borrowed real administrator', `user:${a.adminUserId}`],
    ] as const) {
      await claimIdentity(actor);
      const r = await app.query<{ h: string | null; t: string | null; ac: string | null }>(
        `SELECT app.current_human_principal()::text AS h,
                app.current_tenant_id()::text AS t,
                app.current_actor_id() AS ac`,
      );
      expect(r.rows[0]!.h, `${label}: a human principal resolved`).toBeNull();
      expect(r.rows[0]!.t, `${label}: a tenant resolved`).toBeNull();
      expect(r.rows[0]!.ac, `${label}: an actor resolved`).toBeNull();
    }
    await clearClaims();
  });

  it('reads no rows while claiming a real administrator', async () => {
    await claimIdentity(`user:${a.adminUserId}`);
    const r = await app.query('SELECT id FROM users');
    expect(r.rowCount, 'a claimed identity granted row visibility').toBe(0);
    await clearClaims();
  });

  it('cannot engage a kill switch — the act Art. V.1 reserves to humans', async () => {
    await claimIdentity(`user:${a.adminUserId}`);
    const reason = `fa-${randomUUID()}`;
    const err = await app
      .query(
        `SELECT app.engage_kill_switch('tenant'::app.kill_switch_scope, $1,
                'suspended'::app.kill_switch_mode, $2)`,
        [TENANT_A, reason],
      )
      .then(
        () => null,
        (e: Error) => e.message,
      );
    expect(err, 'a claimed identity engaged a kill switch').not.toBeNull();
    const n = await su.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM kill_switches WHERE reason = $1`,
      [reason],
    );
    expect(Number(n.rows[0]!.n), 'a kill switch was engaged from a claimed identity').toBe(0);
    await clearClaims();
  });

  it('POSITIVE CONTROL: the same operations succeed through a verified binding', async () => {
    const reason = `legit-${randomUUID()}`;
    const out = await withAuthenticatedTestPrincipal(db, fixtureAdministrator(a), async (c) => {
      const who = await c.query<{ h: string | null; t: string | null }>(
        `SELECT app.current_human_principal()::text AS h, app.current_tenant_id()::text AS t`,
      );
      const rows = await c.query('SELECT id FROM users');
      const ks = await c.query<{ id: string }>(
        `SELECT app.engage_kill_switch('workflow'::app.kill_switch_scope, $1,
                'read_only'::app.kill_switch_mode, $2) AS id`,
        [`wf-${reason}`, reason],
      );
      return { who: who.rows[0]!, visible: rows.rowCount ?? 0, ks: ks.rows[0]!.id };
    });
    expect(out.who.h, 'the verified administrator did not resolve').toBe(a.adminUserId);
    expect(out.who.t).toBe(TENANT_A);
    expect(out.visible, 'the verified administrator could read nothing').toBeGreaterThan(0);
    expect(out.ks).toBeTruthy();

    // And the provenance names the real actor, derived rather than supplied.
    const row = await su.query<{ engaged_by: string; engaged_by_type: string }>(
      `SELECT engaged_by, engaged_by_type FROM kill_switches WHERE reason = $1`,
      [reason],
    );
    expect(row.rows[0]!.engaged_by).toBe(`user:${a.adminUserId}`);
    expect(row.rows[0]!.engaged_by_type).toBe('human');
  });
});

/**
 * F-A path 1 — the admin boundary's p_actor argument.
 *
 * These assert the bounds that hold. They do NOT assert that a privileged human cannot be borrowed,
 * because measurement says otherwise and Section E records why that is not fixable here.
 */
describe('F-A path 1 — the bounded properties of the admin p_actor argument', () => {
  it('refuses an actor that is no user of the tenant', async () => {
    const before = await regionAncestors();
    const r = await admin.query<{ outcome: string; message: string | null }>(
      'SELECT * FROM admin.move_organization_node($1,$2,$3,$4,$5,$6,$7)',
      [
        TENANT_A,
        a.regionNodeId,
        a.enterpriseNodeId,
        `user:${FABRICATED}`,
        'human',
        'identity_administration',
        randomUUID(),
      ],
    );
    expect(r.rows[0]!.outcome).toBe('denied');
    expect(r.rows[0]!.message, 'denied for the wrong reason').toMatch(/is not a user of tenant/i);
    expect(await regionAncestors(), 'a refused call still moved the node').toEqual(before);
  });

  it('refuses a real user of the tenant who does not hold the permission', async () => {
    const before = await regionAncestors();
    const r = await admin.query<{ outcome: string; message: string | null }>(
      'SELECT * FROM admin.move_organization_node($1,$2,$3,$4,$5,$6,$7)',
      [
        TENANT_A,
        a.regionNodeId,
        a.enterpriseNodeId,
        `user:${a.userId}`,
        'human',
        'identity_administration',
        randomUUID(),
      ],
    );
    expect(r.rows[0]!.outcome).toBe('denied');
    expect(r.rows[0]!.message, 'denied for the wrong reason').toMatch(/does not hold/i);
    expect(await regionAncestors()).toEqual(before);
  });

  it('does not let an actor of one tenant act on another', async () => {
    // The administrator is real and permissioned in TENANT_A. Naming TENANT_B must not carry that.
    const r = await admin.query<{ outcome: string; message: string | null }>(
      'SELECT * FROM admin.move_organization_node($1,$2,$3,$4,$5,$6,$7)',
      [
        TENANT_B,
        a.regionNodeId,
        a.enterpriseNodeId,
        `user:${a.adminUserId}`,
        'human',
        'identity_administration',
        randomUUID(),
      ],
    );
    expect(r.rows[0]!.outcome).toBe('denied');
    expect(r.rows[0]!.message, 'cross-tenant call denied for the wrong reason').toMatch(
      /is not a user of tenant/i,
    );
  });

  it('records the OPEN residual rather than asserting a closure that does not exist', async () => {
    // CONTROL_PLANE_ACTOR_AUTHENTICITY=UNRESOLVED. A holder of the freightos_admin connection can
    // still name a real, permissioned human and act as them, and the ledger will record that human.
    // This case exists so the suite states the residual instead of implying it away — if a future
    // change closes it, this test fails and must be replaced by the real negative assertion.
    const r = await admin.query<{ outcome: string }>(
      'SELECT * FROM admin.move_organization_node($1,$2,$3,$4,$5,$6,$7)',
      [
        TENANT_A,
        a.regionNodeId,
        a.legalEntityNodeId,
        `user:${a.adminUserId}`,
        'human',
        'identity_administration',
        randomUUID(),
      ],
    );
    expect(
      r.rows[0]!.outcome,
      'p_actor borrowing now appears closed — Section E and this test must be updated',
    ).toBe('succeeded');
  });
});
