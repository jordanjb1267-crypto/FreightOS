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

/** `app.reject_mutation()` and the delivery transition guard both raise this. */
const APPEND_ONLY = '23000';
const INSUFFICIENT_PRIVILEGE = '42501';
const UNIQUE_VIOLATION = '23505';

let owner: Client;
let app: Client;
let worker: Client;
let adminA: Client;
let fixtureA: IdentityFixture;
let fixtureB: IdentityFixture;

let orgAsserter = '';
let orgRecipient = '';
let orgOtherTenant = '';

interface Outcome {
  readonly sqlstate: string | null;
  readonly message: string;
  readonly rowCount: number | null;
}

async function attempt(c: Client, sql: string, params: unknown[] = []): Promise<Outcome> {
  await c.query('BEGIN');
  try {
    const r = await c.query(sql, params);
    await c.query('ROLLBACK');
    return { sqlstate: null, message: '', rowCount: r.rowCount };
  } catch (error) {
    await c.query('ROLLBACK');
    const e = error as Error & { code?: string };
    return { sqlstate: e.code ?? 'unknown', message: e.message.split('\n')[0]!, rowCount: null };
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

  await grantPermission('network.disclosure_subscription.create');
  await grantPermission('network.disclosure_subscription.revoke');
  await grantPermission('network.disclosure_subscription.read');
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
    const outcome = await attempt(
      worker,
      `INSERT INTO network_disclosure_deliveries (network_event_id, subscription_id, artifact_id)
       VALUES ($1,$2,$3)`,
      [row.rows[0]!.e, row.rows[0]!.s, row.rows[0]!.a],
    );
    expectSqlstate(outcome, UNIQUE_VIOLATION, 'duplicate obligation after termination');
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
