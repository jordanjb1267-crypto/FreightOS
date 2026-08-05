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
  return systemContextAt(TENANT_A, a.enterpriseNodeId, a.legalEntityId, actorId);
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

async function asSystem<T>(work: (c: Client) => Promise<T>): Promise<T> {
  return withLegalContext(app, adminContext(), (c) => work(c as Client));
}

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  app = db.connectAs('freightos_app');
  await app.connect();
  a = await seedIdentity(app, TENANT_A);
}, 60_000);

afterAll(async () => {
  await app?.end();
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
    await expect(
      asSystem(async (c) => {
        await c.query('DELETE FROM memberships WHERE id = $1', [a.membershipId]);
      }),
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
 * Constitution Art. I.5 — no actor grants itself authority. The same rule has to hold for a human,
 * or the identity model has a hole a person can walk through.
 */
describe('self-elevation is refused', () => {
  function asSelf<T>(work: (c: Client) => Promise<T>): Promise<T> {
    return withLegalContext(app, adminContext(`user:${a.userId}`), (c) => work(c as Client));
  }

  it('parses the acting user out of the actor id', async () => {
    const parsed = await asSelf(async (c) => {
      const r = await c.query<{ id: string | null }>('SELECT app.current_user_id()::text AS id');
      return r.rows[0]!.id;
    });
    expect(parsed).toBe(a.userId);
  });

  it('returns no acting user for a system actor', async () => {
    const parsed = await asSystem(async (c) => {
      const r = await c.query<{ id: string | null }>('SELECT app.current_user_id()::text AS id');
      return r.rows[0]!.id;
    });
    expect(parsed).toBeNull();
  });

  it('refuses a user granting itself a membership', async () => {
    await expect(
      asSelf(async (c) => {
        await c.query(
          `INSERT INTO memberships
             (tenant_id, organization_node_id, legal_entity_id, user_id, created_by)
           VALUES ($1, $2, $3, $4, 'test')`,
          [TENANT_A, a.regionNodeId, a.legalEntityId, a.userId],
        );
      }),
    ).rejects.toThrow(/may not grant itself a membership/);
  });

  it('refuses a user widening its own membership', async () => {
    await expect(
      asSelf(async (c) => {
        await c.query(
          `UPDATE memberships SET effective_to = NULL, status = 'active' WHERE id = $1`,
          [a.membershipId],
        );
      }),
    ).rejects.toThrow(/may only narrow its own membership/);
  });

  it('permits a user narrowing its own membership', async () => {
    await asSelf(async (c) => {
      await c.query(`UPDATE memberships SET status = 'suspended' WHERE id = $1`, [a.membershipId]);
    });
    const status = await asSystem(async (c) => {
      const r = await c.query<{ status: string }>('SELECT status FROM memberships WHERE id = $1', [
        a.membershipId,
      ]);
      return r.rows[0]!.status;
    });
    expect(status).toBe('suspended');

    await asSystem(async (c) => {
      await c.query(`UPDATE memberships SET status = 'active' WHERE id = $1`, [a.membershipId]);
    });
  });

  it('refuses a user granting itself a role', async () => {
    const spareRole = await asSystem(async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO roles
           (tenant_id, organization_node_id, legal_entity_id, key, name, created_by)
         VALUES ($1, $2, $3, 'spare_role', 'Spare role', 'test')
         RETURNING id`,
        [TENANT_A, a.legalEntityNodeId, a.legalEntityId],
      );
      return r.rows[0]!.id;
    });

    await expect(
      asSelf(async (c) => {
        await c.query(
          `INSERT INTO membership_roles (tenant_id, membership_id, role_id, created_by)
           VALUES ($1, $2, $3, 'test')`,
          [TENANT_A, a.membershipId, spareRole],
        );
      }),
    ).rejects.toThrow(/may not grant itself a role/);
  });

  it('refuses a user adding a permission to a role it holds', async () => {
    await expect(
      asSelf(async (c) => {
        await c.query(
          `INSERT INTO role_permissions (tenant_id, role_id, permission_id, created_by)
           SELECT $1, $2, id, 'test' FROM permissions WHERE key = 'identity.role.write'`,
          [TENANT_A, a.roleId],
        );
      }),
    ).rejects.toThrow(/may not add a permission to a role it holds/);
  });

  it('permits a user revoking a permission from a role it holds', async () => {
    await asSelf(async (c) => {
      await c.query(
        `UPDATE role_permissions SET revoked_at = now(), revoked_by = 'self'
          WHERE tenant_id = $1 AND role_id = $2`,
        [TENANT_A, a.roleId],
      );
    });
    expect(await userHolds('identity.user.read')).toBe(false);
  });

  it('permits an administrator granting the same permission to another user', async () => {
    // The guard is about SELF-elevation, and blocking ordinary administration would be an
    // obstacle with no security value.
    const id = await asSystem(async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO role_permissions (tenant_id, role_id, permission_id, created_by)
         SELECT $1, $2, id, 'test:admin' FROM permissions WHERE key = 'identity.role.write'
         RETURNING id`,
        [TENANT_A, a.roleId],
      );
      return r.rows[0]!.id;
    });
    expect(id).toBeTruthy();
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
    await expect(insertCredential('not-a-uri')).rejects.toThrow(/reference_is_a_uri/);
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
