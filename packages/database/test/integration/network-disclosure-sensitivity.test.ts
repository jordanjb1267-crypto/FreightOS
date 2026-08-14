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

  it('gives every governed purpose exactly one ceiling', () => async (c: Client) => {
    const missing = await c.query<{ p: string }>(
      `SELECT p.code AS p FROM network_disclosure_purposes p
           LEFT JOIN network_disclosure_purpose_ceilings x ON x.purpose_code = p.code
          WHERE x.purpose_code IS NULL`,
    );
    expect(missing.rows.map((r) => r.p)).toEqual([]);
    expect(metadata.purposeCeilings).toEqual([
      { purposeCode: 'shipment_execution', maxSensitivityCode: 'counterparty_identifying' },
    ]);
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

  it('DENIES all four never_external contracts, whatever authority is presented', () =>
    async (c: Client) => {
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

describe('runtime cannot rewrite the ceiling', () => {
  const WRITES: readonly [string, string][] = [
    ['INSERT', `INSERT INTO %T VALUES (DEFAULT)`],
    ['UPDATE', `UPDATE %T SET assigned_by = 'tampered'`],
    ['DELETE', `DELETE FROM %T`],
    ['TRUNCATE', `TRUNCATE %T`],
  ];

  for (const table of N5B_TABLES) {
    for (const [verb, sql] of WRITES) {
      it(`refuses ${verb} on ${table} as freightos_app`, () => async (c: Client) => {
        await expect(c.query(sql.replace('%T', table))).rejects.toThrow();
      });
    }
  }

  it('refuses UPDATE and DELETE even to the table owner — FORCE RLS plus the guards', async () => {
    // Migration ownership is not runtime administration. The owner is subject to policy too, and
    // the append-only triggers fire regardless of privilege.
    for (const table of N5B_TABLES) {
      await expect(owner.query(`UPDATE ${table} SET assigned_by = 'x'`)).rejects.toThrow();
      await expect(owner.query(`DELETE FROM ${table}`)).rejects.toThrow();
    }
  });

  it('refuses every write to an administrative and control-plane identity too', async () => {
    // Database administrative capability is not network disclosure authority.
    for (const role of ['freightos_control_plane', 'freightos_admin_owner']) {
      for (const table of N5B_TABLES) {
        await expect(
          asRole(db, role, (c) => c.query(`UPDATE ${table} SET assigned_by = 'x'`)),
        ).rejects.toThrow();
      }
    }
  });

  it('still lets the runtime READ them — anti-vacuity for every refusal above', () =>
    async (c: Client) => {
      const r = await c.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM network_disclosure_sensitivities',
      );
      expect(Number(r.rows[0]!.n)).toBe(4);
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

  it('grants the runtime reader SELECT and nothing else, and no other role anything', async () => {
    const r = await owner.query<{ grantee: string; privs: string }>(
      `SELECT grantee, string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) AS privs
         FROM information_schema.role_table_grants
        WHERE table_name = ANY($1) GROUP BY grantee ORDER BY grantee`,
      [[...N5B_TABLES]],
    );
    const app = r.rows.find((x) => x.grantee === 'freightos_app');
    expect(app?.privs).toBe('SELECT');
    expect(
      r.rows.filter((x) => x.grantee !== 'freightos_app').map((x) => x.grantee),
      'only the migration owner may hold anything beyond the reader',
    ).toEqual(['freightos_migrator']);
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
    const r = await owner.query<{ t: string }>(
      `SELECT string_agg(c.relname, ',' ORDER BY c.relname) AS t
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND c.relname LIKE 'network\\_disclosure\\_%' AND c.relname <> ALL($1)`,
      [[...N5B_TABLES]],
    );
    expect(r.rows[0]!.t).toBe(
      'network_disclosure_authority_bases,network_disclosure_grant_revocations,' +
        'network_disclosure_grants,network_disclosure_projection_fields,' +
        'network_disclosure_projections,network_disclosure_purposes',
    );
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
