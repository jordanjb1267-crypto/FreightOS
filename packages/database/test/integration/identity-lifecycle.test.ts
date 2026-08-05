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
    // asSystem now acts as the seeded administrator, so the non-user case is stated directly.
    const parsed = await withLegalContext(app, adminContext('system:provisioner'), async (c) => {
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
 * F-01 — the self-elevation guards are trusted code, and cannot be stood down.
 *
 * Two escapes existed, and each defeated all three guards on its own.
 *
 * The first was visibility. The guards ran as the caller and asked `memberships` and
 * `membership_roles` whether the row concerned that caller, so row-level security answered the
 * question for them. `role_permissions_insert` is scoped by tenant alone; `memberships_read`
 * additionally requires organization-node scope. A caller standing at a node that does not contain
 * its own membership therefore got an empty result, and the guard read "no evidence" as
 * "somebody else's role" and allowed the write.
 *
 * The second was the actor id. Every guard began by returning early when app.current_user_id()
 * was NULL, and current_user_id() parses `user:<uuid>` out of a session variable the caller sets.
 * Calling yourself `system:me` switched all three off.
 */
describe('self-elevation cannot be stood down — F-01', () => {
  /** A node in a different branch of the tree, so a caller standing there sees no membership. */
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

  /** The victim acting as itself, scoped wherever the caller chooses to stand. */
  function asUserAt(context: {
    legalAuthorityClass: 'software_only' | 'carrier_agent';
    operatingContext: 'system' | 'carrier' | 'shipper_owned' | 'facility_operator';
    organizationNodeId?: string;
    legalEntityId?: string;
  }) {
    return {
      tenantId: TENANT_A,
      actorId: `user:${a.userId}`,
      legalAuthorityClass: context.legalAuthorityClass,
      operatingContext: context.operatingContext,
      ...(context.organizationNodeId === undefined
        ? {}
        : { organizationNodeId: context.organizationNodeId }),
      ...(context.legalEntityId === undefined ? {} : { legalEntityId: context.legalEntityId }),
      ...(context.operatingContext === 'carrier'
        ? { carrierId: 'carrier-1', carrierAppointmentId: 'appointment-1' }
        : {}),
    } as const;
  }

  async function addPermissionToOwnRole(context: ReturnType<typeof asUserAt>, key: string) {
    return withLegalContext(app, context, async (c) => {
      await (c as Client).query(
        `INSERT INTO role_permissions (tenant_id, role_id, permission_id, created_by)
         SELECT $1, $2, id, $3 FROM permissions WHERE key = $4`,
        [TENANT_A, a.roleId, `user:${a.userId}`, key],
      );
    });
  }

  it('confirms the caller genuinely cannot see its own membership from the blind node', async () => {
    // The precondition the whole finding rests on. If this ever stops being true the tests below
    // would pass for the wrong reason, so it is asserted rather than assumed.
    const visible = await withLegalContext(
      app,
      asUserAt({
        legalAuthorityClass: 'software_only',
        operatingContext: 'system',
        organizationNodeId: blindNodeId,
        legalEntityId: a.legalEntityId,
      }),
      async (c) => {
        const r = await c.query('SELECT 1 FROM memberships WHERE id = $1', [a.membershipId]);
        return r.rowCount;
      },
    );
    expect(visible).toBe(0);
  });

  it('refuses the widening from the blind node — the reproduction', async () => {
    // Before the fix this INSERT succeeded: the guard queried memberships as the caller, saw
    // nothing, and concluded the role belonged to someone else.
    await expect(
      addPermissionToOwnRole(
        asUserAt({
          legalAuthorityClass: 'software_only',
          operatingContext: 'system',
          organizationNodeId: blindNodeId,
          legalEntityId: a.legalEntityId,
        }),
        'identity.role.read',
      ),
    ).rejects.toThrow(/may not add a permission to a role it holds/);
  });

  it('refuses it from every operating context, with and without scope in context', async () => {
    // No legal authority class and no operating context widens node scope, so none of them can
    // change whether the membership was visible — which is precisely why the old guard failed
    // identically under all of them, and why the new one must refuse under all of them.
    const contexts = [
      { legalAuthorityClass: 'carrier_agent', operatingContext: 'carrier' },
      { legalAuthorityClass: 'software_only', operatingContext: 'shipper_owned' },
      { legalAuthorityClass: 'software_only', operatingContext: 'facility_operator' },
      { legalAuthorityClass: 'software_only', operatingContext: 'system' },
    ] as const;
    const scopes = [
      {
        label: 'blind node, with legal entity',
        organizationNodeId: blindNodeId,
        legalEntityId: a.legalEntityId,
      },
      { label: 'blind node, no legal entity', organizationNodeId: blindNodeId },
      { label: 'no node, with legal entity', legalEntityId: a.legalEntityId },
      { label: 'no node, no legal entity' },
    ];

    for (const context of contexts) {
      for (const scope of scopes) {
        // carrier and facility_operator contexts require a legal entity to be well-formed at all,
        // so the combinations that cannot be constructed are skipped rather than faked.
        if (scope.legalEntityId === undefined && context.operatingContext !== 'system') continue;
        const label = `${context.operatingContext} / ${scope.label}`;
        await expect(
          addPermissionToOwnRole(
            asUserAt({
              legalAuthorityClass: context.legalAuthorityClass,
              operatingContext: context.operatingContext,
              ...(scope.organizationNodeId === undefined
                ? {}
                : { organizationNodeId: scope.organizationNodeId }),
              ...(scope.legalEntityId === undefined ? {} : { legalEntityId: scope.legalEntityId }),
            }),
            'identity.role.read',
          ),
          label,
        ).rejects.toThrow(/may not add a permission to a role it holds|row-level security/);
      }
    }
  });

  it('refuses a membership-role grant from the blind node', async () => {
    const spare = await asSystem(async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO roles (tenant_id, organization_node_id, legal_entity_id, key, name, created_by)
         VALUES ($1, $2, $3, 'f01_spare', 'F-01 spare', 'test')
         RETURNING id`,
        [TENANT_A, a.legalEntityNodeId, a.legalEntityId],
      );
      return r.rows[0]!.id;
    });

    await expect(
      withLegalContext(
        app,
        asUserAt({
          legalAuthorityClass: 'software_only',
          operatingContext: 'system',
          organizationNodeId: blindNodeId,
          legalEntityId: a.legalEntityId,
        }),
        (c) =>
          (c as Client).query(
            `INSERT INTO membership_roles (tenant_id, membership_id, role_id, created_by)
             VALUES ($1, $2, $3, $4)`,
            [TENANT_A, a.membershipId, spare, `user:${a.userId}`],
          ),
      ),
      // `membership_roles_before_write` fires first — trigger order is alphabetical — and from the
      // blind node it cannot see the membership either. Unlike the old self-elevation guard it
      // already failed CLOSED on that: no membership means refuse, not "somebody else's". So the
      // write is refused twice over, and the message that surfaces is its integrity complaint.
    ).rejects.toThrow(/may not grant itself a role|does not exist in tenant/);
  });

  it('refuses a membership grant to itself from the blind node', async () => {
    await expect(
      withLegalContext(
        app,
        asUserAt({
          legalAuthorityClass: 'software_only',
          operatingContext: 'system',
          organizationNodeId: blindNodeId,
          legalEntityId: a.legalEntityId,
        }),
        (c) =>
          (c as Client).query(
            `INSERT INTO memberships
               (tenant_id, organization_node_id, legal_entity_id, user_id, created_by)
             VALUES ($1, $2, $3, $4, $5)`,
            [TENANT_A, a.terminalNodeId, a.legalEntityId, a.userId, `user:${a.userId}`],
          ),
      ),
    ).rejects.toThrow(/may not grant itself a membership|row-level security/);
  });

  it('refuses expanding a role the caller once held and no longer does', async () => {
    // "Any membership at all, live or revoked" — widening a role you could be reassigned to is the
    // same manoeuvre one step removed, and the guard has to see revoked rows to know that.
    await asSystem(async (c) => {
      await c.query(
        `UPDATE membership_roles SET revoked_at = now(), revoked_by = 'test' WHERE id = $1`,
        [a.membershipRoleId],
      );
    });
    try {
      await expect(
        addPermissionToOwnRole(
          asUserAt({
            legalAuthorityClass: 'software_only',
            operatingContext: 'system',
            organizationNodeId: blindNodeId,
            legalEntityId: a.legalEntityId,
          }),
          'identity.role.read',
        ),
      ).rejects.toThrow(/may not add a permission to a role it holds/);
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
    // The second escape. Every one of these used to switch all three guards off outright.
    for (const actorId of [
      'system:me',
      'integration:billing_sync',
      'agent:dispatch-agent',
      `service_account:${a.serviceAccountId}`,
      'user:not-a-uuid',
      '',
    ]) {
      await expect(
        withLegalContext(
          app,
          {
            tenantId: TENANT_A,
            actorId: actorId === '' ? 'x' : actorId,
            legalAuthorityClass: 'software_only',
            operatingContext: 'system',
            organizationNodeId: a.enterpriseNodeId,
            legalEntityId: a.legalEntityId,
          },
          (c) =>
            (c as Client).query(
              `INSERT INTO role_permissions (tenant_id, role_id, permission_id, created_by)
               SELECT $1, $2, id, 'test' FROM permissions WHERE key = 'identity.role.read'`,
              [TENANT_A, a.roleId],
            ),
        ),
        actorId,
      ).rejects.toThrow(/is not a user, and a change to who holds authority/);
    }
  });

  it('refuses a service account laundering the grant', async () => {
    // A service account is not a user, so it cannot make itself the author of an authorization
    // change and it cannot be borrowed to make one on somebody's behalf. Art. I.5.
    await expect(
      withLegalContext(
        app,
        {
          tenantId: TENANT_A,
          actorId: `integration:${a.serviceAccountId}`,
          legalAuthorityClass: 'software_only',
          operatingContext: 'system',
          organizationNodeId: a.enterpriseNodeId,
          legalEntityId: a.legalEntityId,
        },
        (c) =>
          (c as Client).query(
            `INSERT INTO membership_roles (tenant_id, membership_id, role_id, created_by)
             VALUES ($1, $2, $3, 'test')`,
            [TENANT_A, a.membershipId, a.roleId],
          ),
      ),
    ).rejects.toThrow(/is not a user, and a change to who holds authority/);
  });

  it('still lets an administrator grant authority to somebody else', async () => {
    // The guards have to keep letting real administration through, or "fails closed" just means
    // "fails". Every link is built here rather than reused, so the assertion is about the guards
    // and not about what earlier tests left behind: a fresh role, a fresh permission grant, a
    // fresh user, a fresh membership. The administrator holds none of them.
    const built = await asSystem(async (c) => {
      const role = await c.query<{ id: string }>(
        `INSERT INTO roles (tenant_id, organization_node_id, legal_entity_id, key, name, created_by)
         VALUES ($1, $2, $3, $4, 'F-01 grantable', 'test')
         RETURNING id`,
        [
          TENANT_A,
          a.legalEntityNodeId,
          a.legalEntityId,
          `f01_grantable_${randomUUID().slice(0, 8)}`,
        ],
      );
      const roleId = role.rows[0]!.id;

      await c.query(
        `INSERT INTO role_permissions (tenant_id, role_id, permission_id, created_by)
         SELECT $1, $2, id, 'test' FROM permissions WHERE key = 'identity.role.read'`,
        [TENANT_A, roleId],
      );

      const user = await c.query<{ id: string }>(
        `INSERT INTO users
           (tenant_id, organization_node_id, legal_entity_id, authentication_provider,
            authentication_subject, display_name, status, created_by)
         VALUES ($1, $2, $3, 'oidc:example', $4, 'Another Operator', 'active', 'test')
         RETURNING id`,
        [TENANT_A, a.regionNodeId, a.legalEntityId, `f01-other-${randomUUID()}`],
      );
      const userId = user.rows[0]!.id;

      const membership = await c.query<{ id: string }>(
        `INSERT INTO memberships
           (tenant_id, organization_node_id, legal_entity_id, user_id, status, created_by)
         VALUES ($1, $2, $3, $4, 'active', 'test')
         RETURNING id`,
        [TENANT_A, a.regionNodeId, a.legalEntityId, userId],
      );

      await c.query(
        `INSERT INTO membership_roles (tenant_id, membership_id, role_id, created_by)
         VALUES ($1, $2, $3, 'test')`,
        [TENANT_A, membership.rows[0]!.id, roleId],
      );

      return { userId };
    });

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
