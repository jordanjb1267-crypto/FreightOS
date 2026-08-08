import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_A, TestDatabase } from './harness.ts';
import { seedIdentity, type IdentityFixture } from './identity-harness.ts';

/**
 * SR-2 — finding F-A path 1. The administrative boundary's `p_actor` argument.
 *
 * THE PROPERTY THE OWNER RULING REQUIRES, stated as the tests below assert it:
 *
 *   A holder of the `freightos_admin` connection must not be able to select a permissioned human
 *   through `p_actor`, use that identity for authorization, mutate consequential state, or record
 *   fabricated human provenance. A shared database role authenticates the connecting service; it
 *   does not authenticate the human who initiated the command.
 *
 * THIS PROPERTY DOES NOT HOLD AT THIS HEAD. Every case marked `it.fails` below is an exploit that
 * currently SUCCEEDS — the assertion inside it is the property we require, and vitest records that
 * the assertion does not yet pass. That is deliberate and is the shape the ruling asked for: the
 * exploit is preserved as an executable regression rather than as prose.
 *
 * `it.fails` rather than a plain failing `it` for one reason only: it keeps the signal honest in
 * both directions. If a future change closes the hole, `it.fails` itself FAILS — the suite breaks
 * and forces someone to flip it to `it` and delete this header. A plain failing test would have to
 * be remembered; this one cannot be forgotten. Nothing about the assertions is weakened: each one
 * demands the denial, not the success.
 *
 * WHY THIS IS NOT FIXABLE IN THIS FILE, measured rather than argued — see
 * docs/security-resilience/SEC01_ADMIN_BINDING_ARCHITECTURE.md:
 *
 *   - `session_user` on every administrative connection is `freightos_admin`. The database is told
 *     nothing that distinguishes one human operator from another.
 *   - The SR-2 binding cannot serve as the anchor. `freightos_admin` holds EXECUTE on
 *     `admin.issue_session_binding`, and that mint verifies only that the named principal EXISTS,
 *     is active, and is in scope — never that the caller may speak as them. Verifying `p_actor`
 *     against a binding the same role can mint is circular.
 *   - `freightos_admin` cannot install a binding on its own connection either, so on the
 *     administrative path there is not even a binding to verify against.
 *   - No key material, certificate or per-human credential exists anywhere in the schema.
 *
 * Every negative case here carries a positive control, because a denial caused by a missing
 * privilege proves nothing about the boundary under test.
 */
const db = new TestDatabase('freightos_test_sr2_admin_actor');

let admin: Client;
let su: Client;
let a: IdentityFixture;

/** A uuid that is no user anywhere, in any tenant. */
const FABRICATED = '00000000-0000-4000-8000-0000000000fa';

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  admin = db.connectAs('freightos_admin');
  await admin.connect();
  su = db.connectAs('postgres');
  await su.connect();
  a = await seedIdentity(db, TENANT_A);
}, 120_000);

afterAll(async () => {
  await admin?.end();
  await su?.end();
});

async function regionParent(): Promise<string | null> {
  const r = await su.query<{ parent_id: string | null }>(
    `SELECT parent_id FROM organization_nodes WHERE id = $1`,
    [a.regionNodeId],
  );
  return r.rows[0]?.parent_id ?? null;
}

/** Every audit row this correlation id produced, with the actor the ledger believes acted. */
async function auditFor(
  correlationId: string,
): Promise<{ actor_id: string; actor_type: string }[]> {
  const r = await su.query<{ actor_id: string; actor_type: string }>(
    `SELECT actor_id, actor_type FROM audit_events WHERE correlation_id = $1 ORDER BY created_at`,
    [correlationId],
  );
  return r.rows;
}

describe('the administrative connection knows nothing about which human is acting', () => {
  it('sees the same session_user for every operator — there is no per-human identity', async () => {
    const r = await admin.query<{ su: string; cu: string }>(
      `SELECT session_user AS su, current_user AS cu`,
    );
    expect(r.rows[0]!.su).toBe('freightos_admin');
    expect(r.rows[0]!.cu).toBe('freightos_admin');
  });

  it('holds no per-human credential anywhere in the schema to check against', async () => {
    const r = await su.query<{ t: string }>(
      `SELECT n.nspname || '.' || c.relname AS t
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND n.nspname IN ('public', 'app', 'admin')
          AND c.relname ~ 'credential|key|certificate|secret'
        ORDER BY 1`,
    );
    // service_account_credentials is a REGISTRY of credential metadata for SERVICE accounts. It
    // holds no human credential and no function verifies possession of anything in it.
    expect(r.rows.map((x) => x.t)).toEqual(['public.service_account_credentials']);
    const verifiers = await su.query<{ f: string }>(
      `SELECT p.oid::regprocedure::text AS f
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('app', 'admin') AND p.prosrc ~* 'credential_hash|crypt\\(|digest\\('`,
    );
    expect(
      verifiers.rows.map((x) => x.f),
      'a credential verifier exists after all',
    ).toEqual([]);
  });

  it('lets the connection mint a binding for a human it never authenticated', async () => {
    // This is the circularity, made concrete. The mint's own guards are visible in its body: it
    // checks that the principal exists, is active, and that a membership justifies the tenant and
    // node. Not one of them asks whether the CALLER may speak as that principal.
    const src = await su.query<{ prosrc: string }>(
      `SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'admin' AND p.proname = 'issue_session_binding'`,
    );
    const body = src.rows[0]!.prosrc;
    expect(body, 'the mint checks the principal exists').toMatch(/no active membership justifies/);
    expect(
      body,
      'the mint gained a caller-authenticity check — this file and Section E must be updated',
    ).not.toMatch(/session_user|caller|credential|signature|verif(y|ied)_caller/i);

    const canMint = await su.query<{ ok: boolean }>(
      `SELECT has_function_privilege('freightos_admin',
                'admin.issue_session_binding(text,uuid,uuid,uuid,uuid,text,text,integer,text,integer)',
                'EXECUTE') AS ok`,
    );
    expect(canMint.rows[0]!.ok, 'freightos_admin can no longer mint — re-evaluate F-A').toBe(true);
  });
});

describe('F-A path 1 — borrowing a permissioned human through p_actor', () => {
  it('REQUIRED: refuses a fabricated human, and records no provenance for it', async () => {
    const correlationId = randomUUID();
    const before = await regionParent();
    const r = await admin.query<{ outcome: string; message: string | null }>(
      'SELECT * FROM admin.move_organization_node($1,$2,$3,$4,$5,$6,$7)',
      [
        TENANT_A,
        a.regionNodeId,
        a.enterpriseNodeId,
        `user:${FABRICATED}`,
        'human',
        'identity_administration',
        correlationId,
      ],
    );
    expect(r.rows[0]!.outcome).toBe('denied');
    expect(r.rows[0]!.message, 'denied for the wrong reason').toMatch(/is not a user of tenant/i);
    expect(await regionParent(), 'a refused call still moved the node').toBe(before);
  });

  it.fails('REQUIRED: writes no human provenance for an identity it never verified', async () => {
    // Measured: the move above is correctly DENIED, and the ledger still records
    // actor_type='human', actor_id='user:<fabricated uuid>' for the attempt.
    //
    // Recording a refused attempt is right. Recording it as a HUMAN, on an identity the database
    // never verified and which does not exist, is the same defect as the borrowing cases below —
    // the ledger is asserting something it cannot know. Under the ruling an unverified identity
    // may not appear as human provenance at all; a refused attempt from an unauthenticated
    // administrative connection should be attributed to the connection, not to a person.
    const correlationId = randomUUID();
    await admin.query('SELECT * FROM admin.move_organization_node($1,$2,$3,$4,$5,$6,$7)', [
      TENANT_A,
      a.regionNodeId,
      a.enterpriseNodeId,
      `user:${FABRICATED}`,
      'human',
      'identity_administration',
      correlationId,
    ]);
    const rows = await auditFor(correlationId);
    expect(rows.length, 'no audit row was written — the control is not exercised').toBeGreaterThan(
      0,
    );
    for (const row of rows) {
      expect(
        `${row.actor_type}:${row.actor_id}`,
        'the ledger recorded a fabricated human as the actor',
      ).not.toBe(`human:user:${FABRICATED}`);
    }
  });

  it.fails(
    'REQUIRED: refuses a REAL permissioned human the connection did not authenticate',
    async () => {
      const correlationId = randomUUID();
      const r = await admin.query<{ outcome: string; message: string | null }>(
        'SELECT * FROM admin.move_organization_node($1,$2,$3,$4,$5,$6,$7)',
        [
          TENANT_A,
          a.regionNodeId,
          a.legalEntityNodeId,
          `user:${a.adminUserId}`,
          'human',
          'identity_administration',
          correlationId,
        ],
      );
      // A shared service credential is not a human credential. This must be refused.
      expect(r.rows[0]!.outcome, 'a borrowed human was accepted as the authority').toBe('denied');
    },
  );

  it.fails('REQUIRED: does not mutate consequential state on a borrowed identity', async () => {
    const correlationId = randomUUID();
    const before = await regionParent();
    await admin.query('SELECT * FROM admin.move_organization_node($1,$2,$3,$4,$5,$6,$7)', [
      TENANT_A,
      a.regionNodeId,
      a.enterpriseNodeId,
      `user:${a.adminUserId}`,
      'human',
      'identity_administration',
      correlationId,
    ]);
    expect(await regionParent(), 'a borrowed identity moved the node').toBe(before);
  });

  it.fails('REQUIRED: does not record fabricated human provenance in the ledger', async () => {
    const correlationId = randomUUID();
    await admin.query('SELECT * FROM admin.move_organization_node($1,$2,$3,$4,$5,$6,$7)', [
      TENANT_A,
      a.regionNodeId,
      a.regionNodeId === a.enterpriseNodeId ? a.legalEntityNodeId : a.enterpriseNodeId,
      `user:${a.adminUserId}`,
      'human',
      'identity_administration',
      correlationId,
    ]);
    const rows = await auditFor(correlationId);
    expect(
      rows.length,
      'no audit row was written at all — the control is not exercised',
    ).toBeGreaterThan(0);
    for (const row of rows) {
      expect(
        `${row.actor_type}:${row.actor_id}`,
        'the ledger attributes the act to a human who never performed it',
      ).not.toBe(`human:user:${a.adminUserId}`);
    }
  });

  it.fails('REQUIRED: refuses a borrowed human on an authority GRANT, the worst case', async () => {
    // Granting a permission to a role is how authority itself spreads. If a shared connection can
    // do this while naming somebody else, every later authorization decision inherits the lie.
    //
    // The pair is CHOSEN, not hard-coded, so the refusal cannot come from somewhere else: a role
    // the borrowed administrator does not hold (or the self-elevation guard fires first), carrying
    // a permission it does not already have (or the uniqueness constraint fires first), named by a
    // key that is in the catalog (or the catalog check fires first). Each of those was observed
    // refusing this call during the reproduction, and none of them is the boundary under test.
    const pair = await su.query<{ role_id: string; key: string }>(
      `SELECT r.id AS role_id, p.key
         FROM roles r CROSS JOIN permissions p
        WHERE r.tenant_id = $1
          AND NOT EXISTS (SELECT 1 FROM membership_roles mr
                            JOIN memberships m ON m.id = mr.membership_id
                           WHERE mr.role_id = r.id AND m.user_id = $2 AND mr.revoked_at IS NULL)
          AND NOT EXISTS (SELECT 1 FROM role_permissions rp
                           WHERE rp.role_id = r.id AND rp.permission_id = p.id
                             AND rp.revoked_at IS NULL)
        LIMIT 1`,
      [TENANT_A, a.adminUserId],
    );
    expect(pair.rowCount, 'no grantable pair exists — the case would prove nothing').toBe(1);
    const { role_id: roleId, key } = pair.rows[0]!;

    const correlationId = randomUUID();
    const r = await admin.query<{ outcome: string; message: string | null }>(
      'SELECT * FROM admin.grant_role_permission($1,$2,$3,$4,$5,$6,$7)',
      [
        TENANT_A,
        roleId,
        key,
        `user:${a.adminUserId}`,
        'human',
        'identity_administration',
        correlationId,
      ],
    );
    // Refused for an incidental reason is not a closure — say so explicitly.
    expect(r.rows[0]!.message ?? '', 'refused for an incidental reason').not.toMatch(
      /not in the catalog|self-elevation|duplicate key/i,
    );
    expect(r.rows[0]!.outcome, 'a borrowed human granted a permission').toBe('denied');

    const landed = await su.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = $1 AND p.key = $2 AND rp.revoked_at IS NULL`,
      [roleId, key],
    );
    expect(Number(landed.rows[0]!.n), 'the authority grant landed anyway').toBe(0);
  });
});

describe('positive controls — the boundary under test is genuinely reached', () => {
  it('reaches the permission check, not a missing grant: a real user without it is refused', async () => {
    const correlationId = randomUUID();
    const r = await admin.query<{ outcome: string; message: string | null }>(
      'SELECT * FROM admin.move_organization_node($1,$2,$3,$4,$5,$6,$7)',
      [
        TENANT_A,
        a.regionNodeId,
        a.enterpriseNodeId,
        `user:${a.userId}`,
        'human',
        'identity_administration',
        correlationId,
      ],
    );
    expect(r.rows[0]!.outcome).toBe('denied');
    expect(
      r.rows[0]!.message,
      'refused by a missing privilege rather than by the permission check',
    ).toMatch(/does not hold/i);
  });

  it('is not refused by a missing EXECUTE grant — the connection may call every one of these', async () => {
    const r = await su.query<{ f: string; ok: boolean }>(
      `SELECT p.oid::regprocedure::text AS f,
              has_function_privilege('freightos_admin', p.oid, 'EXECUTE') AS ok
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'admin'
          AND p.proname IN ('move_organization_node', 'grant_role_permission', 'set_tenant_status')
        ORDER BY 1`,
    );
    expect(r.rowCount).toBeGreaterThan(0);
    expect(r.rows.filter((x) => !x.ok).map((x) => x.f)).toEqual([]);
  });

  it('writes an audit row on the legitimate path, so an empty ledger would be a real finding', async () => {
    const correlationId = randomUUID();
    await admin.query('SELECT * FROM admin.move_organization_node($1,$2,$3,$4,$5,$6,$7)', [
      TENANT_A,
      a.regionNodeId,
      a.legalEntityNodeId,
      `user:${a.adminUserId}`,
      'human',
      'identity_administration',
      correlationId,
    ]);
    expect(
      (await auditFor(correlationId)).length,
      'the administrative path writes no audit row at all',
    ).toBeGreaterThan(0);
  });
});
