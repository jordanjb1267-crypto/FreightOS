# ADR-N0003 — Network identity separation

- **ADR ID:** N0003
- **Title:** Four identity layers, and the zero-authority rule for network participants
- **Status:** Proposed — N0 governance wiring, awaiting external rereview
- **Date:** 2026-08-10
- **Related:** v1.4.0 `03_NETWORK_PARTICIPANT_IDENTITY_GRAPH.md`, `13_AGENT_TO_AGENT_COORDINATION_PROTOCOL.md`; ADR-0020 control-plane access; ADR-0026 identity implementation decisions; ADR-0027 verified actor binding

## Context

The security model this repository already enforces resolves authority from an **authenticated
PostgreSQL principal**. `session_user` is set by PostgreSQL authentication and no statement can
change it; `authn.operator_binding` maps that role to a FreightOS user; `app.session_binding`
anchors the verified session; `freightos_admin` carries the administrative _capability_ and is not
an identity. SR-2 exists because an earlier design let a caller _name_ an actor, and naming is not
authentication.

Network architecture v1.4.0 expands the population that can appear in a logistics interaction to
organizations, facilities, service providers, external applications, partner systems, workloads,
devices, agents and delegates. Almost none of these will ever hold a PostgreSQL login.

The failure this ADR is written to prevent is the obvious one: a `network_participants` row that
starts being treated as authorization evidence because it exists and the name matches.

## Decision

Four layers, never collapsed:

**A. Authenticated security principal.** A PostgreSQL role that authenticated. The only source of
authority. Established by `session_user`, bound through `authn.operator_binding`, anchored by
`app.session_binding`. Unchanged by anything in the network layers.

**B. Network participant.** A durable network identity — organization, facility, workload, device,
agent, asset, person-as-participant. Addressable: it can be the `source` of an event, the
`represented_organization` of a command, the grantor or recipient of a consent, the provider of a
capability. **It authenticates nothing and authorizes nothing.**

**C. Acting authority / delegation.** An explicit, time-bounded, revocable grant that lets an
authenticated principal (A) act with respect to a participant (B), within a stated scope. Authority
flows only through this layer, and a delegation may be narrower than the delegator's own authority —
never wider.

**D. Domain / beneficial party.** The commercial or legal party a record refers to — shipper of
record, bill-to party, consignee. A _field on a logistics object_, not an identity that can act.

### The invariant

> **Creating or possessing a network participant record confers zero security authority.**

A participant is not authorization evidence. Authorization continues to derive from the
authenticated principal plus explicitly granted or delegated capability under the existing model. No
lookup may resolve authority _from_ a participant row, an alias, or a relationship. Concretely, this
forbids: `WHERE participant.name = current_setting('app.actor_id')`, treating an alias match as
identity proof, and any policy that reads layer B where it should read layer A.

### What is preserved without exception

`session_user` as trust anchor · `freightos_admin` as capability not identity · per-operator LOGIN
identities · protected operator-to-user bindings · service identity boundaries · SECURITY DEFINER
owner isolation · pinned `search_path` · authority and provenance anti-spoofing · authority-table DML
restriction · protected audit provenance · tenant isolation via RLS.

## Alternatives considered

**Extend `users` to cover network participants.** Rejected: `users` is tenant-scoped and sits inside
the authorization graph, so every external organization would arrive already inside the blast radius
of the permission model, and the four-column isolation predicate would have to be relaxed to admit
rows with no tenant.

**Make every participant an authenticated principal.** Rejected: it would require a PostgreSQL role
per external organization, facility and device — cluster-global objects, under the migration
authority convergence contract, created for entities that never connect. It also inverts the trust
direction: network presence would mint credentials.

**One identity table with a `kind` discriminator spanning A and B.** Rejected: a single table
invites a single lookup, and the first convenient join is the breach.

## Identity/authority impact

No existing authority path changes. Layer B is additive and inert. Layer C does not exist yet and is
not authorized by this ADR.

## Data ownership/privacy impact

Participants carry identity, not operational data. Discoverability of a participant implies no access
to anything it owns (see ADR-N0011).

## Event/command/workflow impact

Envelopes reference layer B for _who is represented_ and layer A for _who authenticated_. Both are
required; neither substitutes for the other. An event whose `source` is a participant is a claim
about origin, not proof of authority.

## Migration and rollback

None in N0. N1 introduces layer B tables; rollback is a down migration dropping them, with no effect
on layers A, C or D.

## Acceptance evidence

The N1 mutation test named in `docs/plans/N1_NETWORK_PARTICIPANT_REGISTRY_CONTRACT.md`: create and
manipulate participant, alias and relationship rows attempting to borrow an administrator identity,
and prove authenticated permissions and privileged-operation authorization are unchanged.

## Open decisions

Layer C's grant model is deliberately unspecified here; it is not required by N1 and will be its own
ADR when delegation is authorized.
