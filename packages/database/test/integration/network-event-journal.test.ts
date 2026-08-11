import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  acceptNetworkEvent,
  EventRejectedError,
  generateEventId,
  maxFutureSkewSeconds,
  NetworkEventConfigurationError,
  type EventDraft,
} from '../../src/network-events.ts';
import {
  listRegisteredSchemas,
  N3_EVENT_CORRECTION_DURABLE_REF,
  V1_4_NETWORK_EVENT_ENVELOPE_DURABLE_REF,
} from '@freightos/schemas';
import { TENANT_A, TENANT_B, TestDatabase } from './harness.ts';
import type { IdentityFixture } from './identity-harness.ts';
import { seedVerifiedFixture } from './sr2-harness.ts';
import { fixtureOperator, withAuthenticatedTestPrincipal } from './verified-test-auth.ts';

/**
 * N3 — the universal network event journal.
 *
 * THE CENTRAL INVARIANT THIS FILE ATTACKS:
 *
 *   AN EVENT CAN ASSERT A FACT. AN EVENT CANNOT GRANT PERMISSION MERELY BY EXISTING.
 *
 * An event names an organization, a source, subjects, a classification and a schema. Every one of
 * those is a plausible-looking route from "the journal says so" to "therefore you may". The
 * mutation cases below assert each of them changes nothing, graded against a full privilege
 * snapshot rather than against a re-run SELECT.
 *
 * THE SECOND INVARIANT is the acceptance boundary. PostgreSQL cannot evaluate JSON Schema, so the
 * only thing standing between a schema-invalid payload and a permanently immutable journal row is
 * that `freightos_app` cannot INSERT at all. That is asserted directly, and by mutation.
 *
 * EXAMPLE STRINGS ARE NOT GOVERNANCE. Event types like `com.rigreceipts.network.example.recorded.v1`
 * and object types like `example-only` exist to exercise validation. They are not a governed event
 * catalog and not canonical FreightOS object vocabulary — N2 deferred `object_type` semantics to
 * the domain-model workstream and N3 does not seize them. Classification values such as `admin` and
 * `root` below are HOSTILE INPUTS, not approved vocabulary.
 */
const db = new TestDatabase('freightos_test_network_events');

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

/** A payload contract that is genuinely constrained, so "invalid payload" is expressible. */
const OBJECT_REF_SCHEMA =
  'https://schemas.rigreceipts.com/network/logistics-object-reference.v1.json';
const EXAMPLE_TYPE = 'com.rigreceipts.network.example.recorded.v1';

let fixtureA: IdentityFixture;
let fixtureB: IdentityFixture;
/** Organization participants: one bound to tenant A, one external with no tenant at all. */
let orgA: string;
let orgB: string;
let orgExternal: string;
let adminOperatorRole: string;

/** Run `work` on a connection authenticated as the dedicated journal writer. */
async function asWriter<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = db.connectAs('freightos_event_writer');
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/**
 * Run `work` as the cluster superuser.
 *
 * Used only to READ BACK what the writer is forbidden to see. Every trusted field the acceptance
 * path derives — `tenant_id`, `accepted_by`, `recorded_at`, the lineage columns — is deliberately
 * outside the writer's column grants, so verifying they were written correctly needs an identity
 * that is not the one under test.
 */
async function asAdmin<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = db.connectAs('postgres');
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** Accept an event through the trusted path, in its own transaction. */
async function accept(draft: EventDraft, options: Parameters<typeof acceptNetworkEvent>[2] = {}) {
  return asWriter(async (client) => {
    await client.query('BEGIN');
    try {
      const result = await acceptNetworkEvent(client, draft, options);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

function draftFor(overrides: Partial<EventDraft> = {}): EventDraft {
  return {
    type: EXAMPLE_TYPE,
    source: 'urn:freightos:test:acceptance',
    subject: [{ network_id: 'obj-00000001', object_type: 'example-only' }],
    time: new Date().toISOString(),
    organization_id: orgA,
    classification: 'internal',
    schema_ref: OBJECT_REF_SCHEMA,
    data: { network_id: 'obj-00000001', object_type: 'example-only' },
    ...overrides,
  };
}

async function registerOrganization(displayName: string, tenantId: string | null): Promise<string> {
  const client = db.connectAs('freightos_control_plane');
  await client.connect();
  try {
    const r = await client.query<{ id: string }>(
      `INSERT INTO network_participants
         (participant_type, display_name, tenant_id, status, source_system, created_by, updated_by)
       VALUES ('organization', $1, $2, 'active', 'test:n3', 'x', 'x') RETURNING id`,
      [displayName, tenantId],
    );
    return r.rows[0]!.id;
  } finally {
    await client.end();
  }
}

interface PrivilegeSnapshot {
  permissions: string[];
  context: string[];
  roleGraph: string[];
  tablePrivileges: string[];
  visibility: string[];
}

/**
 * The privilege oracle.
 *
 * ROLE-ROSTER-INDEPENDENT FROM BIRTH. The N1 CI defect was an oracle that enumerated `pg_roles`
 * outright: roles are cluster-global, other test files mint `op_*` logins as they run, and a role
 * conferring nothing on anybody registered as authority drift. This one keeps the security question
 * and drops the roster — every `freightos_%` role held or not, plus any role the principal actually
 * holds by any mode. Escalation stays visible; unrelated churn cannot perturb it.
 */
async function readPrivileges(
  client: { query: Client['query'] },
  fixture: IdentityFixture,
): Promise<PrivilegeSnapshot> {
  const rows = async (sql: string, params: readonly unknown[] = []): Promise<string[]> =>
    (await client.query<{ line: string }>(sql, [...params])).rows.map((r) => r.line);

  const visibility: string[] = [];
  const tables = await rows(
    `SELECT format('%s.%s|%s', n.nspname, c.relname,
                   has_table_privilege(current_user, c.oid, 'SELECT')::text) AS line
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND c.relname NOT LIKE 'network\\_%' ORDER BY 1`,
  );
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
    permissions: await rows(
      `SELECT format('%s=%s', k, app.user_has_permission($1, $2, k, now())::text) AS line
         FROM unnest($3::text[]) AS k ORDER BY 1`,
      [fixture.tenantId, fixture.userId, [...PERMISSION_KEYS]],
    ),
    context: await rows(
      `SELECT line FROM (VALUES
         (format('current_user=%s', current_user)),
         (format('is_control_plane=%s', app.is_control_plane()::text)),
         (format('tenant=%s', coalesce(app.current_tenant_id()::text, '-'))),
         (format('actor=%s', coalesce(app.current_actor_id(), '-'))),
         (format('scope_nodes=%s', (SELECT count(*) FROM app.verified_scope_node_ids())))
       ) AS t(line) ORDER BY 1`,
    ),
    roleGraph: await rows(
      `SELECT format('%s usage=%s member=%s set=%s', r.rolname,
                     pg_has_role(current_user, r.oid, 'USAGE')::text,
                     pg_has_role(current_user, r.oid, 'MEMBER')::text,
                     pg_has_role(current_user, r.oid, 'SET')::text) AS line
         FROM pg_roles r
        WHERE r.rolname LIKE 'freightos%'
           OR pg_has_role(current_user, r.oid, 'USAGE')
           OR pg_has_role(current_user, r.oid, 'MEMBER')
           OR pg_has_role(current_user, r.oid, 'SET')
        ORDER BY 1`,
    ),
    tablePrivileges: await rows(
      `SELECT format('%s.%s %s=%s', n.nspname, c.relname, p,
                     has_table_privilege(current_user, c.oid, p)::text) AS line
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS p
        WHERE c.relkind IN ('r', 'v') AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY 1`,
    ),
    visibility,
  };
}

const privilegesOf = (fixture: IdentityFixture): Promise<PrivilegeSnapshot> =>
  withAuthenticatedTestPrincipal(db, fixtureOperator(fixture), (c) =>
    readPrivileges(c as unknown as { query: Client['query'] }, fixture),
  );

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  fixtureA = await seedVerifiedFixture(db, TENANT_A);
  fixtureB = await seedVerifiedFixture(db, TENANT_B);
  adminOperatorRole = await db.provisionOperator('n3adm', TENANT_A, fixtureA.adminUserId);
  orgA = await registerOrganization('Tenant A Organization', TENANT_A);
  orgB = await registerOrganization('Tenant B Organization', TENANT_B);
  orgExternal = await registerOrganization('External Carrier With No Tenant', null);
}, 300_000);

describe('the acceptance path', () => {
  it('accepts a valid event and derives all three trusted fields', async () => {
    const result = await accept(draftFor({ correlation_id: randomUUID() }));
    expect(result.inserted).toBe(true);
    expect(result.event_fingerprint).toMatch(/^[0-9a-f]{64}$/);

    // Read as postgres: the writer deliberately cannot see these columns.
    const row = await asAdmin(async (admin) => {
      const r = await admin.query<{
        tenant_id: string | null;
        accepted_by: string;
        recorded_at: string;
        envelope_schema_ref: string;
      }>(
        `SELECT tenant_id::text, accepted_by, recorded_at::text, envelope_schema_ref
           FROM network_events WHERE event_id = $1`,
        [result.event_id],
      );
      return r.rows[0]!;
    });

    // tenant_id derived from the organization participant's own binding — never producer input.
    expect(row.tenant_id).toBe(TENANT_A);
    // accepted_by derived from the authenticated execution context. The writer is a SERVICE login,
    // so it resolves to session_user rather than a fabricated human actor.
    expect(row.accepted_by).toBe('freightos_event_writer');
    expect(row.recorded_at).toBeTruthy();
    // The envelope contract identity is distinct from the payload contract identity.
    expect(row.envelope_schema_ref).toBe(V1_4_NETWORK_EVENT_ENVELOPE_DURABLE_REF);
    expect(row.envelope_schema_ref).not.toBe(OBJECT_REF_SCHEMA);
  });

  it('rejects a payload that is valid JSON but invalid against its schema_ref', async () => {
    // THE CENTRAL ACCEPTANCE TEST. This payload is SQL-valid jsonb and would insert happily if
    // anything skipped schema validation — which is exactly why freightos_app holds no INSERT.
    await expect(
      accept(draftFor({ data: { network_id: 'short', not_a_field: true } })),
    ).rejects.toThrow(/does not satisfy/);
    await expect(accept(draftFor({ data: {} }))).rejects.toMatchObject({
      reason: 'payload_invalid',
    });
  });

  it('rejects an envelope the governed contract refuses', async () => {
    // `subject` requires at least one object reference.
    await expect(accept(draftFor({ subject: [] }))).rejects.toMatchObject({
      reason: 'envelope_invalid',
    });
  });

  it('fails closed on an unknown durable schema reference', async () => {
    await expect(
      accept(draftFor({ schema_ref: 'https://schemas.rigreceipts.com/network/nope.v1.json' })),
    ).rejects.toMatchObject({ reason: 'unknown_schema_ref' });
  });

  it('refuses a v1.2 rig.freight.* type as a native network event', async () => {
    // ADR-N0007: the two vocabularies are independently versioned and re-typing belongs to an
    // explicit adapter, which N3 does not build.
    //
    // THE ACCEPTANCE-COMPONENT LAYER. It refuses first, and with a reason rather than a constraint
    // name — that is the whole value of the outer layer. The database layer is tested separately
    // below, because a test that only exercises the first layer cannot tell you whether the second
    // exists.
    await expect(
      accept(draftFor({ type: 'rig.freight.shipment.created.v1' })),
    ).rejects.toMatchObject({ reason: 'type_namespace' });
  });

  it('refuses a non-governed type in the DATABASE too, with the component bypassed', async () => {
    // THE DATABASE LAYER, PROBED INDEPENDENTLY. `acceptNetworkEvent` rejects a `rig.freight.*` type
    // before a statement is ever issued, so the test above cannot distinguish "both layers hold"
    // from "only the component holds". This one goes around the component entirely and INSERTs as
    // the writer, which is exactly what a future writer that forgot the check would do.
    //
    // Both layers are load-bearing and neither is redundant: the component supplies the actionable
    // reason, the CHECK supplies the guarantee that survives a component that stops asking.
    await asWriter(async (client) => {
      await client.query('BEGIN');
      await expect(
        client.query(
          `INSERT INTO network_events (
             event_id, type, source, subject, occurred_at, organization_id, classification,
             schema_ref, envelope_schema_ref, data, event_fingerprint, accepted_by
           ) VALUES ($1, 'rig.freight.shipment.created.v1', 'urn:test',
             '[{"network_id":"obj-00000001","object_type":"x"}]'::jsonb, now(), $2, 'internal',
             $3, $4, '{}'::jsonb, repeat('a', 64), 'pending')`,
          [generateEventId(), orgA, OBJECT_REF_SCHEMA, V1_4_NETWORK_EVENT_ENVELOPE_DURABLE_REF],
        ),
      ).rejects.toThrow(/network_events_type_check|violates check constraint/i);
      await client.query('ROLLBACK');
    });
  });

  it('enforces the configured future-time tolerance, and admits legitimate skew', async () => {
    const now = new Date();
    const beyond = new Date(now.getTime() + 400_000).toISOString();
    await expect(accept(draftFor({ time: beyond }), { now })).rejects.toMatchObject({
      reason: 'future_time',
    });
    // Within tolerance: accepted, so the rule is a bound rather than a blanket refusal.
    const within = new Date(now.getTime() + 60_000).toISOString();
    await expect(accept(draftFor({ time: within }), { now })).resolves.toMatchObject({
      inserted: true,
    });
  });

  it('reads the skew tolerance from configuration and validates it at startup', () => {
    expect(maxFutureSkewSeconds({})).toBe(300);
    expect(maxFutureSkewSeconds({ NETWORK_EVENT_MAX_FUTURE_SKEW_SECONDS: '30' })).toBe(30);
    expect(() => maxFutureSkewSeconds({ NETWORK_EVENT_MAX_FUTURE_SKEW_SECONDS: 'soon' })).toThrow(
      NetworkEventConfigurationError,
    );
    expect(() => maxFutureSkewSeconds({ NETWORK_EVENT_MAX_FUTURE_SKEW_SECONDS: '-1' })).toThrow(
      NetworkEventConfigurationError,
    );
  });

  it('mints UUIDv7 internally but accepts a supplied UUID of any version', async () => {
    const minted = await accept(draftFor());
    // Version nibble 7, variant 8/9/a/b.
    expect(minted.event_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(generateEventId(0)).toMatch(/^00000000-0000-7/);

    // A v4 id is NOT rejected for its version — the acceptance contract is uniqueness, not format,
    // so a future external producer is not forced onto UUIDv7.
    const supplied = randomUUID();
    expect(supplied).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4/);
    await expect(accept(draftFor({ event_id: supplied }))).resolves.toMatchObject({
      inserted: true,
      event_id: supplied,
    });
  });
});

describe('idempotency', () => {
  it('acknowledges a retransmission and rejects a conflicting rewrite', async () => {
    const eventId = generateEventId();
    const draft = draftFor({ event_id: eventId, correlation_id: randomUUID() });

    const first = await accept(draft);
    expect(first.inserted).toBe(true);

    // Same id, same semantic content, accepted later: the fingerprint excludes recorded_at, so a
    // legitimate retry converges instead of looking like a conflict.
    const again = await accept(draft);
    expect(again.inserted).toBe(false);
    expect(again.event_fingerprint).toBe(first.event_fingerprint);

    // Same id, different immutable content: hard conflict. Identity may not silently change meaning.
    await expect(accept({ ...draft, classification: 'restricted-example' })).rejects.toMatchObject({
      reason: 'identity_conflict',
    });
  });

  it('treats identical content under different ids as two independent facts', async () => {
    // ADR-N0009 rejected payload-hash dedupe: two identical gate scans are two facts.
    const shared = { ...draftFor(), time: new Date().toISOString() };
    const a = await accept({ ...shared, event_id: generateEventId() });
    const b = await accept({ ...shared, event_id: generateEventId() });
    expect(a.inserted).toBe(true);
    expect(b.inserted).toBe(true);
    expect(a.event_id).not.toBe(b.event_id);
    expect(a.event_fingerprint).not.toBe(b.event_fingerprint); // event_id is inside the fingerprint
  });
});

describe('correction lineage', () => {
  it('accepts a correction referencing an original and its replacement', async () => {
    const original = await accept(draftFor());
    const replacement = await accept(draftFor());

    const correction = await accept(
      draftFor({
        event_class: 'correction',
        schema_ref: N3_EVENT_CORRECTION_DURABLE_REF,
        data: {
          corrected_event_id: original.event_id,
          replacement_event_id: replacement.event_id,
          reason: 'observed value was transposed',
          effective_at: new Date().toISOString(),
        },
      }),
    );
    expect(correction.inserted).toBe(true);

    // Read back the LINEAGE COLUMNS, not just the acceptance result. The insert succeeding proves
    // only that the row satisfied its constraints; this proves the two foreign keys point where the
    // payload said, which is the whole content of a correction.
    const lineage = await asAdmin(async (admin) => {
      const r = await admin.query<{ corrects: string; replacement: string; cls: string }>(
        `SELECT corrects_event_id::text AS corrects, replacement_event_id::text AS replacement,
                event_class::text AS cls
           FROM network_events WHERE event_id = $1`,
        [correction.event_id],
      );
      return r.rows[0]!;
    });
    expect(lineage.corrects).toBe(original.event_id);
    expect(lineage.replacement).toBe(replacement.event_id);
    expect(lineage.cls).toBe('correction');

    // THE ORIGINAL IS UNTOUCHED AND STILL REPLAYABLE — a correction never mutates.
    const originalStill = await asAdmin(async (admin) => {
      const r = await admin.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM network_events
          WHERE event_id = $1 AND corrects_event_id IS NULL`,
        [original.event_id],
      );
      return r.rows[0]!.n;
    });
    expect(originalStill).toBe('1');
  });

  it('rejects a correction whose payload does not satisfy the governed contract', async () => {
    // ONE GATE, ONE REASON. Payload conformance is decided in exactly one place for every contract,
    // corrections included, so a correction with the wrong SHAPE is `payload_invalid` — the same
    // reason any other malformed payload gets, with the offending path in `detail`.
    // `correction_invalid` is reserved for the failures only a correction can have: carrying the
    // wrong contract, or asserting lineage that cannot be written. The two never overlap, and
    // neither can be reached by the other's inputs.
    const original = await accept(draftFor());
    const rejection = await accept(
      draftFor({
        event_class: 'correction',
        schema_ref: N3_EVENT_CORRECTION_DURABLE_REF,
        data: { corrected_event_id: original.event_id, reason: 'missing the replacement' },
      }),
    ).then(
      () => null,
      (error: unknown) => error as EventRejectedError,
    );
    expect(rejection).toBeInstanceOf(EventRejectedError);
    expect(rejection!.reason).toBe('payload_invalid');
    // Actionable, not merely refused: the caller is told which field is missing.
    expect(rejection!.detail.join(' ')).toContain('replacement_event_id');
  });

  it('will not write lineage from a payload field the contract does not govern', async () => {
    // The lineage columns are foreign keys. They are populated from `corrected_event_id` — the
    // field the governed contract defines — and from nothing else. A producer that spells it the
    // COLUMN's way instead is asserting a field the contract forbids, and `additionalProperties:
    // false` refuses it rather than letting a correction through with half its lineage missing.
    const original = await accept(draftFor());
    const replacement = await accept(draftFor());
    await expect(
      accept(
        draftFor({
          event_class: 'correction',
          schema_ref: N3_EVENT_CORRECTION_DURABLE_REF,
          data: {
            corrects_event_id: original.event_id, // the column name, not the contract's name
            replacement_event_id: replacement.event_id,
            reason: 'spelled the column, not the contract',
            effective_at: new Date().toISOString(),
          },
        }),
      ),
    ).rejects.toMatchObject({ reason: 'payload_invalid' });
  });

  it('rejects a correction carrying some other contract', async () => {
    // Lineage is extracted only from a payload validated against the governed correction schema —
    // never from arbitrary JSON keys that happen to be named plausibly.
    await expect(
      accept(draftFor({ event_class: 'correction', schema_ref: OBJECT_REF_SCHEMA })),
    ).rejects.toMatchObject({ reason: 'correction_invalid' });
  });

  it('rejects self-targeting and self-replacing corrections', async () => {
    const eventId = generateEventId();
    const other = await accept(draftFor());
    const base = {
      event_class: 'correction',
      schema_ref: N3_EVENT_CORRECTION_DURABLE_REF,
      event_id: eventId,
    } as const;

    for (const data of [
      { corrected_event_id: eventId, replacement_event_id: other.event_id },
      { corrected_event_id: other.event_id, replacement_event_id: eventId },
      { corrected_event_id: other.event_id, replacement_event_id: other.event_id },
    ]) {
      await expect(
        accept(
          draftFor({
            ...base,
            data: { ...data, reason: 'r', effective_at: new Date().toISOString() },
          }),
        ),
      ).rejects.toMatchObject({ reason: 'correction_invalid' });
    }
  });

  it('refuses a correction naming an event that was never accepted', async () => {
    const replacement = await accept(draftFor());
    await expect(
      accept(
        draftFor({
          event_class: 'correction',
          schema_ref: N3_EVENT_CORRECTION_DURABLE_REF,
          data: {
            corrected_event_id: randomUUID(),
            replacement_event_id: replacement.event_id,
            reason: 'targets nothing',
            effective_at: new Date().toISOString(),
          },
        }),
      ),
      // The foreign key is what makes this unforgeable: lineage may only point at accepted facts.
    ).rejects.toThrow(/foreign key|violates/i);
  });
});

/**
 * THE CORRECTION ORGANIZATION INVARIANT.
 *
 *   A correction may correct and replace only events belonging to the SAME canonical organization
 *   as the correction itself.
 *
 * One organization challenging another organization's fact is a `dispute` — a governed event class
 * in its own right — not a correction. N3 implements no cross-organization correction or delegation
 * semantics, and this file is where that stops being a claim about intent.
 *
 * THE DETECTOR MUST BE INTEGRITY, NOT VISIBILITY. Every negative below asserts the exact
 * `constraint` name PostgreSQL reports, because "the insert failed" is satisfied by a dozen
 * mechanisms and only one of them is the invariant. In particular it must not be row-level
 * security: RLS would make the rule collapse the moment a legitimate cross-tenant reader appeared,
 * and it does not apply to referential checks at all — which is precisely why the constraint can
 * decide this about rows the writer is forbidden to read.
 */
describe('the correction organization invariant', () => {
  /** Capture the pg error so the CONSTRAINT that rejected it can be named, not just the failure. */
  async function rejection(
    draft: EventDraft,
  ): Promise<{ constraint: string | undefined; message: string }> {
    try {
      await accept(draft);
    } catch (error) {
      const e = error as { constraint?: string; message: string };
      // `constraint` is undefined for a non-constraint failure, and that is a meaningful answer
      // rather than a missing one: it says the rejection came from somewhere else.
      return { constraint: e.constraint, message: e.message };
    }
    throw new Error('the correction was ACCEPTED — the organization invariant did not hold');
  }

  function correction(
    organizationId: string,
    correctedId: string,
    replacementId: string,
  ): EventDraft {
    return draftFor({
      organization_id: organizationId,
      event_class: 'correction',
      schema_ref: N3_EVENT_CORRECTION_DURABLE_REF,
      data: {
        corrected_event_id: correctedId,
        replacement_event_id: replacementId,
        reason: 'organization-scoped lineage',
        effective_at: new Date().toISOString(),
      },
    });
  }

  it('accepts a correction whose original and replacement are both its own — positive control', async () => {
    // Runs first and deliberately: every negative below is meaningless if the shape it varies from
    // cannot itself be accepted.
    const original = await accept(draftFor({ organization_id: orgA }));
    const replacement = await accept(draftFor({ organization_id: orgA }));
    const c = await accept(correction(orgA, original.event_id, replacement.event_id));
    expect(c.inserted).toBe(true);

    const row = await asAdmin(async (admin) => {
      const r = await admin.query<{ org: string; corrects: string; repl: string }>(
        `SELECT organization_id::text AS org, corrects_event_id::text AS corrects,
                replacement_event_id::text AS repl
           FROM network_events WHERE event_id = $1`,
        [c.event_id],
      );
      return r.rows[0]!;
    });
    expect(row.org).toBe(orgA);
    expect(row.corrects).toBe(original.event_id);
    expect(row.repl).toBe(replacement.event_id);
  });

  it('refuses to correct another organization’s original', async () => {
    const theirOriginal = await accept(draftFor({ organization_id: orgB }));
    const myReplacement = await accept(draftFor({ organization_id: orgA }));

    const r = await rejection(correction(orgA, theirOriginal.event_id, myReplacement.event_id));
    expect(r.constraint).toBe('network_events_corrects_same_organization');
  });

  it('refuses to name another organization’s event as the replacement', async () => {
    const myOriginal = await accept(draftFor({ organization_id: orgA }));
    const theirReplacement = await accept(draftFor({ organization_id: orgB }));

    const r = await rejection(correction(orgA, myOriginal.event_id, theirReplacement.event_id));
    expect(r.constraint).toBe('network_events_replacement_same_organization');
  });

  it('cannot bridge two organizations from either side', async () => {
    // A's original, B's replacement. Neither organization can author a correction relating them:
    // the correction carries exactly ONE organization_id, and both targets must match it.
    const aOriginal = await accept(draftFor({ organization_id: orgA }));
    const bReplacement = await accept(draftFor({ organization_id: orgB }));

    // Asserted as A: the original is fine, the replacement is foreign.
    expect(
      (await rejection(correction(orgA, aOriginal.event_id, bReplacement.event_id))).constraint,
    ).toBe('network_events_replacement_same_organization');
    // Asserted as B: the replacement is fine, the original is foreign.
    expect(
      (await rejection(correction(orgB, aOriginal.event_id, bReplacement.event_id))).constraint,
    ).toBe('network_events_corrects_same_organization');
    // …and no third organization can adopt the pair either.
    expect(
      (await rejection(correction(orgExternal, aOriginal.event_id, bReplacement.event_id)))
        .constraint,
    ).toBe('network_events_corrects_same_organization');
  });

  it('lets a NULL-tenant external organization correct its OWN lineage', async () => {
    // The invariant is organizational, not tenant-based. An external organization has no FreightOS
    // tenant at all, and `tenant_id IS NULL` is not a defect to route around — it must be able to
    // correct its own facts through the trusted path exactly like anyone else.
    const original = await accept(draftFor({ organization_id: orgExternal }));
    const replacement = await accept(draftFor({ organization_id: orgExternal }));
    const c = await accept(correction(orgExternal, original.event_id, replacement.event_id));
    expect(c.inserted).toBe(true);

    const row = await asAdmin(async (admin) => {
      const r = await admin.query<{ tenant: string | null; corrects: string }>(
        `SELECT tenant_id::text AS tenant, corrects_event_id::text AS corrects
           FROM network_events WHERE event_id = $1`,
        [c.event_id],
      );
      return r.rows[0]!;
    });
    expect(row.tenant).toBeNull();
    expect(row.corrects).toBe(original.event_id);

    // …and it still cannot reach a tenant-bound organization's facts.
    const theirs = await accept(draftFor({ organization_id: orgA }));
    expect(
      (await rejection(correction(orgExternal, theirs.event_id, replacement.event_id))).constraint,
    ).toBe('network_events_corrects_same_organization');
  });

  it('is CONSTRAINT-driven, not RLS-driven, and the writer cannot see the targets at all', async () => {
    // The claim the whole design rests on: referential integrity is evaluated as the referenced
    // table's owner, so it decides this about rows the writer has no privilege to read. If the rule
    // needed a read, the writer would need a global journal SELECT — the exact privilege N3's
    // column-level design exists to avoid.
    const theirs = await accept(draftFor({ organization_id: orgB }));
    const mine = await accept(draftFor({ organization_id: orgA }));

    await asWriter(async (client) => {
      // The writer may not read organization_id from ANY row, its own included.
      await expect(
        client.query('SELECT organization_id FROM network_events WHERE event_id = $1', [
          mine.event_id,
        ]),
      ).rejects.toThrow(/permission denied/i);
      // Nor is it a policy question: the two columns it may read are readable for every row,
      // including the foreign organization's, so visibility is NOT what separates these cases.
      const seen = await client.query('SELECT event_id FROM network_events WHERE event_id = $1', [
        theirs.event_id,
      ]);
      expect(seen.rowCount).toBe(1);
    });

    // …and yet the correction is still refused, by the constraint.
    expect((await rejection(correction(orgA, theirs.event_id, mine.event_id))).constraint).toBe(
      'network_events_corrects_same_organization',
    );
  });

  it('is not an existence oracle for another organization’s events', async () => {
    // A correction must not become a probe. Naming a REAL foreign event and naming a uuid that was
    // never accepted must be indistinguishable — otherwise "did this correction fail differently?"
    // answers "does organization B hold event X?", and lineage becomes a cross-tenant search tool.
    const realForeign = await accept(draftFor({ organization_id: orgB }));
    const neverAccepted = randomUUID();
    const mine = await accept(draftFor({ organization_id: orgA }));

    const real = await rejection(correction(orgA, realForeign.event_id, mine.event_id));
    const fake = await rejection(correction(orgA, neverAccepted, mine.event_id));

    // Same constraint, same SQLSTATE, and a message that differs only in the uuid the caller
    // already supplied. The key is the PAIR, so `(foreign_event, my_org)` is absent whether or not
    // `foreign_event` exists — there is nothing for the two cases to differ about.
    expect(real.constraint).toBe('network_events_corrects_same_organization');
    expect(fake.constraint).toBe(real.constraint);
    const scrub = (m: string, id: string) => m.split(id).join('<uuid>');
    expect(scrub(real.message, realForeign.event_id)).toBe(scrub(fake.message, neverAccepted));

    // The same holds in the replacement position.
    const realRepl = await rejection(correction(orgA, mine.event_id, realForeign.event_id));
    const fakeRepl = await rejection(correction(orgA, mine.event_id, neverAccepted));
    expect(realRepl.constraint).toBe('network_events_replacement_same_organization');
    expect(fakeRepl.constraint).toBe(realRepl.constraint);
    expect(scrub(realRepl.message, realForeign.event_id)).toBe(
      scrub(fakeRepl.message, neverAccepted),
    );
  });

  it('carries organization_id in both lineage keys — the structural gate', async () => {
    // What the runtime cases above cannot see: a LATER change to a single-column key would still
    // enforce "points at a real event", and every one of them would keep passing while
    // cross-organization corrections silently became possible again.
    const r = await asAdmin(async (admin) =>
      (
        await admin.query<{ line: string }>(
          `SELECT format('%s: (%s) -> %s(%s)', c.conname,
                    (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
                       FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
                       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum),
                    c.confrelid::regclass::text,
                    (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
                       FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
                       JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum))
                  AS line
             FROM pg_constraint c
            WHERE c.conrelid = 'network_events'::regclass AND c.contype = 'f'
              AND c.confrelid = 'network_events'::regclass ORDER BY 1`,
        )
      ).rows.map((x) => x.line),
    );
    expect(r).toEqual([
      'network_events_corrects_same_organization: (corrects_event_id,organization_id) -> ' +
        'network_events(event_id,organization_id)',
      'network_events_replacement_same_organization: (replacement_event_id,organization_id) -> ' +
        'network_events(event_id,organization_id)',
    ]);

    // MATCH SIMPLE, and it is load-bearing rather than incidental: under MATCH FULL a composite key
    // that is part-NULL is rejected outright, so every ordinary non-correction event — which
    // carries (NULL, organization) — would fail to insert at all.
    const match = await asAdmin(async (admin) =>
      (
        await admin.query<{ line: string }>(
          `SELECT format('%s confmatchtype=%s', conname, confmatchtype) AS line
             FROM pg_constraint WHERE conrelid = 'network_events'::regclass
              AND contype = 'f' AND confrelid = 'network_events'::regclass ORDER BY 1`,
        )
      ).rows.map((x) => x.line),
    );
    expect(match).toEqual([
      'network_events_corrects_same_organization confmatchtype=s',
      'network_events_replacement_same_organization confmatchtype=s',
    ]);

    // `event_id` is still the sole event identity. The composite UNIQUE exists only so the pair can
    // be referenced; it is not a redefinition of identity.
    const pk = await asAdmin(async (admin) =>
      (
        await admin.query<{ line: string }>(
          `SELECT format('%s %s (%s)', conname, contype,
                    (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
                       FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
                       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum))
                  AS line
             FROM pg_constraint c
            WHERE c.conrelid = 'network_events'::regclass AND c.contype IN ('p', 'u') ORDER BY 1`,
        )
      ).rows.map((x) => x.line),
    );
    expect(pk).toEqual([
      'network_events_id_organization_key u (event_id,organization_id)',
      'network_events_pkey p (event_id)',
    ]);
  });
});

describe('the writer boundary', () => {
  it('gives freightos_app no INSERT on the journal, by any route', async () => {
    const client = db.connectAs('postgres');
    await client.connect();
    try {
      const r = await client.query<{ line: string }>(
        `SELECT format('%s %s=%s', who, priv,
                       has_table_privilege(who, 'network_events', priv)::text) AS line
           FROM unnest(ARRAY['freightos_app', 'freightos_control_plane']) AS who
           CROSS JOIN unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS priv
          ORDER BY 1`,
      );
      for (const line of r.rows.map((x) => x.line)) expect(line).toMatch(/=false$/);

      // …and no membership path to the writer, in either direction.
      const edges = await client.query<{ line: string }>(
        `SELECT format('%s->%s', m.rolname, r.rolname) AS line
           FROM pg_auth_members am
           JOIN pg_roles m ON m.oid = am.member
           JOIN pg_roles r ON r.oid = am.roleid
          WHERE m.rolname = 'freightos_event_writer' OR r.rolname = 'freightos_event_writer'`,
      );
      const forbidden = edges.rows
        .map((x) => x.line)
        .filter((l) => /freightos_(app|control_plane|admin)\b/.test(l));
      expect(forbidden, 'a membership edge connects the writer to a broad identity').toEqual([]);
    } finally {
      await client.end();
    }
  });

  it('holds the exact attributes the role contract specifies', async () => {
    const client = db.connectAs('postgres');
    await client.connect();
    try {
      const r = await client.query<{ line: string }>(
        // `::text` on every flag: format('%s', boolean) renders `t`/`f`, so an unqualified
        // comparison against 'true'/'false' would never match and the assertion would read as a
        // typo rather than as the security statement it is.
        `SELECT format('login=%s super=%s bypassrls=%s createdb=%s createrole=%s replication=%s',
                       rolcanlogin::text, rolsuper::text, rolbypassrls::text, rolcreatedb::text,
                       rolcreaterole::text, rolreplication::text) AS line
           FROM pg_roles WHERE rolname = 'freightos_event_writer'`,
      );
      expect(r.rows[0]!.line).toBe(
        'login=true super=false bypassrls=false createdb=false createrole=false replication=false',
      );
    } finally {
      await client.end();
    }
  });

  it('lets the writer read identity columns globally but no payload column at all', async () => {
    await accept(draftFor({ organization_id: orgB }));

    await asWriter(async (client) => {
      // POSITIVE CONTROL: the capability it genuinely needs — global identity visibility, across
      // tenants, for duplicate resolution.
      const identity = await client.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM network_events',
      );
      expect(Number(identity.rows[0]!.n)).toBeGreaterThan(1);
      await expect(
        client.query('SELECT event_id, event_fingerprint FROM network_events'),
      ).resolves.toBeDefined();

      // NEGATIVE CONTROLS: every payload column is refused by column-level privilege, so
      // duplicate-resolution capability cannot be turned into cross-tenant payload access.
      for (const column of [
        'data',
        'subject',
        'source',
        'organization_id',
        'classification',
        'evidence_refs',
        'workflow_id',
        'trace_id',
        'tenant_id',
        'accepted_by',
      ]) {
        await expect(
          client.query(`SELECT ${column} FROM network_events`),
          `the writer could read ${column}`,
        ).rejects.toThrow(/permission denied/i);
      }
    });
  });

  it('cannot become a broader identity, mutate the journal, or write the projection', async () => {
    // The writer holds NO outbound membership — not merely "none of the three we thought to name".
    // `SET ROLE` below tests the three that matter today; this tests the ones nobody has invented
    // yet. Inbound membership is deliberately not asserted: the test superuser must be able to
    // become the writer to run this file at all.
    const catalog = db.connectAs('postgres');
    await catalog.connect();
    try {
      const outbound = await catalog.query<{ line: string }>(
        `SELECT r.rolname AS line FROM pg_auth_members am
           JOIN pg_roles m ON m.oid = am.member
           JOIN pg_roles r ON r.oid = am.roleid
          WHERE m.rolname = 'freightos_event_writer' ORDER BY 1`,
      );
      expect(outbound.rows.map((x) => x.line)).toEqual([]);
    } finally {
      await catalog.end();
    }

    await asWriter(async (client) => {
      for (const role of ['freightos_app', 'freightos_admin', 'freightos_control_plane']) {
        await client.query('BEGIN');
        await expect(client.query(`SET LOCAL ROLE ${role}`), `SET ROLE ${role}`).rejects.toThrow(
          /permission denied|must be a member/i,
        );
        await client.query('ROLLBACK');
      }

      for (const statement of [
        `UPDATE network_events SET classification = 'x'`,
        'DELETE FROM network_events',
        'TRUNCATE network_events',
        `INSERT INTO network_schema_versions (durable_schema_ref, registry_schema_id, version,
           artifact_class, content_hash, status)
         VALUES ('https://x/y.v1.json', 'https://x/y.v1.json', 1, 'x', repeat('a', 64), 'active')`,
        `UPDATE network_schema_versions SET status = 'deprecated'`,
        `UPDATE network_participants SET display_name = 'x'`,
        `INSERT INTO roles (tenant_id, organization_node_id, legal_entity_id, key, name,
           created_by) VALUES ($1, $1, $1, 'k', 'n', 'x')`,
      ]) {
        await client.query('BEGIN');
        await expect(
          client.query(statement, statement.includes('$1') ? [TENANT_A] : []),
        ).rejects.toThrow();
        await client.query('ROLLBACK');
      }
    });
  });

  it('cannot be ACQUIRED by any ordinary identity — the reverse direction', async () => {
    // The escape tests above ask "what can the writer become". This asks the question that matters
    // just as much and is easier to forget: what can become the WRITER. A `SET ROLE` from the
    // application role would hand it INSERT on an immutable journal without passing through
    // schema validation — the same breach as granting `freightos_app` INSERT directly, reached
    // from the other side.
    for (const role of ['freightos_app', 'freightos_admin', 'freightos_control_plane']) {
      const client = db.connectAs(role);
      await client.connect();
      try {
        await client.query('BEGIN');
        await expect(
          client.query('SET LOCAL ROLE freightos_event_writer'),
          `${role} could SET ROLE to the writer`,
        ).rejects.toThrow(/permission denied|must be a member/i);
        await client.query('ROLLBACK');
      } finally {
        await client.end();
      }
    }

    // …and not by inheritance either, which `SET ROLE` alone would not have shown.
    await asAdmin(async (admin) => {
      const r = await admin.query<{ line: string }>(
        `SELECT format('%s usage=%s set=%s', rolname,
                       pg_has_role(rolname, 'freightos_event_writer', 'USAGE')::text,
                       pg_has_role(rolname, 'freightos_event_writer', 'SET')::text) AS line
           FROM pg_roles
          WHERE rolname IN ('freightos_app', 'freightos_admin', 'freightos_control_plane',
                            'freightos_admin_owner', 'freightos_audit_writer',
                            'freightos_binding_owner', 'freightos_hierarchy_owner',
                            'freightos_identity_guard', 'freightos_operator_registry_owner')
          ORDER BY 1`,
      );
      for (const line of r.rows.map((x) => x.line)) {
        expect(line, 'an ordinary identity can reach the journal writer').toMatch(
          /usage=false set=false$/,
        );
      }
    });
  });

  it('has exactly one membership edge, and it is administrative only', async () => {
    // NOT "no membership" — that would be false, and a comfortable falsehood about a role graph is
    // worse than an uncomfortable truth. PostgreSQL gives a CREATEROLE creator an implicit
    // membership over every role it creates, recorded with the bootstrap superuser as grantor.
    // It is what lets the revert drop the role. It is pinned here, in full, so it stays visible.
    const edges = await asAdmin(async (admin) =>
      (
        await admin.query<{ line: string }>(
          `SELECT format('grantor=%s member=%s role=%s admin=%s inherit=%s set=%s',
                         g.rolname, m.rolname, r.rolname,
                         am.admin_option::text, am.inherit_option::text, am.set_option::text) AS line
             FROM pg_auth_members am
             JOIN pg_roles m ON m.oid = am.member
             JOIN pg_roles r ON r.oid = am.roleid
             JOIN pg_roles g ON g.oid = am.grantor
            WHERE m.rolname = 'freightos_event_writer' OR r.rolname = 'freightos_event_writer'
            ORDER BY 1`,
        )
      ).rows.map((x) => x.line),
    );
    expect(edges).toEqual([
      'grantor=postgres member=freightos_migrator role=freightos_event_writer ' +
        'admin=true inherit=false set=false',
    ]);
    // Stated as its own assertions so a failure names the breach rather than a diff:
    // ADMIN is permitted — administering the writer is how it gets dropped.
    // INHERIT or SET is not — either would let the migrator BECOME it.
    expect(edges.every((e) => e.includes('inherit=false set=false'))).toBe(true);
    for (const forbidden of [
      'freightos_app',
      'freightos_admin',
      'freightos_control_plane',
      'freightos_admin_owner',
      'freightos_audit_writer',
    ]) {
      expect(edges.join(' '), `${forbidden} appears in the writer's role graph`).not.toContain(
        forbidden,
      );
    }
    // No operator edge: `op_*` logins are minted by other test files and are cluster-global.
    expect(edges.filter((e) => /member=op_|role=op_/.test(e))).toEqual([]);
  });
});

describe('journal RLS read matrix', () => {
  it('shows a tenant its own events and hides another tenant’s', async () => {
    const mine = await accept(draftFor({ organization_id: orgA }));
    const theirs = await accept(draftFor({ organization_id: orgB }));

    const seen = await withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), async (c) => {
      const own = await c.query(`SELECT event_id FROM network_events WHERE event_id = $1`, [
        mine.event_id,
      ]);
      const foreign = await c.query(`SELECT event_id FROM network_events WHERE event_id = $1`, [
        theirs.event_id,
      ]);
      return { own: own.rowCount, foreign: foreign.rowCount };
    });
    expect(seen.own).toBe(1);
    expect(seen.foreign).toBe(0);
  });

  it('does NOT treat a NULL-tenant external event as public', async () => {
    const external = await accept(draftFor({ organization_id: orgExternal }));

    // The external organization has no tenant, so the journal row has none either.
    for (const fixture of [() => fixtureA, () => fixtureB]) {
      const n = await withAuthenticatedTestPrincipal(db, fixtureOperator(fixture()), async (c) => {
        const r = await c.query(`SELECT event_id FROM network_events WHERE event_id = $1`, [
          external.event_id,
        ]);
        return r.rowCount;
      });
      expect(n, 'a NULL-tenant event was readable by an ordinary tenant').toBe(0);
    }

    // Control plane can see it — that is where externally asserted facts are administered.
    const client = db.connectAs('freightos_control_plane');
    await client.connect();
    try {
      const r = await client.query(`SELECT event_id FROM network_events WHERE event_id = $1`, [
        external.event_id,
      ]);
      expect(r.rowCount).toBe(1);
    } finally {
      await client.end();
    }
  });

  it('shows an unbound runtime session nothing at all', async () => {
    const app = db.connectAs('freightos_app');
    await app.connect();
    try {
      await app.query('BEGIN');
      const r = await app.query<{ n: string }>('SELECT count(*)::text AS n FROM network_events');
      await app.query('ROLLBACK');
      expect(r.rows[0]!.n).toBe('0');
    } finally {
      await app.end();
    }
  });

  it('is append-only for every reachable identity', async () => {
    const client = db.connectAs('postgres');
    await client.connect();
    try {
      // Superuser bypasses RLS and ACL, so the trigger is the only thing left — which is exactly
      // the layer being tested here.
      await expect(client.query(`UPDATE network_events SET classification = 'x'`)).rejects.toThrow(
        /append-only/i,
      );
      await expect(client.query('DELETE FROM network_events')).rejects.toThrow(/append-only/i);
      await expect(
        client.query(`UPDATE network_schema_versions SET status = 'deprecated'`),
      ).rejects.toThrow(/append-only/i);
    } finally {
      await client.end();
    }
  });

  it('refuses TRUNCATE from the TABLE OWNER — the hole an ACL cannot close', async () => {
    // THE OWNER IS THE CASE THAT MATTERS, and the one the other TRUNCATE assertion in this file
    // cannot reach. That one runs as `freightos_event_writer`, where the ACL refuses it — so it
    // proves the grant, not the guard.
    //
    // TRUNCATE rights come with OWNERSHIP and no REVOKE can take them away. Row-level triggers
    // never fire for TRUNCATE, and FORCE ROW LEVEL SECURITY does not apply to it — there is no
    // TRUNCATE policy type. `freightos_migrator` owns these tables because it runs the migrations,
    // so before the statement-level trigger existed the ordinary deployment credential could erase
    // the entire journal, and the whole correction lineage graph with it, in one statement.
    //
    // `audit_events` and `outbox_events` have refused this since 0003. ADR-N0008 requires
    // "UPDATE/DELETE/TRUNCATE rejected even for the owner" of all four artifacts; the journal was
    // the one that did not.
    const owner = db.connectAsMigrator();
    await owner.connect();
    try {
      // The precondition, so a passing test cannot mean "the migrator was not the owner anyway".
      const owns = await owner.query<{ line: string }>(
        `SELECT format('%s owner=%s', c.relname, pg_get_userbyid(c.relowner)) AS line
           FROM pg_class c
          WHERE c.relnamespace = 'public'::regnamespace
            AND c.relname IN ('network_events', 'network_schema_versions') ORDER BY 1`,
      );
      expect(owns.rows.map((x) => x.line)).toEqual([
        'network_events owner=freightos_migrator',
        'network_schema_versions owner=freightos_migrator',
      ]);

      for (const [statement, expected] of [
        ['TRUNCATE network_events', /append-only/i],
        // The projection alone is refused EARLIER, by the journal's inbound foreign key — PostgreSQL
        // checks that before firing triggers. Refused either way, but by a different guard, and
        // saying which one is the whole point of naming the expectation per statement.
        ['TRUNCATE network_schema_versions', /cannot truncate a table referenced/i],
        // Both together satisfies the foreign-key check — every referencing table is in the list —
        // so the trigger is the only thing left, and it is exactly the sequence that would
        // otherwise sidestep the FK guard.
        ['TRUNCATE network_events, network_schema_versions', /append-only/i],
      ] as const) {
        await owner.query('BEGIN');
        await expect(owner.query(statement), statement).rejects.toThrow(expected);
        await owner.query('ROLLBACK');
      }
    } finally {
      await owner.end();
    }
  });

  it('carries a statement-level TRUNCATE trigger on both tables — the structural gate', async () => {
    // What the behavioural test cannot see: a FOR EACH ROW trigger declared `BEFORE TRUNCATE` is
    // accepted by PostgreSQL and never fires. The bit test is what separates the two.
    const r = await asAdmin(async (admin) =>
      (
        await admin.query<{ line: string }>(
          `SELECT format('%s.%s rowlevel=%s', c.relname, t.tgname, ((t.tgtype & 1) <> 0)::text)
                  AS line
             FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
            WHERE NOT t.tgisinternal AND (t.tgtype & 32) <> 0
              AND c.relnamespace = 'public'::regnamespace
              AND c.relname IN ('network_events', 'network_schema_versions')
            ORDER BY 1`,
        )
      ).rows.map((x) => x.line),
    );
    expect(r).toEqual([
      'network_events.network_events_no_truncate rowlevel=false',
      'network_schema_versions.network_schema_versions_no_truncate rowlevel=false',
    ]);
  });
});

describe('the schema projection', () => {
  it('is exactly the canonical package registry, field for field', async () => {
    // THE PARITY GATE. The projection is derived; if it can drift it has become a second
    // governance source, which is the one thing it must never be.
    const client = db.connectAs('postgres');
    await client.connect();
    try {
      const r = await client.query<{ line: string }>(
        `SELECT format('%s|%s|%s|%s|%s|%s', durable_schema_ref, registry_schema_id, version,
                       artifact_class, content_hash, status) AS line
           FROM network_schema_versions ORDER BY 1`,
      );
      const expected = listRegisteredSchemas()
        .filter((s) => s.layer !== 'v1.2')
        .map(
          (s) =>
            `${s.durableRef}|${s.id}|${s.version}|${s.artifactClass}|${s.contentHash}|${s.status}`,
        )
        .sort();
      expect(r.rows.map((x) => x.line)).toEqual(expected);
      expect(expected.length).toBe(9);
    } finally {
      await client.end();
    }
  });

  it('is not writable by any runtime identity', async () => {
    const client = db.connectAs('postgres');
    await client.connect();
    try {
      const r = await client.query<{ line: string }>(
        `SELECT format('%s %s=%s', who, priv,
                       has_table_privilege(who, 'network_schema_versions', priv)::text) AS line
           FROM unnest(ARRAY['freightos_app', 'freightos_control_plane',
                             'freightos_event_writer']) AS who
           CROSS JOIN unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS priv ORDER BY 1`,
      );
      for (const line of r.rows.map((x) => x.line)) expect(line).toMatch(/=false$/);

      // …and the WRITER holds no privilege on it whatsoever, not even SELECT.
      //
      // The tempting assumption is that `network_events.schema_ref`'s foreign key needs one.
      // It does not: PostgreSQL enforces referential integrity through internal triggers running as
      // the REFERENCED table's owner. The next case proves the key still bites without it, so this
      // is a grant that would have bought nothing and widened the writer for no reason.
      const writer = await client.query<{ line: string }>(
        `SELECT format('%s=%s', priv,
                       has_table_privilege('freightos_event_writer', 'network_schema_versions',
                                           priv)::text) AS line
           FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES'])
                AS priv ORDER BY 1`,
      );
      for (const line of writer.rows.map((x) => x.line)) expect(line).toMatch(/=false$/);
    } finally {
      await client.end();
    }
  });

  it('still enforces schema_ref against a writer that cannot read the projection', async () => {
    // The other half of the grant removal above, and the reason it is safe. An unregistered durable
    // reference is refused by the acceptance component first — but the FOREIGN KEY is the guarantee
    // that survives a future writer which forgets to ask, so it is tested through the database.
    await asWriter(async (client) => {
      await client.query('BEGIN');
      await expect(
        client.query(
          `INSERT INTO network_events (
             event_id, type, source, subject, occurred_at, organization_id, classification,
             schema_ref, envelope_schema_ref, data, event_fingerprint, accepted_by
           ) VALUES ($1, $2, 'urn:test', '[{"network_id":"obj-00000001","object_type":"x"}]'::jsonb,
             now(), $3, 'internal',
             'https://schemas.rigreceipts.com/network/never-registered.v1.json',
             $4, '{}'::jsonb, repeat('a', 64), 'pending')`,
          [generateEventId(), EXAMPLE_TYPE, orgA, V1_4_NETWORK_EVENT_ENVELOPE_DURABLE_REF],
        ),
      ).rejects.toThrow(/foreign key constraint/i);
      await client.query('ROLLBACK');
    });
  });

  it('proves schema identity is governed — and does NOT claim payload conformance', async () => {
    // Stated as a test so the distinction cannot quietly be overstated in documentation later.
    const client = db.connectAs('postgres');
    await client.connect();
    try {
      const fk = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pg_constraint
          WHERE conrelid = 'network_events'::regclass AND contype = 'f'
            AND confrelid = 'network_schema_versions'::regclass`,
      );
      expect(fk.rows[0]!.n).toBe('2'); // schema_ref and envelope_schema_ref

      // The database cannot evaluate JSON Schema: no validation function exists anywhere.
      const validators = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname IN ('app', 'public') AND p.proname ILIKE '%json%schema%'`,
      );
      expect(validators.rows[0]!.n).toBe('0');
    } finally {
      await client.end();
    }
  });
});

describe('event content confers zero authority', () => {
  it('discriminates — the oracle can tell principals and tenants apart', async () => {
    // Anti-vacuity, first. Every equality assertion below is worthless without this.
    const a = await privilegesOf(fixtureA);
    const b = await privilegesOf(fixtureB);
    expect(a.permissions.filter((p) => p.endsWith('=true')).length).toBeGreaterThan(0);
    expect(a.permissions.filter((p) => p.endsWith('=false')).length).toBeGreaterThan(0);
    expect(a.visibility).not.toEqual(b.visibility);
    expect(a.context).not.toEqual(b.context);
    expect(a.roleGraph).toContain('freightos_event_writer usage=false member=false set=false');
    expect(
      a.roleGraph.filter((l) => l.startsWith('op_')),
      'an unrelated operator role entered the snapshot',
    ).toEqual([]);
  });

  it('grants nothing for hostile classifications, organizations, sources or subjects', async () => {
    const before = await privilegesOf(fixtureA);

    // Hostile INPUTS — not governed vocabulary, and nothing in the database may read them.
    for (const classification of ['admin', 'root', 'public', 'trusted', 'control_plane']) {
      await accept(draftFor({ classification }));
    }
    for (const source of [
      'urn:freightos:freightos_control_plane',
      'urn:freightos:postgres',
      adminOperatorRole,
    ]) {
      await accept(draftFor({ source }));
    }
    // A subject naming protected identities, and an organization named after a privileged role.
    await accept(
      draftFor({
        subject: [
          { network_id: fixtureA.adminUserId, object_type: 'example-only' },
          { network_id: TENANT_B, object_type: 'example-only' },
        ],
      }),
    );
    const impostor = await registerOrganization('freightos_control_plane', TENANT_A);
    await accept(draftFor({ organization_id: impostor }));

    const after = await privilegesOf(fixtureA);

    // Named privileges, stated individually.
    expect(after.context).toContain('is_control_plane=false');
    expect(after.permissions).toContain('identity.role.write=false');
    expect(after.permissions).toContain('identity.membership.write=false');
    expect(after.roleGraph).toContain('freightos_admin usage=false member=false set=false');
    expect(after.roleGraph).toContain('freightos_control_plane usage=false member=false set=false');
    expect(after.roleGraph).toContain('freightos_event_writer usage=false member=false set=false');

    // And nothing else moved. `visibility` excludes network tables, so the events themselves are
    // the mutation rather than its effect.
    expect(after.permissions).toEqual(before.permissions);
    expect(after.context).toEqual(before.context);
    expect(after.roleGraph).toEqual(before.roleGraph);
    expect(after.tablePrivileges).toEqual(before.tablePrivileges);
    expect(after.visibility).toEqual(before.visibility);
  });
});

describe('the structural authority gate', () => {
  let client: Client;

  beforeAll(async () => {
    client = db.connectAs('postgres');
    await client.connect();
  }, 60_000);

  afterAll(async () => {
    await client?.end();
  });

  it('has no authorization object anywhere that reads the journal or the projection', async () => {
    // Behavioural mutations sample; this reads the catalog. A future edit wiring an event into an
    // authorization path fails here even if no test happens to exercise that path.
    const policies = await client.query<{ line: string }>(
      `SELECT format('%s.%s %s', schemaname, tablename, policyname) AS line
         FROM pg_policies
        WHERE tablename NOT IN ('network_events', 'network_schema_versions')
          AND (coalesce(qual, '') ~ 'network_events|network_schema_versions'
            OR coalesce(with_check, '') ~ 'network_events|network_schema_versions')`,
    );
    expect(policies.rows.map((x) => x.line)).toEqual([]);

    const functions = await client.query<{ line: string }>(
      `SELECT format('%s.%s', n.nspname, p.proname) AS line
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('app', 'admin', 'authn')
          AND p.proname <> 'network_event_acceptance'
          AND p.prosrc ~ 'network_events|network_schema_versions'`,
    );
    expect(functions.rows.map((x) => x.line)).toEqual([]);

    // No foreign key from a security/authority table into the journal.
    const fks = await client.query<{ line: string }>(
      `SELECT format('%s -> %s', c.relname, ref.relname) AS line
         FROM pg_constraint con
         JOIN pg_class c ON c.oid = con.conrelid
         JOIN pg_class ref ON ref.oid = con.confrelid
        WHERE con.contype = 'f'
          AND ref.relname IN ('network_events', 'network_schema_versions')
          AND c.relname NOT LIKE 'network\\_%'`,
    );
    expect(fks.rows.map((x) => x.line)).toEqual([]);
  });

  it('adds no SECURITY DEFINER and no unexpected role', async () => {
    const definers = await client.query<{ line: string }>(
      `SELECT format('%s.%s', n.nspname, p.proname) AS line
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname LIKE 'network\\_event%' AND p.prosecdef`,
    );
    expect(definers.rows.map((x) => x.line)).toEqual([]);

    const roles = await client.query<{ rolname: string }>(
      `SELECT rolname FROM pg_roles WHERE rolname LIKE 'freightos%' ORDER BY 1`,
    );
    // Exactly one role is new relative to N2: the journal writer.
    expect(roles.rows.map((r) => r.rolname)).toContain('freightos_event_writer');
    expect(roles.rows.filter((r) => /event|journal|network/.test(r.rolname))).toHaveLength(1);
  });

  it('keeps classification out of every predicate in the database', async () => {
    const uses = await client.query<{ line: string }>(
      `SELECT format('policy %s.%s', tablename, policyname) AS line
         FROM pg_policies
        WHERE coalesce(qual, '') || coalesce(with_check, '') ~ 'classification'
       UNION ALL
       SELECT format('function %s.%s', n.nspname, p.proname)
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('app', 'admin', 'authn') AND p.prosrc ~ 'classification'`,
    );
    expect(uses.rows.map((x) => x.line)).toEqual([]);
  });

  it('leaves outbox_events and audit_events exactly as they were', async () => {
    // ADR-N0008: four artifacts, separately governed. N3 touches neither of the other two.
    //
    // Pinned by NAME, not by count. A count is satisfied by any add-plus-remove pair, and when it
    // does fail it says "20, expected 19" — which is not enough to act on. Names fail loudly and
    // name the thing that moved.
    const r = await client.query<{ line: string }>(
      `SELECT format('%s | cols %s | triggers %s | policies %s', c.relname,
                     (SELECT string_agg(a.attname, ',' ORDER BY a.attname) FROM pg_attribute a
                       WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped),
                     (SELECT coalesce(string_agg(t.tgname, ',' ORDER BY t.tgname), '') FROM pg_trigger t
                       WHERE t.tgrelid = c.oid AND NOT t.tgisinternal),
                     (SELECT coalesce(string_agg(p.polname, ',' ORDER BY p.polname), '') FROM pg_policy p
                       WHERE p.polrelid = c.oid)) AS line
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname IN ('audit_events', 'outbox_events') ORDER BY 1`,
    );
    expect(r.rows.map((x) => x.line)).toEqual([
      'audit_events | cols ' +
        'actor_id,actor_type,causation_id,correlation_id,created_at,created_by,event_type,id,' +
        'legal_authority_class,legal_entity_id,operating_context,operation_class,outcome,payload,' +
        'policy_version,purpose,resource_id,resource_type,tenant_id' +
        ' | triggers audit_events_no_delete,audit_events_no_truncate,audit_events_no_update' +
        ' | policies audit_events_isolation',
      'outbox_events | cols ' +
        'actor_id,attempts,causation_id,claim_expires_at,claimed_at,correlation_id,created_at,' +
        'created_by,event_id,event_source,event_subject,event_time,event_type,id,last_error,' +
        'legal_authority_class,legal_entity_id,operating_context,payload,published_at,purpose,' +
        'status,tenant_id' +
        ' | triggers outbox_events_immutable_envelope,outbox_events_no_truncate' +
        ' | policies outbox_events_isolation',
    ]);

    // And no journal column smuggled transport state in.
    const journalColumns = await client.query<{ line: string }>(
      `SELECT a.attname AS line FROM pg_attribute a
        WHERE a.attrelid = 'network_events'::regclass AND a.attnum > 0 AND NOT a.attisdropped`,
    );
    const names = journalColumns.rows.map((x) => x.line);
    for (const forbidden of [
      'status',
      'attempts',
      'claimed_at',
      'claim_expires_at',
      'published_at',
      'last_error',
    ]) {
      expect(names, `${forbidden} is delivery state and belongs in the outbox`).not.toContain(
        forbidden,
      );
    }
  });
});
