import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withLegalContext } from '../../src/session.ts';
import { TENANT_A, TestDatabase } from './harness.ts';
import { seedIdentity, systemContextAt, type IdentityFixture } from './identity-harness.ts';

/**
 * Identity, membership, role, permission and service-account lifecycles, and the self-elevation
 * guards.
 *
 * The binding property throughout: revoking any link in the chain ends the authorization. A
 * permission model in which revocation is advisory is not an access control.
 */
const db = new TestDatabase('freightos_test_identity_lifecycle');

let app: Client;
/**
 * A superuser connection used ONLY to set up and rewind fixtures — R2-01.
 *
 * The five authorization-graph tables are no longer writable by freightos_app at all: every change
 * goes through the admin boundary. This file's subject is what a permission RESOLVES to as links in
 * the chain are revoked and re-granted, not who may make those changes, and driving each rewind
 * through the boundary would make every test here about two things and prove neither well.
 *
 * The boundary itself is proved in `the authorization mutation boundary — R2-01`, which asserts
 * that this connection is the only kind that can do what the rewinds below do.
 */
let fixture: Client;
/** The administrative connection — the only way to change the authorization graph after R2-01. */
let adminConn: Client;
let a: IdentityFixture;

/**
 * The tenant administrator, holding the enterprise node and the tenant's legal entity — F-05.
 *
 * `systemContext` alone used to be enough for anything in the tenant, because system scope
 * short-circuited both scope predicates. It no longer does, so the administrator names what it
 * administers: the root of the tree, which the closure makes an ancestor of every node in it. That
 * is the authority ADR-0019's matrix intends, now expressed as scope rather than as a claim.
 *
 * Tests that are about the ABSENCE of scope still build their own narrower contexts.
 */
function adminContext(actorId?: string) {
  // Acting as the seeded administrator by default — F-05 and F-01 together. The node and the
  // legal entity are the scope; `user:<uuid>` is the person. The self-elevation guards refuse a
  // write to memberships, membership_roles or role_permissions from a session that names no user,
  // so a bootstrap actor id is no longer a way to reach them.
  return systemContextAt(
    TENANT_A,
    a.enterpriseNodeId,
    a.legalEntityId,
    actorId ?? `user:${a.adminUserId}`,
  );
}

/** Read a permission as of an explicit instant — never an implicit now(), P-20. */
async function userHolds(permission: string, asOf = 'now()'): Promise<boolean> {
  return withLegalContext(app, adminContext(), async (c) => {
    const r = await c.query<{ ok: boolean }>(
      `SELECT app.user_has_permission($1, $2, $3, ${asOf}) AS ok`,
      [TENANT_A, a.userId, permission],
    );
    return r.rows[0]!.ok;
  });
}

async function serviceAccountHolds(permission: string): Promise<boolean> {
  return withLegalContext(app, adminContext(), async (c) => {
    const r = await c.query<{ ok: boolean }>(
      'SELECT app.service_account_has_permission($1, $2, $3, now()) AS ok',
      [TENANT_A, a.serviceAccountId, permission],
    );
    return r.rows[0]!.ok;
  });
}

/**
 * Fixture setup and rewind, on the superuser connection — see the comment on `fixture`.
 *
 * The legal context is still applied, so triggers that read it (created_by, updated_by, the
 * self-elevation guards) behave as they would for the administrator this file acts as. What the
 * superuser supplies is the table privilege the application role no longer has.
 */
async function asSystem<T>(work: (c: Client) => Promise<T>): Promise<T> {
  return withLegalContext(fixture, adminContext(), (c) => work(c as Client));
}

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  app = db.connectAs('freightos_app');
  await app.connect();
  fixture = db.connectAs('postgres');
  await fixture.connect();
  adminConn = db.connectAs('freightos_admin');
  await adminConn.connect();
  a = await seedIdentity(db, TENANT_A);
}, 60_000);

afterAll(async () => {
  await app?.end();
  await fixture?.end();
  await adminConn?.end();
});

describe('the seeded chain authorizes', () => {
  it('gives the user the permission its role carries', async () => {
    expect(await userHolds('identity.user.read')).toBe(true);
  });

  it('does not give the user a permission nobody granted', async () => {
    expect(await userHolds('identity.role.write')).toBe(false);
  });

  it('gives the service account its directly granted permission', async () => {
    expect(await serviceAccountHolds('identity.user.read')).toBe(true);
  });

  it('does not give the service account the user role', async () => {
    // A service account is granted permissions directly, never through a human role — a machine
    // in a human role picks up everything that role accumulates later.
    expect(await serviceAccountHolds('identity.role.write')).toBe(false);
  });
});

describe('revocation ends authorization at every link', () => {
  async function revoke(table: string, column: string, id: string) {
    await asSystem(async (c) => {
      await c.query(
        `UPDATE ${table} SET revoked_at = now(), revoked_by = 'test:operator'
          ${table === 'role_permissions' || table === 'membership_roles' ? '' : ", status = 'revoked'"}
          WHERE ${column} = $1`,
        [id],
      );
    });
  }

  async function restore(table: string, column: string, id: string) {
    await asSystem(async (c) => {
      await c.query(
        `UPDATE ${table} SET revoked_at = NULL, revoked_by = NULL
          ${table === 'role_permissions' || table === 'membership_roles' ? '' : ", status = 'active'"}
          WHERE ${column} = $1`,
        [id],
      );
    });
  }

  const links: [string, string, () => string][] = [
    ['role_permissions', 'role_id', () => a.roleId],
    ['membership_roles', 'membership_id', () => a.membershipId],
    ['roles', 'id', () => a.roleId],
    ['memberships', 'id', () => a.membershipId],
    ['users', 'id', () => a.userId],
  ];

  for (const [table, column, id] of links) {
    it(`loses the permission when ${table} is revoked, and regains it when restored`, async () => {
      expect(await userHolds('identity.user.read')).toBe(true);
      await revoke(table, column, id());
      expect(await userHolds('identity.user.read'), table).toBe(false);
      await restore(table, column, id());
      expect(await userHolds('identity.user.read'), table).toBe(true);
    });
  }

  it('loses the permission when the user is merely suspended, not revoked', async () => {
    await asSystem(async (c) => {
      await c.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [a.userId]);
    });
    expect(await userHolds('identity.user.read')).toBe(false);
    await asSystem(async (c) => {
      await c.query(`UPDATE users SET status = 'active' WHERE id = $1`, [a.userId]);
    });
    expect(await userHolds('identity.user.read')).toBe(true);
  });

  it('loses the permission outside the membership effective window', async () => {
    await asSystem(async (c) => {
      // Back-date the whole chain first. Every link must be effective at the instant asked, so a
      // probe two days ago would otherwise fail on the user record rather than on the membership.
      await c.query(`UPDATE users SET effective_from = now() - interval '3 days' WHERE id = $1`, [
        a.userId,
      ]);
      await c.query(`UPDATE roles SET effective_from = now() - interval '3 days' WHERE id = $1`, [
        a.roleId,
      ]);
      await c.query(
        `UPDATE role_permissions SET effective_from = now() - interval '3 days'
          WHERE tenant_id = $1 AND role_id = $2`,
        [TENANT_A, a.roleId],
      );
      await c.query(
        `UPDATE membership_roles SET effective_from = now() - interval '3 days'
          WHERE tenant_id = $1 AND membership_id = $2`,
        [TENANT_A, a.membershipId],
      );
      await c.query(
        `UPDATE memberships
            SET effective_from = now() - interval '3 days',
                effective_to = now() - interval '1 day'
          WHERE id = $1`,
        [a.membershipId],
      );
    });
    expect(await userHolds('identity.user.read')).toBe(false);
    // ...and still holds when asked as of an instant inside the window. The window is a fact about
    // the record, not about when the question is asked — P-20.
    expect(await userHolds('identity.user.read', "now() - interval '2 days'")).toBe(true);

    await asSystem(async (c) => {
      await c.query(
        `UPDATE memberships SET effective_from = now() - interval '3 days', effective_to = NULL
          WHERE id = $1`,
        [a.membershipId],
      );
    });
  });

  it('loses the service-account permission when its only credential is revoked', async () => {
    expect(await serviceAccountHolds('identity.user.read')).toBe(true);
    await asSystem(async (c) => {
      await c.query(
        `UPDATE service_account_credentials
            SET status = 'revoked', revoked_at = now(), revoked_by = 'test:operator'
          WHERE id = $1`,
        [a.serviceAccountCredentialId],
      );
    });
    // The permission grant is untouched; the account simply has nothing to authenticate with.
    expect(await serviceAccountHolds('identity.user.read')).toBe(false);
  });

  it('regains it after a rotation issues a new credential', async () => {
    await asSystem(async (c) => {
      await c.query(
        `INSERT INTO service_account_credentials
           (tenant_id, service_account_id, credential_type, credential_reference, status,
            created_by)
         VALUES ($1, $2, 'external_secret_reference', $3, 'active', 'test:rotation')`,
        [TENANT_A, a.serviceAccountId, `secretsmanager://freightos/${TENANT_A}/rotated`],
      );
    });
    expect(await serviceAccountHolds('identity.user.read')).toBe(true);
  });

  it('loses everything when the service account itself is revoked', async () => {
    await asSystem(async (c) => {
      await c.query(
        `UPDATE service_accounts
            SET status = 'revoked', revoked_at = now(), revoked_by = 'test:operator'
          WHERE id = $1`,
        [a.serviceAccountId],
      );
    });
    expect(await serviceAccountHolds('identity.user.read')).toBe(false);
  });
});

describe('effective dating is recorded rather than deleted', () => {
  it('keeps a revoked membership row instead of removing it', async () => {
    const rows = await asSystem(async (c) => {
      const r = await c.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM memberships WHERE id = $1',
        [a.membershipId],
      );
      return Number(r.rows[0]!.count);
    });
    expect(rows).toBe(1);
  });

  it('denies the application role DELETE on memberships', async () => {
    // Stated against freightos_app rather than the fixture connection: memberships are archived and
    // revoked, never deleted, and after R2-01 the application role holds no write on them at all.
    await expect(
      withLegalContext(app, adminContext(), (c) =>
        (c as Client).query('DELETE FROM memberships WHERE id = $1', [a.membershipId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rejects an inconsistent revocation — timestamp without an author', async () => {
    await expect(
      asSystem(async (c) => {
        await c.query('UPDATE users SET revoked_at = now() WHERE id = $1', [a.userId]);
      }),
    ).rejects.toThrow(/revocation_consistency|revoked_status/);
  });

  it('rejects a revoked status with no revocation timestamp', async () => {
    await expect(
      asSystem(async (c) => {
        await c.query(`UPDATE users SET status = 'revoked' WHERE id = $1`, [a.userId]);
      }),
    ).rejects.toThrow(/revoked_status/);
  });

  it('rejects an effective window that closes before it opens', async () => {
    await expect(
      asSystem(async (c) => {
        await c.query(
          `UPDATE roles SET effective_to = effective_from - interval '1 day' WHERE id = $1`,
          [a.roleId],
        );
      }),
    ).rejects.toThrow(/effective_window/);
  });

  it('permits only one active membership per user and node', async () => {
    await expect(
      asSystem(async (c) => {
        await c.query(
          `INSERT INTO memberships
             (tenant_id, organization_node_id, legal_entity_id, user_id, created_by)
           VALUES ($1, $2, $3, $4, 'test')`,
          [TENANT_A, a.terminalNodeId, a.legalEntityId, a.userId],
        );
      }),
    ).rejects.toThrow(/one_active_per_user_node/);
  });
});

describe('membership roles must be governed by the membership node', () => {
  it('rejects a role scoped to a node the membership does not sit under', async () => {
    const siblingRole = await asSystem(async (c) => {
      const bu = randomUUID();
      await c.query(
        `INSERT INTO organization_nodes
           (id, tenant_id, organization_node_id, parent_id, node_type, name, created_by)
         VALUES ($1, $2, $1, $3, 'business_unit', 'Sibling BU', 'test')`,
        [bu, TENANT_A, a.legalEntityNodeId],
      );
      const r = await c.query<{ id: string }>(
        `INSERT INTO roles
           (tenant_id, organization_node_id, legal_entity_id, key, name, created_by)
         VALUES ($1, $2, $3, 'sibling_role', 'Sibling role', 'test')
         RETURNING id`,
        [TENANT_A, bu, a.legalEntityId],
      );
      return r.rows[0]!.id;
    });

    await expect(
      asSystem(async (c) => {
        await c.query(
          `INSERT INTO membership_roles (tenant_id, membership_id, role_id, created_by)
           VALUES ($1, $2, $3, 'test')`,
          [TENANT_A, a.membershipId, siblingRole],
        );
      }),
    ).rejects.toThrow(/does not govern membership node/);
  });

  it('accepts a role scoped at or above the membership node', async () => {
    const id = await asSystem(async (c) => {
      const role = await c.query<{ id: string }>(
        `INSERT INTO roles
           (tenant_id, organization_node_id, legal_entity_id, key, name, created_by)
         VALUES ($1, $2, $3, 'region_role', 'Region role', 'test')
         RETURNING id`,
        [TENANT_A, a.regionNodeId, a.legalEntityId],
      );
      const r = await c.query<{ id: string }>(
        `INSERT INTO membership_roles (tenant_id, membership_id, role_id, created_by)
         VALUES ($1, $2, $3, 'test')
         RETURNING id`,
        [TENANT_A, a.membershipId, role.rows[0]!.id],
      );
      return r.rows[0]!.id;
    });
    expect(id).toBeTruthy();
  });
});

/**
 * A privileged call over the administrative connection, returned rather than unwrapped.
 *
 * After R2-01 an authorization-graph mutation cannot be attempted directly at all, so the
 * self-elevation guards are reached the only way anything reaches them now: through the boundary,
 * with the actor the boundary verified. That is the interesting case — the guards are what stop an
 * ADMINISTRATOR widening its own authority through a path it is otherwise entitled to use.
 */
async function boundary(sql: string, params: readonly unknown[]) {
  const r = await adminConn.query<{ outcome: string; message: string | null }>(sql, [...params]);
  return r.rows[0]!;
}

const AS_ADMIN = ['human', 'identity_administration'] as const;

/**
 * Constitution Art. I.5 — no actor grants itself authority. The same rule has to hold for a human,
 * or the identity model has a hole a person can walk through.
 */
describe('self-elevation is refused', () => {
  /**
   * The guards are reached through the boundary now — R2-01.
   *
   * A tenant session cannot attempt any of this at all: the first two tests here say so directly.
   * What remains interesting is an ADMINISTRATOR using the path it IS entitled to use, naming
   * itself. The boundary verifies the actor and publishes it, and 0010's guards then refuse — so
   * "who is acting" is no longer something the attempt gets to assert.
   */
  it('refuses a tenant session the attempt entirely', async () => {
    for (const [table, sql, params] of [
      [
        'memberships',
        `INSERT INTO memberships (tenant_id, organization_node_id, legal_entity_id, user_id,
           created_by) VALUES ($1, $2, $3, $4, 'test')`,
        [TENANT_A, a.regionNodeId, a.legalEntityId, a.userId],
      ],
      [
        'membership_roles',
        `INSERT INTO membership_roles (tenant_id, membership_id, role_id, created_by)
         VALUES ($1, $2, $3, 'test')`,
        [TENANT_A, a.membershipId, a.roleId],
      ],
      [
        'role_permissions',
        `INSERT INTO role_permissions (tenant_id, role_id, permission_id, created_by)
         SELECT $1, $2, id, 'test' FROM permissions WHERE key = 'identity.role.write'`,
        [TENANT_A, a.roleId],
      ],
    ] as const) {
      await expect(
        withLegalContext(app, adminContext(`user:${a.userId}`), (c) =>
          (c as Client).query(sql, [...params]),
        ),
        table,
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('parses the acting user out of the actor id', async () => {
    const parsed = await withLegalContext(app, adminContext(`user:${a.userId}`), async (c) => {
      const r = await c.query<{ id: string | null }>('SELECT app.current_user_id()::text AS id');
      return r.rows[0]!.id;
    });
    expect(parsed).toBe(a.userId);
  });

  it('returns no acting user for a system actor', async () => {
    const parsed = await withLegalContext(app, adminContext('system:provisioner'), async (c) => {
      const r = await c.query<{ id: string | null }>('SELECT app.current_user_id()::text AS id');
      return r.rows[0]!.id;
    });
    expect(parsed).toBeNull();
  });

  it('refuses an administrator granting itself a membership', async () => {
    const result = await boundary(
      'SELECT * FROM admin.grant_membership($1, $2, $3, $4, $5, $6, $7, $8)',
      [
        TENANT_A,
        a.adminUserId,
        a.legalEntityNodeId,
        a.legalEntityId,
        `user:${a.adminUserId}`,
        ...AS_ADMIN,
        randomUUID(),
      ],
    );
    expect(result.outcome).toBe('failed');
    expect(result.message).toMatch(/may not grant itself a membership/);
  });

  it('refuses an administrator widening its own membership', async () => {
    // The administrator needs a membership to widen, granted by somebody else first.
    // Granted BY the operator, not by the administrator: a self-granted membership is refused, which
    // is the next test's subject and would make this one fail for the wrong reason.
    const membershipId = await withLegalContext(
      fixture,
      adminContext(`user:${a.userId}`),
      async (c) => {
        const r = await (c as Client).query<{ id: string }>(
          `INSERT INTO memberships
             (tenant_id, organization_node_id, legal_entity_id, user_id, status, created_by)
           VALUES ($1, $2, $3, $4, 'suspended', 'test')
           RETURNING id`,
          [TENANT_A, a.legalEntityNodeId, a.legalEntityId, a.adminUserId],
        );
        return r.rows[0]!.id;
      },
    );

    const result = await boundary(
      'SELECT * FROM admin.set_membership_status($1, $2, $3, $4, $5, $6, $7)',
      [TENANT_A, membershipId, 'active', `user:${a.adminUserId}`, ...AS_ADMIN, randomUUID()],
    );
    expect(result.outcome).toBe('failed');
    expect(result.message).toMatch(/may only narrow its own membership/);

    // And narrowing its own membership is still allowed, which is the distinction the guard draws.
    const narrowing = await boundary(
      'SELECT * FROM admin.revoke_membership($1, $2, $3, $4, $5, $6)',
      [TENANT_A, membershipId, `user:${a.adminUserId}`, ...AS_ADMIN, randomUUID()],
    );
    expect(narrowing.outcome).toBe('succeeded');
  });

  it('refuses an administrator granting itself a role', async () => {
    const membershipId = await withLegalContext(
      fixture,
      adminContext(`user:${a.userId}`),
      async (c) => {
        const r = await (c as Client).query<{ id: string }>(
          `INSERT INTO memberships
             (tenant_id, organization_node_id, legal_entity_id, user_id, status, created_by)
           VALUES ($1, $2, $3, $4, 'active', 'test')
           RETURNING id`,
          [TENANT_A, a.regionNodeId, a.legalEntityId, a.adminUserId],
        );
        return r.rows[0]!.id;
      },
    );

    const result = await boundary(
      'SELECT * FROM admin.assign_membership_role($1, $2, $3, $4, $5, $6, $7)',
      [TENANT_A, membershipId, a.roleId, `user:${a.adminUserId}`, ...AS_ADMIN, randomUUID()],
    );
    expect(result.outcome).toBe('failed');
    expect(result.message).toMatch(/may not grant itself a role/);

    await asSystem(async (c) => {
      await c.query(
        `UPDATE memberships SET revoked_at = now(), revoked_by = 'test', status = 'revoked'
          WHERE id = $1`,
        [membershipId],
      );
    });
  });

  it('refuses an administrator adding a permission to a role it holds', async () => {
    // The administrator holds adminRoleId and genuinely holds identity.role.write, so the 0018 §3
    // permission gate passes and the 0010 self-elevation guard is what stops it — DURING the
    // mutation, which is why this stays `failed` rather than becoming `denied`.
    //
    // Naming an actor that does not hold the permission would test the gate instead and lose this
    // guard's coverage entirely; that case is the separate `denied` test below.
    const result = await boundary(
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
    expect(result.outcome).toBe('failed');
    expect(result.message).toMatch(/may not add a permission to a role it holds/);
  });

  it('denies — not fails — an actor that never held the permission', async () => {
    // The distinction is part of the audit contract: `denied` means authorization refused before
    // the consequential operation was attempted; `failed` means it was authorized and the
    // operation itself failed. An ordinary member holds no identity.role.write, so the request
    // never reaches the mutation.
    const result = await boundary(
      'SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5, $6, $7)',
      [TENANT_A, a.roleId, 'identity.role.write', `user:${a.userId}`, ...AS_ADMIN, randomUUID()],
    );
    expect(result.outcome).toBe('denied');
    expect(result.message).toMatch(/does not hold/);
  });

  it('permits an administrator granting the same permission to somebody else', async () => {
    const role = await adminConn.query<{ payload: Record<string, unknown> }>(
      'SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [
        TENANT_A,
        a.legalEntityNodeId,
        a.legalEntityId,
        `granted_elsewhere_${randomUUID().slice(0, 8)}`,
        'Granted elsewhere',
        `user:${a.adminUserId}`,
        ...AS_ADMIN,
        randomUUID(),
      ],
    );
    const roleId = role.rows[0]!.payload['role_id'] as string;

    const result = await boundary(
      'SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5, $6, $7)',
      [TENANT_A, roleId, 'identity.role.write', `user:${a.adminUserId}`, ...AS_ADMIN, randomUUID()],
    );
    expect(result.outcome).toBe('succeeded');
  });
});

describe('credential references never hold secret material', () => {
  async function insertCredential(reference: string, type = 'external_secret_reference') {
    return asSystem(async (c) => {
      await c.query(
        `INSERT INTO service_account_credentials
           (tenant_id, service_account_id, credential_type, credential_reference, created_by)
         VALUES ($1, $2, $3, $4, 'test')`,
        [TENANT_A, a.serviceAccountId, type, reference],
      );
    });
  }

  it('accepts a URI locating the credential', async () => {
    await expect(insertCredential(`vault://freightos/${randomUUID()}`)).resolves.toBeUndefined();
  });

  it('refuses a bare string that is not a URI', async () => {
    await expect(insertCredential('not-a-uri')).rejects.toThrow(/reference_scheme/);
  });

  /**
   * F-10. The constraint was a URI SHAPE plus a denylist of markers, so it admitted every value it
   * exists to refuse: `data:;base64,…` is a URI, `basic:dXNlcjpwYXNzd29yZA==` is a URI, and
   * `postgres://user:hunter2@db` is a URI carrying a live password. It is an allowlist of schemes
   * now, per credential type, so anything not named is refused by default rather than by omission.
   */
  it('refuses a URI whose scheme can carry the secret inline', async () => {
    for (const inline of [
      'data:;base64,c2VjcmV0',
      'basic:dXNlcjpwYXNzd29yZA==',
      'http://example.test/token/abc',
      'jdbc:postgresql://db/freightos',
      'file:///etc/freightos/credential',
    ]) {
      await expect(insertCredential(inline), inline).rejects.toThrow(/reference_scheme/);
    }
  });

  it('refuses userinfo even under an allowed scheme', async () => {
    // `scheme://user:secret@host` passes any scheme allowlist by construction.
    await expect(
      insertCredential('vault://operator:hunter2@vault.internal/freightos'),
    ).rejects.toThrow(/reference_has_no_userinfo/);
  });

  it('keeps each credential type to the schemes that make sense for it', async () => {
    // A secret-store locator is not an identity, and an identity is not a secret-store locator.
    await expect(
      insertCredential('oidc://idp.example/subject/abc', 'external_secret_reference'),
    ).rejects.toThrow(/reference_scheme/);
    await expect(insertCredential('vault://x/y', 'provider_subject')).rejects.toThrow(
      /reference_scheme/,
    );
  });

  // Each fixture carries the marker its rule looks for and stops there. A realistic-looking value
  // in a test file is indistinguishable from a leaked one to a secret scanner, and the assertion
  // does not need the extra characters.
  for (const shape of [
    'authorization:Bearer x',
    'pem:-----BEGIN RSA PRIVATE KEY-----',
    'stripe:sk_live_x',
    'github:ghp_x',
    'slack:xoxb-x',
  ]) {
    it(`refuses ${shape.split(':')[0]}-shaped secret material`, async () => {
      // Either constraint refusing is the correct outcome: a token carrying whitespace fails the
      // URI shape first, and one that does not fails the secret-marker check. The property being
      // proved is that no such value is storable, not which line of defence catches it.
      await expect(insertCredential(shape)).rejects.toThrow(
        /reference_is_not_a_secret|reference_is_a_uri/,
      );
    });
  }

  it('requires a digest for the hash_reference type', async () => {
    await expect(
      insertCredential(`hash://freightos/${randomUUID()}`, 'hash_reference'),
    ).rejects.toThrow(/hash_matches_type/);
  });

  it('refuses a raw secret in the hash column', async () => {
    await expect(
      asSystem(async (c) => {
        await c.query(
          `INSERT INTO service_account_credentials
             (tenant_id, service_account_id, credential_type, credential_reference,
              credential_hash, created_by)
           VALUES ($1, $2, 'hash_reference', $3, 'not-a-digest', 'test')`,
          [TENANT_A, a.serviceAccountId, `hash://freightos/${randomUUID()}`],
        );
      }),
    ).rejects.toThrow(/hash_shape/);
  });

  it('accepts an algorithm-prefixed digest', async () => {
    await expect(
      asSystem(async (c) => {
        await c.query(
          `INSERT INTO service_account_credentials
             (tenant_id, service_account_id, credential_type, credential_reference,
              credential_hash, created_by)
           VALUES ($1, $2, 'hash_reference', $3, $4, 'test')`,
          [
            TENANT_A,
            a.serviceAccountId,
            `hash://freightos/${randomUUID()}`,
            `sha256:${'a'.repeat(64)}`,
          ],
        );
      }),
    ).resolves.toBeUndefined();
  });

  it('refuses a human actor type on a service account', async () => {
    await expect(
      asSystem(async (c) => {
        await c.query(
          `INSERT INTO service_accounts
             (tenant_id, organization_node_id, legal_entity_id, key, name, actor_type, created_by)
           VALUES ($1, $2, $3, 'pretend_human', 'Pretend human', 'human', 'test')`,
          [TENANT_A, a.regionNodeId, a.legalEntityId],
        );
      }),
    ).rejects.toThrow(/actor_type_check/);
  });
});

describe('the authentication subject is a reference, not a credential', () => {
  it('refuses a subject that looks like a bearer token', async () => {
    await expect(
      asSystem(async (c) => {
        await c.query(
          `INSERT INTO users
             (tenant_id, organization_node_id, legal_entity_id, authentication_provider,
              authentication_subject, display_name, created_by)
           VALUES ($1, $2, $3, 'oidc:example', 'Bearer eyJhbGciOiJIUzI1NiJ9', 'Leaky', 'test')`,
          [TENANT_A, a.regionNodeId, a.legalEntityId],
        );
      }),
    ).rejects.toThrow(/subject_is_not_a_credential/);
  });

  it('keeps a subject unique per provider within a tenant', async () => {
    await expect(
      asSystem(async (c) => {
        await c.query(
          `INSERT INTO users
             (tenant_id, organization_node_id, legal_entity_id, authentication_provider,
              authentication_subject, display_name, created_by)
           VALUES ($1, $2, $3, 'oidc:example', $4, 'Duplicate', 'test')`,
          [TENANT_A, a.regionNodeId, a.legalEntityId, `subject-${TENANT_A}`],
        );
      }),
    ).rejects.toThrow(/users_subject_unique/);
  });

  it('permits the same subject string under a different provider', async () => {
    await expect(
      asSystem(async (c) => {
        await c.query(
          `INSERT INTO users
             (tenant_id, organization_node_id, legal_entity_id, authentication_provider,
              authentication_subject, display_name, created_by)
           VALUES ($1, $2, $3, 'saml:other', $4, 'Other provider', 'test')`,
          [TENANT_A, a.regionNodeId, a.legalEntityId, `subject-${TENANT_A}`],
        );
      }),
    ).resolves.toBeUndefined();
  });
});

/**
 * F-01, superseded in reach by R2-01 — the self-elevation guards, and the boundary in front of them.
 *
 * F-01's reproduction stood a tenant session at an organization node that did not contain its own
 * membership, so the guard's RLS-filtered evidence query came back empty and read as "not about
 * me". The guards were made trusted, which fixed the evidence.
 *
 * R2-01 then found the layer above: the guard still asked app.actor_id who was acting, and that is
 * a session variable. Naming a fabricated or borrowed user made the guard compare the row against
 * somebody else, and it stood down for the same reason it had before.
 *
 * The blind-node reproduction is no longer constructible, because a tenant session cannot attempt
 * any of these writes at all. What replaces it is the stronger statement: not "the guard sees the
 * evidence now" but "the attempt does not reach the guard, and when a legitimate administrator
 * makes the same attempt through the boundary, the guard still refuses it".
 */
describe('self-elevation cannot be stood down — F-01, R2-01', () => {
  /** A node in a different branch — the position the original reproduction was made from. */
  let blindNodeId: string;

  beforeAll(async () => {
    blindNodeId = await asSystem(async (c) => {
      const id = randomUUID();
      await c.query(
        `INSERT INTO organization_nodes
           (id, tenant_id, organization_node_id, parent_id, node_type, name, created_by)
         VALUES ($1, $2, $1, $3, 'region', 'Blind Spot', 'test')`,
        [id, TENANT_A, a.enterpriseNodeId],
      );
      return id;
    });
  }, 30_000);

  function contextAt(
    legalAuthorityClass: 'software_only' | 'carrier_agent',
    operatingContext: 'system' | 'carrier' | 'shipper_owned' | 'facility_operator',
    organizationNodeId?: string,
    legalEntityId?: string,
    actorId = `user:${a.userId}`,
  ) {
    return {
      tenantId: TENANT_A,
      actorId,
      legalAuthorityClass,
      operatingContext,
      ...(organizationNodeId === undefined ? {} : { organizationNodeId }),
      ...(legalEntityId === undefined ? {} : { legalEntityId }),
      ...(operatingContext === 'carrier'
        ? { carrierId: 'carrier-1', carrierAppointmentId: 'appointment-1' }
        : {}),
    } as const;
  }

  const widenOwnRole = (context: ReturnType<typeof contextAt>) =>
    withLegalContext(app, context, (c) =>
      (c as Client).query(
        `INSERT INTO role_permissions (tenant_id, role_id, permission_id, created_by)
         SELECT $1, $2, id, 'test' FROM permissions WHERE key = 'identity.role.write'`,
        [TENANT_A, a.roleId],
      ),
    );

  it('confirms the caller still cannot see its own membership from the blind node', async () => {
    // The precondition the original finding rested on, kept because it is what made the guard's
    // evidence query empty. It is no longer load-bearing, and asserting it says so.
    const visible = await withLegalContext(
      app,
      contextAt('software_only', 'system', blindNodeId, a.legalEntityId),
      async (c) => {
        const r = await c.query('SELECT 1 FROM memberships WHERE id = $1', [a.membershipId]);
        return r.rowCount;
      },
    );
    expect(visible).toBe(0);
  });

  it('refuses the widening from the blind node before any guard is consulted', async () => {
    await expect(
      widenOwnRole(contextAt('software_only', 'system', blindNodeId, a.legalEntityId)),
    ).rejects.toThrow(/permission denied/i);
  });

  it('refuses it from every operating context, with and without scope in context', async () => {
    // No legal authority class, operating context, node or legal entity changes the answer, and now
    // none of them can: the refusal is a missing table privilege, which no session state affects.
    const contexts = [
      ['carrier_agent', 'carrier'],
      ['software_only', 'shipper_owned'],
      ['software_only', 'facility_operator'],
      ['software_only', 'system'],
    ] as const;
    const scopes = [
      { label: 'blind node, with legal entity', node: blindNodeId, legal: a.legalEntityId },
      { label: 'blind node, no legal entity', node: blindNodeId, legal: undefined },
      { label: 'no node, with legal entity', node: undefined, legal: a.legalEntityId },
      { label: 'no node, no legal entity', node: undefined, legal: undefined },
    ];

    for (const [authority, operating] of contexts) {
      for (const scope of scopes) {
        // carrier and facility_operator contexts are not well-formed without a legal entity, so
        // the combinations that cannot be constructed are skipped rather than faked.
        if (scope.legal === undefined && operating !== 'system') continue;
        await expect(
          widenOwnRole(contextAt(authority, operating, scope.node, scope.legal)),
          `${operating} / ${scope.label}`,
        ).rejects.toThrow(/permission denied/i);
      }
    }
  });

  it('refuses a membership-role grant and a self-granted membership the same way', async () => {
    await expect(
      withLegalContext(
        app,
        contextAt('software_only', 'system', blindNodeId, a.legalEntityId),
        (c) =>
          (c as Client).query(
            `INSERT INTO membership_roles (tenant_id, membership_id, role_id, created_by)
           VALUES ($1, $2, $3, 'test')`,
            [TENANT_A, a.membershipId, a.roleId],
          ),
      ),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      withLegalContext(
        app,
        contextAt('software_only', 'system', blindNodeId, a.legalEntityId),
        (c) =>
          (c as Client).query(
            `INSERT INTO memberships
             (tenant_id, organization_node_id, legal_entity_id, user_id, created_by)
           VALUES ($1, $2, $3, $4, 'test')`,
            [TENANT_A, a.terminalNodeId, a.legalEntityId, a.userId],
          ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('refuses expanding a role the actor once held and no longer does', async () => {
    // "Any membership at all, live or revoked" — widening a role you could be reassigned to is the
    // same manoeuvre one step removed, and the guard has to see revoked rows to know that. Reached
    // through the boundary, since that is now the only way to reach it.
    await asSystem(async (c) => {
      await c.query(
        `UPDATE membership_roles SET revoked_at = now(), revoked_by = 'test' WHERE id = $1`,
        [a.membershipRoleId],
      );
    });
    try {
      const result = await boundary(
        'SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5, $6, $7)',
        [TENANT_A, a.roleId, 'identity.role.write', `user:${a.userId}`, ...AS_ADMIN, randomUUID()],
      );
      expect(result.outcome).toBe('failed');
      expect(result.message).toMatch(/may not add a permission to a role it holds/);
    } finally {
      await asSystem(async (c) => {
        await c.query(
          `UPDATE membership_roles SET revoked_at = NULL, revoked_by = NULL WHERE id = $1`,
          [a.membershipRoleId],
        );
      });
    }
  });

  it('refuses an unattributed change however the session names itself', async () => {
    // Both halves at once. A tenant session cannot reach the table whatever it calls itself, and
    // the boundary refuses the same actor ids outright rather than recording an unattributable
    // change — so neither layer depends on the other to hold.
    for (const actorId of ['system:me', 'integration:billing_sync', 'agent:dispatch-agent', 'x']) {
      await expect(
        widenOwnRole(
          contextAt('software_only', 'system', a.enterpriseNodeId, a.legalEntityId, actorId),
        ),
        `direct: ${actorId}`,
      ).rejects.toThrow(/permission denied/i);

      const result = await boundary(
        'SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5, $6, $7)',
        [
          TENANT_A,
          a.roleId,
          'identity.role.write',
          actorId,
          'human',
          'identity_administration',
          randomUUID(),
        ],
      );
      expect(result.outcome, `boundary: ${actorId}`).toBe('denied');
      expect(result.message, `boundary: ${actorId}`).toMatch(
        /must be of the form user:<uuid>|is not a user of tenant/,
      );
    }
  });

  it('refuses a service account impersonating a user', async () => {
    // A service account is not a user and cannot become one by being named like one. Art. I.5.
    const result = await boundary(
      'SELECT * FROM admin.assign_membership_role($1, $2, $3, $4, $5, $6, $7)',
      [TENANT_A, a.membershipId, a.roleId, `user:${a.serviceAccountId}`, ...AS_ADMIN, randomUUID()],
    );
    expect(result.outcome).toBe('denied');
    expect(result.message).toMatch(/is not a user of tenant/);

    // And an integration actor_type is refused before the actor is even looked at.
    const asIntegration = await boundary(
      'SELECT * FROM admin.assign_membership_role($1, $2, $3, $4, $5, $6, $7)',
      [
        TENANT_A,
        a.membershipId,
        a.roleId,
        `integration:${a.serviceAccountId}`,
        'integration',
        'identity_administration',
        randomUUID(),
      ],
    );
    expect(asIntegration.outcome).toBe('denied');
    expect(asIntegration.message).toMatch(/may not perform a privileged operation/);
  });

  it('still lets an administrator grant authority to somebody else', async () => {
    const built = await asSystem(async (c) => {
      const user = await c.query<{ id: string }>(
        `INSERT INTO users
           (tenant_id, organization_node_id, legal_entity_id, authentication_provider,
            authentication_subject, display_name, status, created_by)
         VALUES ($1, $2, $3, 'oidc:example', $4, 'Another Operator', 'active', 'test')
         RETURNING id`,
        [TENANT_A, a.regionNodeId, a.legalEntityId, `f01-other-${randomUUID()}`],
      );
      return { userId: user.rows[0]!.id };
    });

    const actor = `user:${a.adminUserId}`;
    const role = await adminConn.query<{ payload: Record<string, unknown>; outcome: string }>(
      'SELECT * FROM admin.create_role($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [
        TENANT_A,
        a.legalEntityNodeId,
        a.legalEntityId,
        `f01_grantable_${randomUUID().slice(0, 8)}`,
        'F-01 grantable',
        actor,
        ...AS_ADMIN,
        randomUUID(),
      ],
    );
    expect(role.rows[0]!.outcome).toBe('succeeded');
    const roleId = role.rows[0]!.payload['role_id'] as string;

    expect(
      (
        await boundary('SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5, $6, $7)', [
          TENANT_A,
          roleId,
          'identity.role.read',
          actor,
          ...AS_ADMIN,
          randomUUID(),
        ])
      ).outcome,
    ).toBe('succeeded');

    const membership = await adminConn.query<{ payload: Record<string, unknown> }>(
      'SELECT * FROM admin.grant_membership($1, $2, $3, $4, $5, $6, $7, $8)',
      [TENANT_A, built.userId, a.regionNodeId, a.legalEntityId, actor, ...AS_ADMIN, randomUUID()],
    );
    expect(
      (
        await boundary('SELECT * FROM admin.assign_membership_role($1, $2, $3, $4, $5, $6, $7)', [
          TENANT_A,
          membership.rows[0]!.payload['membership_id'],
          roleId,
          actor,
          ...AS_ADMIN,
          randomUUID(),
        ])
      ).outcome,
    ).toBe('succeeded');

    const holds = await withLegalContext(app, adminContext(), async (c) => {
      const r = await c.query<{ ok: boolean }>(
        'SELECT app.user_has_permission($1, $2, $3, now()) AS ok',
        [TENANT_A, built.userId, 'identity.role.read'],
      );
      return r.rows[0]!.ok;
    });
    expect(holds).toBe(true);
  });

  it('keeps the guards owned by a non-login definer with a pinned search path', async () => {
    // The structural half of the fix, asserted where a reviewer will see it fail. A guard that
    // reverted to running as its caller would restore the first escape exactly, and nothing else
    // about the database would look different.
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      const r = await admin.query<{
        proname: string;
        prosecdef: boolean;
        owner: string;
        canlogin: boolean;
        proconfig: string[] | null;
      }>(
        `SELECT p.proname, p.prosecdef, o.rolname AS owner, o.rolcanlogin AS canlogin, p.proconfig
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           JOIN pg_roles o ON o.oid = p.proowner
          WHERE n.nspname = 'app' AND p.proname LIKE 'reject_%self_elevation'
          ORDER BY p.proname`,
      );
      expect(r.rows).toHaveLength(3);
      for (const fn of r.rows) {
        expect(fn.prosecdef, `${fn.proname} SECURITY DEFINER`).toBe(true);
        expect(fn.owner, `${fn.proname} owner`).toBe('freightos_identity_guard');
        expect(fn.canlogin, `${fn.proname} owner can log in`).toBe(false);
        expect(fn.proconfig, `${fn.proname} search_path`).toContain(
          'search_path=pg_catalog, public',
        );
      }

      // And the definer's whole reach: three tables, SELECT only, nothing writable anywhere.
      const grants = await admin.query<{ table_name: string; privilege_type: string }>(
        `SELECT table_name, privilege_type FROM information_schema.table_privileges
          WHERE grantee = 'freightos_identity_guard' ORDER BY table_name, privilege_type`,
      );
      expect(grants.rows).toEqual([
        { table_name: 'membership_roles', privilege_type: 'SELECT' },
        { table_name: 'memberships', privilege_type: 'SELECT' },
        { table_name: 'organization_node_closure', privilege_type: 'SELECT' },
      ]);
    } finally {
      await admin.end();
    }
  });
});
