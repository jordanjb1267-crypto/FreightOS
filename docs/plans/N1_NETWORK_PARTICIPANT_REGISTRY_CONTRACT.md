# N1 — Network participant registry: implementation contract

**Status:** Proposed contract — N0 governance wiring. **N1 is not authorized by this document.**
**Gated by:** ADR-N0003, ADR-N0004, ADR-N0005, ADR-N0006, ADR-N0011
**Derived from:** v1.4.0 `03_NETWORK_PARTICIPANT_IDENTITY_GRAPH.md`, `schemas/participant-identity.schema.json`, `23_IMPLEMENTATION_ROADMAP_PR_SEQUENCE.md` PR 1

This is the acceptance contract N1 must satisfy. It creates nothing.

## Objective

Introduce canonical network identity — participants, their external aliases, and their relationships
— as **inert identity metadata**, so that later network capabilities have something to reference.
N1 activates no behavior.

## Scope

**In:** three tables — `network_participants`, `network_participant_aliases`,
`network_participant_relationships`; canonical UUIDv4 identifiers with immutability enforcement; the
seven-value participant type enum; lifecycle status; temporal validity and revocation; provenance
fields; ADR-0021 common record fields; nullable tenant scoping per ADR-N0011.

**Out, explicitly:** any HTTP or API surface · any PostgreSQL role · any change to RLS on existing
tables · any change to SECURITY DEFINER code · any change to migration-authority convergence · any
delegation or acting-authority model (ADR-N0003 layer C) · consent · events · commands · workflows ·
dispatch · marketplace · settlement · agents · any change to `audit_events`, `outbox_events`, or the
v1.2 event envelope.

## Primitives

### `network_participants`

| Column                               | Notes                                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                 | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` — the canonical network identifier (ADR-N0004), immutable                             |
| `participant_type`                   | closed enum: `organization, person, facility, device, workload, agent, asset` (ADR-N0005)                                          |
| `status`                             | closed enum: `pending, active, suspended, revoked` — matches `participant-identity.schema.json`                                    |
| `tenant_id`                          | `uuid NULL` — "is also a FreightOS tenant", **not** ownership (ADR-N0011); the departure from ADR-0021 must be justified in the PR |
| `represented_organization_id`        | `uuid NULL` self-reference — a facility or agent belonging to an organization                                                      |
| `display_name`                       | non-authoritative label                                                                                                            |
| `assurance_level`                    | nullable; verification is per-alias (ADR-N0006), this is a summary and grants nothing                                              |
| `valid_from` / `valid_until`         | temporal validity                                                                                                                  |
| `revoked_at` / `revoked_by`          | revocation, non-destructive                                                                                                        |
| `source_system` / `source_reference` | provenance of the assertion                                                                                                        |
| common record fields                 | `created_at/by`, `updated_at/by`, `record_version` per ADR-0021                                                                    |

### `network_participant_aliases`

`participant_id` → `namespace` (controlled) → `value` (verbatim) → `verification_status`
(`unverified, self_asserted, verified, suspended`) → provenance → temporal validity → revocation.
Uniqueness is `(namespace, value, participant_id)`, with at most **one active** binding per
`(namespace, value)` at any instant; history retained (ADR-N0006).

### `network_participant_relationships`

`from_participant_id` → `relationship_type` → `to_participant_id`, with origin, verification,
effective interval, revocation state, and evidence reference placeholder. Time-bounded and
first-class, per `03_…IDENTITY_GRAPH.md` §3.

## The central security invariant

> **Network participant presence must not confer authority.**

## Required mutation test

Create and manipulate participant, alias and relationship rows that attempt to impersonate or borrow
a privileged identity. At minimum:

1. A participant whose `display_name` matches an administrator's operator role name.
2. An alias in a plausibly authoritative namespace (`usdot`, `ein`) matching a real administrator's
   identifier.
3. A relationship asserting the participant is related to a privileged participant.
4. A participant with `tenant_id` set to another tenant's id.
5. A participant with `status = 'active'` and `assurance_level` at its maximum.

**Expected in every case: no change** in authenticated permissions, in
`app.user_has_permission` / `app.service_account_has_permission` outcomes, in privileged-operation
authorization, or in what any session can read. The assertion must name the privilege that did _not_
change — not merely that a query returned rows.

## Additional acceptance gates

| Gate                      | Evidence                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical ID immutability | `UPDATE` of `id` rejected                                                                                                                         |
| Uniqueness                | duplicate `(namespace, value)` active binding rejected by constraint                                                                              |
| Alias non-authority       | verified alias grants nothing (mutation above)                                                                                                    |
| Revocation                | revoked alias/relationship stops resolving for new work; history stays attributable                                                               |
| Alias reassignment        | same `(namespace, value)` may move participants over time without rewriting history                                                               |
| Tenant isolation          | participant with `tenant_id IS NULL` not readable by an ordinary tenant session by default; cross-tenant relationship grants no counterparty data |
| No new principal          | no `CREATE ROLE` in the migration; role/ACL diff is zero                                                                                          |
| Convergence untouched     | migration-authority convergence unchanged; fresh-cluster regression still green                                                                   |
| Up/down parity            | exercised down path; `migration-path-parity` green                                                                                                |
| Existing suite            | full integration suite unchanged and green                                                                                                        |

## Rollback

A down migration dropping the three tables and their enums. Nothing else is touched, so rollback is
total and no other object depends on them.

## Open decisions blocking N1 start

1. **First pilot** (v1.4.0 decision 1) — determines which participant types are populated.
2. **Namespace vocabulary** for aliases — enum or reference table (ADR-N0006 open decision).
3. Confirmation that the ADR-0021 `tenant_id NOT NULL` departure is accepted as scoped in ADR-N0011.
