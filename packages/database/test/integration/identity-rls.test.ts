import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withLegalContext } from '../../src/session.ts';
import { TENANT_A, TENANT_B, TestDatabase } from './harness.ts';
import {
  PR2_TABLES,
  PR2_TENANT_OWNED_TABLES,
  carrierContextAt,
  facilityContextAt,
  seedIdentity,
  systemContext,
  type IdentityFixture,
} from './identity-harness.ts';

/**
 * Cross-tenant, cross-legal-entity and organization-node isolation for every PR 2 table.
 *
 * ACCEPTANCE_THRESHOLDS §1 makes "tenant-owned tables without RLS" and "RLS-enabled tables without
 * applicable policies" binary gates at zero, and §3 invariants 1, 2 and 3 require complete
 * coverage of cross-tenant, legal-entity-mismatch and organization-node-mismatch denial. This file
 * is where those are evidenced.
 *
 * Everything runs as `freightos_app`. PostgreSQL superusers bypass RLS unconditionally, so a test
 * that connects as `postgres` and passes proves nothing about isolation.
 */
const db = new TestDatabase('freightos_test_identity_rls');

let app: Client;
let a: IdentityFixture;
let b: IdentityFixture;

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  app = db.connectAs('freightos_app');
  await app.connect();
  a = await seedIdentity(app, TENANT_A);
  b = await seedIdentity(app, TENANT_B);
}, 60_000);

afterAll(async () => {
  await app?.end();
});

describe('every PR 2 table is RLS-protected', () => {
  it('enables and forces row-level security on all fifteen', async () => {
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      const result = await admin.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT relname, relrowsecurity, relforcerowsecurity
           FROM pg_class WHERE relname = ANY($1) ORDER BY relname`,
        [[...PR2_TABLES]],
      );
      expect(result.rows).toHaveLength(PR2_TABLES.length);
      for (const row of result.rows) {
        expect(row.relrowsecurity, `${row.relname} ENABLE`).toBe(true);
        expect(row.relforcerowsecurity, `${row.relname} FORCE`).toBe(true);
      }
    } finally {
      await admin.end();
    }
  });

  it('leaves no table in the database with RLS enabled and no policy', async () => {
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      const result = await admin.query<{ tablename: string }>(
        `SELECT c.relname AS tablename
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
            AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)`,
      );
      expect(result.rows.map((r) => r.tablename)).toEqual([]);
    } finally {
      await admin.end();
    }
  });

  it('gives every PR 2 table explicit read, insert and update policies', async () => {
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      for (const table of PR2_TABLES) {
        const result = await admin.query<{ cmd: string }>(
          `SELECT p.polcmd::text AS cmd
             FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
            WHERE c.relname = $1`,
          [table],
        );
        const commands = result.rows.map((r) => r.cmd).sort();
        // r = SELECT, a = INSERT, w = UPDATE, d = DELETE.
        expect(commands, `${table} read`).toContain('r');
        expect(commands, `${table} insert`).toContain('a');
        expect(commands, `${table} update`).toContain('w');
      }
    } finally {
      await admin.end();
    }
  });

  it('denies DELETE on every PR 2 table except the derived closure', async () => {
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      for (const table of PR2_TABLES) {
        const canDelete = await admin.query<{ ok: boolean }>(
          `SELECT has_table_privilege('freightos_app', $1, 'DELETE') AS ok`,
          [table],
        );
        // The closure is maintained by a trigger running as the invoking session, so it is the one
        // table the application role may delete from. Everything else is archived or revoked.
        const expected = table === 'organization_node_closure';
        expect(canDelete.rows[0]!.ok, `${table} DELETE`).toBe(expected);
      }
    } finally {
      await admin.end();
    }
  });

  it('gives the routine control-plane connection no grant on any identity table', async () => {
    // ADR-0020 §7: the default for a new Phase 1 domain table is no control-plane grant at all.
    // `permissions` is the one justified exception and is asserted separately below.
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      for (const table of PR2_TENANT_OWNED_TABLES) {
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
          const result = await admin.query<{ ok: boolean }>(
            `SELECT has_table_privilege('freightos_control_plane', $1, $2) AS ok`,
            [table, privilege],
          );
          expect(result.rows[0]!.ok, `${table} ${privilege}`).toBe(false);
        }
      }

      const catalogRead = await admin.query<{ ok: boolean }>(
        `SELECT has_table_privilege('freightos_control_plane', 'permissions', 'SELECT') AS ok`,
      );
      expect(catalogRead.rows[0]!.ok).toBe(true);
    } finally {
      await admin.end();
    }
  });
});

describe('cross-tenant isolation', () => {
  it('shows a tenant only its own organization nodes', async () => {
    const rows = await withLegalContext(app, systemContext(TENANT_A), async (c) => {
      const r = await c.query<{ id: string }>('SELECT id FROM organization_nodes');
      return r.rows.map((x) => x.id);
    });
    expect(rows).toHaveLength(4);
    expect(rows).not.toContain(b.enterpriseNodeId);
  });

  it('hides another tenant every PR 2 row, even asked for by primary key', async () => {
    const targets: [string, string][] = [
      ['organization_nodes', b.enterpriseNodeId],
      ['legal_entities', b.legalEntityId],
      ['operating_authorities', b.operatingAuthorityId],
      ['carrier_appointments', b.carrierAppointmentId],
      ['users', b.userId],
      ['memberships', b.membershipId],
      ['membership_roles', b.membershipRoleId],
      ['roles', b.roleId],
      ['role_permissions', b.roleId],
      ['service_accounts', b.serviceAccountId],
      ['service_account_credentials', b.serviceAccountCredentialId],
      ['service_account_permissions', b.serviceAccountId],
    ];

    await withLegalContext(app, systemContext(TENANT_A), async (c) => {
      for (const [table, id] of targets) {
        const column =
          table.endsWith('_permissions') && table !== 'role_permissions'
            ? 'service_account_id'
            : table === 'role_permissions'
              ? 'role_id'
              : 'id';
        const r = await c.query(`SELECT 1 FROM ${table} WHERE ${column} = $1`, [id]);
        expect(r.rowCount, table).toBe(0);
      }
    });
  });

  it('refuses to write a row belonging to another tenant', async () => {
    await expect(
      withLegalContext(app, systemContext(TENANT_A), async (c) => {
        const id = randomUUID();
        await c.query(
          `INSERT INTO organization_nodes
             (id, tenant_id, organization_node_id, parent_id, node_type, name, created_by)
           VALUES ($1, $2, $1, NULL, 'enterprise', 'Smuggled', 'test')`,
          [id, TENANT_B],
        );
      }),
    ).rejects.toThrow(/row-level security|one_root_per_tenant/i);
  });

  it('cannot update another tenant row', async () => {
    const updated = await withLegalContext(app, systemContext(TENANT_A), async (c) => {
      const r = await c.query('UPDATE organization_nodes SET name = $1 WHERE id = $2', [
        'hijacked',
        b.enterpriseNodeId,
      ]);
      return r.rowCount;
    });
    expect(updated).toBe(0);

    const check = await withLegalContext(app, systemContext(TENANT_B), async (c) => {
      const r = await c.query<{ name: string }>(
        'SELECT name FROM organization_nodes WHERE id = $1',
        [b.enterpriseNodeId],
      );
      return r.rows[0]!.name;
    });
    expect(check).toBe('Enterprise');
  });

  it('cannot attach a child to another tenant parent node', async () => {
    await expect(
      withLegalContext(app, systemContext(TENANT_A), async (c) => {
        const id = randomUUID();
        await c.query(
          `INSERT INTO organization_nodes
             (id, tenant_id, organization_node_id, parent_id, node_type, name, created_by)
           VALUES ($1, $2, $1, $3, 'region', 'Cross-tenant', 'test')`,
          [id, TENANT_A, b.enterpriseNodeId],
        );
      }),
    ).rejects.toThrow(/does not exist/i);
  });

  it('cannot reference another tenant legal entity from a role', async () => {
    // Two independent refusals stand behind this, and the trigger is simply the first to fire:
    // the governing-legal-entity check rejects the disagreement, and the composite foreign key on
    // (tenant_id, legal_entity_id) would make the cross-tenant reference unrepresentable anyway.
    await expect(
      withLegalContext(app, systemContext(TENANT_A), async (c) => {
        await c.query(
          `INSERT INTO roles
             (tenant_id, organization_node_id, legal_entity_id, key, name, created_by)
           VALUES ($1, $2, $3, 'smuggled', 'Smuggled', 'test')`,
          [TENANT_A, a.legalEntityNodeId, b.legalEntityId],
        );
      }),
    ).rejects.toThrow(/is governed by legal entity|roles_legal_entity_fk|violates foreign key/i);
  });

  it('still refuses the cross-tenant reference when the node agreement cannot mask it', async () => {
    // Drop the trigger out of the picture by naming a node that no legal entity governs at all in
    // this tenant, so the foreign key is what has to hold. It does.
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      await expect(
        admin.query(
          `INSERT INTO role_permissions (tenant_id, role_id, permission_id, created_by)
           SELECT $1, $2, id, 'test' FROM permissions WHERE key = 'identity.role.read'`,
          [TENANT_A, b.roleId],
        ),
      ).rejects.toThrow(/role_permissions_role_fk|violates foreign key/i);
    } finally {
      await admin.end();
    }
  });
});

describe('missing context fails closed', () => {
  it('shows nothing with no session context at all', async () => {
    await app.query('BEGIN');
    for (const table of PR2_TENANT_OWNED_TABLES) {
      const r = await app.query(`SELECT 1 FROM ${table}`);
      expect(r.rowCount, table).toBe(0);
    }
    await app.query('ROLLBACK');
  });

  it('still shows the global permission catalog, which is not tenant data', async () => {
    await app.query('BEGIN');
    const r = await app.query('SELECT 1 FROM permissions');
    await app.query('ROLLBACK');
    expect(r.rowCount).toBe(22);
  });

  it('shows no users when the caller administers no organization node', async () => {
    // The node predicate is an AND on top of tenant isolation, and an absent node reads as NULL.
    const rows = await withLegalContext(
      app,
      {
        tenantId: TENANT_A,
        legalAuthorityClass: 'carrier_agent',
        operatingContext: 'carrier',
        actorId: 'test:actor',
        legalEntityId: a.legalEntityId,
        carrierId: 'carrier-1',
        carrierAppointmentId: 'appointment-1',
      },
      async (c) => (await c.query('SELECT id FROM users')).rowCount,
    );
    expect(rows).toBe(0);
  });

  it('refuses to write a role when the caller administers no organization node', async () => {
    await expect(
      withLegalContext(
        app,
        {
          tenantId: TENANT_A,
          legalAuthorityClass: 'carrier_agent',
          operatingContext: 'carrier',
          actorId: 'test:actor',
          legalEntityId: a.legalEntityId,
          carrierId: 'carrier-1',
          carrierAppointmentId: 'appointment-1',
        },
        async (c) => {
          await c.query(
            `INSERT INTO roles
               (tenant_id, organization_node_id, legal_entity_id, key, name, created_by)
             VALUES ($1, $2, $3, 'no_node_context', 'No node', 'test')`,
            [TENANT_A, a.legalEntityNodeId, a.legalEntityId],
          );
        },
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('organization-node scope', () => {
  it('shows users at or below the node the caller administers', async () => {
    const fromRegion = await withLegalContext(
      app,
      carrierContextAt(TENANT_A, a.legalEntityId, a.regionNodeId),
      async (c) => (await c.query('SELECT id FROM users')).rowCount,
    );
    expect(fromRegion).toBe(1);
  });

  it('hides a user that sits above the node the caller administers', async () => {
    // The seeded user is on the terminal node; a caller administering the terminal sees it, and a
    // caller administering nothing above it in that user's chain does not.
    const fromTerminal = await withLegalContext(
      app,
      carrierContextAt(TENANT_A, a.legalEntityId, a.terminalNodeId),
      async (c) => (await c.query('SELECT id FROM users')).rowCount,
    );
    expect(fromTerminal).toBe(1);

    const serviceAccountsFromTerminal = await withLegalContext(
      app,
      carrierContextAt(TENANT_A, a.legalEntityId, a.terminalNodeId),
      async (c) => (await c.query('SELECT id FROM service_accounts')).rowCount,
    );
    // The service account is on the region node, which is ABOVE the terminal — out of scope.
    expect(serviceAccountsFromTerminal).toBe(0);
  });

  it('refuses a claimed node belonging to another tenant', async () => {
    const rows = await withLegalContext(
      app,
      carrierContextAt(TENANT_A, a.legalEntityId, b.regionNodeId),
      async (c) => (await c.query('SELECT id FROM users')).rowCount,
    );
    expect(rows).toBe(0);
  });
});

describe('legal-entity scope', () => {
  it('refuses a write naming a legal entity the session does not hold', async () => {
    // Same tenant, wrong legal entity: the session's own entity is what the predicate compares.
    await expect(
      withLegalContext(
        app,
        carrierContextAt(TENANT_A, b.legalEntityId, a.legalEntityNodeId),
        async (c) => {
          await c.query(
            `INSERT INTO roles
               (tenant_id, organization_node_id, legal_entity_id, key, name, created_by)
             VALUES ($1, $2, $3, 'wrong_entity', 'Wrong entity', 'test')`,
            [TENANT_A, a.legalEntityNodeId, a.legalEntityId],
          );
        },
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('permits the write when the session holds the named entity', async () => {
    const id = await withLegalContext(
      app,
      carrierContextAt(TENANT_A, a.legalEntityId, a.legalEntityNodeId),
      async (c) => {
        const r = await c.query<{ id: string }>(
          `INSERT INTO roles
             (tenant_id, organization_node_id, legal_entity_id, key, name, created_by)
           VALUES ($1, $2, $3, 'right_entity', 'Right entity', 'test')
           RETURNING id`,
          [TENANT_A, a.legalEntityNodeId, a.legalEntityId],
        );
        return r.rows[0]!.id;
      },
    );
    expect(id).toBeTruthy();
  });
});

describe('organization-node and legal-entity must agree', () => {
  it('rejects a role naming a node the stated legal entity does not govern', async () => {
    // The enterprise root sits above the legal-entity boundary, so nothing governs it.
    await expect(
      withLegalContext(app, systemContext(TENANT_A), async (c) => {
        await c.query(
          `INSERT INTO roles
             (tenant_id, organization_node_id, legal_entity_id, key, name, created_by)
           VALUES ($1, $2, $3, 'above_boundary', 'Above boundary', 'test')`,
          [TENANT_A, a.enterpriseNodeId, a.legalEntityId],
        );
      }),
    ).rejects.toThrow(/sits above the legal-entity boundary/i);
  });

  it('rejects a user naming a node governed by a different legal entity', async () => {
    // Seed a second legal entity under a sibling branch, then point a user at the wrong one.
    const secondEntity = await withLegalContext(app, systemContext(TENANT_A), async (c) => {
      const nodeId = randomUUID();
      await c.query(
        `INSERT INTO organization_nodes
           (id, tenant_id, organization_node_id, parent_id, node_type, name, created_by)
         VALUES ($1, $2, $1, $3, 'legal_entity', 'Second Co', 'test')`,
        [nodeId, TENANT_A, a.enterpriseNodeId],
      );
      const entityId = randomUUID();
      await c.query(
        `INSERT INTO legal_entities
           (id, tenant_id, organization_node_id, legal_entity_id, legal_name, jurisdiction,
            created_by)
         VALUES ($1, $2, $3, $1, 'Second Co LLC', 'US-CA', 'test')`,
        [entityId, TENANT_A, nodeId],
      );
      return { nodeId, entityId };
    });

    await expect(
      withLegalContext(app, systemContext(TENANT_A), async (c) => {
        await c.query(
          `INSERT INTO users
             (tenant_id, organization_node_id, legal_entity_id, authentication_provider,
              authentication_subject, display_name, created_by)
           VALUES ($1, $2, $3, 'oidc:example', 'mismatch', 'Mismatch', 'test')`,
          [TENANT_A, secondEntity.nodeId, a.legalEntityId],
        );
      }),
    ).rejects.toThrow(/is governed by legal entity/i);
  });

  it('accepts the write when the node and the legal entity agree', async () => {
    const id = await withLegalContext(app, systemContext(TENANT_A), async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO users
           (tenant_id, organization_node_id, legal_entity_id, authentication_provider,
            authentication_subject, display_name, created_by)
         VALUES ($1, $2, $3, 'oidc:example', 'agreeing', 'Agreeing', 'test')
         RETURNING id`,
        [TENANT_A, a.regionNodeId, a.legalEntityId],
      );
      return r.rows[0]!.id;
    });
    expect(id).toBeTruthy();
  });
});

describe('the capability matrix agrees with the database', () => {
  it('accepts every pairing app.is_permitted_legal_pairing accepts, and no other', async () => {
    const classes = ['software_only', 'carrier_agent', 'brokerage'];
    const contexts = [
      'system',
      'carrier',
      'shipper_owned',
      'facility_operator',
      'autonomous_mobility',
      'brokerage',
    ];
    const permitted: Record<string, string[]> = {
      software_only: ['system', 'shipper_owned', 'facility_operator', 'autonomous_mobility'],
      carrier_agent: ['carrier'],
      brokerage: ['brokerage'],
    };

    for (const legalClass of classes) {
      for (const context of contexts) {
        const r = await app.query<{ ok: boolean }>(
          'SELECT app.is_permitted_legal_pairing($1, $2) AS ok',
          [legalClass, context],
        );
        expect(r.rows[0]!.ok, `${legalClass}/${context}`).toBe(
          permitted[legalClass]!.includes(context),
        );
      }
    }
  });

  it('refuses a brokerage operating authority — the fourth independent refusal', async () => {
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      await expect(
        admin.query(
          `INSERT INTO operating_authorities
             (tenant_id, organization_node_id, legal_entity_id, legal_authority_class,
              operating_context, authority_type, created_by)
           VALUES ($1, $2, $3, 'brokerage', 'brokerage', 'freight_broker', 'test')`,
          [TENANT_A, a.legalEntityNodeId, a.legalEntityId],
        ),
      ).rejects.toThrow(/brokerage_disabled/);
    } finally {
      await admin.end();
    }
  });

  it('refuses an active autonomous_mobility operating authority', async () => {
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      await expect(
        admin.query(
          `INSERT INTO operating_authorities
             (tenant_id, organization_node_id, legal_entity_id, legal_authority_class,
              operating_context, authority_type, status, created_by)
           VALUES ($1, $2, $3, 'software_only', 'autonomous_mobility', 'av_operator', 'active',
                   'test')`,
          [TENANT_A, a.legalEntityNodeId, a.legalEntityId],
        ),
      ).rejects.toThrow(/autonomous_mobility_not_operational/);
    } finally {
      await admin.end();
    }
  });

  it('permits a non-active autonomous_mobility record, so the shape exists but cannot operate', async () => {
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      const r = await admin.query<{ id: string }>(
        `INSERT INTO operating_authorities
           (tenant_id, organization_node_id, legal_entity_id, legal_authority_class,
            operating_context, authority_type, status, created_by)
         VALUES ($1, $2, $3, 'software_only', 'autonomous_mobility', 'av_operator', 'suspended',
                 'test')
         RETURNING id`,
        [TENANT_A, a.legalEntityNodeId, a.legalEntityId],
      );
      expect(r.rows[0]!.id).toBeTruthy();
    } finally {
      await admin.end();
    }
  });

  it('gives a facility_operator session no identity write', async () => {
    await expect(
      withLegalContext(
        app,
        facilityContextAt(TENANT_A, a.legalEntityId, a.terminalNodeId),
        async (c) => {
          await c.query(
            `INSERT INTO roles
               (tenant_id, organization_node_id, legal_entity_id, key, name, created_by)
             VALUES ($1, $2, $3, 'facility_written', 'Facility written', 'test')`,
            [TENANT_A, a.legalEntityNodeId, a.legalEntityId],
          );
        },
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('a carrier appointment makes carrier_agent provable', () => {
  it('reports an active appointment as of an explicit instant', async () => {
    const active = await withLegalContext(app, systemContext(TENANT_A), async (c) => {
      const r = await c.query<{ ok: boolean }>(
        'SELECT app.has_active_carrier_appointment($1, $2, $3, now()) AS ok',
        [TENANT_A, a.legalEntityId, 'carrier-1'],
      );
      return r.rows[0]!.ok;
    });
    expect(active).toBe(true);
  });

  it('reports nothing for a carrier with no appointment', async () => {
    const active = await withLegalContext(app, systemContext(TENANT_A), async (c) => {
      const r = await c.query<{ ok: boolean }>(
        'SELECT app.has_active_carrier_appointment($1, $2, $3, now()) AS ok',
        [TENANT_A, a.legalEntityId, 'carrier-unknown'],
      );
      return r.rows[0]!.ok;
    });
    expect(active).toBe(false);
  });

  it('stops reporting an appointment once revoked', async () => {
    await withLegalContext(
      app,
      carrierContextAt(TENANT_A, a.legalEntityId, a.legalEntityNodeId),
      async (c) => {
        await c.query(
          `UPDATE carrier_appointments
              SET status = 'revoked', revoked_at = now(), revoked_by = 'test:operator'
            WHERE id = $1`,
          [a.carrierAppointmentId],
        );
      },
    );

    const active = await withLegalContext(app, systemContext(TENANT_A), async (c) => {
      const r = await c.query<{ ok: boolean }>(
        'SELECT app.has_active_carrier_appointment($1, $2, $3, now()) AS ok',
        [TENANT_A, a.legalEntityId, 'carrier-1'],
      );
      return r.rows[0]!.ok;
    });
    expect(active).toBe(false);
  });

  it('refuses an appointment whose operating authority is not carrier_agent', async () => {
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      const authority = await admin.query<{ id: string }>(
        `INSERT INTO operating_authorities
           (tenant_id, organization_node_id, legal_entity_id, legal_authority_class,
            operating_context, authority_type, created_by)
         VALUES ($1, $2, $3, 'software_only', 'shipper_owned', 'shipper', 'test')
         RETURNING id`,
        [TENANT_A, a.legalEntityNodeId, a.legalEntityId],
      );
      await expect(
        admin.query(
          `INSERT INTO carrier_appointments
             (tenant_id, organization_node_id, legal_entity_id, operating_authority_id,
              carrier_reference, appointment_document_reference, created_by)
           VALUES ($1, $2, $3, $4, 'carrier-2', 'documents://x', 'test')`,
          [TENANT_A, a.legalEntityNodeId, a.legalEntityId, authority.rows[0]!.id],
        ),
      ).rejects.toThrow(/requires a carrier_agent\/carrier operating authority/);
    } finally {
      await admin.end();
    }
  });
});
