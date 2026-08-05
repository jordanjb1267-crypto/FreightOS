import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadMigrations, migrateDown, migrateUp } from '../../src/migrator.ts';
import { MIGRATIONS_DIR } from '../../src/paths.ts';
import { TENANT_A, TENANT_B, TestDatabase } from './harness.ts';

/**
 * OQ-19 — `legal_entity` and `operating_context` kill-switch scopes.
 *
 * The binding requirement alongside adding them is backward compatibility: every Phase 0
 * kill-switch record must stay valid and resolve to the identical mode. The regression at the end
 * of this file proves it by capturing resolution BEFORE the two migrations and replaying the same
 * matrix after.
 *
 * Enforcement scope, stated plainly: this records and resolves kill switches. Phase 1 does not
 * enforce one at the consequential command point — Phase 0 carry-forward item 1 defers that to
 * Phase 3 (OQ-14, P-17). Nothing here claims protection that has not been built.
 */
const db = new TestDatabase('freightos_test_kill_switch_scopes');

const LEGAL_ENTITY_A = '33333333-3333-4333-8333-333333333333';
const LEGAL_ENTITY_B = '44444444-4444-4444-8444-444444444444';

let admin: Client;

async function engage(
  scope: string,
  scopeRef: string | null,
  tenantId: string | null,
  mode: string,
) {
  return admin.query(
    `INSERT INTO kill_switches
       (scope, scope_ref, tenant_id, mode, reason, engaged_by_type, engaged_by, created_by)
     VALUES ($1, $2, $3, $4, 'integration test', 'human', 'test:operator', 'test:operator')`,
    [scope, scopeRef, tenantId, mode],
  );
}

async function resolve(params: {
  tenantId?: string | null;
  legalPlane?: string | null;
  workflowId?: string | null;
  agentId?: string | null;
  toolId?: string | null;
  integrationId?: string | null;
  legalEntityId?: string | null;
  operatingContext?: string | null;
}): Promise<string> {
  const r = await admin.query<{ mode: string }>(
    `SELECT app.resolve_kill_switch_mode($1, $2, $3, $4, $5, $6, $7, $8) AS mode`,
    [
      params.tenantId ?? null,
      params.legalPlane ?? null,
      params.workflowId ?? null,
      params.agentId ?? null,
      params.toolId ?? null,
      params.integrationId ?? null,
      params.legalEntityId ?? null,
      params.operatingContext ?? null,
    ],
  );
  return r.rows[0]!.mode;
}

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  admin = db.connectAs('postgres');
  await admin.connect();
}, 60_000);

afterAll(async () => {
  await admin?.end();
});

describe('the standing autonomous_mobility suspension', () => {
  it('ships engaged, cross-tenant, and by the platform rather than an agent', async () => {
    const r = await admin.query<{
      scope: string;
      scope_ref: string;
      tenant_id: string | null;
      mode: string;
      engaged_by_type: string;
      released_at: string | null;
    }>(`SELECT * FROM kill_switches WHERE id = 'f0000000-0000-4000-8000-00000000a119'`);
    const row = r.rows[0]!;
    expect(row.scope).toBe('operating_context');
    expect(row.scope_ref).toBe('autonomous_mobility');
    expect(row.tenant_id).toBeNull();
    expect(row.mode).toBe('suspended');
    expect(row.engaged_by_type).toBe('system');
    expect(row.released_at).toBeNull();
  });

  it('suspends autonomous_mobility for every tenant', async () => {
    expect(await resolve({ tenantId: TENANT_A, operatingContext: 'autonomous_mobility' })).toBe(
      'suspended',
    );
    expect(await resolve({ tenantId: TENANT_B, operatingContext: 'autonomous_mobility' })).toBe(
      'suspended',
    );
  });

  it('leaves every other operating context enabled', async () => {
    for (const context of ['system', 'carrier', 'shipper_owned', 'facility_operator']) {
      expect(await resolve({ tenantId: TENANT_A, operatingContext: context }), context).toBe(
        'enabled',
      );
    }
  });

  it('is visible to a tenant session, because a tenant must see why its work stopped', async () => {
    const appClient = db.connectAs('freightos_app');
    await appClient.connect();
    try {
      await appClient.query('BEGIN');
      await appClient.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_A]);
      const r = await appClient.query<{ scope_ref: string }>(
        `SELECT scope_ref FROM kill_switches WHERE scope = 'operating_context'`,
      );
      await appClient.query('ROLLBACK');
      expect(r.rows.map((x) => x.scope_ref)).toEqual(['autonomous_mobility']);
    } finally {
      await appClient.end();
    }
  });

  it('is not writable by a tenant session', async () => {
    const appClient = db.connectAs('freightos_app');
    await appClient.connect();
    try {
      await appClient.query('BEGIN');
      await appClient.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_A]);
      await expect(
        appClient.query(
          `INSERT INTO kill_switches
             (scope, scope_ref, tenant_id, mode, reason, engaged_by_type, engaged_by, created_by)
           VALUES ('operating_context', 'carrier', NULL, 'suspended', 'tenant halt', 'human',
                   'tenant:operator', 'tenant:operator')`,
        ),
      ).rejects.toThrow(/row-level security/i);
      await appClient.query('ROLLBACK');
    } finally {
      await appClient.end();
    }
  });
});

describe('the new scopes resolve', () => {
  it('applies a legal_entity switch to that entity only', async () => {
    await engage('legal_entity', LEGAL_ENTITY_A, TENANT_A, 'read_only');
    expect(await resolve({ tenantId: TENANT_A, legalEntityId: LEGAL_ENTITY_A })).toBe('read_only');
    expect(await resolve({ tenantId: TENANT_A, legalEntityId: LEGAL_ENTITY_B })).toBe('enabled');
  });

  it('applies an operating_context switch across tenants', async () => {
    await engage('operating_context', 'shipper_owned', null, 'financial_disabled');
    expect(await resolve({ tenantId: TENANT_A, operatingContext: 'shipper_owned' })).toBe(
      'financial_disabled',
    );
    expect(await resolve({ tenantId: TENANT_B, operatingContext: 'shipper_owned' })).toBe(
      'financial_disabled',
    );
  });

  it('takes the most restrictive across old and new scopes together', async () => {
    await engage('tenant', TENANT_A, TENANT_A, 'approval_only');
    const mode = await resolve({
      tenantId: TENANT_A,
      legalEntityId: LEGAL_ENTITY_A,
      operatingContext: 'shipper_owned',
    });
    // approval_only < read_only < financial_disabled? No: enum order is
    // enabled < approval_only < autonomous_disabled < communications_disabled < financial_disabled
    // < read_only < suspended. read_only is the strictest of the three.
    expect(mode).toBe('read_only');
  });

  it('never lets a new narrow scope loosen a broader one', async () => {
    await engage('legal_entity', LEGAL_ENTITY_B, TENANT_B, 'enabled');
    await engage('system', null, null, 'suspended');
    expect(await resolve({ tenantId: TENANT_B, legalEntityId: LEGAL_ENTITY_B })).toBe('suspended');

    await admin.query(
      `UPDATE kill_switches
          SET released_at = now(), released_by = 'test:operator', released_by_type = 'human'
        WHERE scope = 'system' AND released_at IS NULL`,
    );
    expect(await resolve({ tenantId: TENANT_B, legalEntityId: LEGAL_ENTITY_B })).toBe('enabled');
  });

  it('permits one active switch per subject for the new scopes too', async () => {
    await expect(engage('legal_entity', LEGAL_ENTITY_A, TENANT_A, 'suspended')).rejects.toThrow(
      /one_active_per_subject/,
    );
  });
});

describe('invalid shapes are rejected', () => {
  it('requires a legal_entity scope_ref that is a uuid', async () => {
    await expect(engage('legal_entity', 'not-a-uuid', TENANT_A, 'read_only')).rejects.toThrow(
      /scope_ref_type/,
    );
  });

  it('requires an operating_context scope_ref from the enum vocabulary', async () => {
    await expect(engage('operating_context', 'made_up', null, 'read_only')).rejects.toThrow(
      /scope_ref_type/,
    );
  });

  it('requires a tenant on a legal_entity switch', async () => {
    await expect(engage('legal_entity', LEGAL_ENTITY_B, null, 'read_only')).rejects.toThrow(
      /tenant_shape/,
    );
  });

  it('forbids a tenant on an operating_context switch, which is cross-tenant', async () => {
    await expect(
      engage('operating_context', 'facility_operator', TENANT_A, 'read_only'),
    ).rejects.toThrow(/tenant_shape/);
  });

  it('still forbids a subject on a system switch', async () => {
    await expect(engage('system', 'something', null, 'read_only')).rejects.toThrow(
      /scope_ref_shape/,
    );
  });

  it('still requires a tenant on every tenant-narrower Phase 0 scope', async () => {
    await expect(engage('agent', 'dispatch-agent', null, 'read_only')).rejects.toThrow(
      /tenant_shape/,
    );
  });
});

describe('human-only authority over engagement and release', () => {
  it('refuses an agent as the engaging authority', async () => {
    await expect(
      admin.query(
        `INSERT INTO kill_switches
           (scope, scope_ref, tenant_id, mode, reason, engaged_by_type, engaged_by, created_by)
         VALUES ('legal_entity', $1, $2, 'suspended', 'self-engaged', 'agent', 'dispatch-agent',
                 'dispatch-agent')`,
        [randomUUID(), TENANT_A],
      ),
    ).rejects.toThrow(/engaged_by_type_check/);
  });

  it('refuses an agent as the releasing authority', async () => {
    // Phase 0 constrained engagement only. An agent that cannot engage a switch but can release one
    // has defeated the control, so released_by_type is symmetric with engaged_by_type.
    await expect(
      admin.query(
        `UPDATE kill_switches
            SET released_at = now(), released_by = 'dispatch-agent', released_by_type = 'agent'
          WHERE scope = 'legal_entity' AND scope_ref = $1 AND released_at IS NULL`,
        [LEGAL_ENTITY_A],
      ),
    ).rejects.toThrow(/released_by_type_shape/);
  });

  it('requires all three release columns together', async () => {
    await expect(
      admin.query(
        `UPDATE kill_switches SET released_at = now()
          WHERE scope = 'legal_entity' AND scope_ref = $1 AND released_at IS NULL`,
        [LEGAL_ENTITY_A],
      ),
    ).rejects.toThrow(/release_consistency/);
  });

  it('accepts a human release', async () => {
    const r = await admin.query(
      `UPDATE kill_switches
          SET released_at = now(), released_by = 'test:operator', released_by_type = 'human'
        WHERE scope = 'legal_entity' AND scope_ref = $1 AND released_at IS NULL`,
      [LEGAL_ENTITY_A],
    );
    expect(r.rowCount).toBe(1);
    expect(await resolve({ tenantId: TENANT_A, legalEntityId: LEGAL_ENTITY_A })).toBe(
      'approval_only',
    );
  });

  it('records a release rather than deleting the row', async () => {
    await expect(admin.query('DELETE FROM kill_switches')).rejects.toThrow(/append-only/i);
    const history = await admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM kill_switches WHERE released_at IS NOT NULL`,
    );
    expect(Number(history.rows[0]!.count)).toBeGreaterThan(0);
  });
});

/**
 * The OQ-19 compatibility regression, and the one that most needs to exist: capture resolution for
 * a matrix of Phase 0 records with the two migrations reverted, re-apply them, and assert the
 * answers are identical.
 */
describe('Phase 0 records resolve identically across the migration', () => {
  const compat = new TestDatabase('freightos_test_kill_switch_compat');
  let client: Client;

  const MATRIX: [string, Parameters<typeof resolve>[0]][] = [
    ['tenant only', { tenantId: TENANT_A }],
    ['other tenant', { tenantId: TENANT_B }],
    ['legal plane', { tenantId: TENANT_A, legalPlane: 'software_only:shipper_owned' }],
    ['workflow', { tenantId: TENANT_A, workflowId: 'wf-1' }],
    ['agent', { tenantId: TENANT_A, agentId: 'dispatch-agent' }],
    ['tool', { tenantId: TENANT_A, toolId: 'tool-1' }],
    ['integration', { tenantId: TENANT_A, integrationId: 'integration-1' }],
    ['nothing named', {}],
  ];

  async function resolveOn(
    c: Client,
    params: Parameters<typeof resolve>[0],
    withNewScopes: boolean,
  ): Promise<string> {
    const sql = withNewScopes
      ? `SELECT app.resolve_kill_switch_mode($1, $2, $3, $4, $5, $6, NULL, NULL) AS mode`
      : `SELECT app.resolve_kill_switch_mode($1, $2, $3, $4, $5, $6) AS mode`;
    const r = await c.query<{ mode: string }>(sql, [
      params.tenantId ?? null,
      params.legalPlane ?? null,
      params.workflowId ?? null,
      params.agentId ?? null,
      params.toolId ?? null,
      params.integrationId ?? null,
    ]);
    return r.rows[0]!.mode;
  }

  const before: Record<string, string> = {};

  beforeAll(async () => {
    await compat.reset();
    await compat.seedTenants();
    client = compat.connectAs('postgres');
    await client.connect();

    const migrations = loadMigrations(MIGRATIONS_DIR);
    // Back to 0013 — the last migration before the OQ-19 pair. The identity tables stay in place.
    await migrateDown(client, migrations, 13);

    // Phase 0 records, in the Phase 0 shape: no released_by_type column exists yet.
    // scope_ref is text and tenant_id is uuid, so the same tenant is bound to two parameters —
    // one parameter cannot be deduced as both.
    await client.query(
      `INSERT INTO kill_switches
         (scope, scope_ref, tenant_id, mode, reason, engaged_by_type, engaged_by, created_by)
       VALUES
         ('tenant', $1, $2, 'approval_only', 'phase 0', 'human', 'op', 'op'),
         ('legal_plane', 'software_only:shipper_owned', NULL, 'communications_disabled',
          'phase 0', 'human', 'op', 'op'),
         ('workflow', 'wf-1', $2, 'autonomous_disabled', 'phase 0', 'human', 'op', 'op'),
         ('agent', 'dispatch-agent', $2, 'read_only', 'phase 0', 'human', 'op', 'op'),
         ('tool', 'tool-1', $2, 'financial_disabled', 'phase 0', 'human', 'op', 'op'),
         ('integration', 'integration-1', $3, 'enabled', 'phase 0', 'human', 'op', 'op')`,
      [TENANT_A, TENANT_A, TENANT_B],
    );

    for (const [label, params] of MATRIX) {
      before[label] = await resolveOn(client, params, false);
    }

    await migrateUp(client, migrations);
  }, 60_000);

  afterAll(async () => {
    await client?.end();
  });

  it('captured a non-trivial set of pre-migration answers', () => {
    expect(Object.keys(before)).toHaveLength(MATRIX.length);
    expect(new Set(Object.values(before)).size).toBeGreaterThan(1);
  });

  it('resolves every Phase 0 request to the identical mode after the migration', async () => {
    for (const [label, params] of MATRIX) {
      expect(await resolveOn(client, params, true), label).toBe(before[label]);
    }
  });

  it('resolves identically through the unchanged Phase 0 call shape', async () => {
    for (const [label, params] of MATRIX) {
      const r = await client.query<{ mode: string }>(
        `SELECT app.resolve_kill_switch_mode($1, $2, $3, $4, $5, $6) AS mode`,
        [
          params.tenantId ?? null,
          params.legalPlane ?? null,
          params.workflowId ?? null,
          params.agentId ?? null,
          params.toolId ?? null,
          params.integrationId ?? null,
        ],
      );
      expect(r.rows[0]!.mode, label).toBe(before[label]);
    }
  });

  it('mutated no pre-existing row except to backfill released_by_type on released ones', async () => {
    const rows = await client.query<{
      scope: string;
      mode: string;
      released_by_type: string | null;
      created_by: string;
    }>(
      `SELECT scope::text, mode::text, released_by_type, created_by FROM kill_switches
        WHERE created_by = 'op' ORDER BY scope::text`,
    );
    expect(rows.rows).toHaveLength(6);
    for (const row of rows.rows) {
      // Nothing was released, so nothing was backfilled.
      expect(row.released_by_type, row.scope).toBeNull();
    }
    expect(rows.rows.map((r) => r.mode).sort()).toEqual(
      [
        'approval_only',
        'autonomous_disabled',
        'communications_disabled',
        'enabled',
        'financial_disabled',
        'read_only',
      ].sort(),
    );
  });

  it('keeps every Phase 0 scope value present in the enum', async () => {
    const r = await client.query<{ label: string }>(
      `SELECT unnest(enum_range(NULL::app.kill_switch_scope))::text AS label`,
    );
    const labels = r.rows.map((x) => x.label);
    for (const phase0 of [
      'system',
      'legal_plane',
      'tenant',
      'workflow',
      'agent',
      'tool',
      'integration',
    ]) {
      expect(labels, phase0).toContain(phase0);
    }
    expect(labels).toContain('legal_entity');
    expect(labels).toContain('operating_context');
    expect(labels).toHaveLength(9);
  });

  it('reverts and re-applies the OQ-19 pair cleanly', async () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);

    // Nothing in this database uses a new scope value other than the 0016 seed, and 0016's down
    // removes exactly that row — so the enum rebuild in 0014's down has nothing blocking it.
    const reverted = await migrateDown(client, migrations, 13);
    expect(reverted.reverted).toEqual([16, 15, 14]);

    const scopes = await client.query<{ label: string }>(
      `SELECT unnest(enum_range(NULL::app.kill_switch_scope))::text AS label`,
    );
    expect(scopes.rows).toHaveLength(7);
    expect(scopes.rows.map((x) => x.label)).not.toContain('legal_entity');

    for (const [label, params] of MATRIX) {
      expect(await resolveOn(client, params, false), label).toBe(before[label]);
    }

    const reapplied = await migrateUp(client, migrations);
    expect(reapplied.applied).toEqual([14, 15, 16]);

    for (const [label, params] of MATRIX) {
      expect(await resolveOn(client, params, true), label).toBe(before[label]);
    }
  });

  it('refuses the revert while a row still uses a new scope', async () => {
    const migrations = loadMigrations(MIGRATIONS_DIR);
    await client.query(
      `INSERT INTO kill_switches
         (scope, scope_ref, tenant_id, mode, reason, engaged_by_type, engaged_by, created_by)
       VALUES ('legal_entity', $1, $2, 'read_only', 'blocks revert', 'human', 'op', 'op')`,
      [LEGAL_ENTITY_A, TENANT_A],
    );

    await expect(migrateDown(client, migrations, 13)).rejects.toThrow(
      /still use the legal_entity or operating_context scope/,
    );

    // The refusal is the documented behaviour, not a bug: a kill switch is incident evidence, and
    // silently remapping it to a surviving scope would falsify the record of what was halted. The
    // runner unwinds in order and stops at the first failure, so 0016 and 0015 are off and 0014 —
    // the enum values themselves — is still applied. The blocking row is untouched.
    const applied = await client.query<{ version: number }>(
      `SELECT version FROM schema_migrations WHERE version >= 14 ORDER BY version`,
    );
    expect(applied.rows.map((r) => r.version)).toEqual([14]);

    const values = await client.query<{ label: string }>(
      `SELECT unnest(enum_range(NULL::app.kill_switch_scope))::text AS label`,
    );
    expect(values.rows.map((x) => x.label)).toContain('legal_entity');

    const blocking = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM kill_switches WHERE scope::text = 'legal_entity'`,
    );
    expect(Number(blocking.rows[0]!.count)).toBe(1);

    // Recovery is to re-apply once the blocking rows are dealt with, which is what the runbook
    // records. Re-applying here also leaves the database in the state the file started in.
    const recovered = await migrateUp(client, migrations);
    expect(recovered.applied).toEqual([15, 16]);
  });
});

/**
 * F-12 — a legal_entity kill switch must name a legal entity of its own tenant.
 *
 * `kill_switches_scope_ref_type` checks that scope_ref parses as a uuid and stops there, so any
 * uuid was accepted, another tenant's included. A tenant could record a halt naming an entity it
 * does not own, permanently: kill_switches is append-only and Art. II.1 makes it incident evidence.
 *
 * The resolver had the matching half of the same gap. Its legal_entity branch matched on scope_ref
 * alone, which made the row's own tenant_id decorative — a switch recorded under one tenant would
 * halt an identically-numbered entity resolved under another. Row-level security hid that from an
 * application session, which is a reason it was never seen rather than a reason it was safe: the
 * control plane sees every row, and resolution is exactly what the control plane does.
 */
describe('a legal-entity kill switch is bound to its own tenant — F-12', () => {
  let realEntityA: string;
  let realEntityB: string;

  beforeAll(async () => {
    // Real legal entities, because the whole point is what the trigger reads about them. Written
    // as a superuser: this file has no organization hierarchy, and building one to seed two rows
    // would be a fixture larger than the thing it supports.
    const make = async (tenantId: string) => {
      const rootId = randomUUID();
      await admin.query(
        `INSERT INTO organization_nodes
           (id, tenant_id, organization_node_id, parent_id, node_type, name, created_by)
         VALUES ($1, $2, $1, NULL, 'enterprise', 'F-12 root', 'test')`,
        [rootId, tenantId],
      );
      // A legal entity attaches to a legal_entity node, never to the enterprise root.
      const nodeId = randomUUID();
      await admin.query(
        `INSERT INTO organization_nodes
           (id, tenant_id, organization_node_id, parent_id, node_type, name, created_by)
         VALUES ($1, $2, $1, $3, 'legal_entity', 'F-12', 'test')`,
        [nodeId, tenantId, rootId],
      );
      const entityId = randomUUID();
      await admin.query(
        `INSERT INTO legal_entities
           (id, tenant_id, organization_node_id, legal_entity_id, legal_name, jurisdiction,
            created_by)
         VALUES ($1, $2, $3, $1, 'F-12 Co', 'US-TX', 'test')`,
        [entityId, tenantId, nodeId],
      );
      return entityId;
    };
    realEntityA = await make(TENANT_A);
    realEntityB = await make(TENANT_B);
  }, 30_000);

  it('refuses a switch naming another tenant legal entity', async () => {
    // The reproduction. Before the fix this row was accepted and stood as evidence of a halt one
    // tenant recorded against another's entity.
    await expect(engage('legal_entity', realEntityB, TENANT_A, 'read_only')).rejects.toThrow(
      /belongs to tenant .* and not to/i,
    );
  });

  it('accepts a switch naming its own tenant legal entity', async () => {
    await expect(engage('legal_entity', realEntityA, TENANT_A, 'read_only')).resolves.toBeTruthy();
  });

  it('resolves a legal-entity switch only for the tenant that recorded it', async () => {
    // The resolver half. This runs as a superuser, so row-level security is out of the picture and
    // the tenant predicate in the query is what has to hold — the same position the control plane
    // is in.
    expect(await resolve({ tenantId: TENANT_A, legalEntityId: realEntityA })).toBe('read_only');
    expect(await resolve({ tenantId: TENANT_B, legalEntityId: realEntityA })).toBe('enabled');
  });

  it('leaves the constraint to report a malformed scope reference', async () => {
    // The trigger runs ahead of the CHECK constraints, so casting a bad scope_ref there would
    // replace a specific complaint with "invalid input syntax for type uuid". It steps aside.
    await expect(engage('legal_entity', 'not-a-uuid', TENANT_A, 'read_only')).rejects.toThrow(
      /scope_ref_type/,
    );
  });

  it('leaves an unknown legal entity alone', async () => {
    // kill_switches carries no foreign key to legal_entities — the table predates them and is
    // deliberately cross-tenant — and a switch naming an entity that does not exist halts nothing
    // and harms only the tenant that recorded it. The cross-tenant case is the defect; this is not.
    await expect(engage('legal_entity', randomUUID(), TENANT_A, 'suspended')).resolves.toBeTruthy();
  });
});
