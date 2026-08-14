import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  evaluateDisclosureWithCeiling,
  permittedPointers,
  type SensitivityMetadata,
} from '@freightos/context/disclosure-sensitivity';
import type {
  DisclosureGrant,
  DisclosureInput,
  DisclosureParticipant,
  DisclosureProjection,
} from '@freightos/context/disclosure';

import { TENANT_A, TENANT_B, TestDatabase } from './harness.ts';
import { N5A_DISCLOSURE_RELATIONS } from './network-relations.ts';
import type { IdentityFixture } from './identity-harness.ts';
import { connectAsFixtureAdministrator } from './identity-harness.ts';
import { asRole, seedVerifiedFixture } from './sr2-harness.ts';
import { fixtureOperator, withAuthenticatedTestPrincipal } from './verified-test-auth.ts';
import type { Queryable } from '../../src/session.ts';

/**
 * N5-B — the disclosure sensitivity ceiling, at the database layer.
 *
 * The evaluator's predicates are unit-tested in `packages/context`. What can only be proven here is
 * that the SHIPPED metadata produces the intended decisions, that nothing at runtime can rewrite
 * it, and that the completeness gates are relational rather than a count somebody will update.
 *
 * The metadata below is READ FROM THE DATABASE, never restated. A test that hard-codes the four
 * levels and nine assignments proves the test file agrees with itself; reading them means the
 * assertions are about what migration 0033 actually seeded.
 *
 * ANTI-VACUITY IS THE ORGANISING PRINCIPLE, as it is for N5-A. Every ceiling denial below is paired
 * with the positive control that proves the same path allows when it should — otherwise an
 * evaluator that denied everything would pass the whole file.
 */

const db = new TestDatabase('freightos_test_n5b_sensitivity');

const PROJECTION = 'com.rigreceipts.network.disclosure.projection.workflow_state_minimal.v1';
const PURPOSE = 'shipment_execution';
const WORKFLOW_STATE = 'https://schemas.rigreceipts.com/network/workflow-state.v1.json';
const CAPABILITY = 'https://schemas.rigreceipts.com/network/capability-advertisement.v1.json';
const CONSENT_GRANT = 'https://schemas.rigreceipts.com/network/consent-grant.v1.json';

const N5B_TABLES = [
  'network_disclosure_purpose_ceilings',
  'network_disclosure_sensitivities',
  'network_schema_disclosure_sensitivity',
] as const;

let owner: Client;
let app: Client;
let worker: Client;
let adminA: Client;
let fixtureA: IdentityFixture;

let orgA = '';
let orgExternal = '';
let orgSameTenant = '';
let orgOtherTenant = '';

/** The metadata exactly as 0033 seeded it, and the shipped projection alongside it. */
let metadata: SensitivityMetadata;
let projection: DisclosureProjection;
let realGrantId = '';

const asAdminOfA = <T>(work: (c: Queryable) => Promise<T>): Promise<T> =>
  withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), work);

/** Register an organization participant — participant provisioning is N1's job, not N5-B's. */
async function registerOrganization(label: string, tenantId: string | null): Promise<string> {
  return asRole(db, 'freightos_control_plane', async (client) => {
    const r = await client.query<{ id: string }>(
      `INSERT INTO network_participants
         (participant_type, display_name, tenant_id, status, source_system, created_by, updated_by)
       VALUES ('organization', $1, $2, 'active', 'test:n5b', 'test:n5b', 'test:n5b')
       RETURNING id`,
      [`n5b-${label}`, tenantId],
    );
    return r.rows[0]!.id;
  });
}

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

/** Load the governed metadata the way a runtime reader would — as `freightos_app`, under RLS. */
async function loadMetadata(c: Client): Promise<SensitivityMetadata> {
  return {
    sensitivities: (
      await c.query<{ code: string; rank: string; d: boolean }>(
        `SELECT code, rank::text AS rank, externally_disclosable AS d
           FROM network_disclosure_sensitivities ORDER BY rank`,
      )
    ).rows.map((r) => ({ code: r.code, rank: Number(r.rank), externallyDisclosable: r.d })),
    assignments: (
      await c.query<{ r: string; c: string }>(
        `SELECT durable_schema_ref AS r, sensitivity_code AS c
           FROM network_schema_disclosure_sensitivity ORDER BY 1`,
      )
    ).rows.map((r) => ({ durableSchemaRef: r.r, sensitivityCode: r.c })),
    purposeCeilings: (
      await c.query<{ p: string; m: string }>(
        `SELECT purpose_code AS p, max_sensitivity_code AS m
           FROM network_disclosure_purpose_ceilings ORDER BY 1`,
      )
    ).rows.map((r) => ({ purposeCode: r.p, maxSensitivityCode: r.m })),
  };
}

const active = (id: string): DisclosureParticipant => ({
  participantId: id,
  participantType: 'organization',
  status: 'active',
});

/** A disclosure request built from the REAL grant and the REAL shipped projection. */
function request(overrides: Partial<DisclosureInput> = {}): DisclosureInput {
  const grant: DisclosureGrant = {
    grantId: realGrantId,
    grantorParticipantId: orgA,
    recipientParticipantId: orgExternal,
    purposeCode: PURPOSE,
    projectionRef: PROJECTION,
    authorityBasisCode: 'bilateral_grant',
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveUntil: null,
    revokedAt: null,
  };
  return {
    event: { eventId: 'evt-n5b', organizationId: orgA, schemaRef: WORKFLOW_STATE, data: {} },
    recipientParticipantId: orgExternal,
    requestedPurpose: PURPOSE,
    decidedAt: new Date('2026-06-01T00:00:00.000Z'),
    grants: [grant],
    projections: [projection],
    participants: [
      active(orgA),
      active(orgExternal),
      active(orgSameTenant),
      active(orgOtherTenant),
    ],
    ...overrides,
  };
}

/** Maximal N5-A authority over an arbitrary contract, so only the ceiling can refuse. */
function maximalFor(schemaRef: string): Partial<DisclosureInput> {
  const ref = 'com.rigreceipts.network.disclosure.projection.n5b_probe.v1';
  return {
    event: { eventId: 'evt-probe', organizationId: orgA, schemaRef, data: {} },
    grants: [
      {
        grantId: realGrantId,
        grantorParticipantId: orgA,
        recipientParticipantId: orgExternal,
        purposeCode: PURPOSE,
        projectionRef: ref,
        authorityBasisCode: 'bilateral_grant',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        effectiveUntil: null,
        revokedAt: null,
      },
    ],
    projections: [{ projectionRef: ref, durableSchemaRef: schemaRef, pointers: ['/a', '/b'] }],
  };
}

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  fixtureA = await seedVerifiedFixture(db, TENANT_A);
  owner = db.connectAs('postgres');
  await owner.connect();
  // A real runtime LOGIN, not `SET ROLE`: the migrator administers `freightos_app` without SET,
  // and a login is the shape the evaluator's caller actually has in production.
  app = db.connectAs('freightos_app');
  await app.connect();
  // N6's worker is the SECOND governed reader of this metadata, added by 0034. It reads the
  // ceiling to compute a disclosure decision it is not allowed to influence: SELECT and nothing
  // else, proven below at both the privilege layer and the row layer.
  worker = db.connectAs('freightos_delivery_worker');
  await worker.connect();
  adminA = await connectAsFixtureAdministrator(db, fixtureA);

  orgA = await registerOrganization('org-a', TENANT_A);
  orgExternal = await registerOrganization('org-external', null);
  orgSameTenant = await registerOrganization('org-same-tenant', TENANT_A);
  orgOtherTenant = await registerOrganization('org-other-tenant', TENANT_B);

  // A REAL grant, written through the governed N5-A path — permission gate, RLS policy and all.
  // The ceiling is then evaluated against something that genuinely exists rather than a literal.
  await grantPermission('network.disclosure_grant.create', fixtureA, adminA);
  await grantPermission('network.disclosure_grant.read', fixtureA, adminA);
  realGrantId = await asAdminOfA(async (c) => {
    const r = await (c as Client).query<{ grant_id: string }>(
      `INSERT INTO network_disclosure_grants
         (grantor_participant_id, recipient_participant_id, purpose_code, projection_ref,
          authority_basis_code, effective_from, effective_until)
       VALUES ($1, $2, $3, $4, 'bilateral_grant', '2026-01-01T00:00:00Z', NULL)
       RETURNING grant_id`,
      [orgA, orgExternal, PURPOSE, PROJECTION],
    );
    return r.rows[0]!.grant_id;
  });

  metadata = await loadMetadata(app);
  projection = await (async (c: Client) => ({
    projectionRef: PROJECTION,
    durableSchemaRef: WORKFLOW_STATE,
    pointers: (
      await c.query<{ p: string }>(
        `SELECT json_pointer AS p FROM network_disclosure_projection_fields
          WHERE projection_ref = $1 ORDER BY 1`,
        [PROJECTION],
      )
    ).rows.map((r) => r.p),
  }))(app);
}, 300_000);

afterAll(async () => {
  await owner?.end();
  await app?.end();
  await worker?.end();
  await adminA?.end();
});

describe('the shipped metadata is exactly what governance authored', () => {
  it('seeds four ordered levels, one of them absolute', () => {
    expect(
      metadata.sensitivities.map((s) => `${s.code}=${s.rank}/${s.externallyDisclosable}`),
    ).toEqual([
      'execution_operational=10/true',
      'counterparty_identifying=20/true',
      'commercial_terms=30/true',
      'never_external=99/false',
    ]);
  });

  it('assigns every registered durable schema exactly once — relationally, not by count', () => {
    // A count of nine is still nine when one contract is assigned twice and another not at all.
    return (async (c: Client) => {
      const missing = await c.query<{ r: string }>(
        `SELECT s.durable_schema_ref AS r
           FROM network_schema_versions s
           LEFT JOIN network_schema_disclosure_sensitivity a
                  ON a.durable_schema_ref = s.durable_schema_ref
          WHERE a.durable_schema_ref IS NULL`,
      );
      expect(missing.rows.map((r) => r.r)).toEqual([]);

      // Non-vacuity: there really are contracts to check.
      const total = await c.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM network_schema_versions',
      );
      expect(Number(total.rows[0]!.n)).toBeGreaterThanOrEqual(9);
    })(app);
  });

  it('gives every governed purpose exactly one ceiling', () => {
    return (async (c: Client) => {
      const missing = await c.query<{ p: string }>(
        `SELECT p.code AS p FROM network_disclosure_purposes p
             LEFT JOIN network_disclosure_purpose_ceilings x ON x.purpose_code = p.code
            WHERE x.purpose_code IS NULL`,
      );
      expect(missing.rows.map((r) => r.p)).toEqual([]);
      expect(metadata.purposeCeilings).toEqual([
        { purposeCode: 'shipment_execution', maxSensitivityCode: 'counterparty_identifying' },
      ]);
    })(app);
  });

  it('classifies workflow-state as counterparty_identifying, not execution_operational', () => {
    // THE LOAD-BEARING RULING. Its authorized projection includes /participants — a roster that
    // identifies counterparties — and a contract-level model takes the highest sensitivity it
    // carries. Classified from the actual pointer set, never from the projection description,
    // which is separately known to be inaccurate about exactly this field.
    const assigned = metadata.assignments.find((a) => a.durableSchemaRef === WORKFLOW_STATE);
    expect(assigned?.sensitivityCode).toBe('counterparty_identifying');
    expect(projection.pointers).toContain('/participants');
  });
});

describe('the ceiling decides, against real metadata', () => {
  it('ALLOWS the real grant over workflow-state — the positive control', () => {
    // Without this every denial below would pass against an evaluator that denies unconditionally.
    const decision = evaluateDisclosureWithCeiling(request(), metadata);
    expect(decision.decision).toBe('ALLOW');
    if (decision.decision !== 'ALLOW') return;
    expect(decision.sensitivity.sensitivityCode).toBe('counterparty_identifying');
    expect(permittedPointers(decision)).toEqual([...projection.pointers].sort());
  });

  it('DENIES capability-advertisement — commercial_terms is above the shipment_execution ceiling', () => {
    const decision = evaluateDisclosureWithCeiling(request(maximalFor(CAPABILITY)), metadata);
    expect(decision).toMatchObject({
      decision: 'DENY',
      reason: 'sensitivity_above_purpose_ceiling',
      stage: 'sensitivity',
      authorization: null,
    });
    expect(permittedPointers(decision)).toEqual([]);
  });

  it('DENIES consent-grant absolutely — never_external', () => {
    const decision = evaluateDisclosureWithCeiling(request(maximalFor(CONSENT_GRANT)), metadata);
    expect(decision).toMatchObject({ decision: 'DENY', reason: 'schema_never_external' });
    expect(permittedPointers(decision)).toEqual([]);
  });

  it('DENIES all four never_external contracts, whatever authority is presented', () => {
    return (async (c: Client) => {
      const refs = (
        await c.query<{ r: string }>(
          `SELECT durable_schema_ref AS r FROM network_schema_disclosure_sensitivity
            WHERE sensitivity_code = 'never_external' ORDER BY 1`,
        )
      ).rows.map((r) => r.r);
      expect(refs).toHaveLength(4);
      for (const ref of refs) {
        const decision = evaluateDisclosureWithCeiling(request(maximalFor(ref)), metadata);
        expect(decision, ref).toMatchObject({ decision: 'DENY', reason: 'schema_never_external' });
      }
    })(app);
  });

  it('DENIES a contract version that governance has not classified', () => {
    // A v2 adding a sensitive field cannot ride in on v1's ceiling — it has no assignment at all.
    const decision = evaluateDisclosureWithCeiling(
      request(maximalFor('https://schemas.rigreceipts.com/network/workflow-state.v2.json')),
      metadata,
    );
    expect(decision).toMatchObject({ decision: 'DENY', reason: 'sensitivity_unassigned' });
  });
});

describe('the ceiling is orthogonal to who the recipient is', () => {
  const ceilingCodeFor = (i: DisclosureInput): string | null => {
    const d = evaluateDisclosureWithCeiling(i, metadata);
    return d.sensitivity.sensitivityCode;
  };

  it('does not deny an external NULL-tenant recipient on sensitivity grounds', () => {
    // N5-A already permits a NULL-tenant organization to RECEIVE. N5-B must not quietly undo that
    // by treating "no tenant" as sensitive: content sensitivity and recipient authorization are
    // separate dimensions, and the positive control above already uses this recipient.
    const decision = evaluateDisclosureWithCeiling(request(), metadata);
    expect(decision.decision).toBe('ALLOW');
    expect(decision.sensitivity.permits).toBe(true);
  });

  it('does not lower the ceiling when grantor and recipient are both FreightOS tenants', () => {
    // Same-platform membership is not disclosure authority. The internal case must be identical
    // to the external one, and above-ceiling content stays denied for a fellow tenant.
    const external = ceilingCodeFor(request());
    const sameTenant = ceilingCodeFor(
      request({
        recipientParticipantId: orgSameTenant,
        participants: [active(orgA), active(orgSameTenant)],
      }),
    );
    const otherTenant = ceilingCodeFor(request({ recipientParticipantId: orgOtherTenant }));
    expect(sameTenant).toBe(external);
    expect(otherTenant).toBe(external);

    const internalAboveCeiling = evaluateDisclosureWithCeiling(
      request({ ...maximalFor(CAPABILITY), recipientParticipantId: orgSameTenant }),
      metadata,
    );
    expect(internalAboveCeiling).toMatchObject({
      decision: 'DENY',
      reason: 'sensitivity_above_purpose_ceiling',
    });
  });
});

/**
 * The provenance column each table actually has.
 *
 * They are NOT the same, and that is the whole reason this map exists rather than one literal.
 * `network_disclosure_sensitivities` records who wrote a vocabulary level (`created_by`); the other
 * two record who made an assignment (`assigned_by`). An UPDATE naming the wrong one never reaches
 * a guard at all — PostgreSQL resolves columns during parse analysis and raises `undefined_column`
 * (42703) first — so the statement "fails" and an assertion that only requires it to throw is
 * satisfied by a typo. `probe column exists` below is the gate that makes that impossible.
 */
const PROBE_COLUMN: Readonly<Record<(typeof N5B_TABLES)[number], string>> = {
  network_disclosure_purpose_ceilings: 'assigned_by',
  network_disclosure_sensitivities: 'created_by',
  network_schema_disclosure_sensitivity: 'assigned_by',
};

/**
 * SQLSTATEs, named so an assertion says which mechanism it is about.
 *
 * `APPEND_ONLY` is what `app.reject_mutation()` raises (`ERRCODE = 'integrity_constraint_violation'`
 * in migration 0001). Nothing else in this file may stand in for it.
 */
const APPEND_ONLY = '23000';
const INSUFFICIENT_PRIVILEGE = '42501';
const UNDEFINED_COLUMN = '42703';
const TRUNCATE_BLOCKED_BY_FK = '0A000';

interface Outcome {
  readonly sqlstate: string | null;
  readonly message: string;
  readonly rowCount: number | null;
}

/** Run one statement in its own transaction and report what PostgreSQL actually did. */
async function attempt(c: Client, sql: string): Promise<Outcome> {
  await c.query('BEGIN');
  try {
    const r = await c.query(sql);
    await c.query('ROLLBACK');
    return { sqlstate: null, message: '', rowCount: r.rowCount };
  } catch (error) {
    await c.query('ROLLBACK');
    const e = error as Error & { code?: string };
    return { sqlstate: e.code ?? 'unknown', message: e.message.split('\n')[0]!, rowCount: null };
  }
}

/**
 * Require the append-only trigger, by identity, and nothing that merely resembles it.
 *
 * An undefined column, a privilege denial, a foreign-key refusal, a CHECK violation or an RLS
 * zero-row no-op are all things that can happen to a write against these tables. None of them is
 * evidence that `app.reject_mutation()` exists or fires, so the SQLSTATE and the message it emits
 * are both pinned.
 */
function expectAppendOnlyTrigger(outcome: Outcome, table: string, op: string): void {
  expect(
    outcome.sqlstate,
    `${table} ${op}: expected app.reject_mutation(), got ${outcome.message}`,
  ).toBe(APPEND_ONLY);
  expect(outcome.message).toBe(`${table} is append-only: ${op} is not permitted`);
}

/** Full logical content of a table, read as the superuser so RLS cannot hide a change. */
async function contentDigest(table: string): Promise<string> {
  const r = await owner.query<{ h: string }>(
    `SELECT coalesce(md5(string_agg(x::text, ',' ORDER BY x::text)), '(empty)') AS h FROM ${table} x`,
  );
  return r.rows[0]!.h;
}

describe('the immutability oracle itself', () => {
  it('names a probe column that exists on every N5-B table', () => {
    return (async (c: Client) => {
      // Without this the whole suite below can pass on `undefined_column`. It is the gate that
      // turns a future created_by/assigned_by typo into a loud failure instead of a false green.
      expect(Object.keys(PROBE_COLUMN).sort()).toEqual([...N5B_TABLES].sort());
      for (const table of N5B_TABLES) {
        const r = await c.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM pg_attribute
            WHERE attrelid = $1::regclass AND attname = $2 AND attnum > 0 AND NOT attisdropped`,
          [table, PROBE_COLUMN[table]],
        );
        expect(Number(r.rows[0]!.n), `${table}.${PROBE_COLUMN[table]} must exist`).toBe(1);
      }
    })(app);
  });

  it('rejects a nonexistent probe column instead of crediting it as immutability', async () => {
    // The defect this suite was rewritten to fix, pinned as a permanent control. `assigned_by` is
    // the column the previous revision used for ALL three tables; on the vocabulary table it does
    // not exist, so the statement died in parse analysis and the trigger was never consulted.
    const wrong = await attempt(
      owner,
      `UPDATE network_disclosure_sensitivities SET assigned_by = 'x'`,
    );
    expect(wrong.sqlstate).toBe(UNDEFINED_COLUMN);

    // And the oracle must refuse to accept that as proof.
    expect(() =>
      expectAppendOnlyTrigger(wrong, 'network_disclosure_sensitivities', 'UPDATE'),
    ).toThrow();

    // The same statement with the column the table really has does reach the trigger.
    const right = await attempt(
      owner,
      `UPDATE network_disclosure_sensitivities SET ${PROBE_COLUMN.network_disclosure_sensitivities} = 'x'`,
    );
    expectAppendOnlyTrigger(right, 'network_disclosure_sensitivities', 'UPDATE');
  });
});

describe('layer A — the runtime principal has no write authority at all', () => {
  // freightos_app is refused before RLS or any trigger is reached: it simply holds no write
  // privilege on these tables. This is the ACL layer and nothing else.
  for (const table of N5B_TABLES) {
    for (const [verb, sql] of [
      ['INSERT', `INSERT INTO ${table} DEFAULT VALUES`],
      ['UPDATE', `UPDATE ${table} SET ${PROBE_COLUMN[table]} = 'tampered'`],
      ['DELETE', `DELETE FROM ${table}`],
      ['TRUNCATE', `TRUNCATE ${table}`],
    ] as const) {
      it(`refuses ${verb} on ${table} as freightos_app`, async () => {
        const outcome = await attempt(app, sql);
        expect(outcome.sqlstate, `${verb} ${table}: ${outcome.message}`).toBe(
          INSUFFICIENT_PRIVILEGE,
        );
        expect(outcome.message).toBe(`permission denied for table ${table}`);
      });
    }
  }

  it('still lets the runtime READ them — anti-vacuity for every refusal above', () => {
    return (async (c: Client) => {
      const r = await c.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM network_disclosure_sensitivities',
      );
      expect(Number(r.rows[0]!.n)).toBe(4);
    })(app);
  });

  it('refuses every write to an administrative and control-plane identity too', async () => {
    // Database administrative capability is not network disclosure authority.
    for (const role of ['freightos_control_plane', 'freightos_admin_owner']) {
      for (const table of N5B_TABLES) {
        await expect(
          asRole(db, role, (c) => c.query(`UPDATE ${table} SET ${PROBE_COLUMN[table]} = 'x'`)),
        ).rejects.toThrow();
      }
    }
  });
});

describe('layer B — the true table owner, under FORCE RLS', () => {
  // The owner is freightos_migrator, the deployment authority that ran 0033. It is NOT postgres;
  // postgres appears in this file only as the superuser used to reach the triggers in layer C.
  it('is owned by freightos_migrator', () => {
    return (async (c: Client) => {
      for (const table of N5B_TABLES) {
        const r = await c.query<{ o: string }>(
          `SELECT pg_get_userbyid(relowner) AS o FROM pg_class
            WHERE relname = $1 AND relnamespace = 'public'::regnamespace`,
          [table],
        );
        expect(r.rows[0]!.o, table).toBe('freightos_migrator');
      }
    })(app);
  });

  it('resolves owner UPDATE and DELETE to zero rows rather than an error, and changes nothing', async () => {
    // FORCE RLS binds the owner too, and 0033 defines SELECT policies only. An UPDATE or DELETE
    // therefore matches no row and PostgreSQL raises nothing — this is a silent no-op, not a
    // refusal, and calling it a refusal would misdescribe the mechanism. The row trigger never
    // fires because no row is ever reached; layer C is what proves the trigger exists.
    const migrator = db.connectAsMigrator();
    await migrator.connect();
    try {
      for (const table of N5B_TABLES) {
        const before = await contentDigest(table);

        const updated = await attempt(migrator, `UPDATE ${table} SET ${PROBE_COLUMN[table]} = 'x'`);
        expect(updated.sqlstate, `${table} UPDATE`).toBeNull();
        expect(updated.rowCount, `${table} UPDATE must touch no row`).toBe(0);

        const deleted = await attempt(migrator, `DELETE FROM ${table}`);
        expect(deleted.sqlstate, `${table} DELETE`).toBeNull();
        expect(deleted.rowCount, `${table} DELETE must touch no row`).toBe(0);

        expect(await contentDigest(table), `${table} content`).toBe(before);
      }
    } finally {
      await migrator.end();
    }
  });

  it('refuses owner INSERT through the RLS WITH CHECK, not through a privilege denial', async () => {
    const migrator = db.connectAsMigrator();
    await migrator.connect();
    try {
      for (const table of N5B_TABLES) {
        const outcome = await attempt(migrator, `INSERT INTO ${table} DEFAULT VALUES`);
        expect(outcome.sqlstate, `${table} INSERT: ${outcome.message}`).toBe(
          INSUFFICIENT_PRIVILEGE,
        );
        expect(outcome.message).toBe(
          `new row violates row-level security policy for table "${table}"`,
        );
      }
    } finally {
      await migrator.end();
    }
  });

  it('refuses owner TRUNCATE, which RLS does not filter, through the statement trigger', async () => {
    // TRUNCATE is not row-filtered, so unlike UPDATE/DELETE it reaches the statement-level trigger
    // even for the owner. The vocabulary table is the exception: two foreign keys reference it, so
    // PostgreSQL refuses at the constraint first and CASCADE is what gets past it to the trigger.
    const migrator = db.connectAsMigrator();
    await migrator.connect();
    try {
      for (const table of N5B_TABLES) {
        const before = await contentDigest(table);
        const plain = await attempt(migrator, `TRUNCATE ${table}`);
        if (table === 'network_disclosure_sensitivities') {
          expect(plain.sqlstate).toBe(TRUNCATE_BLOCKED_BY_FK);
          expectAppendOnlyTrigger(
            await attempt(migrator, `TRUNCATE ${table} CASCADE`),
            table,
            'TRUNCATE',
          );
        } else {
          expectAppendOnlyTrigger(plain, table, 'TRUNCATE');
        }
        expect(await contentDigest(table), `${table} content`).toBe(before);
      }
    } finally {
      await migrator.end();
    }
  });
});

describe('layer C — the append-only trigger, reached and proven to fire', () => {
  // This is the decisive immutability oracle. `owner` here is the SUPERUSER / RLS-bypass test
  // principal: a superuser is not subject to row-level security, so its UPDATE and DELETE reach
  // real rows and therefore reach `app.reject_mutation()`. Under any RLS-bound identity the same
  // statements are filtered to zero rows and prove nothing about the trigger.
  for (const table of N5B_TABLES) {
    it(`fires app.reject_mutation() on UPDATE ${table}`, async () => {
      const before = await contentDigest(table);
      expectAppendOnlyTrigger(
        await attempt(owner, `UPDATE ${table} SET ${PROBE_COLUMN[table]} = 'tampered'`),
        table,
        'UPDATE',
      );
      expect(await contentDigest(table)).toBe(before);
    });

    it(`fires app.reject_mutation() on DELETE ${table}`, async () => {
      const before = await contentDigest(table);
      expectAppendOnlyTrigger(await attempt(owner, `DELETE FROM ${table}`), table, 'DELETE');
      expect(await contentDigest(table)).toBe(before);
    });

    it(`fires app.reject_mutation() on TRUNCATE ${table}`, async () => {
      const before = await contentDigest(table);
      const plain = await attempt(owner, `TRUNCATE ${table}`);
      if (table === 'network_disclosure_sensitivities') {
        // Named rather than hidden: the foreign keys refuse before the trigger is consulted, so
        // the plain form proves the constraint and CASCADE proves the trigger.
        expect(plain.sqlstate).toBe(TRUNCATE_BLOCKED_BY_FK);
        expectAppendOnlyTrigger(
          await attempt(owner, `TRUNCATE ${table} CASCADE`),
          table,
          'TRUNCATE',
        );
      } else {
        expectAppendOnlyTrigger(plain, table, 'TRUNCATE');
      }
      expect(await contentDigest(table)).toBe(before);
    });
  }

  it('is the trigger doing the refusing — disable it and the same UPDATE succeeds', async () => {
    // The positive control for layer C. Without it, every assertion above is consistent with the
    // trigger having been dropped and something else refusing. Disabling happens inside a
    // transaction that is always rolled back: PostgreSQL DDL is transactional, so the trigger is
    // restored exactly, and nothing is ever committed.
    for (const table of N5B_TABLES) {
      const before = await contentDigest(table);
      await owner.query('BEGIN');
      try {
        await owner.query(`ALTER TABLE ${table} DISABLE TRIGGER ${table}_no_update`);
        const r = await owner.query(`UPDATE ${table} SET ${PROBE_COLUMN[table]} = 'tampered'`);
        expect(
          r.rowCount,
          `${table}: with the trigger off the UPDATE must reach rows`,
        ).toBeGreaterThan(0);
      } finally {
        await owner.query('ROLLBACK');
      }

      // Restored, and provably so: enabled in the catalog, refusing again, content untouched.
      const enabled = await owner.query<{ e: string }>(
        `SELECT tgenabled AS e FROM pg_trigger WHERE tgrelid = $1::regclass AND tgname = $2`,
        [table, `${table}_no_update`],
      );
      expect(enabled.rows[0]!.e, `${table} trigger must be re-enabled`).toBe('O');
      expectAppendOnlyTrigger(
        await attempt(owner, `UPDATE ${table} SET ${PROBE_COLUMN[table]} = 'tampered'`),
        table,
        'UPDATE',
      );
      expect(await contentDigest(table), `${table} content`).toBe(before);
    }
  });
});

describe('the database surface N5-B adds', () => {
  it('carries RLS enabled and forced on all three tables', async () => {
    const r = await owner.query<{ t: string }>(
      `SELECT string_agg(c.relname || '=' || c.relrowsecurity::text || '/' ||
                         c.relforcerowsecurity::text, ',' ORDER BY c.relname) AS t
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY($1)`,
      [[...N5B_TABLES]],
    );
    expect(r.rows[0]!.t).toBe(
      'network_disclosure_purpose_ceilings=true/true,' +
        'network_disclosure_sensitivities=true/true,' +
        'network_schema_disclosure_sensitivity=true/true',
    );
  });

  it('defines exactly three policies, all SELECT', async () => {
    const r = await owner.query<{ t: string }>(
      `SELECT coalesce(string_agg(policyname || ':' || cmd, ',' ORDER BY policyname), '(none)') AS t
         FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [[...N5B_TABLES]],
    );
    expect(r.rows[0]!.t).toBe(
      'network_disclosure_purpose_ceilings_read:SELECT,' +
        'network_disclosure_sensitivities_read:SELECT,' +
        'network_schema_disclosure_sensitivity_read:SELECT',
    );
  });

  it('grants the two runtime readers SELECT and nothing else, and no other role anything', async () => {
    // N5-B has TWO governed readers, not one. 0033 shipped with `freightos_app`; 0034 added
    // `freightos_delivery_worker`, which must consult the ceiling to compute a delivery decision.
    // The set stays CLOSED and the privilege stays SELECT — a reader that could write the ceiling
    // it is measured against is not a reader, it is an authority, and N5-B's whole purpose is that
    // the ceiling is authored by governance and consulted by everyone else.
    const r = await owner.query<{ line: string }>(
      `SELECT format('%s %s %s', table_name, grantee,
                string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type)) AS line
         FROM information_schema.role_table_grants
        WHERE table_name = ANY($1) GROUP BY table_name, grantee ORDER BY table_name, grantee`,
      [[...N5B_TABLES]],
    );
    const owned = 'DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE';
    expect(r.rows.map((x) => x.line)).toEqual(
      N5B_TABLES.flatMap((t) => [
        `${t} freightos_app SELECT`,
        `${t} freightos_delivery_worker SELECT`,
        // The migration owner holds the table because it created it. Its writes are still refused,
        // one layer further in, by the append-only triggers proven in `layer C` above.
        `${t} freightos_migrator ${owned}`,
      ]),
    );
  });

  it('denies every write to both readers at the ACL layer, and grants PUBLIC nothing', async () => {
    // Enforcement-layer attribution, stated explicitly rather than inferred from a thrown error:
    // for the two runtime readers the write refusal is an ACL fact — the privilege was never
    // granted — so it is `has_table_privilege` false here and SQLSTATE 42501 at runtime. It is NOT
    // the append-only trigger, which these principals cannot reach; crediting a 42501 to the
    // trigger would leave the trigger untested. The trigger is proven separately, in `layer C`,
    // through the one principal that does get past the ACL: the table owner.
    const r = await owner.query<{ line: string }>(
      `SELECT format('%s %s select=%s insert=%s update=%s delete=%s truncate=%s',
                c.relname, g.rolname,
                has_table_privilege(g.rolname, c.oid, 'SELECT')::text,
                has_table_privilege(g.rolname, c.oid, 'INSERT')::text,
                has_table_privilege(g.rolname, c.oid, 'UPDATE')::text,
                has_table_privilege(g.rolname, c.oid, 'DELETE')::text,
                has_table_privilege(g.rolname, c.oid, 'TRUNCATE')::text) AS line
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         CROSS JOIN (VALUES ('freightos_app'), ('freightos_delivery_worker'), ('public'))
                    AS g(rolname)
        WHERE n.nspname = 'public' AND c.relname = ANY($1)
        ORDER BY c.relname, g.rolname`,
      [[...N5B_TABLES]],
    );
    expect(r.rows.map((x) => x.line)).toEqual(
      N5B_TABLES.flatMap((t) => [
        `${t} freightos_app select=true insert=false update=false delete=false truncate=false`,
        `${t} freightos_delivery_worker select=true insert=false update=false delete=false truncate=false`,
        // PUBLIC is the grantee an accidental `GRANT ... TO PUBLIC` would land on, and the one
        // that would hand the whole cluster a read without naming anybody.
        `${t} public select=false insert=false update=false delete=false truncate=false`,
      ]),
    );
  });

  it('lets the delivery worker actually READ the governed metadata, not merely hold a GRANT', async () => {
    // The anti-vacuity control for the reader set above. Under FORCE RLS a GRANT with no admitting
    // SELECT policy returns ZERO ROWS rather than an error — the worst failure shape there is,
    // because the worker would compute "no ceiling applies" and disclose. Asserting the privilege
    // exists proves nothing about that; only rows do.
    const assignment = await worker.query<{ code: string }>(
      `SELECT sensitivity_code AS code FROM network_schema_disclosure_sensitivity
        WHERE durable_schema_ref = $1`,
      [WORKFLOW_STATE],
    );
    expect(assignment.rows.map((x) => x.code)).toEqual(['counterparty_identifying']);

    const ceiling = await worker.query<{ code: string }>(
      `SELECT max_sensitivity_code AS code FROM network_disclosure_purpose_ceilings
        WHERE purpose_code = $1`,
      [PURPOSE],
    );
    expect(ceiling.rows.map((x) => x.code)).toEqual(['counterparty_identifying']);

    // And the ranked vocabulary the two above are compared through — without it the worker can
    // read both sides of the comparison and still not be able to make it.
    const vocabulary = await worker.query<{ line: string }>(
      `SELECT format('%s=%s/%s', code, rank, externally_disclosable::text) AS line
         FROM network_disclosure_sensitivities ORDER BY rank`,
    );
    expect(vocabulary.rows.map((x) => x.line)).toEqual([
      'execution_operational=10/true',
      'counterparty_identifying=20/true',
      'commercial_terms=30/true',
      'never_external=99/false',
    ]);
  });

  it('refuses the delivery worker every write with 42501, before any trigger runs', async () => {
    // The runtime half of the ACL matrix above: a real connection, a real statement, a pinned
    // SQLSTATE. 42501 is `insufficient_privilege` — the ACL. If this ever came back 23000 the
    // worker would have been granted the privilege and stopped by the trigger instead, which is a
    // strictly weaker arrangement and a regression worth failing on.
    for (const table of N5B_TABLES) {
      for (const statement of [
        // `PROBE_COLUMN` because the three tables do not share one: a statement naming a column
        // that does not exist fails 42703 during parse, before the privilege check runs, and would
        // have credited a typo as a security proof.
        `UPDATE ${table} SET ${PROBE_COLUMN[table]} = 'tampered'`,
        `DELETE FROM ${table}`,
        `TRUNCATE ${table}`,
      ]) {
        await worker.query('BEGIN');
        const error = await worker.query(statement).then(
          () => null,
          (e: { code?: string }) => e,
        );
        await worker.query('ROLLBACK');
        expect(error, `${statement} must be refused`).not.toBeNull();
        expect((error as { code?: string }).code, `${statement} enforcement layer`).toBe('42501');
      }
    }
  });

  it('adds no database function, and therefore no SECURITY DEFINER', async () => {
    const r = await owner.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('app', 'admin', 'authn')
          AND (p.proname LIKE '%disclosure_sensitivit%' OR p.proname LIKE '%purpose_ceiling%')`,
    );
    expect(r.rows[0]!.n).toBe('0');
  });

  it('carries nine immutability triggers, three per table', async () => {
    const r = await owner.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE NOT t.tgisinternal AND p.proname = 'reject_mutation' AND c.relname = ANY($1)`,
      [[...N5B_TABLES]],
    );
    expect(r.rows[0]!.n).toBe('9');
  });

  it('leaves the six N5-A tables and their policies untouched', async () => {
    // This assertion used to establish "N5-A" as `network_disclosure_%` MINUS the N5-B three. That
    // definition was true only while those were the only two layers using the prefix; 0034 added
    // five more tables matching it, and the assertion quietly became a statement about eleven
    // relations. N5-A's six are now named — see `network-relations.ts`, and see
    // `network-disclosure-relation-inventory` for the gate that fails when a NEW relation in the
    // family goes unclassified. Naming the set is what makes that gate possible: a pattern cannot
    // notice that its own meaning has changed.
    const r = await owner.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1)
        ORDER BY c.relname`,
      [[...N5A_DISCLOSURE_RELATIONS]],
    );
    expect(r.rows.map((x) => x.relname)).toEqual([...N5A_DISCLOSURE_RELATIONS]);

    // The policies half the title promises, which the old assertion never actually checked: N5-A's
    // policies are still exactly N5-A's, and 0033 neither added one nor dropped one.
    const policies = await owner.query<{ line: string }>(
      `SELECT format('%s:%s:%s', tablename, policyname, cmd) AS line FROM pg_policies
        WHERE schemaname = 'public' AND tablename = ANY($1) ORDER BY tablename, policyname`,
      [[...N5A_DISCLOSURE_RELATIONS]],
    );
    expect(policies.rows.map((x) => x.line)).toEqual([
      'network_disclosure_authority_bases:network_disclosure_authority_bases_read:SELECT',
      // 0034's two, added because the delivery worker must re-authorize against CURRENT
      // authorization at delivery time — it has to be able to see that a grant was revoked. They
      // are read-only and role-scoped, and they sit alongside the app policies rather than
      // replacing them: N5-A's write path is untouched, which is what "untouched" means here.
      'network_disclosure_grant_revocations:network_disclosure_grant_revocations_delivery_worker_read:SELECT',
      'network_disclosure_grant_revocations:network_disclosure_grant_revocations_insert:INSERT',
      'network_disclosure_grant_revocations:network_disclosure_grant_revocations_read:SELECT',
      'network_disclosure_grants:network_disclosure_grants_delivery_worker_read:SELECT',
      'network_disclosure_grants:network_disclosure_grants_insert:INSERT',
      'network_disclosure_grants:network_disclosure_grants_read:SELECT',
      'network_disclosure_projection_fields:network_disclosure_projection_fields_read:SELECT',
      'network_disclosure_projections:network_disclosure_projections_read:SELECT',
      'network_disclosure_purposes:network_disclosure_purposes_read:SELECT',
    ]);

    // And the writers are still only the two N5-A shipped with. The worker gained a READ; nothing
    // gained a write, which is the property the title is really claiming.
    const writers = await owner.query<{ line: string }>(
      `SELECT format('%s:%s:%s', tablename, policyname, cmd) AS line FROM pg_policies
        WHERE schemaname = 'public' AND tablename = ANY($1) AND cmd <> 'SELECT'
        ORDER BY tablename, policyname`,
      [[...N5A_DISCLOSURE_RELATIONS]],
    );
    expect(writers.rows.map((x) => x.line)).toEqual([
      'network_disclosure_grant_revocations:network_disclosure_grant_revocations_insert:INSERT',
      'network_disclosure_grants:network_disclosure_grants_insert:INSERT',
    ]);
  });
});

describe('the historical classification column stays inert', () => {
  it('is not consulted, whatever a producer writes into it', () => {
    // `network_events.classification` is producer-supplied and ungoverned. N5-B resolves
    // sensitivity from durable_schema_ref alone, so the column cannot appear in the decision —
    // it is not in the evaluator's input type at all, which is the enforcement.
    const before = evaluateDisclosureWithCeiling(request(maximalFor(CONSENT_GRANT)), metadata);
    for (const claim of ['public', 'execution_operational', '', 'never_external']) {
      const after = evaluateDisclosureWithCeiling(
        request({
          ...maximalFor(CONSENT_GRANT),
          event: {
            eventId: 'evt-claim',
            organizationId: orgA,
            schemaRef: CONSENT_GRANT,
            data: { classification: claim },
          },
        }),
        metadata,
      );
      expect(after.decision, claim).toBe('DENY');
      expect(after.sensitivity.sensitivityCode, claim).toBe(before.sensitivity.sensitivityCode);
    }
  });
});
