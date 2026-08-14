# Data Classification Register

Required by `02_GOVERNANCE_AND_NON_REGRESSION.md:5-17`. Did not exist before Phase 0.

Classification drives what may reach a model provider, what may be logged, what may leave the
transactional store, and what may be copied to a development environment.

## Classes

| Class                 | Definition                                                          | Development copy | Model provider              | Logging          |
| --------------------- | ------------------------------------------------------------------- | ---------------- | --------------------------- | ---------------- |
| `PUBLIC`              | Published without restriction.                                      | Permitted        | Permitted                   | Full             |
| `INTERNAL`            | Operational data with no customer or personal content.              | Permitted        | Permitted                   | Full             |
| `TENANT_CONFIDENTIAL` | Customer operational data. Isolation is a constitutional guarantee. | **Prohibited**   | Minimum necessary, redacted | Identifiers only |
| `TENANT_ECONOMICS`    | Rates, margins, cost profiles, profitability.                       | **Prohibited**   | **Prohibited**              | Identifiers only |
| `PERSONAL`            | Driver and contact personal data.                                   | **Prohibited**   | Minimum necessary, redacted | Identifiers only |
| `SECRET`              | Credentials, keys, tokens, bank details.                            | **Prohibited**   | **Prohibited**              | **Never**        |
| `AUDIT`               | Immutable evidence. Append-only, retained.                          | **Prohibited**   | **Prohibited**              | Reference only   |

## Constitutional constraints these encode

- Art. III.1 — tenant-private data is isolated.
- Art. III.2 — **customer economics cannot be exposed to another customer.** This is why
  `TENANT_ECONOMICS` is its own class rather than a subset of `TENANT_CONFIDENTIAL`: it is the one
  category whose cross-tenant leakage is called out by name.
- Art. III.3 — shared learning is opt-in, de-identified, aggregated, and reviewed.
- Art. III.4 — **production customer data cannot be copied to local development.** Every
  customer-bearing class above is therefore `Prohibited` for development copies, without exception
  and without a "sanitised" loophole.
- Art. III.5 — model providers receive minimum necessary context.
- `08_AGENT_OPERATING_SYSTEM:31` — agent memory may never hold credentials, unredacted bank data,
  cross-tenant data, unverified legal conclusions, or unbounded permanent history.

## Phase 0 inventory

| Store               | Class                 | Notes                                                                                                           |
| ------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------- |
| `tenants`           | `TENANT_CONFIDENTIAL` | RLS-isolated, `FORCE` enabled.                                                                                  |
| `audit_events`      | `AUDIT`               | Append-only by trigger and by revoked privilege.                                                                |
| `outbox_events`     | `TENANT_CONFIDENTIAL` | Payload immutable once written.                                                                                 |
| `kill_switches`     | `INTERNAL`            | System and legal-plane rows are deliberately visible to every tenant, so a tenant can see why its work stopped. |
| `.env`              | `SECRET`              | Gitignored. Only `.env.example` is committed, with development-only values.                                     |
| `schema_migrations` | `INTERNAL`            | Version, name, checksum, timestamp.                                                                             |

Phase 0 stored no `PERSONAL` and no `TENANT_ECONOMICS` data.

## Phase 1 PR 2 inventory — identity and organization

| Store                             | Class                 | Notes                                                                                                                                                                                                              |
| --------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `organization_nodes`              | `TENANT_CONFIDENTIAL` | Tenant structure. RLS-isolated, `FORCE` enabled.                                                                                                                                                                   |
| `organization_node_closure`       | `TENANT_CONFIDENTIAL` | Derived transitive closure of the above.                                                                                                                                                                           |
| `legal_entities`                  | `TENANT_CONFIDENTIAL` | Legal names and jurisdictions.                                                                                                                                                                                     |
| `operating_authorities`           | `TENANT_CONFIDENTIAL` | Regulatory posture and authority numbers.                                                                                                                                                                          |
| `carrier_appointments`            | `TENANT_CONFIDENTIAL` | Appointment evidence references. The referenced document is not stored.                                                                                                                                            |
| **`users`**                       | **`PERSONAL`**        | Display name and an authentication-subject reference. The first `PERSONAL` store in the system. No credential: a `CHECK` refuses a subject shaped like one                                                         |
| `memberships`, `membership_roles` | `TENANT_CONFIDENTIAL` | Who is attached where, and with which roles.                                                                                                                                                                       |
| `roles`, `role_permissions`       | `TENANT_CONFIDENTIAL` | Tenant authorization model.                                                                                                                                                                                        |
| `permissions`                     | `INTERNAL`            | Global catalog. A vocabulary, not tenant data — which is why its read policy is unconditional.                                                                                                                     |
| `service_accounts`                | `TENANT_CONFIDENTIAL` | Non-human actors.                                                                                                                                                                                                  |
| **`service_account_credentials`** | `TENANT_CONFIDENTIAL` | **Credential REFERENCES only, never credential material.** A URI or an algorithm-prefixed digest; `CHECK` constraints refuse a raw secret. The referenced secret is class `SECRET` and lives outside this database |
| `service_account_permissions`     | `TENANT_CONFIDENTIAL` | Direct grants to machine actors.                                                                                                                                                                                   |
| `policy_bindings`                 | `TENANT_CONFIDENTIAL` | Effective policy per node.                                                                                                                                                                                         |

`users` being `PERSONAL` has consequences that are already in force: no development copy
(Art. III.4), minimum necessary and redacted to a model provider (Art. III.5), and identifiers only
in logs. Phase 1 runs no model gateway, so the second is not yet exercisable in either direction.

PR 2 stores no `TENANT_ECONOMICS` data. That arrives with the cost-profile domain in PR 9, and this
register must be extended in the same change.

## Network inventory — N1 to N5-A

**This register is NOT disclosure authority.** It is the INTERNAL HANDLING axis: what may be copied
to a development environment, what may reach a model provider, and what may be logged. Whether a
fact may leave FreightOS to a named counterparty is decided by an entirely separate mechanism —
`network_disclosure_grants` plus a projection, evaluated by the N5-A disclosure evaluator. A class
below never authorizes a disclosure, and `PUBLIC` here has never meant "any network participant may
receive it".

| Store                                  | Class                 | Notes                                                                                                                                                                                                        |
| -------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `network_participants`                 | `TENANT_CONFIDENTIAL` | Rows with `tenant_id IS NULL` are external organizations owned by no tenant. NULL tenant is never a grant of public visibility.                                                                              |
| `network_participant_aliases`          | `TENANT_CONFIDENTIAL` | USDOT/MC/EIN/LEI values are externally issued; the linkage to a participant is not public.                                                                                                                   |
| `network_participant_relationships`    | `TENANT_CONFIDENTIAL` | An edge discloses the existence of a counterparty. Authority-inert.                                                                                                                                          |
| `network_relationship_types`           | `INTERNAL`            | Global vocabulary. Same reasoning as `permissions`.                                                                                                                                                          |
| `network_alias_namespaces`             | `INTERNAL`            | Global vocabulary.                                                                                                                                                                                           |
| `network_schema_versions`              | `INTERNAL`            | Governance metadata, readable by the runtime by design.                                                                                                                                                      |
| `network_events`                       | `TENANT_CONFIDENTIAL` | **The payload varies.** `data` may carry `PERSONAL` or `TENANT_ECONOMICS` content depending on `schema_ref`, so the table-level class is a floor, not a statement about payload contents. See the gap below. |
| `network_transport_intents`            | `INTERNAL`            | Two columns, one of which is an event id. Carries no content.                                                                                                                                                |
| `network_disclosure_grants`            | `TENANT_CONFIDENTIAL` | Who a tenant's organizations authorized to receive what. Grantor-side read only.                                                                                                                             |
| `network_disclosure_grant_revocations` | `TENANT_CONFIDENTIAL` | Withdrawal record, same sensitivity as the grant.                                                                                                                                                            |
| `network_disclosure_purposes`          | `INTERNAL`            | Governed vocabulary, migration-seeded.                                                                                                                                                                       |
| `network_disclosure_authority_bases`   | `INTERNAL`            | Governed vocabulary, migration-seeded.                                                                                                                                                                       |
| `network_disclosure_projections`       | `INTERNAL`            | Field allowlists bound to contracts. Reference data, not tenant data.                                                                                                                                        |
| `network_disclosure_projection_fields` | `INTERNAL`            | The pointers themselves.                                                                                                                                                                                     |

### The payload-class gap, stated rather than left implicit

This register classifies **stores**. `network_events.data` is one column whose real class varies by
payload contract, and there is currently no mechanism _in this section_ that expresses "this contract
carries `PERSONAL` data". That gap is closed by the separate axis below, which attaches a governed
sensitivity to each `durable_schema_ref` — the right granularity for a per-contract class.

## Network disclosure sensitivity — a SEPARATE axis

Everything above is **internal handling**. This section is **network disclosure**. They share no
vocabulary, and neither implies the other:

- **Internal handling classification** governs FreightOS custody and handling obligations: what may
  be copied to a development environment, what may reach a model provider, what may be logged.
- **Network disclosure sensitivity** governs whether a canonical contract version may cross an
  organization boundary at all.

**Neither axis grants N5-A recipient authority.** `PUBLIC` in the internal handling register does not
mean publicly disclosable over the network, and it never has.

Disclosure requires **both** conditions, and neither substitutes for the other:

> An N5-A grant may narrow what can leave. It must never widen what N5-B allows to leave.

`N5B_PERMITS` (this section) **and** `N5A_ALLOWS` (a bilateral grant naming recipient, purpose and
projection). Missing, unknown or unreadable sensitivity denies.

### The levels — `network_disclosure_sensitivities`, migration 0033

| Code                       | Rank | Externally disclosable | Meaning                                                                                         |
| -------------------------- | ---: | ---------------------- | ----------------------------------------------------------------------------------------------- |
| `execution_operational`    |   10 | Yes, with authority    | Facts a counterparty must hold to perform work the parties have already agreed.                 |
| `counterparty_identifying` |   20 | Yes, with authority    | Participant identity, rosters, representation, relationship shape, external identifying values. |
| `commercial_terms`         |   30 | Yes, with authority    | Rates, margins, terms, capacity economics. Art. III.2 is why this sits above rank 20.           |
| `never_external`           |   99 | **No — absolute**      | Never leaves through N6, under any grant, purpose, basis, relationship, administrator or role.  |

The order is total: `rank` is `UNIQUE` and the ceiling test is `assigned.rank <= ceiling.rank`.
`externally_disclosable` is carried independently and is also required, so a non-disclosable level
does not depend on holding the reserved rank. Rank 99 is reserved for `never_external` by constraint.

`execution_operational` does **not** mean public. It confers nothing on its own.

### Per-contract assignment — `network_schema_disclosure_sensitivity`

Exactly one immutable assignment per **exact** durable schema version. The primary key is the ref
itself, so a new version has no row, is unassigned, and is therefore denied — it cannot inherit an
earlier version's ceiling because there is nothing to inherit through.

| Contract (`…/network/`)         | Sensitivity                | Why                                                                     |
| ------------------------------- | -------------------------- | ----------------------------------------------------------------------- |
| `event-correction.v1`           | `execution_operational`    | Correction linkage. No roster, no identifier, no commercial term.       |
| `workflow-state.v1`             | `counterparty_identifying` | Its projection includes `/participants` — a counterparty roster.        |
| `logistics-object-reference.v1` | `counterparty_identifying` | `external_aliases` carries USDOT/MC/EIN/LEI values.                     |
| `participant-identity.v1`       | `counterparty_identifying` | Identity, representation, `assurance_level`.                            |
| `capability-advertisement.v1`   | `commercial_terms`         | `terms_ref`, `constraints`, `availability` are capacity economics.      |
| `consent-grant.v1`              | `never_external`           | The authorization graph itself — disclosing it reveals who trusts whom. |
| `command-envelope.v1`           | `never_external`           | `approval_refs`, `policy_decision_ref` are authority material.          |
| `evidence-envelope.v1`          | `never_external`           | `storage_ref` points into evidence storage.                             |
| `event-envelope.v1`             | `never_external`           | A container. What may leave is a projection of the **inner** contract.  |

Contract-level, not field-level: a contract takes the highest sensitivity of anything it carries, so
`evidence-envelope` is blocked whole even though `content_hash` alone is harmless. That cost is
accepted rather than hidden — see ADR-N0016.

### Purpose ceilings — `network_disclosure_purpose_ceilings`

| Purpose              | Maximum sensitivity        |
| -------------------- | -------------------------- |
| `shipment_execution` | `counterparty_identifying` |

`commercial_terms` is therefore above the only ceiling that exists, and `never_external` is
unreachable from any of them. A purpose with **no** ceiling discloses nothing; there is deliberately
no global maximum, because a global maximum is what would let a future purpose inherit one silently.

### Sensitivity is governed, never self-declared

Sensitivity resolves from `durable_schema_ref` → governed assignment → governed vocabulary, and from
nothing else. It never reads `network_events.classification`, a payload `classification` property, or
any caller-supplied sensitivity, visibility or shareability — which matters because
`evidence-envelope.v1` and `event-envelope.v1` both carry a producer-controlled property named
exactly `classification`. An event producer cannot label its own event into a lower ceiling.

All three tables are migration-authored and immutable: `SELECT` policies only, no write policy for
any role, `FORCE` row-level security, and append-only guards. There is no runtime classification
administration and no correction path — changing a classification is a reviewed migration.

**NETWORK_N5B_COMPLETE does not authorize NETWORK_N6_PUBLICATION.** N5-B decides eligibility; N6
owns delivery. See ADR-N0016 and, for what delivery actually handles, the section below.

## Network authorized disclosure delivery — N6, migration 0034

N6 is where authorized content is first materialized as bytes and handed to a recipient. It is
therefore the first network layer that HOLDS disclosed content rather than deciding about it, and
this section records what it holds, who can read it, and what it deliberately does not keep.

**N6 performs zero external egress.** Every store below is internal to the FreightOS database. No
byte leaves it. See ADR-N0017.

### Canonical artifact bytes — `network_disclosure_artifacts.payload_canonical`

The projected, canonicalized payload of exactly the pointers N5-A authorized, frozen at routing
time. Class follows the SOURCE CONTRACT: an artifact over `workflow-state.v1` is
`counterparty_identifying` material, and the artifact row records `sensitivity_code` alongside the
bytes so the class travels with them rather than being re-derived.

This is the only place disclosed content is stored. It is append-only, `FORCE` row-level security,
and readable by exactly two principals: the delivery worker, and the recipient — the latter only
once an inbox row exists.

### Payload digest — `payload_digest`, `authorization_digest`, `composite_decision_digest`

SHA-256 over the canonical form, plus the N5-A and composite decision digests. Digests are not
content and carry no class of their own, but they BIND content: `payload_digest` is what makes a
retry provably byte-identical, and the composite digest is what an attempt row references instead of
the payload.

### Recipient identity — `recipient_participant_id` on subscriptions, artifacts and inbox

A participant registry reference, always an organization by generated column and composite foreign
key. **Participant identity is not tenant identity.** It is `PERSONAL` only where the underlying
participant is a person; the N6 recipient binding is constrained to organizations, so in practice
these columns carry organization identity.

### Inbox access — `network_disclosure_inbox`

The record that delivery SUCCEEDED. Readable by the delivery worker and by the recipient's own
tenant; invisible to every other tenant. An inbox row is the only thing that makes the corresponding
artifact visible to its recipient.

### Pending artifact invisibility

An artifact that has been authorized but not delivered is **invisible to its own recipient**. The
artifact read policy resolves visibility through the inbox, so `AUTHORIZED` and `DELIVERED` cannot be
confused by a reader. This is a data-handling property, not only an access-control one: an
undelivered artifact must not be readable, discoverable or countable by the party it was prepared
for.

### Attempt metadata — `network_delivery_attempts`

Attempt number, outcome, timestamps, failure category and the composite decision digest. **No
payload, no canonical bytes, no response body.** A failure record is metadata only; copying disclosed
content into it would create a second copy of that content governed by nothing and outside the
artifact whose authorization and digest the design binds together. A test asserts no column of that
table matches `payload|canonical|body|content|data|response|raw`.

The attempt outcome vocabulary is transport-only — `delivered`, `database_transient`,
`database_conflict`, `internal_error`. An authorization denial is not an attempt outcome: a refusal
terminates the delivery rather than attempting it, so a denial never produces an attempt row and
never contributes an error payload.

### No raw payload in error or debug storage

There is no dead-letter table, no replay store and no debug column anywhere in N6. Retry is bounded
and exhaustion TERMINATES the obligation rather than parking its content somewhere for later
re-emission.

### Logging

N6 emits no application log containing artifact content. The migration's own NOTICE output — the
cluster-global role retention message — names databases and reference counts, never payloads or
participants.

### Retention actually implemented

**None beyond the schema's own append-only guarantees**, and this is stated rather than implied.
Artifacts, attempts, deliveries, inbox rows, subscriptions and revocations are all append-only and
none is expired, pruned or archived by any implemented mechanism. The only implemented removal path
is the 0034 revert, which destroys delivery history wholesale and refuses to run without an explicit
operator acknowledgement when any exists.

A retention schedule for disclosed artifact bytes is an owner deliverable and is named in the
retention section below rather than assumed here.

## Retention

Not yet set. `00_MASTER_HANDOFF:227` places retention outside AI authority, and the package
specifies no periods. Retention schedules are an owner deliverable before any production data
exists.
