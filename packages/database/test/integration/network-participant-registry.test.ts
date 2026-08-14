import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withLegalContext, type Queryable } from '../../src/session.ts';
import { carrierContext, TENANT_A, TENANT_B, TestDatabase } from './harness.ts';
import {
  ALL_NETWORK_RELATIONS,
  N6_DELIVERY_RELATIONS,
  NETWORK_RELATION_LAYER,
} from './network-relations.ts';
import type { IdentityFixture } from './identity-harness.ts';
import { seedVerifiedFixture } from './sr2-harness.ts';
import {
  fixtureAdministrator,
  fixtureOperator,
  withAuthenticatedTestPrincipal,
  type TestPrincipal,
} from './verified-test-auth.ts';

/**
 * N1 — THE NETWORK PARTICIPANT REGISTRY IS INERT.
 *
 * ADR-N0003 states the invariant this whole file exists to attack:
 *
 *   CREATING, POSSESSING, EDITING, RELATING, OR ALIASING A NETWORK PARTICIPANT RECORD
 *   CONFERS ZERO SECURITY AUTHORITY.
 *
 * "A query returned no rows" is not evidence of that. A registry could be perfectly isolated and
 * still be read by an authorization path somewhere, and a mutation test that only re-runs the same
 * SELECT would never see it. So every mutation below is graded against a PRIVILEGE SNAPSHOT: the
 * eighteen `app.user_has_permission` outcomes and their service-account counterparts, the resolved
 * session context, the PostgreSQL role graph as `pg_has_role` reports it, every table privilege the
 * runtime role holds, every function privilege it holds, and the row count it can actually see in
 * every table in the database. The assertion names what did not change.
 *
 * The five mutations are the ones the N1 contract enumerates, and each attacks a different
 * plausible-looking route from identity metadata to authority:
 *
 *   A  display_name matching an administrator's operator role name — name collision
 *   B  a verified alias in `usdot`/`ein` carrying a real administrator's identifier — alias as credential
 *   C  a relationship to the most privileged-looking participant available — authority by association
 *   D  tenant_id pointing at another tenant — self-assigned tenancy
 *   E  status='active' at maximal assurance — assurance as entitlement
 *
 * Beyond the mutations, the file covers the read model a nullable tenant discriminator forces N1 to
 * state for itself (ADR-N0011), alias uniqueness/history/reassignment (ADR-N0006), relationship
 * integrity and revocation, canonical-ID immutability (ADR-N0004), derived provenance, and a
 * STRUCTURAL gate that reads the catalog to prove no authorization object mentions a network table
 * at all — the property behavioural tests can only sample.
 */
const db = new TestDatabase('freightos_test_network_registry');

/** The eighteen permission keys migration 0008 seeds. The whole catalogue, not a sample. */
const PERMISSION_KEYS = [
  'identity.organization_node.read',
  'identity.organization_node.write',
  'identity.legal_entity.read',
  'identity.legal_entity.write',
  'identity.operating_authority.read',
  'identity.operating_authority.write',
  'identity.carrier_appointment.read',
  'identity.carrier_appointment.write',
  'identity.user.read',
  'identity.user.write',
  'identity.membership.read',
  'identity.membership.write',
  'identity.role.read',
  'identity.role.write',
  'identity.service_account.read',
  'identity.service_account.write',
  'identity.policy_binding.read',
  'identity.policy_binding.write',
] as const;

interface PrivilegeSnapshot {
  /** `app.user_has_permission` for every key, for the acting principal. */
  permissions: string[];
  /** `app.service_account_has_permission` for every key, for the fixture's service account. */
  servicePermissions: string[];
  /** The resolved session context and the control-plane predicate. */
  context: string[];
  /** `pg_has_role` for the connected role against every role in the cluster. */
  roleGraph: string[];
  /** `has_table_privilege` for every table, every privilege. */
  tablePrivileges: string[];
  /** `has_function_privilege` for every function in app/admin/authn. */
  functionPrivileges: string[];
  /** What the session can actually SEE — RLS-filtered row counts, or the refusal. */
  visibility: string[];
}

/**
 * Read the privilege state of a live session.
 *
 * Everything here is asked of the DATABASE about the CURRENT session, never computed in JavaScript.
 * A snapshot that a test could influence would grade nothing.
 */
async function readPrivileges(
  client: Queryable,
  fixture: IdentityFixture,
  namedRoles: readonly string[],
): Promise<PrivilegeSnapshot> {
  const rows = async (sql: string, params: readonly unknown[] = []): Promise<string[]> =>
    (await client.query<{ line: string }>(sql, [...params])).rows.map((r) => r.line);

  const permissions = await rows(
    `SELECT format('%s=%s', k, app.user_has_permission($1, $2, k, now())::text) AS line
       FROM unnest($3::text[]) AS k ORDER BY 1`,
    [fixture.tenantId, fixture.userId, [...PERMISSION_KEYS]],
  );

  const servicePermissions = await rows(
    `SELECT format('%s=%s', k, app.service_account_has_permission($1, $2, k, now())::text) AS line
       FROM unnest($3::text[]) AS k ORDER BY 1`,
    [fixture.tenantId, fixture.serviceAccountId, [...PERMISSION_KEYS]],
  );

  const context = await rows(
    `SELECT line FROM (VALUES
       (format('current_user=%s', current_user)),
       (format('session_user=%s', session_user)),
       (format('is_control_plane=%s', app.is_control_plane()::text)),
       (format('tenant=%s', coalesce(app.current_tenant_id()::text, '-'))),
       (format('actor=%s', coalesce(app.current_actor_id(), '-'))),
       (format('user=%s', coalesce(app.current_user_id()::text, '-'))),
       (format('node=%s', coalesce(app.current_organization_node_id()::text, '-'))),
       (format('legal_entity=%s', coalesce(app.current_legal_entity_id()::text, '-'))),
       (format('authority_class=%s', coalesce(app.current_legal_authority_class()::text, '-'))),
       (format('operating_context=%s', coalesce(app.current_operating_context()::text, '-'))),
       (format('scope_nodes=%s', (SELECT count(*) FROM app.verified_scope_node_ids()))),
       (format('scope_service_accounts=%s',
               (SELECT count(*) FROM app.verified_scope_service_account_ids())))
     ) AS t(line) ORDER BY 1`,
  );

  // POSTGRESQL ROLES ARE CLUSTER-GLOBAL, AND THIS DIMENSION MUST NOT DEPEND ON THE ROSTER.
  //
  // The first version of this read enumerated `pg_roles` outright. That made the snapshot depend on
  // every role in the CLUSTER, and roles are not per-database: other integration files provision
  // their own `op_<hash>_<label>` operator logins as they run, so a role minted by an unrelated file
  // between the `before` and `after` snapshots showed up as a difference. All five mutation cases
  // failed in CI on exactly that — every added line read `usage=false member=false set=false`, a new
  // role conferring nothing on anybody. It passed locally only because the cluster had accumulated
  // those roles during earlier runs, so none was new by the time this file ran. That is luck, not a
  // property, and it is the same cluster-global isolation class the migration-authority work closed.
  //
  // The fix keeps the security question and drops the roster. What matters is what the acting
  // principal HOLDS, so the row set is:
  //
  //   * every `freightos_%` role — the fixed, cluster-stable authority set, included whether held or
  //     not, so LOSING one is a difference too;
  //   * every role this file itself provisioned, named explicitly, so the administrator login that
  //     mutation A impersonates is still graded rather than filtered away;
  //   * every role the principal holds by ANY mode, whatever its name.
  //
  // That last clause is what keeps this STRICTER than the version it replaces, not weaker: a brand
  // new role the principal has been made a member of appears immediately, while a brand new role it
  // holds nothing on cannot perturb the comparison. Escalation is visible; unrelated churn is not.
  const roleGraph = await rows(
    `SELECT format('%s usage=%s member=%s set=%s', r.rolname,
                   pg_has_role(current_user, r.oid, 'USAGE')::text,
                   pg_has_role(current_user, r.oid, 'MEMBER')::text,
                   pg_has_role(current_user, r.oid, 'SET')::text) AS line
       FROM pg_roles r
      WHERE r.rolname LIKE 'freightos%'
         OR r.rolname = ANY($1)
         OR pg_has_role(current_user, r.oid, 'USAGE')
         OR pg_has_role(current_user, r.oid, 'MEMBER')
         OR pg_has_role(current_user, r.oid, 'SET')
      ORDER BY 1`,
    [[...namedRoles]],
  );

  const tablePrivileges = await rows(
    `SELECT format('%s.%s %s=%s', n.nspname, c.relname, p,
                   has_table_privilege(current_user, c.oid, p)::text) AS line
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS p
      WHERE c.relkind IN ('r', 'v', 'p')
        AND n.nspname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1`,
  );

  const functionPrivileges = await rows(
    `SELECT format('%s.%s(%s)=%s', n.nspname, f.proname, oidvectortypes(f.proargtypes),
                   has_function_privilege(current_user, f.oid, 'EXECUTE')::text) AS line
       FROM pg_proc f JOIN pg_namespace n ON n.oid = f.pronamespace
      WHERE n.nspname IN ('app', 'admin', 'authn') ORDER BY 1`,
  );

  // WHAT THE SESSION CAN SEE, table by table, through RLS. A dynamic sweep is not expressible in
  // one statement without a function this role may not create, so the tables are enumerated first
  // and read one at a time; a refusal is recorded rather than thrown, because "denied" is itself a
  // privilege fact that must not change.
  //
  // A DIGEST, NOT A COUNT. Counting was the first version and it is too weak to grade a mutation:
  // the two tenant fixtures are symmetric, so tenant A and tenant B see the same NUMBER of rows in
  // every table while seeing entirely different rows. A count therefore could not tell the two
  // sessions apart, and would equally have missed a leak that swapped one row for another. Hashing
  // the whole row set — order-independently, so plan changes do not register as differences —
  // grades WHICH rows are visible.
  // Tables the session may NOT select are recorded from the catalog rather than by attempting the
  // read and catching. That is not tidiness — `withAuthenticatedTestPrincipal` runs inside a
  // transaction, and one `permission denied` aborts it, so every subsequent read in the sweep would
  // fail with 25P02 and the whole dimension would collapse to the same constant for every session.
  // It did, in the first version of this file, and the tenant-separation control below is what
  // caught it.
  const tables = await rows(
    `SELECT format('%s.%s|%s', n.nspname, c.relname,
                   has_table_privilege(current_user, c.oid, 'SELECT')::text) AS line
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1`,
  );
  const visibility: string[] = [];
  for (const entry of tables) {
    const [table, selectable] = entry.split('|') as [string, string];
    if (selectable !== 'true') {
      visibility.push(`${table} no-select`);
      continue;
    }
    const r = await client.query<{ n: string; digest: string }>(
      `SELECT count(*)::text AS n,
              md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS digest
         FROM ${table} x`,
    );
    visibility.push(`${table} rows=${r.rows[0]!.n} digest=${r.rows[0]!.digest}`);
  }

  return {
    permissions,
    servicePermissions,
    context,
    roleGraph,
    tablePrivileges,
    functionPrivileges,
    visibility,
  };
}

/**
 * The privilege state of `principal`, read through a real verified session.
 *
 * NETWORK TABLES ARE EXCLUDED FROM THE VISIBILITY DIMENSION ONLY, and nowhere else. Registering a
 * participant obviously changes how many participants there are; that is the mutation, not its
 * effect. Every other dimension — permissions, context, role graph, table and function privileges —
 * is compared in full, including the network tables' own ACLs.
 */
async function privilegesOf(
  principal: TestPrincipal,
  fixture: IdentityFixture,
): Promise<PrivilegeSnapshot> {
  const snap = await withAuthenticatedTestPrincipal(db, principal, (c) =>
    readPrivileges(c, fixture, [adminOperatorRole]),
  );
  return { ...snap, visibility: snap.visibility.filter((l) => !l.includes('.network_')) };
}

/** Run `work` over a control-plane connection — the only role that may write external identity. */
async function asControlPlane<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = db.connectAs('freightos_control_plane');
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** Register a participant over the control plane and return its canonical id. */
async function registerParticipant(
  fields: Readonly<{
    type: string;
    displayName: string;
    tenantId?: string | null;
    status?: string;
    assuranceLevel?: string | null;
  }>,
): Promise<string> {
  return asControlPlane(async (client) => {
    const r = await client.query<{ id: string }>(
      `INSERT INTO network_participants
         (participant_type, display_name, tenant_id, status, assurance_level, source_system,
          created_by, updated_by)
       VALUES ($1::app.network_participant_type, $2, $3, $4::app.network_participant_status, $5,
               'test:n1', 'ignored', 'ignored')
       RETURNING id`,
      [
        fields.type,
        fields.displayName,
        fields.tenantId ?? null,
        fields.status ?? 'active',
        fields.assuranceLevel ?? null,
      ],
    );
    return r.rows[0]!.id;
  });
}

let fixtureA: IdentityFixture;
let fixtureB: IdentityFixture;
/** A real PostgreSQL login holding `freightos_admin` — the name mutation A tries to impersonate. */
let adminOperatorRole: string;

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  fixtureA = await seedVerifiedFixture(db, TENANT_A);
  fixtureB = await seedVerifiedFixture(db, TENANT_B);
  adminOperatorRole = await db.provisionOperator('n1adm', TENANT_A, fixtureA.adminUserId);
}, 300_000);

describe('the privilege oracle grades something', () => {
  it('reports a mixed permission set, so equality below is not trivially true', async () => {
    const before = await privilegesOf(fixtureOperator(fixtureA), fixtureA);

    // ANTI-VACUITY. If every permission were true, or every one false, or the snapshot empty, the
    // mutation tests would pass against a database in any state at all.
    expect(before.permissions).toHaveLength(PERMISSION_KEYS.length);
    expect(
      before.permissions.filter((p) => p.endsWith('=true')).length,
      'the acting principal holds no permission at all',
    ).toBeGreaterThan(0);
    expect(
      before.permissions.filter((p) => p.endsWith('=false')).length,
      'the acting principal already holds every permission — nothing left to escalate to',
    ).toBeGreaterThan(0);
    expect(before.roleGraph.length).toBeGreaterThan(5);
    // The role dimension is filtered rather than a whole-cluster dump, so it has to be shown to
    // still carry the roles that matter: the fixed authority set, the impersonated administrator
    // login, and at least one role the principal actually holds.
    for (const role of [
      'freightos_app',
      'freightos_admin',
      'freightos_admin_owner',
      'freightos_control_plane',
      'freightos_migrator',
    ]) {
      expect(
        before.roleGraph.map((l) => l.split(' ')[0]),
        `${role} dropped out of the role dimension`,
      ).toContain(role);
    }
    expect(
      before.roleGraph.filter((l) => l.includes('usage=true')).length,
      'the principal holds no role at all — the dimension is inert',
    ).toBeGreaterThan(0);
    // And no unrelated operator login leaked in: those are cluster-global and owned by other files.
    expect(
      before.roleGraph.filter((l) => l.startsWith('op_') && !l.startsWith(adminOperatorRole)),
      'another test file’s operator role entered the snapshot',
    ).toEqual([]);
    expect(before.tablePrivileges.length).toBeGreaterThan(100);
    expect(before.functionPrivileges.length).toBeGreaterThan(50);
    expect(before.visibility.length).toBeGreaterThan(20);
    // The visibility sweep must have actually READ something. If it degraded — an aborted
    // transaction, or a role with no SELECT anywhere — every entry would be inert and the
    // dimension would grade nothing.
    expect(
      before.visibility.filter((l) => l.includes(' rows=')).length,
      'the visibility sweep read no table at all',
    ).toBeGreaterThan(10);
    expect(
      before.visibility.filter((l) => /rows=[1-9]/.test(l)).length,
      'the visibility sweep saw no rows anywhere',
    ).toBeGreaterThan(5);

    // The specific privileges the mutations try to acquire, established as absent BEFORE any of
    // them runs. Naming them here is what lets each mutation say what did not change.
    expect(before.permissions).toContain('identity.role.write=false');
    expect(before.permissions).toContain('identity.membership.write=false');
    expect(before.context).toContain('is_control_plane=false');
    expect(before.roleGraph).toContain(
      'freightos_control_plane usage=false member=false set=false',
    );
    expect(before.roleGraph).toContain('freightos_admin usage=false member=false set=false');
    expect(before.roleGraph).toContain(`${adminOperatorRole} usage=false member=false set=false`);
  });
});

describe('the privilege oracle would notice a real change — synthetic controls', () => {
  /**
   * THE MUTATION TESTS ARE ONLY WORTH THEIR ASSERTION IF THE ORACLE DISCRIMINATES.
   *
   * `expect(after).toEqual(before)` passes trivially against an oracle that returns a constant, and
   * an oracle whose queries silently errored into empty arrays would look exactly like a perfectly
   * inert registry. These three cases change something the oracle is supposed to see — without
   * touching the network tables at all — and require it to see it.
   */
  const permissionsFor = (client: Queryable, userId: string) =>
    client
      .query<{ line: string }>(
        `SELECT format('%s=%s', k, app.user_has_permission($1, $2, k, now())::text) AS line
           FROM unnest($3::text[]) AS k ORDER BY 1`,
        [TENANT_A, userId, [...PERMISSION_KEYS]],
      )
      .then((r) => r.rows.map((x) => x.line));

  it('separates two principals who genuinely hold different permissions', async () => {
    const ordinary = await withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), (c) =>
      permissionsFor(c, fixtureA.userId),
    );
    // Read from the administrator's OWN session. `app.user_has_permission` is STABLE and not
    // SECURITY DEFINER, so it answers through the caller's RLS: the operator sits at the terminal
    // node and the administrator's membership sits at the legal-entity node, outside that scope, so
    // asking the operator's session about the administrator correctly returns false for everything.
    // That is the right answer to a different question, and it would make a weak control.
    const administrator = await withAuthenticatedTestPrincipal(
      db,
      fixtureAdministrator(fixtureA),
      (c) => permissionsFor(c, fixtureA.adminUserId),
    );

    expect(ordinary).not.toEqual(administrator);
    expect(ordinary).toContain('identity.role.write=false');
    expect(administrator).toContain('identity.role.write=true');
  });

  it('separates the control plane from the runtime role', async () => {
    // Not the full oracle: `freightos_control_plane` holds no grant on `memberships` (ADR-0020 §7),
    // so `app.user_has_permission` is not even callable there — itself a privilege difference, and
    // the reason this control reads only the dimensions both roles can answer.
    const shape = (client: Queryable) =>
      client
        .query<{ line: string }>(
          `SELECT format('control_plane=%s admin_usage=%s app_usage=%s memberships_select=%s',
                         app.is_control_plane()::text,
                         pg_has_role(current_user, 'freightos_admin', 'USAGE')::text,
                         pg_has_role(current_user, 'freightos_app', 'USAGE')::text,
                         has_table_privilege(current_user, 'memberships', 'SELECT')::text) AS line`,
        )
        .then((r) => r.rows[0]!.line);

    const runtime = await withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), shape);
    const control = await asControlPlane(shape);

    expect(runtime).toContain('control_plane=false');
    expect(control).toContain('control_plane=true');
    expect(runtime).not.toBe(control);
  });

  it('separates two tenants by what they can see', async () => {
    const a = await privilegesOf(fixtureOperator(fixtureA), fixtureA);
    const b = await privilegesOf(fixtureOperator(fixtureB), fixtureB);
    expect(a.visibility).not.toEqual(b.visibility);
    expect(a.context).not.toEqual(b.context);
  });
});

describe('mutation A — a participant named after an administrator', () => {
  it('confers nothing: not the role, not the permission, not the control plane', async () => {
    const before = await privilegesOf(fixtureOperator(fixtureA), fixtureA);

    // Every privileged name in the cluster that a naive resolver might match on.
    for (const name of [
      adminOperatorRole,
      'freightos_admin',
      'freightos_admin_owner',
      'freightos_control_plane',
      'freightos_migrator',
      'postgres',
      'system:tenant-provisioning',
    ]) {
      await registerParticipant({ type: 'organization', displayName: name, tenantId: TENANT_A });
    }

    const after = await privilegesOf(fixtureOperator(fixtureA), fixtureA);

    // THE NAMED PRIVILEGES, stated one at a time rather than only as a diff.
    expect(after.roleGraph).toContain(`${adminOperatorRole} usage=false member=false set=false`);
    expect(after.roleGraph).toContain('freightos_admin usage=false member=false set=false');
    expect(after.roleGraph).toContain('freightos_control_plane usage=false member=false set=false');
    expect(after.context).toContain('is_control_plane=false');
    expect(after.permissions).toContain('identity.role.write=false');
    expect(after.permissions).toContain('identity.membership.write=false');

    // And nothing else moved either.
    expect(after).toEqual(before);
  });
});

describe('mutation B — a verified alias carrying an administrator identifier', () => {
  it('confers nothing: an alias correlates, it does not authenticate', async () => {
    const before = await privilegesOf(fixtureOperator(fixtureA), fixtureA);

    const participant = await registerParticipant({
      type: 'organization',
      displayName: 'Impersonation Attempt Ltd',
      tenantId: TENANT_A,
      status: 'active',
    });

    // The most authoritative namespaces available, carrying identifiers that really do belong to
    // privileged principals, marked `verified` — the strongest alias N1 can express.
    await asControlPlane(async (client) => {
      for (const namespace of ['usdot', 'ein']) {
        for (const value of [
          fixtureA.adminUserId,
          adminOperatorRole,
          TENANT_A,
          fixtureA.serviceAccountId,
        ]) {
          await client.query(
            `INSERT INTO network_participant_aliases
               (participant_id, namespace, value, verification_status, source_system,
                created_by, updated_by)
             VALUES ($1, $2, $3, 'verified', 'test:n1', 'ignored', 'ignored')`,
            [participant, namespace, value],
          );
        }
      }
    });

    const after = await privilegesOf(fixtureOperator(fixtureA), fixtureA);

    // A verified alias equal to the administrator's own user id does not make the holder that
    // administrator: `app.user_has_permission` still answers on the membership graph.
    expect(after.permissions).toContain('identity.role.write=false');
    expect(after.permissions).toContain('identity.membership.write=false');
    expect(after.permissions).toContain('identity.service_account.write=false');
    expect(after.context).toContain('is_control_plane=false');
    expect(after.roleGraph).toContain(`${adminOperatorRole} usage=false member=false set=false`);

    expect(after).toEqual(before);
  });

  it('does not make the administrator readable to the alias holder', async () => {
    // The counterparty question, asked separately: holding an alias equal to somebody's id must
    // not widen what rows the holder sees.
    const seen = await withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), async (c) => {
      const r = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM users WHERE id = $1`,
        [fixtureB.adminUserId],
      );
      return r.rows[0]!.n;
    });
    expect(seen).toBe('0');
  });
});

describe('mutation C — a relationship to the most privileged participant available', () => {
  it('confers nothing: a relationship states affiliation, it does not delegate', async () => {
    const before = await privilegesOf(fixtureOperator(fixtureA), fixtureA);

    const privileged = await registerParticipant({
      type: 'organization',
      displayName: 'freightos_control_plane',
      tenantId: TENANT_A,
      status: 'active',
      assuranceLevel: 'verified',
    });
    const claimant = await registerParticipant({
      type: 'organization',
      displayName: 'Claimant Holdings',
      tenantId: TENANT_A,
      status: 'active',
    });
    const facility = await registerParticipant({
      type: 'facility',
      displayName: 'Claimant Depot',
      tenantId: TENANT_A,
      status: 'active',
    });

    await asControlPlane(async (client) => {
      // Both governed types, in both directions where the vocabulary allows it. This is the
      // strongest relationship claim the N1 vocabulary can express — there is deliberately no
      // `delegate_of`, `acts_for`, `represents` or `authorized_by` to reach for.
      await client.query(
        `INSERT INTO network_participant_relationships
           (from_participant_id, relationship_type, to_participant_id, source_system,
            created_by, updated_by)
         VALUES ($1, 'subsidiary_of', $2, 'test:n1', 'ignored', 'ignored')`,
        [claimant, privileged],
      );
      await client.query(
        `INSERT INTO network_participant_relationships
           (from_participant_id, relationship_type, to_participant_id, source_system,
            created_by, updated_by)
         VALUES ($1, 'operated_by', $2, 'test:n1', 'ignored', 'ignored')`,
        [facility, privileged],
      );
      // And the participant pointing at the privileged one as the organization it represents.
      await client.query(
        `UPDATE network_participants SET represented_organization_id = $1 WHERE id = $2`,
        [privileged, claimant],
      );
    });

    const after = await privilegesOf(fixtureOperator(fixtureA), fixtureA);

    expect(after.context).toContain('is_control_plane=false');
    expect(after.roleGraph).toContain('freightos_control_plane usage=false member=false set=false');
    expect(after.permissions).toContain('identity.role.write=false');
    expect(after).toEqual(before);
  });

  it('grants no read of the counterparty across a cross-tenant relationship', async () => {
    // ADR-N0011: relationships may cross tenants and convey no data authority.
    const aSide = await registerParticipant({
      type: 'organization',
      displayName: 'A Side',
      tenantId: TENANT_A,
      status: 'active',
    });
    const bSide = await registerParticipant({
      type: 'organization',
      displayName: 'B Side',
      tenantId: TENANT_B,
      status: 'active',
    });
    await asControlPlane(async (client) => {
      await client.query(
        `INSERT INTO network_participant_relationships
           (from_participant_id, relationship_type, to_participant_id, source_system,
            created_by, updated_by)
         VALUES ($1, 'subsidiary_of', $2, 'test:n1', 'ignored', 'ignored')`,
        [aSide, bSide],
      );
    });

    const seen = await withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), async (c) => {
      const counterparty = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM network_participants WHERE id = $1`,
        [bSide],
      );
      const edge = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM network_participant_relationships
          WHERE from_participant_id = $1`,
        [aSide],
      );
      const tenantData = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM users WHERE tenant_id = $1`,
        [TENANT_B],
      );
      return {
        counterparty: counterparty.rows[0]!.n,
        edge: edge.rows[0]!.n,
        tenantData: tenantData.rows[0]!.n,
      };
    });

    // The counterparty is invisible, so the edge naming it is invisible too — both endpoints must
    // be visible for a relationship to resolve. And no tenant-owned row of B leaks either.
    expect(seen.counterparty).toBe('0');
    expect(seen.edge).toBe('0');
    expect(seen.tenantData).toBe('0');
  });
});

describe('mutation D — a participant claiming another tenant', () => {
  it('is refused outright when an ordinary session attempts it', async () => {
    await expect(
      withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), async (c) => {
        await c.query(
          `INSERT INTO network_participants
             (participant_type, display_name, tenant_id, source_system, created_by, updated_by)
           VALUES ('organization', 'Tenant B Impersonator', $1, 'test:n1', 'x', 'x')`,
          [TENANT_B],
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('confers nothing on either tenant when the control plane creates it', async () => {
    const beforeA = await privilegesOf(fixtureOperator(fixtureA), fixtureA);
    const beforeB = await privilegesOf(fixtureOperator(fixtureB), fixtureB);

    const foreign = await registerParticipant({
      type: 'organization',
      displayName: 'Cross-Tenant Claim',
      tenantId: TENANT_B,
      status: 'active',
    });

    const afterA = await privilegesOf(fixtureOperator(fixtureA), fixtureA);
    const afterB = await privilegesOf(fixtureOperator(fixtureB), fixtureB);

    expect(afterA.permissions).toEqual(beforeA.permissions);
    expect(afterA.roleGraph).toEqual(beforeA.roleGraph);
    expect(afterA.visibility).toEqual(beforeA.visibility);
    expect(afterA).toEqual(beforeA);
    expect(afterB).toEqual(beforeB);

    // And A cannot reach it by primary key.
    const seen = await withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), async (c) => {
      const r = await c.query(`SELECT id FROM network_participants WHERE id = $1`, [foreign]);
      return r.rowCount;
    });
    expect(seen).toBe(0);
  });

  it('refuses to let a tenant move its own participant into another tenant', async () => {
    const mine = await registerParticipant({
      type: 'organization',
      displayName: 'Stays Put',
      tenantId: TENANT_A,
      status: 'active',
    });
    await expect(
      withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), async (c) => {
        await c.query(`UPDATE network_participants SET tenant_id = $1 WHERE id = $2`, [
          TENANT_B,
          mine,
        ]);
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('mutation E — active status at maximal assurance', () => {
  it('confers nothing: assurance is a summary, not an entitlement', async () => {
    const before = await privilegesOf(fixtureOperator(fixtureA), fixtureA);

    // `assurance_level` is free text on purpose — the controlling documents define no vocabulary,
    // and inventing one would be governance by schema change. So the mutation tries every value a
    // naive resolver might special-case, rather than one nominal maximum.
    for (const level of [
      'verified',
      'highest',
      'maximum',
      'platform',
      'root',
      'admin',
      'control_plane',
      'trusted',
    ]) {
      await registerParticipant({
        type: 'organization',
        displayName: `Assurance ${level}`,
        tenantId: TENANT_A,
        status: 'active',
        assuranceLevel: level,
      });
    }

    const after = await privilegesOf(fixtureOperator(fixtureA), fixtureA);

    expect(after.context).toContain('is_control_plane=false');
    expect(after.permissions).toContain('identity.role.write=false');
    expect(after.permissions).toContain('identity.membership.write=false');
    expect(after.roleGraph).toContain('freightos_admin usage=false member=false set=false');
    expect(after).toEqual(before);
  });
});

describe('the read model a nullable tenant forces N1 to state — ADR-N0011', () => {
  let ownParticipant: string;
  let foreignParticipant: string;
  let externalParticipant: string;

  beforeAll(async () => {
    ownParticipant = await registerParticipant({
      type: 'organization',
      displayName: 'Read Model — Own',
      tenantId: TENANT_A,
      status: 'active',
    });
    foreignParticipant = await registerParticipant({
      type: 'organization',
      displayName: 'Read Model — Foreign',
      tenantId: TENANT_B,
      status: 'active',
    });
    externalParticipant = await registerParticipant({
      type: 'organization',
      displayName: 'Read Model — External Carrier',
      tenantId: null,
      status: 'active',
    });
  }, 120_000);

  it('shows a tenant its own participant', async () => {
    const n = await withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), async (c) => {
      const r = await c.query(`SELECT id FROM network_participants WHERE id = $1`, [
        ownParticipant,
      ]);
      return r.rowCount;
    });
    expect(n).toBe(1);
  });

  it('hides a foreign tenant participant', async () => {
    const n = await withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), async (c) => {
      const r = await c.query(`SELECT id FROM network_participants WHERE id = $1`, [
        foreignParticipant,
      ]);
      return r.rowCount;
    });
    expect(n).toBe(0);
  });

  it('does NOT treat a null tenant as public — the whole hazard of the nullable column', async () => {
    // NULL means "not a FreightOS tenant". It does not mean public, globally readable,
    // discoverable, shared with every tenant, or authorization-free.
    for (const [label, fixture] of [
      ['A', () => fixtureA],
      ['B', () => fixtureB],
    ] as const) {
      const n = await withAuthenticatedTestPrincipal(db, fixtureOperator(fixture()), async (c) => {
        const r = await c.query(`SELECT id FROM network_participants WHERE id = $1`, [
          externalParticipant,
        ]);
        return r.rowCount;
      });
      expect(n, `tenant ${label} could read a null-tenant participant`).toBe(0);
    }
  });

  it('shows the control plane everything, which is where external identity is administered', async () => {
    const ids = await asControlPlane(async (client) => {
      const r = await client.query<{ id: string }>(
        `SELECT id FROM network_participants WHERE id = ANY($1)`,
        [[ownParticipant, foreignParticipant, externalParticipant]],
      );
      return r.rows.map((x) => x.id).sort();
    });
    expect(ids).toEqual([ownParticipant, foreignParticipant, externalParticipant].sort());
  });

  it('shows an unbound runtime session nothing at all', async () => {
    // No verified binding: `app.current_tenant_id()` is NULL, so the predicate is unknown for every
    // row and the explicit `tenant_id IS NOT NULL` clause keeps NULL rows out too.
    const app = db.connectAs('freightos_app');
    await app.connect();
    try {
      await app.query('BEGIN');
      const r = await app.query(`SELECT count(*)::text AS n FROM network_participants`);
      await app.query('ROLLBACK');
      expect(r.rows[0]!.n).toBe('0');
    } finally {
      await app.end();
    }
  });

  it('refuses an ordinary session that tries to mint an external participant', async () => {
    // External identity is network-wide reference data. One tenant minting it would make one
    // customer's assertion everybody's.
    await expect(
      withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), async (c) => {
        await c.query(
          `INSERT INTO network_participants
             (participant_type, display_name, tenant_id, source_system, created_by, updated_by)
           VALUES ('organization', 'Self-minted External', NULL, 'test:n1', 'x', 'x')`,
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('hides the aliases and relationships of a participant it cannot see', async () => {
    await asControlPlane(async (client) => {
      await client.query(
        `INSERT INTO network_participant_aliases
           (participant_id, namespace, value, source_system, created_by, updated_by)
         VALUES ($1, 'usdot', 'HIDDEN-0001', 'test:n1', 'x', 'x')`,
        [foreignParticipant],
      );
    });

    const counts = await withAuthenticatedTestPrincipal(
      db,
      fixtureOperator(fixtureA),
      async (c) => {
        const alias = await c.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM network_participant_aliases WHERE value = 'HIDDEN-0001'`,
        );
        return alias.rows[0]!.n;
      },
    );
    expect(counts).toBe('0');
  });

  it('grants no DELETE anywhere — revocation is effective dating, not erasure', async () => {
    const state = await withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), async (c) => {
      const r = await c.query<{ line: string }>(
        `SELECT format('%s delete=%s truncate=%s', c.relname,
                         has_table_privilege(current_user, c.oid, 'DELETE')::text,
                         has_table_privilege(current_user, c.oid, 'TRUNCATE')::text) AS line
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname LIKE 'network\\_%'
              AND c.relkind = 'r' ORDER BY 1`,
      );
      return r.rows.map((x) => x.line);
    });
    // The scan is `network\_%`, so it covers the N3 journal and schema projection too, and that is
    // deliberately not narrowed back to the five N1 tables: "no DELETE on any network table" is a
    // stronger and equally true statement, and a permanently append-only journal is exactly where
    // it matters most.
    //
    // The EXPECTED side is the declared inventory, not the same pattern restated. Discovery by
    // prefix is what notices a relation nobody declared; judging it against a hand-maintained list
    // is what makes the notice mean something. `network-disclosure-relation-inventory` proves the
    // two agree, so a new table is caught here as a diff and there as a classification failure.
    //
    // The claim holds one layer at a time, and each layer's reason is its own. N1's five: a
    // participant is retired by status, never removed. N3's journal: erasing an event is the one
    // thing the journal exists to prevent. N5-A's six: a grant is authorization EVIDENCE, so
    // erasing one is exactly as wrong as erasing a journal entry — the revocation table exists
    // precisely so that revoking is not deleting. N5-B's three: a ceiling a runtime identity could
    // delete is not a ceiling. N6's seven, added when 0034 shipped: a delivery record that could
    // be erased could not distinguish DELIVERY ATTEMPTED from DELIVERY SUCCEEDED after the fact,
    // which is the whole point of recording both.
    expect(state).toEqual(ALL_NETWORK_RELATIONS.map((t) => `${t} delete=false truncate=false`));
    // Anti-vacuity: the generated expectation above would also be satisfied by an empty scan
    // matching an empty inventory. Twenty-nine relations across eight layers, none of them zero.
    expect(state).toHaveLength(29);
    expect(new Set(ALL_NETWORK_RELATIONS.map((t) => NETWORK_RELATION_LAYER.get(t))).size).toBe(8);
  });
});

describe('canonical identity — ADR-N0004', () => {
  let participant: string;

  beforeAll(async () => {
    participant = await registerParticipant({
      type: 'facility',
      displayName: 'Immutable Subject',
      tenantId: TENANT_A,
      status: 'active',
    });
  }, 60_000);

  it('is a UUIDv4 by default, opaque and type-independent', async () => {
    const rows = await asControlPlane(async (client) => {
      const r = await client.query<{ id: string; participant_type: string }>(
        `SELECT id::text, participant_type::text FROM network_participants`,
      );
      return r.rows;
    });
    expect(rows.length).toBeGreaterThan(5);
    for (const row of rows) {
      // Version nibble 4, variant nibble 8/9/a/b. The id encodes nothing about tenant or type.
      expect(row.id, `${row.id} is not a UUIDv4`).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(row.id).not.toContain(row.participant_type);
    }
    // Distinct types share one id space — no per-type prefix, no per-tenant partition.
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it('rejects an UPDATE of the canonical id, even from the control plane', async () => {
    await expect(
      asControlPlane((client) =>
        client.query(`UPDATE network_participants SET id = $1 WHERE id = $2`, [
          randomUUID(),
          participant,
        ]),
      ),
    ).rejects.toThrow(/immutable/i);
  });

  it('rejects an UPDATE of participant_type and of source_system', async () => {
    await expect(
      asControlPlane((client) =>
        client.query(
          `UPDATE network_participants SET participant_type = 'organization' WHERE id = $1`,
          [participant],
        ),
      ),
    ).rejects.toThrow(/immutable/i);

    await expect(
      asControlPlane((client) =>
        client.query(`UPDATE network_participants SET source_system = 'forged' WHERE id = $1`, [
          participant,
        ]),
      ),
    ).rejects.toThrow(/immutable/i);
  });

  it('derives provenance and discards whatever the caller supplied', async () => {
    // Stricter than the older tables, which accept a caller-supplied `created_by`. A brand-new
    // table has no back-compatibility reason to repeat the class F-A provenance-spoofing route.
    const row = await asControlPlane(async (client) => {
      const r = await client.query<{
        created_by: string;
        updated_by: string;
        record_version: string;
      }>(
        `SELECT created_by, updated_by, record_version::text FROM network_participants
          WHERE id = $1`,
        [participant],
      );
      return r.rows[0]!;
    });
    expect(row.created_by).not.toBe('ignored');
    expect(row.created_by).toBe('freightos_control_plane');
    expect(row.updated_by).toBe('freightos_control_plane');
    expect(row.record_version).toBe('1');
  });

  it('pins created_at and created_by across an update, and bumps record_version', async () => {
    const before = await asControlPlane(async (client) => {
      const r = await client.query<{ created_at: string; created_by: string }>(
        `SELECT created_at::text, created_by FROM network_participants WHERE id = $1`,
        [participant],
      );
      return r.rows[0]!;
    });

    await asControlPlane((client) =>
      client.query(
        `UPDATE network_participants
            SET display_name = 'Renamed', created_by = 'forged', created_at = now()
          WHERE id = $1`,
        [participant],
      ),
    );

    const after = await asControlPlane(async (client) => {
      const r = await client.query<{
        created_at: string;
        created_by: string;
        record_version: string;
        display_name: string;
      }>(
        `SELECT created_at::text, created_by, record_version::text, display_name
           FROM network_participants WHERE id = $1`,
        [participant],
      );
      return r.rows[0]!;
    });

    expect(after.created_by).toBe(before.created_by);
    expect(after.created_at).toBe(before.created_at);
    expect(after.record_version).toBe('2');
    expect(after.display_name).toBe('Renamed');
  });
});

describe('aliases — ADR-N0006', () => {
  let first: string;
  let second: string;

  beforeAll(async () => {
    first = await registerParticipant({
      type: 'organization',
      displayName: 'Alias Holder One',
      tenantId: TENANT_A,
      status: 'active',
    });
    second = await registerParticipant({
      type: 'organization',
      displayName: 'Alias Holder Two',
      tenantId: TENANT_A,
      status: 'active',
    });
  }, 60_000);

  const addAlias = (participant: string, namespace: string, value: string) =>
    asControlPlane(async (client) => {
      const r = await client.query<{ id: string }>(
        `INSERT INTO network_participant_aliases
           (participant_id, namespace, value, source_system, created_by, updated_by)
         VALUES ($1, $2, $3, 'test:n1', 'x', 'x') RETURNING id`,
        [participant, namespace, value],
      );
      return r.rows[0]!.id;
    });

  it('accepts an alias in a governed namespace', async () => {
    const id = await addAlias(first, 'usdot', 'DOT-1000');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects a namespace that is not governed', async () => {
    await expect(addAlias(first, 'made_up_registry', 'X')).rejects.toThrow(
      /violates foreign key constraint/i,
    );
  });

  it('rejects the bare `partner:` prefix as a namespace', async () => {
    // `partner:` is a FORM, not a shared namespace. `partner:sap` and `partner:oracle` are two
    // namespaces; `partner:` alone is neither.
    await expect(
      asControlPlane((client) =>
        client.query(
          `INSERT INTO network_alias_namespaces (code, kind, description)
           VALUES ('partner:', 'partner', 'the bare prefix')`,
        ),
      ),
    ).rejects.toThrow(/network_alias_namespaces_code_shape/);

    // And a real partner namespace is accepted, so the constraint is not simply rejecting the kind.
    await asControlPlane((client) =>
      client.query(
        `INSERT INTO network_alias_namespaces (code, kind, description)
         VALUES ('partner:sap', 'partner', 'SAP-issued partner identifier')`,
      ),
    );
    const alias = await addAlias(first, 'partner:sap', 'SAP-9');
    expect(alias).toBeDefined();
  });

  it('refuses a second ACTIVE binding of the same (namespace, value)', async () => {
    await addAlias(first, 'scac', 'ABCD');
    await expect(addAlias(second, 'scac', 'ABCD')).rejects.toThrow(
      /network_participant_aliases_one_active/,
    );
  });

  it('lets the same (namespace, value) move participants once revoked, keeping history', async () => {
    await addAlias(first, 'mc', 'MC-7777');

    await asControlPlane((client) =>
      client.query(
        `UPDATE network_participant_aliases
            SET revoked_at = now(), revoked_by = 'test:n1', effective_to = now()
          WHERE namespace = 'mc' AND value = 'MC-7777' AND participant_id = $1`,
        [first],
      ),
    );

    // Reassignment is now possible — the partial unique index only constrains live bindings.
    const reassigned = await addAlias(second, 'mc', 'MC-7777');
    expect(reassigned).toBeDefined();

    // HISTORY IS RETAINED. Both rows survive, and "which participant did MC-7777 refer to, when"
    // is still answerable. That is what makes reassignment representable without rewriting the past.
    const history = await asControlPlane(async (client) => {
      const r = await client.query<{ participant_id: string; revoked: boolean }>(
        `SELECT participant_id::text, (revoked_at IS NOT NULL) AS revoked
           FROM network_participant_aliases
          WHERE namespace = 'mc' AND value = 'MC-7777' ORDER BY effective_from`,
      );
      return r.rows;
    });
    expect(history).toHaveLength(2);
    expect(history.map((h) => h.participant_id).sort()).toEqual([first, second].sort());
    expect(history.filter((h) => h.revoked)).toHaveLength(1);
  });

  it('refuses to rewrite an alias identity in place', async () => {
    const id = await addAlias(first, 'lei', 'LEI-0001');
    for (const [column, value] of [
      ['namespace', 'duns'],
      ['value', 'LEI-0002'],
      ['participant_id', second],
    ] as const) {
      await expect(
        asControlPlane((client) =>
          client.query(`UPDATE network_participant_aliases SET ${column} = $1 WHERE id = $2`, [
            value,
            id,
          ]),
        ),
        `${column} was rewritable`,
      ).rejects.toThrow(/alias identity is immutable/i);
    }
  });

  it('stops a revoked alias resolving for new work while leaving it attributable', async () => {
    const id = await addAlias(first, 'gln', 'GLN-42');
    await asControlPlane((client) =>
      client.query(
        `UPDATE network_participant_aliases SET revoked_at = now(), revoked_by = 'test:n1'
          WHERE id = $1`,
        [id],
      ),
    );

    const resolution = await asControlPlane(async (client) => {
      const live = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM network_participant_aliases
          WHERE namespace = 'gln' AND value = 'GLN-42'
            AND revoked_at IS NULL AND effective_to IS NULL`,
      );
      const attributable = await client.query<{ revoked_by: string; created_by: string }>(
        `SELECT revoked_by, created_by FROM network_participant_aliases WHERE id = $1`,
        [id],
      );
      return { live: live.rows[0]!.n, row: attributable.rows[0]! };
    });
    expect(resolution.live).toBe('0');
    expect(resolution.row.revoked_by).toBe('test:n1');
    expect(resolution.row.created_by).toBe('freightos_control_plane');
  });

  it('lets no application session write the governed namespace vocabulary', async () => {
    const privileges = await withAuthenticatedTestPrincipal(
      db,
      fixtureOperator(fixtureA),
      async (c) => {
        const r = await c.query<{ line: string }>(
          `SELECT format('%s insert=%s update=%s', c.relname,
                         has_table_privilege(current_user, c.oid, 'INSERT')::text,
                         has_table_privilege(current_user, c.oid, 'UPDATE')::text) AS line
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname IN ('network_alias_namespaces', 'network_relationship_types')
            ORDER BY 1`,
        );
        return r.rows.map((x) => x.line);
      },
    );
    expect(privileges).toEqual([
      'network_alias_namespaces insert=false update=false',
      'network_relationship_types insert=false update=false',
    ]);
  });
});

describe('relationships', () => {
  let org: string;
  let otherOrg: string;
  let facility: string;
  let person: string;

  beforeAll(async () => {
    org = await registerParticipant({
      type: 'organization',
      displayName: 'Rel Org',
      tenantId: TENANT_A,
      status: 'active',
    });
    otherOrg = await registerParticipant({
      type: 'organization',
      displayName: 'Rel Other Org',
      tenantId: TENANT_A,
      status: 'active',
    });
    facility = await registerParticipant({
      type: 'facility',
      displayName: 'Rel Facility',
      tenantId: TENANT_A,
      status: 'active',
    });
    person = await registerParticipant({
      type: 'person',
      displayName: 'Rel Person',
      tenantId: TENANT_A,
      status: 'active',
    });
  }, 60_000);

  const relate = (from: string, type: string, to: string) =>
    asControlPlane(async (client) => {
      const r = await client.query<{ id: string }>(
        `INSERT INTO network_participant_relationships
           (from_participant_id, relationship_type, to_participant_id, source_system,
            created_by, updated_by)
         VALUES ($1, $2, $3, 'test:n1', 'x', 'x') RETURNING id`,
        [from, type, to],
      );
      return r.rows[0]!.id;
    });

  it('seeds exactly two governed types and no acting-authority vocabulary', async () => {
    const codes = await asControlPlane(async (client) => {
      const r = await client.query<{ code: string }>(
        `SELECT code FROM network_relationship_types ORDER BY code`,
      );
      return r.rows.map((x) => x.code);
    });
    expect(codes).toEqual(['operated_by', 'subsidiary_of']);
    // ADR-N0003 layer C does not exist. Nothing in N1 may express acting-for.
    for (const forbidden of [
      'delegate_of',
      'represents',
      'acts_for',
      'authorized_by',
      'agent_for',
    ]) {
      expect(codes, `${forbidden} was seeded`).not.toContain(forbidden);
    }
  });

  it('enforces the endpoint types the governed type declares', async () => {
    await expect(relate(org, 'operated_by', otherOrg), 'organization operated_by').rejects.toThrow(
      /requires facility\/organization endpoints/,
    );
    await expect(relate(facility, 'subsidiary_of', org)).rejects.toThrow(
      /requires organization\/organization endpoints/,
    );
    await expect(relate(person, 'operated_by', org)).rejects.toThrow(
      /requires facility\/organization endpoints/,
    );
    // The permitted shape still works, so the trigger is not simply refusing everything.
    await expect(relate(facility, 'operated_by', org)).resolves.toBeDefined();
  });

  it('rejects an ungoverned relationship type', async () => {
    // Two independent refusals guard this, and the BEFORE trigger reaches it first: the FK to
    // `network_relationship_types` would reject it anyway at constraint-check time. Either message
    // is correct — what matters is that a vocabulary nobody governed cannot be asserted.
    await expect(relate(facility, 'delegate_of', org)).rejects.toThrow(
      /unknown relationship type delegate_of|violates foreign key constraint/i,
    );
    // And the FK is genuinely there, not merely implied by the trigger.
    const fk = await asControlPlane(async (client) => {
      const r = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pg_constraint
          WHERE conrelid = 'network_participant_relationships'::regclass AND contype = 'f'
            AND confrelid = 'network_relationship_types'::regclass`,
      );
      return r.rows[0]!.n;
    });
    expect(fk).toBe('1');
  });

  it('rejects a self-relationship', async () => {
    await expect(relate(org, 'subsidiary_of', org)).rejects.toThrow(
      /network_participant_relationships_no_self/,
    );
  });

  it('refuses a duplicate ACTIVE edge and permits it again after revocation', async () => {
    await relate(otherOrg, 'subsidiary_of', org);
    await expect(relate(otherOrg, 'subsidiary_of', org)).rejects.toThrow(
      /network_participant_relationships_one_active/,
    );

    await asControlPlane((client) =>
      client.query(
        `UPDATE network_participant_relationships
            SET revoked_at = now(), revoked_by = 'test:n1', effective_to = now()
          WHERE from_participant_id = $1 AND to_participant_id = $2`,
        [otherOrg, org],
      ),
    );
    await expect(relate(otherOrg, 'subsidiary_of', org)).resolves.toBeDefined();

    // History survives the re-assertion.
    const n = await asControlPlane(async (client) => {
      const r = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM network_participant_relationships
          WHERE from_participant_id = $1 AND to_participant_id = $2`,
        [otherOrg, org],
      );
      return r.rows[0]!.n;
    });
    expect(n).toBe('2');
  });

  it('refuses to rewrite a relationship identity in place', async () => {
    const valid = await relate(facility, 'operated_by', otherOrg);
    for (const [column, value] of [
      ['from_participant_id', org],
      ['to_participant_id', org],
      ['relationship_type', 'subsidiary_of'],
    ] as const) {
      await expect(
        asControlPlane((client) =>
          client.query(
            `UPDATE network_participant_relationships SET ${column} = $1 WHERE id = $2`,
            [value, valid],
          ),
        ),
        `${column} was rewritable`,
      ).rejects.toThrow(/relationship identity is immutable/i);
    }
  });

  it('will not relate to a participant the writer cannot see', async () => {
    const invisible = await registerParticipant({
      type: 'organization',
      displayName: 'Invisible To A',
      tenantId: TENANT_B,
      status: 'active',
    });
    const mine = await registerParticipant({
      type: 'organization',
      displayName: 'Visible To A',
      tenantId: TENANT_A,
      status: 'active',
    });

    await expect(
      withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), async (c) => {
        await c.query(
          `INSERT INTO network_participant_relationships
             (from_participant_id, relationship_type, to_participant_id, source_system,
              created_by, updated_by)
           VALUES ($1, 'subsidiary_of', $2, 'test:n1', 'x', 'x')`,
          [mine, invisible],
        );
      }),
      // The endpoint trigger runs with INVOKER rights, so it sees exactly what the writer sees:
      // the counterparty is not a visible participant, and the write is refused before RLS is
      // even consulted. Either refusal is correct; the write must not succeed.
    ).rejects.toThrow(/must both be visible participants|row-level security/i);
  });
});

describe('a pg_temp shadow cannot forge the endpoint rule — 0027 layer 3', () => {
  /**
   * `app.network_relationship_endpoints_ok()` is invoker-rights with no pinned `search_path`, and
   * PostgreSQL searches the session's temporary schema AHEAD of everything else for relations. A
   * bare `network_relationship_types` in that function would therefore resolve to a table the
   * caller had just created — letting the caller declare any endpoint pair legal and then write the
   * forged edge into the REAL table. The reads are schema-qualified for exactly that reason.
   *
   * TEMPORARY is revoked from PUBLIC and from every runtime role (migration 0019), so no runtime
   * session can build the shadow today — that is layer 1 and it is asserted below. This case drives
   * the attack from the one role that still holds TEMPORARY, the database owner, so that layer 3 is
   * tested rather than assumed. If layer 1 were ever relaxed, this is the test that stays true.
   */
  it('keeps TEMPORARY revoked from every runtime role — layer 1', async () => {
    const client = db.connectAs('postgres');
    await client.connect();
    try {
      const r = await client.query<{ line: string }>(
        `SELECT format('%s=%s', who,
                       has_database_privilege(who, current_database(), 'TEMPORARY')::text) AS line
           FROM unnest(ARRAY['public', 'freightos_app', 'freightos_control_plane',
                             'freightos_admin']) AS who ORDER BY 1`,
      );
      expect(r.rows.map((x) => x.line)).toEqual([
        'freightos_admin=false',
        'freightos_app=false',
        'freightos_control_plane=false',
        'public=false',
      ]);
    } finally {
      await client.end();
    }
  });

  it('ignores a shadowed relationship-type table that is demonstrably live — layer 3', async () => {
    const migrator = db.connectAsMigrator();
    await migrator.connect();
    try {
      // The privileged context is established through `withLegalContext` rather than by
      // open-coding `set_config`, which is the pattern SR2_RAW_GUC_ALLOWLIST.md requires of a new
      // privileged fixture: the GUC writes stay inside the one reviewed module. Everything happens
      // inside its transaction, so the temp table and both participants disappear with it.
      const outcome = await withLegalContext(migrator, carrierContext(TENANT_A), async (c) => {
        const register = async (name: string): Promise<string> =>
          (
            await c.query<{ id: string }>(
              `INSERT INTO network_participants
                 (participant_type, display_name, tenant_id, status, source_system,
                  created_by, updated_by)
               VALUES ('organization', $1, $2, 'active', 'test:n1', 'x', 'x')
               RETURNING id`,
              [name, TENANT_A],
            )
          ).rows[0]!.id;

        const org = await register('Shadow Test Org');
        const otherOrg = await register('Shadow Test Org Two');

        // The forgery: a temp table of the same name declaring `operated_by` as organization →
        // organization, so the edge below would look legal to anything that read it.
        await c.query(
          `CREATE TEMP TABLE network_relationship_types (
             code text PRIMARY KEY,
             from_participant_type app.network_participant_type NOT NULL,
             to_participant_type app.network_participant_type NOT NULL,
             description text NOT NULL)`,
        );
        await c.query(
          `INSERT INTO pg_temp.network_relationship_types VALUES
             ('operated_by', 'organization', 'organization', 'forged')`,
        );

        // THE SHADOW IS LIVE. An unqualified read in this very session resolves to the forgery —
        // without this control the case would pass just as well against a session where the temp
        // table was never created, and would prove nothing.
        const shadowed = (
          await c.query<{ from_participant_type: string }>(
            `SELECT from_participant_type::text FROM network_relationship_types
              WHERE code = 'operated_by'`,
          )
        ).rows[0]!.from_participant_type;

        // The write is attempted last and its error captured rather than thrown, because a failed
        // statement aborts the transaction and nothing after it could run.
        let refusal = 'NOT REFUSED';
        try {
          await c.query(
            `INSERT INTO network_participant_relationships
               (from_participant_id, relationship_type, to_participant_id, source_system,
                created_by, updated_by)
             VALUES ($1, 'operated_by', $2, 'test:n1', 'x', 'x')`,
            [org, otherOrg],
          );
        } catch (error) {
          refusal = (error as Error).message;
        }
        return { shadowed, refusal };
      });

      expect(outcome.shadowed, 'the shadow is not in effect').toBe('organization');
      // The trigger is unmoved: it read `public.network_relationship_types`, where `operated_by`
      // still requires facility → organization.
      expect(outcome.refusal).toMatch(/requires facility\/organization endpoints/);
    } finally {
      await migrator.end();
    }
  });
});

describe('the structural authority-graph gate', () => {
  let client: Client;

  beforeAll(async () => {
    client = db.connectAs('postgres');
    await client.connect();
  }, 60_000);

  afterAll(async () => {
    await client?.end();
  });

  /**
   * Behavioural mutation tests sample. This samples nothing: it reads the catalog and requires that
   * NO authorization object anywhere mentions a network table. A future edit that wires a
   * participant into a policy predicate or a permission function fails here even if no test
   * happens to exercise that path.
   */
  it('has no policy outside the network tables that references one', async () => {
    const r = await client.query<{ line: string }>(
      `SELECT format('%s.%s %s', schemaname, tablename, policyname) AS line
         FROM pg_policies
        WHERE tablename NOT LIKE 'network\\_%'
          AND (coalesce(qual, '') LIKE '%network\\_%' ESCAPE '\\'
            OR coalesce(with_check, '') LIKE '%network\\_%' ESCAPE '\\')`,
    );
    expect(r.rows.map((x) => x.line)).toEqual([]);
  });

  it('has no function outside the five N1 helpers that reads a network table', async () => {
    const r = await client.query<{ line: string }>(
      `SELECT format('%s.%s', n.nspname, p.proname) AS line
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('app', 'admin', 'authn', 'public')
          AND p.proname NOT LIKE 'network\\_%'
          AND p.prosrc LIKE '%network_participant%'`,
    );
    expect(r.rows.map((x) => x.line)).toEqual([]);
  });

  it('has no foreign key from a non-network table into the registry', async () => {
    const r = await client.query<{ line: string }>(
      `SELECT format('%s.%s -> %s', n.nspname, c.relname, ref.relname) AS line
         FROM pg_constraint con
         JOIN pg_class c ON c.oid = con.conrelid
         JOIN pg_class ref ON ref.oid = con.confrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE con.contype = 'f'
          AND ref.relname LIKE 'network\\_%'
          AND c.relname NOT LIKE 'network\\_%'`,
    );
    expect(r.rows.map((x) => x.line)).toEqual([]);
  });

  it('puts no trigger on a non-network table that runs network code, and vice versa', async () => {
    const r = await client.query<{ line: string }>(
      `SELECT format('%s on %s -> %s', t.tgname, c.relname, p.proname) AS line
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE NOT t.tgisinternal
          AND ((c.relname NOT LIKE 'network\\_%' AND p.proname LIKE 'network\\_%')
            OR (c.relname LIKE 'network\\_%' AND p.proname NOT LIKE 'network\\_%'
                -- SHARED PLATFORM HELPERS, not network code. \`reject_mutation\` is the append-only
                -- rejector already attached to the audit ledger, the outbox and the kill-switch
                -- table; N3 attaches it to the journal and the schema projection. Minting a
                -- \`network_reject_mutation\` twin purely to satisfy a name-prefix rule would be
                -- duplication dressed as isolation — and would leave two rejectors to keep in step.
                AND p.proname NOT IN ('set_updated_at', 'bump_version', 'reject_mutation')))`,
    );
    expect(r.rows.map((x) => x.line)).toEqual([]);
  });

  it('gives the registry no SECURITY DEFINER code and no new role', async () => {
    const definers = await client.query<{ line: string }>(
      `SELECT format('%s.%s', n.nspname, p.proname) AS line
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname LIKE 'network\\_%' AND p.prosecdef
          AND n.nspname NOT IN ('pg_catalog', 'information_schema')`,
    );
    expect(definers.rows.map((x) => x.line)).toEqual([]);

    // The role inventory is the Phase 0/SR-2 one, unchanged. A network role would show up here.
    const roles = await client.query<{ rolname: string }>(
      `SELECT rolname FROM pg_roles WHERE rolname LIKE '%network%' ORDER BY 1`,
    );
    expect(roles.rows.map((x) => x.rolname)).toEqual([]);
  });

  it('grants the registry to no principal outside the two that already existed', async () => {
    // PER TABLE, not `DISTINCT rolname, privilege` across the whole family.
    //
    // The collapsed form was the defect N6 exposed. It answered "which principals hold which
    // privileges SOMEWHERE under `network_%`", so the delivery worker's legitimate INSERT on
    // `network_delivery_attempts` and UPDATE on `network_disclosure_deliveries` arrived as bare
    // `freightos_delivery_worker INSERT` / `UPDATE` lines — indistinguishable from that role
    // having gained write access to the participant registry itself. A gate whose failure cannot
    // tell you WHERE the privilege is cannot answer the question in its own title.
    // EVERY relation kind that can CARRY an ACL, not just ordinary tables.
    //
    // This is a privilege gate, so its scope has to be the set of things a privilege can be granted
    // on: tables, partitioned tables, views, materialised views, foreign tables and sequences.
    // Narrowing it to `relkind = 'r'` costs nothing today — the only kinds present under
    // `network_%` are 'r' and 'i', and an index carries no `relacl` — but it would let a future
    // `network_*` VIEW be granted to any principal without this gate noticing, which is exactly the
    // blind spot the gate exists to deny.
    const r = await client.query<{ line: string }>(
      `SELECT format('%s %s %s', c.relname, g.rolname,
                string_agg(DISTINCT a.privilege_type, ',' ORDER BY a.privilege_type)) AS line
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         CROSS JOIN LATERAL aclexplode(c.relacl) a
         JOIN pg_roles g ON g.oid = a.grantee
        WHERE n.nspname = 'public' AND c.relname LIKE 'network\\_%'
          AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
          AND g.rolname <> 'freightos_migrator'
        GROUP BY c.relname, g.rolname
        ORDER BY c.relname, g.rolname`,
    );
    // N3 adds exactly ONE further principal to the journal, and exactly ONE table-level privilege
    // for it: INSERT. Its journal READ is column-scoped and its participant read is column-scoped,
    // so neither appears in `relacl` at all — which is the point of using column privileges.
    //
    // N6 adds `freightos_delivery_worker`, and every line below places it precisely: SELECT on
    // everything it must read, writes ONLY on N6's own operational tables. It holds no INSERT and
    // no UPDATE on any N1 registry table, on the journal, on N4, or on either N5 layer — that is
    // the property this gate is for, and it is now visible line by line rather than inferred.
    expect(r.rows.map((x) => x.line)).toEqual([
      'network_alias_namespaces freightos_app SELECT',
      'network_alias_namespaces freightos_control_plane INSERT,SELECT',
      'network_delivery_attempts freightos_delivery_worker INSERT,SELECT',
      'network_disclosure_artifacts freightos_app SELECT',
      'network_disclosure_artifacts freightos_delivery_worker INSERT,SELECT',
      'network_disclosure_artifacts freightos_transport_worker SELECT',
      'network_disclosure_authority_bases freightos_app SELECT',
      'network_disclosure_authority_bases freightos_delivery_worker SELECT',
      'network_disclosure_deliveries freightos_delivery_worker INSERT,SELECT,UPDATE',
      'network_disclosure_grant_revocations freightos_app INSERT,SELECT',
      'network_disclosure_grant_revocations freightos_delivery_worker SELECT',
      'network_disclosure_grants freightos_app INSERT,SELECT',
      'network_disclosure_grants freightos_delivery_worker SELECT',
      'network_disclosure_inbox freightos_app SELECT',
      'network_disclosure_inbox freightos_delivery_worker INSERT,SELECT',
      'network_disclosure_inbox freightos_transport_worker SELECT',
      'network_disclosure_projection_fields freightos_app SELECT',
      'network_disclosure_projection_fields freightos_delivery_worker SELECT',
      'network_disclosure_projections freightos_app SELECT',
      'network_disclosure_projections freightos_delivery_worker SELECT',
      'network_disclosure_purpose_ceilings freightos_app SELECT',
      'network_disclosure_purpose_ceilings freightos_delivery_worker SELECT',
      'network_disclosure_purposes freightos_app SELECT',
      'network_disclosure_purposes freightos_delivery_worker SELECT',
      'network_disclosure_routing_resolutions freightos_delivery_worker INSERT,SELECT',
      'network_disclosure_sensitivities freightos_app SELECT',
      'network_disclosure_sensitivities freightos_delivery_worker SELECT',
      'network_disclosure_subscription_revocations freightos_app INSERT,SELECT',
      'network_disclosure_subscription_revocations freightos_delivery_worker SELECT',
      'network_disclosure_subscriptions freightos_app INSERT,SELECT',
      'network_disclosure_subscriptions freightos_delivery_worker SELECT',
      'network_events freightos_app SELECT',
      'network_events freightos_control_plane SELECT',
      'network_events freightos_delivery_worker SELECT',
      'network_events freightos_event_writer INSERT',
      'network_external_transport_attempts freightos_transport_worker INSERT,SELECT',
      'network_external_transport_permits freightos_delivery_worker INSERT,SELECT',
      'network_external_transport_permits freightos_transport_worker SELECT',
      'network_external_transports freightos_delivery_worker INSERT,SELECT',
      'network_external_transports freightos_transport_worker SELECT,UPDATE',
      'network_participant_aliases freightos_app INSERT,SELECT,UPDATE',
      'network_participant_aliases freightos_control_plane INSERT,SELECT,UPDATE',
      'network_participant_relationships freightos_app INSERT,SELECT,UPDATE',
      'network_participant_relationships freightos_control_plane INSERT,SELECT,UPDATE',
      'network_participants freightos_app INSERT,SELECT,UPDATE',
      'network_participants freightos_control_plane INSERT,SELECT,UPDATE',
      'network_participants freightos_delivery_worker SELECT',
      'network_participants freightos_transport_worker SELECT',
      'network_relationship_types freightos_app SELECT',
      'network_relationship_types freightos_control_plane INSERT,SELECT',
      'network_schema_disclosure_sensitivity freightos_app SELECT',
      'network_schema_disclosure_sensitivity freightos_delivery_worker SELECT',
      'network_schema_versions freightos_app SELECT',
      'network_schema_versions freightos_control_plane SELECT',
      'network_schema_versions freightos_delivery_worker SELECT',
      'network_transport_destination_revocations freightos_app INSERT,SELECT',
      'network_transport_destination_revocations freightos_delivery_worker SELECT',
      'network_transport_destination_revocations freightos_transport_worker SELECT',
      'network_transport_destinations freightos_app INSERT,SELECT',
      'network_transport_destinations freightos_delivery_worker SELECT',
      'network_transport_destinations freightos_transport_worker SELECT',
      'network_transport_intents freightos_delivery_worker SELECT',
      'network_transport_intents freightos_event_writer INSERT',
    ]);

    // Restated as the invariant itself, so it survives any future reshuffle of the list above:
    // outside the tables it is the author of record for, the delivery worker holds READ and
    // nothing else.
    //
    // N7-A extends that authorship by exactly two relations, and the extension is enumerated here
    // rather than expressed as "N6 or N7" on purpose. Under OR-05 Option C the delivery worker is
    // the broker: it creates the transport obligation and it mints the attempt-scoped permit,
    // because those are the two acts that require the N5 authority it holds and the transport
    // worker does not. `network_external_transport_attempts` is NOT in that set and must never
    // join it — an authorization-side identity that could write an attempt row could record an
    // outcome no attempt produced, which is the one thing the attempt ledger exists to prevent.
    // A wildcard over N7 would have admitted that silently; a list cannot.
    const N7_DELIVERY_WORKER_AUTHORED = [
      'network_external_transport_permits',
      'network_external_transports',
    ] as const;
    const deliveryWorkerAuthored = [...N6_DELIVERY_RELATIONS, ...N7_DELIVERY_WORKER_AUTHORED];
    const workerWritesOutsideAuthorship = r.rows
      .map((x) => x.line)
      .filter((line) => line.includes(' freightos_delivery_worker '))
      .filter((line) => !deliveryWorkerAuthored.some((t) => line.startsWith(`${t} `)))
      .filter((line) => /INSERT|UPDATE|DELETE|TRUNCATE/.test(line));
    expect(workerWritesOutsideAuthorship).toEqual([]);

    // On the two N7 relations it authors, the delivery worker CREATES and never revises. A permit
    // it could UPDATE would not be attempt-scoped — freshness, attempt number and expiry would all
    // be re-writable after issue — and a transport row it could UPDATE would let the authorization
    // side move transport state it does not observe.
    expect(
      r.rows
        .map((x) => x.line)
        .filter((line) => N7_DELIVERY_WORKER_AUTHORED.some((t) => line.startsWith(`${t} `)))
        .filter((line) => line.includes(' freightos_delivery_worker ')),
    ).toEqual([
      'network_external_transport_permits freightos_delivery_worker INSERT,SELECT',
      'network_external_transports freightos_delivery_worker INSERT,SELECT',
    ]);

    // The complement, and the load-bearing half of OR-05: the egress-capable identity cannot write
    // its own permission. No INSERT, no UPDATE, no DELETE on the permit table — it reads permits
    // and nothing more. Its only writes are the attempt it makes and the transport state that
    // attempt produces.
    const transportWorkerWrites = r.rows
      .map((x) => x.line)
      .filter((line) => line.includes(' freightos_transport_worker '))
      .filter((line) => /INSERT|UPDATE|DELETE|TRUNCATE/.test(line));
    expect(transportWorkerWrites).toEqual([
      'network_external_transport_attempts freightos_transport_worker INSERT,SELECT',
      'network_external_transports freightos_transport_worker SELECT,UPDATE',
    ]);
    expect(
      transportWorkerWrites.filter((line) =>
        line.startsWith('network_external_transport_permits '),
      ),
    ).toEqual([]);
  });

  it('has RLS enabled AND forced on every registry table', async () => {
    const r = await client.query<{ line: string }>(
      `SELECT format('%s rls=%s force=%s', c.relname, c.relrowsecurity::text,
                     c.relforcerowsecurity::text)
                AS line
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname LIKE 'network\\_%' AND c.relkind = 'r'
        ORDER BY 1`,
    );
    // Widened to every `network_*` table rather than pinned to N1's five: a new network table that
    // forgot FORCE would otherwise be added without this gate noticing, which is the one thing it
    // exists to prevent. FORCE matters more on the journal than anywhere else — it binds the OWNER
    // too, so a migration-authority session cannot read past the tenant policy either.
    //
    // Discovered by prefix, judged against the declared inventory. The prefix is what spots a
    // relation nobody declared; it is not what decides which layer that relation belongs to.
    expect(r.rows.map((x) => x.line)).toEqual(
      ALL_NETWORK_RELATIONS.map((t) => `${t} rls=true force=true`),
    );
    expect(r.rows).toHaveLength(29);
  });

  it('defines the participant type enum as exactly the seven ADR-N0005 values', async () => {
    const r = await client.query<{ labels: string }>(
      `SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS labels
         FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'app' AND t.typname = 'network_participant_type'`,
    );
    expect(r.rows[0]!.labels).toBe('organization,person,facility,device,workload,agent,asset');
    // No escape hatches: `other`, `unknown` and `generic` are how a closed vocabulary stops being
    // closed.
    for (const forbidden of ['other', 'unknown', 'generic']) {
      expect(r.rows[0]!.labels.split(','), `${forbidden} is in the enum`).not.toContain(forbidden);
    }
  });
});
