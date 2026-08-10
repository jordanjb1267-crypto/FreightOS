# ADR-N0011 — `tenant_id` and network organization are not the same thing

- **ADR ID:** N0011
- **Title:** Tenant is the security boundary; organization is a network identity
- **Status:** Proposed — N0 governance wiring, awaiting external rereview
- **Date:** 2026-08-10
- **Related:** ADR-0006 (PostgreSQL RLS), ADR-0021 (common record fields), v1.4.0 `03_…IDENTITY_GRAPH.md`, `08_DATA_SOVEREIGNTY…`
- **Binds N1.**

## Context

`tenant_id` is the RLS discriminator. It is `NOT NULL` on every tenant-owned table, it is the
predicate every isolation policy is written against, and ADR-0021 requires it on every persisted
mutable record. It is a **security isolation mechanism**.

The v1.4 network envelope carries `organization_id` and no tenant at all. An organization is a
**network identity**: a carrier, a shipper, a facility operator — something that can be represented,
granted to, and referenced by a counterparty.

These are close enough to be conflated, and conflating them would be expensive in one direction
specifically: if `tenant_id == organization_id`, then representing an external carrier that is not a
FreightOS customer requires minting a tenant for it, which puts a non-customer inside the isolation
boundary and gives it a row in every tenant-scoped table's policy evaluation.

There is also a direct mechanical tension to resolve now rather than discover in N1: **ADR-0021
requires `tenant_id NOT NULL`, and an external organization has no tenant.**

## Decision

**`tenant_id` ≠ `organization_id`. Never define them as equal, and never derive one from the other.**

|             | `tenant_id`                            | network organization                              |
| ----------- | -------------------------------------- | ------------------------------------------------- |
| Purpose     | Security isolation                     | Network identity                                  |
| Enforced by | RLS policies, FORCE ROW LEVEL SECURITY | Nothing — it is inert (ADR-N0003)                 |
| Required    | On every tenant-owned record           | Only where a network artifact names a participant |
| Population  | FreightOS customers                    | Any network entity, customer or not               |

### Cardinality

- One tenant → **many** network participants. A customer legitimately has one tenant and several
  network identities (an enterprise, its operating authorities, its facilities).
- A network participant **may have no tenant.** External organizations that are known to the network
  but are not FreightOS customers are the normal case, not an edge case.
- A network participant is never _shared_ between tenants as a single row with two owners.

### Resolving the ADR-0021 tension

`network_participants` is **not a tenant-owned operational record**. It is network identity metadata,
and its tenant column is therefore **nullable** — `tenant_id uuid NULL`, meaning "this participant is
also a FreightOS tenant" rather than "this row belongs to a tenant".

This is a deliberate, narrow departure from ADR-0021's `NOT NULL` requirement, and it must be
justified in N1 rather than assumed. It carries a consequence that N1 must handle explicitly: a
nullable discriminator cannot carry the standard `tenant_id = current_setting(...)` policy, so N1
must state and test its own read model rather than inheriting one. The alternative — minting a tenant
for every external organization — was rejected because it dissolves the meaning of tenant.

### Relationships across tenants

Participant relationships may cross tenant boundaries. **They convey no data authority.** A
relationship states that two participants are related; it grants nothing. Tenant isolation remains
the security boundary and RLS remains its enforcement. Any future cross-tenant _data_ access requires
consent (`08_…`), delegation (ADR-N0003 layer C), and its own evidence — none of which exist, and
none of which a relationship row may substitute for.

### Discoverability

A participant being visible on the network implies **no** access to what it owns. Discoverability and
access are separate decisions with separate controls.

## Alternatives considered

**`tenant_id == organization_id`.** Rejected: forces a tenant for every external counterparty and
puts non-customers inside the isolation boundary.

**`network_participants.tenant_id NOT NULL`, with a sentinel tenant for external parties.** Rejected:
a shared sentinel is a single RLS bucket holding unrelated external organizations, which is the
isolation failure the sentinel was meant to avoid.

**Separate tables for internal and external participants.** Rejected: it duplicates the alias and
relationship model, and an organization that later becomes a customer would have to migrate rows and
change identity — exactly what ADR-N0004 immutability forbids.

## Data ownership/privacy impact

Keeps discoverability, ownership, visibility and disclosure as four separate concepts. Tenant
isolation is unchanged and unweakened.

## Migration and rollback

None in N0. N1 introduces the nullable column with its justification and its own read-model tests.

## Acceptance evidence

N1 must prove: a participant with `tenant_id IS NULL` is not readable by an ordinary tenant session
by default; a cross-tenant relationship grants no read of the counterparty's tenant-owned data; no
policy anywhere resolves authority from a participant row.
