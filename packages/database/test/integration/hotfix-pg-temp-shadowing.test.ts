import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_A, TestDatabase } from './harness.ts';
import { seedIdentity, type IdentityFixture } from './identity-harness.ts';
import { fixtureAdministrator, withAuthenticatedTestPrincipal } from './verified-test-auth.ts';

/**
 * Migration 0019 — pg_temp SECURITY DEFINER relation shadowing hotfix.
 *
 * THE DEFECT THIS CLOSES. Every authorization function in schemas app and admin reads its tables by
 * unqualified name, and each SECURITY DEFINER pinned `search_path = pg_catalog, public`. PostgreSQL
 * searches `pg_temp` FIRST for relations whenever it is not explicitly listed — inside a definer
 * too. TEMPORARY was granted to PUBLIC by default, so any connectable role could create a table
 * that shadows the one an authorization function reads, and become anyone.
 *
 * Reproduced on unmodified main (1..18), two authority crossings:
 *   - freightos_admin shadowed the admin authorization chain and reparented a REAL organization node
 *     as a fabricated actor, writing a forged `succeeded` audit row;
 *   - freightos_app (the ordinary runtime role) shadowed `users` so app.current_human_principal
 *     resolved a fabricated human, and engaged a real tenant kill switch — an act Art. V.1 reserves
 *     to humans.
 *
 * These tests assert the PROPERTY (a caller cannot move the authorization boundary by shadowing),
 * not the mechanism, so they survive a future stronger remediation. Each negative case carries a
 * positive control, because a control that refuses everything is not a control (the kill-switch
 * lesson: a denial for the wrong reason is not evidence).
 *
 * This is a TWO-layer closure and is documented as such:
 *   Layer 1 — no runtime/control-plane role holds TEMPORARY, so the shadow cannot be created;
 *   Layer 2 — every definer lists pg_temp LAST, so even a shadow that exists is not resolved.
 * No function body was schema-qualified, so there is no independent third layer; full qualification
 * is a follow-up hardening item.
 */
const db = new TestDatabase('freightos_test_hotfix_pg_temp');

let app: Client;
let admin: Client;
let su: Client;
let a: IdentityFixture;

const FAKE = '00000000-0000-4000-8000-0000000000ff';
const FAKE_ACTOR = `user:${FAKE}`;

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

/** The six authority relations the admin authorization chain reads, shadowed to authorize FAKE. */
async function buildAuthorizationShadow(c: Client): Promise<void> {
  await c.query(`CREATE TEMP TABLE users (id uuid, tenant_id uuid, status text, revoked_at timestamptz,
    effective_from timestamptz, effective_to timestamptz)`);
  await c.query(`CREATE TEMP TABLE memberships (id uuid, tenant_id uuid, user_id uuid, status text,
    revoked_at timestamptz, effective_from timestamptz, effective_to timestamptz)`);
  await c.query(`CREATE TEMP TABLE membership_roles (tenant_id uuid, membership_id uuid, role_id uuid,
    revoked_at timestamptz, effective_from timestamptz, effective_to timestamptz)`);
  await c.query(`CREATE TEMP TABLE roles (id uuid, tenant_id uuid, status text, revoked_at timestamptz,
    effective_from timestamptz, effective_to timestamptz)`);
  await c.query(`CREATE TEMP TABLE role_permissions (tenant_id uuid, role_id uuid, permission_id uuid,
    revoked_at timestamptz, effective_from timestamptz, effective_to timestamptz)`);
  await c.query(`CREATE TEMP TABLE permissions (id uuid, key text)`);
  const m = 'aaaaaaaa-0000-4000-8000-000000000001';
  const r = 'bbbbbbbb-0000-4000-8000-000000000002';
  const p = 'cccccccc-0000-4000-8000-000000000003';
  await c.query(
    `INSERT INTO pg_temp.users VALUES ($1,$2,'active',NULL,now()-interval '1 day',NULL)`,
    [FAKE, TENANT_A],
  );
  await c.query(
    `INSERT INTO pg_temp.memberships VALUES ($1,$2,$3,'active',NULL,now()-interval '1 day',NULL)`,
    [m, TENANT_A, FAKE],
  );
  await c.query(
    `INSERT INTO pg_temp.membership_roles VALUES ($1,$2,$3,NULL,now()-interval '1 day',NULL)`,
    [TENANT_A, m, r],
  );
  await c.query(
    `INSERT INTO pg_temp.roles VALUES ($1,$2,'active',NULL,now()-interval '1 day',NULL)`,
    [r, TENANT_A],
  );
  await c.query(
    `INSERT INTO pg_temp.role_permissions VALUES ($1,$2,$3,NULL,now()-interval '1 day',NULL)`,
    [TENANT_A, r, p],
  );
  await c.query(`INSERT INTO pg_temp.permissions VALUES ($1,'identity.organization_node.write')`, [
    p,
  ]);
  await c.query('GRANT SELECT ON ALL TABLES IN SCHEMA pg_temp TO PUBLIC');
}

async function regionAncestors(): Promise<string[]> {
  const r = await su.query<{ ancestor_id: string }>(
    `SELECT ancestor_id FROM organization_node_closure WHERE descendant_id = $1 ORDER BY depth`,
    [a.regionNodeId],
  );
  return r.rows.map((x) => x.ancestor_id);
}

describe('0019 — Layer 1: no runtime/control-plane role can create a temporary relation', () => {
  it('denies CREATE TEMP to freightos_app and freightos_admin', async () => {
    for (const [label, c] of [
      ['app', app],
      ['admin', admin],
    ] as const) {
      const err = await c.query('CREATE TEMP TABLE probe (x int)').then(
        () => null,
        (e: Error) => e.message,
      );
      expect(err, `${label} could create a temp table`).toMatch(
        /permission denied to create temporary/i,
      );
    }
  });

  it('gives no runtime/control-plane role CREATE on any schema searched ahead of pg_temp', async () => {
    const r = await su.query<{ rolname: string; nsp: string }>(
      `SELECT rolname, nsp FROM (VALUES ('freightos_app'),('freightos_admin'),('freightos_control_plane')) AS r(rolname)
         CROSS JOIN (VALUES ('public'),('app'),('admin')) AS s(nsp)
        WHERE has_schema_privilege(rolname, nsp, 'CREATE')`,
    );
    expect(r.rows).toEqual([]);
  });
});

describe('0019 — Layer 2: every definer and user_has_permission lists pg_temp last', () => {
  it('ends every app/admin SECURITY DEFINER search_path with pg_temp', async () => {
    const r = await su.query<{ signature: string; path: string | null }>(
      `SELECT n.nspname||'.'||p.proname AS signature,
              substring(p.proconfig::text from 'search_path=([^"}]*)') AS path
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.prosecdef AND n.nspname IN ('app','admin') ORDER BY 1`,
    );
    expect(r.rows.length, 'no definers found — the sweep is empty').toBeGreaterThan(30);
    const bad = r.rows.filter((x) => !/pg_temp\s*$/.test(x.path ?? ''));
    expect(bad.map((x) => `${x.signature} → ${x.path ?? 'NONE'}`)).toEqual([]);
  });

  it('pins app.user_has_permission, the invoker-rights link in the exploited chain', async () => {
    const r = await su.query<{ path: string | null }>(
      `SELECT substring(p.proconfig::text from 'search_path=([^"}]*)') AS path
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='app' AND p.proname='user_has_permission'`,
    );
    expect(r.rows[0]?.path ?? '').toMatch(/pg_temp\s*$/);
  });
});

describe('0019 — the admin authorization chain cannot be shadowed (Path 1)', () => {
  it('refuses a fabricated actor and does not mutate the real hierarchy or forge audit', async () => {
    const before = await regionAncestors();
    // The shadow cannot even be created under Layer 1; attempt it, ignore the CREATE denial, and
    // prove the definer still refuses on the real users table.
    await buildAuthorizationShadow(admin).catch(() => undefined);
    const r = await admin.query<{ outcome: string; message: string | null }>(
      'SELECT * FROM admin.move_organization_node($1,$2,$3,$4,$5,$6,$7)',
      [
        TENANT_A,
        a.regionNodeId,
        a.enterpriseNodeId,
        FAKE_ACTOR,
        'human',
        'identity_administration',
        randomUUID(),
      ],
    );
    expect(r.rows[0]!.outcome).toBe('denied');
    expect(r.rows[0]!.message, 'denied for the wrong reason').toMatch(/is not a user of tenant/i);
    expect(await regionAncestors(), 'the real hierarchy was mutated').toEqual(before);
    const forged = await su.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_events WHERE actor_id=$1 AND outcome='succeeded'`,
      [FAKE_ACTOR],
    );
    expect(Number(forged.rows[0]!.n), 'a forged success audit row was written').toBe(0);
  });

  it('POSITIVE CONTROL: the real administrator, holding the permission, can move a node', async () => {
    // A legitimate reparent through the same boundary, attributed to the real actor. The seeded
    // administrator holds identity.organization_node.write. Move region under enterprise (a no-op
    // parent in this fixture is fine — the point is the boundary authorizes and audits it).
    const bu = randomUUID();
    await withAuthenticatedTestPrincipal(db, fixtureAdministrator(a), async (c) => {
      // create a fresh child under the region so the move is real and legal
      await (c as Client).query(
        `INSERT INTO organization_nodes (id, tenant_id, organization_node_id, parent_id, node_type, name, created_by)
           VALUES ($1,$2,$1,$3,'business_unit','Positive BU',$4)`,
        [bu, TENANT_A, a.regionNodeId, `user:${a.adminUserId}`],
      );
    });
    const r = await admin.query<{ outcome: string; message: string | null }>(
      'SELECT * FROM admin.move_organization_node($1,$2,$3,$4,$5,$6,$7)',
      [
        TENANT_A,
        bu,
        a.legalEntityNodeId,
        `user:${a.adminUserId}`,
        'human',
        'identity_administration',
        randomUUID(),
      ],
    );
    expect(r.rows[0]!.outcome, r.rows[0]!.message ?? '').toBe('succeeded');
    const audited = await su.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_events
        WHERE actor_id=$1 AND outcome='succeeded' AND event_type='rig.freight.identity.organization_node_moved.v1'`,
      [`user:${a.adminUserId}`],
    );
    expect(
      Number(audited.rows[0]!.n),
      'the legitimate move was not audited to the real actor',
    ).toBeGreaterThan(0);
  });
});

describe('0019 — the kill-switch human reservation cannot be shadowed (Path 2)', () => {
  it('refuses engage from a runtime session naming no real human', async () => {
    // freightos_app sets a fabricated actor and tries to shadow users to forge a human.
    await app.query('SELECT set_config($1,$2,false)', ['app.tenant_id', TENANT_A]);
    await app.query('SELECT set_config($1,$2,false)', ['app.actor_id', FAKE_ACTOR]);
    await app
      .query(
        `CREATE TEMP TABLE users (id uuid, tenant_id uuid, status text, revoked_at timestamptz,
      effective_from timestamptz, effective_to timestamptz)`,
      )
      .catch(() => undefined);
    const human = await app.query<{ h: string | null }>(
      'SELECT app.current_human_principal()::text AS h',
    );
    expect(human.rows[0]!.h, 'a fabricated human resolved').toBeNull();
    const err = await app
      .query(
        `SELECT app.engage_kill_switch('tenant'::app.kill_switch_scope, $1, 'suspended'::app.kill_switch_mode, 'attack')`,
        [TENANT_A],
      )
      .then(
        () => null,
        (e: Error) => e.message,
      );
    // Under SR-2 the refusal is EARLIER and stronger than on main: a raw GUC establishes no
    // identity at all for freightos_app, so the session has neither tenant nor human and is
    // refused before the human check is even reached. Either refusal is correct; what must never
    // happen is the switch being engaged.
    expect(err, 'engage was not refused').toMatch(
      /only an active human principal|requires tenant context/i,
    );
    const n = await su.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM kill_switches WHERE reason='attack'`,
    );
    expect(Number(n.rows[0]!.n)).toBe(0);
    await app.query('SELECT set_config($1,NULL,false)', ['app.actor_id']);
  });

  it('POSITIVE CONTROL: a real human administrator can engage a kill switch', async () => {
    const reason = `legit-${randomUUID()}`;
    const id = await withAuthenticatedTestPrincipal(db, fixtureAdministrator(a), async (c) => {
      const r = await (c as Client).query<{ id: string }>(
        `SELECT app.engage_kill_switch('workflow'::app.kill_switch_scope, $1, 'read_only'::app.kill_switch_mode, $2) AS id`,
        [`wf-${reason}`, reason],
      );
      return r.rows[0]!.id;
    });
    expect(id).toBeTruthy();
    const row = await su.query<{ engaged_by: string; engaged_by_type: string }>(
      `SELECT engaged_by, engaged_by_type FROM kill_switches WHERE reason=$1`,
      [reason],
    );
    expect(row.rows[0]!.engaged_by, 'provenance was not the real actor').toBe(
      `user:${a.adminUserId}`,
    );
    expect(row.rows[0]!.engaged_by_type).toBe('human');
  });
});

describe('0019 — Layer 2 is independently sufficient (TEMPORARY restored)', () => {
  it('resolves the real relation even when the shadow is genuinely created', async () => {
    // Neutralize Layer 1 on this disposable database only, so the attacker CAN create the shadow.
    await su.query('GRANT TEMPORARY ON DATABASE freightos_test_hotfix_pg_temp TO freightos_admin');
    try {
      const before = await regionAncestors();
      await buildAuthorizationShadow(admin);
      const visible = await admin.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM pg_temp.users',
      );
      expect(
        Number(visible.rows[0]!.n),
        'the shadow was not actually created — proves nothing',
      ).toBe(1);
      const r = await admin.query<{ outcome: string; message: string | null }>(
        'SELECT * FROM admin.move_organization_node($1,$2,$3,$4,$5,$6,$7)',
        [
          TENANT_A,
          a.regionNodeId,
          a.enterpriseNodeId,
          FAKE_ACTOR,
          'human',
          'identity_administration',
          randomUUID(),
        ],
      );
      expect(r.rows[0]!.outcome).toBe('denied');
      expect(r.rows[0]!.message, 'Layer 2 did not resolve the real users table').toMatch(
        /is not a user of tenant/i,
      );
      expect(await regionAncestors()).toEqual(before);
    } finally {
      await su.query(
        'REVOKE TEMPORARY ON DATABASE freightos_test_hotfix_pg_temp FROM freightos_admin',
      );
      // drop the shadow so it cannot leak into another test on this connection
      await admin.query('DISCARD TEMP').catch(() => undefined);
    }
  });
});
