import { randomUUID } from 'node:crypto';

import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { acceptNetworkEvent } from '../../src/network-events.ts';
import { TENANT_A, TENANT_B, TestDatabase } from './harness.ts';
import type { IdentityFixture } from './identity-harness.ts';
import { connectAsFixtureAdministrator } from './identity-harness.ts';
import { asRole, seedVerifiedFixture } from './sr2-harness.ts';
import { fixtureOperator, withAuthenticatedTestPrincipal } from './verified-test-auth.ts';
import type { Queryable } from '../../src/session.ts';

/**
 * N6 — authorized disclosure delivery, at the database layer.
 *
 * The routing predicates are unit-tested in `packages/context`. What only this layer can prove is
 * that the SHIPPED schema refuses what it claims to refuse: that a subscription is authored by the
 * recipient and grants no field, that the worker executes authority without being able to create
 * it, that a terminal delivery cannot be resurrected, and that an artifact is invisible until an
 * inbox row exists.
 *
 * ANTI-VACUITY IS THE ORGANISING PRINCIPLE. Every refusal below is paired with the corresponding
 * success, and every DB-enforced refusal is pinned to its SQLSTATE and message so that an
 * undefined column, a privilege denial or a foreign-key error can never be credited as the guard
 * under test — the N5-B oracle standard, applied from the start.
 */

const db = new TestDatabase('freightos_test_n6_delivery');

const N6_TABLES = [
  'network_delivery_attempts',
  'network_disclosure_artifacts',
  'network_disclosure_deliveries',
  'network_disclosure_inbox',
  'network_disclosure_routing_resolutions',
  'network_disclosure_subscription_revocations',
  'network_disclosure_subscriptions',
] as const;

const WORKFLOW_STATE = 'https://schemas.rigreceipts.com/network/workflow-state.v1.json';
const PURPOSE = 'shipment_execution';
/** The projection 0032 shipped — the only one that exists, and the one N5-A grants point at. */
const PROJECTION = 'com.rigreceipts.network.disclosure.projection.workflow_state_minimal.v1';

/** `app.reject_mutation()` and the delivery transition guard both raise this. */
const APPEND_ONLY = '23000';
const INSUFFICIENT_PRIVILEGE = '42501';
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

let owner: Client;
let app: Client;
let worker: Client;
let adminA: Client;
let fixtureA: IdentityFixture;
let fixtureB: IdentityFixture;

let orgAsserter = '';
let orgRecipient = '';
let orgOtherTenant = '';
/** `app.network_delivery_attempt_outcome`, in declaration order, read from the catalog. */
let deliveryAttemptOutcomes: string[] = [];

interface Outcome {
  readonly sqlstate: string | null;
  readonly message: string;
  readonly rowCount: number | null;
  /** Which named rule refused, when one did. A SQLSTATE alone cannot say. */
  readonly constraint: string | null;
}

async function attempt(c: Client, sql: string, params: unknown[] = []): Promise<Outcome> {
  await c.query('BEGIN');
  try {
    const r = await c.query(sql, params);
    await c.query('ROLLBACK');
    return { sqlstate: null, message: '', rowCount: r.rowCount, constraint: null };
  } catch (error) {
    await c.query('ROLLBACK');
    const e = error as Error & { code?: string; constraint?: string };
    return {
      sqlstate: e.code ?? 'unknown',
      message: e.message.split('\n')[0]!,
      rowCount: null,
      constraint: e.constraint ?? null,
    };
  }
}

/** Require a specific guard, never merely "it threw". */
function expectSqlstate(outcome: Outcome, expected: string, label: string): void {
  expect(outcome.sqlstate, `${label}: got ${outcome.sqlstate} ${outcome.message}`).toBe(expected);
}

const asAdminOfA = <T>(work: (c: Queryable) => Promise<T>): Promise<T> =>
  withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), work);

async function registerOrganization(label: string, tenantId: string | null): Promise<string> {
  return asRole(db, 'freightos_control_plane', async (client) => {
    const r = await client.query<{ id: string }>(
      `INSERT INTO network_participants
         (participant_type, display_name, tenant_id, status, source_system, created_by, updated_by)
       VALUES ('organization', $1, $2, 'active', 'test:n6', 'test:n6', 'test:n6')
       RETURNING id`,
      [`n6-${label}`, tenantId],
    );
    return r.rows[0]!.id;
  });
}

async function grantPermission(key: string): Promise<void> {
  const r = await adminA.query<{ outcome: string; reason: string | null }>(
    'SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5)',
    [fixtureA.tenantId, fixtureA.roleId, key, 'identity_administration', randomUUID()],
  );
  if (r.rows[0]!.outcome !== 'succeeded') {
    throw new Error(`could not grant ${key}: ${r.rows[0]!.outcome} ${r.rows[0]!.reason ?? ''}`);
  }
}

/** A subscription written through the governed recipient-authored path. */
async function createSubscription(recipient: string): Promise<string> {
  return asAdminOfA(async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO network_disclosure_subscriptions
         (recipient_participant_id, purpose_code, durable_schema_ref, destination_kind,
          effective_from)
       VALUES ($1, $2, $3, 'freightos_inbox', now() - interval '1 day')
       RETURNING subscription_id AS id`,
      [recipient, PURPOSE, WORKFLOW_STATE],
    );
    return r.rows[0]!.id;
  });
}

/**
 * An accepted N3 event, through the REAL acceptance component.
 *
 * `acceptNetworkEvent` is the production path: it validates the organization, derives tenant scope,
 * resolves the governed durable ref, validates `data` against that contract, builds and validates
 * the envelope, and inserts — which is what mints the N4 intent by trigger. A hand-written INSERT
 * here would have to reproduce every N3 constraint by hand and would drift the moment N3 adds one;
 * more importantly, an N6 test whose setup bypassed acceptance would be proving disclosure
 * behaviour over a row acceptance would have refused.
 *
 * The payload is schema-valid `workflow-state.v1` because that is the one contract N5-B classifies
 * as disclosable under the only purpose that exists. `secret_rate` is NOT present: the contract
 * sets `additionalProperties: false`, so the "unauthorized field" this suite checks for is a real
 * governed field outside the projection rather than an invented one.
 */
async function acceptEvent(organizationId: string): Promise<string> {
  const client = db.connectAs('freightos_event_writer');
  await client.connect();
  try {
    await client.query('BEGIN');
    try {
      const result = await acceptNetworkEvent(client, {
        type: 'com.rigreceipts.network.workflow.state.recorded.v1',
        source: 'urn:freightos:test:n6',
        subject: [{ network_id: 'obj-00000001', object_type: 'workflow' }],
        time: new Date().toISOString(),
        organization_id: organizationId,
        classification: 'internal',
        schema_ref: WORKFLOW_STATE,
        data: {
          workflow_id: 'wf-1',
          workflow_type: 'shipment',
          state: 'in_transit',
          version: 1,
          participants: ['org-a', 'org-b'],
          updated_at: '2026-05-01T00:00:00.000Z',
        },
      });
      await client.query('COMMIT');
      return result.event_id;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  fixtureA = await seedVerifiedFixture(db, TENANT_A);
  fixtureB = await seedVerifiedFixture(db, TENANT_B);
  owner = db.connectAs('postgres');
  await owner.connect();
  app = db.connectAs('freightos_app');
  await app.connect();
  worker = db.connectAs('freightos_delivery_worker');
  await worker.connect();
  adminA = await connectAsFixtureAdministrator(db, fixtureA);

  orgAsserter = await registerOrganization('asserter', TENANT_A);
  orgRecipient = await registerOrganization('recipient', TENANT_A);
  orgOtherTenant = await registerOrganization('other-tenant', TENANT_B);

  deliveryAttemptOutcomes = (
    await owner.query<{ v: string }>(
      `SELECT e.enumlabel AS v FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'app' AND t.typname = 'network_delivery_attempt_outcome'
        ORDER BY e.enumsortorder`,
    )
  ).rows.map((x) => x.v);

  await grantPermission('network.disclosure_subscription.create');
  await grantPermission('network.disclosure_subscription.revoke');
  await grantPermission('network.disclosure_subscription.read');

  // A REAL N5-A grant and its revocation, written through the governed N5-A path — permission
  // gate, RLS policy and all. Delivery-time re-authorization is the whole reason the worker holds
  // SELECT on these two tables, so a fixture with neither would make "the worker can read them"
  // vacuously true. The revocation is here for the same reason: a worker that cannot see a
  // revocation would deliver on authority that no longer exists.
  await grantPermission('network.disclosure_grant.create');
  await grantPermission('network.disclosure_grant.read');
  await grantPermission('network.disclosure_grant.revoke');
  const grantId = await asAdminOfA(async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO network_disclosure_grants
         (grantor_participant_id, recipient_participant_id, purpose_code, projection_ref,
          authority_basis_code, effective_from, effective_until)
       VALUES ($1, $2, $3, $4, 'bilateral_grant', now() - interval '1 day', NULL)
       RETURNING grant_id AS id`,
      [orgAsserter, orgRecipient, PURPOSE, PROJECTION],
    );
    return r.rows[0]!.id;
  });
  await asAdminOfA(async (c) => {
    await c.query(
      `INSERT INTO network_disclosure_grant_revocations (grant_id, reason)
       VALUES ($1, 'n6 fixture: proves a revocation is visible to the delivery worker')`,
      [grantId],
    );
  });
}, 60_000);

afterAll(async () => {
  await Promise.all([owner?.end(), app?.end(), worker?.end(), adminA?.end()]);
});

describe('the event fixture produces exactly what N6 needs', () => {
  /**
   * Every security assertion below this point is built on an accepted event and its transport debt.
   * If the fixture silently stopped producing either, the N6 negatives would keep passing — they
   * would simply find nothing to route and conclude, correctly but uselessly, that nothing leaked.
   * This contract is what stops a future N6 test from being credited for a setup that never worked.
   */
  it('produces an accepted N3 event with the exact identity N6 routes on', async () => {
    const eventId = await acceptEvent(orgAsserter);

    const r = await owner.query<{
      id: string;
      schema_ref: string;
      organization_id: string;
      data: Record<string, unknown>;
    }>(
      `SELECT event_id AS id, schema_ref, organization_id, data
         FROM network_events WHERE event_id = $1`,
      [eventId],
    );
    expect(r.rowCount).toBe(1);
    expect(r.rows[0]!.id).toBe(eventId);
    expect(r.rows[0]!.schema_ref).toBe(WORKFLOW_STATE);
    expect(r.rows[0]!.organization_id).toBe(orgAsserter);
    expect(r.rows[0]!.data).toMatchObject({ workflow_id: 'wf-1', state: 'in_transit' });
  });

  it('mints the N4 transport intent, which N6 consumes rather than infers', async () => {
    const eventId = await acceptEvent(orgAsserter);
    const intent = await owner.query(
      'SELECT 1 FROM network_transport_intents WHERE network_event_id = $1',
      [eventId],
    );
    // Load-bearing: N6 keys its routing resolution off this row, not off the event's existence.
    expect(intent.rowCount).toBe(1);
  });
});

describe('the database surface N6 adds', () => {
  it('creates exactly seven tables, all with RLS enabled and forced', async () => {
    const r = await owner.query<{ n: string; rls: boolean; force: boolean }>(
      `SELECT c.relname AS n, c.relrowsecurity AS rls, c.relforcerowsecurity AS force
         FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
        WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1)
        ORDER BY c.relname`,
      [N6_TABLES],
    );
    expect(r.rows.map((x) => x.n)).toEqual([...N6_TABLES]);
    expect(r.rows.every((x) => x.rls && x.force)).toBe(true);
  });

  it('builds no destination, webhook, dead-letter or replay table', async () => {
    const r = await owner.query<{ n: string }>(
      `SELECT c.relname AS n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
        WHERE ns.nspname = 'public' AND c.relkind = 'r'
          AND (c.relname LIKE '%destination%' OR c.relname LIKE '%webhook%'
               OR c.relname LIKE '%dead_letter%' OR c.relname LIKE '%replay%')`,
    );
    expect(r.rows.map((x) => x.n)).toEqual([]);
  });

  it('keys routing resolutions and deliveries off the N4 INTENT, not the event journal', async () => {
    const r = await owner.query<{ src: string }>(
      `SELECT conrelid::regclass::text AS src FROM pg_constraint
        WHERE contype = 'f' AND confrelid = 'public.network_transport_intents'::regclass
        ORDER BY 1`,
    );
    expect(r.rows.map((x) => x.src)).toEqual([
      'network_disclosure_deliveries',
      'network_disclosure_routing_resolutions',
    ]);
  });

  it('adds no database function beyond the transition guard, and no SECURITY DEFINER', async () => {
    const r = await owner.query<{ n: string; sd: boolean }>(
      `SELECT p.proname AS n, p.prosecdef AS sd FROM pg_proc p
         JOIN pg_namespace ns ON ns.oid = p.pronamespace
        WHERE ns.nspname = 'app' AND p.proname LIKE 'network_delivery%'`,
    );
    expect(r.rows.map((x) => x.n)).toEqual(['network_delivery_transition']);
    expect(r.rows[0]!.sd).toBe(false);
  });

  it('seeds three subscription permission keys and assigns them to no role', async () => {
    const keys = await owner.query<{ k: string }>(
      `SELECT key AS k FROM permissions WHERE key LIKE 'network.disclosure_subscription.%' ORDER BY 1`,
    );
    expect(keys.rows.map((x) => x.k)).toEqual([
      'network.disclosure_subscription.create',
      'network.disclosure_subscription.read',
      'network.disclosure_subscription.revoke',
    ]);
    // Assigned only by the governed admin path this suite exercised, never by the migration.
    const seeded = await owner.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
        WHERE p.key LIKE 'network.disclosure_subscription.%' AND rp.created_by LIKE 'migration:%'`,
    );
    expect(Number(seeded.rows[0]!.n)).toBe(0);
  });

  it('carries no field, pointer or projection column on a subscription', async () => {
    const r = await owner.query<{ a: string }>(
      `SELECT attname AS a FROM pg_attribute
        WHERE attrelid = 'public.network_disclosure_subscriptions'::regclass
          AND attnum > 0 AND NOT attisdropped ORDER BY attnum`,
    );
    const names = r.rows.map((x) => x.a);
    expect(names.some((n) => /pointer|field|projection/.test(n))).toBe(false);
    expect(names).toContain('purpose_code');
    expect(names).toContain('durable_schema_ref');
  });

  it('resolves each event exactly once — routing is prospective, not reopenable', async () => {
    // D-R. `network_event_id` is the PRIMARY KEY of the resolution table, so an event is resolved
    // once and the answer is final. A grant written after the resolution cannot reopen it: there
    // is nowhere to record a second, different answer for the same event. Without this the table
    // would accumulate revisions and "what was authorized at routing time" would stop being a fact.
    const r = await owner.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'public.network_disclosure_routing_resolutions'::regclass
          AND contype = 'p'`,
    );
    expect(r.rows.map((x) => x.def)).toEqual(['PRIMARY KEY (network_event_id)']);

    // And it is behaviourally closed, not merely declared: a second resolution for the same event
    // is refused by that key and no other.
    const eventId = await acceptEvent(orgAsserter);
    await worker.query(
      `INSERT INTO network_disclosure_routing_resolutions
         (network_event_id, matched_subscription_count, authorized_delivery_count, denied_count)
       VALUES ($1, 0, 0, 0)`,
      [eventId],
    );
    const second = await attempt(
      worker,
      `INSERT INTO network_disclosure_routing_resolutions
         (network_event_id, matched_subscription_count, authorized_delivery_count, denied_count)
       VALUES ($1, 1, 1, 0)`,
      [eventId],
    );
    expectSqlstate(second, UNIQUE_VIOLATION, 'a second routing resolution for the same event');
    expect(second.constraint).toBe('network_disclosure_routing_resolutions_pkey');
  });

  it('stores no payload on an attempt — a failure record is metadata only', async () => {
    // D-S. An attempt row exists to say THAT a delivery was tried and how it went. Copying the
    // artifact bytes into it — for debugging, for a dead-letter queue, for a retry cache — would
    // create a second copy of disclosed content governed by nothing, outside the artifact whose
    // digest and authorization the whole design binds together.
    const r = await owner.query<{ a: string }>(
      `SELECT attname AS a FROM pg_attribute
        WHERE attrelid = 'public.network_delivery_attempts'::regclass
          AND attnum > 0 AND NOT attisdropped ORDER BY attnum`,
    );
    const names = r.rows.map((x) => x.a);
    expect(
      names.filter((n) => /payload|canonical|body|content|data|response|raw/.test(n)),
      'an attempt row must carry no disclosed content',
    ).toEqual([]);
    // Anti-vacuity: it does carry the metadata it is for, so the absences above are real.
    expect(names).toContain('outcome');
    expect(names).toContain('attempt_number');
    expect(names).toContain('composite_decision_digest');
  });

  it('keeps the attempt taxonomy to TRANSPORT outcomes — an authorization denial is not one', () => {
    // D-T. A pre-transport authorization denial must never be recorded as a delivery attempt: the
    // four-way distinction depends on TRANSPORT OWED, DISCLOSURE AUTHORIZED, DELIVERY ATTEMPTED and
    // DELIVERY SUCCEEDED staying separate, and an `unauthorized` attempt outcome would collapse the
    // second into the third. A refusal terminates the delivery; it does not attempt it.
    expect(deliveryAttemptOutcomes).toEqual([
      'delivered',
      'database_transient',
      'database_conflict',
      'internal_error',
    ]);
    expect(
      deliveryAttemptOutcomes.filter((v) => /unauth|denied|forbidden|refus|permission/.test(v)),
    ).toEqual([]);
  });
});

describe('the delivery worker executes authority and cannot create it', () => {
  it('reads the N4 transport debt that freightos_app cannot see at all', async () => {
    // The capability that justifies the separate role, paired with the refusal that bounds it.
    const eventId = await acceptEvent(orgAsserter);
    const seen = await worker.query(
      'SELECT 1 FROM network_transport_intents WHERE network_event_id = $1',
      [eventId],
    );
    expect(seen.rowCount).toBe(1);

    const denied = await attempt(app, 'SELECT 1 FROM network_transport_intents');
    expectSqlstate(denied, INSUFFICIENT_PRIVILEGE, 'freightos_app must not read N4');
  });

  it('holds no write anywhere in N3, N4, N5-A, N5-B or interest', async () => {
    const r = await owner.query<{ t: string; p: string }>(
      `SELECT table_name AS t, privilege_type AS p FROM information_schema.table_privileges
        WHERE grantee = 'freightos_delivery_worker'
          AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
          AND table_name IN ('network_events','network_transport_intents','network_participants',
                             'network_schema_versions','network_disclosure_grants',
                             'network_disclosure_grant_revocations','network_disclosure_projections',
                             'network_disclosure_projection_fields','network_disclosure_purposes',
                             'network_disclosure_sensitivities','network_schema_disclosure_sensitivity',
                             'network_disclosure_purpose_ceilings','network_disclosure_subscriptions',
                             'network_disclosure_subscription_revocations')`,
    );
    expect(r.rows).toEqual([]);
  });

  it('is refused when it tries to write a grant, a sensitivity or a subscription', async () => {
    for (const sql of [
      `INSERT INTO network_disclosure_grants (grantor_participant_id, recipient_participant_id,
         purpose_code, projection_ref, authority_basis_code, effective_from)
       VALUES ('${orgAsserter}','${orgRecipient}','${PURPOSE}','x','bilateral_grant', now())`,
      `INSERT INTO network_disclosure_sensitivities (code, rank, externally_disclosable, description)
       VALUES ('forged', 1, true, 'x')`,
      `INSERT INTO network_disclosure_subscriptions (recipient_participant_id, purpose_code,
         durable_schema_ref, destination_kind, effective_from)
       VALUES ('${orgRecipient}','${PURPOSE}','${WORKFLOW_STATE}','freightos_inbox', now())`,
    ]) {
      expectSqlstate(await attempt(worker, sql), INSUFFICIENT_PRIVILEGE, sql.slice(0, 48));
    }
  });

  it('can actually READ every table it holds SELECT on — grant, policy and rows', async () => {
    // REGRESSION #5. 0034 granted the worker SELECT on twenty tables and gave four of them no
    // admitting policy: the journal, the participant registry, the disclosure grants and the
    // revocations. Under FORCE RLS that is not a privilege — it is a permanently empty read, with
    // no error to notice. The worker could see that a transport debt existed and could not see the
    // event it was owed for, who the participants were, or whether the authorization had since
    // been revoked. It failed CLOSED, which is why nothing caught it: every downstream assertion
    // passed by finding nothing to do.
    //
    // The gate is the PAIRING, not the four names. Any future GRANT to this role that arrives
    // without a policy fails here regardless of which table it is on.
    const unreadable = await owner.query<{ t: string }>(
      `SELECT g.table_name AS t
         FROM information_schema.role_table_grants g
        WHERE g.grantee = 'freightos_delivery_worker' AND g.privilege_type = 'SELECT'
          AND NOT EXISTS (
            SELECT 1 FROM pg_policies p
             WHERE p.schemaname = 'public' AND p.tablename = g.table_name
               AND p.cmd IN ('SELECT', 'ALL')
               AND ('freightos_delivery_worker' = ANY (p.roles) OR 'public' = ANY (p.roles)))
        ORDER BY 1`,
    );
    expect(
      unreadable.rows.map((x) => x.t),
      'a SELECT grant with no admitting policy returns zero rows, not an error',
    ).toEqual([]);

    // Layer three. The structural check above would still pass if a policy existed but excluded
    // every row, so compare what the worker sees against what is actually there. Read as the
    // superuser, which bypasses RLS, and require the counts to agree on the four that were broken.
    for (const table of [
      'network_events',
      'network_participants',
      'network_disclosure_grants',
      'network_disclosure_grant_revocations',
    ]) {
      const actual = Number(
        (await owner.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`)).rows[0]!.n,
      );
      const visible = Number(
        (await worker.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`)).rows[0]!.n,
      );
      // `network_participants` is narrowed to organizations, mirroring the policy N3 already gives
      // its own background identity — so it is compared against the organizations, not the total.
      const expected =
        table === 'network_participants'
          ? Number(
              (
                await owner.query<{ n: string }>(
                  `SELECT count(*)::text AS n FROM network_participants
                    WHERE participant_type = 'organization'`,
                )
              ).rows[0]!.n,
            )
          : actual;
      expect(visible, `${table}: the worker must see the rows it was granted`).toBe(expected);
      // Anti-vacuity: a table with no rows proves nothing about visibility.
      expect(
        expected,
        `${table}: fixture must contain rows for this to mean anything`,
      ).toBeGreaterThan(0);
    }
  });

  it('holds no membership conferring INHERIT or SET', async () => {
    const r = await owner.query<{ d: string }>(
      `SELECT coalesce(string_agg(format('%s inherit=%s set=%s', m.rolname, am.inherit_option,
                                          am.set_option), ', '), '(none)') AS d
         FROM pg_auth_members am
         JOIN pg_roles m ON m.oid = am.member
         JOIN pg_roles r ON r.oid = am.roleid
        WHERE r.rolname = 'freightos_delivery_worker' AND (am.inherit_option OR am.set_option)`,
    );
    expect(r.rows[0]!.d).toBe('(none)');
  });
});

describe('interest is authored by the recipient and grants nothing', () => {
  it('lets the recipient-side tenant create a subscription — the positive control', async () => {
    const id = await createSubscription(orgRecipient);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('derives the recipient from the caller’s own tenancy, in the policy itself — T-04', async () => {
    // WHY THIS IS STRUCTURAL AND THE TEST BELOW IS NOT ENOUGH.
    //
    // The behavioural test refuses a cross-tenant subscription, and it passes — but not for the
    // reason it names. `network_participants_read` is itself tenant-scoped, so the sub-select in
    // this policy's WITH CHECK cannot SEE an organization of another tenant at all: the EXISTS
    // fails on registry visibility before the tenant comparison here is ever consulted. Mutation
    // D-O deletes `p.tenant_id = app.current_tenant_id()` from this policy and the behavioural
    // test stays green.
    //
    // That is defence in depth working, and it is also a wrong oracle: the clause under test is
    // never the clause that refuses. So the clause is pinned directly. The two protect different
    // failure modes — the behavioural test would catch a registry policy that stopped filtering,
    // this one catches the subscription policy that stopped comparing.
    const withCheck = (
      await owner.query<{ v: string }>(
        `SELECT pg_get_expr(p.polwithcheck, p.polrelid) AS v
           FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
          WHERE c.relname = 'network_disclosure_subscriptions'
            AND p.polname = 'network_disclosure_subscriptions_insert'`,
      )
    ).rows[0]!.v;

    expect(withCheck, 'the recipient must be constrained to the caller’s own tenant').toContain(
      'tenant_id = ( SELECT app.current_tenant_id()',
    );
    // And the surrounding conditions the clause depends on, so a rewrite that keeps the comparison
    // but drops the organization or activity requirement also fails here.
    expect(withCheck).toContain("participant_type = 'organization'");
    expect(withCheck).toContain("status = 'active'");
    expect(withCheck).toContain('network.disclosure_subscription.create');
  });

  it('refuses a subscription naming an organization in another tenant', async () => {
    await expect(
      asAdminOfA((c) =>
        c.query(
          `INSERT INTO network_disclosure_subscriptions (recipient_participant_id, purpose_code,
             durable_schema_ref, destination_kind, effective_from)
           VALUES ($1, $2, $3, 'freightos_inbox', now())`,
          [orgOtherTenant, PURPOSE, WORKFLOW_STATE],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('refuses a subscription from a principal without the create permission', async () => {
    // TENANT_B, and the organization it names is TENANT_B's own — so tenancy MATCHES and the only
    // axis that differs is the missing permission. A second TENANT_A fixture would collide on
    // `organization_nodes_one_root_per_tenant` during seeding and prove nothing about the gate.
    await expect(
      withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureB), (c) =>
        c.query(
          `INSERT INTO network_disclosure_subscriptions (recipient_participant_id, purpose_code,
             durable_schema_ref, destination_kind, effective_from)
           VALUES ($1, $2, $3, 'freightos_inbox', now())`,
          [orgOtherTenant, PURPOSE, WORKFLOW_STATE],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('refuses a second revocation for the same subscription', async () => {
    const sub = await createSubscriptionFor('double-revoke');
    await asAdminOfA((c) =>
      c.query(
        'INSERT INTO network_disclosure_subscription_revocations (subscription_id) VALUES ($1)',
        [sub],
      ),
    );
    await expect(
      asAdminOfA((c) =>
        c.query(
          'INSERT INTO network_disclosure_subscription_revocations (subscription_id) VALUES ($1)',
          [sub],
        ),
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('refuses UPDATE on a subscription — interest is withdrawn, never edited', async () => {
    const sub = await createSubscriptionFor('no-update');
    const outcome = await attempt(
      owner,
      `UPDATE network_disclosure_subscriptions SET created_by = 'tampered' WHERE subscription_id = $1`,
      [sub],
    );
    expectSqlstate(outcome, APPEND_ONLY, 'subscription UPDATE');
    expect(outcome.message).toBe(
      'network_disclosure_subscriptions is append-only: UPDATE is not permitted',
    );
  });
});

/** A distinct recipient org per subscription, so the unique-interest index does not collide. */
async function createSubscriptionFor(label: string): Promise<string> {
  const org = await registerOrganization(label, TENANT_A);
  return createSubscription(org);
}

describe('the delivery state machine is enforced by the database', () => {
  async function seedDelivery(label: string): Promise<{ delivery: string; artifact: string }> {
    const org = await registerOrganization(label, TENANT_A);
    const sub = await createSubscription(org);
    const eventId = await acceptEvent(orgAsserter);
    const digest = 'a'.repeat(64);
    const artifact = (
      await worker.query<{ id: string }>(
        `INSERT INTO network_disclosure_artifacts
           (network_event_id, subscription_id, recipient_participant_id, purpose_code,
            durable_schema_ref, sensitivity_code, permitted_pointers, authorization_digest,
            composite_decision_digest, payload_canonical, payload_digest)
         VALUES ($1,$2,$3,$4,$5,'counterparty_identifying', ARRAY['/workflow_id'], $6,$6,'{}',$6)
         RETURNING artifact_id AS id`,
        [eventId, sub, org, PURPOSE, WORKFLOW_STATE, digest],
      )
    ).rows[0]!.id;
    const delivery = (
      await worker.query<{ id: string }>(
        `INSERT INTO network_disclosure_deliveries (network_event_id, subscription_id, artifact_id)
         VALUES ($1,$2,$3) RETURNING delivery_id AS id`,
        [eventId, sub, artifact],
      )
    ).rows[0]!.id;
    return { delivery, artifact };
  }

  it('permits pending -> delivered with a version bump — the positive control', async () => {
    const { delivery } = await seedDelivery('sm-ok');
    const r = await worker.query(
      `UPDATE network_disclosure_deliveries
          SET state = 'delivered', delivered_at = now(), record_version = record_version + 1
        WHERE delivery_id = $1`,
      [delivery],
    );
    expect(r.rowCount).toBe(1);
  });

  it('refuses any transition out of a terminal state', async () => {
    const { delivery } = await seedDelivery('sm-terminal');
    await worker.query(
      `UPDATE network_disclosure_deliveries SET state = 'delivered', delivered_at = now(),
              record_version = record_version + 1 WHERE delivery_id = $1`,
      [delivery],
    );
    const outcome = await attempt(
      worker,
      `UPDATE network_disclosure_deliveries SET state = 'pending', delivered_at = NULL,
              record_version = record_version + 1 WHERE delivery_id = $1`,
      [delivery],
    );
    expectSqlstate(outcome, APPEND_ONLY, 'delivered -> pending');
    expect(outcome.message).toContain('is terminal');
  });

  it('refuses a record_version that does not advance by exactly one', async () => {
    const { delivery } = await seedDelivery('sm-version');
    const outcome = await attempt(
      worker,
      `UPDATE network_disclosure_deliveries SET state = 'failed_retryable' WHERE delivery_id = $1`,
      [delivery],
    );
    expectSqlstate(outcome, APPEND_ONLY, 'stale record_version');
    expect(outcome.message).toContain('record_version');
  });

  it('refuses to re-point a delivery at a different artifact', async () => {
    const { delivery } = await seedDelivery('sm-identity');
    const other = await seedDelivery('sm-identity-2');
    const outcome = await attempt(
      worker,
      `UPDATE network_disclosure_deliveries SET artifact_id = $2, record_version = record_version + 1
        WHERE delivery_id = $1`,
      [delivery, other.artifact],
    );
    expectSqlstate(outcome, APPEND_ONLY, 'artifact re-point');
    expect(outcome.message).toContain('identity is immutable');
  });

  it('refuses DELETE to the worker by privilege, and to the owner by trigger', async () => {
    // TWO different guards, asserted against the principal each actually binds. The worker holds no
    // DELETE privilege, so it is stopped at 42501 before any trigger runs; asserting the trigger
    // here would pass on a privilege error and would keep passing if the trigger were dropped. The
    // superuser bypasses privilege and RLS, so it is the only principal that can reach the trigger
    // — which is what makes the trigger's existence provable at all.
    const { delivery } = await seedDelivery('sm-delete');

    const byWorker = await attempt(
      worker,
      'DELETE FROM network_disclosure_deliveries WHERE delivery_id = $1',
      [delivery],
    );
    expectSqlstate(byWorker, INSUFFICIENT_PRIVILEGE, 'worker DELETE');

    const bySuperuser = await attempt(
      owner,
      'DELETE FROM network_disclosure_deliveries WHERE delivery_id = $1',
      [delivery],
    );
    expectSqlstate(bySuperuser, APPEND_ONLY, 'superuser DELETE');
    expect(bySuperuser.message).toBe(
      'network_disclosure_deliveries is append-only: DELETE is not permitted',
    );
  });

  it('refuses a second delivery for the same event and subscription, terminal or not', async () => {
    const { delivery } = await seedDelivery('sm-unique');
    const row = await worker.query<{ e: string; s: string; a: string }>(
      `SELECT network_event_id AS e, subscription_id AS s, artifact_id AS a
         FROM network_disclosure_deliveries WHERE delivery_id = $1`,
      [delivery],
    );
    // Terminate it first: the uniqueness is UNCONDITIONAL, so even a terminated obligation blocks
    // recreation. Recreating one would be replay wearing a delivery's clothes.
    await worker.query(
      `UPDATE network_disclosure_deliveries SET state = 'terminated_unauthorized',
              terminated_at = now(), record_version = record_version + 1 WHERE delivery_id = $1`,
      [delivery],
    );

    // A SECOND, UNUSED ARTIFACT, so the constraint under test is the only one that can fire.
    //
    // Re-using the original artifact_id made this test pass for the wrong reason:
    // `network_disclosure_deliveries_artifact_id_key` is violated first, and the event+subscription
    // uniqueness was never exercised at all. Removing the constraint entirely — mutation D-L — left
    // the test green, which is how the false green was found. The second artifact belongs to a
    // different subscription, because `network_disclosure_artifacts` independently allows only one
    // artifact per event and subscription; the delivery row then claims the ORIGINAL subscription,
    // which is exactly the duplicate obligation this rule exists to refuse.
    const otherOrg = await registerOrganization('sm-unique-other', TENANT_A);
    const otherSub = await createSubscription(otherOrg);
    const spare = (
      await worker.query<{ id: string }>(
        `INSERT INTO network_disclosure_artifacts
           (network_event_id, subscription_id, recipient_participant_id, purpose_code,
            durable_schema_ref, sensitivity_code, permitted_pointers, authorization_digest,
            composite_decision_digest, payload_canonical, payload_digest)
         VALUES ($1,$2,$3,$4,$5,'counterparty_identifying', ARRAY['/workflow_id'], $6,$6,'{}',$6)
         RETURNING artifact_id AS id`,
        [row.rows[0]!.e, otherSub, otherOrg, PURPOSE, WORKFLOW_STATE, 'd'.repeat(64)],
      )
    ).rows[0]!.id;

    const outcome = await attempt(
      worker,
      `INSERT INTO network_disclosure_deliveries (network_event_id, subscription_id, artifact_id)
       VALUES ($1,$2,$3)`,
      [row.rows[0]!.e, row.rows[0]!.s, spare],
    );
    expectSqlstate(outcome, UNIQUE_VIOLATION, 'duplicate obligation after termination');
    // The CONSTRAINT NAME, not merely the SQLSTATE. Three unique constraints sit on this table and
    // any of them yields 23505; naming the one that fired is what stops a future change from
    // satisfying this assertion through a different rule.
    expect(outcome.constraint, 'the event+subscription rule must be what refuses').toBe(
      'network_disclosure_deliveries_one_per_event_subscription',
    );
  });
});

/**
 * R-07 … R-10 — the provenance chain, proven link by link.
 *
 * Every one of these rows was ACCEPTED by the shipped candidate. Each column involved was
 * individually valid — a real event, a real subscription, a real registered organization — and
 * nothing required them to describe the SAME disclosure, so a delivery could answer "who is this
 * for" one way while the artifact it carried answered another.
 *
 * The negatives below are pinned to the constraint NAME, not merely to 23503. Six foreign keys sit
 * on these three tables and any of them yields 23503; naming the one that must fire is what stops
 * a future change from satisfying the assertion through an unrelated rule — the same standard the
 * duplicate-obligation test learned from mutation D-L.
 */
/**
 * F-2 — the trigger surface, pinned structurally.
 *
 * The behavioural tests above prove the transition guard REFUSES what it should; mutation D-M was
 * caught by them. What they cannot distinguish is a guard that stopped running from one that never
 * had to: a trigger recreated as AFTER, disabled with `ALTER TABLE … DISABLE TRIGGER`, or given a
 * `WHEN` clause that excuses exactly the rows it exists to stop would leave most behavioural
 * assertions intact while the mechanism was gone.
 *
 * 0032 and 0033 both pin their triggers this way. 0034 shipped with zero `pg_trigger` assertions,
 * which is an assertion-coverage regression against its own predecessors rather than an unguarded
 * hole — and this is what closes it. Enabled state and WHEN presence are included because a
 * disabled trigger is still IN `pg_trigger`, so an inventory keyed on presence proves nothing.
 */
describe('the N6 trigger surface is exactly what 0034 built — F-2', () => {
  const INVENTORY = `
    SELECT format('%s.%s %s %s %s %s/%s when=%s',
             cl.relname, t.tgname,
             CASE WHEN (t.tgtype & 2) <> 0 THEN 'BEFORE' ELSE 'AFTER' END,
             CASE WHEN (t.tgtype & 4) <> 0 THEN 'INSERT'
                  WHEN (t.tgtype & 8) <> 0 THEN 'DELETE'
                  WHEN (t.tgtype & 16) <> 0 THEN 'UPDATE'
                  ELSE 'TRUNCATE' END,
             CASE WHEN (t.tgtype & 1) <> 0 THEN 'ROW' ELSE 'STATEMENT' END,
             ns.nspname || '.' || p.proname, t.tgenabled::text,
             CASE WHEN t.tgqual IS NULL THEN 'none' ELSE 'present' END) AS line
      FROM pg_trigger t
      JOIN pg_class cl ON cl.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE NOT t.tgisinternal AND n.nspname = 'public'
       AND cl.relname = ANY ($1::text[])
     ORDER BY cl.relname, t.tgname`;

  const inventory = async (c: Client): Promise<string[]> =>
    (await c.query<{ line: string }>(INVENTORY, [[...N6_TABLES]])).rows.map((x) => x.line);

  /** Every 0034-owned trigger, in full: timing, event, level, function, enabled state, WHEN. */
  const EXPECTED = [
    'network_delivery_attempts.network_delivery_attempts_no_delete BEFORE DELETE ROW app.reject_mutation/O when=none',
    'network_delivery_attempts.network_delivery_attempts_no_truncate BEFORE TRUNCATE STATEMENT app.reject_mutation/O when=none',
    'network_delivery_attempts.network_delivery_attempts_no_update BEFORE UPDATE ROW app.reject_mutation/O when=none',
    'network_disclosure_artifacts.network_disclosure_artifacts_no_delete BEFORE DELETE ROW app.reject_mutation/O when=none',
    'network_disclosure_artifacts.network_disclosure_artifacts_no_truncate BEFORE TRUNCATE STATEMENT app.reject_mutation/O when=none',
    'network_disclosure_artifacts.network_disclosure_artifacts_no_update BEFORE UPDATE ROW app.reject_mutation/O when=none',
    'network_disclosure_deliveries.network_disclosure_deliveries_no_delete BEFORE DELETE ROW app.reject_mutation/O when=none',
    'network_disclosure_deliveries.network_disclosure_deliveries_no_truncate BEFORE TRUNCATE STATEMENT app.reject_mutation/O when=none',
    'network_disclosure_deliveries.network_disclosure_deliveries_transition BEFORE UPDATE ROW app.network_delivery_transition/O when=none',
    'network_disclosure_inbox.network_disclosure_inbox_no_delete BEFORE DELETE ROW app.reject_mutation/O when=none',
    'network_disclosure_inbox.network_disclosure_inbox_no_truncate BEFORE TRUNCATE STATEMENT app.reject_mutation/O when=none',
    'network_disclosure_inbox.network_disclosure_inbox_no_update BEFORE UPDATE ROW app.reject_mutation/O when=none',
    'network_disclosure_routing_resolutions.network_disclosure_routing_resolutions_no_delete BEFORE DELETE ROW app.reject_mutation/O when=none',
    'network_disclosure_routing_resolutions.network_disclosure_routing_resolutions_no_truncate BEFORE TRUNCATE STATEMENT app.reject_mutation/O when=none',
    'network_disclosure_routing_resolutions.network_disclosure_routing_resolutions_no_update BEFORE UPDATE ROW app.reject_mutation/O when=none',
    'network_disclosure_subscription_revocations.network_disclosure_subscription_revocations_no_delete BEFORE DELETE ROW app.reject_mutation/O when=none',
    'network_disclosure_subscription_revocations.network_disclosure_subscription_revocations_no_truncate BEFORE TRUNCATE STATEMENT app.reject_mutation/O when=none',
    'network_disclosure_subscription_revocations.network_disclosure_subscription_revocations_no_update BEFORE UPDATE ROW app.reject_mutation/O when=none',
    'network_disclosure_subscriptions.network_disclosure_subscriptions_no_delete BEFORE DELETE ROW app.reject_mutation/O when=none',
    'network_disclosure_subscriptions.network_disclosure_subscriptions_no_truncate BEFORE TRUNCATE STATEMENT app.reject_mutation/O when=none',
    'network_disclosure_subscriptions.network_disclosure_subscriptions_no_update BEFORE UPDATE ROW app.reject_mutation/O when=none',
  ];

  it('matches the declared inventory exactly, name for name and attribute for attribute', async () => {
    expect(await inventory(owner)).toEqual(EXPECTED);
  });

  it('gives the delivery transition guard the one shape that can stop a bad UPDATE', async () => {
    // Called out separately from the list because this is the only trigger on an N6 table that is
    // not `app.reject_mutation`, and the only one whose timing is load-bearing rather than
    // conventional: AFTER UPDATE cannot refuse a transition, it can only observe one.
    const line = (await inventory(owner)).filter((l) => l.includes('_transition'));
    expect(line).toEqual([
      'network_disclosure_deliveries.network_disclosure_deliveries_transition BEFORE UPDATE ROW app.network_delivery_transition/O when=none',
    ]);
  });

  it('detects a DROPPED guard — F2-A', async () => {
    await owner.query('BEGIN');
    try {
      await owner.query(
        'DROP TRIGGER network_disclosure_deliveries_transition ON network_disclosure_deliveries',
      );
      expect(await inventory(owner)).not.toEqual(EXPECTED);
      expect((await inventory(owner)).filter((l) => l.includes('_transition'))).toEqual([]);
    } finally {
      await owner.query('ROLLBACK');
    }
    expect(await inventory(owner)).toEqual(EXPECTED);
  });

  it('detects a guard recreated with the wrong TIMING — F2-B', async () => {
    await owner.query('BEGIN');
    try {
      await owner.query(
        'DROP TRIGGER network_disclosure_deliveries_transition ON network_disclosure_deliveries',
      );
      await owner.query(
        `CREATE TRIGGER network_disclosure_deliveries_transition
           AFTER UPDATE ON network_disclosure_deliveries
           FOR EACH ROW EXECUTE FUNCTION app.network_delivery_transition()`,
      );
      const line = (await inventory(owner)).filter((l) => l.includes('_transition'));
      expect(line[0]).toContain('AFTER UPDATE ROW');
      expect(await inventory(owner)).not.toEqual(EXPECTED);
    } finally {
      await owner.query('ROLLBACK');
    }
    expect(await inventory(owner)).toEqual(EXPECTED);
  });

  it('detects a DISABLED guard, which presence alone cannot — F2-C', async () => {
    await owner.query('BEGIN');
    try {
      await owner.query(
        `ALTER TABLE network_disclosure_deliveries
           DISABLE TRIGGER network_disclosure_deliveries_transition`,
      );
      const line = (await inventory(owner)).filter((l) => l.includes('_transition'));
      // Still present, still BEFORE UPDATE ROW, still the right function — and inert.
      expect(line[0]).toContain('BEFORE UPDATE ROW app.network_delivery_transition/D');
      expect(await inventory(owner)).not.toEqual(EXPECTED);
    } finally {
      await owner.query('ROLLBACK');
    }
    expect(await inventory(owner)).toEqual(EXPECTED);
  });

  it('detects a guard given a WHEN clause that excuses the rows it exists to stop — F2-D', async () => {
    await owner.query('BEGIN');
    try {
      await owner.query(
        'DROP TRIGGER network_disclosure_deliveries_transition ON network_disclosure_deliveries',
      );
      await owner.query(
        `CREATE TRIGGER network_disclosure_deliveries_transition
           BEFORE UPDATE ON network_disclosure_deliveries
           FOR EACH ROW WHEN (OLD.state = 'pending')
           EXECUTE FUNCTION app.network_delivery_transition()`,
      );
      const line = (await inventory(owner)).filter((l) => l.includes('_transition'));
      expect(line[0]).toContain('when=present');
      expect(await inventory(owner)).not.toEqual(EXPECTED);
    } finally {
      await owner.query('ROLLBACK');
    }
    expect(await inventory(owner)).toEqual(EXPECTED);
  });
});

describe('the provenance chain cannot be made to contradict itself', () => {
  interface Chain {
    readonly event: string;
    readonly subscription: string;
    readonly recipient: string;
    readonly artifact: string;
  }

  /** One consistent (event, subscription, recipient, artifact) tuple. */
  async function mintChain(label: string): Promise<Chain> {
    const recipient = await registerOrganization(label, TENANT_A);
    const subscription = await createSubscription(recipient);
    const event = await acceptEvent(orgAsserter);
    const artifact = (
      await worker.query<{ id: string }>(
        `INSERT INTO network_disclosure_artifacts
           (network_event_id, subscription_id, recipient_participant_id, purpose_code,
            durable_schema_ref, sensitivity_code, permitted_pointers, authorization_digest,
            composite_decision_digest, payload_canonical, payload_digest)
         VALUES ($1,$2,$3,$4,$5,'counterparty_identifying', ARRAY['/workflow_id'], $6,$6,'{}',$6)
         RETURNING artifact_id AS id`,
        [event, subscription, recipient, PURPOSE, WORKFLOW_STATE, 'c'.repeat(64)],
      )
    ).rows[0]!.id;
    return { event, subscription, recipient, artifact };
  }

  const INSERT_DELIVERY = `INSERT INTO network_disclosure_deliveries
      (network_event_id, subscription_id, artifact_id) VALUES ($1,$2,$3)`;
  const INSERT_INBOX = `INSERT INTO network_disclosure_inbox
      (delivery_id, artifact_id, recipient_participant_id) VALUES ($1,$2,$3)`;

  it('resolves each delivery to exactly one routing resolution — U-01', async () => {
    // WHY THERE IS NO delivery -> routing_resolution FOREIGN KEY, stated as a property rather than
    // as an omission.
    //
    // `network_disclosure_routing_resolutions` is keyed BY the N4 intent — `network_event_id` is
    // its PRIMARY KEY — and a delivery carries that same intent key. So the lineage is total and
    // unambiguous by construction: there is exactly one resolution per event, which means a
    // delivery cannot be attached to a DIFFERENT resolution context. There is no second candidate
    // to attach to, so there is no contradiction of the F-1 kind available here, and a direct
    // foreign key would add no fact — it would only impose a write ORDER on a worker that does not
    // exist yet.
    //
    // What the resolution proves that the delivery does not is the count triple: how many
    // subscriptions matched, how many were authorized, how many denied. That is a separate fact
    // about enumeration, not a property of any one delivery.
    const c = await mintChain('lineage');
    await worker.query(
      `INSERT INTO network_disclosure_routing_resolutions
         (network_event_id, matched_subscription_count, authorized_delivery_count, denied_count)
       VALUES ($1, 1, 1, 0)`,
      [c.event],
    );
    await worker.query(INSERT_DELIVERY, [c.event, c.subscription, c.artifact]);

    const joined = await worker.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM network_disclosure_deliveries d
         JOIN network_disclosure_routing_resolutions r ON r.network_event_id = d.network_event_id
        WHERE d.network_event_id = $1`,
      [c.event],
    );
    expect(Number(joined.rows[0]!.n), 'exactly one resolution per delivery').toBe(1);

    // And a second resolution for the same event is impossible, which is what makes "exactly one"
    // a rule rather than an observation.
    const second = await attempt(
      worker,
      `INSERT INTO network_disclosure_routing_resolutions
         (network_event_id, matched_subscription_count, authorized_delivery_count, denied_count)
       VALUES ($1, 2, 2, 0)`,
      [c.event],
    );
    expectSqlstate(second, UNIQUE_VIOLATION, 'second routing resolution');
    expect(second.constraint).toBe('network_disclosure_routing_resolutions_pkey');
  });

  it('accepts the consistent delivery — the positive control', async () => {
    const c = await mintChain('chain-ok');
    const outcome = await attempt(worker, INSERT_DELIVERY, [c.event, c.subscription, c.artifact]);
    expect(outcome.sqlstate, `positive control refused: ${outcome.message}`).toBeNull();
    expect(outcome.rowCount).toBe(1);
  });

  it('refuses a delivery whose EVENT is not the artifact’s — R-07', async () => {
    const c = await mintChain('chain-event');
    const otherEvent = await acceptEvent(orgAsserter);
    const outcome = await attempt(worker, INSERT_DELIVERY, [
      otherEvent,
      c.subscription,
      c.artifact,
    ]);
    expectSqlstate(outcome, FOREIGN_KEY_VIOLATION, 'event mismatch');
    expect(outcome.constraint).toBe('network_disclosure_deliveries_artifact_binding');
  });

  it('refuses a delivery whose SUBSCRIPTION is not the artifact’s — R-07', async () => {
    const c = await mintChain('chain-sub');
    const other = await mintChain('chain-sub-other');
    const outcome = await attempt(worker, INSERT_DELIVERY, [
      c.event,
      other.subscription,
      c.artifact,
    ]);
    expectSqlstate(outcome, FOREIGN_KEY_VIOLATION, 'subscription mismatch');
    expect(outcome.constraint).toBe('network_disclosure_deliveries_artifact_binding');
  });

  it('refuses a delivery whose event AND subscription are both another’s — R-07', async () => {
    const c = await mintChain('chain-both');
    const other = await mintChain('chain-both-other');
    const outcome = await attempt(worker, INSERT_DELIVERY, [
      other.event,
      other.subscription,
      c.artifact,
    ]);
    expectSqlstate(outcome, FOREIGN_KEY_VIOLATION, 'event and subscription mismatch');
    expect(outcome.constraint).toBe('network_disclosure_deliveries_artifact_binding');
  });

  it('refuses an artifact whose recipient is not its subscription’s — R-10', async () => {
    const c = await mintChain('chain-artifact-recipient');
    const stranger = await registerOrganization('chain-stranger', TENANT_A);
    const outcome = await attempt(
      worker,
      `INSERT INTO network_disclosure_artifacts
         (network_event_id, subscription_id, recipient_participant_id, purpose_code,
          durable_schema_ref, sensitivity_code, permitted_pointers, authorization_digest,
          composite_decision_digest, payload_canonical, payload_digest)
       VALUES ($1,$2,$3,$4,$5,'counterparty_identifying', ARRAY['/workflow_id'], $6,$6,'{}',$6)`,
      [
        await acceptEvent(orgAsserter),
        c.subscription,
        stranger,
        PURPOSE,
        WORKFLOW_STATE,
        'e'.repeat(64),
      ],
    );
    expectSqlstate(outcome, FOREIGN_KEY_VIOLATION, 'artifact recipient mismatch');
    expect(outcome.constraint).toBe('network_disclosure_artifacts_subscription_recipient');
  });

  it('refuses an inbox row citing an artifact the delivery did not bind — R-09', async () => {
    const c = await mintChain('chain-inbox-artifact');
    const other = await mintChain('chain-inbox-artifact-other');
    const delivery = (
      await worker.query<{ id: string }>(`${INSERT_DELIVERY} RETURNING delivery_id AS id`, [
        c.event,
        c.subscription,
        c.artifact,
      ])
    ).rows[0]!.id;

    const outcome = await attempt(worker, INSERT_INBOX, [delivery, other.artifact, c.recipient]);
    expectSqlstate(outcome, FOREIGN_KEY_VIOLATION, 'inbox artifact mismatch');
    expect(outcome.constraint).toBe('network_disclosure_inbox_delivery_artifact');
  });

  it('refuses an inbox row naming a recipient the artifact was not authorized for — R-08', async () => {
    const c = await mintChain('chain-inbox-recipient');
    const stranger = await registerOrganization('chain-inbox-stranger', TENANT_A);
    const delivery = (
      await worker.query<{ id: string }>(`${INSERT_DELIVERY} RETURNING delivery_id AS id`, [
        c.event,
        c.subscription,
        c.artifact,
      ])
    ).rows[0]!.id;

    const outcome = await attempt(worker, INSERT_INBOX, [delivery, c.artifact, stranger]);
    expectSqlstate(outcome, FOREIGN_KEY_VIOLATION, 'inbox recipient mismatch');
    expect(outcome.constraint).toBe('network_disclosure_inbox_artifact_recipient');
  });

  it('refuses an inbox row addressed to ANOTHER TENANT — the cross-tenant disclosure path', async () => {
    // WHY THIS IS ITS OWN TEST. `network_disclosure_artifacts_recipient_read` decides artifact
    // visibility by joining the INBOX row's recipient to the reader's tenant. While that column was
    // bound only to the participant registry, naming any registered organization was enough — so an
    // inbox row citing a tenant-B organization made a tenant-A artifact readable by tenant B, with
    // no grant, policy or privilege touched. Reproduced on the shipped candidate: one row visible.
    const c = await mintChain('chain-xtenant');
    const delivery = (
      await worker.query<{ id: string }>(`${INSERT_DELIVERY} RETURNING delivery_id AS id`, [
        c.event,
        c.subscription,
        c.artifact,
      ])
    ).rows[0]!.id;

    const outcome = await attempt(worker, INSERT_INBOX, [delivery, c.artifact, orgOtherTenant]);
    expectSqlstate(outcome, FOREIGN_KEY_VIOLATION, 'cross-tenant inbox recipient');
    expect(outcome.constraint).toBe('network_disclosure_inbox_artifact_recipient');

    // And the disclosure the constraint prevents does not happen: tenant B sees nothing.
    const seen = await withAuthenticatedTestPrincipal(
      db,
      fixtureOperator(fixtureB),
      async (con) => {
        const r = await con.query(
          'SELECT artifact_id FROM network_disclosure_artifacts WHERE artifact_id = $1',
          [c.artifact],
        );
        return r.rows.length;
      },
    );
    expect(seen, 'a tenant-A artifact must be invisible to tenant B').toBe(0);
  });

  it('becomes reachable again when the binding is dropped — the detector is live', async () => {
    // ANTI-VACUITY, AND THE ANSWER TO "WHICH RULE ACTUALLY REFUSED".
    //
    // The mismatch above could in principle be refused by the artifact_id uniqueness, by the
    // event+subscription uniqueness, or by an unrelated key. This drops ONLY the new composite,
    // inside a transaction that is rolled back, and requires the same insert to succeed. If it
    // still failed, the negatives above would be passing for a reason other than the constraint
    // they name — which is exactly the false green mutation D-L found on the duplicate-obligation
    // test.
    const c = await mintChain('chain-mutation');
    const other = await mintChain('chain-mutation-other');

    await owner.query('BEGIN');
    try {
      await owner.query(
        `ALTER TABLE network_disclosure_deliveries
           DROP CONSTRAINT network_disclosure_deliveries_artifact_binding`,
      );
      const r = await owner.query(INSERT_DELIVERY, [other.event, other.subscription, c.artifact]);
      expect(r.rowCount, 'with the binding dropped the mismatch must be accepted').toBe(1);
    } finally {
      await owner.query('ROLLBACK');
    }

    // Restored by the rollback, and the mismatch is refused again by the named rule.
    const after = await attempt(worker, INSERT_DELIVERY, [
      other.event,
      other.subscription,
      c.artifact,
    ]);
    expectSqlstate(after, FOREIGN_KEY_VIOLATION, 'after restoration');
    expect(after.constraint).toBe('network_disclosure_deliveries_artifact_binding');
  });
});

describe('an artifact is invisible until it has actually been delivered', () => {
  it('hides a pending artifact from its own recipient, then reveals it on inbox commit', async () => {
    const org = await registerOrganization('visibility', TENANT_A);
    const sub = await createSubscription(org);
    const eventId = await acceptEvent(orgAsserter);
    const digest = 'b'.repeat(64);

    const artifact = (
      await worker.query<{ id: string }>(
        `INSERT INTO network_disclosure_artifacts
           (network_event_id, subscription_id, recipient_participant_id, purpose_code,
            durable_schema_ref, sensitivity_code, permitted_pointers, authorization_digest,
            composite_decision_digest, payload_canonical, payload_digest)
         VALUES ($1,$2,$3,$4,$5,'counterparty_identifying', ARRAY['/workflow_id'], $6,$6,
                 '{"workflow_id":"wf-1"}',$6)
         RETURNING artifact_id AS id`,
        [eventId, sub, org, PURPOSE, WORKFLOW_STATE, digest],
      )
    ).rows[0]!.id;
    const delivery = (
      await worker.query<{ id: string }>(
        `INSERT INTO network_disclosure_deliveries (network_event_id, subscription_id, artifact_id)
         VALUES ($1,$2,$3) RETURNING delivery_id AS id`,
        [eventId, sub, artifact],
      )
    ).rows[0]!.id;

    // BEFORE delivery: authorized, materialized, and invisible.
    const before = await app.query(
      'SELECT 1 FROM network_disclosure_artifacts WHERE artifact_id = $1',
      [artifact],
    );
    expect(before.rowCount).toBe(0);

    // The inbox commit — attempt row, inbox row and state change in ONE transaction.
    await worker.query('BEGIN');
    await worker.query(
      `INSERT INTO network_delivery_attempts (delivery_id, attempt_number,
         composite_decision_digest, outcome) VALUES ($1, 1, $2, 'delivered')`,
      [delivery, digest],
    );
    await worker.query(
      `INSERT INTO network_disclosure_inbox (delivery_id, artifact_id, recipient_participant_id)
       VALUES ($1,$2,$3)`,
      [delivery, artifact, org],
    );
    await worker.query(
      `UPDATE network_disclosure_deliveries SET state = 'delivered', delivered_at = now(),
              attempt_count = 1, record_version = record_version + 1 WHERE delivery_id = $1`,
      [delivery],
    );
    await worker.query('COMMIT');

    // AFTER: visible, and it is exactly the authorized bytes.
    const after = await asAdminOfA((c) =>
      c.query<{ p: string }>(
        'SELECT payload_canonical AS p FROM network_disclosure_artifacts WHERE artifact_id = $1',
        [artifact],
      ),
    );
    expect(after.rowCount).toBe(1);
    expect(after.rows[0]!.p).toBe('{"workflow_id":"wf-1"}');
    expect(after.rows[0]!.p).not.toContain('secret_rate');
  });

  it('refuses a second inbox row for the same delivery', async () => {
    const r = await worker.query<{ d: string; a: string; o: string }>(
      `SELECT delivery_id AS d, artifact_id AS a, recipient_participant_id AS o
         FROM network_disclosure_inbox LIMIT 1`,
    );
    const row = r.rows[0]!;
    const outcome = await attempt(
      worker,
      `INSERT INTO network_disclosure_inbox (delivery_id, artifact_id, recipient_participant_id)
       VALUES ($1,$2,$3)`,
      [row.d, row.a, row.o],
    );
    expectSqlstate(outcome, UNIQUE_VIOLATION, 'duplicate inbox commit');
  });

  it('shows a delivered artifact to nobody in another tenant', async () => {
    const seen = await withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureB), (c) =>
      c.query('SELECT count(*)::text AS n FROM network_disclosure_inbox'),
    );
    expect(Number((seen.rows[0] as { n: string }).n)).toBe(0);
  });

  it('hides an artifact whose delivery TERMINATED without delivering — U-12', async () => {
    // The fourth state the visibility chain has to get right, and the one nothing covered.
    // "Pending" and "delivered" were both tested; "authorized, attempted, refused" was not, and it
    // is the state a revoked grant produces. The artifact exists and is terminal-unauthorized, so
    // an inbox row must never appear and the bytes must never become readable.
    const org = await registerOrganization('terminated-vis', TENANT_A);
    const sub = await createSubscription(org);
    const eventId = await acceptEvent(orgAsserter);
    const digest = 'f'.repeat(64);
    const artifact = (
      await worker.query<{ id: string }>(
        `INSERT INTO network_disclosure_artifacts
           (network_event_id, subscription_id, recipient_participant_id, purpose_code,
            durable_schema_ref, sensitivity_code, permitted_pointers, authorization_digest,
            composite_decision_digest, payload_canonical, payload_digest)
         VALUES ($1,$2,$3,$4,$5,'counterparty_identifying', ARRAY['/workflow_id'], $6,$6,
                 '{"workflow_id":"wf-terminated"}',$6)
         RETURNING artifact_id AS id`,
        [eventId, sub, org, PURPOSE, WORKFLOW_STATE, digest],
      )
    ).rows[0]!.id;
    const delivery = (
      await worker.query<{ id: string }>(
        `INSERT INTO network_disclosure_deliveries (network_event_id, subscription_id, artifact_id)
         VALUES ($1,$2,$3) RETURNING delivery_id AS id`,
        [eventId, sub, artifact],
      )
    ).rows[0]!.id;
    await worker.query(
      `UPDATE network_disclosure_deliveries
          SET state = 'terminated_unauthorized', terminated_at = now(),
              terminal_reason = 'authorization withdrawn before transmission',
              record_version = record_version + 1
        WHERE delivery_id = $1`,
      [delivery],
    );

    const visible = await asAdminOfA(async (c) => {
      const r = await c.query(
        'SELECT artifact_id FROM network_disclosure_artifacts WHERE artifact_id = $1',
        [artifact],
      );
      return r.rows.length;
    });
    expect(visible, 'a terminated-unauthorized artifact must never become readable').toBe(0);

    // THE ORACLE. The same principal, the same query, one committed inbox row later — so the zero
    // above is the delivery state and not a broken identity, a missing grant or an absent ACL.
    await worker.query(
      `INSERT INTO network_disclosure_inbox (delivery_id, artifact_id, recipient_participant_id)
       VALUES ($1,$2,$3)`,
      [delivery, artifact, org],
    );
    const afterInbox = await asAdminOfA(async (c) => {
      const r = await c.query(
        'SELECT artifact_id FROM network_disclosure_artifacts WHERE artifact_id = $1',
        [artifact],
      );
      return r.rows.length;
    });
    expect(afterInbox, 'the identity used above can see a delivered artifact').toBe(1);
  });

  it('scopes recipient reads by TENANT, not by participant — U-12, stated exactly', async () => {
    // WHAT THE POLICY ACTUALLY SAYS, pinned so nobody has to infer it from the predicate.
    //
    // `network_disclosure_artifacts_recipient_read` joins the inbox recipient to the reader's
    // TENANT. A second organization of the same tenant therefore sees an artifact delivered to its
    // sibling — which is the boundary N5-A and N5-B already use, and is why the cross-tenant test
    // above is the isolation claim and this one is not. Asserted rather than assumed: a future
    // reading of "recipient" as participant-level isolation would be wrong about the shipped
    // policy, and this is where that misreading fails.
    const first = await registerOrganization('tenant-scope-1', TENANT_A);
    const sub = await createSubscription(first);
    const eventId = await acceptEvent(orgAsserter);
    const digest = '9'.repeat(64);
    const artifact = (
      await worker.query<{ id: string }>(
        `INSERT INTO network_disclosure_artifacts
           (network_event_id, subscription_id, recipient_participant_id, purpose_code,
            durable_schema_ref, sensitivity_code, permitted_pointers, authorization_digest,
            composite_decision_digest, payload_canonical, payload_digest)
         VALUES ($1,$2,$3,$4,$5,'counterparty_identifying', ARRAY['/workflow_id'], $6,$6,
                 '{"workflow_id":"wf-scope"}',$6)
         RETURNING artifact_id AS id`,
        [eventId, sub, first, PURPOSE, WORKFLOW_STATE, digest],
      )
    ).rows[0]!.id;
    const delivery = (
      await worker.query<{ id: string }>(
        `INSERT INTO network_disclosure_deliveries (network_event_id, subscription_id, artifact_id)
         VALUES ($1,$2,$3) RETURNING delivery_id AS id`,
        [eventId, sub, artifact],
      )
    ).rows[0]!.id;
    await worker.query(
      `INSERT INTO network_disclosure_inbox (delivery_id, artifact_id, recipient_participant_id)
       VALUES ($1,$2,$3)`,
      [delivery, artifact, first],
    );

    const sameTenant = await asAdminOfA(async (c) => {
      const r = await c.query(
        'SELECT artifact_id FROM network_disclosure_artifacts WHERE artifact_id = $1',
        [artifact],
      );
      return r.rows.length;
    });
    expect(sameTenant, 'tenant A can read what was delivered to a tenant-A organization').toBe(1);

    const otherTenant = await withAuthenticatedTestPrincipal(
      db,
      fixtureOperator(fixtureB),
      async (c) => {
        const r = await c.query(
          'SELECT artifact_id FROM network_disclosure_artifacts WHERE artifact_id = $1',
          [artifact],
        );
        return r.rows.length;
      },
    );
    expect(otherTenant, 'and tenant B cannot').toBe(0);
  });

  it('lets migration assertion (f) see the rows it inspects — U-10', async () => {
    // THE R-06 PATTERN, ON THE UP SIDE OF 0034.
    //
    // Assertion (f) claims the three N6 keys are held by nobody. It reads `role_permissions` as the
    // migrator, and that table is FORCE-RLS with policies predicated on `app.current_tenant_id()`,
    // which a deployment session does not have. Bare, the query returns zero rows whether or not an
    // assignment exists — measured on this branch: migrator 0, superuser 3 — so the claim held by
    // blindness. 0034 now takes the same temporary, exactly-scoped policy its own revert takes.
    //
    // This test measures BOTH numbers against the SAME rows. A guard that cannot tell them apart is
    // not evidence of anything.
    const truth = Number(
      (
        await owner.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM role_permissions rp
             JOIN permissions p ON p.id = rp.permission_id
            WHERE p.key LIKE 'network.disclosure_subscription.%'`,
        )
      ).rows[0]!.n,
    );
    // Non-vacuity: without rows, "blind" and "sighted" are the same number.
    expect(truth, 'the fixture assigns the three N6 subscription keys').toBeGreaterThan(0);

    const migrator = db.connectAsMigrator();
    await migrator.connect();
    try {
      const count = async (): Promise<number> =>
        Number(
          (
            await migrator.query<{ n: string }>(
              `SELECT count(*)::text AS n FROM role_permissions rp
                 JOIN permissions p ON p.id = rp.permission_id
                WHERE p.key LIKE 'network.disclosure_subscription.%'`,
            )
          ).rows[0]!.n,
        );

      expect(await count(), 'bare, the migrator is blind to role_permissions').toBe(0);

      await owner.query(
        `CREATE POLICY role_permissions_u10_probe ON public.role_permissions
           FOR SELECT TO freightos_migrator
           USING (permission_id IN (SELECT id FROM public.permissions
                                     WHERE key IN ('network.disclosure_subscription.create',
                                                   'network.disclosure_subscription.revoke',
                                                   'network.disclosure_subscription.read')))`,
      );
      try {
        expect(await count(), '0034’s scoped policy makes the guard sighted').toBe(truth);
      } finally {
        await owner.query('DROP POLICY role_permissions_u10_probe ON public.role_permissions');
      }
      expect(await count(), 'and the loan is returned').toBe(0);
    } finally {
      await migrator.end();
    }
  });

  it('constrains destination_kind to exactly one legal value — U-02', async () => {
    // The column is stored and read by no code path, which is correct for v1: there is exactly one
    // destination and the behaviour is deliberately invariant to it. What makes that safe is that
    // the DATABASE, not a convention, refuses any other value — so a second destination cannot be
    // introduced by writing a string, only by a migration that adds an enum label and the routing
    // to go with it.
    const labels = (
      await owner.query<{ v: string }>(
        `SELECT e.enumlabel AS v FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
           JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'app' AND t.typname = 'network_delivery_destination_kind'
          ORDER BY e.enumsortorder`,
      )
    ).rows.map((x) => x.v);
    expect(labels).toEqual(['freightos_inbox']);

    const outcome = await attempt(
      owner,
      `INSERT INTO network_disclosure_subscriptions
         (recipient_participant_id, purpose_code, durable_schema_ref, destination_kind,
          effective_from)
       VALUES ($1, $2, $3, 'webhook', now())`,
      [orgRecipient, PURPOSE, WORKFLOW_STATE],
    );
    // 22P02 — invalid text representation. The value is not a member of the enum, so it cannot be
    // stored at all; there is no CHECK to forget and no application branch to bypass.
    expectSqlstate(outcome, '22P02', 'a second destination kind');
  });

  it('binds every N6 participant reference to the registry, by type — U-14', async () => {
    // Not "a foreign key exists": WHICH key, to WHICH table, on WHICH columns. The generated
    // `recipient_participant_type` column is what makes the reference type-correct, and a bare
    // `uuid REFERENCES network_participants (id)` would satisfy "there is an FK" while allowing a
    // recipient that is not an organization. Compared as full constraint definitions so a future
    // narrowing to a single column fails here.
    const r = await owner.query<{ line: string }>(
      `SELECT format('%s: %s', c.conname, pg_get_constraintdef(c.oid)) AS line
         FROM pg_constraint c
        WHERE c.contype = 'f'
          AND c.confrelid = 'public.network_participants'::regclass
          AND c.conrelid::regclass::text = ANY($1)
        ORDER BY c.conname`,
      [[...N6_TABLES]],
    );
    expect(r.rows.map((x) => x.line)).toEqual([
      'network_disclosure_artifacts_recipient_is_organization: FOREIGN KEY (recipient_participant_id, recipient_participant_type) REFERENCES network_participants(id, participant_type)',
      'network_disclosure_inbox_recipient_is_organization: FOREIGN KEY (recipient_participant_id, recipient_participant_type) REFERENCES network_participants(id, participant_type)',
      'network_disclosure_subscriptions_recipient_is_organization: FOREIGN KEY (recipient_participant_id, recipient_participant_type) REFERENCES network_participants(id, participant_type)',
    ]);

    // The type column cannot drift, on any of the three: it is GENERATED ALWAYS ... STORED, so no
    // writer supplies it and no writer can change it.
    const generated = await owner.query<{ line: string }>(
      `SELECT format('%s.%s=%s', c.relname, a.attname, a.attgenerated) AS line
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND a.attname = 'recipient_participant_type'
          AND c.relname = ANY($1)
        ORDER BY c.relname`,
      [[...N6_TABLES]],
    );
    expect(generated.rows.map((x) => x.line)).toEqual([
      'network_disclosure_artifacts.recipient_participant_type=s',
      'network_disclosure_inbox.recipient_participant_type=s',
      'network_disclosure_subscriptions.recipient_participant_type=s',
    ]);

    // And no N6 table carries a tenant column at all, so tenant can never be substituted for
    // participant identity in any of these references.
    const tenantColumns = await owner.query<{ line: string }>(
      `SELECT format('%s.%s', c.relname, a.attname) AS line
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY($1)
          AND a.attnum > 0 AND NOT a.attisdropped AND a.attname LIKE '%tenant%'`,
      [[...N6_TABLES]],
    );
    expect(tenantColumns.rows.map((x) => x.line)).toEqual([]);
  });

  it('keeps operational delivery state out of the product surface entirely', async () => {
    for (const table of [
      'network_disclosure_deliveries',
      'network_delivery_attempts',
      'network_disclosure_routing_resolutions',
    ]) {
      expectSqlstate(
        await attempt(app, `SELECT 1 FROM ${table}`),
        INSUFFICIENT_PRIVILEGE,
        `freightos_app must not read ${table}`,
      );
    }
  });
});
