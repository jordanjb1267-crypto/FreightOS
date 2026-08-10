# ADR-N0005 — Network participant registry boundary

- **ADR ID:** N0005
- **Title:** What is a participant, what is not, and the N1 type taxonomy
- **Status:** Proposed — N0 governance wiring, awaiting external rereview
- **Date:** 2026-08-10
- **Related:** v1.4.0 `03_…IDENTITY_GRAPH.md`, `04_CANONICAL_LOGISTICS_DOMAIN_MODEL.md`, `schemas/participant-identity.schema.json`

## Context

`participant-identity.schema.json` fixes a closed enum: `organization, person, facility, device,
workload, agent, asset`. The canonical domain model separately names ~60 aggregates. Without a rule,
the registry becomes the table everything is added to, and "participant" stops meaning anything.

## Decision

### The test

An entity is a **network participant** if and only if it can be at least one of:

- the `source` of a network event;
- the `requester_id` or `represented_organization_id` of a command;
- the `grantor_id` or `recipient_id` of a consent grant;
- the `provider_id` of a capability advertisement;
- a member of a workflow's `participants`.

In one sentence: **a participant can act, be represented, or be granted to.** Everything else is an
object.

### The four-way distinction

| Concept                     | Definition                                          | Example                                                    | Registry                          |
| --------------------------- | --------------------------------------------------- | ---------------------------------------------------------- | --------------------------------- |
| **Network participant**     | Can act, be represented, or be granted to           | carrier org, facility operator, telematics workload, agent | `network_participants` (N1)       |
| **Logistics object**        | Acted _upon_; has lifecycle, not identity-authority | shipment, load, order, leg, stop                           | domain tables (N-later)           |
| **Asset**                   | Physical equipment; an _object_ by default          | trailer, container, chassis                                | asset tables (N-later)            |
| **Facility**                | A place; an object by default                       | a dock, a yard                                             | facility tables (N-later)         |
| **Authenticated principal** | A PostgreSQL role that authenticated                | `op_<hash>_alice`                                          | `authn.operator_binding` (exists) |

Two of these are deliberately dual-natured, and the rule is the same for both. A **facility** is an
object when it is a location on a stop, and a participant when it _operates_ — accepting
appointments, emitting gate events, holding a consent. An **asset** is an object when it is cargo
capacity, and a participant only when it carries a device or workload identity that emits events in
its own name. The dual nature is resolved by the acting test, not by the entity's category, and the
same real-world thing may hold both an object row and a participant row. It never holds one row
serving both purposes.

### N1 type taxonomy

N1 persists `participant_type` as a **closed enum carrying all seven schema values**. This is a
storage decision, not an activation decision: no type gains behavior in N1, and the registry stores
identity only.

The enum is complete from the start for a specific operational reason. `ALTER TYPE ... ADD VALUE`
cannot run inside a transaction block, which is precisely the constraint that shaped migration 0005
and is called out in ADR-0016. Shipping a two-value enum now would guarantee a non-transactional
migration later for a change that is already known. Matching the schema's closed enum also keeps the
database and the contract from disagreeing on day one.

Which types are _populated_ in N1 follows the first pilot, which is v1.4.0 decision 1 and remains
unresolved. `organization` is the only type any pilot certainly needs.

## Alternatives considered

**Model only `organization` in N1, add types later.** Rejected: guarantees a known future
non-transactional enum migration to avoid writing five enum labels today.

**Free-text `participant_type`.** Rejected: the schema declares a closed enum, and free text moves
validation from the database to whatever remembers to check.

**One table for participants and logistics objects with a discriminator.** Rejected for the reason in
ADR-N0003 — a single table invites a single lookup, and authority questions must never be able to
reach an object row by accident.

## Identity/authority impact

None. Registry rows are inert (ADR-N0003).

## Data ownership/privacy impact

A participant record is identity metadata. Its presence discloses that an entity is known to the
network; it discloses nothing the entity owns.

## Migration and rollback

N1 creates the tables; rollback drops them. No existing table is altered.

## Open decisions

First pilot and therefore the first populated participant types (v1.4.0 decision 1). Whether
`person` participants are needed at all in N1, given that humans already have layer-A identities.
