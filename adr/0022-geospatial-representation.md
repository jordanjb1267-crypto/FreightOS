# ADR-0022 — Geospatial representation without PostGIS in Phase 1

**Status:** Accepted (owner ruling G, Phase 1)
**Date:** 2026-08-04
**Extends:** ADR-0016 (infrastructure baseline), which pins PostgreSQL 16 and selects no
geospatial extension

## Context

ADR-0016 fixed the database at PostgreSQL 16 and said nothing about spatial capability. Phase 1
needs locations and facilities with coordinates: `05_MULTIMODAL_DOMAIN_AND_ADAPTERS.md:13` lists
`Location` and `Facility` among the universal entities, and
`19_PHYSICAL_LOGISTICS_AND_AUTONOMOUS_MOBILITY.md:236` insists a facility is not represented only
as a latitude/longitude or generic stop.

Nothing in Phase 1 performs a spatial query. Route facts are ingested or entered, not computed —
routing is an unregistered integration (`11_INTEGRATIONS_API_EDI_AND_MCP.md:19`,
`docs/governance/INTEGRATION_REGISTRY.md`). Ranking, planning, and optimization are Phase 2.

Adopting PostGIS now would pin an operational dependency — extension availability in every
environment, version compatibility, backup and restore behaviour, and a migration surface — for no
Phase 1 benefit.

## Decision

**Do not introduce PostGIS in Phase 1.**

### Representation

| Element | Form |
| --- | --- |
| Latitude | `numeric(9,6)`, `CHECK` bounded to [-90, 90] |
| Longitude | `numeric(9,6)`, `CHECK` bounded to [-180, 180] |
| Postal address | Structured: line 1, line 2, locality, region, postal code, ISO 3166-1 alpha-2 country. A nullable unstructured field preserves what was received when parsing fails, so ingestion never loses data |
| Time zone | IANA identifier. **Mandatory** wherever operating hours or a detention clock apply — ADR-0025 arithmetic is wrong without it |
| Geohash or normalized location key | Optional, for cheap coarse bucketing and duplicate detection |
| External-provider identifier | Opaque `text` per provider, so a third-party place identity can be recorded without adopting its model |
| Source and verification metadata | `geo_source`, `geo_precision ∈ {exact, rooftop, centroid, postal, city, unknown}`, `observed_at`, `verified_at` |

Provenance is not optional. `02_GOVERNANCE_AND_NON_REGRESSION.md:85` forbids inventing facility
geometry, clearances, or restrictions, so a coordinate with no source is a coordinate that must not
be stored.

### Phase 1 may support

- Exact coordinate storage
- Simple bounding-box filters
- Deterministic distance **inputs supplied by** a governed routing provider or a fixture

### Phase 1 may not claim

- Spatial route optimization
- Geofencing
- Complex polygon operations
- Spatial nearest-neighbor search
- PostGIS-backed routing

The distinction that matters: Phase 1 may *store and echo* a distance it was given, with its
source recorded. It may not *derive* one. A profitability calculation that consumes a distance
must be able to name where the distance came from.

### Reconsideration gate

This decision is revisited — by a superseding ADR, not by an implementation choice — before
either of:

1. Phase 2 routing, ranking, or multi-load planning work begins; or
2. any feature that demonstrably requires spatial indexing is specified.

"Demonstrably" means a written case showing that bounding-box filtering plus provider-supplied
distances cannot serve the requirement, with the query patterns and cardinalities that make it so.
Convenience is not a demonstration.

## Consequences

**Good.** No extension dependency in Phase 1, so environment parity between CI, the non-Docker
local cluster (`scripts/dev-postgres.sh`), and any eventual managed PostgreSQL is trivially
maintained. Coordinates carry precision and provenance, which is what
`02_…:85` actually requires and what a bare `geography` column would not have supplied on its own.
Adding PostGIS later is additive: a new column and a backfill, not a remodel.

**Cost.** Bounding-box filtering on `numeric` columns is coarser and slower than a GiST index on a
`geography` type, and correct great-circle distance cannot be computed in the database. Both are
acceptable because Phase 1 computes no distance and runs no proximity search. If Phase 2 needs
either, the gate above is the place to pay the cost deliberately.

**Risk accepted.** A team could quietly implement approximate distance arithmetic in application
code to work around the absence. That would be a derived distance with no provenance, which
Specification 3 and this ADR both prohibit. The Phase 1 test suite must assert that
`road_route_facts.route_source` is non-null on every row, which makes the workaround visible.
