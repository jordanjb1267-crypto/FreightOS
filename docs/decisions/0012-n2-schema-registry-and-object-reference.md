# ADR-N0012 — N2 schema registry and logistics object reference

- **ADR ID:** N0012
- **Title:** The schema registry is repository-native; the object reference is a validated contract
- **Status:** Accepted — owner decisions D1–D4, N2 workstream
- **Date:** 2026-08-10
- **Related:** ADR-N0010 (network kernel bounds), ADR-N0007 (envelope versioning), ADR-N0006
  (external alias model), v1.4.0 `20_NETWORK_GOVERNANCE_VERSIONING_AND_CONFORMANCE.md`,
  `04_CANONICAL_LOGISTICS_DOMAIN_MODEL.md`, `25_DECISIONS_REQUIRED.md` decision 8
- **Resolves the open decisions ADR-N0010 recorded against kernel elements 3 and 6.**

## Context

ADR-N0010 assigned two kernel elements to N2 and left two questions open against them, verbatim:

> Whether element 6 is a build or a buy (v1.4.0 decision 8). Whether element 3 needs storage at all
> in N2 or remains a validated contract until a domain aggregate exists.

Both were genuinely unanswerable from the controlling documents. `25_DECISIONS_REQUIRED.md` lists
"Schema registry implementation?" as decision 8 and states that implementation "should not invent
these decisions silently". Two further questions surfaced while implementing N2 and are recorded
here for the same reason: the durable serialization of `schema_ref`, and the governance status of
`object_type`.

This ADR records the owner's rulings. It does not restate the implementation, which lives in
`packages/schemas/src/network.ts`.

**The historical fact that these were open is deliberately preserved.** ADR-N0010 is unchanged, and
this record supersedes its open-decisions section by reference rather than by editing it.

## Decision

### D1 — The canonical schema registry is repository-native

The registry is `@freightos/schemas`. It is **built, not bought**: no PostgreSQL registry table, no
external managed schema-registry service, no broker-vendor registry, no network dependency for
validation, and no runtime registration API.

This is the **complete** N2 implementation of kernel element 6. A database-backed registry is not an
unfinished N2 obligation.

If N3 later shows that durable event or journal records require referential integrity against a
schema reference, N3 may propose a database projection — for example `network_schema_versions` — but
only on that evidence, and any such projection must derive from the canonical package registry, must
not become a second source of truth, and must not permit ordinary runtime mutation of governed
schema definitions.

Future transport infrastructure may integrate with a broker or vendor registry where operationally
justified. Such a service is a **distribution and transport integration**, never the canonical
governance source. The repository-governed contracts remain authoritative.

### D2 — Logistics object references are validated, never persisted

N2 stores no object references. The object reference is a **validated contract and serialization
primitive** only.

The reason is ADR-N0010's own: element 3 "is a _reference format_, and no domain aggregate yet
exists to reference". No `network_objects`, `logistics_objects`, `object_registry` or
`object_references` table is created, and no polymorphic trigger pretends that `object_type` plus an
identifier has referential integrity to tables that do not exist. Claiming integrity that the
database cannot enforce is worse than declining to claim it.

Later domain-model work determines whether durable object identity needs an object registry, direct
aggregate identity, or another governed mechanism.

### D3 — Durable `schema_ref` serialization is deferred to N3

N2's canonical registry identity is the **declared `$id` plus an explicit version**, and N2 resolves
and validates using that pair.

N2 does **not** decide what a durable network event's `schema_ref` field serializes to. It is not
declared to be the raw `$id`, a `freightos://` URI, a filesystem path, a registry key, or `latest`.
N3 owns that decision because N3 owns the durable network envelope, the event journal, schema
referential integrity and historical replay behaviour, and the answer has to satisfy all four at
once.

What N2 guarantees for N3 is an explicit API that resolves an exact registered contract by
`{id, version}` without requiring a serialization decision today.

### D4 — `object_type` is syntactic in N2, not governed vocabulary

The v1.4 contract defines `object_type` as a non-blank open string and N2 preserves that exactly. No
PostgreSQL enum, no TypeScript enum, no reference table, no hardcoded allow-list, and no `other` or
`unknown` escape value.

Strings appearing in tests — `shipment`, `railcar`, `vessel_voyage`, `flight`, `trailer` — are
**validation examples demonstrating mode-neutrality**. They are not canonical FreightOS types and
nothing may treat them as approved vocabulary. `network-schema-packaging.test.ts` asserts that none
of them appears in the registry module, so an example cannot quietly become a frozen vocabulary.

A future canonical logistics domain-model workstream governs object-type semantics: canonical code,
aggregate meaning, identity lifecycle, mode neutrality, source of truth, correction semantics and
external-standard alias mapping. N2 does none of those things.

## Alternatives considered

**A database schema registry in N2.** Rejected under D1. Nothing in N2 references a schema from a
durable row, so the table would have no reader; and a registry table invites runtime mutation of
governed contracts, which is the property the content lock exists to prevent. The option is not
foreclosed — it is conditioned on N3 evidence.

**Buying a managed schema registry as the canonical source.** Rejected under D1. It would move the
authoritative definition of a FreightOS contract outside the repository that governs it, breaking
the manifest-and-review chain that `check-network-governance.mjs` enforces.

**A durable object-reference table now.** Rejected under D2. Every candidate design either needs a
polymorphic foreign key the database cannot enforce, or needs the domain aggregates that do not yet
exist.

**Choosing a `schema_ref` URI shape in N2.** Rejected under D3 as premature: the shape is determined
by what the journal must store and replay, and neither exists.

**Seeding a minimal `object_type` vocabulary.** Rejected under D4. N2 creates no domain aggregates,
so the narrowest correct vocabulary is none, and any list written now would be speculation frozen
into a governed artifact.

## Security impact

None. N2 adds no database object, no PostgreSQL role, no SECURITY DEFINER function, no RLS or ACL
change, and no ingress. The central invariant is structural: **registering a schema or constructing
an object reference confers zero authority.** The registry takes no database dependency, exposes no
object resolver, and its entire result surface is a validity boolean and an error list — so naming
an object in another tenant is exactly as valid, and exactly as powerless, as naming your own.

N1's invariant is untouched: network participant presence still confers zero security authority.

## Migration and rollback

None. N2 adds zero migrations. Rollback is reverting the package change.

## Open decisions

Carried forward deliberately, and owned elsewhere:

1. **What exact value does a durable v1.4 network-event `schema_ref` serialize to?** — N3, together
   with envelope compatibility, journal storage, schema referential integrity and replay.
2. **Canonical `object_type` semantics** — the canonical logistics domain-model workstream.
3. **Whether a `network_schema_versions` projection is needed** — N3, on evidence only.
4. The v1.4 prose uses `com.freightos.*` event type examples while the v1.2 contract enforces
   `^rig\.freight\.…`. The two are independently versioned under ADR-N0007 and are deliberately not
   reconciled here; N3 owns the network event type and profile decision.
