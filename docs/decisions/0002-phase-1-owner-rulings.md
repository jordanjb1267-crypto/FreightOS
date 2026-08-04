# Phase 1 Owner Rulings Record

**Status:** Accepted
**Date:** 2026-08-04
**Branch:** `claude/freightos-phase-1-definition-284fu3`
**Base:** accepted Phase 0 commit `671b1d097ae166436a464f1a8daaffe8ea060e81`, tag
`freightos-phase-0-accepted`
**Authority:** Owner rulings accepting the Phase 1 definition package and authorizing Specification
PR 1 only.

This record is the decision log entry `02_GOVERNANCE_AND_NON_REGRESSION.md:15` requires. The
supporting analysis is `docs/plans/phase-1-definition-and-owner-decisions.md`, which remains the
central Phase 1 planning artifact.

**This record does not authorize Phase 1 implementation.** It authorizes documentation and
specification only. Domain code, migrations, APIs, applications, services, and live integrations
remain unauthorized until PR 2 is separately approved.

---

## 1. Accepted baseline

| Item                              | Value                                                                      |
| --------------------------------- | -------------------------------------------------------------------------- |
| Repository                        | `jordanjb1267-crypto/FreightOS`                                            |
| Accepted Phase 0 commit           | `671b1d097ae166436a464f1a8daaffe8ea060e81`                                 |
| Acceptance tag                    | `freightos-phase-0-accepted` (annotated, dereferences to the commit above) |
| Authoritative baseline references | `origin/main`, the acceptance tag, and the exact commit                    |
| Local `main` pointer              | Accepted as an environment artifact. **Not** a valid base reference        |

The stale local `main` pointer at `e20e118` is accepted as an environment artifact and carries no
governance meaning. Baseline identity is established by `origin/main`, the acceptance tag, and the
exact commit SHA.

---

## 2. Binding rulings

### Ruling A — Software-only operating-context boundaries

**Decision.** Adopt the fail-closed capability matrix. `shipper_owned`, `facility_operator`, and
`autonomous_mobility` remain legal operating contexts under `legal_authority_class = software_only`
and convey neither carrier-agent authority, brokerage authority, nor physical-control authority.

`shipper_owned` may maintain the tenant's own party, location, shipment-request, cargo-requirement,
document-reference, and visibility data where explicitly authorized; read lawfully shared transport
status; and create planning records that do not award, broker, dispatch, or execute transportation.
It may not act for a carrier, select or bind a carrier for a third party, accept or counteroffer a
load, dispatch a driver, change carrier assignments, exercise brokerage authority, or initiate
financial settlement. Phase 1 treatment is contract and data-model support only — no Shipper
Control Tower application, no operational shipper execution workflow.

`facility_operator` may read and update minimum facility primitives for facilities its legal entity
is authorized to operate. It may not dispatch a carrier, reassign equipment or drivers, accept
freight on a carrier's behalf, broker transportation, issue motion, robotics, PLC, gate-controller,
or autonomous-equipment commands, or override carrier compliance or maintenance restrictions.
**Every facility write must prove facility operatorship or an explicit facility authorization
relationship.**

`autonomous_mobility` is interface, schema, fixture, and simulation only, in a standing fail-closed
suspended state, with no operational writes, live missions, vehicle-control commands, route
execution, dispatch acceptance, or physical-control authority. Synthetic records are marked
non-authoritative and non-operational.

For all three: `legal_entity_id` is required on tenant-owned operational records; the two
dimensions stay separate; carrier appointment is not implied; brokerage stays disabled; every write
produces an append-only audit record; every event envelope carries tenant, actor, authority class,
operating context, and purpose; kill switches may target tenant, legal entity, context, workflow,
agent, tool, or integration; missing or inconsistent authority context fails closed.

**Artifact.** `adr/0019-software-only-operating-context-boundaries.md`
**Blocks.** PR 2 (identity) and PR 7 (facility primitives).

### Ruling B — RigReceipts integration depth

**Decision.** `contract_and_simulation_only` for all of Phase 1.

Permitted: versioned contracts, schemas, synthetic fixtures, mock providers, replay tests, timeout
and degraded-mode behaviour, provenance and freshness fields. Prohibited: live credentials, live
calls, live writes, invented business formulas, and treating simulated responses as authoritative.

All externally owned formulas are marked `EXTERNALLY_SUPPLIED`, `UNRESOLVED`, and
`authoritative: false`. FreightOS may build the integration boundary but may not claim a
functioning live RigReceipts integration.

**Artifact.** This record; specification in
`docs/plans/phase-1-definition-and-owner-decisions.md` §6 Specification 8.
**Blocks.** PR 9 only.

### Ruling C — RIGDESK integration depth

**Decision.** `contract_and_simulation_only` for all of Phase 1.

FreightOS may model and simulate equipment identity, maintenance restrictions, out-of-service
status, maintenance-due status, fault-reference identifiers, maintenance appointment references,
roadside-request references, freshness, provenance, errors, and health.

FreightOS may not diagnose a vehicle, clear a restriction, declare equipment safe, approve
maintenance, schedule maintenance, request roadside service, write to RIGDESK, or treat stale or
non-authoritative data as permission to make equipment available.

**Fail-closed asymmetry is approved.** A restriction may keep equipment unavailable. Missing,
stale, simulated, or non-authoritative information may never make equipment available. Unknown
maintenance state means the unit is not active or assignable.

**Artifact.** This record; specification in the plan §6 Specification 9.
**Blocks.** PR 4 (the `MaintenanceRestriction` source model embeds the asymmetry) and PR 9.

### Ruling D — PostgreSQL control-plane access

**Decision.** Approve the hybrid design. `BYPASSRLS` is not granted to normal application roles or
to the routine control-plane connection.

Eight required elements: explicit RLS policy branches for recognized control-plane access; a
separate narrowly scoped administrative connection role; `SECURITY DEFINER` functions in a
dedicated administrative schema; function ownership by a non-login owner role; explicit, immutable
`search_path`; execute-only grants to the administrative connection; no direct table grants unless
separately approved; and mandatory privileged-access audit events.

Every privileged operation records actor, request or correlation ID, purpose, tenant scope,
legal-entity scope where applicable, resource, action, timestamp, and outcome. Tenant sessions must
be unable to claim control-plane status through session variables, headers, or user input.

**Artifact.** `adr/0020-control-plane-access.md`
**Blocks.** PR 2. This is the earliest and hardest Phase 1 deadline — the grant-and-policy pattern
set there is copied by every later migration.

### Ruling E — X12 licensing

**Decision.** Approve abstract interfaces, canonical internal contracts, canonical JSON fixtures,
non-X12 ingestion first, and deferred licensed mappings. X12 204, 990, 214, and 210 may be named as
future connector targets, each carrying `implemented: false`.

Prohibited: copying licensed X12 content, inventing segment mappings, inferring required loops or
qualifiers, representing an abstract interface as X12 conformance, and blocking the canonical road
adapter on X12 procurement. The first working ingestion path is canonical JSON over a governed REST
or file-import boundary.

**Artifact.** `adr/0023-x12-licensing-and-connector-boundary.md`
**Blocks.** PR 8 only, and only as a posture confirmation. Licensing procurement is off the Phase 1
critical path entirely.

### Ruling F — Common record fields

**Decision.** All persisted mutable records require `id`, `tenant_id`, `created_at`, `created_by`,
`updated_at`, `updated_by`, and `record_version`. All tenant-owned operational or business-domain
records additionally require `organization_node_id` and `legal_entity_id`.

Those two may be nullable only for four enumerated categories: system-scope control-plane records;
global reference data; immutable schema or migration metadata; and relationship tables whose
tenant, organization node, and legal entity are deterministically inherited and enforced from both
parents. Every exception must be listed in the ADR with an explicit reason, an RLS rule, a test,
and fail-closed behaviour when parent context is inconsistent. **No broad generic exception.**

**Artifact.** `adr/0021-common-record-fields.md`, amending ADR-0017.
**Blocks.** PR 2 — it sets the table template every later migration copies.

### Ruling G — Geospatial implementation

**Decision.** No PostGIS in Phase 1. Use decimal latitude and longitude, postal address, time zone,
an optional geohash or normalized location key, external-provider identifier fields, and source and
verification metadata.

Phase 1 may support exact coordinate storage, simple bounding-box filters, and deterministic
distance **inputs supplied by** a governed routing provider or fixture. Phase 1 may not claim
spatial route optimization, geofencing, complex polygon operations, spatial nearest-neighbor
search, or PostGIS-backed routing. A reconsideration gate applies before Phase 2 routing or any
feature that demonstrably requires spatial indexing.

**Artifact.** `adr/0022-geospatial-representation.md`
**Blocks.** PR 3.

### Ruling H — Package paths

**Decision.** Preserve `packages/config`, `packages/context`, `packages/database`, and
`packages/schemas`. Authorize `packages/identity`, `packages/parties`, `packages/carrier`,
`packages/modal-core`, `packages/mode-road`, `packages/facility-primitives`,
`packages/rigreceipts-contracts`, and `packages/rigdesk-contracts`.

No `apps/` directory in the initial domain PRs. No `services/` directory. No standalone FacilityOS
package. Deferred integration packages contain contracts, schemas, fixtures, and simulation
adapters only. Migrations remain under the existing reviewed migration system. Shared contract
definitions are not duplicated. Ownership and dependency direction are documented. Circular
dependencies are prohibited.

**Artifact.** `adr/0024-package-paths-and-dependency-direction.md`, plus §5 of
`docs/governance/DOMAIN_GLOSSARY.md`.
**Blocks.** PR 2 onward, as each package is created.

### Detention and free-time ruling

**Decision.** Phase 1 may implement the detention mechanism without an authoritative business
default. The mechanism is policy-driven.

Required policy fields: policy identifier, tenant, legal entity, facility or counterparty scope,
effective start and end, trigger event, stop event, free-time duration, time zone, paused-time
rules, rounding method, evidence requirements, accessorial linkage, source, provenance,
authoritative status, and version.

Binding behaviour: no active detention policy means no clock may begin; the system returns an
explicit `POLICY_REQUIRED` or equivalent fail-closed result; no code-level default free-time
allowance is permitted; synthetic fixtures may carry clearly labelled non-production values;
synthetic values must not become production defaults; changing the applicable policy must not
retroactively alter previously recorded calculations without a new versioned calculation; and every
calculation records policy version, start event, stop event, rounding rule, actor, evidence, and
resulting duration.

**Artifact.** `adr/0025-detention-policy-driven-mechanism.md`
**Blocks.** Nothing. This ruling removes detention-rule procurement from the Phase 1 critical path
while preventing FreightOS from inventing commercial terms.

---

## 3. Quantitative Phase 1 quality gates

Approved and recorded in `docs/governance/ACCEPTANCE_THRESHOLDS.md`:

- **Fifteen mandatory binary gates**, each pass/fail with no tolerance
- **Coverage** on newly introduced deterministic Phase 1 domain logic — 90% line, 85% branch, 90%
  function — with an explicit prohibition on inflating coverage through meaningless tests
- **Thirteen domain invariants** requiring 100% coverage of their enumerated cases
- **Seven migration gates** per migration pull request

This closes risk R-12 for Phase 1. Agent acceptance thresholds remain deferred to Phase 2, because
`14_…:34-36` requires them to be evidence-based and Phase 1 runs no agent.

**Blocks.** Nothing directly; binds every subsequent Phase 1 PR.

---

## 4. Documentation set created by this ruling

| Artifact                                                 | Type                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `adr/0019-software-only-operating-context-boundaries.md` | New ADR — Ruling A                                                          |
| `adr/0020-control-plane-access.md`                       | New ADR — Ruling D                                                          |
| `adr/0021-common-record-fields.md`                       | New ADR — Ruling F, amending ADR-0017                                       |
| `adr/0022-geospatial-representation.md`                  | New ADR — Ruling G                                                          |
| `adr/0023-x12-licensing-and-connector-boundary.md`       | New ADR — Ruling E                                                          |
| `adr/0024-package-paths-and-dependency-direction.md`     | New ADR — Ruling H                                                          |
| `adr/0025-detention-policy-driven-mechanism.md`          | New ADR — detention ruling                                                  |
| `docs/decisions/0002-phase-1-owner-rulings.md`           | This record                                                                 |
| `docs/governance/DOMAIN_GLOSSARY.md`                     | Canonical domain-name glossary                                              |
| `docs/governance/ACCEPTANCE_THRESHOLDS.md`               | Quantitative gates                                                          |
| `docs/governance/OPEN_QUESTIONS.md`                      | Open-question register                                                      |
| `docs/governance/RISK_REGISTER.md`                       | Updated — Phase 1 risks added, R-07/R-08/R-12/R-15 restated                 |
| `docs/governance/INTEGRATION_REGISTRY.md`                | Updated — RigReceipts, RIGDESK, and EDI rows restated under Rulings B, C, E |
| `docs/plans/phase-1-definition-and-owner-decisions.md`   | Updated — rulings marked owner-approved                                     |
| `adr/PROVENANCE.md`                                      | Updated — records ADRs 0019–0025 as Phase 1 additions                       |

The preserved handoff at `docs/production-handoff/v1.2/` is **unmodified**. Naming drift is
resolved by decision and glossary, never by editing the binding source (ADR-0014 §3).

---

## 4b. Accepted implementation obligations — OQ-19, OQ-20, OQ-21

Three obligations follow from the approved rulings that no existing artifact satisfies. The owner
has accepted them as **implementation obligations, not reasons to reject Specification PR 1**. Each
is documented, assigned, and gated. **None is implemented in this documentation PR.**

| ID    | Deficiency                                                                                                           | Target PR                                                                                                                                                                        | Blocking dependency                                                                       | Owner input still required |
| ----- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------- |
| OQ-19 | `app.kill_switch_scope` lacks `legal_entity` and `operating_context`, which Ruling A requires as kill-switch targets | **PR 2** — the earliest PR introducing legal-entity and operating-context domain enforcement. No safer specification-only correction exists, because the enum is a database type | Ruling A's kill-switch guarantee is unenforceable until the values exist                  | **No**                     |
| OQ-20 | Event envelopes lack a required `purpose`; `audit_events` lacks `purpose` and `outcome`                              | **PR 2** for both, ahead of the `admin` schema — Ruling D requires the audit fields **before** privileged domain access is established                                           | No `admin.*` function may ship before the columns exist to record its purpose and outcome | **No** for the mechanism   |
| OQ-21 | `schemas/custody-event.schema.json` retains the obsolete overloaded `authority_mode` concept                         | **PR 6** — the expected target. The "required earlier by PR 5" exception does **not** apply: the approved data model allocates `custody_events` to PR 7, not PR 5                | Blocks **PR 7**, where `custody_events` is created                                        | **No**                     |

Full specifications — required migration, schema, precedence, audit, backward compatibility,
tests, and exit evidence — are in `docs/governance/OPEN_QUESTIONS.md` §"Accepted implementation
obligations". Three binding constraints are worth restating here:

1. **OQ-19 requires backward compatibility with Phase 0 kill-switch records.** Adding enum values
   is additive; no existing row is rewritten, no existing scope changes meaning, and
   `app.resolve_kill_switch_mode` must return an identical result for every pre-existing input. A
   regression test asserts it.
2. **OQ-20's `purpose` is supplied by the trusted command or control-plane context, never by
   arbitrary model output**, and a privileged operation missing actor or purpose **fails closed**.
3. **OQ-21 must not silently mutate existing events.** The contract is versioned; a stored event
   keeps the schema version it was written against, and re-interpretation under a newer version is
   a new record, never an edit.

## 5. Approved ten-PR Phase 1 sequence

| #   | PR                                                                   | Owner decision required before starting |
| --- | -------------------------------------------------------------------- | --------------------------------------- |
| 1   | Phase 1 specifications and owner rulings                             | — (this PR)                             |
| 2   | Identity and organization foundation                                 | A, D, F, H                              |
| 3   | Parties and locations                                                | G                                       |
| 4   | Carrier and fleet registries                                         | C                                       |
| 5   | Mode-neutral freight core                                            | —                                       |
| 6   | State machines, event contracts, and lifecycle enforcement           | —                                       |
| 7   | Minimum facility primitives                                          | A                                       |
| 8   | Road FTL adapter and canonical non-X12 fixtures                      | E                                       |
| 9   | RigReceipts and RIGDESK contract-simulation boundaries               | B, C                                    |
| 10  | Read-only Phase 1 surfaces, full integration, and exit-gate evidence | —                                       |

Each PR must begin from current accepted `main`; have one primary responsibility; include
migrations and recovery where applicable; include tests; include explicit exclusions; preserve
billing-disabled and deferred-module controls; stop before the next PR; and be merged and verified
before dependent work begins.

**PR 1 is documentation and specification only.**

No PR in this sequence contains Phase 2 AI Dispatch Copilot work — no agent runtime, no tool
invocation, no scoring, ranking, recommendation, or negotiation, and no model-gateway call.

---

## 6. Scope boundary for PR 1

**In scope.** The documentation set in §4.

**Explicitly out of scope for PR 1**, and not present in its diff:

- Migrations
- Domain tables
- Runtime TypeScript packages
- APIs
- Services
- Applications
- Temporal workflows
- Live integrations
- Billing activation
- Phase 2 agent behaviour
- Phase 3 consequential execution

---

## 7. Preserved Phase 0 rulings

Every ruling in `docs/decisions/0001-phase-0-decision-record.md` §2 remains in force. Phase 1
amends exactly one of them — ADR-0017's common-field contract, via ADR-0021 — and that amendment is
additive to the isolation model rather than a relaxation of it.

Unchanged: the repository and handoff location; the immutability of the preserved package;
generated root copies with provenance and drift detection; reference DDL that is never executed;
the two-dimension legal model; the fixed infrastructure baseline; computed autonomy ceilings; and
the standing constraint that RigReceipts and RIGDESK are contract and simulation boundaries only.

---

## 8. Controls that must remain true throughout Phase 1

Verified on every pull request:

| Control                        | Mechanism                                                                   |
| ------------------------------ | --------------------------------------------------------------------------- |
| Handoff byte-identical         | 90/90 SHA256 entries, `pnpm validate:provenance`                            |
| Billing disabled               | `BILLING_DISABLED=PASS`, 11 products                                        |
| Maximum effective autonomy A3  | `AUTONOMY_CEILING=PASS`; Phase 1 artifacts additionally stay at or below A2 |
| No deferred operational module | `DEFERRED_MODULES_DISABLED=PASS`                                            |
| No physical-control surface    | `SAFETY_BOUNDARY=PASS`, twelve forbidden verbs                              |
| Brokerage fail-closed          | Legal-context validator, database CHECK, mandatory-false flag               |
| Horizon 1 only                 | `HORIZON_1_ONLY=PASS`, `horizon_authorized: 1`                              |
