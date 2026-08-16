# Capability Graph Gap Map

Tests **H1** (capability as the commercial contract boundary, jobs/agents as implementation detail)
and **H2** (customers license only what they need without fragmenting the shared foundation).

## 1. Verdict

**H1: plausible, unproven, and blocked by a naming collision.** The idea is sound and matches how
the repository already separates _what a customer buys_ from _what a component may do_. But no
capability object exists in the repository, and the word `capability` is already taken by a runtime
authority primitive with the opposite polarity.

**H2: plausible, and partly contradicted by the accepted catalog.** The capability-pack model does
avoid a monolithic forced purchase. But 9 of 13 packs address products that are
`implementation_allowed: false` at Horizon 1, so "license only what you need" cannot be exercised
for most of the catalog.

## 2. What v1.8.1 proposes

`matrices/CAPABILITY_PACK_CATALOG.csv` — 13 capability packs:

| capability_id                       | Participant     | Target product state (`module_states.yaml`)    | Sellable at H1?                 |
| ----------------------------------- | --------------- | ---------------------------------------------- | ------------------------------- |
| `carrier.dispatch.core`             | Carrier         | `carrier_copilot` ACTIVE_BUILD                 | catalog target, sale prohibited |
| `carrier.documents.core`            | Carrier         | `carrier_copilot` ACTIVE_BUILD                 | catalog target, sale prohibited |
| `carrier.maintenance.coordination`  | Carrier         | `rigdesk_maintenance_hooks` ACTIVE_BUILD       | catalog target, sale prohibited |
| `facility.appointment.core`         | Facility        | `facilityos_lite` **PROMOTION_GATED**          | **no**                          |
| `facility.gate_dock.coordination`   | Facility        | `facilityos_lite` **PROMOTION_GATED**          | **no**                          |
| `facility.documents.core`           | Facility        | `facilityos_lite` **PROMOTION_GATED**          | **no**                          |
| `shipper.execution.visibility`      | Shipper         | `shipper_control_tower` **PROMOTION_GATED**    | **no**                          |
| `network.integration.volume`        | Network         | no module entry                                | undefined                       |
| `carrier.market_intelligence.core`  | Carrier         | FMI — no module entry                          | undefined                       |
| `facility.market_intelligence.core` | Facility        | FMI + **PROMOTION_GATED** facility             | **no**                          |
| `shipper.market_intelligence.core`  | Shipper         | FMI + **PROMOTION_GATED** shipper              | **no**                          |
| `broker.market_intelligence.core`   | Broker          | `digital_brokerage` **LEGAL_AND_MARKET_GATED** | **no**                          |
| `service.market_intelligence.core`  | Service/RigDesk | `rigdesk_maintenance_hooks` ACTIVE_BUILD       | catalog target, sale prohibited |

`schemas/product-capability.schema.json` defines the capability descriptor shape.

## 3. Gaps

### CAP-01 — The capability→job binding is unresolved _inside the package itself_

Ten of 13 rows set `illustrative_jobs` to a variant of **"determined by audit"**
(`v1.8 carrier workforce refs determined by audit`, `FMI workforce refs determined by audit`).
The catalog therefore does not yet bind a single capability to a single accountable job. H1 says
capability is the contract boundary _above_ jobs; that boundary cannot be evaluated until the
mapping exists. **This audit does not create the mapping** — doing so would promote 37
`AUDIT_CANDIDATE` books toward J0, which Section 5 prohibits. Recorded as owner decision **D-01**.

### CAP-02 — No capability object exists in the repository

`grep` over the 35 executed migrations returns no capability, product, SKU, or entitlement table.
The only `capability` in code is `packages/context/src/capabilities.ts`, which is the ADR-0019
runtime authority matrix — a _restriction_ keyed on `legal_authority_class × operating_context`,
not a commercial _grant_. Severity: this is the collision that makes CAP-03 dangerous.

### CAP-03 — Polarity collision on the word `capability` (conflict C-03)

|              | Runtime `Capability`                            | Commercial `capability`                  |
| ------------ | ----------------------------------------------- | ---------------------------------------- |
| Defined at   | `packages/context/src/capabilities.ts:44-58`    | `schemas/product-capability.schema.json` |
| Keyed on     | legal class × operating context                 | product / participant                    |
| Direction    | denies unless permitted; absence ⇒ fully denied | grants what was purchased                |
| Failure mode | fail-closed by construction                     | fail-open if read as permission          |

A future `hasCapability(...)` helper that resolves against the wrong registry is a single-identifier
mistake with an authority consequence. **Required change:** rename the commercial object before any
implementation — `entitled_capability`, `commercial_capability`, or `capability_pack` — and never
let the two share a resolver, a table, or a helper name.

### CAP-04 — Capability packs cross horizon boundaries

9 of 13 packs address `implementation_allowed: false` modules. A catalog that lists them as
purchasable capabilities, even provisionally, is a promise the repository cannot honour and that
`validate-scope.mjs` will not permit. **Required change:** the capability catalog must carry the
target module's state and inherit its gate, so a pack cannot be listed as sellable ahead of its
module. This is exactly the discipline `products.yaml` already applies via `build_state` +
`commercial_status`, and the capability catalog omits it.

### CAP-05 — No dependency graph despite REV-10

REV-10 requires "capability dependencies enforced". `CAPABILITY_PACK_CATALOG.csv` has no dependency
column. `carrier.market_intelligence.core` self-evidently depends on the FMI substrate and on
`carrier.dispatch.core` consuming it, but nothing expresses that. Scored REV-10 NOT_IMPLEMENTED.

### CAP-06 — "Foundation fragmentation" (H2) is not tested by any artifact

H2 asserts customers can license subsets without fragmenting the shared foundation. The shared
foundation is `freightos_shared_core` (ACTIVE_BUILD). No artifact in the package states which
capability packs require it, nor what happens to a customer licensing only
`facility.appointment.core`. The `enterprise-multi-twin-solution.json` and
`small-carrier-solution.json` fixtures show two shapes but assert no invariant about the shared
core. H2 is therefore **untested**, not refuted.

## 4. What the design gets right

- Capability is defined _above_ jobs, not as an agent identity — this is the correct direction and
  satisfies REV-03's intent. `activation_rule` on every row already names the conjunction
  (`entitlement + certification + authority + policy`), which is precisely the "entitlement is
  necessary but never sufficient" property REV-07 needs.
- The brokerage pack correctly inherits a stricter rule: `broker.market_intelligence.core` sets
  `activation_rule` to `brokerage legal activation gates + …`, acknowledging the v1.6 legal plane
  rather than treating brokerage as another SaaS pack.
- Splitting market intelligence into five participant-scoped packs, rather than one global
  "FMI" SKU, keeps the consumer authority boundary visible at the commercial layer.

## 5. Required changes before implementation

1. Rename the commercial capability object away from `capability` (**C-03**, blocking).
2. Add `target_module` + inherited gate state to every capability row; forbid listing a pack whose
   module is `implementation_allowed: false` (**CAP-04**).
3. Add an explicit `depends_on` column and a validator (**CAP-05**).
4. Resolve `illustrative_jobs` from "determined by audit" to named accepted jobs — owner decision
   **D-01**, and only after the 37 candidates are dispositioned.
5. State the shared-core requirement per pack and add a fixture that licenses exactly one pack
   (**CAP-06**).
