# 12 — Product, Module, Onboarding and Deployment Coherence

## 1. The question §15 asks

Can the architecture be productized for ten customer types **without customer-specific forks**?
Different customer behaviour must resolve through configuration, capability packs and policies —
not forked product logic.

## 2. The no-fork doctrine is real and consistently stated

This is one of the corpus's strongest through-lines. It appears as a named invariant in all three
graph contracts (`customer_specific_behavior_is_configuration_first` /
`customer_specific_behavior_configuration_first`), as a constitutional article
(v1.5 `01_` Article VI — "No customer forks"), as a master-handoff mandate
(v1.5 `00_:2` "Customer-specific without customer forks"), and as an acceptance gate
(v1.5 `16_` EA-25 "Customer-fork prevention").

v1.5's mandate statement is the clearest expression of the product thesis:

> "Deploy a customer-specific FreightOS agent organization that can understand, explain, and safely
> automate the customer's logistics operations—from a one-truck owner-operator's back office to a
> multinational multimodal carrier's dispatch, maintenance, roadside, documentation, exception, and
> coordination workflows—without creating customer-specific code forks."

The mechanism is coherent across packages: an Operational Twin holds customer-specific
configuration as approved facts; an Agent Organization Factory composes a workforce from it;
capability packs carry mode-specific extensions; policies carry thresholds. Nothing about the design
requires a fork.

Status: **DESIGN_COMPLETE as doctrine.**

## 3. Onboarding and go-live are genuinely designed

| Package    | Document                                    | Lines | Content                                                                                                                                                                                                                                                                                        |
| ---------- | ------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1.5       | `15_CUSTOMER_IMPLEMENTATION_AND_GO_LIVE.md` | 115   | 4 tiers (Fast Start / Standard / Enterprise / Strategic-Dedicated), a universal implementation sequence from Phase 0 commercial scope through discovery, connectivity, workflow mapping, shadow, approval-to-execute and rollout, plus a Fast Start target experience and enterprise artifacts |
| FacilityOS | `20_CUSTOMER_IMPLEMENTATION_AND_GO_LIVE.md` | 61    | 9 phases, 0 Scope → 1 Facility discovery → 2 Systems → 3 Workflow mapping → 4 Agent organization → 5 Shadow → 6 A3 → 7 A4 → 8 Network expansion                                                                                                                                                |
| v1.6       | `21_CUSTOMER_IMPLEMENTATION_AND_GO_LIVE.md` | 64    | 4 tiers (Solo/Small Broker → Standard → Enterprise 3PL → Strategic Dedicated), phases 0 Legal/commercial scope → 1 BOT discovery → 2 Connectivity → 3 Workflow mapping → …                                                                                                                     |
| v1.7       | `14_ADOPTION_AND_ONBOARDING_FACTORY.md`     | 73    | universal onboarding graph, small vs enterprise paths, onboarding agents, success metric                                                                                                                                                                                                       |

Each also ships a go-live checklist template and an intake template
(`templates/company_intake.yaml`, `facility_intake.yaml`, `brokerage_intake.yaml`).

The **shadow → approval-to-execute → bounded autonomy** progression is consistent across all four
and matches the J-ladder and the A-ladder. That consistency is real and worth crediting: three
independently authored packages converged on the same go-live shape.

## 4. Coverage by customer type

| #   | Customer type             | Onboarding                                                                                        | Twin                                          | Config | Integration         | Roles | Policies | Workflow selection | Agent org                                | Shadow | A2E | Certification | Go-live | Support | Deployment topology            |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------ | ------------------- | ----- | -------- | ------------------ | ---------------------------------------- | ------ | --- | ------------- | ------- | ------- | ------------------------------ |
| 1   | Owner-operator            | **yes** (v1.5 Fast Start; v1.7 `07_:24-34`)                                                       | COT minimal (`02_:8` "Minimal one-truck COT") | yes    | yes                 | yes   | yes      | yes                | yes (`03_:5` small-customer composition) | yes    | yes | generic       | yes     | partial | yes                            |
| 2   | Small carrier             | yes                                                                                               | yes                                           | yes    | yes                 | yes   | yes      | yes                | yes                                      | yes    | yes | generic       | yes     | partial | yes                            |
| 3   | Enterprise carrier        | yes (v1.5 `12_`, `15_`)                                                                           | COT mega-carrier (`02_:9`)                    | yes    | yes                 | yes   | yes      | yes                | yes (`03_:6`)                            | yes    | yes | generic       | yes     | partial | yes (cell architecture, `12_`) |
| 4   | Licensed broker           | yes (v1.6 `21_`)                                                                                  | BOT                                           | yes    | yes                 | yes   | yes      | yes                | yes (`03_`)                              | yes    | yes | generic       | yes     | partial | yes                            |
| 5   | Multi-branch brokerage    | yes                                                                                               | BOT + `businessTopology`                      | yes    | yes                 | yes   | yes      | yes                | yes (`17_` branch/book)                  | yes    | yes | generic       | yes     | partial | yes                            |
| 6   | Single facility           | yes (FacilityOS `20_`)                                                                            | FOT                                           | yes    | yes                 | yes   | yes      | yes                | yes (`03_`)                              | yes    | yes | generic       | yes     | partial | yes                            |
| 7   | Multi-facility enterprise | yes (FacilityOS `16_`)                                                                            | FOT + `siteIds`                               | yes    | yes                 | yes   | yes      | yes                | yes                                      | yes    | yes | generic       | yes     | partial | yes                            |
| 8   | Shipper                   | **outline only** — v1.7 `10_`, 52 lines, "architecture definition, not current module activation" | **no SOT schema**                             | no     | no                  | no    | no       | no                 | no                                       | no     | no  | no            | no      | no      | no                             |
| 9   | Service provider          | **outline only** — v1.7 `11_`, 46 lines                                                           | **no SPOT schema**                            | no     | no                  | no    | no       | no                 | no                                       | no     | no  | no            | no      | no      | no                             |
| 10  | Non-native counterparty   | **yes** — v1.7 `15_` three participation levels                                                   | n/a by design                                 | n/a    | yes (EDI/API/email) | n/a   | n/a      | n/a                | n/a                                      | n/a    | n/a | n/a           | n/a     | partial | n/a                            |

**Seven of ten customer types are productizable at the design level. Two (shipper, service
provider) have no productization design at all. The tenth (non-native counterparty) is well
handled by a different mechanism.**

## 5. The non-native counterparty model is a genuine strength

`v1.7 15_INTEGRATION_AND_COUNTERPARTY_ADOPTION.md` defines three participation levels:

```text
Level 1 — External   : email/link/EDI/API. No native FreightOS product required.
Level 2 — Connected  : verified participant identity + integrations + network events.
Level 3 — Native     : Operational Twin + Agent Organization + native application.
```

with a migration path (External → sees lower-friction interactions → connects API/EDI → gains
participant identity/history → adopts native automation when value is clear) and the correct
strategic rationale at `:32`: "The network should not require simultaneous multi-sided adoption."

This solves the hardest commercial problem in a network product — the cold-start requirement for
bilateral adoption — and it does so coherently with the accepted network layer, where the
participant registry (migration 0028) already distinguishes participants from authenticated
principals and ADR-N0011 already establishes that a relationship conveys no data authority.

Status: **DESIGN_COMPLETE** as a strategy. Conformance detail (what an adapter must implement per
level) is `DESIGN_PARTIAL`.

## 6. Where productization would actually force a fork

Fork risk does not come from the onboarding design. It comes from three gaps found elsewhere in
this audit:

**(a) No capability pack instance exists.** `v1.5 contracts/capability_pack.schema.json` is a real
contract requiring `packId, version, mode, objects, events, commands, workflows, conformanceSuite`.
`find` across the repository returns **zero** pack instances — no road pack, no rail pack, no ocean
pack. The mechanism designated to absorb mode-specific variation without forking has no instances,
so the first customer needing a non-default behaviour has nothing to configure.

**(b) The action vocabulary is not canonical.** A customer-specific policy must gate a
customer-specific action. With three unreconciled vocabularies and no per-action authority
attributes ([06](06_ACTION_COMMAND_POLICY_VOCABULARY_AUDIT.md)), a policy cannot be written against
a command.

**(c) 40 of 76 jobs have nothing to configure.** "Customer-configurable behavior" is a section in
all 76 job books, listing the same seven generic items (business hours/time zones, escalation
targets, notification preferences, workflow-specific thresholds, approved integrations,
job-specific commercial/operational preferences). For the 40 stub jobs there is no underlying
behaviour for those knobs to modulate.

## 7. Module state vs productization claim

The onboarding designs describe go-live for customer types whose modules are gated:

| Customer type                               | Module                                                                          | State           | Can go live today?                            |
| ------------------------------------------- | ------------------------------------------------------------------------------- | --------------- | --------------------------------------------- |
| Owner-operator / small / enterprise carrier | `carrier_copilot`, `carrier_core`, `road_ftl_carrier_operations`                | ACTIVE_BUILD h1 | design permits; A3 ceiling; no runtime exists |
| Single / multi facility                     | `facilityos_lite` PROMOTION_GATED, `facilityos_full` CUSTOMER_GATED             | ≥h2 / ≥h3       | **no**                                        |
| Licensed / multi-branch broker              | `digital_brokerage` LEGAL_AND_MARKET_GATED, `BROKERAGE_EXECUTION_ENABLED=false` | ≥h3             | **no**                                        |
| Shipper                                     | `shipper_control_tower` PROMOTION_GATED                                         | ≥h2             | **no**                                        |
| Service provider                            | _(no module entry at all)_                                                      | —               | **no**                                        |

`minimum_facility_primitives` is `FOUNDATION_ONLY` at h1, which permits production code but not a
standalone product and limits live external writes to the active product workflow. So a facility
_primitive_ may be built inside the carrier product; a facility _product_ may not.

Service provider is the notable omission: it has **no entry in `config/scope/module_states.yaml`
at all**. Every other participant plane has an explicit state and horizon. A plane with 10 job
books, a v1.7 route, and a declared legal plane has no module state, and therefore no gate, no
horizon and no promotion path.

## 8. Deployment topology

`v1.5 12_ENTERPRISE_SCALE_AND_CELL_ARCHITECTURE.md` (108 lines) is substantive: one logical product,
tenant topology, placement tiers, partition keys, control vs data plane, high-volume principles,
capacity, noisy-neighbour controls, data residency. `v1.7 16_COMMERCIAL_AND_DEPLOYMENT_MODEL.md`
(64 lines) adds product architecture, deployment tiers, billing principles, separated
legal/commercial revenue, and licensing/entitlements.

Together these are `DESIGN_PARTIAL` — the concepts are named and the reasoning is sound, but
partition keys are named without being defined, and no contract carries one. That matters for the
ownership-at-scale gap in [05](05_WORKFLOW_AND_OWNERSHIP_COHERENCE.md) trace 2.

`config/pricing/` carries six real pricing files (carrier, facility, shipper, brokerage fees,
products, specialty packs, AV plans), so the commercial model has repository substance.

## 9. Status

| Area                                           | Architecture status | Design status                                                                   |
| ---------------------------------------------- | ------------------- | ------------------------------------------------------------------------------- |
| No-fork doctrine                               | COMPLETE            | **DESIGN_COMPLETE**                                                             |
| Onboarding sequence — carrier                  | COMPLETE            | DESIGN_COMPLETE                                                                 |
| Onboarding sequence — facility                 | COMPLETE            | DESIGN_COMPLETE                                                                 |
| Onboarding sequence — brokerage                | COMPLETE            | DESIGN_COMPLETE                                                                 |
| Onboarding sequence — shipper                  | **GAP**             | **DESIGN_STUB**                                                                 |
| Onboarding sequence — service provider         | **GAP**             | **DESIGN_STUB**                                                                 |
| Universal onboarding factory (v1.7 `14_`)      | PARTIAL             | DESIGN_PARTIAL                                                                  |
| Non-native counterparty adoption               | COMPLETE            | **DESIGN_COMPLETE**                                                             |
| Customer tiers                                 | COMPLETE            | DESIGN_COMPLETE                                                                 |
| Shadow → A2E → bounded autonomy progression    | COMPLETE            | DESIGN_COMPLETE                                                                 |
| Capability pack contract                       | COMPLETE            | DESIGN_COMPLETE                                                                 |
| Capability pack instances                      | **GAP**             | **DESIGN_STUB** — zero exist                                                    |
| Configuration surface for stub jobs            | **GAP**             | DESIGN_STUB — 40 of 76                                                          |
| Policy-driven customer variation               | **GAP**             | DESIGN_STUB — depends on the canonical vocabulary                               |
| Cell / deployment topology                     | PARTIAL             | DESIGN_PARTIAL                                                                  |
| Partition keys                                 | **GAP**             | DESIGN_STUB — named, undefined                                                  |
| Service-provider module state                  | **GAP**             | absent from `module_states.yaml`                                                |
| Support / incident behaviour per customer type | PARTIAL             | DESIGN_PARTIAL — runbooks exist at `docs/runbooks/`, not tied to customer tiers |

**Answer to §15: yes for seven of ten customer types at the design level, and the no-fork mechanism
is coherent.** The two failures are shipper and service provider, and they fail for the same reason
they fail everywhere else in this audit — v1.7 designed them as future participants and v1.8
staffed them anyway.
