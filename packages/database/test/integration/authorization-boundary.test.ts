import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withLegalContext } from '../../src/session.ts';
import { fixtureAdministrator, withAuthenticatedTestPrincipal } from './verified-test-auth.ts';
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

const PURPOSE = 'identity_administration';

/**
 * SEC-01 / 0026 — the connections this file needs, and why there are now five of them.
 *
 * The boundary used to take the acting human as `p_actor`, so one `freightos_admin` connection
 * could play every part: the administrator, an ordinary member, a colleague in another tenant, a
 * service account, a fabricated uuid. Naming the part was the whole of becoming it.
 *
 * That argument is gone. A principal is now resolved from `session_user`, so every part has to be
 * played by a connection that genuinely authenticated as it — which is the point, and which is why
 * the cases below that used to be one function call with a different string are now separate
 * logins. Where a case cannot be given an authenticated form at all, it is because the attack has
 * become unsayable rather than merely refused; those are gathered and accounted for in
 * "the actor denials, at the layer they now live" at the end of this file.
 */
let adminConn: Client; // administrator of tenant A — holds identity.* write
let adminRole: string; // ...and its login role, for the cases that need a second session as it
let operatorConn: Client; // ordinary member of tenant A — holds none of it
let bAdminConn: Client; // administrator of tenant B
let sharedConn: Client; // the shared freightos_admin credential — a service, and NOT on the allowlist
let provisionerConn: Client; // a service that IS on admin.platform_actor
let unboundConn: Client; // authenticated to PostgreSQL, bound to no FreightOS principal

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  app = db.connectAs('freightos_app');
  await app.connect();
  fixtureConn = db.connectAs('postgres');
  await fixtureConn.connect();
  a = await seedIdentity(db, TENANT_A);
  b = await seedIdentity(db, TENANT_B);

  adminRole = await db.provisionOperator('admin', TENANT_A, a.adminUserId);
  adminConn = db.connectAsOperator(adminRole);
  await adminConn.connect();
  operatorConn = db.connectAsOperator(await db.provisionOperator('member', TENANT_A, a.userId));
  await operatorConn.connect();
  bAdminConn = db.connectAsOperator(await db.provisionOperator('badmin', TENANT_B, b.adminUserId));
  await bAdminConn.connect();
  sharedConn = db.connectAs('freightos_admin');
  await sharedConn.connect();
  provisionerConn = db.connectAsOperator(
    await db.provisionSystemLogin('svc', 'system:tenant-provisioning'),
  );
  await provisionerConn.connect();
  unboundConn = db.connectAsOperator(await db.provisionUnboundLogin('nobody'));
  await unboundConn.connect();
}, 120_000);

afterAll(async () => {
  for (const c of [
    app,
    fixtureConn,
    adminConn,
    operatorConn,
    bAdminConn,
    sharedConn,
    provisionerConn,
    unboundConn,
  ])
    await c?.end();
});

interface PrivilegedResult {
  outcome: string;
  audit_event_id: string | null;
  message: string | null;
  payload: Record<string, unknown>;
}

/** Defaults to the administrator, because that is the principal most of these cases assume. */
async function call(
  sql: string,
  params: readonly unknown[],
  client: Client = adminConn,
): Promise<PrivilegedResult> {
  const r = await client.query<PrivilegedResult>(sql, [...params]);
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

    // SR-2 CLASS 1 — fixture correction. This read used the OPERATOR under an enterprise-node
    // claim. The role row sits at the legal-entity node, which is ABOVE the operator's terminal-node
    // membership, so the operator could only ever have seen it because the claimed node was
    // believed. The session that legitimately reaches this row is one scoped where the row lives:
    // the administrator, through a verified binding.
    //
    // The assertion is unchanged and so is its subject — the boundary removes mutation, not
    // visibility, and a legitimate tenant session still sees the row.
    const visible = await withAuthenticatedTestPrincipal(db, fixtureAdministrator(a), async (c) => {
      const q = await c.query('SELECT id FROM roles WHERE id = $1', [a.roleId]);
      return q.rowCount;
    });
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
  const grantPermission = (client: Client = adminConn, purpose = PURPOSE) =>
    call(
      'SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5)',
      [TENANT_A, a.roleId, 'identity.role.read', purpose, randomUUID()],
      client,
    );

  it('performs a valid trusted mutation and audits it atomically', async () => {
    const correlationId = randomUUID();
    const result = await call('SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7)', [
      TENANT_A,
      a.legalEntityNodeId,
      a.legalEntityId,
      `valid_${randomUUID().slice(0, 8)}`,
      'Valid',
      PURPOSE,
      correlationId,
    ]);
    expect(result.outcome, result.message ?? '').toBe('succeeded');
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

  /**
   * The denial table, rebuilt around WHO IS CONNECTED rather than what was typed.
   *
   * Four of the original eight cases named a principal the connection was not — a nonexistent
   * uuid, a colleague in another tenant, a service account, a string that was not a uuid at all —
   * and a fifth named no principal and a sixth named an agent. Under 0026 none of those can be
   * expressed, so two of them are given real authenticated forms here (a genuine cross-tenant
   * administrator; a genuine service login) and the remaining four move to the block at the end of
   * this file, which states where each property now lives and asserts it there.
   */
  const denials: [string, () => Promise<PrivilegedResult>, RegExp][] = [
    ['a missing purpose', () => grantPermission(adminConn, ''), /purpose is required/],
    [
      'a purpose that does not authorise it',
      () => grantPermission(adminConn, 'audit_export'),
      /does not authorise a change to the authorization graph/,
    ],
    [
      // Was: `p_actor => user:<tenant B's administrator>` over tenant A's connection. Now: tenant
      // B's administrator is genuinely at the keyboard, authenticated as itself, and reaches for a
      // role in tenant A. A real administrator with real authority, in the wrong tenant.
      'a genuine administrator of another tenant',
      () => grantPermission(bAdminConn),
      /is not a user of tenant/,
    ],
    [
      // Was: `p_actor => user:<a service account id>`, which the boundary caught only because that
      // uuid was absent from `users`.
      //
      // MEASURED, AND NOT WHAT I FIRST WROTE. A bound service is NOT refused here as a class:
      // `admin.authorization_refusal_reason` deliberately admits `actor_type = 'system'` when the
      // actor is on the `admin.platform_actor` allowlist, because a platform actor names no user
      // and so cannot be permission-checked against the authority tables at all (RC-E). What gates
      // it is membership of that closed set — so the honest case is a bound service that is NOT on
      // it. `system:session-binding-issuer` is exactly that: 0026 §5 binds the shared
      // `freightos_admin` credential to it and deliberately leaves it OFF the allowlist, so minting
      // session bindings confers no identity-administration authority.
      'a bound service that is not an approved provisioning identity',
      () => grantPermission(sharedConn),
      /is not an approved provisioning identity/,
    ],
    [
      // Unchanged in substance: an ordinary member of tenant A, now authenticated as itself rather
      // than named. 0018 §3's permission gate is what refuses it.
      'an authenticated member that holds no identity permission',
      () => grantPermission(operatorConn),
      /does not hold/,
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
    const result = await call('SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5)', [
      TENANT_A,
      a.roleId,
      'identity.role.read',
      PURPOSE,
      null,
    ]);
    expect(result.outcome).toBe('denied');
    expect(result.message).toMatch(/correlation id is required/);
  });

  it('denies a principal whose user is revoked after the connection was bound', async () => {
    // The strongest form of this case, and one the old `p_actor` version could not reach: the
    // operator authenticates while it is legitimate, the user is revoked underneath it, and the
    // OPEN connection is asked to act. The binding is still there; the person is not.
    const doomedUser = await withLegalContext(
      fixtureConn,
      systemContextAt(TENANT_A, a.enterpriseNodeId, a.legalEntityId, `user:${a.adminUserId}`),
      async (c) => {
        const r = await (c as Client).query<{ id: string }>(
          `INSERT INTO users
             (tenant_id, organization_node_id, legal_entity_id, authentication_provider,
              authentication_subject, display_name, status, created_by)
           VALUES ($1, $2, $3, 'oidc:example', $4, 'Doomed', 'active', 'test')
           RETURNING id`,
          [TENANT_A, a.regionNodeId, a.legalEntityId, `doomed-${randomUUID()}`],
        );
        return r.rows[0]!.id;
      },
    );
    const doomed = db.connectAsOperator(
      await db.provisionOperator('doomed', TENANT_A, doomedUser),
    );
    await doomed.connect();
    try {
      await withLegalContext(
        fixtureConn,
        systemContextAt(TENANT_A, a.enterpriseNodeId, a.legalEntityId, `user:${a.adminUserId}`),
        async (c) => {
          await (c as Client).query(
            `UPDATE users SET status = 'revoked', revoked_at = now(), revoked_by = 'test',
                              updated_by = 'test'
              WHERE id = $1`,
            [doomedUser],
          );
        },
      );
      // The refusal moved one layer UPSTREAM and changed shape, and that is asserted as what it
      // is rather than papered over. A revoked user resolves to no principal, so the connection
      // cannot act at all — it raises instead of returning `denied`. Stronger than the old
      // behaviour (which resolved the actor, then refused it) and deliberately not disguised as
      // the same thing: a denial that moved does not satisfy a test written for where it was.
      await expect(grantPermission(doomed)).rejects.toThrow(/bound to no FreightOS principal/i);

      // And nothing landed. Asserted against a role created for this case alone: `a.roleId` is
      // granted `identity.role.read` by legitimate cases elsewhere in this file, so counting rows
      // on it would have proved nothing either way.
      const target = await call('SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7)', [
        TENANT_A,
        a.legalEntityNodeId,
        a.legalEntityId,
        `revoked_probe_${randomUUID().slice(0, 8)}`,
        'Revoked probe',
        PURPOSE,
        randomUUID(),
      ]);
      await expect(
        call(
          'SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5)',
          [TENANT_A, target.payload['role_id'], 'identity.role.read', PURPOSE, randomUUID()],
          doomed,
        ),
      ).rejects.toThrow(/bound to no FreightOS principal/i);
      const landed = await fixtureConn.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM role_permissions WHERE role_id = $1`,
        [target.payload['role_id']],
      );
      expect(Number(landed.rows[0]!.n)).toBe(0);
    } finally {
      await doomed.end();
    }
  });

  it('refuses a cross-tenant target', async () => {
    const result = await call('SELECT * FROM admin.assign_membership_role($1, $2, $3, $4, $5)', [
      TENANT_A,
      b.membershipId,
      a.roleId,
      PURPOSE,
      randomUUID(),
    ]);
    expect(result.outcome).toBe('denied');
    expect(result.message).toMatch(/is not in tenant/);
  });

  it('refuses a cross-legal-entity and a cross-organization-node target', async () => {
    const crossEntity = await call('SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7)', [
      TENANT_A,
      a.legalEntityNodeId,
      b.legalEntityId,
      `cross_entity_${randomUUID().slice(0, 8)}`,
      'Cross entity',
      PURPOSE,
      randomUUID(),
    ]);
    expect(crossEntity.outcome).toBe('denied');
    expect(crossEntity.message).toMatch(/does not govern organization node/);

    const crossNode = await call('SELECT * FROM admin.grant_membership($1, $2, $3, $4, $5, $6)', [
      TENANT_A,
      a.userId,
      b.terminalNodeId,
      a.legalEntityId,
      PURPOSE,
      randomUUID(),
    ]);
    expect(crossNode.outcome).toBe('denied');
    expect(crossNode.message).toMatch(/is not in tenant/);
  });

  it('refuses a direct self-grant and an indirect one through a role the actor holds', async () => {
    // Direct: the ADMINISTRATOR adding a permission to the role it holds. The administrator is
    // used rather than the operator because 0018 §3's permission gate refuses an ordinary member
    // before the self-elevation guard runs — `denied`, correctly, but it would erase this guard's
    // coverage. The gate's own refusal is asserted separately below.
    const direct = await call('SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5)', [
      TENANT_A,
      a.adminRoleId,
      'identity.user.write',
      PURPOSE,
      randomUUID(),
    ]);
    expect(direct.outcome).toBe('failed');
    expect(direct.message).toMatch(/may not add a permission to a role it holds/);

    // And the gate itself: an ordinary member never reaches the guard at all.
    const gated = await grantPermission(operatorConn);
    expect(gated.outcome).toBe('denied');
    expect(gated.message).toMatch(/does not hold/);

    // Indirect: create a role, then assign it to yourself. Creating the role is setup, not the
    // attack, so it runs as the administrator, which genuinely holds identity.role.write. Before
    // 0018 §3 the operator could create it too — the gate had no permission argument and any
    // active member passed — and that is authority the remediation removed on purpose.
    const created = await call('SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7)', [
      TENANT_A,
      a.legalEntityNodeId,
      a.legalEntityId,
      `self_assign_${randomUUID().slice(0, 8)}`,
      'Self assign',
      PURPOSE,
      randomUUID(),
    ]);
    expect(created.outcome).toBe('succeeded');

    // The operator aiming that role at its own membership never reaches the guard: the gate
    // refuses it first, before any row is touched.
    const assignedByOperator = await call(
      'SELECT * FROM admin.assign_membership_role($1, $2, $3, $4, $5)',
      [TENANT_A, a.membershipId, created.payload['role_id'], PURPOSE, randomUUID()],
      operatorConn,
    );
    expect(assignedByOperator.outcome).toBe('denied');
    expect(assignedByOperator.message).toMatch(/does not hold/);

    // And the guard, on an actor that does pass the gate: the administrator assigning the new
    // role to its OWN membership is stopped during the mutation, not before it.
    const assigned = await call('SELECT * FROM admin.assign_membership_role($1, $2, $3, $4, $5)', [
      TENANT_A,
      a.adminMembershipId,
      created.payload['role_id'],
      PURPOSE,
      randomUUID(),
    ]);
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
      PURPOSE,
      correlationId,
    ];
    const first = await call('SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7)', params);
    expect(first.outcome, first.message ?? '').toBe('succeeded');

    const retry = await call('SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7)', [
      ...params.slice(0, 3),
      `${params[3]}_other`,
      ...params.slice(4),
    ]);
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
    const role = await call('SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7)', [
      TENANT_A,
      a.legalEntityNodeId,
      a.legalEntityId,
      `concurrent_${randomUUID().slice(0, 8)}`,
      'Concurrent',
      PURPOSE,
      randomUUID(),
    ]);
    const roleId = role.payload['role_id'];

    // Two AUTHENTICATED administrator connections, not two copies of the shared credential. The
    // race is between two sessions of the same person, which is what a retried request or two
    // browser tabs actually look like; before 0026 it could only be staged as two connections
    // typing the same name.
    const one = db.connectAsOperator(adminRole);
    const two = db.connectAsOperator(adminRole);
    await one.connect();
    await two.connect();
    try {
      const grant = (client: Client) =>
        client.query<PrivilegedResult>(
          'SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5)',
          [TENANT_A, roleId, 'identity.role.read', PURPOSE, randomUUID()],
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
    // The denial is now provoked by an unauthorised PURPOSE rather than by a fabricated actor
    // string, because a fabricated actor string is no longer an input. Same denial path, same
    // transaction semantics — only the reason it is reached has changed.
    const correlationId = randomUUID();
    await adminConn.query('BEGIN');
    const result = await call('SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5)', [
      TENANT_A,
      a.roleId,
      'identity.role.read',
      'audit_export',
      correlationId,
    ]);
    expect(result.outcome).toBe('denied');
    await adminConn.query('ROLLBACK');

    const kept = await fixtureConn.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events WHERE correlation_id = $1`,
      [correlationId],
    );
    expect(Number(kept.rows[0]!.count)).toBe(0);
  });

  it('preserves revocation and effective dating', async () => {
    const role = await call('SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7)', [
      TENANT_A,
      a.legalEntityNodeId,
      a.legalEntityId,
      `lifecycle_${randomUUID().slice(0, 8)}`,
      'Lifecycle',
      PURPOSE,
      randomUUID(),
    ]);
    const granted = await call('SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5)', [
      TENANT_A,
      role.payload['role_id'],
      'identity.role.read',
      PURPOSE,
      randomUUID(),
    ]);
    const revoked = await call('SELECT * FROM admin.revoke_role_permission($1, $2, $3, $4)', [
      TENANT_A,
      granted.payload['role_permission_id'],
      PURPOSE,
      randomUUID(),
    ]);
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

/**
 * SEC-01 / 0026 — the actor denials, at the layer they now live.
 *
 * Four cases were removed from the denial table above, and this block is the reason it was safe to
 * remove them. Each one attacked `p_actor` / `p_actor_type`, arguments that no longer exist on any
 * administrative entry point, so the attack cannot be expressed rather than being refused. The
 * property each protected is re-asserted here in the form it now takes:
 *
 *   a missing actor                 → an authenticated login bound to no principal cannot act
 *   a nonexistent user actor        → the same: an unmapped login resolves to nothing
 *   a fabricated non-uuid actor     → the same, plus the guard below, which still holds the parse
 *   an agent actor type             → the resolver returns `human` or `system` and nothing else
 *
 * The full adversarial treatment is `sr2-authenticated-principal-matrix.test.ts` cases F, G and J.
 * What is here is the authorization-boundary-shaped restatement, so a reader comparing this file
 * against the original R2-01 report can see where each property went.
 */
describe('the actor denials, at the layer they now live — SEC-01', () => {
  it('an unbound authenticated login cannot change the authorization graph', async () => {
    await expect(
      unboundConn.query('SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5)', [
        TENANT_A,
        a.roleId,
        'identity.role.read',
        PURPOSE,
        randomUUID(),
      ]),
    ).rejects.toThrow(/bound to no FreightOS principal/i);
  });

  it('no entry point accepts a caller-supplied actor at all', async () => {
    // The structural version, over every function the shared credential can reach. This is what
    // makes "a fabricated actor" and "an agent actor type" unsayable rather than merely refused.
    const r = await fixtureConn.query<{ f: string }>(
      `SELECT p.oid::regprocedure::text AS f
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'admin'
          AND has_function_privilege('freightos_admin', p.oid, 'EXECUTE')
          AND pg_get_function_arguments(p.oid) ~ '(p_actor|p_actor_type|p_issued_by)'`,
    );
    expect(r.rows.map((x) => x.f)).toEqual([]);
  });

  it('keeps the actor-shape guards in admin.authorization_refusal_reason', async () => {
    // The guards are not deleted from the database — the internal calling convention still passes
    // an actor between definers, and this is what catches an unresolved one. Unreachable by
    // `freightos_admin` (asserted above), so exercised directly as the superuser.
    const cases: [string, string, RegExp][] = [
      ['user:not-a-uuid', 'human', /must be of the form user:<uuid>/],
      [`user:${randomUUID()}`, 'human', /is not a user of tenant/],
      ['agent:dispatch', 'agent', /may not perform a privileged operation/],
      ['system:not-approved', 'system', /is not an approved provisioning identity/],
    ];
    for (const [actor, actorType, expected] of cases) {
      const r = await fixtureConn.query<{ reason: string | null }>(
        `SELECT admin.authorization_refusal_reason($1, $2, $3, $4, $5, 'identity.role.write') AS reason`,
        [actor, actorType, PURPOSE, TENANT_A, randomUUID()],
      );
      expect(r.rows[0]!.reason ?? '', `${actor} / ${actorType}`).toMatch(expected);
    }

    // The control: the administrator passes, so the four above are refusals rather than a function
    // that refuses everything.
    const ok = await fixtureConn.query<{ reason: string | null }>(
      `SELECT admin.authorization_refusal_reason($1, 'human', $2, $3, $4, 'identity.role.write') AS reason`,
      [`user:${a.adminUserId}`, PURPOSE, TENANT_A, randomUUID()],
    );
    expect(ok.rows[0]!.reason).toBeNull();
  });

  it('admits an approved platform actor, and only because it is on the allowlist — RC-E', async () => {
    // The other half of the service case, and the one that explains why a bound service is not
    // refused as a class. A platform actor names no user by construction, so it cannot be
    // permission-checked against the authority tables; what authorises it is membership of the
    // closed `admin.platform_actor` set, and nothing else.
    const approved = await call(
      'SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7)',
      [
        TENANT_A,
        a.legalEntityNodeId,
        a.legalEntityId,
        `platform_${randomUUID().slice(0, 8)}`,
        'Platform actor',
        PURPOSE,
        randomUUID(),
      ],
      provisionerConn,
    );
    expect(approved.outcome, approved.message ?? '').toBe('succeeded');

    // And the allowlist is a closed set of exactly one entry, so the authority above is narrow and
    // has to be widened deliberately rather than by adding a binding.
    const allowlist = await fixtureConn.query<{ actor_id: string }>(
      'SELECT actor_id FROM admin.platform_actor ORDER BY 1',
    );
    expect(allowlist.rows.map((x) => x.actor_id)).toEqual(['system:tenant-provisioning']);

    // `system:session-binding-issuer` — the identity 0026 §5 gives the shared credential — is
    // deliberately absent, which is what keeps minting a session binding from conferring
    // identity-administration authority.
    expect(allowlist.rows.map((x) => x.actor_id)).not.toContain('system:session-binding-issuer');
  });
});
