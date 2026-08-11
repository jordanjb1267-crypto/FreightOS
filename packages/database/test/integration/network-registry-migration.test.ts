import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadMigrations, migrateDown, migrateUp } from '../../src/migrator.ts';
import { MIGRATIONS_DIR } from '../../src/paths.ts';
import { acquireClusterRoleLock, releaseClusterRoleLock, TestDatabase } from './harness.ts';

// CLUSTER-GLOBAL EXCLUSION — the same reason migration-path-parity.test.ts takes this lock. This
// file drives migrateUp/migrateDown itself, migrations mutate cluster-wide ROLES, and the per-file
// database gives no isolation for cluster-global state.
beforeAll(async () => {
  await acquireClusterRoleLock();
}, 300_000);

afterAll(async () => {
  await releaseClusterRoleLock();
});

/**
 * N1 MIGRATION ROUND TRIP — pre-N1 → up → down → up.
 *
 * N1 is the first migration in the network layer, and the layer is declared ADDITIVE AND
 * SUBORDINATE. "Additive" is a claim about a database, not a claim about a diff, so it is checked
 * against a database: build the tip minus N1, apply N1, revert it, and require the catalog to be
 * bit-for-bit what it was — and then apply N1 again and require the result to be bit-for-bit what
 * the first application produced.
 *
 * WHY THIS IS A SEPARATE FILE FROM migration-path-parity.test.ts. That file compares two logical
 * versions reached different ways and is scoped to schemas `app`, `admin`, `authn` plus policies
 * and roles — the dimensions its three historical defects lived in. N1 adds tables, enum types,
 * triggers, indexes, constraints, seed rows and table-level ACLs in schema `public`, none of which
 * that snapshot reads. Widening it would have changed a gate that is currently green for reasons
 * unrelated to N1; a new file states the new obligation without disturbing the old one.
 *
 * The comparison is by SET DIFFERENCE, printed both ways, because "N1 down left something behind"
 * and "N1 down took something with it" are different defects and a length check tells them apart
 * from neither.
 */
const db = new TestDatabase('freightos_test_network_migration');

const migrations = loadMigrations(MIGRATIONS_DIR);
const TIP = Math.max(...migrations.map((m) => m.version));
/** The version this migration introduces the network registry at. */
const N1 = 28;
const PRE_N1 = N1 - 1;

/**
 * ACL rendered order-independently.
 *
 * PostgreSQL stores `aclitem[]` in grant order, not in a canonical order, so two identical
 * privilege sets can differ as text purely by the order CREATE and GRANT ran in. Sorting the
 * elements compares the SET, which is the property that matters.
 */
const ACL = (column: string) =>
  `coalesce((SELECT '{' || string_agg(a::text, ',' ORDER BY a::text) || '}'
               FROM unnest(${column}) AS a), '-')`;

/**
 * Every dimension §31 of the N1 ruling names, plus the ones a nullable-tenant table makes
 * load-bearing: column NOT NULL and DEFAULT (a revert that left a column behind would show here),
 * default ACLs (a `ALTER DEFAULT PRIVILEGES` nobody asked for), and the cluster role graph.
 */
const DIMENSIONS: Readonly<Record<string, string>> = {
  relations: `SELECT format('%s.%s kind=%s owner=%s rls=%s force=%s acl=%s',
                     n.nspname, c.relname, c.relkind, pg_get_userbyid(c.relowner),
                     c.relrowsecurity, c.relforcerowsecurity, ${ACL('c.relacl')}) AS line
                FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relkind IN ('r', 'v', 'm', 'S', 'p')
                 AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                 AND n.nspname NOT LIKE 'pg_toast%' ORDER BY 1`,

  types: `SELECT format('%s.%s [%s]', n.nspname, t.typname,
                  coalesce((SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
                              FROM pg_enum e WHERE e.enumtypid = t.oid), '-')) AS line
            FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE t.typtype = 'e'
             AND n.nspname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1`,

  functions: `SELECT format('%s.%s(%s) owner=%s secdef=%s vol=%s cfg=%s acl=%s body=%s',
                      n.nspname, p.proname, oidvectortypes(p.proargtypes),
                      pg_get_userbyid(p.proowner), p.prosecdef, p.provolatile,
                      coalesce(p.proconfig::text, '-'), ${ACL('p.proacl')},
                      md5(p.prosrc)) AS line
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1`,

  policies: `SELECT format('%s.%s %s cmd=%s roles=%s using=%s check=%s',
                     schemaname, tablename, policyname, cmd, roles::text,
                     coalesce(qual, '-'), coalesce(with_check, '-')) AS line
               FROM pg_policies ORDER BY 1`,

  triggers: `SELECT format('%s.%s %s -> %s.%s enabled=%s', n.nspname, c.relname, t.tgname,
                     fn.nspname, f.proname, t.tgenabled) AS line
               FROM pg_trigger t
               JOIN pg_class c ON c.oid = t.tgrelid
               JOIN pg_namespace n ON n.oid = c.relnamespace
               JOIN pg_proc f ON f.oid = t.tgfoid
               JOIN pg_namespace fn ON fn.oid = f.pronamespace
              WHERE NOT t.tgisinternal ORDER BY 1`,

  indexes: `SELECT format('%s.%s %s', schemaname, tablename, indexdef) AS line
              FROM pg_indexes
             WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1`,

  constraints: `SELECT format('%s.%s %s %s', n.nspname, c.relname, con.conname,
                        pg_get_constraintdef(con.oid)) AS line
                  FROM pg_constraint con
                  JOIN pg_class c ON c.oid = con.conrelid
                  JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1`,

  columns: `SELECT format('%s.%s.%s %s notnull=%s default=%s', n.nspname, c.relname, a.attname,
                    format_type(a.atttypid, a.atttypmod), a.attnotnull,
                    coalesce(pg_get_expr(d.adbin, d.adrelid), '-')) AS line
              FROM pg_attribute a
              JOIN pg_class c ON c.oid = a.attrelid
              JOIN pg_namespace n ON n.oid = c.relnamespace
              LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
             WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relkind = 'r'
               AND n.nspname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1`,

  schemas: `SELECT format('%s owner=%s acl=%s', nspname, pg_get_userbyid(nspowner),
                    ${ACL('nspacl')}) AS line
              FROM pg_namespace
             WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema' ORDER BY 1`,

  defaultAcls: `SELECT format('%s %s %s %s', pg_get_userbyid(d.defaclrole),
                        coalesce(n.nspname, '-'), d.defaclobjtype, d.defaclacl::text) AS line
                  FROM pg_default_acl d
                  LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace ORDER BY 1`,

  roles: `SELECT format('%s login=%s super=%s bypassrls=%s createrole=%s createdb=%s inherit=%s',
                  rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb,
                  rolinherit) AS line
            FROM pg_roles WHERE rolname LIKE 'freightos%' OR rolname LIKE 'op\\_%' ORDER BY 1`,

  memberships: `SELECT format('%s in %s admin=%s inherit=%s set=%s by=%s', m.rolname, r.rolname,
                        am.admin_option, am.inherit_option, am.set_option, g.rolname) AS line
                  FROM pg_auth_members am
                  JOIN pg_roles m ON m.oid = am.member
                  JOIN pg_roles r ON r.oid = am.roleid
                  JOIN pg_roles g ON g.oid = am.grantor
                 WHERE m.rolname LIKE 'freightos%' OR r.rolname LIKE 'freightos%' ORDER BY 1`,

  // Reference data is part of the schema contract, not user data: N1 seeds it, so a revert must
  // remove it and a re-apply must reproduce it exactly. Read from a table that may not exist, so
  // it is guarded rather than joined.
  referenceData: `SELECT line FROM (
                    SELECT format('namespace %s kind=%s', code, kind) AS line
                      FROM network_alias_namespaces
                    UNION ALL
                    SELECT format('relationship %s %s->%s', code, from_participant_type,
                                  to_participant_type)
                      FROM network_relationship_types) s ORDER BY 1`,
};

type Snapshot = Record<string, string[]>;

async function snapshot(client: Client): Promise<Snapshot> {
  const out: Snapshot = {};
  for (const [name, sql] of Object.entries(DIMENSIONS)) {
    if (name === 'referenceData') {
      const present = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname IN ('network_alias_namespaces', 'network_relationship_types')`,
      );
      if (present.rows[0]!.n !== '2') {
        out[name] = [];
        continue;
      }
    }
    out[name] = (await client.query<{ line: string }>(sql)).rows.map((r) => r.line);
  }
  return out;
}

/** Set difference in both directions, rendered so a failure names the object. */
function differences(a: Snapshot, b: Snapshot): string[] {
  const problems: string[] = [];
  for (const key of Object.keys(a)) {
    const inA = new Set(a[key]!);
    const inB = new Set(b[key]!);
    for (const line of a[key]!.filter((x) => !inB.has(x))) problems.push(`${key} -${line}`);
    for (const line of b[key]!.filter((x) => !inA.has(x))) problems.push(`${key} +${line}`);
  }
  return problems;
}

async function driveTo(version: number, from: 'empty' | 'here'): Promise<void> {
  if (from === 'empty') await db.resetToEmpty();
  const client = db.connectAsMigrator();
  await client.connect();
  try {
    const applied = (
      await client.query<{ n: string }>(
        `SELECT coalesce(max(version), 0)::text AS n FROM schema_migrations`,
      )
    ).rows[0]!.n;
    if (Number(applied) > version) await migrateDown(client, migrations, version);
    else
      await migrateUp(
        client,
        migrations.filter((m) => m.version <= version),
      );
  } catch (error) {
    // A database with no schema_migrations table yet is the `empty` case, not a failure.
    if (!/schema_migrations/.test(String(error))) throw error;
    await migrateUp(
      client,
      migrations.filter((m) => m.version <= version),
    );
  } finally {
    await client.end();
  }
}

async function read(): Promise<Snapshot> {
  const client = db.connectAs('postgres');
  await client.connect();
  try {
    return await snapshot(client);
  } finally {
    await client.end();
  }
}

describe('N1 is additive and exactly reversible', () => {
  let preN1: Snapshot;
  let firstUp: Snapshot;
  let afterDown: Snapshot;
  let secondUp: Snapshot;

  beforeAll(async () => {
    await driveTo(PRE_N1, 'empty');
    preN1 = await read();

    await driveTo(N1, 'here');
    firstUp = await read();

    await driveTo(PRE_N1, 'here');
    afterDown = await read();

    await driveTo(N1, 'here');
    secondUp = await read();
  }, 900_000);

  it('is a non-vacuous comparison', () => {
    // ANTI-VACUITY. Every assertion below compares two snapshots; if the snapshots were empty they
    // would all pass against a database in any state whatsoever.
    expect(preN1['relations']!.length, 'pre-N1 has no relations').toBeGreaterThan(20);
    expect(preN1['policies']!.length, 'pre-N1 has no policies').toBeGreaterThan(40);
    expect(preN1['functions']!.length, 'pre-N1 has no functions').toBeGreaterThan(50);
    expect(preN1['roles']!.length, 'pre-N1 has no freightos roles').toBeGreaterThan(5);
    expect(preN1['referenceData'], 'pre-N1 already has N1 reference data').toEqual([]);
  });

  it('adds exactly the five tables, three enums and five functions it claims', () => {
    const added = (key: string) => {
      const before = new Set(preN1[key]!);
      return firstUp[key]!.filter((x) => !before.has(x));
    };
    const removed = (key: string) => {
      const after = new Set(firstUp[key]!);
      return preN1[key]!.filter((x) => !after.has(x));
    };

    // ADDITIVE means nothing pre-existing changed. Not "few things changed" — nothing.
    for (const key of ['policies', 'functions', 'roles', 'memberships', 'schemas', 'defaultAcls']) {
      expect(removed(key), `N1 removed or altered a pre-existing ${key} entry`).toEqual([]);
    }
    expect(removed('relations'), 'N1 altered a pre-existing relation').toEqual([]);
    expect(removed('types'), 'N1 altered a pre-existing type').toEqual([]);

    const tables = added('relations')
      .map((l) => l.split(' ')[0]!)
      .filter((n) => !n.endsWith('schema_migrations'));
    expect(tables.sort()).toEqual([
      'public.network_alias_namespaces',
      'public.network_participant_aliases',
      'public.network_participant_relationships',
      'public.network_participants',
      'public.network_relationship_types',
    ]);

    expect(added('types').sort()).toEqual([
      'app.network_alias_verification_status [unverified,self_asserted,verified,suspended]',
      'app.network_participant_status [pending,active,suspended,revoked]',
      'app.network_participant_type [organization,person,facility,device,workload,agent,asset]',
    ]);

    const functions = added('functions').map((l) => l.split(' ')[0]!.replace(/\(.*$/, ''));
    expect(functions.sort()).toEqual([
      'app.network_alias_immutable',
      'app.network_participant_immutable',
      'app.network_relationship_endpoints_ok',
      'app.network_relationship_immutable',
      'app.network_set_provenance',
    ]);

    // NO NEW ROLE. This is the gate the N1 contract states as "role/ACL diff is zero", and it is
    // asserted on the cluster catalog rather than by reading the migration text for CREATE ROLE.
    expect(added('roles'), 'N1 created a PostgreSQL role').toEqual([]);
    expect(added('memberships'), 'N1 changed the cluster role graph').toEqual([]);
    expect(added('defaultAcls'), 'N1 changed default privileges').toEqual([]);
    expect(added('schemas'), 'N1 changed a schema ACL or owner').toEqual([]);
  });

  it('creates no SECURITY DEFINER function', () => {
    const before = new Set(preN1['functions']!);
    const definers = firstUp['functions']!.filter(
      (x) => !before.has(x) && x.includes(' secdef=t '),
    );
    // N1 adds no privileged code. The endpoint-validation trigger runs with INVOKER rights on
    // purpose: a definer there would be reading past RLS to validate a row, which is adding
    // privileged code to work around a policy.
    expect(definers, 'N1 introduced SECURITY DEFINER code').toEqual([]);
  });

  it('restores the pre-N1 database exactly when reverted', () => {
    // §31. Not "the tables are gone" — every dimension, both directions.
    expect(differences(preN1, afterDown)).toEqual([]);
  });

  it('reproduces the same database when re-applied', () => {
    expect(differences(firstUp, secondUp)).toEqual([]);
  });

  it('seeds exactly the governed reference vocabulary, and re-seeds it identically', () => {
    expect(firstUp['referenceData']).toEqual([
      'namespace duns kind=fixed',
      'namespace ein kind=fixed',
      'namespace gln kind=fixed',
      'namespace iata kind=fixed',
      'namespace lei kind=fixed',
      'namespace mc kind=fixed',
      'namespace scac kind=fixed',
      'namespace usdot kind=fixed',
      'relationship operated_by facility->organization',
      'relationship subsidiary_of organization->organization',
    ]);
    // Not `delegate_of`, `represents`, `acts_for`, `authorized_by` or `agent_for`: an
    // acting-authority vocabulary is ADR-N0003 layer C, which does not exist.
    expect(secondUp['referenceData']).toEqual(firstUp['referenceData']);
    expect(afterDown['referenceData']).toEqual([]);
  });

  it(`leaves no orphaned network artifact anywhere in the catalog after the revert`, async () => {
    // Belt and braces against the snapshot's own scoping, which is schema-filtered: ask the
    // catalog directly, by name prefix, across EVERY schema. The cases above leave the database at
    // N1, so this reverts once more rather than trusting a stale snapshot.
    await driveTo(PRE_N1, 'here');
    const client = db.connectAs('postgres');
    await client.connect();
    try {
      // `pg_catalog` is excluded because PostgreSQL ships `network_eq`, `network_cmp` and a dozen
      // more inet/cidr operator support functions. They are built-ins, not N1 leftovers, and no
      // migration can create or drop them.
      const leftovers = await client.query<{ line: string }>(
        `WITH ours AS (SELECT oid FROM pg_namespace
                        WHERE nspname NOT IN ('pg_catalog', 'information_schema'))
         SELECT format('relation %s.%s', n.nspname, c.relname) AS line
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname LIKE 'network\\_%' AND n.oid IN (SELECT oid FROM ours)
          UNION ALL
         SELECT format('function %s.%s', n.nspname, p.proname)
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE p.proname LIKE 'network\\_%' AND n.oid IN (SELECT oid FROM ours)
          UNION ALL
         SELECT format('type %s.%s', n.nspname, t.typname)
           FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname LIKE 'network\\_%' AND n.oid IN (SELECT oid FROM ours)
          UNION ALL
         SELECT format('trigger %s', t.tgname) FROM pg_trigger t
          WHERE NOT t.tgisinternal AND t.tgname LIKE 'network\\_%'
          ORDER BY 1`,
      );
      expect(leftovers.rows.map((r) => r.line)).toEqual([]);
    } finally {
      await client.end();
    }
  }, 300_000);

  it('is migration 28, with later migrations stacked above it', () => {
    // This used to assert N1 was the tip. N3 (0029) now sits above it, and the round trip above is
    // deliberately scoped to 27 -> 28 -> 27 -> 28 regardless: what it grades is whether N1 is
    // exactly reversible, not whether it happens to be the newest migration.
    expect(N1).toBe(28);
    expect(TIP).toBeGreaterThanOrEqual(N1);
  });
});
