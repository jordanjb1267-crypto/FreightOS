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
payload contract, and there is currently no mechanism here that expresses "this contract carries
`PERSONAL` data". That gap is deliberate and is N5-B's: the network sensitivity ceiling attaches a
governed sensitivity to each `durable_schema_ref`, which is the right granularity for a per-contract
class.

### N5-B remains unresolved and is mandatory before N6

**N5-A does not authorize N6 publication.** The contract-level network sensitivity ceiling — its
vocabulary, its ordering, its per-schema assignments, and this register's network disclosure axis —
is not implemented. Until it is, no hard prohibition exists that a grantor cannot override, and no
external publication path may be accepted. See ADR-N0015.

## Retention

Not yet set. `00_MASTER_HANDOFF:227` places retention outside AI authority, and the package
specifies no periods. Retention schedules are an owner deliverable before any production data
exists.
