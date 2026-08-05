import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MAX_ORGANIZATION_DEPTH,
  ORGANIZATION_NODE_TYPES,
  isPermittedNodeParent,
} from '@freightos/identity';
import { withLegalContext } from '../../src/session.ts';
import { TENANT_A, TENANT_B, TestDatabase } from './harness.ts';
import { seedIdentity, systemContextAt, type IdentityFixture } from './identity-harness.ts';

/**
 * Four-level hierarchy traversal, closure maintenance, cycle and depth rejection, and policy
 * inheritance — risk P-18 and `04_ENTERPRISE_SCALE_AND_TENANCY:18-22`.
 */
const db = new TestDatabase('freightos_test_org_hierarchy');

let app: Client;
let admin: Client;
let a: IdentityFixture;
/** The node at exactly MAX_ORGANIZATION_DEPTH, built by the depth-bound test below. */
let deepNodeId: string;

async function addNode(
  client: Client,
  parentId: string | null,
  nodeType: string,
  name: string,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO organization_nodes
       (id, tenant_id, organization_node_id, parent_id, node_type, name, created_by)
     VALUES ($1, $2, $1, $3, $4, $5, 'test')`,
    [id, TENANT_A, parentId, nodeType, name],
  );
  return id;
}

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  app = db.connectAs('freightos_app');
  await app.connect();
  admin = db.connectAs('postgres');
  await admin.connect();
  a = await seedIdentity(app, TENANT_A);
}, 60_000);

afterAll(async () => {
  await app?.end();
  await admin?.end();
});

/**
 * The tenant administrator, holding the enterprise node and the tenant's legal entity — F-05.
 *
 * `systemContext` alone reached every row in the tenant while system scope short-circuited both
 * scope predicates. It no longer does, so the administrator names the root of the tree it
 * administers and the closure carries it down. Everything below the enterprise node is in scope
 * because the hierarchy says so, which is the property these tests are about.
 */
function adminContext() {
  return systemContextAt(TENANT_A, a.enterpriseNodeId, a.legalEntityId, `user:${a.adminUserId}`);
}

describe('four-level traversal', () => {
  it('records the depth of each level', async () => {
    const rows = await withLegalContext(app, adminContext(), async (c) => {
      const r = await c.query<{ id: string; depth: number; node_type: string }>(
        'SELECT id, depth, node_type FROM organization_nodes ORDER BY depth',
      );
      return r.rows;
    });
    expect(rows.map((r) => [r.node_type, r.depth])).toEqual([
      ['enterprise', 0],
      ['legal_entity', 1],
      ['region', 2],
      ['terminal', 3],
    ]);
  });

  it('materialises the full closure — ten rows for a four-node chain', async () => {
    const count = await withLegalContext(app, adminContext(), async (c) => {
      const r = await c.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM organization_node_closure',
      );
      return Number(r.rows[0]!.count);
    });
    // n(n+1)/2 for a chain of 4: 4 + 3 + 2 + 1.
    expect(count).toBe(10);
  });

  it('links the deepest node to every ancestor at the right distance', async () => {
    const rows = await withLegalContext(app, adminContext(), async (c) => {
      const r = await c.query<{ ancestor_id: string; depth: number }>(
        `SELECT ancestor_id, depth FROM organization_node_closure
          WHERE descendant_id = $1 ORDER BY depth`,
        [a.terminalNodeId],
      );
      return r.rows;
    });
    expect(rows.map((r) => [r.ancestor_id, r.depth])).toEqual([
      [a.terminalNodeId, 0],
      [a.regionNodeId, 1],
      [a.legalEntityNodeId, 2],
      [a.enterpriseNodeId, 3],
    ]);
  });

  it('resolves the governing legal entity at every level below the boundary', async () => {
    const answers = await withLegalContext(app, adminContext(), async (c) => {
      const out: Record<string, string | null> = {};
      for (const [label, node] of [
        ['enterprise', a.enterpriseNodeId],
        ['legal_entity', a.legalEntityNodeId],
        ['region', a.regionNodeId],
        ['terminal', a.terminalNodeId],
      ] as const) {
        const r = await c.query<{ governing: string | null }>(
          'SELECT app.governing_legal_entity_id($1, $2) AS governing',
          [TENANT_A, node],
        );
        out[label] = r.rows[0]!.governing;
      }
      return out;
    });

    // Above the legal-entity boundary there is nothing to govern the node — the ADR-0021
    // category-5 case, and the reason policy_bindings.legal_entity_id is conditionally nullable.
    expect(answers['enterprise']).toBeNull();
    expect(answers['legal_entity']).toBe(a.legalEntityId);
    expect(answers['region']).toBe(a.legalEntityId);
    expect(answers['terminal']).toBe(a.legalEntityId);
  });

  it('lets a nested legal entity govern its own subtree rather than its parent doing so', async () => {
    const inner = await withLegalContext(app, adminContext(), async (c) => {
      const client = c as Client;
      const bu = await addNode(client, a.regionNodeId, 'business_unit', 'Inner BU');
      const node = await addNode(client, bu, 'legal_entity', 'Inner Co');
      const entityId = randomUUID();
      await client.query(
        `INSERT INTO legal_entities
           (id, tenant_id, organization_node_id, legal_entity_id, legal_name, jurisdiction,
            created_by)
         VALUES ($1, $2, $3, $1, 'Inner Co LLC', 'US-NV', 'test')`,
        [entityId, TENANT_A, node],
      );
      const below = await addNode(client, node, 'terminal', 'Inner Yard');
      const r = await client.query<{ governing: string | null }>(
        'SELECT app.governing_legal_entity_id($1, $2) AS governing',
        [TENANT_A, below],
      );
      return { entityId, governing: r.rows[0]!.governing };
    });
    expect(inner.governing).toBe(inner.entityId);
  });
});

describe('hierarchy invariants', () => {
  it('permits exactly one root per tenant', async () => {
    await expect(
      withLegalContext(app, adminContext(), async (c) => {
        await addNode(c as Client, null, 'enterprise', 'Second root');
      }),
    ).rejects.toThrow(/one_root_per_tenant/);
  });

  it('refuses a root that is not an enterprise node', async () => {
    await expect(
      withLegalContext(app, adminContext(), async (c) => {
        await addNode(c as Client, null, 'region', 'Rootless region');
      }),
    ).rejects.toThrow(/root_is_enterprise/);
  });

  it('refuses an enterprise node with a parent', async () => {
    // Two refusals stand behind this and the trigger is first to fire: app.is_permitted_node_parent
    // gives `enterprise` no permitted parent at all, and the organization_nodes_root_is_enterprise
    // CHECK would reject it regardless.
    await expect(
      withLegalContext(app, adminContext(), async (c) => {
        await addNode(c as Client, a.regionNodeId, 'enterprise', 'Nested enterprise');
      }),
    ).rejects.toThrow(/may not be a child of|root_is_enterprise/);
  });

  it('refuses an impermissible parent type', async () => {
    await expect(
      withLegalContext(app, adminContext(), async (c) => {
        await addNode(c as Client, a.terminalNodeId, 'operating_authority', 'Bad parent');
      }),
    ).rejects.toThrow(/may not be a child of/);
  });

  it('agrees with packages/identity over the full 8 x 8 parent cross-product', async () => {
    for (const child of ORGANIZATION_NODE_TYPES) {
      for (const parent of ORGANIZATION_NODE_TYPES) {
        const r = await admin.query<{ ok: boolean | null }>(
          'SELECT app.is_permitted_node_parent($1, $2) AS ok',
          [child, parent],
        );
        expect(r.rows[0]!.ok ?? false, `${child}/${parent}`).toBe(
          isPermittedNodeParent(child, parent),
        );
      }
    }
  });

  it('rejects a move that would make a node its own ancestor', async () => {
    // A business unit is a permitted parent of a region, so the parent-type rule does not fire
    // here and the cycle check is what has to catch it.
    const descendant = await withLegalContext(app, adminContext(), async (c) =>
      addNode(c as Client, a.regionNodeId, 'business_unit', 'Cycle bait'),
    );

    await expect(
      withLegalContext(app, adminContext(), async (c) => {
        await c.query('UPDATE organization_nodes SET parent_id = $1 WHERE id = $2', [
          descendant,
          a.regionNodeId,
        ]);
      }),
    ).rejects.toThrow(/cycle rejected/);
  });

  it('rejects a self-parent', async () => {
    await expect(
      withLegalContext(app, adminContext(), async (c) => {
        await c.query('UPDATE organization_nodes SET parent_id = $1 WHERE id = $1', [
          a.regionNodeId,
        ]);
      }),
    ).rejects.toThrow(/not_own_parent|cycle rejected/);
  });

  it('accepts a chain down to exactly the depth bound', async () => {
    deepNodeId = await withLegalContext(app, adminContext(), async (c) => {
      const client = c as Client;
      // The region sits at depth 2, so 14 more business units reach exactly 16. A business unit
      // may parent a business unit, so the parent-type rule stays out of the way.
      let parent = a.regionNodeId;
      for (let depth = 3; depth <= MAX_ORGANIZATION_DEPTH; depth += 1) {
        parent = await addNode(client, parent, 'business_unit', `Deep BU ${depth}`);
      }
      const atBound = await client.query<{ depth: number }>(
        'SELECT depth FROM organization_nodes WHERE id = $1',
        [parent],
      );
      expect(atBound.rows[0]!.depth).toBe(MAX_ORGANIZATION_DEPTH);
      return parent;
    });
  });

  it('rejects one level past the bound', async () => {
    await expect(
      withLegalContext(app, adminContext(), async (c) => {
        await addNode(c as Client, deepNodeId, 'business_unit', 'One too deep');
      }),
    ).rejects.toThrow(/depth bound of 16 exceeded|depth_bound/);
  });

  it('rejects moving a tall subtree under a deep parent', async () => {
    // Each node is individually within bounds and neither is an ancestor of the other, so this is
    // not a cycle. The subtree HEIGHT is what makes the move illegal, which is why the check is on
    // the tree rather than on the row.
    const tallRoot = await withLegalContext(app, adminContext(), async (c) => {
      const client = c as Client;
      const root = await addNode(client, a.regionNodeId, 'business_unit', 'Tall root');
      const mid = await addNode(client, root, 'business_unit', 'Tall mid');
      await addNode(client, mid, 'business_unit', 'Tall leaf');
      return root;
    });

    await expect(
      withLegalContext(app, adminContext(), async (c) => {
        await c.query('UPDATE organization_nodes SET parent_id = $1 WHERE id = $2', [
          deepNodeId,
          tallRoot,
        ]);
      }),
    ).rejects.toThrow(/depth bound of 16 exceeded/);
  });
});

describe('moving a subtree', () => {
  it('re-parents the subtree, re-depths it, and rebuilds the closure', async () => {
    const moved = await withLegalContext(app, adminContext(), async (c) => {
      const client = c as Client;
      const branch = await addNode(client, a.legalEntityNodeId, 'business_unit', 'Movable BU');
      const child = await addNode(client, branch, 'region', 'Movable region');
      const grandchild = await addNode(client, child, 'terminal', 'Movable yard');

      // Move the branch one level deeper, under the region.
      await client.query('UPDATE organization_nodes SET parent_id = $1 WHERE id = $2', [
        a.regionNodeId,
        branch,
      ]);

      const depths = await client.query<{ id: string; depth: number }>(
        'SELECT id, depth FROM organization_nodes WHERE id = ANY($1) ORDER BY depth',
        [[branch, child, grandchild]],
      );
      const ancestors = await client.query<{ ancestor_id: string; depth: number }>(
        `SELECT ancestor_id, depth FROM organization_node_closure
          WHERE descendant_id = $1 ORDER BY depth`,
        [grandchild],
      );
      return { branch, child, grandchild, depths: depths.rows, ancestors: ancestors.rows };
    });

    // branch was at depth 2 under the legal entity; under the region it is at 3.
    expect(moved.depths.map((d) => d.depth)).toEqual([3, 4, 5]);
    expect(moved.ancestors).toHaveLength(6);
    expect(moved.ancestors.map((r) => r.ancestor_id)).toEqual([
      moved.grandchild,
      moved.child,
      moved.branch,
      a.regionNodeId,
      a.legalEntityNodeId,
      a.enterpriseNodeId,
    ]);
  });

  it('leaves no closure row linking the moved subtree to its former ancestors only', async () => {
    const orphans = await withLegalContext(app, adminContext(), async (c) => {
      // Every closure row must correspond to a real parent chain. Recompute the transitive closure
      // from parent_id and compare with the materialised table.
      const r = await c.query<{ count: string }>(
        `WITH RECURSIVE walk(ancestor_id, descendant_id, depth) AS (
           SELECT id, id, 0 FROM organization_nodes WHERE tenant_id = $1
           UNION ALL
           SELECT w.ancestor_id, n.id, w.depth + 1
             FROM walk w JOIN organization_nodes n ON n.parent_id = w.descendant_id
            WHERE n.tenant_id = $1
         )
         SELECT count(*)::text AS count FROM (
           (SELECT ancestor_id, descendant_id, depth FROM walk
            EXCEPT
            SELECT ancestor_id, descendant_id, depth FROM organization_node_closure)
           UNION ALL
           (SELECT ancestor_id, descendant_id, depth FROM organization_node_closure
            EXCEPT
            SELECT ancestor_id, descendant_id, depth FROM walk)
         ) AS difference`,
        [TENANT_A],
      );
      return Number(r.rows[0]!.count);
    });
    expect(orphans).toBe(0);
  });
});

describe('policy inheritance', () => {
  async function bind(
    client: Client,
    nodeId: string,
    legalEntityId: string | null,
    controlKey: string,
    controlValue: string,
    restrictiveness: number,
    protectedCategory: string | null,
    direction = 'local_override',
  ) {
    return client.query<{ id: string }>(
      `INSERT INTO policy_bindings
         (tenant_id, organization_node_id, legal_entity_id, policy_key, policy_version,
          control_key, control_value, restrictiveness, direction, protected_category, created_by)
       VALUES ($1, $2, $3, 'base_policy', '1.2.0', $4, $5, $6, $7, $8, 'test')
       RETURNING id`,
      [
        TENANT_A,
        nodeId,
        legalEntityId,
        controlKey,
        controlValue,
        restrictiveness,
        direction,
        protectedCategory,
      ],
    );
  }

  it('binds a control at the enterprise root with a null legal entity', async () => {
    const id = await withLegalContext(app, adminContext(), async (c) => {
      const r = await bind(
        c as Client,
        a.enterpriseNodeId,
        null,
        'data_residency',
        'eu_only',
        5,
        'residency',
        'inherited',
      );
      return r.rows[0]!.id;
    });
    expect(id).toBeTruthy();
  });

  it('refuses a root binding that names a legal entity nothing governs', async () => {
    await expect(
      withLegalContext(app, adminContext(), async (c) => {
        await bind(c as Client, a.enterpriseNodeId, a.legalEntityId, 'wrong_entity', 'x', 1, null);
      }),
    ).rejects.toThrow(/does not match the legal entity governing node/);
  });

  it('refuses a below-boundary binding with a null legal entity', async () => {
    await expect(
      withLegalContext(app, adminContext(), async (c) => {
        await bind(c as Client, a.terminalNodeId, null, 'missing_entity', 'x', 1, null);
      }),
    ).rejects.toThrow(/does not match the legal entity governing node/);
  });

  it('inherits the root binding down to the terminal and names the root as its source', async () => {
    const resolved = await withLegalContext(app, adminContext(), async (c) => {
      const r = await c.query<{
        control_key: string;
        control_value: string;
        source_node_id: string;
        source_depth: number;
      }>(
        `SELECT control_key, control_value, source_node_id, source_depth
           FROM app.resolve_effective_policy($1, $2, now())
          WHERE control_key = 'data_residency'`,
        [TENANT_A, a.terminalNodeId],
      );
      return r.rows[0]!;
    });
    expect(resolved.control_value).toBe('eu_only');
    expect(resolved.source_node_id).toBe(a.enterpriseNodeId);
    expect(resolved.source_depth).toBe(3);
  });

  it('lets a child tighten a protected control', async () => {
    await withLegalContext(app, adminContext(), async (c) => {
      await bind(
        c as Client,
        a.terminalNodeId,
        a.legalEntityId,
        'data_residency',
        'de_only',
        9,
        'residency',
      );
    });

    const resolved = await withLegalContext(app, adminContext(), async (c) => {
      const r = await c.query<{ control_value: string; source_node_id: string }>(
        `SELECT control_value, source_node_id FROM app.resolve_effective_policy($1, $2, now())
          WHERE control_key = 'data_residency'`,
        [TENANT_A, a.terminalNodeId],
      );
      return r.rows[0]!;
    });
    expect(resolved.control_value).toBe('de_only');
    expect(resolved.source_node_id).toBe(a.terminalNodeId);
  });

  it('refuses a child binding that weakens a protected control', async () => {
    await expect(
      withLegalContext(app, adminContext(), async (c) => {
        await bind(
          c as Client,
          a.regionNodeId,
          a.legalEntityId,
          'data_residency',
          'anywhere',
          1,
          'residency',
        );
      }),
    ).rejects.toThrow(/may not be weakened/);
  });

  it('refuses the weakening for all six protected categories', async () => {
    const categories = [
      'legal',
      'safety',
      'enterprise_minimum',
      'security',
      'residency',
      'approval',
    ];
    for (const category of categories) {
      await withLegalContext(app, adminContext(), async (c) => {
        await bind(
          c as Client,
          a.enterpriseNodeId,
          null,
          `c_${category}`,
          'strict',
          9,
          category,
          'inherited',
        );
      });

      await expect(
        withLegalContext(app, adminContext(), async (c) => {
          await bind(
            c as Client,
            a.regionNodeId,
            a.legalEntityId,
            `c_${category}`,
            'loose',
            1,
            category,
          );
        }),
        category,
      ).rejects.toThrow(/may not be weakened/);
    }
  });

  it('permits weakening an unprotected control', async () => {
    await withLegalContext(app, adminContext(), async (c) => {
      await bind(c as Client, a.enterpriseNodeId, null, 'verbosity', 'high', 9, null, 'inherited');
    });
    const id = await withLegalContext(app, adminContext(), async (c) => {
      const r = await bind(
        c as Client,
        a.regionNodeId,
        a.legalEntityId,
        'verbosity',
        'low',
        1,
        null,
      );
      return r.rows[0]!.id;
    });
    expect(id).toBeTruthy();

    // Resolution still takes the most restrictive value, so a permitted weaker binding is stored
    // and simply loses.
    const resolved = await withLegalContext(app, adminContext(), async (c) => {
      const r = await c.query<{ control_value: string }>(
        `SELECT control_value FROM app.resolve_effective_policy($1, $2, now())
          WHERE control_key = 'verbosity'`,
        [TENANT_A, a.terminalNodeId],
      );
      return r.rows[0]!.control_value;
    });
    expect(resolved).toBe('high');
  });

  it('ignores a revoked binding', async () => {
    await withLegalContext(app, adminContext(), async (c) => {
      await c.query(
        `UPDATE policy_bindings
            SET status = 'revoked', revoked_at = now(), revoked_by = 'test:operator'
          WHERE control_key = 'data_residency' AND organization_node_id = $1`,
        [a.terminalNodeId],
      );
    });

    const resolved = await withLegalContext(app, adminContext(), async (c) => {
      const r = await c.query<{ control_value: string; source_node_id: string }>(
        `SELECT control_value, source_node_id FROM app.resolve_effective_policy($1, $2, now())
          WHERE control_key = 'data_residency'`,
        [TENANT_A, a.terminalNodeId],
      );
      return r.rows[0]!;
    });
    expect(resolved.control_value).toBe('eu_only');
    expect(resolved.source_node_id).toBe(a.enterpriseNodeId);
  });

  it('resolves nothing for a node in another tenant', async () => {
    const rows = await withLegalContext(app, adminContext(), async (c) => {
      const r = await c.query('SELECT * FROM app.resolve_effective_policy($1, $2, now())', [
        '22222222-2222-4222-8222-222222222222',
        a.terminalNodeId,
      ]);
      return r.rowCount;
    });
    expect(rows).toBe(0);
  });
});

/**
 * F-02 — the closure is derived, and only the maintenance triggers may write it.
 *
 * organization_node_closure carried `GRANT SELECT, INSERT, UPDATE, DELETE ... TO freightos_app`
 * with permissive tenant-scoped policies to match, because the triggers that maintain it ran as
 * the invoking session and needed the privilege. The privilege did not stop at the triggers.
 *
 * app.organization_node_scope_ok answers "is this row at or below a node the caller administers?"
 * by asking the closure, so one inserted row
 *
 *   (tenant, ancestor_id => a node I hold, descendant_id => any node, depth => 1)
 *
 * granted the caller scope over that node and everything the policies gate on it. No policy was
 * violated doing it: the rows are the caller's own tenant, which is all they asked.
 */
describe('the closure cannot be written by what it authorizes — F-02', () => {
  it('gives the application role SELECT and nothing else', async () => {
    const r = await admin.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.table_privileges
        WHERE grantee = 'freightos_app' AND table_name = 'organization_node_closure'
        ORDER BY privilege_type`,
    );
    expect(r.rows.map((x) => x.privilege_type)).toEqual(['SELECT']);
  });

  it('refuses a forged ancestry row', async () => {
    // The reproduction. Before the fix this INSERT succeeded and the caller acquired scope over
    // the named descendant, and over every table whose policy resolves through the closure.
    await expect(
      withLegalContext(app, adminContext(), (c) =>
        (c as Client).query(
          `INSERT INTO organization_node_closure
             (tenant_id, ancestor_id, descendant_id, depth, created_by, updated_by)
           VALUES ($1, $2, $3, 1, 'test', 'test')`,
          [TENANT_A, a.terminalNodeId, a.enterpriseNodeId],
        ),
      ),
    ).rejects.toThrow(/permission denied|row-level security/i);
  });

  it('grants no scope even when the forged row is attempted', async () => {
    // The point of the finding stated as an outcome rather than as an error message: the terminal
    // node does not govern the enterprise root before the attempt, and does not after it.
    const before = await withLegalContext(
      app,
      systemContextAt(TENANT_A, a.terminalNodeId, a.legalEntityId, `user:${a.adminUserId}`),
      async (c) => {
        const r = await c.query<{ ok: boolean }>(
          'SELECT app.organization_node_scope_ok($1) AS ok',
          [a.enterpriseNodeId],
        );
        return r.rows[0]!.ok;
      },
    );
    expect(before).toBe(false);

    await withLegalContext(app, adminContext(), async (c) => {
      await (c as Client)
        .query(
          `INSERT INTO organization_node_closure
             (tenant_id, ancestor_id, descendant_id, depth, created_by, updated_by)
           VALUES ($1, $2, $3, 1, 'test', 'test')`,
          [TENANT_A, a.terminalNodeId, a.enterpriseNodeId],
        )
        .catch(() => undefined);
    });

    const after = await withLegalContext(
      app,
      systemContextAt(TENANT_A, a.terminalNodeId, a.legalEntityId, `user:${a.adminUserId}`),
      async (c) => {
        const r = await c.query<{ ok: boolean }>(
          'SELECT app.organization_node_scope_ok($1) AS ok',
          [a.enterpriseNodeId],
        );
        return r.rows[0]!.ok;
      },
    );
    expect(after).toBe(false);
  });

  it('refuses deleting somebody out of the tree', async () => {
    await expect(
      withLegalContext(app, adminContext(), (c) =>
        (c as Client).query(
          `DELETE FROM organization_node_closure
            WHERE tenant_id = $1 AND ancestor_id = $2 AND descendant_id = $3`,
          [TENANT_A, a.enterpriseNodeId, a.terminalNodeId],
        ),
      ),
    ).rejects.toThrow(/permission denied|row-level security/i);
  });

  it('refuses re-pointing an existing row', async () => {
    await expect(
      withLegalContext(app, adminContext(), (c) =>
        (c as Client).query(
          `UPDATE organization_node_closure SET depth = 0
            WHERE tenant_id = $1 AND ancestor_id = $2`,
          [TENANT_A, a.enterpriseNodeId],
        ),
      ),
    ).rejects.toThrow(/permission denied|row-level security/i);
  });

  it('refuses emptying it', async () => {
    await expect(
      withLegalContext(app, adminContext(), (c) =>
        (c as Client).query('TRUNCATE organization_node_closure'),
      ),
    ).rejects.toThrow(/permission denied|must be owner/i);
  });

  it('still maintains itself when the tree legitimately changes', async () => {
    // Two independent refusals stand in front of the closure now, so this is the test that the
    // triggers can still get past both — "no writer at all" would be a different bug.
    const nodeId = await withLegalContext(app, adminContext(), async (c) => {
      const id = randomUUID();
      await (c as Client).query(
        `INSERT INTO organization_nodes
           (id, tenant_id, organization_node_id, parent_id, node_type, name, created_by)
         VALUES ($1, $2, $1, $3, 'terminal', 'F-02 Yard', 'test')`,
        [id, TENANT_A, a.regionNodeId],
      );
      return id;
    });

    const ancestry = await withLegalContext(app, adminContext(), async (c) => {
      const r = await c.query<{ ancestor_id: string; depth: number }>(
        `SELECT ancestor_id, depth FROM organization_node_closure
          WHERE tenant_id = $1 AND descendant_id = $2 ORDER BY depth`,
        [TENANT_A, nodeId],
      );
      return r.rows;
    });
    expect(ancestry.map((x) => x.depth)).toEqual([0, 1, 2, 3]);
    expect(ancestry.map((x) => x.ancestor_id)).toEqual([
      nodeId,
      a.regionNodeId,
      a.legalEntityNodeId,
      a.enterpriseNodeId,
    ]);

    // And a move rewrites it — the trigger's detach/reattach pass, still working as a definer.
    await withLegalContext(app, adminContext(), (c) =>
      (c as Client).query('UPDATE organization_nodes SET parent_id = $1 WHERE id = $2', [
        a.legalEntityNodeId,
        nodeId,
      ]),
    );
    const moved = await withLegalContext(app, adminContext(), async (c) => {
      const r = await c.query<{ ancestor_id: string; depth: number }>(
        `SELECT ancestor_id, depth FROM organization_node_closure
          WHERE tenant_id = $1 AND descendant_id = $2 ORDER BY depth`,
        [TENANT_A, nodeId],
      );
      return r.rows;
    });
    expect(moved.map((x) => x.depth)).toEqual([0, 1, 2]);
    expect(moved.map((x) => x.ancestor_id)).not.toContain(a.regionNodeId);
  });

  it('keeps the maintenance triggers owned by a non-login definer with a pinned search path', async () => {
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
        WHERE n.nspname = 'app' AND p.proname LIKE 'organization_node_%'
          AND p.proname <> 'organization_node_scope_ok'
        ORDER BY p.proname`,
    );
    expect(r.rows.map((x) => x.proname)).toEqual([
      'organization_node_after_insert',
      'organization_node_after_move',
      'organization_node_before_write',
    ]);
    for (const fn of r.rows) {
      expect(fn.prosecdef, `${fn.proname} SECURITY DEFINER`).toBe(true);
      expect(fn.owner, `${fn.proname} owner`).toBe('freightos_hierarchy_owner');
      expect(fn.canlogin, `${fn.proname} owner can log in`).toBe(false);
      expect(fn.proconfig, `${fn.proname} search_path`).toContain('search_path=pg_catalog, public');
    }

    // The definer's whole reach: the closure it maintains, and the node depths the move pass
    // rewrites. Nothing else, and no other table in the schema.
    const grants = await admin.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type FROM information_schema.table_privileges
        WHERE grantee = 'freightos_hierarchy_owner' ORDER BY table_name, privilege_type`,
    );
    expect(grants.rows).toEqual([
      { table_name: 'organization_node_closure', privilege_type: 'DELETE' },
      { table_name: 'organization_node_closure', privilege_type: 'INSERT' },
      { table_name: 'organization_node_closure', privilege_type: 'SELECT' },
      { table_name: 'organization_node_closure', privilege_type: 'UPDATE' },
      { table_name: 'organization_nodes', privilege_type: 'SELECT' },
      { table_name: 'organization_nodes', privilege_type: 'UPDATE' },
    ]);
  });

  it('admits only the control plane to the write policies', async () => {
    const r = await admin.query<{ polname: string; cmd: string; qual: string; withcheck: string }>(
      `SELECT p.polname, p.polcmd::text AS cmd,
              coalesce(pg_get_expr(p.polqual, p.polrelid), '') AS qual,
              coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') AS withcheck
         FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
        WHERE c.relname = 'organization_node_closure' ORDER BY p.polname`,
    );
    expect(r.rows.map((x) => x.polname)).toEqual([
      'organization_node_closure_delete',
      'organization_node_closure_insert',
      'organization_node_closure_read',
      'organization_node_closure_update',
    ]);
    for (const policy of r.rows) {
      if (policy.polname === 'organization_node_closure_read') continue;
      // No tenant branch on any write policy: naming your own tenant is not authority to rewrite
      // the table that decides what your tenant's shape is.
      expect(`${policy.qual}${policy.withcheck}`, policy.polname).not.toMatch(/current_tenant_id/);
      expect(`${policy.qual}${policy.withcheck}`, policy.polname).toMatch(/is_control_plane/);
    }
  });
});

/**
 * F-03 — concurrent hierarchy mutation.
 *
 * Every hierarchy rule is a read followed by a write, and READ COMMITTED gives each transaction a
 * snapshot taken when its statement began. Two concurrent moves each consulted a closure that did
 * not contain the other's change, each concluded it was safe, and both committed. Move A under B
 * and B under A at the same time and the tree stops being a tree.
 *
 * These are real connections doing real concurrent work: two sessions, both inside transactions,
 * with the second issued while the first is still open. They are not simulations of contention.
 */
describe('concurrent hierarchy mutation — F-03', () => {
  /** A fresh two-branch tree per test, so one test's wreckage cannot pass another. */
  async function branchPair() {
    return withLegalContext(app, adminContext(), async (c) => {
      const client = c as Client;
      const make = async (parent: string, name: string) => {
        const id = randomUUID();
        await client.query(
          `INSERT INTO organization_nodes
             (id, tenant_id, organization_node_id, parent_id, node_type, name, created_by)
           VALUES ($1, $2, $1, $3, 'region', $4, 'test')`,
          [id, TENANT_A, parent, name],
        );
        return id;
      };
      const left = await make(a.enterpriseNodeId, `F-03 left ${randomUUID().slice(0, 8)}`);
      const right = await make(a.enterpriseNodeId, `F-03 right ${randomUUID().slice(0, 8)}`);
      return { left, right };
    });
  }

  /** An independent connection carrying the tenant administrator's context, left in a transaction. */
  async function openSession() {
    const client = db.connectAs('freightos_app');
    await client.connect();
    await client.query('BEGIN');
    const context = adminContext();
    await client.query(
      `SELECT set_config('app.tenant_id', $1, true),
              set_config('app.actor_id', $2, true),
              set_config('app.legal_authority_class', $3, true),
              set_config('app.operating_context', $4, true),
              set_config('app.legal_entity_id', $5, true),
              set_config('app.organization_node_id', $6, true)`,
      [
        context.tenantId,
        context.actorId,
        context.legalAuthorityClass,
        context.operatingContext,
        context.legalEntityId ?? '',
        context.organizationNodeId ?? '',
      ],
    );
    return client;
  }

  const move = (client: Client, nodeId: string, parentId: string) =>
    client.query('UPDATE organization_nodes SET parent_id = $1 WHERE id = $2', [parentId, nodeId]);

  it('refuses the second of two moves that would together form a cycle', async () => {
    const { left, right } = await branchPair();
    const one = await openSession();
    const two = await openSession();
    try {
      // Session one moves left under right and holds its transaction open.
      await move(one, left, right);

      // Session two attempts the reciprocal move. Without the lock its cycle check consults a
      // closure that does not yet contain session one's edge, finds nothing, and allows it —
      // both commit and the two nodes become each other's ancestor. With the lock it blocks here.
      const blocked = move(two, right, left);
      let settled = false;
      void blocked.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      // Give it real time to have completed if it were going to.
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(settled, 'the second move was not serialised behind the first').toBe(false);

      await one.query('COMMIT');

      // If the second move somehow succeeded it is COMMITTED rather than rolled back, so the
      // damage is left in the database for the invariant test below to find. A regression test
      // that tidies up after the bug it is looking for only ever reports the bug once.
      const outcome = await blocked.then(
        () => 'succeeded',
        (error: Error) => error,
      );
      if (outcome === 'succeeded') await two.query('COMMIT');
      expect(outcome, 'the reciprocal move was allowed').not.toBe('succeeded');
      expect((outcome as Error).message).toMatch(/cycle rejected/i);
    } finally {
      await one.query('ROLLBACK').catch(() => undefined);
      await two.query('ROLLBACK').catch(() => undefined);
      await one.end();
      await two.end();
    }
  });

  it('leaves no node as its own ancestor after the attempt', async () => {
    // The outcome the previous test's error message stands for. A cycle in a closure table is
    // silent: nothing errors afterwards, the tree simply has no root.
    const cycles = await withLegalContext(app, adminContext(), async (c) => {
      const r = await c.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM organization_node_closure
          WHERE tenant_id = $1 AND ancestor_id <> descendant_id
            AND EXISTS (
              SELECT 1 FROM organization_node_closure back
               WHERE back.tenant_id = organization_node_closure.tenant_id
                 AND back.ancestor_id = organization_node_closure.descendant_id
                 AND back.descendant_id = organization_node_closure.ancestor_id)`,
        [TENANT_A],
      );
      return Number(r.rows[0]!.count);
    });
    expect(cycles).toBe(0);
  });

  it('serialises two moves of the same subtree and keeps the last one', async () => {
    const { left, right } = await branchPair();
    const target = await withLegalContext(app, adminContext(), async (c) => {
      const id = randomUUID();
      await (c as Client).query(
        `INSERT INTO organization_nodes
           (id, tenant_id, organization_node_id, parent_id, node_type, name, created_by)
         VALUES ($1, $2, $1, $3, 'terminal', $4, 'test')`,
        [id, TENANT_A, left, `F-03 target ${randomUUID().slice(0, 8)}`],
      );
      return id;
    });

    const one = await openSession();
    const two = await openSession();
    try {
      await move(one, target, right);
      const second = move(two, target, left);
      await one.query('COMMIT');
      await second;
      await two.query('COMMIT');
    } finally {
      await one.end();
      await two.end();
    }

    const ancestry = await withLegalContext(app, adminContext(), async (c) => {
      const r = await c.query<{ ancestor_id: string }>(
        `SELECT ancestor_id FROM organization_node_closure
          WHERE tenant_id = $1 AND descendant_id = $2 AND depth = 1`,
        [TENANT_A, target],
      );
      return r.rows.map((x) => x.ancestor_id);
    });
    // Exactly one parent edge, and it is the one that committed last. Two would mean the detach
    // pass ran against a snapshot that no longer described the tree.
    expect(ancestry).toEqual([left]);
  });

  it('lets only one of two concurrent roots exist for a tenant', async () => {
    const one = await openSession();
    const two = await openSession();
    const insertRoot = (client: Client) => {
      const id = randomUUID();
      return client.query(
        `INSERT INTO organization_nodes
           (id, tenant_id, organization_node_id, parent_id, node_type, name, created_by)
         VALUES ($1, $2, $1, NULL, 'enterprise', $3, 'test')`,
        [id, TENANT_A, `F-03 root ${id.slice(0, 8)}`],
      );
    };
    try {
      // The tenant already has a root, so both of these must fail — the point is that they fail on
      // the constraint rather than deadlocking or leaving one through.
      await expect(insertRoot(one)).rejects.toThrow(/one_root_per_tenant/);
      await one.query('ROLLBACK');
      await expect(insertRoot(two)).rejects.toThrow(/one_root_per_tenant/);
    } finally {
      await one.query('ROLLBACK').catch(() => undefined);
      await two.query('ROLLBACK').catch(() => undefined);
      await one.end();
      await two.end();
    }
  });

  it('does not let two tenants block each other', async () => {
    // The lock is derived from the tenant id, so it has to be a different lock for a different
    // tenant. A single global hierarchy lock would pass every test above and serialise the whole
    // platform, which is why this one exists.
    const other = db.connectAs('freightos_app');
    await other.connect();
    const mine = await openSession();
    try {
      await move(mine, (await branchPair()).left, a.legalEntityNodeId);

      await other.query('BEGIN');
      await other.query(
        `SELECT set_config('app.tenant_id', $1, true),
                set_config('app.actor_id', 'test:b', true),
                set_config('app.legal_authority_class', 'software_only', true),
                set_config('app.operating_context', 'system', true)`,
        [TENANT_B],
      );
      const id = randomUUID();
      const insert = other.query(
        `INSERT INTO organization_nodes
           (id, tenant_id, organization_node_id, parent_id, node_type, name, created_by)
         VALUES ($1, $2, $1, NULL, 'enterprise', 'F-03 other tenant', 'test')`,
        [id, TENANT_B],
      );
      // TENANT_B has no root in this database, so this succeeds — and it has to succeed WHILE the
      // TENANT_A transaction is still open, which is the whole assertion.
      await expect(insert).resolves.toBeTruthy();
      await other.query('ROLLBACK');
    } finally {
      await mine.query('ROLLBACK').catch(() => undefined);
      await other.query('ROLLBACK').catch(() => undefined);
      await mine.end();
      await other.end();
    }
  });

  it('keeps the closure equal to the tree after concurrent work', async () => {
    // The invariant, checked against an independent recomputation rather than against itself: the
    // stored closure must equal the transitive closure of parent_id. Anything a race left behind —
    // a stale edge, a missing one, a wrong depth — shows up as a difference here.
    const drift = await withLegalContext(app, adminContext(), async (c) => {
      const r = await c.query<{ count: string }>(
        `WITH RECURSIVE walk(ancestor_id, descendant_id, depth) AS (
           SELECT id, id, 0 FROM organization_nodes WHERE tenant_id = $1
           UNION ALL
           SELECT w.ancestor_id, n.id, w.depth + 1
             FROM walk w
             JOIN organization_nodes n ON n.parent_id = w.descendant_id AND n.tenant_id = $1
         ),
         stored AS (
           SELECT ancestor_id, descendant_id, depth FROM organization_node_closure
            WHERE tenant_id = $1
         )
         SELECT count(*)::text AS count FROM (
           SELECT ancestor_id, descendant_id, depth FROM walk
           EXCEPT SELECT ancestor_id, descendant_id, depth FROM stored
           UNION ALL
           SELECT ancestor_id, descendant_id, depth FROM stored
           EXCEPT SELECT ancestor_id, descendant_id, depth FROM walk
         ) AS difference`,
        [TENANT_A],
      );
      return Number(r.rows[0]!.count);
    });
    expect(drift).toBe(0);
  });

  it('releases the lock with the transaction rather than with the statement', async () => {
    // Transaction-scoped is the part that makes it safe under a connection pool: a session-scoped
    // advisory lock left behind on a rolled-back transaction would be inherited by whoever borrows
    // the connection next, and the hierarchy would wedge for that tenant until the process exited.
    const one = await openSession();
    try {
      await move(one, (await branchPair()).left, a.legalEntityNodeId);
      const held = await one.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM pg_locks
          WHERE locktype = 'advisory' AND pid = pg_backend_pid()`,
      );
      expect(Number(held.rows[0]!.count)).toBe(1);
      await one.query('ROLLBACK');

      const after = await one.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM pg_locks
          WHERE locktype = 'advisory' AND pid = pg_backend_pid()`,
      );
      expect(Number(after.rows[0]!.count)).toBe(0);
    } finally {
      await one.end();
    }
  });
});

/**
 * F-08 — protectedness is a property of the control, not a field the caller may omit.
 *
 * The weakening guard fired only when the incoming row said `protected_category IS NOT NULL`, and
 * that column is supplied by the same caller the guard exists to constrain. A child binding with
 * the category left NULL skipped the check entirely and weakened a protected control freely: no
 * error, no trace, and the resolved policy afterwards simply looser than the ancestor set. The one
 * thing a caller had to do to escape a control it may not weaken was decline to mention it.
 */
describe('a protected control cannot be un-declared by a descendant — F-08', () => {
  const POLICY = 'f08_policy';

  async function bindAt(
    nodeId: string,
    legalEntityId: string | null,
    controlKey: string,
    restrictiveness: number,
    protectedCategory: string | null,
  ) {
    return withLegalContext(app, adminContext(), (c) =>
      (c as Client).query(
        `INSERT INTO policy_bindings
           (tenant_id, organization_node_id, legal_entity_id, policy_key, policy_version,
            control_key, control_value, restrictiveness, direction, protected_category, created_by)
         VALUES ($1, $2, $3, $4, '1.0.0', $5, 'value', $6, 'local_override', $7, 'test')`,
        [TENANT_A, nodeId, legalEntityId, POLICY, controlKey, restrictiveness, protectedCategory],
      ),
    );
  }

  it('refuses a descendant binding that omits the inherited category', async () => {
    // The reproduction. Before the fix this INSERT succeeded and the terminal node ran at
    // restrictiveness 1 under an enterprise-wide control declared at 9.
    const control = `f08_omitted_${randomUUID().slice(0, 8)}`;
    await bindAt(a.enterpriseNodeId, null, control, 9, 'legal');
    await expect(bindAt(a.terminalNodeId, a.legalEntityId, control, 1, null)).rejects.toThrow(
      /may not change or omit it/i,
    );
  });

  it('refuses a descendant binding that relabels the category', async () => {
    // Relabelling would work the same way: name a different category and the weakening check runs
    // against a control the ancestor never protected under that name.
    const control = `f08_relabel_${randomUUID().slice(0, 8)}`;
    await bindAt(a.enterpriseNodeId, null, control, 9, 'legal');
    await expect(
      bindAt(a.terminalNodeId, a.legalEntityId, control, 1, 'residency'),
    ).rejects.toThrow(/may not change or omit it/i);
  });

  it('still refuses the weakening when the category IS named', async () => {
    const control = `f08_named_${randomUUID().slice(0, 8)}`;
    await bindAt(a.enterpriseNodeId, null, control, 9, 'legal');
    await expect(bindAt(a.terminalNodeId, a.legalEntityId, control, 1, 'legal')).rejects.toThrow(
      /may not be weakened/i,
    );
  });

  it('permits a descendant that names the category and tightens', async () => {
    const control = `f08_tighten_${randomUUID().slice(0, 8)}`;
    await bindAt(a.enterpriseNodeId, null, control, 5, 'legal');
    await expect(
      bindAt(a.terminalNodeId, a.legalEntityId, control, 9, 'legal'),
    ).resolves.toBeTruthy();
  });

  it('lets a node be the first to declare a control protected', async () => {
    // A node may be the first to protect a control. What it may not be is the first to stop.
    const control = `f08_first_${randomUUID().slice(0, 8)}`;
    await expect(
      bindAt(a.regionNodeId, a.legalEntityId, control, 5, 'legal'),
    ).resolves.toBeTruthy();
    await expect(bindAt(a.terminalNodeId, a.legalEntityId, control, 1, null)).rejects.toThrow(
      /may not change or omit it/i,
    );
  });

  it('leaves an unprotected control weakenable', async () => {
    // The guard must stay off where it belongs off, or every control becomes protected by accident.
    const control = `f08_ordinary_${randomUUID().slice(0, 8)}`;
    await bindAt(a.enterpriseNodeId, null, control, 9, null);
    await expect(bindAt(a.terminalNodeId, a.legalEntityId, control, 1, null)).resolves.toBeTruthy();
  });

  it('keeps the policy-binding read policy free of an organization-node term', async () => {
    // The tripwire. This guard reads ancestor bindings as the caller, and it is safe because
    // policy_bindings_read is scoped by tenant alone. Adding a node term would make it fail open
    // exactly the way the self-elevation guards did before F-01 — an ancestor binding invisible to
    // a descendant caller reads as "no ancestor declared this protected".
    const r = await admin.query<{ qual: string }>(
      `SELECT pg_get_expr(p.polqual, p.polrelid) AS qual
         FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
        WHERE c.relname = 'policy_bindings' AND p.polname = 'policy_bindings_read'`,
    );
    expect(r.rows[0]!.qual).not.toMatch(/organization_node_scope_ok/);
    expect(r.rows[0]!.qual).toMatch(/current_tenant_id/);
  });
});
