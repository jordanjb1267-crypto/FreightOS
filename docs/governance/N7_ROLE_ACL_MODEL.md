# N7 External Transport — Role, ACL and Secret Model

Architecture phase. **No role is created. No grant is issued. No secret exists.**

Companion to ADR-N0018.

---

## 1. The three authorities, kept apart

```
database authority   !=   network egress authority   !=   secret authority
```

N6 needed only the first. N7 is the first phase that needs all three, and the design question is
whether one principal should hold them together. The answer proposed here is no.

## 2. Dedicated worker vs. reusing `freightos_delivery_worker`

### What `freightos_delivery_worker` already holds

SELECT on twenty relations — the N3 journal, N4 intents, the N1 participant registry, N5-A grants and
revocations, N5-B sensitivities and ceilings, subscriptions — plus INSERT/UPDATE on N6's own
operational tables. It is `bypassrls=false`, not SET-ROLE reachable, and holds no write anywhere in
N3/N4/N5.

### The question

> Should a database role that can read **every authorized artifact and the entire governed
> authorization state** also be the role that can open sockets to the internet?

### Analysis

| Consideration                      | Reuse `freightos_delivery_worker`                         | Dedicated `freightos_transport_worker`                   |
| ---------------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| Blast radius of process compromise | Egress capability **and** full N3–N6 read in one identity | Egress plus a narrow artifact path                       |
| Credential surface                 | One credential unlocks both boundaries                    | Two credentials, two boundaries                          |
| Least privilege                    | Violated — N7 needs almost none of N6's reads             | Achievable                                               |
| Operational simplicity             | One role, one password, one connection pool               | Two of each                                              |
| Auditability                       | "the delivery worker did it" is ambiguous                 | Transport actions attributable to a transport identity   |
| Cluster-global cost                | none                                                      | one more role under 0029 teardown doctrine               |
| Kill-switch clarity                | Disabling egress means disabling the N6 worker            | Egress can be stopped without stopping internal delivery |

The last row matters more than it looks. Under reuse, "stop all external transport" and "stop
internal delivery" are the same lever, because they are the same role and likely the same process.
Under separation they are independent, which is what an egress kill switch is _for_.

### Recommendation

**Introduce `freightos_transport_worker`.** Separation of duties is the default in this repository —
`freightos_event_writer`, `freightos_control_plane` and `freightos_delivery_worker` each exist
because a distinct authority deserved a distinct identity — and egress is a more consequential
authority than any of them.

```
freightos_transport_worker
  LOGIN     yes      (a real process authenticates as it — and it must therefore be added to the
                      integration harness credential list, which is now mechanically enforced by
                      scripts/test/integration-login-credential-coverage.test.ts)
  INHERIT   yes
  CREATEROLE / CREATEDB / SUPERUSER / REPLICATION / BYPASSRLS   all no
  SET-ROLE reachable from any role                              no
  membership: freightos_migrator → freightos_transport_worker, ADMIN only
              (inherit=false, set=false — the 0029/0034 shape)
```

**This recommendation is conditional.** See §4.

## 3. Proposed grants

| Relation                                                | `freightos_transport_worker`  | Note                             |
| ------------------------------------------------------- | ----------------------------- | -------------------------------- |
| `network_transport_destinations`                        | SELECT                        | derive endpoint and adapter      |
| `network_transport_destination_revocations`             | SELECT                        | eligibility                      |
| `network_external_transports`                           | SELECT, INSERT, UPDATE        | its own operational state        |
| `network_external_transport_attempts`                   | SELECT, INSERT                | append-only journal              |
| `network_disclosure_artifacts`                          | SELECT — **narrowed**, see §5 | the bytes                        |
| `network_disclosure_inbox`                              | SELECT                        | obligation origin                |
| N3 journal, N4 intents, N1 registry                     | **none**                      | not needed under Option A        |
| N5-A grants / revocations, N5-B ceilings, subscriptions | **none under Option A**       | required under Option B — see §4 |
| everything else                                         | none                          |                                  |

Explicit REVOKEs of INSERT/UPDATE/DELETE/TRUNCATE on every N3/N4/N5/N6 relation, stated rather than
implied — 0034's posture, carried forward. `GRANT USAGE ON SCHEMA public, app` is required or every
query reads as "relation does not exist", which is a confusing way to discover a privilege gap.

**Every GRANT must be paired with an admitting policy.** Under FORCE RLS a SELECT with no applicable
policy returns **zero rows and raises nothing** — R-05 failed closed this way, and the N7 tables will
be FORCE-RLS from birth. Migration assertion (m)'s recomputed pairing rule must be extended to cover
the transport worker, not restated as a list.

## 4. The coupling with `OR-05` — stated plainly

The recommendation in §2 is **not independent** of the fresh-N5-at-egress ruling.

| `OR-05` outcome                                       | Consequence for the role model                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Option A** — N6 authorization final at inbox commit | Separation is clean. Transport worker needs no N5 read at all. §3 stands as written.                                                                                                                                                                                                                                             |
| **Option B** — fresh N5 before every external attempt | The transport worker needs SELECT on N5-A grants and revocations, N5-B sensitivities and ceilings, subscriptions and the N3 journal — **exactly the read surface separation was meant to withhold from the egress-capable process.** Separation becomes largely nominal.                                                         |
| **Option C** — brokered egress permit                 | Both properties. The N6-side worker re-runs reauthorization and writes a short-lived single-use permit bound to `(artifact_id, destination_id)`; the transport worker holds no N5 read and can send only against an unexpired, unconsumed permit. Cost: a permit table, a lifetime to reason about, and two workers in the loop. |

Choosing Option B and _also_ claiming strong separation of duties would be self-deception. If the
owner rules B, the honest description is "a dedicated role for auditability and kill-switch
independence, with an unchanged read blast radius" — still worth having, but not what §2 argues for.

## 5. Least-privilege artifact access

The transport worker must read **only** artifacts that have a valid external transport obligation —
not browse the artifact table.

Preferred mechanism: an RLS policy predicated on the obligation's existence.

```
POLICY network_disclosure_artifacts_transport_worker_read
  FOR SELECT TO freightos_transport_worker
  USING (EXISTS (SELECT 1 FROM network_external_transports t
                  WHERE t.artifact_id = network_disclosure_artifacts.artifact_id))
```

This is the same shape as N6's `network_disclosure_artifacts_recipient_read`, which resolves
visibility through the inbox — a proven pattern in this schema rather than a new invention.

**SECURITY DEFINER budget: `N7 SECURITY DEFINER delta = 0`.** The policy above needs none, and any
proposal for one must be individually justified against an ordinary role/RLS/ACL alternative. N6's
delta was zero across a far larger surface; N7 has no obvious reason to be different.

An open question worth the owner's attention: whether the policy should further narrow to
obligations in a _sendable_ state, so a terminated obligation stops conferring read access. That is
tighter, and it costs a predicate that must stay correct as the state machine evolves. Recorded as a
sub-question of `OR-02` rather than decided here.

## 6. Secret model

### Rules

1. **No raw secret in any ordinary FreightOS table.** A destination stores `credential_ref` — a
   reference into a secret manager or deployment secret surface — protected by a `CHECK` that refuses
   anything shaped like credential material, mirroring `service_account_credentials`.
2. **Ownership.** A secret belongs to the destination's owning tenant. Cross-tenant secret reference
   is prohibited and should be structurally impossible via the destination's tenant binding.
3. **Rotation.** Rotating a secret must not require a new destination identity — the reference is
   stable, the value behind it changes. This is the one place where "the value changed" is legitimate
   without a new row, and it works precisely because the value is not in the row.
4. **Revocation.** Revoking a secret without revoking the destination yields `authentication_failed`
   — a terminal, non-retryable outcome. Retrying a rejected credential is how accounts get locked.
5. **Access.** Secret authority is held by the **process**, not by the database role. The database
   role can read a _reference_; only the runtime can resolve it. This is the separation that makes
   "database authority ≠ secret authority" mean something.
6. **Audit.** Secret resolution is auditable by reference and destination — never by value.
7. **Redaction and logging.** `DATA_CLASSIFICATION.md` classes credentials `SECRET`, logging
   **Never**. N7 adds no exception. Attempt records and logs carry no `Authorization` header, no
   signature, no token, no key material, and redaction is asserted by test (`N7-M-11`).

### Not selected here

The concrete secret manager is deliberately unchosen — it is a deployment decision, and the
architecture only requires that one exist with resolve/rotate/revoke/audit. Owner ruling `OR-07`.

## 7. Destination authentication models

| Model                 | Adapter knows   | Core engine knows | Notes                                                                                            |
| --------------------- | --------------- | ----------------- | ------------------------------------------------------------------------------------------------ |
| Bearer / static token | the token       | a handle only     | Simplest. Full value if intercepted; HTTPS mandatory.                                            |
| HMAC signature        | signing key     | a handle only     | Receiver verifies without holding our identity. Needs canonical signing input and replay window. |
| Asymmetric signature  | private key     | a handle only     | Receiver holds only a public key. Best forward story; key management heavier.                    |
| Mutual TLS            | client cert     | a handle only     | Strongest transport auth; operationally heavy; per-destination certs.                            |
| Provider-specific     | vendor SDK auth | nothing           | Vendor coupling; keep behind the adapter boundary.                                               |

**Trust boundary:** the core transport engine passes an **opaque credential handle** and never sees
secret material. Only the adapter resolves it, and only for the duration of one attempt. This keeps
the engine — which touches every destination — out of the secret blast radius entirely.

If HMAC or asymmetric signing is chosen, the signing input must be canonically defined (which bytes,
in which order, with which timestamp and nonce) and the artifact digest must be inside the signed
region, so a signature binds _the disclosure_ and not merely a frame around it.

**No key generation, no key storage, no signing implementation in this phase.**

## 8. Role lifecycle

If `freightos_transport_worker` is approved, its migration must follow the cluster-global doctrine
0029 established and 0034 proved across four databases:

- `DROP ROLE` consults `pg_shdepend` across **every** database in the cluster.
- Revoke everything in **this** database; then ask whether anything elsewhere still references the
  role; if so **retain with a NOTICE** and say so; drop only as last holder.
- Both `pg_shdepend` arms — `dbid = <this database>` **and** the `dbid = 0` / `classid = pg_database`
  arm for database-level grants (U-07's lesson).
- No `DROP OWNED`, no `CASCADE`.
- Owned relations are a deliberate stop, not a silent reassignment.
- Boundedness asserted by **exact sorted role names** in both directions, never a count (U-08).

The cross-database teardown proof needs a disposable cluster, exactly as
`network-delivery-worker-teardown.test.ts` does today.

## 9. Proposed role/ACL summary for owner review

```
new roles                     1   (freightos_transport_worker)   — conditional on OR-02
new LOGIN identities          1   — must be added to the integration credential list
new SECURITY DEFINER          0
new permission keys           2–3 (destination create / revoke / read)   — exact set pending OR-06
migration-created assignments 0   (keys held by nobody, as N6 did)
new policies                  one per N7 table per principal, plus the narrowed artifact read
FORCE RLS                     all N7 tables, from birth
```
