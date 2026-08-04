# ADR-0024 — Package paths and dependency direction

**Status:** Accepted (owner ruling H, Phase 1)
**Date:** 2026-08-04
**Relates to:** ADR-0001 (modular monolith), `21_SEQUENCING_DOCTRINE_AND_ACTIVE_SCOPE.md:157-185`

## Context

`21_…:159-171` lists nine `packages/` paths as "Allowed during Horizon 1", and `21_…:173-183`
lists seven prohibited `apps/` and `services/` paths, with an anti-rename clause at `21_…:185`.

None of the four packages Phase 0 actually created — `packages/config`, `packages/context`,
`packages/database`, `packages/schemas` — appears on the allowed list. Read strictly as an
exhaustive allowlist, the doctrine would have prohibited Phase 0's own foundation. Read as an
enumeration of the *modal and deferred-contract* packages specifically permitted, it is consistent
with what was built and merged.

Phase 1 adds substantially more packages, so the reading has to be settled rather than left to
inference.

## Decision

### Preserved Phase 0 packages

- `packages/config`
- `packages/context`
- `packages/database`
- `packages/schemas`

### Authorized Phase 1 package roots

- `packages/identity`
- `packages/parties`
- `packages/carrier`
- `packages/modal-core`
- `packages/mode-road`
- `packages/facility-primitives`
- `packages/rigreceipts-contracts`
- `packages/rigdesk-contracts`

`21_…:161-171` additionally permits `packages/facility-contracts/`,
`packages/autonomous-vehicle-contracts/`, `packages/mode-rail-contracts/`,
`packages/mode-ocean-contracts/`, `packages/brokerage-contracts/`, and
`packages/exchange-contracts/`. Those remain **permitted but not authorized for creation in
Phase 1** — the sequencing doctrine allows them; this ruling does not commission them. Creating one
requires its own decision.

### Rules

1. **No `apps/` directory in the initial domain PRs.**
2. **No `services/` directory.**
3. **No standalone FacilityOS package.** `packages/facility-primitives` is shared primitives —
   `config/scope/module_states.yaml:18` sets `standalone_product_allowed: false` for
   `FOUNDATION_ONLY`.
4. **Deferred integration packages contain contracts, schemas, fixtures, and simulation adapters
   only.** No live client, no credential, no network call.
5. **Database migrations remain under the existing reviewed migration system** —
   `packages/database/migrations/`, per ADR-0017. Domain packages do not carry their own
   migrations.
6. **Shared contract definitions must not be duplicated across packages.** One definition, one
   owner, imported everywhere else.
7. **Package ownership and dependency direction must be documented** — below.
8. **Circular dependencies are prohibited.**

### Dependency direction

Layered. A package may depend only on packages in a strictly lower layer. There are no
same-layer dependencies and no upward dependencies.

| Layer | Packages | May depend on | Owns |
| --- | --- | --- | --- |
| L0 | `config`, `schemas` | nothing in the workspace | Scope registry, autonomy ceiling, env validation; JSON Schemas and their validators |
| L1 | `context` | L0 | Legal authority class, operating context, capability matrix (ADR-0019), kill-switch resolution |
| L2 | `database` | L0, L1 | Migrations, migrator, session context, typed SQL access |
| L3 | `rigreceipts-contracts`, `rigdesk-contracts` | L0 only | External contract types, versions, simulators, fixtures |
| L4 | `identity`, `parties` | L0–L2 | Organization, legal entity, users, roles, service accounts; parties, locations, contacts |
| L5 | `carrier`, `modal-core` | L0–L4 | Carrier profiles, fleet, equipment, availability, assignments; mode-neutral freight core and the modal SDK |
| L6 | `mode-road`, `facility-primitives` | L0–L5 | Road adapter, extension schema, fixtures; facility primitives, appointments, visits, custody, detention |

Two consequences are load-bearing and easy to get wrong:

**External contract packages are leaves.** `rigreceipts-contracts` and `rigdesk-contracts` sit at
L3 depending only on L0, and the domain depends on *them*. The inverse — contract packages
importing `carrier` to reuse its cost-profile type — would make the boundary bidirectional and put
tenant domain types inside a package whose whole purpose is to model something FreightOS does not
own. Mapping between a contract DTO and a domain type belongs in the consumer.

**`modal-core` owns the mode-neutral freight core.** Ruling H authorizes no separate freight
package, and `21_…:162` already names `packages/modal-core/`. `Shipment`, `Consignment`,
`CargoItem`, `HandlingUnit`, `TransportJourney`, `TransportLeg`, `Stop`, `Milestone`,
`CustodyEvent`, `Exception`, and `Document` live there, alongside the modal adapter SDK.
`mode-road` depends on it; it never depends on `mode-road`.

### Enforcement

Dependency direction is asserted in CI, not merely documented. A check reads each package's
`package.json` workspace dependencies, maps them to layers, and fails on any same-layer or upward
edge — which also makes a cycle impossible to introduce.

`scripts/validate-scope.mjs` already fails on the seven prohibited paths
(`validate-scope.mjs:103-115`) and on deployable units whose names suggest a deferred capability
(`:120-134`). Rules 1 and 2 above are therefore already enforced for `apps/` and `services/`; this
ADR adds the layer check.

## Consequences

**Good.** The doctrine's package list is settled as an enumeration rather than an exhaustive
allowlist, which is the only reading consistent with the accepted Phase 0 baseline. Dependency
direction is mechanical rather than aspirational, so the modular monolith ADR-0001 requires stays
modular under twelve packages.

**Cost.** Layering forbids some convenient shortcuts. `rigreceipts-contracts` cannot import a
domain type, so a small amount of mapping code is written by hand in the consumer. That is the
intended trade: the alternative makes an external boundary depend on the domain it exists to
insulate.

**Recorded deviation.** This ADR reads `21_…:159-171` as non-exhaustive. If the owner intends it
as a strict allowlist, this ADR must be superseded and the four Phase 0 packages retroactively
justified — noted because the reading, not just the outcome, is what future phases will rely on.
