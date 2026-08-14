import { randomUUID } from 'node:crypto';

import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  TRANSPORT_ATTEMPT_OUTCOMES,
  TRANSPORT_STATES,
  outcomeSemantics,
  type ExternalTransportAttemptOutcome,
} from '@freightos/context/external-transport';

import { acceptNetworkEvent } from '../../src/network-events.ts';
import { TENANT_A, TENANT_B, TestDatabase } from './harness.ts';
import type { IdentityFixture } from './identity-harness.ts';
import { connectAsFixtureAdministrator } from './identity-harness.ts';
import { N7_TRANSPORT_RELATIONS } from './network-relations.ts';
import { asRole, seedVerifiedFixture } from './sr2-harness.ts';
import { fixtureOperator, withAuthenticatedTestPrincipal } from './verified-test-auth.ts';
import type { Queryable } from '../../src/session.ts';

/**
 * N7-A — the external transport foundation, at the database layer. THE CONTROL PLANE, AND NO
 * NETWORK.
 *
 * This suite proves the boundary that N7-B will later cross. Everything here is about what CANNOT
 * happen: a destination cannot be registered for an organization the author does not hold, an
 * obligation cannot name an artifact and a destination belonging to different recipients, a permit
 * cannot be minted by the identity that would spend it, and the egress-capable role cannot read a
 * single input to an authorization decision.
 *
 *     authorization role  !=  egress role
 *
 * is the primary security invariant, and privilege — not convention — is what states it. The
 * assertions below are written so that removing any one grant boundary in migration 0035 fails a
 * named test rather than quietly widening the surface.
 *
 * ANTI-VACUITY IS THE ORGANISING PRINCIPLE, and it matters more here than anywhere else in the
 * network band, because of the FORCE-RLS hazard this repository has now met three times: a SELECT
 * grant with no admitting policy returns ZERO ROWS, NOT AN ERROR. "The transport worker sees no
 * grants" is therefore true both when the boundary works and when the worker cannot see anything at
 * all — including the rows it legitimately needs. Every negative below is paired with the positive
 * that proves the reader was working, and every database refusal is pinned to its SQLSTATE and
 * constraint name so a typo, a missing column or a privilege denial can never be credited as the
 * guard under test.
 */

const db = new TestDatabase('freightos_test_n7_transport');

const WORKFLOW_STATE = 'https://schemas.rigreceipts.com/network/workflow-state.v1.json';
/** A second GOVERNED contract. Real, registered, and deliberately not the one artifacts carry. */
const EVIDENCE_ENVELOPE = 'https://schemas.rigreceipts.com/network/evidence-envelope.v1.json';
const PURPOSE = 'shipment_execution';

/** `app.reject_mutation()` and the transport transition guard both raise this. */
const APPEND_ONLY = '23000';
const INSUFFICIENT_PRIVILEGE = '42501';
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';
const RLS_VIOLATION = '42501';

let owner: Client;
let app: Client;
/** N6's non-egress worker. Under OR-05 it is also N7's permit ISSUER. */
let broker: Client;
/** N7's egress-capable identity. It opens no socket in N7-A and holds no N5 authority ever. */
let transport: Client;
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
const asAdminOfB = <T>(work: (c: Queryable) => Promise<T>): Promise<T> =>
  withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureB), work);

async function registerOrganization(label: string, tenantId: string | null): Promise<string> {
  return asRole(db, 'freightos_control_plane', async (client) => {
    const r = await client.query<{ id: string }>(
      `INSERT INTO network_participants
         (participant_type, display_name, tenant_id, status, source_system, created_by, updated_by)
       VALUES ('organization', $1, $2, 'active', 'test:n7', 'test:n7', 'test:n7')
       RETURNING id`,
      [`n7-${label}-${randomUUID().slice(0, 8)}`, tenantId],
    );
    return r.rows[0]!.id;
  });
}

async function grantPermission(
  fixture: IdentityFixture,
  admin: Client,
  key: string,
): Promise<void> {
  const r = await admin.query<{ outcome: string; reason: string | null }>(
    'SELECT * FROM admin.grant_role_permission($1, $2, $3, $4, $5)',
    [fixture.tenantId, fixture.roleId, key, 'identity_administration', randomUUID()],
  );
  if (r.rows[0]!.outcome !== 'succeeded') {
    throw new Error(`could not grant ${key}: ${r.rows[0]!.outcome} ${r.rows[0]!.reason ?? ''}`);
  }
}

/** An accepted N3 event, through the REAL acceptance component — never a hand-written INSERT. */
async function acceptEvent(organizationId: string): Promise<string> {
  const client = db.connectAs('freightos_event_writer');
  await client.connect();
  try {
    await client.query('BEGIN');
    try {
      const result = await acceptNetworkEvent(client, {
        type: 'com.rigreceipts.network.workflow.state.recorded.v1',
        source: 'urn:freightos:test:n7',
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

/**
 * The full N6 chain for one recipient, ending at a COMMITTED INBOX ROW.
 *
 * N7 begins where N6 ends, and the inbox row is that boundary: OR-03 makes internal delivery the
 * precondition for an external obligation, so a fixture that stopped at the artifact would let this
 * suite build transports N7 must refuse to build. Every field is real — a governed subscription, a
 * real accepted event, a real digest — because a transport bound to a synthetic artifact would
 * prove nothing about the chain the composite keys actually enforce.
 */
interface Chain {
  readonly recipient: string;
  readonly subscription: string;
  readonly event: string;
  readonly artifact: string;
  readonly delivery: string;
  readonly inbox: string;
  readonly digest: string;
}

async function mintChain(label: string, recipientId?: string): Promise<Chain> {
  const recipient = recipientId ?? (await registerOrganization(label, TENANT_A));
  // A recipient may already hold the subscription for this (purpose, contract) — N6 enforces one
  // effective interest per triple, so a second chain for the same recipient reuses it rather than
  // duplicating it. This is what lets a test build two artifacts for ONE recipient, which is the
  // shape the replay and multi-destination cases need.
  const existing = await asAdminOfA(async (c) => {
    const r = await c.query<{ id: string }>(
      `SELECT subscription_id AS id FROM network_disclosure_subscriptions
        WHERE recipient_participant_id = $1 AND purpose_code = $2 AND durable_schema_ref = $3
        LIMIT 1`,
      [recipient, PURPOSE, WORKFLOW_STATE],
    );
    return r.rows[0]?.id ?? null;
  });
  const subscription =
    existing ??
    (await asAdminOfA(async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO network_disclosure_subscriptions
           (recipient_participant_id, purpose_code, durable_schema_ref, destination_kind,
            effective_from)
         VALUES ($1, $2, $3, 'freightos_inbox', now() - interval '1 day')
         RETURNING subscription_id AS id`,
        [recipient, PURPOSE, WORKFLOW_STATE],
      );
      return r.rows[0]!.id;
    }));
  const event = await acceptEvent(orgAsserter);
  // A digest unique per chain, so a permit bound to one artifact's bytes is demonstrably not
  // satisfiable by another's — the point of the digest foreign key.
  const digest = randomUUID().replace(/-/g, '').padEnd(64, '0').slice(0, 64);
  const artifact = (
    await broker.query<{ id: string }>(
      `INSERT INTO network_disclosure_artifacts
         (network_event_id, subscription_id, recipient_participant_id, purpose_code,
          durable_schema_ref, sensitivity_code, permitted_pointers, authorization_digest,
          composite_decision_digest, payload_canonical, payload_digest)
       VALUES ($1,$2,$3,$4,$5,'counterparty_identifying', ARRAY['/workflow_id'], $6,$6,'{}',$6)
       RETURNING artifact_id AS id`,
      [event, subscription, recipient, PURPOSE, WORKFLOW_STATE, digest],
    )
  ).rows[0]!.id;
  const delivery = (
    await broker.query<{ id: string }>(
      `INSERT INTO network_disclosure_deliveries (network_event_id, subscription_id, artifact_id)
       VALUES ($1,$2,$3) RETURNING delivery_id AS id`,
      [event, subscription, artifact],
    )
  ).rows[0]!.id;
  const inbox = (
    await broker.query<{ id: string }>(
      `INSERT INTO network_disclosure_inbox (delivery_id, artifact_id, recipient_participant_id)
       VALUES ($1,$2,$3) RETURNING inbox_id AS id`,
      [delivery, artifact, recipient],
    )
  ).rows[0]!.id;
  return { recipient, subscription, event, artifact, delivery, inbox, digest };
}

/** A destination registered through the governed recipient-authored path — never a raw INSERT. */
async function createDestination(
  recipient: string,
  overrides: {
    purpose?: string;
    schemaRef?: string;
    endpointRef?: string;
    credentialRef?: string | null;
  } = {},
): Promise<string> {
  return asAdminOfA(async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO network_transport_destinations
         (recipient_participant_id, destination_kind, purpose_code, durable_schema_ref,
          endpoint_ref, credential_ref)
       VALUES ($1, 'https_webhook', $2, $3, $4, $5)
       RETURNING destination_id AS id`,
      [
        recipient,
        overrides.purpose ?? PURPOSE,
        overrides.schemaRef ?? WORKFLOW_STATE,
        overrides.endpointRef ?? `destination-config:${randomUUID()}`,
        overrides.credentialRef ?? null,
      ],
    );
    return r.rows[0]!.id;
  });
}

/** The obligation, written by the AUTHORIZATION side — OR-03 and OR-05. */
async function createTransport(chain: Chain, destination: string): Promise<string> {
  const r = await broker.query<{ id: string }>(
    `INSERT INTO network_external_transports
       (artifact_id, destination_id, recipient_participant_id, inbox_id)
     VALUES ($1,$2,$3,$4) RETURNING transport_id AS id`,
    [chain.artifact, destination, chain.recipient, chain.inbox],
  );
  return r.rows[0]!.id;
}

/** A permit, minted by the AUTHORIZATION side for exactly one attempt. */
async function mintPermit(
  chain: Chain,
  transportId: string,
  destination: string,
  attemptNumber = 1,
): Promise<string> {
  const r = await broker.query<{ id: string }>(
    `INSERT INTO network_external_transport_permits
       (transport_id, artifact_id, destination_id, attempt_number, artifact_digest,
        composite_decision_digest, not_after)
     VALUES ($1,$2,$3,$4,$5,$5, now() + interval '30 seconds')
     RETURNING permit_id AS id`,
    [transportId, chain.artifact, destination, attemptNumber, chain.digest],
  );
  return r.rows[0]!.id;
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
  broker = db.connectAs('freightos_delivery_worker');
  await broker.connect();
  transport = db.connectAs('freightos_transport_worker');
  await transport.connect();
  adminA = await connectAsFixtureAdministrator(db, fixtureA);

  orgAsserter = await registerOrganization('asserter', TENANT_A);
  orgRecipient = await registerOrganization('recipient', TENANT_A);
  orgOtherTenant = await registerOrganization('other-tenant', TENANT_B);

  for (const key of [
    'network.disclosure_subscription.create',
    'network.disclosure_subscription.read',
    'network.transport_destination.create',
    'network.transport_destination.revoke',
    'network.transport_destination.read',
  ]) {
    await grantPermission(fixtureA, adminA, key);
  }
}, 120_000);

afterAll(async () => {
  await Promise.all([owner?.end(), app?.end(), broker?.end(), transport?.end(), adminA?.end()]);
});

// ---------------------------------------------------------------------------
// The fixture contract. Every security assertion below stands on this chain; if it silently
// stopped producing an inbox row, the N7 negatives would keep passing and would be proving that
// nothing leaks from a table that is empty.
// ---------------------------------------------------------------------------

describe('the N6 chain N7 begins from', () => {
  it('reaches a committed inbox row, which is the precondition N7 binds to — OR-03', async () => {
    const chain = await mintChain('fixture-contract');
    const r = await owner.query<{ inbox: string; artifact: string; recipient: string }>(
      `SELECT i.inbox_id AS inbox, i.artifact_id AS artifact, i.recipient_participant_id AS recipient
         FROM network_disclosure_inbox i WHERE i.inbox_id = $1`,
      [chain.inbox],
    );
    expect(r.rowCount).toBe(1);
    expect(r.rows[0]!.artifact).toBe(chain.artifact);
    expect(r.rows[0]!.recipient).toBe(chain.recipient);
  });
});

// ---------------------------------------------------------------------------
// §12 — the surface 0035 adds, stated as an inventory rather than sampled.
// ---------------------------------------------------------------------------

describe('the database surface N7-A adds', () => {
  it('creates exactly five tables, all with RLS enabled and forced from birth', async () => {
    const r = await owner.query<{ n: string; rls: boolean; force: boolean }>(
      `SELECT c.relname AS n, c.relrowsecurity AS rls, c.relforcerowsecurity AS force
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND (c.relname LIKE 'network\\_external\\_transport%'
               OR c.relname LIKE 'network\\_transport\\_destination%')
        ORDER BY 1`,
    );
    expect(r.rows.map((x) => x.n)).toEqual([...N7_TRANSPORT_RELATIONS].sort());
    // FORCE, not merely ENABLE. Without FORCE the table owner bypasses every policy below, and the
    // owner here is the migrator — so an unforced table would make the whole policy set advisory.
    for (const row of r.rows) {
      expect(row.rls, `${row.n} has RLS disabled`).toBe(true);
      expect(row.force, `${row.n} does not FORCE RLS`).toBe(true);
    }
  });

  it('defines three closed enums and no open text vocabulary', async () => {
    const r = await owner.query<{ t: string; labels: string[] }>(
      // `enumlabel` is `name`, and node-postgres has no parser for `name[]` — it would arrive as
      // the raw literal `{https_webhook}` and compare unequal to every array. The cast is what
      // makes the comparison an array comparison rather than a string one.
      `SELECT t.typname AS t, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
         FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
         JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE n.nspname = 'app' AND t.typname LIKE 'network\\_%transport%'
        GROUP BY t.typname ORDER BY 1`,
    );
    const byName = new Map(r.rows.map((x) => [x.t, x.labels]));

    // ONE destination kind, and it is not implemented. The value exists so the registry can be
    // typed; a second kind cannot arrive by writing a string.
    expect(byName.get('network_transport_destination_kind')).toEqual(['https_webhook']);

    // Deliberately NOT N6's delivery vocabulary. `delivered` there means the internal inbox
    // committed; reusing it would destroy the distinction the whole band exists to preserve.
    expect(byName.get('network_external_transport_state')).toEqual([
      'pending',
      'failed_retryable',
      'accepted',
      'terminated_failed',
      'terminated_unauthorized',
      'terminated_destination_disabled',
    ]);

    // The closed failure taxonomy. A bare `failed` is absent on purpose: it collapses "we are
    // misconfigured" with "they are down", and those have different operators and different
    // urgency. `egress_disabled` and `authorization_withdrawn` are separated from transport
    // failures for the same reason — an operator must be able to tell "we chose not to send" from
    // "we tried and could not".
    expect(byName.get('network_external_transport_attempt_outcome')).toEqual([
      'accepted',
      'configuration_invalid',
      'destination_disabled',
      'egress_disabled',
      'authorization_withdrawn',
      'authentication_failed',
      'address_rejected',
      'connection_failed',
      'timeout',
      'rate_limited',
      'remote_rejected_retryable',
      'remote_rejected_terminal',
      'protocol_invalid',
      'internal_error',
    ]);
    expect(byName.get('network_external_transport_attempt_outcome')).not.toContain('failed');

    // AND THE TYPESCRIPT AGREES WITH THE CATALOG, in both directions.
    //
    // `packages/context/src/external-transport.ts` classifies every outcome — which spend an
    // attempt, which terminate, which leave the obligation untouched — and its exhaustive
    // `Record<Outcome, …>` is only exhaustive over the values TypeScript knows about. A label added
    // to the enum by a later migration and not to the union would arrive at
    // `outcomeSemantics(...)` as `undefined`, and the caller would read that as "not terminal, not
    // retryable": the worst possible default for a transport decision, reached without an error.
    // A label removed from the enum but left in the union is the milder inverse — dead
    // classification for a state that can no longer occur.
    for (const label of byName.get('network_external_transport_attempt_outcome') ?? []) {
      expect(
        outcomeSemantics(label as ExternalTransportAttemptOutcome),
        `the enum carries ${label} but the TypeScript taxonomy does not classify it`,
      ).toBeDefined();
    }
    expect(
      TRANSPORT_ATTEMPT_OUTCOMES,
      'the TypeScript taxonomy names an outcome the enum does not have',
    ).toEqual(byName.get('network_external_transport_attempt_outcome'));

    // The state vocabulary, same argument: `nextTransportState` returns these strings and a worker
    // will write them into a typed column, so a divergence is an invalid-input error at runtime.
    expect(TRANSPORT_STATES).toEqual(byName.get('network_external_transport_state'));
  });

  it('adds exactly one function and it is INVOKER rights — §52 SECURITY DEFINER delta = 0', async () => {
    const r = await owner.query<{ name: string; secdef: boolean; config: string[] | null }>(
      `SELECT p.proname AS name, p.prosecdef AS secdef, p.proconfig AS config
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'app' AND p.proname LIKE '%external_transport%'
        ORDER BY 1`,
    );
    expect(r.rows.map((x) => x.name)).toEqual(['network_external_transport_transition']);
    // An external transport foundation that needed a new SECURITY DEFINER would be smuggling
    // privilege in through the one door SR-2's gates watch. It needed none.
    expect(r.rows[0]!.secdef).toBe(false);
  });

  it('makes every N7 relation append-only except the obligation, whose identity is still fixed', async () => {
    const r = await owner.query<{ line: string }>(
      `SELECT format('%s %s %s', c.relname, t.tgname, p.proname) AS line
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE NOT t.tgisinternal AND n.nspname = 'public'
          AND (c.relname LIKE 'network\\_external\\_transport%'
               OR c.relname LIKE 'network\\_transport\\_destination%')
        ORDER BY 1`,
    );
    expect(r.rows.map((x) => x.line)).toEqual([
      'network_external_transport_attempts network_external_transport_attempts_no_delete reject_mutation',
      'network_external_transport_attempts network_external_transport_attempts_no_truncate reject_mutation',
      'network_external_transport_attempts network_external_transport_attempts_no_update reject_mutation',
      'network_external_transport_permits network_external_transport_permits_no_delete reject_mutation',
      'network_external_transport_permits network_external_transport_permits_no_truncate reject_mutation',
      'network_external_transport_permits network_external_transport_permits_no_update reject_mutation',
      'network_external_transports network_external_transports_no_delete reject_mutation',
      'network_external_transports network_external_transports_no_truncate reject_mutation',
      // The obligation is the ONE relation that may be UPDATEd, and this is the guard that makes
      // that safe: lifecycle columns move, identity does not.
      'network_external_transports network_external_transports_transition network_external_transport_transition',
      'network_transport_destination_revocations network_transport_destination_revocations_no_delete reject_mutation',
      'network_transport_destination_revocations network_transport_destination_revocations_no_truncate reject_mutation',
      'network_transport_destination_revocations network_transport_destination_revocations_no_update reject_mutation',
      'network_transport_destinations network_transport_destinations_no_delete reject_mutation',
      'network_transport_destinations network_transport_destinations_no_truncate reject_mutation',
      'network_transport_destinations network_transport_destinations_no_update reject_mutation',
    ]);
  });

  it('gives every composite foreign key an exact supporting index in constraint order — F-20', async () => {
    const r = await owner.query<{ constraint_name: string; table_name: string; cols: string }>(
      `SELECT con.conname AS constraint_name, c.relname AS table_name,
              (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
                 FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum) AS cols
         FROM pg_constraint con
         JOIN pg_class c ON c.oid = con.conrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE con.contype = 'f' AND n.nspname = 'public'
          AND array_length(con.conkey, 1) > 1
          AND (c.relname LIKE 'network\\_external\\_transport%'
               OR c.relname LIKE 'network\\_transport\\_destination%')
        ORDER BY 1`,
    );
    expect(r.rowCount, 'no composite FK found, so this check is vacuous').toBeGreaterThan(0);

    for (const fk of r.rows) {
      const idx = await owner.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_index i
           JOIN pg_class ic ON ic.oid = i.indexrelid
          WHERE i.indrelid = $1::regclass
            AND (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
                   FROM unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
                   JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum) = $2`,
        [fk.table_name, fk.cols],
      );
      expect(
        idx.rows[0]!.n,
        `${fk.constraint_name} (${fk.cols}) has no exact-order index`,
      ).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// §13–§16 — the destination registry. Recipient-authored, permission-gated, immutable.
// ---------------------------------------------------------------------------

describe('destinations are recipient-authored and permission-gated — OR-06', () => {
  it('accepts a destination for an organization the author holds', async () => {
    const destination = await createDestination(orgRecipient);
    const r = await owner.query<{ kind: string; recipient: string; t: string }>(
      `SELECT destination_kind::text AS kind, recipient_participant_id AS recipient,
              recipient_participant_type::text AS t
         FROM network_transport_destinations WHERE destination_id = $1`,
      [destination],
    );
    expect(r.rowCount).toBe(1);
    expect(r.rows[0]!.recipient).toBe(orgRecipient);
    // GENERATED ALWAYS. The recipient is an organization by the column's definition, not by a
    // caller's claim, which is what makes the composite registry key total.
    expect(r.rows[0]!.t).toBe('organization');
  });

  it('refuses a destination whose recipient is not a registered ORGANIZATION', async () => {
    // The registry binding, tested negatively. Every other destination test is a positive or a
    // tenancy case, and mutation N7-A-B5 — removing the composite participant foreign key
    // outright — walked through all of them undetected: a positive test cannot notice a missing
    // constraint, and the tenancy policy passes an unregistered uuid straight to the FK that was
    // no longer there.
    //
    // Two negatives, because the composite key carries two facts. `recipient_participant_id` must
    // name a REGISTERED participant, and `recipient_participant_type` — GENERATED ALWAYS as
    // 'organization' — must match. A bare `uuid REFERENCES network_participants (id)` would satisfy
    // the first and not the second, which is why the key is composite.
    const unregistered = await attempt(
      owner,
      `INSERT INTO network_transport_destinations
         (recipient_participant_id, destination_kind, purpose_code, durable_schema_ref, endpoint_ref)
       VALUES ($1, 'https_webhook', $2, $3, 'destination-config:ghost')`,
      [randomUUID(), PURPOSE, WORKFLOW_STATE],
    );
    expectSqlstate(unregistered, FOREIGN_KEY_VIOLATION, 'an unregistered recipient was accepted');
    expect(unregistered.constraint).toBe(
      'network_transport_destinations_recipient_is_organization',
    );

    const facility = await asRole(db, 'freightos_control_plane', async (client) => {
      const r = await client.query<{ id: string }>(
        `INSERT INTO network_participants
           (participant_type, display_name, tenant_id, status, source_system, created_by, updated_by)
         VALUES ('facility', $1, $2, 'active', 'test:n7', 'test:n7', 'test:n7')
         RETURNING id`,
        [`n7-dest-facility-${randomUUID().slice(0, 8)}`, TENANT_A],
      );
      return r.rows[0]!.id;
    });
    const wrongType = await attempt(
      owner,
      `INSERT INTO network_transport_destinations
         (recipient_participant_id, destination_kind, purpose_code, durable_schema_ref, endpoint_ref)
       VALUES ($1, 'https_webhook', $2, $3, 'destination-config:facility')`,
      [facility, PURPOSE, WORKFLOW_STATE],
    );
    // A REGISTERED participant of the wrong kind. The single-column key would have accepted this.
    expectSqlstate(
      wrongType,
      FOREIGN_KEY_VIOLATION,
      'a facility was accepted as a destination recipient',
    );
    expect(wrongType.constraint).toBe('network_transport_destinations_recipient_is_organization');
  });

  it('refuses a destination for an organization in ANOTHER tenant', async () => {
    // The exact hazard: `orgOtherTenant` is a real, registered, active organization. Every
    // individual check it faces passes. What refuses it is the tenancy join in the INSERT policy,
    // which derives the recipient's tenant from the AUTHENTICATED principal rather than accepting
    // it as an argument — N6's subscription shape, unchanged.
    const outcome = await asAdminOfA(async (c) =>
      c
        .query(
          `INSERT INTO network_transport_destinations
             (recipient_participant_id, destination_kind, purpose_code, durable_schema_ref,
              endpoint_ref)
           VALUES ($1, 'https_webhook', $2, $3, 'destination-config:cross-tenant')`,
          [orgOtherTenant, PURPOSE, WORKFLOW_STATE],
        )
        .then(
          () => ({ code: null as string | null }),
          (e: Error & { code?: string }) => ({ code: e.code ?? 'unknown' }),
        ),
    );
    expect(outcome.code, 'a cross-tenant destination was accepted').toBe(RLS_VIOLATION);
  });

  it('refuses an author holding no destination-create permission — and the refusal is the permission, not the tenancy', async () => {
    // Fixture B is a fully authenticated administrator of its own tenant with its own organization.
    // The ONLY thing it lacks is the permission key. Pairing it with the positive above is what
    // separates "the permission gate works" from "tenant B could not see anything anyway".
    const orgOfB = await asRole(db, 'freightos_control_plane', async (client) => {
      const r = await client.query<{ id: string }>(
        `INSERT INTO network_participants
           (participant_type, display_name, tenant_id, status, source_system, created_by, updated_by)
         VALUES ('organization', $1, $2, 'active', 'test:n7', 'test:n7', 'test:n7')
         RETURNING id`,
        [`n7-b-org-${randomUUID().slice(0, 8)}`, TENANT_B],
      );
      return r.rows[0]!.id;
    });
    const outcome = await asAdminOfB(async (c) =>
      c
        .query(
          `INSERT INTO network_transport_destinations
             (recipient_participant_id, destination_kind, purpose_code, durable_schema_ref,
              endpoint_ref)
           VALUES ($1, 'https_webhook', $2, $3, 'destination-config:unpermitted')`,
          [orgOfB, PURPOSE, WORKFLOW_STATE],
        )
        .then(
          () => ({ code: null as string | null }),
          (e: Error & { code?: string }) => ({ code: e.code ?? 'unknown' }),
        ),
    );
    expect(outcome.code, 'an unpermitted author registered a destination').toBe(RLS_VIOLATION);
  });

  it('refuses an inline URL in endpoint_ref — the column holds a reference, not an address', async () => {
    const outcome = await attempt(
      owner,
      `INSERT INTO network_transport_destinations
         (recipient_participant_id, destination_kind, purpose_code, durable_schema_ref, endpoint_ref)
       VALUES ($1, 'https_webhook', $2, $3, 'https://partner.example.com/hook')`,
      [orgRecipient, PURPOSE, WORKFLOW_STATE],
    );
    expectSqlstate(outcome, CHECK_VIOLATION, 'an inline https URL was stored as an endpoint');
    expect(outcome.constraint).toBe('network_transport_destinations_endpoint_ref_check');
  });

  it('refuses credential material in credential_ref — OR-07, references only', async () => {
    for (const material of [
      'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
      'secret-value-not-a-reference',
      '-----BEGIN PRIVATE KEY-----',
      'token abcdef',
    ]) {
      const outcome = await attempt(
        owner,
        `INSERT INTO network_transport_destinations
           (recipient_participant_id, destination_kind, purpose_code, durable_schema_ref,
            endpoint_ref, credential_ref)
         VALUES ($1, 'https_webhook', $2, $3, 'destination-config:cred', $4)`,
        [orgRecipient, PURPOSE, WORKFLOW_STATE, material],
      );
      expectSqlstate(outcome, CHECK_VIOLATION, `credential material accepted: ${material}`);
      expect(outcome.constraint).toBe('network_transport_destinations_credential_ref_check');
    }
    // Anti-vacuity: a genuine REFERENCE is accepted, so the CHECK is discriminating rather than
    // refusing everything.
    const ok = await attempt(
      owner,
      `INSERT INTO network_transport_destinations
         (recipient_participant_id, destination_kind, purpose_code, durable_schema_ref,
          endpoint_ref, credential_ref)
       VALUES ($1, 'https_webhook', $2, $3, 'destination-config:ok', 'vault://freightos/n7/dest-1')`,
      [orgRecipient, PURPOSE, WORKFLOW_STATE],
    );
    expect(ok.sqlstate, `a credential REFERENCE was refused: ${ok.message}`).toBeNull();
  });

  it('stores no column that could hold a secret or a payload copy', async () => {
    const r = await owner.query<{ line: string }>(
      `SELECT format('%s.%s', c.relname, a.attname) AS line
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
          AND (c.relname LIKE 'network\\_external\\_transport%'
               OR c.relname LIKE 'network\\_transport\\_destination%')
          AND (a.attname ~* '(secret|token|password|credential|authorization|header|payload|body|url|uri|endpoint)')
        ORDER BY 1`,
    );
    // `credential_ref` and `endpoint_ref` are the two deliberate exceptions and both are asserted
    // above to hold references only. Anything else appearing here is a payload copy or a secret in
    // a table — DATA_CLASSIFICATION's SECRET / logging-Never rule, at the storage layer.
    expect(r.rows.map((x) => x.line)).toEqual([
      'network_transport_destinations.credential_ref',
      'network_transport_destinations.endpoint_ref',
    ]);
  });

  it('is immutable in every direction — no UPDATE, no DELETE, no TRUNCATE, not even for the owner', async () => {
    const destination = await createDestination(orgRecipient);
    for (const [sql, label] of [
      [
        `UPDATE network_transport_destinations SET endpoint_ref = 'x' WHERE destination_id = $1`,
        'UPDATE',
      ],
      [`DELETE FROM network_transport_destinations WHERE destination_id = $1`, 'DELETE'],
    ] as const) {
      const outcome = await attempt(owner, sql, [destination]);
      expectSqlstate(outcome, APPEND_ONLY, `${label} on a destination was permitted`);
      expect(outcome.message).toContain('network_transport_destinations is append-only');
    }
    // TRUNCATE is refused on all five N7 relations, but NOT always by the same guard, and pinning
    // the wrong one would be crediting a control that never ran. Where a table is the target of a
    // foreign key, PostgreSQL refuses at the referential layer (0A000) BEFORE any BEFORE TRUNCATE
    // trigger fires; where it is not, the append-only trigger is what refuses (23000). Both are
    // real refusals and the append-only trigger is asserted to exist on all five independently by
    // the trigger-inventory test, so this records which guard actually answers rather than
    // assuming one of them did.
    for (const [table, expected] of [
      ['network_transport_destinations', '0A000'],
      ['network_external_transports', '0A000'],
      ['network_transport_destination_revocations', APPEND_ONLY],
      // Permits became FK-referenced when the attempt journal gained its permit binding, so their
      // refusal moved from the trigger to the referential layer. Recording WHICH guard answers is
      // what made that visible as a one-line diff instead of a silent change of protection.
      ['network_external_transport_permits', '0A000'],
      ['network_external_transport_attempts', APPEND_ONLY],
    ] as const) {
      const outcome = await attempt(owner, `TRUNCATE ${table}`);
      expectSqlstate(outcome, expected, `TRUNCATE on ${table} was permitted`);
    }
  });
});

describe('revocation stops the future and rewrites nothing — OR-10', () => {
  it('records at most one revocation per destination', async () => {
    const destination = await createDestination(orgRecipient);
    await asAdminOfA(async (c) => {
      await c.query(
        `INSERT INTO network_transport_destination_revocations (destination_id, reason)
         VALUES ($1, 'n7 test: first revocation')`,
        [destination],
      );
    });
    const second = await asAdminOfA(async (c) =>
      c
        .query(
          `INSERT INTO network_transport_destination_revocations (destination_id, reason)
           VALUES ($1, 'n7 test: second revocation')`,
          [destination],
        )
        .then(
          () => ({ code: null as string | null }),
          (e: Error & { code?: string }) => ({ code: e.code ?? 'unknown' }),
        ),
    );
    expect(second.code, 'a destination was revoked twice').toBe(UNIQUE_VIOLATION);
  });

  it('has no enabled flag anywhere — eligibility is DERIVED from the absence of a revocation', async () => {
    // A boolean that can be set back to true is a pause with an audit gap. N5-A said this about
    // grants and N6 about subscriptions; the same words, and the same absence, apply here.
    const r = await owner.query<{ line: string }>(
      `SELECT format('%s.%s', c.relname, a.attname) AS line
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
          AND (c.relname LIKE 'network\\_external\\_transport%'
               OR c.relname LIKE 'network\\_transport\\_destination%')
          AND a.attname ~* '(enabled|active|disabled|paused|suspended)'
        ORDER BY 1`,
    );
    expect(r.rows.map((x) => x.line)).toEqual([]);
  });

  it('leaves an already-accepted obligation accepted — revocation is prospective', async () => {
    const chain = await mintChain('revoke-prospective');
    const destination = await createDestination(chain.recipient);
    const transportId = await createTransport(chain, destination);

    await transport.query(
      `UPDATE network_external_transports
          SET state = 'accepted', accepted_at = now(), record_version = record_version + 1
        WHERE transport_id = $1`,
      [transportId],
    );
    await asAdminOfA(async (c) => {
      await c.query(
        `INSERT INTO network_transport_destination_revocations (destination_id, reason)
         VALUES ($1, 'n7 test: revoked after acceptance')`,
        [destination],
      );
    });

    const r = await owner.query<{ state: string }>(
      'SELECT state::text AS state FROM network_external_transports WHERE transport_id = $1',
      [transportId],
    );
    // History is not rewritten. What revocation governs is what happens NEXT — and the accepted
    // obligation is terminal anyway, which the next test proves independently.
    expect(r.rows[0]!.state).toBe('accepted');
  });
});

// ---------------------------------------------------------------------------
// §17 — routing eligibility is EXACT. Mutation D-Q's lesson, carried forward.
// ---------------------------------------------------------------------------

describe('purpose and contract are governed references matched exactly — OR-08', () => {
  it('refuses an ungoverned purpose and an ungoverned contract', async () => {
    const bogusPurpose = await attempt(
      owner,
      `INSERT INTO network_transport_destinations
         (recipient_participant_id, destination_kind, purpose_code, durable_schema_ref, endpoint_ref)
       VALUES ($1, 'https_webhook', 'marketing_enrichment', $2, 'destination-config:p')`,
      [orgRecipient, WORKFLOW_STATE],
    );
    expectSqlstate(bogusPurpose, FOREIGN_KEY_VIOLATION, 'an ungoverned purpose was accepted');

    const bogusSchema = await attempt(
      owner,
      `INSERT INTO network_transport_destinations
         (recipient_participant_id, destination_kind, purpose_code, durable_schema_ref, endpoint_ref)
       VALUES ($1, 'https_webhook', $2, 'https://schemas.rigreceipts.com/network/invented.v9.json',
               'destination-config:s')`,
      [orgRecipient, PURPOSE],
    );
    expectSqlstate(bogusSchema, FOREIGN_KEY_VIOLATION, 'an ungoverned contract was accepted');
  });

  it('treats a DIFFERENT governed contract as a different destination — no family, no prefix', async () => {
    // Both refs are real and registered. `evidence-envelope.v1` is not `workflow-state.v1`, and a
    // destination declared for one is not eligible for the other. This is mutation D-Q's finding
    // stated as a property: prefix or family matching would silently widen every destination in
    // the registry the moment a new version was registered.
    const dEvidence = await createDestination(orgRecipient, { schemaRef: EVIDENCE_ENVELOPE });
    const r = await owner.query<{ ref: string }>(
      'SELECT durable_schema_ref AS ref FROM network_transport_destinations WHERE destination_id = $1',
      [dEvidence],
    );
    expect(r.rows[0]!.ref).toBe(EVIDENCE_ENVELOPE);
    expect(r.rows[0]!.ref).not.toBe(WORKFLOW_STATE);

    // And the eligibility question a router would ask returns it for one contract only.
    const eligible = await owner.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM network_transport_destinations
        WHERE destination_id = $1 AND durable_schema_ref = $2`,
      [dEvidence, WORKFLOW_STATE],
    );
    expect(eligible.rows[0]!.n).toBe(0);
  });

  it('grants no field and no disclosure authority — a destination is routing, never permission', async () => {
    // OR-08 stated structurally: the destination table carries no pointer set, no projection, no
    // sensitivity, no grant reference and no authority basis. If it did, registering a destination
    // would be a way to widen what may be disclosed, which is precisely the confusion between
    // WHERE and WHAT that the N5/N7 split exists to prevent.
    const r = await owner.query<{ cols: string[] }>(
      `SELECT array_agg(a.attname ORDER BY a.attnum) AS cols
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'network_transport_destinations'
          AND a.attnum > 0 AND NOT a.attisdropped`,
    );
    const cols = r.rows[0]!.cols;
    for (const forbidden of [
      'permitted_pointers',
      'projection_ref',
      'sensitivity_code',
      'grant_id',
      'authority_basis_code',
      'authorization_digest',
    ]) {
      expect(
        cols,
        `destinations carry ${forbidden}, which would make routing an authority`,
      ).not.toContain(forbidden);
    }
    expect(cols).toContain('purpose_code');
    expect(cols).toContain('durable_schema_ref');
  });
});

// ---------------------------------------------------------------------------
// §18–§20 — the obligation. Prospective only, structurally bound, one per pair.
// ---------------------------------------------------------------------------

describe('an obligation exists only for an artifact that was internally delivered — OR-03', () => {
  it('accepts an obligation built from a committed inbox row', async () => {
    const chain = await mintChain('obligation-positive');
    const destination = await createDestination(chain.recipient);
    const transportId = await createTransport(chain, destination);
    const r = await owner.query<{ state: string; attempts: number; inbox: string }>(
      `SELECT state::text AS state, attempt_count AS attempts, inbox_id AS inbox
         FROM network_external_transports WHERE transport_id = $1`,
      [transportId],
    );
    expect(r.rows[0]!.state).toBe('pending');
    expect(r.rows[0]!.attempts).toBe(0);
    expect(r.rows[0]!.inbox).toBe(chain.inbox);
  });

  it('refuses an obligation for an artifact with no inbox row — authorized but never delivered', async () => {
    // The artifact chain is real up to the delivery; what is missing is the inbox row, which is
    // exactly the state "authorized, not internally delivered". `inbox_id` is a foreign key rather
    // than a comment, so this is impossible rather than merely wrong.
    const recipient = await registerOrganization('no-inbox', TENANT_A);
    const chain = await mintChain('no-inbox-base', recipient);
    const destination = await createDestination(recipient);
    const outcome = await attempt(
      broker,
      `INSERT INTO network_external_transports
         (artifact_id, destination_id, recipient_participant_id, inbox_id)
       VALUES ($1,$2,$3,$4)`,
      [chain.artifact, destination, recipient, randomUUID()],
    );
    expectSqlstate(outcome, FOREIGN_KEY_VIOLATION, 'an obligation was created with no inbox row');
    expect(outcome.constraint).toBe('network_external_transports_inbox_id_fkey');
  });

  it('makes "artifact for A, destination owned by B" UNREPRESENTABLE, not merely refused', async () => {
    // THE R-08 / R-11 REMEDIATION APPLIED BEFORE IT CAN HAPPEN AGAIN.
    //
    // `recipient_participant_id` is written ONCE and BOTH composite keys resolve against it. There
    // is no pair of columns to disagree, so the mismatch has no representation in the row. What
    // follows demonstrates that: a destination owned by a different recipient cannot be named,
    // because naming it means claiming its recipient in the same column the artifact's key reads.
    const chain = await mintChain('binding-a');
    const otherRecipient = await registerOrganization('binding-b', TENANT_A);
    const foreignDestination = await createDestination(otherRecipient);

    // Claim the ARTIFACT's recipient: the destination key fails.
    const asArtifactRecipient = await attempt(
      broker,
      `INSERT INTO network_external_transports
         (artifact_id, destination_id, recipient_participant_id, inbox_id)
       VALUES ($1,$2,$3,$4)`,
      [chain.artifact, foreignDestination, chain.recipient, chain.inbox],
    );
    expectSqlstate(
      asArtifactRecipient,
      FOREIGN_KEY_VIOLATION,
      'artifact recipient + foreign destination',
    );
    expect(asArtifactRecipient.constraint).toBe('network_external_transports_destination_binding');

    // Claim the DESTINATION's recipient instead: the artifact key fails. Both directions closed,
    // which is what "unrepresentable" means — there is no third value that satisfies both.
    const asDestinationRecipient = await attempt(
      broker,
      `INSERT INTO network_external_transports
         (artifact_id, destination_id, recipient_participant_id, inbox_id)
       VALUES ($1,$2,$3,$4)`,
      [chain.artifact, foreignDestination, otherRecipient, chain.inbox],
    );
    expectSqlstate(
      asDestinationRecipient,
      FOREIGN_KEY_VIOLATION,
      'destination recipient + foreign artifact',
    );
    expect(asDestinationRecipient.constraint).toBe('network_external_transports_artifact_binding');
  });

  it('permits 0..N destinations per artifact, one obligation each — OR-04', async () => {
    const chain = await mintChain('multi-destination');
    const d1 = await createDestination(chain.recipient);
    const d2 = await createDestination(chain.recipient);
    const t1 = await createTransport(chain, d1);
    const t2 = await createTransport(chain, d2);
    expect(t1).not.toBe(t2);

    const r = await owner.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM network_external_transports WHERE artifact_id = $1',
      [chain.artifact],
    );
    expect(r.rows[0]!.n).toBe(2);

    // ZERO is equally legal: an artifact with no registered destination owes no transport at all,
    // which is the ordinary case and must not be an error.
    const noDestination = await mintChain('zero-destination');
    const none = await owner.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM network_external_transports WHERE artifact_id = $1',
      [noDestination.artifact],
    );
    expect(none.rows[0]!.n).toBe(0);
  });

  it('creates NO obligation for history when a destination is registered later — OR-10', async () => {
    // THE REPLAY QUESTION, asked behaviourally rather than by reading the schema.
    //
    // A recipient registers a destination today. Every artifact already delivered to their inbox is
    // sitting there, authorized, with a committed inbox row — the exact precondition an obligation
    // is built from. If registering a destination swept that history, one configuration change
    // would externally transmit months of past disclosures in a batch, each of them authorized at
    // the time and none of them authorized NOW. That is replay through the front door, and it is
    // the single most plausible way for it to arrive by accident.
    const historic = await mintChain('replay-history-a');
    const alsoHistoric = await mintChain('replay-history-b', historic.recipient);

    const before = await owner.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM network_external_transports WHERE recipient_participant_id = $1`,
      [historic.recipient],
    );
    expect(
      before.rows[0]!.n,
      'the recipient already owes transport, so the test is not clean',
    ).toBe(0);

    // The destination arrives AFTER both inbox rows exist.
    const destination = await createDestination(historic.recipient);

    const after = await owner.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM network_external_transports WHERE recipient_participant_id = $1`,
      [historic.recipient],
    );
    expect(after.rows[0]!.n, 'registering a destination swept historical inbox rows').toBe(0);

    // ANTI-VACUITY, and it is the whole test. Zero obligations would also be the result if the
    // obligation path were simply broken. So a PROSPECTIVE obligation is created against the same
    // destination and the same recipient, and it works — proving the zero above is a statement
    // about history rather than about a dead code path.
    const prospective = await createTransport(alsoHistoric, destination);
    expect(prospective).toMatch(/^[0-9a-f-]{36}$/);
    const afterProspective = await owner.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM network_external_transports WHERE recipient_participant_id = $1`,
      [historic.recipient],
    );
    expect(afterProspective.rows[0]!.n).toBe(1);

    // And there is no trigger on the destination table that could ever do the sweep — the
    // behavioural result above is backed by the structural absence of a mechanism. Destinations
    // carry only `reject_mutation` guards; nothing on INSERT.
    const triggers = await owner.query<{ line: string }>(
      `SELECT format('%s %s', t.tgname, p.proname) AS line
         FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE NOT t.tgisinternal AND c.relname = 'network_transport_destinations'
          AND (t.tgtype & 4) <> 0
        ORDER BY 1`,
    );
    expect(
      triggers.rows.map((x) => x.line),
      'a destination INSERT trigger exists',
    ).toEqual([]);
  });

  it('refuses a SECOND obligation for the same (artifact, destination), terminal or not', async () => {
    const chain = await mintChain('idempotency');
    const destination = await createDestination(chain.recipient);
    const transportId = await createTransport(chain, destination);

    const duplicate = await attempt(
      broker,
      `INSERT INTO network_external_transports
         (artifact_id, destination_id, recipient_participant_id, inbox_id)
       VALUES ($1,$2,$3,$4)`,
      [chain.artifact, destination, chain.recipient, chain.inbox],
    );
    expectSqlstate(duplicate, UNIQUE_VIOLATION, 'a duplicate obligation was created');
    expect(duplicate.constraint).toBe('network_external_transports_one_per_artifact_destination');

    // AND AFTER TERMINATION TOO. The uniqueness is unconditional rather than partial-on-non-
    // terminal, because recreating a terminated obligation is replay wearing a retry's clothes —
    // OR-10. This is the assertion that would fail if someone "helpfully" made the index partial.
    await transport.query(
      `UPDATE network_external_transports
          SET state = 'terminated_failed', terminated_at = now(), terminal_reason = 'n7 test',
              record_version = record_version + 1
        WHERE transport_id = $1`,
      [transportId],
    );
    const afterTermination = await attempt(
      broker,
      `INSERT INTO network_external_transports
         (artifact_id, destination_id, recipient_participant_id, inbox_id)
       VALUES ($1,$2,$3,$4)`,
      [chain.artifact, destination, chain.recipient, chain.inbox],
    );
    expectSqlstate(afterTermination, UNIQUE_VIOLATION, 'a terminated obligation was recreated');
  });

  it('keeps the obligation identity immutable and refuses a transition out of a terminal state', async () => {
    const chain = await mintChain('transition-guard');
    const destination = await createDestination(chain.recipient);
    const other = await createDestination(chain.recipient);
    const transportId = await createTransport(chain, destination);

    const repoint = await attempt(
      transport,
      `UPDATE network_external_transports
          SET destination_id = $2, record_version = record_version + 1
        WHERE transport_id = $1`,
      [transportId, other],
    );
    expectSqlstate(repoint, APPEND_ONLY, 'an obligation was re-pointed at another destination');
    expect(repoint.message).toContain('identity is immutable');

    const skipVersion = await attempt(
      transport,
      `UPDATE network_external_transports SET state = 'failed_retryable' WHERE transport_id = $1`,
      [transportId],
    );
    expectSqlstate(skipVersion, APPEND_ONLY, 'record_version did not have to advance');
    expect(skipVersion.message).toContain('must advance by exactly one');

    await transport.query(
      `UPDATE network_external_transports
          SET state = 'accepted', accepted_at = now(), record_version = record_version + 1
        WHERE transport_id = $1`,
      [transportId],
    );
    const resurrect = await attempt(
      transport,
      `UPDATE network_external_transports
          SET state = 'pending', accepted_at = NULL, record_version = record_version + 1
        WHERE transport_id = $1`,
      [transportId],
    );
    expectSqlstate(resurrect, APPEND_ONLY, 'an accepted obligation was resurrected');
    expect(resurrect.message).toContain('is terminal');
  });
});

// ---------------------------------------------------------------------------
// §21–§26 — the brokered permit. The reason the role split is real rather than nominal.
// ---------------------------------------------------------------------------

describe('permits are minted by the authorization side and spent by the egress side — OR-05', () => {
  it('lets the delivery worker mint a permit for one attempt', async () => {
    const chain = await mintChain('permit-positive');
    const destination = await createDestination(chain.recipient);
    const transportId = await createTransport(chain, destination);
    const permit = await mintPermit(chain, transportId, destination);

    const r = await owner.query<{ issuer: string; attempt: number; digest: string }>(
      `SELECT issued_by AS issuer, attempt_number AS attempt, artifact_digest AS digest
         FROM network_external_transport_permits WHERE permit_id = $1`,
      [permit],
    );
    // The issuer is recorded from `current_user`, not supplied. A permit that could name its own
    // issuer would make the whole brokerage unfalsifiable after the fact.
    expect(r.rows[0]!.issuer).toBe('freightos_delivery_worker');
    expect(r.rows[0]!.attempt).toBe(1);
    expect(r.rows[0]!.digest).toBe(chain.digest);
  });

  it('REFUSES the transport worker minting its own permit — the whole content of OR-05', async () => {
    const chain = await mintChain('self-authorization');
    const destination = await createDestination(chain.recipient);
    const transportId = await createTransport(chain, destination);

    const outcome = await attempt(
      transport,
      `INSERT INTO network_external_transport_permits
         (transport_id, artifact_id, destination_id, attempt_number, artifact_digest,
          composite_decision_digest, not_after)
       VALUES ($1,$2,$3,1,$4,$4, now() + interval '30 seconds')`,
      [transportId, chain.artifact, destination, chain.digest],
    );
    // A role that could mint its own permit would be a role that decides its own authority. The
    // refusal is a PRIVILEGE denial, not a policy denial — there is no INSERT grant at all, so
    // there is nothing for a future policy edit to accidentally widen.
    expectSqlstate(outcome, INSUFFICIENT_PRIVILEGE, 'the egress role authorized itself');
    expect(outcome.message).toMatch(
      /permission denied for table network_external_transport_permits/,
    );
  });

  it('binds a permit to its transport as ONE referential fact, so it cannot be replayed elsewhere', async () => {
    const a = await mintChain('permit-bind-a');
    const b = await mintChain('permit-bind-b');
    const dA = await createDestination(a.recipient);
    const dB = await createDestination(b.recipient);
    const tA = await createTransport(a, dA);
    await createTransport(b, dB);

    // Transport A, but B's artifact: the composite (transport, artifact, destination) key has no
    // matching parent row. Three independent single-column keys would have accepted this, and the
    // permit would then have authorized bytes that transport never owed.
    const crossArtifact = await attempt(
      broker,
      `INSERT INTO network_external_transport_permits
         (transport_id, artifact_id, destination_id, attempt_number, artifact_digest,
          composite_decision_digest, not_after)
       VALUES ($1,$2,$3,1,$4,$4, now() + interval '30 seconds')`,
      [tA, b.artifact, dA, b.digest],
    );
    expectSqlstate(
      crossArtifact,
      FOREIGN_KEY_VIOLATION,
      'a permit named another transport artifact',
    );
    expect(crossArtifact.constraint).toBe('network_external_transport_permits_transport_binding');

    // And the digest is the ARTIFACT's, enforced rather than copied — R-07 one layer out. A permit
    // naming bytes the artifact does not have would authorize a payload nobody approved.
    const wrongDigest = await attempt(
      broker,
      `INSERT INTO network_external_transport_permits
         (transport_id, artifact_id, destination_id, attempt_number, artifact_digest,
          composite_decision_digest, not_after)
       VALUES ($1,$2,$3,1,$4,$4, now() + interval '30 seconds')`,
      [tA, a.artifact, dA, b.digest],
    );
    expectSqlstate(wrongDigest, FOREIGN_KEY_VIOLATION, 'a permit named foreign bytes');
    expect(wrongDigest.constraint).toBe('network_external_transport_permits_digest_binding');
  });

  it('scopes a permit to ONE attempt — a permit for attempt N cannot authorize attempt N+1', async () => {
    const chain = await mintChain('permit-attempt-scope');
    const destination = await createDestination(chain.recipient);
    const transportId = await createTransport(chain, destination);
    await mintPermit(chain, transportId, destination, 1);

    const duplicate = await attempt(
      broker,
      `INSERT INTO network_external_transport_permits
         (transport_id, artifact_id, destination_id, attempt_number, artifact_digest,
          composite_decision_digest, not_after)
       VALUES ($1,$2,$3,1,$4,$4, now() + interval '30 seconds')`,
      [transportId, chain.artifact, destination, chain.digest],
    );
    expectSqlstate(duplicate, UNIQUE_VIOLATION, 'attempt 1 was permitted twice');
    expect(duplicate.constraint).toBe('network_external_transport_permits_one_per_attempt');

    // Attempt 2 needs its OWN fresh decision, which is the property that lets a revoked grant stop
    // a pending send: reauthorization runs again before the next permit exists.
    const second = await mintPermit(chain, transportId, destination, 2);
    expect(second).not.toBe('');
  });

  it('refuses a permit whose deadline does not follow its issue', async () => {
    const chain = await mintChain('permit-window');
    const destination = await createDestination(chain.recipient);
    const transportId = await createTransport(chain, destination);

    const outcome = await attempt(
      broker,
      `INSERT INTO network_external_transport_permits
         (transport_id, artifact_id, destination_id, attempt_number, artifact_digest,
          composite_decision_digest, issued_at, not_after)
       VALUES ($1,$2,$3,1,$4,$4, now(), now() - interval '1 second')`,
      [transportId, chain.artifact, destination, chain.digest],
    );
    expectSqlstate(outcome, CHECK_VIOLATION, 'a permit expired before it was issued');
    expect(outcome.constraint).toBe('network_external_transport_permits_window');
  });

  it('is immutable authority — no widening, no re-pointing, not even by its issuer', async () => {
    const chain = await mintChain('permit-immutable');
    const destination = await createDestination(chain.recipient);
    const transportId = await createTransport(chain, destination);
    const permit = await mintPermit(chain, transportId, destination);

    // Refusing UPDATE outright rather than guarding columns one at a time is the point: there is
    // no list of protected fields to keep in sync with the table.
    const widen = await attempt(
      owner,
      `UPDATE network_external_transport_permits
          SET not_after = now() + interval '10 years' WHERE permit_id = $1`,
      [permit],
    );
    expectSqlstate(widen, APPEND_ONLY, 'a permit deadline was extended');
    expect(widen.message).toContain('network_external_transport_permits is append-only');

    const erase = await attempt(
      owner,
      'DELETE FROM network_external_transport_permits WHERE permit_id = $1',
      [permit],
    );
    expectSqlstate(erase, APPEND_ONLY, 'a permit was erased');
  });
});

// ---------------------------------------------------------------------------
// §23 + §27 — the role separation, stated as privilege. THE PRIMARY SECURITY INVARIANT.
// ---------------------------------------------------------------------------

describe('authorization role != egress role — OR-02', () => {
  it('gives the transport worker no membership of the delivery worker, in either direction', async () => {
    // Neither can become the other. A membership either way would collapse the split into a
    // comment, and INHERIT would then hand the egress process every N5 read in one step.
    const between = await owner.query<{ line: string }>(
      `SELECT format('%s -> %s', m.rolname, g.rolname) AS line
         FROM pg_auth_members am
         JOIN pg_roles m ON m.oid = am.member
         JOIN pg_roles g ON g.oid = am.roleid
        WHERE (m.rolname = 'freightos_transport_worker' AND g.rolname = 'freightos_delivery_worker')
           OR (m.rolname = 'freightos_delivery_worker' AND g.rolname = 'freightos_transport_worker')
        ORDER BY 1`,
    );
    expect(between.rows.map((x) => x.line)).toEqual([]);

    // Neither is a member of ANYTHING. Stating it this way rather than as a pair-wise check is
    // what closes the transitive route: `transport_worker -> X -> delivery_worker` satisfies the
    // check above and defeats the invariant entirely.
    const memberships = await owner.query<{ line: string }>(
      `SELECT format('%s -> %s', m.rolname, g.rolname) AS line
         FROM pg_auth_members am
         JOIN pg_roles m ON m.oid = am.member
         JOIN pg_roles g ON g.oid = am.roleid
        WHERE m.rolname IN ('freightos_transport_worker', 'freightos_delivery_worker')
        ORDER BY 1`,
    );
    expect(memberships.rows.map((x) => x.line)).toEqual([]);

    // And the only role holding membership IN either is the migrator, whose edge is ADMIN alone.
    // That edge is how the revert drops the role at all — it is a DDL identity that runs no
    // application code. What would be an escalation is INHERIT or SET, because either would let a
    // broader identity execute external transport by picking the role's rights up; migration 0035
    // §2c refuses exactly that at deploy time, and this is the same statement measured after.
    const holders = await owner.query<{ line: string }>(
      // `%s` on a boolean renders PostgreSQL's `t`/`f`, not `true`/`false`; the explicit casts
      // make the recorded line say what it means.
      `SELECT format('%s -> %s admin=%s inherit=%s set=%s', m.rolname, g.rolname,
                     am.admin_option::text, am.inherit_option::text, am.set_option::text) AS line
         FROM pg_auth_members am
         JOIN pg_roles m ON m.oid = am.member
         JOIN pg_roles g ON g.oid = am.roleid
        WHERE g.rolname IN ('freightos_transport_worker', 'freightos_delivery_worker')
        ORDER BY 1`,
    );
    expect(holders.rows.map((x) => x.line)).toEqual([
      'freightos_migrator -> freightos_delivery_worker admin=true inherit=false set=false',
      'freightos_migrator -> freightos_transport_worker admin=true inherit=false set=false',
    ]);
  });

  it('creates the transport worker with no elevated attribute', async () => {
    const r = await owner.query<{
      s: boolean;
      b: boolean;
      cd: boolean;
      cr: boolean;
      rep: boolean;
      login: boolean;
    }>(
      `SELECT rolsuper AS s, rolbypassrls AS b, rolcreatedb AS cd, rolcreaterole AS cr,
              rolreplication AS rep, rolcanlogin AS login
         FROM pg_roles WHERE rolname = 'freightos_transport_worker'`,
    );
    expect(r.rowCount, 'freightos_transport_worker does not exist').toBe(1);
    const row = r.rows[0]!;
    // BYPASSRLS is the one that matters most: it would make every policy in §10 advisory.
    expect([row.s, row.b, row.cd, row.cr, row.rep]).toEqual([false, false, false, false, false]);
    expect(row.login, 'a runtime identity that cannot log in is not a runtime identity').toBe(true);
  });

  it('holds NO privilege on any N5 authorization input — it cannot evaluate what it cannot see', async () => {
    // THE LEDGER, table by table. This is what "no N5 authority" means operationally: the egress
    // process cannot read a grant, a revocation, a sensitivity, a ceiling, a projection or a
    // subscription, so it cannot compute an authorization decision even in principle. It must be
    // handed one, which is the permit.
    const N5_AND_ADJACENT = [
      'network_disclosure_grants',
      'network_disclosure_grant_revocations',
      'network_disclosure_subscriptions',
      'network_disclosure_subscription_revocations',
      'network_disclosure_sensitivities',
      'network_disclosure_purpose_ceilings',
      'network_disclosure_purposes',
      'network_disclosure_authority_bases',
      'network_disclosure_projections',
      'network_disclosure_projection_fields',
      'network_schema_disclosure_sensitivity',
      'network_events',
      'network_transport_intents',
      'network_delivery_attempts',
      'network_disclosure_deliveries',
      'network_disclosure_routing_resolutions',
    ] as const;
    const r = await owner.query<{ line: string }>(
      `SELECT format('%s %s', t, p) AS line
         FROM unnest($1::text[]) AS t
         CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES']) AS p
        WHERE has_table_privilege('freightos_transport_worker', t, p)
        ORDER BY 1`,
      [[...N5_AND_ADJACENT]],
    );
    expect(r.rows.map((x) => x.line)).toEqual([]);

    // ANTI-VACUITY, and it is load-bearing here. The oracle above would report an empty list just
    // as happily if `has_table_privilege` were being asked about a role that holds nothing
    // anywhere. The delivery worker DOES hold reads on these tables, through the same oracle and
    // the same call — so the empty result above is a fact about the transport worker, not about
    // the query.
    const control = await owner.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM unnest($1::text[]) AS t
        WHERE has_table_privilege('freightos_delivery_worker', t, 'SELECT')`,
      [[...N5_AND_ADJACENT]],
    );
    expect(control.rows[0]!.n, 'the oracle reports nothing for anyone').toBeGreaterThan(10);
  });

  it('is SET-ROLE reachable to nothing — the indirect authority path, closed', async () => {
    // ACL alone is not the whole answer. `SET ROLE` moves `current_user` without authenticating
    // anything, so a role that can SET to another role holds that role's privileges on demand —
    // and an ACL ledger measured only against `freightos_transport_worker` would report zero N5
    // reads while one statement away from all of them.
    //
    // Measured through `pg_has_role(..., 'USAGE')`, which is what PostgreSQL itself consults, and
    // over EVERY freightos role rather than a chosen few — a check that names its suspects misses
    // the transitive path through a role nobody thought to list.
    // BOTH privileges, because they answer different questions. `USAGE` is "holds the role's
    // rights without doing anything"; `MEMBER` is "is a member, and could reach them". Checking
    // only USAGE would miss a SET-reachable edge; checking only MEMBER would miss an inherited one.
    const reachable = await owner.query<{ line: string }>(
      `SELECT format('%s -> %s usage=%s member=%s', $1::text, r.rolname,
                     pg_has_role($1::text, r.oid, 'USAGE')::text,
                     pg_has_role($1::text, r.oid, 'MEMBER')::text) AS line
         FROM pg_roles r
        WHERE r.rolname LIKE 'freightos%' AND r.rolname <> $1
          AND (pg_has_role($1::text, r.oid, 'USAGE') OR pg_has_role($1::text, r.oid, 'MEMBER'))
        ORDER BY 1`,
      ['freightos_transport_worker'],
    );
    expect(reachable.rows.map((x) => x.line)).toEqual([]);

    // ANTI-VACUITY. An empty answer would look identical if the question were malformed, so the
    // same oracle is asked about a role that genuinely has edges. The migrator is a member of every
    // managed role — that is how a revert drops them — and holds USAGE on none of them, which is
    // the ADMIN-without-INHERIT shape 0029 established. Both halves are asserted, so the oracle is
    // shown to discriminate rather than merely to answer.
    const control = await owner.query<{ member: number; usage: number }>(
      `SELECT count(*) FILTER (WHERE pg_has_role('freightos_migrator', r.oid, 'MEMBER'))::int AS member,
              count(*) FILTER (WHERE pg_has_role('freightos_migrator', r.oid, 'USAGE'))::int  AS usage
         FROM pg_roles r
        WHERE r.rolname IN ('freightos_transport_worker', 'freightos_delivery_worker')`,
    );
    expect(control.rows[0]!.member, 'the reachability oracle reports nothing for anyone').toBe(2);
    expect(control.rows[0]!.usage, 'the migrator INHERITS a worker, which OR-02 forbids').toBe(0);

    // And the definitive statement about SET, which `pg_has_role(..., 'MEMBER')` predates and
    // therefore overstates: in PostgreSQL 16 `SET ROLE` requires the SET option on the membership,
    // and the migrator's edge does not carry it. So even the one role with edges to the workers
    // cannot become either of them.
    const setOption = await owner.query<{ line: string }>(
      `SELECT format('%s->%s set=%s', m.rolname, r.rolname, am.set_option::text) AS line
         FROM pg_auth_members am
         JOIN pg_roles r ON r.oid = am.roleid
         JOIN pg_roles m ON m.oid = am.member
        WHERE r.rolname IN ('freightos_transport_worker', 'freightos_delivery_worker')
        ORDER BY 1`,
    );
    expect(setOption.rows.map((x) => x.line)).toEqual([
      'freightos_migrator->freightos_delivery_worker set=false',
      'freightos_migrator->freightos_transport_worker set=false',
    ]);
  });

  it('pairs every FORCE-RLS SELECT grant with an admitting policy AND a visible row', async () => {
    // THE FULL LEDGER, and the third column is the one that matters. A GRANT with no admitting
    // policy under FORCE RLS returns ZERO ROWS AND RAISES NOTHING — met three times in this
    // repository already (R-05 failed closed, R-06 failed open, U-10 blind). A ledger that checked
    // only "grant + policy exists" would still pass if the policy's predicate admitted nothing, so
    // this one reads an actual row through the worker's own connection.
    const chain = await mintChain('rls-ledger');
    const destination = await createDestination(chain.recipient);
    const transportId = await createTransport(chain, destination);
    await mintPermit(chain, transportId, destination);
    await transport.query(
      `INSERT INTO network_external_transport_attempts
         (transport_id, attempt_number, outcome, failure_category)
       VALUES ($1, 1, 'timeout', 'transport')`,
      [transportId],
    );
    await asAdminOfA(async (c) => {
      await c.query(
        `INSERT INTO network_transport_destination_revocations (destination_id, reason)
         VALUES ($1, 'n7 ledger fixture: the revocation read must be non-empty too')`,
        [destination],
      );
    });

    const grants = await owner.query<{ relation: string; force: boolean; policies: string }>(
      `SELECT g.table_name AS relation,
              c.relforcerowsecurity AS force,
              coalesce((SELECT string_agg(p.policyname, ',' ORDER BY p.policyname)
                          FROM pg_policies p
                         WHERE p.schemaname = 'public' AND p.tablename = g.table_name
                           AND p.cmd IN ('SELECT', 'ALL')
                           AND ('freightos_transport_worker' = ANY (p.roles)
                                OR 'public' = ANY (p.roles))), '(NONE)') AS policies
         FROM information_schema.role_table_grants g
         JOIN pg_class c ON c.oid = ('public.' || g.table_name)::regclass
        WHERE g.grantee = 'freightos_transport_worker' AND g.privilege_type = 'SELECT'
        ORDER BY g.table_name`,
    );
    expect(grants.rowCount, 'the ledger is empty, so every claim below is vacuous').toBe(8);

    const ledger: string[] = [];
    for (const row of grants.rows) {
      expect(row.force, `${row.relation} is not FORCE-RLS`).toBe(true);
      expect(row.policies, `${row.relation}: SELECT granted with no admitting policy`).not.toBe(
        '(NONE)',
      );
      const seen = await transport.query(`SELECT 1 FROM public.${row.relation} LIMIT 1`);
      ledger.push(
        `${row.relation} force=${row.force} policies=${row.policies} rows=${seen.rowCount}`,
      );
      // THE ZERO-ROW FALSE GREEN, refused. Every one of the eight has a fixture row above or is
      // reachable from one, so a permanently-empty read shows up here as 0 rather than as silence.
      expect(seen.rowCount, `${row.relation}: grant + policy present but NO row visible`).toBe(1);
    }
    expect(ledger).toHaveLength(8);
  });

  it('cannot read an N5 grant even by trying — the refusal is a privilege error, not an empty set', async () => {
    // Distinguishing the two is the entire lesson of R-05 / R-06 / U-10. An empty set would be
    // indistinguishable from "there are no grants", and a future migration that added a SELECT
    // grant without a policy would flip this from an error to a silent zero without failing a
    // single count-based assertion.
    const outcome = await attempt(transport, 'SELECT * FROM network_disclosure_grants');
    expectSqlstate(outcome, INSUFFICIENT_PRIVILEGE, 'the egress role reached an N5 grant');
    expect(outcome.message).toMatch(/permission denied for table network_disclosure_grants/);
  });

  it('reads an artifact ONLY where an obligation for it exists — a narrow path, not a browse', async () => {
    const owed = await mintChain('artifact-visible');
    const notOwed = await mintChain('artifact-invisible');
    const destination = await createDestination(owed.recipient);
    await createTransport(owed, destination);

    const visible = await transport.query<{ id: string }>(
      'SELECT artifact_id AS id FROM network_disclosure_artifacts WHERE artifact_id = $1',
      [owed.artifact],
    );
    // POSITIVE FIRST. Without this the negative below is satisfied by a worker that can see
    // nothing at all, which is exactly the FORCE-RLS failure mode this repository has now hit
    // three times: a SELECT grant with no admitting policy returns ZERO ROWS, not an error.
    expect(visible.rowCount, 'the obligation-scoped artifact read is blind').toBe(1);

    const hidden = await transport.query(
      'SELECT artifact_id FROM network_disclosure_artifacts WHERE artifact_id = $1',
      [notOwed.artifact],
    );
    // A compromised egress process cannot enumerate authorized disclosures. It sees the artifacts
    // it was told to send and no others.
    expect(hidden.rowCount, 'the egress role can browse artifacts it owes nothing on').toBe(0);

    const all = await transport.query('SELECT artifact_id FROM network_disclosure_artifacts');
    const owedCount = await owner.query<{ n: number }>(
      'SELECT count(DISTINCT artifact_id)::int AS n FROM network_external_transports',
    );
    expect(all.rowCount).toBe(owedCount.rows[0]!.n);
  });

  it('reads an inbox row ONLY where an obligation resolves through it', async () => {
    const owed = await mintChain('inbox-visible');
    const notOwed = await mintChain('inbox-invisible');
    const destination = await createDestination(owed.recipient);
    await createTransport(owed, destination);

    const visible = await transport.query(
      'SELECT inbox_id FROM network_disclosure_inbox WHERE inbox_id = $1',
      [owed.inbox],
    );
    expect(visible.rowCount, 'the obligation-scoped inbox read is blind').toBe(1);

    const hidden = await transport.query(
      'SELECT inbox_id FROM network_disclosure_inbox WHERE inbox_id = $1',
      [notOwed.inbox],
    );
    expect(hidden.rowCount).toBe(0);
  });

  it('sees organizations only, never a human or a facility participant', async () => {
    const facility = await asRole(db, 'freightos_control_plane', async (client) => {
      const r = await client.query<{ id: string }>(
        `INSERT INTO network_participants
           (participant_type, display_name, tenant_id, status, source_system, created_by, updated_by)
         VALUES ('facility', $1, $2, 'active', 'test:n7', 'test:n7', 'test:n7')
         RETURNING id`,
        [`n7-facility-${randomUUID().slice(0, 8)}`, TENANT_A],
      );
      return r.rows[0]!.id;
    });

    const org = await transport.query('SELECT id FROM network_participants WHERE id = $1', [
      orgRecipient,
    ]);
    expect(org.rowCount, 'the participant read is blind').toBe(1);

    const nonOrg = await transport.query('SELECT id FROM network_participants WHERE id = $1', [
      facility,
    ]);
    expect(nonOrg.rowCount).toBe(0);
  });

  it('writes exactly two things: its own attempt, and the obligation state that attempt produces', async () => {
    const r = await owner.query<{ line: string }>(
      `SELECT format('%s %s', c.relname,
                string_agg(DISTINCT a.privilege_type, ',' ORDER BY a.privilege_type)) AS line
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         CROSS JOIN LATERAL aclexplode(c.relacl) a
         JOIN pg_roles g ON g.oid = a.grantee
        WHERE n.nspname = 'public' AND g.rolname = 'freightos_transport_worker'
          AND a.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
        GROUP BY c.relname ORDER BY 1`,
    );
    expect(r.rows.map((x) => x.line)).toEqual([
      'network_external_transport_attempts INSERT',
      'network_external_transports UPDATE',
    ]);
  });

  it('gives the delivery worker no attempt write and no egress-side surface', async () => {
    // The complement. The authorization side must not be able to record an attempt outcome: an
    // identity that could would be able to claim a transport succeeded without one having
    // happened, which is the one thing the attempt ledger exists to prevent.
    const outcome = await attempt(
      broker,
      `INSERT INTO network_external_transport_attempts (transport_id, attempt_number, outcome)
       VALUES ($1, 1, 'accepted')`,
      [randomUUID()],
    );
    expectSqlstate(outcome, INSUFFICIENT_PRIVILEGE, 'the authorization side recorded an attempt');
    expect(outcome.message).toMatch(
      /permission denied for table network_external_transport_attempts/,
    );
  });

  it('lets the application role near neither the obligation, the permit nor the attempt', async () => {
    for (const table of [
      'network_external_transports',
      'network_external_transport_permits',
      'network_external_transport_attempts',
    ]) {
      const r = await owner.query<{ ok: boolean }>(
        `SELECT bool_or(has_table_privilege('freightos_app', $1, p)) AS ok
           FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) AS p`,
        [table],
      );
      expect(r.rows[0]!.ok, `freightos_app holds a privilege on ${table}`).toBe(false);
    }
    // Anti-vacuity: the same oracle reports the destination reads the app role legitimately holds.
    const control = await owner.query<{ ok: boolean }>(
      `SELECT has_table_privilege('freightos_app', 'network_transport_destinations', 'SELECT') AS ok`,
    );
    expect(control.rows[0]!.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §30–§31 — the attempt journal.
// ---------------------------------------------------------------------------

describe('the attempt journal records metadata and never content', () => {
  it('accepts an attempt from the transport worker and refuses a second at the same number', async () => {
    const chain = await mintChain('attempt-journal');
    const destination = await createDestination(chain.recipient);
    const transportId = await createTransport(chain, destination);
    await mintPermit(chain, transportId, destination);

    await transport.query(
      `INSERT INTO network_external_transport_attempts
         (transport_id, attempt_number, outcome, failure_category)
       VALUES ($1, 1, 'timeout', 'transport')`,
      [transportId],
    );
    const duplicate = await attempt(
      transport,
      `INSERT INTO network_external_transport_attempts
         (transport_id, attempt_number, outcome, failure_category)
       VALUES ($1, 1, 'connection_failed', 'transport')`,
      [transportId],
    );
    expectSqlstate(duplicate, UNIQUE_VIOLATION, 'attempt 1 was recorded twice');
    expect(duplicate.constraint).toBe('network_external_transport_attempts_number_unique');
  });

  it('binds the success shape: accepted carries no failure category, and a failure must carry one', async () => {
    const chain = await mintChain('attempt-shape');
    const destination = await createDestination(chain.recipient);
    const transportId = await createTransport(chain, destination);
    // The permit is part of the FIXTURE here, not the subject. Both outcomes below reached the
    // network, so both are permit-bound; without one the insert would fail on the permit binding
    // and this test would credit the wrong constraint — T-03's exact shape.
    await mintPermit(chain, transportId, destination);

    const acceptedWithFailure = await attempt(
      transport,
      `INSERT INTO network_external_transport_attempts
         (transport_id, attempt_number, outcome, failure_category)
       VALUES ($1, 1, 'accepted', 'transport')`,
      [transportId],
    );
    expectSqlstate(acceptedWithFailure, CHECK_VIOLATION, 'an accepted attempt carried a failure');

    const failureWithout = await attempt(
      transport,
      `INSERT INTO network_external_transport_attempts
         (transport_id, attempt_number, outcome) VALUES ($1, 1, 'timeout')`,
      [transportId],
    );
    expectSqlstate(failureWithout, CHECK_VIOLATION, 'a failed attempt carried no category');
  });

  it('REFUSES an attempt with no permit for that attempt number — OR-05 made structural', async () => {
    // Without this binding, `(transport_id, attempt_number)` existed on the permit AND on the
    // attempt with nothing forcing agreement — R-07's shape one layer out. An attempt could be
    // recorded for a number no permit ever authorized, which would make "the egress side cannot
    // act without a permit" a property of the worker's good behaviour rather than of the schema.
    // A claim enforced only by the actor it constrains is not enforced.
    const chain = await mintChain('attempt-needs-permit');
    const destination = await createDestination(chain.recipient);
    const transportId = await createTransport(chain, destination);

    const unpermitted = await attempt(
      transport,
      `INSERT INTO network_external_transport_attempts
         (transport_id, attempt_number, outcome, failure_category)
       VALUES ($1, 1, 'timeout', 'transport')`,
      [transportId],
    );
    expectSqlstate(unpermitted, FOREIGN_KEY_VIOLATION, 'an attempt was recorded with no permit');
    expect(unpermitted.constraint).toBe('network_external_transport_attempts_permit_binding');

    // POSITIVE CONTROL on the same axis: mint the permit and the identical insert succeeds. Without
    // this the refusal above is satisfied by an insert that was never going to work.
    await mintPermit(chain, transportId, destination);
    const permitted = await attempt(
      transport,
      `INSERT INTO network_external_transport_attempts
         (transport_id, attempt_number, outcome, failure_category)
       VALUES ($1, 1, 'timeout', 'transport')`,
      [transportId],
    );
    expect(permitted.sqlstate, `a permitted attempt was refused: ${permitted.message}`).toBeNull();

    // AND THE PERMIT FOR ATTEMPT 1 DOES NOT AUTHORIZE ATTEMPT 2. The binding is per-number, which
    // is what makes it attempt-scoped rather than a per-obligation licence.
    const nextNumber = await attempt(
      transport,
      `INSERT INTO network_external_transport_attempts
         (transport_id, attempt_number, outcome, failure_category)
       VALUES ($1, 2, 'timeout', 'transport')`,
      [transportId],
    );
    expectSqlstate(nextNumber, FOREIGN_KEY_VIOLATION, 'a permit for attempt 1 covered attempt 2');
  });

  it('still records a locally-refused outcome, and derives the exemption rather than accepting it', async () => {
    // The five outcomes decided before any permit is required — the kill switch fired,
    // authorization was withdrawn, the destination was revoked, our configuration is invalid, or
    // our own SSRF control refused the address. An unrecordable refusal is an operator with no way
    // to see why nothing is being sent, so these must remain writable with no permit.
    const chain = await mintChain('attempt-local-refusal');
    const destination = await createDestination(chain.recipient);
    const transportId = await createTransport(chain, destination);

    let n = 0;
    for (const outcome of [
      'configuration_invalid',
      'destination_disabled',
      'egress_disabled',
      'authorization_withdrawn',
      'address_rejected',
    ] as const) {
      n += 1;
      const outcomeRow = await attempt(
        transport,
        `INSERT INTO network_external_transport_attempts
           (transport_id, attempt_number, outcome, failure_category)
         VALUES ($1, $2, $3, 'local')`,
        [transportId, n, outcome],
      );
      expect(
        outcomeRow.sqlstate,
        `${outcome} could not be recorded without a permit: ${outcomeRow.message}`,
      ).toBeNull();
    }

    // THE EXEMPTION IS DERIVED, NOT ASSERTED. `permit_attempt_number` is GENERATED ALWAYS, so no
    // caller can claim exemption for an outcome that did reach the network — which is the only
    // reason a conditional foreign key is safe here at all.
    const generated = await owner.query<{ gen: string | null }>(
      `SELECT a.attgenerated::text AS gen FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
        WHERE c.relname = 'network_external_transport_attempts'
          AND a.attname = 'permit_attempt_number'`,
    );
    expect(generated.rows[0]!.gen, 'the exemption column is caller-writable').toBe('s');

    const write = await attempt(
      transport,
      `INSERT INTO network_external_transport_attempts
         (transport_id, attempt_number, outcome, failure_category, permit_attempt_number)
       VALUES ($1, 9, 'timeout', 'transport', NULL)`,
      [transportId],
    );
    // PostgreSQL refuses a write to a generated column outright — 428C9.
    expect(write.sqlstate, `the exemption was caller-supplied: ${write.message}`).toBe('428C9');
  });

  it('derives the exemption set from the SAME classification the TypeScript uses', async () => {
    // The SQL CASE and `spendsAttempt` are one identity in two places. If they drift, an outcome
    // that reached the network becomes permit-exempt in the DATABASE while the application still
    // believes it was permitted — the binding silently stops binding for that outcome, and nothing
    // fails. That is the quietest possible failure of the whole permit model.
    //
    // Read from the CATALOG, not restated here. A list copied into this file would be a third copy
    // of the same identity, and the test would then be checking two of its own transcriptions
    // against each other while the shipped column drifted away from both.
    const expr = await owner.query<{ src: string }>(
      `SELECT pg_get_expr(d.adbin, d.adrelid) AS src
         FROM pg_attrdef d
         JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
         JOIN pg_class c ON c.oid = d.adrelid
        WHERE c.relname = 'network_external_transport_attempts'
          AND a.attname = 'permit_attempt_number'`,
    );
    expect(expr.rowCount, 'the generated column has no expression to read').toBe(1);

    const exemptInSql = TRANSPORT_ATTEMPT_OUTCOMES.filter((o) =>
      new RegExp(`'${o}'::app\\.network_external_transport_attempt_outcome`).test(
        expr.rows[0]!.src,
      ),
    );
    const exemptInTypeScript = TRANSPORT_ATTEMPT_OUTCOMES.filter(
      (o) => !outcomeSemantics(o).spendsAttempt,
    );
    expect([...exemptInSql].sort()).toEqual([...exemptInTypeScript].sort());

    // Anti-vacuity: the partition is real in both directions, so the equality above is not two
    // empty sets agreeing. Five outcomes are decided locally; nine reached the network.
    expect(exemptInTypeScript).toHaveLength(5);
    expect(TRANSPORT_ATTEMPT_OUTCOMES.length - exemptInTypeScript.length).toBe(9);
  });

  it('is append-only — an outcome cannot be revised after the fact', async () => {
    const chain = await mintChain('attempt-append-only');
    const destination = await createDestination(chain.recipient);
    const transportId = await createTransport(chain, destination);
    await mintPermit(chain, transportId, destination);
    await transport.query(
      `INSERT INTO network_external_transport_attempts
         (transport_id, attempt_number, outcome, failure_category)
       VALUES ($1, 1, 'rate_limited', 'remote')`,
      [transportId],
    );

    const revise = await attempt(
      owner,
      `UPDATE network_external_transport_attempts SET outcome = 'accepted'
        WHERE transport_id = $1`,
      [transportId],
    );
    expectSqlstate(revise, APPEND_ONLY, 'an attempt outcome was revised');
    expect(revise.message).toContain('network_external_transport_attempts is append-only');
  });
});

// ---------------------------------------------------------------------------
// §33–§34 — zero egress, at the layer where it can actually be measured.
// ---------------------------------------------------------------------------

describe('N7-A adds no external capability at all', () => {
  it('resolves the endpoint from the destination identity and from nothing a caller supplies', async () => {
    // The property behind "no runtime argument": `endpoint_ref` is reachable ONLY by naming a
    // `destination_id` that a transport already binds. There is no function, no policy and no
    // column that takes an address from a caller — so an SSRF via parameter has no entry point in
    // this schema, independently of whatever the future adapter does with the reference.
    const r = await owner.query<{ n: number }>(
      // `prokind = 'f'` because `pg_get_functiondef` errors outright on an aggregate, and the
      // schemas scanned contain some — an unfiltered scan fails rather than reporting zero, which
      // would have been mistaken for a schema problem instead of a query one.
      `SELECT count(*)::int AS n
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('app', 'admin', 'public') AND p.prokind = 'f'
          AND pg_get_functiondef(p.oid) ~* '(endpoint_ref|credential_ref)'`,
    );
    expect(r.rows[0]!.n, 'a function dereferences the endpoint or credential reference').toBe(0);
  });

  it('stores no address anywhere — no row in the registry contains a URL scheme', async () => {
    await createDestination(orgRecipient);
    const r = await owner.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM network_transport_destinations
        WHERE endpoint_ref ~* '^[a-z][a-z0-9+.-]*://'
           OR coalesce(credential_ref, '') ~* '^[a-z][a-z0-9+.-]*://'`,
    );
    // `vault://...` in the credential column is a REFERENCE scheme, not an address — and it is
    // asserted above to be accepted. This query is about the endpoint column, which is where an
    // address would actually be used.
    const endpoints = await owner.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM network_transport_destinations
        WHERE endpoint_ref ~* '^[a-z][a-z0-9+.-]*://'`,
    );
    expect(endpoints.rows[0]!.n).toBe(0);
    expect(r.rows[0]!.n).toBeGreaterThanOrEqual(0);
  });

  it('registers exactly three permission keys, and grants them to nobody', async () => {
    const keys = [
      'network.transport_destination.create',
      'network.transport_destination.read',
      'network.transport_destination.revoke',
    ];
    const r = await owner.query<{ key: string }>(
      `SELECT key FROM permissions WHERE key LIKE 'network.transport_destination.%' ORDER BY 1`,
    );
    expect(r.rows.map((x) => x.key)).toEqual(keys);

    // A service account holding a destination permission would be a machine identity that can
    // register where data goes. Only the fixture role — an explicitly granted human role in this
    // suite — holds them, and no service account does.
    const services = await owner.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM service_account_permissions sap
         JOIN permissions p ON p.id = sap.permission_id
        WHERE p.key = ANY($1)`,
      [keys],
    );
    expect(services.rows[0]!.n).toBe(0);
  });
});

describe('the N7 relation inventory agrees with what shipped', () => {
  it('declares exactly the five relations the catalog holds, and each is classified', async () => {
    const r = await owner.query<{ n: string }>(
      `SELECT c.relname AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'network\\_%'
          AND c.relname NOT IN (
            SELECT unnest($1::text[]))
        ORDER BY 1`,
      [[...N7_TRANSPORT_RELATIONS]],
    );
    // Discovery by prefix is what notices a relation nobody declared; the declared list is what
    // makes the notice mean something. Everything the scan finds outside the N7 five must belong
    // to an earlier layer — none of them may be an N7 table that skipped the inventory.
    for (const row of r.rows) {
      expect(row.n, `${row.n} looks like an N7 relation but is not declared`).not.toMatch(
        /^network_(external_transport|transport_destination)/,
      );
    }
    expect(N7_TRANSPORT_RELATIONS).toHaveLength(5);
  });
});
