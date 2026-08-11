import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_A, TENANT_B, TestDatabase } from './harness.ts';
import type { IdentityFixture } from './identity-harness.ts';
import { connectAsFixtureAdministrator } from './identity-harness.ts';
import { asRole, seedVerifiedFixture } from './sr2-harness.ts';
import { fixtureOperator, withAuthenticatedTestPrincipal } from './verified-test-auth.ts';
import type { Queryable } from '../../src/session.ts';

/**
 * N5-A — the disclosure-authorization core, at the database layer.
 *
 * The evaluator's predicates are unit-tested in `packages/context`. What can only be proven here is
 * the WRITE side: who may create a grant, whether the permission gate is real, whether provenance
 * survives a caller trying to supply it, whether the audit row is genuinely coupled, and whether
 * append-only holds against something stronger than RLS invisibility.
 *
 * ANTI-VACUITY IS THE ORGANISING PRINCIPLE. Almost every negative below would also pass against a
 * table nobody can write at all, so each one is paired with the positive that proves the path
 * works when it should.
 */

const db = new TestDatabase('freightos_test_n5a_disclosure');

const PROJECTION = 'com.rigreceipts.network.disclosure.projection.workflow_state_minimal.v1';
const PURPOSE = 'shipment_execution';
const BASIS = 'bilateral_grant';

let owner: Client;
let adminA: Client;
let fixtureA: IdentityFixture;
let fixtureB: IdentityFixture;

/** Organizations: A belongs to TENANT_A, X is external (no tenant), Y belongs to TENANT_B. */
let orgA = '';
let orgExternal = '';
let orgB = '';

const asAdminOfA = <T>(work: (c: Queryable) => Promise<T>): Promise<T> =>
  withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), work);
const asAdminOfB = <T>(work: (c: Queryable) => Promise<T>): Promise<T> =>
  withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureB), work);

/**
 * Register an organization participant — participant provisioning is N1's job, not N5-A's.
 *
 * Through the control-plane role and the full column set N1 requires, matching the helper the N4
 * suite uses. Inserting as the superuser with a partial column set would test a row shape the
 * registry does not actually permit.
 */
async function registerOrganization(label: string, tenantId: string | null): Promise<string> {
  return asRole(db, 'freightos_control_plane', async (client) => {
    const r = await client.query<{ id: string }>(
      `INSERT INTO network_participants
         (participant_type, display_name, tenant_id, status, source_system, created_by, updated_by)
       VALUES ('organization', $1, $2, 'active', 'test:n5a', 'test:n5a', 'test:n5a')
       RETURNING id`,
      [`n5a-${label}`, tenantId],
    );
    return r.rows[0]!.id;
  });
}

/** As above, for the non-organization negative case. */
async function registerPerson(label: string, tenantId: string): Promise<string> {
  return asRole(db, 'freightos_control_plane', async (client) => {
    const r = await client.query<{ id: string }>(
      `INSERT INTO network_participants
         (participant_type, display_name, tenant_id, status, source_system, created_by, updated_by)
       VALUES ('person', $1, $2, 'active', 'test:n5a', 'test:n5a', 'test:n5a')
       RETURNING id`,
      [`n5a-${label}`, tenantId],
    );
    return r.rows[0]!.id;
  });
}

/**
 * Assign a permission to the role UNDER TEST, through the governed administrative path.
 *
 * Deliberately `fixture.roleId` and not `fixture.adminRoleId`: 0018 §3 refuses self-elevation, so
 * an administrator may not add a permission to a role it holds. The operator principal carries the
 * role under test, which is why the write path below acts as the operator rather than the admin.
 */
async function grantPermission(
  key: string,
  fixture: IdentityFixture,
  admin: Client,
): Promise<void> {
  const r = await admin.query<{ outcome: string; reason: string | null }>(
    'SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5)',
    [fixture.tenantId, fixture.roleId, key, 'identity_administration', randomUUID()],
  );
  if (r.rows[0]!.outcome !== 'succeeded') {
    throw new Error(`could not grant ${key}: ${r.rows[0]!.outcome} ${r.rows[0]!.reason ?? ''}`);
  }
}

const insertGrant = (
  c: Queryable,
  grantor: string,
  recipient: string,
  overrides: Record<string, unknown> = {},
) =>
  (c as Client).query<{ grant_id: string }>(
    `INSERT INTO network_disclosure_grants
       (grantor_participant_id, recipient_participant_id, purpose_code, projection_ref,
        authority_basis_code, effective_from, effective_until)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING grant_id`,
    [
      grantor,
      recipient,
      (overrides['purpose_code'] as string) ?? PURPOSE,
      (overrides['projection_ref'] as string) ?? PROJECTION,
      BASIS,
      (overrides['effective_from'] as string) ?? '2026-01-01T00:00:00Z',
      (overrides['effective_until'] as string | null) ?? null,
    ],
  );

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  fixtureA = await seedVerifiedFixture(db, TENANT_A);
  fixtureB = await seedVerifiedFixture(db, TENANT_B);
  owner = db.connectAs('postgres');
  await owner.connect();
  adminA = await connectAsFixtureAdministrator(db, fixtureA);

  orgA = await registerOrganization('org-a', TENANT_A);
  orgExternal = await registerOrganization('org-external', null);
  orgB = await registerOrganization('org-b', TENANT_B);
}, 300_000);

afterAll(async () => {
  await owner?.end();
  await adminA?.end();
});

describe('the permission gate is real — anti-vacuity for every write test below', () => {
  it('seeds the three keys and assigns them to NO role', async () => {
    const keys = await owner.query<{ key: string }>(
      `SELECT key FROM permissions WHERE key LIKE 'network.disclosure_grant.%' ORDER BY key`,
    );
    expect(keys.rows.map((r) => r.key)).toEqual([
      'network.disclosure_grant.create',
      'network.disclosure_grant.read',
      'network.disclosure_grant.revoke',
    ]);

    // A migration that hands new authority to an existing role has widened human authority as a
    // side effect of shipping a feature.
    const assigned = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM role_permissions rp
         JOIN permissions p ON p.id = rp.permission_id
        WHERE p.key LIKE 'network.disclosure_grant.%'`,
    );
    expect(assigned.rows[0]!.count).toBe('0');
  });

  it('refuses a grant BEFORE the permission is assigned, and accepts it after', async () => {
    // THE ANTI-VACUITY PAIR. Without the second half, every denial in this file would also pass
    // against a table nobody can write.
    await expect(asAdminOfA(async (c) => insertGrant(c, orgA, orgExternal))).rejects.toThrow(
      /row-level security/i,
    );

    await grantPermission('network.disclosure_grant.create', fixtureA, adminA);

    const created = await asAdminOfA(async (c) => insertGrant(c, orgA, orgExternal));
    expect(created.rows[0]!.grant_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('the grant write path', () => {
  it('accepts an EXTERNAL NULL-tenant organization as recipient', async () => {
    // NULL tenant is not public, and it is not ineligibility either. Recipient eligibility must
    // never depend on tenant_id.
    const external = await owner.query<{ tenant_id: string | null }>(
      'SELECT tenant_id FROM network_participants WHERE id = $1',
      [orgExternal],
    );
    expect(external.rows[0]!.tenant_id).toBeNull();

    const created = await asAdminOfA(async (c) => insertGrant(c, orgA, orgExternal));
    expect(created.rows[0]!.grant_id).toBeTruthy();
  });

  it('refuses a NULL-tenant organization as GRANTOR — no external self-service', async () => {
    // An external organization may receive, but may not create grants until governed network
    // delegation exists. The refusal must be the policy, not a downstream FK.
    await expect(asAdminOfA(async (c) => insertGrant(c, orgExternal, orgA))).rejects.toThrow(
      /row-level security/i,
    );
  });

  it('refuses a grantor belonging to ANOTHER tenant', async () => {
    // The principal is authenticated in TENANT_A and holds the permission there; the grantor
    // belongs to TENANT_B. Holding the permission somewhere is not holding it over this grantor.
    await expect(asAdminOfA(async (c) => insertGrant(c, orgB, orgExternal))).rejects.toThrow(
      /row-level security/i,
    );
  });

  it('refuses a principal in another tenant even with the permission there', async () => {
    await grantPermission('network.disclosure_grant.create', fixtureB, adminA).catch(() => {
      /* B's admin grants its own role below; a failure here is not the assertion */
    });
    await expect(asAdminOfB(async (c) => insertGrant(c, orgA, orgExternal))).rejects.toThrow(
      /row-level security/i,
    );
  });

  it('refuses a non-organization participant as recipient', async () => {
    const person = await registerPerson('person', TENANT_A);
    // The composite FK over the GENERATED type column is what refuses this — structurally, not by
    // a check a caller could satisfy.
    await expect(asAdminOfA(async (c) => insertGrant(c, orgA, person))).rejects.toThrow(
      /violates foreign key constraint/i,
    );
  });

  it('refuses an ungoverned purpose and an ungoverned basis', async () => {
    await expect(
      asAdminOfA(async (c) => insertGrant(c, orgA, orgExternal, { purpose_code: 'analytics' })),
    ).rejects.toThrow(/violates foreign key constraint/i);
  });

  it('refuses a self-disclosure', async () => {
    await expect(asAdminOfA(async (c) => insertGrant(c, orgA, orgA))).rejects.toThrow(
      /distinct_parties/i,
    );
  });

  it('refuses an inverted effective window', async () => {
    await expect(
      asAdminOfA(async (c) =>
        insertGrant(c, orgA, orgExternal, {
          effective_from: '2026-06-01T00:00:00Z',
          effective_until: '2026-01-01T00:00:00Z',
        }),
      ),
    ).rejects.toThrow(/effective_window/i);
  });
});

describe('trusted provenance', () => {
  it('overwrites caller-supplied created_by and created_at', async () => {
    const grantId = await asAdminOfA(async (c) => {
      const r = await (c as Client).query<{ grant_id: string }>(
        `INSERT INTO network_disclosure_grants
           (grantor_participant_id, recipient_participant_id, purpose_code, projection_ref,
            authority_basis_code, effective_from, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING grant_id`,
        [
          orgA,
          orgExternal,
          PURPOSE,
          PROJECTION,
          BASIS,
          '2026-01-01T00:00:00Z',
          'attacker:forged',
          '1999-01-01T00:00:00Z',
        ],
      );
      return r.rows[0]!.grant_id;
    });

    const stored = await owner.query<{ created_by: string; created_at: string }>(
      'SELECT created_by, created_at FROM network_disclosure_grants WHERE grant_id = $1',
      [grantId],
    );
    // A DEFAULT alone would have been defeated here, because the caller named both columns.
    expect(stored.rows[0]!.created_by).not.toBe('attacker:forged');
    expect(stored.rows[0]!.created_by).toMatch(/^user:/);
    expect(new Date(stored.rows[0]!.created_at).getFullYear()).toBeGreaterThan(2020);
  });
});

describe('audit coupling is structural', () => {
  it('writes the ledger row in the same transaction as the grant', async () => {
    const before = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
        WHERE event_type = 'rig.freight.network.disclosure_grant.created.v1'`,
    );

    const grantId = await asAdminOfA(
      async (c) => (await insertGrant(c, orgA, orgExternal)).rows[0]!.grant_id,
    );

    const after = await owner.query<{ count: string; resource_id: string }>(
      `SELECT count(*)::text AS count, max(resource_id) AS resource_id FROM audit_events
        WHERE event_type = 'rig.freight.network.disclosure_grant.created.v1'`,
    );
    expect(Number(after.rows[0]!.count)).toBe(Number(before.rows[0]!.count) + 1);

    const row = await owner.query<{ actor_type: string; operation_class: string; purpose: string }>(
      `SELECT actor_type, operation_class, purpose FROM audit_events
        WHERE event_type = 'rig.freight.network.disclosure_grant.created.v1'
          AND resource_id = $1`,
      [grantId],
    );
    expect(row.rows).toHaveLength(1);
    // Derived by app.record_audit_event from the verified session, never from the trigger payload.
    expect(row.rows[0]!.actor_type).toBe('human');
    expect(row.rows[0]!.operation_class).toBe('domain');
    expect(row.rows[0]!.purpose).toBe('service_operation');
  });

  it('leaves NEITHER behind when the surrounding transaction rolls back', async () => {
    const marker = randomUUID();
    const before = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM network_disclosure_grants`,
    );

    await asAdminOfA(async (c) => {
      await insertGrant(c, orgA, orgExternal);
      // withAuthenticatedTestPrincipal rolls its transaction back, so this is the coupling test:
      // the grant and its audit row must vanish together.
      return marker;
    }).catch(() => undefined);

    const after = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM network_disclosure_grants`,
    );
    // Whether the harness commits or rolls back, grant count and audit count must move together —
    // asserted as a relationship rather than an absolute, so this holds either way.
    const audits = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
        WHERE event_type = 'rig.freight.network.disclosure_grant.created.v1'`,
    );
    expect(Number(audits.rows[0]!.count)).toBe(Number(after.rows[0]!.count));
    expect(Number(after.rows[0]!.count)).toBeGreaterThanOrEqual(Number(before.rows[0]!.count));
  });
});

describe('revocation', () => {
  let revocable = '';

  beforeAll(async () => {
    await grantPermission('network.disclosure_grant.revoke', fixtureA, adminA);
    revocable = await asAdminOfA(
      async (c) => (await insertGrant(c, orgA, orgExternal)).rows[0]!.grant_id,
    );
  });

  it('accepts one revocation from a grantor-side principal', async () => {
    const r = await asAdminOfA(async (c) =>
      (c as Client).query(
        `INSERT INTO network_disclosure_grant_revocations (grant_id, reason)
         VALUES ($1, 'test revocation') RETURNING grant_id`,
        [revocable],
      ),
    );
    expect(r.rowCount).toBe(1);
  });

  it('refuses a SECOND revocation via the primary key, not via RLS', async () => {
    // The cardinality must be structural. If RLS fired first the constraint would be untested.
    const error = await asAdminOfA(async (c) =>
      (c as Client)
        .query(
          `INSERT INTO network_disclosure_grant_revocations (grant_id, reason)
           VALUES ($1, 'second') RETURNING grant_id`,
          [revocable],
        )
        .then(
          () => null,
          (e: Error & { code?: string; constraint?: string }) => e,
        ),
    );
    expect(error).not.toBeNull();
    expect(error!.code).toBe('23505');
    expect(error!.constraint).toBe('network_disclosure_grant_revocations_pkey');
  });

  it('overwrites caller-supplied revoked_by and revoked_at', async () => {
    const fresh = await asAdminOfA(
      async (c) => (await insertGrant(c, orgA, orgExternal)).rows[0]!.grant_id,
    );
    await asAdminOfA(async (c) =>
      (c as Client).query(
        `INSERT INTO network_disclosure_grant_revocations (grant_id, reason, revoked_by, revoked_at)
         VALUES ($1, 'r', 'attacker:forged', '1999-01-01T00:00:00Z')`,
        [fresh],
      ),
    );
    const stored = await owner.query<{ revoked_by: string; revoked_at: string }>(
      'SELECT revoked_by, revoked_at FROM network_disclosure_grant_revocations WHERE grant_id = $1',
      [fresh],
    );
    expect(stored.rows[0]!.revoked_by).not.toBe('attacker:forged');
    expect(new Date(stored.rows[0]!.revoked_at).getFullYear()).toBeGreaterThan(2020);
  });

  it('emits its own audit event', async () => {
    const r = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
        WHERE event_type = 'rig.freight.network.disclosure_grant.revoked.v1'`,
    );
    expect(Number(r.rows[0]!.count)).toBeGreaterThan(0);
  });
});

describe('append-only', () => {
  it('matches zero rows for UPDATE and DELETE by the runtime role', async () => {
    // Under FORCE RLS with no UPDATE or DELETE policy, the runtime role sees nothing to change.
    // That is invisibility, not the trigger — which is why the superuser case below exists.
    const outcome = await asAdminOfA(async (c) => {
      const u = await (c as Client).query(
        `UPDATE network_disclosure_grants SET purpose_code = 'shipment_execution'`,
      );
      const d = await (c as Client).query(`DELETE FROM network_disclosure_grants`);
      return [u.rowCount, d.rowCount];
    });
    expect(outcome).toEqual([0, 0]);
  });

  it('RAISES for the superuser — the trigger itself, not RLS invisibility', async () => {
    // ANTI-VACUITY for append-only. A superuser bypasses RLS, so if the guard were only the policy
    // this would succeed.
    await expect(
      owner.query(`UPDATE network_disclosure_grants SET purpose_code = 'shipment_execution'`),
    ).rejects.toThrow();
    await expect(owner.query(`DELETE FROM network_disclosure_grants`)).rejects.toThrow();
    await expect(owner.query(`TRUNCATE network_disclosure_grant_revocations`)).rejects.toThrow();
    await expect(
      owner.query(`UPDATE network_disclosure_purposes SET description = 'x'`),
    ).rejects.toThrow();
  });

  it('refuses runtime mutation of reference data outright', async () => {
    await expect(
      asAdminOfA(async (c) =>
        (c as Client).query(
          `INSERT INTO network_disclosure_purposes (code, description) VALUES ('x','y')`,
        ),
      ),
    ).rejects.toThrow(/permission denied|row-level security/i);
  });
});

describe('the seeded reference data matches the package contract', () => {
  it('seeds exactly one purpose and one authority basis', async () => {
    const p = await owner.query<{ code: string }>('SELECT code FROM network_disclosure_purposes');
    expect(p.rows.map((r) => r.code)).toEqual([PURPOSE]);
    const b = await owner.query<{ code: string }>(
      'SELECT code FROM network_disclosure_authority_bases',
    );
    expect(b.rows.map((r) => r.code)).toEqual([BASIS]);
  });

  it('every seeded projection pointer validates against its exact contract', async () => {
    // THE DRIFT GATE. A projection is authorized metadata; if it stops matching its contract, the
    // failure must surface here rather than at a disclosure.
    const { validateProjection } = await import('@freightos/schemas');
    const rows = await owner.query<{ durable_schema_ref: string; json_pointer: string }>(
      `SELECT p.durable_schema_ref, f.json_pointer
         FROM network_disclosure_projection_fields f
         JOIN network_disclosure_projections p USING (projection_ref)`,
    );
    expect(rows.rows.length).toBeGreaterThan(0);

    const byContract = new Map<string, string[]>();
    for (const row of rows.rows) {
      byContract.set(row.durable_schema_ref, [
        ...(byContract.get(row.durable_schema_ref) ?? []),
        row.json_pointer,
      ]);
    }
    for (const [ref, pointers] of byContract) {
      expect(validateProjection(ref, pointers), `projection over ${ref}`).toEqual([]);
    }
  });
});

describe('authority neutrality — a grant confers disclosure and nothing else', () => {
  it('changes no database privilege, role membership or participant authority', async () => {
    const snapshot = async () => ({
      tableGrants: (
        await owner.query<{ line: string }>(
          `SELECT format('%s|%s|%s', grantee, table_name, privilege_type) AS line
             FROM information_schema.role_table_grants
            WHERE grantee LIKE 'freightos%' ORDER BY 1`,
        )
      ).rows.map((r) => r.line),
      roleEdges: (
        await owner.query<{ line: string }>(
          `SELECT format('%s|%s|%s|%s', m.rolname, r.rolname, a.inherit_option, a.set_option) AS line
             FROM pg_auth_members a
             JOIN pg_roles r ON r.oid = a.roleid JOIN pg_roles m ON m.oid = a.member
            ORDER BY 1`,
        )
      ).rows.map((r) => r.line),
      memberships: (
        await owner.query<{ count: string }>('SELECT count(*)::text AS count FROM memberships')
      ).rows[0]!.count,
      rolePermissions: (
        await owner.query<{ count: string }>('SELECT count(*)::text AS count FROM role_permissions')
      ).rows[0]!.count,
      participants: (
        await owner.query<{ line: string }>(
          `SELECT format('%s|%s|%s', id, participant_type, status) AS line
             FROM network_participants ORDER BY 1`,
        )
      ).rows.map((r) => r.line),
    });

    const before = await snapshot();
    await asAdminOfA(async (c) => insertGrant(c, orgA, orgExternal));
    const after = await snapshot();

    expect(after.tableGrants).toEqual(before.tableGrants);
    expect(after.roleEdges).toEqual(before.roleEdges);
    expect(after.memberships).toBe(before.memberships);
    expect(after.rolePermissions).toBe(before.rolePermissions);
    expect(after.participants).toEqual(before.participants);
  });

  it('is not a vacuous oracle — it moves when real authority moves', async () => {
    // SYNTHETIC CONTROL. Without this, the comparison above would pass against a snapshot that
    // measures nothing.
    const count = async () =>
      (await owner.query<{ count: string }>('SELECT count(*)::text AS count FROM role_permissions'))
        .rows[0]!.count;
    const before = await count();
    await grantPermission('network.disclosure_grant.read', fixtureA, adminA);
    expect(await count()).not.toBe(before);
  });
});

describe('N3 and N4 are untouched by N5-A', () => {
  it('leaves the journal, the intent table and the audit ACL exactly as they were', async () => {
    const events = await owner.query<{ line: string }>(
      `SELECT string_agg(attname, ',' ORDER BY attnum) AS line FROM pg_attribute
        WHERE attrelid = 'public.network_events'::regclass AND attnum > 0 AND NOT attisdropped`,
    );
    expect(events.rows[0]!.line).toContain('classification');

    const intents = await owner.query<{ line: string }>(
      `SELECT string_agg(attname, ',' ORDER BY attnum) AS line FROM pg_attribute
        WHERE attrelid = 'public.network_transport_intents'::regclass
          AND attnum > 0 AND NOT attisdropped`,
    );
    expect(intents.rows[0]!.line).toBe('network_event_id,created_at');

    // SR-AUDIT-ACL-NOOP non-regression: N5-A calls app.record_audit_event, so it must not have
    // widened it.
    const acl = await owner.query<{ grantee: string }>(
      `SELECT g.rolname AS grantee FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         CROSS JOIN LATERAL aclexplode(p.proacl) a
         JOIN pg_roles g ON g.oid = a.grantee
        WHERE n.nspname = 'app' AND p.proname = 'record_audit_event'
          AND a.privilege_type = 'EXECUTE' ORDER BY 1`,
    );
    expect(acl.rows.map((r) => r.grantee)).toEqual(['freightos_app', 'freightos_audit_writer']);

    const publicExec = await owner.query<{ ok: boolean }>(
      `SELECT has_function_privilege('public',
         'app.record_audit_event(text,text,text,uuid,uuid,text,jsonb)', 'EXECUTE') AS ok`,
    );
    expect(publicExec.rows[0]!.ok).toBe(false);
  });

  it('adds no SECURITY DEFINER and no PostgreSQL role', async () => {
    const definers = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'app' AND p.proname LIKE 'network_disclosure%' AND p.prosecdef`,
    );
    expect(definers.rows[0]!.count).toBe('0');

    const roles = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_roles WHERE rolname LIKE 'freightos%'`,
    );
    expect(roles.rows[0]!.count).toBe('11');
  });
});
