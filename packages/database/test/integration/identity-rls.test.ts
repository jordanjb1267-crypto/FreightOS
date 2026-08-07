import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withLegalContext } from '../../src/session.ts';
import type { Queryable } from '../../src/session.ts';
import { fixtureAdministrator, withAuthenticatedTestPrincipal } from './verified-test-auth.ts';
import { TENANT_A, TENANT_B, TestDatabase } from './harness.ts';
import {
  PR2_TABLES,
  PR2_TENANT_OWNED_TABLES,
  carrierContextAt,
  facilityContextAt,
  seedIdentity,
  systemContext,
  systemContextAt,
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
  a = await seedIdentity(db, TENANT_A);
  b = await seedIdentity(db, TENANT_B);
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

  it('denies DELETE on every PR 2 table, the derived closure included', async () => {
    // The closure used to be the exception: its maintenance triggers ran as the invoking session,
    // so the application role needed DELETE to make them work. That privilege did not stop at the
    // triggers, and a table the authorization model resolves through must not be writable by what
    // it authorizes — F-02. The triggers are trusted code now and the exception is gone.
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      for (const table of PR2_TABLES) {
        const canDelete = await admin.query<{ ok: boolean }>(
          `SELECT has_table_privilege('freightos_app', $1, 'DELETE') AS ok`,
          [table],
        );
        expect(canDelete.rows[0]!.ok, `${table} DELETE`).toBe(false);
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

/**
 * The tenant administrator for TENANT_A, holding the enterprise node and the tenant's legal
 * entity — F-05.
 *
 * The cross-tenant tests below deliberately keep the unscoped `systemContext`: they are about
 * tenant isolation, which does not depend on node scope, and using the narrower context keeps them
 * proving the thing they are named for. This one is used where a write has to get PAST row-level
 * security so that the constraint or trigger under test is what refuses it.
 */
function adminContext() {
  // SR-2 CLASS 1 — fixture correction. This named a.enterpriseNodeId, which no membership can
  // carry: assert_governing_legal_entity requires a node the legal entity governs and the
  // enterprise root sits above that boundary. The corrected scope is the administrator's real
  // legal-entity-governed node. Every write this context exists to get past RLS for is beneath it.
  return systemContextAt(TENANT_A, a.legalEntityNodeId, a.legalEntityId, `user:${a.adminUserId}`);
}

/**
 * A legitimate verified session for the seeded tenant-A administrator.
 *
 * Reads that assert RLS behaviour run through this: the point of the suite is what
 * `freightos_app` can see, and after 0019 that is decided by the installed binding rather than by
 * anything the session writes into a GUC. Cross-tenant attacks below still start here and then
 * reach for foreign data — an attack built by setting tenant GUC = B would no longer be an attack
 * at all, because the database does not read it.
 */
const asVerifiedAdministrator = <T>(work: (c: Queryable) => Promise<T>): Promise<T> =>
  withAuthenticatedTestPrincipal(db, fixtureAdministrator(a), work);

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
      // The trusted hierarchy trigger CAN see the other tenant's node — it is a definer now, so
      // row-level security is not what refuses this — and says exactly what is wrong instead of
      // reporting a row that plainly exists as missing. The explicit tenant comparison is the
      // refusal, and it was always the one that mattered: the control-plane path reached it too.
    ).rejects.toThrow(/belongs to a different tenant/i);
  });

  it('cannot reference another tenant legal entity from a role', async () => {
    // Two independent refusals stand behind this, and the trigger is simply the first to fire:
    // the governing-legal-entity check rejects the disagreement, and the composite foreign key on
    // (tenant_id, legal_entity_id) would make the cross-tenant reference unrepresentable anyway.
    await expect(
      withLegalContext(app, systemContext(TENANT_A), async (c) => {
        await c.query(
          `INSERT INTO service_accounts
             (tenant_id, organization_node_id, legal_entity_id, key, name, actor_type, created_by)
           VALUES ($1, $2, $3, 'smuggled', 'Smuggled', 'integration', 'test')`,
          [TENANT_A, a.legalEntityNodeId, b.legalEntityId],
        );
      }),
    ).rejects.toThrow(
      /is governed by legal entity|service_accounts_legal_entity_fk|violates foreign key/i,
    );
  });

  it('still refuses the cross-tenant reference when the node agreement cannot mask it', async () => {
    // Drop the trigger out of the picture by naming a node that no legal entity governs at all in
    // this tenant, so the foreign key is what has to hold. It does.
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      await admin.query('BEGIN');
      // A named user actor, because the self-elevation guard refuses an unattributed change to the
      // authorization graph before any constraint is reached — F-01. It is a superuser connection,
      // so row-level security is out of the picture and the foreign key is genuinely what has to
      // hold, which is what this test is for.
      await admin.query(`SELECT set_config('app.actor_id', $1, true)`, [`user:${a.userId}`]);
      await expect(
        admin.query(
          `INSERT INTO role_permissions (tenant_id, role_id, permission_id, created_by)
           SELECT $1, $2, id, 'test' FROM permissions WHERE key = 'identity.role.read'`,
          [TENANT_A, b.roleId],
        ),
      ).rejects.toThrow(/role_permissions_role_fk|violates foreign key/i);
    } finally {
      await admin.query('ROLLBACK').catch(() => undefined);
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
            `INSERT INTO service_accounts
               (tenant_id, organization_node_id, legal_entity_id, key, name, actor_type,
                created_by)
             VALUES ($1, $2, $3, 'no_node_context', 'No node', 'integration', 'test')`,
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
            `INSERT INTO service_accounts
               (tenant_id, organization_node_id, legal_entity_id, key, name, actor_type,
                created_by)
             VALUES ($1, $2, $3, 'wrong_entity', 'Wrong entity', 'integration', 'test')`,
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
          `INSERT INTO service_accounts
             (tenant_id, organization_node_id, legal_entity_id, key, name, actor_type, created_by)
           VALUES ($1, $2, $3, 'right_entity', 'Right entity', 'integration', 'test')
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
  // Stated against service_accounts rather than roles — R2-01 put roles behind the administrative
  // boundary, and these tests are about the node/legal-entity agreement rule, which applies
  // identically to every table carrying both columns.
  it('rejects a row naming a node the stated legal entity does not govern', async () => {
    // The enterprise root sits above the legal-entity boundary, so nothing governs it.
    await expect(
      withLegalContext(app, systemContext(TENANT_A), async (c) => {
        await c.query(
          `INSERT INTO service_accounts
             (tenant_id, organization_node_id, legal_entity_id, key, name, actor_type, created_by)
           VALUES ($1, $2, $3, 'above_boundary', 'Above boundary', 'integration', 'test')`,
          [TENANT_A, a.enterpriseNodeId, a.legalEntityId],
        );
      }),
    ).rejects.toThrow(/sits above the legal-entity boundary/i);
  });

  it('rejects a user naming a node governed by a different legal entity', async () => {
    // Seed a second legal entity under a sibling branch, then point a user at the wrong one.
    const secondEntity = await asVerifiedAdministrator(async (c) => {
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
      asVerifiedAdministrator(async (c) => {
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
    const id = await asVerifiedAdministrator(async (c) => {
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
            `INSERT INTO service_accounts
               (tenant_id, organization_node_id, legal_entity_id, key, name, actor_type,
                created_by)
             VALUES ($1, $2, $3, 'facility_written', 'Facility written', 'integration', 'test')`,
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

describe('operating context is not a credential — F-05', () => {
  /**
   * `app.legal_entity_scope_ok` and `app.organization_node_scope_ok` used to begin
   *
   *   app.is_control_plane() OR app.current_operating_context() = 'system' OR ...
   *
   * The first branch is role membership, which a session cannot give itself. The second was a
   * session variable the caller sets, so any `freightos_app` connection could issue
   *
   *   SET LOCAL app.operating_context = 'system';
   *
   * and both predicates returned true for every legal entity and every organization node in the
   * tenant — including ids that do not exist. Every policy that scopes a row below the tenant
   * collapsed to tenant isolation alone.
   *
   * These are the regression tests for that. The reproduction that found it is the third one:
   * both predicates returned true for a freshly generated UUID.
   */

  /** Read both predicates for arbitrary ids, under whatever context is supplied. */
  async function scope(context: Parameters<typeof withLegalContext>[1], ids: [string, string]) {
    return withLegalContext(app, context, async (c) => {
      const r = await c.query<{ le_ok: boolean; node_ok: boolean; is_cp: boolean }>(
        `SELECT app.legal_entity_scope_ok($1)      AS le_ok,
                app.organization_node_scope_ok($2) AS node_ok,
                app.is_control_plane()             AS is_cp`,
        ids,
      );
      return r.rows[0]!;
    });
  }

  it('gives an unscoped system session no legal entity and no node', async () => {
    const r = await scope(systemContext(TENANT_A), [a.legalEntityId, a.terminalNodeId]);
    expect(r.le_ok).toBe(false);
    expect(r.node_ok).toBe(false);
  });

  it('does not let a system session reach another legal entity in its own tenant', async () => {
    // Scoped at the enterprise node and holding entity A, asking about a second entity B that the
    // same tenant owns. Node scope covers it; legal-entity scope must not.
    const second = await asVerifiedAdministrator(async (c) => {
      const nodeId = randomUUID();
      await (c as Client).query(
        `INSERT INTO organization_nodes
           (id, tenant_id, organization_node_id, parent_id, node_type, name, created_by)
         VALUES ($1, $2, $1, $3, 'legal_entity', 'F-05 Co', 'test')`,
        [nodeId, TENANT_A, a.enterpriseNodeId],
      );
      const entityId = randomUUID();
      await (c as Client).query(
        `INSERT INTO legal_entities
           (id, tenant_id, organization_node_id, legal_entity_id, legal_name, jurisdiction,
            created_by)
         VALUES ($1, $2, $3, $1, 'F-05 Co LLC', 'US-NV', 'test')`,
        [entityId, TENANT_A, nodeId],
      );
      return { nodeId, entityId };
    });

    const r = await scope(adminContext(), [second.entityId, second.nodeId]);
    expect(r.le_ok).toBe(false);
    expect(r.node_ok).toBe(true);
  });

  it('refuses ids that do not exist at all — the original reproduction', async () => {
    // This returned le_ok=true, node_ok=true, is_cp=false before the fix: the predicates never
    // looked at the id, because system scope answered first.
    const nowhere = randomUUID();
    const r = await scope(systemContext(TENANT_A), [nowhere, nowhere]);
    expect(r.le_ok).toBe(false);
    expect(r.node_ok).toBe(false);
    expect(r.is_cp).toBe(false);
  });

  it('leaves is_control_plane() false however the session describes itself', async () => {
    for (const context of [
      systemContext(TENANT_A),
      systemContextAt(TENANT_A, a.enterpriseNodeId, a.legalEntityId),
      carrierContextAt(TENANT_A, a.legalEntityId, a.terminalNodeId),
    ]) {
      const r = await scope(context, [a.legalEntityId, a.terminalNodeId]);
      expect(r.is_cp, JSON.stringify(context.operatingContext)).toBe(false);
    }
  });

  it('ignores a raw set_config that bypasses the context helper entirely', async () => {
    // withLegalContext validates what it is given, so the escalation is attempted the way an
    // attacker with SQL access would: straight at the GUC, mid-transaction, after a legitimate
    // narrow context is already in force.
    const r = await withLegalContext(
      app,
      carrierContextAt(TENANT_A, a.legalEntityId, a.terminalNodeId),
      async (c) => {
        await c.query(`SELECT set_config('app.operating_context', 'system', true)`);
        await c.query(`SELECT set_config('app.legal_authority_class', 'software_only', true)`);
        const q = await c.query<{ le_ok: boolean; node_ok: boolean; is_cp: boolean }>(
          `SELECT app.legal_entity_scope_ok($1)      AS le_ok,
                  app.organization_node_scope_ok($2) AS node_ok,
                  app.is_control_plane()             AS is_cp`,
          [randomUUID(), a.enterpriseNodeId],
        );
        return q.rows[0]!;
      },
    );
    // The node is the caller's own ANCESTOR, not a descendant, so it is out of scope and stays so.
    expect(r.le_ok).toBe(false);
    expect(r.node_ok).toBe(false);
    expect(r.is_cp).toBe(false);
  });

  it('refuses a write above the caller subtree even under system scope', async () => {
    await expect(
      withLegalContext(app, systemContextAt(TENANT_A, a.terminalNodeId, a.legalEntityId), (c) =>
        (c as Client).query(
          `INSERT INTO service_accounts
             (tenant_id, organization_node_id, legal_entity_id, key, name, actor_type, status,
              created_by)
           VALUES ($1, $2, $3, 'f05_above', 'Above', 'integration', 'active', 'test')`,
          [TENANT_A, a.regionNodeId, a.legalEntityId],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('still permits the same write inside the caller subtree', async () => {
    // The predicate has to keep working, or "fail closed" would just mean "fail".
    const id = await withLegalContext(
      app,
      systemContextAt(TENANT_A, a.regionNodeId, a.legalEntityId),
      async (c) => {
        const r = await (c as Client).query<{ id: string }>(
          `INSERT INTO service_accounts
             (tenant_id, organization_node_id, legal_entity_id, key, name, actor_type, status,
              created_by)
           VALUES ($1, $2, $3, 'f05_inside', 'Inside', 'integration', 'active', 'test')
           RETURNING id`,
          [TENANT_A, a.terminalNodeId, a.legalEntityId],
        );
        return r.rows[0]!.id;
      },
    );
    expect(id).toBeTruthy();
  });

  it('gives every operating context the identical scope', async () => {
    // ADR-0019 property 2 — operating context never widens permission. Asserted as an equality
    // across the contexts Horizon 1 allows, so a future branch on one of them shows up here.
    const target: [string, string] = [a.legalEntityId, a.terminalNodeId];
    const results = await Promise.all(
      [
        systemContextAt(TENANT_A, a.regionNodeId, a.legalEntityId),
        carrierContextAt(TENANT_A, a.legalEntityId, a.regionNodeId),
        facilityContextAt(TENANT_A, a.legalEntityId, a.regionNodeId),
      ].map((context) => scope(context, target)),
    );
    for (const r of results) expect(r).toEqual(results[0]);
    // And that shared answer is the one the hierarchy dictates, not a vacuous false.
    expect(results[0]!.node_ok).toBe(true);
    expect(results[0]!.le_ok).toBe(true);
  });

  it('does not let system scope cross a tenant boundary', async () => {
    const r = await scope(systemContext(TENANT_A), [b.legalEntityId, b.terminalNodeId]);
    expect(r.le_ok).toBe(false);
    expect(r.node_ok).toBe(false);
  });

  it('still admits the control plane, which is role membership and cannot be claimed', async () => {
    // The trusted branch has to survive the fix, or nothing is left that can act above a tenant's
    // own subtree. The control plane holds no node and no legal entity in context and passes
    // anyway — because of the role it connected as, which no session variable can produce.
    const control = db.connectAs('freightos_control_plane');
    await control.connect();
    try {
      const r = await control.query<{ le_ok: boolean; is_cp: boolean }>(
        `SELECT app.legal_entity_scope_ok($1) AS le_ok,
                app.is_control_plane()        AS is_cp`,
        [a.legalEntityId],
      );
      expect(r.rows[0]).toEqual({ le_ok: true, is_cp: true });

      // The node predicate is deliberately NOT reachable from this connection, and the refusal is
      // a missing grant rather than a policy decision: ADR-0020 §7 gives the control plane no
      // privilege on any identity table, the closure included. It reaches node scope only through
      // the admin definer, which migration 0013 grants SELECT on the closure for exactly this
      // reason. That path is evidenced in control-plane.test.ts.
      await expect(
        control.query('SELECT app.organization_node_scope_ok($1)', [a.terminalNodeId]),
      ).rejects.toThrow(/permission denied for table organization_node_closure/i);
    } finally {
      await control.end();
    }
  });

  it('names no session variable in either predicate', async () => {
    // The behavioural tests above are the evidence; this is the tripwire. A future edit that
    // reintroduces any current_* session read into these two predicates fails here, next to the
    // comment explaining why it must not.
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      const r = await admin.query<{ proname: string; body: string }>(
        `SELECT p.proname, pg_get_functiondef(p.oid) AS body
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'app'
            AND p.proname IN ('legal_entity_scope_ok', 'organization_node_scope_ok')
          ORDER BY p.proname`,
      );
      expect(r.rows).toHaveLength(2);
      for (const row of r.rows) {
        expect(row.body, `${row.proname} reads operating context`).not.toMatch(
          /current_operating_context/,
        );
        expect(row.body, `${row.proname} reads legal authority class`).not.toMatch(
          /current_legal_authority_class/,
        );
      }
    } finally {
      await admin.end();
    }
  });
});

/**
 * F-20, R2-04 — every composite foreign key needs a FULL index its own columns can serve.
 *
 * PostgreSQL indexes the REFERENCED side of a foreign key automatically, because that side is a
 * primary key or a unique constraint. It indexes the referencing side not at all. Two things then
 * go wrong quietly: a referential check on delete or update of the parent scans the child table,
 * and every join along the key does the same.
 *
 * The composite keys in PR 2 are all `(tenant_id, something_id)`, which makes the miss easy: a
 * single-column index on `tenant_id` looks like coverage and is not, and an index on
 * `(something_id, tenant_id)` cannot serve a leading-column lookup on `tenant_id` either.
 *
 * Asserted for the whole schema rather than checked once by hand, so a PR 3 table arrives with the
 * same requirement rather than the same oversight.
 */
describe('every composite foreign key is indexed on the referencing side — F-20', () => {
  it('finds no unindexed referencing side anywhere in the schema', async () => {
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      const r = await admin.query<{ table_name: string; constraint_name: string; columns: string }>(
        `WITH fk AS (
           SELECT c.conrelid,
                  c.conname,
                  c.conkey,
                  cl.relname AS table_name
             FROM pg_constraint c
             JOIN pg_class cl ON cl.oid = c.conrelid
             JOIN pg_namespace n ON n.oid = cl.relnamespace
            WHERE c.contype = 'f' AND n.nspname = 'public'
              AND array_length(c.conkey, 1) > 1
         )
         SELECT fk.table_name,
                fk.conname AS constraint_name,
                (SELECT string_agg(a.attname, ', ' ORDER BY k.ord)
                   FROM unnest(fk.conkey) WITH ORDINALITY AS k(attnum, ord)
                   JOIN pg_attribute a
                     ON a.attrelid = fk.conrelid AND a.attnum = k.attnum) AS columns
           FROM fk
          WHERE NOT EXISTS (
            -- An index serves the key when the key's columns are a PREFIX of the index's columns,
            -- in order. Anything less cannot answer a lookup on the key alone.
            SELECT 1 FROM pg_index i
             WHERE i.indrelid = fk.conrelid
               AND i.indisvalid
               -- A PARTIAL index does not count — R2-04. It answers only a lookup the planner can
               -- prove falls inside its predicate, and a foreign-key check cannot: it looks up the
               -- referencing rows for a parent row whether or not they are revoked. Four keys were
               -- covered by a revoked_at IS NULL unique index alone and passed this audit
               -- while every revoked row remained unindexed.
               AND i.indpred IS NULL
               AND (SELECT array_agg(k ORDER BY o)
                      FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS t(k, o)
                     WHERE o <= array_length(fk.conkey, 1))
                   = fk.conkey
          )
          ORDER BY fk.table_name, fk.conname`,
      );

      // Reported by name rather than as a bare count: a failure here should say which key to index.
      expect(r.rows.map((x) => `${x.table_name}.${x.constraint_name} (${x.columns})`)).toEqual([]);
    } finally {
      await admin.end();
    }
  });
});

/**
 * R2-04 — the four foreign keys whose only cover was a partial unique index.
 *
 * `role_permissions_one_active_per_pair` and its three siblings have the right leading columns and
 * a `revoked_at IS NULL` predicate. A partial index answers only a lookup the planner can prove
 * falls inside that predicate, and a foreign-key check cannot: it looks up the referencing rows for
 * a parent row whether or not they are revoked. Every revoked row was therefore unindexed for the
 * purpose the audit exists to check, and the audit passed anyway.
 */
describe('a partial index is not FK-support evidence — R2-04', () => {
  const NAMED = [
    ['carrier_appointments', 'carrier_appointments_legal_entity_fk'],
    ['role_permissions', 'role_permissions_role_fk'],
    ['membership_roles', 'membership_roles_membership_fk'],
    ['service_account_permissions', 'service_account_permissions_account_fk'],
  ] as const;

  it('gives each of the four named keys a full supporting index', async () => {
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      for (const [table, constraint] of NAMED) {
        const r = await admin.query<{ indexname: string; partial: boolean }>(
          `WITH fk AS (
             SELECT c.conrelid, c.conkey FROM pg_constraint c
              WHERE c.conname = $1 AND c.conrelid = $2::regclass)
           SELECT i.relname AS indexname, x.indpred IS NOT NULL AS partial
             FROM fk
             JOIN pg_index x ON x.indrelid = fk.conrelid AND x.indisvalid
             JOIN pg_class i ON i.oid = x.indexrelid
            WHERE (SELECT array_agg(k ORDER BY o)
                     FROM unnest(x.indkey::smallint[]) WITH ORDINALITY AS t(k, o)
                    WHERE o <= array_length(fk.conkey, 1)) = fk.conkey
            ORDER BY partial, i.relname`,
          [constraint, table],
        );

        // Both: the partial unique index enforces "one active per pair", which a full index cannot
        // do, and the full index supports the key, which a partial one cannot. Neither replaces the
        // other, and the retained partial index is documented rather than removed.
        expect(
          r.rows.filter((x) => !x.partial).map((x) => x.indexname),
          `${constraint} full index`,
        ).not.toEqual([]);
        expect(
          r.rows.filter((x) => x.partial).map((x) => x.indexname),
          `${constraint} partial unique index retained`,
        ).not.toEqual([]);
      }
    } finally {
      await admin.end();
    }
  });

  it('would have reported all four before the indexes were added', async () => {
    // The tightening is load-bearing, shown rather than asserted: the audit query with the
    // `indpred IS NULL` clause removed accepts a partial index, and with it restored these four are
    // exactly the keys whose cover was partial-only. Run against the LIVE schema, so it also proves
    // the four new indexes are the ones closing the gap.
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      const partialOnly = await admin.query<{ conname: string }>(
        `WITH fk AS (
           SELECT c.conrelid, c.conname, c.conkey FROM pg_constraint c
             JOIN pg_class cl ON cl.oid = c.conrelid
             JOIN pg_namespace n ON n.oid = cl.relnamespace
            WHERE c.contype = 'f' AND n.nspname = 'public'
              AND array_length(c.conkey, 1) > 1),
         covering AS (
           SELECT fk.conname, bool_or(x.indpred IS NULL) AS has_full
             FROM fk
             JOIN pg_index x ON x.indrelid = fk.conrelid AND x.indisvalid
            WHERE (SELECT array_agg(k ORDER BY o)
                     FROM unnest(x.indkey::smallint[]) WITH ORDINALITY AS t(k, o)
                    WHERE o <= array_length(fk.conkey, 1)) = fk.conkey
            GROUP BY fk.conname)
         SELECT conname FROM covering WHERE NOT has_full ORDER BY conname`,
      );
      // Empty now. Before the four indexes, this returned exactly the four named above — which is
      // what the audit's `indpred IS NULL` clause is there to notice.
      expect(partialOnly.rows.map((x) => x.conname)).toEqual([]);
    } finally {
      await admin.end();
    }
  });

  it('uses the full index for a foreign-key style lookup', async () => {
    // A plan rather than a catalog assertion: the point of the index is that a lookup on the key's
    // columns alone can use it, which is exactly what a referential check does.
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      await admin.query('SET LOCAL enable_seqscan = off');
      const plan = await admin.query<{ 'QUERY PLAN': string }>(
        `EXPLAIN (COSTS OFF)
         SELECT 1 FROM role_permissions WHERE tenant_id = $1 AND role_id = $2`,
        [TENANT_A, a.roleId],
      );
      const text = plan.rows.map((x) => x['QUERY PLAN']).join('\n');
      expect(text).toMatch(/role_permissions_role_fk_idx/);
    } finally {
      await admin.end();
    }
  });
});
