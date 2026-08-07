import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withLegalContext } from '../../src/session.ts';
import { LEGAL_ENTITY, TENANT_A, TENANT_B, TestDatabase, carrierContext } from './harness.ts';

async function insertAudit(client: Client, overrides: Record<string, unknown> = {}) {
  const row = {
    tenant_id: TENANT_A,
    legal_entity_id: LEGAL_ENTITY,
    legal_authority_class: 'carrier_agent',
    operating_context: 'carrier',
    actor_type: 'human',
    actor_id: 'test:actor',
    event_type: 'rig.freight.shipment.created.v1',
    resource_type: 'shipment',
    resource_id: randomUUID(),
    correlation_id: randomUUID(),
    payload: {},
    created_by: 'test:actor',
    ...overrides,
  };
  return client.query(
    `INSERT INTO audit_events (
       tenant_id, legal_entity_id, legal_authority_class, operating_context,
       actor_type, actor_id, event_type, resource_type, resource_id,
       correlation_id, payload, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [
      row.tenant_id,
      row.legal_entity_id,
      row.legal_authority_class,
      row.operating_context,
      row.actor_type,
      row.actor_id,
      row.event_type,
      row.resource_type,
      row.resource_id,
      row.correlation_id,
      row.payload,
      row.created_by,
    ],
  );
}

// One reset per file, before any client connects. Resetting inside each describe would drop the
// schema while the previous block's connection still held locks on it.
const db = new TestDatabase('freightos_test_ledger');
let app: Client;
/**
 * The table owner.
 *
 * 0018 §1 revoked INSERT on audit_events from both runtime roles, so a direct compose is no longer
 * something the application can do — that is the point of the fix. The CHECK constraints below are
 * table constraints rather than policies, so exercising them needs a connection that can still
 * insert directly. That is the owner, and the tests say so explicitly rather than quietly widening
 * the runtime role to keep an old assertion working.
 */
let owner: Client;

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  app = db.connectAs('freightos_app');
  await app.connect();
  owner = db.connectAs('postgres');
  await owner.connect();
}, 60_000);

afterAll(async () => {
  await app?.end();
  await owner?.end();
});

describe('append-only audit ledger', () => {
  it('accepts an append through the governed write path — 0018 §1', async () => {
    // A recognised principal form. 0018 §1 derives actor_type from the shape of the actor id
    // rather than accepting an assertion of it, so an unrecognised prefix is refused outright —
    // which is what stops an agent typing itself 'human'. The fixture's own 'test:actor' is not a
    // principal form and is correctly rejected.
    const context = { ...carrierContext(TENANT_A), actorId: 'system:test-harness' };
    const id = await withLegalContext(app, context, async (c) => {
      const r = await (c as Client).query<{ id: string }>(
        `SELECT app.record_audit_event(
           'rig.freight.shipment.created.v1', 'shipment', $1, $2, NULL, NULL, '{}'::jsonb) AS id`,
        [randomUUID(), randomUUID()],
      );
      return r.rows[0]!.id;
    });
    expect(id).toBeTruthy();
  });

  it('refuses a direct compose by the runtime role — 0018 §1', async () => {
    await expect(
      withLegalContext(app, carrierContext(TENANT_A), async (c) => {
        await insertAudit(c as Client);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rejects UPDATE — Constitution Art. II.1', async () => {
    await expect(
      withLegalContext(app, carrierContext(TENANT_A), async (c) => {
        await c.query(`UPDATE audit_events SET payload = '{"tampered":true}'::jsonb`);
      }),
    ).rejects.toThrow(/append-only|permission denied/i);
  });

  it('rejects DELETE', async () => {
    await expect(
      withLegalContext(app, carrierContext(TENANT_A), async (c) => {
        await c.query('DELETE FROM audit_events');
      }),
    ).rejects.toThrow(/append-only|permission denied/i);
  });

  it('rejects TRUNCATE — the hole a row-level trigger alone would leave open', async () => {
    await expect(
      withLegalContext(app, carrierContext(TENANT_A), async (c) => {
        await c.query('TRUNCATE audit_events');
      }),
    ).rejects.toThrow(/append-only|permission denied/i);
  });

  it('rejects UPDATE even for the table owner, where the trigger is the only guard', async () => {
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      await expect(
        admin.query('UPDATE audit_events SET actor_id = $1', ['forged']),
      ).rejects.toThrow(/append-only/i);
    } finally {
      await admin.end();
    }
  });

  it('requires legal_entity_id outside system scope', async () => {
    await expect(insertAudit(owner, { legal_entity_id: null })).rejects.toThrow(
      /audit_events_legal_entity_required/,
    );
  });

  it('permits omitting legal_entity_id under system scope with an authorized actor', async () => {
    const admin = db.connectAs('postgres');
    await admin.connect();
    try {
      const r = await admin.query(
        `INSERT INTO audit_events (
           tenant_id, legal_entity_id, legal_authority_class, operating_context,
           actor_type, actor_id, event_type, resource_type, correlation_id, created_by)
         VALUES ($1, NULL, 'software_only', 'system', 'system', 'system:kill-switch',
                 'rig.freight.kill_switch.engaged.v1', 'kill_switch', $2, 'system')
         RETURNING id`,
        [TENANT_A, randomUUID()],
      );
      expect(r.rows[0]!.id).toBeTruthy();
    } finally {
      await admin.end();
    }
  });

  it('rejects an impermissible legal pairing', async () => {
    await expect(
      insertAudit(owner, {
        legal_authority_class: 'carrier_agent',
        operating_context: 'brokerage',
      }),
    ).rejects.toThrow(/audit_events_legal_pairing/);
  });

  it('rejects a malformed event type', async () => {
    await expect(insertAudit(owner, { event_type: 'not-a-versioned-type' })).rejects.toThrow(
      /audit_events_event_type_check/,
    );
  });
});

describe('transactional outbox', () => {
  // `purpose` is a mandatory envelope attribute from OQ-20 onward (migration 0006, ADR-0019
  // requirement 6). Every assertion below is unchanged in behaviour; the fixture carries the new
  // attribute because the envelope now requires one.
  async function insertOutbox(client: Client, eventId: string) {
    return client.query(
      `INSERT INTO outbox_events (
         tenant_id, legal_entity_id, legal_authority_class, operating_context,
         event_id, event_type, event_source, event_time, actor_id, correlation_id,
         payload, created_by, purpose)
       VALUES ($1,$2,'carrier_agent','carrier',$3,'rig.freight.shipment.created.v1',
               '/freightos/test', now(), 'test:actor', $4, '{}'::jsonb, 'test:actor',
               'service_operation')
       RETURNING id, status`,
      [TENANT_A, LEGAL_ENTITY, eventId, randomUUID()],
    );
  }

  it('writes an event as pending', async () => {
    const status = await withLegalContext(app, carrierContext(TENANT_A), async (c) => {
      const r = await insertOutbox(c as Client, randomUUID());
      return r.rows[0]!.status as string;
    });
    expect(status).toBe('pending');
  });

  it('rolls the event back with the transaction that produced it', async () => {
    const eventId = randomUUID();
    await expect(
      withLegalContext(app, carrierContext(TENANT_A), async (c) => {
        await insertOutbox(c as Client, eventId);
        throw new Error('domain failure');
      }),
    ).rejects.toThrow('domain failure');

    const found = await withLegalContext(app, carrierContext(TENANT_A), async (c) => {
      const r = await c.query('SELECT id FROM outbox_events WHERE event_id = $1', [eventId]);
      return r.rowCount;
    });
    // An event must never be published for a change that did not commit.
    expect(found).toBe(0);
  });

  it('makes event_id unique so redelivery is idempotent', async () => {
    const eventId = randomUUID();
    await withLegalContext(app, carrierContext(TENANT_A), async (c) => {
      await insertOutbox(c as Client, eventId);
    });
    await expect(
      withLegalContext(app, carrierContext(TENANT_A), async (c) => {
        await insertOutbox(c as Client, eventId);
      }),
    ).rejects.toThrow(/duplicate key|outbox_events_event_id_key/);
  });

  it('permits delivery bookkeeping but freezes the envelope', async () => {
    const eventId = randomUUID();
    await withLegalContext(app, carrierContext(TENANT_A), async (c) => {
      await insertOutbox(c as Client, eventId);
    });

    const attempts = await withLegalContext(app, carrierContext(TENANT_A), async (c) => {
      const r = await c.query(
        `UPDATE outbox_events SET attempts = attempts + 1, status = 'in_flight'
         WHERE event_id = $1 RETURNING attempts`,
        [eventId],
      );
      return r.rows[0]!.attempts as number;
    });
    expect(attempts).toBe(1);

    await expect(
      withLegalContext(app, carrierContext(TENANT_A), async (c) => {
        await c.query(
          `UPDATE outbox_events SET payload = '{"rewritten":true}'::jsonb WHERE event_id = $1`,
          [eventId],
        );
      }),
    ).rejects.toThrow(/immutable/);
  });

  it('keeps published status and timestamp consistent', async () => {
    const eventId = randomUUID();
    await withLegalContext(app, carrierContext(TENANT_A), async (c) => {
      await insertOutbox(c as Client, eventId);
    });
    await expect(
      withLegalContext(app, carrierContext(TENANT_A), async (c) => {
        await c.query(`UPDATE outbox_events SET status = 'published' WHERE event_id = $1`, [
          eventId,
        ]);
      }),
    ).rejects.toThrow(/outbox_events_published_consistency/);
  });

  it('isolates outbox rows by tenant', async () => {
    const rows = await withLegalContext(app, carrierContext(TENANT_B), async (c) => {
      const r = await c.query('SELECT id FROM outbox_events');
      return r.rowCount;
    });
    expect(rows).toBe(0);
  });
});
