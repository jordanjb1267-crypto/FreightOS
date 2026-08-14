import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TestDatabase } from './harness.ts';
import {
  ALL_NETWORK_RELATIONS,
  DISCLOSURE_FAMILY_RELATIONS,
  N5A_DISCLOSURE_RELATIONS,
  N5B_SENSITIVITY_RELATIONS,
  N6_DELIVERY_RELATIONS,
  NETWORK_RELATION_LAYER,
} from './network-relations.ts';

/**
 * The pattern-hazard gate.
 *
 * N6 exposed a defect that was not in any migration: several security gates established the set of
 * relations they governed with `relname LIKE 'network\_disclosure\_%'`. Five of 0034's seven tables
 * matched that pattern by name, so the gates silently absorbed them — one gate that had asserted
 * "these are N5-A's six" began asserting something about thirteen relations without anyone
 * choosing that. The naming convention was acting as the security authority.
 *
 * `network-relations.ts` now declares membership by hand. This file makes the two disagree loudly:
 * it DISCOVERS the disclosure/delivery naming family from the catalog and judges it against the
 * declared sets. A future N7 relation named `network_disclosure_*` or `network_delivery_*` fails
 * here, by name, until somebody classifies it — which is the whole point. Nothing in this file
 * infers a layer from a name.
 *
 * The scope is deliberately narrow. This is not a governance subsystem; it is one gate over one
 * hazard, in the one naming family where that hazard has actually occurred.
 */

const db = new TestDatabase('freightos_test_n6_relation_inventory');

let owner: Client;

/**
 * Everything in the disclosure/delivery naming family that the database actually contains.
 *
 * Matched on the word anywhere in the name, not on a `network_disclosure_` prefix. The prefix is
 * the wrong test and this gate proved it on its own first run: `network_schema_disclosure_sensitivity`
 * is one of N5-B's three and does not carry it. A gate that had used the prefix would have declared
 * the inventory complete while silently omitting a governed relation — the same class of mistake it
 * exists to catch, one level up.
 */
const discovered = async (client: Client): Promise<string[]> => {
  const r = await client.query<{ relname: string }>(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'network\\_%'
        AND (c.relname LIKE '%disclosure%' OR c.relname LIKE '%delivery%')
      ORDER BY c.relname`,
  );
  return r.rows.map((x) => x.relname);
};

beforeAll(async () => {
  await db.reset();
  owner = db.connectAs('postgres');
  await owner.connect();
}, 300_000);

afterAll(async () => {
  await owner?.end();
});

describe('the disclosure relation inventory is declared, not inferred', () => {
  it('classifies every discovered disclosure/delivery relation', async () => {
    const unclassified = (await discovered(owner)).filter((r) => !NETWORK_RELATION_LAYER.has(r));
    // The failure message is the deliverable here: whoever adds N7 should be told what to do, not
    // merely that a count moved.
    expect(
      unclassified,
      'NEW_RELATION_REQUIRES_EXPLICIT_CLASSIFICATION — add each name to its layer in ' +
        'test/integration/network-relations.ts. Do NOT infer the layer from the name, and do NOT ' +
        'exclude it from the gates that scan the family.',
    ).toEqual([]);
  });

  it('declares no disclosure/delivery relation the database does not have', async () => {
    // The other direction. A set that drifts AHEAD of the schema is just as wrong: every gate
    // built on it then asserts something about a relation that does not exist, and passes
    // vacuously for the part that matters.
    const present = new Set(await discovered(owner));
    expect(DISCLOSURE_FAMILY_RELATIONS.filter((r) => !present.has(r))).toEqual([]);
  });

  it('has the discovered family and the declared family exactly equal', async () => {
    expect(await discovered(owner)).toEqual([...DISCLOSURE_FAMILY_RELATIONS]);
  });

  it('keeps the three declared layers disjoint and correctly sized', () => {
    const all = [
      ...N5A_DISCLOSURE_RELATIONS,
      ...N5B_SENSITIVITY_RELATIONS,
      ...N6_DELIVERY_RELATIONS,
    ];
    expect(new Set(all).size, 'a relation may belong to exactly one layer').toBe(all.length);
    expect(N5A_DISCLOSURE_RELATIONS).toHaveLength(6);
    expect(N5B_SENSITIVITY_RELATIONS).toHaveLength(3);
    expect(N6_DELIVERY_RELATIONS).toHaveLength(7);
  });

  it('covers every network relation in the database, not only the disclosure family', async () => {
    // The declared inventory is what the broad `network\_%` gates now assert against, so it has to
    // be complete across all seven layers — otherwise those gates would be checking a subset.
    const r = await owner.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'network\\_%'
        ORDER BY c.relname`,
    );
    expect(r.rows.map((x) => x.relname)).toEqual([...ALL_NETWORK_RELATIONS]);
  });

  it('actually detects an unclassified relation — the anti-vacuity control', async () => {
    // Without this, a gate whose discovery query silently returned nothing would pass all four
    // assertions above and prove precisely nothing. Plant a relation in the naming family and
    // require the detector to name it.
    await owner.query('CREATE TABLE network_disclosure_planted_probe (id uuid PRIMARY KEY)');
    try {
      const found = await discovered(owner);
      expect(found).toContain('network_disclosure_planted_probe');
      expect(found.filter((x) => !NETWORK_RELATION_LAYER.has(x))).toEqual([
        'network_disclosure_planted_probe',
      ]);

      // And the `delivery` half of the family, which has only one member today and would otherwise
      // be an untested branch of the discovery predicate. Named so the word is not at the front,
      // which is also what proves the predicate is not secretly prefix-matching.
      await owner.query('CREATE TABLE network_planted_delivery_probe (id uuid PRIMARY KEY)');
      expect((await discovered(owner)).filter((x) => !NETWORK_RELATION_LAYER.has(x))).toEqual([
        'network_disclosure_planted_probe',
        'network_planted_delivery_probe',
      ]);
    } finally {
      await owner.query('DROP TABLE IF EXISTS network_disclosure_planted_probe');
      await owner.query('DROP TABLE IF EXISTS network_planted_delivery_probe');
    }
    // Restored, so the file leaves the database as it found it.
    expect((await discovered(owner)).filter((x) => !NETWORK_RELATION_LAYER.has(x))).toEqual([]);
  });
});
