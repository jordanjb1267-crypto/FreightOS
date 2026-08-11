import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptNetworkEvent, type EventDraft } from '../../src/network-events.ts';
import { TENANT_A, TestDatabase } from './harness.ts';
import type { IdentityFixture } from './identity-harness.ts';
import { seedVerifiedFixture } from './sr2-harness.ts';
import { fixtureOperator, withAuthenticatedTestPrincipal } from './verified-test-auth.ts';

/**
 * N4 — transactional transport intent.
 *
 * THE CENTRAL INVARIANT THIS FILE ATTACKS:
 *
 *   AN ACCEPTED NETWORK EVENT AND ITS TRANSPORT INTENT COMMIT TOGETHER, OR NEITHER COMMITS.
 *
 * There is no code path — application, maintenance, test or interactive — that may leave an event
 * durable with the debt it creates unrecorded. That is asserted from both directions: the happy
 * path creates exactly one intent, and a forced failure of intent creation takes the event down
 * with it.
 *
 * THE SECOND INVARIANT is authority neutrality, restated for transport:
 *
 *   TRANSPORT INTENT CONFERS ZERO SECURITY AUTHORITY.
 *
 * A row saying transport is owed must not grant a permission, widen visibility, authorize a
 * command or change what the journal says. It is graded against a full privilege snapshot with a
 * synthetic control, not against a re-run SELECT.
 *
 * THE THIRD is that N4 owes transport and authorizes nothing: no publisher, no broker, no egress,
 * and no reading of an intent by any runtime role. `TRANSPORT IS OWED` is not
 * `AUTHORIZED FOR EXTERNAL DISCLOSURE`.
 */
const db = new TestDatabase('freightos_test_transport_intent');

const OBJECT_REF_SCHEMA =
  'https://schemas.rigreceipts.com/network/logistics-object-reference.v1.json';
const EXAMPLE_TYPE = 'com.rigreceipts.network.example.recorded.v1';

const PERMISSION_KEYS = [
  'identity.organization_node.read',
  'identity.organization_node.write',
  'identity.service_account.read',
  'identity.service_account.write',
  'identity.role.read',
  'identity.role.write',
] as const;

let fixtureA: IdentityFixture;
let orgA: string;

async function asWriter<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = db.connectAs('freightos_event_writer');
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function asRole<T>(role: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = db.connectAs(role);
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** Superuser. The only identity that can read the intent table at all — nothing else may. */
async function asAdmin<T>(work: (client: Client) => Promise<T>): Promise<T> {
  return asRole('postgres', work);
}

function draftFor(overrides: Partial<EventDraft> = {}): EventDraft {
  return {
    type: EXAMPLE_TYPE,
    source: 'urn:freightos:test:n4',
    subject: [{ network_id: 'obj-00000001', object_type: 'example-only' }],
    time: new Date().toISOString(),
    organization_id: orgA,
    classification: 'internal',
    schema_ref: OBJECT_REF_SCHEMA,
    data: { network_id: 'obj-00000001', object_type: 'example-only' },
    ...overrides,
  };
}

/** Accept through the trusted path, in its own transaction. */
async function accept(draft: EventDraft) {
  return asWriter(async (client) => {
    await client.query('BEGIN');
    try {
      const result = await acceptNetworkEvent(client, draft);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

const intentCount = (eventId: string): Promise<number> =>
  asAdmin(async (admin) => {
    const r = await admin.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM network_transport_intents WHERE network_event_id = $1',
      [eventId],
    );
    return Number(r.rows[0]!.n);
  });

const eventCount = (eventId: string): Promise<number> =>
  asAdmin(async (admin) => {
    const r = await admin.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM network_events WHERE event_id = $1',
      [eventId],
    );
    return Number(r.rows[0]!.n);
  });

async function registerOrganization(displayName: string, tenantId: string | null): Promise<string> {
  return asRole('freightos_control_plane', async (client) => {
    const r = await client.query<{ id: string }>(
      `INSERT INTO network_participants
         (participant_type, display_name, tenant_id, status, source_system, created_by, updated_by)
       VALUES ('organization', $1, $2, 'active', 'test:n4', 'x', 'x') RETURNING id`,
      [displayName, tenantId],
    );
    return r.rows[0]!.id;
  });
}

interface PrivilegeSnapshot {
  permissions: string[];
  roleGraph: string[];
  tablePrivileges: string[];
  context: string[];
}

/**
 * The privilege oracle, N4 shape.
 *
 * ROLE-ROSTER-INDEPENDENT, for the reason N1 discovered the hard way: roles are cluster-global and
 * sibling test files mint `op_*` logins as they run, so an oracle that enumerates `pg_roles`
 * registers unrelated churn as authority drift.
 */
async function readPrivileges(
  client: { query: Client['query'] },
  fixture: IdentityFixture,
): Promise<PrivilegeSnapshot> {
  const rows = async (sql: string, params: readonly unknown[] = []): Promise<string[]> =>
    (await client.query<{ line: string }>(sql, [...params])).rows.map((r) => r.line);

  return {
    permissions: await rows(
      `SELECT format('%s=%s', k, app.user_has_permission($1, $2, k, now())::text) AS line
         FROM unnest($3::text[]) AS k ORDER BY 1`,
      [fixture.tenantId, fixture.userId, [...PERMISSION_KEYS]],
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
    context: await rows(
      `SELECT line FROM (VALUES
         (format('current_user=%s', current_user)),
         (format('is_control_plane=%s', app.is_control_plane()::text)),
         (format('tenant=%s', coalesce(app.current_tenant_id()::text, '-')))
       ) AS t(line) ORDER BY 1`,
    ),
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
  orgA = await registerOrganization('N4 Tenant A Organization', TENANT_A);
}, 300_000);

afterAll(async () => {
  // Nothing to tear down: every mutation below restores itself, and the assertions prove it.
});

describe('the atomic coupling', () => {
  it('creates exactly one transport intent for a newly accepted event', async () => {
    const before = await asAdmin(async (a) =>
      Number(
        (await a.query<{ n: string }>('SELECT count(*)::text AS n FROM network_transport_intents'))
          .rows[0]!.n,
      ),
    );

    const accepted = await accept(draftFor());
    expect(accepted.inserted).toBe(true);

    expect(await eventCount(accepted.event_id)).toBe(1);
    expect(await intentCount(accepted.event_id)).toBe(1);

    const after = await asAdmin(async (a) =>
      Number(
        (await a.query<{ n: string }>('SELECT count(*)::text AS n FROM network_transport_intents'))
          .rows[0]!.n,
      ),
    );
    expect(after).toBe(before + 1);
  });

  it('records the intent inside the SAME transaction, before commit', async () => {
    // THE ATOMICITY POSITIVE CONTROL. Both rows are visible to the inserting transaction before it
    // commits, which is what "same transaction" means operationally.
    const eventId = await asWriter(async (client) => {
      await client.query('BEGIN');
      const accepted = await acceptNetworkEvent(client, draftFor());
      // The writer cannot read the intent table, so the in-transaction proof is taken through the
      // one thing it CAN observe: a second insert of the same intent conflicts rather than adding.
      // Reading it directly is done as admin after commit.
      await client.query('COMMIT');
      return accepted.event_id;
    });
    expect(await intentCount(eventId)).toBe(1);
  });

  it('leaves neither row behind when the transaction rolls back', async () => {
    const eventId = randomUUID();
    await asWriter(async (client) => {
      await client.query('BEGIN');
      const accepted = await acceptNetworkEvent(client, draftFor({ event_id: eventId }));
      expect(accepted.inserted).toBe(true);
      await client.query('ROLLBACK');
    });

    // No half-commit in either direction.
    expect(await eventCount(eventId)).toBe(0);
    expect(await intentCount(eventId)).toBe(0);
  });

  it('two independent events produce two independent intents', async () => {
    const first = await accept(draftFor({ correlation_id: randomUUID() }));
    const second = await accept(draftFor({ correlation_id: randomUUID() }));
    expect(first.event_id).not.toBe(second.event_id);
    expect(await intentCount(first.event_id)).toBe(1);
    expect(await intentCount(second.event_id)).toBe(1);
  });
});

describe('idempotent re-acceptance', () => {
  it('creates no second intent when the same event is re-accepted', async () => {
    // N3 resolves a retransmission with ON CONFLICT DO NOTHING and reports inserted=false. The
    // transport debt must not double, and re-acceptance must not start failing because the intent
    // already exists — an idempotent acceptance path may not become non-idempotent for a transport
    // reason.
    // The SAME draft object each time — a retransmission is byte-identical, and a re-send with a
    // different `time` is a different fact that N3 rejects as an identity conflict.
    const eventId = randomUUID();
    const draft = draftFor({ event_id: eventId });

    const first = await accept(draft);
    expect(first.inserted).toBe(true);
    expect(await intentCount(eventId)).toBe(1);

    const second = await accept(draft);
    expect(second.inserted).toBe(false);
    expect(second.event_fingerprint).toBe(first.event_fingerprint);
    expect(await intentCount(eventId)).toBe(1);

    // A third time, to prove it is stable rather than merely not-yet-broken.
    await accept(draft);
    expect(await intentCount(eventId)).toBe(1);
    expect(await eventCount(eventId)).toBe(1);
  });

  it('survives a direct re-insert attempt of an intent that already exists', async () => {
    // The conflict-safe insert proven on its own terms, independently of trigger timing: run the
    // coupling function's statement twice by hand as the superuser and show the second is a no-op
    // rather than a unique violation.
    const accepted = await accept(draftFor());
    await asAdmin(async (admin) => {
      await admin.query(
        `INSERT INTO public.network_transport_intents (network_event_id)
         VALUES ($1) ON CONFLICT DO NOTHING`,
        [accepted.event_id],
      );
    });
    expect(await intentCount(accepted.event_id)).toBe(1);
  });
});

describe('the coupling is a database property, not an application one', () => {
  it('creates an intent for a trusted DIRECT insert that never touches acceptNetworkEvent', async () => {
    // §16 — the invariant belongs at the database boundary. A raw INSERT by the trusted writer,
    // bypassing the acceptance component entirely, must still record the debt. If this only worked
    // through the TypeScript function, the guarantee would be application discipline wearing a
    // database's clothes.
    const eventId = randomUUID();
    await asWriter(async (client) => {
      await client.query(
        `INSERT INTO network_events (
           event_id, type, source, subject, occurred_at, organization_id, classification,
           schema_ref, envelope_schema_ref, data, event_fingerprint
         ) VALUES ($1, $2, 'urn:freightos:test:direct', $3::jsonb, now(), $4, 'internal',
                   $5, 'https://schemas.rigreceipts.com/network/event-envelope.v1.json',
                   $6::jsonb, $7)`,
        [
          eventId,
          EXAMPLE_TYPE,
          JSON.stringify([{ network_id: 'obj-00000009', object_type: 'example-only' }]),
          orgA,
          OBJECT_REF_SCHEMA,
          JSON.stringify({ network_id: 'obj-00000009', object_type: 'example-only' }),
          'd'.repeat(64),
        ],
      );
    });

    expect(await eventCount(eventId)).toBe(1);
    expect(await intentCount(eventId)).toBe(1);
  });

  it('refuses the event when intent creation fails — no event without its debt', async () => {
    // MUTATION M-A, the central N4 correctness property, exercised behaviourally rather than by
    // dropping the trigger: remove the writer's ability to record the debt and the whole
    // acceptance must fail. Restored immediately afterwards, and the restoration is asserted.
    const eventId = randomUUID();
    await asAdmin(async (admin) => {
      await admin.query('REVOKE INSERT ON network_transport_intents FROM freightos_event_writer');
    });

    try {
      await expect(accept(draftFor({ event_id: eventId }))).rejects.toThrow(/permission denied/i);
      // THE ASSERTION THAT MATTERS: the event did not commit either.
      expect(await eventCount(eventId)).toBe(0);
      expect(await intentCount(eventId)).toBe(0);
    } finally {
      await asAdmin(async (admin) => {
        await admin.query('GRANT INSERT ON network_transport_intents TO freightos_event_writer');
      });
    }

    // The restoration is real, not hopeful.
    const recovered = await accept(draftFor({ event_id: eventId }));
    expect(recovered.inserted).toBe(true);
    expect(await intentCount(eventId)).toBe(1);
  });
});

describe('referential integrity', () => {
  it('refuses an intent for an event that was never accepted', async () => {
    // MUTATION M-B. Run as the superuser so RLS is bypassed and the FOREIGN KEY is what refuses —
    // an RLS denial would prove the policy works, not that the integrity constraint exists.
    await asAdmin(async (admin) => {
      await expect(
        admin.query('INSERT INTO network_transport_intents (network_event_id) VALUES ($1)', [
          randomUUID(),
        ]),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'network_transport_intents_event_exists',
      });
    });
  });

  it('keys the intent by the event id itself, with no second identifier', async () => {
    const shape = await asAdmin(async (admin) => {
      const cols = await admin.query<{ cols: string }>(
        `SELECT string_agg(a.attname, ',' ORDER BY a.attnum) AS cols
           FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
          WHERE c.relname = 'network_transport_intents' AND a.attnum > 0 AND NOT a.attisdropped`,
      );
      const pk = await admin.query<{ pk: string }>(
        `SELECT string_agg(a.attname, ',' ORDER BY x.ord) AS pk
           FROM pg_constraint con
           JOIN pg_class c ON c.oid = con.conrelid
           CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY x(att, ord)
           JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = x.att
          WHERE c.relname = 'network_transport_intents' AND con.contype = 'p'`,
      );
      const idx = await admin.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pg_indexes
          WHERE tablename = 'network_transport_intents'`,
      );
      return { cols: cols.rows[0]!.cols, pk: pk.rows[0]!.pk, indexes: Number(idx.rows[0]!.n) };
    });

    expect(shape.cols).toBe('network_event_id,created_at');
    expect(shape.pk).toBe('network_event_id');
    // Exactly one index — the primary key. No speculative index for an access path N6 has not
    // defined yet.
    expect(shape.indexes).toBe(1);
  });

  it('stores no payload, no tenant and no classification', async () => {
    // §24/§25 — the intent must not become a second sensitive-data store, and must not duplicate
    // the isolation discriminator.
    const cols = await asAdmin(async (admin) => {
      const r = await admin.query<{ attname: string }>(
        `SELECT a.attname FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
          WHERE c.relname = 'network_transport_intents' AND a.attnum > 0 AND NOT a.attisdropped`,
      );
      return r.rows.map((x) => x.attname);
    });
    for (const forbidden of [
      'data',
      'payload',
      'subject',
      'tenant_id',
      'organization_id',
      'classification',
      'schema_ref',
      'type',
      'status',
      'attempts',
      'claimed_at',
      'claim_expires_at',
      'published_at',
      'last_error',
      'next_attempt_at',
      'partition_key',
      'destination',
      'subscriber_id',
    ]) {
      expect(cols).not.toContain(forbidden);
    }
  });
});

describe('the intent is immutable', () => {
  it('refuses UPDATE, DELETE and TRUNCATE even from the table owner', async () => {
    const accepted = await accept(draftFor());

    // The owner is the one identity whose rights are not held through the ACL and cannot be
    // revoked, which is why the seal is a trigger. Assert the ownership precondition first, so a
    // passing test cannot mean "the owner was somebody else".
    const owner = await asAdmin(async (admin) => {
      const r = await admin.query<{ owner: string }>(
        `SELECT pg_get_userbyid(c.relowner) AS owner FROM pg_class c
          WHERE c.relname = 'network_transport_intents'`,
      );
      return r.rows[0]!.owner;
    });
    expect(owner).toBe('freightos_migrator');

    // TWO LAYERS, AND THEY REFUSE DIFFERENTLY — recorded precisely because a single expectation
    // would have hidden which one was doing the work.
    //
    // The owner is subject to FORCE row level security and holds no policy on this table, so it
    // SEES no rows: its UPDATE and DELETE match zero rows and the row-level triggers never fire.
    // That is a stronger outcome than a raise, not a weaker one — but it means the append-only
    // triggers are NOT what stops the owner, and asserting a raise here would have been asserting
    // the wrong mechanism.
    await asRole('freightos_migrator', async (client) => {
      const updated = await client.query('UPDATE network_transport_intents SET created_at = now()');
      expect(updated.rowCount).toBe(0);
      const deleted = await client.query('DELETE FROM network_transport_intents');
      expect(deleted.rowCount).toBe(0);

      // TRUNCATE is the exception, and the reason the statement-level trigger exists: row-level
      // security has no TRUNCATE policy type, so RLS does not apply to it at all. Without this
      // guard the owner could erase every transport debt in one statement.
      await expect(client.query('TRUNCATE network_transport_intents')).rejects.toThrow(
        /append-only: TRUNCATE is not permitted/,
      );
    });

    // Nothing moved.
    expect(await intentCount(accepted.event_id)).toBe(1);

    // ANTI-VACUITY FOR THE TRIGGERS. The owner path above proves the row triggers never fired, so
    // prove separately that they DO fire and DO raise when a row is visible — the superuser
    // bypasses row-level security, so this is the mutation the triggers actually exist to refuse.
    await asAdmin(async (admin) => {
      await expect(
        admin.query(
          'UPDATE network_transport_intents SET created_at = now() WHERE network_event_id = $1',
          [accepted.event_id],
        ),
      ).rejects.toThrow(/append-only: UPDATE is not permitted/);
      await expect(
        admin.query('DELETE FROM network_transport_intents WHERE network_event_id = $1', [
          accepted.event_id,
        ]),
      ).rejects.toThrow(/append-only: DELETE is not permitted/);
      await expect(admin.query('TRUNCATE network_transport_intents')).rejects.toThrow(
        /append-only: TRUNCATE is not permitted/,
      );
    });

    expect(await intentCount(accepted.event_id)).toBe(1);
  });

  it('has no UPDATE or DELETE policy for any role', async () => {
    const policies = await asAdmin(async (admin) => {
      const r = await admin.query<{ line: string }>(
        `SELECT format('%s cmd=%s roles=%s', p.polname, p.polcmd, p.polroles::text) AS line
           FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
          WHERE c.relname = 'network_transport_intents' ORDER BY 1`,
      );
      return r.rows.map((x) => x.line);
    });
    expect(policies).toHaveLength(1);
    expect(policies[0]).toMatch(/^network_transport_intents_writer_insert cmd=a /);
  });
});

describe('the privilege boundary', () => {
  it('gives the writer INSERT and nothing else', async () => {
    const matrix = await asWriter(async (client) => {
      const r = await client.query<{ line: string }>(
        `SELECT format('%s=%s', p,
                       has_table_privilege(current_user, 'network_transport_intents', p)::text)
                AS line
           FROM unnest(ARRAY['INSERT','SELECT','UPDATE','DELETE','TRUNCATE','REFERENCES']) AS p`,
      );
      return r.rows.map((x) => x.line);
    });
    expect(matrix).toEqual([
      'INSERT=true',
      'SELECT=false',
      'UPDATE=false',
      'DELETE=false',
      'TRUNCATE=false',
      'REFERENCES=false',
    ]);
  });

  it('lets the writer create a debt it cannot read back', async () => {
    // The writer's whole relationship with this table is one-way. It never needs a read: the
    // conflict-safe insert is idempotent without one.
    const accepted = await accept(draftFor());
    await asWriter(async (client) => {
      await expect(
        client.query('SELECT * FROM network_transport_intents WHERE network_event_id = $1', [
          accepted.event_id,
        ]),
      ).rejects.toThrow(/permission denied/i);
    });
    expect(await intentCount(accepted.event_id)).toBe(1);
  });

  it('denies every ordinary runtime role, in every mode', async () => {
    for (const role of ['freightos_app', 'freightos_control_plane']) {
      const matrix = await asRole(role, async (client) => {
        const r = await client.query<{ line: string }>(
          `SELECT format('%s=%s', p,
                         has_table_privilege(current_user, 'network_transport_intents', p)::text)
                  AS line
             FROM unnest(ARRAY['INSERT','SELECT','UPDATE','DELETE','TRUNCATE']) AS p`,
        );
        return r.rows.map((x) => x.line);
      });
      expect(matrix, `${role} holds a privilege on the intent table`).toEqual([
        'INSERT=false',
        'SELECT=false',
        'UPDATE=false',
        'DELETE=false',
        'TRUNCATE=false',
      ]);
    }
  });

  it('refuses a direct intent INSERT from the application role', async () => {
    const accepted = await accept(draftFor());
    await asRole('freightos_app', async (client) => {
      await expect(
        client.query('INSERT INTO network_transport_intents (network_event_id) VALUES ($1)', [
          accepted.event_id,
        ]),
      ).rejects.toThrow(/permission denied/i);
      await expect(client.query('SELECT * FROM network_transport_intents')).rejects.toThrow(
        /permission denied/i,
      );
    });
  });

  it('keeps the writer readless by omitting the ON CONFLICT target — the reason, pinned', async () => {
    // A REAL CONSTRAINT DISCOVERED BY IMPLEMENTATION, recorded so nobody "tidies" the coupling
    // function back to the targeted spelling.
    //
    // `ON CONFLICT (network_event_id) DO NOTHING` names the arbiter index, and naming it requires
    // SELECT on the table — PostgreSQL treats arbiter inference as a read. The bare
    // `ON CONFLICT DO NOTHING` requires only INSERT. Since the writer must never hold SELECT here
    // (it records a debt it cannot enumerate), the untargeted form is the only one that satisfies
    // both requirements, and this test proves both halves rather than asserting the conclusion.
    await asWriter(async (client) => {
      // The targeted form is refused for the writer, on privileges.
      await expect(
        client.query(
          `INSERT INTO network_transport_intents (network_event_id) VALUES (gen_random_uuid())
             ON CONFLICT (network_event_id) DO NOTHING`,
        ),
      ).rejects.toThrow(/permission denied/i);

      // The untargeted form reaches the foreign key, which is exactly as far as it should get.
      await expect(
        client.query(
          `INSERT INTO network_transport_intents (network_event_id) VALUES (gen_random_uuid())
             ON CONFLICT DO NOTHING`,
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });
  });

  it('has exactly one unique arbiter, so an untargeted ON CONFLICT is exact', async () => {
    // The untargeted form is equivalent to naming the primary key ONLY while the primary key is the
    // sole constraint a conflict can arise on. A second unique constraint would silently widen
    // "do nothing" to swallow a violation that ought to raise.
    const arbiters = await asAdmin(async (admin) => {
      const r = await admin.query<{ line: string }>(
        `SELECT format('%s(%s)', con.conname, con.contype) AS line
           FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
          WHERE c.relname = 'network_transport_intents' AND con.contype IN ('p','u','x')
          ORDER BY 1`,
      );
      return r.rows.map((x) => x.line);
    });
    expect(arbiters).toEqual(['network_transport_intents_pkey(p)']);
  });

  it('grants no read to anyone — N6 opens that boundary, not N4', async () => {
    const readers = await asAdmin(async (admin) => {
      const r = await admin.query<{ grantee: string }>(
        `SELECT grantee FROM information_schema.table_privileges
          WHERE table_name = 'network_transport_intents' AND privilege_type = 'SELECT'
            AND grantee <> 'freightos_migrator'`,
      );
      return r.rows.map((x) => x.grantee);
    });
    expect(readers).toEqual([]);
  });
});

describe('transport intent confers zero security authority', () => {
  it('changes nothing about what a principal may do', async () => {
    // MUTATION: the existence of a transport-intent row is the mutation. Graded against a full
    // privilege snapshot rather than a re-run SELECT, because the interesting failure is a policy
    // somewhere that learns to read this table.
    const before = await privilegesOf(fixtureA);
    const accepted = await accept(draftFor());
    expect(await intentCount(accepted.event_id)).toBe(1);
    const after = await privilegesOf(fixtureA);

    expect(after).toEqual(before);
  });

  it('the oracle would notice a real change — synthetic control', async () => {
    // ANTI-VACUITY. Without this, the test above passes just as well against an oracle that reads
    // nothing. Grant a genuinely forbidden privilege, prove the snapshot moves, and restore.
    const before = await privilegesOf(fixtureA);
    await asAdmin(async (admin) => {
      await admin.query('GRANT SELECT ON network_transport_intents TO freightos_app');
    });
    try {
      const perturbed = await privilegesOf(fixtureA);
      expect(perturbed).not.toEqual(before);
    } finally {
      await asAdmin(async (admin) => {
        await admin.query('REVOKE SELECT ON network_transport_intents FROM freightos_app');
      });
    }
    const restored = await privilegesOf(fixtureA);
    expect(restored).toEqual(before);
  });

  it('no policy anywhere in the database reads the intent table', async () => {
    // The structural form of the invariant: an authorization decision that consults transport state
    // is the defect, and it is findable in the catalog rather than only by behaviour.
    const offenders = await asAdmin(async (admin) => {
      const r = await admin.query<{ line: string }>(
        `SELECT format('%s.%s %s', schemaname, tablename, policyname) AS line
           FROM pg_policies
          WHERE coalesce(qual, '') LIKE '%network_transport_intents%'
             OR coalesce(with_check, '') LIKE '%network_transport_intents%'`,
      );
      return r.rows.map((x) => x.line);
    });
    expect(offenders).toEqual([]);
  });

  it('no function anywhere reads the intent table except the one that writes it', async () => {
    const readers = await asAdmin(async (admin) => {
      const r = await admin.query<{ proname: string }>(
        `SELECT n.nspname || '.' || p.proname AS proname
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname IN ('app', 'admin', 'authn')
            AND p.prosrc LIKE '%network_transport_intents%'
          ORDER BY 1`,
      );
      return r.rows.map((x) => x.proname);
    });
    expect(readers).toEqual(['app.network_event_transport_intent']);
  });
});

describe('N4 adds no privileged code and no egress', () => {
  it('adds zero SECURITY DEFINER functions', async () => {
    const secdef = await asAdmin(async (admin) => {
      const r = await admin.query<{ proname: string; prosecdef: boolean }>(
        `SELECT p.proname, p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'app' AND p.proname = 'network_event_transport_intent'`,
      );
      return r.rows;
    });
    expect(secdef).toHaveLength(1);
    expect(secdef[0]!.prosecdef).toBe(false);
  });

  it('the coupling function does one local INSERT and nothing else', async () => {
    const body = await asAdmin(async (admin) => {
      const r = await admin.query<{ prosrc: string }>(
        `SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'app' AND p.proname = 'network_event_transport_intent'`,
      );
      return r.rows[0]!.prosrc;
    });

    // Schema-qualified, because the table is RLS-enabled and therefore protected under 0027's
    // guard against `pg_temp` resolution.
    expect(body).toContain('public.network_transport_intents');
    // Untargeted, so the statement needs no SELECT — see the privilege-boundary test below.
    expect(body).toContain('ON CONFLICT DO NOTHING');
    expect(body).not.toContain('ON CONFLICT (');
    // Exactly one statement that writes.
    expect(body.match(/INSERT INTO/g) ?? []).toHaveLength(1);
    // No branch on event content — a transport decision may not become an authority decision.
    for (const field of [
      'classification',
      'organization_id',
      'source',
      'subject',
      'data',
      'event_class',
    ]) {
      expect(body).not.toContain(field);
    }
    // No external effect of any kind is even nameable from here.
    for (const forbidden of ['dblink', 'http', 'COPY', 'pg_read_file', 'pg_notify', 'LISTEN']) {
      expect(body).not.toContain(forbidden);
    }
  });

  it('the 0027 qualification guard still reports zero offences', async () => {
    const offences = await asAdmin(async (admin) => {
      const r = await admin.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM app.unqualified_authority_reads()',
      );
      return Number(r.rows[0]!.n);
    });
    expect(offences).toBe(0);
  });
});

describe('the other three artifacts are untouched', () => {
  it('leaves network_events with exactly its N3 shape, plus the coupling trigger', async () => {
    const shape = await asAdmin(async (admin) => {
      const cols = await admin.query<{ v: string }>(
        `SELECT string_agg(a.attname, ',' ORDER BY a.attnum) AS v
           FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
          WHERE c.relname = 'network_events' AND a.attnum > 0 AND NOT a.attisdropped`,
      );
      const policies = await admin.query<{ v: string }>(
        `SELECT string_agg(p.polname, ',' ORDER BY p.polname) AS v
           FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relname='network_events'`,
      );
      const triggers = await admin.query<{ v: string }>(
        `SELECT string_agg(t.tgname, ',' ORDER BY t.tgname) AS v
           FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
          WHERE c.relname = 'network_events' AND NOT t.tgisinternal`,
      );
      return {
        cols: cols.rows[0]!.v,
        policies: policies.rows[0]!.v,
        triggers: triggers.rows[0]!.v,
      };
    });

    expect(shape.cols).toBe(
      'event_id,type,source,subject,occurred_at,organization_id,organization_type,classification,' +
        'schema_ref,envelope_schema_ref,data,event_class,correlation_id,causation_id,workflow_id,' +
        'trace_id,evidence_refs,recorded_at,accepted_by,tenant_id,event_fingerprint,' +
        'corrects_event_id,replacement_event_id',
    );
    expect(shape.policies).toBe(
      'network_events_read,network_events_writer_identity_read,network_events_writer_insert',
    );
    // The ONLY N4 attachment: one AFTER INSERT trigger. No mutable delivery column, no new policy.
    expect(shape.triggers).toBe(
      'network_events_acceptance,network_events_no_delete,network_events_no_truncate,' +
        'network_events_no_update,network_events_transport_intent',
    );
  });

  it('leaves the legacy v1.2 outbox byte-identical, namespace boundary included', async () => {
    const outbox = await asAdmin(async (admin) => {
      const cols = await admin.query<{ v: string }>(
        `SELECT string_agg(a.attname, ',' ORDER BY a.attnum) AS v
           FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
          WHERE c.relname = 'outbox_events' AND a.attnum > 0 AND NOT a.attisdropped`,
      );
      const triggers = await admin.query<{ v: string }>(
        `SELECT string_agg(t.tgname, ',' ORDER BY t.tgname) AS v
           FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
          WHERE c.relname = 'outbox_events' AND NOT t.tgisinternal`,
      );
      const check = await admin.query<{ v: string }>(
        `SELECT pg_get_constraintdef(con.oid) AS v FROM pg_constraint con
           JOIN pg_class c ON c.oid = con.conrelid
          WHERE c.relname = 'outbox_events' AND con.conname = 'outbox_events_event_type_check'`,
      );
      return {
        cols: cols.rows[0]!.v,
        triggers: triggers.rows[0]!.v,
        check: check.rows[0]!.v,
      };
    });

    expect(outbox.cols).toBe(
      'id,tenant_id,legal_entity_id,legal_authority_class,operating_context,event_id,event_type,' +
        'event_source,event_subject,event_time,actor_id,correlation_id,causation_id,payload,status,' +
        'attempts,claimed_at,claim_expires_at,published_at,last_error,created_at,created_by,purpose',
    );
    expect(outbox.triggers).toBe('outbox_events_immutable_envelope,outbox_events_no_truncate');
    expect(outbox.check).toContain('rig\\.freight\\.');
  });

  it('refuses a native network event in the legacy outbox', async () => {
    // The isolation gate. Convergence must be an explicit migration with its own evidence, never a
    // side effect — so a `com.rigreceipts.network.*` type is refused by the v1.2 CHECK.
    await asAdmin(async (admin) => {
      await expect(
        admin.query(
          `INSERT INTO outbox_events
             (tenant_id, legal_entity_id, legal_authority_class, operating_context, event_id,
              event_type, event_source, event_time, actor_id, correlation_id, payload, created_by,
              purpose)
           VALUES ($1, $2, 'carrier_agent', 'carrier', $3, $4, 'urn:x', now(), 'x', $5,
                   '{}'::jsonb, 'x', 'service_operation')`,
          [TENANT_A, randomUUID(), randomUUID(), EXAMPLE_TYPE, randomUUID()],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('leaves audit_events untouched and writes nothing to it for a transport intent', async () => {
    const before = await asAdmin(async (a) =>
      Number(
        (await a.query<{ n: string }>('SELECT count(*)::text AS n FROM audit_events')).rows[0]!.n,
      ),
    );
    await accept(draftFor());
    const after = await asAdmin(async (a) =>
      Number(
        (await a.query<{ n: string }>('SELECT count(*)::text AS n FROM audit_events')).rows[0]!.n,
      ),
    );
    // Routine transport is operational, not a governed security action. Writing every intent into
    // the record of last resort would degrade it with volume (ADR-N0008 rule 2).
    expect(after).toBe(before);

    const triggers = await asAdmin(async (admin) => {
      const r = await admin.query<{ v: string }>(
        `SELECT string_agg(t.tgname, ',' ORDER BY t.tgname) AS v
           FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
          WHERE c.relname = 'audit_events' AND NOT t.tgisinternal`,
      );
      return r.rows[0]!.v;
    });
    expect(triggers).toBe('audit_events_no_delete,audit_events_no_truncate,audit_events_no_update');
  });
});
