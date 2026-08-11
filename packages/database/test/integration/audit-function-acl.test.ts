import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_A, TestDatabase } from './harness.ts';
import type { IdentityFixture } from './identity-harness.ts';
import { seedVerifiedFixture } from './sr2-harness.ts';
import { fixtureOperator, withAuthenticatedTestPrincipal } from './verified-test-auth.ts';
import type { Queryable } from '../../src/session.ts';

/**
 * SR-AUDIT-ACL-NOOP — migration 0031.
 *
 * `app.record_audit_event` is the only governed write path into the audit ledger: 0018 §1 revoked
 * INSERT on `audit_events` from both runtime roles and left this SECURITY DEFINER, owned by
 * `freightos_audit_writer`, as the sole way in. 0018 then tried to restrict who could call it and
 * FAILED SILENTLY — the REVOKE and GRANT were issued after `RESET ROLE` by `freightos_migrator`,
 * which administers the owner WITH SET TRUE, INHERIT FALSE and is therefore not the owner as far as
 * PostgreSQL is concerned. Both statements produced warnings and changed nothing. The function kept
 * its creation-time default ACL, in which PUBLIC holds EXECUTE.
 *
 * The consequence was reproduced with `freightos_event_writer` — an N3/N4 role with no business on
 * the ledger — which supplied its own `app.*` GUC values (the legacy fallback branch that 0020 left
 * in place for every session_user that is not `freightos_app`) and inserted an audit row naming a
 * tenant of its choosing and a fabricated human actor.
 *
 * WHAT THIS FILE PROVES, AND WHY EACH PART EXISTS.
 *
 * The single most important property is that `freightos_app` holds EXECUTE **in its own name**. A
 * test that only asked "can freightos_app call it?" would have passed against the defect, because
 * PUBLIC made the answer yes. So the assertions below pin the SHAPE of the ACL — the explicit
 * grantee set — and not merely one role's reachability through it.
 *
 * The second is that the refusals are the FUNCTION ACL and not something downstream. A call by a
 * forbidden role can fail for at least five reasons that have nothing to do with this fix: the
 * tenant foreign key, the legal-pairing CHECK, the legal-entity CHECK, the purpose vocabulary, and
 * RLS on `audit_events` — every one of which is evaluated AFTER execution is permitted. Accepting
 * any of those as evidence would leave the ACL untested. Each negative case therefore asserts
 * `permission denied` AND separately asserts `has_function_privilege` is false.
 */

const db = new TestDatabase('freightos_test_audit_acl');

/** The exact identity. Never `app.record_audit_event` unqualified — overloads are a real risk. */
const FN = 'app.record_audit_event(text,text,text,uuid,uuid,text,jsonb)';

/**
 * The complete authorized set, owner included.
 *
 * `freightos_audit_writer` appears because PostgreSQL materialises the owner's own EXECUTE into the
 * aclitem list as soon as any explicit grant exists. It is inherent owner capability, not a
 * decision — but it IS part of the pinned shape, so it is named rather than filtered out.
 */
const EXPECTED_GRANTEES = ['freightos_app', 'freightos_audit_writer'];

/**
 * Roles that can log in and must not reach the function.
 *
 * `freightos_migrator` is included deliberately. It can `SET ROLE` to the owner — that is how 0031
 * applies the ACL at all — but administrative SET capability is not runtime EXECUTE authority, and
 * the two must not be conflated. In an ordinary statement the migrator is refused like anyone else.
 */
const FORBIDDEN_LOGIN_ROLES = [
  'freightos_event_writer',
  'freightos_control_plane',
  'freightos_admin',
  'freightos_migrator',
];

/**
 * SECURITY DEFINER functions in app/admin/authn at the tip.
 *
 * 0031 changes an ACL and nothing else, so this number must not move. Pinned rather than asserted
 * as "greater than zero" — a floor would pass for a migration that added one.
 */
const DEFINER_COUNT_AT_TIP = 52;

let owner: Client;
let fixtureA: IdentityFixture;
let operatorRole: string;

const asTenantA = <T>(work: (c: Queryable) => Promise<T>): Promise<T> =>
  withAuthenticatedTestPrincipal(db, fixtureOperator(fixtureA), work);

/**
 * The exploit, verbatim.
 *
 * Every GUC the pre-fix reproduction set, in the same order, against the same function. The only
 * thing that changes between "before" and "after" is the ACL, which is what makes this a
 * regression rather than a demonstration.
 */
async function attemptForgery(client: Client, tenantId: string): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(
      `SELECT set_config('app.tenant_id', $1, true),
              set_config('app.actor_id', 'user:00000000-0000-4000-8000-0000000000ff', true),
              set_config('app.legal_authority_class', 'carrier_agent', true),
              set_config('app.operating_context', 'carrier', true),
              set_config('app.legal_entity_id', '44444444-4444-4444-8444-444444444444', true)`,
      [tenantId],
    );
    await client.query(
      `SELECT app.record_audit_event(
         'rig.freight.forged.v1', 'forgery', 'x', NULL, NULL, 'service_operation', '{}'::jsonb)`,
    );
  } finally {
    await client.query('ROLLBACK');
  }
}

beforeAll(async () => {
  await db.reset();
  await db.seedTenants();
  fixtureA = await seedVerifiedFixture(db, TENANT_A);
  owner = db.connectAs('postgres');
  await owner.connect();
  // A representative ordinary operator LOGIN — the SR-2 Design A identity a human actually
  // authenticates as. It carries freightos_admin as a capability, which is exactly why it must be
  // tested: an operator is the most privileged everyday principal in the system.
  operatorRole = await db.provisionOperator('aclprobe', TENANT_A, fixtureA.userId);
}, 240_000);

afterAll(async () => {
  await owner?.end();
  await db.dropLogin(operatorRole).catch(() => undefined);
});

describe('SR-AUDIT-ACL-NOOP — the function ACL itself', () => {
  it('pins the exact function identity the ACL is applied to', async () => {
    const r = await owner.query<{
      identity: string;
      owner: string;
      secdef: boolean;
      proconfig: string;
    }>(
      `SELECT p.oid::regprocedure::text AS identity,
              pg_get_userbyid(p.proowner)  AS owner,
              p.prosecdef                  AS secdef,
              coalesce(p.proconfig::text, '(none)') AS proconfig
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'app' AND p.proname = 'record_audit_event'`,
    );

    // Exactly one. An overload would mean the migration's REVOKE named a different function than
    // the one the runtime calls, which is a silent failure of its own.
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.identity).toBe(FN);
    expect(r.rows[0]!.owner).toBe('freightos_audit_writer');
    expect(r.rows[0]!.secdef).toBe(true);
    // 0019's pg_temp-last pin must survive an ACL-only change.
    expect(r.rows[0]!.proconfig).toBe('{"search_path=pg_catalog, public, pg_temp"}');
  });

  it('does not let PUBLIC execute it — the structural gate', async () => {
    // Read as an explicit aclitem with grantee 0, not via has_function_privilege('public', ...).
    // The aclitem is the thing 0018 failed to change, so the aclitem is the thing pinned.
    const r = await owner.query<{ present: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           CROSS JOIN LATERAL aclexplode(p.proacl) a
          WHERE n.nspname = 'app' AND p.proname = 'record_audit_event'
            AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS present`,
    );
    expect(r.rows[0]!.present, 'PUBLIC regained EXECUTE on app.record_audit_event').toBe(false);

    const viaHelper = await owner.query<{ ok: boolean }>(
      `SELECT has_function_privilege('public', $1, 'EXECUTE') AS ok`,
      [FN],
    );
    expect(viaHelper.rows[0]!.ok).toBe(false);
  });

  it('grants EXECUTE to exactly freightos_app, in its own name', async () => {
    const r = await owner.query<{ grantee: string }>(
      `SELECT g.rolname AS grantee
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         CROSS JOIN LATERAL aclexplode(p.proacl) a
         JOIN pg_roles g ON g.oid = a.grantee
        WHERE n.nspname = 'app' AND p.proname = 'record_audit_event'
          AND a.privilege_type = 'EXECUTE'
        ORDER BY 1`,
    );
    // The pinned SHAPE. Reachability through PUBLIC is what the defect looked like; an explicit
    // grant is what the fix looks like, and only this assertion distinguishes them.
    expect(r.rows.map((x) => x.grantee)).toEqual(EXPECTED_GRANTEES);
  });

  it('refuses EXECUTE to every other role in the cluster', async () => {
    const r = await owner.query<{ rolname: string; ok: boolean }>(
      `SELECT rolname, has_function_privilege(rolname, $1, 'EXECUTE') AS ok
         FROM pg_roles WHERE rolname LIKE 'freightos%' ORDER BY 1`,
      [FN],
    );
    const permitted = r.rows.filter((x) => x.ok).map((x) => x.rolname);
    expect(permitted).toEqual(EXPECTED_GRANTEES);
  });

  it('refuses EXECUTE to an ordinary operator LOGIN identity', async () => {
    // Not covered by the LIKE 'freightos%' sweep above, and the one a human actually connects as.
    const r = await owner.query<{ ok: boolean }>(
      `SELECT has_function_privilege($1, $2, 'EXECUTE') AS ok`,
      [operatorRole, FN],
    );
    expect(r.rows[0]!.ok).toBe(false);
  });
});

describe('SR-AUDIT-ACL-NOOP — the exploit is closed', () => {
  it.each(FORBIDDEN_LOGIN_ROLES)(
    'refuses the forgery call from %s, at the function ACL',
    async (role) => {
      // The ACL fact, asserted independently of any error message. A role can be refused for
      // reasons that would still leave this ACL wrong — schema USAGE is one, and
      // freightos_admin is denied that way too. Asserting the privilege directly is what makes
      // this test about the fix rather than about whatever fails first.
      const priv = await owner.query<{ ok: boolean }>(
        `SELECT has_function_privilege($1, $2, 'EXECUTE') AS ok`,
        [role, FN],
      );
      expect(priv.rows[0]!.ok, `${role} can execute ${FN}`).toBe(false);

      const client = db.connectAs(role);
      await client.connect();
      try {
        await expect(attemptForgery(client, TENANT_A)).rejects.toThrow(/permission denied/i);
      } finally {
        await client.end();
      }
    },
  );

  it('leaves no forged row behind', async () => {
    const r = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events WHERE event_type = 'rig.freight.forged.v1'`,
    );
    expect(r.rows[0]!.count).toBe('0');
  });

  it('is anti-vacuous: the same call succeeds for the authorized role', async () => {
    // Gate U. Every refusal above would also pass against a function that refuses everyone, or one
    // that does not exist. This is the control that makes them mean something.
    const id = await asTenantA(
      async (c) =>
        (
          await (c as Client).query<{ id: string }>(
            `SELECT app.record_audit_event(
             'rig.freight.shipment.created.v1', 'shipment', $1, $2, NULL, NULL, '{}'::jsonb) AS id`,
            [randomUUID(), randomUUID()],
          )
        ).rows[0]!.id,
    );
    expect(id).toBeTruthy();
  });
});

describe('SR-AUDIT-ACL-NOOP — the authorized path still derives its own provenance', () => {
  it('records tenant, actor, actor_type and created_by from the verified binding', async () => {
    const correlation = randomUUID();
    await asTenantA(async (c) => {
      await (c as Client).query(
        `SELECT app.record_audit_event(
           'rig.freight.identity.user_viewed.v1', 'user', $1, $2, NULL, 'identity_administration',
           $3::jsonb)`,
        [
          fixtureA.userId,
          correlation,
          // A caller trying to smuggle authoritative fields through the descriptive channel.
          JSON.stringify({
            tenant_id: '99999999-9999-4999-8999-999999999999',
            actor_id: 'system:not-me',
            actor_type: 'system',
            created_by: 'someone-else',
          }),
        ],
      );
    });

    const r = await owner.query<{
      tenant_id: string;
      actor_id: string;
      actor_type: string;
      created_by: string;
      operation_class: string;
      session_user: string;
    }>(
      `SELECT tenant_id, actor_id, actor_type, created_by, operation_class,
              payload->'provenance'->>'session_user' AS session_user
         FROM audit_events WHERE correlation_id = $1`,
      [correlation],
    );

    expect(r.rows).toHaveLength(1);
    const row = r.rows[0]!;
    // Every authoritative field comes from the verified binding, not from the payload the caller
    // supplied — which named a different tenant, a different actor and a different actor_type.
    expect(row.tenant_id).toBe(TENANT_A);
    expect(row.actor_id).toBe(`user:${fixtureA.userId}`);
    expect(row.actor_type).toBe('human');
    expect(row.created_by).toBe(`user:${fixtureA.userId}`);
    // Hardcoded in the function body. This path can never mint a privileged claim.
    expect(row.operation_class).toBe('domain');
    // Read from the connection inside the definer, so it cannot be supplied.
    expect(row.session_user).toBe('freightos_app');
  });
});

describe('SR-AUDIT-ACL-NOOP — the role graph', () => {
  it('reports every edge involving freightos_audit_writer, without pretending there are none', async () => {
    const r = await owner.query<{
      grantor: string;
      member: string;
      admin_option: boolean;
      inherit_option: boolean;
      set_option: boolean;
    }>(
      `SELECT g.rolname AS grantor, m.rolname AS member,
              a.admin_option, a.inherit_option, a.set_option
         FROM pg_auth_members a
         JOIN pg_roles r ON r.oid = a.roleid
         JOIN pg_roles m ON m.oid = a.member
         JOIN pg_roles g ON g.oid = a.grantor
        WHERE r.rolname = 'freightos_audit_writer'
        ORDER BY 2, 1`,
    );

    // Administrative edges legitimately exist and are named here rather than glossed as "no
    // membership": the bootstrap grants the migrator ADMIN OPTION so it can administer the role,
    // and the migrator grants itself SET so it can become the owner to apply this migration's ACL.
    // Neither carries INHERIT, which is the property that matters.
    for (const row of r.rows) {
      expect(row.inherit_option, `${row.member} inherits freightos_audit_writer`).toBe(false);
    }
    const canSet = r.rows
      .filter((x) => x.set_option)
      .map((x) => x.member)
      .sort();
    expect(canSet).toEqual(['freightos_migrator', 'postgres']);
  });

  it('keeps every ordinary runtime identity out of the writer, by inheritance or SET ROLE', async () => {
    const r = await owner.query<{ rolname: string; inherits: boolean; can_set: boolean }>(
      `SELECT rolname,
              pg_has_role(rolname, 'freightos_audit_writer', 'USAGE')  AS inherits,
              pg_has_role(rolname, 'freightos_audit_writer', 'MEMBER') AS can_set
         FROM pg_roles
        WHERE rolname IN ('freightos_app', 'freightos_event_writer',
                          'freightos_control_plane', 'freightos_admin')
        ORDER BY 1`,
    );
    expect(r.rows).toHaveLength(4);
    for (const row of r.rows) {
      expect(row.inherits, `${row.rolname} inherits the audit writer`).toBe(false);
      expect(row.can_set, `${row.rolname} can SET ROLE to the audit writer`).toBe(false);
    }

    const op = await owner.query<{ inherits: boolean; can_set: boolean }>(
      `SELECT pg_has_role($1, 'freightos_audit_writer', 'USAGE')  AS inherits,
              pg_has_role($1, 'freightos_audit_writer', 'MEMBER') AS can_set`,
      [operatorRole],
    );
    expect(op.rows[0]!.inherits).toBe(false);
    expect(op.rows[0]!.can_set).toBe(false);
  });
});

describe('SR-AUDIT-ACL-NOOP — the silent-noop class', () => {
  it('carries a post-application catalog assertion in the migration itself', async () => {
    // THE ROOT CAUSE, GUARDED. 0018 issued its ACL statements, PostgreSQL warned and discarded
    // them, the statements "succeeded", and nothing looked afterwards. The regression for that
    // class is not a behavioural test — it is the requirement that the migration READ THE CATALOG
    // back. This asserts 0031 does, from its own source, so removing the check fails the suite.
    const { readFileSync } = await import('node:fs');
    const { MIGRATIONS_DIR } = await import('../../src/paths.ts');
    const sql = readFileSync(`${MIGRATIONS_DIR}/0031_audit_function_acl_hardening.up.sql`, 'utf8');
    expect(sql).toMatch(/aclexplode\(p\.proacl\)/);
    expect(sql).toMatch(/PUBLIC still holds EXECUTE/);

    // The ACL must be applied AS THE OWNER. If a future edit moves the RESET ROLE back above the
    // REVOKE — which is precisely how 0018 broke — this is the assertion that notices.
    //
    // Statement positions, not substring positions. The header quotes 0018's own broken sequence
    // verbatim, so `indexOf('RESET ROLE')` finds the COMMENT and would report the statements in the
    // wrong order. Anchoring to the start of a line is what makes this test about the SQL.
    const stmt = (re: RegExp): number => {
      const m = re.exec(sql);
      return m ? m.index : -1;
    };
    const setRole = stmt(/^SET LOCAL ROLE freightos_audit_writer;/m);
    const revoke = stmt(/^REVOKE ALL ON FUNCTION/m);
    const grant = stmt(/^GRANT EXECUTE ON FUNCTION/m);
    const reset = stmt(/^RESET ROLE;/m);

    expect(setRole, 'no SET LOCAL ROLE statement').toBeGreaterThan(-1);
    expect(revoke, 'no REVOKE statement').toBeGreaterThan(setRole);
    expect(grant, 'the GRANT must also run as the owner').toBeGreaterThan(setRole);
    expect(reset, 'RESET ROLE must come after the ACL statements, not before').toBeGreaterThan(
      Math.max(revoke, grant),
    );
  });

  it('proves the migrator alone cannot change this ACL — the 0018 mistake, reproduced', async () => {
    // Anti-vacuity for the fix's central claim. If the migrator COULD change the ACL directly,
    // 0018 would not have failed and 0031's SET LOCAL ROLE would be cargo cult.
    const migrator = db.connectAs('freightos_migrator');
    await migrator.connect();
    const notices: string[] = [];
    migrator.on('notice', (n) => notices.push(n.message ?? ''));
    try {
      await migrator.query('BEGIN');

      // PostgreSQL refuses this in one of two ways depending on what the migrator holds, and BOTH
      // occur in this repository's history:
      //
      //   * before 0031, the migrator reached the function through PUBLIC but without GRANT
      //     OPTION, so the statement WARNED and discarded — the silent failure that caused this
      //     whole finding;
      //   * after 0031, PUBLIC is revoked and the migrator holds nothing, so the same statement
      //     raises `permission denied for function`.
      //
      // The invariant is not which one happens. It is that the ACL does not move. Asserting the
      // error text would make this test a description of one PostgreSQL version's behaviour
      // instead of a proof about authority.
      let raised: string | undefined;
      try {
        await migrator.query(`GRANT EXECUTE ON FUNCTION ${FN} TO freightos_event_writer`);
      } catch (error) {
        raised = error instanceof Error ? error.message : String(error);
        // The statement aborted the transaction; the ACL check below needs a live one.
        await migrator.query('ROLLBACK');
        await migrator.query('BEGIN');
      }

      const after = await migrator.query<{ ok: boolean }>(
        `SELECT has_function_privilege('freightos_event_writer', $1, 'EXECUTE') AS ok`,
        [FN],
      );
      expect(
        after.rows[0]!.ok,
        'the migrator changed the ACL directly; 0031 §2 SET LOCAL ROLE would be unnecessary',
      ).toBe(false);

      // Whichever branch fired, it must have been a refusal and not a success.
      const refused =
        raised !== undefined || /no privileges were granted/i.test(notices.join('\n'));
      expect(refused, 'the migrator neither raised nor warned — did the GRANT take effect?').toBe(
        true,
      );
    } finally {
      await migrator.query('ROLLBACK').catch(() => undefined);
      await migrator.end();
    }
  });
});

describe('SR-AUDIT-ACL-NOOP — authority snapshot', () => {
  it('changes nothing about audit_events itself', async () => {
    const grants = await owner.query<{ grantee: string; privilege_type: string }>(
      `SELECT DISTINCT grantee, privilege_type FROM information_schema.role_table_grants
        WHERE table_name = 'audit_events' ORDER BY 1, 2`,
    );
    const insert = grants.rows
      .filter((g) => g.privilege_type === 'INSERT')
      .map((g) => g.grantee)
      .sort();
    expect(insert).toEqual([
      'freightos_admin_owner',
      'freightos_audit_writer',
      'freightos_migrator',
    ]);
    // The runtime roles still cannot compose a row directly — 0018 §1 stands.
    expect(insert).not.toContain('freightos_app');
    expect(insert).not.toContain('freightos_control_plane');

    const structure = await owner.query<{ triggers: string; rls: boolean; policies: string }>(
      `SELECT (SELECT count(*)::text FROM pg_trigger
                WHERE tgrelid = 'public.audit_events'::regclass AND NOT tgisinternal) AS triggers,
              (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
                WHERE oid = 'public.audit_events'::regclass) AS rls,
              (SELECT count(*)::text FROM pg_policy
                WHERE polrelid = 'public.audit_events'::regclass) AS policies`,
    );
    expect(structure.rows[0]!.triggers).toBe('3');
    expect(structure.rows[0]!.rls).toBe(true);
    expect(structure.rows[0]!.policies).toBe('1');
  });

  it('leaves the event writer and the app role otherwise untouched', async () => {
    // N3/N4 non-regression. The exploit role loses exactly one capability — this function — and
    // keeps every journal privilege the network layer depends on.
    const writer = await owner.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'freightos_event_writer' ORDER BY 1, 2`,
    );
    const byTable = new Map<string, string[]>();
    for (const row of writer.rows) {
      byTable.set(row.table_name, [...(byTable.get(row.table_name) ?? []), row.privilege_type]);
    }
    // Table-level: INSERT only, on exactly the two N3/N4 tables.
    expect([...byTable.keys()].sort()).toEqual(['network_events', 'network_transport_intents']);
    expect(byTable.get('network_events')).toEqual(['INSERT']);
    expect(byTable.get('network_transport_intents')).toEqual(['INSERT']);
    expect(byTable.has('audit_events')).toBe(false);

    // The writer's read on network_events is COLUMN-level, not table-level — 0029 granted SELECT on
    // exactly the two identity columns it needs for duplicate resolution and nothing else. Checking
    // only `role_table_grants` would miss it entirely and would have reported "no SELECT" for a
    // role that can in fact read two columns.
    const columns = await owner.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.role_column_grants
        WHERE grantee = 'freightos_event_writer' AND table_name = 'network_events'
          AND privilege_type = 'SELECT' ORDER BY 1`,
    );
    expect(columns.rows.map((c) => c.column_name)).toEqual(['event_fingerprint', 'event_id']);

    // 0031 adds no SECURITY DEFINER. Pinned as a count so a new one shows up as a diff here.
    const definers = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname IN ('app', 'admin', 'authn') AND p.prosecdef`,
    );
    expect(Number(definers.rows[0]!.count)).toBe(DEFINER_COUNT_AT_TIP);
  });
});
