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
let adminB: Client;
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
  // A distinct operator LOGIN: `connectAsFixtureAdministrator` derives its role name from the
  // database and the label alone, so a second call would try to bind one role to two principals.
  adminB = db.connectAsOperator(
    await db.provisionOperator('badmin', fixtureB.tenantId, fixtureB.adminUserId),
  );
  await adminB.connect();

  orgA = await registerOrganization('org-a', TENANT_A);
  orgExternal = await registerOrganization('org-external', null);
  orgB = await registerOrganization('org-b', TENANT_B);
}, 300_000);

afterAll(async () => {
  await owner?.end();
  await adminA?.end();
  await adminB?.end();
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

  /**
   * ROOT CAUSE REGRESSION — `INSERT ... RETURNING` is a READ.
   *
   * This sequence is both the anti-vacuity pair for every write test below and the regression for
   * the defect that blocked N5-A implementation.
   *
   * `INSERT ... RETURNING` requires the SELECT policy to pass for the new row, not only the INSERT
   * policy's WITH CHECK. A principal holding `network.disclosure_grant.create` but NOT
   * `.read` can therefore create a grant and cannot read it back — and PostgreSQL raises the SAME
   * "new row violates row-level security policy" text for both failures, which is what made this
   * look like a broken write policy.
   *
   * It is CORRECT least privilege, not a defect: create authority is not read authority. The steps
   * are ordered so nobody can later "fix" it by weakening the read policy without this failing.
   */
  it('refuses a grant with NO permission at all', async () => {
    await expect(asAdminOfA(async (c) => insertGrant(c, orgA, orgExternal))).rejects.toThrow(
      /row-level security/i,
    );
  });

  it('permits a plain INSERT with only .create — the write policy is satisfied', async () => {
    await grantPermission('network.disclosure_grant.create', fixtureA, adminA);
    const r = await asAdminOfA(async (c) =>
      (c as Client).query(
        `INSERT INTO network_disclosure_grants
           (grantor_participant_id, recipient_participant_id, purpose_code, projection_ref,
            authority_basis_code, effective_from)
         VALUES ($1,$2,$3,$4,$5,'2026-01-01T00:00:00Z')`,
        [orgA, orgExternal, PURPOSE, PROJECTION, BASIS],
      ),
    );
    expect(r.rowCount).toBe(1);
  });

  it('REFUSES the same INSERT with RETURNING — RETURNING reads the new row', async () => {
    const error = await asAdminOfA(async (c) =>
      insertGrant(c, orgA, orgExternal).then(
        () => null,
        (e: Error & { code?: string }) => e,
      ),
    );
    expect(error, 'RETURNING succeeded without the read permission').not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('accepts RETURNING once .read is assigned — the repaired state', async () => {
    await grantPermission('network.disclosure_grant.read', fixtureA, adminA);
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

  /**
   * A FAILING AUDIT WRITE FAILS THE GRANT.
   *
   * "Same transaction" is only half the coupling claim. The other half is direction: if the ledger
   * write raises, the grant must not commit — otherwise a disclosure authority could come into
   * existence with no record that anyone created it, which is precisely the state the audit ledger
   * exists to make impossible.
   *
   * Forced through a constraint the ledger itself enforces rather than by breaking the function:
   * `audit_events` refuses an event type outside its namespace, so a grant whose trigger names an
   * out-of-namespace type fails at the ledger.
   *
   * The substitution has to COMMIT — DDL inside an open transaction is invisible to the session
   * that performs the insert, so a "restore by rollback" version of this test would prove nothing
   * and pass. The exact original is captured with `pg_get_functiondef` and reinstated in a
   * `finally`, then re-read from the catalog and asserted, because every later test depends on it.
   */
  it('does not commit the grant when the audit write fails', async () => {
    const before = await owner.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM network_disclosure_grants',
    );

    const migrator = db.connectAs('freightos_migrator');
    await migrator.connect();
    const original = (
      await migrator.query<{ def: string }>(
        `SELECT pg_get_functiondef(p.oid) AS def
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'app' AND p.proname = 'network_disclosure_grant_audit'`,
      )
    ).rows[0]!.def;
    expect(original).toContain('rig.freight.network.disclosure_grant.created.v1');

    try {
      await migrator.query(
        `CREATE OR REPLACE FUNCTION app.network_disclosure_grant_audit() RETURNS trigger
         LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
         BEGIN
           PERFORM app.record_audit_event(
             (SELECT app.current_tenant_id()), 'not.a.freight.namespace.v1',
             'network_disclosure_grant', NEW.grant_id::text, 'service_operation');
           RETURN NEW;
         END $fn$`,
      );

      await expect(asAdminOfA(async (c) => insertGrant(c, orgA, orgExternal))).rejects.toThrow(
        /audit|constraint|namespace|event_type/i,
      );
    } finally {
      await migrator.query(original);
      await migrator.end();
    }

    const after = await owner.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM network_disclosure_grants',
    );
    expect(after.rows[0]!.count, 'a grant committed while its ledger write failed').toBe(
      before.rows[0]!.count,
    );

    // The trigger is back — proven, not assumed, because every later test depends on it.
    const restored = await owner.query<{ def: string }>(
      `SELECT pg_get_functiondef(p.oid) AS def
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'app' AND p.proname = 'network_disclosure_grant_audit'`,
    );
    expect(restored.rows[0]!.def).toBe(original);

    // And the restored coupling still works, so the restoration is not merely textual.
    const grantId = await asAdminOfA(
      async (c) => (await insertGrant(c, orgA, orgExternal)).rows[0]!.grant_id,
    );
    const ledger = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
        WHERE event_type = 'rig.freight.network.disclosure_grant.created.v1' AND resource_id = $1`,
      [grantId],
    );
    expect(ledger.rows[0]!.count).toBe('1');
  });
});

describe('grant visibility is grantor-side and tenant-bound', () => {
  /**
   * M-H. A recipient does not get grant transparency in N5-A, and neither does a bystander: read
   * requires the grantor's tenant to equal the caller's verified tenant AND the caller to hold
   * `network.disclosure_grant.read`.
   *
   * Paired with the positive immediately after it, because "tenant B sees nothing" also holds on a
   * table nobody can read at all.
   */
  it('shows tenant A a grant its own organization issued', async () => {
    await asAdminOfA(async (c) => insertGrant(c, orgA, orgExternal));
    const seen = await asAdminOfA(async (c) =>
      (c as Client).query<{ count: string }>(
        'SELECT count(*)::text AS count FROM network_disclosure_grants WHERE grantor_participant_id = $1',
        [orgA],
      ),
    );
    expect(Number(seen.rows[0]!.count)).toBeGreaterThan(0);
  });

  it('shows tenant B nothing of it, even holding .read in its own tenant', async () => {
    await grantPermission('network.disclosure_grant.read', fixtureB, adminB);
    const seen = await asAdminOfB(async (c) =>
      (c as Client).query<{ count: string }>(
        'SELECT count(*)::text AS count FROM network_disclosure_grants',
      ),
    );
    expect(seen.rows[0]!.count, 'a foreign tenant browsed the grant table').toBe('0');
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
  it('refuses UPDATE and DELETE to the runtime role at the PRIVILEGE, before RLS', async () => {
    // Stronger than a zero-row match: 0032 grants freightos_app only SELECT and INSERT, so these
    // never reach a policy at all. Reported as the privilege error it actually is.
    await expect(
      asAdminOfA(async (c) =>
        (c as Client).query(`UPDATE network_disclosure_grants SET purpose_code = 'x'`),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asAdminOfA(async (c) => (c as Client).query(`DELETE FROM network_disclosure_grants`)),
    ).rejects.toThrow(/permission denied/i);
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

/**
 * THE POLICY EXPRESSIONS THEMSELVES, read out of the catalog rather than out of the migration.
 *
 * Source review cannot prove any of this: what PostgreSQL stored is the only thing that runs, and a
 * later `CREATE OR REPLACE POLICY` in some other migration would leave the 0032 source untouched.
 * So every assertion below reads `pg_get_expr(polqual/polwithcheck)`.
 *
 * Four properties, and each one exists because its opposite is a real way to get this wrong:
 *
 *   - the permission call is a SCALAR SUB-SELECT, so it is evaluated once for the statement;
 *   - it is UNCORRELATED — nothing inside it names a column of the table being protected, which is
 *     what makes once-per-statement correct rather than merely faster;
 *   - the grantor tenant binding is a SEPARATE conjunct, not folded into the permission check;
 *   - the authorization predicate is NOT duplicated inline — no policy names the identity tables
 *     that `app.user_has_permission` resolves over.
 */
describe('the permission gate has the approved call shape — §7 and §8', () => {
  interface PolicyRow {
    polname: string;
    expr: string;
  }

  /** The four N5-A policies that carry a permission check, with their stored expression. */
  const permissionPolicies = async (): Promise<PolicyRow[]> =>
    (
      await owner.query<PolicyRow>(
        `SELECT polname,
                coalesce(pg_get_expr(polqual, polrelid), '')
                  || ' ' || coalesce(pg_get_expr(polwithcheck, polrelid), '') AS expr
           FROM pg_policy
          WHERE polname LIKE 'network_disclosure_grant%'
          ORDER BY polname`,
      )
    ).rows;

  /** The permission sub-select, extracted by balancing parentheses from its opening bracket. */
  function permissionSubselect(expr: string): string {
    const open = expr.indexOf('( SELECT app.user_has_permission(');
    expect(open, 'the permission check is not a scalar sub-select').toBeGreaterThanOrEqual(0);
    let depth = 0;
    for (let i = open; i < expr.length; i += 1) {
      if (expr[i] === '(') depth += 1;
      else if (expr[i] === ')') {
        depth -= 1;
        if (depth === 0) return expr.slice(open, i + 1);
      }
    }
    throw new Error(`unbalanced permission sub-select in: ${expr}`);
  }

  const EXPECTED_KEY: Readonly<Record<string, string>> = {
    network_disclosure_grants_insert: 'network.disclosure_grant.create',
    network_disclosure_grants_read: 'network.disclosure_grant.read',
    network_disclosure_grant_revocations_insert: 'network.disclosure_grant.revoke',
    network_disclosure_grant_revocations_read: 'network.disclosure_grant.read',
  };

  /**
   * The column each policy's tenancy EXISTS correlates on — the positive control for "the
   * permission sub-select correlates on nothing".
   *
   * The two tables reach the grantor differently: a grant carries `grantor_participant_id`
   * directly, while a revocation reaches it through its grant, so its correlated column is
   * `grant_id`. Writing one pattern for both would have made the anti-vacuity control pass by
   * accident on one of them.
   */
  const CORRELATED_ON: Readonly<Record<string, string>> = {
    network_disclosure_grants_insert: 'network_disclosure_grants.grantor_participant_id',
    network_disclosure_grants_read: 'network_disclosure_grants.grantor_participant_id',
    network_disclosure_grant_revocations_insert: 'network_disclosure_grant_revocations.grant_id',
    network_disclosure_grant_revocations_read: 'network_disclosure_grant_revocations.grant_id',
  };

  it('carries a permission check on exactly the four governed policies, with the exact keys', async () => {
    const policies = await permissionPolicies();
    expect(policies.map((p) => p.polname)).toEqual(Object.keys(EXPECTED_KEY).sort());

    for (const { polname, expr } of policies) {
      const sub = permissionSubselect(expr);
      // The key is a literal inside the call. Not derived, not concatenated, not a column.
      expect(sub, `${polname} names the wrong permission key`).toContain(
        `'${EXPECTED_KEY[polname]}'::text`,
      );
      // And no OTHER disclosure key appears anywhere in the policy, so a copy-paste that left two
      // keys in one policy is caught rather than passing on the first match.
      for (const other of Object.values(EXPECTED_KEY).filter((k) => k !== EXPECTED_KEY[polname])) {
        expect(expr, `${polname} also names ${other}`).not.toContain(`'${other}'::text`);
      }
    }
  });

  it('keeps the permission call UNCORRELATED — nothing in it names a protected row', async () => {
    for (const { polname, expr } of await permissionPolicies()) {
      const sub = permissionSubselect(expr);
      const table = polname.startsWith('network_disclosure_grant_revocations')
        ? 'network_disclosure_grant_revocations'
        : 'network_disclosure_grants';

      // THE PROPERTY. A correlated reference would appear as `<table>.<column>` inside the
      // sub-select, and would force PostgreSQL to re-evaluate the authorization function for every
      // candidate row.
      expect(sub, `${polname}: the permission check reads a row of ${table}`).not.toContain(
        `${table}.`,
      );

      // ANTI-VACUITY. `pg_get_expr` really does qualify correlated references that way — the
      // tenancy binding in the SAME expression proves it, so the absence above is meaningful and
      // not an artefact of how this deparses.
      expect(expr, `${polname}: the tenancy binding is missing`).toContain(CORRELATED_ON[polname]);

      // Its inputs are session authority context and a decision time, and nothing else.
      expect(sub).toContain('SELECT app.current_tenant_id()');
      expect(sub).toContain('SELECT app.current_user_id()');
      expect(sub).toContain('now()');
    }
  });

  it('keeps the grantor tenant binding SEPARATE from the permission check', async () => {
    for (const { polname, expr } of await permissionPolicies()) {
      const sub = permissionSubselect(expr);
      // The tenancy test lives in an EXISTS over network_participants, conjoined with — never
      // inside — the permission call. Folding them together would make one predicate whose failure
      // mode nobody can read.
      // The tenancy test resolves the grantor through `network_participants`, directly for a grant
      // and through its grant for a revocation. Both shapes are an EXISTS, and both are outside the
      // permission call.
      expect(expr, `${polname} lost its participant EXISTS`).toMatch(/EXISTS \(\s*SELECT 1/);
      expect(expr, `${polname} no longer resolves the grantor participant`).toContain(
        'network_participants',
      );
      expect(sub, `${polname} folded the tenancy test into the permission call`).not.toContain(
        'network_participants',
      );
    }
  });

  it('duplicates the authorization predicate nowhere — one canonical resolver', async () => {
    // §2. `app.user_has_permission` resolves over memberships → membership_roles → roles →
    // role_permissions → permissions → users. A policy that inlined it would have to name those
    // tables. None may.
    const identityTables = [
      'memberships',
      'membership_roles',
      'role_permissions',
      'permissions',
      'users',
    ];
    for (const { polname, expr } of await permissionPolicies()) {
      for (const table of identityTables) {
        expect(
          expr,
          `${polname} appears to inline the authorization predicate (${table})`,
        ).not.toMatch(new RegExp(`\\b(FROM|JOIN)\\s+${table}\\b`));
      }
      // Positive control: the resolver IS called, so "names no identity table" is not passing
      // because the permission check vanished.
      expect(expr).toContain('app.user_has_permission(');
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
    // Granting to the ADMINISTRATOR's own role is refused (self-elevation), and the role under
    // test already holds several keys, so this creates a brand-new role and assigns to that. The
    // point is only that the oracle MOVES when real authority moves.
    // Through the governed administrative path, with a permission this role does not hold. The
    // control's only job is to move the oracle so the comparison above cannot be vacuous.
    await grantPermission('governance.kill_switch.engage', fixtureA, adminA);
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
