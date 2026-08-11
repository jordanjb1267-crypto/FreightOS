import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadMigrations, migrateDown, migrateUp } from '../../src/migrator.ts';
import { MIGRATIONS_DIR } from '../../src/paths.ts';
import { acquireClusterRoleLock, releaseClusterRoleLock, TestDatabase } from './harness.ts';

// CLUSTER-GLOBAL EXCLUSION. N3 is the first network migration that CREATES AND DROPS A ROLE, and
// roles live in `pg_authid`, which is shared by every database in the cluster. A per-file test
// database gives no isolation whatsoever for that; the advisory lock is the isolation boundary.
beforeAll(async () => {
  await acquireClusterRoleLock();
}, 300_000);

afterAll(async () => {
  await releaseClusterRoleLock();
});

/**
 * N3 MIGRATION ROUND TRIP — N2 tip → up → down → up.
 *
 * The same obligation `network-registry-migration.test.ts` states for N1, and one obligation more.
 * N1 created no role, so its revert had nothing cluster-global to undo. **N3 creates
 * `freightos_event_writer`**, and a role is not a per-database object: dropping it fails while any
 * privilege anywhere still names it, and a revert that leaves it behind leaves a live login
 * credential in a cluster that is supposed to have returned to N2. So role creation AND role
 * removal are both graded here, on the catalog, in both directions.
 *
 * WHY A SEPARATE FILE. `network-registry-migration.test.ts` is scoped to 27 → 28 → 27 → 28 and
 * grades N1's reversibility; widening it to N3 would change a green gate for reasons unrelated to
 * what it was written to prove. This file states the new obligation without disturbing the old one.
 *
 * The comparison is by SET DIFFERENCE, printed both ways, because "N3 down left something behind"
 * and "N3 down took something with it" are different defects and a length check distinguishes
 * neither.
 */
const db = new TestDatabase('freightos_test_journal_migration');

const migrations = loadMigrations(MIGRATIONS_DIR);
const TIP = Math.max(...migrations.map((m) => m.version));
/** The version this migration introduces the event journal at. */
const N3 = 29;
const PRE_N3 = N3 - 1;

/**
 * ACL rendered order-independently — PostgreSQL stores `aclitem[]` in grant order, not canonical
 * order, so two identical privilege sets can differ as text purely by the order GRANT ran in.
 */
const ACL = (column: string) =>
  `coalesce((SELECT '{' || string_agg(a::text, ',' ORDER BY a::text) || '}'
               FROM unnest(${column}) AS a), '-')`;

const DIMENSIONS: Readonly<Record<string, string>> = {
  relations: `SELECT format('%s.%s kind=%s owner=%s rls=%s force=%s acl=%s',
                     n.nspname, c.relname, c.relkind, pg_get_userbyid(c.relowner),
                     c.relrowsecurity, c.relforcerowsecurity, ${ACL('c.relacl')}) AS line
                FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relkind IN ('r', 'v', 'm', 'S', 'p')
                 AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                 AND n.nspname NOT LIKE 'pg_toast%' ORDER BY 1`,

  // COLUMN-LEVEL privileges get their own dimension. N3's least-privilege design rests entirely on
  // them — the writer's journal read is `SELECT (event_id, event_fingerprint)` and nothing more —
  // and `relacl` does not carry them, so a revert that dropped the table but left a column grant
  // behind would be invisible to every other dimension here.
  columnAcls: `SELECT format('%s.%s.%s %s', n.nspname, c.relname, a.attname, ${ACL('a.attacl')})
                      AS line
                 FROM pg_attribute a
                 JOIN pg_class c ON c.oid = a.attrelid
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
                  AND n.nspname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1`,

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
                  JOIN pg_namespace n ON n.oid = con.connamespace
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

  // Database-level privileges. §4 of the down migration revokes them explicitly, because a
  // lingering CONNECT grant blocks `DROP ROLE` on its own and would otherwise only surface as an
  // opaque dependency error.
  databaseAcls: `SELECT format('%s %s', datname, ${ACL('datacl')}) AS line
                   FROM pg_database WHERE datname = current_database()`,

  defaultAcls: `SELECT format('%s %s %s %s', pg_get_userbyid(d.defaclrole),
                        coalesce(n.nspname, '-'), d.defaclobjtype, d.defaclacl::text) AS line
                  FROM pg_default_acl d
                  LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace ORDER BY 1`,

  // `::text` on every flag — `format('%s', boolean)` renders `t`/`f`, which reads as a typo next to
  // a spelled-out expectation and has already cost this repository a debugging session.
  roles: `SELECT format('%s login=%s super=%s bypassrls=%s createrole=%s createdb=%s inherit=%s',
                  rolname, rolcanlogin::text, rolsuper::text, rolbypassrls::text,
                  rolcreaterole::text, rolcreatedb::text, rolinherit::text) AS line
            FROM pg_roles WHERE rolname LIKE 'freightos%' ORDER BY 1`,

  memberships: `SELECT format('%s in %s admin=%s inherit=%s set=%s', m.rolname, r.rolname,
                        am.admin_option::text, am.inherit_option::text, am.set_option::text) AS line
                  FROM pg_auth_members am
                  JOIN pg_roles m ON m.oid = am.member
                  JOIN pg_roles r ON r.oid = am.roleid
                 WHERE m.rolname LIKE 'freightos%' OR r.rolname LIKE 'freightos%' ORDER BY 1`,

  // The schema projection is seeded by the migration, so it is part of the schema contract: a
  // revert must remove it and a re-apply must reproduce it byte for byte. Read from a table that
  // may not exist, so it is guarded rather than joined.
  projection: `SELECT format('%s -> %s v%s %s %s %s', durable_schema_ref, registry_schema_id,
                      version, artifact_class, content_hash, status) AS line
                 FROM network_schema_versions ORDER BY 1`,
};

type Snapshot = Record<string, string[]>;

async function snapshot(client: Client): Promise<Snapshot> {
  const out: Snapshot = {};
  for (const [name, sql] of Object.entries(DIMENSIONS)) {
    if (name === 'projection') {
      const present = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'network_schema_versions'`,
      );
      if (present.rows[0]!.n !== '1') {
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

/**
 * Privilege references to the writer role, split into "this database" and "the whole cluster".
 *
 * `pg_shdepend` is the catalog `DROP ROLE` itself consults, and it spans every database. A
 * database-level grant is recorded with `dbid = 0` and the database in `objid`, so it needs its own
 * arm — otherwise a lingering CONNECT would count as somebody else's problem.
 */
async function writerReferences(client: Client): Promise<{ local: number; cluster: number }> {
  const r = await client.query<{ local: string; cluster: string }>(
    `SELECT count(*) FILTER (
              WHERE s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
                 OR (s.classid = 'pg_database'::regclass
                     AND s.objid = (SELECT oid FROM pg_database WHERE datname = current_database()))
            )::text AS local,
            count(*)::text AS cluster
       FROM pg_shdepend s JOIN pg_roles r ON r.oid = s.refobjid
      WHERE r.rolname = 'freightos_event_writer'`,
  );
  return { local: Number(r.rows[0]!.local), cluster: Number(r.rows[0]!.cluster) };
}

const WRITER_ROLE_LINE =
  'freightos_event_writer login=true super=false bypassrls=false createrole=false ' +
  'createdb=false inherit=true';

describe('N3 is additive and exactly reversible', () => {
  let preN3: Snapshot;
  let firstUp: Snapshot;
  let afterDown: Snapshot;
  let secondUp: Snapshot;
  /** Measured, not assumed — see `the writer role is cluster-global` below. */
  let refsAfterDown: { local: number; cluster: number };

  beforeAll(async () => {
    await driveTo(PRE_N3, 'empty');
    preN3 = await read();

    await driveTo(N3, 'here');
    firstUp = await read();

    await driveTo(PRE_N3, 'here');
    afterDown = await read();
    const probe = db.connectAs('postgres');
    await probe.connect();
    try {
      refsAfterDown = await writerReferences(probe);
    } finally {
      await probe.end();
    }

    await driveTo(N3, 'here');
    secondUp = await read();
  }, 900_000);

  it('is a non-vacuous comparison', () => {
    // ANTI-VACUITY. Every assertion below compares two snapshots. If the snapshots were empty they
    // would all pass against a database in any state whatsoever, including an empty one.
    expect(preN3['relations']!.length, 'pre-N3 has no relations').toBeGreaterThan(25);
    expect(preN3['policies']!.length, 'pre-N3 has no policies').toBeGreaterThan(50);
    expect(preN3['functions']!.length, 'pre-N3 has no functions').toBeGreaterThan(50);
    expect(preN3['roles']!.length, 'pre-N3 has no freightos roles').toBeGreaterThan(4);
    // N1 must already be there — this round trip is 28 → 29 → 28 → 29, not 0 → 29.
    expect(preN3['relations']!.filter((l) => l.includes('network_participants'))).toHaveLength(1);
    expect(preN3['projection'], 'pre-N3 already has the N3 schema projection').toEqual([]);
  });

  it('adds exactly the two tables, one enum and one function it claims', () => {
    const added = (key: string) => {
      const before = new Set(preN3[key]!);
      return firstUp[key]!.filter((x) => !before.has(x));
    };
    const removed = (key: string) => {
      const after = new Set(firstUp[key]!);
      return preN3[key]!.filter((x) => !after.has(x));
    };

    // ADDITIVE means nothing pre-existing changed. Not "few things changed" — nothing. The one
    // deliberate exception is `network_participants`, whose ACL and column ACL N3 extends for the
    // writer's narrow read; it is listed explicitly below rather than excluded from the sweep.
    for (const key of ['functions', 'defaultAcls', 'databaseAcls', 'indexes']) {
      expect(removed(key), `N3 removed or altered a pre-existing ${key} entry`).toEqual([]);
    }
    expect(removed('types'), 'N3 altered a pre-existing type').toEqual([]);
    expect(removed('policies'), 'N3 removed or altered a pre-existing policy').toEqual([]);
    expect(removed('columns'), 'N3 altered a pre-existing column').toEqual([]);
    expect(removed('triggers'), 'N3 altered a pre-existing trigger').toEqual([]);

    // NOT ONE pre-existing relation is altered — the participant registry included. The three
    // approved N1 touches are a UNIQUE constraint, a policy and three COLUMN grants, and column
    // privileges do not live in `relacl`, so the writer gains no table-level privilege on
    // `network_participants` at all. Each touch is graded in the dimension it actually lands in:
    // `constraints`, `policies` and `columnAcls`.
    expect(removed('relations'), 'N3 altered a pre-existing relation').toEqual([]);
    const participants = firstUp['relations']!.find((l) =>
      l.startsWith('public.network_participants '),
    )!;
    expect(
      participants,
      'the writer holds a TABLE-level privilege on the participant registry',
    ).not.toContain('freightos_event_writer');

    expect(
      added('relations')
        .map((l) => l.split(' ')[0]!)
        .sort(),
    ).toEqual(['public.network_events', 'public.network_schema_versions']);

    // The two additive N1 touches that are not column grants, named exactly.
    expect(
      added('constraints').filter((l) => l.startsWith('public.network_participants ')),
    ).toEqual([
      'public.network_participants network_participants_id_type_key UNIQUE (id, participant_type)',
    ]);
    expect(
      added('policies')
        .filter((l) => l.startsWith('public.network_participants '))
        .map((l) => l.split(' ')[1]),
    ).toEqual(['network_participants_event_writer_read']);

    expect(added('types').sort()).toEqual([
      'app.network_event_class ' +
        '[observed,asserted,verified,derived,predicted,command_result,correction,dispute]',
    ]);

    const functions = added('functions').map((l) => l.split(' ')[0]!.replace(/\(.*$/, ''));
    expect(functions.sort()).toEqual(['app.network_event_acceptance']);

    expect(added('defaultAcls'), 'N3 changed default privileges').toEqual([]);
    expect(added('databaseAcls'), 'N3 changed database-level privileges').toEqual([]);

    // `schemas` legitimately changes — `GRANT USAGE ON SCHEMA app, public` is how the writer can
    // reach the journal at all. So it is checked as a DIFF OF ACL ENTRIES rather than waved past:
    // the two schemas gain exactly one grantee each, it is the writer, the privilege is bare
    // USAGE, and no pre-existing grantee is disturbed. Owner is unchanged in both.
    const aclEntries = (line: string) =>
      (/acl=\{(.*)\}$/.exec(line)?.[1] ?? '').split(',').filter(Boolean);
    for (const schema of ['app', 'public']) {
      const before = preN3['schemas']!.find((l) => l.startsWith(`${schema} `))!;
      const after = firstUp['schemas']!.find((l) => l.startsWith(`${schema} `))!;
      expect(after.split(' acl=')[0], `${schema} owner changed`).toBe(before.split(' acl=')[0]);
      const gained = aclEntries(after).filter((e) => !aclEntries(before).includes(e));
      const lost = aclEntries(before).filter((e) => !aclEntries(after).includes(e));
      expect(lost, `N3 removed a grantee from schema ${schema}`).toEqual([]);
      expect(gained).toHaveLength(1);
      expect(gained[0], `schema ${schema} grant is not a bare USAGE for the writer`).toMatch(
        /^freightos_event_writer=U\/[a-z_]+$/,
      );
    }
  });

  it('creates exactly ONE PostgreSQL role, and it is the journal writer', () => {
    // §25's expectation was zero new roles; N3 states and justifies exactly one. The point of the
    // gate is that the number is DECLARED and CHECKED, not that it is zero — a silently added role
    // is the failure mode.
    //
    // GRADED ON NAMES, AND ON THE WRITER'S OWN ATTRIBUTES — the N1 CI lesson applied rather than
    // restated. Two things make the obvious formulations wrong here. Roles are cluster-global, so
    // another test database sitting at N3 means `freightos_event_writer` already exists in `preN3`
    // and a delta assertion would come up EMPTY while proving nothing. And other files mint logins
    // and flip attributes on unrelated `freightos_%` roles, so pinning the whole roster's
    // attributes would grade this migration on somebody else's changes.
    //
    // What is invariant, and is exactly the claim: N3 introduces no role NAME but the writer's, and
    // the writer holds precisely the declared attributes.
    const names = (rows: string[]) => rows.map((l) => l.split(' ')[0]!);
    const introduced = names(firstUp['roles']!).filter((n) => !names(preN3['roles']!).includes(n));
    expect(introduced).toEqual(
      names(preN3['roles']!).includes('freightos_event_writer') ? [] : ['freightos_event_writer'],
    );
    expect(names(firstUp['roles']!)).toContain('freightos_event_writer');
    expect(firstUp['roles']!.find((l) => l.startsWith('freightos_event_writer '))).toBe(
      WRITER_ROLE_LINE,
    );

    // The role graph grows by exactly one edge, and it is not one this migration writes.
    // PostgreSQL gives a CREATEROLE non-superuser `ADMIN TRUE, INHERIT FALSE, SET FALSE` over
    // every role it creates — the behaviour `scripts/converge-migration-authority.sql` already
    // documents. ADMIN is what lets the revert drop the role. INHERIT or SET would hand the
    // migrator the writer's INSERT on an immutable journal, so both are asserted false here as
    // well as at deploy time.
    const IMPLICIT_EDGE =
      'freightos_migrator in freightos_event_writer admin=true inherit=false set=false';
    // Present absolutely — this holds whether the role was created by this run or already existed
    // in the cluster.
    expect(firstUp['memberships']).toContain(IMPLICIT_EDGE);
    // …and it is the ONLY edge this run could have introduced.
    const beforeMemberships = new Set(preN3['memberships']!);
    expect(
      firstUp['memberships']!.filter((x) => !beforeMemberships.has(x) && x !== IMPLICIT_EDGE),
    ).toEqual([]);

    // The writer itself is a LEAF: it holds membership in nothing, so there is no role it can
    // inherit privileges from and none it can become.
    expect(
      firstUp['memberships']!.filter((x) => x.startsWith('freightos_event_writer in ')),
      'the writer holds membership in another role',
    ).toEqual([]);

    // …and no membership of the writer, from any role, is inheriting or SET-able.
    expect(
      firstUp['memberships']!.filter(
        (x) => x.includes(' in freightos_event_writer ') && !x.endsWith('inherit=false set=false'),
      ),
      'a membership of the writer confers INHERIT or SET',
    ).toEqual([]);
  });

  it('grants the writer a column-scoped read and nothing wider', () => {
    const before = new Set(preN3['columnAcls']!);
    const added = firstUp['columnAcls']!.filter((x) => !before.has(x));
    // Exactly five column grants: two on the journal, three on the participant registry. If a
    // future change widens the writer to a whole-table SELECT, `relacl` grows and this list
    // shrinks — either direction fails.
    expect(added.map((l) => l.split(' ')[0]).sort()).toEqual([
      'public.network_events.event_fingerprint',
      'public.network_events.event_id',
      'public.network_participants.id',
      'public.network_participants.participant_type',
      'public.network_participants.tenant_id',
    ]);
    for (const line of added) {
      expect(line, `${line} is not a bare SELECT grant`).toMatch(
        /\{freightos_event_writer=r\/[a-z_]+\}$/,
      );
    }
    // …and no table-level SELECT on the journal for the writer, which would make the column
    // grants decorative.
    const journal = firstUp['relations']!.find((l) => l.startsWith('public.network_events '))!;
    expect(journal).not.toMatch(/freightos_event_writer=[a-qs-z]*r/);
  });

  it('creates no SECURITY DEFINER function', () => {
    const before = new Set(preN3['functions']!);
    const definers = firstUp['functions']!.filter(
      (x) => !before.has(x) && x.includes(' secdef=t '),
    );
    // The acceptance trigger runs with INVOKER rights on purpose: a definer there would read past
    // the participant policy to resolve the tenant, which is adding privileged code to work around
    // row-level security.
    expect(definers, 'N3 introduced SECURITY DEFINER code').toEqual([]);
  });

  it('releases every privilege it took in THIS database when reverted', () => {
    // THE UNCONDITIONAL HALF, and the one 0029 down actually controls. Every dimension, both
    // directions — with one permitted residue, stated exactly rather than filtered out of the
    // snapshot: the role row itself, and only when this run is what created it AND another database
    // still holds the shared role. If the writer was already in the cluster before this file ran it
    // is in both snapshots and there is no residue at all. Nothing else may survive, either way.
    const inPre = preN3['roles']!.some((l) => l.startsWith('freightos_event_writer '));
    const inAfterDown = afterDown['roles']!.some((l) => l.startsWith('freightos_event_writer '));
    const permitted = !inPre && inAfterDown ? [`roles +${WRITER_ROLE_LINE}`] : [];
    expect(differences(preN3, afterDown)).toEqual(permitted);
  });

  it('the writer role is cluster-global, and is dropped by the last database to release it', async () => {
    // A role is not a per-database object, and PostgreSQL offers no way to revoke a privilege in a
    // database you are not connected to. So the contract 0029 down can honour is exactly this:
    //
    //   1. ZERO references from this database — unconditional, and asserted first.
    //   2. The role is gone IF AND ONLY IF nothing anywhere else still holds it.
    //
    // Asserting (2) alone would be untestable in a cluster running other N3 databases; asserting
    // only "the role is gone" would be a gate that passes or fails on which test files ran first.
    expect(
      refsAfterDown.local,
      'the revert left a privilege reference behind in this database',
    ).toBe(0);

    // Read from the afterDown SNAPSHOT, not from a fresh query: by now the second up has re-applied
    // 0029 and the role exists again, so a live query would answer a different question.
    const survived = afterDown['roles']!.some((l) => l.startsWith('freightos_event_writer '));
    expect(survived).toBe(refsAfterDown.cluster > 0);
  });

  it('reproduces the same database when re-applied — the role included', () => {
    // Role CREATION is idempotent in the up migration (`IF NOT EXISTS`), so re-applying after a
    // revert must reach the same attributes and the same grants, not a subset.
    expect(differences(firstUp, secondUp)).toEqual([]);
  });

  it('seeds exactly the nine governed contracts, and re-seeds them identically', () => {
    const refs = firstUp['projection']!.map((l) => l.split(' ')[0]);
    expect(refs).toEqual([
      'https://schemas.rigreceipts.com/network/capability-advertisement.v1.json',
      'https://schemas.rigreceipts.com/network/command-envelope.v1.json',
      'https://schemas.rigreceipts.com/network/consent-grant.v1.json',
      'https://schemas.rigreceipts.com/network/event-correction.v1.json',
      'https://schemas.rigreceipts.com/network/event-envelope.v1.json',
      'https://schemas.rigreceipts.com/network/evidence-envelope.v1.json',
      'https://schemas.rigreceipts.com/network/logistics-object-reference.v1.json',
      'https://schemas.rigreceipts.com/network/participant-identity.v1.json',
      'https://schemas.rigreceipts.com/network/workflow-state.v1.json',
    ]);
    // Every durable reference is production-namespaced. Not one `.example` or `.local` identity is
    // seeded into a table that permanent events take foreign keys against.
    for (const ref of refs) {
      expect(ref!.startsWith('https://schemas.rigreceipts.com/network/'), ref!).toBe(true);
    }
    expect(secondUp['projection']).toEqual(firstUp['projection']);
    expect(afterDown['projection']).toEqual([]);
  });

  it('leaves no orphaned journal artifact anywhere in the catalog after the revert', async () => {
    // Belt and braces against the snapshot's own scoping, which is schema-filtered: ask the
    // catalog directly, by name, across every schema. The cases above leave the database at N3, so
    // this reverts once more rather than trusting a stale snapshot.
    //
    // The ROLE is deliberately not in this list — its lifecycle is cluster-conditional and is
    // graded by `the writer role is cluster-global` above. Every PRIVILEGE naming it is here, and
    // those are unconditional: a retained role with no grants left is inert, a retained grant is
    // not.
    await driveTo(PRE_N3, 'here');
    const client = db.connectAs('postgres');
    await client.connect();
    try {
      const leftovers = await client.query<{ line: string }>(
        `WITH ours AS (SELECT oid FROM pg_namespace
                        WHERE nspname NOT IN ('pg_catalog', 'information_schema'))
         SELECT format('relation %s.%s', n.nspname, c.relname) AS line
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname IN ('network_events', 'network_schema_versions')
            AND n.oid IN (SELECT oid FROM ours)
          UNION ALL
         SELECT format('function %s.%s', n.nspname, p.proname)
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE p.proname = 'network_event_acceptance' AND n.oid IN (SELECT oid FROM ours)
          UNION ALL
         SELECT format('type %s.%s', n.nspname, t.typname)
           FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'network_event_class' AND n.oid IN (SELECT oid FROM ours)
          UNION ALL
         SELECT format('grant naming the writer: %s', c.relname)
           FROM pg_class c
          WHERE c.relacl::text LIKE '%freightos_event_writer%'
          UNION ALL
         SELECT format('column grant naming the writer: %s.%s', c.relname, a.attname)
           FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
          WHERE a.attacl::text LIKE '%freightos_event_writer%'
          UNION ALL
         SELECT format('constraint %s', conname) FROM pg_constraint
          WHERE conname = 'network_participants_id_type_key'
          UNION ALL
         SELECT format('policy %s', policyname) FROM pg_policies
          WHERE policyname = 'network_participants_event_writer_read'
          ORDER BY 1`,
      );
      expect(leftovers.rows.map((r) => r.line)).toEqual([]);
    } finally {
      await client.end();
    }
  }, 300_000);

  it('is migration 29, at the tip', () => {
    expect(N3).toBe(29);
    expect(TIP).toBe(N3);
  });
});
