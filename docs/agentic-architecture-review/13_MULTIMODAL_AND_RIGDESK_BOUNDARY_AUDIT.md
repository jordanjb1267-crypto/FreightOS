# 13 — Multimodal and RigDesk Boundary Audit

# Part A — Multimodal (§16)

## A1. The mode-neutral principle

`v1.5 08_MULTIMODAL_CAPABILITY_PACKS.md:5-7`:

> "Truck is the first commercial wedge. Architecture remains mode-neutral. A capability pack extends
> canonical FreightOS without replacing core identity, tenancy, events, commands, evidence, audit,
> or workflow runtime."

Backed by `adr/0002-mode-neutral-core.md` and v1.5 Article IX (Multimodal neutrality). The
mode-neutral journey model at `08_:88-101` is genuinely well formed:

```text
Shipment
└── TransportJourney
    ├── Road leg
    ├── Rail leg
    ├── Ocean leg
    └── Road leg
```

with "Handoff/custody events connect legs. Each leg can use its own capability pack and
authoritative partners while preserving end-to-end correlation."

That is the right abstraction, and it is consistent with the repository's `schemas/modal-adapter.
schema.json` (required `mode, version, entities, states, documents, events, billing_meters`).

Status: **DESIGN_COMPLETE as a principle and a journey model.**

## A2. Per-mode assessment

| Mode                  | What exists                                                                                                                                                                                                                                                                                                                                                                                                                         | Classification                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Mode-neutral core** | the principle, the TransportJourney/leg model, the capability-pack contract, `schemas/modal-adapter.schema.json`                                                                                                                                                                                                                                                                                                                    | **mode-neutral and complete** at the contract level; no journey table exists in any migration                 |
| **Road**              | `08_:29-44` — 6 entities (driver/crew, tractor, trailer/chassis, terminal, stop, appointment) + 5 special domains (HOS/ELD, roadside, POD/rate confirmation, tractor/trailer readiness, facility dwell). `road_ftl_carrier_operations` is ACTIVE_BUILD h1. All 76 job books are road-implicit.                                                                                                                                      | **road-specific and PARTIAL** — entity and domain names only; no states, no documents, no events, no commands |
| **Rail**              | `08_:46-65` — 7 entities (rail carrier, railcar, locomotive/consist, train/movement, terminal/ramp, interchange, waybill) + 6 workflows (car assignment, interchange, waybill/document, movement tracking, demurrage, exception handling), plus the good instruction "Do not force road concepts such as 'driver dispatch' into rail semantics". `rail_adapter` INTERFACE_AND_SIMULATION_ONLY, ≥h3, `RAIL_OPERATIONS_ENABLED=false` | **rail architecture only**                                                                                    |
| **Ocean**             | `08_:67-86` — 8 entities (ocean carrier, vessel, voyage, container, port/terminal, booking, bill of lading, transshipment) + 7 workflows (booking, container planning, cutoff/deadline, port/terminal events, transshipment, detention/demurrage, document/evidence). `ocean_adapter` INTERFACE_AND_SIMULATION_ONLY, ≥h3, `OCEAN_OPERATIONS_ENABLED=false`                                                                          | **ocean architecture only**                                                                                   |
| **Air**               | **nothing.** `08_` defines no air pack. `air_adapter` is DORMANT, ≥h4, `AIR_OPERATIONS_ENABLED=false`                                                                                                                                                                                                                                                                                                                               | **missing** — correctly, given DORMANT state                                                                  |

## A3. The capability-pack mechanism has no instances

`v1.5 contracts/capability_pack.schema.json` requires
`packId, version, mode, objects, events, commands, workflows, conformanceSuite`; optional
`specializedObjects, documents, agentSpecializations, standards, riskProfile`. That is a
well-formed contract — `conformanceSuite` in particular is exactly the right required field.

`find` across the repository for pack instances returns **zero**. There is no `road_pack.yaml`,
`rail_pack.yaml` or `ocean_pack.yaml` anywhere.

So the mechanism designated to carry all mode-specific variation — and, per
[12](12_PRODUCT_MODULE_ONBOARDING_DEPLOYMENT_COHERENCE.md) §6, all customer-specific variation
without forking — is a contract with no conforming instance. `08_:29-86`'s entity and workflow
lists are the nearest thing, and they are prose lists, not packs.

## A4. The workforce is single-mode

Zero of 76 job books address rail or ocean. Zero of 32 registry manifests mention either. No job
book carries a `capabilityPack` reference, and `workflow_definition.schema.json`'s optional
`capabilityPack` field is used by no instance.

This is **correct** given the module states — designing rail or ocean workforce now would violate
`stop_after_horizon: 1`. It is recorded because it bounds the multimodal claim: the workforce
design is road-only, and the mode-neutral core has not been exercised by a second mode.

## A5. §16 verdict

> Do not convert roadmap intent into present design completeness.

| Category                   | Content                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| mode-neutral and complete  | the principle; the TransportJourney/leg model; `capability_pack.schema.json`; `modal-adapter.schema.json` |
| road-specific and complete | **nothing** — road has entity and domain names, no pack, no states, no events                             |
| rail architecture only     | 7 entities + 6 workflows, gated to ≥h3                                                                    |
| ocean architecture only    | 8 entities + 7 workflows, gated to ≥h3                                                                    |
| missing                    | air entirely; all three capability-pack instances; leg/journey persistence; any multimodal workforce      |

**Is multimodal sufficient for its declared horizon?** Yes. The declared horizon is 1, road-only,
with rail and ocean explicitly `INTERFACE_AND_SIMULATION_ONLY` at ≥h3. Nothing in the multimodal
architecture blocks Horizon 1, and the mode-neutral core is designed well enough that adding a pack
later should not require a redesign. The gap — no pack instances at all, not even road — becomes
material at the first promotion, not now.

---

# Part B — RigDesk and the service-provider boundary (§17)

## B1. The boundary is stated clearly and correctly

`v1.7 11_SERVICE_PROVIDER_OPERATIONS_ROUTE.md:35-46`:

> "**Relationship to RigDesk.** RigDesk remains the vehicle/service operating product.
> FreightOS Network provides: participant identity; requests; evidence; mission/dispatch
> consequences; cross-party communication.
> **Do not duplicate detailed maintenance system-of-record ownership in FreightOS core.**"

`v1.5 07_MAINTENANCE_REPAIR_ROADSIDE.md:7` has an "Integration with RigDesk" section carrying the
same division.

The repository agrees: `docs/production-handoff/v1.2/17_CLAUDE_IMPLEMENTATION_INSTRUCTIONS.md:11`
instructs against inserting RigDesk domain ownership into FreightOS, and
`config/scope/module_states.yaml` carries `rigdesk_maintenance_hooks: ACTIVE_BUILD, horizon 1` —
hooks, not the product.

**This is a well-drawn boundary and the audit upholds it.** RigDesk owns the detailed vehicle and
service operating state; FreightOS owns participant identity, the request, the evidence, the
consequence for the shipment, and the cross-party message.

Status: **DESIGN_COMPLETE as a boundary statement.**

## B2. But the RigDesk contract does not exist

`docs/governance/RISK_REGISTER.md:16` records R-07 as "Open — bounded":

> "RigReceipts / RIGDESK contracts do not exist, yet both are ACTIVE_BUILD and Horizon 1 items 6
> and 7 depend on them."

`docs/governance/OPEN_QUESTIONS.md:23` (OQ-3) leaves "Will an authoritative RIGDESK contract be
supplied?" **Open**, non-blocking, owner-assigned, resolution "Pending".

So two `ACTIVE_BUILD` Horizon 1 modules — `rigdesk_maintenance_hooks` and
`rigreceipts_economics_boundary` — depend on a contract that has never been supplied. This is a
pre-existing, tracked repository gap, not something v1.5–v1.8 introduced, but it sits directly under
the carrier Maintenance Readiness Agent and the whole breakdown workflow.

## B3. The thirteen service semantics §17 requires

| Semantic                        | Where named                                                                       | Design status                                            |
| ------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| service request                 | v1.7 `11_:39-44`; `service_provider/service_intake` job                           | **DESIGN_STUB** — job has placeholder command, no edges  |
| eligibility                     | SPOT domain list; `service_provider/eligibility` (Service Eligibility Engine)     | **DESIGN_STUB**                                          |
| capacity                        | SPOT `bays/resources`; `service_provider/capacity`                                | **DESIGN_STUB**                                          |
| estimate                        | SPOT `pricing/estimate policy`; `service_provider/estimate`                       | **DESIGN_STUB**                                          |
| appointment                     | `service_provider/appointment_dispatch`                                           | **DESIGN_STUB**                                          |
| dispatch                        | same job                                                                          | **DESIGN_STUB**                                          |
| communications                  | `service_provider/customer_communication`                                         | **DESIGN_STUB**                                          |
| work status                     | `service_provider/work_status`                                                    | **DESIGN_STUB**                                          |
| evidence                        | SPOT `evidence/invoice requirements`; `service_provider/evidence`                 | **DESIGN_STUB**                                          |
| parts / dependencies            | SPOT `parts/supplier integrations`; `service_provider/parts_dependency`           | **DESIGN_STUB**                                          |
| invoice / reconciliation        | `service_provider/invoice_reconciliation`                                         | **DESIGN_STUB**                                          |
| shipment consequence            | v1.7 `11_:43` "mission/dispatch consequences"; v1.7 `12_:43-56` propagation chain | **DESIGN_PARTIAL** — the propagation chain is real prose |
| cross-participant communication | v1.7 `11_:44`, `12_:31-41`                                                        | **DESIGN_PARTIAL**                                       |

**Eleven of thirteen are DESIGN_STUB; two are DESIGN_PARTIAL. None is DESIGN_COMPLETE.**

The carrier side is better: `carrier/maintenance_readiness` is a real job book with three real
commands and four edges, correctly scoped — its mission is to "translate RigDesk/service evidence
into mission-readiness implications for carrier planning without independently diagnosing or
certifying safety." That non-scope clause is exactly right and preserves the boundary.

## B4. SPOT semantics that are missing

`v1.7 11_:9-20` lists 12 SPOT domains: shop/provider identity, locations/service radius,
capabilities, hours/on-call, bays/resources, equipment, technician/certification metadata,
pricing/estimate policy, authorization/payment workflow, towing/roadside capability, parts/supplier
integrations, evidence/invoice requirements.

There is no SPOT schema. Beyond the schema, these are missing entirely:

- **the FreightOS ↔ RigDesk interface itself** — no artifact, no event, no adapter, no schema. The
  boundary is stated in prose and has no contract on either side.
- **service-case identity and lifecycle** — what a service case _is_ as a network object, and how
  it correlates to a shipment, a journey leg and an asset
- **the legal operating context for a service provider** — no `service_provider` value exists in
  `app.operating_context` (see [07](07_AUTHORITY_LEGAL_AUTONOMY_COHERENCE.md) §2)
- **the authorization/payment workflow** — a SPOT domain naming money movement, with no design and
  no mapping to the `money.move` red action
- **towing and roadside** — named as a SPOT capability; the safety boundary for a tow (a physical
  operation) is not addressed anywhere

## B5. Is the physical-control boundary preserved?

Yes, and firmly. `docs/governance/THREAT_MODEL.md:18` — physical-control authority: "FreightOS must
never possess it, under any configuration" — with T-08 enforcing it in CI via a scan for twelve
forbidden control verbs. `config/policy/base_policy.yaml` carries `robot.move`, `forklift.move`,
`yard_tractor.move`, `conveyor.control`, `crane.control`, `dock_restraint.control`, `door.control`,
`plc.write`, `safety_interlock.override` as red actions and
`dynamic_driving_task.control`, `warehouse_robotics.control`, `industrial_plc.control`,
`remote_driving` as absolute prohibitions.

FacilityOS carries `no_physical_control_surface` as a graph invariant, and every facility job book
carries a physical-actuation prohibition in `non_scope` (e.g. `facility/gate.json`:
"barrier/door/PLC actuation; safety override"). The service-provider job books carry the equivalent
("without controlling vehicle motion" in the Service Appointment/Dispatch mission).

Status: **COMPLETE / DESIGN_COMPLETE / IMPLEMENTED (CI-enforced).** This is one of the strongest
controls in the corpus and no package weakens it.

## B6. §17 verdict

The **boundary** is well drawn, consistently stated across v1.5, v1.7 and the repository, and
correctly preserves RigDesk as the vehicle/service operating-state owner.

The **service semantics on the FreightOS side of that boundary** are almost entirely undesigned:
11 of 13 required semantics are stubs, SPOT has no schema, the service plane has no legal operating
context, and the FreightOS ↔ RigDesk interface has no contract in either direction — while
`rigdesk_maintenance_hooks` is ACTIVE_BUILD at Horizon 1 and R-07/OQ-3 record the missing contract
as an open owner item.

## C. Combined status

| Area                               | Architecture status | Design status                      | Implementation status                           |
| ---------------------------------- | ------------------- | ---------------------------------- | ----------------------------------------------- |
| Mode-neutral principle             | COMPLETE            | DESIGN_COMPLETE                    | IMPLEMENTATION_ABSENT                           |
| TransportJourney / leg model       | COMPLETE            | DESIGN_COMPLETE                    | IMPLEMENTATION_ABSENT (no journey table)        |
| Capability-pack contract           | COMPLETE            | DESIGN_COMPLETE                    | IMPLEMENTATION_ABSENT                           |
| Capability-pack instances          | **GAP**             | **DESIGN_STUB** — zero             | —                                               |
| Road pack                          | PARTIAL             | DESIGN_PARTIAL                     | IMPLEMENTATION_ABSENT                           |
| Rail pack                          | DEFERRED_BY_DESIGN  | DESIGN_PARTIAL (architecture only) | n/a — `INTERFACE_AND_SIMULATION_ONLY`           |
| Ocean pack                         | DEFERRED_BY_DESIGN  | DESIGN_PARTIAL (architecture only) | n/a                                             |
| Air                                | DEFERRED_BY_DESIGN  | absent                             | n/a — DORMANT                                   |
| Multimodal workforce               | DEFERRED_BY_DESIGN  | absent                             | n/a                                             |
| RigDesk boundary statement         | COMPLETE            | **DESIGN_COMPLETE**                | —                                               |
| RigDesk contract                   | **GAP**             | **DESIGN_STUB**                    | IMPLEMENTATION_ABSENT — R-07 open, OQ-3 pending |
| FreightOS ↔ RigDesk interface      | **GAP**             | **DESIGN_STUB**                    | —                                               |
| Carrier-side maintenance readiness | PARTIAL             | DESIGN_PARTIAL                     | IMPLEMENTATION_ABSENT                           |
| SPOT schema                        | **GAP**             | **DESIGN_STUB**                    | —                                               |
| 13 service semantics               | **GAP**             | 11 STUB / 2 PARTIAL                | —                                               |
| Service-provider legal context     | **GAP**             | **DESIGN_STUB** — no enum value    | —                                               |
| Physical-control boundary          | COMPLETE            | DESIGN_COMPLETE                    | **IMPLEMENTED** — CI-enforced                   |
