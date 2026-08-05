# Runbook — Control-plane access

**Required by:** ADR-0020 §Implementation obligations · `12_OBSERVABILITY_RELIABILITY_AND_RUNBOOKS.md:43`
**Covers:** every cross-tenant read or write through the `admin` schema
**Status:** written at Phase 1 PR 2, when the capability it covers was built

## Trigger

Any operation that must read or write across tenant boundaries: provisioning a tenant, changing a
tenant's lifecycle state, exporting a tenant's audit trail for a regulator or an incident, or
counting a tenant's identities for an access review.

Nothing else. If the operation can be done inside one tenant's context, it is not a control-plane
operation and must not be routed through this schema.

## Severity

Every use is privileged and is audited. A use with no matching incident, review, or request is a
security event — see §"If something looks wrong".

## Who is authorized to act

A **human** operator, or the **platform** itself acting as `system`. Nobody else:
`admin.refusal_reason` rejects any other `actor_type`, and
`audit_events_privileged_actor_is_human_or_system` makes a privileged audit row claiming an agent
actor unstorable.

An agent may not perform a privileged operation, may not supply its purpose, and may not engage or
release a kill switch (Constitution Art. V.1, Art. I.5).

## The access model in one paragraph

`freightos_admin` is the connection role. It holds `USAGE` on schema `admin` and `EXECUTE` on four
functions, and **nothing else** — no table privileges, and no `USAGE` on `public` or `app`, so a
domain table is not even nameable from it. The functions are `SECURITY DEFINER` and owned by
`freightos_admin_owner`, a `NOLOGIN` role that is a member of `freightos_control_plane`. That
membership is what carries a call across tenants, through the Phase 0 RLS policy branch. **No role
holds `BYPASSRLS`**, and a test asserts it on every CI run.

## The four approved operations

| Function                        | Purpose values that authorise it                                                            | Effect                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------- |
| `admin.provision_tenant`        | `tenant_provisioning`                                                                       | Creates a tenant row                   |
| `admin.set_tenant_status`       | `tenant_lifecycle`, `incident_response`                                                     | Sets `active`, `suspended` or `closed` |
| `admin.export_tenant_audit`     | `audit_export`, `regulatory_request`, `security_investigation`, `incident_response`         | Returns audit rows in a bounded window |
| `admin.tenant_identity_summary` | `access_review`, `identity_administration`, `security_investigation`, `platform_operations` | Returns identity counts                |

Adding a fifth requires a migration that justifies it, an entry in this table, and review at the
next phase exit gate — ADR-0020 §Consequences.

## Performing an operation

1. **Establish the request.** An incident number, a review ticket, or a regulatory request. Its
   identifier becomes the correlation id.
2. **Choose the purpose** from the table above. Purpose comes from the request, never from a model
   and never from convenience — OQ-20.
3. **Connect as `freightos_admin`**, using its own credential. Never the application pool.
4. **Call the function**, supplying actor, actor type, purpose and correlation id:

   ```sql
   SELECT * FROM admin.export_tenant_audit(
     '<tenant-uuid>', '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z',
     'user:jordan', 'human', 'regulatory_request', '<correlation-uuid>');
   ```

   Use `SELECT * FROM`, not `SELECT admin.f(...)`. The function returns a composite type; the plain
   form comes back as an unparsed record literal.

5. **Read the `outcome`.** It is `succeeded`, `denied`, or `failed`.
   - `denied` — the call was refused and **nothing happened**. `message` says why. Do not retry with
     a different purpose to get past it; find out why the purpose was wrong.
   - `failed` — the operation was attempted and errored. `message` carries the database error.
   - `succeeded` — done, and `audit_event_id` identifies the record.
6. **Record the `audit_event_id`** against the request.

## Why a refusal returns instead of raising

PostgreSQL has no autonomous transaction. Raising on a refusal would roll back the audit row that
evidences the refusal, and ADR-0020 §8 requires every privileged operation to write one before
returning. So a refused call performs no privileged work and returns `denied` with an audit record.
Full reasoning in `adr/0026-identity-implementation-decisions.md` §5.

**A caller must check the outcome.** An ignored `denied` looks like a successful call that did
nothing.

**The denial record is transaction-bound, not durable.** It is written in the caller's transaction,
so it survives exactly as far as that transaction does. If you wrap an `admin.*` call and roll back
— deliberately, or because a later statement failed, or because the connection dropped — the denial
record goes with it. The refusal still happened and still did nothing; the evidence that it was
attempted is gone.

What that means operationally:

- **Call `admin.*` functions in their own transaction.** Do not bundle one into a longer unit of
  work whose later steps can fail. The runbook steps above assume one call, one transaction.
- **Do not treat an empty denial history as proof nothing was attempted.** It is proof that nothing
  attempted-and-committed. When investigating, corroborate with the PostgreSQL server log, which is
  outside the transaction and therefore keeps what a rollback removed.
- Rollback-independent denial evidence is carried forward as `ROLLBACK_INDEPENDENT_DENIAL_AUDIT`,
  targeted at Phase 3 alongside the observability work.

## What is audited

Every committed call, including refusals. Each record carries: actor, actor type, correlation id,
purpose (absent on a refusal, deliberately), tenant scope, legal-entity scope where applicable,
resource type and id, action — as the versioned `event_type` and again in `payload.action` —
timestamp, and outcome.

Everything in that list is something the caller told the database. Beside it, each record also
carries `payload.connection` — the authenticated login role, the effective role, the backend pid,
and the server's clock — none of which comes from a parameter, and `payload.claimed_actor`, which
is the actor as supplied. When investigating a disputed action, compare the two: a claimed actor
that no connection could plausibly have made is visible in the record itself.

```sql
-- Who actually held the connection, against who the call said was acting.
SELECT created_at, actor_id AS claimed,
       payload->'connection'->>'authenticated_role' AS connected_as,
       payload->'connection'->>'backend_pid'        AS backend
  FROM audit_events
 WHERE operation_class = 'privileged'
 ORDER BY created_at DESC;
```

The ledger is append-only for every role including the table owner: `UPDATE`, `DELETE` and
`TRUNCATE` are rejected by trigger and by revoked privilege.

## Verification

```sql
-- Privileged operations in the last 24 hours.
SELECT created_at, actor_id, purpose, outcome, resource_type, resource_id, correlation_id
  FROM audit_events
 WHERE operation_class = 'privileged' AND created_at > now() - interval '24 hours'
 ORDER BY created_at DESC;

-- Refusals only.
SELECT created_at, actor_id, payload->>'reason', payload->>'offered_purpose'
  FROM audit_events
 WHERE operation_class = 'privileged' AND outcome = 'denied'
 ORDER BY created_at DESC;
```

Standing invariants, asserted on every CI run by
`packages/database/test/integration/control-plane.test.ts`:

```sql
SELECT rolname FROM pg_roles WHERE rolbypassrls AND NOT rolsuper;   -- must be empty
SELECT n.nspname || '.' || p.proname, p.proconfig                    -- every entry must pin
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace       -- search_path
 WHERE p.prosecdef;
```

## If something looks wrong

**A privileged call nobody can account for.** Treat as a security event. Preserve the audit rows —
they cannot be deleted — collect every row sharing the correlation id, and rotate the
`freightos_admin` credential. The credential lives outside this database; rotating it is a separate
manual step.

**A role has acquired `BYPASSRLS`.** ADR-0020 prohibits it outright. Revoke it
(`ALTER ROLE <role> NOBYPASSRLS`), then find how it was granted — no migration in this repository
does, and a test asserts as much.

**A `SECURITY DEFINER` function has lost its pinned `search_path`.** A privilege-escalation vector.
Revoke `EXECUTE` from `freightos_admin` immediately, then restore the pin.

**A denial rate that suddenly rises.** Usually a caller guessing at purposes. Check
`payload->>'offered_purpose'` across the refusals: a spread of values from one actor is a caller
that does not know what it is doing, and a single repeated invalid value is more likely a
misconfiguration.

## Evidence to capture

The correlation id, every audit row sharing it, the request that authorised the operation, and the
outcome. For a security event, add the output of the two standing-invariant queries above.
