import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withLegalContext } from '../../src/session.ts';
import { TENANT_A, TENANT_B, TestDatabase } from './harness.ts';
import {
  carrierContextAt,
  facilityContextAt,
  seedIdentity,
  systemContextAt,
  type IdentityFixture,
} from './identity-harness.ts';

/**
 * R2-01 — the authorization mutation boundary.
 *
 * F-01 closed the case where a caller declined to name a user. It did not close the case where a
 * caller names one it is not. `app.current_user_id()` parses `user:<uuid>` out of `app.actor_id`, a
 * session variable, so a freightos_app session could issue
 *
 *   SET LOCAL app.actor_id = 'user:<any uuid at all>';
 *
 * and every self-elevation guard compared the row against somebody else. The reproduction: a
 * fabricated uuid created a role, granted that role a permission, and assigned the role to the
 * caller's own membership. Self-elevation laundered through a fabricated third party is still
 * self-elevation, and impersonating a real colleague worked identically.
 *
 * A regex-valid uuid is not an authenticated identity, so the fix is not to check the uuid harder.
 * Ordinary tenant sessions no longer mutate the authorization graph at all; every change goes
 * through a named admin.* function over the freightos_admin connection, and authority comes from
 * that ROLE, which a session cannot set.
 */
const db = new TestDatabase('freightos_test_authorization_boundary');

let app: Client;
let adminConn: Client;
let fixtureConn: Client;
let a: IdentityFixture;
let b: IdentityFixture;

/** The five tables where a write can change effective authority. */
const GUARDED_TABLES = [
  'roles',
  'role_permissions',
  'memberships',
  'membership_roles',
  'service_account_permissions',
] as const;

const AS_ADMIN = ['human', 'identity_administration'] as const;

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  app = db.connectAs('freightos_app');
  await app.connect();
  adminConn = db.connectAs('freightos_admin');
  await adminConn.connect();
  fixtureConn = db.connectAs('postgres');
  await fixtureConn.connect();
  a = await seedIdentity(db, TENANT_A);
  b = await seedIdentity(db, TENANT_B);
}, 90_000);

afterAll(async () => {
  await app?.end();
  await adminConn?.end();
  await fixtureConn?.end();
});

interface PrivilegedResult {
  outcome: string;
  audit_event_id: string | null;
  message: string | null;
  payload: Record<string, unknown>;
}

async function call(sql: string, params: readonly unknown[]): Promise<PrivilegedResult> {
  const r = await adminConn.query<PrivilegedResult>(sql, [...params]);
  return r.rows[0]!;
}

/** Everything a tenant session could try, in the contexts Horizon 1 allows. */
const TENANT_CONTEXTS = () =>
  [
    ['system', systemContextAt(TENANT_A, a.enterpriseNodeId, a.legalEntityId, `user:${a.userId}`)],
    ['carrier', carrierContextAt(TENANT_A, a.legalEntityId, a.terminalNodeId, `user:${a.userId}`)],
    [
      'facility_operator',
      facilityContextAt(TENANT_A, a.legalEntityId, a.terminalNodeId, `user:${a.userId}`),
    ],
    [
      'shipper_owned',
      {
        tenantId: TENANT_A,
        actorId: `user:${a.userId}`,
        legalAuthorityClass: 'software_only' as const,
        operatingContext: 'shipper_owned' as const,
        legalEntityId: a.legalEntityId,
        organizationNodeId: a.terminalNodeId,
      },
    ],
  ] as const;

describe('a tenant session cannot mutate the authorization graph — R2-01', () => {
  it('holds no write privilege on any of the five tables', async () => {
    const r = await fixtureConn.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type FROM information_schema.table_privileges
        WHERE grantee = 'freightos_app' AND table_name = ANY($1)
          AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
        ORDER BY table_name, privilege_type`,
      [[...GUARDED_TABLES]],
    );
    expect(r.rows).toEqual([]);
  });

  it('keeps read exactly where it was', async () => {
    // The boundary removes mutation, not visibility. ADR-0019's matrix gives tenant sessions read
    // over identity, and a fix that quietly took that away would be a different change.
    const r = await fixtureConn.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.table_privileges
        WHERE grantee = 'freightos_app' AND table_name = ANY($1) AND privilege_type = 'SELECT'
        ORDER BY table_name`,
      [[...GUARDED_TABLES]],
    );
    expect(r.rows.map((x) => x.table_name)).toEqual([...GUARDED_TABLES].sort());

    const visible = await withLegalContext(
      app,
      systemContextAt(TENANT_A, a.enterpriseNodeId, a.legalEntityId, `user:${a.userId}`),
      async (c) => {
        const q = await c.query('SELECT id FROM roles WHERE id = $1', [a.roleId]);
        return q.rowCount;
      },
    );
    expect(visible).toBe(1);
  });

  const attempts: [string, string, () => readonly unknown[]][] = [
    [
      'membership creation',
      `INSERT INTO memberships (tenant_id, organization_node_id, legal_entity_id, user_id,
         created_by) VALUES ($1, $2, $3, $4, 'test')`,
      () => [TENANT_A, a.regionNodeId, a.legalEntityId, a.userId],
    ],
    [
      'membership modification',
      `UPDATE memberships SET status = 'active' WHERE id = $1`,
      () => [a.membershipId],
    ],
    [
      'membership revocation',
      `UPDATE memberships SET revoked_at = now(), revoked_by = 'x', status = 'revoked'
        WHERE id = $1`,
      () => [a.membershipId],
    ],
    [
      'membership-role assignment',
      `INSERT INTO membership_roles (tenant_id, membership_id, role_id, created_by)
       VALUES ($1, $2, $3, 'test')`,
      () => [TENANT_A, a.membershipId, a.roleId],
    ],
    [
      'role-permission assignment',
      `INSERT INTO role_permissions (tenant_id, role_id, permission_id, created_by)
       SELECT $1, $2, id, 'test' FROM permissions WHERE key = 'identity.role.write'`,
      () => [TENANT_A, a.roleId],
    ],
    [
      'role authority expansion',
      `UPDATE roles SET name = 'expanded' WHERE id = $1`,
      () => [a.roleId],
    ],
    [
      'service-account permission assignment',
      `INSERT INTO service_account_permissions (tenant_id, service_account_id, permission_id,
         created_by)
       SELECT $1, $2, id, 'test' FROM permissions WHERE key = 'identity.role.write'`,
      () => [TENANT_A, a.serviceAccountId],
    ],
  ];

  for (const [label, sql, params] of attempts) {
    it(`refuses ${label} from every tenant context`, async () => {
      for (const [name, context] of TENANT_CONTEXTS()) {
        await expect(
          withLegalContext(app, context, (c) => (c as Client).query(sql, [...params()])),
          `${label} / ${name}`,
        ).rejects.toThrow(/permission denied/i);
      }
    });
  }

  it('refuses the original reproduction — a fabricated actor uuid', async () => {
    // Before the fix this created a role, granted it a permission, and assigned it to the caller's
    // own membership. The actor id is no longer consulted, because the attempt does not get that far.
    await expect(
      withLegalContext(
        app,
        systemContextAt(TENANT_A, a.enterpriseNodeId, a.legalEntityId, `user:${randomUUID()}`),
        (c) =>
          (c as Client).query(
            `INSERT INTO roles (tenant_id, organization_node_id, legal_entity_id, key, name,
               created_by) VALUES ($1, $2, $3, 'fabricated', 'Fabricated', 'test')`,
            [TENANT_A, a.legalEntityNodeId, a.legalEntityId],
          ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('refuses the impersonation of a real colleague', async () => {
    await expect(
      withLegalContext(
        app,
        systemContextAt(TENANT_A, a.enterpriseNodeId, a.legalEntityId, `user:${a.adminUserId}`),
        (c) =>
          (c as Client).query(
            `INSERT INTO roles (tenant_id, organization_node_id, legal_entity_id, key, name,
               created_by) VALUES ($1, $2, $3, 'impersonated', 'Impersonated', 'test')`,
            [TENANT_A, a.legalEntityNodeId, a.legalEntityId],
          ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('proves changing app.actor_id alone changes nothing', async () => {
    // The finding in one assertion. Every actor id a session could name — fabricated, borrowed,
    // its own, a service account's, a platform actor's — produces the same refusal, because the
    // refusal is a missing table privilege and no session state affects one.
    const outcomes = new Set<string>();
    for (const actorId of [
      `user:${randomUUID()}`,
      `user:${a.adminUserId}`,
      `user:${a.userId}`,
      `user:${a.serviceAccountId}`,
      'system:platform',
      'integration:billing_sync',
    ]) {
      const error = await withLegalContext(
        app,
        systemContextAt(TENANT_A, a.enterpriseNodeId, a.legalEntityId, actorId),
        (c) =>
          (c as Client).query(
            `INSERT INTO role_permissions (tenant_id, role_id, permission_id, created_by)
             SELECT $1, $2, id, 'test' FROM permissions WHERE key = 'identity.role.write'`,
            [TENANT_A, a.roleId],
          ),
      ).then(
        () => 'SUCCEEDED',
        (e: Error) => (/permission denied/i.test(e.message) ? 'denied' : e.message),
      );
      outcomes.add(error);
    }
    expect([...outcomes]).toEqual(['denied']);
  });
});

describe('the administrative boundary gates every mutation — R2-01', () => {
  const grantPermission = (
    actor: string,
    actorType = 'human',
    purpose = 'identity_administration',
  ) =>
    call('SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5, $6, $7)', [
      TENANT_A,
      a.roleId,
      'identity.role.read',
      actor,
      actorType,
      purpose,
      randomUUID(),
    ]);

  it('performs a valid trusted mutation and audits it atomically', async () => {
    const correlationId = randomUUID();
    const result = await call(
      'SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [
        TENANT_A,
        a.legalEntityNodeId,
        a.legalEntityId,
        `valid_${randomUUID().slice(0, 8)}`,
        'Valid',
        `user:${a.adminUserId}`,
        ...AS_ADMIN,
        correlationId,
      ],
    );
    expect(result.outcome).toBe('succeeded');
    expect(result.audit_event_id).toBeTruthy();

    // Same transaction, so the row and its audit record cannot exist without each other.
    const audit = await fixtureConn.query<{ outcome: string; action: string }>(
      `SELECT outcome, payload ->> 'action' AS action FROM audit_events WHERE id = $1`,
      [result.audit_event_id],
    );
    expect(audit.rows[0]).toEqual({ outcome: 'succeeded', action: 'identity.role.create' });

    const role = await fixtureConn.query(`SELECT id FROM roles WHERE id = $1`, [
      result.payload['role_id'],
    ]);
    expect(role.rowCount).toBe(1);
  });

  const denials: [string, () => Promise<PrivilegedResult>, RegExp][] = [
    ['a missing actor', () => grantPermission(''), /actor is required/],
    [
      'a missing purpose',
      () => grantPermission(`user:${a.adminUserId}`, 'human', ''),
      /purpose is required/,
    ],
    [
      'a purpose that does not authorise it',
      () => grantPermission(`user:${a.adminUserId}`, 'human', 'audit_export'),
      /does not authorise a change to the authorization graph/,
    ],
    [
      'a nonexistent user actor',
      () => grantPermission(`user:${randomUUID()}`),
      /is not a user of tenant/,
    ],
    [
      'a cross-tenant user actor',
      () => grantPermission(`user:${b.adminUserId}`),
      /is not a user of tenant/,
    ],
    [
      'a service account claiming to be a user',
      () => grantPermission(`user:${a.serviceAccountId}`),
      /is not a user of tenant/,
    ],
    [
      'a fabricated actor that is not even a uuid',
      () => grantPermission('user:not-a-uuid'),
      /must be of the form user:<uuid>/,
    ],
    [
      'an agent actor type',
      () => grantPermission(`user:${a.adminUserId}`, 'agent'),
      /may not perform a privileged operation/,
    ],
  ];

  for (const [label, attempt, message] of denials) {
    it(`denies ${label}`, async () => {
      const result = await attempt();
      expect(result.outcome).toBe('denied');
      expect(result.message).toMatch(message);
    });
  }

  it('denies a missing request id', async () => {
    const result = await call(
      'SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5, $6, $7)',
      [TENANT_A, a.roleId, 'identity.role.read', `user:${a.adminUserId}`, ...AS_ADMIN, null],
    );
    expect(result.outcome).toBe('denied');
    expect(result.message).toMatch(/correlation id is required/);
  });

  it('denies a revoked principal', async () => {
    const revoked = await withLegalContext(
      fixtureConn,
      systemContextAt(TENANT_A, a.enterpriseNodeId, a.legalEntityId, `user:${a.adminUserId}`),
      async (c) => {
        const r = await (c as Client).query<{ id: string }>(
          `INSERT INTO users
             (tenant_id, organization_node_id, legal_entity_id, authentication_provider,
              authentication_subject, display_name, status, revoked_at, revoked_by, created_by)
           VALUES ($1, $2, $3, 'oidc:example', $4, 'Revoked', 'revoked', now(), 'test', 'test')
           RETURNING id`,
          [TENANT_A, a.regionNodeId, a.legalEntityId, `revoked-${randomUUID()}`],
        );
        return r.rows[0]!.id;
      },
    );
    const result = await grantPermission(`user:${revoked}`);
    expect(result.outcome).toBe('denied');
    expect(result.message).toMatch(/is not an active principal/);
  });

  it('refuses a cross-tenant target', async () => {
    const result = await call(
      'SELECT * FROM admin.assign_membership_role($1, $2, $3, $4, $5, $6, $7)',
      [TENANT_A, b.membershipId, a.roleId, `user:${a.adminUserId}`, ...AS_ADMIN, randomUUID()],
    );
    expect(result.outcome).toBe('denied');
    expect(result.message).toMatch(/is not in tenant/);
  });

  it('refuses a cross-legal-entity and a cross-organization-node target', async () => {
    const crossEntity = await call(
      'SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [
        TENANT_A,
        a.legalEntityNodeId,
        b.legalEntityId,
        `cross_entity_${randomUUID().slice(0, 8)}`,
        'Cross entity',
        `user:${a.adminUserId}`,
        ...AS_ADMIN,
        randomUUID(),
      ],
    );
    expect(crossEntity.outcome).toBe('denied');
    expect(crossEntity.message).toMatch(/does not govern organization node/);

    const crossNode = await call(
      'SELECT * FROM admin.grant_membership($1, $2, $3, $4, $5, $6, $7, $8)',
      [
        TENANT_A,
        a.userId,
        b.terminalNodeId,
        a.legalEntityId,
        `user:${a.adminUserId}`,
        ...AS_ADMIN,
        randomUUID(),
      ],
    );
    expect(crossNode.outcome).toBe('denied');
    expect(crossNode.message).toMatch(/is not in tenant/);
  });

  it('refuses a direct self-grant and an indirect one through a role the actor holds', async () => {
    // Direct: the ADMINISTRATOR adding a permission to the role it holds. The administrator is
    // used rather than the operator because 0018 §3's permission gate refuses an ordinary member
    // before the self-elevation guard runs — `denied`, correctly, but it would erase this guard's
    // coverage. The gate's own refusal is asserted separately below.
    const direct = await call(
      'SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5, $6, $7)',
      [
        TENANT_A,
        a.adminRoleId,
        'identity.user.write',
        `user:${a.adminUserId}`,
        ...AS_ADMIN,
        randomUUID(),
      ],
    );
    expect(direct.outcome).toBe('failed');
    expect(direct.message).toMatch(/may not add a permission to a role it holds/);

    // And the gate itself: an ordinary member never reaches the guard at all.
    const gated = await grantPermission(`user:${a.userId}`);
    expect(gated.outcome).toBe('denied');
    expect(gated.message).toMatch(/does not hold/);

    // Indirect: create a role, then assign it to yourself. Creating the role is setup, not the
    // attack, so it runs as the administrator, which genuinely holds identity.role.write. Before
    // 0018 §3 the operator could create it too — the gate had no permission argument and any
    // active member passed — and that is authority the remediation removed on purpose.
    const created = await call(
      'SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [
        TENANT_A,
        a.legalEntityNodeId,
        a.legalEntityId,
        `self_assign_${randomUUID().slice(0, 8)}`,
        'Self assign',
        `user:${a.adminUserId}`,
        ...AS_ADMIN,
        randomUUID(),
      ],
    );
    expect(created.outcome).toBe('succeeded');

    // The operator aiming that role at its own membership never reaches the guard: the gate
    // refuses it first, before any row is touched.
    const assignedByOperator = await call(
      'SELECT * FROM admin.assign_membership_role($1, $2, $3, $4, $5, $6, $7)',
      [
        TENANT_A,
        a.membershipId,
        created.payload['role_id'],
        `user:${a.userId}`,
        ...AS_ADMIN,
        randomUUID(),
      ],
    );
    expect(assignedByOperator.outcome).toBe('denied');
    expect(assignedByOperator.message).toMatch(/does not hold/);

    // And the guard, on an actor that does pass the gate: the administrator assigning the new
    // role to its OWN membership is stopped during the mutation, not before it.
    const assigned = await call(
      'SELECT * FROM admin.assign_membership_role($1, $2, $3, $4, $5, $6, $7)',
      [
        TENANT_A,
        a.adminMembershipId,
        created.payload['role_id'],
        `user:${a.adminUserId}`,
        ...AS_ADMIN,
        randomUUID(),
      ],
    );
    expect(assigned.outcome).toBe('failed');
    expect(assigned.message).toMatch(/may not grant itself a role/);

    // Nothing landed: the role exists, but neither membership carries it.
    const landed = await fixtureConn.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM membership_roles
        WHERE tenant_id = $1 AND role_id = $2`,
      [TENANT_A, created.payload['role_id']],
    );
    expect(Number(landed.rows[0]!.count)).toBe(0);
  });

  it('replays rather than repeats under the same correlation id', async () => {
    const correlationId = randomUUID();
    const params = [
      TENANT_A,
      a.legalEntityNodeId,
      a.legalEntityId,
      `idempotent_${randomUUID().slice(0, 8)}`,
      'Idempotent',
      `user:${a.adminUserId}`,
      ...AS_ADMIN,
      correlationId,
    ];
    const first = await call(
      'SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      params,
    );
    expect(first.outcome).toBe('succeeded');

    const retry = await call(
      'SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [...params.slice(0, 3), `${params[3]}_other`, ...params.slice(4)],
    );
    expect(retry.outcome).toBe('succeeded');
    expect(retry.payload['idempotent_replay']).toBe(true);
    expect(retry.audit_event_id).toBe(first.audit_event_id);

    // And exactly one role exists, not two.
    const roles = await fixtureConn.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM roles WHERE tenant_id = $1 AND key LIKE 'idempotent_%'`,
      [TENANT_A],
    );
    expect(Number(roles.rows[0]!.count)).toBe(1);
  });

  it('lets exactly one of two concurrent duplicate grants through', async () => {
    // Two real connections, both inside transactions, the second issued while the first is open.
    const role = await call('SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7, $8, $9)', [
      TENANT_A,
      a.legalEntityNodeId,
      a.legalEntityId,
      `concurrent_${randomUUID().slice(0, 8)}`,
      'Concurrent',
      `user:${a.adminUserId}`,
      ...AS_ADMIN,
      randomUUID(),
    ]);
    const roleId = role.payload['role_id'];

    const one = db.connectAs('freightos_admin');
    const two = db.connectAs('freightos_admin');
    await one.connect();
    await two.connect();
    try {
      const grant = (client: Client) =>
        client.query<PrivilegedResult>(
          'SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5, $6, $7)',
          [
            TENANT_A,
            roleId,
            'identity.role.read',
            `user:${a.adminUserId}`,
            ...AS_ADMIN,
            randomUUID(),
          ],
        );

      await one.query('BEGIN');
      await two.query('BEGIN');
      const first = await grant(one);
      expect(first.rows[0]!.outcome).toBe('succeeded');
      const second = grant(two);
      await one.query('COMMIT');
      const secondResult = await second;
      await two.query('COMMIT');

      // The partial unique index is what decides, and the loser gets a `failed` outcome with the
      // constraint named rather than a duplicate row.
      expect(secondResult.rows[0]!.outcome).toBe('failed');
      expect(secondResult.rows[0]!.message).toMatch(/one_active_per_pair/);
    } finally {
      await one.end();
      await two.end();
    }
  });

  it('keeps a denial transaction-bound, as ADR-0026 §5 states', async () => {
    // TRANSACTION_BOUND_DENIAL_AUDIT is unchanged by this boundary: a denial is written in the
    // caller's transaction and goes with it if the caller rolls back.
    const correlationId = randomUUID();
    await adminConn.query('BEGIN');
    const result = await call(
      'SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5, $6, $7)',
      [TENANT_A, a.roleId, 'identity.role.read', 'user:not-a-uuid', ...AS_ADMIN, correlationId],
    );
    expect(result.outcome).toBe('denied');
    await adminConn.query('ROLLBACK');

    const kept = await fixtureConn.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events WHERE correlation_id = $1`,
      [correlationId],
    );
    expect(Number(kept.rows[0]!.count)).toBe(0);
  });

  it('preserves revocation and effective dating', async () => {
    const role = await call('SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7, $8, $9)', [
      TENANT_A,
      a.legalEntityNodeId,
      a.legalEntityId,
      `lifecycle_${randomUUID().slice(0, 8)}`,
      'Lifecycle',
      `user:${a.adminUserId}`,
      ...AS_ADMIN,
      randomUUID(),
    ]);
    const granted = await call(
      'SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5, $6, $7)',
      [
        TENANT_A,
        role.payload['role_id'],
        'identity.role.read',
        `user:${a.adminUserId}`,
        ...AS_ADMIN,
        randomUUID(),
      ],
    );
    const revoked = await call(
      'SELECT * FROM admin.revoke_role_permission($1, $2, $3, $4, $5, $6)',
      [
        TENANT_A,
        granted.payload['role_permission_id'],
        `user:${a.adminUserId}`,
        ...AS_ADMIN,
        randomUUID(),
      ],
    );
    expect(revoked.outcome).toBe('succeeded');

    // Revoked, not deleted: the row survives with its revocation recorded, which is what makes an
    // effective-dated read of a past instant reproducible.
    const row = await fixtureConn.query<{ revoked_at: Date | null; revoked_by: string | null }>(
      'SELECT revoked_at, revoked_by FROM role_permissions WHERE id = $1',
      [granted.payload['role_permission_id']],
    );
    expect(row.rows[0]!.revoked_at).not.toBeNull();
    expect(row.rows[0]!.revoked_by).toBe(`user:${a.adminUserId}`);
  });

  it('grants EXECUTE to the administrative connection and to nobody else', async () => {
    const r = await fixtureConn.query<{ proname: string; grantee: string }>(
      `SELECT p.proname, a.rolname AS grantee
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS acl
         JOIN pg_roles a ON a.oid = acl.grantee
        WHERE n.nspname = 'admin' AND acl.privilege_type = 'EXECUTE'
          AND a.rolname <> 'freightos_admin_owner'
        ORDER BY p.proname, a.rolname`,
    );
    expect([...new Set(r.rows.map((x) => x.grantee))]).toEqual(['freightos_admin']);
    // The three helpers are internal and are granted to nobody, so no caller can reach the
    // actor-publishing step or the gate on its own.
    expect(r.rows.map((x) => x.proname)).not.toContain('publish_actor');
    expect(r.rows.map((x) => x.proname)).not.toContain('authorization_refusal_reason');
    expect(r.rows.map((x) => x.proname)).not.toContain('prior_success');
  });
});
